import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { StripeAdapter } from '../adapters/stripe.adapter';
import { AddCreditsUseCase } from '../../domain/use-cases/add-credits.use-case';
import { TelegramAdminNotifierService } from '../../../alerting/services/telegram-admin-notifier.service';

/**
 * Stripe webhook controller.
 * CRITICAL: Requires raw body for signature verification.
 * Must be registered with rawBody: true in NestFactory.create().
 */
@Controller('webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeAdapter: StripeAdapter,
    private readonly addCredits: AddCreditsUseCase,
    private readonly notifier: TelegramAdminNotifierService,
  ) {}

  @Post('stripe')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ): Promise<void> {
    if (!this.stripeAdapter.isConfigured) {
      res.status(400).json({ error: 'Stripe not configured' });
      return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('No raw body available — enable rawBody in NestFactory');
      res.status(400).json({ error: 'No raw body' });
      return;
    }

    try {
      const event = this.stripeAdapter.constructEvent(rawBody, signature);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const userId = session.metadata?.userId;
        const credits = parseInt(session.metadata?.credits ?? '0', 10);

        if (userId && credits > 0) {
          await this.addCredits.execute({
            userId,
            amount: credits,
            type: 'purchase',
            description: `Stripe ödəniş: ${credits} kredit (session: ${session.id})`,
          });

          this.logger.log(
            `💳 Payment processed: ${credits} credits for user ${userId.slice(0, 8)} (session: ${session.id})`,
          );
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        // 6.3 — alert admin on failed payment
        const intent = event.data.object as any;
        const reason: string =
          intent.last_payment_error?.message ??
          intent.last_payment_error?.code ??
          'unknown';
        const userId: string | undefined = intent.metadata?.userId;

        this.logger.warn(
          `Stripe payment failed: intent=${intent.id} user=${userId ?? '?'} reason=${reason}`,
        );

        await this.notifier.sendStripeFailure({
          userId,
          amountCents: intent.amount,
          currency: intent.currency,
          reason,
          paymentIntentId: intent.id,
        });
      }

      res.status(200).json({ received: true });
    } catch (err) {
      this.logger.error(`Webhook error: ${(err as Error).message}`);
      res.status(400).json({ error: (err as Error).message });
    }
  }
}
