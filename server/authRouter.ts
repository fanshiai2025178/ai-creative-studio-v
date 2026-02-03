import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { users } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import jwt from "jsonwebtoken";
import crypto from "crypto";

// 简单的密码加密
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

const JWT_SECRET = process.env.JWT_SECRET || "fanshai-jwt-secret-2025";

export const authRouter = router({
  // 注册：用户名 + 密码 + API Key
  register: publicProcedure
    .input(z.object({
      username: z.string().min(2).max(20),
      password: z.string().min(4).max(50),
      apiKey: z.string().min(10),  // Gemini API Key 必填
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");

      // 检查用户名是否已存在
      const existing = await db.select().from(users).where(eq(users.username, input.username));
      if (existing.length > 0) {
        throw new Error("用户名已存在");
      }

      // 创建用户
      const hashedPassword = hashPassword(input.password);
      const openId = `local_${nanoid(16)}`;
      
      const result = await db.execute(
        sql`INSERT INTO users (openId, username, password, apiKey, name, loginMethod)
          VALUES (${openId}, ${input.username}, ${hashedPassword}, ${input.apiKey}, ${input.username}, 'password')`
      );

      const userId = (result[0] as any).insertId;

      // 生成 JWT token
      const token = jwt.sign({ userId, username: input.username }, JWT_SECRET, { expiresIn: "30d" });
      
      // 设置 cookie
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

      return { success: true, message: "注册成功" };
    }),

  // 登录：用户名 + 密码
  login: publicProcedure
    .input(z.object({
      username: z.string(),
      password: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");

      // 查找用户
      const [user] = await db.select().from(users).where(eq(users.username, input.username));
      if (!user || !user.password || !verifyPassword(input.password, user.password)) {
        throw new Error("用户名或密码错误");
      }

      // 更新最后登录时间
      await db.execute(
        sql`UPDATE users SET lastSignedIn = NOW() WHERE id = ${user.id}`
      );

      // 生成 JWT token
      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
      
      // 设置 cookie
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

      return { success: true, user: { id: user.id, username: user.username, name: user.name } };
    }),

  // 获取当前用户（包含 API Key）
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    return {
      id: ctx.user.id,
      username: ctx.user.username,
      name: ctx.user.name,
      apiKey: ctx.user.apiKey,  // 返回用户的 API Key
    };
  }),

  // 更新 API Key
  updateApiKey: publicProcedure
    .input(z.object({ apiKey: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new Error("请先登录");
      
      const db = await getDb();
      if (!db) throw new Error("数据库不可用");

      await db.execute(
        sql`UPDATE users SET apiKey = ${input.apiKey} WHERE id = ${ctx.user.id}`
      );

      return { success: true };
    }),

  // 退出登录
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),
});
