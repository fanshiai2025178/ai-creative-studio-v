import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Search,
  Image,
  Video,
  Layers,
  Sparkles,
  Film,
  Palette,
  Move3D,
  Wand2,
  Play,
  Copy,
  Star,
  Users,
} from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// Predefined templates for demo
const defaultTemplates = [
  {
    id: 1,
    name: "文生图基础流程",
    description: "从文本提示词生成高质量图片的基础工作流",
    category: "image",
    thumbnail: "https://picsum.photos/seed/t1/400/300",
    usageCount: 1250,
    rating: 4.8,
    tags: ["入门", "文生图"],
    workflow: {
      nodes: [
        { id: "prompt-1", type: "prompt", position: { x: 100, y: 200 }, data: { content: "输入你的提示词" } },
        { id: "t2i-1", type: "textToImage", position: { x: 400, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "prompt-1", target: "t2i-1", sourceHandle: "prompt-out", targetHandle: "prompt-in" },
      ],
    },
  },
  {
    id: 2,
    name: "图生图风格转换",
    description: "上传图片并转换为不同艺术风格",
    category: "image",
    thumbnail: "https://picsum.photos/seed/t2/400/300",
    usageCount: 890,
    rating: 4.6,
    tags: ["风格转换", "图生图"],
    workflow: {
      nodes: [
        { id: "img-1", type: "imageDisplay", position: { x: 100, y: 200 }, data: {} },
        { id: "i2i-1", type: "imageToImage", position: { x: 400, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "img-1", target: "i2i-1", sourceHandle: "image-out", targetHandle: "image-in" },
      ],
    },
  },
  {
    id: 3,
    name: "图生视频动态化",
    description: "将静态图片转换为动态视频",
    category: "video",
    thumbnail: "https://picsum.photos/seed/t3/400/300",
    usageCount: 2100,
    rating: 4.9,
    tags: ["热门", "图生视频"],
    workflow: {
      nodes: [
        { id: "t2i-1", type: "textToImage", position: { x: 100, y: 200 }, data: {} },
        { id: "i2v-1", type: "imageToVideo", position: { x: 450, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "t2i-1", target: "i2v-1", sourceHandle: "image-out", targetHandle: "image-in" },
      ],
    },
  },
  {
    id: 4,
    name: "完整短片制作流程",
    description: "从创意到成片的完整 AI 短片制作工作流",
    category: "video",
    thumbnail: "https://picsum.photos/seed/t4/400/300",
    usageCount: 560,
    rating: 4.7,
    tags: ["进阶", "短片制作"],
    workflow: {
      nodes: [
        { id: "prompt-1", type: "prompt", position: { x: 50, y: 100 }, data: { content: "场景1描述" } },
        { id: "prompt-2", type: "prompt", position: { x: 50, y: 300 }, data: { content: "场景2描述" } },
        { id: "t2i-1", type: "textToImage", position: { x: 300, y: 100 }, data: {} },
        { id: "t2i-2", type: "textToImage", position: { x: 300, y: 300 }, data: {} },
        { id: "i2v-1", type: "imageToVideo", position: { x: 600, y: 100 }, data: {} },
        { id: "i2v-2", type: "imageToVideo", position: { x: 600, y: 300 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "prompt-1", target: "t2i-1" },
        { id: "e2", source: "prompt-2", target: "t2i-2" },
        { id: "e3", source: "t2i-1", target: "i2v-1" },
        { id: "e4", source: "t2i-2", target: "i2v-2" },
      ],
    },
  },
  {
    id: 5,
    name: "图片编辑增强",
    description: "对图片进行局部重绘、扩图和增强处理",
    category: "edit",
    thumbnail: "https://picsum.photos/seed/t5/400/300",
    usageCount: 780,
    rating: 4.5,
    tags: ["编辑", "增强"],
    workflow: {
      nodes: [
        { id: "img-1", type: "imageDisplay", position: { x: 100, y: 200 }, data: {} },
        { id: "edit-1", type: "imageEditor", position: { x: 450, y: 200 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "img-1", target: "edit-1", sourceHandle: "image-out", targetHandle: "image-in" },
      ],
    },
  },
  {
    id: 6,
    name: "多角度人物生成",
    description: "从单张图片生成多角度人物视图",
    category: "advanced",
    thumbnail: "https://picsum.photos/seed/t6/400/300",
    usageCount: 340,
    rating: 4.4,
    tags: ["高级", "多角度"],
    workflow: {
      nodes: [
        { id: "img-1", type: "imageDisplay", position: { x: 100, y: 200 }, data: {} },
        { id: "i2i-1", type: "imageToImage", position: { x: 400, y: 100 }, data: { prompt: "front view" } },
        { id: "i2i-2", type: "imageToImage", position: { x: 400, y: 200 }, data: { prompt: "side view" } },
        { id: "i2i-3", type: "imageToImage", position: { x: 400, y: 300 }, data: { prompt: "back view" } },
      ],
      edges: [
        { id: "e1", source: "img-1", target: "i2i-1" },
        { id: "e2", source: "img-1", target: "i2i-2" },
        { id: "e3", source: "img-1", target: "i2i-3" },
      ],
    },
  },
];

const categories = [
  { id: "all", name: "全部", icon: Sparkles },
  { id: "image", name: "图片生成", icon: Image },
  { id: "video", name: "视频制作", icon: Video },
  { id: "edit", name: "图片编辑", icon: Wand2 },
  { id: "advanced", name: "高级功能", icon: Layers },
];

export default function Templates() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const createProject = trpc.project.create.useMutation({
    onSuccess: (project) => {
      setLocation(`/canvas/${project.id}`);
    },
  });

  const handleUseTemplate = async (template: typeof defaultTemplates[0]) => {
    if (!isAuthenticated) {
      toast.error("请先登录");
      return;
    }

    try {
      const project = await createProject.mutateAsync({
        name: `${template.name} - 副本`,
      });

      // In a real implementation, we would also save the workflow data
      toast.success("模板已应用，正在跳转到画布...");
    } catch (error) {
      toast.error("创建项目失败");
    }
  };

  const filteredTemplates = defaultTemplates.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = activeCategory === "all" || template.category === activeCategory;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 glass-panel">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold neon-text-pink">工作流模板</h1>
              <p className="text-xs text-muted-foreground">选择模板快速开始创作</p>
            </div>
          </div>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索模板..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/50 border-border/50"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-8">
        {/* Category Tabs */}
        <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mb-8">
          <TabsList className="grid grid-cols-5 w-full max-w-2xl mx-auto">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <TabsTrigger key={category.id} value={category.id} className="text-xs">
                  <Icon className="w-4 h-4 mr-1" />
                  {category.name}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        {/* Templates Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card
              key={template.id}
              className="glass-panel border-border/50 overflow-hidden hover:neon-border-pink transition-all duration-300 group"
            >
              <div className="relative aspect-video overflow-hidden">
                <img
                  src={template.thumbnail}
                  alt={template.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                <div className="absolute bottom-3 left-3 flex gap-2">
                  {template.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <CardDescription className="text-sm line-clamp-2">
                  {template.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {template.usageCount.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-400" />
                      {template.rating}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/80"
                    onClick={() => handleUseTemplate(template)}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    使用模板
                  </Button>
                  <Button variant="outline" size="icon">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredTemplates.length === 0 && (
          <div className="text-center py-16">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">未找到匹配的模板</h3>
            <p className="text-muted-foreground">尝试调整搜索条件或选择其他分类</p>
          </div>
        )}
      </main>
    </div>
  );
}
