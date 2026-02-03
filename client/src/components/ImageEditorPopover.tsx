import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Loader2,
  Wand2,
  Upload,
  X,
  Eraser,
  Expand,
  Palette,
  RotateCcw,
  Sparkles,
  Download,
  Crop,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type EditMode = "inpaint" | "outpaint" | "remove" | "enhance" | "crop";

// 裁剪图片到指定比例的辅助函数
function cropImageToRatio(imageUrl: string, ratio: "1:1" | "16:9" | "9:16" | "4:3"): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法创建 canvas context"));
        return;
      }

      // 计算目标比例
      const ratioMap: Record<string, number> = {
        "1:1": 1,
        "16:9": 16 / 9,
        "9:16": 9 / 16,
        "4:3": 4 / 3,
      };
      const targetRatio = ratioMap[ratio];
      const imgRatio = img.width / img.height;

      let cropWidth: number;
      let cropHeight: number;
      let cropX: number;
      let cropY: number;

      if (imgRatio > targetRatio) {
        // 图片更宽，裁剪左右
        cropHeight = img.height;
        cropWidth = cropHeight * targetRatio;
        cropX = (img.width - cropWidth) / 2;
        cropY = 0;
      } else {
        // 图片更高，裁剪上下
        cropWidth = img.width;
        cropHeight = cropWidth / targetRatio;
        cropX = 0;
        cropY = (img.height - cropHeight) / 2;
      }

      canvas.width = cropWidth;
      canvas.height = cropHeight;
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imageUrl;
  });
}

const editModes = [
  { id: "inpaint" as EditMode, name: "局部重绘", icon: Palette, description: "选择区域重新生成" },
  { id: "outpaint" as EditMode, name: "扩图", icon: Expand, description: "扩展图片边界" },
  { id: "remove" as EditMode, name: "擦除", icon: Eraser, description: "移除不需要的元素" },
  { id: "enhance" as EditMode, name: "增强", icon: Sparkles, description: "提升画质和细节" },
  { id: "crop" as EditMode, name: "裁剪", icon: Crop, description: "裁剪图片区域" },
];

export function ImageEditorPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("inpaint");
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  
  // Edit parameters
  const [expandDirection, setExpandDirection] = useState<"left" | "right" | "up" | "down">("right");
  const [expandAmount, setExpandAmount] = useState(0.5);
  const [enhanceStrength, setEnhanceStrength] = useState(0.5);
  const [cropRatio, setCropRatio] = useState<"1:1" | "16:9" | "9:16" | "4:3">("1:1");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generateMutation = trpc.ai.imageToImage.useMutation();

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setSourceImage(event.target?.result as string);
        setResultImage(null);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (!sourceImage) {
      toast.error("请先上传图片");
      return;
    }

    // Handle crop mode separately (client-side)
    if (editMode === "crop") {
      setIsProcessing(true);
      try {
        const croppedImage = await cropImageToRatio(sourceImage, cropRatio);
        setResultImage(croppedImage);
        toast.success("裁剪完成");
      } catch (error) {
        toast.error("裁剪失败，请重试");
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    let finalPrompt = prompt;
    
    // Build prompt based on edit mode
    switch (editMode) {
      case "inpaint":
        if (!prompt.trim()) {
          toast.error("请输入重绘描述");
          return;
        }
        finalPrompt = `局部重绘: ${prompt}`;
        break;
      case "outpaint":
        finalPrompt = `向${expandDirection === "left" ? "左" : expandDirection === "right" ? "右" : expandDirection === "up" ? "上" : "下"}扩展图片，扩展比例${Math.round(expandAmount * 100)}%，保持风格一致`;
        break;
      case "remove":
        finalPrompt = prompt.trim() ? `移除图片中的: ${prompt}` : "移除图片中不需要的元素，保持背景自然";
        break;
      case "enhance":
        finalPrompt = `增强图片质量和细节，强度${Math.round(enhanceStrength * 100)}%`;
        break;
    }

    setIsProcessing(true);
    try {
      const result = await generateMutation.mutateAsync({
        prompt: finalPrompt,
        imageUrl: sourceImage,
        strength: editMode === "enhance" ? enhanceStrength : 0.75,
      });
      
      if (result.imageUrl) {
        setResultImage(result.imageUrl);
        toast.success("处理完成");
      }
    } catch (error) {
      toast.error("处理失败，请重试");
    } finally {
      setIsProcessing(false);
    }
  }, [sourceImage, editMode, prompt, expandDirection, expandAmount, enhanceStrength, cropRatio, generateMutation]);

  const handleReset = useCallback(() => {
    setSourceImage(null);
    setResultImage(null);
    setPrompt("");
  }, []);

  const handleDownload = useCallback(() => {
    if (resultImage) {
      const link = document.createElement("a");
      link.href = resultImage;
      link.download = `edited-image-${Date.now()}.png`;
      link.click();
    }
  }, [resultImage]);

  const ModeIcon = editModes.find(m => m.id === editMode)?.icon || Palette;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
        >
          <Wand2 className="h-4 w-4" />
          <span>图片编辑</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[480px] p-0 bg-gray-900/95 border-gray-700 backdrop-blur-sm"
        align="end"
        sideOffset={8}
      >
        <div className="p-3 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-purple-400" />
              图片编辑器
            </h3>
            {(sourceImage || resultImage) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-gray-400 hover:text-white"
                onClick={handleReset}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                重置
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            上传图片进行局部重绘、扩图、擦除或增强
          </p>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Image Upload Area */}
          {!sourceImage ? (
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-purple-500/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p className="text-sm text-gray-400">点击上传图片</p>
              <p className="text-xs text-gray-500 mt-1">支持 JPG、PNG、WebP</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          ) : (
            <>
              {/* Image Preview */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">原图</p>
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-800">
                    <img
                      src={sourceImage}
                      alt="Source"
                      className="w-full h-full object-contain"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70"
                      onClick={() => setSourceImage(null)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">结果</p>
                  <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
                    {resultImage ? (
                      <>
                        <img
                          src={resultImage}
                          alt="Result"
                          className="w-full h-full object-contain"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70"
                          onClick={handleDownload}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </>
                    ) : isProcessing ? (
                      <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                    ) : (
                      <p className="text-xs text-gray-500">等待处理</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Mode Tabs */}
              <Tabs value={editMode} onValueChange={(v) => setEditMode(v as EditMode)}>
                <TabsList className="grid grid-cols-5 bg-gray-800/50">
                  {editModes.map((mode) => (
                    <TabsTrigger
                      key={mode.id}
                      value={mode.id}
                      className="text-xs data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300"
                    >
                      <mode.icon className="w-3 h-3 mr-1" />
                      {mode.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="inpaint" className="mt-3 space-y-3">
                  <Textarea
                    placeholder="描述要重绘的内容，例如：将背景改为海边日落..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="bg-gray-800/50 border-gray-700 text-sm min-h-[80px]"
                  />
                </TabsContent>

                <TabsContent value="outpaint" className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">扩展方向</p>
                    <div className="grid grid-cols-4 gap-2">
                      {(["left", "right", "up", "down"] as const).map((dir) => (
                        <Button
                          key={dir}
                          variant={expandDirection === dir ? "default" : "outline"}
                          size="sm"
                          className="text-xs"
                          onClick={() => setExpandDirection(dir)}
                        >
                          {dir === "left" ? "左" : dir === "right" ? "右" : dir === "up" ? "上" : "下"}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">扩展比例: {Math.round(expandAmount * 100)}%</p>
                    <Slider
                      value={[expandAmount]}
                      onValueChange={([v]) => setExpandAmount(v)}
                      min={0.1}
                      max={1}
                      step={0.1}
                      className="py-2"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="remove" className="mt-3 space-y-3">
                  <Textarea
                    placeholder="描述要移除的内容（可选），例如：移除背景中的人物..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="bg-gray-800/50 border-gray-700 text-sm min-h-[80px]"
                  />
                </TabsContent>

                <TabsContent value="enhance" className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">增强强度: {Math.round(enhanceStrength * 100)}%</p>
                    <Slider
                      value={[enhanceStrength]}
                      onValueChange={([v]) => setEnhanceStrength(v)}
                      min={0.1}
                      max={1}
                      step={0.1}
                      className="py-2"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="crop" className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">选择裁剪比例</p>
                    <div className="grid grid-cols-4 gap-2">
                      {(["1:1", "16:9", "9:16", "4:3"] as const).map((ratio) => (
                        <Button
                          key={ratio}
                          variant={cropRatio === ratio ? "default" : "outline"}
                          size="sm"
                          className="text-xs"
                          onClick={() => setCropRatio(ratio)}
                        >
                          {ratio}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    裁剪将保留图片中心区域，按所选比例裁剪
                  </p>
                </TabsContent>
              </Tabs>

              {/* Process Button */}
              <Button
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500"
                onClick={handleProcess}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <ModeIcon className="w-4 h-4 mr-2" />
                    开始{editModes.find(m => m.id === editMode)?.name}
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
