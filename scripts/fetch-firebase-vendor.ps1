#Requires -Version 5.1
<#
.SYNOPSIS
  Download Firebase JS compat SDKs (10.12.2) into js/vendor/ for PixelMap.

.DESCRIPTION
  P0-1 of docs/TEAM-CHARTER-AND-EXECUTION-PLAN.md.
  Run from repo root (or any cwd — script resolves paths from its location):

    powershell -ExecutionPolicy Bypass -File scripts\fetch-firebase-vendor.ps1

  After success, hard-refresh the app (?v=3.2+). Cloud auth should leave __IS_DEMO__
  when config/firebase-config.js loads successfully.
#>

$ErrorActionPreference = 'Stop'
$Version = '10.12.2'
$BaseUrl = "https://www.gstatic.com/firebasejs/$Version"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$VendorDir = Join-Path $RepoRoot 'js\vendor'

$Files = @(
    'firebase-app-compat.js',
    'firebase-auth-compat.js',
    'firebase-firestore-compat.js',
    'firebase-storage-compat.js'
)

Write-Host "PixelMap — Firebase vendor fetch" -ForegroundColor Cyan
Write-Host "  Version : $Version"
Write-Host "  Target  : $VendorDir"
Write-Host ""

if (-not (Test-Path $VendorDir)) {
    New-Item -ItemType Directory -Path $VendorDir | Out-Null
}

$ok = $true
foreach ($name in $Files) {
    $url = "$BaseUrl/$name"
    $out = Join-Path $VendorDir $name
    Write-Host "  GET $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
        $len = (Get-Item $out).Length
        if ($len -lt 10000) {
            Write-Host "    FAIL: file too small ($len bytes) — likely an error page" -ForegroundColor Red
            $ok = $false
            Remove-Item $out -Force -ErrorAction SilentlyContinue
        } else {
            Write-Host "    OK ($len bytes)" -ForegroundColor Green
        }
    } catch {
        Write-Host "    FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $ok = $false
    }
}

Write-Host ""
if (-not $ok) {
    Write-Host "One or more downloads failed. Check network / firewall and retry." -ForegroundColor Red
    exit 1
}

Write-Host "All four compat SDKs are in js\vendor\." -ForegroundColor Green
Write-Host "index.html already references them — hard-refresh the app (Ctrl+F5)."
Write-Host "Expect: window.firebase defined; __IS_DEMO__ false when config loads."
exit 0
