import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  FolderOpen,
  Image as ImageIcon,
  Mountain,
  Box,
  Zap,
  Palette,
  Download,
  Trash2,
  Upload,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Edit2,
  Check,
  User,
  Send
} from "lucide-react";

// Updated categories: subject(角色库), scene(场景库), prop(道具库), action(动作库), style(风格库)
type Category = "subject" | "scene" | "prop" | "action" | "style";

interface AssetLibraryItem {
  id: number;
  userId: number;
  category: Category;
  name: string;
  description: string | null;
  imageUrl: string;
  imageKey: string;
  thumbnailUrl: string | null;
  mimeType: string | null;
  size: number | null;
  tags: unknown;
  metadata: unknown;
  isFavorite: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface AssetLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset?: (asset: AssetLibraryItem) => void;
  selectionMode?: boolean;
  onSendToCanvas?: (imageUrl: string, name: string) => void;
}

const categoryConfig: Record<Category, { label: string; icon: React.ReactNode; color: string }> = {
  subject: { label: "角色库", icon: <User className="w-4 h-4" />, color: "text-cyan-400" },
  scene: { label: "场景库", icon: <Mountain className="w-4 h-4" />, color: "text-green-400" },
  prop: { label: "道具库", icon: <Box className="w-4 h-4" />, color: "text-yellow-400" },
  action: { label: "动作库", icon: <Zap className="w-4 h-4" />, color: "text-orange-400" },
  style: { label: "风格库", icon: <Palette className="w-4 h-4" />, color: "text-pink-400" },
};

export function AssetLibrary({ isOpen, onClose, onSelectAsset, selectionMode = false, onSendToCanvas }: AssetLibraryProps) {
  const [activeCategory, setActiveCategory] = useState<Category>("subject");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewAsset, setPreviewAsset] = useState<AssetLibraryItem | null>(null);
  const [editingAsset, setEditingAsset] = useState<AssetLibraryItem | null>(null);
  const [editName, setEditName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: assets, isLoading, refetch } = trpc.assetLibrary.list.useQuery(
    { category: activeCategory },
    { enabled: isOpen }
  );
  const { data: counts } = trpc.assetLibrary.getCounts.useQuery(undefined, { enabled: isOpen });

  // Mutations
  const deleteMutation = trpc.assetLibrary.delete.useMutation({
    onSuccess: () => {
      toast.success("资产已删除");
      refetch();
    },
    onError: (error) => {
      toast.error(`删除失败: ${error.message}`);
    },
  });

  const updateMutation = trpc.assetLibrary.update.useMutation({
    onSuccess: () => {
      toast.success("资产已更新");
      setEditingAsset(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`更新失败: ${error.message}`);
    },
  });

  const uploadMutation = trpc.assetLibrary.upload.useMutation({
    onSuccess: () => {
      toast.success("上传成功");
      refetch();
    },
    onError: (error) => {
      toast.error(`上传失败: ${error.message}`);
    },
  });

  // Handle file upload
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} 不是图片文件`);
        failCount++;
        continue;
      }

      try {
        // Convert to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data:image/xxx;base64, prefix
            const base64Data = result.split(",")[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Get file name without extension
        const name = file.name.replace(/\.[^/.]+$/, "");

        // Upload
        await uploadMutation.mutateAsync({
          category: activeCategory,
          name,
          imageBase64: base64,
          mimeType: file.type,
        });

        successCount++;
      } catch (error) {
        console.error("Upload error:", error);
        failCount++;
      }
    }

    setIsUploading(false);
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (successCount > 0 && failCount === 0) {
      toast.success(`成功上传 ${successCount} 张图片`);
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(`上传完成: ${successCount} 成功, ${failCount} 失败`);
    }
  }, [activeCategory, uploadMutation]);

  // Filter assets by search query
  const filteredAssets = assets?.filter((asset) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      asset.name.toLowerCase().includes(query) ||
      asset.description?.toLowerCase().includes(query) ||
      (Array.isArray(asset.tags) && asset.tags.some((tag: string) => tag.toLowerCase().includes(query)))
    );
  });

  // Download asset
  const handleDownload = useCallback(async (asset: AssetLibraryItem) => {
    try {
      toast.success("开始下载...");
      const response = await fetch(asset.imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${asset.name}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Download error:", error);
      window.open(asset.imageUrl, "_blank");
      toast.info("已在新窗口打开图片，请右键保存");
    }
  }, []);

  // Delete asset
  const handleDelete = useCallback((asset: AssetLibraryItem) => {
    if (confirm(`确定要删除 "${asset.name}" 吗？`)) {
      deleteMutation.mutate({ id: asset.id });
    }
  }, [deleteMutation]);

  // Start editing
  const handleStartEdit = useCallback((asset: AssetLibraryItem) => {
    setEditingAsset(asset);
    setEditName(asset.name);
  }, []);

  // Save edit
  const handleSaveEdit = useCallback(() => {
    if (editingAsset && editName.trim()) {
      updateMutation.mutate({ id: editingAsset.id, name: editName.trim() });
    }
  }, [editingAsset, editName, updateMutation]);

  // Select asset (for selection mode)
  const handleSelectAsset = useCallback((asset: AssetLibraryItem) => {
    if (selectionMode && onSelectAsset) {
      onSelectAsset(asset);
      onClose();
    } else {
      setPreviewAsset(asset);
    }
  }, [selectionMode, onSelectAsset, onClose]);

  // Navigate preview
  const navigatePreview = useCallback((direction: "prev" | "next") => {
    if (!previewAsset || !filteredAssets) return;
    const currentIndex = filteredAssets.findIndex((a) => a.id === previewAsset.id);
    if (currentIndex === -1) return;
    
    const newIndex = direction === "prev"
      ? (currentIndex - 1 + filteredAssets.length) % filteredAssets.length
      : (currentIndex + 1) % filteredAssets.length;
    
    setPreviewAsset(filteredAssets[newIndex]);
  }, [previewAsset, filteredAssets]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[1600px] w-[98vw] h-[85vh] bg-gradient-to-br from-purple-950/95 to-gray-950/95 backdrop-blur-xl border-purple-500/40 p-0 flex flex-col">
        <DialogHeader className="p-4 pb-2 border-b border-purple-500/30">
          <DialogTitle className="text-purple-100 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-purple-400" />
            资产库
            {selectionMode && (
              <Badge variant="outline" className="ml-2 text-purple-300 border-purple-500/50">
                选择模式
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Category Tabs */}
          <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as Category)} className="flex-1 flex flex-col">
            <div className="px-4 pt-2 border-b border-purple-500/30 space-y-3 pb-3">
              {/* Category Tabs */}
              <TabsList className="bg-purple-900/50 border border-purple-500/30 h-auto p-1">
                {(Object.keys(categoryConfig) as Category[]).map((cat) => (
                  <TabsTrigger
                    key={cat}
                    value={cat}
                    className="data-[state=active]:bg-cyan-600/30 data-[state=active]:text-cyan-100 px-2 py-1.5 text-sm"
                  >
                    <span className={`flex items-center gap-1 ${categoryConfig[cat].color}`}>
                      {categoryConfig[cat].icon}
                      {categoryConfig[cat].label}
                      {counts && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0 bg-gray-700">
                          {counts[cat]}
                        </Badge>
                      )}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Search and Upload Row */}
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="搜索资产..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-gray-800/50 border-cyan-500/20 text-cyan-100 placeholder:text-gray-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cyan-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Upload Button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="border-cyan-500/50 text-cyan-200 hover:bg-cyan-900/50 whitespace-nowrap"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      上传中...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      本地上传
                    </>
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>

            {/* Asset Grid */}
            {(Object.keys(categoryConfig) as Category[]).map((cat) => (
              <TabsContent key={cat} value={cat} className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                      </div>
                    ) : filteredAssets && filteredAssets.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {filteredAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="group relative bg-gray-800/50 rounded-lg border border-cyan-500/20 overflow-hidden hover:border-cyan-500/50 transition-colors cursor-pointer"
                            onClick={() => handleSelectAsset(asset)}
                          >
                            {/* Image */}
                            <div className="aspect-[3/4] relative bg-gray-900/80">
                              <img
                                src={asset.thumbnailUrl || asset.imageUrl}
                                alt={asset.name}
                                className="w-full h-full object-contain"
                              />
                              
                              {/* 底部操作栏 - 悬停时显示 */}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="flex items-center justify-center gap-1 p-2">
                                  {onSendToCanvas && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSendToCanvas(asset.imageUrl, asset.name);
                                        toast.success(`已发送「${asset.name}」到画布`);
                                      }}
                                      className="p-1.5 rounded bg-purple-600/90 hover:bg-purple-500 text-white transition-colors"
                                      title="发送到画布"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownload(asset);
                                    }}
                                    className="p-1.5 rounded bg-cyan-600/90 hover:bg-cyan-500 text-white transition-colors"
                                    title="下载"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(asset);
                                    }}
                                    className="p-1.5 rounded bg-red-600/90 hover:bg-red-500 text-white transition-colors"
                                    title="删除"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Info */}
                            <div className="p-2">
                              {editingAsset?.id === asset.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="h-6 text-xs bg-gray-700 border-cyan-500/30"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleSaveEdit();
                                      if (e.key === "Escape") setEditingAsset(null);
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveEdit();
                                    }}
                                    className="p-1 text-green-400 hover:text-green-300"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <p className="text-xs text-cyan-100 truncate flex-1" title={asset.name}>
                                    {asset.name}
                                  </p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEdit(asset);
                                    }}
                                    className="p-1 text-gray-400 hover:text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                使用 {asset.usageCount} 次
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                        <p>{searchQuery ? "没有找到匹配的资产" : "暂无资产"}</p>
                        <p className="text-sm mt-1">在画布中生成图片后，可以保存到资产库</p>
                      </div>
                    )}
                  </div>
                  <ScrollBar orientation="vertical" />
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* Preview Dialog */}
        <Dialog open={!!previewAsset} onOpenChange={(open) => !open && setPreviewAsset(null)}>
          <DialogContent className="max-w-4xl bg-gray-900 border-cyan-500/30 p-0">
            <DialogHeader className="p-4 border-b border-cyan-500/20">
              <DialogTitle className="text-cyan-100 flex items-center justify-between">
                <span>{previewAsset?.name}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-cyan-500/50 text-cyan-200 hover:bg-cyan-900/50"
                    onClick={() => previewAsset && handleDownload(previewAsset)}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    下载
                  </Button>
                  {onSelectAsset && (
                    <Button
                      size="sm"
                      className="bg-cyan-600 hover:bg-cyan-500"
                      onClick={() => {
                        if (previewAsset) {
                          onSelectAsset(previewAsset);
                          setPreviewAsset(null);
                          onClose();
                        }
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      使用此资产
                    </Button>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            
            <div className="relative flex items-center justify-center p-4 min-h-[400px]">
              {/* Navigation */}
              <button
                onClick={() => navigatePreview("prev")}
                className="absolute left-4 p-2 rounded-full bg-black/50 hover:bg-cyan-900/50 text-white transition-colors z-10"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              
              <img
                src={previewAsset?.imageUrl}
                alt={previewAsset?.name}
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
              
              <button
                onClick={() => navigatePreview("next")}
                className="absolute right-4 p-2 rounded-full bg-black/50 hover:bg-cyan-900/50 text-white transition-colors z-10"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {previewAsset && (
              <div className="p-4 border-t border-cyan-500/20">
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>分类: {categoryConfig[previewAsset.category].label}</span>
                  <span>使用次数: {previewAsset.usageCount}</span>
                  <span>创建时间: {new Date(previewAsset.createdAt).toLocaleDateString()}</span>
                </div>
                {previewAsset.description && (
                  <p className="mt-2 text-sm text-gray-300">{previewAsset.description}</p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

// Export a button component to open the asset library
export function AssetLibraryButton({ onSelectAsset }: { onSelectAsset?: (asset: AssetLibraryItem) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="border-cyan-500/50 text-cyan-200 hover:bg-cyan-900/50"
      >
        <FolderOpen className="w-4 h-4 mr-2" />
        资产库
      </Button>
      <AssetLibrary
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelectAsset={onSelectAsset}
        selectionMode={!!onSelectAsset}
      />
    </>
  );
}
