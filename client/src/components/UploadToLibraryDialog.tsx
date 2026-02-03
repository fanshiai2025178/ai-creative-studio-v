import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  User,
  Mountain,
  Box,
  Zap,
  Palette,
  Upload,
  Loader2
} from "lucide-react";

// Updated categories: subject(角色库), scene(场景库), prop(道具库), action(动作库), style(风格库)
type Category = "subject" | "scene" | "prop" | "action" | "style";

interface UploadToLibraryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  defaultName?: string;
  onSuccess?: () => void;
}

const categoryConfig: Record<Category, { label: string; icon: React.ReactNode; description: string }> = {
  subject: { label: "角色库", icon: <User className="w-4 h-4" />, description: "角色、人物、主体形象" },
  scene: { label: "场景库", icon: <Mountain className="w-4 h-4" />, description: "背景、环境、场景图" },
  prop: { label: "道具库", icon: <Box className="w-4 h-4" />, description: "物品、道具、元素" },
  action: { label: "动作库", icon: <Zap className="w-4 h-4" />, description: "动作、姿态、表情" },
  style: { label: "风格库", icon: <Palette className="w-4 h-4" />, description: "风格参考、艺术风格" },
};

export function UploadToLibraryDialog({
  isOpen,
  onClose,
  imageUrl,
  defaultName = "",
  onSuccess
}: UploadToLibraryDialogProps) {
  const [category, setCategory] = useState<Category>("subject");
  const [name, setName] = useState(defaultName || `资产_${Date.now()}`);
  const [description, setDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const addMutation = trpc.assetLibrary.add.useMutation({
    onSuccess: () => {
      toast.success("已添加到资产库");
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      toast.error(`添加失败: ${error.message}`);
    },
  });

  const handleUpload = useCallback(async () => {
    if (!name.trim()) {
      toast.error("请输入资产名称");
      return;
    }

    setIsUploading(true);
    try {
      await addMutation.mutateAsync({
        category,
        name: name.trim(),
        description: description.trim() || undefined,
        imageUrl,
      });
    } finally {
      setIsUploading(false);
    }
  }, [category, name, description, imageUrl, addMutation]);

  // Reset form when dialog opens
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      onClose();
    } else {
      setName(defaultName || `资产_${Date.now()}`);
      setDescription("");
      setCategory("subject");
    }
  }, [onClose, defaultName]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-gradient-to-br from-purple-950/95 to-gray-950/95 backdrop-blur-xl border-purple-500/40">
        <DialogHeader>
          <DialogTitle className="text-purple-100 flex items-center gap-2">
            <Upload className="w-5 h-5 text-purple-400" />
            保存到资产库
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preview */}
          <div className="flex justify-center">
            <div className="w-32 h-32 rounded-lg border border-purple-500/40 overflow-hidden bg-purple-900/30">
              <img
                src={imageUrl}
                alt="预览"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label className="text-purple-200">选择目标库</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="bg-purple-900/50 border-purple-500/40 text-purple-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-purple-950 border-purple-500/40">
                {(Object.keys(categoryConfig) as Category[]).map((cat) => (
                  <SelectItem key={cat} value={cat} className="text-purple-100 focus:bg-purple-800/50">
                    <div className="flex items-center gap-2">
                      {categoryConfig[cat].icon}
                      <span>{categoryConfig[cat].label}</span>
                      <span className="text-xs text-gray-400">- {categoryConfig[cat].description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name Input */}
          <div className="space-y-2">
            <Label className="text-purple-200">资产名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入资产名称..."
              className="bg-purple-900/50 border-purple-500/40 text-purple-100 placeholder:text-purple-400"
            />
          </div>

          {/* Description Input */}
          <div className="space-y-2">
            <Label className="text-purple-200">描述（可选）</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="添加描述..."
              rows={2}
              className="bg-purple-900/50 border-purple-500/40 text-purple-100 placeholder:text-purple-400 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-600 text-gray-300 hover:bg-gray-800"
          >
            取消
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isUploading || !name.trim()}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                保存
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
