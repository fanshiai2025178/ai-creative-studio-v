# 🎬 AI Creative Studio V2

基于 AI 的漫剧创作工具，支持剧本改编、角色设计、场景生成、分镜制作等全流程创作。

---

## ✨ 主要功能

- 📝 **剧本改编** - AI 辅助剧本转换为短剧格式
- 🎭 **角色设计** - AI 生成角色形象和设定
- 🏞️ **场景设计** - 自动生成场景图片
- 📷 **分镜制作** - 智能分镜规划
- 🤖 **AI 助手** - 全程辅助创作流程
- 📚 **资产库** - 管理角色、场景、道具素材

---

## 🚀 快速开始

### 本地开发

```bash
# 1. 克隆项目
git clone https://github.com/fanshiai2025178/ai-creative-studio-v2.git
cd ai-creative-studio-v2

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写配置

# 4. 初始化数据库
pnpm run db:push

# 5. 启动开发服务器
pnpm run dev
```

访问 `http://localhost:3000`

---

## 📦 生产部署

### 自动部署（推荐）

```bash
# 使用一键部署脚本
sudo bash deploy.sh
```

### 手动部署

详见 [部署文档](./DEPLOYMENT.md)

---

## 🛠️ 技术栈

### 前端
- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **TailwindCSS** - 样式框架
- **Radix UI** - 组件库
- **tRPC** - 类型安全的 API 调用

### 后端
- **Node.js** - 运行时
- **Express** - Web 框架
- **tRPC** - API 框架
- **Drizzle ORM** - 数据库 ORM
- **MySQL** - 数据库
- **Ali OSS** - 对象存储

### AI 能力
- **Google Gemini** - 大语言模型
- **NanoBanana** - 图像生成

---

## 📁 项目结构

```
ai-creative-studio-v2/
├── client/                 # 前端代码
│   └── src/
│       ├── components/     # React 组件
│       ├── hooks/          # 自定义 Hooks
│       └── lib/            # 工具函数
├── server/                 # 后端代码
│   ├── _core/              # 核心功能
│   ├── basicCreationRouter.ts     # 基础创作 API
│   ├── assistantCharacterDesignRouter.ts  # 角色设计助手
│   ├── storyboardRouter.ts        # 分镜 API
│   └── routers.ts          # 路由汇总
├── drizzle/                # 数据库迁移
├── shared/                 # 前后端共享代码
├── .env.example            # 环境变量模板
├── deploy.sh               # 一键部署脚本
├── update.sh               # 快速更新脚本
└── DEPLOYMENT.md           # 详细部署文档
```

---

## 🔧 环境变量配置

必需的环境变量：

```bash
# 数据库
DATABASE_URL="mysql://user:password@localhost:3306/db_name"

# JWT 密钥
JWT_SECRET="your-secret-key"

# AI API
GEMINI_API_KEY="your-gemini-api-key"

# 阿里云 OSS
OSS_ACCESS_KEY_ID="your-access-key-id"
OSS_ACCESS_KEY_SECRET="your-access-key-secret"
OSS_BUCKET="your-bucket-name"
OSS_REGION="oss-cn-hangzhou"
```

详见 `.env.example`

---

## 📝 常用命令

```bash
# 开发
pnpm run dev              # 启动开发服务器
pnpm run build            # 构建生产版本
pnpm run start            # 启动生产服务器

# 数据库
pnpm run db:push          # 运行数据库迁移

# 代码质量
pnpm run check            # TypeScript 类型检查
pnpm run format           # 代码格式化
pnpm run test             # 运行测试

# 服务器管理（生产环境）
pm2 start dist/index.js --name ai-comic-studio
pm2 restart ai-comic-studio
pm2 logs ai-comic-studio
pm2 status
```

---

## 🐛 故障排查

### 常见问题

1. **端口被占用**
   ```bash
   # 修改 .env 中的 PORT
   PORT=3001
   ```

2. **数据库连接失败**
   ```bash
   # 检查 MySQL 是否运行
   sudo systemctl status mysqld
   
   # 检查连接字符串
   cat .env | grep DATABASE_URL
   ```

3. **图片上传失败**
   ```bash
   # 测试 OSS 连接
   node test-oss.mjs
   ```

更多问题请查看 [部署文档](./DEPLOYMENT.md)

---

## 📄 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📧 联系方式

- **GitHub**: https://github.com/fanshiai2025178/ai-creative-studio-v2
- **网站**: https://fanshai.com.cn

---

**Made with ❤️ by FanShai AI Team**
