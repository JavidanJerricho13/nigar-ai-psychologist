import { Injectable, Inject, Logger } from '@nestjs/common';
import { ActiveRole } from '@nigar/shared-types';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { EncryptionService } from '../../../../common/encryption/encryption.service';
import { SessionService } from '../../../../shared/redis/session.service';
import { FallbackRouter } from '../../infrastructure/providers/fallback-router';
import { PromptBuilderService, UserContext } from '../../infrastructure/prompt/prompt-builder.service';
import { PiiStripperService } from '../../infrastructure/pii/pii-stripper.service';
import { SlidingWindowService } from '../../infrastructure/context/sliding-window.service';
import { CRISIS_DETECTION_PROMPT } from '../../infrastructure/prompt/templates/system-preamble';
import { LlmMessage } from '../ports/llm-provider.port';

export interface SendMessageInput {
  userId: string;
  conversationId?: string;
  message: string;
  persona: ActiveRole;
  rudenessEnabled: boolean;
  userContext: UserContext;
}

export interface SendMessageOutput {
  reply: string;
  conversationId: string;
  tokensUsed: number;
  provider: string;
  model: string;
  isCrisis: boolean;
  isNewConversation: boolean;
}

@Injectable()
export class SendMessageUseCase {
  private readonly logger = new Logger(SendMessageUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly session: SessionService,
    private readonly fallbackRouter: FallbackRouter,
    private readonly promptBuilder: PromptBuilderService,
    private readonly piiStripper: PiiStripperService,
    private readonly slidingWindow: SlidingWindowService,
  ) {}

  async execute(input: SendMessageInput): Promise<SendMessageOutput> {
    // 1. Get or create conversation (reuse active session if available)
    let conversationId: string;
    let isNewConversation = false;

    if (input.conversationId) {
      conversationId = input.conversationId;
    } else {
      // Check for active conversation in Redis
      const activeId = await this.session.getActiveConversation(input.userId);
      if (activeId) {
        conversationId = activeId;
      } else {
        conversationId = await this.createConversation(input.userId, input.persona);
        isNewConversation = true;
      }
    }

    // Track active conversation in Redis
    await this.session.setActiveConversation(input.userId, conversationId);

    // 2. Strip PII from user message
    const { cleaned: cleanedMessage } = this.piiStripper.strip(input.message);

    // 3. Crisis detection (lightweight check)
    const crisisResult = await this.detectCrisis(cleanedMessage, input.userId);

    // 4. Load conversation history from Redis cache
    const rawHistory = await this.session.getConversationContext(conversationId);
    const history: LlmMessage[] = rawHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // 5. Trim history to token budget
    const trimmedHistory = this.slidingWindow.trim(history);

    // 6. Build prompt
    const messages = this.promptBuilder.build({
      persona: input.persona,
      rudenessEnabled: input.rudenessEnabled,
      userContext: input.userContext,
      conversationHistory: trimmedHistory,
      currentMessage: cleanedMessage,
    });

    // 7. Call LLM via fallback router
    const response = await this.fallbackRouter.complete(
      { messages, temperature: 0.7 },
      input.persona,
      crisisResult.isCrisis,
    );

    // 8. If crisis, prepend safety message
    let finalReply = response.content;
    if (crisisResult.isCrisis) {
      finalReply = `🆘 Mən sənin yanındayam. Amma bu vəziyyətdə mütəxəssis köməyi lazımdır.\nZəhmət olmasa böhran xəttinə zəng et: 860-510-510\nSən tək deyilsən.\n\n---\n\n${finalReply}`;
    }

    // 9. Save messages to Redis context
    await this.session.pushConversationMessage(conversationId, {
      role: 'user',
      content: cleanedMessage,
    });
    await this.session.pushConversationMessage(conversationId, {
      role: 'assistant',
      content: finalReply,
    });

    // 10. Persist encrypted messages to DB
    await this.persistMessages(
      conversationId,
      input.message, // Original (not PII-stripped) for user message
      finalReply,
      response.tokensUsed,
      response.provider,
    );

    // 11. Update conversation message count
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { messageCount: { increment: 2 } },
    });

    this.logger.log(
      `Chat: user:${input.userId.slice(0, 8)} | ${response.provider}/${response.model} | ${response.tokensUsed} tokens${crisisResult.isCrisis ? ' | 🆘 CRISIS' : ''}`,
    );

    return {
      reply: finalReply,
      conversationId,
      tokensUsed: response.tokensUsed,
      provider: response.provider,
      model: response.model,
      isCrisis: crisisResult.isCrisis,
      isNewConversation,
    };
  }

  /** Lightweight crisis detection — returns details and persists to DB */
  private async detectCrisis(
    message: string,
    userId: string,
  ): Promise<{ isCrisis: boolean; severity: string; keywords: string[] }> {
    const crisisKeywords = [
      'intihar', 'özümü öldür', 'yaşamaq istəmirəm', 'ölmək istəyirəm',
      'самоубийство', 'не хочу жить', 'suicide', 'kill myself',
      'özümə zərər', 'damarlarımı', 'qan', 'dərman içmək',
    ];

    const lowerMsg = message.toLowerCase();
    const matchedKeywords = crisisKeywords.filter((kw) => lowerMsg.includes(kw));

    if (matchedKeywords.length === 0) {
      return { isCrisis: false, severity: 'none', keywords: [] };
    }

    // Keyword found — verify with LLM
    let severity = 'high'; // default if LLM fails
    try {
      const response = await this.fallbackRouter.complete(
        {
          messages: [
            { role: 'system', content: 'You are a crisis detection system. Respond ONLY with valid JSON.' },
            { role: 'user', content: CRISIS_DETECTION_PROMPT + message },
          ],
          maxTokens: 100,
          temperature: 0,
        },
        ActiveRole.NIGAR,
        true,
      );

      const parsed = JSON.parse(response.content);
      severity = parsed.severity ?? 'high';
      const isCrisis = parsed.isCrisis === true && ['high', 'critical'].includes(severity);

      if (!isCrisis) {
        return { isCrisis: false, severity, keywords: matchedKeywords };
      }
    } catch {
      this.logger.warn('Crisis detection LLM call failed — defaulting to crisis=true for keyword match');
    }

    // Persist crisis event to DB
    try {
      await this.prisma.crisisEvent.create({
        data: {
          userId,
          severity,
          keywords: matchedKeywords,
          handled: false,
        },
      });
      this.logger.warn(
        `🆘 Crisis persisted to DB: user=${userId.slice(0, 8)}, severity=${severity}, keywords=[${matchedKeywords.join(', ')}]`,
      );
    } catch (err) {
      this.logger.error(`Failed to persist crisis event: ${(err as Error).message}`);
    }

    return { isCrisis: true, severity, keywords: matchedKeywords };
  }

  private async createConversation(userId: string, persona: ActiveRole): Promise<string> {
    const conv = await this.prisma.conversation.create({
      data: {
        userId,
        roleUsed: persona as string as any,
      },
    });
    return conv.id;
  }

  private async persistMessages(
    conversationId: string,
    userMessage: string,
    assistantMessage: string,
    tokensUsed: number,
    provider: string,
  ): Promise<void> {
    await this.prisma.message.createMany({
      data: [
        {
          conversationId,
          role: 'user',
          content: this.encryption.encrypt(userMessage),
        },
        {
          conversationId,
          role: 'assistant',
          content: this.encryption.encrypt(assistantMessage),
          tokensUsed,
          llmProvider: provider,
        },
      ],
    });
  }
}
