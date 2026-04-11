/**
 * Admin Panel — standalone Express server with AdminJS.
 * Completely separate from the bot process.
 *
 * Usage: node dist/admin-entry.js
 * Access: http://localhost:3001/admin
 */
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

import express from 'express';
import session from 'express-session';
import { PrismaClient } from '@nigar/prisma-client';

/* eslint-disable @typescript-eslint/no-var-requires */
const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const AdminJSPrisma = require('@adminjs/prisma');
/* eslint-enable */

const { Database, Resource, getModelByName } = AdminJSPrisma;
AdminJS.registerAdapter({ Database, Resource });

const prisma = new PrismaClient();

// ===================== RESOURCE CONFIG =====================

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
    r('User', ['telegramId', 'isActive', 'referralCode', 'createdAt'], {
      actions: { export: { isAccessible: true } },
      navigation: { name: '👥 Users', icon: 'User' },
    }),
    r('UserProfile', ['name', 'gender', 'age', 'onboardingCompleted'], {
      navigation: { name: '👥 Users', icon: 'User' },
    }),
    r('UserSettings', ['activeRole', 'responseFormat', 'nigarBlackRudenessEnabled', 'language'], {
      navigation: { name: '👥 Users', icon: 'User' },
    }),
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
    r('Conversation', ['roleUsed', 'messageCount', 'startedAt', 'endedAt'], {
      navigation: { name: '💬 Chats', icon: 'Chat' },
    }),
    r('Message', ['role', 'llmProvider', 'tokensUsed', 'createdAt'], {
      properties: {
        content: { isVisible: { list: false, show: false, edit: false, filter: false } },
      },
      actions: {
        new: { isAccessible: false },
        edit: { isAccessible: false },
        delete: { isAccessible: false },
      },
      navigation: { name: '💬 Chats', icon: 'Chat' },
    }),
    r('Referral', ['referrerId', 'referredId', 'bonusCredited', 'createdAt'], {
      actions: { new: { isAccessible: false }, edit: { isAccessible: false }, delete: { isAccessible: false } },
      navigation: { name: '👥 Users', icon: 'User' },
    }),
    r('OnboardingState', ['currentStep', 'privacyAccepted', 'completedAt'], {
      navigation: { name: '📋 Onboarding', icon: 'Document' },
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
    branding: {
      companyName: 'Nigar AI — Admin',
      logo: false,
      softwareBrothers: false,
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
    null, // no custom router
    {
      resave: false,
      saveUninitialized: false,
      secret: sessionSecret,
    },
  );

  const app = express();
  app.use(admin.options.rootPath, router);

  app.listen(port, () => {
    console.log(`🔧 Nigar AI Admin Panel: http://localhost:${port}/admin`);
    console.log(`   Login: ${adminEmail}`);
  });
}

bootstrap().catch((err) => {
  console.error('Admin panel failed to start:', err);
  process.exit(1);
});
