import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupBot, client } from "./bot";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get(api.leaderboard.get.path, async (req, res) => {
    try {
      const department = req.query.department as string | undefined;
      const leaderboard = await storage.getLeaderboard(department);
      res.json(leaderboard);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get(api.botStatus.get.path, async (req, res) => {
    res.json({
      status: client?.isReady() ? "Online" : "Offline",
      uptime: client?.uptime || 0
    });
  });

  // Start the discord bot
  setupBot().catch(console.error);

  return httpServer;
}