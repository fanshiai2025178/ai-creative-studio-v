import { memo, useState, useCallback, useEffect } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, Loader2, Type } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function PromptNode({ id, data }: NodeProps) {
  const [prompt, setPrompt] = useState(data.prompt as string || "");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { setNodes } = useReactFlow();

  // 当提示词变化时，更新节点数据
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              prompt,
            },
          };
        }
        return node;
      })
    );
  }, [prompt, id, setNodes]);

  const optimizeMutation = trpc.ai.optimizePrompt.useMutation();

  const handleOptimize = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("请先输入提示词");
      return;
    }

    setIsOptimizing(true);
    try {
      const result = await optimizeMutation.mutateAsync({ prompt });
      setPrompt(result.optimized);
      toast.success("提示词已优化");
    } catch (error) {
      toast.error("优化失败");
    } finally {
      setIsOptimizing(false);
    }
  }, [prompt, optimizeMutation]);

  return (
    <div className="w-72 glass-panel rounded-lg border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium">提示词</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleOptimize}
          disabled={isOptimizing || !prompt.trim()}
        >
          {isOptimizing ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              <Wand2 className="w-3 h-3 mr-1" />
              优化
            </>
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="p-3">
        <Textarea
          placeholder="输入提示词描述..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-24 text-sm bg-background/50 border-border/50 resize-none"
        />
      </div>

      {/* Output Handle - 右侧输出提示词 */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-red-500 !border-2 !border-red-700"
        id="prompt-out"
      />
    </div>
  );
}

export default memo(PromptNode);
