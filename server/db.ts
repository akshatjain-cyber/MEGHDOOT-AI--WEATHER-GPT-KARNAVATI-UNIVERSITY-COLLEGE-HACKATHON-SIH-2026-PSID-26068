import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  chatMessages,
  conversations,
  InsertUser,
  savedLocations,
  userPreferences,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  } else {
    values.lastSignedIn = new Date();
    updateSet.lastSignedIn = new Date();
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getPreferences(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return result[0];
}

export async function upsertPreferences(userId: number, data: Partial<typeof userPreferences.$inferInsert>) {
  const db = await getDb();
  if (!db) return undefined;
  const values = {
    userId,
    language: data.language ?? "en-IN",
    homeLocation: data.homeLocation ?? "Location not set",
    homeLatitude: data.homeLatitude ?? "12.9716",
    homeLongitude: data.homeLongitude ?? "77.5946",
    speechOutput: data.speechOutput ?? 1,
    lowBandwidthMode: data.lowBandwidthMode ?? 0,
  };
  await db.insert(userPreferences).values(values).onDuplicateKeyUpdate({
    set: {
      language: values.language,
      homeLocation: values.homeLocation,
      homeLatitude: values.homeLatitude,
      homeLongitude: values.homeLongitude,
      speechOutput: values.speechOutput,
      lowBandwidthMode: values.lowBandwidthMode,
      updatedAt: new Date(),
    },
  });
  return getPreferences(userId);
}

export async function listSavedLocations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(savedLocations).where(eq(savedLocations.userId, userId)).orderBy(desc(savedLocations.createdAt));
}

export async function createSavedLocation(userId: number, input: Omit<typeof savedLocations.$inferInsert, "userId" | "id" | "createdAt">) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(savedLocations).values({ ...input, userId }).$returningId();
  return result[0];
}

export async function listConversations(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.updatedAt));
}

export async function createConversation(userId: number, title: string, language: string, location: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(conversations).values({ userId, title, language, location }).$returningId();
  return result[0]?.id;
}

export async function getConversation(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const conversation = await db.select().from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  if (!conversation[0]) return undefined;
  const messages = await db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(chatMessages.createdAt);
  return { conversation: conversation[0], messages };
}

export async function addChatMessage(conversationId: number, role: "user" | "assistant", content: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(chatMessages).values({ conversationId, role, content });
}

export async function renameConversation(userId: number, conversationId: number, title: string) {
  const db = await getDb();
  if (!db) return undefined;
  await db.update(conversations).set({ title: title.trim().slice(0, 160), updatedAt: new Date() }).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return getConversation(userId, conversationId);
}

export async function deleteConversation(userId: number, conversationId: number) {
  const db = await getDb();
  if (!db) return false;
  const owned = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1);
  if (!owned[0]) return false;
  await db.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId));
  await db.delete(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
  return true;
}
