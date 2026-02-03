/**
 * 形象场景设计面板组件
 * 设计角色形象、场景和道具，支持图片生成
 * 参考设计：三Tab切换 + 卡片式展示 + 图片生成
 */

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import { 
  Loader2, RefreshCw, Sparkles, ImageIcon,
  User, MapPin, Package, ChevronLeft, ChevronDown, ChevronUp, Upload, Grid, FolderOpen, Edit2, Check, X, Wand2, Trash2
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ImageActions } from "@/components/ImageActions";
import { AssetLibrary } from "@/components/AssetLibrary";
import CharacterDesignAssistant from "@/components/panels/CharacterDesignAssistant";
import { Bot } from "lucide-react";

// 类型定义
interface CharacterDesign {
  id: string;
  characterName: string;
  baseCharacterId?: string;  // 原始角色ID（如果是拆分后的角色）
  stageLabel?: string;  // 阶段标签（如"前期"、"后期"）
  role: 'protagonist' | 'antagonist' | 'supporting' | 'extra';
  visualDesign?: {
    faceShape?: string;
    temperament?: string;
    bodyType?: string;
    age?: string;
  };
  clothingDesign?: {
    style?: string;
    primaryColor?: string;
    material?: string;
    description?: string;
  };
  hairstyleDesign?: {
    length?: string;
    color?: string;
    style?: string;
    description?: string;
  };
  accessories?: Array<{ name: string; description?: string; color?: string }>;
  designNotes?: string;
  imageUrl?: string;
  aspectRatio?: string;
  visualStylePreset?: string;
  // 风格设定（可覆盖全局设定）
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
  generationStatus?: 'pending' | 'generating' | 'completed' | 'failed';
}

interface SceneDesign {
  id: string;
  sceneName: string;
  locationType: 'indoor' | 'outdoor' | 'mixed';
  timeSetting?: string;
  spaceDesign?: {
    layout?: string;
    depth?: string;
    size?: string;
  };
  colorDesign?: {
    primaryColor?: string;
    accentColor?: string;
    colorTemperature?: string;
  };
  lightingDesign?: {
    mainLight?: string;
    fillLight?: string;
    backLight?: string;
    specialEffects?: string;
  };
  essentialElements?: string[];
  atmosphere?: string;
  designNotes?: string;
  imageUrl?: string;
  aspectRatio?: string;
  visualStylePreset?: string;
  // 风格设定（可覆盖全局设定）
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
  generationStatus?: 'pending' | 'generating' | 'completed' | 'failed';
}

interface PropDesign {
  id: string;
  name: string;
  hierarchy: 'key' | 'important' | 'background';
  function?: string;
  material?: string;
  color?: string;
  size?: string;
  visualDesign?: string;
  narrativeFunction?: string;
  specialNotes?: string;
  imageUrl?: string;
  aspectRatio?: string;
  visualStylePreset?: string;
  // 风格设定（可覆盖全局设定）
  styleDescription?: string;
  architecturalStyle?: string;
  colorTone?: string;
  primaryColors?: string;
  colorMood?: string;
  generationStatus?: 'pending' | 'generating' | 'completed' | 'failed';
}

interface SavedScript {
  id: number;
  name: string;
  adaptedStory?: string | null;
  episodes?: any;
  qualityMetrics?: any;
  createdAt: Date;
}

interface DesignPanelProps {
  canvasId: number;
  onClose: () => void;
  onLoadToCanvas?: (imageUrl: string, name: string, type: 'character' | 'scene' | 'prop') => void;
  onOpenAIAssistant?: (action: 'designCharacter', scriptContent?: string, scriptTitle?: string) => void;
}

// 比例选项
const aspectRatios = [
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

// 角色类型映射
const roleLabels: Record<string, string> = {
  protagonist: "主角",
  antagonist: "反派",
  supporting: "配角",
  extra: "龙套",
  lead: "主角",
  catalyst: "催化剂",
  foil: "对比角色",
  mentor: "导师",
  sidekick: "助手",
  love_interest: "感情线",
  comic_relief: "喜剧角色",
  villain: "反派",
  "supporting protagonist": "配角",
  "supporting_protagonist": "配角",
  "main_character": "主角",
  "side_character": "配角",
  "background_character": "龙套",
};

// 角色描述映射（括号内的描述）
const roleDescriptionLabels: Record<string, string> = {
  "hidden expert": "隐藏赌神",
  "powerful lawyer": "强势律师",
  "mysterious stranger": "神秘陌生人",
  "love interest": "感情线",
  "comic relief": "喜剧角色",
  "main villain": "主要反派",
  "helper": "助手",
  "guide": "引导者",
  "rival": "对手",
  "ally": "盟友",
  "informant": "线人",
  "boss": "老大",
  "gambler": "赌徒",
  "dealer": "荷官",
  "casino owner": "赌场老板",
  "bodyguard": "保镖",
  "driver": "司机",
  "assistant": "助理",
  "secretary": "秘书",
  "partner": "搭档",
  "friend": "朋友",
  "enemy": "敌人",
  "master": "师父",
  "student": "徒弟",
};

// 将角色类型转换为中文（处理复合格式如 "protagonist (hidden expert)"）
const translateRole = (role: string): string => {
  if (!role) return '未知';
  
  // 先尝试直接匹配（包括下划线格式）
  const directMatch = roleLabels[role.toLowerCase()];
  if (directMatch) return directMatch;
  
  // 处理带括号的格式，如 "protagonist (hidden expert)"
  const bracketMatch = role.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (bracketMatch) {
    const mainRole = bracketMatch[1].trim().toLowerCase();
    const description = bracketMatch[2].trim().toLowerCase();
    const translatedRole = roleLabels[mainRole] || roleLabels[mainRole.replace(/_/g, ' ')] || mainRole;
    const translatedDesc = roleDescriptionLabels[description] || roleDescriptionLabels[description.replace(/_/g, ' ')] || description;
    return `${translatedRole}/${translatedDesc}`;
  }
  
  // 处理下划线格式（如 "supporting_protagonist"）
  if (role.includes('_')) {
    const withSpaces = role.toLowerCase().replace(/_/g, ' ');
    if (roleLabels[withSpaces]) return roleLabels[withSpaces];
    // 尝试拆分成多个部分
    const parts = role.toLowerCase().split('_');
    const translatedParts = parts.map(part => roleLabels[part] || part);
    return translatedParts.join('/');
  }
  
  // 处理复合格式（如 "antagonist/catalyst"）
  const parts = role.toLowerCase().split('/');
  const translatedParts = parts.map(part => {
    const trimmed = part.trim();
    return roleLabels[trimmed] || trimmed;
  });
  return translatedParts.join('/');
};

// 道具层级标签
const hierarchyLabels: Record<string, { label: string; color: string }> = {
  key: { label: "关键", color: "bg-red-600 text-white" },
  important: { label: "重要", color: "bg-yellow-600 text-white" },
  background: { label: "背景", color: "bg-gray-600 text-white" },
};

// 可编辑字段输入组件
const EditableField = ({ 
  label, 
  value, 
  onChange, 
  disabled = false,
  multiline = false 
}: { 
  label: string; 
  value: string; 
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-gray-500 text-xs">{label}</span>
        <div className="flex items-center gap-1">
          {multiline ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 bg-[#0d0820] border border-purple-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-400 min-h-[60px] resize-none"
              disabled={disabled}
              autoFocus
            />
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 bg-[#0d0820] border border-purple-500/50 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-purple-400"
              disabled={disabled}
              autoFocus
            />
          )}
          <button
            onClick={handleSave}
            className="p-1 text-green-400 hover:text-green-300"
            disabled={disabled}
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={handleCancel}
            className="p-1 text-red-400 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`group cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={() => !disabled && setIsEditing(true)}
    >
      <span className="text-gray-500 text-xs">{label}</span>
      <div className="flex items-center gap-1">
        <p className="text-gray-300 text-sm flex-1">{value || '-'}</p>
        {!disabled && (
          <Edit2 className="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );
};

export default function DesignPanel({ canvasId, onClose, onLoadToCanvas, onOpenAIAssistant }: DesignPanelProps) {
  // 状态
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'characters' | 'scenes' | 'props'>('characters');
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ step: '', progress: 0 });
  const [generatingItems, setGeneratingItems] = useState<Set<string>>(new Set());
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const isBatchGeneratingRef = useRef(false); // 用于在回调中获取最新状态
  const [batchProgress, setBatchProgress] = useState({ step: '', progress: 0, current: 0, total: 0 });
  const [uploadingItems, setUploadingItems] = useState<Set<string>>(new Set());
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [assetLibraryTarget, setAssetLibraryTarget] = useState<{ type: 'character' | 'scene' | 'prop'; id: string } | null>(null);
  
  // 风格参考图和风格描述状态
  const [styleReferenceImage, setStyleReferenceImage] = useState<string | null>(null);
  const [styleDescription, setStyleDescription] = useState('');
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [styleAssetLibraryOpen, setStyleAssetLibraryOpen] = useState(false);
  const styleImageInputRef = useRef<HTMLInputElement>(null);
  
  // 全局风格设定状态
  const [architecturalStyle, setArchitecturalStyle] = useState('');
  const [colorPalette, setColorPalette] = useState<{
    overall: string;
    primaryColors: string[];
    accentColor: string;
    mood: string;
  }>({ overall: '', primaryColors: [], accentColor: '', mood: '' });
  // 风格预览板改为单图模式
  const [stylePreviewImage, setStylePreviewImage] = useState<string | null>(null);
  const stylePreviewInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null); // 内容区域滚动容器 ref
  const scrollPositionRef = useRef<number>(0); // 保存滚动位置
  const [stylePreviewAssetLibraryOpen, setStylePreviewAssetLibraryOpen] = useState(false);
  const [isAnalyzingStyleDescription, setIsAnalyzingStyleDescription] = useState(false);
  const [isStyleSettingsExpanded, setIsStyleSettingsExpanded] = useState(true); // 全局风格设定展开/收起状态
  // 自定义输入模式状态
  const [isArchitecturalStyleCustom, setIsArchitecturalStyleCustom] = useState(false);
  const [isColorToneCustom, setIsColorToneCustom] = useState(false);
  const [isColorMoodCustom, setIsColorMoodCustom] = useState(false);
  const [customArchitecturalStyle, setCustomArchitecturalStyle] = useState('');
  const [customColorTone, setCustomColorTone] = useState('');
  const [customColorMood, setCustomColorMood] = useState('');
  
  // 角色设计助手状态
  const [isCharacterDesignAssistantOpen, setIsCharacterDesignAssistantOpen] = useState(false);
  
  // 使用 useLayoutEffect 在 DOM 更新后立即恢复滚动位置
  // 这比 requestAnimationFrame 更可靠，因为它在浏览器绘制之前执行
  useLayoutEffect(() => {
    if (contentScrollRef.current && scrollPositionRef.current > 0) {
      contentScrollRef.current.scrollTop = scrollPositionRef.current;
    }
  }, [generatingItems]);
  
  // 获取剧本列表
  const { data: scripts, isLoading: scriptsLoading } = trpc.basicCreation.getScriptsByCanvas.useQuery(
    { canvasId },
    { enabled: !!canvasId }
  );
  
  // 获取当前剧本关联的设计数据
  const { data: design, refetch: refetchDesign } = trpc.basicCreation.getDesignByScript.useQuery(
    { scriptId: selectedScriptId! },
    { enabled: !!selectedScriptId }
  );
  
  // 获取设计质量评分
  const { data: qualityScore } = trpc.basicCreation.evaluateDesignQuality.useQuery(
    { designId: design?.id! },
    { enabled: !!design?.id }
  );
  
  // 重新生成设计
  const regenerateMutation = trpc.basicCreation.regenerateDesignFromScript.useMutation({
    onSuccess: () => {
      toast.success("设计方案已重新生成");
      refetchDesign();
      setIsRegenerating(false);
    },
    onError: (error) => {
      toast.error("生成失败: " + error.message);
      setIsRegenerating(false);
    },
  });
  
  // 更新批量生成进度的辅助函数
  const updateBatchProgress = () => {
    setBatchProgress(prev => {
      if (prev.total === 0) return prev;
      const newCurrent = prev.current + 1;
      const newProgress = Math.round((newCurrent / prev.total) * 100);
      
      // 如果完成了所有项目
      if (newCurrent >= prev.total) {
        setTimeout(() => {
          setIsBatchGenerating(false);
          isBatchGeneratingRef.current = false;
          setBatchProgress({ step: '', progress: 0, current: 0, total: 0 });
        }, 500);
        return { ...prev, step: '生成完成', progress: 100, current: newCurrent };
      }
      
      return { ...prev, step: `已完成 ${newCurrent}/${prev.total}`, progress: newProgress, current: newCurrent };
    });
  };
  
  // 生成角色图片（形象场景设计模块）
  const generateCharacterImageMutation = trpc.basicCreation.generateDesignCharacterImage.useMutation({
    onSuccess: (data, variables) => {
      toast.success("角色图片生成成功");
      setGeneratingItems(prev => {
        const next = new Set(prev);
        next.delete(`character_${variables.characterId}`);
        return next;
      });
      // 更新批量进度（使用ref获取最新状态）
      if (isBatchGeneratingRef.current) {
        updateBatchProgress();
      }
      refetchDesign().then(() => {
        // 恢复滚动位置
        if (contentScrollRef.current && scrollPositionRef.current > 0) {
          contentScrollRef.current.scrollTop = scrollPositionRef.current;
        }
      });
    },
    onError: (error, variables) => {
      toast.error("图片生成失败: " + error.message);
      setGeneratingItems(prev => {
        const next = new Set(prev);
        next.delete(`character_${variables.characterId}`);
        return next;
      });
      // 失败也更新进度
      if (isBatchGeneratingRef.current) {
        updateBatchProgress();
      }
    },
  });
  
  // 生成场景图片（形象场景设计模块）
  const generateSceneImageMutation = trpc.basicCreation.generateDesignSceneImage.useMutation({
    onSuccess: (data, variables) => {
      toast.success("场景图片生成成功");
      setGeneratingItems(prev => {
        const next = new Set(prev);
        next.delete(`scene_${variables.sceneId}`);
        return next;
      });
      // 更新批量进度（使用ref获取最新状态）
      if (isBatchGeneratingRef.current) {
        updateBatchProgress();
      }
      refetchDesign().then(() => {
        // 恢复滚动位置
        if (contentScrollRef.current && scrollPositionRef.current > 0) {
          contentScrollRef.current.scrollTop = scrollPositionRef.current;
        }
      });
    },
    onError: (error, variables) => {
      toast.error("图片生成失败: " + error.message);
      setGeneratingItems(prev => {
        const next = new Set(prev);
        next.delete(`scene_${variables.sceneId}`);
        return next;
      });
      // 失败也更新进度
      if (isBatchGeneratingRef.current) {
        updateBatchProgress();
      }
    },
  });
  
  // 生成道具图片（形象场景设计模块）
  const generatePropImageMutation = trpc.basicCreation.generateDesignPropImage.useMutation({
    onSuccess: (data, variables) => {
      toast.success("道具图片生成成功");
      setGeneratingItems(prev => {
        const next = new Set(prev);
        next.delete(`prop_${variables.propId}`);
        return next;
      });
      // 更新批量进度（使用ref获取最新状态）
      if (isBatchGeneratingRef.current) {
        updateBatchProgress();
      }
      refetchDesign().then(() => {
        // 恢复滚动位置
        if (contentScrollRef.current && scrollPositionRef.current > 0) {
          contentScrollRef.current.scrollTop = scrollPositionRef.current;
        }
      });
    },
    onError: (error, variables) => {
      toast.error("图片生成失败: " + error.message);
      setGeneratingItems(prev => {
        const next = new Set(prev);
        next.delete(`prop_${variables.propId}`);
        return next;
      });
      // 失败也更新进度
      if (isBatchGeneratingRef.current) {
        updateBatchProgress();
      }
    },
  });
  
  
  // 上传设计图片
  const uploadDesignImageMutation = trpc.basicCreation.uploadDesignImage.useMutation({
    onSuccess: () => {
      refetchDesign();
    },
  });

  // 更新设计项目信息
  const updateDesignItemMutation = trpc.basicCreation.updateDesignItem.useMutation({
    onSuccess: () => {
      refetchDesign();
    },
    onError: (error) => {
      toast.error("更新失败: " + error.message);
    },
  });
  
  // 更新设计风格数据
  const updateDesignMutation = trpc.basicCreation.updateDesign.useMutation({
    onSuccess: () => {
      console.log('[DesignPanel] 风格数据保存成功，刷新设计数据');
      refetchDesign();
    },
    onError: (error) => {
      console.error('[DesignPanel] 风格数据保存失败:', error);
      toast.error("保存风格失败: " + error.message);
    },
  });
  
  // 自动选择第一个剧本
  useEffect(() => {
    if (scripts && scripts.length > 0 && !selectedScriptId) {
      setSelectedScriptId(scripts[0].id);
    }
  }, [scripts, selectedScriptId]);
  
  // 切换剧本时重置风格设定状态
  useEffect(() => {
    console.log('[DesignPanel] 剧本切换，重置风格设定状态, scriptId:', selectedScriptId);
    // 重置所有风格相关状态
    setStyleReferenceImage(null);
    setStyleDescription('');
    setStylePreviewImage(null);
    setArchitecturalStyle('');
    setColorPalette({ overall: '', primaryColors: [], accentColor: '', mood: '' });
  }, [selectedScriptId]);
  
  // 从数据库加载风格参考图和风格描述
  useEffect(() => {
    // 重要：验证 design 的 scriptId 与当前选中的 scriptId 匹配，避免加载错误的数据
    if (design && design.scriptId === selectedScriptId) {
      console.log('[DesignPanel] 加载设计数据:', {
        id: design.id,
        scriptId: design.scriptId,
        selectedScriptId: selectedScriptId,
        styleDescription: design.styleDescription,
        stylePreviewImages: (design as any).stylePreviewImages,
        architecturalStyle: (design as any).architecturalStyle,
      });
      
      // 加载风格参考图（允许为空）
      setStyleReferenceImage(design.styleReferenceImage || null);
      
      // 加载风格描述（允许为空）
      setStyleDescription(design.styleDescription || '');
      
      // 加载全局风格设定（允许为空）
      setArchitecturalStyle((design as any).architecturalStyle || '');
      
      // 加载调色板（允许为空）
      if ((design as any).colorPalette) {
        setColorPalette((design as any).colorPalette);
      } else {
        setColorPalette({ overall: '', primaryColors: [], accentColor: '', mood: '' });
      }
      
      // 加载风格预览板图片（允许为空）
      const stylePreviewImages = (design as any).stylePreviewImages;
      if (stylePreviewImages && Array.isArray(stylePreviewImages) && stylePreviewImages.length > 0 && stylePreviewImages[0]?.url) {
        console.log('[DesignPanel] 加载风格预览板图片:', stylePreviewImages[0].url.substring(0, 50) + '...');
        setStylePreviewImage(stylePreviewImages[0].url);
      } else {
        setStylePreviewImage(null);
      }
    } else if (design && design.scriptId !== selectedScriptId) {
      console.warn('[DesignPanel] 设计数据scriptId不匹配，跳过加载:', {
        designScriptId: design.scriptId,
        selectedScriptId: selectedScriptId,
      });
    }
  }, [design, selectedScriptId]); // 同时监听 design 和 selectedScriptId
  
  // 获取当前选中的剧本
  const selectedScript = scripts?.find(s => s.id === selectedScriptId);
  
  // 获取设计数据（验证 scriptId 匹配，避免显示错误剧本的数据）
  const isDesignValid = design && design.scriptId === selectedScriptId;
  const characters = isDesignValid ? (design.characters as CharacterDesign[]) || [] : [];
  const scenes = isDesignValid ? (design.scenes as SceneDesign[]) || [] : [];
  const props = isDesignValid ? (design.props as PropDesign[]) || [] : [];
  
  // 计算集数信息
  const episodeCount = Array.isArray(selectedScript?.episodes) ? selectedScript.episodes.length : 0;
  
  // 处理重新生成设计
  const handleRegenerate = () => {
    console.log('[DesignPanel] handleRegenerate called', { selectedScriptId, scripts: scripts?.length });
    
    if (!selectedScriptId) {
      toast.error('请先选择一个剧本');
      return;
    }
    
    // 检查剧本是否有改编故事
    const script = scripts?.find(s => s.id === selectedScriptId);
    console.log('[DesignPanel] Found script:', { scriptId: script?.id, hasAdaptedStory: !!script?.adaptedStory });
    
    if (!script?.adaptedStory) {
      toast.error('请先在「剧本改编」中生成改编故事');
      return;
    }
    
    toast.info('正在生成设计方案...');
    setIsRegenerating(true);
    setGenerationProgress({ step: '正在分析剧本...', progress: 10 });
    
    // 模拟进度更新
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev.progress < 90) {
          const newProgress = prev.progress + 5;
          let step = '正在分析剧本...';
          if (newProgress > 20) step = '提取角色信息...';
          if (newProgress > 40) step = '生成场景设计...';
          if (newProgress > 60) step = '设计道具元素...';
          if (newProgress > 80) step = '整合设计方案...';
          return { step, progress: newProgress };
        }
        return prev;
      });
    }, 800);
    
    regenerateMutation.mutate({
      canvasId,
      scriptId: selectedScriptId,
      // 传入已设置的风格预览图和风格描述
      stylePreviewImage: stylePreviewImage || undefined,
      styleDescription: styleDescription || undefined,
    }, {
      onSettled: () => {
        clearInterval(progressInterval);
        setGenerationProgress({ step: '完成', progress: 100 });
        setTimeout(() => {
          setIsRegenerating(false);
          setGenerationProgress({ step: '', progress: 0 });
        }, 500);
      }
    });
  };
  
  // 处理单个图片生成
  // 传入卡片上的风格字段（如果卡片没有设置，则使用全局风格设定）
  const handleGenerateImage = (type: 'character' | 'scene' | 'prop', id: string, aspectRatio: string, itemStyleParams?: {
    styleDescription?: string;
    architecturalStyle?: string;
    colorTone?: string;
    primaryColors?: string;
    colorMood?: string;
  }) => {
    if (!design?.id) return;
    
    // 保存当前滚动位置，防止状态更新后自动滚动到顶部
    // useLayoutEffect 会在 generatingItems 变化后自动恢复滚动位置
    if (contentScrollRef.current) {
      scrollPositionRef.current = contentScrollRef.current.scrollTop;
    }
    
    const itemKey = `${type}_${id}`;
    setGeneratingItems(prev => new Set(prev).add(itemKey));
    
    // 获取风格参数：优先使用卡片上的值，否则使用全局风格设定
    const finalStyleDescription = itemStyleParams?.styleDescription || styleDescription || undefined;
    const finalArchitecturalStyle = itemStyleParams?.architecturalStyle || architecturalStyle || undefined;
    const finalColorTone = itemStyleParams?.colorTone || colorPalette.overall || undefined;
    const finalPrimaryColors = itemStyleParams?.primaryColors || colorPalette.primaryColors?.join(', ') || undefined;
    const finalColorMood = itemStyleParams?.colorMood || colorPalette.mood || undefined;
    // 全局风格预览板图片
    const finalStyleReferenceImage = stylePreviewImage || undefined;
    
    if (type === 'character') {
      generateCharacterImageMutation.mutate({
        designId: design.id,
        characterId: id,
        aspectRatio: aspectRatio as '1:1' | '16:9' | '9:16',
        styleReferenceImage: finalStyleReferenceImage,
        styleDescription: finalStyleDescription,
        architecturalStyle: finalArchitecturalStyle,
        colorTone: finalColorTone,
        primaryColors: finalPrimaryColors,
        colorMood: finalColorMood,
      });
    } else if (type === 'scene') {
      generateSceneImageMutation.mutate({
        designId: design.id,
        sceneId: id,
        aspectRatio: aspectRatio as '1:1' | '16:9' | '9:16',
        styleReferenceImage: finalStyleReferenceImage,
        styleDescription: finalStyleDescription,
        architecturalStyle: finalArchitecturalStyle,
        colorTone: finalColorTone,
        primaryColors: finalPrimaryColors,
        colorMood: finalColorMood,
      });
    } else if (type === 'prop') {
      generatePropImageMutation.mutate({
        designId: design.id,
        propId: id,
        aspectRatio: aspectRatio as '1:1' | '16:9' | '9:16',
        styleReferenceImage: finalStyleReferenceImage,
        styleDescription: finalStyleDescription,
        architecturalStyle: finalArchitecturalStyle,
        colorTone: finalColorTone,
        primaryColors: finalPrimaryColors,
        colorMood: finalColorMood,
      });
    }
  };
  
  // 处理批量生成（根据当前选中的标签页批量生成对应类别）
  const handleBatchGenerate = async () => {
    if (!design?.id) return;
    
    setIsBatchGenerating(true);
    isBatchGeneratingRef.current = true;
    
    try {
      let itemsToGenerate: any[] = [];
      let itemType = '';
      
      // 批量生成所有项目，不过滤已有图片的，允许重新生成
      if (activeTab === 'characters') {
        itemsToGenerate = [...characters];
        itemType = '角色';
      } else if (activeTab === 'scenes') {
        itemsToGenerate = [...scenes];
        itemType = '场景';
      } else if (activeTab === 'props') {
        itemsToGenerate = [...props];
        itemType = '道具';
      }
      
      if (itemsToGenerate.length === 0) {
        toast.info(`没有${itemType}可以生成`);
        setIsBatchGenerating(false);
        isBatchGeneratingRef.current = false;
        return;
      }
      
      const total = itemsToGenerate.length;
      // 初始化进度，current从0开始，实际进度由mutation回调更新
      setBatchProgress({ step: `正在生成${itemType} (0/${total})...`, progress: 0, current: 0, total });
      
      // 批量生成时，使用卡片上的风格字段（如果卡片没有设置，则使用全局风格设定）
      // 全局风格预览板图片
      const finalStyleReferenceImage = stylePreviewImage || undefined;
      
      if (activeTab === 'characters') {
        for (const character of itemsToGenerate) {
          const itemKey = `character_${character.id}`;
          setGeneratingItems(prev => new Set(prev).add(itemKey));
          generateCharacterImageMutation.mutate({
            designId: design.id,
            characterId: character.id,
            aspectRatio: (character.aspectRatio || '9:16') as '1:1' | '16:9' | '9:16',
            styleReferenceImage: finalStyleReferenceImage,
            styleDescription: character.styleDescription || styleDescription || undefined,
            architecturalStyle: character.architecturalStyle || architecturalStyle || undefined,
            colorTone: character.colorTone || colorPalette.overall || undefined,
            primaryColors: character.primaryColors || colorPalette.primaryColors?.join(', ') || undefined,
            colorMood: character.colorMood || colorPalette.mood || undefined,
          });
        }
      } else if (activeTab === 'scenes') {
        for (const scene of itemsToGenerate) {
          const itemKey = `scene_${scene.id}`;
          setGeneratingItems(prev => new Set(prev).add(itemKey));
          generateSceneImageMutation.mutate({
            designId: design.id,
            sceneId: scene.id,
            aspectRatio: (scene.aspectRatio || '16:9') as '1:1' | '16:9' | '9:16',
            styleReferenceImage: finalStyleReferenceImage,
            styleDescription: scene.styleDescription || styleDescription || undefined,
            architecturalStyle: scene.architecturalStyle || architecturalStyle || undefined,
            colorTone: scene.colorTone || colorPalette.overall || undefined,
            primaryColors: scene.primaryColors || colorPalette.primaryColors?.join(', ') || undefined,
            colorMood: scene.colorMood || colorPalette.mood || undefined,
          });
        }
      } else if (activeTab === 'props') {
        for (const prop of itemsToGenerate) {
          const itemKey = `prop_${prop.id}`;
          setGeneratingItems(prev => new Set(prev).add(itemKey));
          generatePropImageMutation.mutate({
            designId: design.id,
            propId: prop.id,
            aspectRatio: (prop.aspectRatio || '1:1') as '1:1' | '16:9' | '9:16',
            styleReferenceImage: finalStyleReferenceImage,
            styleDescription: prop.styleDescription || styleDescription || undefined,
            architecturalStyle: prop.architecturalStyle || architecturalStyle || undefined,
            colorTone: prop.colorTone || colorPalette.overall || undefined,
            primaryColors: prop.primaryColors || colorPalette.primaryColors?.join(', ') || undefined,
            colorMood: prop.colorMood || colorPalette.mood || undefined,
          });
        }
      }
      
      toast.info(`开始批量生成 ${total} 个${itemType}图片`);
      
    } catch (error: any) {
      toast.error('批量生成失败: ' + error.message);
      setIsBatchGenerating(false);
      isBatchGeneratingRef.current = false;
      setBatchProgress({ step: '', progress: 0, current: 0, total: 0 });
    }
  };
  
  // 处理图片上传
  const handleImageUpload = async (type: 'character' | 'scene' | 'prop', id: string, file: File) => {
    if (!design?.id) return;
    
    const itemKey = `${type}_${id}`;
    setUploadingItems(prev => new Set(prev).add(itemKey));
    
    try {
      // 读取文件为 base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;
      
      // 调用上传 API
      await uploadDesignImageMutation.mutateAsync({
        designId: design.id,
        itemType: type,
        itemId: id,
        imageData: base64Data,
        fileName: file.name,
      });
      
      toast.success('图片上传成功');
    } catch (error: any) {
      toast.error('上传失败: ' + error.message);
    } finally {
      setUploadingItems(prev => {
        const next = new Set(prev);
        next.delete(itemKey);
        return next;
      });
    }
  };

  // 处理从资产库导入
  const handleAssetLibraryImport = (type: 'character' | 'scene' | 'prop', id: string) => {
    setAssetLibraryTarget({ type, id });
    setAssetLibraryOpen(true);
  };

  // 处理资产库选择 - 将 S3 URL 转换为 base64 避免 403 错误
  const handleAssetSelect = async (asset: any) => {
    if (!design?.id || !assetLibraryTarget) return;
    
    const { type, id } = assetLibraryTarget;
    const itemKey = `${type}_${id}`;
    setUploadingItems(prev => new Set(prev).add(itemKey));
    
    try {
      let imageUrl = asset.imageUrl;
      
      // 如果是 S3/CloudFront URL，先下载转换为 base64 避免 403 错误
      if (!imageUrl.startsWith('data:')) {
        toast.info('正在加载图片...');
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`图片加载失败: ${response.status}`);
        }
        const blob = await response.blob();
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
        });
        reader.readAsDataURL(blob);
        imageUrl = await base64Promise;
      }
      
      // 使用 base64 格式更新设计数据
      await updateDesignItemMutation.mutateAsync({
        designId: design.id,
        itemType: type,
        itemId: id,
        updates: { imageUrl, generationStatus: 'completed' },
      });
      
      toast.success('图片导入成功');
      setAssetLibraryOpen(false);
      setAssetLibraryTarget(null);
    } catch (error: any) {
      toast.error('导入失败: ' + error.message);
    } finally {
      setUploadingItems(prev => {
        const next = new Set(prev);
        next.delete(itemKey);
        return next;
      });
    }
  };

  // 处理风格参考图上传
  const handleStyleImageUpload = async (file: File) => {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;
      setStyleReferenceImage(base64Data);
      // 保存到数据库
      if (design?.id) {
        updateDesignMutation.mutate({
          id: design.id,
          styleReferenceImage: base64Data,
        });
      }
      toast.success('风格参考图已加载');
    } catch (error: any) {
      toast.error('加载失败: ' + error.message);
    }
  };

  // 处理风格资产库选择 - 通过服务器代理获取避免 CORS 问题
  const handleStyleAssetSelect = async (asset: any) => {
    setStyleAssetLibraryOpen(false);
    
    try {
      let imageUrl = asset.imageUrl;
      
      // 如果是远程 URL，通过服务器代理获取（解决 CORS 问题）
      if (!imageUrl.startsWith('data:')) {
        toast.info('正在加载图片...');
        const result = await fetchImageMutation.mutateAsync({ url: imageUrl });
        if (!result.success || !result.base64) {
          throw new Error(result.error || '图片加载失败');
        }
        imageUrl = result.base64;
      }
      
      setStyleReferenceImage(imageUrl);
      // 保存 base64 格式到数据库
      if (design?.id) {
        updateDesignMutation.mutate({
          id: design.id,
          styleReferenceImage: imageUrl,
        });
      }
      toast.success('风格参考图已导入');
    } catch (error: any) {
      toast.error('导入失败: ' + error.message);
    }
  };

  // AI风格反推
  const analyzeStyleMutation = trpc.basicCreation.analyzeStyleFromImage.useMutation({
    onSuccess: (data) => {
      setStyleDescription(data.styleDescription);
      // 保存到数据库
      if (design?.id) {
        updateDesignMutation.mutate({
          id: design.id,
          styleDescription: data.styleDescription,
        });
      }
      setIsAnalyzingStyle(false);
      toast.success('风格分析完成');
    },
    onError: (error) => {
      toast.error('风格分析失败: ' + error.message);
      setIsAnalyzingStyle(false);
    },
  });

  const handleAnalyzeStyle = () => {
    if (!styleReferenceImage) {
      toast.error('请先上传或导入风格参考图');
      return;
    }
    setIsAnalyzingStyle(true);
    analyzeStyleMutation.mutate({ imageUrl: styleReferenceImage });
  };

  // 处理风格预览板图片上传（单图模式）
  const handleStylePreviewUpload = async (file: File) => {
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const base64Data = await base64Promise;
      
      setStylePreviewImage(base64Data);
      
      // 如果已有设计数据，保存到数据库；否则只保存在本地状态，等生成设计时再保存
      if (design?.id) {
        console.log('[DesignPanel] 保存风格预览板图片, designId:', design.id);
        updateDesignMutation.mutate({
          id: design.id,
          stylePreviewImages: [{ url: base64Data }],
        });
      }
      toast.success('风格参考图已加载');
    } catch (error: any) {
      toast.error('加载失败: ' + error.message);
    }
  };

  // 处理风格预览板图片删除（单图模式）
  const handleStylePreviewDelete = () => {
    setStylePreviewImage(null);
    if (design?.id) {
      updateDesignMutation.mutate({
        id: design.id,
        stylePreviewImages: null,
      });
    }
    toast.success('已删除参考图');
  };

  // 从风格预览板AI反推风格描述
  const handleAnalyzeStyleFromPreview = async () => {
    if (!stylePreviewImage) {
      toast.error('请先上传风格预览板图片');
      return;
    }
    setIsAnalyzingStyleDescription(true);
    try {
      const result = await analyzeStyleMutation.mutateAsync({ imageUrl: stylePreviewImage });
      setStyleDescription(result.styleDescription);
      
      if (design?.id) {
        updateDesignMutation.mutate({
          id: design.id,
          styleDescription: result.styleDescription,
        });
      }
      toast.success('风格分析完成');
    } catch (error: any) {
      toast.error('风格分析失败: ' + error.message);
    } finally {
      setIsAnalyzingStyleDescription(false);
    }
  };

  // 服务器端代理获取图片
  const fetchImageMutation = trpc.basicCreation.fetchImageAsBase64.useMutation();
  
  // 资产库选择风格预览板图片 - 通过服务器代理获取避免 CORS 问题
  const handleStylePreviewAssetSelect = async (asset: { imageUrl: string }) => {
    setStylePreviewAssetLibraryOpen(false);
    
    try {
      let imageUrl = asset.imageUrl;
      
      // 如果是远程 URL，通过服务器代理获取（解决 CORS 问题）
      if (!imageUrl.startsWith('data:')) {
        const result = await fetchImageMutation.mutateAsync({ url: imageUrl });
        if (!result.success || !result.base64) {
          throw new Error(result.error || '图片加载失败');
        }
        imageUrl = result.base64;
      }
      
      setStylePreviewImage(imageUrl);
      
      // 如果已有设计数据，保存到数据库；否则只保存在本地状态
      if (design?.id) {
        updateDesignMutation.mutate({
          id: design.id,
          stylePreviewImages: [{ url: imageUrl }],
        });
      }
      // 导入成功，不需要提示
    } catch (error: any) {
      toast.error('导入失败: ' + error.message);
    }
  };

  // 保存全局风格设定
  const saveGlobalStyleSettings = () => {
    if (!design?.id) return;
    updateDesignMutation.mutate({
      id: design.id,
      architecturalStyle: architecturalStyle || null,
      colorPalette: colorPalette.overall || colorPalette.primaryColors.length > 0 || colorPalette.mood ? colorPalette : null,
      stylePreviewImages: stylePreviewImage ? [{ url: stylePreviewImage }] : null,
    });
    toast.success('风格设定已保存');
  };

  // 建筑风格选项
  const architecturalStyleOptions = [
    '自定义',
    '现代都市',
    '中式古典',
    '日式传统',
    '哥特式',
    '工业风',
    '赛博朋克',
    '末日废墟',
    '未来科幻',
    '奇幻魔法',
    '欧洲中世纪',
    '美式乡村',
  ];

  // 色调选项
  const colorToneOptions = [
    '自定义',
    '冷色调',
    '暖色调',
    '高对比度',
    '低饱和度',
    '复古色调',
    '霉色调',
    '黑白灰',
  ];

  // 色彩情绪选项
  const colorMoodOptions = [
    '自定义',
    '神秘',
    '紧张',
    '温馨',
    '压抑',
    '明快',
    '恐怖',
    '浪漫',
    '史诗',
  ];

  // 处理主色输入
  const handlePrimaryColorsChange = (value: string) => {
    const colors = value.split(/[,，、]/).map(c => c.trim()).filter(c => c);
    setColorPalette(prev => ({ ...prev, primaryColors: colors }));
  };

  // 处理字段更新
  const handleFieldUpdate = useCallback((type: 'character' | 'scene' | 'prop', id: string, fieldPath: string, value: string) => {
    if (!design?.id) return;
    
    // 解析字段路径，支持嵌套字段如 "visualDesign.temperament"
    const pathParts = fieldPath.split('.');
    let updates: any = {};
    
    if (pathParts.length === 1) {
      updates[fieldPath] = value;
    } else {
      // 获取当前项目的数据
      let currentItem: any;
      if (type === 'character') {
        currentItem = characters.find(c => c.id === id);
      } else if (type === 'scene') {
        currentItem = scenes.find(s => s.id === id);
      } else {
        currentItem = props.find(p => p.id === id);
      }
      
      if (currentItem) {
        // 构建嵌套更新对象
        const topLevelKey = pathParts[0];
        const nestedKey = pathParts[1];
        updates[topLevelKey] = {
          ...(currentItem[topLevelKey] || {}),
          [nestedKey]: value,
        };
      }
    }
    
    updateDesignItemMutation.mutate({
      designId: design.id,
      itemType: type,
      itemId: id,
      updates,
    });
  }, [design?.id, characters, scenes, props, updateDesignItemMutation]);
  
  
  // Tab 按钮组件
  const TabButton = ({ tab, icon: Icon, label, count }: { tab: 'characters' | 'scenes' | 'props'; icon: any; label: string; count: number }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all ${
        activeTab === tab
          ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
          : 'bg-[#1a1035] text-gray-400 hover:bg-purple-900/30 hover:text-white'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="font-medium">{label}</span>
      <span className="text-sm opacity-75">({count})</span>
    </button>
  );
  
  // 角色卡片组件
  const CharacterCard = ({ character }: { character: CharacterDesign }) => {
    const [aspectRatio, setAspectRatio] = useState(character.aspectRatio || '9:16');
    const isGenerating = generatingItems.has(`character_${character.id}`);
    const isUploading = uploadingItems.has(`character_${character.id}`);
    const isDisabled = isRegenerating || isGenerating;
    
    return (
      <div className={`bg-[#1a1035] rounded-xl overflow-hidden border border-purple-900/30 ${isDisabled ? 'opacity-60' : ''}`}>
        <div className="flex">
          {/* 左侧图片区域 */}
          <div className="w-[200px] flex-shrink-0 p-4 flex flex-col gap-3">
            <label className={`${aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} bg-[#0d0820] rounded-lg flex items-center justify-center overflow-hidden cursor-pointer hover:bg-[#150d30] transition-colors relative group`}>
              {isUploading ? (
                <div className="text-center text-purple-400">
                  <Loader2 className="w-8 h-8 mx-auto mb-1 animate-spin" />
                  <span className="text-xs">上传中...</span>
                </div>
              ) : character.imageUrl ? (
                <>
                  <img src={character.imageUrl} alt={character.characterName} className="w-full h-full object-cover" />
                  {/* 右上角操作菜单 */}
                  <div className="absolute top-1 right-1 z-10" onClick={(e) => e.preventDefault()}>
                    <ImageActions
                      imageUrl={character.imageUrl}
                      imageName={character.characterName}
                      variant="dropdown"
                      size="sm"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-center text-white">
                      <Upload className="w-6 h-6 mx-auto mb-1" />
                      <span className="text-xs">点击更换</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500">
                  <Upload className="w-8 h-8 mx-auto mb-1" />
                  <span className="text-xs">点击上传</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading || isDisabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImageUpload('character', character.id, file);
                  }
                }}
              />
            </label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full bg-[#0d0820] border border-purple-900/30 rounded px-2 py-1.5 text-xs text-white"
              disabled={isDisabled}
            >
              {aspectRatios.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {/* 资产库导入和加载到画布按钮 */}
            <div className="flex gap-2">
              <button
                onClick={() => handleAssetLibraryImport('character', character.id)}
                disabled={isDisabled}
                className="flex-1 bg-[#0d0820] border border-purple-900/30 text-gray-300 py-1.5 rounded-lg text-xs hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderOpen className="w-3 h-3" />
                资产库导入
              </button>
              <button
                onClick={() => {
                  if (character.imageUrl && onLoadToCanvas) {
                    onLoadToCanvas(character.imageUrl, character.characterName, 'character');
                  } else if (!character.imageUrl) {
                    toast.warning('请先生成或上传图片');
                  }
                }}
                disabled={isDisabled}
                className="flex-1 bg-[#0d0820] border border-purple-900/30 text-gray-300 py-1.5 rounded-lg text-xs hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Grid className="w-3 h-3" />
                加载到画布
              </button>
            </div>
            <button
              onClick={() => handleGenerateImage('character', character.id, aspectRatio, {
                styleDescription: character.styleDescription,
                architecturalStyle: character.architecturalStyle,
                colorTone: character.colorTone,
                primaryColors: character.primaryColors,
                colorMood: character.colorMood,
              })}
              disabled={isGenerating || !design?.id || isDisabled}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-2 rounded-lg font-medium hover:from-pink-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  生成图片
                </>
              )}
            </button>
          </div>
          
          {/* 右侧信息区域 - 可编辑 */}
          <div className="flex-1 p-4 border-l border-purple-900/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <EditableField
                  label="角色名"
                  value={character.characterName}
                  onChange={(value) => handleFieldUpdate('character', character.id, 'characterName', value)}
                  disabled={isDisabled}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-400">{translateRole(character.role)}</span>
                  {character.stageLabel && (
                    <span className="text-xs px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                      {character.stageLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <EditableField
                label="年龄"
                value={character.visualDesign?.age || ''}
                onChange={(value) => handleFieldUpdate('character', character.id, 'visualDesign.age', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="气质"
                value={character.visualDesign?.temperament || ''}
                onChange={(value) => handleFieldUpdate('character', character.id, 'visualDesign.temperament', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="身材"
                value={character.visualDesign?.bodyType || ''}
                onChange={(value) => handleFieldUpdate('character', character.id, 'visualDesign.bodyType', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="服装"
                value={character.clothingDesign?.description || character.clothingDesign?.style || ''}
                onChange={(value) => handleFieldUpdate('character', character.id, 'clothingDesign.description', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="发型"
                value={character.hairstyleDesign?.description || character.hairstyleDesign?.style || ''}
                onChange={(value) => handleFieldUpdate('character', character.id, 'hairstyleDesign.description', value)}
                disabled={isDisabled}
              />
            </div>
            
            {/* 配饰标签 */}
            {character.accessories && character.accessories.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {character.accessories.map((acc, idx) => (
                  <span key={idx} className="px-2 py-1 bg-purple-900/30 text-purple-300 rounded text-xs">
                    {acc.name}
                  </span>
                ))}
              </div>
            )}
            
            {/* 设计说明 */}
            <div className="mt-3">
              <EditableField
                label="设计说明"
                value={character.designNotes || ''}
                onChange={(value) => handleFieldUpdate('character', character.id, 'designNotes', value)}
                disabled={isDisabled}
                multiline
              />
            </div>
            
            {/* 风格设定 - 可编辑文本框 */}
            <div className="mt-3 pt-3 border-t border-purple-900/20">
              <div className="flex items-center gap-1 mb-2">
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span className="text-xs text-gray-400">风格设定</span>
                <span className="text-xs text-gray-500">(生成时自动加载全局风格，可手动修改)</span>
              </div>
              <div className="space-y-2">
                <EditableField
                  label="风格描述"
                  value={character.styleDescription || styleDescription || ''}
                  onChange={(value) => handleFieldUpdate('character', character.id, 'styleDescription', value)}
                  disabled={isDisabled}
                  multiline
                />
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <EditableField
                    label="建筑风格"
                    value={character.architecturalStyle || architecturalStyle || ''}
                    onChange={(value) => handleFieldUpdate('character', character.id, 'architecturalStyle', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="整体色调"
                    value={character.colorTone || colorPalette.overall || ''}
                    onChange={(value) => handleFieldUpdate('character', character.id, 'colorTone', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="主色"
                    value={character.primaryColors || colorPalette.primaryColors?.join(', ') || ''}
                    onChange={(value) => handleFieldUpdate('character', character.id, 'primaryColors', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="色彩情绪"
                    value={character.colorMood || colorPalette.mood || ''}
                    onChange={(value) => handleFieldUpdate('character', character.id, 'colorMood', value)}
                    disabled={isDisabled}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // 场景卡片组件
  const SceneCard = ({ scene }: { scene: SceneDesign }) => {
    const [aspectRatio, setAspectRatio] = useState(scene.aspectRatio || '16:9');
    const isGenerating = generatingItems.has(`scene_${scene.id}`);
    const isUploading = uploadingItems.has(`scene_${scene.id}`);
    const isDisabled = isRegenerating || isGenerating;
    
    return (
      <div className={`bg-[#1a1035] rounded-xl overflow-hidden border border-purple-900/30 ${isDisabled ? 'opacity-60' : ''}`}>
        <div className="flex">
          {/* 左侧图片区域 */}
          <div className="w-[200px] flex-shrink-0 p-4 flex flex-col gap-3">
            <label className={`${aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} bg-[#0d0820] rounded-lg flex items-center justify-center overflow-hidden cursor-pointer hover:bg-[#150d30] transition-colors relative group`}>
              {isUploading ? (
                <div className="text-center text-purple-400">
                  <Loader2 className="w-8 h-8 mx-auto mb-1 animate-spin" />
                  <span className="text-xs">上传中...</span>
                </div>
              ) : scene.imageUrl ? (
                <>
                  <img src={scene.imageUrl} alt={scene.sceneName} className="w-full h-full object-cover" />
                  {/* 右上角操作菜单 */}
                  <div className="absolute top-1 right-1 z-10" onClick={(e) => e.preventDefault()}>
                    <ImageActions
                      imageUrl={scene.imageUrl}
                      imageName={scene.sceneName}
                      variant="dropdown"
                      size="sm"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-center text-white">
                      <Upload className="w-6 h-6 mx-auto mb-1" />
                      <span className="text-xs">点击更换</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500">
                  <Upload className="w-8 h-8 mx-auto mb-1" />
                  <span className="text-xs">点击上传</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading || isDisabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImageUpload('scene', scene.id, file);
                  }
                }}
              />
            </label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full bg-[#0d0820] border border-purple-900/30 rounded px-2 py-1.5 text-xs text-white"
              disabled={isDisabled}
            >
              {aspectRatios.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {/* 资产库导入和加载到画布按钮 */}
            <div className="flex gap-2">
              <button
                onClick={() => handleAssetLibraryImport('scene', scene.id)}
                disabled={isDisabled}
                className="flex-1 bg-[#0d0820] border border-purple-900/30 text-gray-300 py-1.5 rounded-lg text-xs hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderOpen className="w-3 h-3" />
                资产库导入
              </button>
              <button
                onClick={() => {
                  if (scene.imageUrl && onLoadToCanvas) {
                    onLoadToCanvas(scene.imageUrl, scene.sceneName, 'scene');
                  } else if (!scene.imageUrl) {
                    toast.warning('请先生成或上传图片');
                  }
                }}
                disabled={isDisabled}
                className="flex-1 bg-[#0d0820] border border-purple-900/30 text-gray-300 py-1.5 rounded-lg text-xs hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Grid className="w-3 h-3" />
                加载到画布
              </button>
            </div>
            <button
              onClick={() => handleGenerateImage('scene', scene.id, aspectRatio, {
                styleDescription: scene.styleDescription,
                architecturalStyle: scene.architecturalStyle,
                colorTone: scene.colorTone,
                primaryColors: scene.primaryColors,
                colorMood: scene.colorMood,
              })}
              disabled={isGenerating || !design?.id || isDisabled}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-2 rounded-lg font-medium hover:from-pink-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  生成图片
                </>
              )}
            </button>
          </div>
          
          {/* 右侧信息区域 - 可编辑 */}
          <div className="flex-1 p-4 border-l border-purple-900/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <EditableField
                  label="场景名"
                  value={scene.sceneName}
                  onChange={(value) => handleFieldUpdate('scene', scene.id, 'sceneName', value)}
                  disabled={isDisabled}
                />
                <span className="text-xs text-cyan-400">
                  {scene.locationType === 'indoor' ? '室内' : scene.locationType === 'outdoor' ? '室外' : '混合'}
                  {scene.timeSetting && ` | ${scene.timeSetting}`}
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <EditableField
                label="布局"
                value={scene.spaceDesign?.layout || ''}
                onChange={(value) => handleFieldUpdate('scene', scene.id, 'spaceDesign.layout', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="主光"
                value={scene.lightingDesign?.mainLight || ''}
                onChange={(value) => handleFieldUpdate('scene', scene.id, 'lightingDesign.mainLight', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="氛围"
                value={scene.atmosphere || ''}
                onChange={(value) => handleFieldUpdate('scene', scene.id, 'atmosphere', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="色温"
                value={scene.colorDesign?.colorTemperature || ''}
                onChange={(value) => handleFieldUpdate('scene', scene.id, 'colorDesign.colorTemperature', value)}
                disabled={isDisabled}
              />
            </div>
            
            {/* 元素标签 */}
            {scene.essentialElements && scene.essentialElements.length > 0 && (
              <div className="mt-3">
                <span className="text-gray-500 text-sm">元素</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {scene.essentialElements.map((elem, idx) => (
                    <span key={idx} className="px-2 py-1 bg-cyan-900/30 text-cyan-300 rounded text-xs">
                      {elem}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {/* 风格设定 - 可编辑文本框 */}
            <div className="mt-3 pt-3 border-t border-purple-900/20">
              <div className="flex items-center gap-1 mb-2">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                <span className="text-xs text-gray-400">风格设定</span>
                <span className="text-xs text-gray-500">(生成时自动加载全局风格，可手动修改)</span>
              </div>
              <div className="space-y-2">
                <EditableField
                  label="风格描述"
                  value={scene.styleDescription || styleDescription || ''}
                  onChange={(value) => handleFieldUpdate('scene', scene.id, 'styleDescription', value)}
                  disabled={isDisabled}
                  multiline
                />
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <EditableField
                    label="建筑风格"
                    value={scene.architecturalStyle || architecturalStyle || ''}
                    onChange={(value) => handleFieldUpdate('scene', scene.id, 'architecturalStyle', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="整体色调"
                    value={scene.colorTone || colorPalette.overall || ''}
                    onChange={(value) => handleFieldUpdate('scene', scene.id, 'colorTone', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="主色"
                    value={scene.primaryColors || colorPalette.primaryColors?.join(', ') || ''}
                    onChange={(value) => handleFieldUpdate('scene', scene.id, 'primaryColors', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="色彩情绪"
                    value={scene.colorMood || colorPalette.mood || ''}
                    onChange={(value) => handleFieldUpdate('scene', scene.id, 'colorMood', value)}
                    disabled={isDisabled}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // 道具卡片组件
  const PropCard = ({ prop }: { prop: PropDesign }) => {
    const [aspectRatio, setAspectRatio] = useState(prop.aspectRatio || '1:1');
    const isGenerating = generatingItems.has(`prop_${prop.id}`);
    const isUploading = uploadingItems.has(`prop_${prop.id}`);
    const hierarchyInfo = hierarchyLabels[prop.hierarchy] || hierarchyLabels.background;
    const isDisabled = isRegenerating || isGenerating;
    
    return (
      <div className={`bg-[#1a1035] rounded-xl overflow-hidden border border-purple-900/30 ${isDisabled ? 'opacity-60' : ''}`}>
        <div className="flex">
          {/* 左侧图片区域 */}
          <div className="w-[200px] flex-shrink-0 p-4 flex flex-col gap-3">
            <label className={`${aspectRatio === '1:1' ? 'aspect-square' : aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]'} bg-[#0d0820] rounded-lg flex items-center justify-center overflow-hidden cursor-pointer hover:bg-[#150d30] transition-colors relative group`}>
              {isUploading ? (
                <div className="text-center text-purple-400">
                  <Loader2 className="w-8 h-8 mx-auto mb-1 animate-spin" />
                  <span className="text-xs">上传中...</span>
                </div>
              ) : prop.imageUrl ? (
                <>
                  <img src={prop.imageUrl} alt={prop.name} className="w-full h-full object-cover" />
                  {/* 右上角操作菜单 */}
                  <div className="absolute top-1 right-1 z-10" onClick={(e) => e.preventDefault()}>
                    <ImageActions
                      imageUrl={prop.imageUrl}
                      imageName={prop.name}
                      variant="dropdown"
                      size="sm"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-center text-white">
                      <Upload className="w-6 h-6 mx-auto mb-1" />
                      <span className="text-xs">点击更换</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500">
                  <Upload className="w-8 h-8 mx-auto mb-1" />
                  <span className="text-xs">点击上传</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading || isDisabled}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleImageUpload('prop', prop.id, file);
                  }
                }}
              />
            </label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full bg-[#0d0820] border border-purple-900/30 rounded px-2 py-1.5 text-xs text-white"
              disabled={isDisabled}
            >
              {aspectRatios.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {/* 资产库导入和加载到画布按钮 */}
            <div className="flex gap-2">
              <button
                onClick={() => handleAssetLibraryImport('prop', prop.id)}
                disabled={isDisabled}
                className="flex-1 bg-[#0d0820] border border-purple-900/30 text-gray-300 py-1.5 rounded-lg text-xs hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FolderOpen className="w-3 h-3" />
                资产库导入
              </button>
              <button
                onClick={() => {
                  if (prop.imageUrl && onLoadToCanvas) {
                    onLoadToCanvas(prop.imageUrl, prop.name, 'prop');
                  } else if (!prop.imageUrl) {
                    toast.warning('请先生成或上传图片');
                  }
                }}
                disabled={isDisabled}
                className="flex-1 bg-[#0d0820] border border-purple-900/30 text-gray-300 py-1.5 rounded-lg text-xs hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Grid className="w-3 h-3" />
                加载到画布
              </button>
            </div>
            <button
              onClick={() => handleGenerateImage('prop', prop.id, aspectRatio, {
                styleDescription: prop.styleDescription,
                architecturalStyle: prop.architecturalStyle,
                colorTone: prop.colorTone,
                primaryColors: prop.primaryColors,
                colorMood: prop.colorMood,
              })}
              disabled={isGenerating || !design?.id || isDisabled}
              className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white py-2 rounded-lg font-medium hover:from-pink-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  生成图片
                </>
              )}
            </button>
          </div>
          
          {/* 右侧信息区域 - 可编辑 */}
          <div className="flex-1 p-4 border-l border-purple-900/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-8 h-8 rounded-full bg-yellow-600 flex items-center justify-center">
                  <Package className="w-4 h-4 text-white" />
                </div>
                <EditableField
                  label="道具名"
                  value={prop.name}
                  onChange={(value) => handleFieldUpdate('prop', prop.id, 'name', value)}
                  disabled={isDisabled}
                />
              </div>
              <span className={`px-2 py-1 rounded text-xs ${hierarchyInfo.color}`}>
                {hierarchyInfo.label}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <EditableField
                label="功能"
                value={prop.function || ''}
                onChange={(value) => handleFieldUpdate('prop', prop.id, 'function', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="材质"
                value={prop.material || ''}
                onChange={(value) => handleFieldUpdate('prop', prop.id, 'material', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="尺寸"
                value={prop.size || ''}
                onChange={(value) => handleFieldUpdate('prop', prop.id, 'size', value)}
                disabled={isDisabled}
              />
              <EditableField
                label="颜色"
                value={prop.color || ''}
                onChange={(value) => handleFieldUpdate('prop', prop.id, 'color', value)}
                disabled={isDisabled}
              />
            </div>
            
            {/* 视觉设计 */}
            <div className="mt-3">
              <EditableField
                label="视觉设计"
                value={prop.visualDesign || ''}
                onChange={(value) => handleFieldUpdate('prop', prop.id, 'visualDesign', value)}
                disabled={isDisabled}
                multiline
              />
            </div>
            
            {/* 特殊说明 */}
            <div className="mt-2">
              <EditableField
                label="特殊说明"
                value={prop.specialNotes || ''}
                onChange={(value) => handleFieldUpdate('prop', prop.id, 'specialNotes', value)}
                disabled={isDisabled}
                multiline
              />
            </div>
            
            {/* 风格设定 - 可编辑文本框 */}
            <div className="mt-3 pt-3 border-t border-purple-900/20">
              <div className="flex items-center gap-1 mb-2">
                <Sparkles className="w-3 h-3 text-yellow-400" />
                <span className="text-xs text-gray-400">风格设定</span>
                <span className="text-xs text-gray-500">(生成时自动加载全局风格，可手动修改)</span>
              </div>
              <div className="space-y-2">
                <EditableField
                  label="风格描述"
                  value={prop.styleDescription || styleDescription || ''}
                  onChange={(value) => handleFieldUpdate('prop', prop.id, 'styleDescription', value)}
                  disabled={isDisabled}
                  multiline
                />
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <EditableField
                    label="建筑风格"
                    value={prop.architecturalStyle || architecturalStyle || ''}
                    onChange={(value) => handleFieldUpdate('prop', prop.id, 'architecturalStyle', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="整体色调"
                    value={prop.colorTone || colorPalette.overall || ''}
                    onChange={(value) => handleFieldUpdate('prop', prop.id, 'colorTone', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="主色"
                    value={prop.primaryColors || colorPalette.primaryColors?.join(', ') || ''}
                    onChange={(value) => handleFieldUpdate('prop', prop.id, 'primaryColors', value)}
                    disabled={isDisabled}
                  />
                  <EditableField
                    label="色彩情绪"
                    value={prop.colorMood || colorPalette.mood || ''}
                    onChange={(value) => handleFieldUpdate('prop', prop.id, 'colorMood', value)}
                    disabled={isDisabled}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="h-full flex bg-[#0a0618]/95 backdrop-blur-sm">
      {/* 面板容器 - 固定宽度与剧本改编一致 */}
      <div className="w-[940px] h-full flex flex-col bg-[#0a0a14] relative">
        {/* 收纳按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-[#1a1035] border border-purple-900/30 flex items-center justify-center text-gray-400 hover:text-white hover:bg-purple-900/30 transition-colors z-10"
          title="收纳面板"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {/* 顶部区域 */}
        <div className="px-6 py-4 border-b border-purple-900/30">
          <div className="flex items-start justify-between gap-6">
            {/* 左侧：剧本选择 */}
            <div className="flex-shrink-0 w-64">
              <label className="text-sm text-gray-400 mb-1 block">选择剧本</label>
              <select
                value={selectedScriptId || ''}
                onChange={(e) => setSelectedScriptId(Number(e.target.value))}
                className="w-full bg-[#1a1035] border border-purple-900/30 rounded-lg px-3 py-2 text-white"
                disabled={scriptsLoading}
              >
                {scripts?.map(script => (
                  <option key={script.id} value={script.id}>
                    {script.title} ({episodeCount} 集)
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-2 mt-2">
                {isRegenerating ? (
                  /* 生成进度条 */
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-white">{generationProgress.step || '准备中...'}</span>
                          <span className="text-purple-400">{generationProgress.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-[#1a1035] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 ease-out"
                            style={{ width: `${generationProgress.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleRegenerate}
                    disabled={!selectedScriptId}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-600 to-purple-600 text-white text-sm rounded-lg hover:from-pink-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-4 h-4" />
                    重新生成
                  </button>
                )}
              </div>
            </div>
            
            {/* 右侧：故事摘要 */}
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-1 block">剧本简介</label>
              <div className="bg-[#1a1035] rounded-lg p-3 h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-transparent">
                <p className="text-sm text-gray-300 whitespace-pre-wrap">
                  {selectedScript?.adaptedStory || '请先选择剧本...'}
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* 全局风格设定卡片 - 放在Tab切换上方 */}
        <div className="px-6 py-4 border-b border-purple-900/30">
          {/* 标题栏 - 可点击展开/收起 */}
          <div 
            className="flex items-center justify-between cursor-pointer group"
            onClick={() => setIsStyleSettingsExpanded(!isStyleSettingsExpanded)}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-white">全局风格设定</span>
              <span className="text-xs text-gray-500">(所有角色/场景/道具将继承此设定)</span>
            </div>
            <button
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-purple-900/30 transition-colors"
              title={isStyleSettingsExpanded ? '收起' : '展开'}
            >
              <span className="text-xs text-purple-400 font-medium">
                {isStyleSettingsExpanded ? '收起' : '展开'}
              </span>
              {isStyleSettingsExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-purple-400 transition-colors" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-purple-400 transition-colors" />
              )}
            </button>
          </div>
          
          {/* 内容区域 - 可折叠 */}
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isStyleSettingsExpanded ? 'max-h-[500px] opacity-100 mt-3' : 'max-h-0 opacity-0 mt-0'}`}>
          <div className="grid grid-cols-[140px_1fr] gap-4">
            {/* 左侧：风格预览板 - 单图模式 */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-gray-400">风格预览板</span>
              <div className="relative group">
                <div 
                  className="w-[140px] h-[140px] bg-[#0d0820] rounded-lg border border-purple-900/30 flex items-center justify-center overflow-hidden cursor-pointer hover:border-purple-500/50 transition-colors"
                  onClick={() => stylePreviewInputRef.current?.click()}
                >
                  {stylePreviewImage ? (
                    <>
                      <img src={stylePreviewImage} alt="风格预览" className="w-full h-full object-cover" />
                      {/* 右上角始终可见的小X删除按钮 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStylePreviewDelete(); }}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/70 hover:bg-red-600 rounded-full text-white flex items-center justify-center transition-colors z-10"
                        title="删除风格参考图"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                      <Upload className="w-6 h-6" />
                      <span className="text-xs">点击上传</span>
                    </div>
                  )}
                </div>
                <input
                  ref={stylePreviewInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleStylePreviewUpload(file);
                  }}
                />
              </div>
              {/* 操作按钮 */}
              <div className="flex gap-1">
                <button
                  onClick={() => setStylePreviewAssetLibraryOpen(true)}
                  className="flex-1 px-2 py-1 bg-purple-900/30 hover:bg-purple-900/50 rounded text-xs text-gray-300 flex items-center justify-center gap-1"
                  title="从资产库导入"
                >
                  <FolderOpen className="w-3 h-3" />
                  资产库导入
                </button>
                {stylePreviewImage && onLoadToCanvas && (
                  <button
                    onClick={() => onLoadToCanvas(stylePreviewImage, '风格预览板', 'scene')}
                    className="flex-1 px-2 py-1 bg-cyan-900/30 hover:bg-cyan-900/50 rounded text-xs text-gray-300 flex items-center justify-center gap-1"
                    title="加载到画布"
                  >
                    <Grid className="w-3 h-3" />
                    加载到画布
                  </button>
                )}
              </div>
            </div>
            
            {/* 右侧：风格设定字段 */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {/* 风格描述 */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">风格描述</label>
                  <button
                    onClick={handleAnalyzeStyleFromPreview}
                    disabled={!stylePreviewImage || isAnalyzingStyleDescription}
                    className="flex items-center gap-1 px-2 py-0.5 bg-purple-600/80 hover:bg-purple-500 disabled:bg-gray-700 disabled:cursor-not-allowed rounded text-xs text-white transition-colors"
                    title="从风格预览板AI反推风格描述"
                  >
                    {isAnalyzingStyleDescription ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    AI反推
                  </button>
                </div>
                <textarea
                  value={styleDescription}
                  onChange={(e) => setStyleDescription(e.target.value)}
                  onBlur={(e) => {
                    const newValue = e.target.value.trim();
                    const oldValue = (design?.styleDescription || '').trim();
                    if (design?.id && newValue !== oldValue) {
                      console.log('[DesignPanel] 保存风格描述:', newValue.substring(0, 50) + '...');
                      updateDesignMutation.mutate({
                        id: design.id,
                        styleDescription: newValue || null,
                      });
                    }
                  }}
                  placeholder="输入整体风格描述，或从预览板图片AI反推..."
                  rows={2}
                  className="w-full bg-[#0d0820] border border-purple-900/30 rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-gray-500 focus:border-purple-500/50 focus:outline-none resize-none"
                />
              </div>
              
              {/* 建筑风格 */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">建筑风格</label>
                {isArchitecturalStyleCustom ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={customArchitecturalStyle}
                      onChange={(e) => setCustomArchitecturalStyle(e.target.value)}
                      onBlur={() => {
                        if (design?.id && customArchitecturalStyle) {
                          setArchitecturalStyle(customArchitecturalStyle);
                          updateDesignMutation.mutate({
                            id: design.id,
                            architecturalStyle: customArchitecturalStyle,
                          });
                        }
                      }}
                      placeholder="输入自定义建筑风格..."
                      className="flex-1 bg-[#0d0820] border border-purple-900/30 rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-gray-500 focus:border-purple-500/50 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (design?.id && customArchitecturalStyle) {
                          setArchitecturalStyle(customArchitecturalStyle);
                          updateDesignMutation.mutate({
                            id: design.id,
                            architecturalStyle: customArchitecturalStyle,
                          });
                        }
                        setIsArchitecturalStyleCustom(false);
                      }}
                      className="px-2 py-1 bg-green-600/50 hover:bg-green-600/70 border border-green-500/50 rounded text-xs text-green-300"
                      title="确认编辑"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <select
                      value={architecturalStyleOptions.includes(architecturalStyle) ? architecturalStyle : '自定义'}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value !== '自定义') {
                          setArchitecturalStyle(value);
                          if (design?.id) {
                            updateDesignMutation.mutate({
                              id: design.id,
                              architecturalStyle: value || null,
                            });
                          }
                        }
                      }}
                      className="flex-1 bg-[#0d0820] border border-purple-900/30 rounded-lg px-3 py-1.5 text-white text-sm focus:border-purple-500/50 focus:outline-none"
                    >
                      {architecturalStyleOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                      {architecturalStyle && !architecturalStyleOptions.includes(architecturalStyle) && (
                        <option value={architecturalStyle}>{architecturalStyle} (自定义)</option>
                      )}
                    </select>
                    <button
                      onClick={() => {
                        setIsArchitecturalStyleCustom(true);
                        setCustomArchitecturalStyle(architecturalStyle && !architecturalStyleOptions.includes(architecturalStyle) ? architecturalStyle : '');
                      }}
                      className="px-2 py-1 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 rounded text-xs text-purple-300"
                      title="输入自定义建筑风格"
                    >
                      编辑
                    </button>
                  </div>
                )}
              </div>
              
              {/* 整体色调 */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">整体色调</label>
                {isColorToneCustom ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={customColorTone}
                      onChange={(e) => setCustomColorTone(e.target.value)}
                      onBlur={() => {
                        if (design?.id && customColorTone) {
                          const newPalette = { ...colorPalette, overall: customColorTone };
                          setColorPalette(newPalette);
                          updateDesignMutation.mutate({
                            id: design.id,
                            colorPalette: newPalette,
                          });
                        }
                      }}
                      placeholder="输入自定义色调..."
                      className="flex-1 bg-[#0d0820] border border-purple-900/30 rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-gray-500 focus:border-purple-500/50 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (design?.id && customColorTone) {
                          const newPalette = { ...colorPalette, overall: customColorTone };
                          setColorPalette(newPalette);
                          updateDesignMutation.mutate({
                            id: design.id,
                            colorPalette: newPalette,
                          });
                        }
                        setIsColorToneCustom(false);
                      }}
                      className="px-2 py-1 bg-green-600/50 hover:bg-green-600/70 border border-green-500/50 rounded text-xs text-green-300"
                      title="确认编辑"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <select
                      value={colorToneOptions.includes(colorPalette.overall) ? colorPalette.overall : (colorPalette.overall ? colorPalette.overall : '自定义')}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value !== '自定义') {
                          const newPalette = { ...colorPalette, overall: value };
                          setColorPalette(newPalette);
                          if (design?.id) {
                            updateDesignMutation.mutate({
                              id: design.id,
                              colorPalette: newPalette.overall || newPalette.primaryColors.length > 0 || newPalette.mood ? newPalette : null,
                            });
                          }
                        }
                      }}
                      className="flex-1 bg-[#0d0820] border border-purple-900/30 rounded-lg px-3 py-1.5 text-white text-sm focus:border-purple-500/50 focus:outline-none"
                    >
                      {colorToneOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                      {colorPalette.overall && !colorToneOptions.includes(colorPalette.overall) && (
                        <option value={colorPalette.overall}>{colorPalette.overall} (自定义)</option>
                      )}
                    </select>
                    <button
                      onClick={() => {
                        setIsColorToneCustom(true);
                        setCustomColorTone(colorPalette.overall && !colorToneOptions.includes(colorPalette.overall) ? colorPalette.overall : '');
                      }}
                      className="px-2 py-1 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 rounded text-xs text-purple-300"
                      title="输入自定义色调"
                    >
                      编辑
                    </button>
                  </div>
                )}
              </div>
              
              {/* 主色 */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">主色 <span className="text-gray-500">(用逗号分隔)</span></label>
                <input
                  type="text"
                  value={colorPalette.primaryColors.join(', ')}
                  onChange={(e) => handlePrimaryColorsChange(e.target.value)}
                  onBlur={() => {
                    if (design?.id) {
                      updateDesignMutation.mutate({
                        id: design.id,
                        colorPalette: colorPalette.overall || colorPalette.primaryColors.length > 0 || colorPalette.mood ? colorPalette : null,
                      });
                    }
                  }}
                  placeholder="如：暗红, 金色, 黑色"
                  className="w-full bg-[#0d0820] border border-purple-900/30 rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-gray-500 focus:border-purple-500/50 focus:outline-none"
                />
              </div>
              
              {/* 色彩情绪 */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">色彩情绪</label>
                {isColorMoodCustom ? (
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={customColorMood}
                      onChange={(e) => setCustomColorMood(e.target.value)}
                      onBlur={() => {
                        if (design?.id && customColorMood) {
                          const newPalette = { ...colorPalette, mood: customColorMood };
                          setColorPalette(newPalette);
                          updateDesignMutation.mutate({
                            id: design.id,
                            colorPalette: newPalette,
                          });
                        }
                      }}
                      placeholder="输入自定义色彩情绪..."
                      className="flex-1 bg-[#0d0820] border border-purple-900/30 rounded-lg px-3 py-1.5 text-white text-sm placeholder:text-gray-500 focus:border-purple-500/50 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (design?.id && customColorMood) {
                          const newPalette = { ...colorPalette, mood: customColorMood };
                          setColorPalette(newPalette);
                          updateDesignMutation.mutate({
                            id: design.id,
                            colorPalette: newPalette,
                          });
                        }
                        setIsColorMoodCustom(false);
                      }}
                      className="px-2 py-1 bg-green-600/50 hover:bg-green-600/70 border border-green-500/50 rounded text-xs text-green-300"
                      title="确认编辑"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <select
                      value={colorMoodOptions.includes(colorPalette.mood) ? colorPalette.mood : (colorPalette.mood ? colorPalette.mood : '自定义')}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value !== '自定义') {
                          const newPalette = { ...colorPalette, mood: value };
                          setColorPalette(newPalette);
                          if (design?.id) {
                            updateDesignMutation.mutate({
                              id: design.id,
                              colorPalette: newPalette.overall || newPalette.primaryColors.length > 0 || newPalette.mood ? newPalette : null,
                            });
                          }
                        }
                      }}
                      className="flex-1 bg-[#0d0820] border border-purple-900/30 rounded-lg px-3 py-1.5 text-white text-sm focus:border-purple-500/50 focus:outline-none"
                    >
                      {colorMoodOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                      {colorPalette.mood && !colorMoodOptions.includes(colorPalette.mood) && (
                        <option value={colorPalette.mood}>{colorPalette.mood} (自定义)</option>
                      )}
                    </select>
                    <button
                      onClick={() => {
                        setIsColorMoodCustom(true);
                        setCustomColorMood(colorPalette.mood && !colorMoodOptions.includes(colorPalette.mood) ? colorPalette.mood : '');
                      }}
                      className="px-2 py-1 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 rounded text-xs text-purple-300"
                      title="输入自定义色彩情绪"
                    >
                      编辑
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          </div>
        </div>
        
        {/* Tab 切换 */}
        <div className="px-6 py-4 border-b border-purple-900/30">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <TabButton tab="characters" icon={User} label="角色" count={characters.length} />
              <TabButton tab="scenes" icon={MapPin} label="场景" count={scenes.length} />
              <TabButton tab="props" icon={Package} label="道具" count={props.length} />
            </div>
            {/* 角色设计助手入口按钮 */}
            <button
              onClick={() => {
                // 获取当前剧本内容
                const scriptContent = selectedScript?.adaptedStory || '';
                const scriptTitle = selectedScript?.title || '未命名剧本';
                
                if (onOpenAIAssistant) {
                  onOpenAIAssistant('designCharacter', scriptContent, scriptTitle);
                } else {
                  setIsCharacterDesignAssistantOpen(true);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 text-white rounded-lg text-sm font-medium hover:from-cyan-500 hover:to-purple-500 transition-all shadow-lg shadow-purple-500/20"
            >
              <Bot className="w-4 h-4" />
              AI 设计角色
            </button>
          </div>
        </div>
        
        {/* 批量生成按钮 + 质量评分 */}
        <div className="px-6 py-3 border-b border-purple-900/30 flex items-center justify-between">
          {isBatchGenerating ? (
            /* 批量生成进度条 */
            <div className="flex items-center gap-3 min-w-[280px]">
              <Loader2 className="w-5 h-5 text-purple-400 animate-spin flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-white">{batchProgress.step || '准备中...'}</span>
                  <span className="text-purple-400">{batchProgress.progress}%</span>
                </div>
                <div className="h-2 bg-[#1a1035] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 ease-out"
                    style={{ width: `${batchProgress.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={handleBatchGenerate}
              disabled={!isDesignValid}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-5 h-5" />
              批量生成{activeTab === 'characters' ? '角色' : activeTab === 'scenes' ? '场景' : '道具'}
            </button>
          )}
          
          {/* 质量评分 */}
          {qualityScore && (
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold">质量评分</span>
                <span className="text-purple-400 font-bold">{qualityScore.overallScore}/10</span>
              </div>
              <div className="flex gap-4 text-gray-400">
                <span>视觉 <span className="text-white">{qualityScore.visualAppeal}</span></span>
                <span>一致性 <span className="text-white">{qualityScore.consistency}</span></span>
                <span>实用性 <span className="text-white">{qualityScore.implementability}</span></span>
                <span>完整度 <span className="text-white">{qualityScore.detailCompleteness}</span></span>
              </div>
            </div>
          )}
        </div>
        
        {/* 内容区域 */}
        <div ref={contentScrollRef} className="flex-1 overflow-y-auto p-6">
          {scriptsLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          ) : !selectedScriptId ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-[#1a1035] flex items-center justify-center mx-auto mb-4">
                  <User className="w-10 h-10 text-purple-400" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">请选择剧本</h3>
                <p className="text-sm text-gray-500">先在"剧本改编"中生成剧本，然后在这里设计角色和场景</p>
              </div>
            </div>
          ) : !isDesignValid ? (
            <div className="h-full flex items-center justify-center">
              {isRegenerating ? (
                /* 生成进度动画 - 与ScriptPanel一致 */
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-[#1a1035] flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">{generationProgress.step || '准备中...'}</h3>
                  <p className="text-sm text-gray-500">AI 正在为您生成设计方案</p>
                  <div className="mt-4 w-48 mx-auto">
                    <div className="h-2 bg-[#1a1035] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 ease-out"
                        style={{ width: `${generationProgress.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-purple-400 mt-1">{generationProgress.progress}%</p>
                  </div>
                </div>
              ) : (
                /* 空状态 */
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-[#1a1035] flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-10 h-10 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">暂无设计数据</h3>
                  <p className="text-sm text-gray-500 mb-4">点击"重新生成"按钮生成设计方案</p>
                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    生成设计方案
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 角色列表 */}
              {activeTab === 'characters' && (
                characters.length === 0 ? (
                  <div className="text-gray-500 text-center py-12">暂无角色设计</div>
                ) : (
                  characters.map(char => <CharacterCard key={char.id} character={char} />)
                )
              )}
              
              {/* 场景列表 */}
              {activeTab === 'scenes' && (
                scenes.length === 0 ? (
                  <div className="text-gray-500 text-center py-12">暂无场景设计</div>
                ) : (
                  scenes.map(scene => <SceneCard key={scene.id} scene={scene} />)
                )
              )}
              
              {/* 道具列表 */}
              {activeTab === 'props' && (
                props.length === 0 ? (
                  <div className="text-gray-500 text-center py-12">暂无道具设计</div>
                ) : (
                  props.map(prop => <PropCard key={prop.id} prop={prop} />)
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* 资产库弹窗 */}
      <AssetLibrary
        isOpen={assetLibraryOpen}
        onClose={() => {
          setAssetLibraryOpen(false);
          setAssetLibraryTarget(null);
        }}
        onSelectAsset={handleAssetSelect}
        selectionMode={true}
      />

      {/* 风格参考图资产库弹窗 */}
      <AssetLibrary
        isOpen={styleAssetLibraryOpen}
        onClose={() => setStyleAssetLibraryOpen(false)}
        onSelectAsset={handleStyleAssetSelect}
        selectionMode={true}
      />

      {/* 风格预览板资产库弹窗 */}
      <AssetLibrary
        isOpen={stylePreviewAssetLibraryOpen}
        onClose={() => setStylePreviewAssetLibraryOpen(false)}
        onSelectAsset={handleStylePreviewAssetSelect}
        selectionMode={true}
      />

      {/* 角色设计助手弹窗 */}
      <CharacterDesignAssistant
        isOpen={isCharacterDesignAssistantOpen}
        onClose={() => setIsCharacterDesignAssistantOpen(false)}
        onLoadToCanvas={onLoadToCanvas}
      />
    </div>
  );
}
