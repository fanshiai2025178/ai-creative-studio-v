import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { UploadToLibraryDialog } from "./UploadToLibraryDialog";
import { toast } from "sonner";
import { Download, FolderPlus, MoreVertical, ZoomIn } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface ImageActionsProps {
  imageUrl: string;
  imageName?: string;
  className?: string;
  variant?: "buttons" | "dropdown" | "icons";
  size?: "sm" | "md" | "lg";
  onUploadSuccess?: () => void;
}

export function ImageActions({
  imageUrl,
  imageName = "image",
  className = "",
  variant = "icons",
  size = "sm",
  onUploadSuccess
}: ImageActionsProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Download image
  const handleDownload = useCallback(async () => {
    try {
      toast.success("开始下载...");
      
      // 尝试使用 fetch 下载图片（解决跨域问题）
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // 创建 blob URL 并下载
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${imageName}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 释放 blob URL
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      // 如果 fetch 失败，回退到直接打开新窗口
      window.open(imageUrl, "_blank");
      toast.info("已在新窗口打开图片，请右键保存");
    }
  }, [imageUrl, imageName]);

  // Open upload dialog
  const handleUploadClick = useCallback(() => {
    setUploadDialogOpen(true);
  }, []);

  // Open preview
  const handlePreview = useCallback(() => {
    setPreviewOpen(true);
  }, []);

  const iconSize = size === "sm" ? "w-3 h-3" : size === "md" ? "w-4 h-4" : "w-5 h-5";
  const buttonSize = size === "sm" ? "h-6 px-2" : size === "md" ? "h-8 px-3" : "h-10 px-4";

  if (variant === "dropdown") {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={`${buttonSize} text-gray-400 hover:text-cyan-300 hover:bg-cyan-900/30 ${className}`}
            >
              <MoreVertical className={iconSize} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-gray-800 border-cyan-500/30">
            <DropdownMenuItem
              onClick={handlePreview}
              className="text-cyan-100 focus:bg-cyan-900/50 cursor-pointer"
            >
              <ZoomIn className="w-4 h-4 mr-2" />
              预览放大
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleDownload}
              className="text-cyan-100 focus:bg-cyan-900/50 cursor-pointer"
            >
              <Download className="w-4 h-4 mr-2" />
              下载到本地
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleUploadClick}
              className="text-cyan-100 focus:bg-cyan-900/50 cursor-pointer"
            >
              <FolderPlus className="w-4 h-4 mr-2" />
              保存到资产库
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <UploadToLibraryDialog
          isOpen={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          imageUrl={imageUrl}
          defaultName={imageName}
          onSuccess={onUploadSuccess}
        />

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl bg-gray-900/95 border-cyan-500/50 p-2">
            <VisuallyHidden>
              <DialogTitle>图片预览 - {imageName}</DialogTitle>
            </VisuallyHidden>
            <div className="relative">
              <img 
                src={imageUrl} 
                alt={imageName}
                className="w-full h-auto max-h-[80vh] object-contain rounded"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <p className="text-white font-medium">{imageName}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (variant === "buttons") {
    return (
      <>
        <div className={`flex items-center gap-1 ${className}`}>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            className={`${buttonSize} border-cyan-500/50 text-cyan-200 hover:bg-cyan-900/50`}
          >
            <ZoomIn className={`${iconSize} mr-1`} />
            预览
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className={`${buttonSize} border-cyan-500/50 text-cyan-200 hover:bg-cyan-900/50`}
          >
            <Download className={`${iconSize} mr-1`} />
            下载
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUploadClick}
            className={`${buttonSize} border-cyan-500/50 text-cyan-200 hover:bg-cyan-900/50`}
          >
            <FolderPlus className={`${iconSize} mr-1`} />
            保存
          </Button>
        </div>

        <UploadToLibraryDialog
          isOpen={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          imageUrl={imageUrl}
          defaultName={imageName}
          onSuccess={onUploadSuccess}
        />

        {/* Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl bg-gray-900/95 border-cyan-500/50 p-2">
            <VisuallyHidden>
              <DialogTitle>图片预览 - {imageName}</DialogTitle>
            </VisuallyHidden>
            <div className="relative">
              <img 
                src={imageUrl} 
                alt={imageName}
                className="w-full h-auto max-h-[80vh] object-contain rounded"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <p className="text-white font-medium">{imageName}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Default: icons variant
  return (
    <>
      <div className={`flex items-center gap-1 ${className}`}>
        <button
          onClick={handlePreview}
          className="p-1.5 rounded-full bg-black/50 hover:bg-cyan-900/70 text-white transition-colors"
          title="预览放大"
        >
          <ZoomIn className={iconSize} />
        </button>
        <button
          onClick={handleDownload}
          className="p-1.5 rounded-full bg-black/50 hover:bg-cyan-900/70 text-white transition-colors"
          title="下载到本地"
        >
          <Download className={iconSize} />
        </button>
        <button
          onClick={handleUploadClick}
          className="p-1.5 rounded-full bg-black/50 hover:bg-cyan-900/70 text-white transition-colors"
          title="保存到资产库"
        >
          <FolderPlus className={iconSize} />
        </button>
      </div>

      <UploadToLibraryDialog
        isOpen={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        imageUrl={imageUrl}
        defaultName={imageName}
        onSuccess={onUploadSuccess}
      />

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl bg-gray-900/95 border-cyan-500/50 p-2">
          <VisuallyHidden>
            <DialogTitle>图片预览 - {imageName}</DialogTitle>
          </VisuallyHidden>
          <div className="relative">
            <img 
              src={imageUrl} 
              alt={imageName}
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <p className="text-white font-medium">{imageName}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
