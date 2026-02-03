import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getVersionWithDate } from "@/version";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Pencil, 
  Copy, 
  Trash2, 
  Zap,
  Loader2,
  FolderOpen,
  Clock,
  ArrowLeft,
  Clapperboard
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Projects() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [projectToRename, setProjectToRename] = useState<{ id: number; name: string } | null>(null);
  const [newName, setNewName] = useState("");

  const utils = trpc.useUtils();
  
  const { data: projects, isLoading: projectsLoading } = trpc.project.list.useQuery(
    undefined,
    { enabled: isAuthenticated }  // 只有登录后才查询
  );

  // 所有 hooks 必须在条件返回之前调用
  const createProject = trpc.project.create.useMutation({
    onSuccess: (newProject) => {
      utils.project.list.invalidate();
      setLocation(`/canvas/${newProject.id}`);
      toast.success("项目创建成功");
    },
    onError: () => {
      toast.error("创建项目失败");
    },
  });

  const deleteProject = trpc.project.delete.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      toast.success("项目已删除");
      setDeleteDialogOpen(false);
      setProjectToDelete(null);
    },
    onError: () => {
      toast.error("删除项目失败");
    },
  });

  const renameProject = trpc.project.rename.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      toast.success("项目已重命名");
      setRenameDialogOpen(false);
      setProjectToRename(null);
      setNewName("");
    },
    onError: () => {
      toast.error("重命名失败");
    },
  });

  const duplicateProject = trpc.project.duplicate.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      toast.success("项目已复制");
    },
    onError: () => {
      toast.error("复制项目失败");
    },
  });

  // 加载中显示 loading
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 未登录时跳转到登录页
  if (!isAuthenticated) {
    window.location.href = "/login";
    return null;
  }

  const handleCreateProject = () => {
    createProject.mutate({ name: "未命名项目" });
  };

  const handleDeleteProject = () => {
    if (projectToDelete) {
      deleteProject.mutate({ id: projectToDelete });
    }
  };

  const handleRenameProject = () => {
    if (projectToRename && newName.trim()) {
      renameProject.mutate({ id: projectToRename.id, name: newName.trim() });
    }
  };

  const handleDuplicateProject = (id: number) => {
    duplicateProject.mutate({ id });
  };

  const openRenameDialog = (project: { id: number; name: string }) => {
    setProjectToRename(project);
    setNewName(project.name);
    setRenameDialogOpen(true);
  };

  const filteredProjects = projects?.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    return new Date(date).toLocaleDateString('zh-CN');
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Background Effects */}
      <div className="absolute inset-0 cyber-grid opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 glass-panel">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="FansAI Logo" className="w-10 h-10 object-contain" />
              <span className="text-xl font-bold neon-text-pink">FansAI工作室漫剧创作</span>
              <span className="text-xs text-gray-500 ml-2">{getVersionWithDate()}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={() => setLocation('/storyboard')}
              className="border-primary/50 hover:neon-border-pink"
            >
              <Clapperboard className="w-4 h-4 mr-2" />
              AI 分镜师
            </Button>
            <span className="text-muted-foreground text-sm">
              欢迎, <span className="neon-text-cyan">{user?.name || '创作者'}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 container py-8">
        {/* Page Title & Actions */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold neon-text-cyan">我的画布</h1>
            <p className="text-muted-foreground mt-1">管理你的创意项目</p>
          </div>
          <Button 
            onClick={handleCreateProject}
            disabled={createProject.isPending}
            className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border-pink border"
          >
            {createProject.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            新建项目
          </Button>
        </div>

        {/* Search Bar */}
        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索项目..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-card border-border/50 focus:neon-border-cyan"
          />
        </div>

        {/* Projects Grid */}
        {projectsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <FolderOpen className="w-16 h-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              {searchQuery ? "没有找到匹配的项目" : "还没有项目"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery ? "尝试其他搜索关键词" : "点击上方按钮创建你的第一个项目"}
            </p>
            {!searchQuery && (
              <Button 
                onClick={handleCreateProject}
                disabled={createProject.isPending}
                className="bg-primary hover:bg-primary/80 text-primary-foreground neon-border-pink border"
              >
                <Plus className="w-4 h-4 mr-2" />
                新建项目
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* New Project Card */}
            <Card 
              className="group cursor-pointer border-dashed border-2 border-border/50 bg-transparent hover:border-primary/50 hover:bg-primary/5 transition-all duration-300"
              onClick={handleCreateProject}
            >
              <CardContent className="flex flex-col items-center justify-center h-48 p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <Plus className="w-6 h-6 text-primary" />
                </div>
                <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                  新建项目
                </span>
              </CardContent>
            </Card>

            {/* Project Cards */}
            {filteredProjects.map((project) => (
              <Card 
                key={project.id}
                className="group cursor-pointer border-border/50 bg-card/50 hover:neon-border-cyan transition-all duration-300 overflow-hidden"
              >
                <div 
                  className="relative h-36 bg-gradient-to-br from-primary/20 to-secondary/20 cyber-grid"
                  onClick={() => setLocation(`/canvas/${project.id}`)}
                >
                  {project.thumbnail ? (
                    <img 
                      src={project.thumbnail} 
                      alt={project.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Zap className="w-12 h-12 text-primary/30" />
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div 
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setLocation(`/canvas/${project.id}`)}
                    >
                      <h3 className="font-medium truncate group-hover:neon-text-cyan transition-all">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>编辑于 {formatDate(project.updatedAt)}</span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="glass-panel border-border/50">
                        <DropdownMenuItem onClick={() => openRenameDialog(project)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicateProject(project.id)}>
                          <Copy className="w-4 h-4 mr-2" />
                          复制
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setProjectToDelete(project.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="glass-panel border-border/50">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              此操作无法撤销。确定要删除这个项目吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteProject}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="glass-panel border-border/50">
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
            <DialogDescription>
              输入新的项目名称
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="项目名称"
            className="bg-card border-border/50"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={handleRenameProject}
              disabled={renameProject.isPending || !newName.trim()}
              className="bg-primary hover:bg-primary/80"
            >
              {renameProject.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
