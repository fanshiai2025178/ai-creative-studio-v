@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    AI Creative Studio - 快速部署工具
echo ========================================
echo.
echo 服务器: 72.61.74.232
echo 密码: sjbw8888@1989827Y  
echo 部署包: f:\ai-creative-studio-deploy.zip (12.88 MB)
echo.
echo ========================================
echo.
pause

echo.
echo [步骤 1/2] 上传文件到服务器...
echo 请在提示时输入密码: sjbw8888@1989827Y
echo.
scp f:\ai-creative-studio-deploy.zip root@72.61.74.232:/tmp/

if %errorlevel% neq 0 (
    echo.
    echo 文件上传失败！请检查网络连接。
    pause
    exit /b 1
)

echo.
echo ✓ 文件上传成功！
echo.
echo [步骤 2/2] 连接服务器并执行部署...
echo 请再次输入密码，然后复制粘贴以下命令：
echo.
echo ----------------------------------------
echo pm2 stop all 2^>^/dev^/null ^|^| true
echo pm2 delete all 2^>^/dev^/null ^|^| true
echo cd /var/www/ai-creative-studio
echo rm -rf *
echo unzip -o /tmp/ai-creative-studio-deploy.zip -d .
echo cat ^> .env ^<^< 'ENVEOF'
echo DATABASE_URL=mysql://ai_user:FanShai2026DB@Pass@72.61.74.232:3306/ai_creative_studio
echo JWT_SECRET=your-super-secret-jwt-key-2026
echo PORT=3000
echo NODE_ENV=production
echo ENVEOF
echo pnpm install
echo pnpm run build
echo pnpm run db:push
echo pm2 start dist/index.js --name ai-creative-studio
echo pm2 save
echo pm2 status
echo ----------------------------------------
echo.
pause

ssh root@72.61.74.232
