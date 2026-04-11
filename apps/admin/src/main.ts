/**
 * Nigar AI — Admin Panel (standalone ESM process)
 *
 * Completely isolated from the bot. Runs on its own port.
 * Uses AdminJS v7 (ESM) + Express + Prisma.
 *
 * Usage: node dist/main.js
 * Access: http://localhost:3001/admin
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import crypto from 'node:crypto';
import express from 'express';
import AdminJS, { ComponentLoader } from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import { Database, Resource, getModelByName } from '@adminjs/prisma';
import { PrismaClient } from '@nigar/prisma-client';
import { AnalyticsCacheService } from './services/analytics-cache.service.js';
import { AnalyticsService } from './services/analytics.service.js';

// Register Prisma adapter
AdminJS.registerAdapter({ Database, Resource });

// Component loader for custom dashboard
// Path must be absolute — AdminJS resolves relative to CWD, not module location
const componentLoader = new ComponentLoader();
// __dirname at runtime = apps/admin/dist/ → need to go to apps/admin/src/components/
const srcDir = path.resolve(__dirname, '../src');
const DashboardComponent = componentLoader.add('Dashboard', path.join(srcDir, 'components/Dashboard'));

const prisma = new PrismaClient();

// ===================== DECRYPTION =====================

function decryptContent(encoded: string): string {
  try {
    const hexKey = process.env.ENCRYPTION_KEY ?? '';
    const key = hexKey.length === 64
      ? Buffer.from(hexKey, 'hex')
      : crypto.createHash('sha256').update(hexKey).digest();

    const buf = Buffer.from(encoded, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return encoded; // Return raw if decryption fails (unencrypted or legacy data)
  }
}

/** AdminJS after hook — decrypts content field on all records */
function decryptHook(response: any) {
  if (response.record?.params?.content) {
    response.record.params.content = decryptContent(response.record.params.content);
  }
  if (response.records) {
    for (const rec of response.records) {
      if (rec.params?.content) {
        rec.params.content = decryptContent(rec.params.content);
      }
    }
  }
  return response;
}

// ===================== AUDIT LOGGING =====================

async function logAdminAction(action: string, targetId: string, details?: any) {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin';
  try {
    await prisma.adminAction.create({
      data: { adminEmail, action, targetId, details: details ?? undefined },
    });
  } catch (err) {
    console.error(`Failed to log admin action: ${(err as Error).message}`);
  }
}

// ===================== RESOURCES =====================

function buildResources() {
  const r = (
    modelName: string,
    listProperties: string[],
    opts: Record<string, any> = {},
  ) => ({
    resource: { model: getModelByName(modelName), client: prisma },
    options: { listProperties, ...opts },
  });

  return [
    // ===================== 👥 Users =====================
    r('User', ['telegramId', 'isActive', 'referralCode', 'createdAt'], {
      actions: {
        export: { isAccessible: true },

        // 🎁 Grant Credits
        grantCredits: {
          actionType: 'record',
          icon: 'Money',
          label: '🎁 Grant Credits',
          handler: async (request: any, response: any, context: any) => {
            const { record, currentAdmin } = context;
            if (request.method === 'post') {
              const amount = parseInt(request.payload?.amount ?? '0', 10);
              const description = request.payload?.description ?? 'Admin grant';

              if (amount <= 0) {
                return { record: record.toJSON(), notice: { message: 'Amount must be positive', type: 'error' } };
              }

              const userId = record.params.id;

              // Ensure credit record exists
              await prisma.credit.upsert({
                where: { userId },
                create: { userId },
                update: {},
              });

              // Add credits
              await prisma.credit.update({
                where: { userId },
                data: { balance: { increment: amount } },
              });

              // Transaction record
              await prisma.transaction.create({
                data: { userId, type: 'gift', amount, description: `[Admin] ${description}` },
              });

              await logAdminAction('grant_credits', userId, { amount, description });

              return {
                record: record.toJSON(),
                notice: { message: `✅ Granted ${amount} credits`, type: 'success' },
              };
            }
            return { record: record.toJSON() };
          },
          component: false,
        },

        // 🚫 Ban / Unban
        toggleBan: {
          actionType: 'record',
          icon: 'Lock',
          label: '🚫 Ban/Unban',
          handler: async (_request: any, _response: any, context: any) => {
            const { record } = context;
            const userId = record.params.id;
            const currentlyActive = record.params.isActive;

            await prisma.user.update({
              where: { id: userId },
              data: { isActive: !currentlyActive },
            });

            await logAdminAction(currentlyActive ? 'ban_user' : 'unban_user', userId);

            return {
              record: { ...record.toJSON(), params: { ...record.params, isActive: !currentlyActive } },
              notice: {
                message: currentlyActive ? '🚫 User banned' : '✅ User unbanned',
                type: 'success',
              },
            };
          },
          component: false,
          guard: 'Are you sure you want to toggle this user\'s access?',
        },

        // 🔄 Reset Onboarding
        resetOnboarding: {
          actionType: 'record',
          icon: 'Reset',
          label: '🔄 Reset Onboarding',
          handler: async (_request: any, _response: any, context: any) => {
            const { record } = context;
            const userId = record.params.id;

            await prisma.onboardingState.deleteMany({ where: { userId } });
            await prisma.userProfile.updateMany({
              where: { userId },
              data: { onboardingCompleted: false },
            });

            await logAdminAction('reset_onboarding', userId);

            return {
              record: record.toJSON(),
              notice: { message: '✅ Onboarding reset — user can /start again', type: 'success' },
            };
          },
          component: false,
          guard: 'This will delete the user\'s onboarding progress. Continue?',
        },
      },
      navigation: { name: '👥 Users', icon: 'User' },
    }),

    r('UserProfile', ['name', 'gender', 'age', 'onboardingCompleted'], {
      navigation: { name: '👥 Users', icon: 'User' },
    }),
    r('UserSettings', ['activeRole', 'responseFormat', 'nigarBlackRudenessEnabled', 'language'], {
      navigation: { name: '👥 Users', icon: 'User' },
    }),
    r('Referral', ['referrerId', 'referredId', 'bonusCredited', 'createdAt'], {
      actions: { new: { isAccessible: false }, edit: { isAccessible: false }, delete: { isAccessible: false } },
      navigation: { name: '👥 Users', icon: 'User' },
    }),

    // ===================== 💰 Billing =====================
    r('Credit', ['balance', 'freeVoiceRemaining', 'totalPurchased', 'totalSpent'], {
      navigation: { name: '💰 Billing', icon: 'Money' },
    }),
    r('Transaction', ['type', 'amount', 'description', 'createdAt'], {
      actions: {
        export: { isAccessible: true },
        new: { isAccessible: false },
        edit: { isAccessible: false },
        delete: { isAccessible: false },
      },
      navigation: { name: '💰 Billing', icon: 'Money' },
    }),

    // ===================== 💬 Chats =====================
    r('Conversation', ['roleUsed', 'messageCount', 'startedAt', 'endedAt'], {
      actions: {
        // 💬 View Chat — decrypted conversation viewer
        viewChat: {
          actionType: 'record',
          icon: 'View',
          label: '💬 View Chat',
          handler: async (_request: any, _response: any, context: any) => {
            const { record } = context;
            const conversationId = record.params.id;

            const messages = await prisma.message.findMany({
              where: { conversationId },
              orderBy: { createdAt: 'asc' },
              select: { role: true, content: true, createdAt: true, llmProvider: true },
            });

            const decryptedChat = messages.map((m) => ({
              role: m.role,
              content: decryptContent(m.content),
              time: m.createdAt.toLocaleString('az-AZ'),
              provider: m.llmProvider,
            }));

            // Format as readable text
            const chatText = decryptedChat.map((m) => {
              const icon = m.role === 'user' ? '👤 User' : '🤖 Nigar';
              const provider = m.role === 'assistant' && m.provider ? ` [${m.provider}]` : '';
              return `${icon}${provider} (${m.time}):\n${m.content}`;
            }).join('\n\n---\n\n');

            // Store in record params for display
            const updatedRecord = record.toJSON();
            updatedRecord.params.chatHistory = chatText || 'No messages in this conversation.';

            return { record: updatedRecord };
          },
          component: false,
        },
      },
      properties: {
        chatHistory: {
          isVisible: { list: false, show: true, edit: false, filter: false },
          type: 'textarea',
        },
      },
      navigation: { name: '💬 Chats', icon: 'Chat' },
    }),

    r('Message', ['role', 'content', 'llmProvider', 'tokensUsed', 'createdAt'], {
      properties: {
        content: {
          isVisible: { list: true, show: true, edit: false, filter: false },
          type: 'textarea',
        },
      },
      actions: {
        list: { after: [decryptHook] },
        show: { after: [decryptHook] },
        new: { isAccessible: false },
        edit: { isAccessible: false },
        delete: { isAccessible: false },
      },
      navigation: { name: '💬 Chats', icon: 'Chat' },
    }),

    // ===================== 📋 Onboarding =====================
    r('OnboardingState', ['currentStep', 'privacyAccepted', 'completedAt'], {
      navigation: { name: '📋 Onboarding', icon: 'Document' },
    }),

    // ===================== 🆘 Safety =====================
    r('CrisisEvent', ['severity', 'keywords', 'handled', 'createdAt'], {
      actions: {
        export: { isAccessible: true },
        new: { isAccessible: false },
        delete: { isAccessible: false },

        // ✅ Mark Crisis Handled
        markHandled: {
          actionType: 'record',
          icon: 'Check',
          label: '✅ Mark Handled',
          handler: async (_request: any, _response: any, context: any) => {
            const { record } = context;
            const crisisId = record.params.id;

            await prisma.crisisEvent.update({
              where: { id: crisisId },
              data: { handled: true },
            });

            await logAdminAction('handle_crisis', crisisId, {
              severity: record.params.severity,
              userId: record.params.userId,
            });

            return {
              record: { ...record.toJSON(), params: { ...record.params, handled: true } },
              notice: { message: '✅ Crisis marked as handled', type: 'success' },
            };
          },
          component: false,
          guard: 'Mark this crisis event as handled?',
        },
      },
      navigation: { name: '🆘 Safety', icon: 'Alert' },
    }),

    // ===================== ⚙️ Admin =====================
    r('AdminAction', ['adminEmail', 'action', 'targetId', 'createdAt'], {
      actions: {
        new: { isAccessible: false },
        edit: { isAccessible: false },
        delete: { isAccessible: false },
      },
      navigation: { name: '⚙️ Admin', icon: 'Settings' },
    }),
  ];
}

// ===================== BOOTSTRAP =====================

async function bootstrap() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@nigar.ai';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin';
  const sessionSecret = process.env.ENCRYPTION_KEY ?? 'change-this-secret-in-production-32chars!!';
  const port = parseInt(process.env.ADMIN_PORT ?? '3001', 10);

  const admin = new AdminJS({
    rootPath: '/admin',
    resources: buildResources(),
    componentLoader,
    dashboard: {
      component: DashboardComponent,
    },
    branding: {
      companyName: 'Nigar AI — Admin',
      logo: false,
      withMadeWithLove: false,
    },
  });

  const router = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email: string, password: string) => {
        if (email === adminEmail && password === adminPassword) {
          return { email };
        }
        return null;
      },
      cookieName: 'nigar-admin',
      cookiePassword: sessionSecret,
    },
    null,
    {
      resave: false,
      saveUninitialized: false,
      secret: sessionSecret,
    },
  );

  // ===================== ANALYTICS =====================
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const cacheService = new AnalyticsCacheService(redisUrl);
  const analytics = new AnalyticsService(prisma, cacheService);

  const app = express();

  // Initialize AdminJS (bundles custom components)
  await admin.initialize();

  // JSON parsing for API routes
  app.use(express.json());

  // Metrics API endpoints (no AdminJS auth — protected by separate session)
  app.get('/admin/api/metrics', async (_req, res) => {
    try { res.json(await analytics.getAllMetrics()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/revenue', async (req, res) => {
    try { res.json(await analytics.getRevenueOverTime(parseInt(req.query.days as string) || 30)); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/retention', async (_req, res) => {
    try { res.json(await analytics.getRetentionCohorts()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/referrers', async (req, res) => {
    try { res.json(await analytics.getReferralRoi(parseInt(req.query.limit as string) || 20)); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/demographics', async (_req, res) => {
    try { res.json(await analytics.getDemographics()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.post('/admin/api/metrics/refresh', async (_req, res) => {
    try {
      await cacheService.invalidateAll();
      await analytics.warmUpAll();
      res.json({ message: 'All metrics refreshed' });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Individual metric endpoints
  app.get('/admin/api/metrics/kpi', async (_req, res) => {
    try {
      const [financial, engagement, onboarding] = await Promise.all([
        analytics.getFinancialKpis(),
        analytics.getEngagementKpis(),
        analytics.getOnboardingFunnel(),
      ]);
      res.json({
        totalUsers: engagement.totalUsers,
        dau: engagement.dau,
        wau: engagement.wau,
        mau: engagement.mau,
        stickiness: engagement.stickiness,
        revenue: financial.totalRevenue,
        arpu: financial.arpu,
        ltv: financial.ltv,
        onboardingRate: onboarding.completionRate,
        payingRatio: financial.payingUserRatio,
        newUsersToday: engagement.newUsersToday,
        avgMessagesPerSession: engagement.avgMessagesPerSession,
      });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/personas', async (_req, res) => {
    try { res.json(await analytics.getPersonaStats()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/onboarding', async (_req, res) => {
    try { res.json(await analytics.getOnboardingFunnel()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/providers', async (_req, res) => {
    try { res.json(await analytics.getTokenStats()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/safety', async (_req, res) => {
    try { res.json(await analytics.getSafetyStats()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/content', async (_req, res) => {
    try { res.json(await analytics.getContentStats()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
  app.get('/admin/api/metrics/burn', async (_req, res) => {
    try { res.json(await analytics.getCreditBurnRate()); }
    catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // AdminJS routes
  app.use(admin.options.rootPath, router);

  // ===================== CRON JOBS =====================
  const cron = await import('node-cron');

  // Hourly: medium-weight metrics (revenue, personas, content)
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Hourly metrics refresh...');
    try {
      await cacheService.invalidate('financial:kpis');
      await cacheService.invalidate('ai:personas');
      await cacheService.invalidate('ai:content');
      await cacheService.invalidate('ai:tokens');
      await cacheService.invalidate('engagement:onboarding');
      await analytics.getFinancialKpis();
      await analytics.getPersonaStats();
      await analytics.getContentStats();
      await analytics.getTokenStats();
      await analytics.getOnboardingFunnel();
      console.log('[Cron] Hourly refresh done');
    } catch (err) { console.error('[Cron] Hourly refresh failed:', (err as Error).message); }
  });

  // Daily 3 AM: heavy metrics (retention, demographics, referral ROI)
  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Daily heavy metrics refresh...');
    try {
      await cacheService.invalidate('engagement:retention');
      await cacheService.invalidate('engagement:demographics');
      await cacheService.invalidate('financial:referrers');
      await analytics.getRetentionCohorts();
      await analytics.getDemographics();
      await analytics.getReferralRoi();
      console.log('[Cron] Daily refresh done');
    } catch (err) { console.error('[Cron] Daily refresh failed:', (err as Error).message); }
  });

  app.listen(port, async () => {
    console.log(`🔧 Nigar AI Admin Panel: http://localhost:${port}/admin`);
    console.log(`📊 Metrics API: http://localhost:${port}/admin/api/metrics`);
    console.log(`   Login: ${adminEmail}`);

    // Initial warm-up
    try { await analytics.warmUpAll(); }
    catch (err) { console.error('[Analytics] Initial warm-up failed:', (err as Error).message); }
  });
}

bootstrap().catch((err) => {
  console.error('Admin panel failed to start:', err);
  process.exit(1);
});
