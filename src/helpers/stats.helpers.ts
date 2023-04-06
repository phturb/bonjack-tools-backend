import { PrismaClient } from "@prisma/client";

export const getPlayerStats = async (id: string, prisma: PrismaClient) => {
  const playerGames = await prisma.game.findMany({
    where: {
      playerRoles: {
        some: {
          playerId: id,
        },
      },
    },
    include: {
      rolls: {
        include: {
          playerRoles: {
            include: {
              player: true,
            },
          },
        },
      },
    },
  });
  const gamesLength = playerGames.map((x: any) => x.rolls.length);
  return {
    numberOfGame: gamesLength.length,
    totalRoll: gamesLength.reduce((x: number, y: number) => x + y, 0),
  };
};

export const getAllPlayerStats = async (prisma: PrismaClient) => {
  const players = await prisma.player.findMany();
  return players.map(async (player: { id: string }) => {
    return { ...player, stats: await getPlayerStats(player.id, prisma) };
  });
};
