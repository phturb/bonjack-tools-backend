import express, { Application } from "express";
import { Client as DiscordClient, Intents } from "discord.js";
import http from "http";
import { Server as WebSocketServer } from "ws";
import GameManager from "./managers/game-manager";
import { DISCORD_TOKEN, PORT } from "./config/config";
import DiscordManager from "./managers/discord-manager";
import { PrismaClient } from "@prisma/client";
import configureExpressApplication from "./helpers/controllers.helpers";
import ExpenseManager from "./managers/expense-manager";

if (!DISCORD_TOKEN) {
  console.error("Discord Token not defined ! Please defined DISCORD_TOKEN");
  process.exit(1);
}

// Create singleton dependencies
const prisma = new PrismaClient();
const discordClient = new DiscordClient({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_VOICE_STATES,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
});
let app: Application = express();
app = configureExpressApplication(app);
const server = http.createServer(app);
const wsServer = new WebSocketServer({ server: server });
const discordManager = new DiscordManager(discordClient);
const gameManager = new GameManager(discordManager, wsServer, prisma);
const expenseManager = new ExpenseManager(prisma);

// Configure controller
app = gameManager.configureController(app);
app = expenseManager.configureController(app);

const init = async () => {
  await discordManager.init();
  await gameManager.init();
};

init().then(() => {
  server.listen(PORT, function () {
    console.log(`Server is running on port ${PORT}`);
  });
  server.on("close", () => {
    discordManager.close();
    gameManager.close();
    expenseManager.close();
  });
});
