/**
 * 通用加载进度动画组件
 * 支持：模拟进度、真实进度、不同状态显示
 */
import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle, XCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingProgressProps {
  /** 是否正在加载 */
  isLoading: boolean;
  /** 加载状态：loading | success | error */
  status?: "loading" | "success" | "error";
  /** 真实进度 (0-100)，如果不提供则使用模拟进度 */
  progress?: number;
  /** 加载提示文字 */
  text?: string;
  /** 加载完成后的文字 */
  successText?: string;
  /** 加载失败的文字 */
  errorText?: string;
  /** 预估完成时间（秒），用于模拟进度 */
  estimatedTime?: number;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
  /** 是否显示百分比 */
  showPercentage?: boolean;
  /** 自定义样式 */
  className?: string;
}

export function LoadingProgress({
  isLoading,
  status = "loading",
  progress,
  text = "正在处理中...",
  successText = "完成！",
  errorText = "处理失败",
  estimatedTime = 30,
  size = "md",
  showPercentage = true,
  className,
}: LoadingProgressProps) {
  const [simulatedProgress, setSimulatedProgress] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // 模拟进度逻辑
  useEffect(() => {
    if (isLoading && progress === undefined) {
      startTimeRef.current = Date.now();
      setSimulatedProgress(0);

      // 使用非线性进度曲线，开始快，接近完成时变慢
      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const targetProgress = Math.min(95, (elapsed / estimatedTime) * 100);
        
        // 使用 easeOutExpo 缓动函数
        const easedProgress = targetProgress < 95 
          ? targetProgress * (1 - Math.pow(0.5, elapsed / (estimatedTime * 0.3)))
          : 95;
        
        setSimulatedProgress(Math.min(95, easedProgress));
      }, 100);
    } else if (!isLoading) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // 完成时快速到达 100%
      if (status === "success") {
        setSimulatedProgress(100);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isLoading, progress, estimatedTime, status]);

  const currentProgress = progress !== undefined ? progress : simulatedProgress;
  const displayProgress = Math.round(currentProgress);

  // 尺寸配置
  const sizeConfig = {
    sm: {
      container: "gap-2",
      icon: "w-4 h-4",
      text: "text-xs",
      bar: "h-1",
    },
    md: {
      container: "gap-3",
      icon: "w-5 h-5",
      text: "text-sm",
      bar: "h-1.5",
    },
    lg: {
      container: "gap-4",
      icon: "w-6 h-6",
      text: "text-base",
      bar: "h-2",
    },
  };

  const config = sizeConfig[size];

  if (!isLoading && status === "loading") {
    return null;
  }

  return (
    <div className={cn("flex flex-col", config.container, className)}>
      {/* 状态图标和文字 */}
      <div className="flex items-center gap-2">
        {status === "loading" && (
          <div className="relative">
            <Loader2 className={cn(config.icon, "animate-spin text-purple-400")} />
            <Sparkles className={cn(config.icon, "absolute inset-0 text-pink-400 animate-pulse opacity-50")} />
          </div>
        )}
        {status === "success" && (
          <CheckCircle className={cn(config.icon, "text-green-400")} />
        )}
        {status === "error" && (
          <XCircle className={cn(config.icon, "text-red-400")} />
        )}
        <span className={cn(config.text, "text-gray-300")}>
          {status === "loading" && text}
          {status === "success" && successText}
          {status === "error" && errorText}
        </span>
        {showPercentage && status === "loading" && (
          <span className={cn(config.text, "text-purple-400 font-mono ml-auto")}>
            {displayProgress}%
          </span>
        )}
      </div>

      {/* 进度条 */}
      {status === "loading" && (
        <div className={cn("w-full bg-gray-800 rounded-full overflow-hidden", config.bar)}>
          <div
            className={cn(
              "h-full bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 transition-all duration-300 ease-out",
              "bg-[length:200%_100%] animate-gradient-x"
            )}
            style={{ width: `${displayProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * 带动画的加载卡片组件
 * 用于在对话框中显示加载状态
 */
interface LoadingCardProps {
  /** 是否正在加载 */
  isLoading: boolean;
  /** 加载状态 */
  status?: "loading" | "success" | "error";
  /** 真实进度 */
  progress?: number;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 预估时间 */
  estimatedTime?: number;
  /** 子项进度（用于批量操作） */
  items?: Array<{
    name: string;
    status: "pending" | "loading" | "success" | "error";
    progress?: number;
  }>;
}

export function LoadingCard({
  isLoading,
  status = "loading",
  progress,
  title,
  description,
  estimatedTime = 30,
  items,
}: LoadingCardProps) {
  return (
    <div className="bg-[#1a1035] rounded-lg border border-purple-900/30 p-4 space-y-3">
      {/* 主标题和进度 */}
      <LoadingProgress
        isLoading={isLoading}
        status={status}
        progress={progress}
        text={title}
        estimatedTime={estimatedTime}
        size="md"
      />

      {/* 描述 */}
      {description && (
        <p className="text-xs text-gray-500 pl-7">{description}</p>
      )}

      {/* 子项列表 */}
      {items && items.length > 0 && (
        <div className="space-y-2 pl-7 border-l-2 border-purple-900/30 ml-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              {item.status === "pending" && (
                <div className="w-3 h-3 rounded-full bg-gray-700" />
              )}
              {item.status === "loading" && (
                <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
              )}
              {item.status === "success" && (
                <CheckCircle className="w-3 h-3 text-green-400" />
              )}
              {item.status === "error" && (
                <XCircle className="w-3 h-3 text-red-400" />
              )}
              <span className={cn(
                "text-xs",
                item.status === "pending" && "text-gray-500",
                item.status === "loading" && "text-purple-300",
                item.status === "success" && "text-green-300",
                item.status === "error" && "text-red-300"
              )}>
                {item.name}
              </span>
              {item.status === "loading" && item.progress !== undefined && (
                <span className="text-xs text-purple-400 font-mono ml-auto">
                  {Math.round(item.progress)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LoadingProgress;
