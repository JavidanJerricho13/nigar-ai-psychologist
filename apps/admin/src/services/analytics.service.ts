import { PrismaClient, Prisma } from '@nigar/prisma-client';
import { AnalyticsCacheService } from './analytics-cache.service.js';

// Cache TTLs
const TTL = {
  LIGHT: 5 * 60,        // 5 minutes — simple counts
  MEDIUM: 60 * 60,      // 1 hour — groupBy, multi-table
  HEAVY: 24 * 60 * 60,  // 24 hours — raw SQL, cohorts
};

/**
 * Analytics service — computes all 40+ metrics from BACKOFFICE_ARCHITECTURE.md.
 * Every query is wrapped in Redis cache to protect the production DB.
 */
export class AnalyticsService {
  constructor(
    private prisma: PrismaClient,
    private cache: AnalyticsCacheService,
  ) {}

  // ===================== A. FINANCIAL (F1–F10) =====================

  /** F1, F2, F3, F4, F7, F10 */
  async getFinancialKpis() {
    return this.cache.getCached('financial:kpis', TTL.MEDIUM, async () => {
      const [revenueAgg, payingUsers, totalUsers, outstandingAgg, avgLifetime] = await Promise.all([
        // F1: Total Revenue
        this.prisma.transaction.aggregate({
          where: { type: 'purchase' },
          _sum: { amount: true },
        }),
        // F3: Paying users count
        this.prisma.transaction.findMany({
          where: { type: 'purchase' },
          distinct: ['userId'],
          select: { userId: true },
        }),
        // F7: Total users
        this.prisma.user.count(),
        // F10: Outstanding credits
        this.prisma.credit.aggregate({ _sum: { balance: true } }),
        // F4: Avg user lifetime
        this.prisma.$queryRaw<[{ avg_days: number }]>`
          SELECT EXTRACT(DAY FROM AVG(NOW() - created_at))::int AS avg_days
          FROM users WHERE is_active = true
        `,
      ]);

      const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
      const payingCount = payingUsers.length;
      const arpu = payingCount > 0 ? totalRevenue / payingCount : 0;
      const avgDays = avgLifetime[0]?.avg_days ?? 0;
      const ltv = arpu * (avgDays / 30); // ARPU × months

      return {
        totalRevenue,                                         // F1
        arpu: Math.round(arpu * 100) / 100,                  // F3
        ltv: Math.round(ltv * 100) / 100,                    // F4
        payingUserRatio: totalUsers > 0 ? Math.round((payingCount / totalUsers) * 10000) / 100 : 0, // F7
        outstandingCredits: Number(outstandingAgg._sum.balance ?? 0), // F10
        payingUsers: payingCount,
        totalUsers,
      };
    });
  }

  /** F2: Revenue by period (daily, last N days) */
  async getRevenueOverTime(days = 30) {
    return this.cache.getCached(`financial:revenue:${days}d`, TTL.MEDIUM, async () => {
      const result = await this.prisma.$queryRaw<Array<{ day: string; revenue: number; count: bigint }>>`
        SELECT DATE_TRUNC('day', created_at)::date AS day,
               SUM(amount)::float AS revenue,
               COUNT(*) AS count
        FROM transactions
        WHERE type = 'purchase' AND created_at >= NOW() - ${days + ' days'}::interval
        GROUP BY 1 ORDER BY 1
      `;
      return result.map((r) => ({ day: String(r.day), revenue: Number(r.revenue), count: Number(r.count) }));
    });
  }

  /** F5: Credit burn rate (last 24h) */
  async getCreditBurnRate() {
    return this.cache.getCached('financial:burn', TTL.LIGHT, async () => {
      const result = await this.prisma.transaction.aggregate({
        where: { type: 'spend', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        _sum: { amount: true },
        _count: true,
      });
      return { burnRate24h: Math.abs(Number(result._sum.amount ?? 0)), transactions: result._count };
    });
  }

  /** F6: Most popular packages */
  async getPopularPackages() {
    return this.cache.getCached('financial:packages', TTL.MEDIUM, async () => {
      const result = await this.prisma.transaction.groupBy({
        by: ['description'],
        where: { type: 'purchase' },
        _count: true,
        _sum: { amount: true },
        orderBy: { _count: { description: 'desc' } },
        take: 5,
      });
      return result.map((r) => ({ description: r.description, count: r._count, revenue: Number(r._sum.amount ?? 0) }));
    });
  }

  /** F8: Top referrers with ROI */
  async getReferralRoi(limit = 20) {
    return this.cache.getCached('financial:referrers', TTL.HEAVY, async () => {
      return this.prisma.$queryRaw<Array<{ telegram_id: string; referral_code: string; referrals: bigint; revenue: number }>>`
        SELECT u.telegram_id, u.referral_code,
               COUNT(r.id) AS referrals,
               COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'purchase'), 0)::float AS revenue
        FROM users u
        JOIN referrals r ON u.id = r.referrer_id
        LEFT JOIN transactions t ON r.referred_id = t.user_id
        GROUP BY u.id ORDER BY referrals DESC
        LIMIT ${limit}
      `;
    });
  }

  /** F9: Gift economy */
  async getGiftEconomy() {
    return this.cache.getCached('financial:gifts', TTL.MEDIUM, async () => {
      const result = await this.prisma.transaction.aggregate({
        where: { type: 'gift', amount: { gt: 0 } },
        _count: true,
        _sum: { amount: true },
      });
      return { giftCount: result._count, totalGifted: Number(result._sum.amount ?? 0) };
    });
  }

  // ===================== B. ENGAGEMENT (E1–E13) =====================

  /** E1–E6, E9 */
  async getEngagementKpis() {
    return this.cache.getCached('engagement:kpis', TTL.LIGHT, async () => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [totalUsers, dauList, wauList, mauList, avgMsgs, newToday] = await Promise.all([
        this.prisma.user.count(),                                         // E1
        this.prisma.conversation.findMany({ where: { startedAt: { gte: today } }, distinct: ['userId'], select: { userId: true } }),    // E2
        this.prisma.conversation.findMany({ where: { startedAt: { gte: weekAgo } }, distinct: ['userId'], select: { userId: true } }),  // E3
        this.prisma.conversation.findMany({ where: { startedAt: { gte: monthAgo } }, distinct: ['userId'], select: { userId: true } }), // E3
        this.prisma.conversation.aggregate({ where: { messageCount: { gt: 0 } }, _avg: { messageCount: true } }), // E5
        this.prisma.user.count({ where: { createdAt: { gte: today } } }),  // E9
      ]);

      const dau = dauList.length;
      const wau = wauList.length;
      const mau = mauList.length;

      return {
        totalUsers,                                           // E1
        dau,                                                  // E2
        wau, mau,                                             // E3
        stickiness: mau > 0 ? Math.round((dau / mau) * 10000) / 100 : 0, // E4
        avgMessagesPerSession: Math.round((avgMsgs._avg.messageCount ?? 0) * 100) / 100, // E5
        newUsersToday: newToday,                              // E9
      };
    });
  }

  /** E7 + E8: Onboarding funnel */
  async getOnboardingFunnel() {
    return this.cache.getCached('engagement:onboarding', TTL.MEDIUM, async () => {
      const [total, completed, dropoffs] = await Promise.all([
        this.prisma.onboardingState.count(),
        this.prisma.onboardingState.count({ where: { completedAt: { not: null } } }),
        this.prisma.onboardingState.groupBy({
          by: ['currentStep'],
          where: { completedAt: null },
          _count: true,
          orderBy: { currentStep: 'asc' },
        }),
      ]);

      return {
        completionRate: total > 0 ? Math.round((completed / total) * 10000) / 100 : 0,
        total,
        completed,
        dropoffs: dropoffs.map((d) => ({ step: d.currentStep, stuckUsers: d._count })),
      };
    });
  }

  /** E10 + E11: Retention cohorts */
  async getRetentionCohorts() {
    return this.cache.getCached('engagement:retention', TTL.HEAVY, async () => {
      return this.prisma.$queryRaw<Array<{ signup_week: string; cohort_size: bigint; retained_w1: bigint; retained_w4: bigint }>>`
        WITH cohort AS (
          SELECT id, DATE_TRUNC('week', created_at) AS signup_week FROM users
        ),
        activity AS (
          SELECT user_id, DATE_TRUNC('week', started_at) AS active_week FROM conversations
        )
        SELECT c.signup_week::date::text AS signup_week,
               COUNT(DISTINCT c.id) AS cohort_size,
               COUNT(DISTINCT CASE WHEN a.active_week = c.signup_week + INTERVAL '1 week' THEN c.id END) AS retained_w1,
               COUNT(DISTINCT CASE WHEN a.active_week = c.signup_week + INTERVAL '4 weeks' THEN c.id END) AS retained_w4
        FROM cohort c LEFT JOIN activity a ON c.id = a.user_id
        GROUP BY 1 ORDER BY 1 DESC LIMIT 12
      `;
    });
  }

  /** E12 + E13: Demographics */
  async getDemographics() {
    return this.cache.getCached('engagement:demographics', TTL.HEAVY, async () => {
      const [genders, ageBuckets] = await Promise.all([
        this.prisma.userProfile.groupBy({ by: ['gender'], _count: true }),
        this.prisma.$queryRaw<Array<{ bucket: string; count: bigint }>>`
          SELECT CASE
            WHEN age < 18 THEN '<18'
            WHEN age BETWEEN 18 AND 24 THEN '18-24'
            WHEN age BETWEEN 25 AND 34 THEN '25-34'
            WHEN age BETWEEN 35 AND 44 THEN '35-44'
            WHEN age >= 45 THEN '45+'
            ELSE 'unknown'
          END AS bucket, COUNT(*) AS count
          FROM user_profiles WHERE age IS NOT NULL GROUP BY 1 ORDER BY 1
        `,
      ]);

      return {
        genders: genders.map((g) => ({ gender: g.gender, count: g._count })),
        ageBuckets: ageBuckets.map((a) => ({ bucket: a.bucket, count: Number(a.count) })),
      };
    });
  }

  // ===================== C. AI ANALYTICS (C1–C11) =====================

  /** C1 + C2: Persona stats */
  async getPersonaStats() {
    return this.cache.getCached('ai:personas', TTL.MEDIUM, async () => {
      const [settings, conversations] = await Promise.all([
        this.prisma.userSettings.groupBy({ by: ['activeRole'], _count: true, orderBy: { _count: { activeRole: 'desc' } } }),
        this.prisma.conversation.groupBy({ by: ['roleUsed'], _count: true, orderBy: { _count: { roleUsed: 'desc' } } }),
      ]);

      return {
        settingsDistribution: settings.map((s) => ({ role: s.activeRole, count: s._count })),
        conversationUsage: conversations.map((c) => ({ role: c.roleUsed, count: c._count })),
      };
    });
  }

  /** C3–C6, C10–C11 */
  async getContentStats() {
    return this.cache.getCached('ai:content', TTL.MEDIUM, async () => {
      const [totalSettings, rudenessOn, formats, voiceUser, voiceBot, languages, avgFreeVoice] = await Promise.all([
        this.prisma.userSettings.count(),
        this.prisma.userSettings.count({ where: { nigarBlackRudenessEnabled: true } }),                         // C3
        this.prisma.userSettings.groupBy({ by: ['responseFormat'], _count: true }),                             // C4
        this.prisma.message.count({ where: { audioUrl: { not: null }, role: 'user' } }),                        // C5
        this.prisma.message.count({ where: { audioUrl: { not: null }, role: 'assistant' } }),                   // C6
        this.prisma.userSettings.groupBy({ by: ['language'], _count: true }),                                   // C10
        this.prisma.credit.aggregate({ _avg: { freeVoiceRemaining: true } }),                                   // C11
      ]);

      return {
        rudenessRate: totalSettings > 0 ? Math.round((rudenessOn / totalSettings) * 10000) / 100 : 0,
        formatDistribution: formats.map((f) => ({ format: f.responseFormat, count: f._count })),
        voiceMessagesSent: voiceUser,
        voiceRepliesGenerated: voiceBot,
        languageDistribution: languages.map((l) => ({ language: l.language, count: l._count })),
        avgFreeVoiceUsed: 3 - (avgFreeVoice._avg.freeVoiceRemaining ?? 3),
      };
    });
  }

  /** C7–C9: Token stats */
  async getTokenStats() {
    return this.cache.getCached('ai:tokens', TTL.MEDIUM, async () => {
      const [totalTokens, byProvider] = await Promise.all([
        this.prisma.message.aggregate({ where: { tokensUsed: { not: null } }, _sum: { tokensUsed: true } }),
        this.prisma.message.groupBy({
          by: ['llmProvider'],
          where: { llmProvider: { not: null } },
          _sum: { tokensUsed: true },
          _count: true,
        }),
      ]);

      return {
        totalTokens: totalTokens._sum.tokensUsed ?? 0,
        byProvider: byProvider.map((p) => ({
          provider: p.llmProvider,
          tokens: p._sum.tokensUsed ?? 0,
          messages: p._count,
        })),
      };
    });
  }

  // ===================== D. SAFETY (D1, D5) =====================

  async getSafetyStats() {
    return this.cache.getCached('safety:stats', TTL.LIGHT, async () => {
      const [total, unhandled, bySeverity, activeConvos] = await Promise.all([
        this.prisma.crisisEvent.count(),
        this.prisma.crisisEvent.count({ where: { handled: false } }),
        this.prisma.crisisEvent.groupBy({ by: ['severity'], _count: true }),
        this.prisma.conversation.count({
          where: { endedAt: null, startedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
        }),
      ]);

      return {
        totalCrises: total,
        unhandled,
        bySeverity: bySeverity.map((s) => ({ severity: s.severity, count: s._count })),
        activeConversations: activeConvos,
      };
    });
  }

  // ===================== ALL METRICS (for /admin/api/metrics) =====================

  async getAllMetrics() {
    const [financial, engagement, onboarding, personas, content, tokens, safety] = await Promise.all([
      this.getFinancialKpis(),
      this.getEngagementKpis(),
      this.getOnboardingFunnel(),
      this.getPersonaStats(),
      this.getContentStats(),
      this.getTokenStats(),
      this.getSafetyStats(),
    ]);

    return { financial, engagement, onboarding, personas, content, tokens, safety };
  }

  /** Warm up all caches (called by cron) */
  async warmUpAll() {
    console.log('[Analytics] Warming up all metrics...');
    const start = Date.now();
    await this.getAllMetrics();
    await this.getDemographics();
    await this.getRetentionCohorts();
    await this.getReferralRoi();
    await this.getRevenueOverTime();
    console.log(`[Analytics] Warm-up complete in ${Date.now() - start}ms`);
  }
}
