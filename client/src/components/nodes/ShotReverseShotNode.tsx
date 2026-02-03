import { useState, useCallback, useRef, useContext, useMemo, useEffect } from "react";
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
  Upload as UploadIcon, 
  Loader2,
  X,
  Sparkles,
  Wand2,
  ArrowLeftRight,
} from "lucide-react";

// 正反打镜头类型
type ShotType = "a_to_b" | "a_pov" | "b_pov" | "b_to_a";

interface CharacterInfo {
  name: string;
  description: string;
}

export function ShotReverseShotNode({ data }: { data: Record<string, unknown> }) {
  const nodeId = useNodeId();
  const { addNodes, addEdges, getNode, setNodes, getEdges } = useReactFlow();
  const canvasContext = useContext(CanvasContext);
  
  // 状态管理
  const [referenceImageUrl, setReferenceImageUrl] = useState<string>("");
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>("");
  const [sceneDescription, setSceneDescription] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16">("16:9");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedShotType, setSelectedShotType] = useState<ShotType | null>(null);
  const [isLoadingFromCanvas, setIsLoadingFromCanvas] = useState(false);
  const [hasUserUpload, setHasUserUpload] = useState(false);
  
  // AI 识别的角色信息
  const [characterA, setCharacterA] = useState<CharacterInfo | null>(null);
  const [characterB, setCharacterB] = useState<CharacterInfo | null>(null);
  
  // 用于跟踪当前生成的结果节点 ID
  const currentResultNodeIdRef = useRef<string | null>(null);

  // API mutations - 使用正反打镜头专用API
  const analyzeImage = trpc.storyboardWorkbench.analyzeImageForShotReverseShot.useMutation();
  const generateShotReverseShot = trpc.storyboardWorkbench.generateShotReverseShot.useMutation();

  // 解析角色信息 - 从 AI 返回的结构化描述中提取
  const parseCharacters = useCallback((description: string) => {
    // 默认角色名称
    let charA = { name: "角色A", description: "" };
    let charB = { name: "角色B", description: "" };
    
    // 尝试从结构化输出中提取角色信息
    // 格式：角色A（[具体特征名称]）：[详细描述]
    const charAMatch = description.match(/角色A[（(]([^）)]+)[）)][\uff1a:]\s*([\s\S]*?)(?=角色B|环境|光线|$)/);
    const charBMatch = description.match(/角色B[（(]([^）)]+)[）)][\uff1a:]\s*([\s\S]*?)(?=环境|光线|$)/);   
    if (charAMatch) {
      charA = { 
        name: charAMatch[1].trim(), 
        description: charAMatch[2].trim() 
      };
    }
    
    if (charBMatch) {
      charB = { 
        name: charBMatch[1].trim(), 
        description: charBMatch[2].trim() 
      };
    }
    
    // 如果结构化提取失败，回退到关键词匹配
    if (!charAMatch && !charBMatch) {
      // 尝试识别常见角色类型，使用更具体的描述
      const rolePatterns = [
        { pattern: /穿[\u4e00-\u9fa5]*长袍[\u4e00-\u9fa5]*男子/, extract: true },
        { pattern: /戴[\u4e00-\u9fa5]*帽子[\u4e00-\u9fa5]*老者/, extract: true },
        { pattern: /年轻男子|青年男子/, name: "年轻男子" },
        { pattern: /老者|老人/, name: "老者" },
        { pattern: /司机|驾驶员/, name: "司机" },
        { pattern: /乘客/, name: "乘客" },
        { pattern: /女子|女人/, name: "女子" },
        { pattern: /孩子|儿童/, name: "孩子" },
        { pattern: /警察|警官/, name: "警察" },
        { pattern: /士兵|军人/, name: "士兵" },
      ];
      
      const foundRoles: { name: string; desc: string }[] = [];
      for (const { pattern, name, extract } of rolePatterns) {
        const match = description.match(pattern);
        if (match) {
          const roleName = extract ? match[0] : (name || match[0]);
          if (!foundRoles.find(r => r.name === roleName)) {
            foundRoles.push({ name: roleName, desc: `图片中的${roleName}` });
            if (foundRoles.length >= 2) break;
          }
        }
      }
      
      if (foundRoles.length >= 1) {
        charA = { name: foundRoles[0].name, description: foundRoles[0].desc };
      }
      if (foundRoles.length >= 2) {
        charB = { name: foundRoles[1].name, description: foundRoles[1].desc };
      } else if (foundRoles.length === 1) {
        // 尝试找到另一个不同的角色
        charB = { name: "另一人物", description: "场景中的另一人物" };
      }
    }
    
    setCharacterA(charA);
    setCharacterB(charB);
  }, []);

  // 处理文件上传 - 使用与 NineGridInputNode 相同的方式
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setHasUserUpload(true); // 标记为用户上传
    
    // 创建本地预览
    const previewUrl = URL.createObjectURL(file);
    setReferenceImagePreview(previewUrl);

    // 转换为 base64
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
      // 设置默认角色
      setCharacterA({ name: "角色A", description: "" });
      setCharacterB({ name: "角色B", description: "" });
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
      let base64: string | undefined;
      let mimeType: string = "image/png";
      
      if (referenceImageUrl.startsWith("data:")) {
        // Base64格式的图片
        base64 = referenceImageUrl.split(",")[1];
        mimeType = referenceImageUrl.split(";")[0].split(":")[1];
      } else {
        // URL格式的图片，尝试多种方式转换为base64
        
        // 方法1: 直接fetch
        try {
          const response = await fetch(referenceImageUrl, { mode: 'cors' });
          if (response.ok) {
            const blob = await response.blob();
            mimeType = blob.type || "image/png";
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            let binary = '';
            uint8Array.forEach(byte => binary += String.fromCharCode(byte));
            base64 = btoa(binary);
          }
        } catch (fetchError) {
          console.log("Direct fetch failed, trying canvas method...");
        }
        
        // 方法2: 通过canvas转换（需要CORS支持）
        if (!base64) {
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
            const dataUrl = canvas.toDataURL('image/png');
            base64 = dataUrl.split(",")[1];
            mimeType = "image/png";
          } catch (canvasError) {
            console.log("Canvas method failed, trying server proxy...");
          }
        }
      }
      
      // 调用API，如果有base64就用base64，否则用URL让服务器下载
      const result = await analyzeImage.mutateAsync({
        imageBase64: base64,
        imageMimeType: mimeType,
        imageUrl: base64 ? undefined : referenceImageUrl,
      });
      if (result.description) {
        setSceneDescription(result.description);
        parseCharacters(result.description);
        toast.success("AI 已识别场景内容");
      }
    } catch (error) {
      console.error("Image analysis error:", error);
      toast.error("识别失败，请手动输入描述");
    } finally {
      setIsAnalyzing(false);
    }
  }, [referenceImageUrl, analyzeImage, parseCharacters]);

  // 清除图片
  const handleClearImage = useCallback(() => {
    setReferenceImageUrl("");
    setReferenceImagePreview("");
    setSceneDescription("");
    setCharacterA(null);
    setCharacterB(null);
    setSelectedShotType(null);
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
                // 设置默认角色
                setCharacterA({ name: "角色A", description: "" });
                setCharacterB({ name: "角色B", description: "" });
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

  // 获取镜头类型的显示名称
  const getShotTypeLabel = useCallback((type: ShotType) => {
    const aName = characterA?.name || "A";
    const bName = characterB?.name || "B";
    
    switch (type) {
      case "a_to_b":
        return `${aName}→${bName}方向`;
      case "a_pov":
        return `${aName}的视野`;
      case "b_pov":
        return `${bName}的视野`;
      case "b_to_a":
        return `${bName}→${aName}方向`;
    }
  }, [characterA, characterB]);

  // 获取镜头类型的描述
  const getShotTypeDescription = useCallback((type: ShotType) => {
    const aName = characterA?.name || "A";
    const bName = characterB?.name || "B";
    
    switch (type) {
      case "a_to_b":
        return `镜头在${aName}身后，拍摄${bName}的正面（过肩镜头）`;
      case "a_pov":
        return `镜头就是${aName}的眼睛，看到${bName}（主观视角）`;
      case "b_pov":
        return `镜头就是${bName}的眼睛，看到${aName}（主观视角）`;
      case "b_to_a":
        return `镜头在${bName}身后，拍摄${aName}的正面（过肩镜头）`;
    }
  }, [characterA, characterB]);

  // 生成正反打镜头
  const handleGenerate = useCallback(async () => {
    if (!referenceImageUrl) {
      toast.error("请先上传参考图片");
      return;
    }
    if (!selectedShotType) {
      toast.error("请选择一个镜头类型");
      return;
    }

    setIsGenerating(true);
    
    // 创建或更新结果节点
    const currentNode = getNode(nodeId!);
    const currentX = currentNode?.position.x || 0;
    const currentY = currentNode?.position.y || 0;

    // 创建结果节点
    const resultNodeId = `shotReverseResult-${Date.now()}`;
    currentResultNodeIdRef.current = resultNodeId;

    const resultNode = {
      id: resultNodeId,
      type: "imageDisplay",
      position: { x: currentX + 420, y: currentY },
      data: {
        isLoading: true,
        loadingProgress: `正在生成${getShotTypeLabel(selectedShotType)}...`,
        label: getShotTypeLabel(selectedShotType),
        aspectRatio: aspectRatio,
        nodeWidth: aspectRatio === "9:16" ? 180 : aspectRatio === "16:9" ? 320 : 240,
        nodeHeight: aspectRatio === "9:16" ? 320 : aspectRatio === "16:9" ? 180 : 240,
      },
    };

    addNodes(resultNode);
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
      const result = await generateShotReverseShot.mutateAsync({
        referenceImageUrl,
        shotType: selectedShotType,
        characterA: characterA?.name || "角色A",
        characterB: characterB?.name || "角色B",
        sceneDescription,
        aspectRatio,
      });

      // 更新结果节点和当前节点的outputImage
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === resultNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                imageUrl: result.imageUrl,
                isLoading: false,
                description: result.description || "",
              },
            };
          }
          // 同时更新当前节点的outputImage，以便其他节点可以通过连接获取
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                outputImage: result.imageUrl,
              },
            };
          }
          return node;
        })
      );

      toast.success("正反打镜头生成成功！");
    } catch (error) {
      console.error("Generate error:", error);
      toast.error("生成失败，请重试");
      
      // 移除失败的节点
      setNodes((nds) => nds.filter((n) => n.id !== resultNodeId));
    } finally {
      setIsGenerating(false);
    }
  }, [
    referenceImageUrl, 
    selectedShotType, 
    nodeId, 
    getNode, 
    addNodes, 
    addEdges, 
    setNodes,
    characterA,
    characterB,
    sceneDescription,
    aspectRatio,
    getShotTypeLabel,
    generateShotReverseShot,
  ]);

  // 镜头类型选项
  const shotTypes: ShotType[] = ["a_to_b", "a_pov", "b_pov", "b_to_a"];

  return (
    <Card className="w-[380px] bg-purple-950/90 border-purple-500/30 shadow-xl shadow-purple-500/10">
      {/* 左侧输入 Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        style={{ top: "50%" }}
      />
      
      {/* 右侧输出 Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        style={{ top: "50%" }}
      />

      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-purple-100 text-sm">
          <ArrowLeftRight className="w-5 h-5 text-purple-400" />
          正反打镜头
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 参考图片上传 */}
        <div className="space-y-2">
          <Label className="text-purple-200 text-xs">参考图片</Label>
          {referenceImagePreview ? (
            <div className="relative group inline-flex justify-center w-full">
              <img 
                src={referenceImagePreview} 
                alt="参考图片" 
                className="w-auto h-auto rounded-lg border border-purple-500/30"
                style={{ maxWidth: '100%' }}
              />
              <button
                onClick={handleClearImage}
                className="absolute top-2 right-2 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4 text-white" />
              </button>
              {isAnalyzing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-200">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">AI 识别中...</span>
                  </div>
                </div>
              )}
            </div>
          ) : isLoadingFromCanvas ? (
            <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-purple-500/30 rounded-lg bg-purple-900/20">
              <Loader2 className="w-8 h-8 text-purple-400 mb-2 animate-spin" />
              <span className="text-purple-300 text-sm">正在加载画布图片...</span>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-purple-500/30 rounded-lg cursor-pointer hover:border-purple-400/50 transition-colors bg-purple-900/20">
              <UploadIcon className="w-8 h-8 text-purple-400 mb-2" />
              <span className="text-purple-300 text-sm">点击上传参考图片</span>
              <span className="text-purple-400/60 text-xs mt-1">上传后点击「AI识别」按钮</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* 场景描述 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-purple-200 text-xs flex items-center gap-2">
              场景描述
              {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin" />}
            </Label>
            {referenceImageUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="h-6 px-2 text-xs text-purple-300 hover:text-purple-100"
              >
                <Wand2 className="w-3 h-3 mr-1" />
                AI 识别
              </Button>
            )}
          </div>
          <Textarea
            value={sceneDescription}
            onChange={(e) => setSceneDescription(e.target.value)}
            placeholder="点击「AI识别」按钮识别，或手动输入..."
            className="bg-purple-900/30 border-purple-500/30 text-purple-100 placeholder:text-purple-400/50 text-sm min-h-[60px] resize-none"
          />
        </div>

        {/* 角色信息显示和编辑 */}
        {(characterA || characterB) && (
          <div className="space-y-2">
            <Label className="text-purple-200 text-xs">识别到的角色（可编辑）</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-purple-300/70 text-xs">角色 A</Label>
                <input
                  type="text"
                  value={characterA?.name || ""}
                  onChange={(e) => setCharacterA(prev => ({ ...prev!, name: e.target.value }))}
                  className="w-full px-2 py-1 text-sm bg-purple-900/30 border border-purple-500/30 rounded text-purple-100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-purple-300/70 text-xs">角色 B</Label>
                <input
                  type="text"
                  value={characterB?.name || ""}
                  onChange={(e) => setCharacterB(prev => ({ ...prev!, name: e.target.value }))}
                  className="w-full px-2 py-1 text-sm bg-purple-900/30 border border-purple-500/30 rounded text-purple-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* 镜头类型选择 */}
        {characterA && characterB && (
          <div className="space-y-2">
            <Label className="text-purple-200 text-xs">选择镜头类型</Label>
            <div className="grid grid-cols-2 gap-2">
              {shotTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedShotType(type)}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    selectedShotType === type
                      ? "border-pink-500 bg-pink-500/20 text-pink-200"
                      : "border-purple-500/30 bg-purple-900/20 text-purple-300 hover:border-purple-400/50"
                  }`}
                >
                  <div className="text-xs font-medium">{getShotTypeLabel(type)}</div>
                  <div className="text-[10px] opacity-70 mt-1">{getShotTypeDescription(type)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 画面比例 */}
        <div className="space-y-2">
          <Label className="text-purple-200 text-xs">画面比例</Label>
          <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as typeof aspectRatio)}>
            <SelectTrigger className="bg-purple-900/30 border-purple-500/30 text-purple-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-purple-950 border-purple-500/30">
              <SelectItem value="16:9" className="text-purple-100">16:9 (横屏)</SelectItem>
              <SelectItem value="9:16" className="text-purple-100">9:16 (竖屏)</SelectItem>
              <SelectItem value="1:1" className="text-purple-100">1:1 (正方形)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 生成按钮 */}
        <Button
          onClick={handleGenerate}
          disabled={!referenceImageUrl || !selectedShotType || isGenerating}
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              生成正反打镜头
            </>
          )}
        </Button>

        {/* 提示信息 */}
        <p className="text-purple-400/60 text-xs text-center">
          上传图片后点击「AI识别」按钮识别人物，选择镜头类型生成对应视角
        </p>
      </CardContent>
    </Card>
  );
}
