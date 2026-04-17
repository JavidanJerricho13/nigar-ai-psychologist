import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SubscriptionTier } from '@nigar/shared-types';
import { ActiveRole } from '@nigar/shared-types';

/** Subscription plan definitions */
export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  priceAzn: number;
  priceCentsMonthly: number;
  priceAznAnnual: number;
  features: string[];
  sessionsPerWeek: number; // 0 = unlimited
  voicePerMonth: number;   // 0 = unlimited
  allowedRoles: ActiveRole[];
  hasMemory: boolean;
  hasCheckIns: boolean;
  hasMoodChart: boolean;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  [SubscriptionTier.FREE]: {
    tier: SubscriptionTier.FREE,
    name: 'Pulsuz',
    priceAzn: 0,
    priceCentsMonthly: 0,
    priceAznAnnual: 0,
    features: [
      '5 sessiya/həftə',
      '3 pulsuz səsli cavab',
      '2 persona (Nigar, Nigar Dost)',
      'Əsas əhval izləmə',
    ],
    sessionsPerWeek: 5,
    voicePerMonth: 3,
    allowedRoles: [ActiveRole.NIGAR, ActiveRole.NIGAR_DOST],
    hasMemory: false,
    hasCheckIns: false,
    hasMoodChart: true,
  },
  [SubscriptionTier.PREMIUM]: {
    tier: SubscriptionTier.PREMIUM,
    name: 'Premium',
    priceAzn: 9.90,
    priceCentsMonthly: 990,
    priceAznAnnual: 89.90,
    features: [
      'Limitsiz sessiya',
      '30 səsli cavab/ay',
      'Bütün 6 persona',
      'Uzunmüddətli yaddaş',
      'Proaktiv check-in-lər',
      'Həftəlik irəliləyiş hesabatı',
      'Sessiya jurnalı',
    ],
    sessionsPerWeek: 0, // unlimited
    voicePerMonth: 30,
    allowedRoles: Object.values(ActiveRole) as ActiveRole[],
    hasMemory: true,
    hasCheckIns: true,
    hasMoodChart: true,
  },
  [SubscriptionTier.PREMIUM_PLUS]: {
    tier: SubscriptionTier.PREMIUM_PLUS,
    name: 'Premium+',
    priceAzn: 19.90,
    priceCentsMonthly: 1990,
    priceAznAnnual: 179.90,
    features: [
      'Premium-in bütün xüsusiyyətləri',
      'Limitsiz səsli cavab',
      'KBT/DBT strukturlaşdırılmış proqramlar',
      'PDF ixracı (terapevt üçün)',
      'Aylıq AI terapiya xülasəsi',
      'Yeni funksiyalara ilk giriş',
    ],
    sessionsPerWeek: 0, // unlimited
    voicePerMonth: 0,   // unlimited
    allowedRoles: Object.values(ActiveRole) as ActiveRole[],
    hasMemory: true,
    hasCheckIns: true,
    hasMoodChart: true,
  },
};

const FREE_SESSIONS_PER_WEEK = 5;

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get or create a subscription record for a user.
   * Defaults to FREE tier.
   */
  async getSubscription(userId: string): Promise<{
    tier: SubscriptionTier;
    plan: SubscriptionPlan;
    sessionsRemaining: number | null; // null = unlimited
    isActive: boolean;
  }> {
    const sub = await this.prisma.userSubscription.findUnique({
      where: { userId },
    });

    if (!sub) {
      // Create default free subscription
      await this.prisma.userSubscription.create({
        data: { userId, tier: 'free', weekResetAt: this.getWeekStart() },
      });

      return {
        tier: SubscriptionTier.FREE,
        plan: SUBSCRIPTION_PLANS[SubscriptionTier.FREE],
        sessionsRemaining: FREE_SESSIONS_PER_WEEK,
        isActive: true,
      };
    }

    const tier = sub.tier as SubscriptionTier;
    const plan = SUBSCRIPTION_PLANS[tier] ?? SUBSCRIPTION_PLANS[SubscriptionTier.FREE];

    // Check if paid subscription is still active
    let isActive = true;
    if (tier !== SubscriptionTier.FREE && sub.currentPeriodEnd) {
      isActive = sub.currentPeriodEnd > new Date();
    }

    // Reset weekly session counter if needed
    const weekStart = this.getWeekStart();
    let sessionsThisWeek = sub.sessionsThisWeek;
    if (sub.weekResetAt < weekStart) {
      sessionsThisWeek = 0;
      await this.prisma.userSubscription.update({
        where: { userId },
        data: { sessionsThisWeek: 0, weekResetAt: weekStart },
      });
    }

    const effectiveTier = isActive ? tier : SubscriptionTier.FREE;
    const effectivePlan = SUBSCRIPTION_PLANS[effectiveTier];

    return {
      tier: effectiveTier,
      plan: effectivePlan,
      sessionsRemaining: effectivePlan.sessionsPerWeek > 0
        ? Math.max(0, effectivePlan.sessionsPerWeek - sessionsThisWeek)
        : null, // null = unlimited
      isActive,
    };
  }

  /**
   * Increment the session counter for free-tier usage tracking.
   * Returns false if the user has hit the weekly limit.
   */
  async recordSession(userId: string): Promise<{ allowed: boolean; remaining: number | null }> {
    const { tier, plan, sessionsRemaining } = await this.getSubscription(userId);

    if (plan.sessionsPerWeek === 0) {
      // Unlimited
      return { allowed: true, remaining: null };
    }

    if (sessionsRemaining !== null && sessionsRemaining <= 0) {
      return { allowed: false, remaining: 0 };
    }

    await this.prisma.userSubscription.update({
      where: { userId },
      data: { sessionsThisWeek: { increment: 1 } },
    });

    return {
      allowed: true,
      remaining: sessionsRemaining !== null ? sessionsRemaining - 1 : null,
    };
  }

  /**
   * Check if a role is allowed for the user's current tier.
   */
  async isRoleAllowed(userId: string, role: ActiveRole): Promise<boolean> {
    const { plan } = await this.getSubscription(userId);
    return plan.allowedRoles.includes(role);
  }

  /**
   * Upgrade a user's subscription tier (called from Stripe webhook).
   */
  async upgradeTier(
    userId: string,
    tier: SubscriptionTier,
    stripeCustomerId: string,
    stripeSubscriptionId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    await this.prisma.userSubscription.upsert({
      where: { userId },
      create: {
        userId,
        tier: tier as string as any,
        stripeCustomerId,
        stripeSubscriptionId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        weekResetAt: this.getWeekStart(),
      },
      update: {
        tier: tier as string as any,
        stripeCustomerId,
        stripeSubscriptionId,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
    });

    this.logger.log(`Subscription upgraded: user=${userId.slice(0, 8)} tier=${tier}`);
  }

  /**
   * Mark subscription to cancel at period end (called from Stripe webhook).
   */
  async cancelAtPeriodEnd(userId: string): Promise<void> {
    await this.prisma.userSubscription.update({
      where: { userId },
      data: { cancelAtPeriodEnd: true },
    });
    this.logger.log(`Subscription set to cancel at period end: user=${userId.slice(0, 8)}`);
  }

  private getWeekStart(): Date {
    const now = new Date();
    const day = now.getDay(); // 0=Sunday
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(now.getFullYear(), now.getMonth(), diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }
}
