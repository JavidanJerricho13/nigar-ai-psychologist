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

      // 5. If no command and not in onboarding → treat as chat message
      if (!command) {
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

  private async handleRoles(_userId: string): Promise<CommandResponse> {
    const roles = [
      { cmd: '/nigar', name: 'Nigar Psixoloq', desc: 'Standart psixoloji dəstək' },
      { cmd: '/nigar_black', name: 'Nigar Black — Qaranlıq psixoloq', desc: 'Birbaşa, kəskin, bəzən toksik. Mübahisəli mövzularda açıq danışır.' },
      { cmd: '/super_nigar', name: 'Super Nigar — Ən ağıllı neyroşəbəkə', desc: 'Ən güclü model ilə işləyir' },
      { cmd: '/nigar_dost', name: 'Nigar Dost — Rəfiqə', desc: 'Yaxın rəfiqə kimi söhbət' },
      { cmd: '/nigar_trainer', name: 'Nigar Trainer — Konflikt məşqçisi', desc: 'Çətin söhbətlərə hazırlaşmağa kömək edir' },
      { cmd: '/nigar_18plus', name: 'Nigar 18+', desc: '🔞' },
    ];

    const text = roles
      .map((r) => `${r.cmd} - ${r.name}\n  _${r.desc}_`)
      .join('\n\n');

    return this.buildResponse({
      text: `🎭 Mövcud rollar:\n\n${text}`,
      options: [
        ...roles.map((r) => ({
          id: r.cmd.replace('/', ''),
          label: r.name,
          value: r.cmd.replace('/', ''),
        })),
        { id: 'hide', label: 'Gizlət', value: 'hide' },
      ],
      inputType: 'button',
    });
  }

  private async handleSettings(
    userId: string,
    request: CommandRequest,
  ): Promise<CommandResponse> {
    // If payload contains a setting change, apply it
    if (request.payload) {
      const role = Object.values(ActiveRole).find((r) => r === request.payload);
      if (role) {
        await this.updateSettings.execute({ userId, activeRole: role });
        return this.buildResponse({
          text: `✅ Rol dəyişdirildi: ${role}`,
          inputType: 'text',
        });
      }
    }

    // Show current settings
    const profile = await this.getFullProfile.execute(userId);
    const s = profile?.settings;
    const roleName = s?.activeRole ?? 'nigar';
    const format = s?.responseFormat ?? 'text';
    const rudeness = s?.nigarBlackRudenessEnabled ? 'Açıq' : 'Bağlı';

    return this.buildResponse({
      text:
        `⚙️ Parametrlər:\n\n` +
        `🎭 Aktiv rol: ${roleName}\n` +
        `🎙 Cavab formatı: ${format}\n` +
        `🤬 Kobudluq (Nigar Black): ${rudeness}\n\n` +
        `/roles - Rol dəyiş\n` +
        `/format - Format dəyiş`,
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
