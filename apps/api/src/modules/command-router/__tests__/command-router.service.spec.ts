import { CommandRouterService } from '../command-router.service';
import { UnknownCommandException } from '../domain/command.exceptions';
import { COMMAND_MAP, COMMAND_REGISTRY } from '../domain/command.registry';

// Mocks for all injected use cases
const mockAdvanceStep = {
  execute: jest.fn().mockResolvedValue({
    output: { text: 'Greeting step', inputType: 'button', options: [] },
    completed: false,
    currentStep: 'greeting',
  }),
  getInitialPrompt: jest.fn(),
};

const mockGetOnboardingStatus = {
  execute: jest.fn(),
};

const mockIdentifyUser = {
  execute: jest.fn().mockResolvedValue({
    user: { id: 'user-1', referralCode: 'REF123' },
    isNew: false,
  }),
};

const mockGetFullProfile = {
  execute: jest.fn().mockResolvedValue({
    user: { id: 'user-1', referralCode: 'REF123' },
    profile: { name: 'Əli', gender: 'male', age: 25, bio: 'Test' },
    settings: { activeRole: 'nigar', responseFormat: 'text', nigarBlackRudenessEnabled: false },
  }),
  executeByTelegramId: jest.fn(),
};

const mockUpdateSettings = { execute: jest.fn().mockResolvedValue({}) };
const mockUpdateProfile = { execute: jest.fn().mockResolvedValue({}) };
const mockGetBalance = {
  execute: jest.fn().mockResolvedValue({
    userId: 'user-1', balance: 50, freeVoiceRemaining: 2, totalPurchased: 100, totalSpent: 50,
  }),
};
const mockGetReferralInfo = {
  execute: jest.fn().mockResolvedValue({
    totalReferred: 3, bonusCredited: 2, referralCode: 'REF123',
  }),
};
const mockApplyReferral = { execute: jest.fn().mockResolvedValue({ success: true }) };
const mockSendMessage = {
  execute: jest.fn().mockResolvedValue({
    reply: 'AI cavab', conversationId: 'conv-1', tokensUsed: 50, provider: 'groq', model: 'llama-3.3-70b', isCrisis: false,
  }),
};
const mockSynthesizeSpeech = {
  execute: jest.fn().mockResolvedValue({ buffer: Buffer.from('ogg'), oggPath: '/tmp/t.ogg', durationSeconds: 3, creditsRemaining: 2 }),
  cleanup: jest.fn(),
};
const mockTransactionHistory = { execute: jest.fn().mockResolvedValue([]) };
const mockStripeAdapter = { isConfigured: false };
const mockSession = { clearConversationContext: jest.fn() };

function createRouter(overrides?: Partial<Record<string, any>>): CommandRouterService {
  return new CommandRouterService(
    overrides?.advanceStep ?? mockAdvanceStep as any,
    overrides?.getOnboardingStatus ?? mockGetOnboardingStatus as any,
    overrides?.identifyUser ?? mockIdentifyUser as any,
    overrides?.getFullProfile ?? mockGetFullProfile as any,
    overrides?.updateSettings ?? mockUpdateSettings as any,
    overrides?.updateProfile ?? mockUpdateProfile as any,
    overrides?.getBalance ?? mockGetBalance as any,
    overrides?.getReferralInfo ?? mockGetReferralInfo as any,
    overrides?.applyReferral ?? mockApplyReferral as any,
    overrides?.sendMessage ?? mockSendMessage as any,
    overrides?.synthesizeSpeech ?? mockSynthesizeSpeech as any,
    overrides?.transactionHistory ?? mockTransactionHistory as any,
    overrides?.stripeAdapter ?? mockStripeAdapter as any,
    overrides?.session ?? mockSession as any,
  );
}

describe('CommandRouterService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: onboarding completed
    mockGetOnboardingStatus.execute.mockResolvedValue({
      completed: true,
      currentStep: null,
      stepsCompleted: 13,
    });
  });

  describe('/start → onboarding', () => {
    it('should route /start to onboarding for new users', async () => {
      mockIdentifyUser.execute.mockResolvedValueOnce({
        user: { id: 'user-new' },
        isNew: true,
      });
      mockGetOnboardingStatus.execute.mockResolvedValueOnce({
        completed: false,
        currentStep: null,
        stepsCompleted: 0,
      });

      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/start',
      });

      expect(result.isOnboarding).toBe(true);
      expect(mockAdvanceStep.execute).toHaveBeenCalled();
    });

    it('should route /start to onboarding for users in the middle of it', async () => {
      mockGetOnboardingStatus.execute.mockResolvedValueOnce({
        completed: false,
        currentStep: 'ask_name',
        stepsCompleted: 5,
      });

      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/start',
      });

      expect(result.isOnboarding).toBe(true);
    });
  });

  describe('onboarding interception', () => {
    it('should route free text to FSM when user is in onboarding', async () => {
      mockGetOnboardingStatus.execute.mockResolvedValueOnce({
        completed: false,
        currentStep: 'ask_name',
        stepsCompleted: 5,
      });

      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: 'Cavidan',  // Free text, not a command
      });

      expect(result.isOnboarding).toBe(true);
      expect(mockAdvanceStep.execute).toHaveBeenCalled();
    });

    it('should block non-available commands during onboarding', async () => {
      mockGetOnboardingStatus.execute.mockResolvedValueOnce({
        completed: false,
        currentStep: 'ask_name',
        stepsCompleted: 5,
      });

      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/balance',
      });

      expect(result.output.text).toContain('tanışlığı tamamla');
      expect(result.isOnboarding).toBe(true);
    });

    it('should allow /support during onboarding', async () => {
      mockGetOnboardingStatus.execute.mockResolvedValueOnce({
        completed: false,
        currentStep: 'ask_name',
        stepsCompleted: 5,
      });

      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/support',
      });

      // /support has availableDuringOnboarding: true, handler: 'stub:support'
      expect(result.output.text).toContain('tezliklə');
    });
  });

  describe('/balance', () => {
    it('should return balance info', async () => {
      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/balance',
      });

      expect(result.output.text).toContain('Balans');
      expect(result.isOnboarding).toBe(false);
    });
  });

  describe('/roles', () => {
    it('should list all available roles', async () => {
      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/roles',
      });

      expect(result.output.text).toContain('Nigar Black');
      expect(result.output.text).toContain('Super Nigar');
      expect(result.output.options!.length).toBeGreaterThan(3);
    });
  });

  describe('/info', () => {
    it('should show user profile', async () => {
      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/info',
      });

      expect(result.output.text).toContain('Əli');
      expect(result.output.text).toContain('Kişi');
      expect(result.output.text).toContain('25');
    });
  });

  describe('/other', () => {
    it('should list all commands', async () => {
      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/other',
      });

      expect(result.output.text).toContain('/roles');
      expect(result.output.text).toContain('/balance');
      expect(result.output.text).toContain('/settings');
    });
  });

  describe('/format', () => {
    it('should show format selection when no payload', async () => {
      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/format',
      });

      expect(result.output.options!.length).toBe(3);
      expect(result.output.text).toContain('formatını seç');
    });

    it('should change format when payload provided', async () => {
      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: '/format',
        payload: 'voice',
      });

      expect(mockUpdateSettings.execute).toHaveBeenCalledWith(
        expect.objectContaining({ responseFormat: 'voice' }),
      );
      expect(result.output.text).toContain('Səs');
    });
  });

  describe('stub commands', () => {
    it('should return stub response for unimplemented features', async () => {
      const stubs = ['topics', 'art', 'progress', 'image', 'tales'];
      const router = createRouter();

      for (const cmd of stubs) {
        const result = await router.dispatch({
          userId: 'tg-123',
          telegramId: 'tg-123',
          command: `/${cmd}`,
        });
        expect(result.output.text).toContain('tezliklə');
      }
    });
  });

  describe('unknown commands', () => {
    it('should throw UnknownCommandException for truly unknown commands', async () => {
      const router = createRouter();

      await expect(
        router.dispatch({
          userId: 'tg-123',
          telegramId: 'tg-123',
          command: '/totally_unknown',
        }),
      ).rejects.toThrow(UnknownCommandException);
    });
  });

  describe('free text when not in onboarding', () => {
    it('should route to SendMessageUseCase for AI chat', async () => {
      const router = createRouter();
      const result = await router.dispatch({
        userId: 'tg-123',
        telegramId: 'tg-123',
        command: 'Salam, necəsən?',
      });

      expect(mockSendMessage.execute).toHaveBeenCalled();
      expect(result.output.text).toBe('AI cavab');
      expect(result.isOnboarding).toBe(false);
      expect(result.meta?.provider).toBe('groq');
    });
  });

  describe('command registry', () => {
    it('should have all required commands registered', () => {
      const required = [
        'start', 'balance', 'referral', 'pay', 'roles', 'topics',
        'gift', 'settings', 'nigar_files', 'image', 'tales', 'art',
        'progress', 'credits', 'support', 'about_company', 'b2b', 'other',
      ];

      for (const cmd of required) {
        expect(COMMAND_MAP.has(cmd)).toBe(true);
      }
    });
  });
});
