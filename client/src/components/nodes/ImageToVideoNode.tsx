import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Video, Sparkles, Upload, X, Link, Image as ImageIcon, Eye, RefreshCw, Wand2, Copy, Check } from "lucide-react";
import { ImageActions } from "@/components/ImageActions";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCanvasContext } from "@/pages/Canvas";

const models = [
  { id: "hailuo", name: "海螺 2.3", description: "细节处理强，支持中文" },
  { id: "runway", name: "Runway Gen-3", description: "高质量视频生成" },
  { id: "kling", name: "可灵 2.6", description: "性价比高" },
  { id: "pika", name: "Pika", description: "快速生成" },
];

const aspectRatios = [
  { id: "1:1", label: "1:1", width: 1024, height: 1024 },
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "9:16", label: "9:16", width: 720, height: 1280 },
  { id: "4:3", label: "4:3", width: 1024, height: 768 },
  { id: "3:4", label: "3:4", width: 768, height: 1024 },
  { id: "21:9", label: "21:9", width: 1280, height: 540 },
];

const durations = [
  { id: "3", name: "3秒" },
  { id: "5", name: "5秒" },
  { id: "10", name: "10秒" },
];

function ImageToVideoNode({ id, data }: NodeProps) {
  const [desiredEffect, setDesiredEffect] = useState(data.desiredEffect as string || "");
  const [optimizedPrompt, setOptimizedPrompt] = useState(data.optimizedPrompt as string || "");
  const [recognizedContent, setRecognizedContent] = useState(data.recognizedContent as string || "");
  const [model, setModel] = useState(data.model as string || "hailuo");
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio as string || "16:9");
  const [duration, setDuration] = useState(data.duration as string || "5");
  const [inputImage, setInputImage] = useState<string | null>(data.inputImage as string || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(data.outputVideo as string || null);
  const [connectedPromptText, setConnectedPromptText] = useState<string>("");
  const [connectedImageUrl, setConnectedImageUrl] = useState<string>("");
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { setNodes } = useReactFlow();
  
  // 获取 Canvas Context
  let canvasContext: ReturnType<typeof useCanvasContext> | null = null;
  try {
    canvasContext = useCanvasContext();
  } catch {
    // Context not available
  }

  const createTask = trpc.generation.create.useMutation();
  const recognizeMutation = trpc.ai.recognizeImageContent.useMutation();
  const optimizeMutation = trpc.ai.optimizeVideoPrompt.useMutation();

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
              desiredEffect,
              optimizedPrompt,
              recognizedContent,
              inputImage,
              outputVideo: generatedVideo,
            },
          };
        }
        return node;
      })
    );
  }, [desiredEffect, optimizedPrompt, recognizedContent, inputImage, generatedVideo, id, setNodes]);

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
        setOptimizedPrompt(""); // 清除之前的优化提示词
        
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
      return blobUrl;
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

  // AI优化视频提示词
  const handleOptimize = useCallback(async () => {
    if (!desiredEffect.trim()) {
      toast.error("请先输入你想要的视频效果描述");
      return;
    }

    setIsOptimizing(true);
    try {
      const result = await optimizeMutation.mutateAsync({ 
        imageContent: recognizedContent,
        desiredEffect: desiredEffect,
        duration: parseInt(duration),
        model: model as "runway" | "kling" | "pika" | "hailuo",
      });
      setOptimizedPrompt(result.optimized);
      toast.success("视频提示词已优化");
    } catch (error) {
      toast.error("优化失败，请重试");
    } finally {
      setIsOptimizing(false);
    }
  }, [desiredEffect, recognizedContent, duration, optimizeMutation]);

  // 复制提示词
  const handleCopyPrompt = useCallback(() => {
    const textToCopy = optimizedPrompt || desiredEffect;
    if (!textToCopy) {
      toast.error("没有可复制的提示词");
      return;
    }
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    toast.success("提示词已复制到剪贴板");
    setTimeout(() => setIsCopied(false), 2000);
  }, [optimizedPrompt, desiredEffect]);

  const handleGenerate = useCallback(async () => {
    // 使用连接的图片或上传的图片
    const imageToUse = connectedImageUrl || inputImage;
    if (!imageToUse) {
      toast.error("请上传首帧图片或连接图片节点");
      return;
    }

    // 使用优化后的提示词或用户输入
    const promptToUse = optimizedPrompt || desiredEffect || connectedPromptText;

    setIsGenerating(true);
    
    // 立即创建加载中的视频节点
    let loadingNodeId: string | null = null;
    if (canvasContext?.addLoadingVideoNode) {
      loadingNodeId = canvasContext.addLoadingVideoNode(id, "图生视频结果");
    }
    
    try {
      const selectedRatio = aspectRatios.find(r => r.id === aspectRatio) || aspectRatios[1];
      
      const task = await createTask.mutateAsync({
        taskType: "img2video",
        inputData: {
          prompt: promptToUse,
          model,
          duration: parseInt(duration),
          inputImage: imageToUse,
          width: selectedRatio.width,
          height: selectedRatio.height,
        },
      });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      // Use a sample video for demo
      const sampleVideo = "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4";
      setGeneratedVideo(sampleVideo);
      
      toast.success("视频生成成功");
      
      // 更新加载中的节点为完成状态
      if (loadingNodeId && canvasContext?.updateVideoNode) {
        canvasContext.updateVideoNode(loadingNodeId, sampleVideo);
      }
    } catch (error) {
      toast.error("生成失败，请重试");
      // 设置节点错误状态
      if (loadingNodeId && canvasContext?.setVideoNodeError) {
        canvasContext.setVideoNodeError(loadingNodeId, "生成失败");
      }
    } finally {
      setIsGenerating(false);
    }
  }, [desiredEffect, optimizedPrompt, connectedPromptText, model, duration, aspectRatio, inputImage, connectedImageUrl, id, createTask, canvasContext]);

  // 计算图片显示尺寸（自适应）
  const getImageDisplayStyle = useCallback(() => {
    if (!imageDimensions) return { width: '100%', height: '160px' };
    
    const maxWidth = 380; // 节点内最大宽度
    const maxHeight = 280; // 最大高度
    
    const ratio = imageDimensions.width / imageDimensions.height;
    
    let displayWidth = maxWidth;
    let displayHeight = displayWidth / ratio;
    
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * ratio;
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
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-accent/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center">
            <Video className="w-4 h-4 text-accent" />
          </div>
          <span className="font-medium text-sm neon-text-purple">图生视频</span>
        </div>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="w-[140px] h-8 text-xs bg-background/50 border-border/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

        {/* Duration Selection */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">时长</label>
          <div className="flex gap-1">
            {durations.map((d) => (
              <Button
                key={d.id}
                variant={duration === d.id ? "default" : "outline"}
                size="sm"
                className={`h-7 px-3 text-xs ${
                  duration === d.id
                    ? "bg-accent text-accent-foreground"
                    : "bg-transparent border-border/50 hover:bg-accent/20"
                }`}
                onClick={() => setDuration(d.id)}
              >
                {d.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Image Upload - 自适应尺寸 */}
        <div
          className="relative border-2 border-dashed border-border/50 rounded-lg p-2 text-center cursor-pointer hover:border-accent/50 transition-colors flex items-center justify-center"
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
                    setOptimizedPrompt("");
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
              <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <ImageActions
                  imageUrl={displayImage}
                  imageName={`图生视频输入_${id}`}
                  variant="icons"
                  size="sm"
                />
              </div>
            </div>
          ) : (
            <div className="py-4">
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">上传首帧图片或连接图片节点</p>
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
            <div className="p-2 bg-background/30 rounded border border-border/30 min-h-[50px] max-h-[80px] overflow-y-auto">
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
            <label className="text-xs text-muted-foreground">想要的视频效果</label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-accent"
              onClick={handleOptimize}
              disabled={isOptimizing || !desiredEffect.trim()}
              title="AI优化视频提示词"
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
          </div>
          <Textarea
            placeholder="描述你想要的视频效果，如：人物缓缓转头微笑、镜头慢慢推进、头发随风飘动..."
            value={desiredEffect}
            onChange={(e) => setDesiredEffect(e.target.value)}
            className="min-h-[60px] text-sm bg-background/50 border-border/50 resize-none"
          />
        </div>

        {/* 优化后的视频提示词 */}
        {optimizedPrompt && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                优化后的视频提示词
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleCopyPrompt}
                title="复制提示词"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3 h-3 mr-1 text-green-500" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    复制
                  </>
                )}
              </Button>
            </div>
            <div className="p-2 bg-accent/10 rounded border border-accent/30 max-h-[100px] overflow-y-auto">
              <p className="text-xs text-accent leading-relaxed font-mono">{optimizedPrompt}</p>
            </div>
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !displayImage}
          className="w-full bg-accent hover:bg-accent/80 text-accent-foreground"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              生成视频
            </>
          )}
        </Button>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-emerald-500 !border-2 !border-emerald-700"
        id="video-out"
      />
    </div>
  );
}

export default memo(ImageToVideoNode);
