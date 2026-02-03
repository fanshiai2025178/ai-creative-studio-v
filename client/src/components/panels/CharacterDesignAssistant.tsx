/**
 * 智能小助手 - 角色设计
 * 通过对话式交互帮助用户设计动漫/3D角色
 * 功能：剧本分析、风格搜索、参考图选择、角色生成
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { STYLE_IMAGES } from "@/data/styleImages";
import { 
  X, Send, Loader2, Bot, User, ChevronDown, ChevronUp, 
  Image, Download, Upload, Grid, Sparkles, Search, Check, Paperclip, FileText, FileImage, File, Forward
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { LoadingProgress } from "@/components/ui/loading-progress";

// 风格数据类型
interface StyleData {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  description: string;
  prompt: string;
  examples: string[];
  thumbnail: string;
}

interface StyleCategory {
  id: string;
  name: string;
  icon: string;
}

// 消息类型
interface AssistantMessage {
  role: "assistant" | "user";
  type: "text" | "image_search" | "options" | "generated_image" | "script_analysis" | "style_selection";
  content: string;
  data?: {
    searchResults?: Array<{
      title: string;
      keyword: string;
      images: Array<{ url: string; thumbnail?: string }>;
    }>;
    options?: Array<{ key: string; label: string; description?: string }>;
    generatedImages?: Array<{
      url: string;
      characterName: string;
      description: string;
    }>;
    scriptAnalysis?: {
      summary: string;
      characters: Array<{
        name: string;
        role: string;
        age?: string;
        personality?: string;
        appearance?: string;
      }>;
      setting: string;
      style?: string;
    };
    styleSelection?: {
      styles: StyleData[];
      categories: StyleCategory[];
    };
  };
  timestamp: number;
}

interface CharacterDesignAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadToCanvas?: (imageUrl: string, name: string, type: 'character' | 'scene' | 'prop') => void;
  initialScriptContent?: string;
  initialScriptTitle?: string;
}

// 图片搜索结果卡片组件
const ImageSearchCard = ({ 
  result, 
  isExpanded, 
  onToggle, 
  onSelectImage 
}: { 
  result: { title: string; keyword: string; images: Array<{ url: string; thumbnail?: string }> };
  isExpanded: boolean;
  onToggle: () => void;
  onSelectImage: (url: string) => void;
}) => {
  return (
    <div className="bg-[#1a1035] rounded-lg border border-purple-900/30 overflow-hidden">
      {/* 卡片头部 - 可点击展开/收起 */}
      <div 
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-purple-900/20 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-purple-400" />
          <span className="text-sm text-white">{result.title}</span>
          <span className="text-xs text-gray-500">({result.images.length}张)</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </div>
      
      {/* 缩略图预览（收起状态） */}
      {!isExpanded && result.images.length > 0 && (
        <div className="px-3 pb-2 flex gap-1">
          {result.images.slice(0, 5).map((img, idx) => (
            <div 
              key={idx} 
              className="w-10 h-10 rounded bg-[#0d0820] overflow-hidden cursor-pointer hover:ring-2 hover:ring-purple-500 transition-all"
              onClick={(e) => {
                e.stopPropagation();
                onSelectImage(img.url);
              }}
            >
              <img 
                src={img.thumbnail || img.url} 
                alt="" 
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="%231a1035" width="40" height="40"/><text x="50%" y="50%" fill="%23666" font-size="10" text-anchor="middle" dy=".3em">无图</text></svg>';
                }}
              />
            </div>
          ))}
          {result.images.length > 5 && (
            <div className="w-10 h-10 rounded bg-[#0d0820] flex items-center justify-center text-xs text-gray-500">
              +{result.images.length - 5}
            </div>
          )}
        </div>
      )}
      
      {/* 展开状态 - 显示所有图片 */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-4 gap-2">
            {result.images.map((img, idx) => (
              <div 
                key={idx}
                className="aspect-square rounded bg-[#0d0820] overflow-hidden cursor-pointer hover:ring-2 hover:ring-purple-500 transition-all group relative"
                onClick={() => onSelectImage(img.url)}
              >
                <img 
                  src={img.thumbnail || img.url} 
                  alt="" 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%231a1035" width="100" height="100"/><text x="50%" y="50%" fill="%23666" font-size="12" text-anchor="middle" dy=".3em">加载失败</text></svg>';
                  }}
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs text-white">点击选择</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// 生成的角色图片卡片
const GeneratedImageCard = ({ 
  image, 
  onLoadToCanvas, 
  onDownload
}: { 
  image: { url: string; characterName: string; description: string };
  onLoadToCanvas?: () => void;
  onDownload: () => void;
}) => {
  return (
    <div className="bg-[#1a1035] rounded-lg border border-purple-900/30 overflow-hidden">
      {/* 横屏显示，宽高比 16:9 */}
      <div className="aspect-video bg-[#0d0820] overflow-hidden">
        <img 
          src={image.url} 
          alt={image.characterName} 
          className="w-full h-full object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect fill="%231a1035" width="320" height="180"/><text x="50%" y="50%" fill="%23666" font-size="14" text-anchor="middle" dy=".3em">生成失败</text></svg>';
          }}
        />
      </div>
      <div className="p-3">
        <h4 className="text-sm font-medium text-white mb-1">{image.characterName}</h4>
        <p className="text-xs text-gray-400 line-clamp-2">{image.description}</p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={onDownload}
            className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#0d0820] hover:bg-purple-900/30 border border-purple-900/30 rounded text-xs text-gray-300 transition-colors"
            title="下载图片"
          >
            <Download className="w-3 h-3" />
          </button>
          {onLoadToCanvas && (
            <button
              onClick={onLoadToCanvas}
              className="flex items-center justify-center gap-1 px-2 py-1.5 bg-[#0d0820] hover:bg-purple-900/30 border border-purple-900/30 rounded text-xs text-gray-300 transition-colors"
              title="发送到画布"
            >
              <Forward className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// 选项按钮组件
const OptionButton = ({ 
  option, 
  onClick 
}: { 
  option: { key: string; label: string; description?: string };
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 bg-[#1a1035] hover:bg-purple-900/30 border border-purple-900/30 hover:border-purple-500/50 rounded-lg transition-all group"
    >
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-purple-600/30 flex items-center justify-center text-xs text-purple-300 font-medium">
          {option.key}
        </span>
        <span className="text-sm text-white font-medium">{option.label}</span>
      </div>
      {option.description && (
        <p className="text-xs text-gray-500 mt-1 ml-8">{option.description}</p>
      )}
    </button>
  );
};

// 风格选择卡片组件
const StyleSelectionCard = ({
  styles,
  categories,
  onSelectStyle,
}: {
  styles: StyleData[];
  categories: StyleCategory[];
  onSelectStyle: (style: StyleData) => void;
}) => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null);

  const filteredStyles = activeCategory === "all" 
    ? styles 
    : styles.filter(s => s.category === activeCategory);

  // 获取当前悬停的风格数据
  const hoveredStyleData = hoveredStyle ? styles.find(s => s.id === hoveredStyle) : null;

  return (
    <div className="bg-[#1a1035] rounded-lg border border-purple-900/30 relative">
      {/* 风格详细介绍 - 放在最外层避免被裁剪 */}
      {hoveredStyleData && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 px-3 py-2 bg-gray-900/95 border border-purple-500/50 rounded-lg text-[11px] text-gray-300 w-64 z-[9999] shadow-xl backdrop-blur-sm pointer-events-none">
          <p className="font-semibold text-purple-300 mb-1">{hoveredStyleData.name}</p>
          <p className="leading-relaxed text-gray-400">{hoveredStyleData.description}</p>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-2.5 h-2.5 bg-gray-900/95 border-r border-b border-purple-500/50"></div>
        </div>
      )}
      {/* 分类标签 */}
      <div className="flex items-center gap-1 p-2 border-b border-purple-900/30 overflow-x-auto">
        <button
          onClick={() => setActiveCategory("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
            activeCategory === "all"
              ? "bg-purple-600/30 text-purple-300 border border-purple-500/50"
              : "bg-[#0d0820] text-gray-400 border border-transparent hover:border-purple-900/30"
          }`}
        >
          全部风格
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeCategory === cat.id
                ? "bg-purple-600/30 text-purple-300 border border-purple-500/50"
                : "bg-[#0d0820] text-gray-400 border border-transparent hover:border-purple-900/30"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* 风格卡片网格 */}
      <div className="p-2 max-h-[350px] overflow-y-auto overflow-x-hidden">
        <div className="grid grid-cols-4 gap-2">
          {filteredStyles.map((style) => {
            // 简化风格名称：去掉"风格"两个字，只保留核心名称
            const shortName = style.name
              .replace(/风格$/, '')
              .replace(/动画风$/, '')
              .replace(/插画风格$/, '')
              .replace(/电影风格$/, '')
              .replace(/3D风格$/, '3D');
            return (
              <button
                key={style.id}
                onClick={() => onSelectStyle(style)}
                onMouseEnter={() => setHoveredStyle(style.id)}
                onMouseLeave={() => setHoveredStyle(null)}
                className={`relative text-center p-1 rounded-lg border transition-all ${
                  hoveredStyle === style.id
                    ? "bg-purple-600/20 border-purple-500/50"
                    : "bg-[#0d0820] border-purple-900/30 hover:border-purple-500/30"
                }`}
              >
                {/* 风格示例图片 - 在上方，更大 */}
                {STYLE_IMAGES[style.id] && (
                  <div className="w-full aspect-square rounded-md overflow-hidden bg-[#1a1035] mb-1">
                    <img 
                      src={STYLE_IMAGES[style.id]} 
                      alt={style.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {/* 风格名称 - 完整显示，带 tooltip */}
                <div 
                  className="relative"
                  title={`${style.name}\n${style.description}`}
                >
                  <h4 className="text-[10px] font-medium text-white leading-tight text-center">
                    {shortName}
                  </h4>
                </div>

                {hoveredStyle === style.id && (
                  <div className="absolute inset-0 bg-purple-600/10 rounded-lg flex items-center justify-center">
                    <span className="px-2 py-1 bg-purple-600 text-white text-[10px] rounded-full flex items-center gap-0.5">
                      <Check className="w-3 h-3" />
                      选择
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 自定义风格提示 */}
      <div className="px-3 pb-3">
        <p className="text-xs text-gray-500 text-center">
          或者直接输入你想要的风格描述，例如：“日韩漫画风格、赛璐璐厚涂、硬朗线条”
        </p>
      </div>
    </div>
  );
};

export default function CharacterDesignAssistant({ 
  isOpen, 
  onClose, 
  onLoadToCanvas,
  initialScriptContent,
  initialScriptTitle
}: CharacterDesignAssistantProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("正在处理中...");
  const [loadingEstimatedTime, setLoadingEstimatedTime] = useState(30);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; type: string; url?: string; uploading?: boolean }>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 异步生成进度状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0, currentCharacter: '' });
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // tRPC mutations
  const startSessionMutation = trpc.assistantCharacterDesign.startSession.useMutation();
  const chatMutation = trpc.assistantCharacterDesign.chat.useMutation();
  const endSessionMutation = trpc.assistantCharacterDesign.endSession.useMutation();

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // 消息变化时滚动到底部
  useEffect(() => {
    scrollToBottom();
  }, [messages.length]); // 只依赖 messages.length，避免无限循环

  // 开始新会话
  const startNewSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await startSessionMutation.mutateAsync();
      setSessionId(result.sessionId);
      setMessages(result.messages as AssistantMessage[]);
      setSelectedImages([]);
      setExpandedCards(new Set());
    } catch (error) {
      toast.error("启动会话失败，请重试");
    } finally {
      setIsLoading(false);
    }
  }, []); // 移除 startSessionMutation 依赖，避免无限循环

  // 打开时自动开始会话
  useEffect(() => {
    if (isOpen && !sessionId) {
      startNewSession();
    }
  }, [isOpen]); // 只依赖 isOpen，避免无限循环

  // 当有初始剧本内容时，自动发送到对话框
  const [hasAutoSentScript, setHasAutoSentScript] = useState(false);

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // 关闭时结束会话
  const handleClose = useCallback(() => {
    // 清理轮询
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (sessionId) {
      endSessionMutation.mutate({ sessionId });
    }
    setSessionId(null);
    setMessages([]);
    setSelectedImages([]);
    setIsGenerating(false);
    setGenerationProgress({ current: 0, total: 0, currentCharacter: '' });
    onClose();
  }, [sessionId, endSessionMutation, onClose]);

  // 轮询生成进度
  const pollGenerationProgress = useCallback(async () => {
    if (!sessionId) return;
    
    try {
      // 使用正确的 tRPC GET 请求格式
      const input = JSON.stringify({ json: { sessionId } });
      const response = await fetch(`/api/trpc/assistantCharacterDesign.getGenerationProgress?input=${encodeURIComponent(input)}`);
      const data = await response.json();
      const result = data?.result?.data?.json;
      
      if (!result) return;
      
      // 更新进度状态
      setGenerationProgress({
        current: result.progress || 0,
        total: result.total || 0,
        currentCharacter: result.currentCharacter || '',
      });
      
      // 更新加载文本
      if (result.isGenerating && result.total > 0) {
        const progressText = result.currentCharacter 
          ? `正在生成角色：${result.currentCharacter} (${result.progress}/${result.total})`
          : `正在生成角色图片... (${result.progress}/${result.total})`;
        setLoadingText(progressText);
        // 根据剩余角色数量调整预估时间
        const remaining = result.total - result.progress;
        setLoadingEstimatedTime(remaining * 20); // 每个角色约 20 秒
      }
      
      // 如果生成完成
      if (result.isCompleted) {
        // 停止轮询
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsGenerating(false);
        setIsLoading(false);
        
        // 如果有结果消息，添加到界面
        if (result.resultMessage) {
          setMessages(prev => {
            // 检查是否已经有结果消息
            const hasResult = prev.some(
              m => m.type === "generated_image" && m.data?.generatedImages?.length
            );
            if (hasResult) return prev;
            return [...prev, result.resultMessage as AssistantMessage];
          });
        }
        
        toast.success("角色生成完成！");
      }
    } catch (error) {
      console.error("轮询生成进度失败:", error);
    }
  }, [sessionId]);

  // 开始轮询
  const startPolling = useCallback(() => {
    // 清理旧的轮询
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    setIsGenerating(true);
    setGenerationProgress({ current: 0, total: 0, currentCharacter: '' });
    
    // 立即执行一次
    pollGenerationProgress();
    
    // 每 2 秒轮询一次
    pollingIntervalRef.current = setInterval(pollGenerationProgress, 2000);
  }, [pollGenerationProgress]);

  // 发送消息
  const handleSend = useCallback(async () => {
    if ((!input.trim() && uploadedFiles.length === 0) || !sessionId || isLoading || isGenerating) return;

    const userMessage = input.trim();
    
    // 构建消息内容，包含文件信息
    let messageContent = userMessage;
    if (uploadedFiles.length > 0) {
      const fileInfo = uploadedFiles.map(f => `[文件: ${f.name}]`).join(' ');
      messageContent = messageContent ? `${messageContent}\n${fileInfo}` : fileInfo;
    }
    
    setInput("");
    setUploadedFiles([]); // 清空已上传文件
    
    // 根据消息内容设置不同的加载文本和预估时间
    const lowerMessage = messageContent.toLowerCase();
    if (uploadedFiles.length > 0) {
      setLoadingText("正在读取文档内容...");
      setLoadingEstimatedTime(15);
    } else if (lowerMessage.includes("设计") && (lowerMessage.includes("角色") || lowerMessage.includes("主角"))) {
      setLoadingText("正在生成角色图片...");
      setLoadingEstimatedTime(60); // 图片生成需要更长时间
    } else if (messages.length <= 2) {
      setLoadingText("正在分析剧本内容...");
      setLoadingEstimatedTime(20);
    } else {
      setLoadingText("正在处理中...");
      setLoadingEstimatedTime(15);
    }
    
    setIsLoading(true);

    // 添加用户消息到界面
    const userMsg: AssistantMessage = {
      role: "user",
      type: "text",
      content: messageContent,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const result = await chatMutation.mutateAsync({
        sessionId,
        message: messageContent,
        attachments: selectedImages.length > 0 
          ? selectedImages.map(url => ({ type: "image" as const, url }))
          : undefined,
      });

      // 添加助手响应
      setMessages(prev => [...prev, ...(result.messages as AssistantMessage[])]);
      setSelectedImages([]); // 清空已选图片
      
      // 根据后端返回的 step 判断是否需要开始轮询
      if (result.step === "generating") {
        // 开始轮询生成进度
        setLoadingText("正在生成角色图片...");
        setLoadingEstimatedTime(120); // 多个角色需要更长时间
        startPolling();
        return; // 不要设置 isLoading 为 false
      }
    } catch (error: any) {
      toast.error(error.message || "发送失败，请重试");
      // 添加错误消息
      const errorMsg: AssistantMessage = {
        role: "assistant",
        type: "text",
        content: "抱歉，处理您的请求时出现了问题。请重试或重新开始会话。",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      // 只有在不是生成中的时候才设置 isLoading 为 false
      if (!isGenerating) {
        setIsLoading(false);
      }
    }
  }, [input, sessionId, isLoading, isGenerating, selectedImages, chatMutation, messages.length, uploadedFiles, startPolling]);

  // 自动发送剧本内容的函数
  const autoSendScriptContent = useCallback(async (scriptContent: string, scriptTitle: string) => {
    if (!sessionId || isLoading || isGenerating) return;
    
    // 截断显示的字数限制
    const DISPLAY_LIMIT = 200;
    const isContentTruncated = scriptContent.length > DISPLAY_LIMIT;
    const truncatedContent = isContentTruncated 
      ? scriptContent.substring(0, DISPLAY_LIMIT) + '...' 
      : scriptContent;
    
    // 构建完整的剧本消息（发送给后端）
    const fullScriptMessage = scriptTitle 
      ? `请帮我分析这个剧本并设计角色：

【剧本标题】${scriptTitle}

【剧本内容】
${scriptContent}`
      : `请帮我分析这个剧本并设计角色：

${scriptContent}`;
    
    // 构建截断显示的消息（显示在对话框中）
    const displayMessage = scriptTitle 
      ? `请帮我分析这个剧本并设计角色：

【剧本标题】${scriptTitle}

【剧本内容】
${truncatedContent}${isContentTruncated ? `

（剧本内容共 ${scriptContent.length} 字，已发送完整内容进行分析）` : ''}`
      : `请帮我分析这个剧本并设计角色：

${truncatedContent}${isContentTruncated ? `

（剧本内容共 ${scriptContent.length} 字，已发送完整内容进行分析）` : ''}`;
    
    // 设置加载状态
    setLoadingText("正在分析剧本内容...");
    setLoadingEstimatedTime(20);
    setIsLoading(true);
    
    // 添加用户消息到界面（显示截断版本）
    const userMsg: AssistantMessage = {
      role: "user",
      type: "text",
      content: displayMessage,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    
    try {
      // 发送完整内容给后端
      const result = await chatMutation.mutateAsync({
        sessionId,
        message: fullScriptMessage,
      });
      
      // 添加助手响应
      setMessages(prev => [...prev, ...(result.messages as AssistantMessage[])]);
      
      // 根据后端返回的 step 判断是否需要开始轮询
      if (result.step === "generating") {
        setLoadingText("正在生成角色图片...");
        setLoadingEstimatedTime(120);
        startPolling();
        return;
      }
    } catch (error: any) {
      toast.error(error.message || "发送失败，请重试");
      const errorMsg: AssistantMessage = {
        role: "assistant",
        type: "text",
        content: "抱歉，处理您的请求时出现了问题。请重试或重新开始会话。",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      if (!isGenerating) {
        setIsLoading(false);
      }
    }
  }, [sessionId, isLoading, isGenerating, chatMutation, startPolling]);
  
  // 监听初始剧本内容，自动发送
  useEffect(() => {
    if (isOpen && sessionId && initialScriptContent && !hasAutoSentScript && !isLoading) {
      setHasAutoSentScript(true);
      // 延迟一小段时间确保会话已完全初始化
      setTimeout(() => {
        autoSendScriptContent(initialScriptContent, initialScriptTitle || '');
      }, 500);
    }
  }, [isOpen, sessionId, initialScriptContent, initialScriptTitle, hasAutoSentScript, isLoading, autoSendScriptContent]);

  // 关闭时重置自动发送状态
  useEffect(() => {
    if (!isOpen) {
      setHasAutoSentScript(false);
    }
  }, [isOpen]);

  // 选择参考图片
  const handleSelectImage = useCallback((url: string) => {
    setSelectedImages(prev => {
      if (prev.includes(url)) {
        return prev.filter(u => u !== url);
      }
      return [...prev, url];
    });
    toast.success("已选择参考图，可继续选择或发送消息");
  }, []);

  // 选择选项 - 直接发送，不需要用户再点击发送按钮
  const handleSelectOption = useCallback(async (optionKey: string) => {
    if (!sessionId || isLoading || isGenerating) return;
    
    // 直接发送选项，不设置 input
    setLoadingText("正在处理中...");
    setLoadingEstimatedTime(15);
    setIsLoading(true);

    // 添加用户消息到界面
    const userMsg: AssistantMessage = {
      role: "user",
      type: "text",
      content: optionKey,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const result = await chatMutation.mutateAsync({
        sessionId,
        message: optionKey,
      });

      // 添加助手响应
      setMessages(prev => [...prev, ...(result.messages as AssistantMessage[])]);
      
      // 根据后端返回的 step 判断是否需要开始轮询
      if (result.step === "generating") {
        setLoadingText("正在生成角色图片...");
        setLoadingEstimatedTime(120);
        startPolling();
        return;
      }
    } catch (error: any) {
      toast.error(error.message || "发送失败，请重试");
      const errorMsg: AssistantMessage = {
        role: "assistant",
        type: "text",
        content: "抱歉，处理您的请求时出现了问题。请重试或重新开始会话。",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      if (!isGenerating) {
        setIsLoading(false);
      }
    }
  }, [sessionId, isLoading, isGenerating, chatMutation, startPolling]);

  // 选择风格 - 直接发送，不需要用户再点击发送按钮
  const handleSelectStyle = useCallback(async (style: StyleData) => {
    if (!sessionId || isLoading || isGenerating) return;
    
    // 使用风格信息：名称 + 详细描述 + 提示词 + 风格 ID（用于后台获取参考图）
    const styleMessage = `风格：${style.name}
描述：${style.description}
提示词：${style.prompt}
风格 ID：${style.id}`;
    
    toast.success(`已选择风格：${style.name}`);
    
    // 直接发送风格选择
    setLoadingText("正在处理风格选择...");
    setLoadingEstimatedTime(10);
    setIsLoading(true);

    // 添加用户消息到界面
    const userMsg: AssistantMessage = {
      role: "user",
      type: "text",
      content: styleMessage,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const result = await chatMutation.mutateAsync({
        sessionId,
        message: styleMessage,
      });

      // 添加助手响应
      setMessages(prev => [...prev, ...(result.messages as AssistantMessage[])]);
      
      // 根据后端返回的 step 判断是否需要开始轮询
      if (result.step === "generating") {
        setLoadingText("正在生成角色图片...");
        setLoadingEstimatedTime(120);
        startPolling();
        return;
      }
    } catch (error: any) {
      toast.error(error.message || "发送失败，请重试");
      const errorMsg: AssistantMessage = {
        role: "assistant",
        type: "text",
        content: "抱歉，处理您的请求时出现了问题。请重试或重新开始会话。",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      if (!isGenerating) {
        setIsLoading(false);
      }
    }
  }, [sessionId, isLoading, isGenerating, chatMutation, startPolling]);

  // 下载图片
  const handleDownload = useCallback((url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    link.click();
    toast.success("开始下载");
  }, []);


  // 文件上传处理
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allowedTypes = [
      // 图片
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // 文档
      'text/plain', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // 压缩包
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
    ];

    const maxSize = 50 * 1024 * 1024; // 50MB

    for (const file of Array.from(files)) {
      // 检查文件类型
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(txt|doc|docx|pdf|zip|rar|7z)$/i)) {
        toast.error(`不支持的文件类型: ${file.name}`);
        continue;
      }

      // 检查文件大小
      if (file.size > maxSize) {
        toast.error(`文件过大: ${file.name} (最大50MB)`);
        continue;
      }

      // 添加到上传列表（显示上传中状态）
      const fileId = `${file.name}-${Date.now()}`;
      setUploadedFiles(prev => [...prev, { name: file.name, type: file.type, uploading: true }]);

      try {
        // 读取文件内容
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          
          // 如果是文本文件，直接读取内容并添加到输入框
          if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
            const textReader = new FileReader();
            textReader.onload = () => {
              const textContent = textReader.result as string;
              setInput(prev => prev + (prev ? '\n\n' : '') + `[文件: ${file.name}]\n${textContent}`);
              setUploadedFiles(prev => prev.filter(f => f.name !== file.name || !f.uploading));
              toast.success(`已加载文件: ${file.name}`);
            };
            textReader.readAsText(file);
          } else {
            // 其他文件类型，显示文件名称
            setUploadedFiles(prev => prev.map(f => 
              f.name === file.name && f.uploading ? { ...f, uploading: false, url: URL.createObjectURL(file) } : f
            ));
            toast.success(`已添加文件: ${file.name}`);
          }
        };
        reader.readAsDataURL(file);
      } catch (error) {
        toast.error(`上传失败: ${file.name}`);
        setUploadedFiles(prev => prev.filter(f => f.name !== file.name || !f.uploading));
      }
    }

    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  }, []);

  // 移除已上传的文件
  const removeUploadedFile = useCallback((fileName: string) => {
    setUploadedFiles(prev => prev.filter(f => f.name !== fileName));
  }, []);

  // 获取文件图标
  const getFileIcon = (type: string, name: string) => {
    if (type.startsWith('image/') || name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return <FileImage className="w-4 h-4 text-blue-400" />;
    }
    if (type === 'text/plain' || name.match(/\.(txt)$/i)) {
      return <FileText className="w-4 h-4 text-green-400" />;
    }
    if (type.includes('word') || name.match(/\.(doc|docx)$/i)) {
      return <FileText className="w-4 h-4 text-blue-500" />;
    }
    if (type === 'application/pdf' || name.match(/\.(pdf)$/i)) {
      return <FileText className="w-4 h-4 text-red-400" />;
    }
    if (type.includes('zip') || type.includes('rar') || name.match(/\.(zip|rar|7z)$/i)) {
      return <File className="w-4 h-4 text-yellow-400" />;
    }
    return <File className="w-4 h-4 text-gray-400" />;
  };

  // 切换卡片展开状态
  const toggleCardExpanded = useCallback((cardId: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  // 渲染消息内容
  const renderMessageContent = (message: AssistantMessage) => {
    switch (message.type) {
      case "text":
        return (
          <div className="prose prose-sm prose-invert max-w-none">
            <Streamdown>{message.content}</Streamdown>
          </div>
        );

      case "script_analysis":
        return (
          <div className="space-y-3">
            <div className="prose prose-sm prose-invert max-w-none">
              <Streamdown>{message.content}</Streamdown>
            </div>
            {message.data?.scriptAnalysis && (
              <div className="bg-[#0d0820] rounded-lg p-3 border border-purple-900/30">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">角色列表</span>
                </div>
                <div className="space-y-2">
                  {message.data.scriptAnalysis.characters.map((char, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-purple-600/30 flex items-center justify-center text-xs text-purple-300 flex-shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="text-white font-medium">{char.name}</span>
                        <span className="text-gray-500 mx-1">·</span>
                        <span className="text-purple-400">{char.role}</span>
                        {char.age && <span className="text-gray-500 ml-1">({char.age})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case "image_search":
        return (
          <div className="space-y-3">
            <div className="prose prose-sm prose-invert max-w-none">
              <Streamdown>{message.content}</Streamdown>
            </div>
            {message.data?.searchResults && (
              <div className="space-y-2">
                {message.data.searchResults.map((result, idx) => (
                  <ImageSearchCard
                    key={idx}
                    result={result}
                    isExpanded={expandedCards.has(`search_${idx}`)}
                    onToggle={() => toggleCardExpanded(`search_${idx}`)}
                    onSelectImage={handleSelectImage}
                  />
                ))}
              </div>
            )}
          </div>
        );

      case "options":
        return (
          <div className="space-y-3">
            <div className="prose prose-sm prose-invert max-w-none">
              <Streamdown>{message.content}</Streamdown>
            </div>
            {message.data?.options && (
              <div className="space-y-2">
                {message.data.options.map((option, idx) => (
                  <OptionButton
                    key={idx}
                    option={option}
                    onClick={() => handleSelectOption(option.key)}
                  />
                ))}
              </div>
            )}
          </div>
        );

      case "generated_image":
        return (
          <div className="space-y-3">
            <div className="prose prose-sm prose-invert max-w-none">
              <Streamdown>{message.content}</Streamdown>
            </div>
            {message.data?.generatedImages && (
              <div className="space-y-3">
                {message.data.generatedImages.map((image, idx) => (
                  <GeneratedImageCard
                    key={idx}
                    image={image}
                    onLoadToCanvas={onLoadToCanvas ? () => onLoadToCanvas(image.url, image.characterName, 'character') : undefined}
                    onDownload={() => handleDownload(image.url, image.characterName)}
                  />
                ))}
              </div>
            )}
          </div>
        );

      case "style_selection":
        return (
          <div className="space-y-3">
            <div className="prose prose-sm prose-invert max-w-none">
              <Streamdown>{message.content}</Streamdown>
            </div>
            {message.data?.styleSelection && (
              <StyleSelectionCard
                styles={message.data.styleSelection.styles}
                categories={message.data.styleSelection.categories}
                onSelectStyle={handleSelectStyle}
              />
            )}
          </div>
        );

      default:
        return (
          <div className="prose prose-sm prose-invert max-w-none">
            <Streamdown>{message.content}</Streamdown>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[600px] h-[80vh] bg-[#0a0618] rounded-xl border border-purple-900/30 flex flex-col overflow-hidden shadow-2xl">
        {/* 头部 */}
        <div className="px-4 py-3 border-b border-purple-900/30 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-medium text-white">角色设计助手</h3>
              <p className="text-xs text-gray-500">输入剧本，AI 帮你设计角色形象</p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-[#1a1035] hover:bg-purple-900/30 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 消息区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {/* 头像 */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  message.role === "assistant"
                    ? "bg-gradient-to-br from-purple-600 to-pink-600"
                    : "bg-[#1a1035]"
                }`}
              >
                {message.role === "assistant" ? (
                  <Bot className="w-4 h-4 text-white" />
                ) : (
                  <User className="w-4 h-4 text-gray-400" />
                )}
              </div>

              {/* 消息内容 */}
              <div
                className={`rounded-lg p-3 text-sm max-w-[85%] ${
                  message.role === "assistant"
                    ? "bg-[#1a1035] border border-purple-900/30"
                    : "bg-purple-600/20 border border-purple-500/30"
                }`}
              >
                {renderMessageContent(message)}
              </div>
            </div>
          ))}

          {/* 加载中 - 带进度动画 */}
          {(isLoading || isGenerating) && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="rounded-lg p-4 bg-[#1a1035] border border-purple-900/30 min-w-[250px]">
                <LoadingProgress
                  isLoading={true}
                  text={loadingText}
                  estimatedTime={loadingEstimatedTime}
                  showPercentage={true}
                  size="md"
                />
                {/* 生成进度详情 */}
                {isGenerating && generationProgress.total > 0 && (
                  <div className="mt-3 pt-3 border-t border-purple-900/30">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>已生成 {generationProgress.current} / {generationProgress.total} 个角色</span>
                      <span>{Math.round((generationProgress.current / generationProgress.total) * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 bg-[#0d0820] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                        style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 已选图片预览 */}
        {selectedImages.length > 0 && (
          <div className="px-4 py-2 border-t border-purple-900/30 bg-[#0d0820]">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">已选参考图：</span>
              <div className="flex gap-1 flex-wrap">
                {selectedImages.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <div className="w-10 h-10 rounded bg-[#1a1035] overflow-hidden">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => setSelectedImages(prev => prev.filter(u => u !== url))}
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 输入区域 */}
        <div className="p-4 border-t border-purple-900/30 shrink-0">
          {/* 已上传文件列表 */}
          {uploadedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {uploadedFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-2 px-2 py-1 bg-[#1a1035] border border-purple-900/30 rounded-lg text-xs"
                >
                  {file.uploading ? (
                    <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                  ) : (
                    getFileIcon(file.type, file.name)
                  )}
                  <span className="text-gray-300 max-w-[120px] truncate">{file.name}</span>
                  <button
                    onClick={() => removeUploadedFile(file.name)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-2">
            {/* 文件上传按钮 */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.txt,.doc,.docx,.pdf,.zip,.rar,.7z"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-[#0d0820]/50 border border-purple-900/30 rounded-lg text-gray-400 hover:text-purple-400 hover:bg-[#1a1035] transition-all"
              title="上传文件"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isGenerating ? "正在生成角色，请稍候..." : "输入剧本内容或回复助手..."}
              className="flex-1 bg-[#0d0820]/50 border border-purple-900/30 rounded-lg px-3 py-2 text-white text-sm placeholder:text-gray-500 focus:border-purple-500/50 focus:outline-none disabled:opacity-50"
              disabled={isLoading || isGenerating}
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && uploadedFiles.length === 0) || isLoading || isGenerating}
              className="p-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            提示：粘贴剧本文本开始设计，或上传文件（支持图片、TXT、Word、PDF、压缩包）
          </p>
        </div>
      </div>
    </div>
  );
}
