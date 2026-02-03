import { useState, useCallback, useMemo, DragEvent } from "react";
import { Handle, Position, useReactFlow, useNodeId, Node } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { 
  Grid3X3, 
  Loader2,
  Download,
  ZoomIn,
  Layers,
  GripVertical,
} from "lucide-react";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface NineGridResultNodeData {
  gridImageUrl?: string;
  aspectRatio: "1:1" | "16:9" | "9:16";
  angles?: string[];
  isLoading?: boolean;
  loadingProgress?: string;
  isDynamic?: boolean; // 是否为动态九宫格
}

export function NineGridResultNode({ data }: { data: NineGridResultNodeData }) {
  const nodeId = useNodeId();
  const { addNodes, addEdges, getNode, setNodes } = useReactFlow();
  
  // 正在提取的格子索引
  const [extractingCells, setExtractingCells] = useState<Set<number>>(new Set());
  // 已提取的格子索引
  const [extractedCells, setExtractedCells] = useState<Set<number>>(new Set());

  // API mutations
  const extractAndUpscale = trpc.storyboardWorkbench.extractAndUpscaleCell.useMutation();
  const describeImage = trpc.storyboardWorkbench.describeImage.useMutation();

  // 默认视角列表
  const defaultAngles = [
    "特写镜头",
    "中景镜头",
    "远景镜头",
    "低角度仰拍",
    "高角度俯拍",
    "顶视图",
    "荷兰角",
    "过肩镜头",
    "主观视角",
  ];

  // 根据比例计算节点和图片尺寸 - 确保图片完整显示在框内
  const layoutConfig = useMemo(() => {
    // 九宫格布局：3x3
    // 节点宽度固定，图片高度根据比例自适应
    switch (data.aspectRatio) {
      case "16:9":
        // 横屏：整体九宫格是 16:9，每个格子也是 16:9
        return {
          nodeWidth: 420,
          imageWidth: 400,
          // 16:9 的九宫格，高度 = 宽度 * 9/16
          imageHeight: Math.round(400 * 9 / 16),
          cellAspect: "16:9",
          // 提取后的节点尺寸
          extractedNodeWidth: 320,
          extractedNodeHeight: 180,
        };
      case "9:16":
        // 竖屏：整体九宫格是 9:16，每个格子也是 9:16
        return {
          nodeWidth: 320,
          imageWidth: 300,
          // 9:16 的九宫格，高度 = 宽度 * 16/9
          imageHeight: Math.round(300 * 16 / 9),
          cellAspect: "9:16",
          // 提取后的节点尺寸
          extractedNodeWidth: 180,
          extractedNodeHeight: 320,
        };
      default:
        // 正方形：每个格子是 1:1
        return {
          nodeWidth: 380,
          imageWidth: 360,
          imageHeight: 360,
          cellAspect: "1:1",
          // 提取后的节点尺寸
          extractedNodeWidth: 256,
          extractedNodeHeight: 256,
        };
    }
  }, [data.aspectRatio]);

  // 点击数字按钮，提取并放大单格
  const handleCellClick = useCallback(async (cellIndex: number) => {
    if (extractingCells.has(cellIndex) || !data.gridImageUrl || data.isLoading) return;
    
    setExtractingCells(prev => new Set(prev).add(cellIndex));
    
    // 获取当前节点位置
    const currentNode = getNode(nodeId!);
    const currentX = currentNode?.position.x || 0;
    const currentY = currentNode?.position.y || 0;

    // 立即创建加载状态的图片节点
    const newNodeId = `cellImage-${Date.now()}-${cellIndex}`;
    const row = Math.floor(cellIndex / 3);
    const col = cellIndex % 3;
    
    // 根据比例计算偏移量
    const nodeSpacing = layoutConfig.extractedNodeWidth + 30;
    const offsetX = layoutConfig.nodeWidth + 80 + col * nodeSpacing;
    const rowHeight = layoutConfig.extractedNodeHeight + 80;
    const offsetY = row * rowHeight - rowHeight;

    const loadingNode = {
      id: newNodeId,
      type: "imageDisplay",
      position: { x: currentX + offsetX, y: currentY + offsetY },
      data: { 
        isLoading: true,
        loadingProgress: `正在提取镜头 ${cellIndex + 1}...`,
        label: `${defaultAngles[cellIndex] || `镜头 ${cellIndex + 1}`}`,
        aspectRatio: data.aspectRatio,
        nodeWidth: layoutConfig.extractedNodeWidth,
        nodeHeight: layoutConfig.extractedNodeHeight,
      },
    };

    // 立即添加节点和连线
    addNodes(loadingNode);
    addEdges({
      id: `edge-${nodeId}-${newNodeId}`,
      source: nodeId!,
      target: newNodeId,
      sourceHandle: `cell-${cellIndex}`,
      targetHandle: "input",
      style: { stroke: "#f472b6", strokeWidth: 2 },
      animated: true,
    });
    
    try {
      const result = await extractAndUpscale.mutateAsync({
        gridImageUrl: data.gridImageUrl,
        cellIndex,
        aspectRatio: data.aspectRatio,
      });

      // 更新节点数据（不自动识别，用户可手动点击 AI 识别按钮）
      const description = ""; // 用户可手动点击 AI 识别
      setNodes((nds: Node[]) => 
        nds.map((node: Node) => {
          if (node.id === newNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                imageUrl: result.upscaledUrl,
                label: `${result.angleName}`,
                isLoading: false,
                description: description || "",
              },
            };
          }
          return node;
        })
      );

      setExtractedCells(prev => new Set(prev).add(cellIndex));
      toast.success(`镜头 ${cellIndex + 1} 提取成功！`);
    } catch (error) {
      console.error("Extract error:", error);
      
      // 更新节点显示错误状态
      setNodes((nds: Node[]) => 
        nds.map((node: Node) => {
          if (node.id === newNodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                isLoading: false,
                loadingProgress: "提取失败",
              },
            };
          }
          return node;
        })
      );
      
      toast.error("提取失败，请重试");
    } finally {
      setExtractingCells(prev => {
        const newSet = new Set(prev);
        newSet.delete(cellIndex);
        return newSet;
      });
    }
  }, [data.gridImageUrl, data.aspectRatio, data.isLoading, extractAndUpscale, nodeId, getNode, addNodes, addEdges, setNodes, extractingCells, layoutConfig]);

  // 下载九宫格图片
  const handleDownload = useCallback(async () => {
    if (!data.gridImageUrl) return;
    try {
      toast.success("图片下载中...");
      const response = await fetch(data.gridImageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${data.isDynamic ? "动态九宫格" : "定格九宫格"}_${data.aspectRatio}_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      window.open(data.gridImageUrl, "_blank");
      toast.info("已在新窗口打开图片，请右键保存");
    }
  }, [data.gridImageUrl, data.aspectRatio, data.isDynamic]);

  const angles = data.angles || defaultAngles;

  // 计算数字按钮在图片上的叠加位置
  const getButtonPosition = (index: number) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    // 每个格子占 1/3
    const cellWidth = 100 / 3;
    const cellHeight = 100 / 3;
    return {
      left: `${col * cellWidth + cellWidth / 2}%`,
      top: `${row * cellHeight + cellHeight / 2}%`,
    };
  };

  return (
    <Card 
      className="bg-gradient-to-br from-pink-950/90 to-purple-950/90 border-pink-500/50 shadow-lg shadow-pink-500/20" 
      style={{ width: layoutConfig.nodeWidth }}
    >
      {/* 左侧输入 Handle */}
      <Handle type="target" position={Position.Left} id="input" className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700" />
      
      {/* 右侧为每个格子创建输出 Handle - 用于批量提取连接 */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
        <Handle 
          key={index}
          type="source" 
          position={Position.Right} 
          id={`cell-${index}`} 
          className="!w-3 !h-3 !bg-blue-500 !border-2 !border-blue-700"
          style={{ top: `${15 + index * 8}%` }}
        />
      ))}
      
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="flex items-center justify-between text-pink-100 text-sm">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-pink-400" />
            {data.isDynamic ? "动态九宫格结果" : "定格九宫格结果"}
            <span className="text-xs text-pink-400/70">({data.aspectRatio})</span>
          </div>
          <div className="flex gap-1">
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-pink-300 hover:text-pink-100 hover:bg-pink-900/50"
                  disabled={!data.gridImageUrl || data.isLoading}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl bg-gray-900 border-pink-500/50">
                <VisuallyHidden>
                  <DialogTitle>九宫格预览</DialogTitle>
                </VisuallyHidden>
                {data.gridImageUrl && (
                  <img 
                    src={data.gridImageUrl} 
                    alt="九宫格预览"
                    className="w-full h-auto rounded"
                  />
                )}
              </DialogContent>
            </Dialog>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-pink-300 hover:text-pink-100 hover:bg-pink-900/50"
              onClick={handleDownload}
              disabled={!data.gridImageUrl || data.isLoading}
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        {/* 九宫格图片或加载状态 - 带叠加数字按钮 */}
        <div 
          className="relative rounded overflow-hidden border border-pink-500/30 bg-black/20 mx-auto flex items-center justify-center"
          style={{ width: layoutConfig.imageWidth, height: layoutConfig.imageHeight }}
        >
          {data.isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-pink-950/50">
              <Loader2 className="w-12 h-12 text-pink-400 animate-spin mb-3" />
              <p className="text-pink-300 text-sm font-medium">生成中...</p>
              {data.loadingProgress && (
                <p className="text-pink-400/70 text-xs mt-1">{data.loadingProgress}</p>
              )}
              <div className="mt-3 w-32 h-1 bg-pink-900/50 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 animate-pulse rounded-full" style={{ width: '60%' }} />
              </div>
            </div>
          ) : data.gridImageUrl ? (
            <>
              {/* 拖拽到时间轴的手柄 */}
              <div
                draggable
                onDragStart={(e: DragEvent<HTMLDivElement>) => {
                  e.dataTransfer.setData("application/json", JSON.stringify({
                    type: "canvas-media",
                    mediaType: "image",
                    url: data.gridImageUrl,
                    thumbnail: data.gridImageUrl,
                    name: data.isDynamic ? "动态九宫格" : "定格九宫格",
                  }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="absolute top-2 left-2 z-20 p-1 bg-black/60 rounded cursor-grab hover:bg-pink-600/50 transition-colors"
                title="拖拽到时间轴"
              >
                <GripVertical className="w-4 h-4 text-white" />
              </div>
              <img 
                src={data.gridImageUrl} 
                alt="九宫格分镜"
                className="max-w-full max-h-full object-contain"
              />
              {/* 叠加的数字按钮 - 与九宫格位置对应 */}
              <div className="absolute inset-0">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => {
                  const pos = getButtonPosition(index);
                  const isExtracting = extractingCells.has(index);
                  const isExtracted = extractedCells.has(index);
                  
                  return (
                    <button
                      key={index}
                      onClick={() => handleCellClick(index)}
                      disabled={isExtracting || data.isLoading}
                      className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        isExtracted 
                          ? "bg-pink-600 text-white shadow-lg shadow-pink-500/50" 
                          : isExtracting
                            ? "bg-pink-800/80 text-pink-200"
                            : "bg-black/60 text-white hover:bg-pink-600/80 hover:scale-110"
                      }`}
                      style={{ left: pos.left, top: pos.top }}
                    >
                      {isExtracting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        index + 1
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-pink-950/30 text-pink-400/50">
              等待生成...
            </div>
          )}
        </div>

        {/* 批量提取按钮 */}
        {data.gridImageUrl && !data.isLoading && (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-pink-500/50 text-pink-300 hover:bg-pink-600/30 hover:text-white"
            onClick={async () => {
              // 批量提取所有未提取的镜头
              const unextracted = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(i => !extractedCells.has(i) && !extractingCells.has(i));
              if (unextracted.length === 0) {
                toast.info("所有镜头已提取完成");
                return;
              }
              toast.info(`开始批量提取 ${unextracted.length} 个镜头...`);
              // 依次提取每个镜头
              for (const cellIndex of unextracted) {
                await handleCellClick(cellIndex);
                // 添加小延迟避免请求过快
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }}
            disabled={extractingCells.size > 0}
          >
            <Layers className="w-4 h-4 mr-2" />
            一键提取全部镜头 ({9 - extractedCells.size})
          </Button>
        )}

        {/* 提示文字 */}
        <p className="text-[10px] text-pink-400/70 text-center">
          点击数字提取单个镜头，或一键提取全部
        </p>

        {/* 视角说明 */}
        <div className="text-[9px] text-pink-400/60 space-y-0.5">
          <p className="font-medium text-pink-300/80">视角对应：</p>
          <div className="grid grid-cols-3 gap-x-1 gap-y-0.5">
            {angles.slice(0, 9).map((angle, i) => (
              <span key={i} className="truncate">{i + 1}. {angle.replace(/（.*）/, "")}</span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
