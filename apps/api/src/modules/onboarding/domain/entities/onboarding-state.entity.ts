export class OnboardingState {
  userId: string;
  currentStep: string;
  stepData: Record<string, unknown>;
  completedSteps: string[];
  privacyAccepted: boolean;
  startedAt: Date;
  completedAt: Date | null;

  constructor(params: {
    userId: string;
    currentStep?: string;
    stepData?: Record<string, unknown>;
    completedSteps?: string[];
    privacyAccepted?: boolean;
    startedAt?: Date;
    completedAt?: Date | null;
  }) {
    this.userId = params.userId;
    this.currentStep = params.currentStep ?? 'greeting';
    this.stepData = params.stepData ?? {};
    this.completedSteps = params.completedSteps ?? [];
    this.privacyAccepted = params.privacyAccepted ?? false;
    this.startedAt = params.startedAt ?? new Date();
    this.completedAt = params.completedAt ?? null;
  }

  get isCompleted(): boolean {
    return this.completedAt !== null;
  }

  advance(nextStepId: string, extractedData: Record<string, unknown>): void {
    this.completedSteps.push(this.currentStep);
    this.stepData = { ...this.stepData, ...extractedData };
    this.currentStep = nextStepId;
  }

  complete(): void {
    this.completedSteps.push(this.currentStep);
    this.currentStep = 'completed';
    this.completedAt = new Date();
  }

  acceptPrivacy(): void {
    this.privacyAccepted = true;
  }
}
