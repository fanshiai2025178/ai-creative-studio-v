import { useState, useCallback, useContext, useRef, useEffect } from "react";
import { Handle, Position, useReactFlow, useNodeId } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { CanvasContext } from "@/pages/Canvas";
import { 
  Film, 
  Upload as UploadIcon, 
  Loader2,
  X,
  Sparkles,
  Wand2,
  Play,
} from "lucide-react";

export function DynamicNineGridInputNode({ data }: { data: Record<string, unknown> }) {
  const nodeId = useNodeId();
  const { addNodes, addEdges, getNode, setNodes, getEdges } = useReactFlow();
  const canvasContext = useContext(CanvasContext);
  
  // 状态管理
  const [referenceImageUrl, setReferenceImageUrl] = useState<string>("");
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>("");
  const [sceneDescription, setSceneDescription] = useState("");
  const [dynamicAction, setDynamicAction] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16">("1:1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingFromCanvas, setIsLoadingFromCanvas] = useState(false);
  const [hasUserUpload, setHasUserUpload] = useState(false);
  
  // 用于跟踪当前生成的结果节点 ID
  const currentResultNodeIdRef = useRef<string | null>(null);

  // API mutations
  const generateDynamicNineGrid = trpc.storyboardWorkbench.generateDynamicNineGrid.useMutation();
  const analyzeImage = trpc.storyboardWorkbench.analyzeImageForDynamicSequence.useMutation();

  // 处理文件上传
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setHasUserUpload(true); // 标记为用户上传
    
    // 创建本地预览
    const previewUrl = URL.createObjectURL(file);
    setReferenceImagePreview(previewUrl);

    // 转换为 base64 并上传到 S3
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      const dataUrl = `data:${file.type};base64,${base64}`;
      setReferenceImageUrl(dataUrl);
      
      // 更新节点的 outputImage，以便其他节点可以通过连接获取
      if (nodeId) {
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, outputImage: dataUrl } }
              : n
          )
        );
      }
      
      toast.success("图片上传成功，点击「AI识别」按钮识别内容");
    };
    reader.readAsDataURL(file);
  }, [nodeId, setNodes]);

  // 手动触发 AI 分析
  const handleAnalyze = useCallback(async () => {
    if (!referenceImageUrl) {
      toast.error("请先上传或连接图片");
      return;
    }

    setIsAnalyzing(true);
    toast.info("正在进行AI识别...");
    
    try {
      let imageData = referenceImageUrl;
      let converted = false;
      
      if (!referenceImageUrl.startsWith("data:")) {
        // URL格式的图片，尝试多种方式转换为base64
        
        // 方法1: 直接fetch
        try {
          const response = await fetch(referenceImageUrl, { mode: 'cors' });
          if (response.ok) {
            const blob = await response.blob();
            const mimeType = blob.type || "image/png";
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = '';
            uint8Array.forEach(byte => binary += String.fromCharCode(byte));
            const base64 = btoa(binary);
            imageData = `data:${mimeType};base64,${base64}`;
            converted = true;
          }
        } catch (fetchError) {
          console.log("Direct fetch failed, trying canvas method...");
        }
        
        // 方法2: 通过canvas转换（需要CORS支持）
        if (!converted) {
          try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error("图片加载失败"));
              img.src = referenceImageUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            imageData = canvas.toDataURL('image/png');
            converted = true;
          } catch (canvasError) {
            console.log("Canvas method failed, using URL directly for server proxy...");
          }
        }
      }
      
      // 调用API，如果转换失败则直接传URL让服务器下载
      const result = await analyzeImage.mutateAsync({
        imageUrl: imageData,
      });
      if (result.description) {
        setSceneDescription(result.description);
        toast.success("AI 已识别场景内容");
      }
    } catch (error) {
      console.error("Image analysis error:", error);
      toast.error("识别失败，请手动输入描述");
    } finally {
      setIsAnalyzing(false);
    }
  }, [referenceImageUrl, analyzeImage]);

  // 清除参考图片
  const clearReferenceImage = useCallback(() => {
    setReferenceImageUrl("");
    setReferenceImagePreview("");
    setSceneDescription("");
    setHasUserUpload(false); // 重置用户上传标记
  }, []);

  // 自动加载画布连接的图片
  useEffect(() => {
    const checkSourceConnection = () => {
      // 如果用户已上传图片，不加载画布图片
      if (hasUserUpload) return;
      // 如果已经有图片，不重复加载
      if (referenceImageUrl) return;

      const edges = getEdges();
      const incomingEdge = edges.find(edge => edge.target === nodeId && edge.targetHandle === "input");
      
      if (incomingEdge) {
        const sourceNode = getNode(incomingEdge.source);
        if (sourceNode?.data) {
          const nodeData = sourceNode.data as Record<string, unknown>;
          const imageUrl = nodeData.outputImage || nodeData.imageUrl || nodeData.generatedImage || nodeData.image;
          
          if (imageUrl && typeof imageUrl === 'string') {
            setIsLoadingFromCanvas(true);
            
            // 尝试加载图片，先尝试带crossOrigin，失败后不带crossOrigin重试
            const loadImage = (withCORS: boolean) => {
              const img = new Image();
              if (withCORS) {
                img.crossOrigin = "anonymous";
              }
              img.onload = () => {
                setReferenceImagePreview(imageUrl);
                setReferenceImageUrl(imageUrl);
                setIsLoadingFromCanvas(false);
                toast.success("已加载画布图片，点击「AI识别」按钮识别内容");
              };
              img.onerror = () => {
                if (withCORS) {
                  // 带CORS加载失败，尝试不带CORS重试
                  console.log("带CORS加载失败，尝试不带CORS重试");
                  loadImage(false);
                } else {
                  // 两种方式都失败
                  setIsLoadingFromCanvas(false);
                  toast.error("加载画布图片失败");
                }
              };
              img.src = imageUrl;
            };
            
            loadImage(true);
          }
        }
      }
    };

    checkSourceConnection();
    const interval = setInterval(checkSourceConnection, 500);
    return () => clearInterval(interval);
  }, [nodeId, getEdges, getNode, hasUserUpload, referenceImageUrl]);

  // 生成动态九宫格
  const handleGenerate = useCallback(async () => {
    if (!referenceImageUrl) {
      toast.error("请先上传参考图片");
      return;
    }

    if (!dynamicAction.trim()) {
      toast.error("请输入动态状态描述");
      return;
    }

    const finalSceneDescription = sceneDescription.trim() || "基于参考图片的场景";

    setIsGenerating(true);
    
    // 获取当前节点位置
    const currentNode = getNode(nodeId!);
    const currentX = currentNode?.position.x || 0;
    const currentY = currentNode?.position.y || 0;

    // 立即创建结果节点（加载状态）
    const resultNodeId = `dynamicNineGridResult-${Date.now()}`;
    currentResultNodeIdRef.current = resultNodeId;
    
    const loadingNode = {
      id: resultNodeId,
      type: "nineGridResult",
      position: { x: currentX + 500, y: currentY },
      data: { 
        isLoading: true,
        loadingProgress: "正在生成动态九宫格...",
        aspectRatio: aspectRatio,
        angles: [],
        isDynamic: true,
      },
    };

    // 立即添加节点和连线
    addNodes(loadingNode);
    addEdges({
      id: `edge-${nodeId}-${resultNodeId}`,
      source: nodeId!,
      target: resultNodeId,
      sourceHandle: "output",
      targetHandle: "input",
      style: { stroke: "#f472b6", strokeWidth: 2 },
      animated: true,
    });

    try {
      let imageUrl = referenceImageUrl;

      const result = await generateDynamicNineGrid.mutateAsync({
        referenceImageUrl: imageUrl,
        sceneDescription: finalSceneDescription,
        dynamicAction: dynamicAction.trim(),
        aspectRatio,
      });

      if (result.gridImageUrl) {
        // 更新结果节点数据和当前节点的outputImage
        setNodes((nds) => 
          nds.map((node) => {
            if (node.id === resultNodeId) {
              return {
                ...node,
                data: {
                  gridImageUrl: result.gridImageUrl,
                  aspectRatio: result.aspectRatio,
                  angles: result.frameDescriptions,
                  isLoading: false,
                  isDynamic: true,
                },
              };
            }
            // 同时更新当前节点的outputImage，以便其他节点可以通过连接获取
            if (node.id === nodeId) {
              return {
                ...node,
                data: {
                  ...node.data,
                  outputImage: result.gridImageUrl,
                },
              };
            }
            return node;
          })
        );

        toast.success("动态九宫格生成成功！");
      }
    } catch (error) {
      console.error("Generation error:", error);
      
      setNodes((nds) => 
        nds.map((node) => {
          if (node.id === resultNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                isLoading: false,
                loadingProgress: "生成失败，请重试",
              },
            };
          }
          return node;
        })
      );
      
      toast.error("生成失败，请重试");
    } finally {
      setIsGenerating(false);
      currentResultNodeIdRef.current = null;
    }
  }, [referenceImageUrl, sceneDescription, dynamicAction, aspectRatio, generateDynamicNineGrid, nodeId, getNode, addNodes, addEdges, setNodes]);

  return (
    <Card className="w-[320px] bg-gradient-to-br from-orange-950/90 to-red-950/90 border-orange-500/50 shadow-lg shadow-orange-500/20">
      <Handle type="target" position={Position.Left} id="input" className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700" />
      <Handle type="source" position={Position.Right} id="output" className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700" />
      
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-orange-100 text-sm">
          <Film className="w-5 h-5 text-orange-400" />
          动态九宫格
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="text-orange-200 text-xs">参考图片</Label>
          {referenceImagePreview ? (
            <div className="relative inline-flex justify-center w-full">
              <img 
                src={referenceImagePreview} 
                alt="参考图片"
                className="w-auto h-auto rounded border border-orange-500/50"
                style={{ maxWidth: '100%' }}
              />
              <button
                onClick={clearReferenceImage}
                className="absolute top-2 right-2 bg-red-500 rounded-full p-1 hover:bg-red-600 transition-colors"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded">
                  <div className="flex items-center gap-2 text-white text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI 识别中...
                  </div>
                </div>
              )}
            </div>
          ) : isLoadingFromCanvas ? (
            <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-orange-500/50 rounded bg-orange-900/20">
              <Loader2 className="w-8 h-8 text-orange-400 mb-2 animate-spin" />
              <span className="text-sm text-orange-300">正在加载画布图片...</span>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-orange-500/50 rounded cursor-pointer hover:border-orange-400 transition-colors bg-orange-900/20">
              <UploadIcon className="w-8 h-8 text-orange-400 mb-2" />
              <span className="text-sm text-orange-300">点击上传参考图片</span>
              <span className="text-xs text-orange-400/70 mt-1">上传后点击「AI识别」按钮</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-orange-200 text-xs">场景描述</Label>
            {referenceImageUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="h-6 px-2 text-xs text-orange-300 hover:text-orange-100 hover:bg-orange-800/50"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Wand2 className="w-3 h-3 mr-1" />
                )}
                AI 识别
              </Button>
            )}
          </div>
          <Textarea
            value={sceneDescription}
            onChange={(e) => setSceneDescription(e.target.value)}
            placeholder={isAnalyzing ? "AI 正在识别图片内容..." : "点击「AI识别」按钮识别，或手动输入..."}
            className="h-16 text-xs bg-orange-900/30 border-orange-500/30 text-orange-100 placeholder:text-orange-400/50 resize-none"
            disabled={isAnalyzing}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-orange-200 text-xs flex items-center gap-1">
            <Play className="w-3 h-3" />
            动态状态描述
          </Label>
          <Textarea
            value={dynamicAction}
            onChange={(e) => setDynamicAction(e.target.value)}
            placeholder="描述希望出现的动态，如：角色准备挥剑、几秒钟前的状态、即将发生的动作..."
            className="h-20 text-xs bg-orange-900/30 border-orange-500/30 text-orange-100 placeholder:text-orange-400/50 resize-none"
          />
          <p className="text-[10px] text-orange-400/70">
            AI 将根据描述生成9帧连续的电影级序列
          </p>
        </div>

        <div className="space-y-1">
          <Label className="text-orange-200 text-xs">画面比例</Label>
          <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as "1:1" | "16:9" | "9:16")}>
            <SelectTrigger className="h-8 text-xs bg-orange-900/30 border-orange-500/30 text-orange-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1:1">1:1 (正方形)</SelectItem>
              <SelectItem value="16:9">16:9 (横屏)</SelectItem>
              <SelectItem value="9:16">9:16 (竖屏)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !referenceImageUrl || isAnalyzing || !dynamicAction.trim()}
          className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              生成动态九宫格
            </>
          )}
        </Button>

        <p className="text-[10px] text-orange-400/70 text-center">
          保持主体一致性，生成9帧连续的电影级动态序列
        </p>
      </CardContent>
    </Card>
  );
}
