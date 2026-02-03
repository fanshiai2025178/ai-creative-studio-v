import { useState, useCallback, useContext, useEffect } from "react";
import { Handle, Position, useReactFlow, useNodeId } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { CanvasContext } from "@/pages/Canvas";
import { 
  User, 
  Upload as UploadIcon, 
  Loader2,
  Sparkles,
  X,
} from "lucide-react";

// 视角类型定义
interface ViewOption {
  id: string;
  label: string;
  description: string;
  selected: boolean;
  aspectRatio: string;
}

// 比例选项
const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 (正方形)" },
  { value: "16:9", label: "16:9 (横屏)" },
  { value: "9:16", label: "9:16 (竖屏)" },
  { value: "4:3", label: "4:3 (标准)" },
  { value: "3:4", label: "3:4 (竖版)" },
];

// 默认视角选项
const DEFAULT_VIEW_OPTIONS: ViewOption[] = [
  { id: "closeup", label: "正面特写", description: "面部特写镜头", selected: false, aspectRatio: "1:1" },
  { id: "halfbody", label: "正面半身照", description: "上半身正面照", selected: false, aspectRatio: "3:4" },
  { id: "threeview", label: "三视图", description: "正面+侧面+背面全身", selected: false, aspectRatio: "16:9" },
  { id: "accessories", label: "服饰/道具", description: "AI识别服饰道具特写", selected: false, aspectRatio: "1:1" },
];

interface SubjectMultiViewNodeData {
  subjectImage?: string;
}

export function SubjectMultiViewNode({ data }: { data: SubjectMultiViewNodeData }) {
  const nodeId = useNodeId();
  const { setNodes, addNodes, addEdges, getNode, getEdges } = useReactFlow();
  const canvasContext = useContext(CanvasContext);
  
  // 状态管理
  const [subjectImage, setSubjectImage] = useState<string | null>(data.subjectImage || null);
  const [subjectFile, setSubjectFile] = useState<File | null>(null);
  const [viewOptions, setViewOptions] = useState<ViewOption[]>(DEFAULT_VIEW_OPTIONS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingViews, setGeneratingViews] = useState<string[]>([]);
  const [hasUserUpload, setHasUserUpload] = useState(false);
  const [isLoadingFromCanvas, setIsLoadingFromCanvas] = useState(false);

  // API mutation
  const generateSubjectView = trpc.storyboardWorkbench.generateSubjectView.useMutation();
  const describeImage = trpc.storyboardWorkbench.describeImage.useMutation();

  // 处理图片上传
  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setHasUserUpload(true); // 标记为用户上传
      setSubjectFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setSubjectImage(url);
        if (nodeId) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId ? { ...n, data: { ...n.data, subjectImage: url, outputImage: url } } : n
            )
          );
        }
      };
      reader.readAsDataURL(file);
    }
  }, [nodeId, setNodes]);

  // 清除上传的图片
  const clearImage = useCallback(() => {
    setSubjectImage(null);
    setSubjectFile(null);
    setHasUserUpload(false); // 重置用户上传标记
    if (nodeId) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, subjectImage: undefined } } : n
        )
      );
    }
  }, [nodeId, setNodes]);

  // 自动加载画布连接的图片
  useEffect(() => {
    const checkSourceConnection = () => {
      // 如果用户已上传图片，不加载画布图片
      if (hasUserUpload) return;
      // 如果已经有图片，不重复加载
      if (subjectImage) return;

      const edges = getEdges();
      const incomingEdge = edges.find(edge => edge.target === nodeId && edge.targetHandle === "input");
      
      if (incomingEdge) {
        const sourceNode = getNode(incomingEdge.source);
        if (sourceNode?.data) {
          const nodeData = sourceNode.data as Record<string, unknown>;
          const imageUrl = nodeData.outputImage || nodeData.imageUrl || nodeData.generatedImage || nodeData.image;
          
          if (imageUrl && typeof imageUrl === 'string') {
            setIsLoadingFromCanvas(true);
            const img = new Image();
            img.onload = () => {
              setSubjectImage(imageUrl);
              setIsLoadingFromCanvas(false);
              toast.success("已加载画布图片");
              // 更新节点数据
              if (nodeId) {
                setNodes((nds) =>
                  nds.map((n) =>
                    n.id === nodeId ? { ...n, data: { ...n.data, subjectImage: imageUrl } } : n
                  )
                );
              }
            };
            img.onerror = () => {
              setIsLoadingFromCanvas(false);
              toast.error("加载画布图片失败");
            };
            img.src = imageUrl;
          }
        }
      }
    };

    checkSourceConnection();
    const interval = setInterval(checkSourceConnection, 500);
    return () => clearInterval(interval);
  }, [nodeId, getEdges, getNode, hasUserUpload, subjectImage, setNodes]);

  // 切换视角选择
  const toggleViewOption = useCallback((viewId: string) => {
    setViewOptions((prev) =>
      prev.map((opt) =>
        opt.id === viewId ? { ...opt, selected: !opt.selected } : opt
      )
    );
  }, []);

  // 更新视角比例
  const updateViewAspectRatio = useCallback((viewId: string, aspectRatio: string) => {
    setViewOptions((prev) =>
      prev.map((opt) =>
        opt.id === viewId ? { ...opt, aspectRatio } : opt
      )
    );
  }, []);

  // 生成选中的视角
  const handleGenerate = useCallback(async () => {
    if (!subjectImage) {
      toast.error("请先上传主体图片");
      return;
    }

    const selectedViews = viewOptions.filter((opt) => opt.selected);
    if (selectedViews.length === 0) {
      toast.error("请至少选择一个视角类型");
      return;
    }

    setIsGenerating(true);
    setGeneratingViews(selectedViews.map((v) => v.id));

    try {
      // 获取当前节点位置
      const currentNode = nodeId ? getNode(nodeId) : null;
      const baseX = currentNode?.position?.x ?? 0;
      const baseY = currentNode?.position?.y ?? 0;

      // 立即创建加载中的图片节点
      const loadingNodes = selectedViews.map((view, i) => ({
        id: `imageDisplay-${Date.now()}-${i}`,
        type: "imageDisplay",
        position: { 
          x: baseX + 450, 
          y: baseY + (i * 220) - ((selectedViews.length - 1) * 110)
        },
        data: { 
          isLoading: true,
          loadingProgress: `正在生成${view.label}...`,
          label: view.label,
        },
      }));

      const loadingEdges = loadingNodes.map((node) => ({
        id: `edge-${nodeId}-${node.id}`,
        source: nodeId!,
        target: node.id,
        sourceHandle: "output",
        targetHandle: "input",
        animated: true,
        style: { stroke: 'oklch(0.7 0.25 200)', strokeWidth: 2 },
      }));

      addNodes(loadingNodes);
      addEdges(loadingEdges);

      // 提取 base64 数据
      let imageData = subjectImage;
      if (subjectImage.startsWith("data:")) {
        imageData = subjectImage.split(",")[1];
      }

      // 并行生成所有选中的视角
      const results = await Promise.all(
        selectedViews.map(async (view, index) => {
          try {
            const result = await generateSubjectView.mutateAsync({
              subjectImageBase64: imageData,
              subjectImageMimeType: subjectFile?.type || "image/png",
              viewType: view.id as "closeup" | "halfbody" | "threeview" | "accessories",
              aspectRatio: view.aspectRatio as "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
            });
            return { view, result, index, nodeId: loadingNodes[index].id, success: true };
          } catch (error) {
            console.error(`Generate ${view.label} error:`, error);
            return { view, result: null, index, nodeId: loadingNodes[index].id, success: false };
          }
        })
      );

      // 更新节点状态（不自动识别，用户可手动点击 AI 识别按钮）
      for (const r of results) {
        if (r.success && r.result?.imageUrl) {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === r.nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      imageUrl: r.result!.imageUrl,
                      isLoading: false,
                      description: "", // 用户可手动点击 AI 识别
                    },
                  }
                : n
            )
          );
        } else {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === r.nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      isLoading: false,
                      loadingProgress: `${r.view.label}生成失败`,
                    },
                  }
                : n
            )
          );
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;
      
      // 更新当前节点的outputImage和outputImages
      const successResults = results.filter((r) => r.success && r.result?.imageUrl);
      if (successResults.length > 0 && nodeId) {
        const outputImages = successResults.map((r) => r.result!.imageUrl);
        const firstImage = outputImages[0];
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    outputImage: firstImage, // 第一张图片，用于单连接
                    outputImages: outputImages, // 所有图片数组
                  },
                }
              : n
          )
        );
      }
      
      if (successCount > 0) {
        toast.success(`成功生成 ${successCount} 个视角图片！`);
      }
      if (failedCount > 0) {
        toast.error(`${failedCount} 个视角生成失败`);
      }

    } catch (error) {
      console.error("Generate error:", error);
      toast.error("生成失败，请重试");
    } finally {
      setIsGenerating(false);
      setGeneratingViews([]);
    }
  }, [subjectImage, subjectFile, viewOptions, generateSubjectView, nodeId, getNode, addNodes, addEdges, setNodes]);

  // 计算选中数量
  const selectedCount = viewOptions.filter((opt) => opt.selected).length;

  return (
    <Card className="w-[380px] glass-panel-purple border-cyan-500/50 shadow-lg shadow-cyan-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <User className="w-5 h-5 text-cyan-400" />
          <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            主体形象固定
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 输入连接点 */}
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        />

        {/* 上传区域 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">主体图片</Label>
          {isLoadingFromCanvas ? (
            <div className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-cyan-500/50 rounded-lg bg-cyan-500/5">
              <Loader2 className="w-6 h-6 text-cyan-400 mb-2 animate-spin" />
              <span className="text-sm text-cyan-400">正在加载画布图片...</span>
            </div>
          ) : !subjectImage ? (
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-cyan-500/50 rounded-lg cursor-pointer hover:border-cyan-400/70 hover:bg-cyan-500/5 transition-colors">
              <UploadIcon className="w-6 h-6 text-cyan-400 mb-2" />
              <span className="text-sm text-muted-foreground">点击上传主体图片</span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </label>
          ) : (
            <div className="relative group inline-flex justify-center w-full">
              <img
                src={subjectImage}
                alt="主体"
                className="w-auto h-auto rounded-lg border border-cyan-500/30"
                style={{ maxWidth: '100%' }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-red-500/80 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={clearImage}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* 视角选择 */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">选择要生成的视角</Label>
          <div className="space-y-2">
            {viewOptions.map((option) => (
              <div
                key={option.id}
                onClick={() => toggleViewOption(option.id)}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                  option.selected
                    ? "border-cyan-500/50 bg-cyan-500/10"
                    : "border-transparent bg-white/5 hover:bg-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={option.id}
                    checked={option.selected}
                    onCheckedChange={() => toggleViewOption(option.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="border-cyan-500/50 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600 w-5 h-5"
                  />
                  <div className="text-sm select-none">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({option.description})
                    </span>
                  </div>
                </div>
                {option.selected && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={option.aspectRatio}
                      onValueChange={(value) => updateViewAspectRatio(option.id, value)}
                    >
                      <SelectTrigger className="w-[100px] h-7 text-xs bg-black/20 border-cyan-500/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASPECT_RATIOS.map((ratio) => (
                          <SelectItem key={ratio.value} value={ratio.value}>
                            {ratio.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 生成按钮 */}
        <Button
          onClick={handleGenerate}
          disabled={!subjectImage || selectedCount === 0 || isGenerating}
          className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中 ({generatingViews.length} 个视角)...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              生成 {selectedCount > 0 ? `(${selectedCount} 个视角)` : ""}
            </>
          )}
        </Button>

        {/* 输出连接点 */}
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        />
      </CardContent>
    </Card>
  );
}

export default SubjectMultiViewNode;
