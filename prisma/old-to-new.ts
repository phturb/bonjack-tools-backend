import { PrismaClient } from "@prisma/client";
import { PrismaClient as OldPrismaClient } from "./generated/olddb";

const prisma = new PrismaClient();
const oldPrisma = new OldPrismaClient();
const ROLES = [ "ADC" , "MID" , "JUNGLE" , "SUPPORT" , "TOP" ];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role }
    });
  }

  const oldGames = await oldPrisma.game.findMany();
  const oldPlayers = await oldPrisma.player.findMany();
  const oldRolls = await oldPrisma.roll.findMany();

  for (const player of oldPlayers) {
    await prisma.player.upsert({
      where: { id: player.id },
      update: {
        name: player.name
      },
      create: {
        id: player.id,
        name: player.name
      }
    });
  }

  for (const game of oldGames) {
    await prisma.game.create({
      data: {
        id: game.id
      }
    });
  }

  for (const roll of oldRolls) {
    const game = oldGames.find(x => x.id === roll.gameId);
    const playerRoles = [];
    if (game) {
      if (game.player1Id) {
        playerRoles.push({
          playerId: game.player1Id,
          roleName: roll.player1Roll as string
        });
      }
      if (game.player2Id) {
        playerRoles.push({
          playerId: game.player2Id,
          roleName: roll.player2Roll as string
        });
      }
      if (game.player3Id) {
        playerRoles.push({
          playerId: game.player3Id,
          roleName: roll.player3Roll as string
        });
      }
      if (game.player4Id) {
        playerRoles.push({
          playerId: game.player4Id,
          roleName: roll.player4Roll as string
        });
      }
      if (game.player5Id) {
        playerRoles.push({
          playerId: game.player5Id,
          roleName: roll.player5Roll as string
        });
      }
    }
    await prisma.roll.create({
      data: {
        gameId: roll.gameId,
        rollNumber: roll.rollNumber,
        playerRoles: {
          create: playerRoles
        }
      }
    })
  }
}

main().then(async () => {
  await prisma.$disconnect();
  await oldPrisma.$disconnect();
}).catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  await oldPrisma.$disconnect();
  process.exit(1);
});
