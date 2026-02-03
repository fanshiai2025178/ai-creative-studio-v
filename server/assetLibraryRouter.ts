import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import {
  createAssetLibraryItem,
  getUserAssetLibrary,
  getAssetLibraryItemById,
  updateAssetLibraryItem,
  deleteAssetLibraryItem,
  incrementAssetUsage,
  toggleAssetFavorite
} from "./db";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

// Updated category enum: subject(主体库), scene(场景库), prop(道具库), action(动作库), style(风格库)
const categoryEnum = z.enum(["subject", "scene", "prop", "action", "style"]);

export const assetLibraryRouter = router({
  // List assets by category with optional search
  list: protectedProcedure
    .input(z.object({
      category: categoryEnum.optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const assets = await getUserAssetLibrary(ctx.user.id, input.category);
      
      // If search query provided, filter by name and tags
      if (input.search && input.search.trim()) {
        const searchLower = input.search.toLowerCase().trim();
        return assets.filter((asset) => {
          // Search in name
          if (asset.name.toLowerCase().includes(searchLower)) return true;
          // Search in tags
          if (asset.tags && Array.isArray(asset.tags)) {
            return asset.tags.some((tag: string) => tag.toLowerCase().includes(searchLower));
          }
          return false;
        });
      }
      
      return assets;
    }),

  // Get single asset
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const item = await getAssetLibraryItemById(input.id);
      if (!item || item.userId !== ctx.user.id) {
        throw new Error("Asset not found");
      }
      return item;
    }),

  // Add asset to library
  add: protectedProcedure
    .input(z.object({
      category: categoryEnum,
      name: z.string(),
      description: z.string().optional(),
      imageUrl: z.string(),
      imageKey: z.string().optional(),
      thumbnailUrl: z.string().optional(),
      mimeType: z.string().optional(),
      size: z.number().optional(),
      tags: z.array(z.string()).optional(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // If no imageKey provided, generate one
      const imageKey = input.imageKey || `asset-library/${ctx.user.id}/${nanoid()}.png`;
      
      return createAssetLibraryItem({
        userId: ctx.user.id,
        category: input.category,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        imageKey,
        thumbnailUrl: input.thumbnailUrl,
        mimeType: input.mimeType,
        size: input.size,
        tags: input.tags,
        metadata: input.metadata,
      });
    }),

  // Upload and add asset to library (for file uploads)
  upload: protectedProcedure
    .input(z.object({
      category: categoryEnum,
      name: z.string(),
      description: z.string().optional(),
      imageBase64: z.string(), // Base64 encoded image
      mimeType: z.string().default("image/png"),
      tags: z.array(z.string()).optional(),
      metadata: z.any().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Decode base64 and upload to S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const fileKey = `asset-library/${ctx.user.id}/${input.category}/${nanoid()}.png`;
      
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      
      return createAssetLibraryItem({
        userId: ctx.user.id,
        category: input.category,
        name: input.name,
        description: input.description,
        imageUrl: url,
        imageKey: fileKey,
        mimeType: input.mimeType,
        size: buffer.length,
        tags: input.tags,
        metadata: input.metadata,
      });
    }),

  // Update asset
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      category: categoryEnum.optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const item = await getAssetLibraryItemById(input.id);
      if (!item || item.userId !== ctx.user.id) {
        throw new Error("Asset not found");
      }
      
      const { id, ...data } = input;
      return updateAssetLibraryItem(id, data);
    }),

  // Delete asset
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await getAssetLibraryItemById(input.id);
      if (!item || item.userId !== ctx.user.id) {
        throw new Error("Asset not found");
      }
      
      await deleteAssetLibraryItem(input.id);
      return { success: true };
    }),

  // Increment usage count
  incrementUsage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await getAssetLibraryItemById(input.id);
      if (!item || item.userId !== ctx.user.id) {
        throw new Error("Asset not found");
      }
      
      await incrementAssetUsage(input.id);
      return { success: true };
    }),

  // Toggle favorite
  toggleFavorite: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await getAssetLibraryItemById(input.id);
      if (!item || item.userId !== ctx.user.id) {
        throw new Error("Asset not found");
      }
      
      return toggleAssetFavorite(input.id);
    }),

  // Get category counts
  getCounts: protectedProcedure.query(async ({ ctx }) => {
    const all = await getUserAssetLibrary(ctx.user.id);
    
    const counts: Record<string, number> = {
      subject: 0,
      scene: 0,
      prop: 0,
      action: 0,
      style: 0,
      total: all.length,
    };
    
    for (const item of all) {
      counts[item.category]++;
    }
    
    return counts;
  }),
});
