/**
 * 基础创作功能 - 共享类型定义
 * 包含剧本改编、形象场景设计、分镜脚本的类型
 */

// ============================================================================
// 剧本改编类型
// ============================================================================

export interface ScriptGenerationInput {
  originalContent: string;
  episodeCount: number; // 0 = AI自动判断
  durationPerEpisode: number; // 每集时长（秒）
  storyType: string;
}

export interface Scene {
  sceneId: number;
  location: string;
  characterActions: string;
  dialogue: string;
  duration: number;
  composition: string;
  emotionalTone: string;
  adaptationNote: string;
  sceneConflict?: string; // 场景级别的冲突描述，用于汇总生成分集核心冲突
  audioDesign: {
    backgroundMusic: string;
    soundEffects: string[];
    emotionalTone: string;
  };
  visualElements: {
    colorScheme: string;
    keyObjects: string[];
    characterExpressions: string;
  };
}

export interface Episode {
  episodeNumber: number;
  title: string;
  duration: number;
  coreConflict: string;
  conflictIntensity: number;
  keyEvents: string[];
  narrativeSummary: string;
  scenes: Scene[];
  hook: string;
  cliffhanger: string;
}

export interface QualityMetrics {
  mainLineClarity: number;
  conflictProgression: number;
  pacingControl: number;
  dialogueQuality: number;
  visualDesign: number;
  overallScore: number;
  qualityStatus: 'PASS' | 'REVISION_NEEDED' | 'FAIL';
  issues: string[];
  suggestions: string[];
}

export interface StoryStructure {
  mainLine: {
    description: string;
    goal: string;
    conflict: string;
  };
  structurePlan: {
    opening: { episodeRange: string; purpose: string; keyEvents: string[] };
    development: { episodeRange: string; purpose: string; keyEvents: string[] };
    climax: { episodeRange: string; purpose: string; keyEvents: string[] };
    ending: { episodeRange: string; purpose: string; keyEvents: string[] };
  };
}

export interface GeneratedScript {
  metadata: {
    title: string;
    storyConcept: string;
    episodeCount: number;
    totalDuration: number;
    storyType: string;
    generationTimestamp: string;
    version: string;
  };
  adaptationAnalysis: string;
  adaptedStory: string;
  storyStructure: StoryStructure;
  episodes: Episode[];
  qualityMetrics: QualityMetrics;
  rawContent?: string;
}

// ============================================================================
// 形象场景设计类型
// ============================================================================

export interface DesignGenerationInput {
  adaptedStory: string;
  storyType: string;
  visualStyle?: string;
}

export interface CharacterDesign {
  id: string;
  characterName: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'extra';
  // 图片生成相关
  imageUrl?: string;
  imageKey?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16';
  visualStylePreset?: string;
  visualDesign: {
    faceShape: string;
    temperament: string;
    bodyType: string;
    skinTone: string;
    age: string;
  };
  clothingDesign: {
    style: string;
    primaryColor: string;
    secondaryColors: string[];
    material: string;
    description: string;
  };
  makeupDesign: {
    base: string;
    eyes: string;
    lips: string;
    other: string;
  };
  hairstyleDesign: {
    length: string;
    color: string;
    style: string;
    description: string;
  };
  accessories: Array<{
    name: string;
    description: string;
    color: string;
  }>;
  designNotes: string;
  // 风格设定（可覆盖全局设定）
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
  // 生成状态
  generationStatus?: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface SceneDesign {
  id: string;
  sceneName: string;
  locationType: 'indoor' | 'outdoor' | 'mixed';
  // 图片生成相关
  imageUrl?: string;
  imageKey?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16';
  visualStylePreset?: string;
  timeSetting: string;
  spaceDesign: {
    layout: string;
    depth: string;
    size: string;
    activityRange: string;
  };
  colorDesign: {
    primaryColor: string;
    secondaryColors: string[];
    accentColor: string;
    colorTemperature: string;
  };
  lightingDesign: {
    mainLight: string;
    fillLight: string;
    backLight: string;
    specialEffects: string;
  };
  decorations: Array<{
    name: string;
    description: string;
    color: string;
    position: string;
  }>;
  essentialElements: string[];
  atmosphere: string;
  designNotes: string;
  // 风格设定（可覆盖全局设定）
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
  // 生成状态
  generationStatus?: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface PropDesign {
  id: string;
  name: string;
  function: string;
  // 图片生成相关
  imageUrl?: string;
  imageKey?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16';
  visualStylePreset?: string;
  size: string;
  material: string;
  color: string;
  visualDesign: string;
  narrativeFunction: string;
  hierarchy: 'key' | 'important' | 'background';
  screenTime: string;
  specialNotes: string;
  // 风格设定（可覆盖全局设定）
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
  // 生成状态
  generationStatus?: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface ColorHarmony {
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
}

export interface DesignPlan {
  id: string;
  projectId: string;
  scriptId: string;
  characters: CharacterDesign[];
  scenes: SceneDesign[];
  props: PropDesign[];
  colorHarmony: ColorHarmony;
  styleConsistency: string;
  designNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignQualityMetrics {
  visualAppeal: number;
  consistency: number;
  implementability: number;
  detailCompleteness: number;
  overallScore: number;
}

// ============================================================================
// 分镜脚本类型
// ============================================================================

export interface StoryboardGenerationInput {
  adaptedStory: string;
  targetDuration: number;
  visualStyle?: string;
  cameraPreference?: string;
}

export interface Shot {
  shotId: number;
  sceneId: number;
  shotType: '特写' | '近景' | '中景' | '全景' | '远景';
  cameraMovement: '静止' | '推镜' | '拉镜' | '摇镜' | '移镜' | '跟镜';
  location: string;
  characters: string[];
  characterActions: string;
  dialogue: string;
  voiceover: string;
  duration: number;
  cumulativeDuration: number;
  pace: 'slow' | 'normal' | 'fast';
  emotionalTone: string;
  narrativeFunction: string;
  visualDesign: {
    composition: {
      type: string;
      description: string;
      focalPoint: string;
      depthLayers: string[];
    };
    color: {
      primaryColor: string;
      secondaryColors: string[];
      tone: string;
      saturation: string;
      emotionalIntent: string;
    };
    lighting: {
      type: string;
      intensity: string;
      direction: string;
      colorTemperature: string;
      shadows: string;
    };
  };
  audioDesign: {
    backgroundMusic: {
      name: string;
      style: string;
      emotionalTone: string;
      tempo: string;
      intensity: 'weak' | 'medium' | 'strong';
    };
    soundEffects: string[];
    ambientSound: string;
  };
  scriptReferences: {
    sceneId: number | null;
    actionIds: number[];
    dialogueId: number | null;
    conflictId: number | null;
    emotionalArcPoint: 'start' | 'rising' | 'peak' | 'falling' | 'end';
  };
  visualNotes: string;
  technicalNotes: string;
  productionNotes: string;
}

export interface StoryboardStatistics {
  totalShots: number;
  totalDuration: number;
  averageShotDuration: number;
  shotTypeDistribution: Record<string, number>;
  cameraMovementDistribution: Record<string, number>;
  paceDistribution: Record<string, number>;
}

export interface VisualGuidelines {
  overallColorScheme: string;
  lightingStyle: string;
  compositionPrinciples: string[];
  visualConsistencyNotes: string;
}

export interface AudioGuidelines {
  backgroundMusicStyle: string;
  soundEffectLibrary: string;
  dialogueTone: string;
  audioConsistencyNotes: string;
}

export interface Storyboard {
  id: string;
  projectId: string;
  scriptId: string;
  episodeNumber: number;
  episodeTitle: string;
  shots: Shot[];
  scriptMapping: {
    scriptId: string;
    sceneMappings: any[];
    dialogueMappings: any[];
    conflictMappings: any[];
  };
  statistics: StoryboardStatistics;
  visualGuidelines: VisualGuidelines;
  audioGuidelines: AudioGuidelines;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface StoryboardQualityMetrics {
  scriptAlignment: number;
  visualQuality: number;
  audioDesign: number;
  narrativeFlow: number;
  technicalAccuracy: number;
  emotionalImpact: number;
  overallScore: number;
}

// ============================================================================
// 视图类型
// ============================================================================

export type StoryboardViewType = 'table' | 'card' | 'timeline' | 'storyboard';
