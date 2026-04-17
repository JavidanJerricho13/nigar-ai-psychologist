export const OUTREACH_QUEUE = 'outreach';

export interface OutreachJobData {
  userId: string;
  type: 'check_in' | 'crisis_follow_up' | 'milestone' | 'weekly_mood';
  conversationId?: string;
  milestoneDay?: number;
}
