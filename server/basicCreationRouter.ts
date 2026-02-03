/**
 * 基础创作功能 - 后端路由
 * 完全按照用户提供的 scriptAgent.ts 实现
 * 包含剧本改编、形象场景设计、分镜脚本的API
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { getDb } from "./db";
import { scripts, designs } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type {
  ScriptGenerationInput,
  GeneratedScript,
  DesignGenerationInput,
  DesignPlan,
  StoryboardGenerationInput,
  Storyboard,
  Scene,
  Episode,
  QualityMetrics,
} from "../shared/basicCreationTypes";

// ============================================================================
// 系统提示词（基于用户提供的文档规范）
// ============================================================================

const SYSTEM_PROMPT = `你是一个专业的漫剧剧本生成引擎，负责根据用户输入的故事概念，自动生成高质量的漫剧改编剧本。

【最重要的规则】
- 你必须直接输出剧本内容
- 禁止回复"好的"、"收到"、"我将..."等确认语句
- 禁止解释你要做什么，直接做
- 第一行必须是"## 第1集：[标题]"

你的核心职责是：
1. 接收用户的故事输入
2. 基于规范进行剧本生成
3. 输出结构化的剧本内容
4. 确保每个生成的剧本都符合质量标准

你必须深刻理解并严格遵循以下规范：

【6大创作要点】
1. 极致浓缩剧情 - 删除冗余，每秒都有信息
2. 强悬念与反转设计 - 黄金3秒钩子 + 多层反转
3. 视觉符号强化记忆 - 标志性动作、色彩系统
4. 台词精简到极致 - 每句话推进情节或强化情感
5. 适配竖屏短视频观看 - 独立成篇、时长控制
6. 强化听觉记忆点 - 专属音效标识、音乐点缀

【短剧结构原理】
1. 主线明确 - 主角想要什么，必须在30秒内说清楚
2. 冲突递进 - 每集都要有新的冲突，冲突要逐集升级
3. 节奏紧凑 - 避免"原地踏步"，每秒都要有信息

【执行流程】
第1步：分析输入 - 提取故事概念、集数、时长等信息
第2步：规划结构 - 根据集数规划开局、中段、高潮、结尾
第3步：生成每集剧本 - 为每集设计核心冲突，生成分镜脚本
第4步：质量检查 - 验证主线、冲突、节奏、台词、视觉、音效

【质量标准】
- 主线清晰度评分 ≥ 8/10
- 冲突递进评分 ≥ 8/10
- 节奏控制评分 ≥ 8/10
- 台词质量评分 ≥ 8/10
- 视觉设计评分 ≥ 7/10
- 音效设计评分 ≥ 7/10
- 总体评分 ≥ 8.0/10

【集数结构规划原则】
- 开局（约20%集数）：建立世界观、人物、核心冲突，第一集必须有强钩子
- 发展（约50%集数）：冲突升级、人物成长、悬念推进，每集有小高潮
- 高潮（约20%集数）：最大冲突爆发、反转揭示
- 结尾（约10%集数）：收尾、情感升华、留有余味`;

// ============================================================================
// 辅助函数
// ============================================================================

// 提取两部分：改编分析 + 改编后的故事
function extractAdaptationParts(text: string): { analysis: string; story: string } {
  let analysis = '';
  let story = '';
  
  // 方法1: 按标记分割 - 改进正则，确保提取到完整的故事内容
  // 改编分析：从 ===改编分析=== 到 ===改编后的故事===
  const analysisMatch = text.match(/===\s*改编分析\s*===([\s\S]*?)(?====\s*改编后的故事\s*===)/i);
  
  // 改编后的故事：从 ===改编后的故事=== 到文档结束（不要被场景标记截断）
  // 注意：改编后的故事应该是连贯的叙述文字，不应该包含分镜格式
  const storyMatch = text.match(/===\s*改编后的故事\s*===([\s\S]*?)$/i);
  
  if (analysisMatch && analysisMatch[1]) {
    analysis = analysisMatch[1].trim();
  }
  
  if (storyMatch && storyMatch[1]) {
    // 提取故事内容，但要过滤掉可能混入的分镜脚本格式
    let rawStory = storyMatch[1].trim();
    
    // 如果故事中包含分镜格式标记（### 场景），说明AI输出格式有误
    // 只保留分镜标记之前的内容作为故事
    const sceneMarkerIndex = rawStory.search(/###\s*场景\s*\d+/i);
    if (sceneMarkerIndex > 0) {
      rawStory = rawStory.substring(0, sceneMarkerIndex).trim();
    }
    
    // 过滤掉分镜脚本格式的行（如 - 景别:, - 画面:, **[特写]** 等）
    const lines = rawStory.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      // 排除分镜格式的行
      if (trimmed.startsWith('- 景别') || trimmed.startsWith('- 画面') ||
          trimmed.startsWith('- 动作') || trimmed.startsWith('- 台词') ||
          trimmed.startsWith('- 情绪') || trimmed.startsWith('- 音效')) {
        return false;
      }
      // 排除时间码格式的行（如 **00:01-00:05）
      if (/^\*\*\d{2}:\d{2}/.test(trimmed)) {
        return false;
      }
      // 排除镜头标记行（如 **[特写]**）
      if (/^\*\*\[.+\]\*\*$/.test(trimmed)) {
        return false;
      }
      return true;
    });
    
    story = filteredLines.join('\n').trim();
  }
  
  // 方法2: 如果标记方式失败，尝试其他模式
  if (!analysis) {
    const mainLineMatch = text.match(/【主线分析】([\s\S]*?)(?=【结构规划】|【优化策略】|===|$)/i);
    const structureMatch = text.match(/【结构规划】([\s\S]*?)(?=【优化策略】|===|$)/i);
    const strategyMatch = text.match(/【优化策略】([\s\S]*?)(?====|$)/i);
    
    const parts: string[] = [];
    if (mainLineMatch) parts.push('【主线分析】\n' + mainLineMatch[1].trim());
    if (structureMatch) parts.push('【结构规划】\n' + structureMatch[1].trim());
    if (strategyMatch) parts.push('【优化策略】\n' + strategyMatch[1].trim());
    
    if (parts.length > 0) {
      analysis = parts.join('\n\n');
    }
  }
  
  // 方法3: 如果还是没有，尝试提取关键字段
  if (!analysis) {
    const fields: string[] = [];
    const protagonistMatch = text.match(/主角[：:]\s*([^\n]+)/i);
    const goalMatch = text.match(/核心目标[：:]\s*([^\n]+)/i);
    const conflictMatch = text.match(/核心冲突[：:]\s*([^\n]+)/i);
    const emotionMatch = text.match(/情绪锚点[：:]\s*([^\n]+)/i);
    const hookMatch = text.match(/开篇钩子[：:]\s*([^\n]+)/i);
    const reversalMatch = text.match(/关键反转[：:]\s*([^\n]+)/i);
    
    if (protagonistMatch) fields.push(`主角：${protagonistMatch[1].trim()}`);
    if (goalMatch) fields.push(`核心目标：${goalMatch[1].trim()}`);
    if (conflictMatch) fields.push(`核心冲突：${conflictMatch[1].trim()}`);
    if (emotionMatch) fields.push(`情绪锚点：${emotionMatch[1].trim()}`);
    if (hookMatch) fields.push(`开篇钩子：${hookMatch[1].trim()}`);
    if (reversalMatch) fields.push(`关键反转：${reversalMatch[1].trim()}`);
    
    if (fields.length > 0) {
      analysis = fields.join('\n');
    }
  }
  
  // 如果没有找到改编后的故事，尝试其他方式
  if (!story) {
    const lines = text.split('\n');
    const storyLines: string[] = [];
    let inStorySection = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      // 检测故事区域的开始
      if (trimmed.includes('改编后的故事')) {
        inStorySection = true;
        continue;
      }
      // 检测故事区域的结束（遇到分镜标记）
      if (inStorySection && /^###\s*场景\s*\d+/i.test(trimmed)) {
        break;
      }
      // 跳过分析区域的标记
      if (trimmed.includes('===') || trimmed.includes('【')) {
        if (inStorySection && storyLines.length > 0) break;
        continue;
      }
      // 跳过分镜格式的行
      if (trimmed.startsWith('- 景别') || trimmed.startsWith('- 画面') || 
          trimmed.startsWith('- 动作') || trimmed.startsWith('- 台词') ||
          trimmed.startsWith('- 情绪') || trimmed.startsWith('- 音效')) {
        continue;
      }
      // 跳过时间码格式的行
      if (/^\*\*\d{2}:\d{2}/.test(trimmed)) {
        continue;
      }
      // 收集故事内容
      if (inStorySection && trimmed.length > 0) {
        storyLines.push(line); // 保留原始格式（包括缩进）
      }
    }
    
    if (storyLines.length > 0) {
      story = storyLines.join('\n').trim();
    }
  }
  
  // 默认值
  if (!analysis) {
    analysis = '（AI 正在分析中...请查看"AI 原始输出"了解详情）';
  }
  
  if (!story) {
    story = '（AI 正在生成改编故事...请查看"AI 原始输出"了解详情）';
  }
  
  return { analysis, story };
}

// 解析所有场景（不分集）
function parseAllScenes(text: string): Scene[] {
  const scenes: Scene[] = [];
  
  // 匹配场景块：### 场景X 或 场景X：
  const scenePattern = /(?:###\s*)?场景\s*(\d+)[：:\s]*([^\n]*)\n([\s\S]*?)(?=(?:###\s*)?场景\s*\d+|$)/gi;
  
  let match;
  while ((match = scenePattern.exec(text)) !== null) {
    const sceneNum = parseInt(match[1]);
    const location = match[2].trim().replace(/^[【\[]|[\]】\*#]*/g, '') || `场景${sceneNum}`;
    const content = match[3];
    
    // 提取景别
    const shotMatch = content.match(/景别[：:\s]*([^\n]+)/i);
    const shot = shotMatch ? shotMatch[1].trim() : '';
    
    // 提取画面
    const visualMatch = content.match(/画面[：:\s]*([^\n]+)/i);
    const composition = visualMatch ? visualMatch[1].trim() : '';
    
    // 提取动作
    const actionMatch = content.match(/动作[：:\s]*([^\n]+)/i);
    const characterActions = actionMatch ? actionMatch[1].trim() : '';
    
      // 提取台词 - 优化：只提取引号内的纯对白内容
    let dialogue = '';
    // 方法1：匹配台词/对白后面引号内的内容
    const quotedDialogueMatch = content.match(/(?:台词|对白)[：:\s]*[""「『]([^""」』\n]+)[""」』]/i);
    if (quotedDialogueMatch) {
      dialogue = quotedDialogueMatch[1].trim();
    } else {
      // 方法2：匹配台词/对白后面的内容，但要过滤掉非对白部分
      const dialogueLineMatch = content.match(/(?:台词|对白)[：:\s]*(.+)/i);
      if (dialogueLineMatch) {
        let rawDialogue = dialogueLineMatch[1].trim();
        // 如果包含引号，只取引号内的内容
        const innerQuoteMatch = rawDialogue.match(/[""「『]([^""」』]+)[""」』]/);
        if (innerQuoteMatch) {
          dialogue = innerQuoteMatch[1].trim();
        } else {
          // 过滤掉可能混入的描述性内容（如角色名+冒号）
          // 例如："叶青画外音：采购部长，应该看到了吧？" 只取冒号后的对白
          const colonMatch = rawDialogue.match(/[^：:]+[：:]\s*(.+)/);
          if (colonMatch) {
            dialogue = colonMatch[1].trim().replace(/^[""「『]|[""」』]$/g, '');
          } else {
            // 如果是纯描述（如"无"、"（无对白）"），设为空
            if (rawDialogue === '无' || rawDialogue.includes('无对白') || rawDialogue.includes('无台词')) {
              dialogue = '';
            } else {
              // 移除开头和结尾的引号
              dialogue = rawDialogue.replace(/^[""「『]|[""」』]$/g, '');
            }
          }
        }
      }
    }
    // 最终清理：移除可能残留的标点和空白
    dialogue = dialogue.replace(/^[\s""「『]+|[\s""」』]+$/g, '').trim();
    // 如果台词以描述性标记开头（如"- "），清除
    if (dialogue.startsWith('-') && dialogue.includes(':')) {
      dialogue = '';
    }
    
    // 提取情绪
    const emotionMatch = content.match(/情绪[：:\s]*([^\n]+)/i);
    const emotionalTone = emotionMatch ? emotionMatch[1].trim() : '';
    
    // 提取音效
    const audioMatch = content.match(/音效[：:\s]*([^\n]+)/i) || content.match(/音乐[：:\s]*([^\n]+)/i);
    const backgroundMusic = audioMatch ? audioMatch[1].trim() : '';
    
    // 提取改编说明
    const adaptationMatch = content.match(/【?改编说明】?[：:\s]*([^\n]+)/i) || content.match(/\[改编说明\][：:\s]*([^\n]+)/i);
    const adaptationNote = adaptationMatch ? adaptationMatch[1].trim() : '';
    
    // 提取核心冲突（场景级别）
    const conflictMatch = content.match(/核心冲突[：:\s]*([^\n]+)/i);
    const sceneConflict = conflictMatch ? conflictMatch[1].trim() : '';
    
    scenes.push({
      sceneId: sceneNum,
      location,
      characterActions,
      dialogue,
      duration: 0,
      composition: (shot ? `[${shot}] ` : '') + composition,
      emotionalTone,
      adaptationNote,
      sceneConflict,
      audioDesign: { backgroundMusic, soundEffects: [], emotionalTone },
      visualElements: { colorScheme: '', keyObjects: [], characterExpressions: '' }
    });
  }
  
  // 如果正则没匹配到，尝试更宽松的方式
  if (scenes.length === 0) {
    const lines = text.split('\n');
    let currentScene: Scene | null = null;
    let sceneId = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.match(/^(?:###?\s*)?场景\s*\d+/i) || trimmed.match(/^场景[一二三四五六七八九十]/)) {
        if (currentScene) scenes.push(currentScene);
        sceneId++;
        const locMatch = trimmed.match(/场景\s*\d*[：:\s]*(.+)/i);
        currentScene = {
          sceneId,
          location: locMatch ? locMatch[1].trim() : `场景${sceneId}`,
          characterActions: '',
          dialogue: '',
          duration: 0,
          composition: '',
          emotionalTone: '',
          adaptationNote: '',
          audioDesign: { backgroundMusic: '', soundEffects: [], emotionalTone: '' },
          visualElements: { colorScheme: '', keyObjects: [], characterExpressions: '' }
        };
      } else if (currentScene && trimmed.startsWith('-')) {
        const content = trimmed.slice(1).trim();
        if (content.includes('画面')) currentScene.composition = content.split(/[：:]/)[1]?.trim() || '';
        else if (content.includes('动作')) currentScene.characterActions = content.split(/[：:]/)[1]?.trim() || '';
        else if (content.includes('台词')) {
          let rawDialogue = content.split(/[：:]/)[1]?.trim() || '';
          // 提取引号内的纯对白
          const quoteMatch = rawDialogue.match(/[""「『]([^""」』]+)[""」』]/);
          if (quoteMatch) {
            currentScene.dialogue = quoteMatch[1].trim();
          } else {
            // 处理“角色名：对白”格式
            const colonMatch = rawDialogue.match(/[^：:]+[：:]\s*(.+)/);
            if (colonMatch) {
              currentScene.dialogue = colonMatch[1].trim().replace(/^[""「『]|[""」』]$/g, '');
            } else if (rawDialogue !== '无' && !rawDialogue.includes('无对白')) {
              currentScene.dialogue = rawDialogue.replace(/^[""「『]|[""」』]$/g, '');
            }
          }
        }
        else if (content.includes('情绪')) currentScene.emotionalTone = content.split(/[：:]/)[1]?.trim() || '';
        else if (content.includes('改编说明')) currentScene.adaptationNote = content.split(/[：:]/)[1]?.trim() || '';
      }
    }
    if (currentScene) scenes.push(currentScene);
  }
  
  return scenes;
}

// 根据场景内容智能计算时长
function calculateSceneDuration(scene: Scene): number {
  // 1. 台词时长：中文语速约4字/秒
  let dialogueDuration = 2;
  if (scene.dialogue && scene.dialogue.length > 0) {
    const dialogueLength = scene.dialogue.replace(/["""''（）\s]/g, '').length;
    dialogueDuration = Math.ceil(dialogueLength / 4);
  }
  
  // 2. 动作时长
  let actionDuration = 2;
  if (scene.characterActions && scene.characterActions.length > 0) {
    const actionLength = scene.characterActions.length;
    if (actionLength <= 10) actionDuration = 2;
    else if (actionLength <= 30) actionDuration = 3;
    else actionDuration = 4;
  }
  
  // 3. 镜头基础展示时长
  let shotBaseDuration = 2;
  if (scene.composition) {
    const comp = scene.composition.toLowerCase();
    if (comp.includes('远景') || comp.includes('全景')) shotBaseDuration = 3;
    else if (comp.includes('中景')) shotBaseDuration = 2;
    else shotBaseDuration = 2;
  }
  
  // 4. 场景时长 = 取最大值
  let duration = Math.max(dialogueDuration, actionDuration, shotBaseDuration);
  
  // 5. 加上镜头切换缓冲时间
  duration = Math.ceil(duration + 0.5);
  
  // 6. 最小时长2秒，最大时长15秒
  duration = Math.max(2, Math.min(15, duration));
  
  return duration;
}

// 根据时长自动分集
function autoSplitEpisodes(scenes: Scene[], targetDuration: number): Episode[] {
  const episodes: Episode[] = [];
  let currentScenes: Scene[] = [];
  let currentDuration = 0;
  let episodeNum = 1;
  
  const minDuration = targetDuration * 0.8;
  const maxDuration = targetDuration * 1.2;
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const newDuration = currentDuration + scene.duration;
    
    const shouldSplit = (
      (currentDuration >= minDuration && newDuration > maxDuration) ||
      (currentDuration >= targetDuration * 0.9 && newDuration > targetDuration * 1.3)
    );
    
    if (shouldSplit && currentScenes.length > 0) {
      episodes.push(createEpisode(episodeNum, currentScenes, currentDuration, episodes.length, scenes.length));
      episodeNum++;
      currentScenes = [];
      currentDuration = 0;
    }
    
    currentScenes.push({ ...scene, sceneId: currentScenes.length + 1 });
    currentDuration += scene.duration;
  }
  
  if (currentScenes.length > 0) {
    episodes.push(createEpisode(episodeNum, currentScenes, currentDuration, episodes.length, scenes.length));
  }
  
  return episodes;
}

// 创建集
function createEpisode(
  episodeNum: number, 
  scenes: Scene[], 
  duration: number,
  currentEpisodeIndex: number,
  totalScenes: number
): Episode {
  const progress = currentEpisodeIndex / Math.max(1, Math.ceil(totalScenes / scenes.length));
  const conflictIntensity = Math.min(5, Math.max(1, Math.ceil(progress * 5) || 1));
  
  const firstScene = scenes[0];
  const lastScene = scenes[scenes.length - 1];
  
  const keyEvents = scenes
    .filter(s => s.dialogue && s.dialogue.length > 5)
    .slice(0, 3)
    .map(s => s.dialogue.slice(0, 50));
  
  // 从场景中提取核心冲突：优先使用 AI 生成的 sceneConflict，其次使用 adaptationNote
  let coreConflict = '剧情发展';
  
  // 优先使用 AI 生成的场景级别冲突描述
  const sceneConflicts = scenes
    .filter(s => s.sceneConflict && s.sceneConflict.length > 5)
    .map(s => s.sceneConflict!);
  
  if (sceneConflicts.length > 0) {
    // 合并所有场景的冲突描述，去重后取前2个最重要的
    const uniqueConflicts = Array.from(new Set(sceneConflicts));
    coreConflict = uniqueConflicts.slice(0, 2).join('；');
    if (coreConflict.length > 80) {
      coreConflict = coreConflict.slice(0, 80) + '...';
    }
  } else {
    // 如果没有 sceneConflict，尝试从 adaptationNote 中提取
    const conflictNotes = scenes
      .filter(s => s.adaptationNote && s.adaptationNote.length > 10)
      .map(s => s.adaptationNote);
    
    if (conflictNotes.length > 0) {
      coreConflict = conflictNotes.join('；').slice(0, 80);
    } else {
      // 最后备选：使用场景位置和对话生成概述
      const locations = scenes.map(s => s.location).filter(l => l && l.length > 0);
      const dialogues = scenes.filter(s => s.dialogue && s.dialogue.length > 5).map(s => s.dialogue);
      
      if (dialogues.length > 0) {
        coreConflict = dialogues[0].slice(0, 50);
        if (dialogues[0].length > 50) coreConflict += '...';
      } else if (locations.length > 0) {
        coreConflict = `场景发展：${locations.slice(0, 3).join(' → ')}`;
      }
    }
  }
  
  return {
    episodeNumber: episodeNum,
    title: `第${episodeNum}集`,
    duration,
    coreConflict,
    conflictIntensity,
    keyEvents,
    narrativeSummary: scenes.map(s => s.location).join(' → '),
    scenes,
    hook: firstScene?.dialogue || '',
    cliffhanger: lastScene?.dialogue || ''
  };
}

// 质量评估
function evaluateQuality(script: GeneratedScript): QualityMetrics {
  const issues: string[] = [];
  const suggestions: string[] = [];

  let mainLineClarity = 7;
  let conflictProgression = 7;
  let pacingControl = 7;
  let dialogueQuality = 7;
  let visualDesign = 6;

  // 1. 集数完整性检查
  if (script.episodes.length >= script.metadata.episodeCount) {
    mainLineClarity += 1;
  } else {
    issues.push(`集数不完整：期望 ${script.metadata.episodeCount} 集，实际 ${script.episodes.length} 集`);
    mainLineClarity -= 1;
    suggestions.push('💡 提升方法：在原始内容中添加更多故事细节，让 AI 有更多素材生成完整集数');
  }

  // 2. 场景数量检查
  const avgScenes = script.episodes.reduce((sum, e) => sum + e.scenes.length, 0) / Math.max(script.episodes.length, 1);
  if (avgScenes >= 3) {
    pacingControl += 1;
    visualDesign += 1;
  } else if (avgScenes < 2) {
    issues.push(`场景数量偏少：平均每集仅 ${avgScenes.toFixed(1)} 个场景`);
    pacingControl -= 1;
    suggestions.push('💡 提升方法：在原始内容中描述更多场景变化，如室内→室外→特定地点');
  }

  // 3. 冲突递进检查
  const intensities = script.episodes.map(e => e.conflictIntensity);
  const hasProgression = intensities.length > 1 && intensities[intensities.length - 1] > intensities[0];
  const isStrictlyProgressive = intensities.every((val, idx) => idx === 0 || val >= intensities[idx - 1]);
  
  if (isStrictlyProgressive && hasProgression) {
    conflictProgression += 2;
  } else if (hasProgression) {
    conflictProgression += 1;
  } else {
    issues.push('冲突强度未呈现递进趋势');
    suggestions.push('💡 提升方法：在故事中设计"危机升级"，从小矛盾到大冲突逐步递进');
  }

  // 4. 钩子和悬念检查
  const episodesWithHook = script.episodes.filter(e => e.hook && e.hook.length > 5).length;
  const episodesWithCliffhanger = script.episodes.filter(e => e.cliffhanger && e.cliffhanger.length > 5).length;
  
  if (episodesWithHook >= script.episodes.length * 0.8) {
    dialogueQuality += 1;
  } else {
    issues.push(`黄金钩子不足：仅 ${episodesWithHook}/${script.episodes.length} 集有明确钩子`);
    suggestions.push('💡 提升方法：每集开头设计悬念式开场，如"三天后，他将死去"');
  }
  
  if (episodesWithCliffhanger >= script.episodes.length * 0.7) {
    pacingControl += 1;
  } else {
    issues.push(`结尾悬念不足：仅 ${episodesWithCliffhanger}/${script.episodes.length} 集有悬念`);
    suggestions.push('💡 提升方法：每集结尾留下未解之谜或反转暗示');
  }

  // 5. 台词检查
  const scenesWithDialogue = script.episodes.flatMap(e => e.scenes).filter(s => s.dialogue && s.dialogue.length > 3).length;
  const totalScenes = script.episodes.reduce((sum, e) => sum + e.scenes.length, 0);
  
  if (scenesWithDialogue >= totalScenes * 0.6) {
    dialogueQuality += 1;
  } else if (scenesWithDialogue < totalScenes * 0.3) {
    issues.push('台词内容偏少');
    dialogueQuality -= 1;
    suggestions.push('💡 提升方法：在原始故事中增加人物对话，展现角色性格');
  }

  // 6. 视觉描述检查
  const scenesWithVisual = script.episodes.flatMap(e => e.scenes).filter(s => s.composition && s.composition.length > 5).length;
  if (scenesWithVisual >= totalScenes * 0.5) {
    visualDesign += 1;
  } else {
    suggestions.push('💡 提升方法：添加画面描述，如色调、构图、光影等视觉元素');
  }

  // 7. 关键事件检查
  const episodesWithEvents = script.episodes.filter(e => e.keyEvents.length >= 2).length;
  if (episodesWithEvents >= script.episodes.length * 0.7) {
    mainLineClarity += 1;
  } else {
    suggestions.push('💡 提升方法：为每集设计 2-3 个关键转折点');
  }

  // 8. 主线与结构配合检查（新增）
  // 检查是否每集都有“赢”的片段（打脸循环）
  const episodesWithWin = script.episodes.filter(e => {
    const hasConflict = e.coreConflict && e.coreConflict.length > 5;
    const hasResolution = e.scenes.some(s => 
      (s.dialogue && (s.dialogue.includes('你') || s.dialogue.includes('我'))) ||
      (s.emotionalTone && (s.emotionalTone.includes('爽') || s.emotionalTone.includes('震惊') || s.emotionalTone.includes('打脸')))
    );
    return hasConflict || hasResolution;
  }).length;
  
  if (episodesWithWin >= script.episodes.length * 0.8) {
    pacingControl += 1;
    suggestions.push('✅ 每集都有“赢”的片段，符合打脸循环要求');
  } else {
    issues.push(`打脸循环不足：仅 ${episodesWithWin}/${script.episodes.length} 集有明确的“赢”片段`);
    suggestions.push('💡 提升方法：确保每集都有完整的“懋屈→出手→打脸→收获”循环');
  }

  // 9. 钩子紧扣主线检查（新增）
  // 检查结尾悬念是否与主线相关
  const cliffhangersRelatedToMainLine = script.episodes.filter(e => {
    if (!e.cliffhanger || e.cliffhanger.length < 5) return false;
    // 检查悬念是否包含主线相关关键词（如主角名、目标、反派等）
    const mainLineKeywords = ['他', '她', '主角', '目标', '任务', '危机', '敌人', '反派', '秘密', '真相'];
    return mainLineKeywords.some(kw => e.cliffhanger.includes(kw)) || e.cliffhanger.length > 10;
  }).length;
  
  if (cliffhangersRelatedToMainLine >= script.episodes.length * 0.6) {
    mainLineClarity += 1;
  } else if (script.episodes.length > 1) {
    suggestions.push('💡 提升方法：每集结尾钩子应紧扣主线，如“主角能不能拿到钱”“真相会不会被发现”');
  }

  // 确保分数在合理范围内
  mainLineClarity = Math.max(1, Math.min(10, mainLineClarity));
  conflictProgression = Math.max(1, Math.min(10, conflictProgression));
  pacingControl = Math.max(1, Math.min(10, pacingControl));
  dialogueQuality = Math.max(1, Math.min(10, dialogueQuality));
  visualDesign = Math.max(1, Math.min(10, visualDesign));

  const overallScore = Number(((mainLineClarity + conflictProgression + pacingControl + dialogueQuality + visualDesign) / 5).toFixed(1));

  let qualityStatus: 'PASS' | 'REVISION_NEEDED' | 'FAIL' = 'REVISION_NEEDED';
  if (overallScore >= 8) qualityStatus = 'PASS';
  if (overallScore < 6) qualityStatus = 'FAIL';

  if (qualityStatus === 'FAIL') {
    suggestions.unshift('⚠️ 评分较低，建议：1) 丰富原始故事内容 2) 点击"重新生成"尝试');
  } else if (qualityStatus === 'REVISION_NEEDED') {
    suggestions.unshift('📝 评分中等，可通过完善原始内容后重新生成来提升');
  }

  return {
    mainLineClarity,
    conflictProgression,
    pacingControl,
    dialogueQuality,
    visualDesign,
    overallScore,
    qualityStatus,
    issues,
    suggestions
  };
}

// 导出为Markdown
function exportToMarkdown(script: GeneratedScript): string {
  let md = `# ${script.metadata.title}\n\n`;
  md += `> ${script.metadata.storyConcept}\n\n`;
  md += `**类型**: ${script.metadata.storyType}\n\n`;
  md += `**总集数**: ${script.metadata.episodeCount} | **质量评分**: ${script.qualityMetrics.overallScore}/10\n\n`;
  md += `---\n\n`;

  for (const episode of script.episodes) {
    md += `## 第${episode.episodeNumber}集：${episode.title}\n\n`;
    md += `**冲突强度**: ${'⭐'.repeat(episode.conflictIntensity)}\n\n`;
    
    if (episode.hook) {
      md += `**开场钩子**: ${episode.hook}\n\n`;
    }

    if (episode.coreConflict) {
      md += `**核心冲突**: ${episode.coreConflict}\n\n`;
    }

    if (episode.scenes.length > 0) {
      md += `### 场景\n\n`;
      for (const scene of episode.scenes) {
        md += `- **${scene.location}** (${scene.duration}秒)\n`;
        if (scene.characterActions) {
          md += `  ${scene.characterActions}\n`;
        }
      }
      md += '\n';
    }

    if (episode.cliffhanger) {
      md += `**结尾悬念**: ${episode.cliffhanger}\n\n`;
    }

    md += `---\n\n`;
  }

  if (script.rawContent) {
    md += `## AI 原始输出\n\n`;
    md += '```\n' + script.rawContent + '\n```\n';
  }

  return md;
}

// ============================================================================
// 剧本改编 Agent - 完整5步流程
// ============================================================================

async function generateScript(input: ScriptGenerationInput & { apiKey?: string }): Promise<GeneratedScript> {
  const { originalContent, episodeCount, durationPerEpisode, storyType, apiKey } = input;
  
  // ========== 第一步：AI 改编优化（输出分析+改编后的故事）==========
  const adaptationPrompt = `你是专业的短剧编剧。请对以下原始素材进行【改编优化】。

【动态漫短剧的特点】
- 单集时长1-3分钟，碎片化传播
- 需要：强节奏、高张力、记忆点
- 在极短时间内抓住观众注意力

【6大核心创作要点】
1. 极致浓缩剧情：单集聚焦单一爆点，舍弃支线，用"冲突爆发—解决冲突"的极简结构
2. 强悬念与反转设计：黄金3秒开场抛出冲突/悬念，每集至少1-2个反转
3. 视觉符号强化记忆：标志性动作/道具高频出现，色彩情绪化表达
4. 台词精简到极致：字字推动剧情，对话即冲突，每句话都有力量
5. 适配碎片化观看：独立成篇+片尾钩子，用画面代替解释
6. 强化听觉记忆点：专属音效标识，音乐卡点精准

【情绪引擎七步法】
1. 黄金开局（0-30秒）：强钩子+反差人设，制造好奇与代入感
2. 意外引爆（30秒-1分钟）：金手指到账+赋予使命，打破平衡
3. 小试牛刀（1-3分钟）：首个打脸循环（憋屈→出手→打脸→收获）
4. 升级挑战（中段）：引入伙伴+树立强敌，积累仇恨
5. 绝境蜕变（高潮前奏）：压制到极限，为爆发蓄力
6. 巅峰决战（高潮）：终极打脸+身份揭露，释放爽感
7. 收尾钩子（结局）：奖励展示+新悬念，制造追看欲

【短剧主线三要素】
1. 目标明确：主角诉求要具体（如"3天内夺回公司"），避免模糊
2. 冲突集中：一个核心矛盾（主角vs反派），支线服务主线
3. 情绪锚点：绑定强烈情绪（逆袭→爽，情感→虐/甜，悬疑→好奇）

【原始素材】
${originalContent}

【创作参数】
- 故事类型：${storyType}

【你的任务】
根据以上创作要点，对原始素材进行改编优化，输出两部分内容：

===改编分析===

【主线分析】
- 主角：[谁是主角]
- 核心目标：[主角要达成什么，要具体]
- 核心冲突：[什么vs什么]
- 情绪锚点：[爽/虐/甜/好奇]

【结构规划】
- 开篇钩子：[用什么抓住观众]
- 关键反转：[设计什么反转]
- 打脸循环：[憋屈→出手→打脸→收获的设计]
- 高潮设计：[最大的爆发点]
- 结尾悬念：[留什么钩子]

【优化策略】
- 删除：[原文中与主线无关需要删除的内容]
- 强化：[需要加强的冲突/悬念]
- 新增：[原文没有但需要补充的元素]

===改编后的故事===

[在这里输出一整篇优化后的叙述文字，像小说一样。要求：
1. 应用上述所有创作要点
2. 强化冲突和悬念
3. 精简台词，字字有力
4. 节奏紧凑，删除冗余
5. 保持原作精神，但大胆创新
6. 这是故事文本，不是分镜脚本，不要包含时间码、景别、镜头标记等]

【重要】
- 这是艺术再创造，不是复制粘贴原文
- 必须严格按照上述格式输出
- "改编后的故事"必须是连贯的叙述文字，像小说一样，绝对不能包含分镜格式（如"### 场景"、"景别"、"画面"、"动作"、"**00:01**"等）
- 分镜脚本将在下一步单独生成，这里只输出故事文本
- 直接开始，不要任何客套话`;

  // 第一步：AI 改编优化
  let adaptationResponse: string;
  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: adaptationPrompt }
      ],
      apiKey,
    });
    const rawContent = result.choices[0]?.message?.content || '';
    adaptationResponse = typeof rawContent === 'string' ? rawContent : '';
  } catch (error: any) {
    console.error('改编优化 API 调用错误:', error);
    throw new Error('AI 改编优化失败: ' + (error.message || '请检查网络'));
  }

  if (!adaptationResponse || adaptationResponse.trim().length === 0) {
    throw new Error('AI 返回了空内容');
  }

  // 提取改编分析和改编后的故事
  const { analysis, story } = extractAdaptationParts(adaptationResponse);

  // ========== 第二步：用改编后的故事生成分镜脚本 ==========
const storyboardPrompt = `你是专业的漫剧分镜师。请将以下故事转化为可直接用于AI生图的分镜脚本。

【故事内容】
${story}

【创作参数】
- 故事类型：${storyType}
- 每集目标时长：${durationPerEpisode}秒

【漫剧技术规范】
- 单镜头时长：2-5秒
- 分镜密度：每分钟约20-30个镜头
- 单场景上限：5秒

【分镜脚本格式】
### 场景1：[地点-时间]
- 景别：[特写/近景/中景/全景/远景]
- 镜头：[固定/推近/拉远/摇镜/跟随]
- 时长：[2-5秒]
- 画面：[人物位置、姿态、表情、道具]
- 角色外观：[服装、发型、年龄]
- 光线色调：[光源、色温、氛围]
- 台词：“[说话人：内容]”
- 动作：[具体动作]
- 情绪：[关键词]
- 音效：[环境音/配乐]
- 转场：[切/淡入/淡出]

【单集节奏结构】
- 0-3秒：黄金钩子，必须有冲突/悬念/强视觉冲击
- 3-30秒：冲突建立，快速进入情况
- 30秒-70%处：发展推进，可包含打脸循环
- 70%-90%处：本集高潮/爽点/反转
- 最后10%：悬念钩子，吸引看下一集
- 每15-20秒必须有一个节奏点（小冲突/反转/爽点）

【打脸循环分镜】
“打脸”= 叙事套路：有人看不起主角 → 主角证明自己 → 对方被打脸（被证明错了、丢脸、后悔）
1. 憋屈阶段（主角被看不起/嘲讽/质疑）
   - 景别：近景拍嘲讽者得意表情，中景拍主角被围攻
   - 节奏：2-3秒
   - 画面：嘲讽者趾高气扬，主角低头/沉默/握拳
2. 出手阶段（主角亮实力/亮身份/说关键信息）
   - 景别：特写主角表情变化（隐忍→自信），特写关键动作/道具
   - 节奏：2秒
   - 画面：主角抬头、眼神变化、亮出证据/身份/能力
3. 打脸阶段（嘲讽者被证明错了）
   - 景别：特写嘲讽者震惊脸（瞪眼、张嘴、愚住）
   - 可加：围观者反应（倒吸凉气、窃窃私语）
   - 节奏：2秒快切
   - 画面：嘲讽者表情从得意→震惊→尴尬/恐惧
4. 收获阶段（主角获得认可/尊重/利益）
   - 景别：中景展示局面反转
   - 节奏：2-3秒
   - 画面：主角从容自若，嘲讽者灰溜溜/讨好/后悔

【故事类型适配】
- 身份反转：揭示身份时特写快切（亮身份→众人震惊→对手崩溃），揭示后仰拍主角
- 能力觉醒：觉醒时特写眼睛变化+光效，觉醒后全景展示能力威力
- 甜宠恋爱：对视慢镜3-4秒，暖色调柔光，心动瞬间特写表情
- 悬疑烧脑：线索道具特写要清晰，冷色调，真相揭露用闪回快切
- 复仇虐心：憋屈阶段拉长加狠，打脸阶段反派要够惨

【景别切换规则】
- 禁止连续3个以上相同景别
- 对话场景：中景→近景→特写（递进逼近）
- 动作场景：全景→中景→特写（聚焦冲击）
- 情绪转折：特写突切全景（制造反差）

【画面描述红线】
❌ 禁止心理活动：“他心想...”、“仿佛在思考...”
❌ 禁止抽象描述：“复杂的眼神”、“意味深长”
❌ 禁止省略角色外观
✅ 只写摄像机能拍到的内容
✅ 表情要具体：眉头紧锁、嘴角上扬、眼睛瞪大、咬紧牙关
✅ 动作要具体：握紧拳头、猛地站起、转身离开

【角色一致性要求】
- 首次出场详细描述外观（服装颜色、发型、年龄、体型）
- 后续场景写“角色名（同前）”
- 服装变化时必须说明

【台词保留原则】
- 保留故事中的重要对白，不要过度精简
- 每句标注说话人：“角色名：内容”
- 无台词时写“无”

【重要】
- 直接输出分镜脚本，不要任何开场白
- 第一行必须是“### 场景1”
- 根据${storyType}适配分镜风格
- 识别故事中的打脸循环，按上述规则设计分镜
- 单集必须有完整情绪起伏，不能全是铺垫`;

  let storyboardResponse: string;
  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: storyboardPrompt }
      ],
      apiKey,
    });
    const rawContent = result.choices[0]?.message?.content || '';
    storyboardResponse = typeof rawContent === 'string' ? rawContent : '';
  } catch (error: any) {
    console.error('分镜生成 API 调用错误:', error);
    throw new Error('AI 分镜生成失败: ' + (error.message || '请检查网络'));
  }

  if (!storyboardResponse || storyboardResponse.trim().length === 0) {
    throw new Error('AI 分镜脚本返回了空内容');
  }

  // ========== 第三步：解析分镜脚本 ==========
  const allScenes = parseAllScenes(storyboardResponse);
  
  const responseText = `===改编分析===\n${analysis}\n\n===改编后的故事===\n${story}\n\n===分镜脚本===\n${storyboardResponse}`;
  
  if (allScenes.length === 0) {
    throw new Error('未能解析出有效场景');
  }

  // 计算每个场景的时长
  allScenes.forEach(scene => {
    scene.duration = calculateSceneDuration(scene);
  });

  const totalDuration = allScenes.reduce((sum, s) => sum + s.duration, 0);

  // ========== 第四步：根据每集目标时长自动分集 ==========
  const targetDuration = durationPerEpisode;
  const episodes = autoSplitEpisodes(allScenes, targetDuration);

  // ========== 第五步：构建最终的剧本结构 ==========
  const titleMatch = story.match(/《([^》]+)》/) || storyboardResponse.match(/《([^》]+)》/) || analysis.match(/标题[：:\s]*([^\n]+)/i);
  const title = titleMatch ? titleMatch[1].trim() : '新剧本';

  const script: GeneratedScript = {
    metadata: {
      title,
      storyConcept: analysis.slice(0, 200),
      episodeCount: episodes.length,
      totalDuration: totalDuration,
      storyType: storyType,
      generationTimestamp: new Date().toISOString(),
      version: '1.0'
    },
    adaptationAnalysis: analysis,
    adaptedStory: story,
    storyStructure: {
      mainLine: {
        description: '由 AI 根据原始内容生成',
        goal: '待完善',
        conflict: '待完善'
      },
      structurePlan: {
        opening: { episodeRange: '1', purpose: '开局', keyEvents: [] },
        development: { episodeRange: `2-${Math.floor(episodes.length * 0.7)}`, purpose: '发展', keyEvents: [] },
        climax: { episodeRange: `${Math.floor(episodes.length * 0.8)}`, purpose: '高潮', keyEvents: [] },
        ending: { episodeRange: `${episodes.length}`, purpose: '结尾', keyEvents: [] }
      }
    },
    episodes,
    qualityMetrics: {
      mainLineClarity: 7,
      conflictProgression: 7,
      pacingControl: 7,
      dialogueQuality: 7,
      visualDesign: 6,
      overallScore: 7,
      qualityStatus: 'REVISION_NEEDED',
      issues: [],
      suggestions: []
    },
    rawContent: responseText
  };

  // 评估质量
  script.qualityMetrics = evaluateQuality(script);

  return script;
}

// AI智能分析推荐集数
async function analyzeContentForEpisodes(content: string, apiKey?: string): Promise<{ recommendedEpisodes: number; analysis: string }> {
  const analysisPrompt = `你是一个专业的短剧编剧顾问。请分析以下内容，并推荐合适的短剧集数。

【待分析内容】
${content}

【分析标准】
请根据以下维度评估，然后给出推荐集数：

1. **内容长度**：
   - 500字以内 → 1-2集
   - 500-1500字 → 2-4集
   - 1500-3000字 → 4-8集
   - 3000-6000字 → 8-15集
   - 6000字以上 → 15-30集

2. **章节/段落数量**：
   - 每个明确的章节或主要段落可对应1-3集

3. **情节复杂度**：
   - 冲突点数量（每个主要冲突可展开1-2集）
   - 转折点数量（每个重要转折需要1集铺垫）
   - 高潮点数量

4. **人物数量**：
   - 主要角色越多，需要更多集数来展现

5. **场景变化**：
   - 场景越丰富，需要更多集数

【输出格式】
请严格按以下格式输出（只输出这两行）：
推荐集数：X
分析说明：XXXXXX

示例：
推荐集数：5
分析说明：内容约2000字，包含2个章节，3个主要冲突点，2个核心角色，建议改编为5集短剧`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "user", content: analysisPrompt }
      ],
      apiKey,
    });
    const rawContent = result.choices[0]?.message?.content || '';
    const responseText = typeof rawContent === 'string' ? rawContent : '';
    
    const episodeMatch = responseText.match(/推荐集数[：:]\s*(\d+)/i);
    const analysisMatch = responseText.match(/分析说明[：:]\s*(.+)/i);
    
    const recommendedEpisodes = episodeMatch ? parseInt(episodeMatch[1]) : 3;
    const analysis = analysisMatch ? analysisMatch[1].trim() : '已根据内容长度和复杂度自动推荐';
    
    return {
      recommendedEpisodes: Math.max(1, Math.min(30, recommendedEpisodes)),
      analysis
    };
  } catch (error) {
    const charCount = content.length;
    let recommended = 3;
    if (charCount < 500) recommended = 2;
    else if (charCount < 1500) recommended = 3;
    else if (charCount < 3000) recommended = 5;
    else if (charCount < 6000) recommended = 10;
    else recommended = 15;
    
    return {
      recommendedEpisodes: recommended,
      analysis: `根据内容长度(${charCount}字)自动推荐`
    };
  }
}

// 优化低分剧本
async function optimizeScript(
  currentScript: GeneratedScript,
  originalContent: string,
  durationPerEpisode?: number, // 用户当前选择的每集时长
  apiKey?: string // 用户的 API Key
): Promise<GeneratedScript> {
  const metrics = currentScript.qualityMetrics;
  const issues: string[] = [];

  if (metrics.mainLineClarity < 8) issues.push('主线清晰度不足，需要明确主角目标和核心矛盾');
  if (metrics.conflictProgression < 8) issues.push('冲突递进不够，需要让每集冲突逐步升级');
  if (metrics.pacingControl < 8) issues.push('节奏控制欠佳，需要增加场景数量和结尾悬念');
  if (metrics.dialogueQuality < 8) issues.push('台词质量待提升，需要增加精彩对白和开场钩子');
  if (metrics.visualDesign < 7) issues.push('视觉设计不足，需要增加画面描述');

  if (issues.length === 0) {
    return currentScript;
  }

  const adaptedStory = currentScript.adaptedStory || originalContent;

  // 提取故事结构信息
  const storyStructure = currentScript.storyStructure;
  const mainLine = storyStructure?.mainLine || {};
  
  // 提取每集的核心冲突和关键事件
  const episodesInfo = (currentScript.episodes || []).map((ep, idx) => {
    const coreConflict = ep.coreConflict || '未设定';
    const keyEvents = (ep.keyEvents || []).join('、') || '未设定';
    const hook = ep.hook || '未设定';
    return `第${idx + 1}集：
  - 核心冲突：${coreConflict}
  - 关键事件：${keyEvents}
  - 黄金3秒钩子：${hook}`;
  }).join('\n');

  // 获取故事类型
  const storyType = currentScript.metadata.storyType || '都市情感';

  const optimizePrompt = `你是专业的分镜编剧。请针对以下问题，优化分镜脚本。

【创作参数】
- 故事类型：${storyType}

【改编后的故事】
${adaptedStory}

【故事主线设定】
- 主角目标：${mainLine.goal || '未设定'}
- 核心矛盾：${mainLine.conflict || '未设定'}
- 主线描述：${mainLine.description || '未设定'}

【各集核心冲突与关键事件】
${episodesInfo}

【需要改进的问题】
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

【动态漫创作核心心法】
1. 节奏为王：拒绝任何无效文戏和慢热铺垫，每30-50秒一个情绪点，每集必须完成至少一次完整的“打脸循环”
2. 视觉化写作：你的剧本不是小说，是拍摄蓝图。写作时要同步想象画面、镜头语言。多用“瞳孔骤缩”、“拳风撕裂空间”等可视化描述
3. 台词如刀：台词要精炼、有力。主角台词宜少不宜多，用行动代替辩解。反派的台词要负责“拉仇恨”
4. “爽”是唯一真理：一切为爽感服务。逻辑可以适当为情绪让步，但情绪的流畅度和累积释放的路径绝不能断

【视觉符号强化记忆】
1. 标志性动作/道具：为主角设计专属动作（如甩发攻击）或道具（发光戒指），在每集高频出现加深印象
2. 色彩情绪化表达：用色彩暗示剧情，如危险场景以红色光影笼罩，平静时刻采用柔和蓝绿色调

【片尾钩子设计】
每集结尾必须留下强钩子，常用手法：
1. 新地图开启：“蓝星已无敌，是时候去宇宙战场看看了。”
2. 更强敌人登场：一个远超本集反派的黑影在片尾现身，并对主角产生兴趣。“这只虫子，有点意思。”
3. 新危机降临：“你虽赢了，但也惊醒了沉睡的古神。”

【打脸循环四步法】
每集至少完成一次完整的打脸循环：
1. 制造懋屈：小反派（如势利眼经理、同门师兄）用具体行为挑釁主角
2. 雷霆出手：主角运用金手指，用最出乎意料、最轻松的方式解决问题
3. 极致打脸：结果必须公开化，让所有旁观者震惊、反派目瞪口呆
4. 获得奖励：收获金钱、地位、美女的青睐、或解锁新技能。此奖励必须成为下一步剧情的筹码

【优化要求】
针对上述问题，重新生成优化后的分镜脚本：
${metrics.mainLineClarity < 8 ? '- 主线清晰度：在开场明确展示主角目标，每个场景都要推进主线\n' : ''}${metrics.conflictProgression < 8 ? '- 冲突递进：让冲突逐步升级，增加紧张感\n' : ''}${metrics.pacingControl < 8 ? '- 节奏控制：增加场景变化，控制每个场景时长\n' : ''}${metrics.dialogueQuality < 8 ? '- 台词质量：让台词更精炼有力，每句都推动剧情\n' : ''}${metrics.visualDesign < 7 ? '- 视觉设计：增加画面描述的细节和冲击力\n' : ''}

【分镜脚本格式】
每个场景按以下格式输出：

### 场景1：[地点/场景名]
- 景别：[特写/近景/中景/全景/远景]
- 画面：[具体的视觉描述，要能直接用于绘制，包含色彩和光影描述]
- 动作：[角色的动作和表情，突出标志性动作]
- 台词：“[对白内容，≤15字，字字有力]”
- 情绪：[情绪基调]
- 音效：[环境音/配乐提示]

### 场景2：[地点/场景名]
...

【保留原则 - 以下内容严禁删除】
1. 戏剧递进结构：如果原文是“A发生→B发生→C发生”的因果链，不能跳过中间环节直接到结果
   - 例：先杀两个人→再轮到主角，这个“先杀别人”的铺垫不能删
   
2. 世界观建立细节：解释“为什么会这样”的关键信息
   - 例：宰相的烂诗、角色被抓的具体原因、势力关系说明
   
3. 角色内心独白/OS：穿越、重生等题材中主角的现代人视角
   - 例：“握草，这是什么地狱开局”、“别人穿越是主角，我差点活不过两集”
   
4. 紧张感铺垫：为高潮蓄力的场景，即使看起来“慢”
   - 例：主角亲眼看别人死去的场景，是为了让他后续的恐惧有说服力
   
5. 配角的关键台词：如果配角台词是为了：
   - 展示世界观（如“祸国妖妃，天下共愤”）
   - 刻画反派性格（如小阳子的冷酷处刑）
   - 制造情绪对比（如求饶者被杀 vs 硬气者被杀）

【分镜原则】
1. 开场必须有强钩子（黄金3秒）：悬念式/冲突式/反差式开场
2. 每个场景都要有“事件”发生，不允许空镜头
3. 台词精炼有力，每句都推动剧情或强化情感
4. 景别要有变化，避免单调
5. 情绪起伏明显，有张有弛
6. 结尾必须留强钩子（参考片尾钩子设计）

【重要】
- 直接输出分镜脚本，不要任何开场白
- 第一行必须是“### 场景1”
- 场景数量根据故事内容和情节复杂度自由决定，不要人为限制
- 每个场景的画面描述要包含色彩和光影，便于后续绘制`;

  let responseText: string;
  try {
    const result = await invokeLLM({
      messages: [
        { role: "user", content: optimizePrompt }
      ],
      apiKey, // 使用用户的 API Key
    });
    const rawContent = result.choices[0]?.message?.content || '';
    responseText = typeof rawContent === 'string' ? rawContent : '';
  } catch (error: any) {
    console.error('优化失败:', error);
    throw new Error('AI 优化失败: ' + (error.message || '请稍后重试'));
  }

  if (!responseText || responseText.trim().length === 0) {
    throw new Error('AI 返回了空内容');
  }

  const allScenes = parseAllScenes(responseText);
  
  if (allScenes.length === 0) {
    throw new Error('优化后未能解析出有效场景');
  }

  allScenes.forEach(scene => {
    scene.duration = calculateSceneDuration(scene);
  });

  const totalDuration = allScenes.reduce((sum, s) => sum + s.duration, 0);
  // 优先使用用户传入的每集时长，否则从已保存的剧本数据计算
  const targetDuration = durationPerEpisode || Math.round(currentScript.metadata.totalDuration / Math.max(currentScript.metadata.episodeCount, 1)) || 120;
  const episodes = autoSplitEpisodes(allScenes, targetDuration);

  // 保留原有的核心冲突和关键事件，只更新分镜场景
  const originalEpisodes = currentScript.episodes || [];
  const mergedEpisodes = episodes.map((newEp, idx) => {
    const originalEp = originalEpisodes[idx];
    return {
      ...newEp,
      // 保留原有的核心冲突和关键事件
      coreConflict: originalEp?.coreConflict || newEp.coreConflict,
      keyEvents: originalEp?.keyEvents || newEp.keyEvents,
      hook: originalEp?.hook || newEp.hook,
    };
  });

  const optimizedScript: GeneratedScript = {
    metadata: {
      ...currentScript.metadata,
      episodeCount: mergedEpisodes.length,
      totalDuration: totalDuration,
      generationTimestamp: new Date().toISOString()
    },
    adaptationAnalysis: currentScript.adaptationAnalysis,
    adaptedStory: currentScript.adaptedStory,
    storyStructure: currentScript.storyStructure,
    episodes: mergedEpisodes,
    qualityMetrics: currentScript.qualityMetrics,
    rawContent: `${currentScript.rawContent}\n\n===优化后的分镜===\n${responseText}`
  };
  
  optimizedScript.qualityMetrics = evaluateQuality(optimizedScript);

  return optimizedScript;
}

// ============================================================================
// 形象场景设计 - 图片生成提示词构建函数
// ============================================================================

/**
 * 构建角色设计图片生成提示词
 * @param character 角色数据
 * @param styleParams 风格参数（从卡片上读取）
 * @param hasAnchorImage 是否有锚定图（用于重新生成时保持一致性）
 */
function buildCharacterImagePrompt(character: any, styleParams?: {
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
}, hasAnchorImage: boolean = false): string {
  const roleMap: Record<string, string> = {
    'protagonist': 'main character',
    'antagonist': 'antagonist',
    'supporting': 'supporting character',
    'extra': 'background character'
  };

  const parts: string[] = [];
  
  // 基础描述 - 单人正面全身照
  parts.push(`Single person full body shot of ${character.characterName || 'a character'}`);
  parts.push(`${roleMap[character.role] || 'character'}, front facing, standing pose, showing complete figure from head to toe`);
  
  // 视觉设计
  if (character.visualDesign) {
    const vd = character.visualDesign;
    if (vd.temperament) parts.push(`${vd.temperament} temperament`);
    if (vd.bodyType) parts.push(`${vd.bodyType} body type`);
    if (vd.age) parts.push(`${vd.age}`);
    if (vd.faceShape) parts.push(`${vd.faceShape} face`);
  }
  
  // 服装设计
  if (character.clothingDesign) {
    const cd = character.clothingDesign;
    if (cd.description) parts.push(`wearing ${cd.description}`);
    else if (cd.style) parts.push(`${cd.style} clothing style`);
    if (cd.primaryColor) parts.push(`${cd.primaryColor} as main color`);
  }
  
  // 发型设计
  if (character.hairstyleDesign) {
    const hd = character.hairstyleDesign;
    if (hd.description) parts.push(`${hd.description} hairstyle`);
    else if (hd.style && hd.color) parts.push(`${hd.color} ${hd.style} hair`);
  }
  
  // 配饰
  if (character.accessories && character.accessories.length > 0) {
    const accessoryNames = character.accessories.map((a: any) => a.name).join(', ');
    parts.push(`with accessories: ${accessoryNames}`);
  }
  
  // 风格参数（从卡片上读取）
  if (styleParams) {
    // 建筑风格
    if (styleParams.architecturalStyle && styleParams.architecturalStyle.trim()) {
      parts.push(`${styleParams.architecturalStyle.trim()} style environment`);
    }
    // 整体色调
    if (styleParams.colorTone && styleParams.colorTone.trim()) {
      parts.push(`${styleParams.colorTone.trim()} color tone`);
    }
    // 主色
    if (styleParams.primaryColors && styleParams.primaryColors.trim()) {
      parts.push(`primary colors: ${styleParams.primaryColors.trim()}`);
    }
    // 色彩情绪
    if (styleParams.colorMood && styleParams.colorMood.trim()) {
      parts.push(`${styleParams.colorMood.trim()} mood`);
    }
    // 风格描述（最重要，放在最后）
    if (styleParams.styleDescription && styleParams.styleDescription.trim()) {
      parts.push(`Art style: ${styleParams.styleDescription.trim()} (only reference the style characteristics, do not include any content elements from reference images)`);
    }
  }
  
  parts.push('front facing full body shot, single character only, clean background, professional studio lighting, 2K high quality resolution, NO TEXT, NO LETTERS, NO WORDS, NO WATERMARKS on the image');
  
  // 如果是重新生成（有锚定图），强调角色一致性
  if (hasAnchorImage) {
    parts.push('CRITICAL CHARACTER CONSISTENCY: This is a re-generation request. The character MUST have the EXACT SAME face, facial features, hairstyle, hair color, eye color, body proportions, clothing design, and overall appearance as shown in the reference character image. Only minor pose or lighting variations are acceptable. The character identity must be instantly recognizable as the same person.');
  }
  
  return parts.join(', ');
}

/**
 * 构建场景设计图片生成提示词
 * @param scene 场景数据
 * @param styleParams 风格参数（从卡片上读取）
 * @param hasAnchorImage 是否有锚定图（用于重新生成时保持一致性）
 */
function buildSceneImagePrompt(scene: any, styleParams?: {
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
}, hasAnchorImage: boolean = false): string {
  const parts: string[] = [];
  
  // 风格参数（从卡片上读取，放在最前面）
  if (styleParams) {
    // 建筑风格
    if (styleParams.architecturalStyle && styleParams.architecturalStyle.trim()) {
      parts.push(`${styleParams.architecturalStyle.trim()} architectural style`);
    }
    // 整体色调
    if (styleParams.colorTone && styleParams.colorTone.trim()) {
      parts.push(`${styleParams.colorTone.trim()} color scheme`);
    }
    // 主色
    if (styleParams.primaryColors && styleParams.primaryColors.trim()) {
      parts.push(`primary colors: ${styleParams.primaryColors.trim()}`);
    }
    // 色彩情绪
    if (styleParams.colorMood && styleParams.colorMood.trim()) {
      parts.push(`${styleParams.colorMood.trim()} mood`);
    }
  }
  
  // 场景名称和类型
  parts.push(`${scene.sceneName || 'Scene'} environment`);
  if (scene.locationType) {
    parts.push(scene.locationType === 'indoor' ? 'interior' : scene.locationType === 'outdoor' ? 'exterior' : 'mixed environment');
  }
  if (scene.timeSetting) parts.push(`${scene.timeSetting} time`);
  
  // 空间设计
  if (scene.spaceDesign) {
    const sd = scene.spaceDesign;
    if (sd.layout) parts.push(sd.layout);
    if (sd.depth) parts.push(`${sd.depth} depth`);
  }
  
  // 色彩设计
  if (scene.colorDesign) {
    const cd = scene.colorDesign;
    if (cd.primaryColor) parts.push(`${cd.primaryColor} as dominant color`);
    if (cd.colorTemperature) parts.push(`${cd.colorTemperature} color temperature`);
  }
  
  // 灯光设计
  if (scene.lightingDesign) {
    const ld = scene.lightingDesign;
    if (ld.mainLight) parts.push(`${ld.mainLight} main lighting`);
    if (ld.specialEffects) parts.push(ld.specialEffects);
  }
  
  // 氛围
  if (scene.atmosphere) parts.push(`${scene.atmosphere} atmosphere`);
  
  // 必要元素
  if (scene.essentialElements && scene.essentialElements.length > 0) {
    parts.push(`featuring: ${scene.essentialElements.join(', ')}`);
  }
  
  // 风格描述（最重要，放在最后）
  if (styleParams?.styleDescription && styleParams.styleDescription.trim()) {
    parts.push(`Art style: ${styleParams.styleDescription.trim()} (only reference the style characteristics, do not include any content elements from reference images)`);
  }
  
  // 检查必要元素中是否包含人物相关的关键词
  const peopleKeywords = ['人', '群', '客', '众', '员', '师', '女', '男', '孩', '童', 'people', 'crowd', 'person', 'customer', 'guest', 'staff'];
  const hasPeopleElement = scene.essentialElements && scene.essentialElements.some((el: string) => 
    peopleKeywords.some(keyword => el.toLowerCase().includes(keyword))
  );
  
  // 如果有人物元素，则不添加 "no people" 限制
  if (hasPeopleElement) {
    parts.push('wide shot, establishing shot, 2K high quality resolution, NO TEXT, NO LETTERS, NO WORDS, NO WATERMARKS, NO SIGNS with text on the image');
  } else {
    parts.push('wide shot, establishing shot, no people, 2K high quality resolution, NO TEXT, NO LETTERS, NO WORDS, NO WATERMARKS, NO SIGNS with text on the image');
  }
  
  // 如果是重新生成（有锚定图），强调场景一致性
  if (hasAnchorImage) {
    parts.push('CRITICAL SCENE CONSISTENCY: This is a re-generation request. The scene MUST have the EXACT SAME architectural layout, spatial composition, color palette, lighting atmosphere, and overall visual style as shown in the reference scene image. Maintain identical perspective, furniture placement, and environmental details. Only minor lighting or angle variations are acceptable.');
  }
  
  return parts.join(', ');
}

/**
 * 构建道具设计图片生成提示词
 * @param prop 道具数据
 * @param styleParams 风格参数（从卡片上读取）
 * @param hasAnchorImage 是否有锚定图（用于重新生成时保持一致性）
 * 
 * 【重要】道具图片只展示道具本身，不包含任何人体部位或使用场景
 */
function buildPropImagePrompt(prop: any, styleParams?: {
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
}, hasAnchorImage: boolean = false): string {
  const hierarchyMap: Record<string, string> = {
    'key': 'hero item, prominently featured',
    'important': 'significant item',
    'background': 'background item'
  };

  const parts: string[] = [];
  
  // 道具名称 - 使用 "isolated object" 强调单独展示
  parts.push(`Isolated ${prop.name || 'object'} on plain background`);
  
  // 层级
  if (prop.hierarchy) {
    parts.push(hierarchyMap[prop.hierarchy] || '');
  }
  
  // 功能描述 - 只描述道具特性，不描述使用方式
  // 避免使用 "used for" 这类暗示使用场景的词汇
  if (prop.function) {
    // 过滤掉可能暗示手持的描述
    const cleanFunction = prop.function
      .replace(/手持|握持|拿着|使用|操作/g, '')
      .trim();
    if (cleanFunction) parts.push(`function: ${cleanFunction}`);
  }
  
  // 材质和颜色
  if (prop.material) parts.push(`${prop.material} material`);
  if (prop.color) parts.push(`${prop.color} color`);
  
  // 尺寸 - 过滤掉"手持式"等描述
  if (prop.size) {
    const cleanSize = prop.size
      .replace(/手持式|手持|握持|便携式/g, '')
      .replace(/，/g, ', ')
      .trim();
    if (cleanSize) parts.push(`size: ${cleanSize}`);
  }
  
  // 视觉设计描述
  if (prop.visualDesign) parts.push(prop.visualDesign);
  
  // 风格参数（从卡片上读取）
  if (styleParams) {
    // 建筑风格
    if (styleParams.architecturalStyle && styleParams.architecturalStyle.trim()) {
      parts.push(`${styleParams.architecturalStyle.trim()} style`);
    }
    // 整体色调
    if (styleParams.colorTone && styleParams.colorTone.trim()) {
      parts.push(`${styleParams.colorTone.trim()} color tone`);
    }
    // 主色
    if (styleParams.primaryColors && styleParams.primaryColors.trim()) {
      parts.push(`primary colors: ${styleParams.primaryColors.trim()}`);
    }
    // 色彩情绪
    if (styleParams.colorMood && styleParams.colorMood.trim()) {
      parts.push(`${styleParams.colorMood.trim()} mood`);
    }
    // 风格描述（最重要）
    if (styleParams.styleDescription && styleParams.styleDescription.trim()) {
      parts.push(`Art style: ${styleParams.styleDescription.trim()} (only reference the style characteristics, do not include any content elements from reference images)`);
    }
  }
  
  // 【关键】明确排除手和人体部位，强调只展示道具本身
  parts.push('studio lighting, centered composition, solid color background, object only');
  parts.push('2K high quality resolution');
  parts.push('NO HANDS, NO FINGERS, NO HUMAN BODY PARTS, NO PERSON HOLDING THE OBJECT');
  parts.push('NO TEXT, NO LETTERS, NO WORDS, NO WATERMARKS, NO LOGOS, NO BRAND NAMES');
  
  // 如果是重新生成（有锚定图），强调道具一致性
  if (hasAnchorImage) {
    parts.push('CRITICAL PROP CONSISTENCY: This is a re-generation request. The prop MUST have the EXACT SAME shape, material texture, color, design details, and overall appearance as shown in the reference prop image. Maintain identical proportions and visual characteristics. Only minor angle or lighting variations are acceptable.');
  }
  
  return parts.join(', ');
}

// ============================================================================
// 形象场景设计 Agent
// ============================================================================

async function generateDesign(input: DesignGenerationInput, apiKey?: string): Promise<DesignPlan> {
  const { adaptedStory, storyType, visualStyle } = input;

  const systemPrompt = `你是一位顶级的动漫/3D角色设计师，擅长为动漫、漫画、游戏设计帅气、美丽、有魅力的角色形象。
你的设计风格参考日本动漫、韩漫、国漫的顶级作品，角色要有“主角光环”，绝不能像路人甲。

【核心设计原则 - 动漫角色必须帅/美】
1. 主角必须外表出众：即使是“普通人”设定，也要有让人一眼记住的特征，绝不能是路人甲的平庸外表
2. 角色要有辨识度：独特的发色/发型、精致的五官、标志性配饰，在人群中能一眼认出
3. 服装要有设计感：即使是现代装也要有时尚感或独特细节，不能是“旧T恤+灰色牛仔裤”这种路人款
4. 气质要有魅力：主角的眼神、姿态要有主角的锐气或魅力，不能是“无奈”“颓废”这种路人感

【动漫角色视觉设计要点】
- 发型：动漫角色的发型是辨识度的关键，要有造型感，可以是独特的发色（银白、深蓝、黑红等）或独特的发型
- 眼睛：动漫角色的眼睛是灵魂，要有神采，可以是独特的眸色或特殊的眼神
- 服装：要有设计感和细节，体现角色身份和个性，可以有标志性元素（如特殊纹样、配饰、颜色搭配）
- 配饰：标志性配饰能大大提升辨识度（如项链、耳环、手环、特殊武器等）
- 体型：动漫角色通常有理想化的体型比例，不要设计成“略显单薄”这种路人体型

【角色定位与视觉层级】
- protagonist（主角）：必须是最帅/最美的，视觉冲击力最强，色彩最鲜明
- deuteragonist（重要配角）：也要帅/美，但风格与主角区分
- supporting（配角）：可以稍微普通，但也要有特色
- antagonist（反派）：要有压迫感或邪魅，不能像小喽喽

【重要】角色阶段性变化处理规则：
- 如果角色在故事中有明显的阶段性变化（如"前期/后期"、"变身前/变身后"、"黑化前/黑化后"、"成长前/成长后"等），必须将该角色拆分为多个独立的角色条目
- 每个阶段作为独立角色，角色名称添加阶段标注，如："叶青（前期）"、"叶青（后期）"
- 拆分后的角色使用 baseCharacterId 字段标注它们属于同一个原始角色
- 每个阶段的角色都要有完整独立的视觉设计（服装、发型、配饰等都要分开描述）
- 不要在一个角色的描述中混合多个阶段的设计

输出格式要求：
- 返回纯JSON格式，不要包含任何markdown标记
- 所有字段必须完整填写`;

  const userPrompt = `请根据以下故事内容设计视觉方案：

【故事内容】
${adaptedStory}

【设计要求】
- 故事类型：${storyType}
- 视觉风格：${visualStyle || '根据故事自动判断'}

请返回以下JSON格式：
{
  "id": "design_${Date.now()}",
  "projectId": "",
  "scriptId": "",
  "architecturalStyle": "建筑风格（根据剧本内容推断，如：现代都市/中式古典/日式传统/哥特式/工业风/赛博朋克/末日废墟/未来科幻/奇幻魔法等，整个剧本保持一致）",
  "colorPalette": {
    "overall": "整体色调（如：冷色调/暖色调/高对比度/低饱和度/复古色调/霉色调等，整个剧本保持一致）",
    "primaryColors": ["主色1", "主色2"],
    "accentColor": "点缀色",
    "mood": "色彩情绪（如：神秘/紧张/温馨/压抑/明快等）"
  },
  "characters": [
    {
      "id": "char_1",
      "characterName": "角色名称（如有阶段性变化需添加阶段标注，如'叶青（前期）'）",
      "baseCharacterId": "原始角色ID（如果是拆分后的角色，填写原始角色的ID，否则留空）",
      "stageLabel": "阶段标签（如'前期'、'后期'、'变身前'等，无阶段变化则留空）",
      "role": "protagonist",
      "visualDesign": {
        "faceShape": "脸型描述（主角要精致美观，如：精致的鹅蛋脸/棱角分明的剑眉星目等）",
        "temperament": "气质描述（主角要有魅力，如：冷峻高贵/温柔优雅/张扬自信/神秘深邃等，不要用“无奈”“颓废”这种路人词）",
        "bodyType": "体型描述（主角要有理想化体型，如：修长纤细/健美匀称/高挑纤细等，不要用“略显单薄”这种路人词）",
        "skinTone": "肤色描述",
        "age": "年龄描述（如：18岁/25岁左右/少年等）"
      },
      "clothingDesign": {
        "style": "服装风格",
        "primaryColor": "主色",
        "secondaryColors": ["辅色1"],
        "material": "材质",
        "description": "详细描述（主角服装要有设计感，不要用“旧T恤+灰色牛仔裤”这种路人款，要有时尚感或独特细节）"
      },
      "makeupDesign": {
        "base": "底妆",
        "eyes": "眼妆",
        "lips": "唇妆",
        "other": "其他"
      },
      "hairstyleDesign": {
        "length": "长度",
        "color": "颜色（动漫角色可以有独特发色，如银白、深蓝、黑红、深紫等）",
        "style": "风格",
        "description": "详细描述（主角发型要有辨识度和造型感，不要用“未精心打理”这种路人词）"
      },
      "accessories": [
        {
          "name": "配饰名称（主角应有标志性配饰提升辨识度）",
          "description": "配饰描述",
          "color": "颜色"
        }
      ],
      "designNotes": "设计说明（说明角色视觉设计的核心理念和亮点）"
    }
  ],
  "scenes": [
    {
      "id": "scene_1",
      "sceneName": "场景名称",
      "locationType": "indoor",
      "timeSetting": "时间设定",
      "spaceDesign": {
        "layout": "布局描述",
        "depth": "纵深描述",
        "size": "大小描述",
        "activityRange": "活动范围"
      },
      "colorDesign": {
        "primaryColor": "主色",
        "secondaryColors": ["辅色"],
        "accentColor": "点缀色",
        "colorTemperature": "色温"
      },
      "lightingDesign": {
        "mainLight": "主光源",
        "fillLight": "补光",
        "backLight": "背光",
        "specialEffects": "特殊效果"
      },
      "decorations": [
        {
          "name": "装饰名称",
          "description": "描述",
          "color": "颜色",
          "position": "位置"
        }
      ],
      "essentialElements": ["必要元素"],
      "atmosphere": "氛围描述",
      "designNotes": "设计说明"
    }
  ],
  "props": [
    {
      "id": "prop_1",
      "name": "道具名称",
      "function": "功能",
      "size": "尺寸",
      "material": "材质",
      "color": "颜色",
      "visualDesign": "视觉设计描述",
      "narrativeFunction": "叙事功能",
      "hierarchy": "key",
      "screenTime": "出镜时间",
      "specialNotes": "特殊说明"
    }
  ],
  "colorHarmony": {
    "primaryColors": ["主色1", "主色2"],
    "secondaryColors": ["辅色1"],
    "accentColors": ["点缀色1"]
  },
  "styleConsistency": "风格一致性说明",
  "designNotes": "整体设计说明",
  "createdAt": "${new Date().toISOString()}",
  "updatedAt": "${new Date().toISOString()}"
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    apiKey,
  });

  const rawContent = response.choices[0]?.message?.content || '';
  const content = typeof rawContent === 'string' ? rawContent : '';
  
  console.log('LLM返回内容长度:', content.length);
  
  // 清理JSON响应 - 增强清理逻辑
  let cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
  
  // 尝试提取JSON对象（如果有其他文本包裹）
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/); 
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // 修复常见的JSON格式问题
  cleaned = cleaned
    // 修复尾随逗号
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']')
    // 修复缺少引号的键名
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
    // 修复单引号
    .replace(/'/g, '"')
    // 移除控制字符
    .replace(/[\x00-\x1F\x7F]/g, ' ');
  
  try {
    const result = JSON.parse(cleaned) as DesignPlan;
    console.log('JSON解析成功, 角色数:', result.characters?.length || 0, '场景数:', result.scenes?.length || 0, '道具数:', result.props?.length || 0);
    return result;
  } catch (error) {
    console.error('JSON解析失败:', error);
    console.error('原始内容前500字符:', content.substring(0, 500));
    console.error('清理后内容前500字符:', cleaned.substring(0, 500));
    
    // 尝试使用更宽松的解析方式 - 逐个提取数组
    try {
      const charactersMatch = cleaned.match(/"characters"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"(?:scenes|props|colorHarmony))/i);
      const scenesMatch = cleaned.match(/"scenes"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"(?:props|colorHarmony))/i);
      const propsMatch = cleaned.match(/"props"\s*:\s*(\[[\s\S]*?\])(?=\s*,\s*"colorHarmony)/i);
      
      const characters = charactersMatch ? JSON.parse(charactersMatch[1]) : [];
      const scenes = scenesMatch ? JSON.parse(scenesMatch[1]) : [];
      const props = propsMatch ? JSON.parse(propsMatch[1]) : [];
      
      if (characters.length > 0 || scenes.length > 0 || props.length > 0) {
        console.log('部分解析成功, 角色数:', characters.length, '场景数:', scenes.length, '道具数:', props.length);
        return {
          id: `design_${Date.now()}`,
          projectId: "",
          scriptId: "",
          characters,
          scenes,
          props,
          colorHarmony: {
            primaryColors: [],
            secondaryColors: [],
            accentColors: []
          },
          styleConsistency: "",
          designNotes: "部分解析",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }
    } catch (partialError) {
      console.error('部分解析也失败:', partialError);
    }
    
    // 如果所有解析都失败，抛出错误而不是返回空结果
    throw new Error('设计方案生成失败：AI返回的数据格式无法解析，请重试');
  }
}

// ============================================================================
// 分镜脚本 Agent
// ============================================================================

async function generateStoryboard(input: StoryboardGenerationInput, apiKey?: string): Promise<Storyboard> {
  const { adaptedStory, targetDuration, visualStyle, cameraPreference } = input;

  const systemPrompt = `你是一位专业的分镜师，擅长将故事转化为专业的分镜脚本。
你需要设计每个镜头的景别、运镜、构图、色彩、光影和音效。

分镜原则：
1. 镜头切换要流畅自然
2. 景别变化要有节奏感
3. 运镜要服务于叙事
4. 视觉设计要统一协调
5. 音效设计要增强氛围

输出格式要求：
- 返回纯JSON格式，不要包含任何markdown标记
- 所有字段必须完整填写`;

  const userPrompt = `请根据以下故事内容生成分镜脚本：

【故事内容】
${adaptedStory}

【分镜要求】
- 目标时长：${targetDuration}秒
- 视觉风格：${visualStyle || '根据故事自动判断'}
- 运镜偏好：${cameraPreference || '混合使用'}

请返回以下JSON格式：
{
  "id": "storyboard_${Date.now()}",
  "projectId": "",
  "scriptId": "",
  "episodeNumber": 1,
  "episodeTitle": "分镜标题",
  "shots": [
    {
      "shotId": 1,
      "sceneId": 1,
      "shotType": "中景",
      "cameraMovement": "静止",
      "location": "场景地点",
      "characters": ["角色1"],
      "characterActions": "角色动作描述",
      "dialogue": "对话内容",
      "voiceover": "旁白内容",
      "duration": 3,
      "cumulativeDuration": 3,
      "pace": "normal",
      "emotionalTone": "情绪基调",
      "narrativeFunction": "叙事功能",
      "visualDesign": {
        "composition": {
          "type": "构图类型",
          "description": "构图描述",
          "focalPoint": "焦点",
          "depthLayers": ["前景", "中景", "背景"]
        },
        "color": {
          "primaryColor": "主色",
          "secondaryColors": ["辅色"],
          "tone": "色调",
          "saturation": "饱和度",
          "emotionalIntent": "情感意图"
        },
        "lighting": {
          "type": "光源类型",
          "intensity": "强度",
          "direction": "方向",
          "colorTemperature": "色温",
          "shadows": "阴影描述"
        }
      },
      "audioDesign": {
        "backgroundMusic": {
          "name": "音乐名称",
          "style": "风格",
          "emotionalTone": "情绪",
          "tempo": "节奏",
          "intensity": "medium"
        },
        "soundEffects": ["音效1"],
        "ambientSound": "环境音"
      },
      "scriptReferences": {
        "sceneId": 1,
        "actionIds": [1],
        "dialogueId": 1,
        "conflictId": null,
        "emotionalArcPoint": "start"
      },
      "visualNotes": "视觉备注",
      "technicalNotes": "技术备注",
      "productionNotes": "制作备注"
    }
  ],
  "scriptMapping": {
    "scriptId": "",
    "sceneMappings": [],
    "dialogueMappings": [],
    "conflictMappings": []
  },
  "statistics": {
    "totalShots": 1,
    "totalDuration": 3,
    "averageShotDuration": 3,
    "shotTypeDistribution": {"中景": 1},
    "cameraMovementDistribution": {"静止": 1},
    "paceDistribution": {"normal": 1}
  },
  "visualGuidelines": {
    "overallColorScheme": "整体色彩方案",
    "lightingStyle": "光影风格",
    "compositionPrinciples": ["构图原则1"],
    "visualConsistencyNotes": "视觉一致性说明"
  },
  "audioGuidelines": {
    "backgroundMusicStyle": "背景音乐风格",
    "soundEffectLibrary": "音效库说明",
    "dialogueTone": "对话基调",
    "audioConsistencyNotes": "音频一致性说明"
  },
  "createdAt": "${new Date().toISOString()}",
  "updatedAt": "${new Date().toISOString()}",
  "version": 1
}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    apiKey,
  });

  const rawContent = response.choices[0]?.message?.content || '';
  const content = typeof rawContent === 'string' ? rawContent : '';
  
  // 清理JSON响应
  let cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  
  try {
    return JSON.parse(cleaned) as Storyboard;
  } catch (error) {
    console.error('JSON解析失败:', error);
    return {
      id: `storyboard_${Date.now()}`,
      projectId: "",
      scriptId: "",
      episodeNumber: 1,
      episodeTitle: "",
      shots: [],
      scriptMapping: {
        scriptId: "",
        sceneMappings: [],
        dialogueMappings: [],
        conflictMappings: []
      },
      statistics: {
        totalShots: 0,
        totalDuration: 0,
        averageShotDuration: 0,
        shotTypeDistribution: {},
        cameraMovementDistribution: {},
        paceDistribution: {}
      },
      visualGuidelines: {
        overallColorScheme: "",
        lightingStyle: "",
        compositionPrinciples: [],
        visualConsistencyNotes: ""
      },
      audioGuidelines: {
        backgroundMusicStyle: "",
        soundEffectLibrary: "",
        dialogueTone: "",
        audioConsistencyNotes: ""
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
  }
}

// ============================================================================
// 路由定义
// ============================================================================

export const basicCreationRouter = router({
  // ========== 工具接口 ==========
  
  // 代理获取图片并转为 base64（解决 CORS 问题）
  fetchImageAsBase64: protectedProcedure
    .input(z.object({ url: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const response = await fetch(input.url);
        if (!response.ok) {
          throw new Error(`图片加载失败: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        return {
          success: true,
          base64: `data:${contentType};base64,${base64}`,
        };
      } catch (error: any) {
        console.error('[fetchImageAsBase64] 失败:', error.message);
        return {
          success: false,
          error: error.message,
        };
      }
    }),

  // ========== 剧本改编 ==========
  
  // 分析内容推荐集数
  analyzeContent: protectedProcedure
    .input(z.object({
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return await analyzeContentForEpisodes(input.content, ctx.user?.apiKey);
    }),

  // 生成剧本（完整5步流程）
  generateScript: protectedProcedure
    .input(z.object({
      canvasId: z.number(),
      originalContent: z.string().min(1),
      episodeCount: z.number().default(0),
      durationPerEpisode: z.number().default(120),
      storyType: z.string().default("都市情感"),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await generateScript({
        originalContent: input.originalContent,
        episodeCount: input.episodeCount,
        durationPerEpisode: input.durationPerEpisode,
        storyType: input.storyType,
        apiKey: ctx.user?.apiKey,
      });

      // 检查是否有同名剧本，如果有则自动添加编号
      const db = await getDb();
      let finalTitle = result.metadata.title;
      
      // 查询该用户所有同名或同名带编号的剧本
      const existingScripts = await db!.select({ title: scripts.title })
        .from(scripts)
        .where(eq(scripts.userId, ctx.user.id));
      
      // 提取所有匹配的标题（包括带编号的）
      const baseTitle = result.metadata.title;
      const matchingTitles = existingScripts
        .map(s => s.title)
        .filter(t => t === baseTitle || t?.startsWith(`${baseTitle} (`));
      
      if (matchingTitles.length > 0) {
        // 找出最大编号
        let maxNumber = 1;
        for (const title of matchingTitles) {
          if (title === baseTitle) {
            // 原始标题存在，至少需要编号 2
            maxNumber = Math.max(maxNumber, 1);
          } else {
            // 提取编号，如 "标题 (2)" -> 2
            const match = title?.match(/\((\d+)\)$/);
            if (match) {
              maxNumber = Math.max(maxNumber, parseInt(match[1]));
            }
          }
        }
        // 新编号 = 最大编号 + 1
        finalTitle = `${baseTitle} (${maxNumber + 1})`;
      }

      // 保存到数据库
      const [inserted] = await db!.insert(scripts).values({
        userId: ctx.user.id,
        canvasId: input.canvasId,
        title: finalTitle,
        originalContent: input.originalContent,
        adaptedStory: result.adaptedStory,
        adaptationAnalysis: result.adaptationAnalysis,
        storyType: input.storyType,
        episodeCount: result.metadata.episodeCount,
        totalDuration: result.metadata.totalDuration,
        durationPerEpisode: input.durationPerEpisode,
        storyStructure: result.storyStructure,
        episodes: result.episodes,
        qualityMetrics: result.qualityMetrics,
        rawContent: result.rawContent,
        status: "generated",
      });

      // 设置每集的默认核心冲突和关键事件（显示"优化中..."）
      const episodesWithPending = result.episodes.map(ep => ({
        ...ep,
        coreConflict: '优化中...',
        keyEvents: [],
        conflictIntensity: 5,
        insightStatus: 'pending' as const,
      }));
      result.episodes = episodesWithPending;

      // 异步执行核心冲突提取（不阻塞主流程）
      const scriptId = Number(inserted.insertId);
      setImmediate(async () => {
        try {
          const episodes = result.episodes || [];
          
          if (episodes.length > 0) {
            console.log(`[剧本洞察] 开始异步提取核心冲突和关键事件 (scriptId: ${scriptId})`);
            
            // 专业导演/编导视角的分析提示词
            const directorPrompt = `你是一位资深的影视导演和编剧，拥有丰富的短剧/网剧创作经验。
你的任务是以专业视角分析剧本，提取每集的核心戏剧冲突和关键事件。

【分析原则】
1. 核心冲突必须是戏剧性的：谁vs谁？为了什么？赌注是什么？
2. 关键事件必须是推动剧情发展的节点，不是普通对话
3. 冲突强度要考虑：情感张力、利益对立、生死攻关
4. 关键事件要简洁有力，每个事件一句话概括

请严格按照 JSON 数组格式输出，每个元素包含：
- episodeNumber: 集数
- coreConflict: 核心冲突描述
- conflictIntensity: 1-10的冲突强度评分
- keyEvents: 关键事件数组`;

            // 构建每集的内容摘要
            const episodeSummaries = episodes.map(ep => {
              const scenes = ep.scenes || [];
              const sceneDescriptions = scenes.map((s: any, idx: number) => {
                const parts = [];
                if (s.location) parts.push(`场景：${s.location}`);
                if (s.dialogue) parts.push(`对话：${s.dialogue.slice(0, 100)}`);
                if (s.characterActions) parts.push(`动作：${s.characterActions}`);
                return `场景${idx + 1}: ${parts.join(' | ')}`;
              }).join('\n');

              return `## 第${ep.episodeNumber}集：${ep.title || ''}
黄金3秒钩子：${ep.hook || '无'}
${sceneDescriptions}
悬念结尾：${ep.cliffhanger || '无'}`;
            }).join('\n\n---\n\n');

            // 调用 LLM 分析
            const response = await invokeLLM({
              messages: [
                { role: "system", content: directorPrompt },
                { role: "user", content: `请分析以下剧本内容，提取每集的核心冲突和关键事件：\n\n${episodeSummaries}` }
              ],
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "episode_insights",
                  strict: true,
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        episodeNumber: { type: "integer" },
                        coreConflict: { type: "string" },
                        conflictIntensity: { type: "integer" },
                        keyEvents: { type: "array", items: { type: "string" } }
                      },
                      required: ["episodeNumber", "coreConflict", "conflictIntensity", "keyEvents"],
                      additionalProperties: false
                    }
                  }
                }
              },
              apiKey: ctx.user?.apiKey,
            });

            const content = response.choices?.[0]?.message?.content;
            if (typeof content === 'string') {
              try {
                const insights = JSON.parse(content);
                
                // 重新从数据库获取最新的 episodes
                const currentScript = await db!.select().from(scripts).where(eq(scripts.id, scriptId));
                if (currentScript.length > 0) {
                  const currentEpisodes = currentScript[0].episodes as any[] || [];
                  
                  // 更新每集的核心冲突和关键事件
                  const updatedEpisodes = currentEpisodes.map(ep => {
                    const insight = insights.find((i: any) => i.episodeNumber === ep.episodeNumber);
                    if (insight) {
                      return {
                        ...ep,
                        coreConflict: insight.coreConflict,
                        conflictIntensity: insight.conflictIntensity,
                        keyEvents: insight.keyEvents,
                        insightStatus: 'completed',
                      };
                    }
                    return { ...ep, insightStatus: 'completed' };
                  });

                  // 更新数据库
                  await db!.update(scripts)
                    .set({ episodes: updatedEpisodes })
                    .where(eq(scripts.id, scriptId));
                  
                  console.log(`[剧本洞察] 已为 ${episodes.length} 集提取核心冲突和关键事件 (scriptId: ${scriptId})`);
                }
              } catch (parseError) {
                console.error('[剧本洞察] 解析 LLM 返回失败:', parseError);
              }
            }
          }
        } catch (insightError) {
          console.error('[剧本洞察] 异步提取核心冲突和关键事件失败:', insightError);
        }
      });

      return {
        id: inserted.insertId,
        ...result,
      };
    }),

  // 优化剧本
  optimizeScript: protectedProcedure
    .input(z.object({
      scriptId: z.number(),
      originalContent: z.string(),
      durationPerEpisode: z.number().optional(), // 用户当前选择的每集时长
    }))
    .mutation(async ({ ctx, input }) => {
      // 获取当前剧本
      const [currentScript] = await (await getDb())!.select()
        .from(scripts)
        .where(and(
          eq(scripts.id, input.scriptId),
          eq(scripts.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!currentScript) {
        throw new Error('剧本不存在');
      }

      // 构建GeneratedScript对象
      const scriptData: GeneratedScript = {
        metadata: {
          title: currentScript.title || '未命名',
          storyConcept: '',
          episodeCount: currentScript.episodeCount || 0,
          totalDuration: currentScript.totalDuration || 0,
          storyType: currentScript.storyType || '',
          generationTimestamp: new Date().toISOString(),
          version: '1.0'
        },
        adaptationAnalysis: currentScript.adaptationAnalysis || '',
        adaptedStory: currentScript.adaptedStory || '',
        storyStructure: currentScript.storyStructure as any || {
          mainLine: { description: '', goal: '', conflict: '' },
          structurePlan: {
            opening: { episodeRange: '', purpose: '', keyEvents: [] },
            development: { episodeRange: '', purpose: '', keyEvents: [] },
            climax: { episodeRange: '', purpose: '', keyEvents: [] },
            ending: { episodeRange: '', purpose: '', keyEvents: [] }
          }
        },
        episodes: currentScript.episodes as Episode[] || [],
        qualityMetrics: currentScript.qualityMetrics as QualityMetrics || {
          mainLineClarity: 0,
          conflictProgression: 0,
          pacingControl: 0,
          dialogueQuality: 0,
          visualDesign: 0,
          overallScore: 0,
          qualityStatus: 'FAIL',
          issues: [],
          suggestions: []
        },
        rawContent: currentScript.rawContent || ''
      };

      const optimized = await optimizeScript(scriptData, input.originalContent, input.durationPerEpisode, ctx.user?.apiKey || undefined);

      // 更新数据库
      await (await getDb())!.update(scripts)
        .set({
          episodes: optimized.episodes,
          qualityMetrics: optimized.qualityMetrics,
          rawContent: optimized.rawContent,
          status: "optimized",
        })
        .where(eq(scripts.id, input.scriptId));

      return optimized;
    }),

  // 导出剧本为Markdown
  exportScript: protectedProcedure
    .input(z.object({
      scriptId: z.number(),
      format: z.enum(['markdown', 'json', 'txt']).default('markdown'),
    }))
    .query(async ({ ctx, input }) => {
      const [script] = await (await getDb())!.select()
        .from(scripts)
        .where(and(
          eq(scripts.id, input.scriptId),
          eq(scripts.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!script) {
        throw new Error('剧本不存在');
      }

      const scriptData: GeneratedScript = {
        metadata: {
          title: script.title || '未命名',
          storyConcept: '',
          episodeCount: script.episodeCount || 0,
          totalDuration: script.totalDuration || 0,
          storyType: script.storyType || '',
          generationTimestamp: new Date().toISOString(),
          version: '1.0'
        },
        adaptationAnalysis: script.adaptationAnalysis || '',
        adaptedStory: script.adaptedStory || '',
        storyStructure: script.storyStructure as any,
        episodes: script.episodes as Episode[] || [],
        qualityMetrics: script.qualityMetrics as QualityMetrics,
        rawContent: script.rawContent || ''
      };

      if (input.format === 'markdown') {
        return { content: exportToMarkdown(scriptData), filename: `${script.title || '剧本'}.md` };
      } else if (input.format === 'json') {
        return { content: JSON.stringify(scriptData, null, 2), filename: `${script.title || '剧本'}.json` };
      } else {
        // txt格式
        let txt = `${script.title || '剧本'}\n\n`;
        txt += `改编分析：\n${script.adaptationAnalysis}\n\n`;
        txt += `改编后的故事：\n${script.adaptedStory}\n\n`;
        return { content: txt, filename: `${script.title || '剧本'}.txt` };
      }
    }),

  // 获取画布的所有剧本
  getScriptsByCanvas: protectedProcedure
    .input(z.object({ canvasId: z.number() }))
    .query(async ({ ctx, input }) => {
      const result = await (await getDb())!.select()
        .from(scripts)
        .where(and(
          eq(scripts.userId, ctx.user.id),
          eq(scripts.canvasId, input.canvasId)
        ))
        .orderBy(desc(scripts.updatedAt));
      
      return result;
    }),

  // 获取单个剧本
  getScript: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [result] = await (await getDb())!.select()
        .from(scripts)
        .where(and(
          eq(scripts.id, input.id),
          eq(scripts.userId, ctx.user.id)
        ))
        .limit(1);
      
      return result || null;
    }),

  // 更新剧本
  updateScript: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      adaptedStory: z.string().optional(),
      episodes: z.any().optional(),
      status: z.enum(["draft", "generated", "optimized", "completed"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await (await getDb())!.update(scripts)
        .set(updates)
        .where(and(
          eq(scripts.id, id),
          eq(scripts.userId, ctx.user.id)
        ));
      return { success: true };
    }),

  // 删除剧本
  deleteScript: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await (await getDb())!.delete(scripts)
        .where(and(
          eq(scripts.id, input.id),
          eq(scripts.userId, ctx.user.id)
        ));
      return { success: true };
    }),

  // ========== 形象场景设计 ==========

  generateDesign: protectedProcedure
    .input(z.object({
      canvasId: z.number(),
      scriptId: z.number().optional(),
      adaptedStory: z.string().min(1),
      storyType: z.string().default("都市情感"),
      visualStyle: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await generateDesign({
        adaptedStory: input.adaptedStory,
        storyType: input.storyType,
        visualStyle: input.visualStyle,
      }, ctx.user?.apiKey);

      const [inserted] = await (await getDb())!.insert(designs).values({
        userId: ctx.user.id,
        canvasId: input.canvasId,
        scriptId: input.scriptId,
        characters: result.characters,
        scenes: result.scenes,
        props: result.props,
        colorHarmony: result.colorHarmony,
        styleConsistency: result.styleConsistency,
        visualStyle: input.visualStyle,
        designNotes: result.designNotes,
        status: "generated",
      });

      return {
        dbId: inserted.insertId,
        ...result,
      };
    }),

  getDesignsByCanvas: protectedProcedure
    .input(z.object({ canvasId: z.number() }))
    .query(async ({ ctx, input }) => {
      const result = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.userId, ctx.user.id),
          eq(designs.canvasId, input.canvasId)
        ))
        .orderBy(desc(designs.updatedAt));
      
      return result;
    }),

  getDesign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [result] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.id, input.id),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);
      
      return result || null;
    }),

  updateDesign: protectedProcedure
    .input(z.object({
      id: z.number(),
      characters: z.any().optional(),
      scenes: z.any().optional(),
      props: z.any().optional(),
      designNotes: z.string().optional(),
      styleReferenceImage: z.string().nullable().optional(),
      styleDescription: z.string().nullable().optional(),
      // 全局风格设定字段
      architecturalStyle: z.string().nullable().optional(),
      colorPalette: z.object({
        overall: z.string().optional(),
        primaryColors: z.array(z.string()).optional(),
        accentColor: z.string().optional(),
        mood: z.string().optional(),
      }).nullable().optional(),
      stylePreviewImages: z.array(z.object({
        url: z.string(),
        description: z.string().optional(),
      })).nullable().optional(),
      status: z.enum(["draft", "generated", "completed"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      await (await getDb())!.update(designs)
        .set(updates)
        .where(and(
          eq(designs.id, id),
          eq(designs.userId, ctx.user.id)
        ));
      return { success: true };
    }),

  deleteDesign: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await (await getDb())!.delete(designs)
        .where(and(
          eq(designs.id, input.id),
          eq(designs.userId, ctx.user.id)
        ));
      return { success: true };
    }),

  // ========== 形象场景设计 - 图片生成 ==========

  // 生成角色设计图片（形象场景设计模块）
  generateDesignCharacterImage: protectedProcedure
    .input(z.object({
      designId: z.number(),
      characterId: z.string(),
      aspectRatio: z.enum(['1:1', '16:9', '9:16']).default('1:1'),
      styleReferenceImage: z.string().optional(), // 风格预览板图片
      // 卡片上的风格字段
      styleDescription: z.string().optional(),
      architecturalStyle: z.string().optional(),
      colorTone: z.string().optional(),
      primaryColors: z.string().optional(),
      colorMood: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // 获取设计数据
      const [design] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.id, input.designId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!design) {
        throw new Error('设计数据不存在');
      }

      const characters = design.characters as any[] || [];
      const character = characters.find((c: any) => c.id === input.characterId);
      
      if (!character) {
        throw new Error('角色不存在');
      }

      // 判断是否有锚定图（角色已有图片，无论是生成的、上传的还是从资产库导入的）
      const hasAnchorImage = !!character.imageUrl;
      
      // 构建图片生成提示词，使用卡片上的风格字段，并传入是否有锚定图
      const prompt = buildCharacterImagePrompt(character, {
        styleDescription: input.styleDescription,
        architecturalStyle: input.architecturalStyle,
        colorTone: input.colorTone,
        primaryColors: input.primaryColors,
        colorMood: input.colorMood,
      }, hasAnchorImage);
      
      // 构建参考图数组
      const originalImages: Array<{ url: string; mimeType: string }> = [];
      
      // 风格预览板图片（全局风格参考）
      if (input.styleReferenceImage) {
        originalImages.push({ url: input.styleReferenceImage, mimeType: 'image/jpeg' });
      }
      
      // 角色锚定图（如果角色已有图片，用于保持角色外观一致性）
      // 无论是AI生成的、用户上传的、还是从资产库导入的，都作为参考图
      if (character.imageUrl) {
        originalImages.push({ url: character.imageUrl, mimeType: 'image/jpeg' });
      }
      
      // 调用图片生成API
      const { generateImagePro } = await import('./_core/imageGeneration');
      const result = await generateImagePro({
        prompt,
        aspectRatio: input.aspectRatio,
        imageSize: '2K',
        apiKey: ctx.user?.apiKey,
        ...(originalImages.length > 0 ? { originalImages } : {}),
      });

      // 使用 OSS URL（base64 太大会导致数据库存储问题）
      const imageUrl = result.url || '';
      console.log(`[DesignCharacter] 使用 OSS URL: ${imageUrl}`);

      // 重新读取最新的设计数据，避免并发写入覆盖问题
      const [latestDesign] = await (await getDb())!.select()
        .from(designs)
        .where(eq(designs.id, input.designId))
        .limit(1);
      
      const latestCharacters = (latestDesign?.characters as any[]) || [];
      
      // 更新设计数据中的图片URL
      const updatedCharacters = latestCharacters.map((c: any) => 
        c.id === input.characterId 
          ? { ...c, imageUrl, aspectRatio: input.aspectRatio, generationStatus: 'completed' }
          : c
      );

      await (await getDb())!.update(designs)
        .set({ characters: updatedCharacters })
        .where(eq(designs.id, input.designId));

      return { success: true, imageUrl };
    }),

  // 生成场景设计图片（形象场景设计模块）
  generateDesignSceneImage: protectedProcedure
    .input(z.object({
      designId: z.number(),
      sceneId: z.string(),
      aspectRatio: z.enum(['1:1', '16:9', '9:16']).default('16:9'),
      styleReferenceImage: z.string().optional(), // 风格预览板图片
      // 卡片上的风格字段
      styleDescription: z.string().optional(),
      architecturalStyle: z.string().optional(),
      colorTone: z.string().optional(),
      primaryColors: z.string().optional(),
      colorMood: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [design] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.id, input.designId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!design) {
        throw new Error('设计数据不存在');
      }

      const scenes = design.scenes as any[] || [];
      const scene = scenes.find((s: any) => s.id === input.sceneId);
      
      if (!scene) {
        throw new Error('场景不存在');
      }

      // 判断是否有锚定图（场景已有图片，无论是生成的、上传的还是从资产库导入的）
      const hasAnchorImage = !!scene.imageUrl;
      
      // 构建图片生成提示词，使用卡片上的风格字段，并传入是否有锚定图
      const prompt = buildSceneImagePrompt(scene, {
        styleDescription: input.styleDescription,
        architecturalStyle: input.architecturalStyle,
        colorTone: input.colorTone,
        primaryColors: input.primaryColors,
        colorMood: input.colorMood,
      }, hasAnchorImage);
      
      // 构建参考图数组
      const originalImages: Array<{ url: string; mimeType: string }> = [];
      
      // 风格预览板图片（全局风格参考）
      if (input.styleReferenceImage) {
        originalImages.push({ url: input.styleReferenceImage, mimeType: 'image/jpeg' });
      }
      
      // 场景锚定图（如果场景已有图片，用于保持场景风格一致性）
      // 无论是AI生成的、用户上传的、还是从资产库导入的，都作为参考图
      if (scene.imageUrl) {
        originalImages.push({ url: scene.imageUrl, mimeType: 'image/jpeg' });
      }
      
      // 调用图片生成API
      const { generateImagePro } = await import('./_core/imageGeneration');
      const result = await generateImagePro({
        prompt,
        aspectRatio: input.aspectRatio,
        imageSize: '2K',
        apiKey: ctx.user?.apiKey,
        ...(originalImages.length > 0 ? { originalImages } : {}),
      });

      // 使用 OSS URL（base64 太大会导致数据库存储问题）
      const imageUrl = result.url || '';
      console.log(`[DesignScene] 使用 OSS URL: ${imageUrl}`);

      // 重新读取最新的设计数据，避免并发写入覆盖问题
      const [latestDesign] = await (await getDb())!.select()
        .from(designs)
        .where(eq(designs.id, input.designId))
        .limit(1);
      
      const latestScenes = (latestDesign?.scenes as any[]) || [];

      const updatedScenes = latestScenes.map((s: any) => 
        s.id === input.sceneId 
          ? { ...s, imageUrl, aspectRatio: input.aspectRatio, generationStatus: 'completed' }
          : s
      );

      await (await getDb())!.update(designs)
        .set({ scenes: updatedScenes })
        .where(eq(designs.id, input.designId));

      return { success: true, imageUrl };
    }),

  // 生成道具设计图片（形象场景设计模块）
  generateDesignPropImage: protectedProcedure
    .input(z.object({
      designId: z.number(),
      propId: z.string(),
      aspectRatio: z.enum(['1:1', '16:9', '9:16']).default('1:1'),
      styleReferenceImage: z.string().optional(), // 风格预览板图片
      // 卡片上的风格字段
      styleDescription: z.string().optional(),
      architecturalStyle: z.string().optional(),
      colorTone: z.string().optional(),
      primaryColors: z.string().optional(),
      colorMood: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [design] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.id, input.designId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!design) {
        throw new Error('设计数据不存在');
      }

      const props = design.props as any[] || [];
      const prop = props.find((p: any) => p.id === input.propId);
      
      if (!prop) {
        throw new Error('道具不存在');
      }

      // 判断是否有锚定图（道具已有图片，无论是生成的、上传的还是从资产库导入的）
      const hasAnchorImage = !!prop.imageUrl;
      
      // 构建图片生成提示词，使用卡片上的风格字段，并传入是否有锚定图
      const prompt = buildPropImagePrompt(prop, {
        styleDescription: input.styleDescription,
        architecturalStyle: input.architecturalStyle,
        colorTone: input.colorTone,
        primaryColors: input.primaryColors,
        colorMood: input.colorMood,
      }, hasAnchorImage);
      
      // 构建参考图数组
      const originalImages: Array<{ url: string; mimeType: string }> = [];
      
      // 风格预览板图片（全局风格参考）
      if (input.styleReferenceImage) {
        originalImages.push({ url: input.styleReferenceImage, mimeType: 'image/jpeg' });
      }
      
      // 道具锚定图（如果道具已有图片，用于保持道具外观一致性）
      // 无论是AI生成的、用户上传的、还是从资产库导入的，都作为参考图
      if (prop.imageUrl) {
        originalImages.push({ url: prop.imageUrl, mimeType: 'image/jpeg' });
      }
      
      // 调用图片生成API
      const { generateImagePro } = await import('./_core/imageGeneration');
      const result = await generateImagePro({
        prompt,
        aspectRatio: input.aspectRatio,
        imageSize: '2K',
        apiKey: ctx.user?.apiKey,
        ...(originalImages.length > 0 ? { originalImages } : {}),
      });

      // 使用 OSS URL（base64 太大会导致数据库存储问题）
      const imageUrl = result.url || '';
      console.log(`[DesignProp] 使用 OSS URL: ${imageUrl}`);

      // 重新读取最新的设计数据，避免并发写入覆盖问题
      const [latestDesign] = await (await getDb())!.select()
        .from(designs)
        .where(eq(designs.id, input.designId))
        .limit(1);
      
      const latestProps = (latestDesign?.props as any[]) || [];

      const updatedProps = latestProps.map((p: any) => 
        p.id === input.propId 
          ? { ...p, imageUrl, aspectRatio: input.aspectRatio, generationStatus: 'completed' }
          : p
      );

      await (await getDb())!.update(designs)
        .set({ props: updatedProps })
        .where(eq(designs.id, input.designId));

      return { success: true, imageUrl };
    }),

  // 批量生成所有设计图片
  batchGenerateDesignImages: protectedProcedure
    .input(z.object({
      designId: z.number(),
      styleReferenceImage: z.string().optional(),
      styleDescription: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [design] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.id, input.designId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!design) {
        throw new Error('设计数据不存在');
      }

      const { generateImagePro } = await import('./_core/imageGeneration');
      const results: { type: string; id: string; success: boolean; imageUrl?: string; error?: string }[] = [];

      // 生成角色图片
      const characters = design.characters as any[] || [];
      for (const character of characters) {
        if (!character.imageUrl) {
          try {
            const prompt = buildCharacterImagePrompt(character, { styleDescription: input.styleDescription }, false);
            const generateOptions: any = { prompt, aspectRatio: '1:1', imageSize: '2K' };
            if (input.styleReferenceImage) {
              generateOptions.originalImages = [{ url: input.styleReferenceImage, mimeType: 'image/jpeg' }];
            }
            const result = await generateImagePro(generateOptions);
            // 使用 OSS URL
            const imageUrl = result.url || '';
            character.imageUrl = imageUrl;
            character.generationStatus = 'completed';
            results.push({ type: 'character', id: character.id, success: true, imageUrl });
          } catch (error: any) {
            character.generationStatus = 'failed';
            results.push({ type: 'character', id: character.id, success: false, error: error.message });
          }
        }
      }

      // 生成场景图片
      const scenes = design.scenes as any[] || [];
      for (const scene of scenes) {
        if (!scene.imageUrl) {
          try {
            const prompt = buildSceneImagePrompt(scene, { styleDescription: input.styleDescription }, false);
            const generateOptions: any = { prompt, aspectRatio: '16:9', imageSize: '2K' };
            if (input.styleReferenceImage) {
              generateOptions.originalImages = [{ url: input.styleReferenceImage, mimeType: 'image/jpeg' }];
            }
            const result = await generateImagePro(generateOptions);
            // 使用 OSS URL
            const imageUrl = result.url || '';
            scene.imageUrl = imageUrl;
            scene.generationStatus = 'completed';
            results.push({ type: 'scene', id: scene.id, success: true, imageUrl });
          } catch (error: any) {
            scene.generationStatus = 'failed';
            results.push({ type: 'scene', id: scene.id, success: false, error: error.message });
          }
        }
      }

      // 生成道具图片
      const props = design.props as any[] || [];
      for (const prop of props) {
        if (!prop.imageUrl) {
          try {
            const prompt = buildPropImagePrompt(prop, { styleDescription: input.styleDescription }, false);
            const generateOptions: any = { prompt, aspectRatio: '1:1', imageSize: '2K' };
            if (input.styleReferenceImage) {
              generateOptions.originalImages = [{ url: input.styleReferenceImage, mimeType: 'image/jpeg' }];
            }
            const result = await generateImagePro(generateOptions);
            // 使用 OSS URL
            const imageUrl = result.url || '';
            prop.imageUrl = imageUrl;
            prop.generationStatus = 'completed';
            results.push({ type: 'prop', id: prop.id, success: true, imageUrl });
          } catch (error: any) {
            prop.generationStatus = 'failed';
            results.push({ type: 'prop', id: prop.id, success: false, error: error.message });
          }
        }
      }

      // 更新数据库
      await (await getDb())!.update(designs)
        .set({ characters, scenes, props })
        .where(eq(designs.id, input.designId));

      return { success: true, results };
    }),

  // 重新生成设计方案（基于已有剧本）
  regenerateDesignFromScript: protectedProcedure
    .input(z.object({
      canvasId: z.number(),
      scriptId: z.number(),
      visualStyle: z.string().optional(),
      stylePreviewImage: z.string().optional(), // 风格预览板图片
      styleDescription: z.string().optional(),  // 风格描述
    }))
    .mutation(async ({ ctx, input }) => {
      // 获取剧本数据
      const [script] = await (await getDb())!.select()
        .from(scripts)
        .where(and(
          eq(scripts.id, input.scriptId),
          eq(scripts.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!script || !script.adaptedStory) {
        throw new Error('剧本数据不存在或未生成改编故事');
      }

      // 生成新的设计方案
      const result = await generateDesign({
        adaptedStory: script.adaptedStory,
        storyType: script.storyType || '都市情感',
        visualStyle: input.visualStyle,
      }, ctx.user?.apiKey);

      // 检查是否已存在设计数据
      const [existingDesign] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.canvasId, input.canvasId),
          eq(designs.scriptId, input.scriptId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);

      // 准备风格预览图数据
      const stylePreviewImages = input.stylePreviewImage ? [{ url: input.stylePreviewImage }] : null;

      if (existingDesign) {
        // 更新现有设计（保留原有的风格预览图，除非传入了新的）
        const updateData: any = {
          characters: result.characters,
          scenes: result.scenes,
          props: result.props,
          colorHarmony: result.colorHarmony,
          styleConsistency: result.styleConsistency,
          designNotes: result.designNotes,
          visualStyle: input.visualStyle,
          status: 'generated',
        };
        
        // 如果传入了新的风格预览图或风格描述，更新它们
        if (stylePreviewImages) {
          updateData.stylePreviewImages = stylePreviewImages;
        }
        if (input.styleDescription) {
          updateData.styleDescription = input.styleDescription;
        }
        
        await (await getDb())!.update(designs)
          .set(updateData)
          .where(eq(designs.id, existingDesign.id));
        
        return { dbId: existingDesign.id, ...result };
      } else {
        // 创建新设计
        const [inserted] = await (await getDb())!.insert(designs).values({
          userId: ctx.user.id,
          canvasId: input.canvasId,
          scriptId: input.scriptId,
          characters: result.characters,
          scenes: result.scenes,
          props: result.props,
          colorHarmony: result.colorHarmony,
          styleConsistency: result.styleConsistency,
          visualStyle: input.visualStyle,
          designNotes: result.designNotes,
          stylePreviewImages: stylePreviewImages,
          styleDescription: input.styleDescription || null,
          status: 'generated',
        });
        
        return { dbId: inserted.insertId, ...result };
      }
    }),

  // 获取剧本关联的设计数据
  getDesignByScript: protectedProcedure
    .input(z.object({ scriptId: z.number() }))
    .query(async ({ ctx, input }) => {
      // 先只查询 id，避免大数据排序导致内存溢出
      const db = await getDb();
      if (!db) return null;
      
      const idResults = await db.select({ id: designs.id })
        .from(designs)
        .where(and(
          eq(designs.scriptId, input.scriptId),
          eq(designs.userId, ctx.user.id)
        ))
        .orderBy(desc(designs.updatedAt))
        .limit(1);
      
      if (idResults.length === 0) return null;
      
      // 再根据 id 查询完整数据
      const [result] = await db.select()
        .from(designs)
        .where(eq(designs.id, idResults[0].id))
        .limit(1);
      
      return result || null;
    }),

  // 评估设计质量
  evaluateDesignQuality: protectedProcedure
    .input(z.object({ designId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [design] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.id, input.designId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!design) {
        throw new Error('设计数据不存在');
      }

      const characters = design.characters as any[] || [];
      const scenes = design.scenes as any[] || [];
      const props = design.props as any[] || [];

      // 计算各维度评分
      const totalItems = characters.length + scenes.length + props.length;
      const completedImages = [
        ...characters.filter((c: any) => c.imageUrl),
        ...scenes.filter((s: any) => s.imageUrl),
        ...props.filter((p: any) => p.imageUrl)
      ].length;

      // 视觉吸引力：基于设计完整度
      const visualAppeal = Math.min(10, 6 + (characters.length > 0 ? 2 : 0) + (scenes.length > 0 ? 1 : 0) + (props.length > 0 ? 1 : 0));
      
      // 一致性：基于颜色和谐和风格一致性
      const hasColorHarmony = design.colorHarmony && Object.keys(design.colorHarmony).length > 0;
      const hasStyleConsistency = design.styleConsistency && design.styleConsistency.length > 0;
      const consistency = 5 + (hasColorHarmony ? 2.5 : 0) + (hasStyleConsistency ? 2.5 : 0);
      
      // 可实现性：基于设计详细程度
      const implementability = Math.min(10, 5 + totalItems * 0.5);
      
      // 完整度：基于图片生成比例
      const detailCompleteness = totalItems > 0 ? (completedImages / totalItems) * 10 : 0;

      const overallScore = (visualAppeal + consistency + implementability + detailCompleteness) / 4;

      return {
        visualAppeal: Math.round(visualAppeal * 10) / 10,
        consistency: Math.round(consistency * 10) / 10,
        implementability: Math.round(implementability * 10) / 10,
        detailCompleteness: Math.round(detailCompleteness * 10) / 10,
        overallScore: Math.round(overallScore * 10) / 10,
        stats: {
          totalCharacters: characters.length,
          totalScenes: scenes.length,
          totalProps: props.length,
          completedImages,
          totalItems,
        }
      };
    }),

  // 上传设计图片（用户本地上传）
  uploadDesignImage: protectedProcedure
    .input(z.object({
      designId: z.number(),
      itemType: z.enum(['character', 'scene', 'prop']),
      itemId: z.string(),
      imageData: z.string(), // base64 数据
      fileName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { storagePut } = await import('./storage');
      
      // 获取设计数据
      const [design] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.id, input.designId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!design) {
        throw new Error('设计数据不存在');
      }

      // 解析 base64 数据
      const base64Match = input.imageData.match(/^data:image\/\w+;base64,(.+)$/);
      if (!base64Match) {
        throw new Error('无效的图片数据格式');
      }
      const imageBuffer = Buffer.from(base64Match[1], 'base64');
      
      // 生成唯一文件名
      const ext = input.fileName.split('.').pop() || 'png';
      const uniqueFileName = `design-${input.designId}-${input.itemType}-${input.itemId}-${Date.now()}.${ext}`;
      const fileKey = `designs/${ctx.user.id}/${uniqueFileName}`;
      
      // 上传到 S3
      const { url } = await storagePut(fileKey, imageBuffer, `image/${ext}`);
      
      // 更新设计数据中的图片 URL
      if (input.itemType === 'character') {
        const characters = design.characters as any[] || [];
        const updatedCharacters = characters.map((c: any) => 
          c.id === input.itemId 
            ? { ...c, imageUrl: url, generationStatus: 'completed' }
            : c
        );
        await (await getDb())!.update(designs)
          .set({ characters: updatedCharacters })
          .where(eq(designs.id, input.designId));
      } else if (input.itemType === 'scene') {
        const scenes = design.scenes as any[] || [];
        const updatedScenes = scenes.map((s: any) => 
          s.id === input.itemId 
            ? { ...s, imageUrl: url, generationStatus: 'completed' }
            : s
        );
        await (await getDb())!.update(designs)
          .set({ scenes: updatedScenes })
          .where(eq(designs.id, input.designId));
      } else if (input.itemType === 'prop') {
        const props = design.props as any[] || [];
        const updatedProps = props.map((p: any) => 
          p.id === input.itemId 
            ? { ...p, imageUrl: url, generationStatus: 'completed' }
            : p
        );
        await (await getDb())!.update(designs)
          .set({ props: updatedProps })
          .where(eq(designs.id, input.designId));
      }

      return { success: true, imageUrl: url };
    }),

  // 更新设计项目信息（角色/场景/道具的详细信息）
  updateDesignItem: protectedProcedure
    .input(z.object({
      designId: z.number(),
      itemType: z.enum(['character', 'scene', 'prop']),
      itemId: z.string(),
      updates: z.record(z.string(), z.any()), // 允许更新任意字段
    }))
    .mutation(async ({ ctx, input }) => {
      // 获取设计数据
      const [design] = await (await getDb())!.select()
        .from(designs)
        .where(and(
          eq(designs.id, input.designId),
          eq(designs.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!design) {
        throw new Error('设计数据不存在');
      }

      // 根据类型更新对应的数组
      if (input.itemType === 'character') {
        const characters = design.characters as any[] || [];
        const updatedCharacters = characters.map((c: any) => 
          c.id === input.itemId 
            ? { ...c, ...input.updates }
            : c
        );
        await (await getDb())!.update(designs)
          .set({ characters: updatedCharacters })
          .where(eq(designs.id, input.designId));
      } else if (input.itemType === 'scene') {
        const scenes = design.scenes as any[] || [];
        const updatedScenes = scenes.map((s: any) => 
          s.id === input.itemId 
            ? { ...s, ...input.updates }
            : s
        );
        await (await getDb())!.update(designs)
          .set({ scenes: updatedScenes })
          .where(eq(designs.id, input.designId));
      } else if (input.itemType === 'prop') {
        const props = design.props as any[] || [];
        const updatedProps = props.map((p: any) => 
          p.id === input.itemId 
            ? { ...p, ...input.updates }
            : p
        );
        await (await getDb())!.update(designs)
          .set({ props: updatedProps })
          .where(eq(designs.id, input.designId));
      }

      return { success: true };
    }),

  // ========== 剧本洞察提取 ==========
  
  // 使用 LLM 以专业导演/编导视角提取每集的核心冲突和关键事件
  extractEpisodeInsights: protectedProcedure
    .input(z.object({
      scriptId: z.number(),
      episodeNumber: z.number().optional(), // 可选，指定单集分析，不指定则分析所有集
    }))
    .mutation(async ({ ctx, input }) => {
      // 获取剧本数据
      const [script] = await (await getDb())!.select()
        .from(scripts)
        .where(and(
          eq(scripts.id, input.scriptId),
          eq(scripts.userId, ctx.user.id)
        ))
        .limit(1);
      
      if (!script) {
        throw new Error('剧本不存在');
      }

      const episodes = (script.episodes as Episode[]) || [];
      if (episodes.length === 0) {
        throw new Error('剧本没有分集数据');
      }

      // 确定要分析的集数
      const targetEpisodes = input.episodeNumber 
        ? episodes.filter(e => e.episodeNumber === input.episodeNumber)
        : episodes;

      if (targetEpisodes.length === 0) {
        throw new Error(`找不到第${input.episodeNumber}集`);
      }

      // 专业导演/编导视角的分析提示词
      const directorPrompt = `你是一位资深的影视导演和编剧，拥有丰富的短剧/网剧创作经验。
你的任务是以专业视角分析剧本，提取每集的核心戏剧冲突和关键事件。

【分析原则】
1. 核心冲突必须是戏剧性的：谁vs谁？为了什么？赌注是什么？
2. 关键事件必须是推动剧情发展的节点，不是普通对话
3. 冲突强度要考虑：情感张力、利益对立、生死攻关
4. 关键事件要简洁有力，每个事件一句话概括

【输出格式】
对每集输出 JSON 格式：
{
  "episodeNumber": 集数,
  "coreConflict": "核心冲突描述，一句话概括，包含冲突双方和赌注",
  "conflictIntensity": 1-10的冲突强度评分,
  "keyEvents": ["关键事件1", "关键事件2", "关键事件3"]
}

【示例】
输入：第1集，主角穿越到诡异列车，获得“渣男”系统，需要攻略女诡
输出：
{
  "episodeNumber": 1,
  "coreConflict": "主角福生 vs 诡异规则：在死亡列车中求生，必须用“渣男”身份攻略女诡才能存活",
  "conflictIntensity": 8,
  "keyEvents": [
    "福生穿越到诡异列车，规则宣布死亡游戏开始",
    "激活“我就是渣男”系统，获得攻略女诡的任务",
    "用霸总台词成功让女诡苏晓晓脸红，亲密度提升"
  ]
}

请严格按照 JSON 格式输出，不要添加任何额外说明。如果有多集，输出 JSON 数组。`;

      // 构建每集的内容摘要
      const episodeSummaries = targetEpisodes.map(ep => {
        const scenes = ep.scenes || [];
        const sceneDescriptions = scenes.map((s, idx) => {
          const parts = [];
          if (s.location) parts.push(`场景：${s.location}`);
          if (s.dialogue) parts.push(`对话：${s.dialogue.slice(0, 100)}`);
          if (s.characterActions) parts.push(`动作：${s.characterActions}`);
          if (s.adaptationNote) parts.push(`备注：${s.adaptationNote}`);
          return `场景${idx + 1}: ${parts.join(' | ')}`;
        }).join('\n');

        return `## 第${ep.episodeNumber}集：${ep.title || ''}
黄金3秒钩子：${ep.hook || '无'}
场景内容：
${sceneDescriptions}
悬念结尾：${ep.cliffhanger || '无'}`;
      }).join('\n\n---\n\n');

      // 调用 LLM 分析
      const response = await invokeLLM({
        messages: [
          { role: "system", content: directorPrompt },
          { role: "user", content: `请分析以下剧本内容，提取每集的核心冲突和关键事件：\n\n${episodeSummaries}` }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "episode_insights",
            strict: true,
            schema: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  episodeNumber: { type: "integer", description: "集数" },
                  coreConflict: { type: "string", description: "核心冲突描述" },
                  conflictIntensity: { type: "integer", description: "冲突强度 1-10" },
                  keyEvents: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "关键事件列表"
                  }
                },
                required: ["episodeNumber", "coreConflict", "conflictIntensity", "keyEvents"],
                additionalProperties: false
              }
            }
          }
        },
        apiKey: ctx.user?.apiKey,
      });

      const content = response.choices?.[0]?.message?.content;
      let insights: Array<{
        episodeNumber: number;
        coreConflict: string;
        conflictIntensity: number;
        keyEvents: string[];
      }> = [];

      try {
        if (typeof content === 'string') {
          insights = JSON.parse(content);
        }
      } catch (e) {
        console.error('解析 LLM 返回的 JSON 失败:', e);
        throw new Error('分析失败，请重试');
      }

      // 更新剧本中的每集数据
      const updatedEpisodes = episodes.map(ep => {
        const insight = insights.find(i => i.episodeNumber === ep.episodeNumber);
        if (insight) {
          return {
            ...ep,
            coreConflict: insight.coreConflict,
            conflictIntensity: insight.conflictIntensity,
            keyEvents: insight.keyEvents,
          };
        }
        return ep;
      });

      // 保存到数据库
      await (await getDb())!.update(scripts)
        .set({ episodes: updatedEpisodes })
        .where(eq(scripts.id, input.scriptId));

      return {
        success: true,
        insights,
        updatedEpisodesCount: insights.length,
      };
    }),

  // ========== 风格反推 ==========
  
  // 分析图片风格并生成风格描述
  analyzeStyleFromImage: protectedProcedure
    .input(z.object({
      imageUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
const styleAnalysisPrompt = `你是一个专业的视觉风格分析师。你的任务是提取图片的「绘画风格」技术特征，生成可用于AI绘画的风格描述词。

【重要】只提取绘画技术风格，不要描述任何内容或氛围：
- ✅ 正确：绘画风格、上色技法、色彩风格、渲染方式、光影处理
- ❌ 错误：内容描述、氛围描述、主观感受（如"治愈"、"神秘"、"温暖"等）

请从以下维度提取风格：
1. 绘画风格（如：日系动漫、韩漫、美式漫画、写实摄影、油画、水彩等）
2. 上色技法（如：赛璐璐上色、平涂、厚涂、精细插画渲染、粗糙笔触等）
3. 色彩风格（如：暖色调、冷色调、高对比度、低饱和度、黑灰色调等）
4. 光影处理（如：柔和漫射光、硬朗光影、电影感光线、阴影细腻等）

【输出要求】
- 直接输出风格描述词，不要分点列举
- 描述要简洁精炼，控制在50字以内
- 只输出绘画技术风格，不要描述内容、氛围、主观感受
- 不要包含"这张图片"、"该作品"等指代词

示例输出：
"日系动漫风格，赛璐璐上色，柔和淡彩色调，细腻线条勾勒，柔和漫射光"
"韩漫风格，高精度插画渲染，冷色调低饱和度黑灰色调，柔和漫射光"
"美式漫画风格，高对比度赛璐璐上色，粗犷线条，硬朗光影"`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: styleAnalysisPrompt },
          { 
            role: "user", 
            content: [
              { type: "text", text: "请分析这张图片的风格特征：" },
              { type: "image_url", image_url: { url: input.imageUrl } }
            ]
          }
        ],
        apiKey: ctx.user?.apiKey,
      });

      const content = response.choices?.[0]?.message?.content;
      const styleDescription = typeof content === 'string' ? content.trim() : "无法分析风格";

      return {
        styleDescription,
        success: true,
      };
    }),
});
