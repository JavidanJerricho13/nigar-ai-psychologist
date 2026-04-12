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
import AdminJS from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import { Database, Resource, getModelByName } from '@adminjs/prisma';
import { PrismaClient } from '@nigar/prisma-client';
import { AnalyticsCacheService } from './services/analytics-cache.service.js';
import { AnalyticsService } from './services/analytics.service.js';
import { MailerService } from './services/mailer.service.js';
import { WeeklyReportService } from './services/weekly-report.service.js';

// Register Prisma adapter
AdminJS.registerAdapter({ Database, Resource });

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
      // 6.5 — Highlight unhandled rows. AdminJS list view doesn't support per-row
      // CSS, but we can rewrite the displayed severity value with a 🆘 URGENT prefix
      // so unhandled events visually pop off the page.
      properties: {
        severity: {
          isVisible: { list: true, show: true, edit: false, filter: true },
        },
      },
      actions: {
        export: { isAccessible: true },
        new: { isAccessible: false },
        delete: { isAccessible: false },
        list: {
          after: [
            (response: any) => {
              if (Array.isArray(response.records)) {
                for (const rec of response.records) {
                  const handled = rec.params?.handled;
                  if (handled === false || handled === 'false') {
                    const sev = rec.params.severity ?? 'unknown';
                    rec.params.severity = `🆘 URGENT — ${sev}`;
                  }
                }
              }
              return response;
            },
          ],
        },

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
    // dashboard: custom HTML served at /admin/dashboard
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
  const mailer = new MailerService();
  const weeklyReport = new WeeklyReportService(analytics, mailer);

  const app = express();

  // Note: AdminJS ComponentLoader bundling is unreliable in v7.
  // Custom dashboard served as standalone HTML at /admin/dashboard instead.

  // JSON parsing for API routes
  app.use(express.json());

  // ===================== STANDALONE DASHBOARD =====================
  app.get('/admin/dashboard', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nigar AI — Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f6fa; color: #333; }
    .header { background: #c0392b; color: white; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 20px; }
    .header a { color: white; text-decoration: none; opacity: 0.8; }
    .container { max-width: 1200px; margin: 24px auto; padding: 0 24px; }
    .alert { background: #e74c3c; color: white; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); text-align: center; }
    .card .icon { font-size: 28px; margin-bottom: 8px; }
    .card .value { font-size: 28px; font-weight: 700; color: #2c3e50; }
    .card .label { font-size: 13px; color: #95a5a6; margin-top: 4px; }
    .section { background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
    .section h3 { margin-bottom: 16px; color: #2c3e50; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #ecf0f1; }
    th { font-weight: 600; color: #7f8c8d; font-size: 12px; text-transform: uppercase; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-red { background: #fde8e8; color: #e74c3c; }
    .badge-green { background: #e8f8e8; color: #27ae60; }
    .links a { display: inline-block; margin: 4px 8px 4px 0; padding: 6px 12px; background: #ecf0f1; border-radius: 6px; text-decoration: none; color: #2c3e50; font-size: 13px; }
    .links a:hover { background: #d5dbdb; }
    .refresh-btn { background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .refresh-btn:hover { background: #2980b9; }
    #loading { text-align: center; padding: 40px; color: #95a5a6; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Nigar AI Dashboard</h1>
    <div><a href="/admin">← Admin Panel</a> &nbsp; <button class="refresh-btn" onclick="refresh()">🔄 Refresh</button></div>
  </div>
  <div class="container">
    <div id="alert"></div>
    <div id="loading">Loading metrics...</div>
    <div id="content" style="display:none">
      <div class="grid" id="kpi-cards"></div>
      <div class="section" id="providers-section"></div>
      <div class="section" id="personas-section"></div>
      <div class="section" id="onboarding-section"></div>
      <div class="section">
        <h3>📋 API Endpoints</h3>
        <div class="links">
          <a href="/admin/api/metrics">/metrics (all)</a>
          <a href="/admin/api/metrics/kpi">/kpi</a>
          <a href="/admin/api/metrics/revenue">/revenue</a>
          <a href="/admin/api/metrics/retention">/retention</a>
          <a href="/admin/api/metrics/personas">/personas</a>
          <a href="/admin/api/metrics/onboarding">/onboarding</a>
          <a href="/admin/api/metrics/providers">/providers</a>
          <a href="/admin/api/metrics/safety">/safety</a>
          <a href="/admin/api/metrics/demographics">/demographics</a>
          <a href="/admin/api/metrics/content">/content</a>
        </div>
      </div>
    </div>
  </div>
  <script>
    function card(icon, label, value) {
      return '<div class="card"><div class="icon">' + icon + '</div><div class="value">' + value + '</div><div class="label">' + label + '</div></div>';
    }
    async function load() {
      try {
        const [kpi, safety, tokens, personas, onboarding] = await Promise.all([
          fetch('/admin/api/metrics/kpi').then(r => r.json()),
          fetch('/admin/api/metrics/safety').then(r => r.json()),
          fetch('/admin/api/metrics/providers').then(r => r.json()),
          fetch('/admin/api/metrics/personas').then(r => r.json()),
          fetch('/admin/api/metrics/onboarding').then(r => r.json()),
        ]);
        // Alert
        if (safety.unhandled > 0) {
          document.getElementById('alert').innerHTML = '<div class="alert">🆘 ' + safety.unhandled + ' unhandled crisis event(s)!</div>';
        }
        // KPI Cards
        document.getElementById('kpi-cards').innerHTML =
          card('👥', 'Total Users', kpi.totalUsers) +
          card('📈', 'DAU', kpi.dau) +
          card('📊', 'MAU', kpi.mau) +
          card('🔄', 'Stickiness', kpi.stickiness + '%') +
          card('💰', 'Revenue', kpi.revenue + ' AZN') +
          card('💳', 'ARPU', kpi.arpu + ' AZN') +
          card('✅', 'Onboarding', kpi.onboardingRate + '%') +
          card('💎', 'Paying', kpi.payingRatio + '%') +
          card('🆕', 'New Today', kpi.newUsersToday) +
          card('💬', 'Msgs/Session', kpi.avgMessagesPerSession) +
          card('🔥', 'Active Convos', safety.activeConversations) +
          card('🧠', 'Tokens', tokens.totalTokens.toLocaleString());
        // Providers
        var provRows = tokens.byProvider.map(function(p) {
          return '<tr><td><strong>' + p.provider + '</strong></td><td>' + p.tokens.toLocaleString() + '</td><td>' + p.messages + '</td></tr>';
        }).join('');
        document.getElementById('providers-section').innerHTML = '<h3>🤖 LLM Providers</h3><table><thead><tr><th>Provider</th><th>Tokens</th><th>Messages</th></tr></thead><tbody>' + provRows + '</tbody></table>';
        // Personas
        var roleRows = personas.settingsDistribution.map(function(r) {
          var convos = personas.conversationUsage.find(function(c) { return c.role === r.role; });
          return '<tr><td><strong>' + r.role + '</strong></td><td>' + r.count + '</td><td>' + (convos ? convos.count : 0) + '</td></tr>';
        }).join('');
        document.getElementById('personas-section').innerHTML = '<h3>🎭 Persona Distribution</h3><table><thead><tr><th>Role</th><th>Users</th><th>Conversations</th></tr></thead><tbody>' + roleRows + '</tbody></table>';
        // Onboarding
        var dropRows = onboarding.dropoffs.map(function(d) {
          return '<tr><td>Step ' + d.step + '</td><td>' + d.stuckUsers + '</td></tr>';
        }).join('');
        document.getElementById('onboarding-section').innerHTML = '<h3>📋 Onboarding Funnel</h3><p>Completion: <strong>' + onboarding.completionRate + '%</strong> (' + onboarding.completed + '/' + onboarding.total + ')</p>' + (dropRows ? '<table><thead><tr><th>Step</th><th>Stuck Users</th></tr></thead><tbody>' + dropRows + '</tbody></table>' : '<p>No drop-offs!</p>');
        // Show
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
      } catch(e) {
        document.getElementById('loading').innerHTML = '<div class="alert">Error: ' + e.message + '</div>';
      }
    }
    async function refresh() {
      document.getElementById('loading').style.display = 'block';
      document.getElementById('content').style.display = 'none';
      await fetch('/admin/api/metrics/refresh', { method: 'POST' });
      await load();
    }
    load();
  </script>
</body>
</html>`);
  });

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
  // 6.2 — Manual trigger for the weekly report (verification / on-demand)
  app.post('/admin/api/reports/weekly', async (req, res) => {
    try {
      const to = (req.query.to as string) ?? undefined;
      const sent = await weeklyReport.runManually(to);
      res.json({
        sent,
        mailerEnabled: (mailer as any).isEnabled ?? false,
        message: sent
          ? 'Weekly report sent'
          : 'Mailer disabled or no recipient — see SMTP_* / REPORT_EMAIL_TO env vars',
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
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

  // 6.2 — Weekly KPI report (every Monday at 10:00 server time)
  cron.schedule('0 10 * * 1', async () => {
    console.log('[Cron] Weekly KPI report — building & sending...');
    try {
      const sent = await weeklyReport.runManually();
      console.log(`[Cron] Weekly KPI report ${sent ? 'sent' : 'skipped'}`);
    } catch (err) {
      console.error('[Cron] Weekly KPI report failed:', (err as Error).message);
    }
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
