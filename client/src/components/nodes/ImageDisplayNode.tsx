import { memo, useState, useCallback, useRef, useEffect, DragEvent } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, X, Image, Loader2, Sparkles, GripVertical } from "lucide-react";
import { ImageActions } from "@/components/ImageActions";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ImageDisplayNodeData {
  image?: string;
  imageUrl?: string;
  label?: string;
  isLoading?: boolean;
  loadingProgress?: string;
  // 自适应尺寸相关
  autoSize?: boolean;
  aspectRatio?: string; // "1:1" | "16:9" | "9:16"
  nodeWidth?: number;
  nodeHeight?: number;
  // AI 描述
  description?: string;
}

function ImageDisplayNode({ id, data }: NodeProps) {
  const nodeData = data as ImageDisplayNodeData;
  const [image, setImage] = useState<string | null>(nodeData.image || nodeData.imageUrl || null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [description, setDescription] = useState<string>(nodeData.description || "");
  const [isDescribing, setIsDescribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setNodes } = useReactFlow();

  // API mutation for image description
  const describeImage = trpc.storyboardWorkbench.describeImage.useMutation();

  // Helper function to convert blob URL to data URL
  const convertBlobToDataUrl = useCallback(async (blobUrl: string): Promise<string> => {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }, []);

  // Update image when data changes (e.g., from connected nodes)
  useEffect(() => {
    if (nodeData.imageUrl) {
      setImage(nodeData.imageUrl);
    } else if (nodeData.image) {
      setImage(nodeData.image);
    }
  }, [nodeData.imageUrl, nodeData.image]);

  // Update description when data changes
  useEffect(() => {
    if (nodeData.description) {
      setDescription(nodeData.description);
    }
  }, [nodeData.description]);

  // 当图片加载完成时，获取其尺寸
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const aspectRatio = naturalWidth / naturalHeight;
    
    // 如果有预设的节点尺寸，使用预设尺寸
    if (nodeData.nodeWidth && nodeData.nodeHeight) {
      setImageSize({ width: nodeData.nodeWidth, height: nodeData.nodeHeight });
      return;
    }
    
    // 设置合理的显示尺寸
    // 基础宽度 256px，根据比例调整
    let displayWidth = 256;
    let displayHeight = displayWidth / aspectRatio;
    
    // 如果高度太大，限制最大高度
    const maxHeight = 400;
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * aspectRatio;
    }
    
    // 如果高度太小，设置最小高度
    const minHeight = 100;
    if (displayHeight < minHeight) {
      displayHeight = minHeight;
      displayWidth = displayHeight * aspectRatio;
    }
    
    // 限制最大宽度
    const maxWidth = 400;
    if (displayWidth > maxWidth) {
      displayWidth = maxWidth;
      displayHeight = displayWidth / aspectRatio;
    }
    
    setImageSize({ width: displayWidth, height: displayHeight });
  }, [nodeData.nodeWidth, nodeData.nodeHeight]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImage(e.target?.result as string);
        // 重置尺寸，让新图片重新计算
        setImageSize(null);
        // 清空描述
        setDescription("");
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // AI 识别图片内容
  const handleDescribeImage = useCallback(async () => {
    if (!image || isDescribing) return;
    
    setIsDescribing(true);
    try {
      // Convert blob URL to data URL if needed
      let imageToSend = image;
      if (image.startsWith('blob:')) {
        imageToSend = await convertBlobToDataUrl(image);
      }
      
      const result = await describeImage.mutateAsync({ imageUrl: imageToSend });
      setDescription(result.description);
      toast.success("AI 识别完成");
    } catch (error) {
      console.error("Describe error:", error);
      toast.error("AI 识别失败");
    } finally {
      setIsDescribing(false);
    }
  }, [image, isDescribing, describeImage, convertBlobToDataUrl]);

  const imageName = nodeData.label || `图片_${id}`;
  const isLoading = nodeData.isLoading;

  // 计算节点宽度
  const nodeWidth = imageSize?.width ? Math.max(imageSize.width + 24, 200) : (nodeData.nodeWidth ? nodeData.nodeWidth + 24 : 256);

  return (
    <div 
      className="glass-panel rounded-lg border border-border/50 overflow-hidden transition-all duration-200"
      style={{ width: nodeWidth }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
          ) : (
            <Image className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="text-xs font-medium truncate">{isLoading ? "生成中..." : imageName}</span>
        </div>
        {image && !isLoading && (
          <ImageActions
            imageUrl={image}
            imageName={imageName}
            variant="dropdown"
            size="sm"
          />
        )}
      </div>

      {/* Content */}
      <div
        className="p-3 cursor-pointer"
        onClick={() => !image && !isLoading && fileInputRef.current?.click()}
      >
        {isLoading ? (
          <div 
            className="flex flex-col items-center justify-center bg-primary/5 rounded-lg border border-primary/20"
            style={{ 
              minHeight: nodeData.nodeHeight || 150,
              height: nodeData.nodeHeight || 'auto',
            }}
          >
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
            <p className="text-sm text-primary font-medium">正在生成...</p>
            {nodeData.loadingProgress && (
              <p className="text-xs text-muted-foreground mt-1">{nodeData.loadingProgress}</p>
            )}
            <div className="mt-3 w-24 h-1 bg-primary/20 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-accent animate-pulse rounded-full" style={{ width: '60%' }} />
            </div>
          </div>
        ) : image ? (
          <div className="relative group">
            {/* 拖拽到时间轴的手柄 */}
            <div
              draggable
              onDragStart={(e: DragEvent<HTMLDivElement>) => {
                e.dataTransfer.setData("application/json", JSON.stringify({
                  type: "canvas-media",
                  mediaType: "image",
                  url: image,
                  thumbnail: image,
                  name: imageName,
                }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="absolute top-1 left-1 z-10 p-1 bg-background/80 rounded cursor-grab opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
              title="拖拽到时间轴"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            <img
              src={image}
              alt="Display"
              className="w-full h-auto rounded object-contain"
              onLoad={handleImageLoad}
              style={imageSize ? { maxHeight: imageSize.height } : undefined}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setImage(null);
                setImageSize(null);
                setDescription("");
              }}
            >
              <X className="w-4 h-4" />
            </Button>
            {/* Hover overlay with actions */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ImageActions
                imageUrl={image}
                imageName={imageName}
                variant="icons"
                size="sm"
              />
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
            <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">点击上传图片</p>
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

      {/* AI 描述区域 - 仅在有图片且不在加载中时显示 */}
      {image && !isLoading && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">内容描述</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={handleDescribeImage}
              disabled={isDescribing}
            >
              {isDescribing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              AI 识别
            </Button>
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="点击「AI 识别」自动生成，或手动输入描述..."
            className="text-xs min-h-[60px] resize-none bg-muted/30 border-muted-foreground/20 focus:border-primary/50"
            rows={3}
          />
        </div>
      )}

      {/* Handles - 左侧只保留一个输入 Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        id="input"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-blue-500 !border-2 !border-blue-700"
        id="image-out"
      />
    </div>
  );
}

export default memo(ImageDisplayNode);
