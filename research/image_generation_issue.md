# 图片生成问题分析

## 现象
- 前端显示"生成失败"（灰色占位图）
- 后端日志显示生成成功：
  - `[ImageGeneration] Nano Banana returned 1 images`
  - `[ImageGeneration] Image saved to S3: https://d2xsxph8kpxj0f.cloudfront.net/...`
  - `[CharacterDesign] 生成结果: URL=有效`

## 问题定位
图片 URL 成功返回并保存到 S3，但前端无法加载图片。

## 可能原因
1. 图片 URL 在前端无法访问（CORS 问题）
2. 图片加载超时
3. 前端组件状态更新问题
4. 图片 URL 没有正确传递到前端

## 需要检查
1. 前端 GeneratedImageCard 组件的图片加载逻辑
2. 检查 API 响应中是否包含正确的图片 URL
3. 检查网络请求日志，确认前端收到的数据
