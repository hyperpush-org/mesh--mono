$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RootDir

$TmpRoot = Join-Path $RootDir '.tmp/m034-s03/windows'
$VerifyRoot = Join-Path $TmpRoot 'verify'
$StageRoot = Join-Path $TmpRoot 'stage'
$ServerRoot = Join-Path $StageRoot 'server'
$HomeRoot = Join-Path $TmpRoot 'home'
$WorkRoot = Join-Path $TmpRoot 'work'
$FixtureDir = Join-Path $RootDir 'scripts/fixtures/m034-s03-installer-smoke'
$InstallScript = Join-Path $RootDir 'website/docs/public/install.ps1'
$RepoInstallScript = Join-Path $RootDir 'tools/install/install.ps1'
$MeshcExe = Join-Path $RootDir 'target/debug/meshc.exe'
$MeshpkgExe = Join-Path $RootDir 'target/debug/meshpkg.exe'
$HostedHelloBuildLog = Join-Path $RootDir '.tmp/m034-s11/t03/diag-download/windows/verify/run/07-hello-build.log'
$SliceDiagRoot = Join-Path $RootDir '.tmp/m034-s12/t01'
$PrebuiltReleaseDir = $env:M034_S03_PREBUILT_RELEASE_DIR
$RunDir = Join-Path $VerifyRoot 'run'
$ServerProcess = $null
$LastStdoutPath = ''
$LastStderrPath = ''
$LastLogPath = ''
$LastExitCode = 0
$Version = ''
$Target = 'x86_64-pc-windows-msvc'
$MeshcArchive = ''
$MeshpkgArchive = ''
$GoodRoot = Join-Path $ServerRoot 'good'
$PriorCargoTargetDir = $null
$HadCargoTargetDir = $false

function Stop-LocalServer {
    if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
        try {
            Stop-Process -Id $script:ServerProcess.Id -Force -ErrorAction SilentlyContinue
        } catch {
        }
    }
}

function Get-InstalledBuildTargetDir {
    return Join-Path $RootDir 'target'
}

function Push-InstalledBuildEnvironment {
    $existingValue = Get-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
    if ($null -ne $existingValue) {
        $script:HadCargoTargetDir = $true
        $script:PriorCargoTargetDir = $existingValue.Value
    } else {
        $script:HadCargoTargetDir = $false
        $script:PriorCargoTargetDir = $null
    }

    $env:CARGO_TARGET_DIR = Get-InstalledBuildTargetDir
}

function Pop-InstalledBuildEnvironment {
    if ($script:HadCargoTargetDir) {
        $env:CARGO_TARGET_DIR = $script:PriorCargoTargetDir
    } else {
        Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
    }
}

function Fail-Phase {
    param(
        [string]$Phase,
        [string]$Reason,
        [string]$LogPath = ''
    )

    Write-Error "verification drift: $Reason"
    Write-Error "first failing phase: $Phase"
    Write-Error "artifacts: $($script:RunDir)"
    Write-Error "staged root: $($script:ServerRoot)"
    if ($LogPath -and (Test-Path $LogPath)) {
        Write-Error "--- $LogPath ---"
        Get-Content $LogPath | Select-Object -First 260 | ForEach-Object { Write-Error $_ }
    }
    exit 1
}

function Get-CommandExitCode {
    $lastExitCodeVar = Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
    if ($null -eq $lastExitCodeVar) {
        return 0
    }

    $exitCode = $lastExitCodeVar.Value
    if ($null -eq $exitCode) {
        return 0
    }

    return [int]$exitCode
}

function Set-LastArtifacts {
    param(
        [string]$StdoutPath,
        [string]$StderrPath,
        [string]$LogPath,
        [int]$ExitCode
    )

    $script:LastStdoutPath = $StdoutPath
    $script:LastStderrPath = $StderrPath
    $script:LastLogPath = $LogPath
    $script:LastExitCode = $ExitCode
}

function Combine-CommandLog {
    param(
        [string]$Display,
        [string]$StdoutPath,
        [string]$StderrPath,
        [string]$LogPath,
        [int]$ExitCode
    )

    $content = [System.Collections.Generic.List[string]]::new()
    $content.Add("display: $Display")
    $content.Add("exit_code: $ExitCode")
    $content.Add("stdout_path: $StdoutPath")
    $content.Add("stderr_path: $StderrPath")
    if ((Test-Path $StdoutPath) -and (Get-Item $StdoutPath).Length -gt 0) {
        $content.Add('')
        $content.Add('[stdout]')
        $content.AddRange([string[]](Get-Content $StdoutPath))
    }
    if ((Test-Path $StderrPath) -and (Get-Item $StderrPath).Length -gt 0) {
        $content.Add('')
        $content.Add('[stderr]')
        $content.AddRange([string[]](Get-Content $StderrPath))
    }
    Set-Content -Path $LogPath -Value $content
}

function Invoke-LoggedCommand {
    param(
        [string]$Phase,
        [string]$Label,
        [string]$Display,
        [scriptblock]$Command,
        [switch]$ExpectFailure
    )

    $stdoutPath = Join-Path $script:RunDir "$Label.stdout"
    $stderrPath = Join-Path $script:RunDir "$Label.stderr"
    $logPath = Join-Path $script:RunDir "$Label.log"

    Write-Host "==> [$Phase] $Display"
    & $Command 1> $stdoutPath 2> $stderrPath
    $exitCode = Get-CommandExitCode

    Combine-CommandLog -Display $Display -StdoutPath $stdoutPath -StderrPath $stderrPath -LogPath $logPath -ExitCode $exitCode
    Set-LastArtifacts -StdoutPath $stdoutPath -StderrPath $stderrPath -LogPath $logPath -ExitCode $exitCode

    if ($ExpectFailure) {
        if ($exitCode -eq 0) {
            Fail-Phase $Phase "$Display unexpectedly succeeded" $logPath
        }
        return
    }

    if ($exitCode -ne 0) {
        Fail-Phase $Phase "$Display failed" $logPath
    }
}

function Assert-LogContains {
    param(
        [string]$Phase,
        [string]$Needle,
        [string]$LogPath
    )

    if (-not (Select-String -Path $LogPath -SimpleMatch $Needle -Quiet)) {
        Fail-Phase $Phase "expected to find '$Needle' in $LogPath" $LogPath
    }
}

function Get-RepoVersion {
    $meshc = (Get-Content (Join-Path $RootDir 'compiler/meshc/Cargo.toml') -Raw) -match 'version = "([^"]+)"' | Out-Null
    $meshcVersion = $Matches[1]
    $meshpkg = (Get-Content (Join-Path $RootDir 'compiler/meshpkg/Cargo.toml') -Raw) -match 'version = "([^"]+)"' | Out-Null
    $meshpkgVersion = $Matches[1]
    if ($meshcVersion -ne $meshpkgVersion) {
        throw "meshc ($meshcVersion) and meshpkg ($meshpkgVersion) versions diverged"
    }
    return $meshcVersion
}

function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ($listener.LocalEndpoint).Port
    $listener.Stop()
    return $port
}

function Get-PythonCommand {
    foreach ($name in @('python', 'py')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Name }
    }
    throw 'python or py is required to host staged release assets'
}

function Find-SingleFile {
    param(
        [string]$Dir,
        [string]$Filter
    )

    $matches = @(Get-ChildItem -Path $Dir -Filter $Filter -File -ErrorAction SilentlyContinue)
    if ($matches.Count -ne 1) {
        throw "expected exactly one match for $Dir/$Filter, found $($matches.Count)"
    }

    return $matches[0].FullName
}

function Get-VersionFromArchiveName {
    param(
        [string]$Prefix,
        [string]$ArchiveName,
        [string]$Target,
        [string]$Extension
    )

    $expectedPrefix = "$Prefix-v"
    $expectedSuffix = "-$Target.$Extension"
    if (-not $ArchiveName.StartsWith($expectedPrefix) -or -not $ArchiveName.EndsWith($expectedSuffix)) {
        throw "could not infer version from $ArchiveName"
    }

    return $ArchiveName.Substring($expectedPrefix.Length, $ArchiveName.Length - $expectedPrefix.Length - $expectedSuffix.Length)
}

function New-ZipArchive {
    param(
        [string]$ArchivePath,
        [string]$SourcePath,
        [string]$EntryName
    )

    $tmpDir = Join-Path $StageRoot ("zip-" + [System.Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
    Copy-Item $SourcePath (Join-Path $tmpDir $EntryName)
    Compress-Archive -Path (Join-Path $tmpDir $EntryName) -DestinationPath $ArchivePath -Force
    Remove-Item -Recurse -Force $tmpDir
}

function Write-ReleaseJson {
    param(
        [string]$Path,
        [string]$MeshcArchive,
        [string]$MeshpkgArchive,
        [string]$Version
    )

    @{
        tag_name = "v$Version"
        name = 'M034 S03 staged release'
        assets = @(
            @{ name = $MeshcArchive },
            @{ name = $MeshpkgArchive },
            @{ name = 'SHA256SUMS' }
        )
    } | ConvertTo-Json -Depth 5 | Set-Content -Path $Path
}

function Setup-PrebuiltReleaseAssets {
    param([string]$AssetDir)

    if (-not (Test-Path $AssetDir -PathType Container)) {
        Fail-Phase 'setup' "prebuilt release asset dir was missing: $AssetDir"
    }

    $meshcSource = Find-SingleFile -Dir $AssetDir -Filter "meshc-v*-$Target.zip"
    $meshpkgSource = Find-SingleFile -Dir $AssetDir -Filter "meshpkg-v*-$Target.zip"
    $checksumSource = Join-Path $AssetDir 'SHA256SUMS'
    if (-not (Test-Path $checksumSource -PathType Leaf)) {
        Fail-Phase 'setup' "missing SHA256SUMS in $AssetDir"
    }

    $script:MeshcArchive = Split-Path $meshcSource -Leaf
    $script:MeshpkgArchive = Split-Path $meshpkgSource -Leaf
    $meshcVersion = Get-VersionFromArchiveName -Prefix 'meshc' -ArchiveName $script:MeshcArchive -Target $Target -Extension 'zip'
    $meshpkgVersion = Get-VersionFromArchiveName -Prefix 'meshpkg' -ArchiveName $script:MeshpkgArchive -Target $Target -Extension 'zip'
    if ($meshcVersion -ne $meshpkgVersion) {
        Fail-Phase 'setup' "meshc ($meshcVersion) and meshpkg ($meshpkgVersion) archive versions diverged"
    }
    $script:Version = $meshcVersion

    New-Item -ItemType Directory -Path (Join-Path $GoodRoot 'api/releases'), (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)") -Force | Out-Null
    Copy-Item $meshcSource (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)/$($script:MeshcArchive)")
    Copy-Item $meshpkgSource (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)/$($script:MeshpkgArchive)")
    Copy-Item $checksumSource (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)/SHA256SUMS")
    Write-ReleaseJson -Path (Join-Path $GoodRoot 'api/releases/latest.json') -MeshcArchive $script:MeshcArchive -MeshpkgArchive $script:MeshpkgArchive -Version $script:Version
}

function Setup-LocalReleaseAssets {
    $script:Version = Get-RepoVersion
    $script:MeshcArchive = "meshc-v$($script:Version)-$Target.zip"
    $script:MeshpkgArchive = "meshpkg-v$($script:Version)-$Target.zip"

    Invoke-LoggedCommand -Phase 'tooling' -Label '03-build-tooling' -Display 'cargo build -q -p meshc -p meshpkg' -Command {
        cargo build -q -p meshc -p meshpkg
    }

    if (-not (Test-Path $MeshcExe)) { Fail-Phase 'tooling' 'meshc.exe was not built' $LastLogPath }
    if (-not (Test-Path $MeshpkgExe)) { Fail-Phase 'tooling' 'meshpkg.exe was not built' $LastLogPath }

    New-Item -ItemType Directory -Path (Join-Path $GoodRoot 'api/releases'), (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)") -Force | Out-Null

    New-ZipArchive -ArchivePath (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)/$($script:MeshcArchive)") -SourcePath $MeshcExe -EntryName 'meshc.exe'
    New-ZipArchive -ArchivePath (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)/$($script:MeshpkgArchive)") -SourcePath $MeshpkgExe -EntryName 'meshpkg.exe'
    $meshcSha = Get-Sha256 (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)/$($script:MeshcArchive)")
    $meshpkgSha = Get-Sha256 (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)/$($script:MeshpkgArchive)")
    Set-Content -Path (Join-Path $GoodRoot "snowdamiz/mesh-lang/releases/download/v$($script:Version)/SHA256SUMS") -Value @(
        "$meshcSha  $($script:MeshcArchive)",
        "$meshpkgSha  $($script:MeshpkgArchive)"
    )
    Write-ReleaseJson -Path (Join-Path $GoodRoot 'api/releases/latest.json') -MeshcArchive $script:MeshcArchive -MeshpkgArchive $script:MeshpkgArchive -Version $script:Version
}

function Start-LocalServer {
    param([int]$Port)

    $python = Get-PythonCommand
    $script:ServerProcess = Start-Process -FilePath $python -ArgumentList @('-m', 'http.server', $Port, '--bind', '127.0.0.1', '--directory', $ServerRoot) -RedirectStandardOutput (Join-Path $RunDir 'http-server.stdout') -RedirectStandardError (Join-Path $RunDir 'http-server.stderr') -PassThru

    $url = "http://127.0.0.1:$Port/"
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            Invoke-WebRequest -Uri $url -TimeoutSec 2 | Out-Null
            return
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }

    Fail-Phase 'server' 'local staged release server did not become ready' (Join-Path $RunDir 'http-server.stderr')
}

function Test-ObjectProperty {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) {
        return $false
    }

    return $Object.PSObject.Properties.Name -contains $Name
}

function Get-LoggedCommandMetadata {
    param([string]$LogPath)

    $meta = [ordered]@{
        exists = $false
        valid = $false
        logPath = $LogPath
        display = $null
        exitCode = $null
        stdoutPath = $null
        stderrPath = $null
        missingFields = @()
    }

    if (-not (Test-Path $LogPath -PathType Leaf)) {
        return [pscustomobject]$meta
    }

    $meta.exists = $true
    foreach ($line in (Get-Content $LogPath)) {
        if ($line -like 'display: *') {
            $meta.display = $line.Substring(9)
        } elseif ($line -like 'exit_code: *') {
            $raw = $line.Substring(11)
            if ($raw -match '^-?\d+$') {
                $meta.exitCode = [int]$raw
            }
        } elseif ($line -like 'stdout_path: *') {
            $meta.stdoutPath = $line.Substring(13)
        } elseif ($line -like 'stderr_path: *') {
            $meta.stderrPath = $line.Substring(13)
        }
    }

    foreach ($field in @('display', 'exitCode', 'stdoutPath', 'stderrPath')) {
        if ($null -eq $meta[$field] -or $meta[$field] -eq '') {
            $meta.missingFields += $field
        }
    }

    $meta.valid = ($meta.missingFields.Count -eq 0)
    return [pscustomobject]$meta
}

function Get-BuildTraceInfo {
    param([string]$TracePath)

    $info = [ordered]@{
        exists = $false
        valid = $false
        path = $TracePath
        parseError = $null
        data = $null
    }

    if (-not (Test-Path $TracePath -PathType Leaf)) {
        return [pscustomobject]$info
    }

    $info.exists = $true
    try {
        $info.data = Get-Content $TracePath -Raw | ConvertFrom-Json
        $info.valid = $true
    } catch {
        $info.parseError = $_.Exception.Message
    }

    return [pscustomobject]$info
}

function Get-InstalledBuildClassification {
    param(
        [int]$ExitCode,
        [object]$TraceInfo
    )

    if ($ExitCode -eq 0) {
        return 'success'
    }

    if (-not $TraceInfo.exists -or -not $TraceInfo.valid) {
        return 'pre-object'
    }

    $trace = $TraceInfo.data
    $objectEmitted = (Test-ObjectProperty -Object $trace -Name 'objectEmissionCompleted') -and [bool]$trace.objectEmissionCompleted
    if (-not $objectEmitted) {
        return 'pre-object'
    }

    $runtimeMissing = (Test-ObjectProperty -Object $trace -Name 'runtimeLibraryExists') -and ($trace.runtimeLibraryExists -eq $false)
    if ($runtimeMissing) {
        return 'runtime-lookup'
    }

    $linkAttempted = ((Test-ObjectProperty -Object $trace -Name 'linkStarted') -and [bool]$trace.linkStarted) -or ((Test-ObjectProperty -Object $trace -Name 'linkerProgram') -and $null -ne $trace.linkerProgram -and $trace.linkerProgram -ne '')
    if ($linkAttempted) {
        return 'link-time'
    }

    return 'pre-object'
}

function Get-DiagnosticEvidenceNote {
    param(
        [string]$Classification,
        [object]$HostedInfo,
        [object]$TraceInfo
    )

    if (-not $HostedInfo.exists) {
        return 'Hosted S11 hello-build anchor is missing.'
    }

    if (-not $HostedInfo.valid) {
        return "Hosted S11 hello-build anchor is malformed: $($HostedInfo.missingFields -join ', ')."
    }

    if (-not $TraceInfo.exists) {
        return 'No local build trace was recorded, so the current classification stays at the earliest observable phase.'
    }

    if (-not $TraceInfo.valid) {
        return "Local build trace was malformed: $($TraceInfo.parseError)."
    }

    if ($Classification -eq 'link-time') {
        return 'Object emission completed and the linker boundary was reached.'
    }

    if ($Classification -eq 'runtime-lookup') {
        return 'Object emission completed, but runtime discovery stayed unresolved before linker invocation.'
    }

    if ($Classification -eq 'success') {
        return 'Installed build completed successfully with full trace coverage.'
    }

    return 'The current evidence does not show completed object emission.'
}

function Write-InstalledBuildContextLog {
    param(
        [string]$Path,
        [string]$InstalledMeshcPath,
        [string]$InstalledMeshpkgPath,
        [string]$TracePath,
        [string]$HelloExePath
    )

    $llvmPrefix = $env:LLVM_SYS_211_PREFIX
    if (-not $llvmPrefix) {
        $llvmPrefix = 'unset'
    }
    $cargoTargetDir = $env:CARGO_TARGET_DIR
    if (-not $cargoTargetDir) {
        $cargoTargetDir = 'unset'
    }
    $meshRtLibPath = $env:MESH_RT_LIB_PATH
    if (-not $meshRtLibPath) {
        $meshRtLibPath = 'unset'
    }

    Set-Content -Path $Path -Value @(
        "installed_meshc=$InstalledMeshcPath",
        "installed_meshpkg=$InstalledMeshpkgPath",
        "trace_path=$TracePath",
        "output_path=$HelloExePath",
        "llvm_sys_211_prefix=$llvmPrefix",
        "cargo_target_dir=$cargoTargetDir",
        "mesh_rt_lib_path=$meshRtLibPath"
    )
}

function Write-InstalledBuildDiagnosticSummary {
    param(
        [string]$SummaryPath,
        [string]$BuildLogPath,
        [string]$StdoutPath,
        [string]$StderrPath,
        [string]$TracePath,
        [string]$BuildContextLogPath,
        [string]$InstalledMeshcPath,
        [string]$InstalledMeshpkgPath,
        [string]$HostedLogPath
    )

    $buildInfo = Get-LoggedCommandMetadata -LogPath $BuildLogPath
    $hostedInfo = Get-LoggedCommandMetadata -LogPath $HostedLogPath
    $traceInfo = Get-BuildTraceInfo -TracePath $TracePath
    $classification = Get-InstalledBuildClassification -ExitCode ($buildInfo.exitCode ?? -1) -TraceInfo $traceInfo
    $evidenceNote = Get-DiagnosticEvidenceNote -Classification $classification -HostedInfo $hostedInfo -TraceInfo $traceInfo

    $summaryDir = Split-Path -Parent $SummaryPath
    if ($summaryDir) {
        New-Item -ItemType Directory -Path $summaryDir -Force | Out-Null
    }

    $traceData = $null
    if ($traceInfo.valid) {
        $traceData = $traceInfo.data
    }

    $payload = [ordered]@{
        generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
        build = [ordered]@{
            classification = $classification
            exitCode = $buildInfo.exitCode
            buildLogPath = $BuildLogPath
            stdoutPath = $StdoutPath
            stderrPath = $StderrPath
            tracePath = $TracePath
            traceExists = $traceInfo.exists
            traceValid = $traceInfo.valid
            traceParseError = $traceInfo.parseError
            buildContextLogPath = $BuildContextLogPath
            installedMeshcPath = $InstalledMeshcPath
            installedMeshpkgPath = $InstalledMeshpkgPath
            llvmSys211Prefix = $env:LLVM_SYS_211_PREFIX
            cargoTargetDir = $env:CARGO_TARGET_DIR
            lastStage = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'lastStage')) { $traceData.lastStage } else { $null }
            objectEmissionStarted = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'objectEmissionStarted')) { $traceData.objectEmissionStarted } else { $null }
            objectEmissionCompleted = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'objectEmissionCompleted')) { $traceData.objectEmissionCompleted } else { $null }
            objectExistsAfterEmit = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'objectExistsAfterEmit')) { $traceData.objectExistsAfterEmit } else { $null }
            runtimeLibraryPath = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'runtimeLibraryPath')) { $traceData.runtimeLibraryPath } else { $null }
            meshRtLibPath = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'meshRtLibPath')) { $traceData.meshRtLibPath } else { $null }
            runtimeLibraryExists = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'runtimeLibraryExists')) { $traceData.runtimeLibraryExists } else { $null }
            linkerProgram = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'linkerProgram')) { $traceData.linkerProgram } else { $null }
            linkStarted = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'linkStarted')) { $traceData.linkStarted } else { $null }
            linkCompleted = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'linkCompleted')) { $traceData.linkCompleted } else { $null }
            traceError = if ($traceData -and (Test-ObjectProperty -Object $traceData -Name 'error')) { $traceData.error } else { $null }
        }
        hostedAnchor = [ordered]@{
            logPath = $HostedLogPath
            exists = $hostedInfo.exists
            valid = $hostedInfo.valid
            exitCode = $hostedInfo.exitCode
            missingFields = $hostedInfo.missingFields
        }
        evidenceNote = $evidenceNote
    }

    $payload | ConvertTo-Json -Depth 10 | Set-Content -Path $SummaryPath
    return [pscustomobject]$payload
}

function Invoke-InstalledBuildCommand {
    param(
        [string]$Phase,
        [string]$Label,
        [string]$Display,
        [scriptblock]$Command,
        [string]$TracePath,
        [string]$SummaryPath,
        [string]$BuildContextLogPath,
        [string]$InstalledMeshcPath,
        [string]$InstalledMeshpkgPath,
        [string]$HostedLogPath
    )

    $stdoutPath = Join-Path $script:RunDir "$Label.stdout"
    $stderrPath = Join-Path $script:RunDir "$Label.stderr"
    $logPath = Join-Path $script:RunDir "$Label.log"

    New-Item -ItemType Directory -Path (Split-Path -Parent $TracePath) -Force | Out-Null
    Remove-Item $TracePath -Force -ErrorAction SilentlyContinue
    $env:MESH_BUILD_TRACE_PATH = $TracePath

    Write-Host "==> [$Phase] $Display"
    try {
        & $Command 1> $stdoutPath 2> $stderrPath
        $exitCode = Get-CommandExitCode
    } finally {
        Remove-Item Env:MESH_BUILD_TRACE_PATH -ErrorAction SilentlyContinue
    }

    Combine-CommandLog -Display $Display -StdoutPath $stdoutPath -StderrPath $stderrPath -LogPath $logPath -ExitCode $exitCode
    Set-LastArtifacts -StdoutPath $stdoutPath -StderrPath $stderrPath -LogPath $logPath -ExitCode $exitCode
    Write-InstalledBuildDiagnosticSummary -SummaryPath $SummaryPath -BuildLogPath $logPath -StdoutPath $stdoutPath -StderrPath $stderrPath -TracePath $TracePath -BuildContextLogPath $BuildContextLogPath -InstalledMeshcPath $InstalledMeshcPath -InstalledMeshpkgPath $InstalledMeshpkgPath -HostedLogPath $HostedLogPath | Out-Null

    if ($exitCode -ne 0) {
        Fail-Phase $Phase "$Display failed" $logPath
    }
}

if ($env:M034_S03_LIB_ONLY -eq '1') {
    return
}

try {
    Remove-Item -Recurse -Force $TmpRoot -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $SliceDiagRoot -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $RunDir, $StageRoot, $HomeRoot, $WorkRoot, $SliceDiagRoot -Force | Out-Null

    $script:RunDir = $RunDir
    $script:ServerRoot = $ServerRoot

    Invoke-LoggedCommand -Phase 'contract' -Label '01-ps1-diff' -Display 'Compare canonical and repo-local PowerShell installers' -Command {
        $canonicalHash = (Get-FileHash -Path $InstallScript -Algorithm SHA256).Hash
        $repoHash = (Get-FileHash -Path $RepoInstallScript -Algorithm SHA256).Hash
        if ($canonicalHash -ne $repoHash) {
            throw 'PowerShell installer copies drifted'
        }
        Write-Output "sha256=$canonicalHash"
    }
    if (-not (Test-Path $InstallScript)) { Fail-Phase 'contract' 'install.ps1 missing' }

    Invoke-LoggedCommand -Phase 'contract' -Label '02-ps1-contract' -Display 'Verify PowerShell installer covers meshpkg and staged hooks' -Command {
        Select-String -Path $InstallScript -Pattern 'snowdamiz/mesh-lang', 'meshpkg', 'MESH_INSTALL_RELEASE_API_URL', 'MESH_INSTALL_RELEASE_BASE_URL', 'MESH_INSTALL_STRICT_PROOF' | ForEach-Object { $_.Line }
    }
    foreach ($needle in @('snowdamiz/mesh-lang', 'meshpkg', 'MESH_INSTALL_RELEASE_API_URL', 'MESH_INSTALL_RELEASE_BASE_URL', 'MESH_INSTALL_STRICT_PROOF')) {
        Assert-LogContains -Phase 'contract' -Needle $needle -LogPath $LastLogPath
    }

    if ($PrebuiltReleaseDir) {
        Setup-PrebuiltReleaseAssets -AssetDir $PrebuiltReleaseDir
    } else {
        Setup-LocalReleaseAssets
    }

    Set-Content -Path (Join-Path $RunDir '00-context.log') -Value @(
        "version=$Version",
        "target=$Target",
        "prebuilt_release_dir=$($PrebuiltReleaseDir ?? 'none')",
        "verify_root=$RunDir",
        "stage_root=$StageRoot",
        "fixture_dir=$FixtureDir"
    )

    Get-ChildItem -Path $ServerRoot -File -Recurse | Sort-Object FullName | ForEach-Object { $_.FullName.Replace("$RootDir\", '') } | Set-Content -Path (Join-Path $RunDir 'staged-layout.txt')

    $serverPort = Get-FreePort
    Start-LocalServer -Port $serverPort
    $serverUrl = "http://127.0.0.1:$serverPort"
    $goodApiUrl = "$serverUrl/good/api/releases/latest.json"
    $goodBaseUrl = "$serverUrl/good/snowdamiz/mesh-lang/releases/download"

    Set-Content -Path (Join-Path $RunDir 'server-urls.log') -Value @(
        "server_url=$serverUrl",
        "good_api_url=$goodApiUrl",
        "good_base_url=$goodBaseUrl"
    )

    $env:MESH_INSTALL_RELEASE_API_URL = $goodApiUrl
    $env:MESH_INSTALL_RELEASE_BASE_URL = $goodBaseUrl
    $env:MESH_INSTALL_STRICT_PROOF = '1'
    $env:MESH_INSTALL_DOWNLOAD_TIMEOUT_SEC = '20'

    $goodHome = Join-Path $HomeRoot 'good'
    New-Item -ItemType Directory -Path $goodHome -Force | Out-Null
    $env:USERPROFILE = $goodHome

    Invoke-LoggedCommand -Phase 'install' -Label '04-install-good' -Display 'pwsh -File website/docs/public/install.ps1 -Yes' -Command {
        pwsh -NoProfile -File $script:InstallScript -Yes
    }

    $installedMeshc = Join-Path $goodHome '.mesh/bin/meshc.exe'
    $installedMeshpkg = Join-Path $goodHome '.mesh/bin/meshpkg.exe'
    $installedVersion = Join-Path $goodHome '.mesh/version'
    if (-not (Test-Path $installedMeshc)) { Fail-Phase 'install' 'installed meshc.exe was missing' $LastLogPath }
    if (-not (Test-Path $installedMeshpkg)) { Fail-Phase 'install' 'installed meshpkg.exe was missing' $LastLogPath }
    if (-not (Test-Path $installedVersion)) { Fail-Phase 'install' 'version file was not written' $LastLogPath }
    if ((Get-Content $installedVersion -Raw).Trim() -ne $Version) { Fail-Phase 'install' 'version file did not match staged version' $LastLogPath }

    Invoke-LoggedCommand -Phase 'version' -Label '05-meshc-version' -Display 'installed meshc.exe --version' -Command {
        & $installedMeshc --version
    }
    Assert-LogContains -Phase 'version' -Needle "meshc $Version" -LogPath $LastLogPath

    Invoke-LoggedCommand -Phase 'version' -Label '06-meshpkg-version' -Display 'installed meshpkg.exe --version' -Command {
        & $installedMeshpkg --version
    }
    Assert-LogContains -Phase 'version' -Needle "meshpkg $Version" -LogPath $LastLogPath

    $smokeDir = Join-Path $WorkRoot 'installer-smoke'
    New-Item -ItemType Directory -Path $smokeDir -Force | Out-Null
    Copy-Item (Join-Path $FixtureDir 'mesh.toml') (Join-Path $smokeDir 'mesh.toml') -Force
    Copy-Item (Join-Path $FixtureDir 'main.mpl') (Join-Path $smokeDir 'main.mpl') -Force
    $helloExe = Join-Path $RunDir 'installer-smoke.exe'
    $helloTrace = Join-Path $RunDir '07-hello-build.trace.json'
    $helloContext = Join-Path $RunDir '07-hello-build.context.log'
    $helloSummary = Join-Path $SliceDiagRoot 'diagnostic-summary.json'

    Push-InstalledBuildEnvironment
    Write-InstalledBuildContextLog -Path $helloContext -InstalledMeshcPath $installedMeshc -InstalledMeshpkgPath $installedMeshpkg -TracePath $helloTrace -HelloExePath $helloExe
    Invoke-InstalledBuildCommand -Phase 'build' -Label '07-hello-build' -Display 'installed meshc.exe build installer smoke fixture' -Command {
        & $installedMeshc build $smokeDir --output $helloExe --no-color
    } -TracePath $helloTrace -SummaryPath $helloSummary -BuildContextLogPath $helloContext -InstalledMeshcPath $installedMeshc -InstalledMeshpkgPath $installedMeshpkg -HostedLogPath $HostedHelloBuildLog

    Invoke-LoggedCommand -Phase 'runtime' -Label '08-hello-run' -Display 'run installed hello binary' -Command {
        & $helloExe
    }
    Assert-LogContains -Phase 'runtime' -Needle 'hello' -LogPath $LastLogPath

    Write-Host 'verify-m034-s03.ps1: ok'
} finally {
    Pop-InstalledBuildEnvironment
    Stop-LocalServer
}
