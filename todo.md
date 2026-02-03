# AI Creative Studio V2 - 项目迁移 TODO

## 数据库迁移
- [x] 迁移 projects 表
- [x] 迁移 assets 表
- [x] 迁移 workflowTemplates 表
- [x] 迁移 generationTasks 表
- [x] 迁移 customStyles 表
- [x] 迁移 assetLibrary 表
- [x] 迁移 promptGroups 表
- [x] 迁移 prompts 表
- [x] 迁移 scripts 表（剧本改编）
- [x] 迁移 designs 表（形象设计）
- [x] 迁移 storyboardShots 表（分镜脚本）
- [x] 运行数据库迁移 (pnpm db:push)

## 后端 API 路由迁移
- [x] 迁移 basicCreationRouter（剧本改编、形象设计）
- [x] 迁移 storyboardShotRouter（分镜脚本设计）
- [x] 迁移 storyboardWorkbenchRouter（分镜工作台）
- [x] 迁移 assetLibraryRouter（资产库管理）
- [x] 迁移 db.ts 数据库查询函数
- [x] 迁移 storage.ts 存储函数
- [x] 配置 Gemini API 集成

## 前端页面迁移
- [x] 迁移 Home.tsx（首页）
- [x] 迁移 Canvas.tsx（画布页面）
- [x] 迁移 Projects.tsx（项目列表）
- [x] 迁移 Templates.tsx（模板页面）

## 前端组件迁移
- [x] 迁移 StoryboardPanel.tsx（分镜面板）
- [x] 迁移 ScriptPanel.tsx（剧本面板）
- [x] 迁移 DesignPanel.tsx（设计面板）
- [x] 迁移 AssetLibrary.tsx（资产库组件）
- [x] 迁移 PromptLibrary.tsx（提示词库）
- [x] 迁移 ImageEditorPopover.tsx（图片编辑器）
- [x] 迁移 ImageActions.tsx（图片操作）
- [x] 迁移 canvas 目录组件
- [x] 迁移 nodes 目录组件
- [x] 迁移 edges 目录组件
- [x] 迁移 timeline 目录组件

## 环境配置
- [x] 配置 GEMINI_API_KEY
- [x] 验证数据库连接
- [x] 验证 OAuth 认证

## 测试验证
- [x] 测试用户登录功能
- [x] 测试项目创建和管理
- [x] 测试剧本改编功能
- [x] 测试形象设计功能
- [x] 测试分镜脚本设计
- [ ] 测试图片生成功能（需要实际生成测试）
- [ ] 测试资产库功能（需要上传资产测试）

## 发布
- [x] 保存检查点
- [ ] 发布网站

## 已完成的 API 清理
- [x] 删除未使用的 generateAiPrompt API
- [x] 删除未使用的旧版 generateImage API
- [x] 保留 optimizeImagePrompt（完整版提示词优化）
- [x] 保留 prepareImageGeneration（准备图片生成数据）
- [x] 保留 generateStoryboardImage（生成分镜图片）

## Bug 修复
- [x] 修复 Logo 图片显示不正常的问题（压缩图片从 7.1MB 到 103KB）
- [x] 修复形象设计面板点击"生成"按钮后不要自动滚动到第一张图片（保存并恢复滚动位置）
- [ ] 修复形象设计面板“重新生成”功能无法生成角色、场景、道具的问题
- [ ] 改进角色形象设计 API，使其能够生成符合动漫/3D风格的主角形象描述

## 智能小助手 - 角色设计功能
- [x] 创建 server/assistantCharacterDesignRouter.ts 后端 API
- [x] 实现会话管理（内存存储）
- [x] 实现剧本分析 API
- [x] 实现风格图片搜索 API（模拟数据，待接入实际搜索）
- [x] 实现角色图片生成 API
- [x] 修改前端 AI 助手组件，添加“设计角色”入口
- [x] 实现对话框 UI（支持图片消息、选项卡片）
- [x] 实现参考图弹框（点击图片可发送到对话框）
- [x] 实现生成图片的操作菜单（发送到画布/下载/上传资产库）
- [ ] 接入实际的图片搜索 API（待实现）
- [ ] 实现上传到资产库功能（待实现）

## 通用 AI 助手入口优化
- [x] 在通用 AI 创作助手面板中添加“设计角色”快速入口
- [x] 点击后打开角色设计助手对话框

## 角色设计助手 - 文件上传功能
- [x] 在输入框旁添加文件上传按钮（回形针图标）
- [x] 支持上传图片（jpg, png, gif, webp）
- [x] 支持上传文档（txt, doc, docx, pdf）
- [x] 支持上传压缩包（zip, rar, 7z）
- [x] 显示已选择的文件列表
- [ ] 文件上传到 S3 存储（待实现）

## 通用 AI 助手 - 文件上传功能
- [x] 在通用 AI 助手输入框旁添加文件上传按钮
- [x] 支持上传图片、文档、压缩包等文件

## Bug 修复
- [x] 修复角色设计助手上传文件后发送按钮仍禁用的问题
- [x] 修复角色设计助手请求处理错误的问题（setting.includes 类型错误）
- [x] 接入真实的图片搜索 API（Unsplash Source API），让参考图片能够正常显示
- [x] 修复图片搜索功能，更换为可靠的图片源（使用 Unsplash 预定义图片集）
- [ ] 使用 AI 图片生成替代图片搜索，根据剧本内容生成匹配的角色参考图

## Bug 修复 - 角色设计助手卡住问题
- [x] 检查后端日志，定位卡住原因（AI 图片生成太慢）
- [x] 修复 AI 图片生成超时问题（跳过参考图生成步骤）
- [x] 优化流程，用户输入风格后直接进入选择执行方式

## 角色设计助手 - 预设风格选择功能
- [x] 全网搜索动漫/插画/角色设计的常见风格分类
- [x] 整理风格数据（名称、特点、示例描述）
- [x] 实现后端风格数据 API
- [x] 实现前端风格选择 UI 组件（卡片式选择）
- [x] 集成到角色设计助手对话流程中

## Bug 修复 - 角色设计助手图片生成失败
- [ ] 检查后端日志，定位图片生成失败原因
- [ ] 检查 generateCharacterImage 函数逻辑
- [ ] 修复图片生成问题
- [ ] 测试验证修复效果

## 角色设计助手 - 2K 分辨率和进度动画
- [x] 修改图片生成 API 设置 2K 分辨率（2048x2048）
- [x] 创建通用加载进度动画组件（带百分比显示）
- [x] 在文档上传时显示进度动画
- [x] 在剧本分析时显示进度动画
- [x] 在图片生成时显示进度动画（每个角色单独显示进度）
- [ ] 测试各场景进度动画效果

## 角色设计助手 - 修改上传功能为发送到画布
- [x] 将上传图标改为转发图标（Forward）
- [x] 将上传功能改为发送到画布功能
- [x] 更新按钮提示文本

## Bug 修复 - 角色设计助手
- [x] 确认按钮显示正确（下载+发送到画布，移除上传到素材库）
- [x] 检查并修复角色生成数量问题（统一筛选逻辑，最多生成5个角色）

## UI 一致性 - 统一 AI 助手输入框样式
- [x] 分析 AI 助手菜单和角色设计助手的输入框样式差异
- [x] 统一输入框样式（单行输入框、图标按钮、一致的间距和圆角）
- [x] 确保两个组件的用户体验一致

## Bug 修复 - 角色设计助手出现错误
- [x] 检查后端日志，定位错误原因（用户在 generating 状态重复发送消息）
- [x] 修复错误（添加 generating 状态处理，返回“正在生成中”提示）

## Bug 修复 - 加载进度动画显示一下就消失
- [x] 分析加载动画消失的原因（后端同步生成导致前端收到 completed 状态太快）
- [x] 实现异步生成逻辑（后端立即返回 generating 状态，后台异步生成）
- [x] 实现进度轮询 API（getGenerationProgress）
- [x] 前端添加轮询机制，每 2 秒获取生成进度
- [x] 在 generating 状态下禁用发送按钮，防止用户重复点击
- [x] 保持加载动画显示直到生成完成
- [x] 显示实时进度条（已生成 X/Y 个角色）

## 风格选择界面优化 - 添加示例图片
- [x] 为每个预设风格生成对应的示例图片（16 个风格全部完成）
- [x] 将生成的图片上传到 S3 存储
- [x] 更新后端风格数据，添加图片 URL
- [x] 更新前端风格选择组件，显示真实图片替换 emoji
- [x] 测试风格选择界面显示效果

## UI 优化 - 移除快速开始示例
- [x] 移除 AI 对话框中的"快速开始"示例提示区域

## Bug 修复 - 文档导入显示乱码
- [x] 修复 .docx 文件导入后显示原始二进制内容（PK...）的问题（使用 mammoth 库解析）
- [x] 确保正确解析 Office 文档格式

## Bug 修复 - 剧本改编结果显示问题
- [x] 修复改编后的故事没有完整显示的问题（增加高度限制并添加滚动条）
- [x] 修复时间显示为 0秒 的问题（从 episodes 中计算总时长）

## Bug 修复 - 核心冲突字段显示内容不正确
- [x] 检查核心冲突字段的生成逻辑（原来错误地使用 characterActions）
- [x] 修复核心冲突字段生成逻辑（优先使用 adaptationNote，其次 emotionalTone，最后使用对话/场景概述）

## Bug 修复 - 风格选择卡片仍显示 emoji 而不是示例图片
- [ ] 检查后端风格数据是否包含 thumbnailUrl 字段
- [ ] 检查前端是否正确渲染图片
- [ ] 修复图片显示问题

## Bug 修复 - 下载图片失败错误
- [x] 定位"下载图片失败"错误的来源（storyboardWorkbenchRouter.ts 和 storyboardShotRouter.ts）
- [x] 修复错误（添加 fetchImageWithRetry 辅助函数，带 3 次重试和更好的错误信息）

## Bug 修复 - 核心冲突字段显示情感氛围而非冲突概括
- [x] 分析核心冲突字段的生成逻辑
- [x] 修改 AI prompt，让 AI 在生成每个场景时输出核心冲突描述
- [x] 在 Scene 接口中添加 sceneConflict 字段
- [x] 在解析逻辑中提取 sceneConflict 字段
- [x] 修改 createEpisode 函数，优先使用 AI 生成的 sceneConflict

## Bug 修复 - 风格选择卡片显示问题
- [x] 移除图片显示，简化卡片布局
- [x] 修复风格名称被截断的问题（缩小字体为 text-xs）
- [x] 确保风格名称完整显示（调整 padding 和布局）

## Bug 修复 - 风格分类标签显示不完整
- [x] 修复分类标签显示不完整的问题（简化为 JP 日、CN 中、US 欧美、🎨 特殊）
- [x] 缩小字体并简化标签文字

## 风格示例图片生成
- [ ] 创建风格图片生成 API 端点
- [ ] 为每个风格生成示例图片并上传到 S3
- [ ] 更新前端显示风格图片
- [ ] 测试图片显示效果

## 剧本名称重复问题
- [x] 剧本名称重复时自动添加编号区分（如 "霸道总裁爱上我 (2)"）

## 风格卡片布局优化
- [x] 风格名称改为显示在图片下方
- [x] 鼠标悬停风格名称时显示详细介绍（tooltip）

## Bug 修复
- [x] 角色设计助手：选择2个角色但显示生成3个角色的问题

## 核心冲突和关键事件提取 API
- [x] 新增 extractEpisodeInsights API，使用 LLM 以专业导演/编导视角分析
- [x] 集成到剧本改编完成后的流程中
- [x] 替换原有的简单文本拼接逻辑

## 风格选择问题修复
- [x] 修复鼠标悬停风格名字时 tooltip 不显示详细描述的问题
- [x] 生成图片时使用完整风格信息（名称+详细描述+参考图）

## Bug 修复 - 核心冲突和关键事件不显示
- [x] 检查前端渲染代码是否正确显示 coreConflict 和 keyEvents
- [x] 检查数据是否正确保存到数据库
- [x] 修复显示问题（确保 keyEvents 始终是数组类型）

## 性能优化 - 核心冲突提取异步执行
- [x] 将核心冲突和关键事件提取改为异步执行
- [x] 剧本生成后立即返回结果，后台静默更新核心冲突
- [x] 前端显示"优化中..."加载状态，轮询检查更新

## Bug 修复 - 风格卡片名称显示不完整
- [ ] 修复前四个风格（日系赛璐璐、轻小说、新海诚、吉卜力）名称被截断的问题

## Bug 修复 - 风格选择显示 Base64 乱码
- [x] 修复风格选择对话框不显示 Base64 乱码（改为传递风格 ID）
- [x] 确保生成图片时后台使用风格参考图（通过 styleId 获取）

## 交互优化 - 选项卡片点击直接执行
- [x] 修改选项卡片点击行为，点击后直接发送执行，不需要再点击发送按钮
- [x] 对话框会显示用户选择的内容（作为用户消息）

## Bug 修复 - 剧本改编面板核心冲突不显示
- [ ] 检查 ScriptPanel.tsx 中核心冲突和关键事件的显示逻辑
- [ ] 修复核心冲突和关键事件不显示的问题

## 功能增强 - AI 智能优化增加参考内容
- [x] 在 optimizeScript 函数中增加核心冲突作为参考
- [x] 在 optimizeScript 函数中增加关键事件作为参考
- [x] 在 optimizeScript 函数中增加故事结构设定作为参考
- [x] 增加黄金3秒钩子作为参考

## 功能优化 - 显示每集单独时长
- [x] 在剧本界面的每集按钮后面显示该集的单独时长
- [x] 保留总时长显示（格式：总共X集 XXX秒）

## Bug 修复 - 小助手无法生成图片
- [ ] 检查小助手图片生成的错误日志
- [ ] 定位并修复图片生成问题

## 功能检查 - 小助手发送到画布
- [ ] 检查小助手生成图片后"发送到画布"功能是否实现
- [ ] 确保点击图片可以发送到画布、下载

## 角色设计助手 - 三视图生成
- [ ] 修改角色设计助手生成三视图（正面、侧面、背面全身照，16:9比例）

## 删除目标平台和目标受众配置
- [x] 删除前端 UI 中的目标平台配置项
- [x] 删除前端 UI 中的目标受众配置项
- [x] 删除后端 API 中的目标平台相关代码
- [x] 删除后端 API 中的目标受众相关代码
- [x] 整理 API 与配置信息关系文档

## AI智能体优化添加故事类型
- [x] 在 optimizeScript Prompt 中添加故事类型配置


## 分镜脚本场景数量问题
- [x] 调查分镜脚本生成逻辑，找出场景数量限制原因
- [x] 修复场景数量计算逻辑（删除 8-15 个场景的限制）


## AI 智能优化不读取每集时长配置
- [ ] 分析 optimizeScript API 是否读取每集时长配置
- [ ] 修复 optimizeScript 读取并使用每集时长配置


## AI 智能优化功能修复
- [x] 保留原有的核心冲突和关键事件（只优化分镜脚本）
- [x] 读取用户选择的每集时长


## 剧本生成不连贯问题
- [ ] 分析剧本生成流程，找出导致剧情不连贯的原因
- [ ] 制定并实施修复方案


## 改编后的故事区域添加按钮
- [x] 为改编后的故事区域添加复制按钮（移除了下载按钮）


## AI 智能优化增加保留原则规则
- [x] 在 optimizeScript Prompt 中增加保留原则规则
- [x] 在 generateScript 分镜生成 Prompt 中增加保留原则规则


## 分镜脚本 Prompt 升级
- [x] 新增字段：角色外观、光线色调、镜头运动、转场
- [x] 画面描述增加具体要求（人物位置、姿态、表情、道具）
- [x] 新增【时长计算规则】：台词每字0.3秒，动作分简单/中等/复杂
- [x] 新增【时长红线】：单场景2-15秒
- [x] 新增【画面描述红线】：禁止心理活动和抽象描述
- [x] 新增【角色一致性要求】：同一角色外观必须一致
- [x] 新增【台词保留原则】：保留重要对白，标注说话人
- [x] 新增【输出示例】：给AI一个标准参考


## 分镜脚本 Prompt 升级 V2（漫剧专业版）
- [x] 更新为"漫剧分镜师"角色定位
- [x] 新增【漫剧技术规范】：单镜头2-5秒、分镜密度每分钟20-30个、单场景上限5秒
- [x] 新增【单集节奏结构】：黄金钩子、冲突建立、发展推进、高潮反转、悬念钩子
- [x] 新增【打脸循环分镜】：憋屈→出手→打脸→收获四阶段详细分镜指导
- [x] 新增【故事类型适配】：身份反转、能力觉醒、甜宠恋爱、悬疑烧脑、复仇虐心
- [x] 新增【景别切换规则】：对话场景、动作场景、情绪转折的景别切换模式
- [x] 简化分镜格式：移除时长计算公式，改为直接指定2-5秒范围
- [x] 添加每集目标时长参数：${durationPerEpisode}秒


## 形象场景设计 - 图片一致性修复（锚定机制）
- [x] 修改 buildCharacterImagePrompt 函数，添加 hasAnchorImage 参数
- [x] 修改 buildSceneImagePrompt 函数，添加 hasAnchorImage 参数
- [x] 修改 buildPropImagePrompt 函数，添加 hasAnchorImage 参数
- [x] 修改 generateDesignCharacterImage mutation，添加锚定图逻辑
- [x] 修改 generateDesignSceneImage mutation，添加锚定图逻辑
- [x] 修改 generateDesignPropImage mutation，添加锚定图逻辑
- [x] 修改 batchGenerateDesignImages mutation，更新函数调用参数


## AI 设计角色按钮跳转到 AI 创作助手
- [x] 查找 AI 设计角色按钮所在组件
- [x] 查找 AI 创作助手面板组件
- [x] 实现点击按钮打开 AI 助手面板
- [x] 自动触发"设计角色"快捷操作并传递剧本上下文


## AI 设计角色按钮 - 自动传递剧本内容
- [x] 修改 DesignPanel 获取并传递当前剧本内容
- [x] 修改 AIAssistant 接收剧本内容参数
- [x] 修改 CharacterDesignAssistant 接收并显示剧本内容
- [x] 测试完整流程


## AI 设计角色 - 剧本内容直接发送到对话框
- [x] 修改 CharacterDesignAssistant 组件，自动发送剧本内容而不是填充到输入框
- [x] 测试完整流程


## 剧本内容截断显示
- [x] 修改 autoSendScriptContent 函数，对话框显示截断内容，后端发送完整内容


## 对话框角色图片横屏显示
- [x] 修改 CharacterDesignAssistant 中图片显示样式，从竖屏改为横屏


## 修复角色和场景图片无法显示问题
- [x] 检查服务器日志和图片生成代码
- [x] 定位问题：S3/CloudFront URL 返回 403，无法公开访问
- [x] 改用 base64 内联存储方案
- [x] 修改 basicCreationRouter.ts 中所有图片生成使用 base64 优先
- [x] 修改 routers.ts 中图片生成/编辑使用 base64 优先
- [x] 修改 storyboardShotRouter.ts 中图片生成使用 base64 优先
- [x] 修改 storyboardWorkbenchRouter.ts 中所有图片生成使用 base64 优先
- [x] 修改 assistantCharacterDesignRouter.ts 中图片生成使用 base64 优先
- [x] 修改 generateStyleThumbnails.ts 中图片生成使用 base64 优先


## AI 助手智能升级
- [x] 修改 assistantCharacterDesignRouter.ts 导出核心函数（analyzeScript、generateCharacterImage、PRESET_STYLES）
- [x] 创建 server/assistantCreativeRouter.ts 综合助手后端路由
- [x] 创建 client/src/components/assistant/EntryCards.tsx 入口卡片组件
- [x] 修改 server/routers.ts 注册新路由
- [x] 修改 client/src/components/canvas/AIAssistant.tsx 添加入口卡片和 API 调用
- [x] 测试 AI 助手升级功能


## Bug 修复 - 角色图片生成失败
- [x] 修复 "PayloadTooLargeError: request entity too large" 错误 - 增加请求体大小限制到 200mb
- [x] 修复 "Failed to fetch image: 403" 错误 - fetchImageAsBase64 函数添加错误处理，返回 null 而不是抛出错误
- [x] 修复从资产库导入图片时 S3 URL 无法访问问题 - 前端导入时自动转换为 base64 格式
