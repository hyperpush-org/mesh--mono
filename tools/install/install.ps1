# Install script for meshc - the Mesh compiler (Windows)
# Usage: powershell -ExecutionPolicy ByPass -c "irm https://meshlang.dev/install.ps1 | iex"
# Or: .\install.ps1 [-Version VERSION] [-Uninstall] [-Yes] [-Help]

param(
    [string]$Version = "",
    [switch]$Uninstall,
    [switch]$Yes,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

$Repo = "mesh-lang/mesh"
$MeshHome = "$env:USERPROFILE\.mesh"
$BinDir = "$MeshHome\bin"
$VersionFile = "$MeshHome\version"

# --- Color output ---

function Use-Color {
    if ($env:NO_COLOR) { return $false }
    return $true
}

function Say {
    param([string]$Message)
    Write-Host $Message
}

function Say-Green {
    param([string]$Message)
    if (Use-Color) {
        Write-Host $Message -ForegroundColor Green
    } else {
        Write-Host $Message
    }
}

function Say-Red {
    param([string]$Message)
    if (Use-Color) {
        Write-Host $Message -ForegroundColor Red
    } else {
        Write-Host $Message
    }
}

function Say-Bold {
    param([string]$Message)
    if (Use-Color) {
        Write-Host $Message -ForegroundColor White
    } else {
        Write-Host $Message
    }
}

# --- Platform detection ---

function Detect-Architecture {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($arch) {
        "X64" { return "x86_64" }
        default {
            Say-Red "error: Unsupported architecture: $arch"
            Say-Red "  meshc currently supports x86_64 (64-bit) Windows only."
            exit 1
        }
    }
}

# --- Version management ---

function Get-LatestVersion {
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "meshc-installer" }
        $version = $release.tag_name -replace '^v', ''
        if (-not $version) {
            throw "No tag_name found"
        }
        return $version
    } catch {
        Say-Red "error: Failed to determine latest version."
        Say-Red "  Check https://github.com/$Repo/releases for available versions."
        exit 1
    }
}

function Check-UpdateNeeded {
    param([string]$TargetVersion)

    if (Test-Path $VersionFile) {
        $current = Get-Content $VersionFile -Raw
        $current = $current.Trim()
        if ($current -eq $TargetVersion) {
            Say-Green "meshc v$TargetVersion is already installed and up-to-date."
            return $false
        }
        Say "Updating meshc from v$current to v$TargetVersion..."
    }
    return $true
}

# --- Checksum verification ---

function Verify-Checksum {
    param(
        [string]$FilePath,
        [string]$Expected
    )

    $actual = (Get-FileHash -Path $FilePath -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $Expected.ToLower()) {
        Say-Red "error: Checksum verification failed."
        Say-Red "  expected: $Expected"
        Say-Red "  actual:   $actual"
        exit 1
    }
}

# --- Uninstall ---

function Invoke-Uninstall {
    Say "Uninstalling meshc..."

    # Remove installation directory
    if (Test-Path $MeshHome) {
        Remove-Item -Recurse -Force $MeshHome
    }

    # Remove from user PATH
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($userPath -and $userPath -like "*$BinDir*") {
        $parts = $userPath -split ';' | Where-Object { $_ -ne $BinDir -and $_ -ne "" }
        $newPath = $parts -join ';'
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    }

    Say-Green "meshc has been uninstalled."
}

# --- Install ---

function Invoke-Install {
    param([string]$RequestedVersion)

    # Determine version
    if (-not $RequestedVersion) {
        Say "Fetching latest version..."
        $RequestedVersion = Get-LatestVersion
    }

    # Check if update needed
    if (-not (Check-UpdateNeeded -TargetVersion $RequestedVersion)) {
        return
    }

    # Detect architecture
    $arch = Detect-Architecture
    $target = "${arch}-pc-windows-msvc"

    Say "Installing meshc v$RequestedVersion ($target)..."

    # Construct download URL
    $archive = "meshc-v${RequestedVersion}-${target}.zip"
    $url = "https://github.com/$Repo/releases/download/v${RequestedVersion}/$archive"

    # Create temp directory
    $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "meshc-install-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    try {
        # Download archive
        $archivePath = Join-Path $tmpDir $archive
        try {
            Invoke-WebRequest -Uri $url -OutFile $archivePath -UseBasicParsing
        } catch {
            Say-Red "error: Failed to download meshc v$RequestedVersion."
            Say-Red "  URL: $url"
            Say-Red "  Check https://github.com/$Repo/releases for available versions."
            exit 1
        }

        # Download and verify checksum
        $checksumUrl = "https://github.com/$Repo/releases/download/v${RequestedVersion}/SHA256SUMS"
        $checksumPath = Join-Path $tmpDir "SHA256SUMS"
        try {
            Invoke-WebRequest -Uri $checksumUrl -OutFile $checksumPath -UseBasicParsing
            $checksumContent = Get-Content $checksumPath
            $expectedLine = $checksumContent | Where-Object { $_ -like "*$archive*" }
            if ($expectedLine) {
                $expectedHash = ($expectedLine -split '\s+')[0]
                Verify-Checksum -FilePath $archivePath -Expected $expectedHash
            } else {
                Say "warning: Archive not found in SHA256SUMS, skipping verification."
            }
        } catch [System.Net.WebException] {
            Say "warning: Could not download SHA256SUMS, skipping checksum verification."
        }

        # Extract
        $extractDir = Join-Path $tmpDir "extracted"
        Expand-Archive -Path $archivePath -DestinationPath $extractDir -Force

        # Install binary
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
        $sourceBinary = Get-ChildItem -Path $extractDir -Filter "meshc.exe" -Recurse | Select-Object -First 1
        if (-not $sourceBinary) {
            Say-Red "error: meshc.exe not found in archive."
            exit 1
        }
        Copy-Item -Path $sourceBinary.FullName -Destination "$BinDir\meshc.exe" -Force

        # Write version file
        New-Item -ItemType Directory -Path $MeshHome -Force | Out-Null
        Set-Content -Path $VersionFile -Value $RequestedVersion -NoNewline

        # Add to user PATH
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if (-not $userPath -or $userPath -notlike "*$BinDir*") {
            if ($userPath) {
                [Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
            } else {
                [Environment]::SetEnvironmentVariable("Path", $BinDir, "User")
            }
        }

        Say-Green "Installed meshc v$RequestedVersion to ~\.mesh\bin\meshc.exe"
        Say "Run 'meshc --version' to verify, or restart your terminal."
    } finally {
        # Clean up temp directory
        if (Test-Path $tmpDir) {
            Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
        }
    }
}

# --- Usage ---

function Show-Usage {
    Say "meshc installer (Windows)"
    Say ""
    Say "Usage: install.ps1 [OPTIONS]"
    Say ""
    Say "Options:"
    Say "  -Version VERSION  Install a specific version (default: latest)"
    Say "  -Uninstall        Remove meshc and clean up PATH changes"
    Say "  -Yes              Accept defaults (for CI, already non-interactive)"
    Say "  -Help             Show this help message"
}

# --- Main ---

if ($Help) {
    Show-Usage
    exit 0
}

if ($Uninstall) {
    Invoke-Uninstall
} else {
    Invoke-Install -RequestedVersion $Version
}
