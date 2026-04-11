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
import { SessionService } from '../../shared/redis/session.service';
import { ActiveRole, ResponseFormat } from '@nigar/shared-types';
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
    private readonly session: SessionService,
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

      // 1b. Apply referral if new user arrived via deep link
      if (isNew && request.deepLinkParam) {
        try {
          await this.applyReferral.execute({
            referredUserId: userId,
            referralCode: request.deepLinkParam,
          });
          this.logger.log(`Referral applied for new user ${userId.slice(0, 8)}`);
        } catch {
          // Non-critical — referral code might be invalid or self-referral
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

        // Payment package callback: "pay:pack_10"
        if (payload.startsWith('pay:')) {
          return this.handlePayCallback(userId, payload.slice(4));
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

      // 6. Dispatch to handler
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

      default:
        if (def.handler.startsWith('stub:')) {
          return this.handleStub(def);
        }
        throw new UnknownCommandException(command);
    }
  }

  // ===================== HANDLERS =====================

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

    // Fetch user profile + settings for persona context
    const full = await this.getFullProfile.execute(userId);
    const persona = (full?.settings?.activeRole as ActiveRole) ?? ActiveRole.NIGAR;
    const rudenessEnabled = full?.settings?.nigarBlackRudenessEnabled ?? false;

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
    });

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
      output: { text: result.reply, inputType: 'text' },
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
    // Clear all conversation contexts for this user from Redis
    // We don't know the exact conversationId, so clear by pattern
    // For now, just acknowledge — the next message will start a fresh conversation
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

  private handleStub(def: CommandDefinition): CommandResponse {
    return this.buildResponse({
      text: `🚧 /${def.command} — ${def.description}\n\nBu funksiya tezliklə aktiv olacaq.`,
      inputType: 'text',
    });
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
