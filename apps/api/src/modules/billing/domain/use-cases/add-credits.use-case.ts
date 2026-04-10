import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  CREDIT_REPOSITORY,
  CreditRepositoryPort,
} from '../ports/credit.repository.port';

export interface AddCreditsInput {
  userId: string;
  amount: number;
  type: 'purchase' | 'gift' | 'referral_bonus';
  description: string;
}

@Injectable()
export class AddCreditsUseCase {
  private readonly logger = new Logger(AddCreditsUseCase.name);

  constructor(
    @Inject(CREDIT_REPOSITORY) private readonly repo: CreditRepositoryPort,
  ) {}

  async execute(input: AddCreditsInput): Promise<number> {
    const newBalance = await this.repo.add(
      input.userId,
      input.amount,
      input.type,
      input.description,
    );
    this.logger.log(
      `Added ${input.amount} (${input.type}) to ${input.userId.slice(0, 8)}, new balance: ${newBalance}`,
    );
    return newBalance;
  }
}
