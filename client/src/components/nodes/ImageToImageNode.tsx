import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Layers, Sparkles, Upload, X, Wand2, Link, Image as ImageIcon, Eye, RefreshCw, Copy, Check } from "lucide-react";
import { ImageActions } from "@/components/ImageActions";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCanvasContext } from "@/pages/Canvas";



const aspectRatios = [
  { id: "1:1", label: "1:1", width: 1024, height: 1024 },
  { id: "16:9", label: "16:9", width: 1344, height: 768 },
  { id: "9:16", label: "9:16", width: 768, height: 1344 },
  { id: "4:3", label: "4:3", width: 1152, height: 896 },
  { id: "3:4", label: "3:4", width: 896, height: 1152 },
  { id: "21:9", label: "21:9", width: 1536, height: 640 },
];

function ImageToImageNode({ id, data }: NodeProps) {
  const [prompt, setPrompt] = useState(data.prompt as string || "");
  const [recognizedContent, setRecognizedContent] = useState(data.recognizedContent as string || "");
  const [model, setModel] = useState(data.model as string || "stability");
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio as string || "9:16");
  const [strength, setStrength] = useState(data.strength as number || 0.7);
  const [inputImage, setInputImage] = useState<string | null>(data.inputImage as string || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(data.outputImage as string || null);
  const [connectedPromptText, setConnectedPromptText] = useState<string>("");
  const [connectedImageUrl, setConnectedImageUrl] = useState<string>("");
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { setNodes } = useReactFlow();
  
  // 获取 Canvas Context
  let canvasContext: ReturnType<typeof useCanvasContext> | null = null;
  try {
    canvasContext = useCanvasContext();
  } catch {
    // Context not available
  }

  const generateMutation = trpc.ai.imageToImage.useMutation();
  const optimizeMutation = trpc.ai.optimizePrompt.useMutation();
  const recognizeMutation = trpc.ai.recognizeImageContent.useMutation();

  const selectedRatio = aspectRatios.find(r => r.id === aspectRatio) || aspectRatios[0];

  // 监听连接的提示词和图片节点
  useEffect(() => {
    if (canvasContext) {
      const connectedPrompts = canvasContext.getConnectedPrompts(id);
      if (connectedPrompts.length > 0) {
        setConnectedPromptText(connectedPrompts.join(", "));
      } else {
        setConnectedPromptText("");
      }

      const connectedImages = canvasContext.getConnectedImages(id);
      if (connectedImages.length > 0) {
        setConnectedImageUrl(connectedImages[0]);
      } else {
        setConnectedImageUrl("");
      }
    }
  }, [id, canvasContext?.nodes, canvasContext?.edges]);

  // 更新节点数据
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              prompt,
              recognizedContent,
              inputImage,
              outputImage: generatedImage,
            },
          };
        }
        return node;
      })
    );
  }, [prompt, recognizedContent, inputImage, generatedImage, id, setNodes]);

  // 显示的图片（优先使用连接的图片）
  const displayImage = connectedImageUrl || inputImage;

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setInputImage(result);
        setRecognizedContent(""); // 清除之前的识别结果
        
        // 获取图片尺寸
        const img = new Image();
        img.onload = () => {
          setImageDimensions({ width: img.width, height: img.height });
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // 将 blob URL 转换为 data URL
  const convertBlobToDataUrl = async (blobUrl: string): Promise<string> => {
    if (!blobUrl.startsWith('blob:')) {
      return blobUrl; // 不是 blob URL，直接返回
    }
    
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Failed to convert blob URL:', error);
      throw new Error('无法处理图片，请重新上传');
    }
  };

  // AI识别图片内容
  const handleRecognize = useCallback(async () => {
    const imageToRecognize = connectedImageUrl || inputImage;
    if (!imageToRecognize) {
      toast.error("请先上传图片");
      return;
    }

    setIsRecognizing(true);
    try {
      // 如果是 blob URL，先转换为 data URL
      const imageUrl = await convertBlobToDataUrl(imageToRecognize);
      const result = await recognizeMutation.mutateAsync({ imageUrl });
      setRecognizedContent(result.description);
      toast.success("图片内容识别完成");
    } catch (error) {
      toast.error("识别失败，请重试");
    } finally {
      setIsRecognizing(false);
    }
  }, [inputImage, connectedImageUrl, recognizeMutation]);

  // AI优化提示词（结合识别内容和用户描述）
  const handleOptimize = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("请先输入你想要的效果描述");
      return;
    }

    setIsOptimizing(true);
    try {
      // 构建优化请求，包含识别内容和用户描述
      const contextPrompt = recognizedContent 
        ? `原图内容：${recognizedContent}\n用户想要的效果：${prompt}`
        : prompt;
      
      const result = await optimizeMutation.mutateAsync({ 
        prompt: contextPrompt,
        style: "图生图变换，需要保留原图特征的同时实现用户想要的效果",
        mode: "img2img"
      });
      setPrompt(result.optimized);
      toast.success("提示词已优化");
    } catch (error) {
      toast.error("优化失败，请重试");
    } finally {
      setIsOptimizing(false);
    }
  }, [prompt, recognizedContent, optimizeMutation]);

  const handleGenerate = useCallback(async () => {
    // 使用连接的图片或上传的图片
    const imageToUse = connectedImageUrl || inputImage;
    if (!imageToUse) {
      toast.error("请上传图片或连接图片节点");
      return;
    }

    // 合并连接的提示词和本节点的提示词
    const combinedPrompt = connectedPromptText 
      ? (prompt.trim() ? `${connectedPromptText}, ${prompt}` : connectedPromptText)
      : prompt;
    
    if (!combinedPrompt.trim()) {
      toast.error("请输入你想要的效果描述");
      return;
    }

    setIsGenerating(true);
    
    // 立即创建加载中的图片节点
    let loadingNodeId: string | null = null;
    if (canvasContext?.addLoadingImageNode) {
      loadingNodeId = canvasContext.addLoadingImageNode(id, "图生图结果");
    }
    
    try {
      // 如果是 blob URL，先转换为 data URL
      const imageUrl = await convertBlobToDataUrl(imageToUse);
      const result = await generateMutation.mutateAsync({
        prompt: combinedPrompt,
        imageUrl,
        strength,
        model,
        nodeId: id,
        width: selectedRatio.width,
        height: selectedRatio.height,
      });

      if (result.imageUrl) {
        setGeneratedImage(result.imageUrl);
        toast.success("图片生成成功");
        
        // 更新加载中的节点为完成状态
        if (loadingNodeId && canvasContext?.updateImageNode) {
          canvasContext.updateImageNode(loadingNodeId, result.imageUrl);
        }
      }
    } catch (error) {
      toast.error("生成失败，请重试");
      // 设置节点错误状态
      if (loadingNodeId && canvasContext?.setImageNodeError) {
        canvasContext.setImageNodeError(loadingNodeId, "生成失败");
      }
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, connectedPromptText, model, strength, inputImage, connectedImageUrl, id, selectedRatio, generateMutation, canvasContext]);

  // 计算图片显示尺寸（自适应）
  const getImageDisplayStyle = useCallback(() => {
    if (!imageDimensions) return { width: '100%', height: '160px' };
    
    const maxWidth = 380; // 节点内最大宽度
    const maxHeight = 280; // 最大高度
    
    const aspectRatio = imageDimensions.width / imageDimensions.height;
    
    let displayWidth = maxWidth;
    let displayHeight = displayWidth / aspectRatio;
    
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * aspectRatio;
    }
    
    return {
      width: `${displayWidth}px`,
      height: `${displayHeight}px`,
    };
  }, [imageDimensions]);

  // 当连接图片改变时获取尺寸
  useEffect(() => {
    if (connectedImageUrl) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
      };
      img.src = connectedImageUrl;
    }
  }, [connectedImageUrl]);

  return (
    <div className="w-[420px] glass-panel rounded-lg border border-border/50 overflow-hidden">
      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-red-500 !border-2 !border-red-700"
        id="prompt-in"
        style={{ top: '25%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        id="image-in"
        style={{ top: '75%' }}
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-secondary/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-secondary/20 flex items-center justify-center">
            <Layers className="w-4 h-4 text-secondary" />
          </div>
          <span className="font-medium text-sm neon-text-cyan">图生图</span>
        </div>
      </div>

      {/* Connected Indicators */}
      {(connectedPromptText || connectedImageUrl) && (
        <div className="px-4 py-2 bg-accent/10 border-b border-border/30 space-y-1">
          {connectedPromptText && (
            <div className="flex items-center gap-2 text-xs text-accent">
              <Link className="w-3 h-3" />
              <span className="truncate">提示词: {connectedPromptText.slice(0, 40)}...</span>
            </div>
          )}
          {connectedImageUrl && (
            <div className="flex items-center gap-2 text-xs text-primary">
              <ImageIcon className="w-3 h-3" />
              <span>已连接图片输入</span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Aspect Ratio Selection */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">比例</label>
          <div className="flex gap-1 flex-wrap">
            {aspectRatios.map((ratio) => (
              <Tooltip key={ratio.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant={aspectRatio === ratio.id ? "default" : "outline"}
                    size="sm"
                    className={`h-7 px-3 text-xs ${
                      aspectRatio === ratio.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent border-border/50 hover:bg-primary/20"
                    }`}
                    onClick={() => setAspectRatio(ratio.id)}
                  >
                    {ratio.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{ratio.width}x{ratio.height}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        {/* Strength Slider */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">
            变换强度: {Math.round(strength * 100)}%
          </label>
          <Slider
            value={[strength]}
            onValueChange={([v]) => setStrength(v)}
            min={0.1}
            max={1}
            step={0.1}
            className="py-1"
          />
        </div>

        {/* Image Upload - 自适应尺寸 */}
        <div
          className="relative border-2 border-dashed border-border/50 rounded-lg p-2 text-center cursor-pointer hover:border-secondary/50 transition-colors flex items-center justify-center"
          onClick={() => !connectedImageUrl && fileInputRef.current?.click()}
          style={{ minHeight: '120px' }}
        >
          {displayImage ? (
            <div className="relative group" style={getImageDisplayStyle()}>
              <img
                src={displayImage}
                alt="Input"
                className="w-full h-full object-contain rounded"
              />
              {!connectedImageUrl && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    setInputImage(null);
                    setRecognizedContent("");
                    setImageDimensions(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
              {connectedImageUrl && (
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-background/80 text-xs flex items-center gap-1">
                  <Link className="w-3 h-3" />
                  已连接
                </div>
              )}
              {/* Image Actions */}
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <ImageActions
                  imageUrl={displayImage}
                  imageName={`图生图输入_${id}`}
                  variant="icons"
                  size="sm"
                />
              </div>
            </div>
          ) : (
            <div className="py-4">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">加载参考图片或连接图片节点</p>
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

        {/* AI识别的图片内容 */}
        {displayImage && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Eye className="w-3 h-3" />
                AI识别内容
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleRecognize}
                disabled={isRecognizing}
              >
                {isRecognizing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 mr-1" />
                    {recognizedContent ? "重新识别" : "AI识别"}
                  </>
                )}
              </Button>
            </div>
            <div className="p-2 bg-background/30 rounded border border-border/30 min-h-[60px]">
              {isRecognizing ? (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  正在识别图片内容...
                </div>
              ) : recognizedContent ? (
                <p className="text-xs text-muted-foreground leading-relaxed">{recognizedContent}</p>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">点击"AI识别"按钮识别图片内容</p>
              )}
            </div>
          </div>
        )}

        {/* 用户输入想要的效果 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">想要的效果</label>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-accent"
                onClick={handleOptimize}
                disabled={isOptimizing || !prompt.trim()}
                title="AI优化提示词"
              >
                {isOptimizing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <>
                    <Wand2 className="w-3 h-3 mr-1" />
                    AI优化
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (!prompt.trim()) {
                    toast.error("没有可复制的提示词");
                    return;
                  }
                  navigator.clipboard.writeText(prompt);
                  setIsCopied(true);
                  toast.success("提示词已复制到剪贴板");
                  setTimeout(() => setIsCopied(false), 2000);
                }}
                disabled={!prompt.trim()}
                title="复制提示词"
              >
                {isCopied ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
          <Textarea
            placeholder={connectedPromptText ? "（可选）添加额外描述..." : "描述你想要的变换效果，如：改成水彩画风格、添加雪景背景..."}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[80px] text-sm bg-background/50 border-border/50 resize-none"
          />
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !displayImage || (!prompt.trim() && !connectedPromptText)}
          className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              生成图片
            </>
          )}
        </Button>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        id="image-out"
      />
    </div>
  );
}

export default memo(ImageToImageNode);
