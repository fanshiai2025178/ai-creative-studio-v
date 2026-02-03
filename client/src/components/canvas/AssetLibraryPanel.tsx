import { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  X,
  Upload,
  Search,
  User,
  Mountain,
  Package,
  Zap,
  Palette,
  Trash2,
  Download,
  Loader2,
  ImageIcon,
  ZoomIn,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface AssetLibraryPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectAsset: (asset: { url: string; name: string; category: string }) => void;
}

type AssetCategory = "subject" | "scene" | "prop" | "action" | "style";

const categoryConfig: Record<AssetCategory, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  subject: { label: "角色库", icon: User, color: "text-cyan-400" },
  scene: { label: "场景库", icon: Mountain, color: "text-green-400" },
  prop: { label: "道具库", icon: Package, color: "text-yellow-400" },
  action: { label: "动作库", icon: Zap, color: "text-orange-400" },
  style: { label: "风格库", icon: Palette, color: "text-pink-400" },
};

const categories: AssetCategory[] = ["subject", "scene", "prop", "action", "style"];

export default function AssetLibraryPanel({ open, onClose, onSelectAsset }: AssetLibraryPanelProps) {
  const [activeCategory, setActiveCategory] = useState<AssetCategory>("subject");
  const [searchQuery, setSearchQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  // Fetch assets from database with search
  const { data: assets, isLoading, refetch } = trpc.assetLibrary.list.useQuery(
    { category: activeCategory, search: searchQuery || undefined },
    { enabled: open }
  );

  // Fetch counts for all categories
  const { data: counts } = trpc.assetLibrary.getCounts.useQuery(undefined, { enabled: open });

  // Upload mutation
  const uploadMutation = trpc.assetLibrary.upload.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("上传成功", { description: "素材已添加到资产库" });
    },
    onError: (error) => {
      toast.error("上传失败", { description: error.message });
    },
  });

  // Delete mutation
  const deleteMutation = trpc.assetLibrary.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("删除成功");
    },
    onError: (error) => {
      toast.error("删除失败", { description: error.message });
    },
  });

  // Handle file upload
  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        await uploadMutation.mutateAsync({
          category: activeCategory,
          name: file.name.replace(/\.[^/.]+$/, ""),
          imageBase64: base64,
          mimeType: file.type,
        });
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setUploading(false);
    }
    // Reset input
    e.target.value = "";
  }, [activeCategory, uploadMutation]);

  // Handle double click to load asset
  const handleDoubleClick = useCallback((asset: { id: number; name: string; imageUrl: string; category: string }) => {
    onSelectAsset({
      url: asset.imageUrl,
      name: asset.name,
      category: asset.category,
    });
    toast.success("已加载到画布", { description: asset.name });
  }, [onSelectAsset]);

  // Debounced search - filter happens on server now
  const filteredAssets = assets || [];

  if (!open) return null;

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 w-[900px] max-w-[95vw]">
      <div className="glass-panel-purple rounded-xl border border-purple-500/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-purple-500/30 bg-purple-900/30">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">资产库</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-purple-800/50">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Category Tabs - Horizontal scrollable */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            {categories.map((cat) => {
              const { label, icon: Icon, color } = categoryConfig[cat];
              const count = counts?.[cat] || 0;
              const isActive = activeCategory === cat;
              
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg transition-all whitespace-nowrap",
                    isActive 
                      ? "bg-purple-600/50 border border-purple-400/50" 
                      : "bg-purple-900/30 border border-purple-500/20 hover:bg-purple-800/40"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-white" : color)} />
                  <span className={cn("text-sm font-medium", isActive ? "text-white" : "text-purple-200")}>
                    {label}
                  </span>
                  <span className={cn(
                    "text-xs px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-purple-400/30 text-white" : "bg-purple-900/50 text-purple-300"
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search and Upload */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索素材名称或标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-purple-900/20 border-purple-500/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <label>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button
                variant="outline"
                className="border-purple-500/50 hover:bg-purple-600/30"
                disabled={uploading}
                asChild
              >
                <span>
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  上传素材
                </span>
              </Button>
            </label>
          </div>

          {/* Search hint */}
          {searchQuery && (
            <div className="flex items-center gap-2 mb-3 text-xs text-purple-400/70">
              <Tag className="w-3 h-3" />
              <span>搜索 "{searchQuery}" · 找到 {filteredAssets.length} 个结果</span>
            </div>
          )}

          {/* Assets Grid */}
          <ScrollArea className="h-[400px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <ImageIcon className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-lg mb-1">{searchQuery ? "未找到匹配素材" : "暂无资产"}</p>
                <p className="text-sm text-purple-400/70">
                  {searchQuery ? "尝试其他关键词或清除搜索" : "在画布中生成图片后，可以保存到资产库"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-5 gap-4">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-purple-500/30 bg-purple-900/20 cursor-pointer hover:border-purple-400/60 hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                    onDoubleClick={() => handleDoubleClick(asset)}
                  >
                    <img
                      src={asset.imageUrl}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                      <p className="text-xs text-white text-center px-2 truncate w-full font-medium">
                        {asset.name}
                      </p>
                      <p className="text-xs text-purple-300">双击加载到画布</p>
                      <div className="flex gap-2 mt-1">
                        {/* Preview button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white hover:bg-white/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage({ url: asset.imageUrl, name: asset.name });
                          }}
                        >
                          <ZoomIn className="w-4 h-4" />
                        </Button>
                        {/* Download button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white hover:bg-white/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            const link = document.createElement("a");
                            link.href = asset.imageUrl;
                            link.download = `${asset.name}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            toast.success("下载中...");
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        {/* Delete button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400 hover:bg-red-500/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("确定要删除这个素材吗？")) {
                              deleteMutation.mutate({ id: asset.id });
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-purple-500/30 bg-purple-900/20">
          <p className="text-xs text-muted-foreground text-center">
            双击素材可快速加载到画布 · 共 {counts?.total || 0} 个素材
          </p>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl bg-gray-900/95 border-purple-500/50 p-2">
          {previewImage && (
            <div className="relative">
              <img 
                src={previewImage.url} 
                alt={previewImage.name}
                className="w-full h-auto max-h-[80vh] object-contain rounded"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <p className="text-white font-medium">{previewImage.name}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
