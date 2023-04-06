import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROLES = ["ADC", "MID", "JUNGLE", "SUPPORT", "TOP"];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: { name: role },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
