/**
 * 分镜脚本V2 - 后端路由
 * 按照新的设计文档实现分镜脚本功能
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";

// 通用图片下载辅助函数，带重试和错误处理
async function fetchImageWithRetry(
  imageUrl: string,
  maxRetries: number = 3
): Promise<{ buffer: Buffer; mimeType: string }> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[fetchImage] Attempt ${attempt}/${maxRetries} for URL: ${imageUrl.substring(0, 100)}...`);
      
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,*/*',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const mimeType = contentType.split(';')[0];
      const buffer = Buffer.from(await response.arrayBuffer());
      
      if (buffer.length === 0) {
        throw new Error('下载的图片为空');
      }
      
      console.log(`[fetchImage] Success: ${buffer.length} bytes, type: ${mimeType}`);
      return { buffer, mimeType };
    } catch (error) {
      lastError = error as Error;
      console.error(`[fetchImage] Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw new Error(`下载图片失败（已重试 ${maxRetries} 次）: ${lastError?.message || '未知错误'}`);
}
import { scripts, designs } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  createStoryboardShot,
  createStoryboardShots,
  getStoryboardShotsByScriptId,
  getStoryboardShotById,
  updateStoryboardShot,
  deleteStoryboardShot,
  deleteStoryboardShotsByScriptId,
} from "./db";

// 分镜数据验证schema
const storyboardShotSchema = z.object({
  scriptId: z.number(),
  shotNumber: z.number(),
  sceneNumber: z.string().optional(),
  shotTitle: z.string().optional(),
  shotType: z.enum(['远景', '全景', '中景', '近景', '特写']).optional(), // 景别
  duration: z.number().optional(), // 时长（秒）
  transition: z.enum(['切入', '淡入', '淡出', '叠化', '划入', '划出']).optional(), // 转场
  sceneDescription: z.string().optional(), // 场景描述
  characters: z.string().optional(), // 角色
  action: z.string().optional(), // 动作
  dialogue: z.string().optional(), // 对白
  emotion: z.string().optional(), // 情绪
  generatedImage: z.string().optional(), // 生成的分镜图片
  characterRefs: z.any().optional(), // 角色参考图 [{url, name, tag}]
  sceneRefs: z.any().optional(), // 场景参考图
  propRefs: z.any().optional(), // 道具参考图
  aiPrompt: z.string().optional(), // AI优化后的提示词
  imageSize: z.enum(['16:9', '9:16', '1:1', '4:3', '3:4']).optional(), // 生图尺寸
  composition: z.enum(['居中构图', '三分法', '对角线构图', '框架构图', '引导线构图']).optional(), // 构图
  dynamicPrompt: z.string().optional(), // 动态提示词
});

// ============================================================================
// 场景分镜基础版数据结构（来自剧本改编）
// ============================================================================
interface SceneBasic {
  sceneId: number;           // 场景编号
  location: string;          // 地点/场景名
  characterActions: string;  // 角色动作
  dialogue: string;          // 对白
  duration: number;          // 时长（秒）
  composition: string;       // 画面描述（含景别）
  emotionalTone: string;     // 情绪氛围
}

// 转换为文档要求的格式
interface SceneStoryboard {
  sceneNumber: number;
  title: string;
  description: string;
  action: string;
  dialogue: string;
  emotion: string;
  duration: number;
}

// AI生成的分镜结果
interface GeneratedShot {
  shotId: number;
  sceneNumber: number;
  shotNumber: number;
  title: string;
  shotType: string;
  duration: number;
  transition: string;
  sceneDescription: string;
  characters: string;
  action: string;
  dialogue: string;
  emotion: string;
}

// ============================================================================
// 辅助函数
// ============================================================================

// 从剧本数据中提取所有场景
function extractScenesFromScript(scriptData: any): SceneStoryboard[] {
  const scenes: SceneStoryboard[] = [];
  let globalSceneNumber = 1;
  
  // 剧本数据结构：episodes[].scenes[]
  const episodes = scriptData.episodes || [];
  
  for (const episode of episodes) {
    const episodeScenes = episode.scenes || [];
    for (const scene of episodeScenes) {
      scenes.push({
        sceneNumber: globalSceneNumber++,
        title: scene.location || `场景${globalSceneNumber}`,
        description: scene.composition || '',
        action: scene.characterActions || '',
        dialogue: scene.dialogue || '',
        emotion: scene.emotionalTone || '',
        duration: scene.duration || 3,
      });
    }
  }
  
  return scenes;
}

// 验证和修复AI生成的分镜数据
function validateAndFixShots(shots: GeneratedShot[], scenes: SceneStoryboard[]): GeneratedShot[] {
  const validShotTypes = ['特写', '近景', '中景', '全景', '远景'];
  const validTransitions = ['切入', '淡入', '淡出', '叠化', '划入', '划出'];
  
  return shots.map((shot, index) => ({
    ...shot,
    // 确保shotId连续
    shotId: index + 1,
    // 确保景别有效
    shotType: validShotTypes.includes(shot.shotType) ? shot.shotType : '中景',
    // 确保时长在范围内（2-8秒）
    duration: Math.max(2, Math.min(8, shot.duration || 3)),
    // 确保转场有效
    transition: validTransitions.includes(shot.transition) ? shot.transition : '切入',
    // 确保字段不为null
    sceneDescription: shot.sceneDescription || '',
    characters: shot.characters || '',
    action: shot.action || '',
    dialogue: shot.dialogue || '',
    emotion: shot.emotion || '',
    title: shot.title || `镜头${index + 1}`,
  }));
}

// 映射景别
function mapShotType(type: string): string {
  const validShotTypes = ['特写', '近景', '中景', '全景', '远景'];
  if (validShotTypes.includes(type)) return type;
  if (type.includes('特写') || type === '超特写') return '特写';
  if (type.includes('近景') || type.includes('主观视角')) return '近景';
  if (type.includes('中景') || type.includes('双人')) return '中景';
  if (type.includes('全景')) return '全景';
  if (type.includes('远景')) return '远景';
  return '中景';
}

// 映射转场
function mapTransition(trans: string): string {
  const validTransitions = ['切入', '淡入', '淡出', '叠化', '划入', '划出'];
  if (validTransitions.includes(trans)) return trans;
  if (trans === '切' || trans === '硬切') return '切入';
  if (trans === '定格' || trans === '静止') return '切入';
  if (trans.includes('淡入')) return '淡入';
  if (trans.includes('淡出')) return '淡出';
  if (trans.includes('叠')) return '叠化';
  if (trans.includes('划')) return '划入';
  return '切入';
}

export const storyboardShotRouter = router({
  // 获取剧本的所有分镜
  getByScriptId: protectedProcedure
    .input(z.object({ scriptId: z.number() }))
    .query(async ({ input }) => {
      return getStoryboardShotsByScriptId(input.scriptId);
    }),

  // 获取单个分镜
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getStoryboardShotById(input.id);
    }),

  // 创建单个分镜
  create: protectedProcedure
    .input(storyboardShotSchema)
    .mutation(async ({ ctx, input }) => {
      return createStoryboardShot({
        ...input,
        userId: ctx.user.id,
      });
    }),

  // 批量创建分镜
  createMany: protectedProcedure
    .input(z.object({
      scriptId: z.number(),
      shots: z.array(storyboardShotSchema.omit({ scriptId: true })),
    }))
    .mutation(async ({ ctx, input }) => {
      const shotsWithScriptId = input.shots.map((shot) => ({
        ...shot,
        scriptId: input.scriptId,
        userId: ctx.user.id,
      }));
      return createStoryboardShots(shotsWithScriptId);
    }),

  // 更新分镜
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      data: storyboardShotSchema.partial(),
    }))
    .mutation(async ({ input }) => {
      return updateStoryboardShot(input.id, input.data);
    }),

  // 删除单个分镜
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteStoryboardShot(input.id);
      return { success: true };
    }),

  // 删除剧本的所有分镜
  deleteByScriptId: protectedProcedure
    .input(z.object({ scriptId: z.number() }))
    .mutation(async ({ input }) => {
      await deleteStoryboardShotsByScriptId(input.scriptId);
      return { success: true };
    }),

  // ============================================================================
  // 生成分镜脚本（核心API - 1:1对应场景分镜，根据改编剧本延伸细化）
  // ============================================================================
  generate: protectedProcedure
    .input(z.object({
      scriptId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 1. 从数据库获取剧本数据
      const db = await getDb();
      if (!db) {
        throw new Error('数据库连接失败');
      }
      
      const [scriptData] = await db.select()
        .from(scripts)
        .where(and(
          eq(scripts.id, input.scriptId),
          eq(scripts.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!scriptData) {
        throw new Error('剧本不存在或无权访问');
      }
      
      // 2. 提取场景分镜基础版数据
      const scenes = extractScenesFromScript(scriptData);
      
      if (scenes.length === 0) {
        throw new Error('剧本中没有场景数据，请先完成剧本改编');
      }
      
      // 3. 获取改编剧本内容（用于延伸细化）
      const adaptedStory = (scriptData as any).adaptedStory || '';
      
      // 4. 先删除该剧本的旧分镜
      await deleteStoryboardShotsByScriptId(input.scriptId);
      
      // 5. 构建AI提示词 - 1:1对应，根据改编剧本延伸
      const systemPrompt = `你是一个专业的分镜脚本编剧，负责将场景分镜基础版转化为详细的分镜脚本。

【核心规则】
1. 场景分镜与分镜脚本必须1:1对应，不拆分场景
2. 每个场景分镜生成一个分镜脚本
3. 根据改编剧本内容延伸细化每个分镜的细节

【你的任务】
1. 继承场景分镜的基础数据（编号、时长等）
2. 从改编剧本中提取对应场景的详细描述
3. 细化画面描述、角色外观、动作细节
4. 补充景别、转场等专业字段
5. 优化情绪氛围描述

【景别选项】
- 特写：面部细节、物体细节
- 近景：胸部以上
- 中景：腰部以上
- 全景：全身或小场景
- 远景：大场景环境

【转场选项】
- 切入：直接切换（最常用）
- 淡入：从黑渐显（用于开场或时间跳跃）
- 淡出：渐变为黑（用于结束或时间跳跃）
- 叠化：两画面重叠（用于回忆或平行叙事）
- 划入：画面从一侧滑入
- 划出：画面向一侧滑出

【输出格式】
必须输出JSON数组，每个元素包含以下字段：
{
  "shotId": number,          // 分镜编号，从1开始递增，与场景编号一致
  "sceneNumber": number,     // 场景编号，继承自输入
  "shotNumber": number,      // 镜头编号，因1:1对应所以始终为1
  "title": string,           // 场景标题，如"石头斋-白天"
  "shotType": string,        // 景别：特写/近景/中景/全景/远景
  "duration": number,        // 时长（秒），继承自场景分镜
  "transition": string,      // 转场：切入/淡入/淡出/叠化/划入/划出
  "sceneDescription": string,// 场景环境描述（细化后）
  "characters": string,      // 出场角色，逗号分隔
  "action": string,          // 动作描述（细化后）
  "dialogue": string,        // 对白
  "emotion": string          // 情绪氛围（细化后）
}`;

      const userPrompt = `请将以下场景分镜基础版转化为详细的分镜脚本。

【场景分镜基础版】（共${scenes.length}个场景）
${JSON.stringify(scenes, null, 2)}

【改编剧本内容】（用于延伸细化）
${adaptedStory || '无改编剧本内容，请根据场景分镜基础版直接细化'}

【要求】
1. 必须生成恰好${scenes.length}个分镜，与场景分镜1:1对应
2. 保持每个场景的时长与基础版一致
3. 从改编剧本中提取对应场景的详细内容进行延伸
4. 细化场景描述、角色、动作、情绪等字段
5. 从描述中提取或推荐合适的景别
6. 第一个分镜的转场设为"切入"，后续根据内容选择
7. shotId从1开始连续递增
8. shotNumber始终为1（因为1:1对应）

请直接输出JSON数组，不要有其他内容。`;

      // 6. 调用AI生成分镜
      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        apiKey: ctx.user?.apiKey,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "storyboard_shots",
            strict: true,
            schema: {
              type: "object",
              properties: {
                shots: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      shotId: { type: "integer" },
                      sceneNumber: { type: "integer" },
                      shotNumber: { type: "integer" },
                      title: { type: "string" },
                      shotType: { type: "string" },
                      duration: { type: "integer" },
                      transition: { type: "string" },
                      sceneDescription: { type: "string" },
                      characters: { type: "string" },
                      action: { type: "string" },
                      dialogue: { type: "string" },
                      emotion: { type: "string" },
                    },
                    required: ["shotId", "sceneNumber", "shotNumber", "title", "shotType", "duration", "transition", "sceneDescription", "characters", "action", "dialogue", "emotion"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["shots"],
              additionalProperties: false,
            },
          },
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content || typeof content !== 'string') {
        throw new Error("AI生成失败：返回内容为空");
      }

      let result;
      try {
        result = JSON.parse(content);
      } catch (e) {
        throw new Error("AI返回的JSON格式错误");
      }

      if (!result.shots || !Array.isArray(result.shots)) {
        throw new Error("AI返回的数据格式错误：缺少shots数组");
      }
      
      // 7. 验证数量是否一致
      if (result.shots.length !== scenes.length) {
        console.warn(`AI生成的分镜数量(${result.shots.length})与场景数量(${scenes.length})不一致，进行修复`);
        // 如果数量不一致，根据场景分镜基础版生成默认分镜
        result.shots = scenes.map((scene, index) => ({
          shotId: index + 1,
          sceneNumber: scene.sceneNumber,
          shotNumber: 1,
          title: scene.title,
          shotType: '中景',
          duration: scene.duration,
          transition: index === 0 ? '切入' : '切入',
          sceneDescription: scene.description,
          characters: '',
          action: scene.action,
          dialogue: scene.dialogue,
          emotion: scene.emotion,
        }));
      }

      // 6. 验证和修复数据
      const validatedShots = validateAndFixShots(result.shots, scenes);

      // 7. 保存到数据库
      const shotsToCreate = validatedShots.map((shot) => ({
        userId: ctx.user.id,
        scriptId: input.scriptId,
        shotNumber: shot.shotId, // 使用全局shotId作为shotNumber
        title: shot.title || null,
        shotType: mapShotType(shot.shotType) as any,
        duration: shot.duration || 3,
        transition: mapTransition(shot.transition) as any,
        sceneDescription: shot.sceneDescription || null,
        characters: shot.characters || null,
        action: shot.action || null,
        dialogue: shot.dialogue || null,
        emotion: shot.emotion || null,
        sortOrder: shot.shotId,
      }));

      const createdShots = await createStoryboardShots(shotsToCreate);

      // 8. 返回结果
      return {
        shots: createdShots,
        totalDuration: validatedShots.reduce((sum, s) => sum + s.duration, 0),
        shotCount: createdShots.length,
        sceneCount: scenes.length,
      };
    }),

  // ============================================================================
  // 动态图片提示词优化（第四阶段）
  // ============================================================================
  generateDynamicPrompt: protectedProcedure
    .input(z.object({
      shotId: z.number(),
      sceneDescription: z.string(),
      action: z.string().optional(),
      emotion: z.string().optional(),
      duration: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const systemPrompt = `你是一个专业的视频生成提示词专家。根据分镜脚本内容，生成适合图生视频的动态提示词。

【提示词要求】
1. 使用英文输出
2. 描述画面的动态变化
3. 包含镜头运动（推、拉、摇、移）
4. 描述角色动作的起始和结束状态
5. 描述环境的动态元素（风、光影变化等）

【输出格式】
直接输出提示词文本，不要任何解释或标记。`;

      const userPrompt = `请根据以下分镜信息生成视频动态提示词：

场景描述：${input.sceneDescription}
动作：${input.action || '无'}
情绪：${input.emotion || '无'}
时长：${input.duration || 3}秒

请生成适合图生视频的英文动态提示词。`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        apiKey: ctx.user?.apiKey,
      });

      const dynamicPrompt = response.choices[0]?.message?.content;
      if (!dynamicPrompt || typeof dynamicPrompt !== 'string') {
        throw new Error("动态提示词生成失败");
      }

      // 更新数据库
      await updateStoryboardShot(input.shotId, { dynamicPrompt });

      return { dynamicPrompt };
    }),

  // ============================================================================
  // 图片提示词优化API（完整版 - 融合改编剧本、形象设计、草图）
  // ============================================================================
  optimizeImagePrompt: protectedProcedure
    .input(z.object({
      scriptId: z.number(),
      shotId: z.number(),
      sketchDataUrl: z.string().optional(),
      sketchDescription: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new Error('数据库连接失败');
      }

      // 1. 获取剧本数据（改编剧本内容）
      const [scriptData] = await db.select()
        .from(scripts)
        .where(and(
          eq(scripts.id, input.scriptId),
          eq(scripts.userId, ctx.user.id)
        ))
        .limit(1);

      if (!scriptData) {
        throw new Error('剧本不存在或无权访问');
      }

      // 2. 获取形象设计数据（角色、场景信息）
      const [designData] = await db.select()
        .from(designs)
        .where(and(
          eq(designs.scriptId, input.scriptId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);

      // 3. 获取当前分镜数据
      const shotData = await getStoryboardShotById(input.shotId);
      if (!shotData) {
        throw new Error('分镜不存在');
      }

      // 4. 构建角色映射关系
      const characters = (designData?.characters as any[]) || [];
      const scenes = (designData?.scenes as any[]) || [];
      const props = (designData?.props as any[]) || [];

      // 角色名 -> 角色图#N 映射
      const characterMapping: Record<string, { index: number; features: string }> = {};
      characters.forEach((char, idx) => {
        const name = char.characterName || char.name;
        if (name) {
          // 提取角色外貌特征
          const features: string[] = [];
          if (char.visualDesign) {
            if (char.visualDesign.temperament) features.push(char.visualDesign.temperament);
            if (char.visualDesign.bodyType) features.push(char.visualDesign.bodyType);
            if (char.visualDesign.age) features.push(char.visualDesign.age);
          }
          if (char.clothingDesign?.description) features.push(char.clothingDesign.description);
          if (char.hairstyleDesign?.description) features.push(char.hairstyleDesign.description);
          
          characterMapping[name] = {
            index: idx + 1,
            features: features.join('，') || ''
          };
        }
      });

      // 场景名 -> 场景图#N 映射
      const sceneMapping: Record<string, { index: number; features: string }> = {};
      scenes.forEach((scene, idx) => {
        const name = scene.sceneName || scene.name;
        if (name) {
          const features: string[] = [];
          if (scene.atmosphere) features.push(scene.atmosphere);
          if (scene.timeSetting) features.push(scene.timeSetting);
          if (scene.lightingDesign?.mainLight) features.push(scene.lightingDesign.mainLight);
          
          sceneMapping[name] = {
            index: idx + 1,
            features: features.join('，') || ''
          };
        }
      });

      // 5. 构建AI提示词
      const { geminiGenerateContent } = await import("./_core/gemini");

      // 准备多模态输入内容
      const contentParts: any[] = [];

      // 如果有草图，先添加草图图片让AI识别
      if (input.sketchDataUrl && input.sketchDataUrl.startsWith('data:image')) {
        const base64Data = input.sketchDataUrl.split(',')[1];
        contentParts.push({
          inlineData: {
            mimeType: 'image/png',
            data: base64Data,
          },
        });
      }

      // 构建文本提示
      const systemPrompt = `你是一个专业的AI绘图提示词优化专家。

【核心任务】
建立用户语义（角色名、场景名）与图片索引（角色图#1、场景图#2）之间的映射关系，确保生图模型能够正确识别并应用参考图片。

具体要求：
1. 将画面内容中的角色名映射为参考图索引（如"叶青" → "[角色图#1]"）
2. 将场景名映射为参考图索引（如"办公室" → "[场景图#1]"）
3. 在[角色图#N]后面用括号补充该角色的外貌特征
4. 如果有草图，识别草图的构图信息（人物位置、画面布局）并融入提示词
5. 输出中文提示词

【输出格式】
输出一段完整的中文提示词，按以下结构组织：

景别 + [场景图#N]场景描述 + 光线氛围 + 构图位置 + [角色图#N]（外貌特征）+ 动作描述 + 表情/情绪

示例：
"近景，[场景图#1]现代办公室内，白天自然光从窗户照入，画面左侧[角色图#1]（内敛沉稳的长发女性，穿深灰色高领羊绒衫，侧分发丝略长，25岁左右）坐在电脑前打字，表情专注、眉头微蹙、略带疲惫，画面右侧[角色图#2]（阳光开朗的短发男性，穿蓝色休闲衬衫，28岁左右）站在门口，柔和的侧光照射，电影感画面"

【重要规则】
1. 必须使用[角色图#N]、[场景图#N]格式引用参考图，这是生图模型识别参考图的关键
2. 角色外貌特征紧跟在[角色图#N]后面的括号内
3. 如果有草图，必须描述人物在画面中的位置（如"画面左侧"、"画面右侧"、"画面中央"）
4. 输出中文提示词，不要输出英文
5. 只输出提示词内容，不要输出其他解释性文字`;

      const userPrompt = `请优化以下分镜的图片提示词：

【角色映射关系】
${Object.entries(characterMapping).map(([name, info]) => `- ${name} → [角色图#${info.index}]（${info.features || '无详细特征'}）`).join('\n') || '无角色数据'}

【场景映射关系】
${Object.entries(sceneMapping).map(([name, info]) => `- ${name} → [场景图#${info.index}]（${info.features || '无详细特征'}）`).join('\n') || '无场景数据'}

【分镜数据】
- 景别：${shotData.shotType || '中景'}
- 场景描述：${shotData.sceneDescription || '无'}
- 角色：${shotData.characters || '无'}
- 动作：${shotData.action || '无'}
- 情绪/表情：${shotData.emotion || '无'}
- 对白：${shotData.dialogue || '无'}

【改编剧本摘要】
${(scriptData as any).adaptedStory?.substring(0, 500) || '无改编剧本内容'}

${input.sketchDescription ? `【草图描述】\n${input.sketchDescription}` : ''}
${input.sketchDataUrl ? '\n【草图图片】\n请识别上面的草图图片，理解构图布局和人物位置。' : ''}

请生成优化后的中文图片提示词，确保使用[角色图#N]和[场景图#N]格式引用参考图。`;
      contentParts.push({ text: systemPrompt + '\n\n' + userPrompt });

      // 6. 调用Gemini生成优化提示词
      const result = await geminiGenerateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: contentParts,
          },
        ],
        apiKey: ctx.user?.apiKey,
      });

      const optimizedPrompt = result.text;
      if (!optimizedPrompt) {
        throw new Error('提示词优化失败');
      }

      // 7. 更新数据库
      await updateStoryboardShot(input.shotId, {
        aiPrompt: optimizedPrompt,
        sketchDataUrl: input.sketchDataUrl || null,
        sketchDescription: input.sketchDescription || null,
      });

      // 8. 返回结果
      return {
        optimizedPrompt,
        characterMapping: Object.fromEntries(
          Object.entries(characterMapping).map(([name, info]) => [name, `角色图#${info.index}`])
        ),
        sceneMapping: Object.fromEntries(
          Object.entries(sceneMapping).map(([name, info]) => [name, `场景图#${info.index}`])
        ),
      };
    }),

  // ============================================================================
  // JSON转译API - 准备图片生成数据
  // 将分镜数据和参考图转换为Nano Banana Pro可用的格式
  // ============================================================================
  prepareImageGeneration: protectedProcedure
    .input(z.object({
      shotId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      // 1. 获取分镜数据
      const shotData = await getStoryboardShotById(input.shotId);
      if (!shotData) {
        throw new Error('分镜不存在');
      }

      // 2. 获取剧本数据（用于获取scriptId）
      const db = await getDb();
      if (!db) {
        throw new Error('数据库连接失败');
      }

      // 3. 获取形象设计数据
      const [designData] = await db.select()
        .from(designs)
        .where(and(
          eq(designs.scriptId, shotData.scriptId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);

      // 4. 构建参考图列表（动态编号）
      // 只包含实际有图片的卡槽，按顺序编号为 Image 1, Image 2...
      const referenceImages: Array<{
        index: number;       // 动态编号 1, 2, 3...
        type: 'character' | 'scene' | 'prop' | 'sketch';
        originalSlot: number; // 原始卡槽编号 1-4
        url: string;
        mimeType: string;
      }> = [];

      let imageIndex = 1;

      // 从分镜数据中获取参考图（characterRefs, sceneRefs, propRefs）
      const characterRefs = (shotData.characterRefs as Array<{ id: number; name: string; imageUrl: string }>) || [];
      const sceneRefs = (shotData.sceneRefs as Array<{ id: number; name: string; imageUrl: string }>) || [];
      const propRefs = (shotData.propRefs as Array<{ id: number; name: string; imageUrl: string }>) || [];

      // 添加角色参考图
      for (let i = 0; i < characterRefs.length; i++) {
        const ref = characterRefs[i];
        if (ref && ref.imageUrl) {
          referenceImages.push({
            index: imageIndex++,
            type: 'character',
            originalSlot: i + 1,
            url: ref.imageUrl,
            mimeType: 'image/jpeg',
          });
        }
      }

      // 添加场景参考图
      for (let i = 0; i < sceneRefs.length; i++) {
        const ref = sceneRefs[i];
        if (ref && ref.imageUrl) {
          referenceImages.push({
            index: imageIndex++,
            type: 'scene',
            originalSlot: i + 1,
            url: ref.imageUrl,
            mimeType: 'image/jpeg',
          });
        }
      }

      // 添加道具参考图
      for (let i = 0; i < propRefs.length; i++) {
        const ref = propRefs[i];
        if (ref && ref.imageUrl) {
          referenceImages.push({
            index: imageIndex++,
            type: 'prop',
            originalSlot: i + 1,
            url: ref.imageUrl,
            mimeType: 'image/jpeg',
          });
        }
      }

      // 5. 处理草图（如果有，作为最后一张参考图）
      const sketchDataUrl = shotData.sketchDataUrl as string | null;
      let sketchImageIndex: number | null = null;
      if (sketchDataUrl && sketchDataUrl.startsWith('data:image')) {
        sketchImageIndex = imageIndex;
        referenceImages.push({
          index: imageIndex++,
          type: 'sketch',
          originalSlot: 0, // 草图没有卡槽编号
          url: sketchDataUrl,
          mimeType: 'image/png',
        });
      }

      // 6. 转换提示词中的引用
      // 将 [角色图#1]、[场景图#2] 等转换为 Image 1, Image 2...
      let prompt = shotData.aiPrompt || '';

      // 构建映射表：原始引用 -> 新编号
      const refMapping: Record<string, number> = {};
      for (const ref of referenceImages) {
        if (ref.type === 'character') {
          refMapping[`[角色图#${ref.originalSlot}]`] = ref.index;
          refMapping[`角色图#${ref.originalSlot}`] = ref.index;
        } else if (ref.type === 'scene') {
          refMapping[`[场景图#${ref.originalSlot}]`] = ref.index;
          refMapping[`场景图#${ref.originalSlot}`] = ref.index;
        } else if (ref.type === 'prop') {
          refMapping[`[道具图#${ref.originalSlot}]`] = ref.index;
          refMapping[`道具图#${ref.originalSlot}`] = ref.index;
        }
      }

      // 替换提示词中的引用
      for (const [oldRef, newIndex] of Object.entries(refMapping)) {
        prompt = prompt.replace(new RegExp(oldRef.replace(/[\[\]#]/g, '\\$&'), 'g'), `Image ${newIndex}`);
      }

      // 7. 如果有草图，在提示词末尾添加构图说明
      if (sketchImageIndex !== null) {
        const sketchDescription = shotData.sketchDescription as string | null;
        const sketchNote = sketchDescription 
          ? `\n\nComposition Reference: Follow the composition layout from Image ${sketchImageIndex} (sketch reference). ${sketchDescription}. Only use it for composition guidance, not style.`
          : `\n\nComposition Reference: Follow the composition layout from Image ${sketchImageIndex} (sketch reference). Only use it for composition guidance, not style.`;
        prompt += sketchNote;
      }

      // 8. 构建输出JSON
      const result = {
        shotId: input.shotId,
        prompt,
        referenceImages: referenceImages.map(ref => ({
          index: ref.index,
          type: ref.type,
          url: ref.url,
          mimeType: ref.mimeType,
        })),
        aspectRatio: shotData.imageSize || '16:9',
        imageSize: '2K' as const,
        totalReferenceCount: referenceImages.length,
        hasSketch: sketchImageIndex !== null,
        sketchImageIndex,
        // 映射关系（供调试）
        mapping: refMapping,
      };

      return result;
    }),

  // ============================================================================
  // 生图API - 生成分镜图片
  // 优先使用prepareImageGeneration数据，异常时自己走全流程补全
  // ============================================================================
  generateStoryboardImage: protectedProcedure
    .input(z.object({
      shotId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { generateImage } = await import("./_core/imageGeneration");
      const { storagePut } = await import("./storage");

      // 1. 尝试获取prepareImageGeneration的数据
      let preparedData: {
        prompt: string;
        referenceImages: Array<{ index: number; type: string; url: string; mimeType: string }>;
        aspectRatio: string;
        imageSize: string;
        hasSketch: boolean;
      } | null = null;

      try {
        // 获取分镜数据
        const shotData = await getStoryboardShotById(input.shotId);
        if (!shotData) {
          throw new Error('分镜不存在');
        }

        // 获取数据库连接
        const db = await getDb();
        if (!db) {
          throw new Error('数据库连接失败');
        }

        // 构建参考图列表
        const referenceImages: Array<{
          index: number;
          type: string;
          originalSlot: number;
          url: string;
          mimeType: string;
        }> = [];

        let imageIndex = 1;

        const characterRefs = (shotData.characterRefs as Array<{ id: number; name: string; imageUrl: string }>) || [];
        const sceneRefs = (shotData.sceneRefs as Array<{ id: number; name: string; imageUrl: string }>) || [];
        const propRefs = (shotData.propRefs as Array<{ id: number; name: string; imageUrl: string }>) || [];

        // 添加角色参考图
        for (let i = 0; i < characterRefs.length; i++) {
          const ref = characterRefs[i];
          if (ref && ref.imageUrl) {
            referenceImages.push({
              index: imageIndex++,
              type: 'character',
              originalSlot: i + 1,
              url: ref.imageUrl,
              mimeType: 'image/jpeg',
            });
          }
        }

        // 添加场景参考图
        for (let i = 0; i < sceneRefs.length; i++) {
          const ref = sceneRefs[i];
          if (ref && ref.imageUrl) {
            referenceImages.push({
              index: imageIndex++,
              type: 'scene',
              originalSlot: i + 1,
              url: ref.imageUrl,
              mimeType: 'image/jpeg',
            });
          }
        }

        // 添加道具参考图
        for (let i = 0; i < propRefs.length; i++) {
          const ref = propRefs[i];
          if (ref && ref.imageUrl) {
            referenceImages.push({
              index: imageIndex++,
              type: 'prop',
              originalSlot: i + 1,
              url: ref.imageUrl,
              mimeType: 'image/jpeg',
            });
          }
        }

        // 处理草图
        const sketchDataUrl = shotData.sketchDataUrl as string | null;
        let sketchImageIndex: number | null = null;
        if (sketchDataUrl && sketchDataUrl.startsWith('data:image')) {
          sketchImageIndex = imageIndex;
          referenceImages.push({
            index: imageIndex++,
            type: 'sketch',
            originalSlot: 0,
            url: sketchDataUrl,
            mimeType: 'image/png',
          });
        }

        // 转换提示词
        let prompt = shotData.aiPrompt || '';
        if (!prompt) {
          throw new Error('请先生成AI提示词');
        }

        // 构建映射表
        const refMapping: Record<string, number> = {};
        for (const ref of referenceImages) {
          if (ref.type === 'character') {
            refMapping[`[角色图#${ref.originalSlot}]`] = ref.index;
            refMapping[`角色图#${ref.originalSlot}`] = ref.index;
          } else if (ref.type === 'scene') {
            refMapping[`[场景图#${ref.originalSlot}]`] = ref.index;
            refMapping[`场景图#${ref.originalSlot}`] = ref.index;
          } else if (ref.type === 'prop') {
            refMapping[`[道具图#${ref.originalSlot}]`] = ref.index;
            refMapping[`道具图#${ref.originalSlot}`] = ref.index;
          }
        }

        // 替换提示词中的引用
        for (const [oldRef, newIndex] of Object.entries(refMapping)) {
          prompt = prompt.replace(new RegExp(oldRef.replace(/[\[\]#]/g, '\\$&'), 'g'), `Image ${newIndex}`);
        }

        // 添加草图构图说明
        if (sketchImageIndex !== null) {
          const sketchDescription = shotData.sketchDescription as string | null;
          const sketchNote = sketchDescription 
            ? `\n\nComposition Reference: Follow the composition layout from Image ${sketchImageIndex} (sketch reference). ${sketchDescription}. Only use it for composition guidance, not style.`
            : `\n\nComposition Reference: Follow the composition layout from Image ${sketchImageIndex} (sketch reference). Only use it for composition guidance, not style.`;
          prompt += sketchNote;
        }

        preparedData = {
          prompt,
          referenceImages: referenceImages.map(ref => ({
            index: ref.index,
            type: ref.type,
            url: ref.url,
            mimeType: ref.mimeType,
          })),
          aspectRatio: shotData.imageSize || '16:9',
          imageSize: '2K',
          hasSketch: sketchImageIndex !== null,
        };
      } catch (error) {
        console.error('准备图片生成数据失败:', error);
        throw error;
      }

      // 2. 使用准备好的数据调用Nano Banana Pro生成图片
      if (!preparedData || !preparedData.prompt) {
        throw new Error('图片生成数据准备失败');
      }

      // 构建参考图片数组（按index顺序）
      const sortedRefs = [...preparedData.referenceImages].sort((a, b) => a.index - b.index);
      const originalImages: Array<{ url?: string; b64Json?: string; mimeType: string }> = [];

      for (const ref of sortedRefs) {
        if (ref.url.startsWith('data:')) {
          // base64格式
          const base64Data = ref.url.split(',')[1];
          originalImages.push({
            b64Json: base64Data,
            mimeType: ref.mimeType,
          });
        } else {
          // URL格式
          originalImages.push({
            url: ref.url,
            mimeType: ref.mimeType,
          });
        }
      }

      // 3. 调用图片生成API
      const result = await generateImage({
        prompt: preparedData.prompt,
        originalImages: originalImages.length > 0 ? originalImages : undefined,
        model: 'gemini-3-pro-image-preview',
        aspectRatio: preparedData.aspectRatio as any,
        imageSize: '2K',
        apiKey: ctx.user?.apiKey,
      });

      // 固定使用 OSS URL（base64 数据太大，数据库无法存储）
      let imageUrl = '';
      let imageKey = '';
      if (result.url) {
        // 使用 OSS URL
        imageUrl = result.url;
        imageKey = `storyboard/${input.shotId}-${Date.now()}.png`;
        console.log(`[StoryboardShot] 使用 OSS URL: ${imageUrl}`);
      } else {
        throw new Error('图片生成失败：未返回 OSS URL');
      }

      // 5. 更新数据库
      await updateStoryboardShot(input.shotId, {
        generatedImageUrl: imageUrl,
        generatedImageKey: imageKey,
      });

      // 6. 返回结果
      return {
        success: true,
        imageUrl,
        referenceCount: preparedData.referenceImages.length,
        hasSketch: preparedData.hasSketch,
      };
    }),

  // ============================================================================
  // 图生视频提示词优化API V2
  // 多模态图片识别 + 分镜数据融合 + 专业视频提示词生成
  // ============================================================================
  generateDynamicPromptV2: protectedProcedure
    .input(z.object({
      shotId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { geminiGenerateContent } = await import("./_core/gemini");

      // 1. 获取分镜数据
      const shotData = await getStoryboardShotById(input.shotId);
      if (!shotData) {
        throw new Error('分镜不存在');
      }

      // 检查是否有生成的图片
      const generatedImageUrl = shotData.generatedImageUrl as string | null;
      if (!generatedImageUrl) {
        throw new Error('请先生成分镜图片');
      }

      // 2. 获取角色参考图的外貌特征（从形象设计中获取）
      const db = await getDb();
      if (!db) {
        throw new Error('数据库连接失败');
      }

      // 获取剧本和形象设计数据
      const [scriptData] = await db.select()
        .from(scripts)
        .where(eq(scripts.id, shotData.scriptId))
        .limit(1);

      const [designData] = await db.select()
        .from(designs)
        .where(and(
          eq(designs.scriptId, shotData.scriptId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);

      // 3. 提取角色外貌特征
      let characterDescriptions = '';
      if (designData?.characters) {
        const characters = designData.characters as Array<{
          name: string;
          description?: string;
          appearance?: string;
          personality?: string;
        }>;
        characterDescriptions = characters.map(c => {
          const desc = c.appearance || c.description || '';
          return `${c.name}: ${desc}`;
        }).join('\n');
      }

      // 4. 下载生成的图片并转换为base64
      let imageBase64: string;
      let mimeType = 'image/jpeg';

      if (generatedImageUrl.startsWith('data:')) {
        const match = generatedImageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          imageBase64 = match[2];
        } else {
          throw new Error('无效的base64图片格式');
        }
      } else {
        // 使用带重试的下载函数
        const { buffer, mimeType: fetchedMimeType } = await fetchImageWithRetry(generatedImageUrl);
        mimeType = fetchedMimeType;
        imageBase64 = buffer.toString('base64');
      }

      // 5. 多模态图片分析 - 识别画面内容
      const imageAnalysisResult = await geminiGenerateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              {
                text: `请详细分析这张图片，为图生视频提供信息。请用JSON格式输出：

{
  "characters": {
    "count": "人物数量",
    "positions": "人物在画面中的位置（左/中/右/前景/背景）",
    "poses": "人物姿态描述（站立/坐着/走动/跑动等）",
    "expressions": "表情描述",
    "gazeDirection": "视线方向",
    "bodyLanguage": "肢体语言描述"
  },
  "scene": {
    "location": "场景类型（室内/室外/街道等）",
    "lighting": "光线方向和类型（顾光/逆光/侧光/柔光等）",
    "atmosphere": "氛围（温馨/紧张/神秘/欢快等）",
    "dynamicElements": "可动态化的元素（风/烟/水/火/叶子等）"
  },
  "composition": {
    "shotType": "景别（特写/近景/中景/全景/远景）",
    "angle": "拍摄角度（平视/仰视/俘视）",
    "depth": "景深描述（浅景深/深景深）",
    "focusPoint": "视觉焦点位置"
  }
}

只输出JSON，不要其他内容。`,
              },
            ],
          },
        ],
        apiKey: ctx.user?.apiKey,
      });

      // 解析图片分析结果
      let imageAnalysis: {
        characters: {
          count: string;
          positions: string;
          poses: string;
          expressions: string;
          gazeDirection: string;
          bodyLanguage: string;
        };
        scene: {
          location: string;
          lighting: string;
          atmosphere: string;
          dynamicElements: string;
        };
        composition: {
          shotType: string;
          angle: string;
          depth: string;
          focusPoint: string;
        };
      };

      try {
        const cleanedJson = imageAnalysisResult.text
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();
        imageAnalysis = JSON.parse(cleanedJson);
      } catch (e) {
        // 如果解析失败，使用默认值
        imageAnalysis = {
          characters: {
            count: '未知',
            positions: '未知',
            poses: '未知',
            expressions: '未知',
            gazeDirection: '未知',
            bodyLanguage: '未知',
          },
          scene: {
            location: '未知',
            lighting: '未知',
            atmosphere: '未知',
            dynamicElements: '未知',
          },
          composition: {
            shotType: '未知',
            angle: '未知',
            depth: '未知',
            focusPoint: '未知',
          },
        };
      }

      // 6. 融合分镜数据生成专业视频提示词
      const sceneDescription = shotData.sceneDescription as string || '';
      const characters = shotData.characters as string || '';
      const action = shotData.action as string || '';
      const dialogue = shotData.dialogue as string || '';
      const emotion = shotData.emotion as string || '';
      const duration = shotData.duration || 3;
      const shotType = shotData.shotType as string || '中景';

      const systemPrompt = `你是一个专业的图生视频提示词专家。你需要根据图片分析结果和分镜脚本数据，生成专业的视频生成提示词。

【专业视频提示词要素】
1. 镜头运动（Camera Movement）
   - 推镜头（Dolly In）：适合强调情绪、紧张感
   - 拉镜头（Dolly Out）：适合揭示环境、结束感
   - 摇镜头（Pan）：适合展示场景、跟随动作
   - 移镜头（Tracking）：适合跟随人物移动
   - 升降镜头（Crane/Tilt）：适合变换视角
   - 静止镜头（Static）：适合对话场景

2. 人物动态（Character Motion）
   - 表情变化：从当前表情到目标情绪的过渡
   - 肢体动作：具体的动作描述（转头、抬手、走动等）
   - 口型动作：如果有对白，需要描述说话动作
   - 视线移动：眼神和视线的变化

3. 环境动态（Environment Dynamics）
   - 自然元素：风吹头发/衣服、树叶摇动、水波纹等
   - 光影变化：光线闪烁、阴影移动、时间流逝
   - 氛围元素：烟雾、尘埃、雨滴、雪花等

4. 节奏控制（Pacing）
   - 根据时长调整动作速度
   - 根据情绪调整节奏（紧张=快，温馨=慢）

【输出格式】
输出英文提示词，包含以下部分：
[Camera] 镜头运动描述
[Motion] 人物动态描述
[Environment] 环境动态描述
[Pacing] 节奏描述

最后输出一段完整的综合提示词。`;

      const userPrompt = `请根据以下信息生成专业的图生视频提示词：

【图片分析结果】
人物数量：${imageAnalysis.characters.count}
人物位置：${imageAnalysis.characters.positions}
人物姿态：${imageAnalysis.characters.poses}
表情：${imageAnalysis.characters.expressions}
视线方向：${imageAnalysis.characters.gazeDirection}
肢体语言：${imageAnalysis.characters.bodyLanguage}

场景类型：${imageAnalysis.scene.location}
光线：${imageAnalysis.scene.lighting}
氛围：${imageAnalysis.scene.atmosphere}
可动态化元素：${imageAnalysis.scene.dynamicElements}

景别：${imageAnalysis.composition.shotType}
拍摄角度：${imageAnalysis.composition.angle}
景深：${imageAnalysis.composition.depth}
视觉焦点：${imageAnalysis.composition.focusPoint}

【分镜脚本数据】
场景描述：${sceneDescription}
角色：${characters}
动作：${action || '无明确动作'}
对白：${dialogue || '无对白'}
情绪：${emotion || '无明确情绪'}
景别：${shotType}
时长：${duration}秒

【角色外貌特征】
${characterDescriptions || '无额外角色信息'}

请生成专业的英文视频提示词，包含镜头运动、人物动态、环境动态和节奏控制。`;

      const promptResult = await invokeLLM({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        apiKey: ctx.user?.apiKey,
      });

      const dynamicPrompt = promptResult.choices[0]?.message?.content;
      if (!dynamicPrompt || typeof dynamicPrompt !== 'string') {
        throw new Error('动态提示词生成失败');
      }

      // 7. 更新数据库
      await updateStoryboardShot(input.shotId, { dynamicPrompt });

      // 8. 返回结果
      return {
        dynamicPrompt,
        imageAnalysis: {
          characters: `${imageAnalysis.characters.count}人, ${imageAnalysis.characters.poses}, ${imageAnalysis.characters.expressions}`,
          scene: `${imageAnalysis.scene.location}, ${imageAnalysis.scene.lighting}, ${imageAnalysis.scene.atmosphere}`,
          composition: `${imageAnalysis.composition.shotType}, ${imageAnalysis.composition.angle}`,
          dynamicElements: imageAnalysis.scene.dynamicElements,
        },
      };
    }),
});
