import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { invokeGeminiLLM } from "./_core/gemini";
import { generateImage } from "./_core/imageGeneration";
import { nanoid } from "nanoid";

// ============================================
// 智能小助手 - 角色设计 API
// ============================================

// 风格示例图片 URL
const STYLE_THUMBNAILS: Record<string, string> = {
  "cel-shaded": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887573179.png",
  "light-novel": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887588379.png",
  "shinkai": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887604182.png",
  "ghibli": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887620203.png",
  "magical-girl": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887635755.png",
  "chibi": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887650109.png",
  "chinese-ink": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887666984.png",
  "chinese-3d": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887684365.png",
  "chinese-classical": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887698705.png",
  "pixar-disney": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887715201.png",
  "american-comic": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887730817.png",
  "cartoon-simple": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887744662.png",
  "cyberpunk": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887760051.png",
  "painterly-fantasy": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887774909.png",
  "semi-realistic": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887791027.png",
  "pixel-art": "https://d2xsxph8kpxj0f.cloudfront.net/310519663287043577/Ty8LDrxZwHS4upinDxEPjg/generated/1769887808474.png",
};

// 预设风格数据
export const PRESET_STYLES = [
  // 日系动漫风格
  {
    id: "cel-shaded",
    name: "日系赛璐璐风格",
    nameEn: "Cel-Shaded Anime Style",
    category: "japanese",
    description: "清晰硬朗的线条、扁平色块、极少渐变、经典动漫质感",
    prompt: "cel-shaded, sharp clean lines, bold outlines, flat colors, minimal gradients, anime style",
    examples: ["新世纪福音战士》《进击的巨人》"],
    thumbnail: STYLE_THUMBNAILS["cel-shaded"],
  },
  {
    id: "light-novel",
    name: "轻小说插画风格",
    nameEn: "Light Novel Illustration Style",
    category: "japanese",
    description: "精致细腻、色彩丰富、光影柔和、人物立绘感强",
    prompt: "light novel illustration style, detailed anime art, soft lighting, vibrant colors, character portrait",
    examples: ["《刀剑神域》《Re:从零开始》"],
    thumbnail: STYLE_THUMBNAILS["light-novel"],
  },
  {
    id: "shinkai",
    name: "新海诚电影风格",
    nameEn: "Makoto Shinkai Cinematic Style",
    category: "japanese",
    description: "光影极致精美、天空云彩细腻、透视感强、情感氛围浓厚",
    prompt: "Makoto Shinkai style, beautiful sky, dramatic lighting, cinematic atmosphere, detailed clouds, lens flare",
    examples: ["《你的名字》《天气之子》《铃芽之旅》"],
    thumbnail: STYLE_THUMBNAILS["shinkai"],
  },
  {
    id: "ghibli",
    name: "吉卜力风格",
    nameEn: "Studio Ghibli Style",
    category: "japanese",
    description: "自然手绘质感、温柔色调、角色朴素有灵性、注重人与自然",
    prompt: "Studio Ghibli style, warm natural colors, hand-drawn details, whimsical atmosphere, Hayao Miyazaki",
    examples: ["《千与千寻》《龙猫》《哈尔的移动城堡》"],
    thumbnail: STYLE_THUMBNAILS["ghibli"],
  },
  {
    id: "magical-girl",
    name: "魔法少女风格",
    nameEn: "Magical Girl Style",
    category: "japanese",
    description: "色彩梦幻、华丽服饰、闪亮特效、表情生动",
    prompt: "magical girl anime style, dreamy colors, sparkling effects, elegant costume, heroic pose",
    examples: ["《美少女战士》《魔卡少女樱》《光之美少女》"],
    thumbnail: STYLE_THUMBNAILS["magical-girl"],
  },
  {
    id: "chibi",
    name: "Q版萌系风格",
    nameEn: "Chibi/Kawaii Style",
    category: "japanese",
    description: "2-3头身比例、大眼睛、夸张表情、圆润可爱",
    prompt: "chibi style, kawaii, 2-head proportion, big eyes, cute expression, simple background",
    examples: ["《干物妹小埋》Q版、《工作细胞》Q版"],
    thumbnail: STYLE_THUMBNAILS["chibi"],
  },
  // 中国风动漫风格
  {
    id: "chinese-ink",
    name: "上美水墨动画风",
    nameEn: "Chinese Ink Animation Style",
    category: "chinese",
    description: "融合工笔、水墨、京剧造型，淡墨渲染，意境深远",
    prompt: "Chinese ink-wash animation style, traditional brush painting, poetic atmosphere, Shanghai Animation style",
    examples: ["《大闹天宫》《山水情》《小蚪蚗找妈妈》"],
    thumbnail: STYLE_THUMBNAILS["chinese-ink"],
  },
  {
    id: "chinese-3d",
    name: "3D国漫风格",
    nameEn: "Chinese 3D Animation Style",
    category: "chinese",
    description: "3D建模+中国元素、武侠仙侠题材、动感水墨特效",
    prompt: "Chinese 3D animation style, martial arts, fantasy elements, dynamic ink effects, donghua style",
    examples: ["《哪吒之魔童降世》《白蛇：缘起》《雾山五行》"],
    thumbnail: STYLE_THUMBNAILS["chinese-3d"],
  },
  {
    id: "chinese-classical",
    name: "国风古典风格",
    nameEn: "Classical Chinese Style",
    category: "chinese",
    description: "古典服饰、传统建筑、山水背景、诗意氛围",
    prompt: "classical Chinese style, traditional hanfu costume, ancient architecture, ink landscape, elegant atmosphere",
    examples: ["《天官赐福》《魔道祖师》"],
    thumbnail: STYLE_THUMBNAILS["chinese-classical"],
  },
  // 欧美动画风格
  {
    id: "pixar-disney",
    name: "皮克斯/迪士尼3D风格",
    nameEn: "Pixar/Disney 3D Style",
    category: "western",
    description: "3D渲染、圆润造型、丰富表情、温暖色调",
    prompt: "Pixar animation style, 3D rendered, expressive characters, warm lighting, Disney style",
    examples: ["《玩具总动员》《冰雪奇缘》《疑狂动物城》"],
    thumbnail: STYLE_THUMBNAILS["pixar-disney"],
  },
  {
    id: "american-comic",
    name: "美式漫画风格",
    nameEn: "American Comic Style",
    category: "western",
    description: "粗犷线条、强烈对比、肌肉感强、动态张力",
    prompt: "American comic book style, bold lines, high contrast, dynamic pose, superhero style",
    examples: ["《蜘蛛侠》《蝠蝙侠》漫威/DC漫画"],
    thumbnail: STYLE_THUMBNAILS["american-comic"],
  },
  {
    id: "cartoon-simple",
    name: "卡通简约风格",
    nameEn: "Cartoon Simple Style",
    category: "western",
    description: "简洁线条、明亮色彩、夸张比例、幽默感",
    prompt: "cartoon style, simple lines, bright colors, exaggerated proportions, playful design",
    examples: ["《探险时光》《瑞克和莫蒂》《辛普森一家》"],
    thumbnail: STYLE_THUMBNAILS["cartoon-simple"],
  },
  // 特殊艺术风格
  {
    id: "cyberpunk",
    name: "赛博朋克风格",
    nameEn: "Cyberpunk Anime Style",
    category: "special",
    description: "霓虹灯光、高科技义体、城市夜景、暗色调",
    prompt: "cyberpunk anime style, neon lights, futuristic city, cybernetic implants, dark atmosphere",
    examples: ["《攻壳机动队》《AKIRA》《赛博朋克：边缘行者》"],
    thumbnail: STYLE_THUMBNAILS["cyberpunk"],
  },
  {
    id: "painterly-fantasy",
    name: "厚涂幻想风格",
    nameEn: "Painterly Fantasy Style",
    category: "special",
    description: "油画质感、丰富笔触、史诗氛围、光影戏剧化",
    prompt: "painterly fantasy style, rich brushstrokes, dramatic lighting, epic atmosphere, digital painting",
    examples: ["游戏CG、概念艺术"],
    thumbnail: STYLE_THUMBNAILS["painterly-fantasy"],
  },
  {
    id: "semi-realistic",
    name: "半写实动漫风格",
    nameEn: "Semi-Realistic Anime Style",
    category: "special",
    description: "介于写实与动漫之间、细腻皮肤质感、精致五官",
    prompt: "semi-realistic anime style, detailed skin texture, realistic lighting, anime features, 2.5D style",
    examples: ["《最终幻想》系列CG"],
    thumbnail: STYLE_THUMBNAILS["semi-realistic"],
  },
  {
    id: "pixel-art",
    name: "复古像素风格",
    nameEn: "Retro Pixel Art Style",
    category: "special",
    description: "像素点阵、8-bit/16-bit风格、怀旧色彩",
    prompt: "pixel art style, 8-bit, retro gaming, nostalgic colors, pixelated character",
    examples: ["像素游戏、复古动画"],
    thumbnail: STYLE_THUMBNAILS["pixel-art"],
  },
] as const;

// 风格分类
const STYLE_CATEGORIES = [
  { id: "japanese", name: "日系", icon: "" },
  { id: "chinese", name: "中国", icon: "" },
  { id: "western", name: "欧美", icon: "" },
  { id: "special", name: "特殊", icon: "" },
] as const;

// 会话状态类型
type SessionStep = 
  | "init"                    // 初始状态，等待用户输入剧本
  | "script_analyzed"         // 剧本已分析，等待用户输入风格
  | "style_searched"          // 风格已搜索，展示参考图
  | "reference_selected"      // 参考图已选择，展示执行建议
  | "generating"              // 正在生成角色
  | "completed";              // 生成完成

// 消息类型
interface AssistantMessage {
  role: "assistant" | "user";
  type: "text" | "image_search" | "options" | "generated_image" | "script_analysis" | "style_selection";
  content: string;
  data?: {
    searchResults?: Array<{
      title: string;
      keyword: string;
      images: Array<{ url: string; thumbnail?: string }>;
    }>;
    options?: Array<{ key: string; label: string; description?: string }>;
    generatedImages?: Array<{
      url: string;
      characterName: string;
      description: string;
    }>;
    scriptAnalysis?: {
      summary: string;
      characters: Array<{
        name: string;
        role: string;
        age?: string;
        personality?: string;
        appearance?: string;
      }>;
      setting: string;
      style?: string;
    };
    styleSelection?: {
      styles: Array<{
        id: string;
        name: string;
        nameEn: string;
        category: string;
        description: string;
        prompt: string;
        examples: string[];
        thumbnail: string;
      }>;
      categories: Array<{
        id: string;
        name: string;
        icon: string;
      }>;
    };
  };
  timestamp: number;
}

// 会话状态
interface AgentSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  step: SessionStep;
  script?: string;
  scriptAnalysis?: {
    summary: string;
    characters: Array<{
      name: string;
      role: string;
      age?: string;
      personality?: string;
      appearance?: string;
    }>;
    setting: string;
    suggestedStyle?: string;
  };
  styleKeywords?: string;
  styleDescription?: string; // 风格详细描述
  stylePrompt?: string; // 风格提示词
  styleId?: string; // 风格 ID（用于获取参考图）
  styleReferenceImage?: string; // 风格参考图 URL
  searchResults?: Array<{
    title: string;
    keyword: string;
    images: Array<{ url: string; thumbnail?: string }>;
  }>;
  selectedReferences?: string[];
  userChoice?: string;
  generatedCharacters?: Array<{
    name: string;
    url: string;
    description: string;
  }>;
  // 异步生成相关字段
  pendingCharacters?: Array<{
    name: string;
    role: string;
    age?: string;
    personality?: string;
    appearance?: string;
  }>;
  generationProgress?: number; // 当前已生成的角色数量
  totalCharacters?: number; // 总共需要生成的角色数量
  messages: AssistantMessage[];
}

// 内存存储会话
const sessions = new Map<string, AgentSession>();

// 清理过期会话（1小时过期）
function cleanupExpiredSessions() {
  const now = Date.now();
  const expireTime = 60 * 60 * 1000; // 1小时
  const keysToDelete: string[] = [];
  sessions.forEach((session, id) => {
    if (now - session.updatedAt > expireTime) {
      keysToDelete.push(id);
    }
  });
  keysToDelete.forEach(id => sessions.delete(id));
}

// 每10分钟清理一次
setInterval(cleanupExpiredSessions, 10 * 60 * 1000);

// 创建新会话
function createSession(): AgentSession {
  const session: AgentSession = {
    id: nanoid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    step: "init",
    messages: [],
  };
  sessions.set(session.id, session);
  return session;
}

// 获取会话
function getSession(sessionId: string): AgentSession | undefined {
  const session = sessions.get(sessionId);
  if (session) {
    session.updatedAt = Date.now();
  }
  return session;
}

// 分析剧本
export async function analyzeScript(script: string): Promise<{
  summary: string;
  characters: Array<{
    name: string;
    role: string;
    age?: string;
    personality?: string;
    appearance?: string;
  }>;
  setting: string;
  suggestedStyle?: string;
}> {
  const systemPrompt = `你是一位专业的动漫/漫画角色设计师和剧本分析师。
请分析用户提供的剧本，提取以下信息：

1. 剧情概要（简洁描述故事主线）
2. 主要角色列表（包含每个角色的：名字、角色定位、年龄、性格特点、外貌特征建议）
3. 故事背景设定（时代、地点、氛围）
4. 建议的视觉风格（基于故事类型推荐适合的动漫/漫画风格）

注意：
- 角色设计要体现动漫美学，主角要有魅力和辨识度
- 外貌特征要具体、可视化，适合后续图片生成
- 风格建议要专业，如"日系动漫风格"、"韩漫风格"、"赛璐璐上色"等

请以 JSON 格式返回，格式如下：
{
  "summary": "剧情概要",
  "characters": [
    {
      "name": "角色名",
      "role": "主角/配角/反派",
      "age": "年龄",
      "personality": "性格特点",
      "appearance": "外貌特征建议"
    }
  ],
  "setting": "故事背景设定",
  "suggestedStyle": "建议的视觉风格"
}`;

  const response = await invokeGeminiLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: script }
    ],
  });

  const content = response.choices[0]?.message?.content || "";
  
  // 提取 JSON
  let jsonStr = content;
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    const objMatch = content.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // 返回默认结构
    return {
      summary: "无法解析剧本内容",
      characters: [],
      setting: "未知",
      suggestedStyle: "日系动漫风格",
    };
  }
}

// 生成搜索关键词
async function generateSearchKeywords(
  scriptAnalysis: { setting: string; suggestedStyle?: string; characters: Array<{ name: string; role: string; appearance?: string }> },
  userStyleInput?: string
): Promise<string[]> {
  const style = userStyleInput || scriptAnalysis.suggestedStyle || "动漫风格";
  const keywords: string[] = [];

  // 风格关键词
  keywords.push(`${style} 角色设计`);
  keywords.push(`${style} 人物参考`);

  // 根据角色类型生成关键词
  const mainCharacter = scriptAnalysis.characters.find(c => c.role === "主角" || c.role === "protagonist");
  if (mainCharacter) {
    keywords.push(`${style} 主角 帅气`);
  }

  // 根据背景设定生成关键词
  const settingStr = typeof scriptAnalysis.setting === 'string' ? scriptAnalysis.setting : '';
  if (settingStr.includes("古代") || settingStr.includes("宫廷")) {
    keywords.push(`古装漫画 角色设计`);
  }
  if (settingStr.includes("现代")) {
    keywords.push(`现代都市 漫画角色`);
  }

  return keywords.slice(0, 5); // 最多5个关键词
}

// 风格参考图生成功能 - 使用 AI 生成与剧本匹配的参考图
async function generateStyleReferenceImages(
  keywords: string[],
  scriptAnalysis: {
    summary: string;
    characters: Array<{ name: string; role: string; appearance?: string }>;
    setting: string;
    suggestedStyle?: string;
  },
  apiKey?: string
): Promise<Array<{
  title: string;
  keyword: string;
  images: Array<{ url: string; thumbnail?: string }>;
}>> {
  const results: Array<{
    title: string;
    keyword: string;
    images: Array<{ url: string; thumbnail?: string }>;
  }> = [];

  // 为每个关键词生成参考图
  for (const keyword of keywords.slice(0, 2)) { // 限制为 2 个关键词以控制生成时间
    const images: Array<{ url: string; thumbnail?: string }> = [];
    
    // 为每个关键词生成 3 张参考图
    for (let i = 0; i < 3; i++) {
      try {
        // 构建与剧本相关的 prompt
        const mainCharacter = scriptAnalysis.characters[i % scriptAnalysis.characters.length];
        const characterDesc = mainCharacter ? 
          `${mainCharacter.name}，${mainCharacter.role}，${mainCharacter.appearance || ''}` : '';
        
        const prompt = `${keyword} 风格角色设计参考图，${characterDesc}，
背景：${scriptAnalysis.setting}，
高质量角色概念设计，半身像，简洁背景，专业角色设计图`;

        const result = await generateImage({
          prompt,
          aspectRatio: "1:1",
          apiKey,
        });

        // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
        let imageUrl = result.url || '';
        if (result.base64 && result.mimeType) {
          imageUrl = `data:${result.mimeType};base64,${result.base64}`;
        }
        if (imageUrl) {
          images.push({
            url: imageUrl,
            thumbnail: imageUrl,
          });
        }
      } catch (error) {
        console.error(`生成参考图失败 (${keyword}, ${i}):`, error);
      }
    }

    // 如果有生成成功的图片，添加到结果
    if (images.length > 0) {
      results.push({
        title: `${keyword} 角色设计参考`,
        keyword,
        images,
      });
    }
  }

  // 如果没有生成任何图片，返回空结果并提示用户
  if (results.length === 0) {
    results.push({
      title: "参考图生成中...",
      keyword: keywords[0] || "角色设计",
      images: [],
    });
  }

  return results;
}

// 风格信息类型
interface StyleInfo {
  name: string; // 风格名称
  description?: string; // 风格详细描述
  prompt?: string; // 风格提示词
  styleId?: string; // 风格 ID（用于获取参考图）
  referenceImage?: string; // 风格参考图 URL
}

// 风格参考图映射表（与前端 STYLE_IMAGES 保持一致）
// 这些是 Base64 编码的风格示例图片
import { STYLE_IMAGES as STYLE_REFERENCE_IMAGES } from "../client/src/data/styleImages";

// 生成角色图片
export async function generateCharacterImage(
  characterInfo: {
    name: string;
    role: string;
    age?: string;
    personality?: string;
    appearance?: string;
  },
  styleInfo: StyleInfo | string,
  referenceImages?: string[],
  apiKey?: string
): Promise<{ url: string; description: string }> {
  // 兼容旧的字符串格式
  const style: StyleInfo = typeof styleInfo === 'string' 
    ? { name: styleInfo } 
    : styleInfo;
  
  console.log(`[CharacterDesign] 开始生成角色图片: ${characterInfo.name}`);
  console.log(`[CharacterDesign] 角色信息:`, JSON.stringify(characterInfo));
  console.log(`[CharacterDesign] 风格名称: ${style.name}`);
  console.log(`[CharacterDesign] 风格描述: ${style.description || '无'}`);
  console.log(`[CharacterDesign] 风格提示词: ${style.prompt || '无'}`);
  console.log(`[CharacterDesign] 风格参考图: ${style.referenceImage ? '有' : '无'}`);
  
  // 构建专业的角色生成 prompt
  const promptParts: string[] = [];

  // 风格 - 优先使用提示词，其次使用名称
  if (style.prompt) {
    promptParts.push(style.prompt);
  } else {
    // 如果风格名称包含括号，提取括号内的英文提示词
    const styleMatch = style.name.match(/\(([^)]+)\)/);
    if (styleMatch) {
      promptParts.push(styleMatch[1]);
    } else {
      promptParts.push(style.name);
    }
  }
  
  // 添加风格描述中的关键词
  if (style.description) {
    // 提取描述中的关键特征词
    const descKeywords = style.description
      .replace(/[，、。]/g, ',')
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 20)
      .slice(0, 3);
    if (descKeywords.length > 0) {
      promptParts.push(descKeywords.join(', '));
    }
  }

  // 角色基本信息
  if (characterInfo.age) {
    promptParts.push(`${characterInfo.age} years old`);
  }

  // 角色定位决定气质
  if (characterInfo.role === "主角" || characterInfo.role === "protagonist") {
    promptParts.push("protagonist, charismatic, determined eyes, heroic");
  } else if (characterInfo.role === "反派" || characterInfo.role === "antagonist") {
    promptParts.push("antagonist, mysterious, intimidating presence");
  } else if (characterInfo.role.includes("配角") || characterInfo.role.includes("辅助")) {
    promptParts.push("supporting character, distinctive features");
  }

  // 性格转化为视觉特征
  if (characterInfo.personality) {
    promptParts.push(`personality: ${characterInfo.personality}`);
  }

  // 外貌特征
  if (characterInfo.appearance) {
    promptParts.push(characterInfo.appearance);
  }

  // 三视图角色设计标签 - 正面、侧面、背面全身照
  promptParts.push("character turnaround sheet, three views, front view full body, side view full body, back view full body, same character in three poses, white background, character design reference sheet, high quality, detailed illustration, professional character design, consistent style across all views");

  const prompt = promptParts.join(", ");
  console.log(`[CharacterDesign] 最终 Prompt: ${prompt}`);

  try {
    // 准备参考图片（风格参考图）
    const originalImages: Array<{ url?: string; b64Json?: string; mimeType: "image/png" | "image/jpeg" }> = [];
    
    // 优先通过 styleId 获取参考图（效果最好）
    if (style.styleId && STYLE_REFERENCE_IMAGES[style.styleId]) {
      const refImageData = STYLE_REFERENCE_IMAGES[style.styleId];
      // 检查是 Base64 data URL 还是普通 URL
      if (refImageData.startsWith('data:image')) {
        // 解析 Base64 data URL
        const base64Match = refImageData.match(/^data:image\/(\w+);base64,(.+)$/);
        if (base64Match) {
          const mimeType = base64Match[1] === 'png' ? 'image/png' : 'image/jpeg';
          originalImages.push({ 
            b64Json: base64Match[2], 
            mimeType: mimeType as "image/png" | "image/jpeg"
          });
          console.log(`[CharacterDesign] 通过 styleId 获取 Base64 风格参考图: ${style.styleId}`);
        }
      } else {
        // 普通 URL
        originalImages.push({ 
          url: refImageData, 
          mimeType: "image/jpeg" 
        });
        console.log(`[CharacterDesign] 通过 styleId 获取 URL 风格参考图: ${style.styleId}`);
      }
    }
    // 其次使用直接提供的 URL 格式参考图
    else if (style.referenceImage && !style.referenceImage.startsWith('data:')) {
      originalImages.push({ 
        url: style.referenceImage, 
        mimeType: "image/png" 
      });
      console.log(`[CharacterDesign] 使用 URL 风格参考图: ${style.referenceImage.slice(0, 50)}...`);
    }
    // 最后支持 Base64 格式（如果其他方式都不可用）
    else if (style.referenceImage && style.referenceImage.startsWith('data:')) {
      // 解析 Base64 数据
      const base64Match = style.referenceImage.match(/^data:image\/(\w+);base64,(.+)$/);
      if (base64Match) {
        const mimeType = base64Match[1] === 'png' ? 'image/png' : 'image/jpeg';
        originalImages.push({ 
          b64Json: base64Match[2], 
          mimeType: mimeType as "image/png" | "image/jpeg"
        });
        console.log(`[CharacterDesign] 使用 Base64 风格参考图`);
      }
    }
    
    console.log(`[CharacterDesign] 参考图数量: ${originalImages.length}`);
    
    // 调用图片生成 API - 使用 2K 分辨率
    const result = await generateImage({
      prompt,
      imageSize: "2K", // 固定使用 2K 分辨率
      aspectRatio: "16:9", // 三视图使用 16:9 横向比例
      // 使用风格参考图进行风格迁移（只迁移风格，不迁移内容）
      originalImages: originalImages.length > 0 ? originalImages : undefined,
      apiKey,
    });
    
    // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
    let imageUrl = result.url || "";
    if (result.base64 && result.mimeType) {
      imageUrl = `data:${result.mimeType};base64,${result.base64}`;
      console.log(`[CharacterDesign] 使用 base64 数据 URL (长度: ${imageUrl.length})`);
    } else {
      console.log(`[CharacterDesign] 使用 S3 URL: ${imageUrl}`);
    }
    
    console.log(`[CharacterDesign] 生成结果: URL=${imageUrl ? '有效' : '空'}`);
    
    return {
      url: imageUrl,
      description: `${characterInfo.name}：${characterInfo.role}，${characterInfo.personality || ""}，${characterInfo.appearance || ""}`,
    };
  } catch (error) {
    console.error(`[CharacterDesign] 生成失败:`, error);
    throw error;
  }
}

// ============================================
// 路由定义
// ============================================

export const assistantCharacterDesignRouter = router({
  // 开始新会话
  startSession: publicProcedure
    .mutation(async () => {
      const session = createSession();
      
      // 添加欢迎消息
      const welcomeMessage: AssistantMessage = {
        role: "assistant",
        type: "text",
        content: "你好！我是角色设计助手。请输入你的剧本内容，我会帮你分析剧情并设计角色形象。\n\n你可以直接粘贴剧本文本，或者描述你想要创作的故事。",
        timestamp: Date.now(),
      };
      session.messages.push(welcomeMessage);

      return {
        sessionId: session.id,
        messages: session.messages,
        step: session.step,
      };
    }),

  // 发送消息/继续对话
  chat: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      message: z.string(),
      attachments: z.array(z.object({
        type: z.enum(["image"]),
        url: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const session = getSession(input.sessionId);
      if (!session) {
        throw new Error("会话不存在或已过期，请重新开始");
      }

      // 添加用户消息
      const userMessage: AssistantMessage = {
        role: "user",
        type: "text",
        content: input.message,
        timestamp: Date.now(),
      };
      session.messages.push(userMessage);

      // 根据当前步骤处理
      const responseMessages: AssistantMessage[] = [];

      switch (session.step) {
        case "init": {
          // 用户输入了剧本，进行分析
          session.script = input.message;
          
          // 分析剧本
          const analysis = await analyzeScript(input.message);
          session.scriptAnalysis = analysis;
          session.step = "script_analyzed";

          // 返回分析结果
          const analysisMessage: AssistantMessage = {
            role: "assistant",
            type: "script_analysis",
            content: `我已经分析了你的剧本，以下是我的理解：\n\n**剧情概要**\n${analysis.summary}\n\n**故事背景**\n${analysis.setting}\n\n**主要角色**\n${analysis.characters.map(c => `- **${c.name}**（${c.role}）：${c.personality || ""}，${c.appearance || ""}`).join("\n")}\n\n**建议风格**\n${analysis.suggestedStyle || "日系动漫风格"}`,
            data: {
              scriptAnalysis: analysis,
            },
            timestamp: Date.now(),
          };
          responseMessages.push(analysisMessage);

          // 添加风格选择消息
          const styleSelectionMessage: AssistantMessage = {
            role: "assistant",
            type: "style_selection",
            content: `请选择你想要的视觉风格，或者直接输入自定义风格描述：`,
            data: {
              styleSelection: {
                styles: PRESET_STYLES.map(s => ({
                  id: s.id,
                  name: s.name,
                  nameEn: s.nameEn,
                  category: s.category,
                  description: s.description,
                  prompt: s.prompt,
                  examples: [...s.examples],
                  thumbnail: s.thumbnail,
                })),
                categories: STYLE_CATEGORIES.map(c => ({
                  id: c.id,
                  name: c.name,
                  icon: c.icon,
                })),
              },
            },
            timestamp: Date.now(),
          };
          responseMessages.push(styleSelectionMessage);
          break;
        }

        case "script_analyzed": {
          // 用户输入了风格，解析完整的风格信息
          const styleInput = input.message;
          
          // 解析风格信息（支持新格式：风格、描述、提示词、风格 ID）
          const styleMatch = styleInput.match(/风格：(.+?)(?:\n|，|$)/);
          const descMatch = styleInput.match(/描述：(.+?)(?:\n|，|$)/);
          const promptMatch = styleInput.match(/提示词：(.+?)(?:\n|，|$)/);
          const styleIdMatch = styleInput.match(/风格 ID：(.+?)(?:\n|$)/);
          // 兼容旧格式：参考图 URL
          const refImageMatch = styleInput.match(/参考图：(.+?)(?:\n|$)/);
          
          // 存储解析后的风格信息
          session.styleKeywords = styleMatch ? styleMatch[1].trim() : styleInput;
          session.styleDescription = descMatch ? descMatch[1].trim() : undefined;
          session.stylePrompt = promptMatch ? promptMatch[1].trim() : undefined;
          session.styleId = styleIdMatch ? styleIdMatch[1].trim() : undefined;
          // 兼容旧格式：如果有直接的参考图 URL，使用它
          session.styleReferenceImage = refImageMatch ? refImageMatch[1].trim() : undefined;
          
          console.log(`[风格解析] 名称: ${session.styleKeywords}`);
          console.log(`[风格解析] 描述: ${session.styleDescription}`);
          console.log(`[风格解析] 提示词: ${session.stylePrompt}`);
          console.log(`[风格解析] 风格 ID: ${session.styleId || '无'}`);
          console.log(`[风格解析] 参考图 URL: ${session.styleReferenceImage ? '有' : '无'}`);
          
          session.step = "reference_selected"; // 直接跳到选择执行方式

          // 生成执行建议
          const characters = session.scriptAnalysis?.characters || [];
          const mainCharacters = characters.filter(c => 
            c.role === "主角" || c.role === "protagonist" || c.role === "配角" || c.role === "supporting" ||
            c.role === "主要角色" || c.role === "核心角色" || c.role === "反英雄" || c.role === "将军"
          ).slice(0, 5);
          
          // 如果没有筛选到主要角色，取前 5 个
          const displayCharacters = mainCharacters.length > 0 ? mainCharacters : characters.slice(0, 5);

          const styleConfirmMessage: AssistantMessage = {
            role: "assistant",
            type: "options",
            content: `很好！我已经记录了你的风格偏好：**${input.message}**\n\n基于你的剧本和视觉需求，我建议采用分步骤的方式来完成这个项目：\n\n**💡 建议执行方式**\n\n我建议先从角色设计开始，因为：\n• 确定角色外观后，分镜制作会更连贯统一\n• 你可以先看到主要角色的视觉效果，确认是否符合预期\n• 角色可以作为后续分镜的参考素材\n\n你希望：`,
            data: {
              options: [
                { 
                  key: "A", 
                  label: `先设计${displayCharacters.length}个主要角色`, 
                  description: displayCharacters.map(c => c.name).join("、") 
                },
                { 
                  key: "B", 
                  label: "直接制作完整分镜故事板", 
                  description: "包含所有场景" 
                },
                { 
                  key: "C", 
                  label: "先做1-2个关键场景测试", 
                  description: "确认效果后再继续" 
                },
              ],
            },
            timestamp: Date.now(),
          };
          responseMessages.push(styleConfirmMessage);
          break;
        }

        case "style_searched": {
          // 用户选择了参考图（通过附件发送）或确认继续
          if (input.attachments && input.attachments.length > 0) {
            session.selectedReferences = input.attachments.map(a => a.url);
          }
          session.step = "reference_selected";

          // 生成执行建议
          const characters = session.scriptAnalysis?.characters || [];
          const mainCharacters = characters.filter(c => 
            c.role === "主角" || c.role === "protagonist" || c.role === "配角" || c.role === "supporting"
          ).slice(0, 3);

          const optionsMessage: AssistantMessage = {
            role: "assistant",
            type: "options",
            content: `很好！现在我对风格有了清晰的理解。基于你的剧本和视觉需求，我建议采用分步骤的方式来完成这个项目：\n\n**💡 建议执行方式**\n\n我建议先从角色设计开始，因为：\n• 确定角色外观后，分镜制作会更连贯统一\n• 你可以先看到主要角色的视觉效果，确认是否符合预期\n• 角色可以作为后续分镜的参考素材\n\n你希望：`,
            data: {
              options: [
                { 
                  key: "A", 
                  label: `先设计${mainCharacters.length}个主要角色`, 
                  description: mainCharacters.map(c => c.name).join("、") 
                },
                { 
                  key: "B", 
                  label: "直接制作完整分镜故事板", 
                  description: "包含所有场景" 
                },
                { 
                  key: "C", 
                  label: "先做1-2个关键场景测试", 
                  description: "验证风格效果" 
                },
              ],
            },
            timestamp: Date.now(),
          };
          responseMessages.push(optionsMessage);
          break;
        }

        case "reference_selected": {
          // 用户选择了执行方式
          const choice = input.message.toUpperCase().trim();
          session.userChoice = choice;

          if (choice === "A" || choice.includes("角色")) {
            session.step = "generating";

            // 开始生成角色 - 使用与选项显示完全相同的筛选逻辑
            const characters = session.scriptAnalysis?.characters || [];
            // 筛选主要角色：与显示选项时使用相同的逻辑
            const mainCharacters = characters.filter(c => 
              c.role === "主角" || c.role === "protagonist" || 
              c.role === "配角" || c.role === "supporting" ||
              c.role === "主要角色" || c.role === "核心角色" || 
              c.role === "反英雄" || c.role === "将军"
            ).slice(0, 5); // 最多取 5 个角色
            
            // 如果筛选结果为空，取前 5 个角色
            const charactersToGenerate = mainCharacters.length > 0 ? mainCharacters : characters.slice(0, 5);

            // 保存待生成的角色列表
            session.pendingCharacters = charactersToGenerate;
            session.generatedCharacters = [];
            session.generationProgress = 0;
            session.totalCharacters = charactersToGenerate.length;

            const generatingMessage: AssistantMessage = {
              role: "assistant",
              type: "text",
              content: `好的，我将为你设计${charactersToGenerate.length}个主要角色：${charactersToGenerate.map(c => c.name).join("、")}。\n\n图片生成需要一定时间，请耐心等待...（每个角色约需 15-30 秒）`,
              timestamp: Date.now(),
            };
            responseMessages.push(generatingMessage);

            // 异步生成角色图片（不等待完成）
            (async () => {
              const generatedCharacters: Array<{ name: string; url: string; description: string }> = [];
              
              for (let i = 0; i < charactersToGenerate.length; i++) {
                const character = charactersToGenerate[i];
                try {
                  console.log(`[异步] 开始生成角色: ${character.name} (${i + 1}/${charactersToGenerate.length})`);
                  // 构建完整的风格信息
                  const styleInfo: StyleInfo = {
                    name: session.styleKeywords || session.scriptAnalysis?.suggestedStyle || "日系动漫风格",
                    description: session.styleDescription,
                    prompt: session.stylePrompt,
                    styleId: session.styleId, // 风格 ID，用于获取参考图
                    referenceImage: session.styleReferenceImage,
                  };
                  const result = await generateCharacterImage(
                    character,
                    styleInfo,
                    session.selectedReferences
                  );
                  console.log(`[异步] 角色 ${character.name} 生成结果:`, result.url ? '成功' : '失败');
                  
                  if (result.url) {
                    generatedCharacters.push({
                      name: character.name,
                      url: result.url,
                      description: result.description,
                    });
                  } else {
                    generatedCharacters.push({
                      name: character.name,
                      url: '',
                      description: `${character.name}：生成失败，请重试`,
                    });
                  }
                } catch (error) {
                  console.error(`[异步] 生成角色 ${character.name} 失败:`, error);
                  generatedCharacters.push({
                    name: character.name,
                    url: '',
                    description: `${character.name}：生成失败 - ${error instanceof Error ? error.message : '未知错误'}`,
                  });
                }
                
                // 更新进度
                session.generatedCharacters = [...generatedCharacters];
                session.generationProgress = i + 1;
              }

              // 所有角色生成完成
              session.step = "completed";
              console.log(`[异步] 所有角色生成完成，共 ${generatedCharacters.length} 个`);
            })();

            // 立即返回，不等待生成完成
          } else {
            // 其他选项暂时提示
            const notImplementedMessage: AssistantMessage = {
              role: "assistant",
              type: "text",
              content: "这个功能正在开发中，目前只支持角色设计。请选择 A 来设计角色。",
              timestamp: Date.now(),
            };
            responseMessages.push(notImplementedMessage);
          }
          break;
        }

        case "generating": {
          // 正在生成中，用户可能重复点击了按钮
          const waitingMessage: AssistantMessage = {
            role: "assistant",
            type: "text",
            content: "正在生成中，请稍候...图片生成需要一定时间，请耐心等待。",
            timestamp: Date.now(),
          };
          responseMessages.push(waitingMessage);
          break;
        }

        case "completed": {
          // 已完成，可以继续对话或重新开始
          const continueMessage: AssistantMessage = {
            role: "assistant",
            type: "text",
            content: "角色设计已完成。你可以：\n\n1. 继续调整某个角色（告诉我角色名和修改要求）\n2. 设计更多角色\n3. 开始新的设计任务（输入新的剧本）",
            timestamp: Date.now(),
          };
          responseMessages.push(continueMessage);
          break;
        }

        default: {
          const errorMessage: AssistantMessage = {
            role: "assistant",
            type: "text",
            content: "抱歉，出现了一些问题。请重新开始会话。",
            timestamp: Date.now(),
          };
          responseMessages.push(errorMessage);
        }
      }

      // 添加响应消息到会话
      session.messages.push(...responseMessages);

      return {
        sessionId: session.id,
        messages: responseMessages,
        step: session.step,
        allMessages: session.messages,
      };
    }),

  // 获取会话状态
  getSession: publicProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .query(({ input }) => {
      const session = getSession(input.sessionId);
      if (!session) {
        return null;
      }
      return {
        sessionId: session.id,
        step: session.step,
        messages: session.messages,
        scriptAnalysis: session.scriptAnalysis,
        searchResults: session.searchResults,
        generatedCharacters: session.generatedCharacters,
      };
    }),

  // 结束会话
  endSession: publicProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .mutation(({ input }) => {
      sessions.delete(input.sessionId);
      return { success: true };
    }),

  // 单独的图片搜索 API（可以在对话中随时调用）
  searchImages: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      keywords: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const session = getSession(input.sessionId);
      if (!session) {
        throw new Error("会话不存在或已过期");
      }

      // 使用会话中的剧本分析结果生成参考图
      const scriptAnalysis = session.scriptAnalysis || {
        summary: "",
        characters: [],
        setting: "",
        suggestedStyle: "动漫风格",
      };
      const results = await generateStyleReferenceImages(input.keywords, scriptAnalysis);
      
      // 更新会话
      session.searchResults = results;

      return {
        searchResults: results,
      };
    }),

  // 单独的角色生成 API
  generateCharacter: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      characterInfo: z.object({
        name: z.string(),
        role: z.string(),
        age: z.string().optional(),
        personality: z.string().optional(),
        appearance: z.string().optional(),
      }),
      style: z.string(),
      referenceImages: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const session = getSession(input.sessionId);
      if (!session) {
        throw new Error("会话不存在或已过期");
      }

      const result = await generateCharacterImage(
        input.characterInfo,
        input.style,
        input.referenceImages
      );

      return {
        url: result.url,
        characterName: input.characterInfo.name,
        description: result.description,
      };
    }),

  // 获取预设风格列表
  getPresetStyles: publicProcedure
    .query(() => {
      return {
        styles: PRESET_STYLES,
        categories: STYLE_CATEGORIES,
      };
    }),

  // 根据风格 ID 获取风格详情
  getStyleById: publicProcedure
    .input(z.object({
      styleId: z.string(),
    }))
    .query(({ input }) => {
      const style = PRESET_STYLES.find(s => s.id === input.styleId);
      return style || null;
    }),

  // 获取生成进度（用于前端轮询）
  getGenerationProgress: publicProcedure
    .input(z.object({
      sessionId: z.string(),
    }))
    .query(({ input }) => {
      const session = getSession(input.sessionId);
      if (!session) {
        return null;
      }

      const isGenerating = session.step === "generating";
      const isCompleted = session.step === "completed";
      const progress = session.generationProgress || 0;
      const total = session.totalCharacters || 0;
      const generatedCharacters = session.generatedCharacters || [];
      const pendingCharacters = session.pendingCharacters || [];

      // 如果生成完成，返回结果消息
      let resultMessage: AssistantMessage | null = null;
      if (isCompleted && generatedCharacters.length > 0) {
        // 检查是否已经有结果消息
        const hasResultMessage = session.messages.some(
          m => m.type === "generated_image" && m.data?.generatedImages?.length
        );
        
        if (!hasResultMessage) {
          // 创建结果消息并添加到会话
          resultMessage = {
            role: "assistant",
            type: "generated_image",
            content: `角色设计完成！以下是生成的角色形象：`,
            data: {
              generatedImages: generatedCharacters.map(c => ({
                url: c.url,
                characterName: c.name,
                description: c.description,
              })),
            },
            timestamp: Date.now(),
          };
          session.messages.push(resultMessage);
        }
      }

      return {
        sessionId: session.id,
        step: session.step,
        isGenerating,
        isCompleted,
        progress,
        total,
        currentCharacter: isGenerating && progress < total && pendingCharacters[progress]
          ? pendingCharacters[progress].name
          : null,
        generatedCharacters: generatedCharacters.map(c => ({
          name: c.name,
          url: c.url,
          description: c.description,
        })),
        resultMessage,
      };
    }),
});

export type AssistantCharacterDesignRouter = typeof assistantCharacterDesignRouter;
