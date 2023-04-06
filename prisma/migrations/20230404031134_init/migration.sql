-- CreateTable
CREATE TABLE "Game" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT
);

-- CreateTable
CREATE TABLE "Role" (
    "name" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "Roll" (
    "gameId" INTEGER NOT NULL,
    "rollNumber" INTEGER NOT NULL,

    PRIMARY KEY ("gameId", "rollNumber"),
    CONSTRAINT "Roll_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerRole" (
    "gameId" INTEGER NOT NULL,
    "rollNumber" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "roleName" TEXT NOT NULL,

    PRIMARY KEY ("gameId", "rollNumber", "playerId"),
    CONSTRAINT "PlayerRole_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerRole_gameId_rollNumber_fkey" FOREIGN KEY ("gameId", "rollNumber") REFERENCES "Roll" ("gameId", "rollNumber") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerRole_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerRole_roleName_fkey" FOREIGN KEY ("roleName") REFERENCES "Role" ("name") ON DELETE RESTRICT ON UPDATE CASCADE
);
