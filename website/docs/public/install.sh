#!/bin/sh
# Install script for meshc and meshpkg - the Mesh CLI tools
# Usage: curl -sSf https://meshlang.dev/install.sh | sh
# Or: sh install.sh [--version VERSION] [--uninstall] [--yes] [--help]
set -eu

REPO="hyperpush-org/hyperpush-mono"
INSTALL_DIR="$HOME/.mesh/bin"
ENV_FILE="$HOME/.mesh/env"
VERSION_FILE="$HOME/.mesh/version"
MARKER="# Mesh compiler"
RELEASE_API_URL="${MESH_INSTALL_RELEASE_API_URL:-https://api.github.com/repos/${REPO}/releases/latest}"
RELEASE_BASE_URL="${MESH_INSTALL_RELEASE_BASE_URL:-https://github.com/${REPO}/releases/download}"
DOWNLOAD_TIMEOUT_SEC="${MESH_INSTALL_DOWNLOAD_TIMEOUT_SEC:-120}"
STRICT_PROOF_MODE="${MESH_INSTALL_STRICT_PROOF:-0}"

# --- Color output ---

_use_color() {
    if [ -n "${NO_COLOR:-}" ]; then
        return 1
    fi
    if [ -t 1 ]; then
        return 0
    fi
    return 1
}

proof_mode_enabled() {
    case "$STRICT_PROOF_MODE" in
        1 | true | TRUE | yes | YES | on | ON)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

say() {
    printf '%s\n' "$1"
}

say_green() {
    if _use_color; then
        printf '\033[32m%s\033[0m\n' "$1"
    else
        printf '%s\n' "$1"
    fi
}

say_red() {
    if _use_color; then
        printf '\033[31m%s\033[0m\n' "$1" >&2
    else
        printf '%s\n' "$1" >&2
    fi
}

# --- Download helper ---

_downloader=""

detect_downloader() {
    if command -v curl > /dev/null 2>&1; then
        _downloader="curl"
    elif command -v wget > /dev/null 2>&1; then
        _downloader="wget"
    else
        say_red "error: Need curl or wget to download Mesh tools."
        return 1
    fi
}

download() {
    local _url="$1"
    local _output="$2"

    if [ "$_downloader" = "curl" ]; then
        curl -sSfL --connect-timeout 10 --max-time "$DOWNLOAD_TIMEOUT_SEC" "$_url" -o "$_output"
    elif [ "$_downloader" = "wget" ]; then
        wget -q --timeout="$DOWNLOAD_TIMEOUT_SEC" -O "$_output" "$_url"
    fi
}

download_to_stdout() {
    local _url="$1"

    if [ "$_downloader" = "curl" ]; then
        curl -sSfL --connect-timeout 10 --max-time "$DOWNLOAD_TIMEOUT_SEC" "$_url"
    elif [ "$_downloader" = "wget" ]; then
        wget -q --timeout="$DOWNLOAD_TIMEOUT_SEC" -O- "$_url"
    fi
}

# --- Platform detection ---

detect_platform() {
    local _ostype _cputype

    _ostype="$(uname -s)"
    _cputype="$(uname -m)"

    case "$_ostype" in
        Linux)
            _ostype="unknown-linux-gnu"
            ;;
        Darwin)
            _ostype="apple-darwin"
            if [ "$_cputype" = "x86_64" ]; then
                if sysctl -n hw.optional.arm64 2>/dev/null | grep -q "1"; then
                    _cputype="aarch64"
                fi
            fi
            ;;
        MINGW* | MSYS* | CYGWIN*)
            say_red "error: Windows detected. Please use install.ps1 instead:"
            say_red "  powershell -ExecutionPolicy ByPass -c \"irm https://meshlang.dev/install.ps1 | iex\""
            return 1
            ;;
        *)
            say_red "error: Unsupported OS: $_ostype"
            return 1
            ;;
    esac

    case "$_cputype" in
        x86_64 | amd64)
            _cputype="x86_64"
            ;;
        aarch64 | arm64)
            _cputype="aarch64"
            ;;
        *)
            say_red "error: Unsupported architecture: $_cputype"
            return 1
            ;;
    esac

    echo "${_cputype}-${_ostype}"
}

# --- Version management ---

get_latest_version() {
    local _response _version

    if ! _response="$(download_to_stdout "$RELEASE_API_URL")"; then
        say_red "error: Failed to fetch release metadata."
        say_red "  URL: $RELEASE_API_URL"
        return 1
    fi

    if command -v jq > /dev/null 2>&1; then
        _version="$(printf '%s\n' "$_response" | jq -r '.tag_name // empty' | sed 's/^v//')"
    else
        _version="$(printf '%s\n' "$_response" | grep '"tag_name"' | sed 's/.*"v\{0,1\}\([^"]*\)".*/\1/' | head -n 1)"
    fi

    if [ -z "$_version" ] || [ "$_version" = "null" ]; then
        say_red "error: Release metadata did not contain tag_name."
        say_red "  URL: $RELEASE_API_URL"
        return 1
    fi

    echo "$_version"
}

check_update_needed() {
    local _target_version="$1"

    if [ -f "$VERSION_FILE" ]; then
        local _current
        _current="$(cat "$VERSION_FILE")"
        if [ "$_current" = "$_target_version" ]; then
            say_green "meshc and meshpkg v${_target_version} are already installed and up-to-date."
            return 1
        fi
        say "Updating meshc and meshpkg from v${_current} to v${_target_version}..."
    fi
    return 0
}

# --- Checksum verification ---

extract_expected_checksum() {
    local _checksum_file="$1"
    local _archive="$2"
    local _line _hash

    _line="$(awk -v archive="$_archive" '$2 == archive { print; exit }' "$_checksum_file")"
    if [ -z "$_line" ]; then
        return 1
    fi

    _hash="$(printf '%s\n' "$_line" | awk '{print $1}')"
    if [ -z "$_hash" ]; then
        return 2
    fi
    if [ "${#_hash}" -ne 64 ]; then
        return 2
    fi
    if ! printf '%s' "$_hash" | grep -Eq '^[0-9A-Fa-f]{64}$'; then
        return 2
    fi

    printf '%s\n' "$_hash"
}

verify_checksum() {
    local _file="$1"
    local _expected="$2"
    local _actual

    if command -v sha256sum > /dev/null 2>&1; then
        _actual="$(sha256sum "$_file" | cut -d' ' -f1)"
    elif command -v shasum > /dev/null 2>&1; then
        _actual="$(shasum -a 256 "$_file" | cut -d' ' -f1)"
    else
        say "warning: No SHA-256 tool found, skipping checksum verification."
        return 0
    fi

    if [ "$_actual" != "$_expected" ]; then
        say_red "error: Checksum verification failed."
        say_red "  archive:  $_file"
        say_red "  expected: $_expected"
        say_red "  actual:   $_actual"
        return 1
    fi
}

# --- PATH configuration ---

configure_path() {
    mkdir -p "$(dirname "$ENV_FILE")"

    cat > "$ENV_FILE" << 'ENVEOF'
# Mesh compiler
# This file is sourced by shell profiles to add mesh tools to PATH
export PATH="$HOME/.mesh/bin:$PATH"
ENVEOF

    for _profile in "$HOME/.bashrc" "$HOME/.bash_profile"; do
        if [ -f "$_profile" ]; then
            if ! grep -q "$MARKER" "$_profile" 2>/dev/null; then
                printf '\n%s\n. "%s"\n' "$MARKER" "$ENV_FILE" >> "$_profile"
            fi
            break
        fi
    done

    local _zshrc="$HOME/.zshrc"
    if [ -f "$_zshrc" ] || [ "$(basename "${SHELL:-}")" = "zsh" ]; then
        if ! grep -q "$MARKER" "$_zshrc" 2>/dev/null; then
            printf '\n%s\n. "%s"\n' "$MARKER" "$ENV_FILE" >> "$_zshrc"
        fi
    fi

    local _fish_config="$HOME/.config/fish/config.fish"
    if [ -f "$_fish_config" ] || command -v fish > /dev/null 2>&1; then
        mkdir -p "$(dirname "$_fish_config")"
        if ! grep -q "$MARKER" "$_fish_config" 2>/dev/null; then
            printf '\n%s\nfish_add_path %s/.mesh/bin\n' "$MARKER" "$HOME" >> "$_fish_config"
        fi
    fi
}

# --- Uninstall ---

uninstall() {
    say "Uninstalling meshc and meshpkg..."

    if [ -d "$HOME/.mesh" ]; then
        rm -rf "$HOME/.mesh"
    fi

    for _profile in "$HOME/.bashrc" "$HOME/.bash_profile"; do
        if [ -f "$_profile" ]; then
            local _tmp
            _tmp="$(mktemp)"
            sed "/$MARKER/,+1d" "$_profile" > "$_tmp"
            mv "$_tmp" "$_profile"
        fi
    done

    if [ -f "$HOME/.zshrc" ]; then
        local _tmp
        _tmp="$(mktemp)"
        sed "/$MARKER/,+1d" "$HOME/.zshrc" > "$_tmp"
        mv "$_tmp" "$HOME/.zshrc"
    fi

    local _fish_config="$HOME/.config/fish/config.fish"
    if [ -f "$_fish_config" ]; then
        local _tmp
        _tmp="$(mktemp)"
        sed "/$MARKER/,+1d" "$_fish_config" > "$_tmp"
        mv "$_tmp" "$_fish_config"
    fi

    say_green "meshc and meshpkg have been uninstalled."
}

# --- Install binary helper ---

install_binary() {
    local _bin_name="$1"
    local _bin_version="$2"
    local _platform _archive _url _tmpdir _checksum_file _checksum_url _expected_hash _extract_status

    _platform="$(detect_platform)"

    say "Installing ${_bin_name} v${_bin_version} (${_platform})..."

    _archive="${_bin_name}-v${_bin_version}-${_platform}.tar.gz"
    _url="${RELEASE_BASE_URL}/v${_bin_version}/${_archive}"
    _tmpdir="$(mktemp -d)"

    if ! download "$_url" "$_tmpdir/$_archive"; then
        say_red "error: Failed to download ${_bin_name} v${_bin_version}."
        say_red "  URL: $_url"
        say_red "  timeout: ${DOWNLOAD_TIMEOUT_SEC}s"
        return 1
    fi

    _checksum_file="$_tmpdir/SHA256SUMS"
    _checksum_url="${RELEASE_BASE_URL}/v${_bin_version}/SHA256SUMS"
    if download "$_checksum_url" "$_checksum_file" 2>/dev/null; then
        if _expected_hash="$(extract_expected_checksum "$_checksum_file" "$_archive")"; then
            verify_checksum "$_tmpdir/$_archive" "$_expected_hash"
        else
            _extract_status=$?
            if proof_mode_enabled; then
                if [ "$_extract_status" -eq 1 ]; then
                    say_red "error: SHA256SUMS did not contain ${_archive}."
                else
                    say_red "error: SHA256SUMS contained a malformed checksum for ${_archive}."
                fi
                say_red "  checksum file: $_checksum_file"
                say_red "  checksum URL:  $_checksum_url"
                return 1
            fi

            if [ "$_extract_status" -eq 1 ]; then
                say "warning: Archive not found in SHA256SUMS, skipping verification."
            else
                say "warning: Malformed SHA256SUMS entry for ${_archive}, skipping verification."
            fi
        fi
    else
        if proof_mode_enabled; then
            say_red "error: Could not download SHA256SUMS in staged-proof mode."
            say_red "  URL: $_checksum_url"
            say_red "  timeout: ${DOWNLOAD_TIMEOUT_SEC}s"
            return 1
        fi
        say "warning: Could not download SHA256SUMS, skipping checksum verification."
    fi

    if ! tar xzf "$_tmpdir/$_archive" -C "$_tmpdir"; then
        say_red "error: Failed to extract ${_archive}."
        say_red "  archive: $_tmpdir/$_archive"
        return 1
    fi

    if [ ! -f "$_tmpdir/${_bin_name}" ]; then
        say_red "error: ${_bin_name} was not found after extracting ${_archive}."
        say_red "  archive: $_tmpdir/$_archive"
        return 1
    fi

    mkdir -p "$INSTALL_DIR"
    mv "$_tmpdir/${_bin_name}" "$INSTALL_DIR/${_bin_name}"
    chmod +x "$INSTALL_DIR/${_bin_name}"

    case "$(uname -s)" in
        Darwin)
            xattr -d com.apple.quarantine "$INSTALL_DIR/${_bin_name}" 2>/dev/null || true
            ;;
    esac

    rm -rf "$_tmpdir"
}

# --- Install ---

install() {
    local _version="$1"

    detect_downloader

    if [ -z "$_version" ]; then
        say "Fetching latest version..."
        _version="$(get_latest_version)"
    fi

    if ! check_update_needed "$_version"; then
        return 0
    fi

    install_binary "meshc" "$_version"
    install_binary "meshpkg" "$_version"

    mkdir -p "$(dirname "$VERSION_FILE")"
    printf '%s\n' "$_version" > "$VERSION_FILE"

    configure_path

    say_green "Installed meshc and meshpkg v${_version} to ~/.mesh/bin/"
    say "Run 'meshc --version' and 'meshpkg --version' to verify, or restart your shell."
}

# --- Usage ---

usage() {
    say "Mesh installer"
    say ""
    say "Usage: install.sh [OPTIONS]"
    say ""
    say "Options:"
    say "  --version VERSION  Install a specific version (default: latest)"
    say "  --uninstall        Remove meshc and meshpkg and clean up PATH changes"
    say "  --yes              Accept defaults (for CI, already non-interactive)"
    say "  --help             Show this help message"
}

# --- Main ---

main() {
    local _version=""
    local _do_uninstall=0

    while [ $# -gt 0 ]; do
        case "$1" in
            --version)
                if [ $# -lt 2 ]; then
                    say_red "error: --version requires a value"
                    return 1
                fi
                _version="$2"
                shift 2
                ;;
            --uninstall)
                _do_uninstall=1
                shift
                ;;
            --yes | -y)
                shift
                ;;
            --help | -h)
                usage
                return 0
                ;;
            *)
                say_red "error: Unknown option: $1"
                usage
                return 1
                ;;
        esac
    done

    if [ "$_do_uninstall" = "1" ]; then
        uninstall
    else
        install "$_version"
    fi
}

main "$@"
