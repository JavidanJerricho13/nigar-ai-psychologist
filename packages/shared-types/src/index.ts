// ===================== ENUMS =====================

export enum ActiveRole {
  NIGAR = 'nigar',
  NIGAR_BLACK = 'nigar_black',
  SUPER_NIGAR = 'super_nigar',
  NIGAR_DOST = 'nigar_dost',
  NIGAR_TRAINER = 'nigar_trainer',
  NIGAR_18PLUS = 'nigar_18plus',
}

export enum ResponseFormat {
  VOICE = 'voice',
  TEXT = 'text',
  VOICE_AND_TEXT = 'voice_and_text',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  SKIP = 'skip',
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum TransactionType {
  PURCHASE = 'purchase',
  SPEND = 'spend',
  GIFT = 'gift',
  REFERRAL_BONUS = 'referral_bonus',
}

export enum SubscriptionTier {
  FREE = 'free',
  PREMIUM = 'premium',
  PREMIUM_PLUS = 'premium_plus',
}

// ===================== ONBOARDING FSM =====================

export interface ButtonOption {
  id: string;
  label: string;
  value: string;
}

export interface StepOutput {
  text: string;
  imageUrl?: string;
  audioUrl?: string;
  options?: ButtonOption[];
  inputType: 'button' | 'text' | 'text_or_button';
  validation?: { maxLength?: number };
}

export interface UserInput {
  type: 'command' | 'text' | 'callback' | 'voice';
  value: string;
  raw?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errorOutput?: StepOutput;
}

export interface OnboardingStateData {
  currentStep: string;
  stepData: Record<string, unknown>;
  completedSteps: string[];
}

// ===================== COMMAND ROUTER =====================

export interface CommandPayload {
  type: 'command' | 'message' | 'voice' | 'callback';
  userId: string;
  telegramId?: string;
  value: string;
  audioBuffer?: Uint8Array;
  metadata?: Record<string, unknown>;
}

export interface CommandResult {
  output: StepOutput;
  newState?: OnboardingStateData;
  audioUrl?: string;
}

// ===================== LLM =====================

export interface LlmMessage {
  role: MessageRole;
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  persona: ActiveRole;
  userId: string;
  stream?: boolean;
}

export interface LlmResponse {
  content: string;
  tokensUsed: number;
  provider: string;
  model: string;
}
