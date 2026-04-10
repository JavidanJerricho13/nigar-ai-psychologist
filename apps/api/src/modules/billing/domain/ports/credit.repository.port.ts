export const CREDIT_REPOSITORY = 'CREDIT_REPOSITORY';

export interface CreditBalance {
  userId: string;
  balance: number;
  freeVoiceRemaining: number;
  totalPurchased: number;
  totalSpent: number;
}

export interface CreditRepositoryPort {
  getBalance(userId: string): Promise<CreditBalance>;
  ensureExists(userId: string): Promise<void>;
  /** Atomic deduct from balance. Returns new balance. Throws if insufficient. */
  deduct(userId: string, amount: number, description: string): Promise<number>;
  /** Atomic add to balance. Returns new balance. */
  add(userId: string, amount: number, type: string, description: string): Promise<number>;
  /** Deduct 1 free voice credit. Returns remaining. -1 if none left. */
  deductFreeVoice(userId: string): Promise<number>;
}
