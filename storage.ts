import { db } from "./db";
import { users, shifts, type User, type Shift, type InsertShift, type LeaderboardEntry } from "@shared/schema";
import { eq, desc, isNull, and, sql } from "drizzle-orm";

export interface IStorage {
  getUserByDiscordId(discordId: string): Promise<User | undefined>;
  createUser(discordId: string, username: string): Promise<User>;
  
  getActiveShift(discordId: string): Promise<Shift | undefined>;
  startShift(discordId: string, department: string): Promise<Shift>;
  endShift(discordId: string): Promise<Shift>;
  
  getLeaderboard(department?: string): Promise<LeaderboardEntry[]>;
  resetLeaderboard(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUserByDiscordId(discordId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.discordId, discordId));
    return user;
  }

  async createUser(discordId: string, username: string): Promise<User> {
    const [user] = await db.insert(users).values({ discordId, username }).returning();
    return user;
  }

  async getActiveShift(discordId: string): Promise<Shift | undefined> {
    const [shift] = await db.select().from(shifts).where(and(eq(shifts.discordId, discordId), isNull(shifts.endTime)));
    return shift;
  }

  async startShift(discordId: string, department: string): Promise<Shift> {
    const [shift] = await db.insert(shifts).values({ discordId, department, startTime: new Date() }).returning();
    return shift;
  }

  async endShift(discordId: string): Promise<Shift> {
    const activeShift = await this.getActiveShift(discordId);
    if (!activeShift) throw new Error("No active shift found.");

    const endTime = new Date();
    const durationMs = endTime.getTime() - activeShift.startTime.getTime();
    const durationMinutes = Math.floor(durationMs / 60000);

    const [updatedShift] = await db.update(shifts)
      .set({ endTime, durationMinutes })
      .where(eq(shifts.id, activeShift.id))
      .returning();
    return updatedShift;
  }

  async getLeaderboard(department?: string): Promise<LeaderboardEntry[]> {
    const conditions = [];
    if (department) {
      conditions.push(eq(shifts.department, department));
    }

    const result = await db.select({
      discordId: users.discordId,
      username: users.username,
      totalDuration: sql<number>`CAST(COALESCE(SUM(${shifts.durationMinutes}), 0) AS INTEGER)`,
      department: department ? sql<string>`${department}` : sql<string>`'Global'`,
    })
    .from(users)
    .leftJoin(shifts, eq(users.discordId, shifts.discordId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(users.discordId, users.username)
    .orderBy(desc(sql`CAST(COALESCE(SUM(${shifts.durationMinutes}), 0) AS INTEGER)`));
    
    return result;
  }

  async resetLeaderboard(): Promise<void> {
    await db.delete(shifts);
  }
}

export const storage = new DatabaseStorage();
