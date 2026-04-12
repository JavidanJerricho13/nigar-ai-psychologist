import { Controller, Post, Headers, HttpCode, HttpException, HttpStatus } from '@nestjs/common';
import { CrisisSummaryCron } from '../cron/crisis-summary.cron';
import { TelegramAdminNotifierService } from '../services/telegram-admin-notifier.service';

/**
 * Internal endpoints to manually trigger alerts for verification.
 *
 * Protected by ALERT_DEBUG_TOKEN — set the env var and pass it via x-debug-token.
 * If ALERT_DEBUG_TOKEN is unset, all endpoints return 404 (the controller refuses
 * to operate without an explicit secret to avoid accidentally exposing alert spam).
 */
@Controller('internal/alerts')
export class AlertsDebugController {
  constructor(
    private readonly cron: CrisisSummaryCron,
    private readonly notifier: TelegramAdminNotifierService,
  ) {}

  private assertToken(token: string | undefined): void {
    const expected = process.env.ALERT_DEBUG_TOKEN;
    if (!expected) {
      throw new HttpException('Not found', HttpStatus.NOT_FOUND);
    }
    if (!token || token !== expected) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  /** Triggers the daily crisis summary on demand. */
  @Post('crisis-summary')
  @HttpCode(200)
  async triggerCrisisSummary(@Headers('x-debug-token') token: string) {
    this.assertToken(token);
    await this.cron.runManually();
    return { ok: true, enabled: this.notifier.isEnabled };
  }

  /** Sends a free-form ping to verify the Telegram channel works at all. */
  @Post('ping')
  @HttpCode(200)
  async ping(@Headers('x-debug-token') token: string) {
    this.assertToken(token);
    const sent = await this.notifier.sendText(
      `🧪 <b>Alerting smoke test</b>\nPing from <code>${process.env.NODE_ENV ?? 'dev'}</code> at ${new Date().toISOString()}`,
    );
    return { ok: true, sent, enabled: this.notifier.isEnabled };
  }
}
