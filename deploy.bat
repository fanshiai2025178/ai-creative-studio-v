@echo off
chcp 65001 >nul
cls
echo.
echo ========================================
echo    AI Creative Studio - Deploy
echo ========================================
echo.
echo Server: 72.61.74.232
echo Password: sjbw8888@1989827Y
echo.
echo Note: You need to enter the password 2 times
echo.
echo ========================================
echo.
pause

echo.
echo [Step 1/2] Uploading code to server...
echo.
scp -o StrictHostKeyChecking=no f:\ai-creative-studio-deploy.zip root@72.61.74.232:/tmp/ai-creative-studio-deploy.zip

if %errorlevel% neq 0 (
    echo.
    echo Upload failed! Please check network connection.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Upload success! Now connecting to server...
echo ========================================
echo.
echo After connecting, paste this command:
echo.
echo pm2 stop all; pm2 delete all; cd /var/www/ai-creative-studio; rm -rf *; unzip -o /tmp/ai-creative-studio-deploy.zip -d .; cat ^> .env ^<^< 'ENVEOF'
echo DATABASE_URL=mysql://ai_user:FanShai2026DB@Pass@72.61.74.232:3306/ai_creative_studio
echo JWT_SECRET=your-super-secret-jwt-key-2026
echo PORT=3000
echo NODE_ENV=production
echo ENVEOF
echo pnpm install; pnpm run build; pnpm run db:push; pm2 start dist/index.js --name ai-creative-studio; pm2 save; pm2 status
echo.
echo ========================================
echo.
pause

echo Connecting to server...
ssh -o StrictHostKeyChecking=no root@72.61.74.232

echo.
echo ========================================
echo Done! Visit: http://fansai.online
echo ========================================
pause
