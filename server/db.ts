import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  projects, 
  InsertProject, 
  Project,
  assets,
  InsertAsset,
  Asset,
  generationTasks,
  InsertGenerationTask,
  GenerationTask,
  workflowTemplates,
  WorkflowTemplate,
  customStyles,
  InsertCustomStyle,
  CustomStyle
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// User operations
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Project operations
export async function createProject(data: Omit<InsertProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 使用原始 SQL 避免 Drizzle 的 default 关键字问题
  const { sql } = await import("drizzle-orm");
  
  const result = await db.execute(sql`
    INSERT INTO projects (userId, name, description, thumbnail, workflowData, status)
    VALUES (${data.userId}, ${data.name}, ${data.description || null}, ${data.thumbnail || null}, ${data.workflowData ? JSON.stringify(data.workflowData) : null}, ${data.status || 'active'})
  `);
  
  const insertId = (result[0] as any).insertId;
  
  const [project] = await db.select().from(projects).where(eq(projects.id, insertId));
  return project;
}

export async function getUserProjects(userId: number): Promise<Project[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'active')))
    .orderBy(desc(projects.updatedAt));
}

export async function getProjectById(id: number): Promise<Project | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  return project;
}

export async function updateProject(id: number, data: Partial<InsertProject>): Promise<Project> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    // 如果有 workflowData，清理大型 base64 数据以减小存储大小
    if (data.workflowData) {
      const cleanedData = cleanWorkflowData(data.workflowData);
      data.workflowData = cleanedData;
    }
    
    await db.update(projects).set(data).where(eq(projects.id, id));
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  } catch (error) {
    console.error("[Database] Failed to update project:", error);
    throw error;
  }
}

// 清理 workflowData 中的大型 base64 数据
function cleanWorkflowData(workflowData: unknown): unknown {
  if (!workflowData || typeof workflowData !== 'object') return workflowData;
  
  const data = workflowData as { nodes?: unknown[]; edges?: unknown[] };
  if (!data.nodes) return workflowData;
  
  // 清理节点中的 base64 数据，保留 URL
  const cleanedNodes = data.nodes.map((node: unknown) => {
    if (!node || typeof node !== 'object') return node;
    const n = node as { data?: Record<string, unknown> };
    if (!n.data) return node;
    
    const cleanedData = { ...n.data };
    
    // 删除大型 base64 字段，保留 URL
    for (const key of Object.keys(cleanedData)) {
      const value = cleanedData[key];
      if (typeof value === 'string' && value.startsWith('data:') && value.length > 10000) {
        // 如果有对应的 URL 字段，删除 base64
        const urlKey = key.replace('Base64', 'Url').replace('base64', 'url');
        if (cleanedData[urlKey] || key.includes('Base64') || key.includes('base64')) {
          delete cleanedData[key];
        }
      }
    }
    
    return { ...n, data: cleanedData };
  });
  
  return { ...data, nodes: cleanedNodes };
}

export async function deleteProject(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(projects).set({ status: 'archived' }).where(eq(projects.id, id));
}

export async function duplicateProject(id: number, userId: number): Promise<Project> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [original] = await db.select().from(projects).where(eq(projects.id, id));
  if (!original) throw new Error("Project not found");

  const result = await db.insert(projects).values({
    userId,
    name: `${original.name} (副本)`,
    description: original.description,
    workflowData: original.workflowData,
    status: 'active',
  });

  const insertId = result[0].insertId;
  const [project] = await db.select().from(projects).where(eq(projects.id, insertId));
  return project;
}

// Asset operations
export async function createAsset(data: Omit<InsertAsset, 'id' | 'createdAt'>): Promise<Asset> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Debug: 打印传入的数据
  console.log('[createAsset] 传入数据:', {
    userId: data.userId,
    projectId: data.projectId,
    nodeId: data.nodeId,
    type: data.type,
    url: data.url ? (data.url.length > 100 ? data.url.substring(0, 100) + '...' : data.url) : 'UNDEFINED',
    fileKey: data.fileKey,
    filename: data.filename,
    mimeType: data.mimeType,
    size: data.size,
    hasMetadata: !!data.metadata,
  });

  const result = await db.insert(assets).values(data);
  const insertId = result[0].insertId;
  
  const [asset] = await db.select().from(assets).where(eq(assets.id, insertId));
  return asset;
}

export async function getProjectAssets(projectId: number): Promise<Asset[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(desc(assets.createdAt));
}

export async function getUserAssets(userId: number): Promise<Asset[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(assets)
    .where(eq(assets.userId, userId))
    .orderBy(desc(assets.createdAt));
}

// Generation task operations
export async function createGenerationTask(data: Omit<InsertGenerationTask, 'id' | 'createdAt' | 'completedAt'>): Promise<GenerationTask> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(generationTasks).values(data);
  const insertId = result[0].insertId;
  
  const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, insertId));
  return task;
}

export async function updateGenerationTask(id: number, data: Partial<InsertGenerationTask>): Promise<GenerationTask> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: Record<string, unknown> = { ...data };
  if (data.status === 'completed' || data.status === 'failed') {
    updateData.completedAt = new Date();
  }

  await db.update(generationTasks).set(updateData).where(eq(generationTasks.id, id));
  const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, id));
  return task;
}

export async function getGenerationTask(id: number): Promise<GenerationTask | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [task] = await db.select().from(generationTasks).where(eq(generationTasks.id, id));
  return task;
}

// Workflow template operations
export async function getWorkflowTemplates(): Promise<WorkflowTemplate[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(workflowTemplates)
    .where(eq(workflowTemplates.isPublic, true))
    .orderBy(desc(workflowTemplates.usageCount));
}

export async function getWorkflowTemplateById(id: number): Promise<WorkflowTemplate | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [template] = await db.select().from(workflowTemplates).where(eq(workflowTemplates.id, id));
  return template;
}

export async function incrementTemplateUsage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [template] = await db.select().from(workflowTemplates).where(eq(workflowTemplates.id, id));
  if (template) {
    await db.update(workflowTemplates)
      .set({ usageCount: template.usageCount + 1 })
      .where(eq(workflowTemplates.id, id));
  }
}

// Custom style operations
export async function createCustomStyle(data: Omit<InsertCustomStyle, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomStyle> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(customStyles).values(data);
  const insertId = result[0].insertId;
  
  const [style] = await db.select().from(customStyles).where(eq(customStyles.id, insertId));
  return style;
}

export async function getUserCustomStyles(userId: number): Promise<CustomStyle[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(customStyles)
    .where(eq(customStyles.userId, userId))
    .orderBy(desc(customStyles.createdAt));
}

export async function getCustomStyleById(id: number): Promise<CustomStyle | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [style] = await db.select().from(customStyles).where(eq(customStyles.id, id));
  return style;
}

export async function deleteCustomStyle(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(customStyles).where(eq(customStyles.id, id));
}

export async function incrementStyleUsage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [style] = await db.select().from(customStyles).where(eq(customStyles.id, id));
  if (style) {
    await db.update(customStyles)
      .set({ usageCount: style.usageCount + 1 })
      .where(eq(customStyles.id, id));
  }
}


// ==================== Storyboard Shots V2 Operations ====================
import {
  storyboardShots,
  InsertStoryboardShot,
  StoryboardShot
} from "../drizzle/schema";

// Create a new storyboard shot
export async function createStoryboardShot(data: Omit<InsertStoryboardShot, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoryboardShot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(storyboardShots).values(data);
  const insertId = result[0].insertId;
  
  const [shot] = await db.select().from(storyboardShots).where(eq(storyboardShots.id, insertId));
  return shot;
}

// Create multiple storyboard shots
export async function createStoryboardShots(data: Array<Omit<InsertStoryboardShot, 'id' | 'createdAt' | 'updatedAt'>>): Promise<StoryboardShot[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (data.length === 0) return [];

  await db.insert(storyboardShots).values(data);
  
  const scriptId = data[0].scriptId;
  return db.select()
    .from(storyboardShots)
    .where(eq(storyboardShots.scriptId, scriptId))
    .orderBy(storyboardShots.shotNumber);
}

// Get all shots for a script
export async function getStoryboardShotsByScriptId(scriptId: number): Promise<StoryboardShot[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(storyboardShots)
    .where(eq(storyboardShots.scriptId, scriptId))
    .orderBy(storyboardShots.shotNumber);
}

// Get a single shot by ID
export async function getStoryboardShotById(id: number): Promise<StoryboardShot | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [shot] = await db.select().from(storyboardShots).where(eq(storyboardShots.id, id));
  return shot;
}

// Update a storyboard shot
export async function updateStoryboardShot(id: number, data: Partial<InsertStoryboardShot>): Promise<StoryboardShot> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(storyboardShots).set(data).where(eq(storyboardShots.id, id));
  const [shot] = await db.select().from(storyboardShots).where(eq(storyboardShots.id, id));
  return shot;
}

// Delete a single shot
export async function deleteStoryboardShot(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(storyboardShots).where(eq(storyboardShots.id, id));
}

// Delete all shots for a script
export async function deleteStoryboardShotsByScriptId(scriptId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(storyboardShots).where(eq(storyboardShots.scriptId, scriptId));
}


// Import asset library table
import {
  assetLibrary,
  InsertAssetLibraryItem,
  AssetLibraryItem
} from "../drizzle/schema";

// Asset library operations
export async function createAssetLibraryItem(data: Omit<InsertAssetLibraryItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<AssetLibraryItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(assetLibrary).values(data);
  const insertId = result[0].insertId;
  
  const [item] = await db.select().from(assetLibrary).where(eq(assetLibrary.id, insertId));
  return item;
}

export async function getUserAssetLibrary(userId: number, category?: 'subject' | 'scene' | 'prop' | 'action' | 'style'): Promise<AssetLibraryItem[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (category) {
    return db.select()
      .from(assetLibrary)
      .where(and(
        eq(assetLibrary.userId, userId),
        eq(assetLibrary.category, category)
      ))
      .orderBy(desc(assetLibrary.createdAt));
  }

  return db.select()
    .from(assetLibrary)
    .where(eq(assetLibrary.userId, userId))
    .orderBy(desc(assetLibrary.createdAt));
}

export async function getAssetLibraryItemById(id: number): Promise<AssetLibraryItem | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [item] = await db.select().from(assetLibrary).where(eq(assetLibrary.id, id));
  return item;
}

export async function updateAssetLibraryItem(id: number, data: Partial<InsertAssetLibraryItem>): Promise<AssetLibraryItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(assetLibrary).set(data).where(eq(assetLibrary.id, id));
  const [item] = await db.select().from(assetLibrary).where(eq(assetLibrary.id, id));
  return item;
}

export async function deleteAssetLibraryItem(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(assetLibrary).where(eq(assetLibrary.id, id));
}

export async function incrementAssetUsage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [item] = await db.select().from(assetLibrary).where(eq(assetLibrary.id, id));
  if (item) {
    await db.update(assetLibrary)
      .set({ usageCount: item.usageCount + 1 })
      .where(eq(assetLibrary.id, id));
  }
}

export async function toggleAssetFavorite(id: number): Promise<AssetLibraryItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [item] = await db.select().from(assetLibrary).where(eq(assetLibrary.id, id));
  if (!item) throw new Error("Asset not found");

  await db.update(assetLibrary)
    .set({ isFavorite: !item.isFavorite })
    .where(eq(assetLibrary.id, id));
  
  const [updated] = await db.select().from(assetLibrary).where(eq(assetLibrary.id, id));
  return updated;
}


// ==================== Prompt Library Operations ====================
import { 
  promptGroups, 
  prompts, 
  PromptGroup, 
  InsertPromptGroup, 
  Prompt, 
  InsertPrompt 
} from "../drizzle/schema";

// Prompt Group operations
export async function getUserPromptGroups(userId: number): Promise<PromptGroup[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(promptGroups)
    .where(eq(promptGroups.userId, userId))
    .orderBy(promptGroups.sortOrder);
}

export async function createPromptGroup(data: Omit<InsertPromptGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<PromptGroup> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(promptGroups).values(data);
  const insertId = result[0].insertId;
  
  const [group] = await db.select().from(promptGroups).where(eq(promptGroups.id, insertId));
  return group;
}

export async function updatePromptGroup(id: number, data: Partial<InsertPromptGroup>): Promise<PromptGroup> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(promptGroups).set(data).where(eq(promptGroups.id, id));
  const [group] = await db.select().from(promptGroups).where(eq(promptGroups.id, id));
  return group;
}

export async function deletePromptGroup(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete all prompts in this group first
  await db.delete(prompts).where(eq(prompts.groupId, id));
  // Then delete the group
  await db.delete(promptGroups).where(eq(promptGroups.id, id));
}

// Prompt operations
export async function getGroupPrompts(groupId: number): Promise<Prompt[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(prompts)
    .where(eq(prompts.groupId, groupId))
    .orderBy(prompts.sortOrder);
}

export async function getUserPrompts(userId: number): Promise<Prompt[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.select()
    .from(prompts)
    .where(eq(prompts.userId, userId))
    .orderBy(prompts.sortOrder);
}

export async function createPrompt(data: Omit<InsertPrompt, 'id' | 'createdAt' | 'updatedAt'>): Promise<Prompt> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(prompts).values(data);
  const insertId = result[0].insertId;
  
  const [prompt] = await db.select().from(prompts).where(eq(prompts.id, insertId));
  return prompt;
}

export async function updatePrompt(id: number, data: Partial<InsertPrompt>): Promise<Prompt> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(prompts).set(data).where(eq(prompts.id, id));
  const [prompt] = await db.select().from(prompts).where(eq(prompts.id, id));
  return prompt;
}

export async function deletePrompt(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(prompts).where(eq(prompts.id, id));
}
