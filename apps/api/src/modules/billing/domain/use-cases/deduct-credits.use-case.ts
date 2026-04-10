import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  CREDIT_REPOSITORY,
  CreditRepositoryPort,
} from '../ports/credit.repository.port';

export interface DeductCreditsInput {
  userId: string;
  amount: number;
  description: string;
}

@Injectable()
export class DeductCreditsUseCase {
  private readonly logger = new Logger(DeductCreditsUseCase.name);

  constructor(
    @Inject(CREDIT_REPOSITORY) private readonly repo: CreditRepositoryPort,
  ) {}

  async execute(input: DeductCreditsInput): Promise<number> {
    const newBalance = await this.repo.deduct(
      input.userId,
      input.amount,
      input.description,
    );
    this.logger.log(
      `Deducted ${input.amount} from ${input.userId.slice(0, 8)}, new balance: ${newBalance}`,
    );
    return newBalance;
  }
}
