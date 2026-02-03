import { memo, useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Image, Sparkles, Wand2, Download, X, Plus, Upload, Check, Link } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCanvasContext } from "@/pages/Canvas";

const models = [
  { id: "stability", name: "Stability AI", description: "高质量写实风格" },
  { id: "dalle3", name: "DALL-E 3", description: "创意艺术风格" },
  { id: "flux", name: "Flux", description: "快速生成" },
];

const aspectRatios = [
  { id: "1:1", name: "1:1", width: 1024, height: 1024, icon: "□" },
  { id: "16:9", name: "16:9", width: 1344, height: 768, icon: "▭" },
  { id: "9:16", name: "9:16", width: 768, height: 1344, icon: "▯" },
  { id: "4:3", name: "4:3", width: 1152, height: 896, icon: "▭" },
  { id: "3:4", name: "3:4", width: 896, height: 1152, icon: "▯" },
  { id: "21:9", name: "21:9", width: 1536, height: 640, icon: "━" },
];

// 预设风格
const presetStyles = [
  { id: "none", name: "无风格", description: "完全基于提示词", preview: null },
  { id: "anime", name: "动漫风", description: "日系动漫风格", preview: "🎨" },
  { id: "realistic", name: "写实风", description: "照片级真实感", preview: "📷" },
  { id: "oil-painting", name: "油画风", description: "古典油画质感", preview: "🖼️" },
  { id: "watercolor", name: "水彩风", description: "水彩画风格", preview: "💧" },
  { id: "3d-render", name: "3D渲染", description: "3D建模渲染", preview: "🎮" },
  { id: "pixel-art", name: "像素风", description: "复古像素艺术", preview: "👾" },
  { id: "cyberpunk", name: "赛博朋克", description: "霓虹未来感", preview: "🌃" },
];

function TextToImageNode({ id, data }: NodeProps) {
  const [prompt, setPrompt] = useState(data.prompt as string || "");
  const [model, setModel] = useState(data.model as string || "stability");
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio as string || "1:1");
  const [selectedStyle, setSelectedStyle] = useState<string>("none");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(data.outputImage as string || null);
  const [connectedPromptText, setConnectedPromptText] = useState<string>("");
  
  // 自定义风格相关状态
  const [showCreateStyle, setShowCreateStyle] = useState(false);
  const [newStyleName, setNewStyleName] = useState("");
  const [newStyleDescription, setNewStyleDescription] = useState("");
  const [newStyleImage, setNewStyleImage] = useState<File | null>(null);
  const [newStylePreview, setNewStylePreview] = useState<string | null>(null);
  const [isCreatingStyle, setIsCreatingStyle] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { setNodes } = useReactFlow();
  
  // 获取 Canvas Context
  let canvasContext: ReturnType<typeof useCanvasContext> | null = null;
  try {
    canvasContext = useCanvasContext();
  } catch {
    // Context not available
  }

  const generateMutation = trpc.ai.textToImage.useMutation();
  const optimizeMutation = trpc.ai.optimizePrompt.useMutation();
  
  // 获取用户自定义风格
  const { data: customStyles = [], refetch: refetchStyles } = trpc.style.list.useQuery();
  const createStyleMutation = trpc.style.create.useMutation();

  // 监听连接的提示词节点
  useEffect(() => {
    if (canvasContext) {
      const connectedPrompts = canvasContext.getConnectedPrompts(id);
      if (connectedPrompts.length > 0) {
        setConnectedPromptText(connectedPrompts.join(", "));
      } else {
        setConnectedPromptText("");
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
              outputImage: generatedImage,
            },
          };
        }
        return node;
      })
    );
  }, [prompt, generatedImage, id, setNodes]);

  const handleOptimize = useCallback(async () => {
    const textToOptimize = connectedPromptText ? `${connectedPromptText}, ${prompt}` : prompt;
    if (!textToOptimize.trim()) {
      toast.error("请先输入提示词");
      return;
    }

    setIsOptimizing(true);
    try {
      const result = await optimizeMutation.mutateAsync({ prompt: textToOptimize });
      setPrompt(result.optimized);
      toast.success("提示词已优化");
    } catch (error) {
      toast.error("优化失败，请重试");
    } finally {
      setIsOptimizing(false);
    }
  }, [prompt, connectedPromptText, optimizeMutation]);

  const handleGenerate = useCallback(async () => {
    // 合并连接的提示词和本节点的提示词
    const combinedPrompt = connectedPromptText 
      ? (prompt.trim() ? `${connectedPromptText}, ${prompt}` : connectedPromptText)
      : prompt;
    
    if (!combinedPrompt.trim()) {
      toast.error("请输入提示词或连接提示词节点");
      return;
    }

    setIsGenerating(true);
    
    // 立即创建加载中的图片节点
    let loadingNodeId: string | null = null;
    if (canvasContext?.addLoadingImageNode) {
      loadingNodeId = canvasContext.addLoadingImageNode(id, "生成结果");
    }
    
    try {
      const ratio = aspectRatios.find(r => r.id === aspectRatio);
      
      // 构建完整提示词（如果选择了风格）
      let fullPrompt = combinedPrompt;
      if (selectedStyle !== "none") {
        const style = presetStyles.find(s => s.id === selectedStyle);
        if (style) {
          fullPrompt = `${combinedPrompt}, ${style.name} style`;
        }
      }
      
      const result = await generateMutation.mutateAsync({
        prompt: fullPrompt,
        model,
        width: ratio?.width || 1024,
        height: ratio?.height || 1024,
        nodeId: id,
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
  }, [prompt, connectedPromptText, model, aspectRatio, selectedStyle, id, generateMutation, canvasContext]);

  const handleDownload = useCallback(async () => {
    if (generatedImage) {
      try {
        toast.success("开始下载...");
        const response = await fetch(generatedImage);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `generated-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error("Download error:", error);
        window.open(generatedImage, "_blank");
        toast.info("已在新窗口打开图片，请右键保存");
      }
    }
  }, [generatedImage]);

  // 处理自定义风格图片上传
  const handleStyleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewStyleImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewStylePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // 创建自定义风格
  const handleCreateStyle = async () => {
    if (!newStyleName.trim()) {
      toast.error("请输入风格名称");
      return;
    }
    if (!newStyleImage) {
      toast.error("请上传参考图片");
      return;
    }

    setIsCreatingStyle(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        
        await createStyleMutation.mutateAsync({
          name: newStyleName,
          description: newStyleDescription,
          referenceImage: base64,
        });

        toast.success("风格创建成功");
        setShowCreateStyle(false);
        setNewStyleName("");
        setNewStyleDescription("");
        setNewStyleImage(null);
        setNewStylePreview(null);
        refetchStyles();
      };
      reader.readAsDataURL(newStyleImage);
    } catch (error) {
      toast.error("创建失败，请重试");
    } finally {
      setIsCreatingStyle(false);
    }
  };

  return (
    <div className="w-96 glass-panel rounded-lg border border-border/50 overflow-hidden">
      {/* Input Handle - 左侧接收提示词 */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-red-500 !border-2 !border-red-700"
        id="prompt-in"
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between bg-primary/10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
            <Image className="w-4 h-4 text-primary" />
          </div>
          <span className="font-medium text-sm neon-text-pink">文生图</span>
        </div>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger className="h-7 w-32 text-xs bg-background/50 border-border/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Connected Prompt Indicator */}
      {connectedPromptText && (
        <div className="px-4 py-2 bg-accent/10 border-b border-border/30">
          <div className="flex items-center gap-2 text-xs text-accent">
            <Link className="w-3 h-3" />
            <span className="truncate">已连接提示词: {connectedPromptText.slice(0, 50)}...</span>
          </div>
        </div>
      )}

      {/* Aspect Ratio Selection */}
      <div className="px-4 py-2 border-b border-border/30 bg-card/30">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">比例</span>
          {aspectRatios.map((ratio) => (
            <button
              key={ratio.id}
              onClick={() => setAspectRatio(ratio.id)}
              className={`px-2 py-1 text-xs rounded transition-all ${
                aspectRatio === ratio.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-background/50 text-muted-foreground hover:bg-background/80"
              }`}
              title={`${ratio.width}x${ratio.height}`}
            >
              {ratio.name}
            </button>
          ))}
        </div>
      </div>

      {/* Style Selection */}
      <div className="px-4 py-2 border-b border-border/30 bg-card/30">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-muted-foreground">风格</span>
          <Dialog open={showCreateStyle} onOpenChange={setShowCreateStyle}>
            <DialogTrigger asChild>
              <button className="text-xs text-accent hover:text-accent/80 flex items-center gap-1">
                <Plus className="w-3 h-3" />
                自定义
              </button>
            </DialogTrigger>
            <DialogContent className="glass-panel border-border/50">
              <DialogHeader>
                <DialogTitle className="neon-text-cyan">创建自定义风格</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>风格名称</Label>
                  <Input
                    placeholder="例如：我的水墨风"
                    value={newStyleName}
                    onChange={(e) => setNewStyleName(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>描述（可选）</Label>
                  <Input
                    placeholder="描述这个风格的特点"
                    value={newStyleDescription}
                    onChange={(e) => setNewStyleDescription(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label>参考图片</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleStyleImageChange}
                    className="hidden"
                  />
                  {newStylePreview ? (
                    <div className="relative w-full h-32 rounded-lg overflow-hidden border border-border/50">
                      <img
                        src={newStylePreview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => {
                          setNewStyleImage(null);
                          setNewStylePreview(null);
                        }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-32 rounded-lg border-2 border-dashed border-border/50 flex flex-col items-center justify-center gap-2 hover:border-accent/50 transition-colors"
                    >
                      <Upload className="w-6 h-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">点击上传图片</span>
                    </button>
                  )}
                </div>
                <Button
                  onClick={handleCreateStyle}
                  disabled={isCreatingStyle}
                  className="w-full"
                >
                  {isCreatingStyle ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  创建风格
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex flex-wrap gap-1">
          {presetStyles.map((style) => (
            <button
              key={style.id}
              onClick={() => setSelectedStyle(style.id)}
              className={`px-2 py-1 text-xs rounded transition-all flex items-center gap-1 ${
                selectedStyle === style.id
                  ? "bg-accent text-accent-foreground"
                  : "bg-background/50 text-muted-foreground hover:bg-background/80"
              }`}
              title={style.description}
            >
              {style.preview && <span>{style.preview}</span>}
              {style.name}
            </button>
          ))}
          {/* 用户自定义风格 */}
          {customStyles.map((style: any) => (
            <button
              key={`custom-${style.id}`}
              onClick={() => setSelectedStyle(`custom-${style.id}`)}
              className={`px-2 py-1 text-xs rounded transition-all flex items-center gap-1 ${
                selectedStyle === `custom-${style.id}`
                  ? "bg-accent text-accent-foreground"
                  : "bg-background/50 text-muted-foreground hover:bg-background/80"
              }`}
              title={style.description || style.name}
            >
              <span className="w-3 h-3 rounded-full overflow-hidden">
                <img src={style.referenceImageUrl} alt="" className="w-full h-full object-cover" />
              </span>
              {style.name}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input */}
      <div className="p-4">
        <Textarea
          placeholder={connectedPromptText ? "（可选）添加额外描述..." : "输入提示词描述你想要生成的图片..."}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-20 text-sm bg-background/50 border-border/50 resize-none mb-3"
        />

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || (!prompt.trim() && !connectedPromptText)}
          className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
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

      {/* Output Handle - 右侧输出图片 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        id="image-out"
      />
    </div>
  );
}

export default memo(TextToImageNode);
