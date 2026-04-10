import { Module } from '@nestjs/common';
import { CREDIT_REPOSITORY } from './domain/ports/credit.repository.port';
import { PrismaCreditRepository } from './infrastructure/adapters/prisma-credit.repository';
import { GetBalanceUseCase } from './domain/use-cases/get-balance.use-case';
import { DeductCreditsUseCase } from './domain/use-cases/deduct-credits.use-case';
import { AddCreditsUseCase } from './domain/use-cases/add-credits.use-case';

@Module({
  providers: [
    { provide: CREDIT_REPOSITORY, useClass: PrismaCreditRepository },
    GetBalanceUseCase,
    DeductCreditsUseCase,
    AddCreditsUseCase,
  ],
  exports: [GetBalanceUseCase, DeductCreditsUseCase, AddCreditsUseCase],
})
export class BillingModule {}
