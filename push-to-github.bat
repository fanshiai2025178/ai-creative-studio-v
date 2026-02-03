@echo off
chcp 65001 >nul
echo ========================================
echo 推送代码到 GitHub
echo ========================================
echo.

cd /d e:\ai-creative-studio-v2

echo [1/4] 查看修改的文件...
git status
echo.

pause

echo [2/4] 添加所有文件...
git add .
echo.

echo [3/4] 创建提交...
git commit -m "feat: 完全移除 Manus 依赖，集成阿里云 OSS

主要变更：
- 移除 vite-plugin-manus-runtime 依赖
- 重写 storage.ts 使用阿里云 OSS  
- 添加完整的部署脚本和文档
- 创建 .env.example 模板
- 支持独立服务器部署

新增文件：
- DEPLOYMENT.md - 详细部署文档
- deploy.sh - 一键部署脚本
- update.sh - 快速更新脚本
- test-oss.mjs - OSS 测试脚本
- README.md - 项目说明
- MIGRATION_COMPLETE.md - 迁移总结
- CHANGES.md - 修改清单"

echo.

echo [4/4] 推送到 GitHub...
git push origin main
echo.

echo ========================================
echo ✅ 推送完成！
echo ========================================
echo.

pause
