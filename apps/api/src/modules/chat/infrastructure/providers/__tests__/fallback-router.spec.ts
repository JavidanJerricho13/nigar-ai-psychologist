import { FallbackRouter } from '../fallback-router';
import { ActiveRole } from '@nigar/shared-types';
import type {
  LlmProviderPort,
  LlmCompletionResponse,
} from '../../../domain/ports/llm-provider.port';

function mockProvider(
  name: string,
  overrides: Partial<LlmProviderPort> = {},
): jest.Mocked<LlmProviderPort> {
  const defaultResponse: LlmCompletionResponse = {
    content: `Response from ${name}`,
    tokensUsed: 100,
    model: 'test-model',
    provider: name,
    finishReason: 'stop',
  };

  return {
    name,
    complete: jest.fn().mockResolvedValue(defaultResponse),
    isAvailable: jest.fn().mockResolvedValue(true),
    ...overrides,
  } as any;
}

describe('FallbackRouter', () => {
  let openai: jest.Mocked<LlmProviderPort>;
  let anthropic: jest.Mocked<LlmProviderPort>;
  let gemini: jest.Mocked<LlmProviderPort>;
  let router: FallbackRouter;

  const baseRequest = {
    messages: [{ role: 'user' as const, content: 'Salam' }],
  };

  beforeEach(() => {
    openai = mockProvider('openai');
    anthropic = mockProvider('anthropic');
    gemini = mockProvider('gemini');
    router = new FallbackRouter(openai as any, anthropic as any, gemini as any);
  });

  describe('default routing (Nigar persona)', () => {
    it('should use OpenAI as primary with gpt-4o-mini', async () => {
      const result = await router.complete(baseRequest, ActiveRole.NIGAR);

      expect(openai.complete).toHaveBeenCalledTimes(1);
      expect(openai.complete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o-mini' }),
      );
      expect(result.provider).toBe('openai');
      expect(anthropic.complete).not.toHaveBeenCalled();
      expect(gemini.complete).not.toHaveBeenCalled();
    });

    it('should use default persona when none specified', async () => {
      await router.complete(baseRequest);
      expect(openai.complete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o-mini' }),
      );
    });
  });

  describe('fallback behavior', () => {
    it('should fallback to Anthropic when OpenAI fails', async () => {
      openai.complete.mockRejectedValue(new Error('OpenAI 500'));

      const result = await router.complete(baseRequest);

      expect(openai.complete).toHaveBeenCalledTimes(1);
      expect(anthropic.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('anthropic');
    });

    it('should fallback to Gemini when OpenAI and Anthropic both fail', async () => {
      openai.complete.mockRejectedValue(new Error('OpenAI down'));
      anthropic.complete.mockRejectedValue(new Error('Anthropic down'));

      const result = await router.complete(baseRequest);

      expect(openai.complete).toHaveBeenCalledTimes(1);
      expect(anthropic.complete).toHaveBeenCalledTimes(1);
      expect(gemini.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('gemini');
    });

    it('should throw when ALL providers fail', async () => {
      openai.complete.mockRejectedValue(new Error('OpenAI down'));
      anthropic.complete.mockRejectedValue(new Error('Anthropic down'));
      gemini.complete.mockRejectedValue(new Error('Gemini down'));

      await expect(router.complete(baseRequest)).rejects.toThrow(
        'All LLM providers failed',
      );
    });

    it('should skip unavailable providers', async () => {
      openai.isAvailable.mockResolvedValue(false);

      const result = await router.complete(baseRequest);

      expect(openai.complete).not.toHaveBeenCalled();
      expect(anthropic.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('anthropic');
    });

    it('should throw when no providers are available', async () => {
      openai.isAvailable.mockResolvedValue(false);
      anthropic.isAvailable.mockResolvedValue(false);
      gemini.isAvailable.mockResolvedValue(false);

      await expect(router.complete(baseRequest)).rejects.toThrow(
        'No LLM providers available',
      );
    });
  });

  describe('Super Nigar routing', () => {
    it('should use Anthropic as primary with Claude Sonnet', async () => {
      const result = await router.complete(baseRequest, ActiveRole.SUPER_NIGAR);

      expect(anthropic.complete).toHaveBeenCalledTimes(1);
      expect(anthropic.complete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-sonnet-4-5-20250514' }),
      );
      expect(openai.complete).not.toHaveBeenCalled();
      expect(result.provider).toBe('anthropic');
    });

    it('should fallback to OpenAI when Anthropic fails for Super Nigar', async () => {
      anthropic.complete.mockRejectedValue(new Error('Anthropic 429'));

      const result = await router.complete(baseRequest, ActiveRole.SUPER_NIGAR);

      expect(anthropic.complete).toHaveBeenCalledTimes(1);
      expect(openai.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('openai');
    });
  });

  describe('crisis routing', () => {
    it('should use GPT-4o for crisis detection', async () => {
      const result = await router.complete(baseRequest, ActiveRole.NIGAR, true);

      expect(openai.complete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'gpt-4o' }),
      );
      expect(result.provider).toBe('openai');
    });

    it('should still fallback on crisis if OpenAI fails', async () => {
      openai.complete.mockRejectedValue(new Error('OpenAI overloaded'));

      const result = await router.complete(baseRequest, ActiveRole.NIGAR, true);

      expect(anthropic.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('anthropic');
    });
  });

  describe('other personas use default chain', () => {
    const nonSuperPersonas = [
      ActiveRole.NIGAR,
      ActiveRole.NIGAR_BLACK,
      ActiveRole.NIGAR_DOST,
      ActiveRole.NIGAR_TRAINER,
      ActiveRole.NIGAR_18PLUS,
    ];

    it.each(nonSuperPersonas)(
      'should use OpenAI as primary for %s',
      async (persona) => {
        await router.complete(baseRequest, persona);
        expect(openai.complete).toHaveBeenCalledTimes(1);
        expect(openai.complete).toHaveBeenCalledWith(
          expect.objectContaining({ model: 'gpt-4o-mini' }),
        );
      },
    );
  });
});
