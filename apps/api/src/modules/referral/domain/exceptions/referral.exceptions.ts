export class ReferralException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferralException';
  }
}

export class SelfReferralException extends ReferralException {
  constructor() {
    super('Özünü referal etmək olmaz');
    this.name = 'SelfReferralException';
  }
}

export class AlreadyReferredException extends ReferralException {
  constructor(userId: string) {
    super(`User ${userId} artıq referal olunub`);
    this.name = 'AlreadyReferredException';
  }
}

export class ReferrerNotFoundException extends ReferralException {
  constructor(code: string) {
    super(`Referal kodu tapılmadı: ${code}`);
    this.name = 'ReferrerNotFoundException';
  }
}
