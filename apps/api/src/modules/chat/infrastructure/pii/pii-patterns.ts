/**
 * AZ-specific PII patterns for the Azerbaijani market.
 *
 * Patterns to detect and mask:
 * - Phone numbers: +994, 050/051/055/070/077/010/099 formats
 * - Email addresses
 * - FIN codes (Azerbaijani national ID, 7 alphanumeric chars)
 * - Physical addresses (street/city patterns)
 */

export interface PiiPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

export const PII_PATTERNS: PiiPattern[] = [
  // Azerbaijani phone numbers
  // +994 XX XXX XX XX (international format)
  {
    name: 'phone_international',
    regex: /\+994[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g,
    replacement: '[TELEFON]',
  },
  // 0XX XXX XX XX (local format: 050, 051, 055, 070, 077, 010, 099, 012)
  {
    name: 'phone_local',
    regex: /\b0(?:50|51|55|70|77|10|99|12)[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g,
    replacement: '[TELEFON]',
  },
  // Just the number part without leading 0: 50/55/70/77 XXX XX XX
  {
    name: 'phone_short',
    regex: /\b(?:50|51|55|70|77)[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g,
    replacement: '[TELEFON]',
  },

  // Email addresses
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAİL]',
  },

  // Azerbaijani FIN code (7 alphanumeric chars, typically uppercase)
  // Format: 1A2B3C4 or similar
  {
    name: 'fin_code',
    regex: /\bFIN[\s:]*[A-Z0-9]{7}\b/gi,
    replacement: '[FIN]',
  },
  // Standalone 7-char alphanumeric that looks like a FIN (only if preceded by context words)
  {
    name: 'fin_context',
    regex: /(?:fin\s*kod(?:u|um)?|şəxsiyyət|vəsiqə)[\s:]*([A-Z0-9]{7})\b/gi,
    replacement: '[FIN]',
  },

  // Azerbaijani ID card number (AZE + 8 digits)
  {
    name: 'id_card',
    regex: /\bAZE\d{8}\b/g,
    replacement: '[ŞƏXSİYYƏT_NO]',
  },

  // Credit card numbers (16 digits with optional spaces/dashes)
  {
    name: 'credit_card',
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '[KART]',
  },

  // Addresses — Baku district/street patterns
  {
    name: 'address_baku',
    regex: /(?:küç(?:əsi)?|prospekt(?:i)?|mhə?|məhəllə(?:si)?)\s*\.?\s*[\wƏəÖöÜüŞşÇçĞğIıİi]+(?:\s+\d+)?/gi,
    replacement: '[ÜNVAN]',
  },
];
