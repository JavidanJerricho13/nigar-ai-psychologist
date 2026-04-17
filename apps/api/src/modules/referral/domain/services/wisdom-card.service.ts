import { Injectable, Logger } from '@nestjs/common';
import { FallbackRouter } from '../../../chat/infrastructure/providers/fallback-router';
import { ActiveRole } from '@nigar/shared-types';

/**
 * Wisdom Cards — shareable insight cards from therapy sessions.
 *
 * After an insightful AI response, the user can generate a "wisdom card"
 * that contains the insight without any personal context. The card includes
 * a QR/link to the bot for viral discovery.
 *
 * Privacy guarantee: no user data, no conversation context — just the insight.
 */
@Injectable()
export class WisdomCardService {
  private readonly logger = new Logger(WisdomCardService.name);

  constructor(private readonly fallbackRouter: FallbackRouter) {}

  /**
   * Extract a shareable insight from an AI response.
   * Strips all personal context and produces a universal wisdom statement.
   */
  async generateCard(aiResponse: string): Promise<{
    insight: string;
    category: string;
    shareText: string;
  }> {
    try {
      const response = await this.fallbackRouter.complete(
        {
          messages: [
            {
              role: 'system',
              content:
                'You extract universal psychological insights from therapy responses.\n' +
                'Given an AI psychologist response, produce a SHORT (1-2 sentences), ' +
                'shareable insight that contains NO personal information.\n' +
                'The insight should be a general psychological wisdom anyone can benefit from.\n' +
                'Write in Azerbaijani.\n\n' +
                'Respond ONLY with valid JSON:\n' +
                '{"insight": "the universal insight", "category": "stress|relationships|self_esteem|mindfulness|growth"}',
            },
            { role: 'user', content: `Extract a shareable insight from this response:\n\n${aiResponse}` },
          ],
          maxTokens: 150,
          temperature: 0.3,
        },
        ActiveRole.NIGAR,
      );

      const parsed = this.parseJson(response.content);
      if (!parsed?.insight) {
        return this.fallbackCard();
      }

      const insight = parsed.insight as string;
      const category = parsed.category as string || 'growth';

      return {
        insight,
        category,
        shareText: this.formatShareText(insight),
      };
    } catch {
      return this.fallbackCard();
    }
  }

  private formatShareText(insight: string): string {
    return (
      `💡 ${insight}\n\n` +
      `— Nigar AI Psixoloq\n` +
      `🔗 t.me/nigar_ai_bot`
    );
  }

  private fallbackCard() {
    return {
      insight: 'Hisslərin haqqında danışmaq — güc əlamətidir, zəiflik deyil.',
      category: 'growth',
      shareText: this.formatShareText('Hisslərin haqqında danışmaq — güc əlamətidir, zəiflik deyil.'),
    };
  }

  private parseJson(text: string): any {
    try {
      return JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    } catch {
      return null;
    }
  }
}
