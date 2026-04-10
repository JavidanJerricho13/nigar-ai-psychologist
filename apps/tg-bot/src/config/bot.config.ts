import { z } from 'zod';

export enum BotMode {
  POLLING = 'polling',
  WEBHOOK = 'webhook',
}

const botEnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  BOT_MODE: z.nativeEnum(BotMode).default(BotMode.POLLING),
  WEBHOOK_DOMAIN: z.string().optional(),
  WEBHOOK_PATH: z.string().default('/webhook/telegram'),
  WEBHOOK_PORT: z.coerce.number().default(3001),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
});

export type BotEnvConfig = z.infer<typeof botEnvSchema>;

export function loadBotConfig(): BotEnvConfig {
  const result = botEnvSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Bot config validation failed:\n${formatted}`);
  }
  return result.data;
}

export const BOT_CONFIG = 'BOT_CONFIG';
