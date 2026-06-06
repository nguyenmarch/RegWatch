# Install eksctl and helm using winget (Windows 11 built-in)
# Run this script ONCE before proceeding.

Write-Host "Installing eksctl..." -ForegroundColor Cyan
winget install --id eksctl.eksctl -e --accept-source-agreements --accept-package-agreements

Write-Host ""
Write-Host "Installing Helm..." -ForegroundColor Cyan
winget install --id Helm.Helm -e --accept-source-agreements --accept-package-agreements

Write-Host ""
Write-Host "Refreshing PATH..." -ForegroundColor Cyan
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH", "User")

Write-Host ""
eksctl version
helm version

Write-Host ""
Write-Host "Done! Close and reopen PowerShell if commands are not found." -ForegroundColor Green
