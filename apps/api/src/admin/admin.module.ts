import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../shared/prisma/prisma.service';

/* eslint-disable @typescript-eslint/no-var-requires */
const { AdminModule: AdminJSModule } = require('@adminjs/nestjs');
const AdminJS = require('adminjs');
const AdminJSPrisma = require('@adminjs/prisma');
/* eslint-enable */

const { Database, Resource, getModelByName } = AdminJSPrisma;

// Register Prisma adapter
AdminJS.registerAdapter({ Database, Resource });

const DEFAULT_ADMIN = {
  email: 'admin@nigar.ai',
  password: 'admin',
};

@Module({
  imports: [
    AdminJSModule.createAdminAsync({
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const adminEmail = config.get<string>('ADMIN_EMAIL', DEFAULT_ADMIN.email);
        const adminPassword = config.get<string>('ADMIN_PASSWORD', DEFAULT_ADMIN.password);

        const dmmf = (prisma as any)._baseDmmf ?? (prisma as any)._dmmf;

        // Helper to create resource config
        const resource = (
          modelName: string,
          listProperties: string[],
          options: Record<string, any> = {},
        ) => ({
          resource: { model: getModelByName(modelName), client: prisma },
          options: {
            listProperties,
            ...options,
          },
        });

        return {
          adminJsOptions: {
            rootPath: '/admin',
            branding: {
              companyName: 'Nigar AI',
              logo: false,
              softwareBrothers: false,
            },
            resources: [
              // Users
              resource('User', ['telegramId', 'isActive', 'referralCode', 'createdAt'], {
                actions: {
                  export: { isAccessible: true },
                },
                navigation: { name: '👥 Users', icon: 'User' },
              }),

              // UserProfiles
              resource('UserProfile', ['name', 'gender', 'age', 'onboardingCompleted'], {
                navigation: { name: '👥 Users', icon: 'User' },
              }),

              // UserSettings
              resource('UserSettings', ['activeRole', 'responseFormat', 'nigarBlackRudenessEnabled', 'language'], {
                navigation: { name: '👥 Users', icon: 'User' },
              }),

              // Credits
              resource('Credit', ['balance', 'freeVoiceRemaining', 'totalPurchased', 'totalSpent'], {
                navigation: { name: '💰 Billing', icon: 'Money' },
              }),

              // Transactions
              resource('Transaction', ['type', 'amount', 'description', 'createdAt'], {
                actions: {
                  export: { isAccessible: true },
                  new: { isAccessible: false },
                  edit: { isAccessible: false },
                  delete: { isAccessible: false },
                },
                navigation: { name: '💰 Billing', icon: 'Money' },
              }),

              // Conversations
              resource('Conversation', ['roleUsed', 'messageCount', 'startedAt', 'endedAt'], {
                navigation: { name: '💬 Chats', icon: 'Chat' },
              }),

              // Messages (content hidden — encrypted)
              resource('Message', ['role', 'llmProvider', 'tokensUsed', 'createdAt'], {
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

              // Referrals
              resource('Referral', ['referrerId', 'referredId', 'bonusCredited', 'createdAt'], {
                actions: {
                  new: { isAccessible: false },
                  edit: { isAccessible: false },
                  delete: { isAccessible: false },
                },
                navigation: { name: '👥 Users', icon: 'User' },
              }),

              // OnboardingStates
              resource('OnboardingState', ['currentStep', 'privacyAccepted', 'completedAt'], {
                navigation: { name: '📋 Onboarding', icon: 'Document' },
              }),
            ],
          },
          auth: {
            authenticate: async (email: string, password: string) => {
              if (email === adminEmail && password === adminPassword) {
                return { email: adminEmail };
              }
              return null;
            },
            cookieName: 'nigar-admin',
            cookiePassword: config.get<string>(
              'encryption.key',
              'super-secret-session-key-change-me-in-production-32chars!!',
            ),
          },
          sessionOptions: {
            resave: false,
            saveUninitialized: false,
            secret: config.get<string>(
              'encryption.key',
              'super-secret-session-key-change-me-in-production-32chars!!',
            ),
          },
        };
      },
      inject: [ConfigService, PrismaService],
    }),
  ],
})
export class AdminPanelModule {}
