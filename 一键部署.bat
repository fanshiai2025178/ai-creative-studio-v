@echo off
chcp 65001 >nul
cls
echo.
echo ========================================
echo    AI Creative Studio - 一键部署
echo ========================================
echo.
echo 服务器: 72.61.74.232
echo 密码: sjbw8888@1989827Y
echo.
echo 说明: 部署过程需要输入密码2次
echo       请复制密码备用
echo.
echo ========================================
echo.
pause

echo.
echo [步骤 1/2] 上传代码到服务器...
echo.
scp -o StrictHostKeyChecking=no f:\ai-creative-studio-deploy.zip root@72.61.74.232:/tmp/ai-creative-studio-deploy.zip

if %errorlevel% neq 0 (
    echo.
    echo 上传失败！请检查网络连接。
    pause
    exit /b 1
)

echo.
echo ========================================
echo 上传成功！现在连接服务器执行部署...
echo ========================================
echo.
echo 连接后请复制粘贴以下命令:
echo.
echo pm2 stop all 2^>^/dev^/null ^|^| true ^&^& pm2 delete all 2^>^/dev^/null ^|^| true ^&^& cd /var/www/ai-creative-studio ^&^& rm -rf * ^&^& unzip -o /tmp/ai-creative-studio-deploy.zip -d . ^&^& cat ^> .env ^<^< 'ENVEOF'
echo DATABASE_URL=mysql://ai_user:FanShai2026DB@Pass@72.61.74.232:3306/ai_creative_studio
echo JWT_SECRET=your-super-secret-jwt-key-2026
echo PORT=3000
echo NODE_ENV=production
echo ENVEOF
echo pnpm install ^&^& pnpm run build ^&^& pnpm run db:push ^&^& pm2 start dist/index.js --name ai-creative-studio ^&^& pm2 save ^&^& pm2 status
echo.
echo ========================================
echo.
pause

echo 正在连接服务器...
ssh -o StrictHostKeyChecking=no root@72.61.74.232

echo.
echo ========================================
echo 部署完成！访问: http://fansai.online
echo ========================================
pause
