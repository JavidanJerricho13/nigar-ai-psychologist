export class User {
  readonly id: string;
  readonly telegramId: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly isActive: boolean;
  readonly referralCode: string;
  readonly referredBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(params: {
    id: string;
    telegramId?: string | null;
    phone?: string | null;
    email?: string | null;
    isActive?: boolean;
    referralCode: string;
    referredBy?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = params.id;
    this.telegramId = params.telegramId ?? null;
    this.phone = params.phone ?? null;
    this.email = params.email ?? null;
    this.isActive = params.isActive ?? true;
    this.referralCode = params.referralCode;
    this.referredBy = params.referredBy ?? null;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }
}
