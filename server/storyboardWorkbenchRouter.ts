import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { generateImage } from "./_core/imageGeneration";
import { storagePut, storageGet } from "./storage";
import sharp from "sharp";

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
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw new Error(`下载图片失败（已重试 ${maxRetries} 次）: ${lastError?.message || '未知错误'}`);
}

// 默认9个视角
const defaultNineAngles = [
  "特写镜头（面部特写）",
  "中景镜头（半身）",
  "远景镜头（全身+环境）",
  "低角度仰拍",
  "高角度俯拍",
  "顶视图/鸟瞰",
  "荷兰角（倾斜）",
  "过肩镜头",
  "主观视角",
];

// 辅助函数：将图片调整为指定比例（深度识别+重新生成方案）
async function adjustImageAspectRatio(
  imageUrl: string,
  targetAspectRatio: "1:1" | "16:9" | "9:16",
  apiKey?: string
): Promise<string> {
  // 下载原始图片
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch image for aspect ratio adjustment");
  }
  const imageBuffer = Buffer.from(await response.arrayBuffer());

  // 获取图片尺寸
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Failed to get image dimensions");
  }

  const originalWidth = metadata.width;
  const originalHeight = metadata.height;
  const originalRatio = originalWidth / originalHeight;

  // 计算目标比例
  let targetRatio: number;
  switch (targetAspectRatio) {
    case "1:1":
      targetRatio = 1;
      break;
    case "16:9":
      targetRatio = 16 / 9;
      break;
    case "9:16":
      targetRatio = 9 / 16;
      break;
  }

  // 第一步：检测比例 - 如果原图比例与目标比例差距<0.05，直接返回原图
  if (Math.abs(originalRatio - targetRatio) < 0.05) {
    return imageUrl;
  }

  // 第二步：深度识别 - 调用AI识别原图的7个维度
  const imageBase64 = imageBuffer.toString("base64");
  const { geminiGenerateContent } = await import("./_core/gemini");
  
  const analysisResult = await geminiGenerateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64,
            },
          },
          {
            text: `请深度分析这张图片的以下7个维度，用于重新生成相同内容但不同比例的图片：

1. **核心主体**：面部特征、发型、服装、配饰的详细描述
2. **姿态动作**：身体姿势、手势、视线方向、动态感
3. **场景环境**：地点、背景元素、道具
4. **光线条件**：光源方向、强度、色温、阴影、高光
5. **色彩风格**：主色调、饱和度、对比度、调色风格
6. **艺术风格**：渲染类型（写实/动漫/插画等）、细节程度、纹理质感
7. **构图信息**：主体位置、占比、景深

请用JSON格式输出，每个维度用一句话描述：
{
  "coreSubject": "...",
  "poseAction": "...",
  "sceneEnvironment": "...",
  "lightingCondition": "...",
  "colorStyle": "...",
  "artStyle": "...",
  "composition": "..."
}`,
          },
        ],
      },
    ],
    apiKey,
  });

  // 解析分析结果
  let analysisData: {
    coreSubject: string;
    poseAction: string;
    sceneEnvironment: string;
    lightingCondition: string;
    colorStyle: string;
    artStyle: string;
    composition: string;
  };
  
  try {
    // 尝试从返回文本中提取JSON
    const jsonMatch = analysisResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysisData = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    // 如果解析失败，使用默认描述
    analysisData = {
      coreSubject: "保持原图中的主体完全一致",
      poseAction: "保持原图中的姿态完全一致",
      sceneEnvironment: "保持原图中的场景完全一致",
      lightingCondition: "保持原图中的光线完全一致",
      colorStyle: "保持原图中的色彩完全一致",
      artStyle: "保持原图中的艺术风格完全一致",
      composition: "保持原图中的构图完全一致",
    };
  }

  // 第三步：重新生成 - 根据识别结果构建像素级一致约束的提示词
  const targetRatioStr = targetAspectRatio;
  const regeneratePrompt = `Regenerate this image with a ${targetRatioStr} aspect ratio while maintaining PIXEL-LEVEL CONSISTENCY.

**CRITICAL CONSTRAINTS - MUST BE IDENTICAL TO ORIGINAL**:

1. **Character Consistency**: ${analysisData.coreSubject}
   - Face, hairstyle, clothing, and accessories MUST be EXACTLY the same

2. **Pose Consistency**: ${analysisData.poseAction}
   - Body posture, hand gestures, and gaze direction MUST remain unchanged

3. **Scene Consistency**: ${analysisData.sceneEnvironment}
   - Same environment, background elements, and props

4. **Lighting Consistency**: ${analysisData.lightingCondition}
   - Same light source direction, intensity, color temperature, and shadows

5. **Color Consistency**: ${analysisData.colorStyle}
   - EXACT same colors, saturation, and contrast

6. **Style Consistency**: ${analysisData.artStyle}
   - Same rendering style and detail level

7. **Composition Adjustment**: ${analysisData.composition}
   - Adapt to ${targetRatioStr} ratio by extending the canvas naturally
   - DO NOT crop or distort the main subject
   - Fill extended areas with contextually appropriate content

**OUTPUT REQUIREMENT**: Generate a ${targetRatioStr} image that looks like the SAME FRAME captured with a different camera aspect ratio, NOT a different image.`;

  // 调用图片生成API重新生成
  const result = await generateImage({
    prompt: regeneratePrompt,
    originalImages: [{
      b64Json: imageBase64,
      mimeType: "image/jpeg",
    }],
    model: "gemini-3-pro-image-preview",
    aspectRatio: targetAspectRatio,
    imageSize: "2K",
    apiKey,
  });

  // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
  if (result.base64 && result.mimeType) {
    return `data:${result.mimeType};base64,${result.base64}`;
  }
  if (!result.url) {
    throw new Error("Failed to generate adapted image");
  }
  return result.url;
}

// 辅助函数：将 base64 图片调整为指定比例（深度识别+重新生成方案）
async function adjustImageBase64ForAspectRatio(
  imageBase64: string,
  imageMimeType: string,
  targetAspectRatio: "1:1" | "16:9" | "9:16",
  apiKey?: string
): Promise<{ base64: string; mimeType: string }> {
  const imageBuffer = Buffer.from(imageBase64, "base64");

  // 获取图片尺寸
  const metadata = await sharp(imageBuffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Failed to get image dimensions");
  }

  const originalWidth = metadata.width;
  const originalHeight = metadata.height;
  const originalRatio = originalWidth / originalHeight;

  // 计算目标比例
  let targetRatio: number;
  switch (targetAspectRatio) {
    case "1:1":
      targetRatio = 1;
      break;
    case "16:9":
      targetRatio = 16 / 9;
      break;
    case "9:16":
      targetRatio = 9 / 16;
      break;
  }

  // 第一步：检测比例 - 如果原图比例与目标比例差距<0.05，直接返回原图
  if (Math.abs(originalRatio - targetRatio) < 0.05) {
    return { base64: imageBase64, mimeType: imageMimeType };
  }

  // 第二步：深度识别 - 调用AI识别原图的7个维度
  const { geminiGenerateContent } = await import("./_core/gemini");
  
  const analysisResult = await geminiGenerateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: imageMimeType,
              data: imageBase64,
            },
          },
          {
            text: `请深度分析这张图片的以下7个维度，用于重新生成相同内容但不同比例的图片：

1. **核心主体**：面部特征、发型、服装、配饰的详细描述
2. **姿态动作**：身体姿势、手势、视线方向、动态感
3. **场景环境**：地点、背景元素、道具
4. **光线条件**：光源方向、强度、色温、阴影、高光
5. **色彩风格**：主色调、饱和度、对比度、调色风格
6. **艺术风格**：渲染类型（写实/动漫/插画等）、细节程度、纹理质感
7. **构图信息**：主体位置、占比、景深

请用JSON格式输出，每个维度用一句话描述：
{
  "coreSubject": "...",
  "poseAction": "...",
  "sceneEnvironment": "...",
  "lightingCondition": "...",
  "colorStyle": "...",
  "artStyle": "...",
  "composition": "..."
}`,
          },
        ],
      },
    ],
    apiKey,
  });

  // 解析分析结果
  let analysisData: {
    coreSubject: string;
    poseAction: string;
    sceneEnvironment: string;
    lightingCondition: string;
    colorStyle: string;
    artStyle: string;
    composition: string;
  };
  
  try {
    const jsonMatch = analysisResult.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysisData = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON found in response");
    }
  } catch (e) {
    analysisData = {
      coreSubject: "保持原图中的主体完全一致",
      poseAction: "保持原图中的姿态完全一致",
      sceneEnvironment: "保持原图中的场景完全一致",
      lightingCondition: "保持原图中的光线完全一致",
      colorStyle: "保持原图中的色彩完全一致",
      artStyle: "保持原图中的艺术风格完全一致",
      composition: "保持原图中的构图完全一致",
    };
  }

  // 第三步：重新生成 - 根据识别结果构建像素级一致约束的提示词
  const targetRatioStr = targetAspectRatio;
  const regeneratePrompt = `Regenerate this image with a ${targetRatioStr} aspect ratio while maintaining PIXEL-LEVEL CONSISTENCY.

**CRITICAL CONSTRAINTS - MUST BE IDENTICAL TO ORIGINAL**:

1. **Character Consistency**: ${analysisData.coreSubject}
   - Face, hairstyle, clothing, and accessories MUST be EXACTLY the same

2. **Pose Consistency**: ${analysisData.poseAction}
   - Body posture, hand gestures, and gaze direction MUST remain unchanged

3. **Scene Consistency**: ${analysisData.sceneEnvironment}
   - Same environment, background elements, and props

4. **Lighting Consistency**: ${analysisData.lightingCondition}
   - Same light source direction, intensity, color temperature, and shadows

5. **Color Consistency**: ${analysisData.colorStyle}
   - EXACT same colors, saturation, and contrast

6. **Style Consistency**: ${analysisData.artStyle}
   - Same rendering style and detail level

7. **Composition Adjustment**: ${analysisData.composition}
   - Adapt to ${targetRatioStr} ratio by extending the canvas naturally
   - DO NOT crop or distort the main subject
   - Fill extended areas with contextually appropriate content

**OUTPUT REQUIREMENT**: Generate a ${targetRatioStr} image that looks like the SAME FRAME captured with a different camera aspect ratio, NOT a different image.`;

  // 调用图片生成API重新生成
  const result = await generateImage({
    prompt: regeneratePrompt,
    originalImages: [{
      b64Json: imageBase64,
      mimeType: imageMimeType,
    }],
    model: "gemini-3-pro-image-preview",
    aspectRatio: targetAspectRatio,
    imageSize: "2K",
    apiKey,
  });

  // 优先使用 base64 数据（S3 URL 可能有 403 问题）
  if (result.base64 && result.mimeType) {
    return {
      base64: result.base64,
      mimeType: result.mimeType,
    };
  }

  if (!result.url) {
    throw new Error("Failed to generate adapted image");
  }

  // 回退：下载生成的图片并转换为base64
  const generatedResponse = await fetch(result.url);
  if (!generatedResponse.ok) {
    throw new Error("Failed to download generated image");
  }
  const generatedBuffer = Buffer.from(await generatedResponse.arrayBuffer());
  const generatedBase64 = generatedBuffer.toString("base64");

  return {
    base64: generatedBase64,
    mimeType: "image/jpeg",
  };
}

export const storyboardWorkbenchRouter = router({
  // 生成九宫格分镜画面（简化版，默认9个视角）
  generateNineGridStoryboard: protectedProcedure
    .input(z.object({
      referenceImageUrl: z.string().describe("参考图片URL"),
      prompt: z.string().describe("场景描述"),
      aspectRatio: z.enum(["1:1", "16:9", "9:16"]).default("1:1").describe("画面比例"),
    }))
    .mutation(async ({ ctx, input }) => {
      // 第一步：将参考图片调整为目标比例
      const adjustedImageUrl = await adjustImageAspectRatio(
        input.referenceImageUrl,
        input.aspectRatio,
        ctx.user?.apiKey
      );

      // 构建提示词 - 根据比例优化提示词
      const angleList = defaultNineAngles.join("、");
      
      // 根据比例设置不同的提示词细节
      let aspectDescription = "";
      let gridDescription = "";
      switch (input.aspectRatio) {
        case "16:9":
          aspectDescription = "横屏格式（16:9）";
          gridDescription = "每个格子都是横向的16:9比例";
          break;
        case "9:16":
          aspectDescription = "竖屏格式（9:16）";
          gridDescription = "每个格子都是竖向的9:16比例，适合手机屏幕观看";
          break;
        default:
          aspectDescription = "正方形格式（1:1）";
          gridDescription = "每个格子都是正方形的1:1比例";
      }

      // 定格九宫格 - 强调角色一致性
      const fullPrompt = `**CRITICAL: CHARACTER IDENTITY MUST BE 100% IDENTICAL IN ALL 9 FRAMES**

Look at the reference image carefully. You MUST recreate THE EXACT SAME CHARACTER in all 9 frames:
- SAME face features (eyes, nose, mouth, face shape)
- SAME hairstyle and hair color
- SAME body type, height, proportions
- SAME clothing (exact same outfit, colors, patterns, accessories)
- SAME skin tone
- SAME pose and expression (FROZEN - no movement)

Scene: ${input.prompt}

**FREEZE-FRAME CONCEPT**: The character is FROZEN like a statue. Only the CAMERA moves around them.

Create a 3x3 grid (9 frames) showing this ONE CHARACTER from 9 different camera angles:
1. ${defaultNineAngles[0]} - Close-up
2. ${defaultNineAngles[1]} - Medium shot  
3. ${defaultNineAngles[2]} - Wide shot
4. ${defaultNineAngles[3]} - Low angle
5. ${defaultNineAngles[4]} - High angle
6. ${defaultNineAngles[5]} - Bird's eye view
7. ${defaultNineAngles[6]} - Dutch angle
8. ${defaultNineAngles[7]} - Over-the-shoulder
9. ${defaultNineAngles[8]} - POV shot

**MANDATORY REQUIREMENTS**:
1. **SAME PERSON IN ALL 9 FRAMES** - This is the #1 rule. Must be recognizable as the EXACT SAME individual.
2. **SAME FROZEN POSE** - The character does NOT move. Only camera angle changes.
3. Aspect ratio: ${aspectDescription} for each panel
4. ${gridDescription}
5. Consistent lighting direction
6. Thin white separator lines between panels

DO NOT create 9 different people. It must be ONE person photographed from 9 angles, frozen in the same pose.`;

      // 调用图片生成 API（使用 Pro 模型支持 2K）
      const result = await generateImage({
        prompt: fullPrompt,
        originalImages: [{
          url: adjustedImageUrl,
          mimeType: "image/jpeg",
        }],
        model: "gemini-3-pro-image-preview",
        aspectRatio: input.aspectRatio,
        imageSize: "2K",
        apiKey: ctx.user?.apiKey,
      });

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let gridImageUrl = result.url || '';
      if (result.base64 && result.mimeType) {
        gridImageUrl = `data:${result.mimeType};base64,${result.base64}`;
      }

      return {
        gridImageUrl,
        aspectRatio: input.aspectRatio,
        angles: defaultNineAngles,
      };
    }),

  // 切割九宫格并高清放大单格
  extractAndUpscaleCell: protectedProcedure
    .input(z.object({
      gridImageUrl: z.string(),
      cellIndex: z.number().min(0).max(8).describe("要提取的格子索引（0-8）"),
      aspectRatio: z.enum(["1:1", "16:9", "9:16"]).default("1:1"),
    }))
    .mutation(async ({ ctx, input }) => {
      // 下载原始图片
      const response = await fetch(input.gridImageUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch grid image");
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // 获取图片尺寸
      const metadata = await sharp(imageBuffer).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error("Failed to get image dimensions");
      }

      const cols = 3;
      const rows = 3;
      const cellWidth = Math.floor(metadata.width / cols);
      const cellHeight = Math.floor(metadata.height / rows);

      const row = Math.floor(input.cellIndex / cols);
      const col = input.cellIndex % cols;
      const left = col * cellWidth;
      const top = row * cellHeight;

      // 切割单个格子
      const cellBuffer = await sharp(imageBuffer)
        .extract({
          left,
          top,
          width: cellWidth,
          height: cellHeight,
        })
        .png()
        .toBuffer();

      // 转换为 base64
      const cellBase64 = cellBuffer.toString("base64");

      // 使用 Nano Banana 高清放大到 2K
      const upscalePrompt = `保持这张图片的内容完全不变，提升清晰度和画质到高分辨率。不要修改任何内容、构图或风格，只提升图像质量。`;

      const upscaledResult = await generateImage({
        prompt: upscalePrompt,
        originalImages: [{
          b64Json: cellBase64,
          mimeType: "image/png",
        }],
        model: "gemini-3-pro-image-preview",
        aspectRatio: input.aspectRatio,
        imageSize: "2K",
        apiKey: ctx.user?.apiKey,
      });

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let upscaledUrl = upscaledResult.url || '';
      if (upscaledResult.base64 && upscaledResult.mimeType) {
        upscaledUrl = `data:${upscaledResult.mimeType};base64,${upscaledResult.base64}`;
      }

      return {
        cellIndex: input.cellIndex,
        originalUrl: input.gridImageUrl,
        upscaledUrl,
        row,
        col,
        angleName: defaultNineAngles[input.cellIndex] || `镜头 ${input.cellIndex + 1}`,
      };
    }),

  // 生成多角度九宫格（保留旧接口兼容）
  generateMultiAngleGrid: protectedProcedure
    .input(z.object({
      referenceImages: z.array(z.object({
        url: z.string(),
        type: z.enum(["character", "scene", "element"]),
        description: z.string().optional(),
      })),
      prompt: z.string().describe("场景描述和要求"),
      gridSize: z.enum(["2x2", "3x3"]).default("3x3"),
      resolution: z.enum(["2k", "4k"]).default("2k"),
      angles: z.array(z.string()).optional().describe("指定的视角列表"),
    }))
    .mutation(async ({ ctx, input }) => {
      const gridCount = input.gridSize === "3x3" ? 9 : 4;
      
      // 构建参考图片描述
      const refDescriptions = input.referenceImages.map((img, i) => {
        const typeLabel = img.type === "character" ? "角色" : img.type === "scene" ? "场景" : "元素";
        return `参考图${i + 1}（${typeLabel}）${img.description ? `: ${img.description}` : ""}`;
      }).join("\n");

      // 默认视角列表
      const defaultAngles = input.gridSize === "3x3" 
        ? defaultNineAngles
        : ["特写", "中景", "低角度", "高角度"];
      
      const angles = input.angles && input.angles.length > 0 ? input.angles : defaultAngles;
      const angleList = angles.slice(0, gridCount).join("、");

      // 构建提示词
      const fullPrompt = `生成一张${input.gridSize}的九宫格分镜图，包含${gridCount}个不同视角的镜头。

场景描述：${input.prompt}

参考图片：
${refDescriptions}

视角要求：${angleList}

要求：
1. 所有${gridCount}个镜头必须在同一张图上，按${input.gridSize}网格排列
2. 每个格子展示不同的视角/角度
3. 保持角色外观、服装、场景的一致性
4. 每个镜头都要有清晰的构图和光影
5. 分辨率：2K (2048x2048)
6. 格子之间有细微的分隔线`;

      // 调用图片生成 API（使用 Pro 模型）
      const originalImages = input.referenceImages.map(img => ({
        url: img.url,
        mimeType: "image/jpeg" as const,
      }));

      const result = await generateImage({
        prompt: fullPrompt,
        originalImages,
        model: "gemini-3-pro-image-preview",
        aspectRatio: "1:1",
        imageSize: "2K",
        apiKey: ctx.user?.apiKey,
      });

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let gridImageUrl = result.url || '';
      if (result.base64 && result.mimeType) {
        gridImageUrl = `data:${result.mimeType};base64,${result.base64}`;
      }

      return {
        gridImageUrl,
        gridSize: input.gridSize,
        resolution: "2k",
        angles: angles.slice(0, gridCount),
      };
    }),

  // 生成连续动作九宫格
  generateActionSequenceGrid: protectedProcedure
    .input(z.object({
      referenceImages: z.array(z.object({
        url: z.string(),
        type: z.enum(["character", "scene", "element"]),
        description: z.string().optional(),
      })),
      prompt: z.string().describe("动作序列描述"),
      gridSize: z.enum(["2x2", "3x3"]).default("3x3"),
      resolution: z.enum(["2k", "4k"]).default("2k"),
      actionType: z.string().optional().describe("动作类型"),
    }))
    .mutation(async ({ ctx, input }) => {
      const gridCount = input.gridSize === "3x3" ? 9 : 4;
      
      // 构建参考图片描述
      const refDescriptions = input.referenceImages.map((img, i) => {
        const typeLabel = img.type === "character" ? "角色" : img.type === "scene" ? "场景" : "元素";
        return `参考图${i + 1}（${typeLabel}）${img.description ? `: ${img.description}` : ""}`;
      }).join("\n");

      // 构建提示词
      const fullPrompt = `生成一张${input.gridSize}的连续动作分镜图，展示${gridCount}个连续的动作帧。

动作描述：${input.prompt}

参考图片：
${refDescriptions}

要求：
1. 所有${gridCount}个帧必须在同一张图上，按${input.gridSize}网格排列
2. 从左到右、从上到下展示动作的连续变化
3. 保持角色外观、服装、场景的完全一致性
4. 每帧之间的动作变化要流畅自然
5. 分辨率：2K (2048x2048)
6. 格子之间有细微的分隔线
7. 动作类型：${input.actionType || "自然动作"}`;

      // 调用图片生成 API（使用 Pro 模型）
      const originalImages = input.referenceImages.map(img => ({
        url: img.url,
        mimeType: "image/jpeg" as const,
      }));

      const result = await generateImage({
        prompt: fullPrompt,
        originalImages,
        model: "gemini-3-pro-image-preview",
        aspectRatio: "1:1",
        imageSize: "2K",
        apiKey: ctx.user?.apiKey,
      });

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let gridImageUrl = result.url || '';
      if (result.base64 && result.mimeType) {
        gridImageUrl = `data:${result.mimeType};base64,${result.base64}`;
      }

      return {
        gridImageUrl,
        gridSize: input.gridSize,
        resolution: "2k",
        frameCount: gridCount,
      };
    }),

  // 切割九宫格图片，提取单个镜头（保留旧接口）
  splitGridImage: protectedProcedure
    .input(z.object({
      gridImageUrl: z.string(),
      gridSize: z.enum(["2x2", "3x3"]),
      selectedCells: z.array(z.number()).optional().describe("要提取的格子索引（0-8），不传则提取全部"),
    }))
    .mutation(async ({ ctx, input }) => {
      const cols = input.gridSize === "3x3" ? 3 : 2;
      const rows = cols;
      const totalCells = cols * rows;

      // 下载原始图片
      const response = await fetch(input.gridImageUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch grid image");
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // 获取图片尺寸
      const metadata = await sharp(imageBuffer).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error("Failed to get image dimensions");
      }

      const cellWidth = Math.floor(metadata.width / cols);
      const cellHeight = Math.floor(metadata.height / rows);

      // 确定要提取的格子
      const cellsToExtract = input.selectedCells && input.selectedCells.length > 0
        ? input.selectedCells.filter(i => i >= 0 && i < totalCells)
        : Array.from({ length: totalCells }, (_, i) => i);

      // 切割并保存每个格子
      const extractedImages: Array<{
        index: number;
        url: string;
        row: number;
        col: number;
      }> = [];

      for (const cellIndex of cellsToExtract) {
        const row = Math.floor(cellIndex / cols);
        const col = cellIndex % cols;
        const left = col * cellWidth;
        const top = row * cellHeight;

        // 切割单个格子
        const cellBuffer = await sharp(imageBuffer)
          .extract({
            left,
            top,
            width: cellWidth,
            height: cellHeight,
          })
          .png()
          .toBuffer();

        // 保存到 S3
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileKey = `storyboard-workbench/${ctx.user.id}/cell-${cellIndex}-${Date.now()}-${randomSuffix}.png`;
        const { url } = await storagePut(fileKey, cellBuffer, "image/png");

        extractedImages.push({
          index: cellIndex,
          url,
          row,
          col,
        });
      }

      return {
        extractedImages,
        gridSize: input.gridSize,
        cellDimensions: {
          width: cellWidth,
          height: cellHeight,
        },
      };
    }),

  // 生成单个主体视角图片
  generateSubjectView: protectedProcedure
    .input(z.object({
      subjectImageBase64: z.string().describe("主体图片的 base64 编码"),
      subjectImageMimeType: z.string().default("image/png"),
      viewType: z.enum(["closeup", "halfbody", "threeview", "accessories"]).describe("视角类型"),
      aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1").describe("画面比例"),
    }))
    .mutation(async ({ ctx, input }) => {
      // 风格一致性前置指令（最重要）
      const styleConsistencyPrefix = `**CRITICAL - ART STYLE PRESERVATION:**
First, analyze the art style of the input image (e.g., anime/manga, realistic, cartoon, 3D render, watercolor, pixel art, etc.).
You MUST generate the output in EXACTLY THE SAME ART STYLE as the input image.
- If the input is anime/manga style → output MUST be anime/manga style
- If the input is realistic → output MUST be realistic
- If the input is cartoon → output MUST be cartoon
DO NOT change the art style under any circumstances.

`;

      // 根据视角类型构建不同的提示词
      let prompt = "";
      let viewLabel = "";
      
      switch (input.viewType) {
        case "closeup":
          viewLabel = "正面特写";
          prompt = `${styleConsistencyPrefix}基于输入的主体图片，生成一张正面特写图片。

要求：
1. **保持与原图完全相同的艺术风格**（动漫风格保持动漫，写实风格保持写实）
2. 展示主体的面部特写，清晰展现五官特征
3. 保持主体的外貌、发型、肤色、瞳色等特征完全一致
4. 正面视角，光线均匀
5. 背景简洁干净，突出主体
6. 高清画质，细节丰富`;
          break;
        case "halfbody":
          viewLabel = "正面半身照";
          prompt = `${styleConsistencyPrefix}基于输入的主体图片，生成一张正面半身照。

要求：
1. **保持与原图完全相同的艺术风格**（动漫风格保持动漫，写实风格保持写实）
2. 展示主体的上半身（从头部到腰部）
3. 正面视角，展示服装和身体特征
4. 保持主体的外貌、服装、配饰完全一致
5. 背景简洁干净
6. 高清画质`;
          break;
        case "threeview":
          viewLabel = "三视图";
          prompt = `${styleConsistencyPrefix}基于输入的主体图片，生成一张三视图合成图，在同一张图上展示三个视角。

要求：
1. **保持与原图完全相同的艺术风格**（动漫风格保持动漫，写实风格保持写实）
2. 左侧：正面全身照 - 展示主体的正面全身
3. 中间：侧面全身照 - 展示主体的侧面全身
4. 右侧：背面全身照 - 展示主体的背面全身
5. 三个视角并排在同一张图上，有细微分隔
6. 保持主体的外貌、服装、特征在所有视角中完全一致
7. 背景简洁干净，突出主体
8. 高清画质`;
          break;
        case "accessories":
          viewLabel = "服饰/道具";
          prompt = `${styleConsistencyPrefix}基于输入的主体图片，自动识别并生成主体的服饰和道具特写图。

要求：
1. **保持与原图完全相同的艺术风格**（动漫风格保持动漫，写实风格保持写实）
2. 自动识别主体身上的特色服饰、配饰、道具、武器等
3. 展示这些物品的特写细节
4. 可以是单个物品特写，也可以是多个物品的组合展示
5. 保持物品的颜色、材质、细节完全一致
6. 背景简洁干净，突出物品
7. 高清画质，细节清晰`;
          break;
      }

      // 调用图片生成 API
      const result = await generateImage({
        prompt,
        originalImages: [{
          b64Json: input.subjectImageBase64,
          mimeType: input.subjectImageMimeType,
        }],
        model: "gemini-3-pro-image-preview",
        aspectRatio: input.aspectRatio,
        imageSize: "2K",
        apiKey: ctx.user?.apiKey || undefined,
      });

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let imageUrl = result.url || '';
      if (result.base64 && result.mimeType) {
        imageUrl = `data:${result.mimeType};base64,${result.base64}`;
      }

      return {
        imageUrl,
        viewType: input.viewType,
        viewLabel,
        aspectRatio: input.aspectRatio,
      };
    }),

  // 生成主体多视图（16:9 合成图）- 保留旧接口兼容
  generateSubjectMultiView: protectedProcedure
    .input(z.object({
      subjectImageBase64: z.string().describe("主体图片的 base64 编码"),
      subjectImageMimeType: z.string().default("image/png"),
    }))
    .mutation(async ({ ctx, input }) => {
      // 构建提示词，要求生成 5 个视角的合成图
      const fullPrompt = `**CRITICAL - ART STYLE PRESERVATION:**
First, analyze the art style of the input image (e.g., anime/manga, realistic, cartoon, 3D render, etc.).
You MUST generate the output in EXACTLY THE SAME ART STYLE as the input image.
- If the input is anime/manga style → output MUST be anime/manga style
- If the input is realistic → output MUST be realistic
DO NOT change the art style under any circumstances.

基于输入的主体图片，生成一张 16:9 的多视角合成图。

要求在一张图上展示以下 5 个视角，水平排列：
1. 正面特写 - 面部特写，展示主体的面部细节
2. 人物佩饰和道具特写 - 展示主体的配饰、道具、特殊物品的特写
3. 正面全身照 - 展示主体的正面全身
4. 侧面全身照 - 展示主体的侧面全身
5. 背面全身照 - 展示主体的背面全身

要求：
1. **保持与原图完全相同的艺术风格**（动漫风格保持动漫，写实风格保持写实）
2. 保持主体的外观、服装、特征完全一致
3. 5 个视角在同一张图上水平排列
4. 每个视角之间有细微的分隔
5. 背景简洁干净，突出主体
6. 分辨率 2K，比例 16:9`;

      // 调用图片生成 API（使用 Pro 模型支持高分辨率）
      const result = await generateImage({
        prompt: fullPrompt,
        originalImages: [{
          b64Json: input.subjectImageBase64,
          mimeType: input.subjectImageMimeType,
        }],
        model: "gemini-3-pro-image-preview",
        aspectRatio: "16:9",
        imageSize: "2K",
        apiKey: ctx.user?.apiKey || undefined,
      });

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let imageUrl = result.url || '';
      if (result.base64 && result.mimeType) {
        imageUrl = `data:${result.mimeType};base64,${result.base64}`;
      }

      return {
        imageUrl,
      };
    }),

  // 高清放大图片
  upscaleImage: protectedProcedure
    .input(z.object({
      imageUrl: z.string().describe("要放大的图片URL"),
    }))
    .mutation(async ({ ctx, input }) => {
      // 下载原始图片
      const response = await fetch(input.imageUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch image");
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const imageBase64 = imageBuffer.toString("base64");

      // 使用 Nano Banana 高清放大
      const upscalePrompt = `保持这张图片的内容完全不变，提升清晰度和画质到高分辨率。不要修改任何内容、构图或风格，只提升图像质量。`;

      const result = await generateImage({
        prompt: upscalePrompt,
        originalImages: [{
          b64Json: imageBase64,
          mimeType: "image/png",
        }],
        model: "gemini-3-pro-image-preview",
        aspectRatio: "1:1",
        imageSize: "2K",
        apiKey: ctx.user?.apiKey,
      });

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let upscaledUrl = result.url || '';
      if (result.base64 && result.mimeType) {
        upscaledUrl = `data:${result.mimeType};base64,${result.base64}`;
      }

      return {
        originalUrl: input.imageUrl,
        upscaledUrl,
      };
    }),

  // 获取默认视角列表
  getDefaultAngles: protectedProcedure.query(() => {
    return defaultNineAngles.map((angle, index) => ({
      index,
      label: angle,
    }));
  }),

  // AI 自动识别图片内容，生成场景描述（接受 base64）
  analyzeImage: protectedProcedure
    .input(z.object({
      imageBase64: z.string().describe("图片的 base64 编码"),
      imageMimeType: z.string().default("image/jpeg"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { geminiGenerateContent } = await import("./_core/gemini");
      
      // 使用 Gemini 的多模态能力分析图片
      const result = await geminiGenerateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: input.imageMimeType,
                  data: input.imageBase64,
                },
              },
              {
                text: `分析图片中的两个人物，用于生成正反打镜头。

**要求**：
1. 用具体特征命名角色（如"浅色长袍青年"、"戴帽老者"），不要用"男子"、"对方"
2. 每个角色只写一句话：服装颜色+关键特征
3. 环境和光线各一句话

**输出格式**（严格限制字数）：
场景：[一句话概述，不超过30字]
角色A（[特征名]）：[服装+特征，不超过20字]
角色B（[特征名]）：[服装+特征，不超过20字]
环境：[一句话，不超过20字]
光线：[一句话，不超过15字]

请用中文输出，保持简洁。`,
              },
            ],
          },
        ],
        apiKey: ctx.user?.apiKey,
      });

      return {
        description: result.text.trim(),
      };
    }),

  // 定格九宫格专用 - AI识别场景内容（支持base64或URL）
  analyzeImageForFreezeFrame: protectedProcedure
    .input(z.object({
      imageBase64: z.string().optional().describe("图片的 base64 编码"),
      imageMimeType: z.string().default("image/jpeg"),
      imageUrl: z.string().optional().describe("图片URL，当imageBase64不提供时使用"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { geminiGenerateContent } = await import("./_core/gemini");
      
      let imageBase64 = input.imageBase64;
      let mimeType = input.imageMimeType;
      
      // 如果没有提供base64，但提供了URL，则从服务器端下载图片
      if (!imageBase64 && input.imageUrl) {
        if (input.imageUrl.startsWith("data:")) {
          const match = input.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            imageBase64 = match[2];
          } else {
            throw new Error("无效的 base64 图片格式");
          }
        } else {
          // 使用带重试的下载函数
          const { buffer, mimeType: fetchedMimeType } = await fetchImageWithRetry(input.imageUrl);
          mimeType = fetchedMimeType;
          imageBase64 = buffer.toString("base64");
        }
      }
      
      if (!imageBase64) {
        throw new Error("请提供图片数据");
      }
      
      const result = await geminiGenerateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              {
                text: `请分析这张图片，生成用于定格九宫格分镜的场景描述。

**要求**：
1. 描述画面中的主体（人物/角色/物体）及其特征
2. 描述场景环境（地点/背景/氛围）
3. 描述画面的视角、构图和光线
4. 保持描述简洁，不超过80字
5. 使用中文描述

只输出描述文本，不要其他内容。`,
              },
            ],
          },
        ],
        apiKey: ctx.user?.apiKey,
      });

      return {
        description: result.text.trim(),
      };
    }),

  // 动态九宫格专用 - AI识别场景内容
  analyzeImageForDynamicSequence: protectedProcedure
    .input(z.object({
      imageUrl: z.string().describe("图片URL或base64"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { geminiGenerateContent } = await import("./_core/gemini");
      
      // 处理输入格式
      let imageBase64: string;
      let mimeType = "image/jpeg";
      
      if (input.imageUrl.startsWith("data:")) {
        const match = input.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          imageBase64 = match[2];
        } else {
          throw new Error("无效的 base64 图片格式");
        }
      } else {
        // 使用带重试的下载函数
        const { buffer, mimeType: fetchedMimeType } = await fetchImageWithRetry(input.imageUrl);
        mimeType = fetchedMimeType;
        imageBase64 = buffer.toString("base64");
      }
      
      const result = await geminiGenerateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              {
                text: `请分析这张图片，生成用于动态九宫格分镜的场景描述。

**要求**：
1. 描述画面中的主体（人物/角色/物体）及其动作状态
2. 描述场景环境和氛围
3. 描述画面的视角和光线
4. 保持描述简洁，不超过80字
5. 使用中文描述

只输出描述文本，不要其他内容。`,
              },
            ],
          },
        ],
        apiKey: ctx.user?.apiKey,
      });

      return {
        description: result.text.trim(),
      };
    }),

  // 正反打镜头专用 - AI识别两个角色（支持base64或URL）
  analyzeImageForShotReverseShot: protectedProcedure
    .input(z.object({
      imageBase64: z.string().optional().describe("图片的 base64 编码"),
      imageMimeType: z.string().default("image/jpeg"),
      imageUrl: z.string().optional().describe("图片URL，当imageBase64不提供时使用"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { geminiGenerateContent } = await import("./_core/gemini");
      
      let imageBase64 = input.imageBase64;
      let mimeType = input.imageMimeType;
      
      // 如果没有提供base64，但提供了URL，则从服务器端下载图片
      if (!imageBase64 && input.imageUrl) {
        if (input.imageUrl.startsWith("data:")) {
          const match = input.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            imageBase64 = match[2];
          } else {
            throw new Error("无效的 base64 图片格式");
          }
        } else {
          // 使用带重试的下载函数
          const { buffer, mimeType: fetchedMimeType } = await fetchImageWithRetry(input.imageUrl);
          mimeType = fetchedMimeType;
          imageBase64 = buffer.toString("base64");
        }
      }
      
      if (!imageBase64) {
        throw new Error("请提供图片数据");
      }
      
      const result = await geminiGenerateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              {
                text: `分析图片中的两个人物，用于生成正反打镜头。

**要求**：
1. 用具体特征命名角色（如“浅色长袍青年”、“戴帽老者”），不要用“男子”、“对方”
2. 每个角色只写一句话：服装颜色+关键特征
3. 环境和光线各一句话

**输出格式**（严格限制字数）：
场景：[一句话概述，不超过30字]
角色A（[特征名]）：[服装+特征，不超过20字]
角色B（[特征名]）：[服装+特征，不超过20字]
环境：[一句话，不超过20字]
光线：[一句话，不超过15字]

请用中文输出，保持简洁。`,
              },
            ],
          },
        ],
      });

      return {
        description: result.text.trim(),
      };
    }),

  // AI 自动识别图片内容，生成场景描述（接受 URL）
  describeImage: protectedProcedure
    .input(z.object({
      imageUrl: z.string().describe("图片 URL"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { geminiGenerateContent } = await import("./_core/gemini");
      
      // 下载图片并转换为 base64
      let imageBase64: string;
      let mimeType = "image/jpeg";
      
      if (input.imageUrl.startsWith("data:")) {
        // 已经是 base64 格式
        const match = input.imageUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          imageBase64 = match[2];
        } else {
          throw new Error("无效的 base64 图片格式");
        }
      } else {
        // 使用带重试的下载函数
        const { buffer, mimeType: fetchedMimeType } = await fetchImageWithRetry(input.imageUrl);
        mimeType = fetchedMimeType;
        imageBase64 = buffer.toString("base64");
      }
      
      // 使用 Gemini 的多模态能力分析图片
      const result = await geminiGenerateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
              {
                text: `请分析这张图片，生成一个简洁的内容描述。

要求：
1. 描述图片中的主体（人物/角色/物体）
2. 描述场景环境（地点/背景/氛围）
3. 描述主体的特征（服装/姿态/表情）
4. 描述画面的视角和构图
5. 保持描述简洁，不超过 80 字
6. 使用中文描述

只输出描述文本，不要其他内容。`,
              },
            ],
          },
        ],
        apiKey: ctx.user?.apiKey,
      });

      return {
        description: result.text.trim(),
      };
    }),

  // 生成正反打镜头
  generateShotReverseShot: protectedProcedure
    .input(z.object({
      referenceImageUrl: z.string().describe("参考图片 URL"),
      shotType: z.enum(["a_to_b", "a_pov", "b_pov", "b_to_a"]).describe("镜头类型"),
      characterA: z.string().describe("角色A的名称"),
      characterB: z.string().describe("角色B的名称"),
      sceneDescription: z.string().describe("场景描述"),
      aspectRatio: z.enum(["1:1", "16:9", "9:16"]).default("16:9"),
    }))
    .mutation(async ({ ctx, input }) => {
      // 下载参考图片并转换为 base64
      const response = await fetch(input.referenceImageUrl);
      if (!response.ok) {
        throw new Error("下载参考图片失败");
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const imageBase64 = imageBuffer.toString("base64");

      // 根据镜头类型构建提示词
      let shotDescription = "";
      let cameraPosition = "";
      
      switch (input.shotType) {
        case "a_to_b":
          shotDescription = `Shot from behind ${input.characterA}, showing ${input.characterB}'s face (over-the-shoulder shot)`;
          cameraPosition = `Camera positioned behind ${input.characterA}'s shoulder, capturing ${input.characterB} in frame`;
          break;
        case "a_pov":
          shotDescription = `Point-of-view shot from ${input.characterA}'s perspective, seeing what ${input.characterA} sees`;
          cameraPosition = `Camera IS ${input.characterA}'s eyes, showing ${input.characterB} as ${input.characterA} would see them`;
          break;
        case "b_pov":
          shotDescription = `Point-of-view shot from ${input.characterB}'s perspective, seeing what ${input.characterB} sees`;
          cameraPosition = `Camera IS ${input.characterB}'s eyes, showing ${input.characterA} as ${input.characterB} would see them`;
          break;
        case "b_to_a":
          shotDescription = `Shot from behind ${input.characterB}, showing ${input.characterA}'s face (over-the-shoulder shot)`;
          cameraPosition = `Camera positioned behind ${input.characterB}'s shoulder, capturing ${input.characterA} in frame`;
          break;
      }

      const fullPrompt = `Generate a CINEMATIC shot-reverse-shot (正反打) image that looks like it's from the EXACT SAME SCENE as the reference.

**REFERENCE SCENE ANALYSIS** (MUST preserve ALL these elements):
${input.sceneDescription}

**SHOT TYPE**: ${shotDescription}
**CAMERA POSITION**: ${cameraPosition}

**ABSOLUTE SCENE CONSISTENCY REQUIREMENTS**:
1. **IDENTICAL LIGHTING**: Same light direction, intensity, color temperature, shadows, and highlights as reference
2. **IDENTICAL ENVIRONMENT**: Same background elements, walls, furniture, props, decorations - NOTHING added or removed
3. **IDENTICAL ATMOSPHERE**: Same color grading, mood, time of day, weather conditions
4. **IDENTICAL CHARACTERS**: Same face, hair style, clothing, accessories, skin tone - pixel-perfect consistency
5. **IDENTICAL ART STYLE**: Same rendering style, texture quality, level of detail
6. **SPATIAL CONSISTENCY**: Objects and characters maintain their relative positions in 3D space

**PROFESSIONAL CINEMATOGRAPHY RULES**:
- This is a CONTINUITY SHOT - it must feel like pressing "cut" to a different camera angle in the same moment
- The viewer should believe both shots were captured simultaneously by different cameras
- NO changes to scene elements, lighting setup, or character appearances
- Only the camera viewpoint changes

**NEGATIVE CONSTRAINTS** (DO NOT):
- Do NOT change the background or environment in any way
- Do NOT alter lighting direction or color
- Do NOT modify character clothing or appearance
- Do NOT add or remove any props or objects
- Do NOT change the art style or color palette

The output MUST look like a frame from the SAME MOVIE SCENE, captured at the SAME MOMENT, just from a different camera angle.`;

      // 调用图片生成 API
      const result = await generateImage({
        prompt: fullPrompt,
        originalImages: [{
          b64Json: imageBase64,
          mimeType: "image/png",
        }],
        model: "gemini-3-pro-image-preview",
        aspectRatio: input.aspectRatio,
        imageSize: "2K",
        apiKey: ctx.user?.apiKey,
      });

      // 生成描述
      let description = "";
      switch (input.shotType) {
        case "a_to_b":
          description = `${input.characterA}→${input.characterB}方向：镜头在${input.characterA}身后，拍摄${input.characterB}的正面`;
          break;
        case "a_pov":
          description = `${input.characterA}的视野：以${input.characterA}的视角看向${input.characterB}`;
          break;
        case "b_pov":
          description = `${input.characterB}的视野：以${input.characterB}的视角看向${input.characterA}`;
          break;
        case "b_to_a":
          description = `${input.characterB}→${input.characterA}方向：镜头在${input.characterB}身后，拍摄${input.characterA}的正面`;
          break;
      }

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let imageUrl = result.url || '';
      if (result.base64 && result.mimeType) {
        imageUrl = `data:${result.mimeType};base64,${result.base64}`;
      }

      return {
        imageUrl,
        shotType: input.shotType,
        description,
      };
    }),

  // 生成动态九宫格（连续电影级序列）
  generateDynamicNineGrid: protectedProcedure
    .input(z.object({
      referenceImageUrl: z.string().describe("参考图片 URL 或 base64"),
      sceneDescription: z.string().describe("场景描述"),
      dynamicAction: z.string().describe("动态状态描述"),
      aspectRatio: z.enum(["1:1", "16:9", "9:16"]).default("1:1"),
    }))
    .mutation(async ({ ctx, input }) => {
      // 处理图片：支持 URL 或 base64
      let imageBase64: string;
      let imageMimeType: string = "image/png";

      if (input.referenceImageUrl.startsWith("data:")) {
        // base64 格式
        const parts = input.referenceImageUrl.split(",");
        imageBase64 = parts[1];
        const mimeMatch = parts[0].match(/data:([^;]+);/);
        if (mimeMatch) {
          imageMimeType = mimeMatch[1];
        }
      } else {
        // URL 格式，下载并转换
        const response = await fetch(input.referenceImageUrl);
        if (!response.ok) {
          throw new Error("下载参考图片失败");
        }
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        imageBase64 = imageBuffer.toString("base64");
        const contentType = response.headers.get("content-type");
        if (contentType) {
          imageMimeType = contentType;
        }
      }

      // 根据比例调整图片
      const adjustedImage = await adjustImageBase64ForAspectRatio(
        imageBase64,
        imageMimeType,
        input.aspectRatio,
        ctx.user?.apiKey
      );

      // 根据比例设置不同的提示词细节
      let aspectDescription = "";
      let gridDescription = "";
      switch (input.aspectRatio) {
        case "16:9":
          aspectDescription = "横屏格式（16:9）";
          gridDescription = "每个格子都是横向的16:9比例";
          break;
        case "9:16":
          aspectDescription = "竖屏格式（9:16）";
          gridDescription = "每个格子都是竖向的9:16比例，适合手机屏幕观看";
          break;
        default:
          aspectDescription = "正方形格式（1:1）";
          gridDescription = "每个格子都是正方形的1:1比例";
      }

      // 构建电影级动态序列提示词 - 强调角色一致性
      const fullPrompt = `**CRITICAL: CHARACTER CONSISTENCY IS THE TOP PRIORITY**

Look at the reference image carefully. You MUST recreate THE EXACT SAME CHARACTER in all 9 frames:
- SAME face features, hairstyle, hair color
- SAME body type, height, proportions  
- SAME clothing (exact same outfit, colors, patterns, accessories)
- SAME skin tone and physical features

This character performs: "${input.dynamicAction}"
Scene: ${input.sceneDescription}

Create a 3x3 grid (9 frames) showing this ONE CHARACTER performing the action sequence.

**FRAME SEQUENCE** (left to right, top to bottom):
1. Action begins - starting pose
2. Action develops
3. Building momentum
4. Tension increases
5. Peak/climax moment
6. Immediate aftermath
7. Action resolving
8. Transition to end
9. Final pose/state

**MANDATORY REQUIREMENTS**:
1. **SAME CHARACTER IN ALL 9 FRAMES** - This is the MOST IMPORTANT rule. The person must be recognizable as the EXACT SAME individual across all frames.
2. Aspect ratio: ${aspectDescription} for each panel
3. ${gridDescription}
4. Consistent lighting direction and color temperature
5. Same background/environment style
6. Thin white separator lines between panels
7. Professional cinematography storyboard quality

DO NOT create 9 different people. It must be ONE person shown 9 times in different poses.`;

      // 调用图片生成 API
      const result = await generateImage({
        prompt: fullPrompt,
        originalImages: [{
          b64Json: adjustedImage.base64,
          mimeType: adjustedImage.mimeType,
        }],
        model: "gemini-3-pro-image-preview",
        aspectRatio: input.aspectRatio, // 使用用户选择的比例
        imageSize: "2K",
        apiKey: ctx.user?.apiKey,
      });

      // 生成帧描述
      const frameDescriptions = [
        "开场/建立时刻",
        "动作开始",
        "动作发展",
        "动作继续",
        "高潮/关键时刻",
        "动作延续",
        "动作收尾",
        "结束过渡",
        "最终状态",
      ];

      // 优先使用 base64 数据 URL（S3 URL 可能有 403 问题）
      let gridImageUrl = result.url || '';
      if (result.base64 && result.mimeType) {
        gridImageUrl = `data:${result.mimeType};base64,${result.base64}`;
      }

      return {
        gridImageUrl,
        aspectRatio: input.aspectRatio,
        frameDescriptions,
        dynamicAction: input.dynamicAction,
      };
    }),
});
