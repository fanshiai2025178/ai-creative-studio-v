import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { invokeGeminiLLM } from "./_core/gemini";
import { generateImage } from "./_core/imageGeneration";
import { getDb } from "./db";
import { scripts, designs } from "../drizzle/schema";
import { eq } from "drizzle-orm";

// ⭐ 关键：从现有的角色设计路由中导入核心函数
import {
  analyzeScript,
  generateCharacterImage as generateCharacterImageFromRouter,
  PRESET_STYLES,
} from "./assistantCharacterDesignRouter";

// ============================================
// 意图类型定义
// ============================================
const INTENT_TYPES = {
  SCRIPT_ADAPT: 'script_adapt',           // 剧本改编
  CHARACTER_DESIGN: 'character_design',   // 角色设计
  SCENE_DESIGN: 'scene_design',           // 场景设计
  PROP_DESIGN: 'prop_design',             // 道具设计
  STORYBOARD: 'storyboard',               // 分镜生成
  IMAGE_GENERATE: 'image_generate',       // 通用生图
  IMAGE_ANALYZE: 'image_analyze',         // 图片分析
  GENERAL_CHAT: 'general_chat',           // 通用聊天
  CLARIFICATION: 'clarification',         // 需要澄清
} as const;

// ============================================
// 系统提示词
// ============================================
const INTENT_RECOGNITION_PROMPT = `你是一个AI创作助手的意图识别器。分析用户消息，判断用户想要做什么。

## 可识别的意图类型：
1. script_adapt - 剧本改编（关键词：改编、剧本、故事、小说转剧本）
2. character_design - 角色设计（关键词：角色、人物、主角、配角、设计角色形象）
3. scene_design - 场景设计（关键词：场景、背景、环境、地点）
4. prop_design - 道具设计（关键词：道具、物品、武器、装备）
5. storyboard - 分镜生成（关键词：分镜、镜头、故事板）
6. image_generate - 通用生图（关键词：生成图片、画一张、生成一个）
7. image_analyze - 图片分析（关键词：分析图片、看看这张图、描述图片）
8. general_chat - 通用聊天（闲聊、问答、不属于以上类型）
9. clarification - 需要澄清（信息不足，需要用户补充）

## 输出格式（JSON）：
{
  "intent": "意图类型",
  "confidence": 0.0-1.0,
  "entities": {
    "subject": "提取的主题/对象",
    "style": "风格要求（如有）",
    "details": "其他细节"
  },
  "missing_info": ["缺失的必要信息"],
  "clarification_question": "如果需要澄清，这里是要问用户的问题"
}`;

const ASSISTANT_SYSTEM_PROMPT = `你是一个专业的AI视觉创作助手，帮助用户进行漫剧/短剧创作。

## 你的能力：
1. 剧本改编 - 将小说/故事改编成短剧剧本
2. 角色设计 - 根据描述设计角色形象并生成图片
3. 场景设计 - 设计故事场景并生成图片
4. 道具设计 - 设计故事道具并生成图片
5. 分镜生成 - 将剧本转化为分镜脚本
6. 图片生成 - 根据描述生成任意图片
7. 创意建议 - 提供创作灵感和优化建议

## 回复规则：
- 使用中文回复
- 简洁专业，避免冗长
- 如果信息不足，主动询问
- 执行任务时先确认理解
- 生成内容后提供预览和修改选项`;

// ============================================
// 辅助函数
// ============================================

interface ChatResponse {
  type: 'text' | 'image' | 'action_required' | 'multi';
  content: string;
  images?: Array<{ url: string; description?: string }>;
  actions?: Array<{ 
    type: string; 
    label: string; 
    params?: Record<string, any>;
  }>;
  suggestions?: string[];
  data?: Record<string, any>;
}

// 生成欢迎消息
function generateWelcomeMessage(context: Record<string, any>): string {
  if (context.script) {
    return `你好！我是你的AI创作助手。\n\n我看到你正在处理《${context.script.title}》，我可以帮你：\n- 设计角色形象\n- 设计场景背景\n- 创建分镜脚本\n\n请选择你想做的事，或者直接告诉我你的需求。`;
  }
  
  return `你好！我是你的AI创作助手。\n\n我可以帮你完成以下创作任务：\n- 🎭 设计角色 - 输入剧本，AI帮你设计角色形象\n- 🏞️ 设计场景 - 根据剧情生成场景背景图\n- 🎬 创建分镜 - 将剧本转化为可视化分镜脚本\n- 📝 改编剧本 - 把故事改编成短剧剧本格式\n\n请选择你想做的事，或者直接告诉我你的需求。`;
}

// 生成建议
function generateSuggestions(context: Record<string, any>): string[] {
  if (context.script) {
    return ['设计角色形象', '设计场景背景', '创建分镜脚本'];
  }
  return ['设计角色', '设计场景', '创建分镜', '改编剧本'];
}

// 意图识别
async function recognizeIntent(
  message: string, 
  history: Array<{ role: string; content: string }>,
  context: Record<string, any>
): Promise<{
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  missing_info: string[];
  clarification_question?: string;
}> {
  try {
    const response = await invokeGeminiLLM({
      messages: [
        { role: 'system', content: INTENT_RECOGNITION_PROMPT },
        { role: 'user', content: `用户消息：${message}\n\n上下文：${JSON.stringify(context)}` },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'intent_recognition',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              intent: { type: 'string' },
              confidence: { type: 'number' },
              entities: { 
                type: 'object',
                properties: {
                  subject: { type: 'string' },
                  style: { type: 'string' },
                  details: { type: 'string' },
                },
                required: [],
                additionalProperties: true,
              },
              missing_info: { type: 'array', items: { type: 'string' } },
              clarification_question: { type: 'string' },
            },
            required: ['intent', 'confidence', 'entities', 'missing_info'],
            additionalProperties: false,
          },
        },
      },
    });
    
    const content = response.choices[0]?.message?.content;
    if (content && typeof content === 'string') {
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('[Intent Recognition] Error:', error);
  }
  
  return {
    intent: INTENT_TYPES.GENERAL_CHAT,
    confidence: 0.5,
    entities: {},
    missing_info: [],
  };
}

// 处理角色设计
async function handleCharacterDesign(
  userId: number,
  message: string,
  intent: any,
  context: Record<string, any>
): Promise<ChatResponse> {
  // 如果有剧本内容，直接分析
  if (context.script?.content || message.length > 100) {
    const scriptContent = context.script?.content || message;
    
    try {
      const analysis = await analyzeScript(scriptContent);
      
      return {
        type: 'action_required',
        content: `我从剧本中识别出 ${analysis.characters.length} 个角色：\n\n${analysis.characters.map((c, i) => 
          `${i + 1}. **${c.name}** - ${c.role}，${c.age || '年龄未知'}，${c.personality || '性格待定'}`
        ).join('\n')}\n\n请选择风格来生成角色形象：`,
        actions: PRESET_STYLES.slice(0, 6).map(style => ({
          type: 'select_style',
          label: style.name,
          params: { styleId: style.id, characters: analysis.characters },
        })),
        data: { characters: analysis.characters, summary: analysis.summary },
      };
    } catch (error) {
      console.error('[Character Design] Analysis error:', error);
      return {
        type: 'text',
        content: '分析剧本时出错，请重试或提供更详细的角色描述。',
      };
    }
  }
  
  // 没有剧本，询问用户
  return {
    type: 'text',
    content: '请提供剧本内容，或直接描述你想设计的角色。\n\n你可以：\n1. 粘贴剧本文字\n2. 描述角色特征（如：25岁男性，冷峻帅气，穿黑色风衣）',
    suggestions: ['粘贴剧本', '描述角色'],
  };
}

// 处理场景设计
async function handleSceneDesign(
  userId: number,
  message: string,
  intent: any,
  context: Record<string, any>
): Promise<ChatResponse> {
  const { entities } = intent;
  
  // 生成场景设计提示词
  const designPrompt = await generateSceneDesignPrompt(message, entities, context);
  
  return {
    type: 'action_required',
    content: `好的，我来帮你设计场景：**${entities.subject || '场景'}**\n\n**场景设计方案：**\n${designPrompt.description}\n\n确认生成图片吗？`,
    actions: [
      { type: 'generate_scene_image', label: '✨ 生成场景', params: { prompt: designPrompt.prompt } },
      { type: 'edit_prompt', label: '✏️ 修改', params: { prompt: designPrompt.prompt } },
    ],
    data: { designPrompt },
  };
}

// 处理道具设计
async function handlePropDesign(
  userId: number,
  message: string,
  intent: any,
  context: Record<string, any>
): Promise<ChatResponse> {
  const { entities } = intent;
  
  return {
    type: 'action_required',
    content: `好的，我来帮你设计道具：**${entities.subject || '道具'}**\n\n请确认或修改设计方案。`,
    actions: [
      { type: 'generate_prop_image', label: '✨ 生成道具', params: entities },
    ],
  };
}

// 处理剧本改编
async function handleScriptAdapt(
  userId: number,
  message: string,
  intent: any,
  context: Record<string, any>
): Promise<ChatResponse> {
  return {
    type: 'text',
    content: '请将你的故事内容粘贴给我，我会帮你改编成短剧剧本。\n\n改编时我会注意：\n- 保留核心情节\n- 适配短剧节奏\n- 增强戏剧冲突\n- 设计"打脸"爽点',
    suggestions: ['改编成5分钟一集', '改编成3分钟一集'],
  };
}

// 处理分镜生成
async function handleStoryboard(
  userId: number,
  message: string,
  intent: any,
  context: Record<string, any>
): Promise<ChatResponse> {
  if (!context.script) {
    return {
      type: 'text',
      content: '请先提供剧本内容，我才能帮你生成分镜。\n\n你可以：\n1. 粘贴剧本文字\n2. 先进行剧本改编',
    };
  }
  
  return {
    type: 'action_required',
    content: `我可以将《${context.script.title}》转化为分镜脚本。\n\n请选择分镜风格：`,
    actions: [
      { type: 'generate_storyboard', label: '📋 标准分镜', params: { style: 'standard' } },
      { type: 'generate_storyboard', label: '🎬 电影分镜', params: { style: 'cinematic' } },
    ],
  };
}

// 处理图片生成
async function handleImageGenerate(
  userId: number,
  message: string,
  intent: any,
  attachments?: Array<{ type: string; url: string }>
): Promise<ChatResponse> {
  const prompt = await optimizeImagePrompt(message);
  
  return {
    type: 'action_required',
    content: `**优化后的提示词：**\n\`\`\`\n${prompt}\n\`\`\``,
    actions: [
      { type: 'generate_image', label: '✨ 生成图片', params: { prompt } },
    ],
  };
}

// 处理图片分析
async function handleImageAnalyze(
  message: string,
  attachments?: Array<{ type: string; url: string }>
): Promise<ChatResponse> {
  if (!attachments || attachments.length === 0) {
    return {
      type: 'text',
      content: '请上传一张图片，我来帮你分析。',
    };
  }
  
  return {
    type: 'text',
    content: '图片分析功能开发中...',
  };
}

// 处理通用聊天
async function handleGeneralChat(
  message: string,
  history: Array<{ role: string; content: string }>,
  context: Record<string, any>
): Promise<ChatResponse> {
  const response = await invokeGeminiLLM({
    messages: [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
      ...history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
      { role: 'user', content: message },
    ],
  });
  
  const content = response.choices[0]?.message?.content;
  
  return {
    type: 'text',
    content: typeof content === 'string' ? content : '抱歉，我暂时无法回答。',
  };
}

// 生成场景设计提示词
async function generateSceneDesignPrompt(
  message: string,
  entities: Record<string, any>,
  context: Record<string, any>
): Promise<{ prompt: string; description: string }> {
  return {
    prompt: `${message}, detailed environment, cinematic lighting, high quality`,
    description: `场景：${entities.subject || message}`,
  };
}

// 优化图片提示词
async function optimizeImagePrompt(message: string): Promise<string> {
  const response = await invokeGeminiLLM({
    messages: [
      { 
        role: 'system', 
        content: '将用户描述优化为专业的英文AI绘图提示词。添加画质、光影、风格关键词。只返回英文提示词，不要解释。' 
      },
      { role: 'user', content: message },
    ],
  });
  
  const content = response.choices[0]?.message?.content;
  return typeof content === 'string' ? content : message;
}

// 简化版角色图片生成
async function generateCharacterImageSimple(userId: number, params: Record<string, any>, apiKey?: string) {
  const result = await generateImage({
    prompt: params.prompt,
    aspectRatio: '3:4',
    apiKey,
  });
  
  // 优先使用 base64
  let imageUrl = result.url || "";
  if (result.base64 && result.mimeType) {
    imageUrl = `data:${result.mimeType};base64,${result.base64}`;
  }
  
  return {
    success: true,
    imageUrl,
  };
}

// 生成场景图片
async function generateSceneImage(userId: number, params: Record<string, any>, apiKey?: string) {
  const result = await generateImage({
    prompt: params.prompt,
    aspectRatio: '16:9',
    apiKey,
  });
  
  // 优先使用 base64
  let imageUrl = result.url || "";
  if (result.base64 && result.mimeType) {
    imageUrl = `data:${result.mimeType};base64,${result.base64}`;
  }
  
  return {
    success: true,
    imageUrl,
  };
}

// 生成道具图片
async function generatePropImage(userId: number, params: Record<string, any>, apiKey?: string) {
  const result = await generateImage({
    prompt: params.prompt,
    aspectRatio: '1:1',
    apiKey,
  });
  
  // 优先使用 base64
  let imageUrl = result.url || "";
  if (result.base64 && result.mimeType) {
    imageUrl = `data:${result.mimeType};base64,${result.base64}`;
  }
  
  return {
    success: true,
    imageUrl,
  };
}

// 重新生成图片
async function regenerateImage(userId: number, params: Record<string, any>, apiKey?: string) {
  const result = await generateImage({
    prompt: params.prompt,
    originalImages: params.referenceImage ? [{ url: params.referenceImage, mimeType: 'image/png' }] : undefined,
    apiKey,
  });
  
  // 优先使用 base64
  let imageUrl = result.url || "";
  if (result.base64 && result.mimeType) {
    imageUrl = `data:${result.mimeType};base64,${result.base64}`;
  }
  
  return {
    success: true,
    imageUrl,
  };
}

// 获取脚本
async function getScriptById(scriptId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const results = await db.select()
    .from(scripts)
    .where(eq(scripts.id, scriptId));
  return results[0] || null;
}

// 获取设计数据
async function getDesignByScriptId(scriptId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const results = await db.select()
    .from(designs)
    .where(eq(designs.scriptId, scriptId));
  return results[0] || null;
}

// ============================================
// 路由定义
// ============================================
export const assistantCreativeRouter = router({
  
  // 开始会话
  startSession: protectedProcedure
    .input(z.object({
      projectId: z.number().optional(),
      scriptId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 获取项目上下文
      let context: Record<string, any> = {};
      
      if (input.scriptId) {
        const script = await getScriptById(input.scriptId);
        if (script) {
          context.script = {
            id: script.id,
            title: script.title,
            content: script.adaptedStory || script.originalContent,
          };
          
          // 获取已有的设计
          const design = await getDesignByScriptId(input.scriptId);
          if (design) {
            context.existingDesigns = {
              characters: (design.characters as any[])?.map(c => ({ id: c.id, name: c.name, hasImage: !!c.imageUrl })) || [],
              scenes: (design.scenes as any[])?.map(s => ({ id: s.id, name: s.name, hasImage: !!s.imageUrl })) || [],
              props: (design.props as any[])?.map(p => ({ id: p.id, name: p.name, hasImage: !!p.imageUrl })) || [],
            };
          }
        }
      }
      
      return {
        sessionId: `session_${Date.now()}_${ctx.user.id}`,
        context,
        welcomeMessage: generateWelcomeMessage(context),
      };
    }),

  // 发送消息（核心对话接口）
  chat: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      message: z.string(),
      attachments: z.array(z.object({
        type: z.enum(['image', 'file']),
        url: z.string(),
        name: z.string().optional(),
      })).optional(),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })).optional(),
      context: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { message, attachments, history = [], context = {} } = input;
      
      // 第一步：意图识别
      const intentResult = await recognizeIntent(message, history, context);
      
      // 第二步：根据意图执行相应操作
      let response: ChatResponse;
      
      switch (intentResult.intent) {
        case INTENT_TYPES.CHARACTER_DESIGN:
          response = await handleCharacterDesign(ctx.user.id, message, intentResult, context);
          break;
        case INTENT_TYPES.SCENE_DESIGN:
          response = await handleSceneDesign(ctx.user.id, message, intentResult, context);
          break;
        case INTENT_TYPES.PROP_DESIGN:
          response = await handlePropDesign(ctx.user.id, message, intentResult, context);
          break;
        case INTENT_TYPES.SCRIPT_ADAPT:
          response = await handleScriptAdapt(ctx.user.id, message, intentResult, context);
          break;
        case INTENT_TYPES.STORYBOARD:
          response = await handleStoryboard(ctx.user.id, message, intentResult, context);
          break;
        case INTENT_TYPES.IMAGE_GENERATE:
          response = await handleImageGenerate(ctx.user.id, message, intentResult, attachments);
          break;
        case INTENT_TYPES.IMAGE_ANALYZE:
          response = await handleImageAnalyze(message, attachments);
          break;
        case INTENT_TYPES.CLARIFICATION:
          response = {
            type: 'text',
            content: intentResult.clarification_question || '请提供更多信息，我可以更好地帮助你。',
            suggestions: generateSuggestions(context),
          };
          break;
        default:
          response = await handleGeneralChat(message, history, context);
      }
      
      return {
        ...response,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
      };
    }),

  // 执行特定动作（用于用户点击按钮触发）
  executeAction: protectedProcedure
    .input(z.object({
      action: z.enum([
        'generate_character_image',
        'generate_scene_image', 
        'generate_prop_image',
        'generate_storyboard',
        'generate_image',
        'edit_prompt',
        'set_duration',
        'generate_all_scenes',
        'regenerate',
        'load_to_canvas',
        'save_to_library',
      ]),
      params: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const { action, params } = input;
      
      switch (action) {
        case 'generate_character_image':
          return await generateCharacterImageSimple(ctx.user.id, params, ctx.user?.apiKey);
        case 'generate_scene_image':
          return await generateSceneImage(ctx.user.id, params, ctx.user?.apiKey);
        case 'generate_prop_image':
          return await generatePropImage(ctx.user.id, params, ctx.user?.apiKey);
        case 'generate_storyboard':
          return { success: true, message: '分镜生成功能待实现' };
        case 'generate_image': {
          const imgResult = await generateImage({ prompt: params.prompt as string, apiKey: ctx.user?.apiKey });
          let imgUrl = imgResult.url || "";
          if (imgResult.base64 && imgResult.mimeType) {
            imgUrl = `data:${imgResult.mimeType};base64,${imgResult.base64}`;
          }
          return { success: true, imageUrl: imgUrl };
        }
        case 'edit_prompt':
          return { success: true, prompt: params.prompt, editable: true };
        case 'set_duration':
          return { success: true, duration: params.duration };
        case 'generate_all_scenes':
          return { success: true, message: '批量生成功能待实现' };
        case 'regenerate':
          return await regenerateImage(ctx.user.id, params, ctx.user?.apiKey);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    }),

  // 获取生成进度
  getProgress: protectedProcedure
    .input(z.object({
      taskId: z.string(),
    }))
    .query(async ({ input }) => {
      return {
        taskId: input.taskId,
        status: 'completed',
        progress: 100,
      };
    }),

  // 获取预设风格列表
  getStyles: protectedProcedure
    .query(async () => {
      return PRESET_STYLES.map(style => ({
        id: style.id,
        name: style.name,
        nameEn: style.nameEn,
        category: style.category,
        description: style.description,
      }));
    }),
});

export type AssistantCreativeRouter = typeof assistantCreativeRouter;
