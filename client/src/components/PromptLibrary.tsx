import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BookText,
  ChevronDown,
  ChevronRight,
  Plus,
  Copy,
  Trash2,
  Pencil,
  Check,
  X,
  FolderPlus,
} from "lucide-react";
import { toast } from "sonner";

interface PromptGroup {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  prompts: {
    id: number;
    content: string;
    sortOrder: number;
  }[];
}

export function PromptLibrary() {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [addingPromptToGroup, setAddingPromptToGroup] = useState<number | null>(null);
  const [newPromptContent, setNewPromptContent] = useState("");
  const [editingPromptId, setEditingPromptId] = useState<number | null>(null);
  const [editingPromptContent, setEditingPromptContent] = useState("");

  const utils = trpc.useUtils();
  
  const { data: groups = [], isLoading } = trpc.promptLibrary.getAll.useQuery();
  
  const createGroupMutation = trpc.promptLibrary.createGroup.useMutation({
    onSuccess: () => {
      utils.promptLibrary.getAll.invalidate();
      setNewGroupName("");
      setShowNewGroup(false);
      toast.success("分组创建成功");
    },
    onError: () => {
      toast.error("创建分组失败");
    },
  });

  const updateGroupMutation = trpc.promptLibrary.updateGroup.useMutation({
    onSuccess: () => {
      utils.promptLibrary.getAll.invalidate();
      setEditingGroupId(null);
      toast.success("分组更新成功");
    },
    onError: () => {
      toast.error("更新分组失败");
    },
  });

  const deleteGroupMutation = trpc.promptLibrary.deleteGroup.useMutation({
    onSuccess: () => {
      utils.promptLibrary.getAll.invalidate();
      toast.success("分组已删除");
    },
    onError: () => {
      toast.error("删除分组失败");
    },
  });

  const createPromptMutation = trpc.promptLibrary.createPrompt.useMutation({
    onSuccess: () => {
      utils.promptLibrary.getAll.invalidate();
      setNewPromptContent("");
      setAddingPromptToGroup(null);
      toast.success("提示词添加成功");
    },
    onError: () => {
      toast.error("添加提示词失败");
    },
  });

  const updatePromptMutation = trpc.promptLibrary.updatePrompt.useMutation({
    onSuccess: () => {
      utils.promptLibrary.getAll.invalidate();
      setEditingPromptId(null);
      toast.success("提示词更新成功");
    },
    onError: () => {
      toast.error("更新提示词失败");
    },
  });

  const deletePromptMutation = trpc.promptLibrary.deletePrompt.useMutation({
    onSuccess: () => {
      utils.promptLibrary.getAll.invalidate();
      toast.success("提示词已删除");
    },
    onError: () => {
      toast.error("删除提示词失败");
    },
  });

  const toggleGroup = (groupId: number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    createGroupMutation.mutate({ name: newGroupName.trim() });
  };

  const handleUpdateGroup = (groupId: number) => {
    if (!editingGroupName.trim()) return;
    updateGroupMutation.mutate({ id: groupId, name: editingGroupName.trim() });
  };

  const handleCreatePrompt = (groupId: number) => {
    if (!newPromptContent.trim()) return;
    createPromptMutation.mutate({ groupId, content: newPromptContent.trim() });
  };

  const handleUpdatePrompt = (promptId: number) => {
    if (!editingPromptContent.trim()) return;
    updatePromptMutation.mutate({ id: promptId, content: editingPromptContent.trim() });
  };

  const startEditGroup = (group: PromptGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const startEditPrompt = (prompt: { id: number; content: string }) => {
    setEditingPromptId(prompt.id);
    setEditingPromptContent(prompt.content);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
        >
          <BookText className="h-4 w-4" />
          <span>提示词库</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-96 p-0 bg-gray-900/95 border-gray-700 backdrop-blur-sm"
        align="end"
        sideOffset={8}
      >
        <div className="p-3 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <BookText className="h-4 w-4 text-cyan-400" />
              常用提示词库
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-cyan-400 hover:text-cyan-300"
              onClick={() => setShowNewGroup(true)}
            >
              <FolderPlus className="h-4 w-4 mr-1" />
              新建分组
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            点击提示词快速复制，管理您的常用提示词
          </p>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {/* New Group Input */}
          {showNewGroup && (
            <div className="p-3 border-b border-gray-700 bg-gray-800/50">
              <div className="flex items-center gap-2">
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="输入分组名称..."
                  className="h-8 bg-gray-800 border-gray-600 text-white text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateGroup();
                    if (e.key === "Escape") setShowNewGroup(false);
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 px-2 bg-cyan-600 hover:bg-cyan-500"
                  onClick={handleCreateGroup}
                  disabled={createGroupMutation.isPending}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => {
                    setShowNewGroup(false);
                    setNewGroupName("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="p-8 text-center text-gray-400">
              加载中...
            </div>
          )}

          {/* Empty State */}
          {!isLoading && groups.length === 0 && !showNewGroup && (
            <div className="p-8 text-center">
              <BookText className="h-12 w-12 mx-auto text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">暂无提示词分组</p>
              <p className="text-gray-500 text-xs mt-1">点击上方"新建分组"开始添加</p>
            </div>
          )}

          {/* Groups List */}
          {groups.map((group) => (
            <Collapsible
              key={group.id}
              open={expandedGroups.has(group.id)}
              onOpenChange={() => toggleGroup(group.id)}
            >
              <div className="border-b border-gray-700/50">
                {/* Group Header */}
                <div className="flex items-center justify-between p-2 hover:bg-gray-800/50 group">
                  <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
                    {expandedGroups.has(group.id) ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    {editingGroupId === group.id ? (
                      <Input
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        className="h-6 text-sm bg-gray-800 border-gray-600"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") handleUpdateGroup(group.id);
                          if (e.key === "Escape") setEditingGroupId(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm font-medium text-white">
                        {group.name}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      ({group.prompts.length})
                    </span>
                  </CollapsibleTrigger>
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingGroupId === group.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                          onClick={() => handleUpdateGroup(group.id)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => setEditingGroupId(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditGroup(group);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-gray-400 hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`确定删除分组"${group.name}"及其所有提示词吗？`)) {
                              deleteGroupMutation.mutate({ id: group.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Prompts List */}
                <CollapsibleContent>
                  <div className="bg-gray-800/30 px-2 py-1">
                    {group.prompts.map((prompt) => (
                      <div
                        key={prompt.id}
                        className="flex items-start gap-2 p-2 rounded hover:bg-gray-700/50 group/prompt"
                      >
                        {editingPromptId === prompt.id ? (
                          <div className="flex-1 flex items-center gap-2">
                            <Textarea
                              value={editingPromptContent}
                              onChange={(e) => setEditingPromptContent(e.target.value)}
                              className="min-h-[60px] text-xs bg-gray-800 border-gray-600"
                              autoFocus
                            />
                            <div className="flex flex-col gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-green-400"
                                onClick={() => handleUpdatePrompt(prompt.id)}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => setEditingPromptId(null)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p
                              className="flex-1 text-xs text-gray-300 cursor-pointer hover:text-white line-clamp-3"
                              onClick={() => copyToClipboard(prompt.content)}
                              title="点击复制"
                            >
                              {prompt.content}
                            </p>
                            <div className="flex items-center gap-1 opacity-0 group-hover/prompt:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-cyan-400 hover:text-cyan-300"
                                onClick={() => copyToClipboard(prompt.content)}
                                title="复制"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                                onClick={() => startEditPrompt(prompt)}
                                title="编辑"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-gray-400 hover:text-red-400"
                                onClick={() => {
                                  if (confirm("确定删除这条提示词吗？")) {
                                    deletePromptMutation.mutate({ id: prompt.id });
                                  }
                                }}
                                title="删除"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}

                    {/* Add New Prompt */}
                    {addingPromptToGroup === group.id ? (
                      <div className="p-2">
                        <Textarea
                          value={newPromptContent}
                          onChange={(e) => setNewPromptContent(e.target.value)}
                          placeholder="输入提示词内容..."
                          className="min-h-[60px] text-xs bg-gray-800 border-gray-600 mb-2"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => {
                              setAddingPromptToGroup(null);
                              setNewPromptContent("");
                            }}
                          >
                            取消
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 bg-cyan-600 hover:bg-cyan-500"
                            onClick={() => handleCreatePrompt(group.id)}
                            disabled={createPromptMutation.isPending}
                          >
                            添加
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full h-8 text-xs text-gray-400 hover:text-cyan-400 justify-start"
                        onClick={() => setAddingPromptToGroup(group.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        添加提示词
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
