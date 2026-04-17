import { Module } from '@nestjs/common';
import { AlertingModule } from '../alerting/alerting.module';
import { CREDIT_REPOSITORY } from './domain/ports/credit.repository.port';
import { PrismaCreditRepository } from './infrastructure/adapters/prisma-credit.repository';
import { GetBalanceUseCase } from './domain/use-cases/get-balance.use-case';
import { DeductCreditsUseCase } from './domain/use-cases/deduct-credits.use-case';
import { AddCreditsUseCase } from './domain/use-cases/add-credits.use-case';
import { GiftCreditsUseCase } from './domain/use-cases/gift-credits.use-case';
import { GetTransactionHistoryUseCase } from './domain/use-cases/get-transaction-history.use-case';
import { StripeAdapter } from './infrastructure/adapters/stripe.adapter';
import { StripeWebhookController } from './infrastructure/controllers/stripe-webhook.controller';
import { SubscriptionService } from './domain/services/subscription.service';

@Module({
  imports: [AlertingModule],
  controllers: [StripeWebhookController],
  providers: [
    { provide: CREDIT_REPOSITORY, useClass: PrismaCreditRepository },
    GetBalanceUseCase,
    DeductCreditsUseCase,
    AddCreditsUseCase,
    GiftCreditsUseCase,
    GetTransactionHistoryUseCase,
    StripeAdapter,
    SubscriptionService,
  ],
  exports: [
    GetBalanceUseCase,
    DeductCreditsUseCase,
    AddCreditsUseCase,
    GiftCreditsUseCase,
    GetTransactionHistoryUseCase,
    StripeAdapter,
    SubscriptionService,
  ],
})
export class BillingModule {}
