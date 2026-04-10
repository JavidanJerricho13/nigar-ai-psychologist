export class BillingException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingException';
  }
}

export class InsufficientBalanceException extends BillingException {
  constructor(userId: string, required: number, available: number) {
    super(
      `Insufficient balance for user ${userId}: need ${required}, have ${available}`,
    );
    this.name = 'InsufficientBalanceException';
  }
}
