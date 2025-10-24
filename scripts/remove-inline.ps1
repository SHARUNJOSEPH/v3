$indexPath = "c:\Users\dell\Downloads\v3\index.html"

if (!(Test-Path $indexPath)) {
    Write-Error "index.html not found at $indexPath"
    exit 1
}

$content = Get-Content $indexPath -Raw
$updated = [regex]::Replace($content, '<script>([\s\S]*?)</script>', '')
Set-Content -Path $indexPath -Value $updated -Encoding UTF8
Write-Output "Removed inline <script> blocks from index.html"
