# AI Creative Studio 自动部署脚本
$SERVER = "72.61.74.232"
$USER = "root"
$PASSWORD = "sjbw8888@1989827Y"

Write-Host "=== 部署命令清单 ===" -ForegroundColor Green
Write-Host ""
Write-Host "SSH 连接命令:" -ForegroundColor Yellow
Write-Host "ssh ${USER}@${SERVER}" -ForegroundColor White
Write-Host "密码: $PASSWORD" -ForegroundColor Gray
Write-Host ""
Write-Host "连接后依次执行以下命令：" -ForegroundColor Yellow
Write-Host ""

$deployCommands = @'
# 1. 停止现有应用
pm2 stop all
pm2 delete all

# 2. 清理旧文件
cd /var/www/ai-creative-studio
rm -rf *

# 3. 解压新代码（假设已上传到服务器）
cd /var/www/ai-creative-studio

# 4. 创建 .env 文件
cat > .env << 'EOF'
DATABASE_URL=mysql://ai_user:FanShai2026DB@Pass@72.61.74.232:3306/ai_creative_studio
JWT_SECRET=your-super-secret-jwt-key-2026
PORT=3000
NODE_ENV=production
EOF

# 5. 安装依赖并构建
pnpm install
pnpm run build

# 6. 数据库迁移
pnpm run db:push

# 7. 启动应用
pm2 start dist/index.js --name ai-creative-studio
pm2 save

# 8. 验证部署
pm2 status
pm2 logs ai-creative-studio --lines 50
'@

Write-Host $deployCommands -ForegroundColor Cyan
