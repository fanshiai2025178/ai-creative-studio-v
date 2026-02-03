import { memo, useState, useCallback, useRef, useEffect, DragEvent } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Upload, X, Download, Video, Loader2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface VideoDisplayNodeData {
  video?: string;
  videoUrl?: string;
  label?: string;
  isLoading?: boolean;
  loadingProgress?: string;
}

function VideoDisplayNode({ id, data }: NodeProps) {
  const nodeData = data as VideoDisplayNodeData;
  const [video, setVideo] = useState<string | null>(nodeData.video || nodeData.videoUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update video when data changes
  useEffect(() => {
    if (nodeData.videoUrl) {
      setVideo(nodeData.videoUrl);
    } else if (nodeData.video) {
      setVideo(nodeData.video);
    }
  }, [nodeData.videoUrl, nodeData.video]);

  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideo(url);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (video) {
      try {
        toast.success("开始下载...");
        const response = await fetch(video);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `video-${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error("Download error:", error);
        window.open(video, "_blank");
        toast.info("已在新窗口打开视频，请右键保存");
      }
    }
  }, [video]);

  const isLoading = nodeData.isLoading;
  const videoName = nodeData.label || "视频";

  return (
    <div className="w-64 glass-panel rounded-lg border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
          ) : (
            <Video className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-xs font-medium">{isLoading ? "生成中..." : videoName}</span>
        </div>
        {video && !isLoading && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleDownload}
          >
            <Download className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Content */}
      <div
        className="p-3 cursor-pointer"
        onClick={() => !video && !isLoading && fileInputRef.current?.click()}
      >
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 bg-accent/5 rounded-lg border border-accent/20">
            <Loader2 className="w-10 h-10 text-accent animate-spin mb-3" />
            <p className="text-sm text-accent font-medium">正在生成视频...</p>
            {nodeData.loadingProgress && (
              <p className="text-xs text-muted-foreground mt-1">{nodeData.loadingProgress}</p>
            )}
            <div className="mt-3 w-24 h-1 bg-accent/20 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent to-primary animate-pulse rounded-full" style={{ width: '60%' }} />
            </div>
          </div>
        ) : video ? (
          <div className="relative group">
            {/* 拖拽到时间轴的手柄 */}
            <div
              draggable
              onDragStart={(e: DragEvent<HTMLDivElement>) => {
                e.dataTransfer.setData("application/json", JSON.stringify({
                  type: "canvas-media",
                  mediaType: "video",
                  url: video,
                  thumbnail: video,
                  name: videoName,
                }));
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="absolute top-1 left-1 z-10 p-1 bg-background/80 rounded cursor-grab opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent/20"
              title="拖拽到时间轴"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </div>
            <video
              src={video}
              controls
              className="w-full h-auto rounded"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 bg-background/80"
              onClick={(e) => {
                e.stopPropagation();
                setVideo(null);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center hover:border-accent/50 transition-colors">
            <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">点击上传视频</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleVideoUpload}
          className="hidden"
        />
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-emerald-500 !border-2 !border-emerald-700"
        id="video-in"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-emerald-500 !border-2 !border-emerald-700"
        id="video-out"
      />
    </div>
  );
}

export default memo(VideoDisplayNode);
