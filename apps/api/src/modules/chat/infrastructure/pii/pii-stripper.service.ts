import { Injectable, Logger } from '@nestjs/common';
import { PII_PATTERNS, PiiPattern } from './pii-patterns';

export interface PiiStrippingResult {
  /** Cleaned text with PII replaced by tokens */
  cleaned: string;
  /** Number of PII items found and stripped */
  strippedCount: number;
  /** Types of PII found */
  foundTypes: string[];
}

/**
 * Strips Personally Identifiable Information from text before sending to LLMs.
 * Focused on Azerbaijani market patterns (phones, FIN codes, addresses).
 */
@Injectable()
export class PiiStripperService {
  private readonly logger = new Logger(PiiStripperService.name);

  strip(text: string): PiiStrippingResult {
    let cleaned = text;
    let strippedCount = 0;
    const foundTypes: string[] = [];

    for (const pattern of PII_PATTERNS) {
      const matches = cleaned.match(pattern.regex);
      if (matches && matches.length > 0) {
        strippedCount += matches.length;
        foundTypes.push(pattern.name);
        cleaned = cleaned.replace(pattern.regex, pattern.replacement);
      }
    }

    if (strippedCount > 0) {
      this.logger.log(
        `Stripped ${strippedCount} PII items (${foundTypes.join(', ')})`,
      );
    }

    return { cleaned, strippedCount, foundTypes };
  }

  /** Check if text contains any PII without modifying it */
  containsPii(text: string): boolean {
    return PII_PATTERNS.some((p) => p.regex.test(text));
  }
}
