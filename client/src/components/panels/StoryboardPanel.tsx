/**
 * 分镜脚本设计面板 V2
 * 按照新设计文档重写：两栏布局（左侧分镜列表25% + 右侧分镜详情75%）
 * 第二阶段：参考图片管理 + 静态图片提示词优化
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  ChevronLeft, Loader2, Film, Clock, Sparkles, Download, X,
  Plus, Image, Copy, RefreshCw, Wand2, Play, Upload, FolderOpen, Send, Trash2, Check
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadToLibraryDialog } from "@/components/UploadToLibraryDialog";

// ============================================================================
// 类型定义
// ============================================================================

interface ReferenceImage {
  id: number;
  name: string;
  imageUrl: string;
  source: 'upload' | 'library';
  libraryId?: number;
}

interface StoryboardShot {
  id: number;
  shotNumber: number;
  title: string | null;
  shotType: string;
  duration: number;
  transition: string;
  sceneDescription: string | null;
  characters: string | null;
  action: string | null;
  dialogue: string | null;
  emotion: string | null;
  characterRefs: ReferenceImage[] | null;
  sceneRefs: ReferenceImage[] | null;
  propRefs: ReferenceImage[] | null;
  aiPrompt: string | null;
  generatedImageUrl: string | null;
  imageSize: string;
  composition: string;
  dynamicPrompt: string | null;
}

interface Script {
  id: number;
  title: string;
  adaptedStory: string | null;
  originalContent?: string | null;
  episodes: unknown;
}

interface StoryboardPanelProps {
  canvasId: number;
  onClose: () => void;
  onSendToCanvas?: (imageUrl: string, name: string) => void;
}

interface AddRefDialogState {
  isOpen: boolean;
  type: 'character' | 'scene' | 'prop';
  selectedImage: string | null;
  selectedName: string;
  customName: string;
}

// ============================================================================
// 常量定义
// ============================================================================

const SHOT_TYPES = ["特写", "近景", "中景", "全景", "远景"];
const TRANSITIONS = ["切入", "淡入", "淡出", "叠化", "划入", "划出"];
const IMAGE_SIZES = ["9:16", "16:9", "1:1", "4:3", "3:4"];
const COMPOSITIONS = ["居中构图", "三分法", "对角线构图", "框架构图", "引导线构图"];

const shotTypeColors: Record<string, string> = {
  "特写": "bg-purple-500",
  "近景": "bg-blue-500",
  "中景": "bg-cyan-500",
  "全景": "bg-green-500",
  "远景": "bg-yellow-500",
};

const refTypeLabels: Record<string, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
};

// 手绘草图画布组件
interface SketchCanvasProps {
  onSketchChange: (dataUrl: string | null) => void;
  sketchDescription: string;
  onDescriptionChange: (desc: string) => void;
  imageSize: string; // 图片尺寸比例
}

// 根据尺寸比例计算画布尺寸
const getCanvasDimensions = (imageSize: string) => {
  const baseWidth = 200; // 缩小基础宽度
  const aspectRatios: Record<string, number> = {
    '9:16': 9 / 16,
    '16:9': 16 / 9,
    '1:1': 1,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
  };
  const ratio = aspectRatios[imageSize] || 16 / 9;
  const height = Math.round(baseWidth / ratio);
  return { width: baseWidth, height };
};

const SketchCanvas = ({ onSketchChange, sketchDescription, onDescriptionChange, imageSize }: SketchCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [brushSize, setBrushSize] = useState(3);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false); // 收纳状态，默认收起
  
  // 计算画布尺寸
  const { width: canvasWidth, height: canvasHeight } = getCanvasDimensions(imageSize);

  // 初始化画布（当尺寸变化时重新初始化）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 设置画布背景为深色
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 尺寸变化时清空草图数据
    onSketchChange(null);
  }, [imageSize, canvasWidth, canvasHeight]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const coords = getCanvasCoords(e);
    lastPosRef.current = coords;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPosRef.current) return;

    const coords = getCanvasCoords(e);
    
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = tool === 'pen' ? '#a855f7' : '#1a1a2e';
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    lastPosRef.current = coords;
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      lastPosRef.current = null;
      // 保存草图数据
      const canvas = canvasRef.current;
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
        onSketchChange(dataUrl);
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onSketchChange(null);
  };

  return (
    <div className="space-y-2">
      {/* 可收纳标题 - 按钮样式 */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-purple-300 flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
          构图草图（可选）
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
        >
          {isExpanded ? (
            <>
              <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6"/>
              </svg>
              收起
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6"/>
              </svg>
              展开
              {sketchDescription && <span className="ml-1 text-green-400">(已绘制)</span>}
            </>
          )}
        </Button>
      </div>
      
      {/* 可收纳内容 */}
      {isExpanded && (
        <div className="space-y-2 pl-5">
          {/* 工具栏 */}
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTool('pen')}
              className={`border-purple-500/30 h-7 px-2 ${tool === 'pen' ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                <path d="M2 2l7.586 7.586"/>
                <circle cx="11" cy="11" r="2"/>
              </svg>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTool('eraser')}
              className={`border-purple-500/30 h-7 px-2 ${tool === 'eraser' ? 'bg-purple-500/30 text-purple-300' : 'text-gray-400'}`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8l10-10c.8-.8 2-.8 2.8 0l7 7c.8.8.8 2 0 2.8L14 22"/>
              </svg>
            </Button>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min="1"
                max="10"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-12 h-1 accent-purple-500"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={clearCanvas}
              className="border-purple-500/30 text-gray-400 hover:text-red-400 h-7 px-2 ml-auto"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
          
          {/* 画布 */}
          <div className="rounded-lg border border-purple-500/30 overflow-hidden bg-[#1a1a2e] inline-block">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="cursor-crosshair touch-none"
              style={{ width: canvasWidth, height: canvasHeight }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
          
          {/* 绘图说明 */}
          <div>
            <Input
              value={sketchDescription}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="描述草图元素含义..."
              className="bg-black/30 border-purple-500/30 text-white text-xs h-8"
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 主组件
// ============================================================================

export default function StoryboardPanel({ canvasId, onClose, onSendToCanvas }: StoryboardPanelProps) {
  // 状态
  const [selectedScriptId, setSelectedScriptId] = useState<number | null>(null);
  const [shots, setShots] = useState<StoryboardShot[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ step: '', progress: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenerationProgress, setImageGenerationProgress] = useState({ step: '', progress: 0 });
  const [isGeneratingDynamicPrompt, setIsGeneratingDynamicPrompt] = useState(false);
  
  // 添加参考图弹窗状态
  const [addRefDialog, setAddRefDialog] = useState<AddRefDialogState>({
    isOpen: false,
    type: 'character',
    selectedImage: null,
    selectedName: '',
    customName: '',
  });
  
  // 保存到资产库弹窗状态
  const [uploadToLibraryDialog, setUploadToLibraryDialog] = useState<{
    isOpen: boolean;
    imageUrl: string;
    defaultName: string;
  }>({
    isOpen: false,
    imageUrl: '',
    defaultName: '',
  });
  
  // 文件上传ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 手绘草图状态
  const [sketchDataUrl, setSketchDataUrl] = useState<string | null>(null);
  const [sketchDescription, setSketchDescription] = useState('');

  // 获取剧本列表
  const { data: scripts, isLoading: isLoadingScripts } = trpc.basicCreation.getScriptsByCanvas.useQuery({ canvasId });
  
  // 获取分镜列表
  const { data: shotsData, refetch: refetchShots } = trpc.storyboardShot.getByScriptId.useQuery(
    { scriptId: selectedScriptId! },
    { enabled: !!selectedScriptId }
  );

  // 根据参考图类型映射到资产库分类
  const getAssetCategory = (type: 'character' | 'scene' | 'prop') => {
    switch (type) {
      case 'character': return 'subject'; // 角色 → 角色库
      case 'scene': return 'scene';       // 场景 → 场景库
      case 'prop': return 'prop';         // 道具 → 道具库
      default: return undefined;
    }
  };

  // 获取用户资产库（根据当前选择的类型过滤）
  const { data: assetLibraryItems } = trpc.assetLibrary.list.useQuery(
    { category: getAssetCategory(addRefDialog.type) as any },
    { enabled: addRefDialog.isOpen } // 只在弹窗打开时查询
  );

  // 生成分镜脚本
  const generateMutation = trpc.storyboardShot.generate.useMutation({
    onSuccess: () => {
      toast.success("分镜脚本生成成功");
      refetchShots();
      setIsGenerating(false);
    },
    onError: (error) => {
      toast.error(`生成失败: ${error.message}`);
      setIsGenerating(false);
    },
  });

  // 更新分镜
  const updateMutation = trpc.storyboardShot.update.useMutation({
    onSuccess: () => {
      toast.success("保存成功");
      refetchShots();
      setIsSaving(false);
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`);
      setIsSaving(false);
    },
  });

  // 静态图片提示词优化（使用完整版API - 自动读取形象设计数据）
  const generatePromptMutation = trpc.storyboardShot.optimizeImagePrompt.useMutation({
    onSuccess: (data: { optimizedPrompt: string }) => {
      if (selectedShotId && data.optimizedPrompt) {
        updateLocalShot(selectedShotId, { aiPrompt: data.optimizedPrompt });
        toast.success("AI提示词优化成功");
      }
      setIsGeneratingPrompt(false);
    },
    onError: (error: { message: string }) => {
      toast.error(`优化失败: ${error.message}`);
      setIsGeneratingPrompt(false);
    },
  });

  // 生成分镜图片（使用完整版API - 自动调用prepareImageGeneration转译参考图编号）
  const generateImageMutation = trpc.storyboardShot.generateStoryboardImage.useMutation({
    onSuccess: (data: { imageUrl: string }) => {
      if (selectedShotId && data.imageUrl) {
        updateLocalShot(selectedShotId, { generatedImageUrl: data.imageUrl });
        toast.success("分镜图片生成成功");
      }
      setIsGeneratingImage(false);
    },
    onError: (error: { message: string }) => {
      toast.error(`图片生成失败: ${error.message}`);
      setIsGeneratingImage(false);
    },
  });

  // 生成动态提示词
  const generateDynamicPromptMutation = trpc.storyboardShot.generateDynamicPrompt.useMutation({
    onSuccess: (data: { dynamicPrompt: string }) => {
      if (selectedShotId && data.dynamicPrompt) {
        updateLocalShot(selectedShotId, { dynamicPrompt: data.dynamicPrompt });
        toast.success("动态提示词生成成功");
      }
      setIsGeneratingDynamicPrompt(false);
    },
    onError: (error: { message: string }) => {
      toast.error(`动态提示词生成失败: ${error.message}`);
      setIsGeneratingDynamicPrompt(false);
    },
  });

  // 同步分镜数据
  useEffect(() => {
    if (shotsData) {
      setShots(shotsData as StoryboardShot[]);
      if (shotsData.length > 0 && !selectedShotId) {
        setSelectedShotId(shotsData[0].id);
      }
    }
  }, [shotsData, selectedShotId]);

  // 获取当前选中的分镜
  const selectedShot = shots.find(s => s.id === selectedShotId);

  // 获取选中的剧本
  const selectedScript = scripts?.find(s => s.id === selectedScriptId);

  // 处理生成分镜脚本
  const handleGenerate = async () => {
    if (!selectedScriptId || !selectedScript) {
      toast.error("请先选择剧本");
      return;
    }
    setIsGenerating(true);
    setGenerationProgress({ step: '正在分析剧本内容...', progress: 10 });
    
    // 模拟进度更新
    const progressSteps = [
      { step: '正在分析剧本内容...', progress: 10 },
      { step: '正在拆分场景和镜头...', progress: 25 },
      { step: '正在生成分镜描述...', progress: 45 },
      { step: '正在优化镜头语言...', progress: 65 },
      { step: '正在整理分镜结构...', progress: 85 },
    ];
    
    let currentStep = 0;
    const progressInterval = setInterval(() => {
      if (currentStep < progressSteps.length) {
        setGenerationProgress(progressSteps[currentStep]);
        currentStep++;
      }
    }, 2000);
    
    generateMutation.mutate(
      { scriptId: selectedScriptId },
      {
        onSettled: () => {
          clearInterval(progressInterval);
          setGenerationProgress({ step: '完成！', progress: 100 });
          setTimeout(() => {
            setGenerationProgress({ step: '', progress: 0 });
          }, 500);
        }
      }
    );
  };

  // 处理保存分镜
  const handleSaveShot = async (shot: StoryboardShot) => {
    setIsSaving(true);
    updateMutation.mutate({
      id: shot.id,
      data: {
        shotTitle: shot.title || undefined,
        shotType: shot.shotType as "特写" | "近景" | "中景" | "全景" | "远景" | undefined,
        duration: shot.duration || undefined,
        transition: shot.transition as "切入" | "淡入" | "淡出" | "叠化" | "划入" | "划出" | undefined,
        sceneDescription: shot.sceneDescription || undefined,
        characters: shot.characters || undefined,
        action: shot.action || undefined,
        dialogue: shot.dialogue || undefined,
        emotion: shot.emotion || undefined,
        characterRefs: shot.characterRefs ? JSON.stringify(shot.characterRefs) : undefined,
        sceneRefs: shot.sceneRefs ? JSON.stringify(shot.sceneRefs) : undefined,
        propRefs: shot.propRefs ? JSON.stringify(shot.propRefs) : undefined,
        aiPrompt: shot.aiPrompt || undefined,
        imageSize: shot.imageSize as "9:16" | "16:9" | "1:1" | "4:3" | "3:4" | undefined,
        composition: shot.composition as "居中构图" | "三分法" | "对角线构图" | "框架构图" | "引导线构图" | undefined,
        dynamicPrompt: shot.dynamicPrompt || undefined,
      },
    });
  };

  // 更新本地分镜数据
  const updateLocalShot = (shotId: number, updates: Partial<StoryboardShot>) => {
    setShots(prev => prev.map(s => s.id === shotId ? { ...s, ...updates } : s));
  };

  // 下载图片
  const handleDownload = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("下载成功");
    } catch {
      toast.error("下载失败");
    }
  };

  // 解析画面内容提取名称标签
  const extractNames = useCallback((shot: StoryboardShot, type: 'character' | 'scene' | 'prop'): string[] => {
    const names: string[] = [];
    
    if (type === 'character' && shot.characters) {
      // 按逗号、顿号分割角色
      const chars = shot.characters.split(/[,，、]/);
      chars.forEach(c => {
        const name = c.trim();
        if (name) names.push(name);
      });
    } else if (type === 'scene' && shot.sceneDescription) {
      // 提取场景名（简单处理：取第一个名词短语）
      const match = shot.sceneDescription.match(/^([^,，。·]+)/);
      if (match) names.push(match[1].trim());
    } else if (type === 'prop' && shot.action) {
      // 从动作描述中提取道具名（简单处理：提取名词）
      const propWords = shot.action.match(/[\u4e00-\u9fa5]{2,4}(?=的|上|下|中|里|外|旁|边|处|前|后)/g);
      if (propWords) {
        propWords.forEach(w => {
          if (!names.includes(w)) names.push(w);
        });
      }
    }
    
    return names.slice(0, 6); // 最多返回6个推荐名称
  }, []);

  // 获取已使用的名称
  const getUsedNames = useCallback((shot: StoryboardShot, type: 'character' | 'scene' | 'prop'): string[] => {
    const refs = type === 'character' ? shot.characterRefs 
      : type === 'scene' ? shot.sceneRefs 
      : shot.propRefs;
    return refs?.map(r => r.name) || [];
  }, []);

  // 打开添加参考图弹窗
  const openAddRefDialog = (type: 'character' | 'scene' | 'prop') => {
    setAddRefDialog({
      isOpen: true,
      type,
      selectedImage: null,
      selectedName: '',
      customName: '',
    });
  };

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      toast.error("请上传图片文件");
      return;
    }

    // 检查文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过10MB");
      return;
    }

    // 转换为base64
    const reader = new FileReader();
    reader.onload = () => {
      setAddRefDialog(prev => ({
        ...prev,
        selectedImage: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  // 从资产库选择图片
  const handleSelectFromLibrary = (asset: { id: number; imageUrl: string; name: string }) => {
    setAddRefDialog(prev => ({
      ...prev,
      selectedImage: asset.imageUrl,
      selectedName: asset.name || '',
    }));
  };

  // 确认添加参考图
  const handleConfirmAddRef = () => {
    if (!selectedShot || !addRefDialog.selectedImage) {
      toast.error("请先选择图片");
      return;
    }

    const name = addRefDialog.selectedName || addRefDialog.customName;
    if (!name) {
      toast.error("请选择或输入名称");
      return;
    }

    const { type } = addRefDialog;
    const refsKey = type === 'character' ? 'characterRefs' 
      : type === 'scene' ? 'sceneRefs' 
      : 'propRefs';
    
    const currentRefs = selectedShot[refsKey] || [];
    
    // 检查是否已达上限
    if (currentRefs.length >= 4) {
      toast.error(`${refTypeLabels[type]}参考图最多4张`);
      return;
    }

    // 添加新的参考图
    const newRef: ReferenceImage = {
      id: Date.now(),
      name,
      imageUrl: addRefDialog.selectedImage,
      source: addRefDialog.selectedImage.startsWith('data:') ? 'upload' : 'library',
    };

    updateLocalShot(selectedShot.id, {
      [refsKey]: [...currentRefs, newRef],
    });

    // 关闭弹窗
    setAddRefDialog({
      isOpen: false,
      type: 'character',
      selectedImage: null,
      selectedName: '',
      customName: '',
    });

    toast.success(`已添加${refTypeLabels[type]}参考图`);
  };

  // 删除参考图
  const handleRemoveRef = (type: 'character' | 'scene' | 'prop', refId: number) => {
    if (!selectedShot) return;

    const refsKey = type === 'character' ? 'characterRefs' 
      : type === 'scene' ? 'sceneRefs' 
      : 'propRefs';
    
    const currentRefs = selectedShot[refsKey] || [];
    updateLocalShot(selectedShot.id, {
      [refsKey]: currentRefs.filter(r => r.id !== refId),
    });

    toast.success("已删除参考图");
  };

  // 生成AI提示词（使用完整版API - 自动读取形象设计数据）
  const handleGenerateAiPrompt = () => {
    if (!selectedShot || !selectedScriptId) {
      toast.error("请先选择剧本和分镜");
      return;
    }

    setIsGeneratingPrompt(true);
    generatePromptMutation.mutate({
      scriptId: selectedScriptId,
      shotId: selectedShot.id,
      sketchDataUrl: sketchDataUrl || undefined,
      sketchDescription: sketchDescription || undefined,
    });
  };

  // 复制提示词
  const handleCopyPrompt = () => {
    if (!selectedShot?.aiPrompt) return;
    navigator.clipboard.writeText(selectedShot.aiPrompt);
    toast.success("已复制到剪贴板");
  };

  // 生成分镜图片
  const handleGenerateImage = () => {
    if (!selectedShot) return;

    if (!selectedShot.aiPrompt) {
      toast.error("请先生成AI提示词");
      return;
    }

    setIsGeneratingImage(true);
    setImageGenerationProgress({ step: '准备生成参数...', progress: 5 });
    
    // 模拟进度
    const progressSteps = [
      { step: '分析提示词内容...', progress: 15 },
      { step: '加载参考图片...', progress: 25 },
      { step: 'AI正在绘制图像...', progress: 45 },
      { step: '优化图像细节...', progress: 65 },
      { step: '处理输出结果...', progress: 85 },
    ];
    
    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < progressSteps.length) {
        setImageGenerationProgress(progressSteps[stepIndex]);
        stepIndex++;
      }
    }, 2000);
    
    // generateStoryboardImage只需要shotId，它会自动调用prepareImageGeneration转译参考图编号
    generateImageMutation.mutate({
      shotId: selectedShot.id,
    }, {
      onSettled: () => {
        clearInterval(progressInterval);
        setImageGenerationProgress({ step: '', progress: 0 });
      }
    });
  };

  // 生成动态提示词
  const handleGenerateDynamicPrompt = () => {
    if (!selectedShot) return;

    if (!selectedShot.generatedImageUrl) {
      toast.error("请先生成分镜图片");
      return;
    }

    setIsGeneratingDynamicPrompt(true);
    generateDynamicPromptMutation.mutate({
      shotId: selectedShot.id,
      sceneDescription: selectedShot.sceneDescription || '',
      action: selectedShot.action || '',
      emotion: selectedShot.emotion || '',
      duration: selectedShot.duration,
    });
  };

  // 复制动态提示词
  const handleCopyDynamicPrompt = () => {
    if (!selectedShot?.dynamicPrompt) return;
    navigator.clipboard.writeText(selectedShot.dynamicPrompt);
    toast.success("已复制动态提示词到剪贴板");
  };

  // 渲染参考图片卡片
  // 获取卡槽说明标签
  const getSlotLabel = (type: 'character' | 'scene' | 'prop', index: number): string => {
    const labels = {
      character: ['角色图1', '角色图2', '角色图3', '角色图4'],
      scene: ['场景图1', '场景图2', '场景图3', '场景图4'],
      prop: ['道具图1', '道具图2', '道具图3', '道具图4'],
    };
    return labels[type][index] || '';
  };

  const renderRefCard = (
    ref: ReferenceImage | null, 
    index: number, 
    type: 'character' | 'scene' | 'prop',
    onClick: () => void
  ) => {
    const slotLabel = getSlotLabel(type, index);
    
    if (ref) {
      return (
        <div key={ref.id} className="flex flex-col">
          <div className="relative group">
            <div className="aspect-square bg-black/50 rounded-lg overflow-hidden border border-purple-500/30">
              <img
                src={ref.imageUrl}
                alt={ref.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 rounded-b-lg">
              <p className="text-[10px] text-purple-300 font-medium">{slotLabel}</p>
              <p className="text-[10px] text-white truncate">{ref.name}</p>
            </div>
            <button
              onClick={() => handleRemoveRef(type, ref.id)}
              className="absolute top-1 right-1 p-1 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[9px] text-gray-500 text-center mt-1">{slotLabel}</p>
        </div>
      );
    }

    return (
      <div key={`empty-${index}`} className="flex flex-col">
        <button
          onClick={onClick}
          className="aspect-square bg-black/50 rounded-lg border border-dashed border-purple-500/30 flex items-center justify-center hover:border-purple-500/50 hover:bg-purple-500/10 transition-colors"
        >
          <Plus className="w-5 h-5 text-gray-500" />
        </button>
        <p className="text-[9px] text-gray-500 text-center mt-1">{slotLabel}</p>
      </div>
    );
  };

  // 渲染参考图片区域
  const renderRefSection = (type: 'character' | 'scene' | 'prop', refs: ReferenceImage[] | null) => {
    const slots = [0, 1, 2, 3];
    const currentRefs = refs || [];

    return (
      <div>
        <Label className="text-xs text-gray-400 mb-2 block">
          {refTypeLabels[type]}参考（最多4张）
        </Label>
        <div className="grid grid-cols-4 gap-2">
          {slots.map((i) => {
            const ref = currentRefs[i] || null;
            return renderRefCard(ref, i, type, () => openAddRefDialog(type));
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex bg-[#0a0618]/95 backdrop-blur-sm">
      {/* 面板容器 - 固定宽度与其他面板一致 */}
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
                value={selectedScriptId?.toString() || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    setSelectedScriptId(parseInt(value));
                    setSelectedShotId(null);
                    setShots([]);
                  }
                }}
                className="w-full bg-[#1a1035] border border-purple-900/30 rounded-lg px-3 py-2 text-white"
                disabled={isLoadingScripts}
              >
                <option value="">请选择剧本</option>
                {scripts?.map((script) => (
                  <option key={script.id} value={script.id.toString()}>
                    {script.title}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleGenerate}
                  disabled={!selectedScriptId || isGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-pink-600 to-purple-600 text-white text-sm rounded-lg hover:from-pink-500 hover:to-purple-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  生成分镜脚本
                </button>
              </div>
            </div>
            
            {/* 右侧：剧本简介 */}
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-1 block">剧本简介</label>
              <div className="bg-[#1a1035] rounded-lg p-3 h-24 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-transparent">
                <p className="text-sm text-gray-300 whitespace-pre-wrap">
                  {selectedScript ? ((selectedScript as Script).adaptedStory?.slice(0, 300) || '暂无简介') : '请先选择剧本...'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 内容区域：左右两栏 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧面板：分镜列表 (25%) */}
          <div className="w-1/4 border-r border-purple-500/30 bg-black/20">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                {shots.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">暂无分镜</p>
                    <p className="text-xs mt-1">选择剧本后生成分镜脚本</p>
                  </div>
                ) : (
                  shots.map((shot) => (
                    <button
                      key={shot.id}
                      onClick={() => setSelectedShotId(shot.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedShotId === shot.id
                          ? "bg-purple-500/20 border-purple-500/50"
                          : "bg-black/30 border-purple-500/20 hover:border-purple-500/40"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${selectedShotId === shot.id ? "bg-purple-400" : "bg-gray-500"}`} />
                        <span className="text-white font-medium text-sm">
                          #{shot.shotNumber} {shot.title || "未命名"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 ml-4">
                        <span className={`px-1.5 py-0.5 rounded text-white text-[10px] ${shotTypeColors[shot.shotType] || "bg-gray-500"}`}>
                          {shot.shotType}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {shot.duration}s
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* 右侧面板：分镜详情 (75%) */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedShot ? (
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  {/* 模块1：基本信息 */}
                  <section className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
                    <h4 className="text-sm font-medium text-purple-300 mb-4">基本信息</h4>
                    <div className="grid grid-cols-5 gap-4">
                      <div>
                        <Label className="text-xs text-gray-400">场景</Label>
                        <p className="text-white mt-1">第{selectedShot.shotNumber}场</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">镜头</Label>
                        <p className="text-white mt-1">第{selectedShot.shotNumber}个</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">景别</Label>
                        <Select
                          value={selectedShot.shotType}
                          onValueChange={(value) => updateLocalShot(selectedShot.id, { shotType: value })}
                        >
                          <SelectTrigger className="bg-black/30 border-purple-500/30 text-white mt-1 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-purple-500/30">
                            {SHOT_TYPES.map((type) => (
                              <SelectItem key={type} value={type} className="text-white">{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">时长</Label>
                        <p className="text-white mt-1">{selectedShot.duration}s</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">转场</Label>
                        <Select
                          value={selectedShot.transition}
                          onValueChange={(value) => updateLocalShot(selectedShot.id, { transition: value })}
                        >
                          <SelectTrigger className="bg-black/30 border-purple-500/30 text-white mt-1 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-purple-500/30">
                            {TRANSITIONS.map((t) => (
                              <SelectItem key={t} value={t} className="text-white">{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </section>

                  {/* 模块2：画面内容 */}
                  <section className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
                    <h4 className="text-sm font-medium text-purple-300 mb-4">画面内容（可编辑）</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-gray-400">场景</Label>
                        <Input
                          value={selectedShot.sceneDescription || ""}
                          onChange={(e) => updateLocalShot(selectedShot.id, { sceneDescription: e.target.value })}
                          placeholder="场景环境描述..."
                          className="bg-black/30 border-purple-500/30 text-white mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">角色</Label>
                        <Input
                          value={selectedShot.characters || ""}
                          onChange={(e) => updateLocalShot(selectedShot.id, { characters: e.target.value })}
                          placeholder="出场角色，用逗号分隔..."
                          className="bg-black/30 border-purple-500/30 text-white mt-1"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs text-gray-400">动作</Label>
                        <Textarea
                          value={selectedShot.action || ""}
                          onChange={(e) => updateLocalShot(selectedShot.id, { action: e.target.value })}
                          placeholder="角色动作描述..."
                          className="bg-black/30 border-purple-500/30 text-white mt-1 min-h-[60px]"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">对白</Label>
                        <Input
                          value={selectedShot.dialogue || ""}
                          onChange={(e) => updateLocalShot(selectedShot.id, { dialogue: e.target.value })}
                          placeholder="对白或音效描述..."
                          className="bg-black/30 border-purple-500/30 text-white mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">情绪</Label>
                        <Input
                          value={selectedShot.emotion || ""}
                          onChange={(e) => updateLocalShot(selectedShot.id, { emotion: e.target.value })}
                          placeholder="画面情绪氛围..."
                          className="bg-black/30 border-purple-500/30 text-white mt-1"
                        />
                      </div>
                    </div>
                  </section>

                  {/* 模块3：图片预览区域 */}
                  <section className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
                    <h4 className="text-sm font-medium text-purple-300 mb-4 flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      图片预览
                    </h4>
                    {selectedShot.generatedImageUrl ? (
                      <div className="space-y-3">
                        <div className="relative aspect-video bg-black/50 rounded-lg overflow-hidden">
                          <img
                            src={selectedShot.generatedImageUrl}
                            alt={`分镜 ${selectedShot.shotNumber}`}
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(selectedShot.generatedImageUrl!, `分镜${selectedShot.shotNumber}.png`)}
                            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                          >
                            <Download className="w-4 h-4 mr-1" />
                            下载
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setUploadToLibraryDialog({
                                isOpen: true,
                                imageUrl: selectedShot.generatedImageUrl!,
                                defaultName: `分镜${selectedShot.shotNumber}_${selectedShot.title || '未命名'}`,
                              });
                            }}
                            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                          >
                            <FolderOpen className="w-4 h-4 mr-1" />
                            资产库
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (onSendToCanvas) {
                                onSendToCanvas(
                                  selectedShot.generatedImageUrl!,
                                  `分镜${selectedShot.shotNumber}_${selectedShot.title || '未命名'}`
                                );
                                toast.success(`已发送「分镜${selectedShot.shotNumber}」到画布`);
                              } else {
                                toast.info("请在画布页面中打开分镜面板以使用此功能");
                              }
                            }}
                            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                          >
                            <Send className="w-4 h-4 mr-1" />
                            画布
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="aspect-video bg-black/50 rounded-lg flex items-center justify-center">
                        <div className="text-center text-gray-500">
                          <Image className="w-12 h-12 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">暂无图片</p>
                          <p className="text-xs mt-1">请先生成AI提示词，然后生成分镜图片</p>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* 模块4：参考图片 */}
                  <section className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
                    <h4 className="text-sm font-medium text-purple-300 mb-4">参考图片</h4>
                    <div className="grid grid-cols-3 gap-6">
                      {renderRefSection('character', selectedShot.characterRefs)}
                      {renderRefSection('scene', selectedShot.sceneRefs)}
                      {renderRefSection('prop', selectedShot.propRefs)}
                    </div>
                  </section>

                  {/* 模块5：生图设置 */}
                  <section className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
                    <h4 className="text-sm font-medium text-purple-300 mb-4 flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      生图设置
                    </h4>
                    
                    {/* 尺寸选择 */}
                    <div className="mb-4">
                      <Label className="text-xs text-gray-400">尺寸</Label>
                      <Select
                        value={selectedShot.imageSize}
                        onValueChange={(value) => updateLocalShot(selectedShot.id, { imageSize: value })}
                      >
                        <SelectTrigger className="w-[100px] bg-black/30 border-purple-500/30 text-white mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-purple-500/30">
                          {IMAGE_SIZES.map((size) => (
                            <SelectItem key={size} value={size} className="text-white">{size}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* 手绘草图区域（可收纳） */}
                    <div className="mb-4">
                      <SketchCanvas
                        onSketchChange={setSketchDataUrl}
                        sketchDescription={sketchDescription}
                        onDescriptionChange={setSketchDescription}
                        imageSize={selectedShot.imageSize}
                      />
                    </div>
                    
                    {/* 静态图片提示词优化 - 移动到生图设置内部 */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-purple-300 flex items-center gap-2">
                          <Wand2 className="w-4 h-4" />
                          静态图片提示词
                        </h4>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={handleGenerateAiPrompt}
                            disabled={isGeneratingPrompt}
                            className="bg-orange-500 hover:bg-orange-400 text-white font-medium"
                          >
                            {isGeneratingPrompt ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                生成中...
                              </>
                            ) : selectedShot.aiPrompt ? (
                              <>
                                <RefreshCw className="w-4 h-4 mr-1" />
                                提示词重新生成
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4 mr-1" />
                                提示词智能生成
                              </>
                            )}
                          </Button>
                          {selectedShot.aiPrompt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleCopyPrompt}
                              className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                            >
                              <Copy className="w-4 h-4 mr-1" />
                              复制
                            </Button>
                          )}
                        </div>
                      </div>
                      <Textarea
                        value={selectedShot.aiPrompt || ""}
                        onChange={(e) => updateLocalShot(selectedShot.id, { aiPrompt: e.target.value })}
                        placeholder="AI优化后的提示词将显示在这里，生成后可手动编辑..."
                        className="bg-black/30 border-purple-500/30 text-white h-32 max-h-32 overflow-y-auto resize-none text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        提示：AI会根据画面内容和参考图片生成优化的提示词，使用"角色图#1"、"场景图#1"等格式引用参考图
                      </p>
                    </div>
                    
                    {isGeneratingImage ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-3">
                          <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                          <span className="text-sm text-purple-300">{imageGenerationProgress.step || '生成中...'}</span>
                        </div>
                        <div className="w-full bg-black/50 rounded-full h-2 overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500"
                            style={{ width: `${imageGenerationProgress.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 text-center">{imageGenerationProgress.progress}%</p>
                      </div>
                    ) : (
                      <Button
                        onClick={handleGenerateImage}
                        disabled={!selectedShot.aiPrompt}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                      >
                        <Wand2 className="w-4 h-4 mr-2" />
                        生成分镜图片
                      </Button>
                    )}
                    {!selectedShot.aiPrompt && !isGeneratingImage && (
                      <p className="text-xs text-yellow-500 mt-2 text-center">
                        提示：请先生成AI提示词
                      </p>
                    )}
                  </section>

                  {/* 模块7：动态图片提示词优化 */}
                  <section className="bg-black/30 rounded-xl p-4 border border-purple-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-sm font-medium text-purple-300 flex items-center gap-2">
                        <Play className="w-4 h-4" />
                        动态图片提示词优化
                      </h4>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateDynamicPrompt}
                          disabled={isGeneratingDynamicPrompt || !selectedShot.generatedImageUrl}
                          className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                        >
                          {isGeneratingDynamicPrompt ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              生成中...
                            </>
                          ) : selectedShot.dynamicPrompt ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1" />
                              重新生成
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-1" />
                              生成
                            </>
                          )}
                        </Button>
                        {selectedShot.dynamicPrompt && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyDynamicPrompt}
                            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                          >
                            <Copy className="w-4 h-4 mr-1" />
                            复制
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea
                      value={selectedShot.dynamicPrompt || ""}
                      onChange={(e) => updateLocalShot(selectedShot.id, { dynamicPrompt: e.target.value })}
                      placeholder="用于图生视频的动态提示词，生成后可手动编辑..."
                      className="bg-black/30 border-purple-500/30 text-white min-h-[100px]"
                    />
                    {!selectedShot.generatedImageUrl && (
                      <p className="text-xs text-yellow-500 mt-2">
                        提示：请先生成分镜图片才能生成动态提示词
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      动态提示词用于图生视频工具（如Runway、Pika、可灵等），描述镜头运动和动态效果
                    </p>
                  </section>

                  {/* 保存按钮 */}
                  <div className="flex justify-end">
                    <Button
                      onClick={() => handleSaveShot(selectedShot)}
                      disabled={isSaving}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 mr-2" />
                          保存当前分镜
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            ) : isGenerating ? (
              /* 生成进度动画 - 与剧本改编面板一致 */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-[#1a1035] flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">{generationProgress.step || '准备中...'}</h3>
                  <p className="text-sm text-gray-500">AI 智能体正在为您生成分镜脚本</p>
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
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <Film className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg">选择一个分镜查看详情</p>
                  <p className="text-sm mt-2">或者选择剧本后生成分镜脚本</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 添加参考图弹窗 */}
      <Dialog open={addRefDialog.isOpen} onOpenChange={(open) => !open && setAddRefDialog(prev => ({ ...prev, isOpen: false }))}>
        <DialogContent className="bg-slate-900 border-purple-500/30 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-purple-300">
              添加{refTypeLabels[addRefDialog.type]}参考图
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="upload" className="mt-4">
            <TabsList className="bg-black/30 border border-purple-500/30">
              <TabsTrigger value="upload" className="data-[state=active]:bg-purple-500/30">
                <Upload className="w-4 h-4 mr-2" />
                本地上传
              </TabsTrigger>
              <TabsTrigger value="library" className="data-[state=active]:bg-purple-500/30">
                <FolderOpen className="w-4 h-4 mr-2" />
                资产库
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="mt-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-purple-500/30 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/10 transition-colors"
              >
                {addRefDialog.selectedImage ? (
                  <div className="space-y-4">
                    <img
                      src={addRefDialog.selectedImage}
                      alt="预览"
                      className="max-h-48 mx-auto rounded-lg"
                    />
                    <p className="text-sm text-gray-400">点击重新选择</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-4 text-gray-500" />
                    <p className="text-gray-400">点击或拖拽上传图片</p>
                    <p className="text-xs text-gray-500 mt-2">支持 JPG、PNG、WEBP，最大 10MB</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </TabsContent>

            <TabsContent value="library" className="mt-4">
              {/* 分类说明 */}
              <div className="mb-3 flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  addRefDialog.type === 'character' ? 'bg-cyan-500/20 text-cyan-400' :
                  addRefDialog.type === 'scene' ? 'bg-green-500/20 text-green-400' :
                  'bg-orange-500/20 text-orange-400'
                }`}>
                  {addRefDialog.type === 'character' ? '角色库' :
                   addRefDialog.type === 'scene' ? '场景库' : '道具库'}
                </span>
                <span className="text-xs text-gray-500">
                  已筛选对应分类的资产
                </span>
              </div>
              <ScrollArea className="h-56">
                <div className="grid grid-cols-4 gap-3">
                  {assetLibraryItems?.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => handleSelectFromLibrary({ id: asset.id, imageUrl: asset.imageUrl, name: asset.name || '' })}
                      className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-colors bg-gray-900/80 ${
                        addRefDialog.selectedImage === asset.imageUrl
                          ? "border-purple-500"
                          : "border-transparent hover:border-purple-500/50"
                      }`}
                    >
                      <img
                        src={asset.imageUrl}
                        alt={asset.name || ''}
                        className="w-full h-full object-contain"
                      />
                      {addRefDialog.selectedImage === asset.imageUrl && (
                        <div className="absolute inset-0 bg-purple-500/30 flex items-center justify-center">
                          <Check className="w-8 h-8 text-white" />
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                        <p className="text-[10px] text-white truncate">{asset.name}</p>
                      </div>
                    </button>
                  ))}
                  {(!assetLibraryItems || assetLibraryItems.length === 0) && (
                    <div className="col-span-4 text-center text-gray-500 py-8">
                      <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>资产库为空</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* 名称选择 */}
          {selectedShot && (
            <div className="mt-4">
              <Label className="text-sm text-gray-400 mb-2 block">
                选择{refTypeLabels[addRefDialog.type]}名称
              </Label>
              <div className="flex flex-wrap gap-2">
                {extractNames(selectedShot, addRefDialog.type).map((name) => {
                  const isUsed = getUsedNames(selectedShot, addRefDialog.type).includes(name);
                  return (
                    <button
                      key={name}
                      onClick={() => setAddRefDialog(prev => ({ ...prev, selectedName: name, customName: '' }))}
                      disabled={isUsed}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        isUsed
                          ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                          : addRefDialog.selectedName === name
                          ? "bg-purple-500 text-white"
                          : "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                      }`}
                    >
                      {name}
                      {isUsed && <Check className="w-3 h-3 inline ml-1" />}
                    </button>
                  );
                })}
                <div className="flex items-center gap-2">
                  <Input
                    value={addRefDialog.customName}
                    onChange={(e) => setAddRefDialog(prev => ({ ...prev, customName: e.target.value, selectedName: '' }))}
                    placeholder="+自定义名称"
                    className="w-32 h-8 bg-black/30 border-purple-500/30 text-white text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 确认按钮 */}
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setAddRefDialog(prev => ({ ...prev, isOpen: false }))}
              className="border-purple-500/30 text-purple-300"
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmAddRef}
              disabled={!addRefDialog.selectedImage || (!addRefDialog.selectedName && !addRefDialog.customName)}
              className="bg-gradient-to-r from-purple-600 to-pink-600"
            >
              确认添加
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 保存到资产库弹窗 */}
      <UploadToLibraryDialog
        isOpen={uploadToLibraryDialog.isOpen}
        onClose={() => setUploadToLibraryDialog(prev => ({ ...prev, isOpen: false }))}
        imageUrl={uploadToLibraryDialog.imageUrl}
        defaultName={uploadToLibraryDialog.defaultName}
        onSuccess={() => {
          toast.success("已保存到资产库");
        }}
      />
    </div>
  );
}
