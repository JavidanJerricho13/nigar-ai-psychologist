import {
  getTestPrisma,
  isDatabaseAvailable,
  cleanDatabase,
  disconnectPrisma,
} from '../helpers/prisma-test.helper';
import { PrismaClient } from '@nigar/prisma-client';

/**
 * Integration tests for User repository operations.
 * These hit a real PostgreSQL database (Supabase).
 *
 * Skip if DATABASE_URL is not set (CI without DB).
 */
let prisma: PrismaClient;
let dbAvailable: boolean;

beforeAll(async () => {
  dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) {
    prisma = getTestPrisma();
    await cleanDatabase();
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await cleanDatabase();
    await disconnectPrisma();
  }
});

const describeIfDb = (name: string, fn: () => void) => {
  if (process.env.DATABASE_URL) {
    describe(name, fn);
  } else {
    describe.skip(`${name} (no DATABASE_URL)`, fn);
  }
};

describeIfDb('PrismaUserRepository (integration)', () => {
  it('should create a user with telegramId', async () => {
    const user = await prisma.user.create({
      data: { telegramId: 'tg-integration-1' },
    });

    expect(user.id).toBeDefined();
    expect(user.telegramId).toBe('tg-integration-1');
    expect(user.isActive).toBe(true);
    expect(user.referralCode).toBeDefined();
  });

  it('should find user by telegramId', async () => {
    const found = await prisma.user.findUnique({
      where: { telegramId: 'tg-integration-1' },
    });

    expect(found).not.toBeNull();
    expect(found!.telegramId).toBe('tg-integration-1');
  });

  it('should create user profile', async () => {
    const user = await prisma.user.findUnique({
      where: { telegramId: 'tg-integration-1' },
    });

    const profile = await prisma.userProfile.create({
      data: {
        userId: user!.id,
        name: 'Test User',
        gender: 'male',
        age: 25,
        bio: 'Integration test bio',
      },
    });

    expect(profile.name).toBe('Test User');
    expect(profile.age).toBe(25);
    expect(profile.onboardingCompleted).toBe(false);
  });

  it('should create user settings with defaults', async () => {
    const user = await prisma.user.findUnique({
      where: { telegramId: 'tg-integration-1' },
    });

    const settings = await prisma.userSettings.create({
      data: { userId: user!.id },
    });

    expect(settings.activeRole).toBe('nigar');
    expect(settings.responseFormat).toBe('text');
    expect(settings.nigarBlackRudenessEnabled).toBe(false);
    expect(settings.language).toBe('az');
  });

  it('should update settings role', async () => {
    const user = await prisma.user.findUnique({
      where: { telegramId: 'tg-integration-1' },
    });

    const updated = await prisma.userSettings.update({
      where: { userId: user!.id },
      data: { activeRole: 'nigar_black' },
    });

    expect(updated.activeRole).toBe('nigar_black');
  });

  it('should enforce unique telegramId', async () => {
    await expect(
      prisma.user.create({ data: { telegramId: 'tg-integration-1' } }),
    ).rejects.toThrow();
  });
});

describeIfDb('PrismaOnboardingRepository (integration)', () => {
  let testUserId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { telegramId: 'tg-onboarding-test' },
    });
    testUserId = user.id;
  });

  it('should create onboarding state', async () => {
    const state = await prisma.onboardingState.create({
      data: {
        userId: testUserId,
        currentStep: 0,
        stepData: { name: 'Test', gender: 'male' },
        privacyAccepted: false,
      },
    });

    expect(state.currentStep).toBe(0);
    expect((state.stepData as any).name).toBe('Test');
  });

  it('should update onboarding state', async () => {
    const updated = await prisma.onboardingState.update({
      where: { userId: testUserId },
      data: {
        currentStep: 5,
        stepData: { name: 'Test', gender: 'male', age: 25 },
        privacyAccepted: true,
      },
    });

    expect(updated.currentStep).toBe(5);
    expect(updated.privacyAccepted).toBe(true);
  });

  it('should complete onboarding', async () => {
    const completed = await prisma.onboardingState.update({
      where: { userId: testUserId },
      data: {
        currentStep: 13,
        completedAt: new Date(),
      },
    });

    expect(completed.completedAt).toBeDefined();
    expect(completed.completedAt).not.toBeNull();
  });

  it('should find by userId', async () => {
    const found = await prisma.onboardingState.findUnique({
      where: { userId: testUserId },
    });

    expect(found).not.toBeNull();
    expect(found!.currentStep).toBe(13);
  });
});
