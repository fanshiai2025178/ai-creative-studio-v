/**
 * ============================================================
 * 版本信息配置
 * ============================================================
 * 
 * 【版本号规则】（重要！每次更新必须遵守）
 * 
 * 格式：V{月}-{日}-{当天第几次更新}
 * 时区：北京时间 (UTC+8)
 * 
 * 示例：
 *   - V2-3-1  = 2月3日 第1次更新
 *   - V2-3-2  = 2月3日 第2次更新
 *   - V2-15-1 = 2月15日 第1次更新
 *   - V12-25-3 = 12月25日 第3次更新
 * 
 * 【更新步骤】
 * 1. 获取当前北京时间（PowerShell命令）：
 *    [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'China Standard Time').ToString('yyyy-MM-dd HH:mm')
 * 
 * 2. 修改下方 VERSION 对象的 number 和 date
 * 
 * 3. 提交推送：git add -A && git commit -m "chore: update version" && git push
 * 
 * 4. 服务器部署：cd /var/www/ai-creative-studio && git pull && pnpm run build && pm2 restart app
 * 
 * 5. 确认稳定后打标签：git tag V2-3-1 && git push origin V2-3-1
 * 
 * ============================================================
 */
export const VERSION = {
  // 版本号（格式：V{月}-{日}-{当天第几次更新}）
  number: 'V2-3-4',
  // 更新时间（北京时间）
  date: '2026-02-03 20:50',
  // 更新说明
  changelog: '修复 ImageDisplayNode AI识别 blob URL 无法处理问题；修复 invokeGeminiLLM 缺少 apiKey 参数',
};

// 格式化显示
export const getVersionDisplay = () => `${VERSION.number}`;
export const getVersionWithDate = () => `${VERSION.number} (${VERSION.date})`;
