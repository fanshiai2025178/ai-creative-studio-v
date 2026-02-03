import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),  // 用户名登录
  password: varchar("password", { length: 255 }),  // 密码（加密存储）
  apiKey: varchar("apiKey", { length: 255 }),  // 用户自己的 Gemini API Key
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Projects table - stores user's creative projects (canvases)
 */
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull().default("未命名项目"),
  description: text("description"),
  thumbnail: text("thumbnail"),
  workflowData: json("workflowData"),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

/**
 * Assets table - stores generated images, videos and other media files
 */
export const assets = mysqlTable("assets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  nodeId: varchar("nodeId", { length: 64 }),
  type: mysqlEnum("type", ["image", "video", "audio"]).notNull(),
  url: text("url").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  filename: varchar("filename", { length: 255 }),
  mimeType: varchar("mimeType", { length: 128 }),
  size: int("size"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Asset = typeof assets.$inferSelect;
export type InsertAsset = typeof assets.$inferInsert;

/**
 * Workflow templates table - stores reusable workflow templates
 */
export const workflowTemplates = mysqlTable("workflowTemplates", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 64 }),
  thumbnail: text("thumbnail"),
  workflowData: json("workflowData").notNull(),
  isPublic: boolean("isPublic").default(true).notNull(),
  usageCount: int("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = typeof workflowTemplates.$inferInsert;

/**
 * Generation tasks table - tracks AI generation tasks
 */
export const generationTasks = mysqlTable("generationTasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  nodeId: varchar("nodeId", { length: 64 }),
  taskType: mysqlEnum("taskType", ["text2img", "img2img", "img2video", "upscale", "edit"]).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  inputData: json("inputData"),
  outputData: json("outputData"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type GenerationTask = typeof generationTasks.$inferSelect;
export type InsertGenerationTask = typeof generationTasks.$inferInsert;

/**
 * Custom styles table - stores user's custom style presets
 */
export const customStyles = mysqlTable("customStyles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  referenceImageUrl: text("referenceImageUrl").notNull(),
  referenceImageKey: varchar("referenceImageKey", { length: 512 }).notNull(),
  stylePrompt: text("stylePrompt"),
  isPublic: boolean("isPublic").default(false).notNull(),
  usageCount: int("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CustomStyle = typeof customStyles.$inferSelect;
export type InsertCustomStyle = typeof customStyles.$inferInsert;

/**
 * Asset library table - stores user's organized asset library
 * Categories: subject (主体库), scene (场景库), prop (道具库), action (动作库), style (风格库)
 */
export const assetLibrary = mysqlTable("assetLibrary", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: mysqlEnum("category", ["subject", "scene", "prop", "action", "style"]).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: text("imageUrl").notNull(),
  imageKey: varchar("imageKey", { length: 512 }).notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  mimeType: varchar("mimeType", { length: 128 }),
  size: int("size"),
  tags: json("tags"),
  metadata: json("metadata"),
  isFavorite: boolean("isFavorite").default(false).notNull(),
  usageCount: int("usageCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AssetLibraryItem = typeof assetLibrary.$inferSelect;
export type InsertAssetLibraryItem = typeof assetLibrary.$inferInsert;

/**
 * Prompt groups table - stores user's prompt library groups
 */
export const promptGroups = mysqlTable("promptGroups", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PromptGroup = typeof promptGroups.$inferSelect;
export type InsertPromptGroup = typeof promptGroups.$inferInsert;

/**
 * Prompts table - stores individual prompts within groups
 */
export const prompts = mysqlTable("prompts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId").notNull(),
  content: text("content").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Prompt = typeof prompts.$inferSelect;
export type InsertPrompt = typeof prompts.$inferInsert;


// ============================================================================
// 基础创作功能表结构
// ============================================================================

/**
 * Scripts table - stores adapted scripts for basic creation
 */
export const scripts = mysqlTable("scripts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  canvasId: int("canvasId").notNull(),
  title: varchar("title", { length: 255 }).notNull().default("新剧本"),
  originalContent: text("originalContent"),
  adaptedStory: text("adaptedStory"),
  adaptationAnalysis: text("adaptationAnalysis"),
  storyType: varchar("storyType", { length: 64 }),
  episodeCount: int("episodeCount").default(0),
  totalDuration: int("totalDuration").default(0),
  durationPerEpisode: int("durationPerEpisode").default(120),
  storyStructure: json("storyStructure"),
  episodes: json("episodes"),
  qualityMetrics: json("qualityMetrics"),
  rawContent: text("rawContent"),
  version: int("version").default(1).notNull(),
  status: mysqlEnum("status", ["draft", "generated", "optimized", "completed"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Script = typeof scripts.$inferSelect;
export type InsertScript = typeof scripts.$inferInsert;

/**
 * Designs table - stores character/scene/prop designs for basic creation
 */
export const designs = mysqlTable("designs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  canvasId: int("canvasId").notNull(),
  scriptId: int("scriptId"),
  characters: json("characters"),
  scenes: json("scenes"),
  props: json("props"),
  colorHarmony: json("colorHarmony"),
  styleConsistency: text("styleConsistency"),
  visualStyle: varchar("visualStyle", { length: 64 }),
  styleReferenceImage: text("styleReferenceImage"),
  styleDescription: text("styleDescription"),
  architecturalStyle: varchar("architecturalStyle", { length: 128 }),
  colorPalette: json("colorPalette"),
  stylePreviewImages: json("stylePreviewImages"),
  designNotes: text("designNotes"),
  version: int("version").default(1).notNull(),
  status: mysqlEnum("status", ["draft", "generated", "completed"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Design = typeof designs.$inferSelect;
export type InsertDesign = typeof designs.$inferInsert;


// ============================================================================
// 分镜脚本设计 V2 - 新表结构
// ============================================================================

/**
 * Storyboard shots table - stores individual storyboard shots
 */
export const storyboardShots = mysqlTable("storyboardShots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  scriptId: int("scriptId").notNull(),
  
  shotNumber: int("shotNumber").notNull(),
  title: varchar("title", { length: 255 }),
  shotType: mysqlEnum("shotType", ["特写", "近景", "中景", "全景", "远景"]).default("中景").notNull(),
  duration: int("duration").default(3),
  transition: mysqlEnum("transition", ["切入", "淡入", "淡出", "叠化", "划入", "划出"]).default("切入").notNull(),
  
  sceneDescription: text("sceneDescription"),
  characters: text("characters"),
  action: text("action"),
  dialogue: text("dialogue"),
  emotion: text("emotion"),
  
  characterRefs: json("characterRefs"),
  sceneRefs: json("sceneRefs"),
  propRefs: json("propRefs"),
  
  aiPrompt: text("aiPrompt"),
  
  generatedImageUrl: text("generatedImageUrl"),
  generatedImageKey: varchar("generatedImageKey", { length: 512 }),
  
  imageSize: mysqlEnum("imageSize", ["9:16", "16:9", "1:1", "4:3", "3:4"]).default("16:9").notNull(),
  composition: mysqlEnum("composition", ["居中构图", "三分法", "对角线构图", "框架构图", "引导线构图"]).default("三分法").notNull(),
  
  sketchDataUrl: text("sketchDataUrl"),
  sketchDescription: text("sketchDescription"),
  
  dynamicPrompt: text("dynamicPrompt"),
  
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StoryboardShot = typeof storyboardShots.$inferSelect;
export type InsertStoryboardShot = typeof storyboardShots.$inferInsert;

// 参考图片类型定义（用于JSON字段）
export interface ReferenceImage {
  id: number;
  name: string;
  imageUrl: string;
  source: 'upload' | 'library';
  libraryId?: number;
}
