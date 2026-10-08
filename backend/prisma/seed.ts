import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Upsert Junction
  await prisma.junction.upsert({
    where: { id: 'A' },
    update: {},
    create: {
      id: 'A',
      name: 'Junction A',
      mode: 'AUTOMATIC',
      phase: 'ALL_RED',
      controllerStatus: 'ONLINE',
    },
  });

  // Upsert JunctionState separately
  await prisma.junctionState.upsert({
    where: { junctionId: 'A' },
    update: {},
    create: {
      junctionId: 'A',
      desiredNorth: 'RED',
      desiredSouth: 'RED',
      desiredEast: 'RED',
      desiredWest: 'RED',
      actualNorth: 'RED',
      actualSouth: 'RED',
      actualEast: 'RED',
      actualWest: 'RED',
      emergencyActive: false,
      emergencyDirection: null,
      manualOverride: false,
    },
  });

  console.log('✅ Junction A + JunctionState seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });