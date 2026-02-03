# AI Creative Studio - 自动部署脚本
# 需要安装: plink.exe 和 pscp.exe (PuTTY 套件)

$SERVER = "72.61.74.232"
$USER = "root"  
$PASSWORD = "sjbw8888@1989827Y"
$LOCAL_ZIP = "f:\ai-creative-studio-deploy.zip"
$REMOTE_TMP = "/tmp/ai-creative-studio-deploy.zip"
$REMOTE_DIR = "/var/www/ai-creative-studio"

Write-Host "`n=== AI Creative Studio 自动部署 ===" -ForegroundColor Green
Write-Host "服务器: $SERVER" -ForegroundColor Cyan
Write-Host "本地文件: $LOCAL_ZIP" -ForegroundColor Cyan
Write-Host ""

# 检查 zip 文件是否存在
if (-not (Test-Path $LOCAL_ZIP)) {
    Write-Host "错误: 找不到部署包 $LOCAL_ZIP" -ForegroundColor Red
    exit 1
}

$zipSize = (Get-Item $LOCAL_ZIP).Length / 1MB
Write-Host "部署包大小: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Yellow
Write-Host ""

# 部署命令
$deployScript = @"
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true
cd $REMOTE_DIR
rm -rf *
unzip -o $REMOTE_TMP -d .
cat > .env << 'ENVEOF'
DATABASE_URL=mysql://ai_user:FanShai2026DB@Pass@72.61.74.232:3306/ai_creative_studio
JWT_SECRET=your-super-secret-jwt-key-2026
PORT=3000
NODE_ENV=production
ENVEOF
pnpm install
pnpm run build
pnpm run db:push
pm2 start dist/index.js --name ai-creative-studio
pm2 save
pm2 status
"@

# 方法 1: 使用 pscp (PuTTY)
Write-Host "[步骤 1/2] 正在上传文件..." -ForegroundColor Yellow
$pscpPath = "C:\Program Files\PuTTY\pscp.exe"
if (Test-Path $pscpPath) {
    Write-Host "使用 PSCP 上传文件..." -ForegroundColor Cyan
    & $pscpPath -batch -pw $PASSWORD $LOCAL_ZIP "${USER}@${SERVER}:$REMOTE_TMP"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ 文件上传成功!" -ForegroundColor Green
        
        Write-Host "`n[步骤 2/2] 正在执行部署..." -ForegroundColor Yellow
        $plinkPath = "C:\Program Files\PuTTY\plink.exe"
        & $plinkPath -batch -pw $PASSWORD "${USER}@${SERVER}" $deployScript
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✓ 部署完成!" -ForegroundColor Green
            Write-Host "`n访问网站: http://fansai.online" -ForegroundColor Cyan
        } else {
            Write-Host "`n✗ 部署脚本执行失败" -ForegroundColor Red
        }
    } else {
        Write-Host "✗ 文件上传失败" -ForegroundColor Red
    }
} else {
    # 方法 2: 手动指导
    Write-Host "未找到 PuTTY，请手动执行以下步骤:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. 上传文件:" -ForegroundColor White
    Write-Host "   scp $LOCAL_ZIP ${USER}@${SERVER}:$REMOTE_TMP" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. SSH 连接:" -ForegroundColor White
    Write-Host "   ssh ${USER}@${SERVER}" -ForegroundColor Gray
    Write-Host "   密码: $PASSWORD" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. 执行部署命令:" -ForegroundColor White
    Write-Host $deployScript -ForegroundColor Gray
}
