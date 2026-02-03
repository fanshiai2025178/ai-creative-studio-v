import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Sparkles, Zap, Layers, Wand2, Video, Image, ArrowRight } from "lucide-react";
import { getVersionWithDate } from "@/version";

export default function Home() {
  const [, setLocation] = useLocation();

  const features = [
    {
      icon: Layers,
      title: "节点式工作流",
      description: "可视化画布，自由连接各种 AI 功能节点，构建专属创作流程",
    },
    {
      icon: Image,
      title: "文生图 / 图生图",
      description: "集成多种顶尖图像生成模型，一键生成高质量视觉素材",
    },
    {
      icon: Video,
      title: "图生视频",
      description: "将静态图片转化为动态视频，支持多种视频生成模型",
    },
    {
      icon: Wand2,
      title: "智能创作助手",
      description: "AI 驱动的创作助手，提供分镜策划、提示词优化等功能",
    },
    {
      icon: Sparkles,
      title: "图片编辑器",
      description: "智能抠图、换背景、局部重绘等专业编辑工具",
    },
    {
      icon: Zap,
      title: "工作流模板",
      description: "预设多种创作模板，一键复用，快速启动创作",
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 cyber-grid opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
      
      {/* Animated Glow Orbs */}
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse-glow" />
      <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-pulse-glow" style={{ animationDelay: '1s' }} />
      
      {/* Header */}
      <header className="relative z-10 border-b border-border/50 glass-panel">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="FansAI Logo" className="w-10 h-10 object-contain" />
            <span className="text-xl font-bold neon-text-pink">FansAI工作室漫剧创作</span>
            <span className="text-xs text-gray-500 ml-2">{getVersionWithDate()}</span>
          </div>
          
          <nav className="flex items-center gap-4">
            <Button 
              onClick={() => setLocation('/login')}
              className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border-pink border"
            >
              登录 / 注册
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10">
        <section className="container py-24 text-center">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 glass-panel">
              <Sparkles className="w-4 h-4 text-secondary" />
              <span className="text-sm text-muted-foreground">AI 驱动的视觉创作平台</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              <span className="neon-text-cyan">释放创意</span>
              <br />
              <span className="neon-text-pink">无限可能</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              集成顶尖 AI 模型的可视化工作流平台，从文生图到图生视频，
              <br />
              让每一个创意都能轻松实现
            </p>
            
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button 
                size="lg"
                onClick={() => setLocation('/login')}
                className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border-pink border text-lg px-8 py-6"
              >
                开始使用
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button 
                size="lg"
                variant="outline"
                onClick={() => {
                  const featuresSection = document.querySelector('#features');
                  featuresSection?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="border-secondary text-secondary hover:bg-secondary/10 neon-border-cyan text-lg px-8 py-6"
              >
                了解更多
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="container py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              <span className="neon-text-purple">强大功能</span>
            </h2>
            <p className="text-muted-foreground text-lg">
              一站式 AI 视觉创作解决方案
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="group p-6 rounded-lg border border-border/50 glass-panel hud-corner hover:neon-border-cyan transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2 group-hover:neon-text-cyan transition-all">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="container py-24">
          <div className="relative rounded-2xl border border-border/50 glass-panel p-12 text-center overflow-hidden">
            <div className="absolute inset-0 cyber-grid opacity-20" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                准备好开始创作了吗？
              </h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
                加入我们，体验 AI 驱动的视觉创作新方式
              </p>
              <Button 
                size="lg"
                onClick={() => setLocation('/login')}
                className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border-pink border text-lg px-8 py-6"
              >
                立即开始
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 glass-panel py-8">
        <div className="container text-center text-muted-foreground text-sm">
          <p>© 2026 FansAI工作室漫剧创作. 释放创意，无限可能.</p>
        </div>
      </footer>
    </div>
  );
}
