# Setup SSH Key for Passwordless Login
# Run this ONCE, then future deploys won't need password

$SERVER = "72.61.74.232"
$USER = "root"
$PASSWORD = "sjbw8888@1989827Y"

Write-Host ""
Write-Host "========================================"
Write-Host "   SSH Key Setup (One-time only)"
Write-Host "========================================"
Write-Host ""
Write-Host "This will enable passwordless deployment."
Write-Host "You only need to run this ONCE."
Write-Host ""
Write-Host "Server: $SERVER"
Write-Host "Password: $PASSWORD"
Write-Host ""
Write-Host "Press any key to continue..."
$null = $host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host ""
Write-Host "Copying SSH key to server..."
Write-Host "Please enter password when prompted: $PASSWORD"
Write-Host ""

# Use ssh-copy-id or manual method
$pubKey = Get-Content "$env:USERPROFILE\.ssh\id_rsa.pub"

$cmd = "mkdir -p ~/.ssh && echo '$pubKey' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"

& ssh -o StrictHostKeyChecking=no "${USER}@${SERVER}" $cmd

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "   SSH Key Setup Complete!"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "Testing passwordless connection..."
    Write-Host ""
    
    & ssh -o StrictHostKeyChecking=no "${USER}@${SERVER}" "echo 'Connection successful!'"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "SUCCESS! You can now deploy without passwords."
        Write-Host "Run: powershell -File deploy-auto.ps1"
    }
} else {
    Write-Host ""
    Write-Host "Setup failed! Please check error messages."
}
