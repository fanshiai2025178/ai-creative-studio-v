import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  getIncomers,
  getOutgoers,
  getConnectedEdges,
  SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Zap,
  Image,
  Video,
  Wand2,
  MessageSquare,
  Layers,
  Plus,
  Loader2,
  Settings,
  Download,
  Trash2,
  ImagePlus,
} from "lucide-react";

import TextToImageNode from "@/components/nodes/TextToImageNode";
import { PromptLibrary } from "@/components/PromptLibrary";
import { ImageEditorPopover } from "@/components/ImageEditorPopover";
import ImageToImageNode from "@/components/nodes/ImageToImageNode";
import ImageToVideoNode from "@/components/nodes/ImageToVideoNode";
import ImageDisplayNode from "@/components/nodes/ImageDisplayNode";
import VideoDisplayNode from "@/components/nodes/VideoDisplayNode";
import PromptNode from "@/components/nodes/PromptNode";
import ImageEditorNode from "@/components/nodes/ImageEditorNode";
// AI分镜师节点已移除，等待重新设计
import { StoryboardWorkbenchNode } from "@/components/nodes/StoryboardWorkbenchNode";
import { SubjectMultiViewNode } from "@/components/nodes/SubjectMultiViewNode";
import { NineGridInputNode } from "@/components/nodes/NineGridInputNode";
import { NineGridResultNode } from "@/components/nodes/NineGridResultNode";
import { ShotReverseShotNode } from "@/components/nodes/ShotReverseShotNode";
import { DynamicNineGridInputNode } from "@/components/nodes/DynamicNineGridInputNode";
import CanvasSidebar from "@/components/canvas/CanvasSidebar";
import AIAssistant from "@/components/canvas/AIAssistant";
import ScriptPanel from "@/components/panels/ScriptPanel";
import DesignPanel from "@/components/panels/DesignPanel";
import StoryboardPanel from "@/components/panels/StoryboardPanel";
import { AssetLibrary } from "@/components/AssetLibrary";
import { FolderOpen } from "lucide-react";
import Timeline from "@/components/timeline/Timeline";
import DeletableEdge from "@/components/edges/DeletableEdge";

// 创建一个 Context 用于在节点间传递数据
import { createContext, useContext } from "react";

interface CanvasContextType {
  nodes: Node[];
  edges: Edge[];
  getConnectedPrompts: (nodeId: string) => string[];
  getConnectedImages: (nodeId: string) => string[];
  addGeneratedImageNode: (sourceNodeId: string, imageUrl: string) => void;
  addGeneratedVideoNode: (sourceNodeId: string, videoUrl: string) => void;
  // 带加载状态的生成函数
  addLoadingImageNode: (sourceNodeId: string, label?: string) => string;
  updateImageNode: (nodeId: string, imageUrl: string) => void;
  setImageNodeError: (nodeId: string, error: string) => void;
  addLoadingVideoNode: (sourceNodeId: string, label?: string) => string;
  updateVideoNode: (nodeId: string, videoUrl: string) => void;
  setVideoNodeError: (nodeId: string, error: string) => void;
  // 带比例和 AI 描述的图片节点
  addLoadingImageNodeWithRatio: (sourceNodeId: string, label?: string, aspectRatio?: string, offsetX?: number, offsetY?: number) => string;
  updateImageNodeWithDescription: (nodeId: string, imageUrl: string, description?: string) => void;
}

export const CanvasContext = createContext<CanvasContextType | null>(null);

export function useCanvasContext() {
  const context = useContext(CanvasContext);
  if (!context) {
    throw new Error("useCanvasContext must be used within CanvasProvider");
  }
  return context;
}

const nodeTypes = {
  textToImage: TextToImageNode,
  imageToImage: ImageToImageNode,
  imageToVideo: ImageToVideoNode,
  imageDisplay: ImageDisplayNode,
  videoDisplay: VideoDisplayNode,
  prompt: PromptNode,
  imageEditor: ImageEditorNode,
  // 影视分镜台节点
  subjectMultiView: SubjectMultiViewNode,
  storyboardWorkbench: StoryboardWorkbenchNode,
  nineGridInput: NineGridInputNode,
  nineGridResult: NineGridResultNode,
  shotReverseShot: ShotReverseShotNode,
  dynamicNineGridInput: DynamicNineGridInputNode,
};

// 边类型定义
const edgeTypes = {
  deletable: DeletableEdge,
};

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

function CanvasContent() {
  const params = useParams<{ projectId: string }>();
  const projectId = parseInt(params.projectId || "0");
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, getNode } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiAssistantInitialAction, setAiAssistantInitialAction] = useState<'designCharacter' | null>(null);
  const [aiAssistantScriptContent, setAiAssistantScriptContent] = useState<string>('');
  const [aiAssistantScriptTitle, setAiAssistantScriptTitle] = useState<string>('');
  const [showTimeline, setShowTimeline] = useState(false); // 时间轴默认隐藏
  const [isSaving, setIsSaving] = useState(false);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'script' | 'design' | 'storyboard' | null>(null);
  // 记录已经打开过的面板，用于保留组件状态（不卸载组件）
  const [mountedPanels, setMountedPanels] = useState<Set<'script' | 'design' | 'storyboard'>>(new Set());
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const initialLoadDone = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: project, isLoading } = trpc.project.get.useQuery(
    { id: projectId },
    { enabled: projectId > 0 && isAuthenticated }
  );

  const updateProject = trpc.project.update.useMutation({
    onSuccess: () => {
      // 静默保存，不显示toast提示
      setIsSaving(false);
    },
    onError: () => {
      toast.error("保存失败");
      setIsSaving(false);
    },
  });

  // Load workflow data when project is loaded
  useEffect(() => {
    if (project?.workflowData) {
      const data = project.workflowData as { nodes?: Node[]; edges?: Edge[] };
      if (data.nodes) setNodes(data.nodes);
      if (data.edges) setEdges(data.edges);
      initialLoadDone.current = true;
    }
  }, [project, setNodes, setEdges]);

  // Track unsaved changes after initial load
  useEffect(() => {
    if (initialLoadDone.current) {
      setHasUnsavedChanges(true);
    }
  }, [nodes, edges]);

  // Auto-save every 30 seconds
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (hasUnsavedChanges && projectId > 0 && !isSaving) {
        updateProject.mutate({
          id: projectId,
          workflowData: { nodes, edges },
        });
        setHasUnsavedChanges(false);
      }
    }, 30000);
    return () => clearInterval(autoSaveInterval);
  }, [hasUnsavedChanges, projectId, nodes, edges, updateProject, isSaving]);

  // Save on page unload
  useEffect(() => {
    const saveData = () => {
      if (hasUnsavedChanges && projectId > 0) {
        const data = JSON.stringify({
          id: projectId,
          workflowData: { nodes, edges },
        });
        navigator.sendBeacon('/api/trpc/project.update?batch=1',
          new Blob([JSON.stringify({ "0": { json: JSON.parse(data) } })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', saveData);
    return () => window.removeEventListener('beforeunload', saveData);
  }, [hasUnsavedChanges, projectId, nodes, edges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        animated: true,
        style: { stroke: 'oklch(0.7 0.25 350)', strokeWidth: 2 },
      }, eds));
    },
    [setEdges]
  );

  const handleSave = useCallback(() => {
    setIsSaving(true);
    updateProject.mutate({
      id: projectId,
      workflowData: { nodes, edges },
    });
    setHasUnsavedChanges(false);
  }, [projectId, nodes, edges, updateProject]);

  // Handle project name edit
  const startEditingName = useCallback(() => {
    setEditedName(project?.name || "");
    setIsEditingName(true);
  }, [project?.name]);

  const saveProjectName = useCallback((newName: string) => {
    setIsEditingName(false);
    const trimmedName = newName.trim();
    if (trimmedName && trimmedName !== project?.name && projectId > 0) {
      updateProject.mutate({ id: projectId, name: trimmedName });
    }
  }, [project?.name, projectId, updateProject]);

  const addNode = useCallback(
    (type: string) => {
      // 特殊处理：轨道编辑按钮切换轨道显示
      if (type === "timeline") {
        setShowTimeline(prev => !prev);
        return;
      }

      const position = screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {},
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  // 获取连接到指定节点的所有提示词
  const getConnectedPrompts = useCallback(
    (nodeId: string): string[] => {
      const prompts: string[] = [];
      
      // 找到所有连接到此节点的边
      const incomingEdges = edges.filter((edge) => edge.target === nodeId);
      
      for (const edge of incomingEdges) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (sourceNode) {
          // 如果是提示词节点，获取其内容
          if (sourceNode.type === "prompt" && sourceNode.data.prompt) {
            prompts.push(sourceNode.data.prompt as string);
          }
        }
      }
      
      return prompts;
    },
    [nodes, edges]
  );

  // 获取连接到指定节点的所有图片
  const getConnectedImages = useCallback(
    (nodeId: string): string[] => {
      const images: string[] = [];
      
      // 找到所有连接到此节点的边
      const incomingEdges = edges.filter((edge) => edge.target === nodeId);
      
      for (const edge of incomingEdges) {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (sourceNode) {
          // 如果是图片显示节点或文生图节点，获取其图片
          if (sourceNode.type === "imageDisplay" && sourceNode.data.imageUrl) {
            images.push(sourceNode.data.imageUrl as string);
          } else if (sourceNode.type === "textToImage" && sourceNode.data.outputImage) {
            images.push(sourceNode.data.outputImage as string);
          } else if (sourceNode.type === "imageToImage" && sourceNode.data.outputImage) {
            images.push(sourceNode.data.outputImage as string);
          }
        }
      }
      
      return images;
    },
    [nodes, edges]
  );

  // 添加生成的图片节点
  const addGeneratedImageNode = useCallback(
    (sourceNodeId: string, imageUrl: string) => {
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      // 在源节点右侧创建新节点
      const newNodeId = `imageDisplay-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type: "imageDisplay",
        position: {
          x: sourceNode.position.x + 450,
          y: sourceNode.position.y,
        },
        data: {
          imageUrl,
          label: "生成结果",
        },
      };

      // 创建连接边
      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        sourceHandle: "image-out",
        animated: true,
        style: { stroke: 'oklch(0.7 0.25 350)', strokeWidth: 2 },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, newEdge]);
    },
    [nodes, setNodes, setEdges]
  );

  // 添加生成的视频节点
  const addGeneratedVideoNode = useCallback(
    (sourceNodeId: string, videoUrl: string) => {
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      // 在源节点右侧创建新节点
      const newNodeId = `videoDisplay-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type: "videoDisplay",
        position: {
          x: sourceNode.position.x + 450,
          y: sourceNode.position.y,
        },
        data: {
          videoUrl,
          label: "生成结果",
        },
      };

      // 创建连接边
      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        sourceHandle: "video-out",
        animated: true,
        style: { stroke: 'oklch(0.6 0.2 280)', strokeWidth: 2 },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, newEdge]);
    },
    [nodes, setNodes, setEdges]
  );

  // 添加独立图片节点（从设计面板加载到画布）
  const addStandaloneImageNode = useCallback(
    (imageUrl: string, name: string, type: string) => {
      const newNodeId = `imageDisplay-${Date.now()}`;
      
      // 在画布中心位置创建新节点
      const newNode: Node = {
        id: newNodeId,
        type: "imageDisplay",
        position: {
          x: 500 + Math.random() * 200,
          y: 200 + Math.random() * 200,
        },
        data: {
          imageUrl,
          label: `${type === 'character' ? '角色' : type === 'scene' ? '场景' : '道具'}: ${name}`,
        },
      };

      setNodes((nds) => [...nds, newNode]);
      toast.success(`已加载到画布: ${name}`);
    },
    [setNodes]
  );

  // 从资产库添加图片节点到画布（自适应大小）
  const addImageNodeFromAssetLibrary = useCallback(
    (imageUrl: string, name: string) => {
      const newNodeId = `imageDisplay-${Date.now()}`;
      
      // 首先创建节点，然后加载图片获取实际尺寸
      const img = document.createElement('img');
      img.onload = () => {
        // 计算自适应尺寸，最大宽度300px
        const maxWidth = 300;
        const maxHeight = 400;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        // 计算实际比例
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        let ratioLabel = "1:1";
        if (aspectRatio > 1.5) ratioLabel = "16:9";
        else if (aspectRatio < 0.7) ratioLabel = "9:16";
        
        const newNode: Node = {
          id: newNodeId,
          type: "imageDisplay",
          position: {
            x: 500 + Math.random() * 200,
            y: 200 + Math.random() * 200,
          },
          data: {
            imageUrl,
            label: name,
            aspectRatio: ratioLabel,
            customWidth: Math.round(width),
            customHeight: Math.round(height),
          },
        };

        setNodes((nds) => [...nds, newNode]);
      };
      
      img.onerror = () => {
        // 图片加载失败时使用默认尺寸
        const newNode: Node = {
          id: newNodeId,
          type: "imageDisplay",
          position: {
            x: 500 + Math.random() * 200,
            y: 200 + Math.random() * 200,
          },
          data: {
            imageUrl,
            label: name,
          },
        };
        setNodes((nds) => [...nds, newNode]);
      };
      
      img.src = imageUrl;
    },
    [setNodes]
  );

  // 处理文件上传（加载图片到画布）
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      // 检查文件类型
      if (!file.type.startsWith('image/')) {
        toast.error('请选择图片文件');
        return;
      }
      
      // 创建本地URL预览
      const localUrl = URL.createObjectURL(file);
      const fileName = file.name.replace(/\.[^/.]+$/, ''); // 移除扩展名
      
      // 使用与addImageNodeFromAssetLibrary相同的逻辑
      const newNodeId = `imageDisplay-${Date.now()}`;
      const img = document.createElement('img');
      
      img.onload = () => {
        // 计算自适应尺寸，最大宽度300px
        const maxWidth = 300;
        const maxHeight = 400;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        // 计算实际比例
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        let ratioLabel = "1:1";
        if (aspectRatio > 1.5) ratioLabel = "16:9";
        else if (aspectRatio < 0.7) ratioLabel = "9:16";
        
        const newNode: Node = {
          id: newNodeId,
          type: "imageDisplay",
          position: {
            x: 500 + Math.random() * 200,
            y: 200 + Math.random() * 200,
          },
          data: {
            imageUrl: localUrl,
            label: fileName,
            aspectRatio: ratioLabel,
            customWidth: Math.round(width),
            customHeight: Math.round(height),
          },
        };

        setNodes((nds) => [...nds, newNode]);
        toast.success(`已加载图片: ${fileName}`);
      };
      
      img.onerror = () => {
        // 图片加载失败时使用默认尺寸
        const newNode: Node = {
          id: newNodeId,
          type: "imageDisplay",
          position: {
            x: 500 + Math.random() * 200,
            y: 200 + Math.random() * 200,
          },
          data: {
            imageUrl: localUrl,
            label: fileName,
          },
        };
        setNodes((nds) => [...nds, newNode]);
        toast.success(`已加载图片: ${fileName}`);
      };
      
      img.src = localUrl;
      
      // 重置文件输入，允许重复选择同一文件
      e.target.value = '';
    },
    [setNodes]
  );

  // 添加加载中的图片节点（立即创建节点和连线，显示加载状态）
  const addLoadingImageNode = useCallback(
    (sourceNodeId: string, label?: string): string => {
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const newNodeId = `imageDisplay-${Date.now()}`;
      
      const newNode: Node = {
        id: newNodeId,
        type: "imageDisplay",
        position: {
          x: (sourceNode?.position.x || 0) + 450,
          y: sourceNode?.position.y || 0,
        },
        data: {
          isLoading: true,
          loadingProgress: "正在生成...",
          label: label || "生成结果",
        },
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        sourceHandle: "image-out",
        animated: true,
        style: { stroke: 'oklch(0.7 0.25 350)', strokeWidth: 2 },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, newEdge]);
      
      return newNodeId;
    },
    [nodes, setNodes, setEdges]
  );

  // 更新图片节点（生成完成后更新图片）
  const updateImageNode = useCallback(
    (nodeId: string, imageUrl: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                imageUrl,
                isLoading: false,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // 设置图片节点错误状态
  const setImageNodeError = useCallback(
    (nodeId: string, error: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                isLoading: false,
                loadingProgress: error,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // 添加加载中的视频节点
  const addLoadingVideoNode = useCallback(
    (sourceNodeId: string, label?: string): string => {
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const newNodeId = `videoDisplay-${Date.now()}`;
      
      const newNode: Node = {
        id: newNodeId,
        type: "videoDisplay",
        position: {
          x: (sourceNode?.position.x || 0) + 450,
          y: sourceNode?.position.y || 0,
        },
        data: {
          isLoading: true,
          loadingProgress: "正在生成视频...",
          label: label || "生成结果",
        },
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        sourceHandle: "video-out",
        animated: true,
        style: { stroke: 'oklch(0.6 0.2 280)', strokeWidth: 2 },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, newEdge]);
      
      return newNodeId;
    },
    [nodes, setNodes, setEdges]
  );

  // 更新视频节点
  const updateVideoNode = useCallback(
    (nodeId: string, videoUrl: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                videoUrl,
                isLoading: false,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // 设置视频节点错误状态
  const setVideoNodeError = useCallback(
    (nodeId: string, error: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                isLoading: false,
                loadingProgress: error,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // 添加带比例的加载中图片节点（用于九宫格提取）
  const addLoadingImageNodeWithRatio = useCallback(
    (sourceNodeId: string, label?: string, aspectRatio?: string, offsetX?: number, offsetY?: number): string => {
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const newNodeId = `imageDisplay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // 根据比例计算节点尺寸
      let nodeWidth = 256;
      let nodeHeight = 256;
      if (aspectRatio === "16:9") {
        nodeWidth = 320;
        nodeHeight = 180;
      } else if (aspectRatio === "9:16") {
        nodeWidth = 180;
        nodeHeight = 320;
      }
      
      const newNode: Node = {
        id: newNodeId,
        type: "imageDisplay",
        position: {
          x: (sourceNode?.position.x || 0) + (offsetX ?? 450),
          y: (sourceNode?.position.y || 0) + (offsetY ?? 0),
        },
        data: {
          isLoading: true,
          loadingProgress: "正在生成...",
          label: label || "生成结果",
          aspectRatio,
          nodeWidth,
          nodeHeight,
        },
      };

      const newEdge: Edge = {
        id: `edge-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        animated: true,
        style: { stroke: '#f472b6', strokeWidth: 2 },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, newEdge]);
      
      return newNodeId;
    },
    [nodes, setNodes, setEdges]
  );

  // 更新图片节点并添加 AI 描述
  const updateImageNodeWithDescription = useCallback(
    (nodeId: string, imageUrl: string, description?: string) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                imageUrl,
                isLoading: false,
                description,
              },
            };
          }
          return node;
        })
      );
    },
    [setNodes]
  );

  // Canvas Context 值
  const canvasContextValue = useMemo(
    () => ({
      nodes,
      edges,
      getConnectedPrompts,
      getConnectedImages,
      addGeneratedImageNode,
      addGeneratedVideoNode,
      addLoadingImageNode,
      updateImageNode,
      setImageNodeError,
      addLoadingVideoNode,
      updateVideoNode,
      setVideoNodeError,
      addLoadingImageNodeWithRatio,
      updateImageNodeWithDescription,
    }),
    [nodes, edges, getConnectedPrompts, getConnectedImages, addGeneratedImageNode, addGeneratedVideoNode, addLoadingImageNode, updateImageNode, setImageNodeError, addLoadingVideoNode, updateVideoNode, setVideoNodeError, addLoadingImageNodeWithRatio, updateImageNodeWithDescription]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {},
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".react-flow__node")) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `prompt-${Date.now()}`,
        type: "prompt",
        position,
        data: {},
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [screenToFlowPosition, setNodes]
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">请先登录以访问画布编辑器</p>
        <Button
          onClick={() => window.location.href = getLoginUrl()}
          className="neon-border-pink"
        >
          点击登录
        </Button>
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="text-muted-foreground"
        >
          返回首页
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <CanvasContext.Provider value={canvasContextValue}>
      <div className="h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="h-14 border-b border-border/50 glass-panel flex items-center justify-between px-4 z-50">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/projects")}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="FansAI Logo" className="w-8 h-8 object-contain" />
              {isEditingName ? (
                <input
                  type="text"
                  autoFocus
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onBlur={() => saveProjectName(editedName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveProjectName(editedName);
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  className="font-medium bg-transparent border-b border-primary/50 focus:border-primary outline-none px-1 py-0.5 min-w-[120px] text-foreground"
                  placeholder="输入项目名称"
                />
              ) : (
                <span
                  className="font-medium cursor-pointer hover:text-primary transition-colors"
                  onClick={startEditingName}
                  title="点击编辑项目名称"
                >
                  {project?.name || "未命名项目"}
                </span>
              )}
              {hasUnsavedChanges && (
                <span className="text-xs text-muted-foreground">(未保存)</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNode('imageEditor')}
              className="border-purple-500/60 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400 hover:text-purple-200"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              图片编辑
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="border-cyan-500/60 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 hover:text-cyan-200"
            >
              <ImagePlus className="w-4 h-4 mr-2" />
              加载图片
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <PromptLibrary />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssetLibraryOpen(true)}
              className="border-border/50 hover:neon-border-cyan"
            >
              <FolderOpen className="w-4 h-4 mr-2" />
              资产库
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="border-border/50 hover:neon-border-cyan"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              保存
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Sidebar */}
          <CanvasSidebar
            open={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            onAddNode={addNode}
            showTimeline={showTimeline}
            onToggleTimeline={() => setShowTimeline(!showTimeline)}
            onOpenPanel={(panel) => {
              setActivePanel(panel);
              if (panel) {
                setMountedPanels(prev => new Set(prev).add(panel));
              }
            }}
          />

          {/* Canvas */}
          <div className="flex-1 relative" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDoubleClick={onDoubleClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              snapToGrid
              snapGrid={[20, 20]}
              className="cyber-grid"
              defaultEdgeOptions={{
                type: 'deletable',
                animated: true,
                style: { stroke: 'oklch(0.7 0.25 350)', strokeWidth: 2 },
              }}
              // 多选框选功能配置
              selectionOnDrag={true}
              selectionMode={SelectionMode.Partial}
              panOnDrag={[1, 2]}
              selectionKeyCode={null}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="oklch(0.3 0.05 260 / 0.5)"
              />
              <Controls className="!bg-card !border-border/50" />
              <MiniMap
                className="!bg-card !border-border/50"
                nodeColor="oklch(0.7 0.25 350)"
                maskColor="oklch(0.08 0.01 260 / 0.8)"
              />



            </ReactFlow>

            {/* 时间轴编辑器 - 悬浮在画布底部 */}
            <div className="absolute bottom-0 left-0 right-0 z-20">
              <Timeline show={showTimeline} />
            </div>

            {/* 基础创作面板 - 绝对定位在左侧，不遮挡右侧画布 */}
            {/* 使用CSS隐藏而不是卸载组件，以保留生成进度等状态 */}
            {(activePanel === 'script' || mountedPanels.has('script')) && (
              <div className={`absolute top-0 left-0 bottom-0 z-30 ${activePanel === 'script' ? '' : 'hidden'}`}>
                <ScriptPanel
                  canvasId={projectId}
                  onClose={() => setActivePanel(null)}
                />
              </div>
            )}
            {(activePanel === 'design' || mountedPanels.has('design')) && (
              <div className={`absolute top-0 left-0 bottom-0 z-30 ${activePanel === 'design' ? '' : 'hidden'}`}>
                <DesignPanel
                  canvasId={projectId}
                  onClose={() => setActivePanel(null)}
                  onLoadToCanvas={(imageUrl: string, name: string, type: 'character' | 'scene' | 'prop') => {
                    addStandaloneImageNode(imageUrl, name, type);
                  }}
                  onOpenAIAssistant={(action, scriptContent, scriptTitle) => {
                    setAiAssistantInitialAction(action);
                    setAiAssistantScriptContent(scriptContent || '');
                    setAiAssistantScriptTitle(scriptTitle || '');
                    setAssistantOpen(true);
                  }}
                />
              </div>
            )}
            {(activePanel === 'storyboard' || mountedPanels.has('storyboard')) && (
              <div className={`absolute top-0 left-0 bottom-0 z-30 ${activePanel === 'storyboard' ? '' : 'hidden'}`}>
                <StoryboardPanel
                  canvasId={projectId}
                  onClose={() => setActivePanel(null)}
                  onSendToCanvas={addImageNodeFromAssetLibrary}
                />
              </div>
            )}
          </div>

          {/* AI Assistant - 固定在右上角 */}
          {assistantOpen && (
            <div className="absolute top-0 right-0 z-30">
              <AIAssistant
                open={assistantOpen}
                onToggle={() => setAssistantOpen(!assistantOpen)}
                onAddNode={addNode}
                projectId={projectId}
                onLoadToCanvas={(imageUrl: string, name: string, type: 'character' | 'scene' | 'prop') => {
                  addStandaloneImageNode(imageUrl, name, type);
                }}
                initialAction={aiAssistantInitialAction}
                onClearInitialAction={() => {
                  setAiAssistantInitialAction(null);
                  setAiAssistantScriptContent('');
                  setAiAssistantScriptTitle('');
                }}
                initialScriptContent={aiAssistantScriptContent}
                initialScriptTitle={aiAssistantScriptTitle}
              />
            </div>
          )}
        </div>

        {/* Floating AI Assistant Button */}
        {!assistantOpen && (
          <Button
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary hover:bg-primary/80 neon-border-pink border shadow-lg z-50"
            onClick={() => setAssistantOpen(true)}
          >
            <MessageSquare className="w-6 h-6" />
          </Button>
        )}

        {/* Asset Library Dialog */}
        <AssetLibrary
          isOpen={assetLibraryOpen}
          onClose={() => setAssetLibraryOpen(false)}
          onSendToCanvas={addImageNodeFromAssetLibrary}
        />
      </div>
    </CanvasContext.Provider>
  );
}

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasContent />
    </ReactFlowProvider>
  );
}
