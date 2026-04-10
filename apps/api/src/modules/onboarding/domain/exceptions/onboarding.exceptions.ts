export class OnboardingException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnboardingException';
  }
}

export class InvalidStepInputException extends OnboardingException {
  constructor(stepId: string, reason: string) {
    super(`Invalid input at step "${stepId}": ${reason}`);
    this.name = 'InvalidStepInputException';
  }
}

export class StepNotFoundException extends OnboardingException {
  constructor(stepId: string) {
    super(`Step "${stepId}" not found in the FSM registry`);
    this.name = 'StepNotFoundException';
  }
}

export class OnboardingAlreadyCompletedException extends OnboardingException {
  constructor(userId: string) {
    super(`Onboarding already completed for user "${userId}"`);
    this.name = 'OnboardingAlreadyCompletedException';
  }
}
