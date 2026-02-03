# AI Creative Studio - 完全自动化部署脚本
# 使用原生 PowerShell 和 SSH

param(
    [switch]$UploadOnly,
    [switch]$DeployOnly
)

$SERVER = "72.61.74.232"
$USER = "root"
$PASSWORD = "sjbw8888@1989827Y"
$LOCAL_ZIP = "f:\ai-creative-studio-deploy.zip"
$REMOTE_TMP = "/tmp/ai-creative-studio-deploy.zip"

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "   AI Creative Studio - Auto Deploy" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

# 检查文件
if (-not (Test-Path $LOCAL_ZIP)) {
    Write-Host "错误: 找不到部署包 $LOCAL_ZIP" -ForegroundColor Red
    exit 1
}

$zipSize = (Get-Item $LOCAL_ZIP).Length / 1MB
Write-Host "部署包: $LOCAL_ZIP" -ForegroundColor Cyan
Write-Host "大小: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Cyan
Write-Host "服务器: $SERVER`n" -ForegroundColor Cyan

# 部署脚本
$deployCommands = @"
pm2 stop all 2>/dev/null || true &&
pm2 delete all 2>/dev/null || true &&
cd /var/www/ai-creative-studio &&
rm -rf * &&
unzip -o $REMOTE_TMP -d . &&
cat > .env << 'ENVEOF'
DATABASE_URL=mysql://ai_user:FanShai2026DB@Pass@72.61.74.232:3306/ai_creative_studio
JWT_SECRET=your-super-secret-jwt-key-2026
PORT=3000
NODE_ENV=production
ENVEOF
pnpm install &&
pnpm run build &&
pnpm run db:push &&
pm2 start dist/index.js --name ai-creative-studio &&
pm2 save &&
pm2 status
"@

if (-not $DeployOnly) {
    Write-Host "[1/2] 上传文件到服务器..." -ForegroundColor Yellow
    Write-Host "请在提示时输入密码: $PASSWORD" -ForegroundColor Gray
    Write-Host ""
    
    $scpArgs = @(
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        $LOCAL_ZIP,
        "${USER}@${SERVER}:$REMOTE_TMP"
    )
    
    & scp $scpArgs
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n上传失败！" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "`n✓ 文件上传成功！`n" -ForegroundColor Green
}

if ($UploadOnly) {
    Write-Host "仅上传模式，跳过部署步骤" -ForegroundColor Yellow
    exit 0
}

Write-Host "[2/2] 执行部署命令..." -ForegroundColor Yellow
Write-Host "请再次输入密码: $PASSWORD" -ForegroundColor Gray
Write-Host ""

$sshArgs = @(
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "${USER}@${SERVER}",
    $deployCommands
)

& ssh $sshArgs

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "   ✓ 部署完成！" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Green
    Write-Host "访问网站: http://fansai.online" -ForegroundColor Cyan
    Write-Host "API 地址: http://fansai.online/api/trpc`n" -ForegroundColor Cyan
} else {
    Write-Host "`n部署失败！请检查错误信息。" -ForegroundColor Red
}
