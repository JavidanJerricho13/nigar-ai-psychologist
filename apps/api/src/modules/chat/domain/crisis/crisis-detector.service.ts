import { Injectable, Logger } from '@nestjs/common';

/**
 * Hardcoded crisis detection layer.
 * This BYPASSES persona style — even Nigar Black stops being rude during a crisis.
 *
 * Two-stage detection:
 * 1. Fast keyword scan (no API call)
 * 2. If keywords found → LLM verification (handled in SendMessageUseCase)
 */

const CRISIS_KEYWORDS_AZ = [
  'intihar', 'özümü öldür', 'yaşamaq istəmirəm', 'ölmək istəyirəm',
  'özümə zərər', 'damarlarımı', 'dərman içmək', 'həyatıma son',
  'heç kəsə lazım deyiləm', 'hamı mənsiz yaxşıdır',
];

const CRISIS_KEYWORDS_RU = [
  'самоубийство', 'не хочу жить', 'покончить с собой', 'убить себя',
  'порежу себя', 'выпить таблетки', 'конец жизни', 'никому не нужен',
];

const CRISIS_KEYWORDS_EN = [
  'suicide', 'kill myself', 'end my life', 'want to die',
  'self harm', 'cut myself', 'overdose', 'nobody needs me',
];

const ALL_KEYWORDS = [
  ...CRISIS_KEYWORDS_AZ,
  ...CRISIS_KEYWORDS_RU,
  ...CRISIS_KEYWORDS_EN,
];

/** Mandatory safety message — appended regardless of persona */
export const CRISIS_SAFETY_MESSAGE =
  `\n\n🆘 **Mən sənin yanındayam.**\n\n` +
  `Amma bu vəziyyətdə mütəxəssis köməyi çox vacibdir.\n\n` +
  `📞 **Böhran xətti: 860-510-510** (Azərbaycan)\n` +
  `📞 Uşaq və yeniyetmə xətti: 116-111\n\n` +
  `Sən tək deyilsən. Kömək mövcuddur. ❤️`;

@Injectable()
export class CrisisDetectorService {
  private readonly logger = new Logger(CrisisDetectorService.name);

  /**
   * Fast keyword-based crisis check.
   * Returns true if ANY crisis keyword is found.
   */
  containsCrisisKeywords(text: string): boolean {
    const lower = text.toLowerCase();
    return ALL_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Get all matched crisis keywords (for logging/analytics).
   */
  getMatchedKeywords(text: string): string[] {
    const lower = text.toLowerCase();
    return ALL_KEYWORDS.filter((kw) => lower.includes(kw));
  }

  /**
   * Build the mandatory safety response.
   * This message is ALWAYS appended during a crisis, regardless of persona.
   */
  buildSafetyResponse(llmResponse: string): string {
    return llmResponse + CRISIS_SAFETY_MESSAGE;
  }

  /**
   * Log crisis detection for audit/analytics.
   */
  logCrisisDetection(
    userId: string,
    keywords: string[],
    severity: string,
  ): void {
    this.logger.warn(
      `🆘 CRISIS DETECTED | user:${userId.slice(0, 8)} | severity:${severity} | keywords:[${keywords.join(', ')}]`,
    );
  }
}
