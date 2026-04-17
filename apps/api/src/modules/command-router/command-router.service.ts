import { Injectable, Logger } from '@nestjs/common';
import { CommandRequest, CommandResponse } from './domain/command.interfaces';
import { COMMAND_MAP, COMMAND_REGISTRY, CommandDefinition } from './domain/command.registry';
import { UnknownCommandException } from './domain/command.exceptions';
import { AdvanceStepUseCase } from '../onboarding/domain/use-cases/advance-step.use-case';
import { GetOnboardingStatusUseCase } from '../onboarding/domain/use-cases/get-onboarding-status.use-case';
import { IdentifyUserUseCase } from '../user/domain/use-cases/identify-user.use-case';
import { GetUserFullProfileUseCase } from '../user/domain/use-cases/get-user-full-profile.use-case';
import { UpdateSettingsUseCase } from '../user/domain/use-cases/update-settings.use-case';
import { UpdateProfileUseCase } from '../user/domain/use-cases/update-profile.use-case';
import { GetBalanceUseCase } from '../billing/domain/use-cases/get-balance.use-case';
import { GetReferralInfoUseCase } from '../referral/domain/use-cases/get-referral-info.use-case';
import { ApplyReferralUseCase } from '../referral/domain/use-cases/apply-referral.use-case';
import { SendMessageUseCase } from '../chat/domain/use-cases/send-message.use-case';
import { SynthesizeSpeechUseCase } from '../audio/domain/use-cases/synthesize-speech.use-case';
import { GetTransactionHistoryUseCase } from '../billing/domain/use-cases/get-transaction-history.use-case';
import { StripeAdapter, CREDIT_PACKAGES } from '../billing/infrastructure/adapters/stripe.adapter';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { SessionService } from '../../shared/redis/session.service';
import { SessionSummaryService } from '../memory/domain/services/session-summary.service';
import { TherapeuticProfileService } from '../memory/domain/services/therapeutic-profile.service';
import { SummaryProducer } from '../memory/infrastructure/queues/summary.producer';
import { MoodExtractionService } from '../memory/domain/services/mood-extraction.service';
import { StreakService } from '../memory/domain/services/streak.service';
import { OutreachProducer } from '../outreach/infrastructure/queues/outreach.producer';
import { SubscriptionService, SUBSCRIPTION_PLANS } from '../billing/domain/services/subscription.service';
import { ShadowReferralService } from '../referral/domain/services/shadow-referral.service';
import { WisdomCardService } from '../referral/domain/services/wisdom-card.service';
import { ActiveRole, ResponseFormat, SubscriptionTier } from '@nigar/shared-types';
import type { StepOutput, UserInput } from '@nigar/shared-types';

@Injectable()
export class CommandRouterService {
  private readonly logger = new Logger(CommandRouterService.name);

  constructor(
    private readonly advanceStep: AdvanceStepUseCase,
    private readonly getOnboardingStatus: GetOnboardingStatusUseCase,
    private readonly identifyUser: IdentifyUserUseCase,
    private readonly getFullProfile: GetUserFullProfileUseCase,
    private readonly updateSettings: UpdateSettingsUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly getBalance: GetBalanceUseCase,
    private readonly getReferralInfo: GetReferralInfoUseCase,
    private readonly applyReferral: ApplyReferralUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly synthesizeSpeech: SynthesizeSpeechUseCase,
    private readonly getTransactionHistory: GetTransactionHistoryUseCase,
    private readonly stripeAdapter: StripeAdapter,
    private readonly prisma: PrismaService,
    private readonly session: SessionService,
    private readonly summaryService: SessionSummaryService,
    private readonly profileService: TherapeuticProfileService,
    private readonly summaryProducer: SummaryProducer,
    private readonly moodService: MoodExtractionService,
    private readonly streakService: StreakService,
    private readonly outreachProducer: OutreachProducer,
    private readonly subscriptionService: SubscriptionService,
    private readonly shadowReferral: ShadowReferralService,
    private readonly wisdomCard: WisdomCardService,
  ) {}

  async dispatch(request: CommandRequest): Promise<CommandResponse> {
    const startTime = Date.now();

    try {
      // 1. Ensure user exists
      const { user, isNew } = await this.identifyUser.execute({
        telegramId: request.telegramId ?? request.userId,
        referralCode: request.deepLinkParam,
      });
      const userId = user.id;

      // 1b. Apply referral or anonymous gift if new user arrived via deep link
      if (isNew && request.deepLinkParam) {
        const param = request.deepLinkParam;
        if (param.startsWith('gift_')) {
          // Anonymous gift invite
          try {
            await this.shadowReferral.claimInvite(param.slice(5), userId);
            this.logger.log(`Anonymous gift claimed for new user ${userId.slice(0, 8)}`);
          } catch { /* non-critical */ }
        } else {
          // Standard referral code
          try {
            await this.applyReferral.execute({
              referredUserId: userId,
              referralCode: param,
            });
            this.logger.log(`Referral applied for new user ${userId.slice(0, 8)}`);
          } catch { /* non-critical */ }
        }
      }

      // 2. Check onboarding status
      const onboardingStatus = await this.getOnboardingStatus.execute(userId);
      const isInOnboarding = !onboardingStatus.completed && onboardingStatus.currentStep !== null;

      // 3. Parse command
      const command = this.parseCommand(request.command);

      // 4. CRITICAL: If in onboarding, route non-command input to FSM
      if (isInOnboarding || isNew) {
        if (!command) {
          // Free text/callback during onboarding → FSM
          return this.handleOnboarding(userId, request);
        }

        const def = COMMAND_MAP.get(command);
        if (def && !def.availableDuringOnboarding) {
          // Command not available during onboarding
          return this.buildResponse({
            text: '⏳ Əvvəlcə tanışlığı tamamla, sonra bu əmrdən istifadə edə bilərsən.',
            inputType: 'text',
          }, true);
        }

        if (command === 'start') {
          return this.handleOnboarding(userId, request);
        }
      }

      // 5. If no command and not in onboarding → check for prefixed callbacks or chat
      if (!command) {
        const payload = request.payload ?? '';

        // Role switch callback: "role:nigar_black"
        if (payload.startsWith('role:')) {
          return this.handleRoleSwitch(userId, payload.slice(5));
        }

        // Rudeness toggle callback: "toggle:rudeness:on" / "toggle:rudeness:off"
        if (payload.startsWith('toggle:rudeness:')) {
          return this.handleRudenessToggle(userId, payload.slice(16));
        }

        // Topic selection callback: "topic:stress"
        if (payload.startsWith('topic:')) {
          return this.handleTopicSelected(userId, payload.slice(6));
        }

        // Payment package callback: "pay:pack_10"
        if (payload.startsWith('pay:')) {
          return this.handlePayCallback(userId, payload.slice(4));
        }

        // Subscription callback: "sub:premium" / "sub:premium_plus"
        if (payload.startsWith('sub:')) {
          return this.handleSubCallback(userId, payload.slice(4));
        }

        // Wisdom card callback: "wisdom_card"
        if (payload === 'wisdom_card') {
          return this.handleWisdomCard(userId);
        }

        // Command redirect callback: "cmd:roles" / "cmd:format"
        if (payload.startsWith('cmd:')) {
          const redirectCmd = payload.slice(4);
          return this.routeCommand(redirectCmd, userId, request);
        }

        // "hide" button — just acknowledge silently
        if (payload === 'hide') {
          return this.buildResponse({ text: '👌', inputType: 'text' });
        }

        // Default: treat as chat message
        return this.handleChat(userId, request);
      }

      // 6. Handle /start for returning users (onboarding already completed)
      if (command === 'start') {
        return this.handleStartReturning(userId, request);
      }

      // 7. Dispatch to handler
      const response = await this.routeCommand(command, userId, request);

      this.logger.log(
        `[${Date.now() - startTime}ms] /${command} → user:${userId.slice(0, 8)}`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `Command dispatch failed: ${request.command} — ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private async routeCommand(
    command: string,
    userId: string,
    request: CommandRequest,
  ): Promise<CommandResponse> {
    const def = COMMAND_MAP.get(command);
    if (!def) {
      throw new UnknownCommandException(command);
    }

    switch (def.handler) {
      case 'onboarding':
        return this.handleOnboarding(userId, request);

      case 'roles':
        return this.handleRoles(userId);

      case 'settings':
        return this.handleSettings(userId, request);

      case 'format':
        return this.handleFormat(userId, request);

      case 'info':
        return this.handleInfo(userId);

      case 'balance':
        return this.handleBalance(userId);

      case 'referral':
        return this.handleReferral(userId);

      case 'other':
        return this.handleOther();

      case 'clear_chat':
        return this.handleClearChat(userId);

      case 'pay':
        return this.handlePay(userId);

      case 'credits':
        return this.handleCredits(userId);

      case 'gift':
        return this.handleGift(userId, request);

      case 'subscribe':
        return this.handleSubscribe(userId, request);

      case 'gift_session':
        return this.handleGiftSession(userId);

      case 'topics':
        return this.handleTopics();

      case 'progress':
        return this.handleProgress(userId);

      case 'memory':
        return this.handleMemory(userId);

      case 'mood':
        return this.handleMood(userId);

      case 'journal':
        return this.handleJournal(userId);

      case 'mute':
        return this.handleMute(userId);

      case 'unmute':
        return this.handleUnmute(userId);

      case 'support':
        return this.handleSupport();

      case 'about_company':
        return this.handleAboutCompany();

      default:
        if (def.handler.startsWith('stub:')) {
          return this.handleStub(def);
        }
        throw new UnknownCommandException(command);
    }
  }

  // ===================== HANDLERS =====================

  /** Handle /start for users who already completed onboarding */
  private async handleStartReturning(
    userId: string,
    request: CommandRequest,
  ): Promise<CommandResponse> {
    const deepLink = request.deepLinkParam ?? request.payload ?? '';

    // Handle Stripe return deep links
    if (deepLink === 'payment_success') {
      const balance = await this.getBalance.execute(userId);
      return this.buildResponse({
        text: `✅ Ödəniş uğurla tamamlandı!\n\n💳 Cari balans: ${balance.balance} kredit\n\nİndi mənə yaz — söhbətimizə davam edək! 💬`,
        inputType: 'text',
      });
    }

    // Handle anonymous gift invite deep links
    if (deepLink.startsWith('gift_')) {
      const giftCode = deepLink.slice(5);
      const claimed = await this.shadowReferral.claimInvite(giftCode, userId);
      if (claimed) {
        return this.buildResponse({
          text: `🎁 Təbrik! Sənə pulsuz sessiya hədiyyə edildi!\n\n+3 kredit hesabına əlavə olundu.\nBir yaxının sənə Nigar-ı tövsiyə etdi 💛\n\nMənə yaz — söhbətimizə başlayaq!`,
          inputType: 'text',
        });
      }
      // Invalid/expired/already claimed — fall through to normal start
    }

    if (deepLink === 'sub_success') {
      const sub = await this.subscriptionService.getSubscription(userId);
      return this.buildResponse({
        text: `✅ Abunəlik aktivləşdirildi!\n\n🎉 Plan: ${sub.plan.name}\n\nBütün premium xüsusiyyətlər artıq aktivdir.\nMənə yaz — söhbətimizə davam edək! 💬`,
        inputType: 'text',
      });
    }

    if (deepLink === 'sub_cancel') {
      return this.buildResponse({
        text: '❌ Abunəlik ləğv edildi.\n\nYenidən cəhd etmək üçün: /subscribe',
        inputType: 'text',
      });
    }

    if (deepLink === 'payment_cancel') {
      return this.buildResponse({
        text: `❌ Ödəniş ləğv edildi.\n\nYenidən cəhd etmək üçün: /pay`,
        inputType: 'text',
      });
    }

    // Normal /start for returning user — welcome back
    const full = await this.getFullProfile.execute(userId);
    const name = full?.profile?.name ?? 'Dostum';

    return this.buildResponse({
      text:
        `Xoş gəldin geri, ${name}! 👋\n\n` +
        `Mən Nigar — sənin AI psixoloqunam.\n` +
        `Mənə istənilən sualını yaz, söhbətimizə davam edək! 💬\n\n` +
        `/roles — Rol dəyiş\n` +
        `/settings — Parametrlər\n` +
        `/balance — Balans`,
      inputType: 'text',
    });
  }

  private async handleOnboarding(
    userId: string,
    request: CommandRequest,
  ): Promise<CommandResponse> {
    const userInput: UserInput = request.userInput ?? {
      type: request.command.startsWith('/') ? 'command' : 'text',
      value: request.payload ?? request.command,
    };

    const result = await this.advanceStep.execute({ userId, input: userInput });

    return {
      output: result.output,
      isOnboarding: true,
      onboardingCompleted: result.completed,
      currentStep: result.currentStep,
    };
  }

  private async handleRoles(userId: string): Promise<CommandResponse> {
    const profile = await this.getFullProfile.execute(userId);
    const currentRole = profile?.settings?.activeRole ?? 'nigar';

    const roles = [
      { key: ActiveRole.NIGAR, name: 'Nigar Psixoloq', desc: 'Standart psixoloji dəstək' },
      { key: ActiveRole.NIGAR_BLACK, name: 'Nigar Black — Qaranlıq psixoloq', desc: 'Birbaşa, kəskin, provokativ' },
      { key: ActiveRole.SUPER_NIGAR, name: 'Super Nigar — Ən ağıllı', desc: 'Ən güclü model ilə işləyir' },
      { key: ActiveRole.NIGAR_DOST, name: 'Nigar Dost — Rəfiqə', desc: 'Yaxın rəfiqə kimi söhbət' },
      { key: ActiveRole.NIGAR_TRAINER, name: 'Nigar Trainer', desc: 'Konflikt məşqçisi' },
      { key: ActiveRole.NIGAR_18PLUS, name: 'Nigar 18+', desc: '🔞' },
    ];

    const text = roles
      .map((r) => {
        const marker = r.key === currentRole ? ' ✅' : '';
        return `/${r.key} - ${r.name}${marker}\n  _${r.desc}_`;
      })
      .join('\n\n');

    return this.buildResponse({
      text: `🎭 Mövcud rollar:\n\nHazırda: **${currentRole}**\n\n${text}`,
      options: [
        ...roles.map((r) => ({
          id: r.key,
          label: `${r.key === currentRole ? '✅ ' : ''}${r.name}`,
          value: `role:${r.key}`,
        })),
        { id: 'hide', label: 'Gizlət', value: 'hide' },
      ],
      inputType: 'button',
    });
  }

  /** Handle role switch from callback: "role:nigar_black" */
  private async handleRoleSwitch(
    userId: string,
    roleKey: string,
  ): Promise<CommandResponse> {
    const role = Object.values(ActiveRole).find((r) => r === roleKey);
    if (!role) {
      return this.buildResponse({ text: '❌ Naməlum rol.', inputType: 'text' });
    }

    await this.updateSettings.execute({ userId, activeRole: role });

    const roleNames: Record<string, string> = {
      [ActiveRole.NIGAR]: 'Nigar Psixoloq',
      [ActiveRole.NIGAR_BLACK]: 'Nigar Black — Qaranlıq psixoloq',
      [ActiveRole.SUPER_NIGAR]: 'Super Nigar — Ən ağıllı neyroşəbəkə',
      [ActiveRole.NIGAR_DOST]: 'Nigar Dost — Rəfiqə',
      [ActiveRole.NIGAR_TRAINER]: 'Nigar Trainer — Konflikt məşqçisi',
      [ActiveRole.NIGAR_18PLUS]: 'Nigar 18+',
    };

    const displayName = roleNames[role] ?? role;
    const extra = role === ActiveRole.NIGAR_BLACK
      ? '\n\n⚙️ /settings — kobudluq rejimini aç/bağla'
      : '';

    this.logger.log(`Role switched to ${role} for user ${userId.slice(0, 8)}`);

    return this.buildResponse({
      text: `✅ Rol dəyişdirildi: **${displayName}**${extra}`,
      inputType: 'text',
    });
  }

  private async handleSettings(
    userId: string,
    _request: CommandRequest,
  ): Promise<CommandResponse> {
    const profile = await this.getFullProfile.execute(userId);
    const s = profile?.settings;
    const roleName = s?.activeRole ?? 'nigar';
    const format = s?.responseFormat ?? 'text';
    const rudenessOn = s?.nigarBlackRudenessEnabled ?? false;

    const formatLabel = format === 'voice' ? 'Səs' : format === 'voice_and_text' ? 'Səs + Mətn' : 'Mətn';

    const roleNames: Record<string, string> = {
      nigar: 'Nigar Psixoloq',
      nigar_black: 'Nigar Black',
      super_nigar: 'Super Nigar',
      nigar_dost: 'Nigar Dost',
      nigar_trainer: 'Nigar Trainer',
      nigar_18plus: 'Nigar 18+',
    };

    return this.buildResponse({
      text:
        `⚙️ Parametrlər:\n\n` +
        `🎭 Aktiv rol: ${roleNames[roleName] ?? roleName}\n` +
        `🎙 Cavab formatı: ${formatLabel}\n` +
        `🤬 Kobudluq (Nigar Black): ${rudenessOn ? '✅ Açıq' : '❌ Bağlı'}\n\n` +
        `Dəyişmək üçün düymələri istifadə et 👇`,
      options: [
        { id: 'roles', label: '🎭 Rol dəyiş', value: 'cmd:roles' },
        { id: 'format', label: '🎙 Format dəyiş', value: 'cmd:format' },
        {
          id: 'rudeness',
          label: rudenessOn ? '🤬 Kobudluq: BAĞLA' : '🤬 Kobudluq: AÇ',
          value: `toggle:rudeness:${rudenessOn ? 'off' : 'on'}`,
        },
        { id: 'hide', label: 'Gizlət', value: 'hide' },
      ],
      inputType: 'button',
    });
  }

  /** Handle rudeness toggle from callback: "toggle:rudeness:on/off" */
  private async handleRudenessToggle(
    userId: string,
    state: string,
  ): Promise<CommandResponse> {
    const enabled = state === 'on';
    await this.updateSettings.execute({ userId, nigarBlackRudenessEnabled: enabled });

    this.logger.log(`Rudeness toggle: ${enabled ? 'ON' : 'OFF'} for user ${userId.slice(0, 8)}`);

    if (enabled) {
      return this.buildResponse({
        text: `🤬 Kobudluq rejimi **AÇILDI**.\n\nNigar Black indi söyüş və argo istifadə edəcək.\n⚠️ Diqqət: bu rejim yalnız Nigar Black rolu ilə işləyir.`,
        inputType: 'text',
      });
    }

    return this.buildResponse({
      text: `✅ Kobudluq rejimi **BAĞLANDI**.\n\nNigar Black indi daha mülayim olacaq.`,
      inputType: 'text',
    });
  }

  private async handleFormat(
    userId: string,
    request: CommandRequest,
  ): Promise<CommandResponse> {
    if (request.payload) {
      const fmt = Object.values(ResponseFormat).find((f) => f === request.payload);
      if (fmt) {
        await this.updateSettings.execute({ userId, responseFormat: fmt });
        const label = fmt === 'voice' ? 'Səs' : fmt === 'voice_and_text' ? 'Səs + Mətn' : 'Mətn';
        return this.buildResponse({
          text: `✅ Cavab formatı dəyişdirildi: ${label}`,
          inputType: 'text',
        });
      }
    }

    return this.buildResponse({
      text: '🎙 Cavab formatını seç:',
      options: [
        { id: 'voice', label: '🎙 Səs', value: 'voice' },
        { id: 'text', label: '📝 Mətn', value: 'text' },
        { id: 'voice_and_text', label: '🎙 Səs + Mətn', value: 'voice_and_text' },
      ],
      inputType: 'button',
    });
  }

  private async handleInfo(userId: string): Promise<CommandResponse> {
    const full = await this.getFullProfile.execute(userId);
    const p = full?.profile;

    const genderLabel =
      p?.gender === 'male' ? 'Kişi' : p?.gender === 'female' ? 'Qadın' : '—';

    return this.buildResponse({
      text:
        `📋 Sənin məlumatın:\n\n` +
        `👤 Ad: ${p?.name ?? '—'}\n` +
        `⚧ Cins: ${genderLabel}\n` +
        `🎂 Yaş: ${p?.age ?? '—'}\n` +
        `📝 Əlavə məlumat: ${p?.bio || 'Doldurulmayıb'}\n\n` +
        `Redaktə etmək üçün düyməni bas 👇`,
      options: [
        { id: 'edit_profile', label: 'Anketi redaktə et', value: 'edit_profile' },
        { id: 'cancel', label: 'Ləğv et', value: 'cancel' },
      ],
      inputType: 'button',
    });
  }

  private async handleBalance(userId: string): Promise<CommandResponse> {
    const balance = await this.getBalance.execute(userId);

    return this.buildResponse({
      text:
        `💰 Balans:\n\n` +
        `💳 Kreditlər: ${balance.balance}\n` +
        `🎙 Pulsuz səsli cavablar: ${balance.freeVoiceRemaining}\n` +
        `📊 Ümumi alınıb: ${balance.totalPurchased}\n` +
        `📊 Ümumi xərclənib: ${balance.totalSpent}\n\n` +
        `/pay - Kredit al\n` +
        `/referral - Pulsuz kredit qazan`,
      inputType: 'text',
    });
  }

  private async handleReferral(userId: string): Promise<CommandResponse> {
    const stats = await this.getReferralInfo.execute(userId);

    return this.buildResponse({
      text:
        `🎁 Referal proqramı:\n\n` +
        `Sənin referal kodun: \`${stats.referralCode}\`\n\n` +
        `👥 Dəvət etdiyin: ${stats.totalReferred} nəfər\n` +
        `✅ Bonus verilən: ${stats.bonusCredited} nəfər\n\n` +
        `Dostlarını dəvət et — sən 5, onlar 3 kredit qazanacaq!\n\n` +
        `Link: https://t.me/nigar_ai_bot?start=${stats.referralCode}`,
      inputType: 'text',
    });
  }

  private handleOther(): CommandResponse {
    const commands = COMMAND_REGISTRY.filter(
      (c) => !['start', 'other'].includes(c.command),
    );

    const text = commands
      .map((c) => `/${c.command} - ${c.description}`)
      .join('\n\n');

    return this.buildResponse({
      text: `📜 Bütün əmrlər:\n\n${text}`,
      options: [{ id: 'hide', label: 'Gizlət', value: 'hide' }],
      inputType: 'button',
    });
  }

  private async handleChat(
    userId: string,
    request: CommandRequest,
  ): Promise<CommandResponse> {
    const message = request.payload ?? request.command;
    if (!message || message.trim().length === 0) {
      return this.buildResponse({ text: 'Boş mesaj göndərə bilməzsən.', inputType: 'text' });
    }

    // Check subscription & session limits
    const sub = await this.subscriptionService.getSubscription(userId);
    const sessionCheck = await this.subscriptionService.recordSession(userId);
    if (!sessionCheck.allowed) {
      return this.buildResponse({
        text:
          `⏳ Bu həftəlik pulsuz sessiya limitin bitdi (${sub.plan.sessionsPerWeek}/${sub.plan.sessionsPerWeek}).\n\n` +
          `Premium abunəliklə limitsiz söhbət et!\n\n` +
          `/subscribe — Planları gör`,
        options: [
          { id: 'sub_premium', label: '💎 Premium — 9.90 AZN/ay', value: 'sub:premium' },
          { id: 'sub_plus', label: '👑 Premium+ — 19.90 AZN/ay', value: 'sub:premium_plus' },
        ],
        inputType: 'button',
      });
    }

    // Fetch user profile + settings for persona context
    const full = await this.getFullProfile.execute(userId);
    const persona = (full?.settings?.activeRole as ActiveRole) ?? ActiveRole.NIGAR;
    const rudenessEnabled = full?.settings?.nigarBlackRudenessEnabled ?? false;

    // Gate premium personas
    if (!sub.plan.allowedRoles.includes(persona)) {
      return this.buildResponse({
        text:
          `🔒 ${persona} rolu yalnız Premium abunəliklə mövcuddur.\n\n` +
          `/subscribe — Planları gör\n` +
          `/roles — Başqa rol seç`,
        inputType: 'text',
      });
    }

    // Load therapeutic memory context (premium feature)
    let sessionSummaries: Awaited<ReturnType<typeof this.summaryService.getRecentSummaries>> = [];
    let therapeuticProfile: Awaited<ReturnType<typeof this.profileService.getOrCreate>> | undefined;

    if (sub.plan.hasMemory) {
      [sessionSummaries, therapeuticProfile] = await Promise.all([
        this.summaryService.getRecentSummaries(userId, 3),
        this.profileService.getOrCreate(userId),
      ]);
    }

    const result = await this.sendMessage.execute({
      userId,
      message: message.trim(),
      persona,
      rudenessEnabled,
      userContext: {
        name: full?.profile?.name,
        age: full?.profile?.age,
        gender: full?.profile?.gender,
        bio: full?.profile?.bio,
      },
      sessionSummaries,
      therapeuticProfile,
    });

    // If a new conversation was created, the old one has ended — enqueue summary
    if (result.isNewConversation) {
      this.enqueuePreviousSessionSummary(userId, result.conversationId).catch(() => {});
    }

    // Schedule crisis follow-up if crisis detected
    if (result.isCrisis) {
      this.outreachProducer.scheduleCrisisFollowUp(userId).catch(() => {});
    }

    // TTS: generate voice if user prefers voice or voice+text
    const responseFormat = full?.settings?.responseFormat as ResponseFormat | undefined;
    let audioBuffer: Buffer | undefined;

    if (
      responseFormat === ResponseFormat.VOICE ||
      responseFormat === ResponseFormat.VOICE_AND_TEXT
    ) {
      try {
        const ttsResult = await this.synthesizeSpeech.execute({
          text: result.reply,
          userId,
        });
        audioBuffer = ttsResult.buffer;
        // Cleanup temp file after reading buffer
        this.synthesizeSpeech.cleanup(ttsResult.oggPath);
        this.logger.log(
          `TTS generated: ${ttsResult.durationSeconds}s, ${ttsResult.creditsRemaining} credits left`,
        );
      } catch (err) {
        this.logger.warn(`TTS failed (falling back to text): ${(err as Error).message}`);
        // Non-fatal — fall back to text-only
      }
    }

    return {
      output: {
        text: result.reply,
        inputType: 'text',
        options: [
          { id: 'wisdom', label: '💡 Paylaş', value: 'wisdom_card' },
        ],
      },
      isOnboarding: false,
      meta: {
        conversationId: result.conversationId,
        tokensUsed: result.tokensUsed,
        provider: result.provider,
        model: result.model,
        isCrisis: result.isCrisis,
        audioBuffer,
      },
    };
  }

  private async handleClearChat(userId: string): Promise<CommandResponse> {
    // Clear the active conversation so next message starts a fresh one
    const activeConvId = await this.session.getActiveConversation(userId);
    if (activeConvId) {
      await this.session.clearConversationContext(activeConvId);
      // Mark the old conversation as ended
      await this.prisma.conversation.update({
        where: { id: activeConvId },
        data: { endedAt: new Date() },
      }).catch(() => {}); // non-critical
    }
    await this.session.clearActiveConversation(userId);

    this.logger.log(`Chat cleared for user ${userId.slice(0, 8)}`);

    return this.buildResponse({
      text: '🧹 Söhbət təmizləndi. Yeni bir mövzuya başlayaq!\n\nYeni söhbətə başlamaq üçün sadəcə yaz.',
      inputType: 'text',
    });
  }

  private async handlePay(userId: string): Promise<CommandResponse> {
    if (!this.stripeAdapter.isConfigured) {
      return this.buildResponse({
        text: '💳 Ödəniş sistemi hazırlanır.\n\nTezliklə kredit almaq mümkün olacaq!',
        inputType: 'text',
      });
    }

    return this.buildResponse({
      text:
        `💳 Kredit paketləri:\n\n` +
        CREDIT_PACKAGES.map((p) => `• ${p.label}`).join('\n') +
        `\n\nPaket seçin 👇`,
      options: CREDIT_PACKAGES.map((p) => ({
        id: p.id,
        label: `💎 ${p.label}`,
        value: `pay:${p.id}`,
      })),
      inputType: 'button',
    });
  }

  private async handlePayCallback(
    userId: string,
    packageId: string,
  ): Promise<CommandResponse> {
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return this.buildResponse({ text: '❌ Naməlum paket.', inputType: 'text' });
    }

    if (!this.stripeAdapter.isConfigured) {
      return this.buildResponse({
        text: '💳 Ödəniş sistemi hələ aktiv deyil.',
        inputType: 'text',
      });
    }

    try {
      const url = await this.stripeAdapter.createCheckoutSession(
        userId,
        pkg,
        'Nigar_Psixoloq_bot',
      );

      return this.buildResponse({
        text: `💳 Ödəniş linki hazırdır!\n\n${pkg.label}\n\n👉 ${url}\n\nÖdəniş tamamlandıqdan sonra kreditlər avtomatik əlavə olunacaq.`,
        inputType: 'text',
      });
    } catch (err) {
      this.logger.error(`Stripe checkout failed: ${(err as Error).message}`);
      return this.buildResponse({
        text: '⚠️ Ödəniş linki yaradıla bilmədi. Zəhmət olmasa sonra cəhd edin.',
        inputType: 'text',
      });
    }
  }

  private async handleCredits(userId: string): Promise<CommandResponse> {
    const history = await this.getTransactionHistory.execute(userId, 10);

    if (history.length === 0) {
      return this.buildResponse({
        text: '📋 Hələ heç bir əməliyyat yoxdur.\n\n/pay — Kredit al',
        inputType: 'text',
      });
    }

    const lines = history.map((t) => {
      const icon = t.amount > 0 ? '➕' : '➖';
      const typeLabel: Record<string, string> = {
        purchase: '💳 Ödəniş',
        spend: '🔻 Xərc',
        gift: '🎁 Hədiyyə',
        referral_bonus: '👥 Referal',
      };
      const date = t.createdAt.toLocaleDateString('az-AZ');
      return `${icon} ${Math.abs(t.amount)} kredit — ${typeLabel[t.type] ?? t.type} (${date})`;
    });

    return this.buildResponse({
      text: `📋 Son əməliyyatlar:\n\n${lines.join('\n')}\n\n/balance — Cari balans`,
      inputType: 'text',
    });
  }

  private async handleGift(
    userId: string,
    request: CommandRequest,
  ): Promise<CommandResponse> {
    // Usage: /gift <telegramId> <amount>
    // The payload contains the text after /gift
    const args = (request.payload ?? '').trim().split(/\s+/);

    if (args.length < 2 || !args[0] || !args[1]) {
      return this.buildResponse({
        text:
          '🎁 İstifadə qaydası:\n\n' +
          '`/gift <telegramId> <miqdar>`\n\n' +
          'Məsələn: `/gift 123456789 10`\n\n' +
          'Qeyd: Alıcının Telegram ID-sini bilməlisiniz.',
        inputType: 'text',
      });
    }

    const receiverTgId = args[0];
    const amount = parseInt(args[1], 10);

    if (isNaN(amount) || amount <= 0) {
      return this.buildResponse({
        text: '❌ Miqdar müsbət rəqəm olmalıdır.',
        inputType: 'text',
      });
    }

    // Find receiver by telegramId
    const receiver = await this.getFullProfile.executeByTelegramId(receiverTgId);
    if (!receiver) {
      return this.buildResponse({
        text: `❌ Telegram ID ${receiverTgId} ilə istifadəçi tapılmadı.`,
        inputType: 'text',
      });
    }

    const balance = await this.getBalance.execute(userId);
    if (balance.balance < amount) {
      return this.buildResponse({
        text: `❌ Kifayət qədər kredit yoxdur.\n\nBalans: ${balance.balance}\nGöndərmək: ${amount}`,
        inputType: 'text',
      });
    }

    return this.buildResponse({
      text:
        `🎁 Hədiyyə funksiyası tezliklə tam aktivləşəcək.\n\n` +
        `Hazırda: /referral ilə dostlarınıza kredit qazandıra bilərsiniz.`,
      inputType: 'text',
    });
  }

  private handleTopics(): CommandResponse {
    return this.buildResponse({
      text:
        `📋 Mövzu seçin — söhbətimizi istiqamətləndirək:\n\n` +
        `Hansı mövzu sizi narahat edir?`,
      options: [
        { id: 't1', label: '🌪 Stress və narahatlıq', value: 'topic:stress' },
        { id: 't2', label: '❤️ Münasibətlər', value: 'topic:relationships' },
        { id: 't3', label: '💼 Karyera və iş', value: 'topic:career' },
        { id: 't4', label: '🎯 Özünə inam', value: 'topic:self_esteem' },
        { id: 't5', label: '😴 Yuxu və yorğunluq', value: 'topic:sleep' },
        { id: 't6', label: '👨‍👩‍👧 Ailə', value: 'topic:family' },
        { id: 't7', label: '💔 Ayrılıq / itki', value: 'topic:loss' },
        { id: 't8', label: '🧠 Özünü tanıma', value: 'topic:self_discovery' },
      ],
      inputType: 'button',
    });
  }

  private async handleTopicSelected(
    userId: string,
    topicKey: string,
  ): Promise<CommandResponse> {
    const topicLabels: Record<string, string> = {
      stress: '🌪 Stress və narahatlıq',
      relationships: '❤️ Münasibətlər',
      career: '💼 Karyera və iş',
      self_esteem: '🎯 Özünə inam',
      sleep: '😴 Yuxu və yorğunluq',
      family: '👨‍👩‍👧 Ailə münasibətləri',
      loss: '💔 Ayrılıq və itki',
      self_discovery: '🧠 Özünü tanıma',
    };

    const topicStarters: Record<string, string> = {
      stress: 'Stresslə bağlı nə baş verir? Nə sizi narahat edir?',
      relationships: 'Münasibətlərinizdə nə baş verir? Mənə danışın.',
      career: 'İş və karyeranızla bağlı nə düşünürsünüz?',
      self_esteem: 'Özünüzə inamınızla bağlı nə hiss edirsiniz?',
      sleep: 'Yuxu probleminiz var? Nə baş verir?',
      family: 'Ailə münasibətlərinizdə nə narahat edir?',
      loss: 'İtki və ya ayrılıq yaşayırsınız? Mən buradayam.',
      self_discovery: 'Özünüzü daha yaxşı tanımaq istəyirsiniz? Gəlin başlayaq.',
    };

    const label = topicLabels[topicKey] ?? topicKey;
    const starter = topicStarters[topicKey] ?? 'Bu mövzu haqqında danışaq. Nə hiss edirsiniz?';

    this.logger.log(`Topic selected: ${topicKey} for user ${userId.slice(0, 8)}`);

    return this.buildResponse({
      text: `${label}\n\n${starter}\n\n💬 Mənə yazın — dinləyirəm.`,
      inputType: 'text',
    });
  }

  private async handleProgress(userId: string): Promise<CommandResponse> {
    const [conversations, messages, balance, streak, moodTrend] = await Promise.all([
      this.prisma.conversation.count({ where: { userId } }),
      this.prisma.message.count({ where: { conversation: { userId } } }),
      this.getBalance.execute(userId),
      this.streakService.getStreak(userId),
      this.moodService.getMoodTrend(userId, 30),
    ]);

    const voiceUsed = 3 - balance.freeVoiceRemaining;

    const parts: string[] = [
      '📊 Sənin irəliləyişin:\n',
      `💬 Söhbətlər: ${conversations}`,
      `✉️ Mesajlar: ${messages}`,
    ];

    // Streak info
    if (streak.totalSessions > 0) {
      parts.push(`🔥 Streak: ${streak.currentStreak} gün ardıcıl`);
      parts.push(`🏆 Ən uzun streak: ${streak.longestStreak} gün`);
      parts.push(`📅 Cəmi sessiyalar: ${streak.totalSessions}`);
    }

    // Mood trend
    if (moodTrend.totalEntries > 0) {
      const directionEmoji = moodTrend.direction === 'improving' ? '📈' : moodTrend.direction === 'declining' ? '📉' : '➡️';
      parts.push(`\n${directionEmoji} Əhval trendi: ${moodTrend.average}/10 (${moodTrend.direction === 'improving' ? 'yaxşılaşır' : moodTrend.direction === 'declining' ? 'pisləşir' : 'sabit'})`);
    }

    parts.push(`\n🎙 Səsli cavablar istifadə olunub: ${voiceUsed}`);
    parts.push(`💰 Cari balans: ${balance.balance} kredit`);
    parts.push(`🎁 Pulsuz səs qalıb: ${balance.freeVoiceRemaining}`);
    parts.push('\n/mood — Əhval qrafiki\n/journal — Sessiya jurnalı\n/memory — Xatirələr');

    return this.buildResponse({ text: parts.join('\n'), inputType: 'text' });
  }

  private async handleMemory(userId: string): Promise<CommandResponse> {
    // Load long-term memory: last 5 session summaries + therapeutic profile
    const [summaries, profile, streak] = await Promise.all([
      this.summaryService.getRecentSummaries(userId, 5),
      this.profileService.getOrCreate(userId),
      this.streakService.getStreak(userId),
    ]);

    if (summaries.length === 0 && profile.concerns.length === 0) {
      return this.buildResponse({
        text: '🧠 Hələ heç bir uzunmüddətli xatirə yoxdur.\n\nBir neçə söhbətdən sonra Nigar səni daha yaxşı tanıyacaq!',
        inputType: 'text',
      });
    }

    const parts: string[] = ['🧠 Nigarın xatirələri:\n'];

    // Session summaries
    if (summaries.length > 0) {
      parts.push('--- Son sessiyalar ---');
      summaries.forEach((s, i) => {
        const date = s.createdAt.toLocaleDateString('az-AZ', { day: 'numeric', month: 'short' });
        const topics = s.topicsDiscussed.join(', ');
        const mood = s.moodScore ? ` | Əhval: ${s.moodScore}/10` : '';
        const summaryPreview = s.summary.length > 80 ? s.summary.slice(0, 80) + '...' : s.summary;
        parts.push(`${i + 1}. [${date}] ${topics}${mood}\n   ${summaryPreview}`);
      });
    }

    // Therapeutic profile
    if (profile.concerns.length > 0 || profile.goals.length > 0) {
      parts.push('\n--- Terapevtik profil ---');
      if (profile.concerns.length > 0) parts.push(`Narahatlıqlar: ${profile.concerns.join(', ')}`);
      if (profile.strengths.length > 0) parts.push(`Güclü tərəflər: ${profile.strengths.join(', ')}`);
      if (profile.goals.length > 0) parts.push(`Hədəflər: ${profile.goals.join(', ')}`);
      if (profile.progressNotes) parts.push(`Son qeyd: ${profile.progressNotes}`);
    }

    // Streak
    if (streak.totalSessions > 0) {
      parts.push(`\nStreak: ${streak.currentStreak} gün | Ən uzun: ${streak.longestStreak} gün | Cəmi: ${streak.totalSessions} sessiya`);
    }

    parts.push('\n/mood — Əhval qrafiki\n/journal — Sessiya jurnalı\n/progress — İrəliləyiş');

    return this.buildResponse({ text: parts.join('\n'), inputType: 'text' });
  }

  private async handleMood(userId: string): Promise<CommandResponse> {
    const trend = await this.moodService.getMoodTrend(userId, 14);

    if (trend.totalEntries === 0) {
      return this.buildResponse({
        text: '📊 Hələ əhval məlumatı yoxdur.\n\nBir neçə söhbətdən sonra əhval qrafikin burada görünəcək!',
        inputType: 'text',
      });
    }

    const chart = this.moodService.buildMoodChart(
      trend.recentScores.map((s) => ({
        score: s.score,
        dominantEmotion: s.emotion,
        createdAt: s.date,
      })),
    );

    const directionEmoji = trend.direction === 'improving' ? '📈' : trend.direction === 'declining' ? '📉' : '➡️';
    const directionLabel = trend.direction === 'improving' ? 'Yaxşılaşır' : trend.direction === 'declining' ? 'Pisləşir' : 'Sabit';

    return this.buildResponse({
      text:
        `📊 Son 14 günün əhval-ruhiyyən:\n\n` +
        `${chart}\n\n` +
        `${directionEmoji} Trend: ${directionLabel}\n` +
        `Orta əhval: ${trend.average}/10\n` +
        `Cəmi qeyd: ${trend.totalEntries}`,
      inputType: 'text',
    });
  }

  private async handleJournal(userId: string): Promise<CommandResponse> {
    const summaries = await this.summaryService.getRecentSummaries(userId, 10);

    if (summaries.length === 0) {
      return this.buildResponse({
        text: '📖 Sessiya jurnalı boşdur.\n\nBir neçə söhbətdən sonra burada sessiya xülasələrin görünəcək!',
        inputType: 'text',
      });
    }

    const lines = summaries.map((s, i) => {
      const date = s.createdAt.toLocaleDateString('az-AZ', { day: 'numeric', month: 'short' });
      const topics = s.topicsDiscussed.join(', ');
      const mood = s.moodScore ? `${s.moodScore}/10` : '—';
      const emotion = s.dominantEmotion ?? '';
      return `${i + 1}. [${date}] ${topics} | ${mood} ${emotion}\n   ${s.summary}`;
    });

    return this.buildResponse({
      text: `📖 Sessiya jurnalı (son ${summaries.length}):\n\n${lines.join('\n\n')}`,
      inputType: 'text',
    });
  }

  private handleSupport(): CommandResponse {
    return this.buildResponse({
      text:
        `📞 Dəstək:\n\n` +
        `Texniki problem və ya təklif üçün:\n\n` +
        `📧 Email: support@nigar.ai\n` +
        `💬 Telegram: @NigarSupport_Bot\n\n` +
        `Psixoloji böhran zamanı:\n` +
        `🆘 Böhran xətti: 860-510-510\n` +
        `📞 Uşaq xətti: 116-111`,
      inputType: 'text',
    });
  }

  private handleAboutCompany(): CommandResponse {
    return this.buildResponse({
      text:
        `🏢 Nigar AI haqqında:\n\n` +
        `Nigar — Azərbaycan bazarı üçün yaradılmış ilk AI psixoloqudur.\n\n` +
        `🧠 Missiyamız: Hər kəsə 24/7 keyfiyyətli psixoloji dəstək təmin etmək.\n\n` +
        `🔬 Texnologiya: OpenAI, Anthropic və Google-un ən müasir neyroşəbəkələri əsasında.\n\n` +
        `🔒 Məxfilik: Bütün söhbətlər şifrələnir (AES-256-GCM). Məlumatlar üçüncü şəxslərə ötürülmür.\n\n` +
        `📊 60,000+ istifadəçi artıq Nigar ilə söhbət edir.\n\n` +
        `/b2b — Biznes əməkdaşlıq\n` +
        `/support — Dəstək`,
      inputType: 'text',
    });
  }

  private handleStub(def: CommandDefinition): CommandResponse {
    return this.buildResponse({
      text: `🚧 /${def.command} — ${def.description}\n\nBu funksiya tezliklə aktiv olacaq.`,
      inputType: 'text',
    });
  }

  private async handleSubscribe(
    userId: string,
    _request: CommandRequest,
  ): Promise<CommandResponse> {
    const sub = await this.subscriptionService.getSubscription(userId);
    const current = sub.plan;

    const parts: string[] = [
      `💎 Abunəlik planları:\n`,
      `Hazırkı plan: **${current.name}**\n`,
    ];

    if (sub.sessionsRemaining !== null) {
      parts.push(`Qalan sessiya: ${sub.sessionsRemaining}/${current.sessionsPerWeek}\n`);
    }

    // Show plans
    const premium = SUBSCRIPTION_PLANS[SubscriptionTier.PREMIUM];
    const premiumPlus = SUBSCRIPTION_PLANS[SubscriptionTier.PREMIUM_PLUS];

    parts.push(`\n--- Premium (${premium.priceAzn} AZN/ay) ---`);
    premium.features.forEach((f) => parts.push(`✅ ${f}`));

    parts.push(`\n--- Premium+ (${premiumPlus.priceAzn} AZN/ay) ---`);
    premiumPlus.features.forEach((f) => parts.push(`✅ ${f}`));

    const options = [];
    if (sub.tier === SubscriptionTier.FREE) {
      options.push(
        { id: 'sub_premium', label: `💎 Premium — ${premium.priceAzn} AZN/ay`, value: 'sub:premium' },
        { id: 'sub_plus', label: `👑 Premium+ — ${premiumPlus.priceAzn} AZN/ay`, value: 'sub:premium_plus' },
      );
    } else if (sub.tier === SubscriptionTier.PREMIUM) {
      options.push(
        { id: 'sub_plus', label: `👑 Premium+-a yüksəlt — ${premiumPlus.priceAzn} AZN/ay`, value: 'sub:premium_plus' },
      );
    }
    options.push({ id: 'hide', label: 'Gizlət', value: 'hide' });

    return this.buildResponse({
      text: parts.join('\n'),
      options,
      inputType: 'button',
    });
  }

  private async handleGiftSession(userId: string): Promise<CommandResponse> {
    try {
      const result = await this.shadowReferral.createInvite(userId);
      return this.buildResponse({
        text:
          `🎁 Anonim sessiya hədiyyəsi yaradıldı!\n\n` +
          `Bu linki yaxınına göndər — o bilməyəcək ki, sən göndərmisən:\n\n` +
          `👉 ${result.deepLink}\n\n` +
          `Kod: \`${result.code}\`\n` +
          `Etibarlılıq: 7 gün\n` +
          `Aktiv dəvətlər: ${result.activeInvites}/5\n\n` +
          `Dəvət qəbul olunanda sən 5 kredit qazanacaqsan 💛`,
        inputType: 'text',
      });
    } catch (err) {
      return this.buildResponse({
        text: `⚠️ ${(err as Error).message}`,
        inputType: 'text',
      });
    }
  }

  private async handleWisdomCard(userId: string): Promise<CommandResponse> {
    // Get the last AI response for this user
    const lastConv = await this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });

    if (!lastConv) {
      return this.buildResponse({
        text: 'Hələ paylaşılacaq bir söhbət yoxdur.',
        inputType: 'text',
      });
    }

    const lastMessage = await this.prisma.message.findFirst({
      where: { conversationId: lastConv.id, role: 'assistant' },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });

    if (!lastMessage) {
      return this.buildResponse({
        text: 'Hələ paylaşılacaq bir cavab yoxdur.',
        inputType: 'text',
      });
    }

    // Decrypt and generate wisdom card
    let content: string;
    try {
      const { EncryptionService } = await import('../../common/encryption/encryption.service');
      // The content is encrypted — we need to pass it as-is to the wisdom card service
      // which will extract insight from whatever text it gets
      content = lastMessage.content;
    } catch {
      content = lastMessage.content;
    }

    const card = await this.wisdomCard.generateCard(content);

    return this.buildResponse({
      text:
        `💡 Müdriklik kartı:\n\n` +
        `${card.shareText}\n\n` +
        `Bu kartı kopyala və dostlarınla paylaş — heç bir şəxsi məlumat yoxdur 🔒`,
      inputType: 'text',
    });
  }

  private async handleSubCallback(
    userId: string,
    tierKey: string,
  ): Promise<CommandResponse> {
    const tier = tierKey === 'premium_plus'
      ? SubscriptionTier.PREMIUM_PLUS
      : SubscriptionTier.PREMIUM;
    const plan = SUBSCRIPTION_PLANS[tier];

    if (!this.stripeAdapter.isConfigured) {
      return this.buildResponse({
        text: '💳 Ödəniş sistemi hələ aktiv deyil. Tezliklə mövcud olacaq!',
        inputType: 'text',
      });
    }

    try {
      const url = await this.stripeAdapter.createSubscriptionCheckout(
        userId,
        plan.priceCentsMonthly,
        plan.name,
        tier,
        'Nigar_Psixoloq_bot',
      );

      return this.buildResponse({
        text:
          `💎 ${plan.name} abunəliyi üçün ödəniş linki:\n\n` +
          `${plan.priceAzn} AZN/ay\n\n` +
          `👉 ${url}\n\n` +
          `Ödəniş tamamlandıqdan sonra plan avtomatik aktivləşəcək.`,
        inputType: 'text',
      });
    } catch (err) {
      this.logger.error(`Subscription checkout failed: ${(err as Error).message}`);
      return this.buildResponse({
        text: '⚠️ Ödəniş linki yaradıla bilmədi. Zəhmət olmasa sonra cəhd edin.',
        inputType: 'text',
      });
    }
  }

  private async handleMute(userId: string): Promise<CommandResponse> {
    await this.prisma.userOutreachSettings.upsert({
      where: { userId },
      create: { userId, muted: true },
      update: { muted: true, mutedUntil: null },
    });

    return this.buildResponse({
      text: '🔇 Proaktiv bildirişlər dayandırıldı.\n\nYenidən aktivləşdirmək üçün: /unmute',
      inputType: 'text',
    });
  }

  private async handleUnmute(userId: string): Promise<CommandResponse> {
    await this.prisma.userOutreachSettings.upsert({
      where: { userId },
      create: { userId, muted: false },
      update: { muted: false, mutedUntil: null },
    });

    return this.buildResponse({
      text: '🔔 Bildirişlər yenidən aktivdir!\n\nNigar səninlə proaktiv olaraq əlaqə saxlayacaq.',
      inputType: 'text',
    });
  }

  // ===================== SESSION LIFECYCLE =====================

  /**
   * When a new conversation starts, find and close the previous one,
   * then enqueue an async summary generation job.
   */
  private async enqueuePreviousSessionSummary(
    userId: string,
    currentConversationId: string,
  ): Promise<void> {
    try {
      const previousConv = await this.prisma.conversation.findFirst({
        where: {
          userId,
          id: { not: currentConversationId },
          endedAt: null,
          messageCount: { gte: 2 },
        },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });

      if (!previousConv) return;

      // Mark as ended
      await this.prisma.conversation.update({
        where: { id: previousConv.id },
        data: { endedAt: new Date() },
      });

      // Check if summary already exists
      const existingSummary = await this.prisma.conversationSummary.findUnique({
        where: { conversationId: previousConv.id },
      });
      if (existingSummary) return;

      // Enqueue async summary generation
      await this.summaryProducer.enqueueSummary({
        conversationId: previousConv.id,
        userId,
      });

      // Schedule a 24h check-in for proactive engagement
      await this.outreachProducer.scheduleCheckIn(userId, previousConv.id).catch(() => {});

      this.logger.log(`Previous session closed & summary enqueued: conv=${previousConv.id.slice(0, 8)}`);
    } catch (err) {
      this.logger.warn(`Failed to enqueue previous session summary: ${(err as Error).message}`);
    }
  }

  // ===================== HELPERS =====================

  /** Extract command from input string. Returns null if not a command. */
  private parseCommand(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;

    // Handle "/start REF_CODE" style deep links
    const parts = trimmed.slice(1).split(/\s+/);
    return parts[0].toLowerCase();
  }

  private buildResponse(
    output: StepOutput,
    isOnboarding = false,
  ): CommandResponse {
    return { output, isOnboarding };
  }
}
