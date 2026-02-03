# AI Creative Studio - Auto Deploy Script
# Uses native PowerShell and SSH

$SERVER = "72.61.74.232"
$USER = "root"
$PASSWORD = "sjbw8888@1989827Y"
$LOCAL_ZIP = "f:\ai-creative-studio-deploy.zip"
$REMOTE_TMP = "/tmp/ai-creative-studio-deploy.zip"

Write-Host ""
Write-Host "========================================"
Write-Host "   AI Creative Studio - Auto Deploy"
Write-Host "========================================"
Write-Host ""

# Check file exists
if (-not (Test-Path $LOCAL_ZIP)) {
    Write-Host "ERROR: Deploy package not found: $LOCAL_ZIP"
    exit 1
}

$zipSize = (Get-Item $LOCAL_ZIP).Length / 1MB
Write-Host "Deploy package: $LOCAL_ZIP"
Write-Host "Size: $([math]::Round($zipSize, 2)) MB"
Write-Host "Server: $SERVER"
Write-Host ""

# Deploy commands
$deployCommands = "pm2 stop all 2>/dev/null || true && pm2 delete all 2>/dev/null || true && cd /var/www/ai-creative-studio && rm -rf * && unzip -o /tmp/ai-creative-studio-deploy.zip -d . && cat > .env << 'ENVEOF'
DATABASE_URL=mysql://ai_user:FanShai2026DB@Pass@72.61.74.232:3306/ai_creative_studio
JWT_SECRET=your-super-secret-jwt-key-2026
PORT=3000
NODE_ENV=production
ENVEOF
pnpm install && pnpm run build && pnpm run db:push && pm2 start dist/index.js --name ai-creative-studio && pm2 save && pm2 status"

Write-Host "[1/2] Uploading files to server..."
Write-Host "Please enter password when prompted: $PASSWORD"
Write-Host ""

# Upload file
& scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $LOCAL_ZIP "${USER}@${SERVER}:$REMOTE_TMP"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Upload failed!"
    exit 1
}

Write-Host ""
Write-Host "Upload successful!"
Write-Host ""
Write-Host "[2/2] Deploying application..."
Write-Host "Please enter password again: $PASSWORD"
Write-Host ""

# Deploy
& ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "${USER}@${SERVER}" $deployCommands

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================"
    Write-Host "   Deploy completed successfully!"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "Website: http://fansai.online"
    Write-Host "API: http://fansai.online/api/trpc"
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "Deploy failed! Please check error messages."
}
