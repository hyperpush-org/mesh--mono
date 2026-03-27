$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..' '..')).Path
$env:M034_S03_LIB_ONLY = '1'
. (Join-Path $RootDir 'scripts/verify-m034-s03.ps1')
Remove-Item Env:M034_S03_LIB_ONLY -ErrorAction SilentlyContinue

$TestRoot = Join-Path $RootDir '.tmp/m034-s03/installed-build-test'
$SummaryRoot = Join-Path $RootDir '.tmp/m034-s12/t01'
$HostedLogPath = Join-Path $RootDir '.tmp/m034-s11/t03/diag-download/windows/verify/run/07-hello-build.log'

Remove-Item -Recurse -Force $TestRoot -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $TestRoot, $SummaryRoot -Force | Out-Null

$expectedTargetDir = Join-Path $RootDir 'target'
if ((Get-InstalledBuildTargetDir) -ne $expectedTargetDir) {
    throw 'installed-build target dir helper drifted'
}

$env:CARGO_TARGET_DIR = 'sentinel-target'
Push-InstalledBuildEnvironment
if ($env:CARGO_TARGET_DIR -ne $expectedTargetDir) {
    throw 'Push-InstalledBuildEnvironment did not export the repo target dir'
}
Pop-InstalledBuildEnvironment
if ($env:CARGO_TARGET_DIR -ne 'sentinel-target') {
    throw 'Pop-InstalledBuildEnvironment did not restore the previous CARGO_TARGET_DIR'
}
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue

$hostedInfo = Get-LoggedCommandMetadata -LogPath $HostedLogPath
if (-not $hostedInfo.exists) {
    throw 'hosted hello-build anchor is missing'
}
if (-not $hostedInfo.valid) {
    throw "hosted hello-build anchor is malformed: $($hostedInfo.missingFields -join ', ')"
}
if ($hostedInfo.exitCode -ne -1073741819) {
    throw "expected hosted exit code -1073741819, got $($hostedInfo.exitCode)"
}
if ($hostedInfo.display -ne 'installed meshc.exe build installer smoke fixture') {
    throw 'hosted display text drifted'
}

$hostedContextLog = Join-Path $TestRoot 'hosted-build-context.log'
$env:CARGO_TARGET_DIR = $expectedTargetDir
$env:MESH_RT_LIB_PATH = 'C:\mesh\mesh_rt.lib'
Write-InstalledBuildContextLog -Path $hostedContextLog -InstalledMeshcPath 'hosted-artifact-only' -InstalledMeshpkgPath 'hosted-artifact-only' -TracePath (Join-Path $SummaryRoot 'missing-hosted-trace.json') -HelloExePath 'hosted-artifact-only'
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
Remove-Item Env:MESH_RT_LIB_PATH -ErrorAction SilentlyContinue
$hostedContext = Get-Content $hostedContextLog -Raw
if (-not $hostedContext.Contains("cargo_target_dir=$expectedTargetDir")) {
    throw 'build context log did not preserve cargo_target_dir'
}
if (-not $hostedContext.Contains('mesh_rt_lib_path=C:\mesh\mesh_rt.lib')) {
    throw 'build context log did not preserve mesh_rt_lib_path'
}

$summaryPath = Join-Path $SummaryRoot 'diagnostic-summary.json'
$missingTracePath = Join-Path $SummaryRoot 'missing-hosted-trace.json'
$summary = Write-InstalledBuildDiagnosticSummary -SummaryPath $summaryPath -BuildLogPath $HostedLogPath -StdoutPath $hostedInfo.stdoutPath -StderrPath $hostedInfo.stderrPath -TracePath $missingTracePath -BuildContextLogPath $hostedContextLog -InstalledMeshcPath 'hosted-artifact-only' -InstalledMeshpkgPath 'hosted-artifact-only' -HostedLogPath $HostedLogPath
if (-not (Test-Path $summaryPath)) {
    throw 'diagnostic summary was not written'
}
if ($summary.build.classification -ne 'pre-object') {
    throw "expected hosted missing-trace summary to classify as pre-object, got $($summary.build.classification)"
}
if ($summary.hostedAnchor.exitCode -ne -1073741819) {
    throw 'hosted anchor exit code was not preserved in diagnostic summary'
}

function Write-TraceFixture {
    param(
        [string]$Path,
        [hashtable]$Payload
    )

    $Payload | ConvertTo-Json -Depth 10 | Set-Content -Path $Path
}

$syntheticHostedLog = Join-Path $TestRoot 'synthetic-hosted.log'
Set-Content -Path $syntheticHostedLog -Value @(
    'display: installed meshc.exe build installer smoke fixture',
    'exit_code: 1',
    'stdout_path: synthetic.stdout',
    'stderr_path: synthetic.stderr'
)

$successTrace = Join-Path $TestRoot 'success-trace.json'
Write-TraceFixture -Path $successTrace -Payload @{
    lastStage = 'compile-succeeded'
    objectEmissionCompleted = $true
    objectExistsAfterEmit = $true
    runtimeLibraryExists = $true
    linkerProgram = 'clang.exe'
    linkStarted = $true
    linkCompleted = $true
}
$successInfo = Get-BuildTraceInfo -TracePath $successTrace
if ((Get-InstalledBuildClassification -ExitCode 0 -TraceInfo $successInfo) -ne 'success') {
    throw 'success trace should classify as success'
}

$runtimeTrace = Join-Path $TestRoot 'runtime-trace.json'
Write-TraceFixture -Path $runtimeTrace -Payload @{
    lastStage = 'resolve-runtime-library'
    objectEmissionCompleted = $true
    objectExistsAfterEmit = $true
    runtimeLibraryExists = $false
    linkerProgram = $null
    linkStarted = $false
    linkCompleted = $false
    error = 'Could not locate Mesh runtime static library'
}
$runtimeInfo = Get-BuildTraceInfo -TracePath $runtimeTrace
if ((Get-InstalledBuildClassification -ExitCode 1 -TraceInfo $runtimeInfo) -ne 'runtime-lookup') {
    throw 'runtime lookup trace should classify as runtime-lookup'
}

$linkTrace = Join-Path $TestRoot 'link-trace.json'
Write-TraceFixture -Path $linkTrace -Payload @{
    lastStage = 'invoke-linker'
    objectEmissionCompleted = $true
    objectExistsAfterEmit = $true
    runtimeLibraryExists = $true
    linkerProgram = 'clang.exe'
    linkStarted = $true
    linkCompleted = $false
    error = 'linker exited with status 1 without emitting output'
}
$linkInfo = Get-BuildTraceInfo -TracePath $linkTrace
if ((Get-InstalledBuildClassification -ExitCode 1 -TraceInfo $linkInfo) -ne 'link-time') {
    throw 'link trace should classify as link-time'
}

$preObjectTrace = Join-Path $TestRoot 'pre-object-trace.json'
Write-TraceFixture -Path $preObjectTrace -Payload @{
    lastStage = 'emit-object'
    objectEmissionCompleted = $false
    objectExistsAfterEmit = $false
}
$preObjectInfo = Get-BuildTraceInfo -TracePath $preObjectTrace
if ((Get-InstalledBuildClassification -ExitCode 1 -TraceInfo $preObjectInfo) -ne 'pre-object') {
    throw 'pre-object trace should classify as pre-object'
}

$truncatedHostedLog = Join-Path $TestRoot 'truncated-hosted.log'
Set-Content -Path $truncatedHostedLog -Value @(
    'display: installed meshc.exe build installer smoke fixture',
    'exit_code: -1073741819'
)
$truncatedInfo = Get-LoggedCommandMetadata -LogPath $truncatedHostedLog
if ($truncatedInfo.valid) {
    throw 'truncated hosted log should be marked malformed'
}
if ($truncatedInfo.missingFields.Count -lt 2) {
    throw 'truncated hosted log should report the missing stdout/stderr fields'
}

Write-Host 'verify-m034-s03-installed-build: ok'
