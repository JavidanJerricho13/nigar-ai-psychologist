import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { EncryptionService } from '../../../../common/encryption/encryption.service';
import { FallbackRouter } from '../../../chat/infrastructure/providers/fallback-router';
import { ActiveRole } from '@nigar/shared-types';
import {
  SESSION_SUMMARY_SYSTEM,
  SESSION_SUMMARY_USER,
} from '../../infrastructure/prompts/summary.prompt';

export interface SessionSummaryResult {
  summary: string;
  moodScore: number;
  dominantEmotion: string;
  topicsDiscussed: string[];
}

@Injectable()
export class SessionSummaryService {
  private readonly logger = new Logger(SessionSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly fallbackRouter: FallbackRouter,
  ) {}

  /**
   * Generate a summary for a completed conversation.
   * Decrypts messages, sends to LLM for analysis, persists result.
   */
  async generateSummary(
    conversationId: string,
    userId: string,
  ): Promise<SessionSummaryResult | null> {
    // 1. Load messages for this conversation
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    if (messages.length < 2) {
      this.logger.debug(`Skipping summary for conv ${conversationId.slice(0, 8)}: too few messages`);
      return null;
    }

    // 2. Decrypt and format messages for LLM
    const formatted = messages
      .map((m) => {
        const decrypted = this.decryptSafe(m.content);
        const role = m.role === 'user' ? 'User' : 'Nigar';
        return `${role}: ${decrypted}`;
      })
      .join('\n');

    // 3. Call LLM for summary
    try {
      const response = await this.fallbackRouter.complete(
        {
          messages: [
            { role: 'system', content: SESSION_SUMMARY_SYSTEM },
            { role: 'user', content: SESSION_SUMMARY_USER(formatted) },
          ],
          maxTokens: 300,
          temperature: 0.2,
        },
        ActiveRole.NIGAR,
      );

      const parsed = this.parseJsonSafe(response.content);
      if (!parsed) {
        this.logger.warn(`Failed to parse summary JSON for conv ${conversationId.slice(0, 8)}`);
        return null;
      }

      const result: SessionSummaryResult = {
        summary: parsed.summary ?? '',
        moodScore: this.clamp(parsed.moodScore ?? 5, 1, 10),
        dominantEmotion: parsed.dominantEmotion ?? 'naməlum',
        topicsDiscussed: Array.isArray(parsed.topicsDiscussed) ? parsed.topicsDiscussed : [],
      };

      // 4. Persist to DB
      await this.prisma.conversationSummary.create({
        data: {
          conversationId,
          userId,
          summary: this.encryption.encrypt(result.summary),
          moodScore: result.moodScore,
          dominantEmotion: result.dominantEmotion,
          topicsDiscussed: result.topicsDiscussed,
          messageCount: messages.length,
        },
      });

      // 5. Also create a MoodEntry
      await this.prisma.moodEntry.create({
        data: {
          userId,
          score: result.moodScore,
          dominantEmotion: result.dominantEmotion,
          source: 'auto',
          conversationId,
        },
      });

      this.logger.log(
        `Summary generated: conv=${conversationId.slice(0, 8)} mood=${result.moodScore} topics=[${result.topicsDiscussed.join(', ')}]`,
      );

      return result;
    } catch (err) {
      this.logger.error(`Summary generation failed for conv ${conversationId.slice(0, 8)}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Load the last N summaries for a user (decrypted).
   */
  async getRecentSummaries(
    userId: string,
    limit: number = 3,
  ): Promise<Array<{
    summary: string;
    moodScore: number | null;
    dominantEmotion: string | null;
    topicsDiscussed: string[];
    createdAt: Date;
  }>> {
    const summaries = await this.prisma.conversationSummary.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        summary: true,
        moodScore: true,
        dominantEmotion: true,
        topicsDiscussed: true,
        createdAt: true,
      },
    });

    return summaries.map((s) => ({
      ...s,
      summary: this.decryptSafe(s.summary),
    }));
  }

  private decryptSafe(encrypted: string): string {
    try {
      return this.encryption.decrypt(encrypted);
    } catch {
      return encrypted; // fallback if not encrypted
    }
  }

  private parseJsonSafe(text: string): any {
    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  private clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(val)));
  }
}
