import { PrismaClient } from '@nigar/prisma-client';

let prisma: PrismaClient | null = null;

/**
 * Get a shared PrismaClient for integration tests.
 * Requires DATABASE_URL and DIRECT_URL to be set.
 * If not available, tests using this will be skipped.
 */
export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL,
    });
  }
  return prisma;
}

/** Check if DB connection is available */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const client = getTestPrisma();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Clean all test data from all tables */
export async function cleanDatabase(): Promise<void> {
  const client = getTestPrisma();
  // Delete in dependency order
  await client.referral.deleteMany();
  await client.transaction.deleteMany();
  await client.message.deleteMany();
  await client.conversation.deleteMany();
  await client.credit.deleteMany();
  await client.onboardingState.deleteMany();
  await client.userSettings.deleteMany();
  await client.userProfile.deleteMany();
  await client.user.deleteMany();
}

/** Disconnect prisma after all tests */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
