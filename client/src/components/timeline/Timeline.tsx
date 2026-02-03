import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Trash2,
  ZoomIn,
  ZoomOut,
  Image,
  Video,
  Music,
  Upload,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// 素材类型
export interface TimelineClip {
  id: string;
  type: "image" | "video" | "audio";
  name: string;
  url: string;
  startTime: number; // 在轨道上的开始时间（秒）
  duration: number; // 素材时长（秒）
  trimStart: number; // 裁剪开始点（秒）
  trimEnd: number; // 裁剪结束点（秒）
  thumbnail?: string; // 缩略图
}

interface TimelineProps {
  onExport?: (clips: { video: TimelineClip[]; audio: TimelineClip[] }) => void;
  show?: boolean; // 外部控制显示/隐藏
}

export default function Timeline({ onExport, show }: TimelineProps) {
  // 轨道数据
  const [videoClips, setVideoClips] = useState<TimelineClip[]>([]);
  const [audioClips, setAudioClips] = useState<TimelineClip[]>([]);
  
  // 播放状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(60); // 默认60秒
  
  // 缩放和选择
  const [zoom, setZoom] = useState(1); // 1 = 100%
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  
  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragClip, setDragClip] = useState<TimelineClip | null>(null);
  const [dragTrack, setDragTrack] = useState<"video" | "audio" | null>(null);
  
  // 裁剪状态
  const [isResizing, setIsResizing] = useState(false);
  const [resizeEdge, setResizeEdge] = useState<"left" | "right" | null>(null);
  const [resizeClipId, setResizeClipId] = useState<string | null>(null);
  
  // 外部拖入状态
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragOverTrack, setDragOverTrack] = useState<"video" | "audio" | null>(null);
  
  // 时间轴整体显示/隐藏状态（由外部控制）
  const showTimeline = show ?? false;
  
  const timelineRef = useRef<HTMLDivElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // 计算总时长
  useEffect(() => {
    const videoEnd = videoClips.reduce((max, clip) => 
      Math.max(max, clip.startTime + (clip.trimEnd - clip.trimStart)), 0);
    const audioEnd = audioClips.reduce((max, clip) => 
      Math.max(max, clip.startTime + (clip.trimEnd - clip.trimStart)), 0);
    const maxEnd = Math.max(videoEnd, audioEnd, 60);
    setTotalDuration(Math.ceil(maxEnd / 10) * 10 + 10);
  }, [videoClips, audioClips]);

  // 时间转像素
  const timeToPixels = useCallback((time: number) => {
    const pixelsPerSecond = 50 * zoom;
    return time * pixelsPerSecond;
  }, [zoom]);

  // 像素转时间
  const pixelsToTime = useCallback((pixels: number) => {
    const pixelsPerSecond = 50 * zoom;
    return pixels / pixelsPerSecond;
  }, [zoom]);

  // 格式化时间显示
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
  };

  // 播放/暂停
  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  // 播放动画
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(() => {
      setCurrentTime(prev => {
        if (prev >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 0.033;
      });
    }, 33);

    return () => clearInterval(interval);
  }, [isPlaying, totalDuration]);

  // 音频播放控制
  useEffect(() => {
    audioClips.forEach(clip => {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + (clip.trimEnd - clip.trimStart);
      const audioInRange = currentTime >= clipStart && currentTime < clipEnd;
      
      let audio = audioElementsRef.current.get(clip.id);
      
      if (!audio) {
        audio = new Audio(clip.url);
        audio.preload = 'auto';
        audioElementsRef.current.set(clip.id, audio);
      }
      
      if (isPlaying && audioInRange && !isMuted) {
        const audioTime = currentTime - clipStart + clip.trimStart;
        if (Math.abs(audio.currentTime - audioTime) > 0.1) {
          audio.currentTime = audioTime;
        }
        if (audio.paused) {
          audio.play().catch(() => {});
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    });
    
    // 清理不再存在的音频元素
    audioElementsRef.current.forEach((audio, id) => {
      if (!audioClips.find(c => c.id === id)) {
        audio.pause();
        audioElementsRef.current.delete(id);
      }
    });
  }, [currentTime, isPlaying, audioClips, isMuted]);

  // 组件卸载时清理音频
  useEffect(() => {
    return () => {
      audioElementsRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioElementsRef.current.clear();
    };
  }, []);

  // 跳转到开始
  const skipToStart = () => {
    setCurrentTime(0);
    setIsPlaying(false);
  };

  // 跳转到结束
  const skipToEnd = () => {
    const videoEnd = videoClips.reduce((max, clip) => 
      Math.max(max, clip.startTime + (clip.trimEnd - clip.trimStart)), 0);
    const audioEnd = audioClips.reduce((max, clip) => 
      Math.max(max, clip.startTime + (clip.trimEnd - clip.trimStart)), 0);
    setCurrentTime(Math.max(videoEnd, audioEnd));
    setIsPlaying(false);
  };

  // 缩放控制
  const zoomIn = () => setZoom(prev => Math.min(prev * 1.5, 4));
  const zoomOut = () => setZoom(prev => Math.max(prev / 1.5, 0.25));

  // 删除选中素材
  const deleteSelected = () => {
    if (!selectedClip) return;
    setVideoClips(prev => prev.filter(c => c.id !== selectedClip));
    setAudioClips(prev => prev.filter(c => c.id !== selectedClip));
    setSelectedClip(null);
    toast.success("素材已删除");
  };

  // 处理轨道点击（设置播放头位置）
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (isDragging || isResizing) return;
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0);
    const time = pixelsToTime(x);
    setCurrentTime(Math.max(0, Math.min(time, totalDuration)));
  };

  // 处理素材拖拽开始
  const handleClipDragStart = (e: React.MouseEvent, clip: TimelineClip, track: "video" | "audio") => {
    e.stopPropagation();
    setIsDragging(true);
    setDragClip(clip);
    setDragTrack(track);
    setSelectedClip(clip.id);
  };

  // 处理素材拖拽
  const handleClipDrag = (e: React.MouseEvent) => {
    if (!isDragging || !dragClip || !dragTrack) return;
    
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0);
    const newStartTime = Math.max(0, pixelsToTime(x) - (dragClip.trimEnd - dragClip.trimStart) / 2);
    
    if (dragTrack === "video") {
      setVideoClips(prev => prev.map(c => 
        c.id === dragClip.id ? { ...c, startTime: newStartTime } : c
      ));
    } else {
      setAudioClips(prev => prev.map(c => 
        c.id === dragClip.id ? { ...c, startTime: newStartTime } : c
      ));
    }
  };

  // 处理素材拖拽结束
  const handleClipDragEnd = () => {
    setIsDragging(false);
    setDragClip(null);
    setDragTrack(null);
  };

  // 处理素材裁剪开始
  const handleResizeStart = (e: React.MouseEvent, clipId: string, edge: "left" | "right") => {
    e.stopPropagation();
    setIsResizing(true);
    setResizeEdge(edge);
    setResizeClipId(clipId);
  };

  // 处理素材裁剪
  const handleResize = (e: React.MouseEvent) => {
    if (!isResizing || !resizeClipId || !resizeEdge) return;
    
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0);
    const time = pixelsToTime(x);
    
    const updateClip = (clips: TimelineClip[]) => clips.map(clip => {
      if (clip.id !== resizeClipId) return clip;
      
      if (resizeEdge === "left") {
        const newTrimStart = Math.max(0, Math.min(time - clip.startTime, clip.trimEnd - 0.1));
        const timeDiff = newTrimStart - clip.trimStart;
        return {
          ...clip,
          startTime: clip.startTime + timeDiff,
          trimStart: newTrimStart,
        };
      } else {
        const newEndTime = Math.max(clip.startTime + 0.1, time);
        const newTrimEnd = Math.min(clip.duration, clip.trimStart + (newEndTime - clip.startTime));
        return {
          ...clip,
          trimEnd: newTrimEnd,
        };
      }
    });
    
    setVideoClips(prev => updateClip(prev));
    setAudioClips(prev => updateClip(prev));
  };

  // 处理素材裁剪结束
  const handleResizeEnd = () => {
    setIsResizing(false);
    setResizeEdge(null);
    setResizeClipId(null);
  };

  // 处理外部拖入 - dragover
  const handleDragOver = (e: React.DragEvent, track: "video" | "audio") => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    setDragOverTrack(track);
  };

  // 处理外部拖入 - dragleave
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setDragOverTrack(null);
  };

  // 处理外部拖入 - drop（从画布拖入图片/视频）
  const handleDrop = (e: React.DragEvent, track: "video" | "audio") => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragOverTrack(null);

    // 获取拖入的数据
    const dataStr = e.dataTransfer.getData("application/json");
    if (dataStr) {
      try {
        const data = JSON.parse(dataStr);
        if (data.type === "canvas-media") {
          // 从画布拖入的素材
          const rect = timelineRef.current?.getBoundingClientRect();
          const x = rect ? e.clientX - rect.left + (timelineRef.current?.scrollLeft || 0) : 0;
          const startTime = pixelsToTime(x);
          
          const newClip: TimelineClip = {
            id: `clip-${Date.now()}`,
            type: data.mediaType || "image",
            name: data.name || (data.mediaType === "video" ? "视频素材" : "图片素材"),
            url: data.url || "",
            startTime: Math.max(0, startTime),
            duration: data.mediaType === "video" ? 10 : 5,
            trimStart: 0,
            trimEnd: data.mediaType === "video" ? 10 : 5,
            thumbnail: data.thumbnail || data.url,
          };

          if (track === "video") {
            setVideoClips(prev => [...prev, newClip]);
          }
          toast.success(`已添加${data.mediaType === "video" ? "视频" : "图片"}到轨道`);
          return;
        }
      } catch (err) {
        // 忽略解析错误
      }
    }

    // 处理文件拖入
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      files.forEach(file => {
        if (track === "audio" && file.type.startsWith("audio/")) {
          addAudioFile(file);
        } else if (track === "video" && (file.type.startsWith("image/") || file.type.startsWith("video/"))) {
          addMediaFile(file);
        }
      });
    }
  };

  // 添加音频文件
  const addAudioFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    
    audio.addEventListener("loadedmetadata", () => {
      const duration = audio.duration || 10;
      const startTime = audioClips.reduce((max, c) => 
        Math.max(max, c.startTime + (c.trimEnd - c.trimStart)), 0);
      
      const newClip: TimelineClip = {
        id: `clip-${Date.now()}`,
        type: "audio",
        name: file.name,
        url,
        startTime,
        duration,
        trimStart: 0,
        trimEnd: duration,
      };
      
      setAudioClips(prev => [...prev, newClip]);
      toast.success(`已添加音频: ${file.name}`);
    });

    audio.addEventListener("error", () => {
      toast.error("无法加载音频文件");
    });
  };

  // 添加图片/视频文件
  const addMediaFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith("video/");
    
    if (isVideo) {
      const video = document.createElement("video");
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        const duration = video.duration || 10;
        const startTime = videoClips.reduce((max, c) => 
          Math.max(max, c.startTime + (c.trimEnd - c.trimStart)), 0);
        
        const newClip: TimelineClip = {
          id: `clip-${Date.now()}`,
          type: "video",
          name: file.name,
          url,
          startTime,
          duration,
          trimStart: 0,
          trimEnd: duration,
          thumbnail: url,
        };
        
        setVideoClips(prev => [...prev, newClip]);
        toast.success(`已添加视频: ${file.name}`);
      });
    } else {
      const startTime = videoClips.reduce((max, c) => 
        Math.max(max, c.startTime + (c.trimEnd - c.trimStart)), 0);
      
      // 图片默认时长设为 5 秒
      const defaultDuration = 5;
      const newClip: TimelineClip = {
        id: `clip-${Date.now()}`,
        type: "image",
        name: file.name,
        url,
        startTime,
        duration: defaultDuration,
        trimStart: 0,
        trimEnd: defaultDuration,
        thumbnail: url,
      };
      
      setVideoClips(prev => [...prev, newClip]);
      toast.success(`已添加图片: ${file.name}`);
    }
  };

  // 处理图片/视频上传按钮点击
  const handleMediaUpload = () => {
    mediaInputRef.current?.click();
  };

  // 处理图片/视频文件选择
  const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
          addMediaFile(file);
        } else {
          toast.error("请选择图片或视频文件");
        }
      });
    }
    // 重置 input 以便可以重复选择同一文件
    e.target.value = "";
  };

  // 处理音频上传按钮点击
  const handleAudioUpload = () => {
    audioInputRef.current?.click();
  };

  // 处理音频文件选择
  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        if (file.type.startsWith("audio/")) {
          addAudioFile(file);
        } else {
          toast.error("请选择音频文件");
        }
      });
    }
    // 重置 input 以便可以重复选择同一文件
    e.target.value = "";
  };

  // 渲染时间刻度
  const renderTimeRuler = () => {
    const marks = [];
    const interval = zoom >= 1 ? 1 : zoom >= 0.5 ? 2 : 5;
    
    for (let i = 0; i <= totalDuration; i += interval) {
      marks.push(
        <div
          key={i}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: timeToPixels(i) }}
        >
          <div className="h-3 w-px bg-purple-500/50" />
          <span className="text-[10px] text-muted-foreground mt-0.5">
            {Math.floor(i / 60)}:{(i % 60).toString().padStart(2, "0")}
          </span>
        </div>
      );
    }
    return marks;
  };

  // 渲染素材片段
  const renderClip = (clip: TimelineClip, track: "video" | "audio") => {
    const clipDuration = clip.trimEnd - clip.trimStart;
    const width = timeToPixels(clipDuration);
    const left = timeToPixels(clip.startTime);
    const isSelected = selectedClip === clip.id;
    
    return (
      <div
        key={clip.id}
        className={cn(
          "absolute top-1 bottom-1 rounded cursor-move transition-all group overflow-hidden",
          track === "audio" && "bg-gradient-to-r from-emerald-600/80 to-cyan-600/80",
          isSelected && "ring-2 ring-white ring-offset-1 ring-offset-transparent"
        )}
        style={{ left, width: Math.max(width, 80) }} // 最小宽度 80px 确保可见
        onMouseDown={(e) => handleClipDragStart(e, clip, track)}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedClip(clip.id);
        }}
      >
        {/* 图片/视频铺满背景（参考剪映） */}
        {track === "video" && (clip.thumbnail || clip.url) && (
          <div className="absolute inset-0">
            <img 
              src={clip.thumbnail || clip.url} 
              alt="" 
              className="w-full h-full object-cover"
            />
            {/* 渐变遮罩确保文字可见 */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
          </div>
        )}
        
        {/* 图片/视频无缩略图时的默认背景 */}
        {track === "video" && !clip.thumbnail && !clip.url && (
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/80 to-pink-600/80" />
        )}
        
        {/* 左边裁剪手柄 */}
        <div
          className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 rounded-l flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onMouseDown={(e) => handleResizeStart(e, clip.id, "left")}
        >
          <GripVertical className="w-3 h-3 text-white/70" />
        </div>
        
        {/* 素材内容 */}
        <div className="relative px-2 py-1 truncate text-xs text-white select-none flex items-center h-full z-[1]">
          {clip.type === "audio" && <Music className="w-3 h-3 mr-1 flex-shrink-0" />}
          <span className="truncate font-medium drop-shadow-md">{clip.name}</span>
        </div>
        
        {/* 右边裁剪手柄 */}
        <div
          className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/30 rounded-r flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onMouseDown={(e) => handleResizeStart(e, clip.id, "right")}
        >
          <GripVertical className="w-3 h-3 text-white/70" />
        </div>

        {/* 删除按钮 */}
        <button
          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-20"
          onClick={(e) => {
            e.stopPropagation();
            if (track === "video") {
              setVideoClips(prev => prev.filter(c => c.id !== clip.id));
            } else {
              setAudioClips(prev => prev.filter(c => c.id !== clip.id));
            }
            if (selectedClip === clip.id) setSelectedClip(null);
            toast.success("素材已删除");
          }}
        >
          <Trash2 className="w-3 h-3 text-white" />
        </button>
      </div>
    );
  };

  // 如果隐藏，不渲染任何内容
  if (!showTimeline) {
    return null;
  }

  return (
    <div 
      className="bg-black/80 backdrop-blur-sm border-t border-purple-500/30 flex flex-col transition-all duration-300 h-56"
      onMouseMove={(e) => {
        if (isDragging) handleClipDrag(e);
        if (isResizing) handleResize(e);
      }}
      onMouseUp={() => {
        handleClipDragEnd();
        handleResizeEnd();
      }}
      onMouseLeave={() => {
        handleClipDragEnd();
        handleResizeEnd();
      }}
    >
      {/* 隐藏的文件输入 */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleMediaFileChange}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={handleAudioFileChange}
      />

      {/* 控制栏 */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-purple-500/20">
        {/* 左侧：播放控制 */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={skipToStart}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={togglePlay}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={skipToEnd}>
            <SkipForward className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-2 font-mono">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>
        
        {/* 中间：上传按钮 */}
        <div className="flex items-center gap-2 text-xs">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 hover:text-cyan-300 hover:border-cyan-400"
            onClick={handleMediaUpload}
          >
            <Upload className="w-4 h-4 mr-1.5" />
            上传图片/视频
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs bg-gradient-to-r from-pink-500/20 to-purple-500/20 border-pink-500/50 text-pink-400 hover:bg-pink-500/30 hover:text-pink-300 hover:border-pink-400"
            onClick={handleAudioUpload}
          >
            <Music className="w-4 h-4 mr-1.5" />
            上传音频
          </Button>
        </div>
        
        {/* 右侧：工具 */}
        <div className="flex items-center gap-1 mr-16">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={() => setIsMuted(!isMuted)}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={deleteSelected}
            disabled={!selectedClip}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <div className="w-px h-4 bg-purple-500/30 mx-1" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn}>
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {/* 时间轴区域 - 可整体隐藏 */}
      {showTimeline && (
        <div className="flex-1 flex">
          {/* 轨道标签 */}
          <div className="w-16 flex-shrink-0 border-r border-purple-500/20">
            <div className="h-6 flex items-center justify-center text-[10px] text-muted-foreground border-b border-purple-500/10">
              时间
            </div>
            <div className="h-16 flex items-center px-2 text-xs border-b border-purple-500/10">
              <Video className="w-3 h-3 text-purple-400 mr-1" />
              <span className="text-purple-400">主轨道</span>
            </div>
            <div className="h-16 flex items-center px-2 text-xs">
              <Music className="w-3 h-3 text-emerald-400 mr-1" />
              <span className="text-emerald-400">音频</span>
            </div>
          </div>
          
          {/* 时间轴内容 */}
          <div 
            ref={timelineRef}
            className="flex-1 overflow-x-auto overflow-y-hidden relative"
            onClick={handleTimelineClick}
          >
            <div 
              className="relative"
              style={{ width: timeToPixels(totalDuration), minWidth: "100%" }}
            >
              {/* 时间刻度 */}
              <div className="h-6 relative border-b border-purple-500/10 bg-black/30">
                {renderTimeRuler()}
              </div>
              
              {/* 主轨道（图片/视频） */}
              <div 
                className={cn(
                  "h-16 relative border-b border-purple-500/10 transition-all",
                  isDragOver && dragOverTrack === "video" 
                    ? "bg-purple-500/30 border-purple-500" 
                    : "bg-purple-950/20"
                )}
                onDragOver={(e) => handleDragOver(e, "video")}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, "video")}
              >
                {videoClips.length === 0 && !isDragOver && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
                    点击上方"上传图片/视频"添加素材
                  </div>
                )}
                {isDragOver && dragOverTrack === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-purple-400 bg-purple-500/10 border-2 border-dashed border-purple-500/50 rounded">
                    释放以添加到主轨道
                  </div>
                )}
                {videoClips.map(clip => renderClip(clip, "video"))}
              </div>
              
              {/* 音频轨道 */}
              <div 
                className={cn(
                  "h-16 relative transition-all",
                  isDragOver && dragOverTrack === "audio" 
                    ? "bg-emerald-500/30 border-emerald-500" 
                    : "bg-emerald-950/20"
                )}
                onDragOver={(e) => handleDragOver(e, "audio")}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, "audio")}
              >
                {audioClips.length === 0 && !isDragOver && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
                    点击上方"上传音频"添加音频
                  </div>
                )}
                {isDragOver && dragOverTrack === "audio" && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-emerald-400 bg-emerald-500/10 border-2 border-dashed border-emerald-500/50 rounded">
                    释放以添加到音频轨道
                  </div>
                )}
                {audioClips.map(clip => renderClip(clip, "audio"))}
              </div>
              
              {/* 播放头 - 增大可点击区域 */}
              <div
                className="absolute top-0 bottom-0 z-20 cursor-col-resize group"
                style={{ left: timeToPixels(currentTime) - 10, width: 20 }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const handleDrag = (moveEvent: MouseEvent) => {
                    if (timelineRef.current) {
                      const rect = timelineRef.current.getBoundingClientRect();
                      const x = moveEvent.clientX - rect.left + timelineRef.current.scrollLeft;
                      const newTime = Math.max(0, Math.min(pixelsToTime(x), totalDuration));
                      setCurrentTime(newTime);
                    }
                  };
                  const handleUp = () => {
                    document.removeEventListener('mousemove', handleDrag);
                    document.removeEventListener('mouseup', handleUp);
                  };
                  document.addEventListener('mousemove', handleDrag);
                  document.addEventListener('mouseup', handleUp);
                }}
              >
                {/* 播放头线条 */}
                <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-red-500 group-hover:w-1 transition-all" />
                {/* 播放头三角形 */}
                <div className="absolute left-1/2 -translate-x-1/2 -top-1 w-4 h-4 bg-red-500 rotate-45 group-hover:scale-110 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
