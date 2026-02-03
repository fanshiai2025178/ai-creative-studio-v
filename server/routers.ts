import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { storyboardWorkbenchRouter } from "./storyboardWorkbenchRouter";
import { storyboardShotRouter } from "./storyboardShotRouter";
import { assetLibraryRouter } from "./assetLibraryRouter";
import { basicCreationRouter } from "./basicCreationRouter";
import { assistantCharacterDesignRouter } from "./assistantCharacterDesignRouter";
import { assistantCreativeRouter } from "./assistantCreativeRouter";
import { authRouter } from "./authRouter";
import { 
  createProject, 
  getUserProjects, 
  getProjectById, 
  updateProject, 
  deleteProject,
  duplicateProject,
  createAsset,
  getProjectAssets,
  createGenerationTask,
  updateGenerationTask,
  getWorkflowTemplates,
  createCustomStyle,
  getUserCustomStyles,
  deleteCustomStyle,
  incrementStyleUsage,
  getUserPromptGroups,
  createPromptGroup,
  updatePromptGroup,
  deletePromptGroup,
  getGroupPrompts,
  getUserPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt
} from "./db";
import { generateImage } from "./_core/imageGeneration";
import { invokeGeminiLLM } from "./_core/gemini";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,
  storyboardWorkbench: storyboardWorkbenchRouter,
  storyboardShot: storyboardShotRouter,
  assetLibrary: assetLibraryRouter,
  basicCreation: basicCreationRouter,
  assistantCharacterDesign: assistantCharacterDesignRouter,
  assistantCreative: assistantCreativeRouter,
  
  auth: authRouter,

  // Project management
  project: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      // 只返回当前用户的项目
      return getUserProjects(ctx.user.id);
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new Error("项目不存在");
        }
        return project;
      }),

    create: protectedProcedure
      .input(z.object({ name: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const project = await createProject({
          userId: ctx.user.id,
          name: input.name || "未命名项目",
          description: null,
          thumbnail: null,
          workflowData: null,
          status: 'active',
        });
        return project;
      }),

    rename: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new Error("Project not found");
        }
        return updateProject(input.id, { name: input.name });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        thumbnail: z.string().optional(),
        workflowData: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new Error("Project not found");
        }
        const { id, ...data } = input;
        return updateProject(id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new Error("Project not found");
        }
        return deleteProject(input.id);
      }),

    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const project = await getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) {
          throw new Error("Project not found");
        }
        return duplicateProject(input.id, ctx.user.id);
      }),
  }),

  // Asset management
  asset: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          throw new Error("Project not found");
        }
        return getProjectAssets(input.projectId);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number().optional(),
        nodeId: z.string().optional(),
        type: z.enum(["image", "video", "audio"]),
        url: z.string(),
        fileKey: z.string(),
        filename: z.string().optional(),
        mimeType: z.string().optional(),
        size: z.number().optional(),
        metadata: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.projectId) {
          const project = await getProjectById(input.projectId);
          if (!project || project.userId !== ctx.user.id) {
            throw new Error("Project not found");
          }
        }
        return createAsset({
          userId: ctx.user.id,
          ...input,
        });
      }),
  }),

  // AI Generation
  ai: router({
    // Text to Image generation
    textToImage: protectedProcedure
      .input(z.object({
        prompt: z.string(),
        negativePrompt: z.string().optional(),
        model: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        projectId: z.number().optional(),
        nodeId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { prompt, negativePrompt, model, width, height, projectId, nodeId } = input;
        
        // Create task record
        const task = await createGenerationTask({
          userId: ctx.user.id,
          projectId,
          nodeId,
          taskType: "text2img",
          inputData: { prompt, negativePrompt, model, width, height },
        });

        try {
          // Use built-in image generation
          const result = await generateImage({
            prompt: prompt,
            apiKey: ctx.user?.apiKey,
          });

          // OSS URL 用于数据库存储（短链接）
          const ossUrl = result.url || '';
          // base64 数据 URL 用于前端显示（避免 403 问题）
          let displayUrl = ossUrl;
          if (result.base64 && result.mimeType) {
            displayUrl = `data:${result.mimeType};base64,${result.base64}`;
          }

          // Update task with result (存储 OSS URL)
          await updateGenerationTask(task.id, {
            status: "completed",
            outputData: { imageUrl: ossUrl },
          });

          // Create asset record (存储 OSS URL，不存 base64)
          const fileKey = result.fileKey || `generated/${ctx.user.id}/${nanoid()}.png`;
          await createAsset({
            userId: ctx.user.id,
            projectId,
            nodeId,
            type: "image",
            url: ossUrl,
            fileKey,
            metadata: { prompt, model, width, height },
          });

          return {
            success: true,
            imageUrl: displayUrl,  // 返回 base64 给前端显示
            taskId: task.id,
          };
        } catch (error) {
          await updateGenerationTask(task.id, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Generation failed",
          });
          throw error;
        }
      }),

    // Image to Image generation
    imageToImage: protectedProcedure
      .input(z.object({
        prompt: z.string(),
        imageUrl: z.string(),
        strength: z.number().optional().default(0.7),
        model: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        projectId: z.number().optional(),
        nodeId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { prompt, imageUrl, strength, model, width, height, projectId, nodeId } = input;
        
        // 计算宽高比例
        let aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "5:4" | undefined;
        if (width && height) {
          const ratio = width / height;
          if (Math.abs(ratio - 1) < 0.1) aspectRatio = "1:1";
          else if (Math.abs(ratio - 16/9) < 0.1) aspectRatio = "16:9";
          else if (Math.abs(ratio - 9/16) < 0.1) aspectRatio = "9:16";
          else if (Math.abs(ratio - 4/3) < 0.1) aspectRatio = "4:3";
          else if (Math.abs(ratio - 3/4) < 0.1) aspectRatio = "3:4";
          else if (Math.abs(ratio - 5/4) < 0.1) aspectRatio = "5:4";
          // 21:9 不支持，默认使用 16:9
          else if (Math.abs(ratio - 21/9) < 0.1) aspectRatio = "16:9";
        }
        
        const task = await createGenerationTask({
          userId: ctx.user.id,
          projectId,
          nodeId,
          taskType: "img2img",
          inputData: { prompt, imageUrl, strength, model, width, height },
        });

        try {
          // Use built-in image generation with reference image
          const result = await generateImage({
            prompt: prompt,
            originalImages: [{
              url: imageUrl,
              mimeType: "image/png",
            }],
            aspectRatio,
            apiKey: ctx.user?.apiKey,
          });

          // OSS URL 用于数据库存储
          const ossUrl = result.url || '';
          // base64 数据 URL 用于前端显示
          let displayUrl = ossUrl;
          if (result.base64 && result.mimeType) {
            displayUrl = `data:${result.mimeType};base64,${result.base64}`;
          }

          await updateGenerationTask(task.id, {
            status: "completed",
            outputData: { imageUrl: ossUrl },
          });

          const fileKey = result.fileKey || `generated/${ctx.user.id}/${nanoid()}.png`;
          await createAsset({
            userId: ctx.user.id,
            projectId,
            nodeId,
            type: "image",
            url: ossUrl,
            fileKey,
            metadata: { prompt, sourceImage: imageUrl, strength, model },
          });

          return {
            success: true,
            imageUrl: displayUrl,  // 返回 base64 给前端显示
            taskId: task.id,
          };
        } catch (error) {
          await updateGenerationTask(task.id, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Generation failed",
          });
          throw error;
        }
      }),

    // Optimize prompt using LLM
    optimizePrompt: protectedProcedure
      .input(z.object({
        prompt: z.string(),
        style: z.string().optional(),
        mode: z.enum(["text2img", "img2img"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { prompt, style, mode } = input;
        console.log('[optimizePrompt] 收到请求:', { promptLength: prompt.length, style, mode });
        console.log('[optimizePrompt] 用户 apiKey:', ctx.user?.apiKey ? '已设置' : '未设置');
        
        // 图生图模式：需要保持原图特征
        const img2imgSystemPrompt = `你是一个专业的图生图提示词优化专家。用户会提供原图内容描述和想要的变换效果，你需要生成一个保持原图核心特征的变换提示词。

优化规则：
1. 【最重要】必须保持原图的核心特征：
   - 人物的发色、发型、五官特征
   - 服装的颜色和款式
   - 整体的艺术风格（如动漫风、写实风等）
   - 背景的基本元素
2. 只根据用户想要的效果进行有针对性的修改
3. 添加 "maintaining original facial features and clothing style" 确保一致性
4. 添加画质关键词：high quality, detailed

输出格式：只返回优化后的英文提示词，不要有任何解释。`;

        // 文生图模式：标准优化
        const text2imgSystemPrompt = `你是一个专业的 AI 图像生成提示词优化专家。用户会给你一段简单的描述，你需要将其优化为专业的英文提示词。

优化规则：
1. 保持原始意图不变
2. 添加画质关键词：8k, high resolution, detailed, masterpiece
3. 添加风格关键词：cinematic, professional photography, artstation
4. 添加光影关键词：dramatic lighting, volumetric light, soft shadows
5. 添加构图关键词：rule of thirds, depth of field, sharp focus
${style ? `6. 风格偏好：${style}` : ''}

只返回优化后的英文提示词，不要有任何解释。`;

        const systemPrompt = mode === "img2img" ? img2imgSystemPrompt : text2imgSystemPrompt;

        const response = await invokeGeminiLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          apiKey: ctx.user?.apiKey,
        });

        const messageContent = response.choices[0]?.message?.content;
        const optimizedPrompt = typeof messageContent === 'string' ? messageContent : prompt;

        return {
          original: prompt,
          optimized: optimizedPrompt,
        };
      }),

    // Optimize video prompt using LLM (专业图生视频提示词)
    optimizeVideoPrompt: protectedProcedure
      .input(z.object({
        imageContent: z.string().optional(),
        desiredEffect: z.string(),
        duration: z.number().optional(),
        model: z.enum(["runway", "kling", "pika", "hailuo"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { imageContent, desiredEffect, duration = 5, model = "hailuo" } = input;
        
        // 根据不同模型生成不同的优化策略
        const modelGuides: Record<string, string> = {
          hailuo: `## 海螺 AI 视频生成提示词指南

### 核心特点：
- 擅长自然过渡和稳定运动
- 支持中文提示词，理解中文语境更好
- 真实感强，细节保持好

### 提示词结构：
1. **动作描述**：用简洁的语言描述主体的动作
2. **运动方式**：缓慢移动/平稳运动/自然过渡
3. **镜头语言**：推进/拉远/环绕/跟随
4. **氛围营造**：光影变化/环境氛围

### 海螺专用关键词：
- 运动：缓慢移动、平稳运动、自然过渡、微微晃动、流畅运动
- 镜头：推进镜头、拉远镜头、环绕镜头、跟随镜头、俯视镜头
- 氛围：光影变化、暖色调、冷色调、柔和光线、晨曦光线
- 风格：电影感、纪实风格、唱词风格、故事感

### 输出格式（中文）：
[主体动作]，[镜头运动]，[光影氛围]，[风格效果]`,
          
          runway: `## Runway Gen-3 提示词指南

### 核心规则（官方指南）：
1. **不需要描述输入图片内容** - 模型已经能看到图片
2. **只描述想要的动作/运动** - 简单直接的运动描述
3. **避免负面表述** - 不要说"不要xxx"
4. **使用正面表述** - 如"clear blue sky"而非"no clouds"

### 六层框架：
1. **主体与动作**: 明确动作或运动，确定情感状态
2. **镜头类型**: Wide shot, Medium shot, Close-up, Extreme close-up
3. **镜头运动**: Static, Tracking, Panning, Dolly, Handheld, Crane
4. **光线氛围**: Golden hour, Blue hour, Soft lighting, Dramatic lighting
5. **技术规格**: 35mm/50mm/85mm lens, Shallow depth of field, Cinematic
6. **节奏**: Slow motion, Dynamic motion

### Runway专用关键词：
- 镜头: Low angle, High angle, FPV, Wide angle, Close up, Tracking, 50mm lens
- 光线: Diffused lighting, Silhouette, Back lit, Side lit, Golden hour
- 运动: Dynamic motion, Slow motion, Grows, Emerges, Undulates, Transforms
- 风格: Moody, Cinematic, Iridescent, Film grain

### 输出格式（英文）：
[Camera movement], [Subject action], [Lighting/Atmosphere], [Technical details]`,
          
          kling: `## 可灵 2.6 提示词指南

### 核心特点：
- 支持中英文提示词
- 擅长人物动作和表情变化
- 性价比高，生成速度快

### 提示词结构：
1. **动作描述**：清晰描述主体的动作变化
2. **镜头运动**：推拉摇移跟
3. **表情细节**：如果有人物，描述表情变化
4. **环境互动**：与场景的互动

### 可灵专用关键词：
- 运动：流畅运动、连贯动作、自然过渡、平滑移动
- 镜头：缓慢推进、平稳跟随、环绕拍摄、俯仰角度
- 人物：表情变化、眉毛微动、嘴角上扬、眼神转变
- 风格：电影质感、唱词风格、广告质感

### 输出格式（中英文皆可）：
[主体动作], [镜头运动], [表情/细节], [风格效果]`,
          
          pika: `## Pika 提示词指南

### 核心特点：
- 擅长创意动画和风格化效果
- 生成速度快
- 适合趣味性内容

### 提示词结构：
1. **动作描述**：简洁明了的动作
2. **风格效果**：动画风格/卡通风格
3. **节奏控制**：快慢节奏
4. **创意元素**：特效和转场

### Pika专用关键词：
- 风格：animated, cartoon style, stylized, artistic, playful
- 运动：bouncy motion, smooth transition, dynamic movement
- 效果：particle effects, glow effects, morphing, transformation
- 节奏：fast paced, slow motion, rhythmic

### 输出格式（英文）：
[Action], [Style], [Effects], [Rhythm]`
        };
        
        const modelGuide = modelGuides[model] || modelGuides.hailuo;
        const outputLanguage = model === "hailuo" ? "中文" : (model === "kling" ? "中英文皆可，优先中文" : "英文");
        
        const systemPrompt = `你是一个专业的图生视频提示词专家。当前用户选择的模型是: ${model}

${modelGuide}

## 通用规则：
1. **不需要描述输入图片内容** - 模型已经能看到图片
2. **只描述想要的动作/运动** - 简单直接
3. **避免负面表述** - 不要说"不要xxx"
4. **视频时长**: ${duration}秒

只返回优化后的提示词（${outputLanguage}），不要有任何解释。提示词应该简洁专业，适合直接用于${model}视频生成模型。`;

        const userPrompt = imageContent 
          ? `图片内容：${imageContent}\n用户想要的视频效果：${desiredEffect}\n视频时长：${duration}秒`
          : `用户想要的视频效果：${desiredEffect}\n视频时长：${duration}秒`;

        const response = await invokeGeminiLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          apiKey: ctx.user?.apiKey,
        });

        const messageContent = response.choices[0]?.message?.content;
        const optimizedPrompt = typeof messageContent === 'string' ? messageContent : desiredEffect;

        return {
          original: desiredEffect,
          optimized: optimizedPrompt,
        };
      }),

    // AI Assistant chat
    chat: protectedProcedure
      .input(z.object({
        message: z.string(),
        context: z.string().optional(),
        history: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { message, context, history } = input;
        
        const systemPrompt = `你是一个专业的 AI 视觉创作助手，帮助用户进行创意策划和提示词优化。

你的能力：
1. 分镜策划：帮助用户规划视频/图片的分镜脚本
2. 提示词生成：根据用户描述生成专业的 AI 绘图提示词
3. 创意建议：提供视觉创作的灵感和建议
4. 工具指导：解答关于平台工具使用的问题

回复规则：
- 使用中文回复
- 提供具体可执行的建议
- 如果涉及提示词，同时提供中文解释和英文提示词
- 保持友好专业的语气

${context ? `当前上下文：${context}` : ''}`;

        const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: systemPrompt },
        ];

        if (history) {
          history.forEach(h => {
            messages.push({ role: h.role, content: h.content });
          });
        }

        messages.push({ role: "user", content: message });

        const response = await invokeGeminiLLM({ messages, apiKey: ctx.user?.apiKey });

        const replyContent = response.choices[0]?.message?.content;
        return {
          reply: typeof replyContent === 'string' ? replyContent : "抱歉，我暂时无法回答这个问题。",
        };
      }),

    // Generate storyboard
    generateStoryboard: protectedProcedure
      .input(z.object({
        description: z.string(),
        sceneCount: z.number().optional().default(4),
        style: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { description, sceneCount, style } = input;
        
        const systemPrompt = `你是一个专业的分镜策划师。根据用户的描述，生成详细的分镜脚本。

输出格式（JSON）：
{
  "title": "作品标题",
  "scenes": [
    {
      "id": 1,
      "description": "场景描述（中文）",
      "prompt": "AI绘图提示词（英文）",
      "camera": "镜头描述（如：远景、中景、特写）",
      "duration": "建议时长（秒）"
    }
  ]
}

要求：
- 生成 ${sceneCount} 个场景
- 提示词要专业详细
${style ? `- 风格偏好：${style}` : ''}
- 只返回 JSON，不要有其他内容`;

        const response = await invokeGeminiLLM({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: description },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "storyboard",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  scenes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        description: { type: "string" },
                        prompt: { type: "string" },
                        camera: { type: "string" },
                        duration: { type: "string" },
                      },
                      required: ["id", "description", "prompt", "camera", "duration"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["title", "scenes"],
                additionalProperties: false,
              },
            },
          },
          apiKey: ctx.user?.apiKey,
        });

        const content = response.choices[0]?.message?.content;
        if (!content || typeof content !== 'string') {
          throw new Error("Failed to generate storyboard");
        }

        return JSON.parse(content);
      }),

    // AI Optimize Image Edit Prompt (AI 1: 分析原图+参考图+用户描述，生成优化提示词)
    optimizeImageEditPrompt: protectedProcedure
      .input(z.object({
        originalImageUrl: z.string(),
        referenceImages: z.array(z.object({
          id: z.number(),
          url: z.string(),
          label: z.string(),
        })),
        userDescription: z.string(),
        redrawMode: z.enum(["smart", "precise"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { originalImageUrl, referenceImages, userDescription, redrawMode } = input;
        
        // 构建多模态内容：原图 + 参考图 + 文本描述
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
        
        // 系统提示词
        const systemPrompt = `你是一个专业的 AI 图片编辑提示词优化专家。用户会提供：
1. 原图（需要编辑的图片）
2. 参考图（标记为"图片1"-"图片6"，用于提取元素）
3. 用户描述（中文，可能引用"图片1-6"）

你的任务是分析所有图片和用户描述，生成一个优化的英文提示词，用于 AI 图片编辑。

${redrawMode === "smart" ? 
  "重绘模式：智能模式 - AI 需要自动识别完整对象（如整件衣服、整个人物），即使用户只指定部分区域" :
  "重绘模式：精确模式 - 仅重绘用户指定的区域，不扩展到其他部分"}

优化规则：
1. 详细描述原图中需要保留的元素（人物特征、背景、光线等）
2. 详细描述从参考图中提取的元素（衣服款式、颜色、材质、图案等）
3. 描述如何将参考元素融合到原图中
4. 添加画质关键词：high quality, detailed, professional
5. 添加一致性关键词：consistent lighting, seamless blend, natural integration
6. 如果是换装场景，强调保持人物身体比例、姿势、光影一致
7. 如果是换脸场景，强调保持表情、角度、光线一致

只返回优化后的英文提示词，不要有任何解释。`;
        
        parts.push({ text: systemPrompt });
        
        // 添加原图
        parts.push({ text: "\n\n原图（需要编辑的图片）：" });
        
        // 将图片 URL 转换为 base64
        const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string } | null> => {
          try {
            if (url.startsWith('data:')) {
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                return { base64: match[2], mimeType: match[1] };
              }
            }
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            const contentType = response.headers.get('content-type') || 'image/png';
            return { base64, mimeType: contentType };
          } catch (error) {
            console.error('Failed to fetch image:', error);
            return null;
          }
        };
        
        const originalImage = await fetchImageAsBase64(originalImageUrl);
        if (originalImage) {
          parts.push({
            inlineData: {
              mimeType: originalImage.mimeType,
              data: originalImage.base64,
            },
          });
        }
        
        // 添加参考图
        if (referenceImages.length > 0) {
          parts.push({ text: "\n\n参考图：" });
          for (const ref of referenceImages) {
            parts.push({ text: `\n${ref.label}：` });
            const refImage = await fetchImageAsBase64(ref.url);
            if (refImage) {
              parts.push({
                inlineData: {
                  mimeType: refImage.mimeType,
                  data: refImage.base64,
                },
              });
            }
          }
        }
        
        // 添加用户描述
        parts.push({ text: `\n\n用户描述：${userDescription}` });
        parts.push({ text: "\n\n请生成优化后的英文提示词：" });
        
        // 使用 Gemini 多模态分析（必须使用用户的 API Key）
        const { GoogleGenAI } = await import("@google/genai");
        const apiKey = ctx.user?.apiKey;
        if (!apiKey) {
          throw new Error("请先在个人设置中配置您的 Gemini API Key");
        }
        // 直接调用 Google API（国外服务器无需代理）
        const client = new GoogleGenAI({ apiKey });
        
        const response = await client.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: parts as any,
        });
        
        const optimizedPrompt = response.text || userDescription;
        
        return {
          optimizedPrompt: optimizedPrompt.trim(),
          originalDescription: userDescription,
        };
      }),

    // Advanced Redraw (AI 2: 使用多参考图进行高级重绘)
    advancedRedraw: protectedProcedure
      .input(z.object({
        originalImageUrl: z.string(),
        referenceImages: z.array(z.object({
          id: z.number(),
          url: z.string(),
          label: z.string(),
        })),
        prompt: z.string(),
        redrawMode: z.enum(["smart", "precise"]),
        nodeId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { originalImageUrl, referenceImages, prompt, redrawMode, nodeId } = input;
        
        // 将图片 URL 转换为 base64
        const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string } | null> => {
          try {
            if (url.startsWith('data:')) {
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                return { base64: match[2], mimeType: match[1] };
              }
            }
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            const contentType = response.headers.get('content-type') || 'image/png';
            return { base64, mimeType: contentType };
          } catch (error) {
            console.error('Failed to fetch image:', error);
            return null;
          }
        };
        
        // 收集所有参考图
        const allReferenceImages: Array<{ base64: string; mimeType: string }> = [];
        
        // 添加原图作为第一张参考图
        const originalImage = await fetchImageAsBase64(originalImageUrl);
        if (originalImage) {
          allReferenceImages.push(originalImage);
        }
        
        // 添加其他参考图
        for (const ref of referenceImages) {
          const refImage = await fetchImageAsBase64(ref.url);
          if (refImage) {
            allReferenceImages.push(refImage);
          }
        }
        
        // 构建完整的提示词
        const fullPrompt = `${redrawMode === "smart" ? 
          "[Smart Redraw Mode] Automatically identify and modify complete objects (e.g., entire clothing, full face) even if only part is specified. " :
          "[Precise Redraw Mode] Only modify the exact specified area, do not extend to other parts. "}

Edit the first image (original) using elements from the reference images:
${prompt}

Maintain consistency in:
- Lighting and shadows
- Color temperature
- Perspective and proportions
- Overall style and atmosphere

Output a high-quality, seamlessly edited image.`;
        
        // 使用 Nano Banana Pro 进行图片生成
        const { nanoBananaGenerateImage } = await import("./_core/gemini");
        
        const result = await nanoBananaGenerateImage({
          prompt: fullPrompt,
          model: "gemini-3-pro-image-preview",
          referenceImages: allReferenceImages,
          imageSize: "2K",
          useThinking: true,
        });
        
        if (!result.images || result.images.length === 0) {
          throw new Error("图片生成失败");
        }
        
        // 上传结果到 S3
        const imageData = result.images[0];
        const buffer = Buffer.from(imageData.base64, 'base64');
        const fileKey = `edited/${ctx.user.id}/${nanoid()}.png`;
        
        const { url } = await storagePut(fileKey, buffer, 'image/png');
        
        // 创建资产记录
        await createAsset({
          userId: ctx.user.id,
          nodeId,
          type: "image",
          url: url || '',
          fileKey,
          metadata: { 
            prompt, 
            redrawMode,
            referenceCount: referenceImages.length,
            editType: "advanced_redraw"
          },
        });
        
        return {
          success: true,
          imageUrl: url,
        };
      }),

    // Recognize image content for image-to-image transformation
    recognizeImageContent: protectedProcedure
      .input(z.object({
        imageUrl: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { imageUrl } = input;
        
        console.log('[recognizeImageContent] 收到 URL 类型:', imageUrl.substring(0, 100));
        
        // Convert image URL to base64
        const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string } | null> => {
          try {
            // 处理 data: URL (base64)
            if (url.startsWith('data:')) {
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                console.log('[recognizeImageContent] 解析 data URL 成功');
                return { base64: match[2], mimeType: match[1] };
              }
            }
            
            // 处理 blob: URL - 服务器端无法处理
            if (url.startsWith('blob:')) {
              console.error('[recognizeImageContent] 不支持 blob: URL，请使用 data: URL');
              return null;
            }
            
            // 处理普通 HTTP/HTTPS URL
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              console.error('[recognizeImageContent] 不支持的 URL 协议:', url.substring(0, 50));
              return null;
            }
            
            console.log('[recognizeImageContent] 正在 fetch URL:', url.substring(0, 100));
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            const contentType = response.headers.get('content-type') || 'image/png';
            return { base64, mimeType: contentType };
          } catch (error) {
            console.error('[recognizeImageContent] fetch 失败:', error);
            return null;
          }
        };
        
        const imageData = await fetchImageAsBase64(imageUrl);
        if (!imageData) {
          throw new Error("Failed to load image. 请确保图片已上传或使用有效的图片URL。");
        }
        
        // Use Gemini to recognize image content
        const { geminiGenerateContent } = await import("./_core/gemini");
        
        const result = await geminiGenerateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                { text: `请用中文简洁地描述这张图片的主要内容，包括：
1. 主体（人物/物体/场景）
2. 外观特征（服装/颜色/姿态）
3. 背景环境
4. 光线氛围

描述要客观简洁，控制在80字以内，不要使用主观评价词。` },
                {
                  inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.base64,
                  },
                },
              ],
            },
          ],
          apiKey: ctx.user?.apiKey,
        });
        
        const description = result.text || "图片识别完成";
        
        return {
          description,
        };
      }),

    // Analyze image content using AI
    analyzeImage: protectedProcedure
      .input(z.object({
        imageUrl: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { imageUrl } = input;
        
        // Convert image URL to base64
        const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string } | null> => {
          try {
            if (url.startsWith('data:')) {
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                return { base64: match[2], mimeType: match[1] };
              }
            }
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            const base64 = Buffer.from(buffer).toString('base64');
            const contentType = response.headers.get('content-type') || 'image/png';
            return { base64, mimeType: contentType };
          } catch (error) {
            console.error('Failed to fetch image:', error);
            return null;
          }
        };
        
        const imageData = await fetchImageAsBase64(imageUrl);
        if (!imageData) {
          throw new Error("Failed to load image");
        }
        
        // Use Gemini to analyze the image
        const { geminiGenerateContent } = await import("./_core/gemini");
        
        const result = await geminiGenerateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                { text: "请用中文详细描述这张图片的内容，包括：人物特征、服装、场景、光线、氛围等。描述要简洁但信息丰富，控制在100字以内。" },
                {
                  inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.base64,
                  },
                },
              ],
            },
          ],
          apiKey: ctx.user?.apiKey,
        });
        
        const description = result.text || "图片分析完成";
        
        return {
          description,
        };
      }),
  }),

  // Generation tasks (legacy, kept for compatibility)
  generation: router({
    create: protectedProcedure
      .input(z.object({
        projectId: z.number().optional(),
        nodeId: z.string().optional(),
        taskType: z.enum(["text2img", "img2img", "img2video", "upscale", "edit"]),
        inputData: z.any(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (input.projectId) {
          const project = await getProjectById(input.projectId);
          if (!project || project.userId !== ctx.user.id) {
            throw new Error("Project not found");
          }
        }
        return createGenerationTask({
          userId: ctx.user.id,
          ...input,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
        outputData: z.any().optional(),
        errorMessage: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return updateGenerationTask(id, data);
      }),
  }),

  // Workflow templates
  template: router({
    list: publicProcedure.query(async () => {
      return getWorkflowTemplates();
    }),
  }),

  // Custom styles
  style: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserCustomStyles(ctx.user.id);
    }),

    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        description: z.string().optional(),
        referenceImage: z.string(), // base64 image
        stylePrompt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { name, description, referenceImage, stylePrompt } = input;
        
        // Upload image to S3
        const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const fileKey = `styles/${ctx.user.id}/${nanoid()}.png`;
        
        const { url } = await storagePut(fileKey, buffer, 'image/png');
        
        return createCustomStyle({
          userId: ctx.user.id,
          name,
          description,
          referenceImageUrl: url,
          referenceImageKey: fileKey,
          stylePrompt,
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // TODO: verify ownership before delete
        await deleteCustomStyle(input.id);
        return { success: true };
      }),

    incrementUsage: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await incrementStyleUsage(input.id);
        return { success: true };
      }),
  }),

  // Prompt Library
  promptLibrary: router({
    // Get all groups with their prompts
    getAll: protectedProcedure.query(async ({ ctx }) => {
      const groups = await getUserPromptGroups(ctx.user.id);
      const prompts = await getUserPrompts(ctx.user.id);
      
      // Organize prompts by group
      const groupsWithPrompts = groups.map(group => ({
        ...group,
        prompts: prompts.filter(p => p.groupId === group.id)
      }));
      
      return groupsWithPrompts;
    }),

    // Create a new group
    createGroup: protectedProcedure
      .input(z.object({ 
        name: z.string(),
        description: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const groups = await getUserPromptGroups(ctx.user.id);
        const maxOrder = groups.reduce((max, g) => Math.max(max, g.sortOrder), 0);
        
        return createPromptGroup({
          userId: ctx.user.id,
          name: input.name,
          description: input.description,
          sortOrder: maxOrder + 1
        });
      }),

    // Update a group
    updateGroup: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().optional()
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return updatePromptGroup(id, data);
      }),

    // Delete a group
    deleteGroup: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deletePromptGroup(input.id);
        return { success: true };
      }),

    // Create a new prompt
    createPrompt: protectedProcedure
      .input(z.object({
        groupId: z.number(),
        content: z.string()
      }))
      .mutation(async ({ ctx, input }) => {
        const prompts = await getGroupPrompts(input.groupId);
        const maxOrder = prompts.reduce((max, p) => Math.max(max, p.sortOrder), 0);
        
        return createPrompt({
          userId: ctx.user.id,
          groupId: input.groupId,
          content: input.content,
          sortOrder: maxOrder + 1
        });
      }),

    // Update a prompt
    updatePrompt: protectedProcedure
      .input(z.object({
        id: z.number(),
        content: z.string().optional(),
        sortOrder: z.number().optional()
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return updatePrompt(id, data);
      }),

    // Delete a prompt
    deletePrompt: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deletePrompt(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
