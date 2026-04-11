import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export interface CreditPackage {
  id: string;
  credits: number;
  priceAzn: number;
  priceCents: number;
  label: string;
}

export const CREDIT_PACKAGES: CreditPackage[] = [
  { id: 'pack_10', credits: 10, priceAzn: 3.40, priceCents: 340, label: '10 kredit — 3.40 AZN' },
  { id: 'pack_50', credits: 50, priceAzn: 13.60, priceCents: 1360, label: '50 kredit — 13.60 AZN' },
  { id: 'pack_100', credits: 100, priceAzn: 25.50, priceCents: 2550, label: '100 kredit — 25.50 AZN' },
];

@Injectable()
export class StripeAdapter {
  private readonly logger = new Logger(StripeAdapter.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('stripe.secretKey', '');
    this.webhookSecret = this.config.get<string>('stripe.webhookSecret', '');

    this.stripe = secretKey
      ? new Stripe(secretKey, { apiVersion: '2025-04-30.basil' as any })
      : null;

    if (!this.stripe) {
      this.logger.warn('Stripe not configured — payments disabled');
    }
  }

  get isConfigured(): boolean {
    return !!this.stripe;
  }

  async createCheckoutSession(
    userId: string,
    pkg: CreditPackage,
    botUsername: string,
  ): Promise<string> {
    if (!this.stripe) throw new Error('Stripe not configured');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'azn',
            unit_amount: pkg.priceCents,
            product_data: {
              name: `Nigar AI — ${pkg.credits} kredit`,
              description: `${pkg.credits} kredit paketi`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        credits: String(pkg.credits),
        packageId: pkg.id,
      },
      success_url: `https://t.me/${botUsername}?start=payment_success`,
      cancel_url: `https://t.me/${botUsername}?start=payment_cancel`,
    });

    this.logger.log(
      `Checkout session created: ${session.id} | ${pkg.credits} credits for user ${userId.slice(0, 8)}`,
    );

    return session.url!;
  }

  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    if (!this.stripe) throw new Error('Stripe not configured');
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }
}
