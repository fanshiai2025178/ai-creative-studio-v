import { Sparkles, Mountain, Film, FileText } from "lucide-react";

interface EntryCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  gradient: string;
}

const EntryCard = ({ icon, title, description, onClick, gradient }: EntryCardProps) => (
  <button
    onClick={onClick}
    className={`
      w-full p-4 rounded-xl border border-purple-900/30
      bg-gradient-to-br ${gradient}
      hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10
      transition-all duration-300 text-left group
    `}
  >
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-white/10 group-hover:bg-white/20 transition-colors">
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-white">{title}</h3>
        <p className="text-xs text-gray-400 mt-1">{description}</p>
      </div>
    </div>
  </button>
);

interface EntryCardsProps {
  onSelectEntry: (entry: 'character' | 'scene' | 'storyboard' | 'script') => void;
}

export function EntryCards({ onSelectEntry }: EntryCardsProps) {
  const entries = [
    {
      id: 'character' as const,
      icon: <Sparkles className="w-5 h-5 text-pink-400" />,
      title: '设计角色',
      description: '输入剧本，AI帮你设计角色形象',
      gradient: 'from-pink-600/20 to-purple-600/20',
    },
    {
      id: 'scene' as const,
      icon: <Mountain className="w-5 h-5 text-cyan-400" />,
      title: '设计场景',
      description: '根据剧情生成场景背景图',
      gradient: 'from-cyan-600/20 to-blue-600/20',
    },
    {
      id: 'storyboard' as const,
      icon: <Film className="w-5 h-5 text-amber-400" />,
      title: '创建分镜',
      description: '将剧本转化为可视化分镜脚本',
      gradient: 'from-amber-600/20 to-orange-600/20',
    },
    {
      id: 'script' as const,
      icon: <FileText className="w-5 h-5 text-green-400" />,
      title: '改编剧本',
      description: '把故事改编成短剧剧本格式',
      gradient: 'from-green-600/20 to-emerald-600/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          icon={entry.icon}
          title={entry.title}
          description={entry.description}
          gradient={entry.gradient}
          onClick={() => onSelectEntry(entry.id)}
        />
      ))}
    </div>
  );
}
