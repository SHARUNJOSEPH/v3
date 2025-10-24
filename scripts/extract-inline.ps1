$indexPath = "c:\Users\dell\Downloads\v3\index.html"
$outputPath = "c:\Users\dell\Downloads\v3\js\app.js"

if (!(Test-Path $indexPath)) {
    Write-Error "index.html not found at $indexPath"
    exit 1
}

$content = Get-Content $indexPath -Raw
$matches = [regex]::Matches($content, '<script>([\s\S]*?)</script>', 'Singleline')

if ($matches.Count -eq 0) {
    Write-Output "No inline scripts located."
    exit 0
}

$scripts = @()
foreach ($match in $matches) {
    $scripts += $match.Groups[1].Value.Trim()
}

$combined = $scripts -join "`n`n"
Set-Content -Path $outputPath -Value $combined -Encoding UTF8
Write-Output "Extracted $($scripts.Count) inline scripts to $outputPath"
