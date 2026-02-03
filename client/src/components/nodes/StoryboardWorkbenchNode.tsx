import { useState, useCallback, useMemo, useContext } from "react";
import { Handle, Position, useReactFlow, useNodeId } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { CanvasContext } from "@/pages/Canvas";
import { 
  Film, 
  Camera, 
  Play, 
  Grid3X3, 
  Grid2X2, 
  Upload as UploadIcon, 
  Scissors, 
  Download,
  Eye,
  Loader2,
  ImageIcon,
  Sparkles,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  FolderUp
} from "lucide-react";
import { ImageActions } from "@/components/ImageActions";

interface ReferenceImage {
  url: string;
  type: "character" | "scene" | "element";
  description?: string;
  file?: File;
}

interface ExtractedImage {
  index: number;
  url: string;
  row: number;
  col: number;
}

export function StoryboardWorkbenchNode({ data }: { data: Record<string, unknown> }) {
  const nodeId = useNodeId();
  const { setNodes, addNodes, addEdges } = useReactFlow();
  const canvasContext = useContext(CanvasContext);
  
  // 状态管理
  const [mode, setMode] = useState<"multiAngle" | "actionSequence">("multiAngle");
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [gridSize, setGridSize] = useState<"2x2" | "3x3">("3x3");
  const [resolution, setResolution] = useState<"2k" | "4k">("4k");
  const [selectedAngles, setSelectedAngles] = useState<string[]>([]);
  const [actionType, setActionType] = useState("");
  
  // 生成结果
  const [gridImageUrl, setGridImageUrl] = useState<string | null>(null);
  const [extractedImages, setExtractedImages] = useState<ExtractedImage[]>([]);
  const [selectedCells, setSelectedCells] = useState<number[]>([]);
  
  // 加载状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  
  // 预览画廊状态
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [previewSource, setPreviewSource] = useState<"grid" | "extracted">("grid");

  // API mutations
  const generateMultiAngle = trpc.storyboardWorkbench.generateMultiAngleGrid.useMutation();
  const generateActionSequence = trpc.storyboardWorkbench.generateActionSequenceGrid.useMutation();
  const splitGrid = trpc.storyboardWorkbench.splitGridImage.useMutation();

  // 视角选项
  const angleOptions = [
    { value: "特写", label: "特写镜头" },
    { value: "中景", label: "中景镜头" },
    { value: "远景", label: "远景镜头" },
    { value: "低角度", label: "低角度仰拍" },
    { value: "高角度", label: "高角度俯拍" },
    { value: "顶视图", label: "顶视图/鸟瞰" },
    { value: "荷兰角", label: "荷兰角（倾斜）" },
    { value: "过肩", label: "过肩镜头" },
    { value: "主观视角", label: "主观视角" },
  ];

  // 动作类型选项
  const actionOptions = [
    { value: "walking", label: "行走" },
    { value: "running", label: "奔跑" },
    { value: "sitting", label: "坐下" },
    { value: "standing", label: "站立" },
    { value: "talking", label: "交谈" },
    { value: "fighting", label: "打斗" },
    { value: "emotional", label: "情绪表达" },
  ];

  // 从 Canvas 获取上游图片节点
  const availableImageNodes = useMemo(() => {
    if (!canvasContext) return [];
    return canvasContext.nodes.filter(
      (n) => n.type === "imageDisplay" && n.data?.imageUrl
    );
  }, [canvasContext?.nodes]);

  // 处理文件上传
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, type: ReferenceImage["type"]) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      // 创建本地预览 URL
      const url = URL.createObjectURL(file);
      setReferenceImages(prev => [...prev, { url, type, file }]);
    }
  }, []);

  // 从画布节点添加参考图
  const addFromNode = useCallback((nodeId: string, imageUrl: string) => {
    setReferenceImages(prev => [...prev, { url: imageUrl, type: "character" }]);
    toast.success("已添加参考图");
  }, []);

  // 移除参考图
  const removeReferenceImage = useCallback((index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 更新参考图类型
  const updateImageType = useCallback((index: number, type: ReferenceImage["type"]) => {
    setReferenceImages(prev => prev.map((img, i) => 
      i === index ? { ...img, type } : img
    ));
  }, []);

  // 生成九宫格
  const handleGenerate = useCallback(async () => {
    if (referenceImages.length === 0) {
      toast.error("请先上传参考图片");
      return;
    }
    if (!prompt.trim()) {
      toast.error("请输入场景描述");
      return;
    }

    setIsGenerating(true);
    try {
      const images = referenceImages.map(img => ({
        url: img.url,
        type: img.type,
        description: img.description,
      }));

      let result;
      if (mode === "multiAngle") {
        result = await generateMultiAngle.mutateAsync({
          referenceImages: images,
          prompt,
          gridSize,
          resolution,
          angles: selectedAngles.length > 0 ? selectedAngles : undefined,
        });
      } else {
        result = await generateActionSequence.mutateAsync({
          referenceImages: images,
          prompt,
          gridSize,
          resolution,
          actionType: actionType || undefined,
        });
      }

      if (result.gridImageUrl) {
        setGridImageUrl(result.gridImageUrl);
        setExtractedImages([]);
        setSelectedCells([]);
        toast.success("九宫格生成成功！");
      }
    } catch (error) {
      console.error("Generation error:", error);
      toast.error("生成失败，请重试");
    } finally {
      setIsGenerating(false);
    }
  }, [referenceImages, prompt, mode, gridSize, resolution, selectedAngles, actionType, generateMultiAngle, generateActionSequence]);

  // 切割九宫格
  const handleSplit = useCallback(async (extractAll: boolean = false) => {
    if (!gridImageUrl) {
      toast.error("请先生成九宫格图片");
      return;
    }

    const cellsToExtract = extractAll ? undefined : (selectedCells.length > 0 ? selectedCells : undefined);

    setIsSplitting(true);
    try {
      const result = await splitGrid.mutateAsync({
        gridImageUrl,
        gridSize,
        selectedCells: cellsToExtract,
      });

      setExtractedImages(result.extractedImages);
      toast.success(`成功提取 ${result.extractedImages.length} 个镜头`);
    } catch (error) {
      console.error("Split error:", error);
      toast.error("切割失败，请重试");
    } finally {
      setIsSplitting(false);
    }
  }, [gridImageUrl, gridSize, selectedCells, splitGrid]);

  // 将提取的图片添加到画布
  const addToCanvas = useCallback((imageUrl: string, index: number) => {
    if (!nodeId) return;

    const newNodeId = `imageDisplay-${Date.now()}-${index}`;
    const newNode = {
      id: newNodeId,
      type: "imageDisplay",
      position: { x: 600 + (index % 3) * 250, y: (Math.floor(index / 3)) * 250 },
      data: { imageUrl, label: `镜头 ${index + 1}` },
    };

    addNodes(newNode);
    addEdges({
      id: `edge-${nodeId}-${newNodeId}`,
      source: nodeId,
      target: newNodeId,
      sourceHandle: "output",
      targetHandle: "input",
    });

    toast.success(`镜头 ${index + 1} 已添加到画布`);
  }, [nodeId, addNodes, addEdges]);

  // 切换格子选中状态
  const toggleCellSelection = useCallback((index: number) => {
    setSelectedCells(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  }, []);

  const gridCount = gridSize === "3x3" ? 9 : 4;
  const cols = gridSize === "3x3" ? 3 : 2;

  // 打开预览画廊
  const openGallery = useCallback((index: number, source: "grid" | "extracted") => {
    setCurrentPreviewIndex(index);
    setPreviewSource(source);
    setGalleryOpen(true);
  }, []);

  // 关闭预览画廊
  const closeGallery = useCallback(() => {
    setGalleryOpen(false);
  }, []);

  // 切换到上一张
  const prevImage = useCallback(() => {
    const maxIndex = previewSource === "extracted" ? extractedImages.length - 1 : gridCount - 1;
    setCurrentPreviewIndex(prev => (prev > 0 ? prev - 1 : maxIndex));
  }, [previewSource, extractedImages.length, gridCount]);

  // 切换到下一张
  const nextImage = useCallback(() => {
    const maxIndex = previewSource === "extracted" ? extractedImages.length - 1 : gridCount - 1;
    setCurrentPreviewIndex(prev => (prev < maxIndex ? prev + 1 : 0));
  }, [previewSource, extractedImages.length, gridCount]);

  // 获取当前预览图片的 URL（从九宫格中计算裁剪区域）
  const getCurrentPreviewUrl = useCallback(() => {
    if (previewSource === "extracted") {
      return extractedImages[currentPreviewIndex]?.url || "";
    }
    // 对于九宫格预览，返回整个九宫格图片（实际显示时会用 CSS 裁剪）
    return gridImageUrl || "";
  }, [previewSource, currentPreviewIndex, extractedImages, gridImageUrl]);

  // 下载当前预览图片
  const downloadCurrentImage = useCallback(async () => {
    const url = previewSource === "extracted" 
      ? extractedImages[currentPreviewIndex]?.url 
      : gridImageUrl;
    if (!url) return;
    
    try {
      toast.success("图片下载中...");
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = previewSource === "extracted" 
        ? `镜头_${currentPreviewIndex + 1}.png`
        : `九宫格_${mode === "multiAngle" ? "多角度" : "连续动作"}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      window.open(url, "_blank");
      toast.info("已在新窗口打开图片，请右键保存");
    }
  }, [previewSource, currentPreviewIndex, extractedImages, gridImageUrl, mode]);

  return (
    <Card className="w-[420px] bg-gradient-to-br from-amber-950/90 to-orange-950/90 border-amber-500/50 shadow-lg shadow-amber-500/20">
      <Handle type="target" position={Position.Left} id="input" className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700" />
      <Handle type="source" position={Position.Right} id="output" className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700" />
      
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-amber-100">
          <Film className="w-5 h-5 text-amber-400" />
          影视分镜台
          <Badge variant="outline" className="ml-auto text-amber-300 border-amber-500/50">
            {mode === "multiAngle" ? "多角度" : "连续动作"}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 模式切换 */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as "multiAngle" | "actionSequence")}>
          <TabsList className="grid w-full grid-cols-2 bg-amber-900/50">
            <TabsTrigger value="multiAngle" className="data-[state=active]:bg-amber-600">
              <Camera className="w-4 h-4 mr-1" />
              多角度
            </TabsTrigger>
            <TabsTrigger value="actionSequence" className="data-[state=active]:bg-amber-600">
              <Play className="w-4 h-4 mr-1" />
              连续动作
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 参考图片上传 */}
        <div className="space-y-2">
          <Label className="text-amber-200 text-xs">参考图片</Label>
          <div className="flex flex-wrap gap-2">
            {referenceImages.map((img, i) => (
              <div key={i} className="relative group">
                <img 
                  src={img.url} 
                  alt={`参考图 ${i + 1}`}
                  className="w-16 h-16 object-cover rounded border border-amber-500/50"
                />
                <button
                  onClick={() => removeReferenceImage(i)}
                  className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <Select
                  value={img.type}
                  onValueChange={(v) => updateImageType(i, v as ReferenceImage["type"])}
                >
                  <SelectTrigger className="absolute bottom-0 left-0 right-0 h-5 text-[10px] bg-black/70 border-0 rounded-t-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="character">角色</SelectItem>
                    <SelectItem value="scene">场景</SelectItem>
                    <SelectItem value="element">元素</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
            
            {/* 上传按钮 */}
            <label className="w-16 h-16 flex flex-col items-center justify-center border-2 border-dashed border-amber-500/50 rounded cursor-pointer hover:border-amber-400 transition-colors">
              <UploadIcon className="w-5 h-5 text-amber-400" />
              <span className="text-[10px] text-amber-300 mt-1">上传</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFileUpload(e, "character")}
              />
            </label>
          </div>

          {/* 从画布节点添加 */}
          {availableImageNodes.length > 0 && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full text-xs border-amber-500/50 text-amber-200 hover:bg-amber-900/50">
                  <ImageIcon className="w-3 h-3 mr-1" />
                  从画布选择 ({availableImageNodes.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-amber-500/50">
                <DialogHeader>
                  <DialogTitle className="text-amber-100">选择画布中的图片</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                  {availableImageNodes.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => addFromNode(node.id, node.data.imageUrl as string)}
                      className="p-1 border border-amber-500/30 rounded hover:border-amber-400 transition-colors"
                    >
                      <img 
                        src={node.data.imageUrl as string} 
                        alt="画布图片"
                        className="w-full h-20 object-cover rounded"
                      />
                    </button>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* 场景描述 */}
        <div className="space-y-1">
          <Label className="text-amber-200 text-xs">
            {mode === "multiAngle" ? "场景描述" : "动作描述"}
          </Label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={mode === "multiAngle" 
              ? "描述场景和需要的视角，如：两个角色在客厅吵架，包含特写、低视角、顶视图..."
              : "描述连续动作，如：角色从站立到坐下的过程..."
            }
            className="h-20 text-xs bg-amber-900/30 border-amber-500/30 text-amber-100 placeholder:text-amber-400/50 resize-none"
          />
        </div>

        {/* 设置选项 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-amber-200 text-xs">格子数</Label>
            <Select value={gridSize} onValueChange={(v) => setGridSize(v as "2x2" | "3x3")}>
              <SelectTrigger className="h-8 text-xs bg-amber-900/30 border-amber-500/30 text-amber-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2x2">
                  <div className="flex items-center gap-1">
                    <Grid2X2 className="w-3 h-3" />
                    2×2 (4格)
                  </div>
                </SelectItem>
                <SelectItem value="3x3">
                  <div className="flex items-center gap-1">
                    <Grid3X3 className="w-3 h-3" />
                    3×3 (9格)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-amber-200 text-xs">分辨率</Label>
            <Select value={resolution} onValueChange={(v) => setResolution(v as "2k" | "4k")}>
              <SelectTrigger className="h-8 text-xs bg-amber-900/30 border-amber-500/30 text-amber-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2k">2K (2048×2048)</SelectItem>
                <SelectItem value="4k">4K (4096×4096)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 视角/动作选择 */}
        {mode === "multiAngle" ? (
          <div className="space-y-1">
            <Label className="text-amber-200 text-xs">视角选择（可选）</Label>
            <div className="flex flex-wrap gap-1">
              {angleOptions.slice(0, gridCount).map((angle) => (
                <Badge
                  key={angle.value}
                  variant={selectedAngles.includes(angle.value) ? "default" : "outline"}
                  className={`cursor-pointer text-[10px] ${
                    selectedAngles.includes(angle.value) 
                      ? "bg-amber-600 hover:bg-amber-700" 
                      : "border-amber-500/50 text-amber-300 hover:bg-amber-900/50"
                  }`}
                  onClick={() => {
                    setSelectedAngles(prev => 
                      prev.includes(angle.value)
                        ? prev.filter(a => a !== angle.value)
                        : [...prev, angle.value]
                    );
                  }}
                >
                  {angle.label}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-amber-200 text-xs">动作类型（可选）</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger className="h-8 text-xs bg-amber-900/30 border-amber-500/30 text-amber-100">
                <SelectValue placeholder="选择动作类型..." />
              </SelectTrigger>
              <SelectContent>
                {actionOptions.map((action) => (
                  <SelectItem key={action.value} value={action.value}>
                    {action.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 生成按钮 */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || referenceImages.length === 0 || !prompt.trim()}
          className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              生成{mode === "multiAngle" ? "多角度" : "连续动作"}九宫格
            </>
          )}
        </Button>

        {/* 生成结果预览 */}
        {gridImageUrl && (
          <div className="space-y-2 pt-2 border-t border-amber-500/30">
            <Label className="text-amber-200 text-xs flex items-center gap-2">
              <Eye className="w-3 h-3" />
              生成结果
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-5 px-2 text-[10px] text-amber-300 hover:text-amber-100 hover:bg-amber-900/50"
                onClick={() => openGallery(0, "grid")}
              >
                <Maximize2 className="w-3 h-3 mr-1" />
                全屏预览
              </Button>
            </Label>
            
            {/* 九宫格预览 */}
            <div className="relative">
              <img 
                src={gridImageUrl} 
                alt="九宫格结果"
                className="w-full rounded border border-amber-500/50"
              />
              
              {/* 格子选择覆盖层 */}
              <div 
                className="absolute inset-0 grid"
                style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
              >
                {Array.from({ length: gridCount }).map((_, i) => (
                  <button
                    key={i}
                    onClick={(e) => {
                      if (e.detail === 2) {
                        // 双击打开预览
                        openGallery(i, "grid");
                      } else {
                        // 单击选择
                        toggleCellSelection(i);
                      }
                    }}
                    className={`border border-white/20 transition-colors group ${
                      selectedCells.includes(i) 
                        ? "bg-amber-500/50" 
                        : "hover:bg-white/10"
                    }`}
                  >
                    {selectedCells.includes(i) ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="bg-amber-500 rounded-full p-1">
                          <span className="text-white text-xs font-bold">{selectedCells.indexOf(i) + 1}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ZoomIn className="w-4 h-4 text-white drop-shadow-lg" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* 切割操作 */}
            <div className="flex gap-2">
              <Button
                onClick={() => handleSplit(false)}
                disabled={isSplitting || selectedCells.length === 0}
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-amber-500/50 text-amber-200 hover:bg-amber-900/50"
              >
                {isSplitting ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Scissors className="w-3 h-3 mr-1" />
                )}
                提取选中 ({selectedCells.length})
              </Button>
              <Button
                onClick={() => handleSplit(true)}
                disabled={isSplitting}
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-amber-500/50 text-amber-200 hover:bg-amber-900/50"
              >
                {isSplitting ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Grid3X3 className="w-3 h-3 mr-1" />
                )}
                提取全部
              </Button>
            </div>
          </div>
        )}

        {/* 提取结果 */}
        {extractedImages.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-amber-500/30">
            <Label className="text-amber-200 text-xs flex items-center gap-2">
              <Download className="w-3 h-3" />
              已提取镜头 ({extractedImages.length})
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-5 px-2 text-[10px] text-amber-300 hover:text-amber-100 hover:bg-amber-900/50"
                onClick={() => openGallery(0, "extracted")}
              >
                <Maximize2 className="w-3 h-3 mr-1" />
                画廊预览
              </Button>
            </Label>
            <div className="grid grid-cols-3 gap-1">
              {extractedImages.map((img, idx) => (
                <div key={img.index} className="relative group">
                  <img 
                    src={img.url} 
                    alt={`镜头 ${img.index + 1}`}
                    className="w-full aspect-square object-cover rounded border border-amber-500/30 cursor-pointer"
                    onClick={() => openGallery(idx, "extracted")}
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center rounded gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openGallery(idx, "extracted");
                      }}
                      className="text-white text-[10px] hover:text-amber-300"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCanvas(img.url, img.index);
                      }}
                      className="text-white text-[10px] hover:text-amber-300"
                    >
                      添加到画布
                    </button>
                    <div onClick={(e) => e.stopPropagation()}>
                      <ImageActions
                        imageUrl={img.url}
                        imageName={`分镜_${img.index + 1}`}
                        variant="icons"
                        size="sm"
                      />
                    </div>
                  </div>
                  <Badge className="absolute top-0.5 left-0.5 text-[8px] px-1 py-0 bg-amber-600">
                    {img.index + 1}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 预览画廊弹窗 */}
        <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
          <DialogContent className="max-w-4xl w-[90vw] h-[85vh] bg-black/95 border-amber-500/50 p-0 flex flex-col">
            <DialogHeader className="p-4 pb-2 border-b border-amber-500/30">
              <DialogTitle className="text-amber-100 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-amber-400" />
                  {previewSource === "extracted" ? "镜头预览" : "九宫格预览"}
                  <Badge variant="outline" className="text-amber-300 border-amber-500/50">
                    {currentPreviewIndex + 1} / {previewSource === "extracted" ? extractedImages.length : gridCount}
                  </Badge>
                </span>
                <div className="flex items-center gap-2">
                  <ImageActions
                    imageUrl={previewSource === "extracted" 
                      ? (extractedImages[currentPreviewIndex]?.url || "") 
                      : (gridImageUrl || "")}
                    imageName={previewSource === "extracted" 
                      ? `分镜_${currentPreviewIndex + 1}` 
                      : `九宫格_${currentPreviewIndex + 1}`}
                    variant="buttons"
                    size="sm"
                  />
                  {previewSource === "extracted" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-amber-500/50 text-amber-200 hover:bg-amber-900/50"
                      onClick={() => {
                        const img = extractedImages[currentPreviewIndex];
                        if (img) {
                          addToCanvas(img.url, img.index);
                          closeGallery();
                        }
                      }}
                    >
                      <ImageIcon className="w-3 h-3 mr-1" />
                      添加到画布
                    </Button>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            
            {/* 图片预览区域 */}
            <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden">
              {/* 左箭头 */}
              <button
                onClick={prevImage}
                className="absolute left-4 z-10 p-2 rounded-full bg-black/50 hover:bg-amber-900/50 text-white transition-colors"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
              
              {/* 图片显示 */}
              <div className="max-w-full max-h-full flex items-center justify-center">
                {previewSource === "extracted" ? (
                  <img
                    src={extractedImages[currentPreviewIndex]?.url || ""}
                    alt={`镜头 ${currentPreviewIndex + 1}`}
                    className="max-w-full max-h-[calc(85vh-140px)] object-contain rounded-lg shadow-2xl"
                  />
                ) : (
                  <div className="relative">
                    <img
                      src={gridImageUrl || ""}
                      alt="九宫格"
                      className="max-w-full max-h-[calc(85vh-140px)] object-contain rounded-lg shadow-2xl"
                      style={{
                        clipPath: `inset(${Math.floor(currentPreviewIndex / cols) * (100 / cols)}% ${100 - ((currentPreviewIndex % cols) + 1) * (100 / cols)}% ${100 - (Math.floor(currentPreviewIndex / cols) + 1) * (100 / cols)}% ${(currentPreviewIndex % cols) * (100 / cols)}%)`
                      }}
                    />
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 px-3 py-1 rounded-full">
                      <span className="text-amber-300 text-sm">
                        格子 {currentPreviewIndex + 1} (行 {Math.floor(currentPreviewIndex / cols) + 1}, 列 {(currentPreviewIndex % cols) + 1})
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* 右箭头 */}
              <button
                onClick={nextImage}
                className="absolute right-4 z-10 p-2 rounded-full bg-black/50 hover:bg-amber-900/50 text-white transition-colors"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </div>
            
            {/* 缩略图导航 */}
            <div className="p-4 pt-2 border-t border-amber-500/30">
              <div className="flex gap-2 overflow-x-auto pb-2 justify-center">
                {previewSource === "extracted" ? (
                  extractedImages.map((img, idx) => (
                    <button
                      key={img.index}
                      onClick={() => setCurrentPreviewIndex(idx)}
                      className={`flex-shrink-0 w-16 h-16 rounded border-2 transition-colors overflow-hidden ${
                        idx === currentPreviewIndex
                          ? "border-amber-500"
                          : "border-transparent hover:border-amber-500/50"
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={`缩略图 ${img.index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))
                ) : (
                  Array.from({ length: gridCount }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentPreviewIndex(idx)}
                      className={`flex-shrink-0 w-16 h-16 rounded border-2 transition-colors overflow-hidden relative ${
                        idx === currentPreviewIndex
                          ? "border-amber-500"
                          : "border-transparent hover:border-amber-500/50"
                      }`}
                    >
                      <img
                        src={gridImageUrl || ""}
                        alt={`缩略图 ${idx + 1}`}
                        className="w-full h-full object-cover"
                        style={{
                          objectPosition: `${(idx % cols) * (100 / (cols - 1))}% ${Math.floor(idx / cols) * (100 / (cols - 1))}%`,
                          transform: `scale(${cols})`
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="text-white text-xs font-bold">{idx + 1}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
