import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Paperclip,
  FileText,
  FileImage,
  FileArchive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Streamdown } from "streamdown";
import { trpc } from "@/lib/trpc";
import CharacterDesignAssistant from "@/components/panels/CharacterDesignAssistant";
import { EntryCards } from "@/components/assistant/EntryCards";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: {
    type: string;
    label: string;
    data?: Record<string, unknown>;
  }[];
}

interface AIAssistantProps {
  open: boolean;
  onToggle: () => void;
  onAddNode: (type: string) => void;
  projectId: number;
  onLoadToCanvas?: (imageUrl: string, name: string, type: 'character' | 'scene' | 'prop') => void;
  initialAction?: 'designCharacter' | null;
  onClearInitialAction?: () => void;
  initialScriptContent?: string;
  initialScriptTitle?: string;
}



export default function AIAssistant({ open, onToggle, onAddNode, projectId, onLoadToCanvas, initialAction, onClearInitialAction, initialScriptContent, initialScriptTitle }: AIAssistantProps) {
  const [isCharacterDesignAssistantOpen, setIsCharacterDesignAssistantOpen] = useState(false);
  const [scriptContentForAssistant, setScriptContentForAssistant] = useState<string>('');
  const [scriptTitleForAssistant, setScriptTitleForAssistant] = useState<string>('');
  
  // 处理初始动作（从外部触发）
  useEffect(() => {
    if (initialAction === 'designCharacter' && open) {
      // 保存剧本内容并打开角色设计助手
      setScriptContentForAssistant(initialScriptContent || '');
      setScriptTitleForAssistant(initialScriptTitle || '');
      setIsCharacterDesignAssistantOpen(true);
      onClearInitialAction?.();
    }
  }, [initialAction, open, onClearInitialAction, initialScriptContent, initialScriptTitle]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你好！我是你的 AI 创作助手。我可以帮你：\n\n- 📝 策划分镜和故事板\n- 🎨 生成和优化提示词\n- 💡 提供创意灵感\n- 🔧 解答工具使用问题\n\n有什么我可以帮你的吗？",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = trpc.ai.chat.useMutation();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      // Get chat history for context
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const result = await chatMutation.mutateAsync({
        message: currentInput,
        history,
      });

      // Parse actions from response
      let actions: Message["actions"] = [];
      const lowerInput = currentInput.toLowerCase();
      
      if (lowerInput.includes("分镜") || lowerInput.includes("策划")) {
        actions = [
          { type: "textToImage", label: "生成图片节点" },
        ];
      } else if (lowerInput.includes("视频") || lowerInput.includes("动态")) {
        actions = [
          { type: "imageToVideo", label: "添加图生视频节点" },
        ];
      } else if (lowerInput.includes("图片") || lowerInput.includes("生成")) {
        actions = [
          { type: "textToImage", label: "添加文生图节点" },
        ];
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.reply,
        timestamp: new Date(),
        actions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "抱歉，我遇到了一些问题。请稍后再试。",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, chatMutation]);

  const handleSuggestionClick = (text: string) => {
    setInput(text);
  };

  const handleAction = (action: NonNullable<Message["actions"]>[0]) => {
    onAddNode(action.type);
  };

  // 入口卡片点击处理
  const handleEntryClick = (text: string) => {
    setInput(text);
    // 延迟触发发送，让用户看到输入框内容
    setTimeout(() => {
      const sendBtn = document.querySelector('[data-send-btn]') as HTMLButtonElement;
      if (sendBtn) sendBtn.click();
    }, 100);
  };

  if (!open) return null;

  return (
    <div className="w-96 border-l border-purple-500/40 glass-panel-purple flex flex-col h-[calc(100vh-180px)] rounded-bl-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-purple-500/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center neon-glow-purple">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium text-sm">AI 创作助手</h3>
            <p className="text-xs text-muted-foreground">随时为你提供帮助</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggle}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.role === "user" && "flex-row-reverse"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    message.role === "assistant"
                      ? "bg-primary/20"
                      : "bg-secondary/20"
                  )}
                >
                  {message.role === "assistant" ? (
                    <Bot className="w-4 h-4 text-primary" />
                  ) : (
                    <User className="w-4 h-4 text-secondary" />
                  )}
                </div>
                <div
                  className={cn(
                    "rounded-lg p-3 text-sm overflow-hidden",
                    message.role === "assistant"
                      ? "bg-card/50 border border-border/50"
                      : "bg-primary/10"
                  )}
                  style={{ maxWidth: 'calc(100% - 44px)', minWidth: 0 }}
                >
                  <div 
                    className="text-sm leading-relaxed overflow-hidden"
                    style={{ 
                      wordWrap: 'break-word', 
                      overflowWrap: 'anywhere', 
                      wordBreak: 'break-word',
                      maxWidth: '100%'
                    }}
                  >
                    <style>{`
                      .ai-message-content * {
                        max-width: 100% !important;
                        overflow-wrap: anywhere !important;
                        word-break: break-word !important;
                      }
                      .ai-message-content pre {
                        overflow-x: auto !important;
                        white-space: pre-wrap !important;
                        word-wrap: break-word !important;
                      }
                      .ai-message-content code {
                        white-space: pre-wrap !important;
                        word-break: break-all !important;
                      }
                      .ai-message-content table {
                        display: block !important;
                        overflow-x: auto !important;
                        max-width: 100% !important;
                        font-size: 11px !important;
                      }
                      .ai-message-content th,
                      .ai-message-content td {
                        white-space: nowrap !important;
                        padding: 4px 8px !important;
                      }
                      .ai-message-content h1,
                      .ai-message-content h2,
                      .ai-message-content h3,
                      .ai-message-content h4 {
                        font-size: 14px !important;
                        margin-top: 12px !important;
                        margin-bottom: 8px !important;
                      }
                      .ai-message-content p {
                        margin-bottom: 8px !important;
                      }
                      .ai-message-content ul,
                      .ai-message-content ol {
                        padding-left: 16px !important;
                        margin-bottom: 8px !important;
                      }
                      .ai-message-content li {
                        margin-bottom: 4px !important;
                      }
                    `}</style>
                    <div className="ai-message-content prose prose-sm prose-invert max-w-none">
                      <Streamdown>{message.content}</Streamdown>
                    </div>
                  </div>
                  {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {message.actions.map((action, index) => (
                        <Button
                          key={index}
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleAction(action)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center neon-glow-purple">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="rounded-lg p-3 bg-card/50 border border-border/50">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 创作入口卡片 */}
      {messages.length === 1 && (
        <div className="border-t border-border/50 shrink-0">
          <EntryCards
            onSelectEntry={(entry) => {
              switch (entry) {
                case 'character':
                  // 打开角色设计助手
                  setIsCharacterDesignAssistantOpen(true);
                  break;
                case 'scene':
                  // 发送场景设计消息
                  handleEntryClick('我想设计场景');
                  break;
                case 'storyboard':
                  // 发送分镜创建消息
                  handleEntryClick('我想创建分镜');
                  break;
                case 'script':
                  // 发送剧本改编消息
                  handleEntryClick('我想改编剧本');
                  break;
              }
            }}
          />
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-border/50 shrink-0">
        <div className="flex gap-2">
          {/* 文件上传按钮 */}
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.txt,.doc,.docx,.pdf,.zip,.rar,.7z"
            onChange={(e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                // 处理文件上传
                const fileNames = Array.from(files).map(f => f.name).join(', ');
                setInput(prev => prev + (prev ? '\n' : '') + `[已上传文件: ${fileNames}]`);
              }
              e.target.value = '';
            }}
            className="hidden"
            id="ai-assistant-file-input"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => document.getElementById('ai-assistant-file-input')?.click()}
            className="bg-background/50 border-border/50 hover:bg-background/80"
            title="上传文件"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            placeholder="输入你的问题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            className="bg-background/50 border-border/50"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="bg-primary hover:bg-primary/80"
            data-send-btn
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 角色设计助手弹窗 */}
      <CharacterDesignAssistant
        isOpen={isCharacterDesignAssistantOpen}
        onClose={() => {
          setIsCharacterDesignAssistantOpen(false);
          // 关闭时清空剧本内容
          setScriptContentForAssistant('');
          setScriptTitleForAssistant('');
        }}
        onLoadToCanvas={onLoadToCanvas}
        initialScriptContent={scriptContentForAssistant}
        initialScriptTitle={scriptTitleForAssistant}
      />
    </div>
  );
}
