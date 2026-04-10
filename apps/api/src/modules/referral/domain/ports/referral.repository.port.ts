export const REFERRAL_REPOSITORY = 'REFERRAL_REPOSITORY';

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referredId: string;
  bonusCredited: boolean;
  createdAt: Date;
}

export interface ReferralStats {
  totalReferred: number;
  bonusCredited: number;
  referralCode: string;
}

export interface ReferralRepositoryPort {
  findByReferredId(referredId: string): Promise<ReferralRecord | null>;
  create(referrerId: string, referredId: string): Promise<ReferralRecord>;
  markBonusCredited(id: string): Promise<void>;
  getStats(userId: string): Promise<ReferralStats>;
  getUserReferralCode(userId: string): Promise<string>;
}
