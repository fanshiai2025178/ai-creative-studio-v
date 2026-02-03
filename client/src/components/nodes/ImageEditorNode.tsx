import { useState, useCallback, useRef, useEffect, memo } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  Wand2,
  Settings,
  Upload,
  X,
  RotateCcw,
  Link2,
  Plus,
  Brain,
  Zap,
  Target,
  ImageIcon,
  Pencil,
  Type,
  Circle,
  Square,
  ArrowRight,
  Undo2,
  Trash2,
  Eraser,
  ZoomIn,
  Download,
  FolderUp,
  Maximize2,
} from "lucide-react";
import { ImageActions } from "@/components/ImageActions";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCanvasContext } from "@/pages/Canvas";

type RedrawMode = "smart" | "precise";
type AnnotationTool = "brush" | "symbol" | "text" | "eraser";
type SymbolType = "arrow" | "circle" | "rectangle";
type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "custom";

// 参考图类型
interface ReferenceImage {
  id: number;
  url: string | null;
  thumbnailUrl?: string;
  source: "canvas" | "upload";
  label: string;
}

// 标注元素类型
interface AnnotationElement {
  id: string;
  type: "brush" | "symbol" | "text";
  path?: { x: number; y: number }[];
  symbolType?: SymbolType;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  color: string;
}

function ImageEditorNode({ id, data }: NodeProps) {
  const [sourceImage, setSourceImage] = useState<string | null>(data.sourceImage as string || null);
  const [hasUserUpload, setHasUserUpload] = useState(false);
  const [isLoadingFromSource, setIsLoadingFromSource] = useState(false);
  // 锁定原图：一旦加载了原图就不再自动更新，防止生成后原图被替换
  const [isSourceLocked, setIsSourceLocked] = useState(false);
  const { getEdges, getNode, setNodes, setEdges } = useReactFlow();
  
  // 获取 Canvas Context
  const canvasContext = useCanvasContext();

  // 6张参考图状态
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([
    { id: 1, url: null, source: "canvas", label: "图片1" },
    { id: 2, url: null, source: "canvas", label: "图片2" },
    { id: 3, url: null, source: "canvas", label: "图片3" },
    { id: 4, url: null, source: "upload", label: "图片4" },
    { id: 5, url: null, source: "upload", label: "图片5" },
    { id: 6, url: null, source: "upload", label: "图片6" },
  ]);

  // 重绘模式
  const [redrawMode, setRedrawMode] = useState<RedrawMode>("smart");
  
  // AI优化提示词
  const [optimizedPrompt, setOptimizedPrompt] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showOptimizedPrompt, setShowOptimizedPrompt] = useState(false);

  // 图片尺寸
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");

  // 标注工具状态
  const [activeTool, setActiveTool] = useState<AnnotationTool>("brush");
  const [activeSymbol, setActiveSymbol] = useState<SymbolType>("arrow");
  const [brushColor, setBrushColor] = useState("#ff00ff");
  const [brushSize, setBrushSize] = useState(4);
  const [annotations, setAnnotations] = useState<AnnotationElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // 自动加载前一个连接节点的图片（持续监听）
  // 注意：一旦原图被加载（无论是用户上传还是从连接加载），就不再自动更新
  useEffect(() => {
    const checkSourceConnection = () => {
      // 如果已经有原图，不再自动更新（防止生成后原图被替换）
      if (sourceImage) {
        return;
      }
      
      // 只有在没有原图时才从连接加载
      const edges = getEdges();
      const incomingEdge = edges.find(edge => edge.target === id && edge.targetHandle === "source-in");
      
      if (incomingEdge) {
        const sourceNode = getNode(incomingEdge.source);
        if (sourceNode?.data) {
          const nodeData = sourceNode.data as Record<string, unknown>;
          const imageUrl = nodeData.outputImage || nodeData.imageUrl || nodeData.generatedImage || nodeData.image;
          
          if (imageUrl && typeof imageUrl === 'string') {
            console.log('[ImageEditor] Loading source image from connected node:', incomingEdge.source);
            setIsLoadingFromSource(true);
            const img = new Image();
            img.onload = () => {
              setSourceImage(imageUrl);
              setIsLoadingFromSource(false);
            };
            img.onerror = () => {
              setIsLoadingFromSource(false);
              toast.error("加载前节点图片失败");
            };
            img.src = imageUrl;
          }
        }
      }
    };

    checkSourceConnection();
    const interval = setInterval(checkSourceConnection, 500);
    return () => clearInterval(interval);
  }, [id, getEdges, getNode, sourceImage]);

  // 自动加载参考图连接点的图片
  useEffect(() => {
    const checkConnections = () => {
      const edges = getEdges();
      const newReferenceImages = [...referenceImages];
      let hasChanges = false;

      for (let i = 1; i <= 3; i++) {
        const refEdge = edges.find(edge => edge.target === id && edge.targetHandle === `ref-${i}`);
        
        if (refEdge) {
          const sourceNode = getNode(refEdge.source);
          if (sourceNode?.data) {
            const nodeData = sourceNode.data as Record<string, unknown>;
            const imageUrl = nodeData.outputImage || nodeData.imageUrl || nodeData.generatedImage || nodeData.image;
            
            if (imageUrl && typeof imageUrl === 'string' && newReferenceImages[i - 1].url !== imageUrl) {
              newReferenceImages[i - 1] = {
                ...newReferenceImages[i - 1],
                url: imageUrl,
              };
              hasChanges = true;
            }
          }
        } else if (newReferenceImages[i - 1].url && newReferenceImages[i - 1].source === "canvas") {
          newReferenceImages[i - 1] = {
            ...newReferenceImages[i - 1],
            url: null,
          };
          hasChanges = true;
        }
      }

      if (hasChanges) {
        setReferenceImages(newReferenceImages);
      }
    };

    checkConnections();
    const interval = setInterval(checkConnections, 500);
    return () => clearInterval(interval);
  }, [id, getEdges, getNode]);

  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(data.outputImage as string || null);
  const [showSettings, setShowSettings] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refFileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);
  
  const generateMutation = trpc.ai.imageToImage.useMutation();
  const optimizePromptMutation = trpc.ai.optimizeImageEditPrompt.useMutation();
  const advancedRedrawMutation = trpc.ai.advancedRedraw.useMutation();
  const analyzeImageMutation = trpc.ai.analyzeImage.useMutation();

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSourceImage(event.target?.result as string);
        setResultImage(null);
        setHasUserUpload(true);
        setIsSourceLocked(true); // 用户上传后锁定原图
        setAnnotations([]);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // 处理参考图上传
  const handleRefImageUpload = useCallback((index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newReferenceImages = [...referenceImages];
        newReferenceImages[index] = {
          ...newReferenceImages[index],
          url: event.target?.result as string,
        };
        setReferenceImages(newReferenceImages);
      };
      reader.readAsDataURL(file);
    }
  }, [referenceImages]);

  // 清除参考图
  const clearRefImage = useCallback((index: number) => {
    const newReferenceImages = [...referenceImages];
    newReferenceImages[index] = {
      ...newReferenceImages[index],
      url: null,
    };
    setReferenceImages(newReferenceImages);
    
    // 如果是连接线的图片（前3个），断开连接线
    if (index < 3) {
      const handleId = `ref-${index + 1}`;
      setEdges((edges) => edges.filter(edge => !(edge.target === id && edge.targetHandle === handleId)));
    }
  }, [referenceImages, id, setEdges]);

  // 获取有效参考图数量
  const validRefCount = referenceImages.filter(ref => ref.url).length;

  // AI优化提示词
  const handleOptimizePrompt = useCallback(async () => {
    if (!sourceImage || !prompt.trim()) {
      toast.error("请先上传原图并输入描述");
      return;
    }

    setIsOptimizing(true);
    try {
      const validRefObjects = referenceImages.filter(ref => ref.url).map(ref => ({
        id: ref.id,
        url: ref.url as string,
        label: ref.label,
      }));
      
      const result = await optimizePromptMutation.mutateAsync({
        originalImageUrl: sourceImage,
        referenceImages: validRefObjects,
        userDescription: prompt,
        redrawMode,
      });

      if (result.optimizedPrompt) {
        setOptimizedPrompt(result.optimizedPrompt);
        setShowOptimizedPrompt(true);
        toast.success("提示词优化完成");
      }
    } catch (error) {
      toast.error("优化失败，请重试");
    } finally {
      setIsOptimizing(false);
    }
  }, [sourceImage, prompt, referenceImages, redrawMode, optimizePromptMutation]);

  // 重置
  const handleReset = useCallback(() => {
    setResultImage(null);
    setAnnotations([]);
  }, []);

  // 绘制标注到 Canvas
  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !sourceImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 获取容器实际尺寸
    const rect = container.getBoundingClientRect();
    
    // 设置 canvas 尺寸匹配容器
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制所有标注
    annotations.forEach(annotation => {
      ctx.strokeStyle = annotation.color;
      ctx.fillStyle = annotation.color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (annotation.type === 'brush' && annotation.path) {
        ctx.beginPath();
        annotation.path.forEach((point, index) => {
          if (index === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.stroke();
      } else if (annotation.type === 'symbol') {
        const x = annotation.x || 0;
        const y = annotation.y || 0;
        const w = annotation.width || 40;
        const h = annotation.height || 40;
        ctx.lineWidth = 3;

        if (annotation.symbolType === 'arrow') {
          const endX = x + w;
          const endY = y;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(endX, endY);
          ctx.stroke();
          const headLen = 10;
          const angle = Math.atan2(endY - y, endX - x);
          ctx.beginPath();
          ctx.moveTo(endX, endY);
          ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(endX, endY);
          ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        } else if (annotation.symbolType === 'circle') {
          ctx.beginPath();
          ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
          ctx.stroke();
        } else if (annotation.symbolType === 'rectangle') {
          ctx.strokeRect(x, y, w, h);
        }
      } else if (annotation.type === 'text' && annotation.text) {
        ctx.font = `${annotation.fontSize || 14}px sans-serif`;
        ctx.fillText(annotation.text, annotation.x || 0, annotation.y || 0);
      }
    });

    // 绘制当前正在绘制的路径
    if (isDrawing && currentPath.length > 0) {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      currentPath.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      });
      ctx.stroke();
    }
  }, [annotations, currentPath, isDrawing, brushColor, brushSize, sourceImage]);

  // 监听标注变化重绘
  useEffect(() => {
    drawAnnotations();
  }, [drawAnnotations]);

  // 窗口大小变化时重绘
  useEffect(() => {
    const handleResize = () => {
      drawAnnotations();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawAnnotations]);

  // 使用原生事件监听器处理画布绘制，绕过 React Flow 的事件拦截
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceImage) return;

    let drawing = false;
    let path: { x: number; y: number }[] = [];

    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      canvas.setPointerCapture(e.pointerId);

      const pos = getPos(e);

      if (activeTool === 'brush') {
        drawing = true;
        path = [pos];
        setIsDrawing(true);
        setCurrentPath([pos]);
      } else if (activeTool === 'symbol') {
        const newAnnotation: AnnotationElement = {
          id: `symbol-${Date.now()}`,
          type: 'symbol',
          symbolType: activeSymbol,
          x: pos.x - 20,
          y: pos.y - 20,
          width: 40,
          height: 40,
          color: brushColor,
        };
        setAnnotations(prev => [...prev, newAnnotation]);
      } else if (activeTool === 'text') {
        setTextPosition(pos);
        setShowTextInput(true);
        setTextInput("");
        // 聚焦到输入框
        setTimeout(() => {
          textInputRef.current?.focus();
        }, 50);
      } else if (activeTool === 'eraser') {
        // 橡皮擦工具：检测点击位置是否在某个标注元素上
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        
        // 遍历所有标注，检查是否点击到
        setAnnotations(prev => {
          const hitIndex = prev.findIndex(annotation => {
            if (annotation.type === 'brush' && annotation.path) {
              // 检查是否点击到画笔路径附近
              const hitRadius = 10; // 点击容差范围
              return annotation.path.some(point => {
                const dx = pos.x - point.x;
                const dy = pos.y - point.y;
                return Math.sqrt(dx * dx + dy * dy) < hitRadius;
              });
            } else if (annotation.type === 'symbol') {
              // 检查是否点击到符号区域
              const x = annotation.x || 0;
              const y = annotation.y || 0;
              const w = annotation.width || 40;
              const h = annotation.height || 40;
              return pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h;
            } else if (annotation.type === 'text') {
              // 检查是否点击到文字区域（粗略估算）
              const x = annotation.x || 0;
              const y = annotation.y || 0;
              const textWidth = (annotation.text?.length || 0) * (annotation.fontSize || 14) * 0.6;
              const textHeight = (annotation.fontSize || 14) * 1.2;
              return pos.x >= x && pos.x <= x + textWidth && pos.y >= y - textHeight && pos.y <= y;
            }
            return false;
          });
          
          if (hitIndex !== -1) {
            // 找到了要删除的元素
            const newAnnotations = [...prev];
            newAnnotations.splice(hitIndex, 1);
            return newAnnotations;
          }
          return prev;
        });
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!drawing || activeTool !== 'brush') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const pos = getPos(e);
      path.push(pos);
      setCurrentPath([...path]);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!drawing) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      canvas.releasePointerCapture(e.pointerId);

      if (path.length > 1) {
        const newAnnotation: AnnotationElement = {
          id: `brush-${Date.now()}`,
          type: 'brush',
          path: [...path],
          color: brushColor,
        };
        setAnnotations(prev => [...prev, newAnnotation]);
      }

      drawing = false;
      path = [];
      setIsDrawing(false);
      setCurrentPath([]);
    };

    // 使用 capture 阶段捕获事件，确保在 React Flow 之前处理
    canvas.addEventListener('pointerdown', handlePointerDown, { capture: true });
    canvas.addEventListener('pointermove', handlePointerMove, { capture: true });
    canvas.addEventListener('pointerup', handlePointerUp, { capture: true });
    canvas.addEventListener('pointerleave', handlePointerUp, { capture: true });

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      canvas.removeEventListener('pointermove', handlePointerMove, { capture: true });
      canvas.removeEventListener('pointerup', handlePointerUp, { capture: true });
      canvas.removeEventListener('pointerleave', handlePointerUp, { capture: true });
    };
  }, [sourceImage, activeTool, activeSymbol, brushColor]);

  // 获取鼠标在画布上的位置
  const getCanvasPosition = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  // 画笔开始
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!sourceImage) return;
    e.preventDefault();
    e.stopPropagation();
    
    const pos = getCanvasPosition(e);

    if (activeTool === 'brush') {
      setIsDrawing(true);
      setCurrentPath([pos]);
    } else if (activeTool === 'symbol') {
      const newAnnotation: AnnotationElement = {
        id: `symbol-${Date.now()}`,
        type: 'symbol',
        symbolType: activeSymbol,
        x: pos.x - 20,
        y: pos.y - 20,
        width: 40,
        height: 40,
        color: brushColor,
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    } else if (activeTool === 'text') {
      setTextPosition(pos);
      setShowTextInput(true);
      setTextInput("");
    }
  }, [sourceImage, activeTool, activeSymbol, brushColor, getCanvasPosition]);

  // 画笔移动
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing || activeTool !== 'brush') return;
    e.preventDefault();
    e.stopPropagation();
    
    const pos = getCanvasPosition(e);
    setCurrentPath(prev => [...prev, pos]);
    
    // 实时绘制
    drawAnnotations();
  }, [isDrawing, activeTool, getCanvasPosition, drawAnnotations]);

  // 画笔结束
  const handleCanvasMouseUp = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    if (!isDrawing || activeTool !== 'brush') return;
    
    if (currentPath.length > 1) {
      const newAnnotation: AnnotationElement = {
        id: `brush-${Date.now()}`,
        type: 'brush',
        path: [...currentPath],
        color: brushColor,
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    }
    
    setIsDrawing(false);
    setCurrentPath([]);
  }, [isDrawing, activeTool, currentPath, brushColor]);

  // 添加文字标注
  const handleAddText = useCallback(() => {
    if (!textInput.trim() || !textPosition) {
      setShowTextInput(false);
      setTextPosition(null);
      setTextInput("");
      return;
    }
    
    const newAnnotation: AnnotationElement = {
      id: `text-${Date.now()}`,
      type: 'text',
      text: textInput,
      x: textPosition.x,
      y: textPosition.y,
      fontSize: 14,
      color: brushColor,
    };
    setAnnotations(prev => [...prev, newAnnotation]);
    setTextInput("");
    setShowTextInput(false);
    setTextPosition(null);
  }, [textInput, textPosition, brushColor]);

  // 取消文字输入
  const handleCancelText = useCallback(() => {
    setShowTextInput(false);
    setTextPosition(null);
    setTextInput("");
  }, []);

  // 撤销最后一个标注
  const handleUndo = useCallback(() => {
    setAnnotations(prev => prev.slice(0, -1));
  }, []);

  // 清除所有标注
  const handleClearAnnotations = useCallback(() => {
    setAnnotations([]);
  }, []);

  // 处理重绘 - 支持多线程并行生成，生成结果作为独立节点
  const handleProcess = useCallback(async () => {
    if (!sourceImage) {
      toast.error("请先上传原图");
      return;
    }

    // === 立即快照当前所有参数，确保后续修改不影响本次生成 ===
    const snapshotSourceImage = sourceImage;
    const snapshotPrompt = prompt;
    const snapshotOptimizedPrompt = optimizedPrompt;
    const snapshotShowOptimizedPrompt = showOptimizedPrompt;
    const snapshotReferenceImages = referenceImages.map(ref => ({ ...ref }));
    const snapshotAnnotations = annotations.map(a => ({ ...a, path: a.path ? [...a.path] : undefined }));
    const snapshotRedrawMode = redrawMode;
    const snapshotAspectRatio = aspectRatio;
    const snapshotBrushSize = brushSize;
    
    // 调试日志：检查参考图状态
    console.log('[ImageEditor] handleProcess called');
    console.log('[ImageEditor] referenceImages:', JSON.stringify(referenceImages.map(r => ({ id: r.id, url: r.url ? r.url.substring(0, 50) + '...' : null, label: r.label }))));
    console.log('[ImageEditor] snapshotReferenceImages:', JSON.stringify(snapshotReferenceImages.map(r => ({ id: r.id, url: r.url ? r.url.substring(0, 50) + '...' : null, label: r.label }))));
    
    // 立即创建加载中的结果节点
    const resultNodeId = canvasContext.addLoadingImageNodeWithRatio(
      id,
      "重绘结果",
      snapshotAspectRatio,
      450,
      0
    );
    
    // === 立即显示短暂的处理状态，然后恢复按钮 ===
    setIsProcessing(true);
    // 短暂延迟后恢复按钮可点击状态，让用户知道任务已提交
    setTimeout(() => setIsProcessing(false), 500);
    
    // === 异步执行生成任务，不阻塞 UI ===
    (async () => {
      try {
        const validRefs = snapshotReferenceImages.filter(ref => ref.url).map(ref => ref.url as string);
        console.log('[ImageEditor] validRefs count:', validRefs.length);
        console.log('[ImageEditor] validRefs:', validRefs.map(url => url.substring(0, 50) + '...'));
        
        // 确定使用的提示词：优先使用优化后的提示词，其次是用户输入，最后使用默认提示词
        let editPrompt = "";
        if (snapshotShowOptimizedPrompt && snapshotOptimizedPrompt) {
          editPrompt = snapshotOptimizedPrompt;
        } else if (snapshotPrompt.trim()) {
          editPrompt = snapshotPrompt;
        } else {
          // 用户没有输入提示词，使用默认提示词
          editPrompt = validRefs.length > 0 
            ? "Based on the reference images, intelligently edit and enhance the original image while maintaining consistency in style, lighting, and composition."
            : "Enhance and improve the original image while maintaining its core elements and style.";
        }

        // 获取带标注的图片
        // 辅助函数：将 blob URL 转换为 base64
        const convertBlobToBase64 = async (url: string): Promise<string> => {
          if (!url.startsWith('blob:')) {
            return url; // 如果不是 blob URL，直接返回
          }
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (error) {
            console.error('[ImageEditor] Failed to convert blob to base64:', error);
            return url; // 转换失败时返回原URL
          }
        };

        console.log('[ImageEditor] Processing annotations, count:', snapshotAnnotations.length);
        // 先将原图转换为 base64（如果是 blob URL）
        let annotatedImage = await convertBlobToBase64(snapshotSourceImage);
        if (snapshotAnnotations.length > 0) {
          const tempCanvas = document.createElement('canvas');
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((resolve) => {
              img.onload = () => {
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                tempCtx.drawImage(img, 0, 0);
                
                const container = containerRef.current;
                if (container) {
                  const rect = container.getBoundingClientRect();
                  const scaleX = img.width / rect.width;
                  const scaleY = img.height / rect.height;
                  
                  snapshotAnnotations.forEach(annotation => {
                    tempCtx.strokeStyle = annotation.color;
                    tempCtx.fillStyle = annotation.color;
                    tempCtx.lineWidth = snapshotBrushSize * Math.max(scaleX, scaleY);
                    tempCtx.lineCap = 'round';
                    tempCtx.lineJoin = 'round';

                    if (annotation.type === 'brush' && annotation.path) {
                      tempCtx.beginPath();
                      annotation.path.forEach((point, index) => {
                        const x = point.x * scaleX;
                        const y = point.y * scaleY;
                        if (index === 0) {
                          tempCtx.moveTo(x, y);
                        } else {
                          tempCtx.lineTo(x, y);
                        }
                      });
                      tempCtx.stroke();
                    } else if (annotation.type === 'symbol') {
                      const x = (annotation.x || 0) * scaleX;
                      const y = (annotation.y || 0) * scaleY;
                      const w = (annotation.width || 40) * scaleX;
                      const h = (annotation.height || 40) * scaleY;
                      tempCtx.lineWidth = 3 * Math.max(scaleX, scaleY);

                      if (annotation.symbolType === 'arrow') {
                        const endX = x + w;
                        const endY = y;
                        tempCtx.beginPath();
                        tempCtx.moveTo(x, y);
                        tempCtx.lineTo(endX, endY);
                        tempCtx.stroke();
                        const headLen = 10 * Math.max(scaleX, scaleY);
                        const angle = Math.atan2(endY - y, endX - x);
                        tempCtx.beginPath();
                        tempCtx.moveTo(endX, endY);
                        tempCtx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
                        tempCtx.moveTo(endX, endY);
                        tempCtx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
                        tempCtx.stroke();
                      } else if (annotation.symbolType === 'circle') {
                        tempCtx.beginPath();
                        tempCtx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
                        tempCtx.stroke();
                      } else if (annotation.symbolType === 'rectangle') {
                        tempCtx.strokeRect(x, y, w, h);
                      }
                    } else if (annotation.type === 'text' && annotation.text) {
                      const fontSize = (annotation.fontSize || 14) * Math.max(scaleX, scaleY);
                      tempCtx.font = `${fontSize}px sans-serif`;
                      tempCtx.fillText(annotation.text, (annotation.x || 0) * scaleX, (annotation.y || 0) * scaleY);
                    }
                  });
                }
                
                annotatedImage = tempCanvas.toDataURL('image/png');
                resolve();
              };
              img.src = snapshotSourceImage;
            });
          }
        }

        let generatedImageUrl = "";

        console.log('[ImageEditor] About to call API, validRefs.length:', validRefs.length);
        console.log('[ImageEditor] annotatedImage length:', annotatedImage.length);
        console.log('[ImageEditor] editPrompt:', editPrompt);

        // 根据是否有参考图选择不同的 API
        if (validRefs.length > 0) {
          // 转换所有 blob URL 为 base64
          const validRefObjects = await Promise.all(
            snapshotReferenceImages.filter(ref => ref.url).map(async ref => ({
              id: ref.id,
              url: await convertBlobToBase64(ref.url as string),
              label: ref.label,
            }))
          );
          
          console.log('[ImageEditor] Calling advancedRedraw API with', validRefObjects.length, 'reference images');
          console.log('[ImageEditor] validRefObjects:', JSON.stringify(validRefObjects.map(r => ({ id: r.id, url: r.url.substring(0, 50) + '...', label: r.label }))));
          
          const result = await advancedRedrawMutation.mutateAsync({
            originalImageUrl: annotatedImage,
            referenceImages: validRefObjects,
            prompt: editPrompt,
            redrawMode: snapshotRedrawMode,
            nodeId: id,
          });
          
          console.log('[ImageEditor] advancedRedraw API returned:', JSON.stringify(result));

          if (result.imageUrl) {
            generatedImageUrl = result.imageUrl;
            console.log('[ImageEditor] Setting resultImage to:', result.imageUrl);
            setResultImage(result.imageUrl);
          } else {
            console.log('[ImageEditor] No imageUrl in result');
          }
        } else {
          const result = await generateMutation.mutateAsync({
            prompt: editPrompt,
            imageUrl: annotatedImage,
            strength: 0.7,
            nodeId: id,
          });

          if (result.imageUrl) {
            generatedImageUrl = result.imageUrl;
            setResultImage(result.imageUrl);
          }
        }

        // AI 识别生成的图片内容并更新结果节点
        if (generatedImageUrl) {
          try {
            const analysisResult = await analyzeImageMutation.mutateAsync({
              imageUrl: generatedImageUrl,
            });
            
            canvasContext.updateImageNodeWithDescription(
              resultNodeId,
              generatedImageUrl,
              analysisResult.description || "AI 正在分析图片内容..."
            );
          } catch {
            canvasContext.updateImageNodeWithDescription(
              resultNodeId,
              generatedImageUrl,
              "图片生成成功"
            );
          }
          
          // 注意：不再更新图片编辑器节点自己的 outputImage，
          // 因为这可能导致循环引用问题（如果有节点连接到图片编辑器的输出，
          // 并且那个节点又连接到图片编辑器的原图输入）。
          // 生成的结果已经显示在独立的结果节点中。
          
          toast.success("重绘完成");
        }
      } catch (error) {
        console.error("图片生成失败:", error);
        canvasContext.setImageNodeError(resultNodeId, "生成失败，请重试");
        toast.error("处理失败，请重试");
      }
    })();
  }, [sourceImage, prompt, referenceImages, redrawMode, optimizedPrompt, showOptimizedPrompt, annotations, brushSize, id, aspectRatio, generateMutation, advancedRedrawMutation, analyzeImageMutation, canvasContext, setNodes]);

  // 颜色选项
  const colorOptions = ["#ff00ff", "#00ffff", "#ffff00", "#ff0000", "#00ff00", "#ffffff"];

  // 尺寸选项
  const aspectRatioOptions = [
    { value: "1:1", label: "1:1" },
    { value: "16:9", label: "16:9" },
    { value: "9:16", label: "9:16" },
    { value: "4:3", label: "4:3" },
    { value: "3:4", label: "3:4" },
  ];

  return (
    <div className="bg-card/95 backdrop-blur border border-border rounded-lg shadow-lg min-w-[420px] max-w-[480px]" style={{ pointerEvents: 'auto' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-gradient-to-r from-accent/10 to-pink-500/10">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">图片编辑器</span>
          {validRefCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400">
              {validRefCount}张参考图
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex">
        {/* 左侧：画布连接的参考图 */}
        <div className="w-16 p-2 border-r border-border/30 flex flex-col gap-1.5 bg-background/20">
          <div className="text-[9px] text-muted-foreground text-center mb-0.5">连接</div>
          {referenceImages.slice(0, 3).map((ref, index) => (
            <div key={ref.id} className="relative group">
              <div className="w-11 h-11 border border-cyan-500/50 rounded-md overflow-hidden bg-background/30 flex items-center justify-center mx-auto">
                {ref.url ? (
                  <div className="relative w-full h-full">
                    <img
                      src={ref.url}
                      alt={ref.label}
                      className="w-full h-full object-cover"
                    />
                    {/* 清除按钮 */}
                    <button
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearRefImage(index);
                      }}
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <Link2 className="w-3.5 h-3.5 text-cyan-500/50" />
                )}
              </div>
              <div className="text-[8px] text-cyan-500 text-center mt-0.5">{ref.label}</div>
            </div>
          ))}
        </div>

        {/* 中间：主内容区域 */}
        <div className="flex-1 p-3 space-y-3">
          {/* 原图上传区域 + 标注画布 */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              原图
            </label>
            <div
              ref={containerRef}
              className="relative border-2 border-dashed border-border/50 rounded-lg hover:border-accent/50 transition-colors overflow-hidden nodrag nowheel"
              style={{ minHeight: "128px" }}
            >
              {isLoadingFromSource ? (
                <div className="py-4 text-center">
                  <Loader2 className="w-5 h-5 mx-auto text-accent mb-1 animate-spin" />
                  <p className="text-[10px] text-muted-foreground">加载中...</p>
                </div>
              ) : sourceImage ? (
                <div className="relative">
                  <img
                    src={resultImage || sourceImage}
                    alt="Edit"
                    className="w-full h-32 object-contain bg-black/20 pointer-events-none"
                  />
                  {/* 标注画布 - 使用 Pointer 事件确保可以接收鼠标事件 */}
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full z-50 nodrag nowheel nopan"
                    style={{ 
                      cursor: activeTool === 'text' ? 'text' : activeTool === 'eraser' ? 'pointer' : 'crosshair',
                      touchAction: 'none',
                      pointerEvents: 'auto',
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      // 捕获指针以确保后续事件不会丢失
                      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
                      handleCanvasMouseDown(e as unknown as React.MouseEvent);
                    }}
                    onPointerMove={(e) => {
                      e.stopPropagation();
                      handleCanvasMouseMove(e as unknown as React.MouseEvent);
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
                      handleCanvasMouseUp(e as unknown as React.MouseEvent);
                    }}
                    onPointerLeave={() => {
                      if (isDrawing) {
                        handleCanvasMouseUp();
                      }
                    }}
                  />
                  {/* 文字输入框 - 添加 nodrag nowheel 类防止拖动 */}
                  {showTextInput && textPosition && (
                    <div
                      className="absolute z-[100] bg-background/95 border border-border rounded-md p-2 shadow-lg nodrag nowheel nopan"
                      style={{ left: Math.min(textPosition.x, 150), top: textPosition.y }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <input
                        ref={textInputRef}
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddText();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelText();
                          }
                        }}
                        placeholder="输入文字..."
                        className="text-xs bg-transparent border border-border/50 rounded px-2 py-1 outline-none focus:border-accent w-28 nodrag"
                        autoFocus
                      />
                      <div className="flex gap-1 mt-1.5">
                        <Button 
                          size="sm" 
                          className="h-6 text-[10px] flex-1" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddText();
                          }}
                        >
                          确定
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="h-6 text-[10px] flex-1" 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelText();
                          }}
                        >
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="absolute top-1 right-1 flex gap-1 z-20">
                    {resultImage && (
                      <>
                        <div onClick={(e) => e.stopPropagation()}>
                          <ImageActions
                            imageUrl={resultImage}
                            imageName={`编辑结果_${id}`}
                            variant="icons"
                            size="sm"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 bg-background/80"
                          onClick={handleReset}
                          title="重置"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  className="py-4 text-center cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                  <p className="text-[10px] text-muted-foreground">点击上传或连接图片</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* 标注工具栏 */}
          {sourceImage && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 p-1.5 bg-background/30 rounded-md">
                <Button
                  variant={activeTool === 'brush' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setActiveTool('brush')}
                >
                  <Pencil className="w-3 h-3 mr-1" />
                  <span className="text-[10px]">画笔</span>
                </Button>
                <Button
                  variant={activeTool === 'symbol' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setActiveTool('symbol')}
                >
                  <Circle className="w-3 h-3 mr-1" />
                  <span className="text-[10px]">符号</span>
                </Button>
                <Button
                  variant={activeTool === 'text' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setActiveTool('text')}
                >
                  <Type className="w-3 h-3 mr-1" />
                  <span className="text-[10px]">文字</span>
                </Button>
                <Button
                  variant={activeTool === 'eraser' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setActiveTool('eraser')}
                >
                  <Eraser className="w-3 h-3 mr-1" />
                  <span className="text-[10px]">橡皮擦</span>
                </Button>

                <div className="flex-1" />

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleUndo}
                  disabled={annotations.length === 0}
                >
                  <Undo2 className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleClearAnnotations}
                  disabled={annotations.length === 0}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>

              {/* 符号选择 */}
              {activeTool === 'symbol' && (
                <div className="flex items-center gap-1 px-1.5">
                  <span className="text-[9px] text-muted-foreground mr-1">符号:</span>
                  <Button
                    variant={activeSymbol === 'arrow' ? 'default' : 'outline'}
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setActiveSymbol('arrow')}
                  >
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                  <Button
                    variant={activeSymbol === 'circle' ? 'default' : 'outline'}
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setActiveSymbol('circle')}
                  >
                    <Circle className="w-3 h-3" />
                  </Button>
                  <Button
                    variant={activeSymbol === 'rectangle' ? 'default' : 'outline'}
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setActiveSymbol('rectangle')}
                  >
                    <Square className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {/* 颜色选择 */}
              <div className="flex items-center gap-1 px-1.5">
                <span className="text-[9px] text-muted-foreground mr-1">颜色:</span>
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    className={`w-5 h-5 rounded-full border-2 ${brushColor === color ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setBrushColor(color)}
                  />
                ))}
              </div>

              {/* 画笔大小滑块 - 仅在画笔工具激活时显示 */}
              {activeTool === 'brush' && (
                <div className="flex items-center gap-2 px-1.5">
                  <span className="text-[9px] text-muted-foreground whitespace-nowrap">粗细:</span>
                  <div className="flex items-center gap-2 flex-1">
                    <Slider
                      value={[brushSize]}
                      onValueChange={(values) => setBrushSize(values[0])}
                      min={1}
                      max={20}
                      step={1}
                      className="flex-1 nodrag"
                    />
                    <span className="text-[9px] text-muted-foreground w-6 text-right">{brushSize}px</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 重绘模式选择 */}
          <div className="flex items-center justify-between p-1.5 bg-background/30 rounded-md">
            <div className="flex items-center gap-1">
              <Label htmlFor="redraw-mode" className="text-[10px] flex items-center gap-1">
                {redrawMode === "smart" ? (
                  <Brain className="w-3 h-3 text-accent" />
                ) : (
                  <Target className="w-3 h-3 text-pink-500" />
                )}
                {redrawMode === "smart" ? "智能重绘" : "精确重绘"}
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-muted-foreground">精确</span>
              <Switch
                id="redraw-mode"
                checked={redrawMode === "smart"}
                onCheckedChange={(checked) => setRedrawMode(checked ? "smart" : "precise")}
                className="scale-75"
              />
              <span className="text-[9px] text-muted-foreground">智能</span>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground px-1">
            {redrawMode === "smart" 
              ? "智能模式：AI自动识别完整对象（如整件衣服），即使只涂抹部分区域"
              : "精确模式：仅重绘涂抹的区域，不扩展到其他部分"}
          </p>

          <Textarea
            placeholder={`描述你想要的效果，可用"图片1-6"引用参考图...\n例如：把图片1的衣服穿到原图人物身上`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-14 text-xs bg-background/50 border-border/50 resize-none"
          />

          {/* AI优化提示词按钮 + 尺寸选择器 */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOptimizePrompt}
              disabled={isOptimizing || !sourceImage || !prompt.trim()}
              className="flex-1 text-[10px] h-7 border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 hover:border-cyan-500 text-cyan-400"
            >
              {isOptimizing ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  AI分析中...
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3 mr-1 text-yellow-400" />
                  AI优化提示词
                </>
              )}
            </Button>
            
            {/* 尺寸选择 */}
            <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as AspectRatio)}>
              <SelectTrigger className="w-20 h-7 text-[10px] border-pink-500/50 bg-pink-500/10 hover:bg-pink-500/20 hover:border-pink-500 text-pink-400">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspectRatioOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 优化后的提示词显示 */}
          {showOptimizedPrompt && optimizedPrompt && (
            <div className="p-1.5 bg-accent/10 rounded-md border border-accent/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-accent font-medium">AI优化后的提示词</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4"
                  onClick={() => setShowOptimizedPrompt(false)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-[10px] text-foreground/80 whitespace-pre-wrap">{optimizedPrompt}</p>
            </div>
          )}

          {/* Process Button */}
          <Button
            onClick={handleProcess}
            disabled={isProcessing || !sourceImage}
            className="w-full bg-accent hover:bg-accent/80 text-accent-foreground h-8 text-xs"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                处理中...
              </>
            ) : (
              <>
                <Wand2 className="w-3 h-3 mr-1" />
                重绘编辑
                {validRefCount > 0 && ` (${validRefCount}张参考图)`}
              </>
            )}
          </Button>
        </div>

        {/* 右侧：上传的参考图 */}
        <div className="w-16 p-2 border-l border-border/30 flex flex-col gap-1.5 bg-background/20">
          <div className="text-[9px] text-muted-foreground text-center mb-0.5">上传</div>
          {referenceImages.slice(3).map((ref, index) => (
            <div key={ref.id} className="relative group">
              <div
                className="w-11 h-11 border border-dashed border-pink-500/50 rounded-md overflow-hidden bg-background/30 flex items-center justify-center mx-auto cursor-pointer hover:border-pink-500 transition-colors"
                onClick={() => !ref.url && refFileInputRefs.current[index]?.click()}
              >
                {ref.url ? (
                  <div className="relative w-full h-full">
                    <img
                      src={ref.url}
                      alt={ref.label}
                      className="w-full h-full object-cover"
                    />
                    {/* 清除按钮 */}
                    <button
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearRefImage(index + 3);
                      }}
                    >
                      <X className="w-2.5 h-2.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <Plus className="w-3.5 h-3.5 text-pink-500/50" />
                )}
              </div>
              <div className="text-[8px] text-pink-500 text-center mt-0.5">{ref.label}</div>
              <input
                ref={(el) => { refFileInputRefs.current[index] = el; }}
                type="file"
                accept="image/*"
                onChange={(e) => handleRefImageUpload(index + 3, e)}
                className="hidden"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Handles */}
      {/* 原图连接点 - 顶部 */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        style={{ left: "50%" }}
        id="source-in"
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        style={{ top: "106px" }}
        id="ref-1"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        style={{ top: "166px" }}
        id="ref-2"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        style={{ top: "226px" }}
        id="ref-3"
      />

      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        style={{ top: "50%" }}
        id="image-out"
      />
    </div>
  );
}

export default memo(ImageEditorNode);
