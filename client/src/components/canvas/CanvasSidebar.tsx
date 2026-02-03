import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Image,
  Layers,
  Video,
  Type,
  Wand2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Palette,
  Move3D,
  Film,
  Scissors,
  ImageMinus,
  PenTool,
  Grid3X3,
  Grid2X2,
  Play,
  User,
  RotateCcw,
  Compass,
  Music,
  FileText,
  Clapperboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CanvasSidebarProps {
  open: boolean;
  onToggle: () => void;
  onAddNode: (type: string) => void;
  showTimeline?: boolean;
  onToggleTimeline?: () => void;
  onOpenPanel?: (panel: 'script' | 'design' | 'storyboard') => void;
}

interface NodeItem {
  type: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  disabled?: boolean;
}

interface NodeCategory {
  title: string;
  items: NodeItem[];
}

// 基础创作面板项
interface PanelItem {
  id: 'script' | 'design' | 'storyboard';
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
}

const panelItems: PanelItem[] = [
  { id: "script", icon: FileText, label: "剧本改编", color: "text-purple-400" },
  { id: "design", icon: Palette, label: "形象场景设计", color: "text-cyan-400" },
  { id: "storyboard", icon: Clapperboard, label: "分镜脚本设计", color: "text-orange-400" },
];

const nodeCategories: NodeCategory[] = [
  {
    title: "影视分镜台",
    items: [
      { type: "subjectMultiView", icon: User, label: "主体形象固定", color: "text-cyan-500" },
      { type: "shotReverseShot", icon: RotateCcw, label: "正反打镜头", color: "text-pink-500" },
      { type: "nineGridInput", icon: Grid3X3, label: "定格九宫格", color: "text-purple-500" },
      { type: "dynamicNineGridInput", icon: Film, label: "动态九宫格", color: "text-orange-500" },
      { type: "freeAngleStoryboard", icon: Compass, label: "自由角度分镜", color: "text-emerald-500", disabled: true },
    ],
  },
  // 基础节点已隐藏（写提示词、加载图片、加载视频）
  // 图片编辑器已移至顶部导航栏，点击后在画布添加节点
  {
    title: "AI 生成",
    items: [
      { type: "textToImage", icon: Image, label: "文生图", color: "text-primary" },
      { type: "imageToImage", icon: Layers, label: "图生图", color: "text-secondary" },
      { type: "imageToVideo", icon: Video, label: "图生视频", color: "text-accent" },
      { type: "timeline", icon: Music, label: "轨道编辑", color: "text-emerald-400" },
    ],
  },
  {
    title: "高级功能",
    items: [
      { type: "pose", icon: Move3D, label: "姿态编辑", color: "text-yellow-400", disabled: true },
      { type: "style", icon: Palette, label: "风格迁移", color: "text-pink-400", disabled: true },
      { type: "upscale", icon: Sparkles, label: "高清放大", color: "text-cyan-400", disabled: true },
      { type: "filmstrip", icon: Film, label: "视频解析", color: "text-red-400", disabled: true },
    ],
  },
];

export default function CanvasSidebar({ open, onToggle, onAddNode, showTimeline, onToggleTimeline, onOpenPanel }: CanvasSidebarProps) {
  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      className={cn(
        "relative border-r border-border/50 glass-panel-purple transition-all duration-300 flex flex-col",
        open ? "w-56" : "w-14"
      )}
    >
      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute -right-3 top-4 z-10 h-6 w-6 rounded-full border border-purple-500/50 bg-purple-900/80 hover:bg-purple-800/80 hover:border-purple-400/70 transition-colors"
        onClick={onToggle}
      >
        {open ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </Button>

      {/* Sidebar Content */}
      <ScrollArea className="flex-1">
        <div className={cn("py-4", open ? "px-3" : "px-2")}>
          {/* 基础创作分类 - 点击打开面板 */}
          <div className="mb-4">
            {open && (
              <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                基础创作
              </h3>
            )}
            <div className={cn("space-y-1", !open && "flex flex-col items-center")}>
              {panelItems.map((item) => {
                const Icon = item.icon;

                if (!open) {
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10"
                          onClick={() => onOpenPanel?.(item.id)}
                        >
                          <Icon className={cn("w-5 h-5", item.color)} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className="w-full justify-start h-9 px-2"
                    onClick={() => onOpenPanel?.(item.id)}
                  >
                    <Icon className={cn("w-4 h-4 mr-2", item.color)} />
                    <span className="text-sm">{item.label}</span>
                  </Button>
                );
              })}
            </div>
            {open && <Separator className="mt-4" />}
          </div>

          {nodeCategories.map((category, categoryIndex) => (
            <div key={category.title} className="mb-4">
              {open && (
                <h3 className="text-xs font-medium text-muted-foreground mb-2 px-1">
                  {category.title}
                </h3>
              )}
              <div className={cn("space-y-1", !open && "flex flex-col items-center")}>
                {category.items.map((item) => {
                  const Icon = item.icon;
                  const isDisabled = item.disabled;

                  if (!open) {
                    return (
                      <Tooltip key={item.type}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-10 w-10",
                              isDisabled && "opacity-50 cursor-not-allowed"
                            )}
                            onClick={() => !isDisabled && onAddNode(item.type)}
                            disabled={isDisabled}
                            draggable={!isDisabled}
                            onDragStart={(e) => !isDisabled && handleDragStart(e, item.type)}
                          >
                            <Icon className={cn("w-5 h-5", item.color)} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>{item.label}{isDisabled && " (即将推出)"}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return (
                    <Button
                      key={item.type}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start h-9 px-2",
                        isDisabled && "opacity-50 cursor-not-allowed"
                      )}
                      onClick={() => !isDisabled && onAddNode(item.type)}
                      disabled={isDisabled}
                      draggable={!isDisabled}
                      onDragStart={(e) => !isDisabled && handleDragStart(e, item.type)}
                    >
                      <Icon className={cn("w-4 h-4 mr-2", item.color)} />
                      <span className="text-sm">{item.label}</span>
                      {isDisabled && (
                        <span className="ml-auto text-xs text-muted-foreground">即将推出</span>
                      )}
                    </Button>
                  );
                })}
              </div>
              {categoryIndex < nodeCategories.length - 1 && open && (
                <Separator className="mt-4" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      {open && (
        <div className="p-3 border-t border-purple-500/30">
          <p className="text-xs text-muted-foreground text-center">
            拖拽节点到画布
          </p>
        </div>
      )}
    </div>
  );
}
