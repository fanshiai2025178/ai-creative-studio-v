/**
 * 剧本改编面板组件
 * 完全按照用户提供的代码实现
 */

import { useState, useEffect } from "react";
import { 
  Settings2, Upload, Wand2, ChevronLeft, ChevronRight, FileText, Save, Trash2, Clock,
  CheckCircle, AlertCircle, AlertTriangle, Download, ChevronDown, ChevronUp,
  Loader2, Edit2, Check, X, Copy
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import mammoth from "mammoth";

// 类型定义
interface Scene {
  sceneId: number;
  location: string;
  composition?: string;
  characterActions?: string;
  dialogue?: string;
  emotionalTone?: string;
  adaptationNote?: string;
  duration: number;
}

interface Episode {
  episodeNumber: number;
  title: string;
  hook?: string;
  coreConflict: string;
  keyEvents: string[];
  scenes: Scene[];
  cliffhanger?: string;
  conflictIntensity: number;
  duration?: number;
}

interface QualityMetrics {
  overallScore: number;
  mainLineClarity: number;
  conflictProgression: number;
  pacingControl: number;
  dialogueQuality: number;
  visualDesign: number;
  qualityStatus: 'PASS' | 'REVISION_NEEDED' | 'FAIL';
  issues: string[];
  suggestions: string[];
}

interface GeneratedScript {
  metadata: {
    title: string;
    storyConcept: string;
    storyType: string;
    episodeCount: number;
    totalDuration: number;
  };
  adaptationAnalysis?: string;
  adaptedStory?: string;
  episodes: Episode[];
  qualityMetrics: QualityMetrics;
  rawContent?: string;
}

interface SavedScript {
  id: number;
  title: string;
  originalContent: string | null;
  adaptedStory: string | null;
  adaptationAnalysis: string | null;
  qualityMetrics: unknown;
  episodes: unknown;
  createdAt: Date;
}

interface ScriptPanelProps {
  canvasId: number;
  onClose: () => void;
}

export default function ScriptPanel({ canvasId, onClose }: ScriptPanelProps) {
  const [activeMode] = useState<'short-drama'>('short-drama');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(null);
  const [scriptTitle, setScriptTitle] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ step: '', progress: 0 });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  
  // 高级配置
  const [episodeCount, setEpisodeCount] = useState(0);
  const [isAutoEpisode, setIsAutoEpisode] = useState(true);
  const [durationPerEpisode, setDurationPerEpisode] = useState(150);

  const [storyType, setStoryType] = useState('身份反转');
  
  // 配置面板收纳状态
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);
  
  // 编辑标题状态
  const [editingScriptId, setEditingScriptId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // 获取已保存的剧本列表
  const { data: savedScripts, refetch } = trpc.basicCreation.getScriptsByCanvas.useQuery(
    { canvasId },
    { enabled: !!canvasId }
  );

  // 生成剧本
  const generateMutation = trpc.basicCreation.generateScript.useMutation({
    onSuccess: (data) => {
      // 后端返回的是 GeneratedScript 对象，带有 id 字段
      // 确保每个 episode 的 keyEvents 是数组
      const episodes = (data.episodes as Episode[]).map(ep => ({
        ...ep,
        keyEvents: ep.keyEvents || [],
        coreConflict: ep.coreConflict || '',
        conflictIntensity: ep.conflictIntensity || 5,
      }));
      const script: GeneratedScript = {
        metadata: data.metadata,
        adaptationAnalysis: data.adaptationAnalysis,
        adaptedStory: data.adaptedStory,
        episodes: episodes,
        qualityMetrics: data.qualityMetrics,
        rawContent: data.rawContent,
      };
      setGeneratedScript(script);
      setCurrentScriptId(data.id as number);
      setSelectedEpisode(0);
      setGenerationProgress({ step: '完成！', progress: 100 });
      toast.success("剧本生成成功");
      refetch();
      
      // 如果核心冲突显示"优化中..."，启动轮询检查更新
      if (episodes.some(ep => ep.coreConflict === '优化中...')) {
        const scriptId = data.id as number;
        const pollInterval = setInterval(async () => {
          try {
            const result = await refetch();
            const updatedScript = result.data?.find(s => s.id === scriptId);
            if (updatedScript?.episodes) {
              const updatedEpisodes = (updatedScript.episodes as Episode[]).map(ep => ({
                ...ep,
                keyEvents: ep.keyEvents || [],
                coreConflict: ep.coreConflict || '',
                conflictIntensity: ep.conflictIntensity || 5,
              }));
              // 检查是否已更新
              if (updatedEpisodes.some(ep => ep.coreConflict && ep.coreConflict !== '优化中...')) {
                setGeneratedScript(prev => prev ? {
                  ...prev,
                  episodes: updatedEpisodes,
                } : null);
                clearInterval(pollInterval);
                toast.success("核心冲突和关键事件已更新");
              }
            }
          } catch (e) {
            console.error('轮询检查更新失败:', e);
          }
        }, 5000); // 每5秒检查一次
        
        // 60秒后停止轮询
        setTimeout(() => clearInterval(pollInterval), 60000);
      }
    },
    onError: (error: any) => {
      setErrorMessage(error.message || '生成失败，请稍后重试');
      setIsGenerating(false);
    },
  });

  // 优化剧本
  const optimizeMutation = trpc.basicCreation.optimizeScript.useMutation({
    onSuccess: (data) => {
      setGeneratedScript(data as GeneratedScript);
      setSelectedEpisode(0);
      setGenerationProgress({ step: '优化完成！', progress: 100 });
      toast.success("剧本优化成功");
      refetch();
    },
    onError: (error: any) => {
      setErrorMessage(error.message || '优化失败，请稍后重试');
      setIsGenerating(false);
    },
  });

  // 更新剧本（用于保存标题等）
  const updateMutation = trpc.basicCreation.updateScript.useMutation({
    onSuccess: () => {
      toast.success("保存成功");
      setShowSaveModal(false);
      setScriptTitle('');
      refetch();
    },
    onError: (error: any) => {
      toast.error("保存失败: " + error.message);
    },
  });

  // 更新剧本标题（复用updateScript API）
  const updateTitleMutation = trpc.basicCreation.updateScript.useMutation({
    onSuccess: () => {
      toast.success("标题更新成功");
      setEditingScriptId(null);
      setEditingTitle('');
      refetch();
    },
    onError: (error: any) => {
      toast.error("更新失败: " + error.message);
    },
  });

  // 删除剧本
  const deleteMutation = trpc.basicCreation.deleteScript.useMutation({
    onSuccess: () => {
      toast.success("删除成功");
      if (currentScriptId) {
        setCurrentScriptId(null);
        setContent('');
        setGeneratedScript(null);
      }
      refetch();
    },
    onError: (error: any) => {
      toast.error("删除失败: " + error.message);
    },
  });

  const handleGenerate = async () => {
    if (!content.trim()) {
      toast.error("请输入原始内容");
      return;
    }

    setIsGenerating(true);
    setErrorMessage('');
    setGenerationProgress({ step: '正在分析内容...', progress: 10 });

    // 模拟进度更新
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev.progress < 90) {
          const newProgress = prev.progress + 5;
          let step = '正在分析内容...';
          if (newProgress > 20) step = '规划故事结构...';
          if (newProgress > 40) step = '生成分集剧本...';
          if (newProgress > 60) step = '设计场景分镜...';
          if (newProgress > 80) step = '质量评估中...';
          return { step, progress: newProgress };
        }
        return prev;
      });
    }, 800);

    try {
      await generateMutation.mutateAsync({
        canvasId,
        originalContent: content,
        episodeCount: isAutoEpisode ? 0 : episodeCount,
        durationPerEpisode,
        storyType,
      });
    } finally {
      clearInterval(progressInterval);
      setIsGenerating(false);
    }
  };

  const handleOptimize = async () => {
    if (!generatedScript || !content.trim()) return;

    setIsGenerating(true);
    setErrorMessage('');
    setGenerationProgress({ step: '正在优化剧本...', progress: 10 });

    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev.progress < 90) {
          const newProgress = prev.progress + 5;
          let step = '分析低分项...';
          if (newProgress > 30) step = 'AI 正在优化内容...';
          if (newProgress > 60) step = '重新评估质量...';
          if (newProgress > 80) step = '即将完成...';
          return { step, progress: newProgress };
        }
        return prev;
      });
    }, 800);

    try {
      if (!currentScriptId) {
        toast.error("请先生成剧本");
        setIsGenerating(false);
        return;
      }
      await optimizeMutation.mutateAsync({
        scriptId: currentScriptId,
        originalContent: content,
        durationPerEpisode, // 传递用户当前选择的每集时长
      });
    } finally {
      clearInterval(progressInterval);
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!generatedScript) {
      toast.error("请先生成剧本内容");
      return;
    }
    setScriptTitle(generatedScript.metadata.title || '');
    setShowSaveModal(true);
  };

  const confirmSave = () => {
    if (!scriptTitle.trim() || !generatedScript || !currentScriptId) return;

    // 使用 updateScript API 更新剧本标题
    updateMutation.mutate({
      id: currentScriptId,
      title: scriptTitle,
    });
  };

  const handleLoadScript = (script: SavedScript) => {
    setCurrentScriptId(script.id);
    setContent(script.originalContent || '');
    // 从数据库返回的数据重建 GeneratedScript 对象
    if (script.episodes && script.qualityMetrics) {
      // 确保每个 episode 的 keyEvents 是数组
      const episodes = (script.episodes as Episode[]).map(ep => ({
        ...ep,
        keyEvents: ep.keyEvents || [],
        coreConflict: ep.coreConflict || '',
        conflictIntensity: ep.conflictIntensity || 5,
      }));
      // 计算总时长：遍历所有分集的所有场景，累加 duration
      const totalDuration = episodes.reduce((total, ep) => {
        const episodeDuration = ep.scenes?.reduce((sum, scene) => sum + (scene.duration || 0), 0) || 0;
        return total + episodeDuration;
      }, 0);
      
      const loadedScript: GeneratedScript = {
        metadata: {
          title: script.title,
          storyConcept: '',
          storyType: '',
          episodeCount: episodes.length,
          totalDuration: totalDuration,
        },
        adaptationAnalysis: script.adaptationAnalysis || '',
        adaptedStory: script.adaptedStory || '',
        episodes: episodes,
        qualityMetrics: script.qualityMetrics as QualityMetrics,
      };
      setGeneratedScript(loadedScript);
      setSelectedEpisode(0);
    } else {
      setGeneratedScript(null);
    }
  };

  const handleDeleteScript = (scriptId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除这个剧本吗？')) {
      deleteMutation.mutate({ id: scriptId });
    }
  };

  const handleStartEdit = (scriptId: number, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingScriptId(scriptId);
    setEditingTitle(currentTitle);
  };

  const handleConfirmEdit = (scriptId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingTitle.trim()) return;
    updateTitleMutation.mutate({ id: scriptId, title: editingTitle });
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingScriptId(null);
    setEditingTitle('');
  };

  const handleNewScript = () => {
    setCurrentScriptId(null);
    setContent('');
    setGeneratedScript(null);
    setScriptTitle('');
  };

  const handleExport = (format: 'markdown' | 'txt' | 'word') => {
    if (!generatedScript) return;

    let exportContent: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case 'markdown':
        exportContent = exportToMarkdown(generatedScript);
        mimeType = 'text/markdown';
        extension = 'md';
        break;
      case 'txt':
        exportContent = exportToTxt(generatedScript);
        mimeType = 'text/plain';
        extension = 'txt';
        break;
      case 'word':
        exportContent = exportToWord(generatedScript);
        mimeType = 'application/msword';
        extension = 'doc';
        break;
    }
    
    const blob = new Blob([exportContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedScript.metadata.title}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出为 Markdown
  const exportToMarkdown = (script: GeneratedScript): string => {
    let md = `# ${script.metadata.title}\n\n`;
    md += `> 故事概念: ${script.metadata.storyConcept}\n\n`;
    md += `**类型**: ${script.metadata.storyType}\n`;
    md += `**总集数**: ${script.metadata.episodeCount} | **质量评分**: ${script.qualityMetrics.overallScore}/10\n\n`;
    md += `---\n\n`;

    for (const episode of script.episodes) {
      md += `## 第${episode.episodeNumber}集：${episode.title}\n\n`;
      md += `**冲突强度**: ${'⭐'.repeat(episode.conflictIntensity)}\n\n`;
      
      if (episode.hook) md += `### 🎣 黄金3秒钩子\n${episode.hook}\n\n`;
      md += `### 核心冲突\n${episode.coreConflict}\n\n`;
      
      if (episode.keyEvents.length > 0) {
        md += `### 关键事件\n`;
        episode.keyEvents.forEach((e, i) => md += `${i + 1}. ${e}\n`);
        md += '\n';
      }
      
      md += `### 场景分镜\n`;
      episode.scenes.forEach((scene, i) => {
        md += `#### 场景${i + 1}: ${scene.location}\n`;
        if (scene.composition) md += `- **画面**: ${scene.composition}\n`;
        if (scene.characterActions) md += `- **动作**: ${scene.characterActions}\n`;
        if (scene.dialogue) md += `- **台词**: "${scene.dialogue}"\n`;
        md += `- **时长**: ${scene.duration}秒\n\n`;
      });
      
      if (episode.cliffhanger) md += `### 🔥 结尾悬念\n${episode.cliffhanger}\n\n`;
      md += `---\n\n`;
    }
    
    return md;
  };

  // 导出为纯文本
  const exportToTxt = (script: GeneratedScript): string => {
    let txt = `${script.metadata.title}\n`;
    txt += `${'='.repeat(40)}\n\n`;
    txt += `故事概念: ${script.metadata.storyConcept}\n`;
    txt += `类型: ${script.metadata.storyType}\n`;
    txt += `总集数: ${script.metadata.episodeCount} | 质量评分: ${script.qualityMetrics.overallScore}/10\n\n`;
    txt += `${'='.repeat(40)}\n\n`;

    for (const episode of script.episodes) {
      txt += `第${episode.episodeNumber}集：${episode.title}\n`;
      txt += `${'-'.repeat(30)}\n`;
      txt += `冲突强度: ${'★'.repeat(episode.conflictIntensity)}${'☆'.repeat(5 - episode.conflictIntensity)}\n\n`;
      
      if (episode.hook) txt += `【开场钩子】${episode.hook}\n\n`;
      txt += `【核心冲突】${episode.coreConflict}\n\n`;
      
      if (episode.keyEvents.length > 0) {
        txt += `【关键事件】\n`;
        episode.keyEvents.forEach((e, i) => txt += `  ${i + 1}. ${e}\n`);
        txt += '\n';
      }
      
      txt += `【场景分镜】\n`;
      episode.scenes.forEach((scene, i) => {
        txt += `  场景${i + 1}: ${scene.location}\n`;
        if (scene.composition) txt += `    画面: ${scene.composition}\n`;
        if (scene.characterActions) txt += `    动作: ${scene.characterActions}\n`;
        if (scene.dialogue) txt += `    台词: ${scene.dialogue}\n`;
        txt += `    时长: ${scene.duration}秒\n\n`;
      });
      
      if (episode.cliffhanger) txt += `【结尾悬念】${episode.cliffhanger}\n`;
      txt += '\n\n';
    }
    
    return txt;
  };

  // 导出为 Word 格式
  const exportToWord = (script: GeneratedScript): string => {
    let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
<head><meta charset="utf-8"><title>${script.metadata.title}</title>
<style>
body { font-family: '微软雅黑', sans-serif; line-height: 1.6; }
h1 { color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 10px; }
h2 { color: #9333ea; margin-top: 20px; }
.meta { color: #666; margin-bottom: 20px; }
.scene { background: #f5f3ff; padding: 10px; margin: 10px 0; border-left: 3px solid #7c3aed; }
.hook { color: #dc2626; font-weight: bold; }
.cliffhanger { color: #ea580c; font-style: italic; }
</style></head><body>`;
    
    html += `<h1>${script.metadata.title}</h1>`;
    html += `<div class="meta"><p><strong>故事概念:</strong> ${script.metadata.storyConcept}</p>`;
    html += `<p><strong>类型:</strong> ${script.metadata.storyType}</p>`;
    html += `<p><strong>总集数:</strong> ${script.metadata.episodeCount} | <strong>质量评分:</strong> ${script.qualityMetrics.overallScore}/10</p></div>`;

    for (const episode of script.episodes) {
      html += `<h2>第${episode.episodeNumber}集：${episode.title}</h2>`;
      html += `<p><strong>冲突强度:</strong> ${'★'.repeat(episode.conflictIntensity)}${'☆'.repeat(5 - episode.conflictIntensity)}</p>`;
      
      if (episode.hook) html += `<p class="hook">【开场钩子】${episode.hook}</p>`;
      html += `<p><strong>【核心冲突】</strong>${episode.coreConflict}</p>`;
      
      if (episode.keyEvents.length > 0) {
        html += `<p><strong>【关键事件】</strong></p><ul>`;
        episode.keyEvents.forEach(e => html += `<li>${e}</li>`);
        html += `</ul>`;
      }
      
      html += `<p><strong>【场景分镜】</strong></p>`;
      episode.scenes.forEach((scene, i) => {
        html += `<div class="scene"><strong>场景${i + 1}: ${scene.location}</strong><br>`;
        if (scene.composition) html += `画面: ${scene.composition}<br>`;
        if (scene.characterActions) html += `动作: ${scene.characterActions}<br>`;
        if (scene.dialogue) html += `台词: ${scene.dialogue}<br>`;
        html += `时长: ${scene.duration}秒</div>`;
      });
      
      if (episode.cliffhanger) html += `<p class="cliffhanger">【结尾悬念】${episode.cliffhanger}</p>`;
    }
    
    html += `</body></html>`;
    return html;
  };

  // 渲染质量指标
  const renderQualityMetrics = (metrics: QualityMetrics) => {
    const getScoreColor = (score: number, threshold: number = 8) => {
      if (score >= threshold) return 'text-green-400';
      if (score >= threshold - 1) return 'text-yellow-400';
      return 'text-red-400';
    };

    const getStatusIcon = () => {
      switch (metrics.qualityStatus) {
        case 'PASS': return <CheckCircle className="w-5 h-5 text-green-400" />;
        case 'REVISION_NEEDED': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
        case 'FAIL': return <AlertCircle className="w-5 h-5 text-red-400" />;
      }
    };

    return (
      <div className="bg-[#1a1035] rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white">质量评分</span>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className={`text-lg font-bold ${getScoreColor(metrics.overallScore)}`}>
              {metrics.overallScore}/10
            </span>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-gray-500">主线清晰</div>
            <div className={`font-medium ${getScoreColor(metrics.mainLineClarity)}`}>
              {metrics.mainLineClarity}/10
            </div>
          </div>
          <div>
            <div className="text-gray-500">冲突递进</div>
            <div className={`font-medium ${getScoreColor(metrics.conflictProgression)}`}>
              {metrics.conflictProgression}/10
            </div>
          </div>
          <div>
            <div className="text-gray-500">节奏控制</div>
            <div className={`font-medium ${getScoreColor(metrics.pacingControl)}`}>
              {metrics.pacingControl}/10
            </div>
          </div>
          <div>
            <div className="text-gray-500">台词质量</div>
            <div className={`font-medium ${getScoreColor(metrics.dialogueQuality)}`}>
              {metrics.dialogueQuality}/10
            </div>
          </div>
          <div>
            <div className="text-gray-500">视觉设计</div>
            <div className={`font-medium ${getScoreColor(metrics.visualDesign, 7)}`}>
              {metrics.visualDesign}/10
            </div>
          </div>
        </div>

        {/* 问题列表 */}
        {metrics.issues.length > 0 && (
          <div className="mt-3 pt-3 border-t border-purple-900/30">
            <div className="text-xs text-yellow-400 mb-1">发现问题:</div>
            {metrics.issues.map((issue, i) => (
              <div key={i} className="text-xs text-gray-400">• {issue}</div>
            ))}
          </div>
        )}

        {/* 改进建议 */}
        {metrics.suggestions.length > 0 && (
          <div className="mt-3 pt-3 border-t border-purple-900/30">
            <div className="text-xs text-blue-400 mb-1">提升建议:</div>
            {metrics.suggestions.slice(0, 4).map((suggestion, i) => (
              <div key={i} className="text-xs text-gray-400 mb-1">{suggestion}</div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="mt-3 pt-3 border-t border-purple-900/30 space-y-2">
          <button
            onClick={handleOptimize}
            disabled={isGenerating}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:from-purple-500 hover:to-pink-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✨ AI 智能优化
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full py-2 px-4 bg-purple-600/20 border border-purple-500/50 text-purple-300 text-sm rounded-lg hover:bg-purple-600/30 transition-colors disabled:opacity-50"
          >
            🔄 完全重新生成
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex bg-[#0a0618]">
      {/* 面板容器 - 固定宽度 */}
      <div className="h-full flex shadow-2xl relative">
        {/* 展开按钮 */}
        {isConfigCollapsed && (
          <button
            onClick={() => setIsConfigCollapsed(false)}
            className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-20 bg-[#1a1035] border-r border-purple-900/30 rounded-r-xl flex items-center justify-center text-purple-400 hover:bg-purple-900/30 hover:text-white transition-all z-20 shadow-lg"
            title="展开配置面板"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
        
        {/* 左侧配置面板 */}
        <div 
          className={`h-full bg-[#0d0820] border-r border-purple-900/30 flex flex-col transition-all duration-300 ${
            isConfigCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-[420px] opacity-100'
          }`}
        >
          {/* 头部 */}
          <div className="px-5 py-4 border-b border-purple-900/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-purple-400" />
              <span className="text-white font-medium">剧本配置</span>
            </div>
            <button
              onClick={() => setIsConfigCollapsed(true)}
              className="w-8 h-8 rounded-lg bg-[#1a1035] hover:bg-purple-900/30 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              title="收纳配置面板"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* 已保存的剧本列表 */}
            {savedScripts && savedScripts.length > 0 && (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm text-gray-400">已保存的剧本</label>
                  <button
                    onClick={handleNewScript}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    + 新建剧本
                  </button>
                </div>
                <div className="space-y-2 max-h-[120px] overflow-y-auto">
                  {savedScripts.map((script) => (
                    <div
                      key={script.id}
                      onClick={() => handleLoadScript(script)}
                      className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all group ${
                        currentScriptId === script.id
                          ? 'bg-purple-600/20 border border-purple-500/50'
                          : 'bg-[#1a1035] border border-transparent hover:border-purple-500/30'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        {editingScriptId === script.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-1 bg-[#0d0820] border border-purple-500 text-white text-sm px-2 py-1 rounded focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={(e) => handleConfirmEdit(script.id, e)}
                              className="text-green-400 hover:text-green-300"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="text-gray-400 hover:text-gray-300"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm text-white truncate">{script.title}</div>
                            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                              <Clock className="w-3 h-3" />
                              {new Date(script.createdAt).toLocaleDateString('zh-CN')}
                              {script.qualityMetrics ? (
                                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                                  (script.qualityMetrics as { qualityStatus?: string }).qualityStatus === 'PASS'
                                    ? 'bg-green-900/30 text-green-400'
                                    : 'bg-yellow-900/30 text-yellow-400'
                                }`}>
                                  {String((script.qualityMetrics as { overallScore?: number }).overallScore || 0)}分
                                </span>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={(e) => handleStartEdit(script.id, script.title, e)}
                          className="text-gray-500 hover:text-blue-400 transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteScript(script.id, e)}
                          className="text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 改编模式 */}
            <div className="mb-5">
              <label className="block text-sm text-gray-400 mb-3">改编模式</label>
              <div className="flex bg-[#1a1035] rounded-xl p-1">
                <button
                  className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all bg-purple-600 text-white"
                >
                  短剧模式
                </button>
              </div>
            </div>

            {/* 高级配置 */}
            <div className="mb-5">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center justify-between w-full text-sm text-gray-400 hover:text-white transition-colors"
              >
                <span>高级配置</span>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              {showAdvanced && (
                <div className="mt-3 space-y-3 p-3 bg-[#1a1035] rounded-xl">
                  {/* 集数设置 */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-2">集数设置</label>
                    <div className="flex gap-2 mb-2">
                      <button
                        onClick={() => { setIsAutoEpisode(true); setEpisodeCount(0); }}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          isAutoEpisode
                            ? 'bg-purple-600 text-white'
                            : 'bg-[#0d0820] text-gray-400 hover:bg-purple-900/30'
                        }`}
                      >
                        🤖 AI 自动判断
                      </button>
                      <button
                        onClick={() => { setIsAutoEpisode(false); setEpisodeCount(3); }}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          !isAutoEpisode
                            ? 'bg-purple-600 text-white'
                            : 'bg-[#0d0820] text-gray-400 hover:bg-purple-900/30'
                        }`}
                      >
                        ✏️ 手动设置
                      </button>
                    </div>
                    
                    {isAutoEpisode ? (
                      <div className="text-xs text-purple-400 bg-purple-900/20 p-2 rounded-lg">
                        💡 AI 将根据以下标准自动判断：
                        <ul className="mt-1 text-gray-400 space-y-0.5">
                          <li>• 内容长度（字数）</li>
                          <li>• 章节/段落数量</li>
                          <li>• 冲突点和转折点数量</li>
                          <li>• 人物和场景复杂度</li>
                        </ul>
                      </div>
                    ) : (
                      <input
                        type="number"
                        value={episodeCount}
                        onChange={(e) => setEpisodeCount(Number(e.target.value))}
                        min={1}
                        max={50}
                        placeholder="输入集数"
                        className="w-full bg-[#0d0820] border border-purple-900/30 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">每集时长（120-180秒）</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        value={durationPerEpisode}
                        onChange={(e) => setDurationPerEpisode(Number(e.target.value))}
                        min={120}
                        max={180}
                        step={10}
                        className="flex-1 h-2 bg-[#0d0820] rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                      <span className="text-white text-sm w-16 text-center">{durationPerEpisode}秒</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>2分钟</span>
                      <span>2分30秒</span>
                      <span>3分钟</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">故事类型</label>
                    <select
                      value={storyType}
                      onChange={(e) => setStoryType(e.target.value)}
                      className="w-full bg-[#0d0820] border border-purple-900/30 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option>身份反转</option>
                      <option>能力觉醒</option>
                      <option>反转悬念</option>
                      <option>情感冲击</option>
                      <option>复仇爽文</option>
                      <option>甜宠恋爱</option>
                    </select>
                  </div>

                </div>
              )}
            </div>

            {/* 原始内容 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm text-gray-400">原始内容</label>
                <label className="flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" />
                  导入文档
                  <input
                    type="file"
                    accept=".txt,.md,.doc,.docx"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const fileName = file.name.toLowerCase();
                        
                        // 处理 .docx 文件
                        if (fileName.endsWith('.docx')) {
                          try {
                            const arrayBuffer = await file.arrayBuffer();
                            const result = await mammoth.extractRawText({ arrayBuffer });
                            if (result.value) {
                              setContent(result.value);
                              toast.success('文档导入成功');
                            } else {
                              toast.error('文档内容为空');
                            }
                          } catch (error) {
                            console.error('Error parsing docx:', error);
                            toast.error('解析 Word 文档失败，请尝试其他格式');
                          }
                        } 
                        // 处理 .doc 文件（旧版 Word，不支持前端解析）
                        else if (fileName.endsWith('.doc')) {
                          toast.error('不支持旧版 .doc 格式，请将文件另存为 .docx 格式');
                        }
                        // 处理纯文本文件 (.txt, .md)
                        else {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            const text = event.target?.result as string;
                            if (text) {
                              setContent(text);
                              toast.success('文档导入成功');
                            }
                          };
                          reader.onerror = () => {
                            toast.error('读取文件失败');
                          };
                          reader.readAsText(file);
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="在此输入或粘贴小说内容..."
                className="w-full h-[200px] bg-[#1a1035] border border-purple-900/30 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="p-5 border-t border-purple-900/30">
            <button
              onClick={handleGenerate}
              disabled={!content.trim() || isGenerating}
              className="w-full bg-gradient-to-r from-purple-600 to-purple-700 text-white py-3.5 rounded-xl font-medium hover:from-purple-500 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5" />
                  开始改编
                </>
              )}
            </button>
          </div>
        </div>

        {/* 右侧结果面板 - 固定宽度 */}
        <div className="w-[520px] h-full bg-[#0a0a14] flex flex-col relative">
          {/* 收纳按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-[#1a1035] border border-purple-900/30 flex items-center justify-center text-gray-400 hover:text-white hover:bg-purple-900/30 transition-colors z-10"
            title="收纳面板"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* 头部 */}
          <div className="px-5 py-4 border-b border-purple-900/30 flex items-center justify-between">
            <span className="text-white font-medium">短剧脚本</span>
            <div className="flex items-center gap-2 mr-10">
              {generatedScript && (
                <>
                  <button
                    onClick={() => handleExport('markdown')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-gray-400 text-xs rounded-lg hover:bg-purple-900/30 hover:text-white transition-colors"
                    title="下载 Markdown 文档"
                  >
                    <Download className="w-3.5 h-3.5" />
                    MD
                  </button>
                  <button
                    onClick={() => handleExport('word')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-gray-400 text-xs rounded-lg hover:bg-purple-900/30 hover:text-white transition-colors"
                    title="下载 Word 文档"
                  >
                    <Download className="w-3.5 h-3.5" />
                    DOC
                  </button>
                  <button
                    onClick={() => handleExport('txt')}
                    className="flex items-center gap-1.5 px-2 py-1.5 text-gray-400 text-xs rounded-lg hover:bg-purple-900/30 hover:text-white transition-colors"
                    title="下载纯文本"
                  >
                    <Download className="w-3.5 h-3.5" />
                    TXT
                  </button>
                </>
              )}
              <button
                onClick={handleSave}
                disabled={!generatedScript}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                保存
              </button>
            </div>
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-y-auto p-5">
            {isGenerating ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-[#1a1035] flex items-center justify-center mx-auto mb-4">
                    <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">{generationProgress.step || '准备中...'}</h3>
                  <p className="text-sm text-gray-500">AI 智能体正在为您创作剧本</p>
                  <div className="mt-4 w-48 mx-auto">
                    <div className="h-2 bg-[#1a1035] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 ease-out"
                        style={{ width: `${generationProgress.progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-purple-400 mt-1">{generationProgress.progress}%</p>
                  </div>
                </div>
              </div>
            ) : generatedScript ? (
              <div className="space-y-4">
                {/* 质量评分 */}
                {renderQualityMetrics(generatedScript.qualityMetrics)}

                {/* 两个格子：改编分析 + 改编后的故事 */}
                <div className="grid grid-cols-2 gap-4">
                  {/* 左格子：改编分析 */}
                  <div className="bg-[#1a1035] rounded-xl p-4">
                    <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                      <span className="text-purple-400">📊</span> 改编分析
                    </h3>
                    <div className="max-h-60 overflow-y-auto pr-2">
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {generatedScript.adaptationAnalysis || '（分析生成中...）'}
                      </p>
                    </div>
                  </div>
                  
                  {/* 右格子：改编后的故事 */}
                  <div className="bg-[#1a1035] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="text-green-400">📖</span> 改编后的故事
                      </h3>
                      <button
                        onClick={() => {
                          if (generatedScript.adaptedStory) {
                            navigator.clipboard.writeText(generatedScript.adaptedStory);
                            toast.success('已复制到剪贴板');
                          }
                        }}
                        className="p-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/40 text-purple-400 transition-colors"
                        title="复制"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="max-h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-transparent">
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                        {generatedScript.adaptedStory || '（故事生成中...）'}
                      </p>
                    </div>
                  </div>
                </div>
                
                {/* 标签信息 */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2 py-1 bg-purple-900/30 text-purple-400 rounded">{generatedScript.metadata.storyType}</span>
                  <span className="px-2 py-1 bg-purple-900/30 text-purple-400 rounded">总共{generatedScript.metadata.episodeCount}集 {generatedScript.metadata.totalDuration}秒</span>
                </div>

                {/* 分集选择 - 显示每集时长 */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {generatedScript.episodes.map((ep, idx) => {
                    // 计算每集时长：优先使用 episode.duration，否则累加场景时长
                    const episodeDuration = ep.duration || ep.scenes.reduce((sum, s) => sum + (s.duration || 0), 0);
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedEpisode(idx)}
                        className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm transition-all ${
                          selectedEpisode === idx
                            ? 'bg-purple-600 text-white'
                            : 'bg-[#1a1035] text-gray-400 hover:bg-purple-900/30 hover:text-white'
                        }`}
                      >
                        第{ep.episodeNumber}集（{episodeDuration}秒）
                      </button>
                    );
                  })}
                </div>

                {/* 当前集内容 */}
                {generatedScript.episodes[selectedEpisode] && (
                  <div className="bg-[#1a1035] rounded-xl p-4 space-y-4">
                    <div>
                      <h4 className="text-white font-medium text-lg">
                        {generatedScript.episodes[selectedEpisode].title}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-yellow-400">
                          {'⭐'.repeat(generatedScript.episodes[selectedEpisode].conflictIntensity)}
                        </span>
                        <span className="text-xs text-gray-500">冲突强度</span>
                      </div>
                    </div>

                    {/* 黄金钩子 */}
                    {generatedScript.episodes[selectedEpisode].hook && (
                      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
                        <div className="text-xs text-yellow-400 mb-1">🎣 黄金3秒钩子</div>
                        <div className="text-sm text-gray-300">{generatedScript.episodes[selectedEpisode].hook}</div>
                      </div>
                    )}

                    {/* 核心冲突 */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1">核心冲突</div>
                      {generatedScript.episodes[selectedEpisode].coreConflict === '优化中...' ? (
                        <div className="flex items-center gap-2 text-sm text-purple-400">
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          AI 正在分析核心冲突...
                        </div>
                      ) : (
                        <div className="text-sm text-gray-300">{generatedScript.episodes[selectedEpisode].coreConflict}</div>
                      )}
                    </div>

                    {/* 关键事件 */}
                    {generatedScript.episodes[selectedEpisode].coreConflict === '优化中...' ? (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">关键事件</div>
                        <div className="flex items-center gap-2 text-sm text-purple-400">
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          AI 正在提取关键事件...
                        </div>
                      </div>
                    ) : generatedScript.episodes[selectedEpisode].keyEvents.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-1">关键事件</div>
                        <div className="space-y-1">
                          {generatedScript.episodes[selectedEpisode].keyEvents.map((event, i) => (
                            <div key={i} className="text-sm text-gray-400">• {event}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 场景列表 */}
                    <div>
                      <div className="text-xs text-gray-500 mb-2">场景分镜</div>
                      <div className="space-y-3">
                        {generatedScript.episodes[selectedEpisode].scenes.map((scene, i) => (
                          <div key={i} className="bg-[#0d0820] rounded-lg p-3 border border-purple-900/20">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-purple-400">🎬 场景{scene.sceneId}</span>
                              <span className="text-xs text-gray-500">{scene.duration}秒</span>
                            </div>
                            <div className="text-sm text-white font-medium mb-1">{scene.location}</div>
                            
                            {scene.composition && (
                              <div className="text-sm text-gray-300 mb-2">
                                <span className="text-purple-400 text-xs">画面：</span>{scene.composition}
                              </div>
                            )}
                            
                            {scene.characterActions && (
                              <div className="text-sm text-gray-400 mb-2">
                                <span className="text-blue-400 text-xs">动作：</span>{scene.characterActions}
                              </div>
                            )}
                            
                            {scene.dialogue && scene.dialogue !== '（无）' && (
                              <div className="text-sm text-yellow-200 italic border-l-2 border-yellow-500 pl-3 mb-2">
                                "{scene.dialogue}"
                              </div>
                            )}
                            
                            {scene.emotionalTone && (
                              <div className="text-xs text-pink-400 mb-1">
                                情绪：{scene.emotionalTone}
                              </div>
                            )}
                            
                            {scene.adaptationNote && (
                              <div className="text-xs text-green-400 bg-green-900/20 rounded px-2 py-1 mt-2">
                                📝 改编说明：{scene.adaptationNote}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 结尾悬念 */}
                    {generatedScript.episodes[selectedEpisode].cliffhanger && (
                      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                        <div className="text-xs text-red-400 mb-1">🔥 结尾悬念</div>
                        <div className="text-sm text-gray-300">{generatedScript.episodes[selectedEpisode].cliffhanger}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* AI 原始输出 */}
                {generatedScript.rawContent && (
                  <details className="bg-[#1a1035] rounded-xl overflow-hidden">
                    <summary className="px-4 py-3 text-sm text-gray-400 cursor-pointer hover:bg-purple-900/20">
                      📄 查看 AI 原始输出
                    </summary>
                    <div className="px-4 pb-4">
                      <pre className="text-xs text-gray-500 whitespace-pre-wrap bg-[#0d0820] rounded-lg p-3 max-h-[300px] overflow-y-auto">
                        {generatedScript.rawContent}
                      </pre>
                    </div>
                  </details>
                )}
              </div>
            ) : errorMessage ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 rounded-2xl bg-red-900/20 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-10 h-10 text-red-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">生成失败</h3>
                  <p className="text-sm text-red-400 mb-4">{errorMessage}</p>
                  <button
                    onClick={() => setErrorMessage('')}
                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500 transition-colors"
                  >
                    重试
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 rounded-2xl bg-[#1a1035] flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-10 h-10 text-purple-400" />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-2">工作区就绪</h3>
                  <p className="text-sm text-gray-500">请在左侧配置面板输入内容</p>
                  <p className="text-sm text-gray-500">AI 智能体将为您自动生成专业剧本</p>
                  <div className="mt-4 text-xs text-gray-600">
                    遵循6大创作要点 · 质量评分 ≥ 8分
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 保存弹窗 */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1a1035] border border-purple-900/50 rounded-2xl p-6 w-[400px] shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">保存剧本</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">剧本名称</label>
              <input
                type="text"
                value={scriptTitle}
                onChange={(e) => setScriptTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && scriptTitle.trim()) {
                    confirmSave();
                  }
                }}
                placeholder="输入剧本名称..."
                className="w-full bg-[#0d0820] border border-purple-900/50 text-white px-4 py-2.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500 placeholder-gray-600"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 bg-gray-700 text-white py-2.5 rounded-lg hover:bg-gray-600 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmSave}
                disabled={!scriptTitle.trim()}
                className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg hover:bg-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
