@echo off
chcp 65001 >nul
echo ========================================
echo 推送部署文件到 GitHub
echo ========================================
echo.

cd /d e:\ai-creative-studio-v2

echo [1/5] 查看所有文件状态...
git status
echo.

echo [2/5] 添加所有新文件...
git add .
git add -f deploy.sh
git add -f .env.example
git add -f DEPLOYMENT.md
git add -f README.md
git add -f MIGRATION_COMPLETE.md
git add -f CHANGES.md
git add -f update.sh
git add -f test-oss.mjs
echo.

echo [3/5] 查看将要提交的文件...
git status
echo.

pause

echo [4/5] 创建提交...
git commit -m "feat: 添加完整的部署工具和文档

新增文件：
- .env.example - 环境变量模板
- DEPLOYMENT.md - 详细部署文档
- deploy.sh - 一键部署脚本
- update.sh - 快速更新脚本
- test-oss.mjs - OSS 测试脚本
- README.md - 项目说明
- MIGRATION_COMPLETE.md - 迁移总结
- CHANGES.md - 修改清单"
echo.

echo [5/5] 推送到 GitHub...
git push origin main
echo.

echo ========================================
echo ✅ 推送完成！
echo ========================================
echo.

pause
