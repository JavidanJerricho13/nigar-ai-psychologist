import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

/**
 * Guard that validates the Telegram webhook secret token.
 * Ensures only Telegram's official servers can hit the webhook endpoint.
 *
 * Telegram sends the secret in the header: X-Telegram-Bot-Api-Secret-Token
 */
@Injectable()
export class WebhookSecretGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSecretGuard.name);
  private readonly secret: string;

  constructor() {
    this.secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.secret) {
      // No secret configured — skip validation (dev mode)
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const headerSecret = request.headers['x-telegram-bot-api-secret-token'];

    if (headerSecret !== this.secret) {
      this.logger.warn(
        `Webhook request rejected: invalid secret from ${request.ip}`,
      );
      throw new ForbiddenException('Invalid webhook secret');
    }

    return true;
  }
}
