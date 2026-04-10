import { Injectable, Inject } from '@nestjs/common';
import {
  CREDIT_REPOSITORY,
  CreditRepositoryPort,
  CreditBalance,
} from '../ports/credit.repository.port';

@Injectable()
export class GetBalanceUseCase {
  constructor(
    @Inject(CREDIT_REPOSITORY) private readonly repo: CreditRepositoryPort,
  ) {}

  async execute(userId: string): Promise<CreditBalance> {
    return this.repo.getBalance(userId);
  }
}
