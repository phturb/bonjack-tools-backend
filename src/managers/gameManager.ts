import { Game, Player, PlayerRole, PrismaClient, Roll } from "@prisma/client";
import {
  CacheType,
  Interaction,
  MessageActionRow,
  MessageButton,
  VoiceChannel,
  VoiceState,
  Message,
} from "discord.js";
import { Application, Request, Response } from "express";
import { Server as WebSocketServer, WebSocket } from "ws";
import Closeable from "./closeable";
import { CHANNEL_ID, TIMER_TIME } from "../config/config";
import ControllerConfigurator from "./controllerConfigurator";
import DiscordManager from "./discordManager";
import { getPlayerStats } from "../helpers/stats.helpers";
import { broadcast, send } from "../helpers/ws.helpers";
import Initializable from "./initializable";
import { emptyPlayer, GameState } from "../interfaces/gameState.interface";
import { Message as Msg } from "../interfaces/message.interface";

class GameManager implements Closeable, ControllerConfigurator, Initializable {
  roles: string[];
  gameState: GameState;
  discordManager: DiscordManager;
  webSocketServer: WebSocketServer;
  prisma: PrismaClient;
  countDownId: NodeJS.Timer | undefined;
  discordGameMessage: Message<boolean> | undefined;

  constructor(
    discordManager: DiscordManager,
    webSocketServer: WebSocketServer,
    prisma: PrismaClient
  ) {
    this.prisma = prisma;
    this.discordManager = discordManager;
    this.webSocketServer = webSocketServer;
    this.gameState = {
      players: [
        emptyPlayer(),
        emptyPlayer(),
        emptyPlayer(),
        emptyPlayer(),
        emptyPlayer(),
      ],
      rollCount: 0,
      gameInProgress: false,
      availablePlayers: { "": undefined },
      gameId: 0,
      nextRollTimer: 0,
      canRoll: true,
      discordGuild: "",
      discordGuildChannel: "",
    };
    this.roles = ["ADC", "MID", "JUNGLE", "SUPPORT", "TOP"];
    this.countDownId = undefined;
    this.discordGameMessage = undefined;
  }

  async init() {
    this.registerWebSocket();
    this.registerDiscord();
    await this.updatePlayerListFromDiscord();
  }

  configureController(app: Application): Application {
    app.get("/players", async (req: Request, res: Response) => {
        const players = await this.prisma.player.findMany();
        const updatedPlayers = players.map((x: Player) => {
          return { id: x.id, name: x.name };
        });
        res.json(updatedPlayers);
    });
    
    app.get("/games", async (req: Request, res: Response) => {
        const games = await this.prisma.game.findMany();
        const playerRoles = await this.prisma.playerRole.findMany();
        const updatedGames = games.map((x: Game) => {
          const filteredPlayerRolls = playerRoles.filter((y: PlayerRole) => {
            return x.id === y.gameId;
          });
          const noDupplicatePlayerRolls = filteredPlayerRolls.filter((y: PlayerRole) => {
            return y.rollNumber == filteredPlayerRolls[0].rollNumber;
          });
          return { 
            id: x.id,
            player1Id: noDupplicatePlayerRolls.length >= 1 ? noDupplicatePlayerRolls[0].roleName : undefined,
            player2Id: noDupplicatePlayerRolls.length >= 2 ? noDupplicatePlayerRolls[1].roleName : undefined,
            player3Id: noDupplicatePlayerRolls.length >= 3 ? noDupplicatePlayerRolls[2].roleName : undefined,
            player4Id: noDupplicatePlayerRolls.length >= 4 ? noDupplicatePlayerRolls[3].roleName : undefined,
            player5Id: noDupplicatePlayerRolls.length >= 5 ? noDupplicatePlayerRolls[4].roleName : undefined,
          };
        });
        res.json(updatedGames);
    });
    
    
    app.get("/rolls", async (req: Request, res: Response) => {
        const rolls = await this.prisma.roll.findMany();
        const playerRoles = await this.prisma.playerRole.findMany();
        const updatedRolls = rolls.map((x: Roll) => {
          const filteredPlayerRolls = playerRoles.filter((y: PlayerRole) => {
            return x.gameId === y.gameId && x.rollNumber === y.rollNumber;
          });
          return { 
            gameId: x.gameId,
            rollNumber: x.rollNumber,
            player1Roll: filteredPlayerRolls.length >= 1 ? filteredPlayerRolls[0].roleName : undefined,
            player2Roll: filteredPlayerRolls.length >= 2 ? filteredPlayerRolls[1].roleName : undefined,
            player3Roll: filteredPlayerRolls.length >= 3 ? filteredPlayerRolls[2].roleName : undefined,
            player4Roll: filteredPlayerRolls.length >= 4 ? filteredPlayerRolls[3].roleName : undefined,
            player5Roll: filteredPlayerRolls.length >= 5 ? filteredPlayerRolls[4].roleName : undefined,
          };
        });
        res.json(updatedRolls);
    });

    app.get("/v2/players", async (req: Request, res: Response) => {
        const players = await this.prisma.player.findMany();
        res.json(players);
    });
    
    app.get("/v2/games", async (req: Request, res: Response) => {
        const games = await this.prisma.game.findMany();
        res.json(games);
    });
     
    app.get("/v2/rolls", async (req: Request, res: Response) => {
        const rolls = await this.prisma.roll.findMany();
        res.json(rolls);
    });

    app.get("/v2/roles", async (req: Request, res: Response) => {
        const roles = await this.prisma.role.findMany();
        res.json(roles);
    });

    app.get("/v2/playerRoles", async (req: Request, res: Response) => {
        const playerRoles = await this.prisma.playerRole.findMany();
        res.json(playerRoles);
    });

    return app;
  }

  private registerWebSocket() {
    this.webSocketServer.on("connection", (ws: WebSocket) => {
      ws.on("message", async (message: string) => {
        const parsedMessage: Msg = JSON.parse(message);
        if (parsedMessage.action === "updatePlayers") {
          await this.updatePlayers(ws, parsedMessage);
        }
        if (parsedMessage.action === "roll") {
          await this.roll();
        }

        if (parsedMessage.action === "cancel") {
          await this.cancel();
        }

        if (parsedMessage.action === "reset") {
          await this.reset();
        }

        if (parsedMessage.action === "refreshDiscord") {
          this.refreshDiscord();
        }
      });
      send(
        { action: "updateState", content: JSON.stringify(this.gameState) },
        ws
      );
      ws.on("error", function (err: Error) {
        console.warn(err);
      });
    });
  }

  private registerDiscord() {
    this.discordManager.discordClient.on(
      "voiceStateUpdate",
      async (oldState: VoiceState, newState: VoiceState) => {
        if (
          oldState.channelId === CHANNEL_ID ||
          newState.channelId === CHANNEL_ID
        ) {
          await this.updatePlayerListFromDiscord();
        }
      }
    );
    this.discordManager.discordClient.on(
      "interactionCreate",
      async (interaction: Interaction<CacheType>) => {
        if (
          interaction.isButton() &&
          this.discordGameMessage?.id === interaction.message.id &&
          this.gameState.players.find(
            (x) => x.player && x.player.id === interaction.user.id
          )
        ) {
          if (interaction.customId === "roll_btn") {
            await this.roll();
            await this.updateGameMessage();
          } else if (interaction.customId === "finish_btn") {
            await this.reset();
            await this.updateGameMessage();
          } else if (interaction.customId === "cancel_btn") {
            await this.cancel();
            await this.updateGameMessage();
          }
          await interaction.deferUpdate();
          return;
        }
        if (interaction.isButton()) {
          await interaction.deferUpdate();
          return;
        }

        if (!interaction.isCommand()) {
          return;
        }
        const commandName = interaction.commandName;

        if (commandName !== "ldn") {
          return;
        }

        const { embedMessage, components } = this.createMessageElements();
        this.discordGameMessage = (await interaction.reply({
          content: embedMessage,
          components: [components],
          fetchReply: true,
        })) as Message<boolean>;
      }
    );
  }

  private createMessageEmbed(): string {
    let description;
    if (this.gameState.gameInProgress) {
      description = `Loi in progress, roll number : ${this.gameState.rollCount}`;
    } else {
      description =
        "Waiting for players ...\nGo see the web dashboard at https://tools.bonjack.club/lois-des-norms";
    }
    let customMessage = description;
    customMessage += "\n";
    this.gameState.players.forEach((gamePlayer, index) => {
      customMessage += "> ";
      customMessage += gamePlayer.role
        ? `*${gamePlayer.role}*`
        : `*Player ${index + 1}*`;
      customMessage += "\t";
      customMessage += gamePlayer.player.name ?? "Empty Spot";
      customMessage += "\n";
    });
    return customMessage;
  }

  private createMessageElements(): {
    embedMessage: string;
    components: MessageActionRow;
  } {
    const embedMessage = this.createMessageEmbed();
    const buttons = [
      new MessageButton()
        .setCustomId("roll_btn")
        .setLabel("Roll")
        .setStyle("PRIMARY")
        .setDisabled(!this.gameState.canRoll),
      new MessageButton()
        .setCustomId("finish_btn")
        .setLabel("Finish")
        .setStyle("SUCCESS")
        .setDisabled(!this.gameState.gameInProgress),
      new MessageButton()
        .setCustomId("cancel_btn")
        .setLabel("Cancel")
        .setStyle("DANGER"),
    ];
    const components = new MessageActionRow().addComponents(buttons);
    return { embedMessage, components };
  }

  private async updateGameMessage() {
    if (this.discordGameMessage) {
      const { embedMessage, components } = this.createMessageElements();
      this.discordGameMessage = (await this.discordGameMessage?.edit({
        content: embedMessage,
        components: [components],
      })) as any;
      console.log(this.discordGameMessage);
    }
  }

  private clearMessage() {
    this.discordGameMessage = undefined;
  }

  private async refreshDiscord() {
    console.log("Refresh Discord information");
    await this.updatePlayerListFromDiscord();
  }

  private async resetMessage(type: "reset" | "cancel") {
    const typeText = type === "reset" ? "Finished" : "Canceled";
    const description = `Loi is ${typeText} !`;
    let customMessage = "**Lois Des Norms**\n";
    customMessage += description;
    customMessage += "\n";
    this.gameState.players.forEach((gamePlayer, index) => {
      customMessage += "> ";
      customMessage += gamePlayer.role
        ? `*${gamePlayer.role}*`
        : `*Player ${index + 1}*`;
      customMessage += "\t";
      customMessage += gamePlayer.player.name ?? "Empty Spot";
      customMessage += "\n";
    });
    if (this.discordGameMessage) {
      this.discordGameMessage = (await this.discordGameMessage?.edit(
        customMessage
      )) as any;
    }
  }

  private async reset() {
    console.log("Reset game!");
    this.gameState.gameInProgress = false;
    this.gameState.rollCount = 0;
    for (let i = 0; i < this.gameState.players.length; i++) {
      this.gameState.players[i].role = undefined;
    }
    if (this.countDownId) {
      clearInterval(this.countDownId);
    }
    this.countDownId = undefined;
    this.gameState.nextRollTimer = 0;
    this.gameState.canRoll = true;
    // TODO : Update discord message with finish or reset
    await this.resetMessage("reset");
    this.clearMessage();
    this.updatePlayerListFromDiscord();

    broadcast(this.webSocketServer, {
      action: "updateState",
      content: JSON.stringify(this.gameState),
    });
  }

  private async cancel() {
    console.warn("Game canceled!");
    if (this.gameState.gameInProgress && this.gameState.rollCount > 0) {
      await this.prisma.roll.deleteMany({
        where: {
          gameId: this.gameState.gameId,
        },
      });
      await this.prisma.game.delete({
        where: {
          id: this.gameState.gameId,
        },
      });
      this.gameState.gameId -= 1;
    }
    this.gameState.gameInProgress = false;
    this.gameState.rollCount = 0;
    for (let i = 0; i < this.gameState.players.length; i++) {
      this.gameState.players[i].role = undefined;
    }
    if (this.countDownId) {
      clearInterval(this.countDownId);
    }
    this.countDownId = undefined;
    this.gameState.nextRollTimer = 0;
    this.gameState.canRoll = true;
    await this.resetMessage("cancel");
    this.clearMessage();
    this.updatePlayerListFromDiscord();
    broadcast(this.webSocketServer, {
      action: "updateState",
      content: JSON.stringify(this.gameState),
    });
  }

  private async updatePlayers(ws: WebSocket, parsedMessage: Msg) {
    const content: { id: string; name: string | undefined }[] = JSON.parse(
      parsedMessage.content
    );
    const processedPlayers = content.map((x) => {
      return { player: x, role: undefined };
    });
    if (this.gameState.gameInProgress) {
      send(
        {
          action: "updateState",
          content: JSON.stringify(this.gameState),
        },
        ws
      );
    } else {
      this.verifyAndAdjustPlayers(
        processedPlayers,
        this.gameState.availablePlayers
      );
      this.gameState.players = processedPlayers;
      broadcast(this.webSocketServer, {
        action: "updateState",
        content: JSON.stringify(this.gameState),
      });
    }
  }

  private async roll() {
    if (!this.gameState.canRoll) {
      return;
    }
    this.gameState.canRoll = false;
    this.gameState.nextRollTimer = TIMER_TIME;
    if (!this.gameState.gameInProgress) {
      this.gameState.gameInProgress = true;
      const currentGame = await this.prisma.game.create({ data: {}});
      this.gameState.gameId = currentGame.id;
      console.log("Law has started!");
    }
    this.gameState.rollCount += 1;
    console.log(`Randomize Roles for the ${this.gameState.rollCount} time!`);
    this.randomizeRoles();
    for (let i = 0; i < this.gameState.players.length; i++) {
      this.gameState.players[i].role = this.roles[i];
    }
    const playerRolesToCreate = 
      this.gameState.players.filter(x => { return x.player.id && x.role; })
                            .map(x => {
                              return {
                                playerId: x.player.id,
                                roleName: x.role as string
                              };
                            });

    await this.prisma.roll.create({
      data: {
        gameId: this.gameState.gameId,
        rollNumber: this.gameState.rollCount,
        playerRoles: {
          create: playerRolesToCreate 
        }
      },
      include: {
        playerRoles: true,
      }
    });

    this.countDownId = setInterval(async () => {
      this.gameState.nextRollTimer -= 1000;
      if (this.gameState.canRoll || this.gameState.nextRollTimer <= 0) {
        if (this.countDownId) {
          clearInterval(this.countDownId);
        }
        this.countDownId = undefined;
        this.gameState.nextRollTimer = 0;
        this.gameState.canRoll = true;
        await this.updateGameMessage();
        broadcast(this.webSocketServer, {
          action: "updateState",
          content: JSON.stringify(this.gameState),
        });
      }
    }, 1000);
    await this.updateGameMessage();
    broadcast(this.webSocketServer, {
      action: "updateState",
      content: JSON.stringify(this.gameState),
    });
  }

  private randomizeRoles() {
    for (let i = this.roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.roles[i];
      this.roles[i] = this.roles[j];
      this.roles[j] = temp;
    }
  }

  private async updatePlayerListFromDiscord() {
    const ch: VoiceChannel | null = await this.discordManager.getChannel();
    if (!ch) return;

    this.gameState.discordGuildChannel = ch?.name ?? "";
    this.gameState.discordGuild = ch?.guild.name ?? "";
    let newAvailablePlayers: any = { "": undefined };
    for (const [id, m] of ch.members) {
      if (m.nickname) {
        newAvailablePlayers[id] = {
          name: m.nickname,
          stats: await getPlayerStats(id, this.prisma),
        };
      } else if (m.displayName) {
        newAvailablePlayers[id] = {
          name: m.displayName,
          stats: await getPlayerStats(id, this.prisma),
        };
      }
      await this.prisma.player.upsert({
        where: {
          id: id,
        },
        update: {
          name: newAvailablePlayers[id].name,
        },
        create: {
          id: id,
          name: newAvailablePlayers[id].name,
        },
      });
    }
    console.log("Available Player list updated : ", newAvailablePlayers);
    if (!this.gameState.gameInProgress) {
      const newPlayers = [...this.gameState.players];
      this.verifyAndAdjustPlayers(newPlayers, newAvailablePlayers);
      this.gameState.availablePlayers = newAvailablePlayers;
      for (const ap of Object.entries(newAvailablePlayers)) {
        if (newPlayers.filter((p) => p.player.id === ap[0]).length <= 0) {
          for (let i = 0; i < newPlayers.length; i++) {
            if (newPlayers[i].player.id === "" || !newPlayers[i].player.id) {
              newPlayers[i].player.id = ap[0];
              newPlayers[i].player.name = (ap[1] as any).name as string;
              break;
            }
          }
        }
      }
      this.gameState.players = newPlayers;
      broadcast(this.webSocketServer, {
        action: "updateState",
        content: JSON.stringify(this.gameState),
      });
    }
    await this.updateGameMessage();
  }

  private verifyAndAdjustPlayers(
    players: {
      player: { id: string; name: string | undefined };
      role: string | undefined;
    }[],
    availablePlayers: any
  ) {
    for (let i = 0; i < players.length; i++) {
      if (players[i].player.id === "" || !players[i].player.id) continue;
      for (let j = 0; j < players.length; j++) {
        if (i === j) continue;
        if (players[i].player.id === players[j].player.id) {
          players[j].player = { id: "", name: undefined };
        }
      }
    }
    for (let i = 0; i < players.length; i++) {
      if (!availablePlayers[players[i].player.id as string]) {
        players[i] = emptyPlayer();
      }
    }
    return players;
  }

  close() {};
}

export default GameManager;
