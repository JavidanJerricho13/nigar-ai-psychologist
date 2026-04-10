import type { StepOutput, UserInput } from '@nigar/shared-types';

export interface CommandRequest {
  userId: string;
  telegramId?: string;
  command: string;
  /** Raw payload — text input, callback data, etc. */
  payload?: string;
  /** Structured input for FSM steps */
  userInput?: UserInput;
  /** Deep link parameter (e.g., referral code from /start REF_CODE) */
  deepLinkParam?: string;
}

export interface CommandResponse {
  /** Primary text/UI output to send back to the adapter */
  output: StepOutput;
  /** Whether this was an onboarding step */
  isOnboarding: boolean;
  /** Whether onboarding just completed */
  onboardingCompleted?: boolean;
  /** Current onboarding step ID (if in onboarding) */
  currentStep?: string;
  /** Any extra data the adapter might need */
  meta?: Record<string, unknown>;
}
