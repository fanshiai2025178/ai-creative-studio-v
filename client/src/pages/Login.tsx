import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");

  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success("登录成功");
      // 使用 window.location 确保跳转
      window.location.href = "/projects";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("注册成功");
      // 使用 window.location 确保跳转
      window.location.href = "/projects";
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister) {
      if (!apiKey.trim()) {
        toast.error("请输入 Gemini API Key");
        return;
      }
      registerMutation.mutate({ username, password, apiKey });
    } else {
      loginMutation.mutate({ username, password });
    }
  };

  const isLoading = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* 背景效果 */}
      <div className="absolute inset-0 cyber-grid opacity-20" />
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="glass-panel border border-border/50 rounded-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold neon-text-pink">FansAI工作室</h1>
            <p className="text-muted-foreground mt-2">
              {isRegister ? "创建新账号" : "登录账号"}
            </p>
          </div>

          {/* 切换标签 */}
          <div className="flex mb-6 bg-background/50 rounded-lg p-1">
            <button
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                !isRegister ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
              onClick={() => setIsRegister(false)}
            >
              登录
            </button>
            <button
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                isRegister ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
              onClick={() => setIsRegister(true)}
            >
              注册
            </button>
          </div>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">用户名</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                className="bg-background/50"
                required
                minLength={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">密码</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                className="bg-background/50"
                required
                minLength={4}
              />
            </div>

            {isRegister && (
              <div>
                <label className="block text-sm font-medium mb-2">Gemini API Key</label>
                <Input
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="bg-background/50"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  在 <a href="https://aistudio.google.com/apikey" target="_blank" className="text-primary hover:underline">Google AI Studio</a> 获取
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/80 neon-border-pink"
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isRegister ? "注册" : "登录"}
            </Button>
          </form>

          {/* 返回首页 */}
          <div className="mt-6 text-center">
            <button
              onClick={() => setLocation("/")}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              返回首页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
