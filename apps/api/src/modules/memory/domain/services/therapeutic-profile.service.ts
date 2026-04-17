import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { FallbackRouter } from '../../../chat/infrastructure/providers/fallback-router';
import { ActiveRole } from '@nigar/shared-types';
import {
  PROFILE_MERGE_SYSTEM,
  PROFILE_MERGE_USER,
} from '../../infrastructure/prompts/profile-merge.prompt';
import type { SessionSummaryResult } from './session-summary.service';

export interface TherapeuticProfileData {
  concerns: string[];
  triggers: string[];
  strengths: string[];
  goals: string[];
  copingMethods: string[];
  progressNotes: string | null;
  version: number;
}

@Injectable()
export class TherapeuticProfileService {
  private readonly logger = new Logger(TherapeuticProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fallbackRouter: FallbackRouter,
  ) {}

  /**
   * Get or create a therapeutic profile for a user.
   */
  async getOrCreate(userId: string): Promise<TherapeuticProfileData> {
    const existing = await this.prisma.therapeuticProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      return {
        concerns: existing.concerns,
        triggers: existing.triggers,
        strengths: existing.strengths,
        goals: existing.goals,
        copingMethods: existing.copingMethods,
        progressNotes: existing.progressNotes,
        version: existing.version,
      };
    }

    const created = await this.prisma.therapeuticProfile.create({
      data: { userId },
    });

    return {
      concerns: created.concerns,
      triggers: created.triggers,
      strengths: created.strengths,
      goals: created.goals,
      copingMethods: created.copingMethods,
      progressNotes: created.progressNotes,
      version: created.version,
    };
  }

  /**
   * Update the therapeutic profile by merging new session insights via LLM.
   */
  async updateFromSession(
    userId: string,
    sessionResult: SessionSummaryResult,
  ): Promise<void> {
    const current = await this.getOrCreate(userId);

    // Skip LLM call if profile is empty AND session has no content
    if (
      current.version === 1 &&
      current.concerns.length === 0 &&
      !sessionResult.summary
    ) {
      return;
    }

    const existingJson = JSON.stringify({
      concerns: current.concerns,
      triggers: current.triggers,
      strengths: current.strengths,
      goals: current.goals,
      copingMethods: current.copingMethods,
    }, null, 2);

    const sessionJson = JSON.stringify({
      summary: sessionResult.summary,
      moodScore: sessionResult.moodScore,
      dominantEmotion: sessionResult.dominantEmotion,
      topics: sessionResult.topicsDiscussed,
    }, null, 2);

    try {
      const response = await this.fallbackRouter.complete(
        {
          messages: [
            { role: 'system', content: PROFILE_MERGE_SYSTEM },
            { role: 'user', content: PROFILE_MERGE_USER(existingJson, sessionJson) },
          ],
          maxTokens: 400,
          temperature: 0.2,
        },
        ActiveRole.NIGAR,
      );

      const parsed = this.parseJsonSafe(response.content);
      if (!parsed) {
        this.logger.warn(`Failed to parse profile merge JSON for user ${userId.slice(0, 8)}`);
        return;
      }

      await this.prisma.therapeuticProfile.update({
        where: { userId },
        data: {
          concerns: this.safeArray(parsed.concerns, 8),
          triggers: this.safeArray(parsed.triggers, 8),
          strengths: this.safeArray(parsed.strengths, 8),
          goals: this.safeArray(parsed.goals, 8),
          copingMethods: this.safeArray(parsed.copingMethods, 8),
          progressNotes: typeof parsed.progressNotes === 'string' ? parsed.progressNotes : null,
          version: { increment: 1 },
        },
      });

      this.logger.log(`Therapeutic profile updated for user ${userId.slice(0, 8)} (v${current.version + 1})`);
    } catch (err) {
      this.logger.error(`Profile merge failed for user ${userId.slice(0, 8)}: ${(err as Error).message}`);
    }
  }

  private safeArray(val: unknown, maxLen: number): string[] {
    if (!Array.isArray(val)) return [];
    return val
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .slice(0, maxLen);
  }

  private parseJsonSafe(text: string): any {
    try {
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}
