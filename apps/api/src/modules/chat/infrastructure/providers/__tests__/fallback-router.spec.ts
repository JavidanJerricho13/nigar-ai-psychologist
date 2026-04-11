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
  let groq: jest.Mocked<LlmProviderPort>;
  let openai: jest.Mocked<LlmProviderPort>;
  let anthropic: jest.Mocked<LlmProviderPort>;
  let gemini: jest.Mocked<LlmProviderPort>;
  let router: FallbackRouter;

  const baseRequest = {
    messages: [{ role: 'user' as const, content: 'Salam' }],
  };

  beforeEach(() => {
    groq = mockProvider('groq');
    openai = mockProvider('openai');
    anthropic = mockProvider('anthropic');
    gemini = mockProvider('gemini');
    router = new FallbackRouter(groq as any, openai as any, anthropic as any, gemini as any);
  });

  describe('default routing (Nigar persona)', () => {
    it('should use Groq as primary with llama-3.3-70b-versatile', async () => {
      const result = await router.complete(baseRequest, ActiveRole.NIGAR);

      expect(groq.complete).toHaveBeenCalledTimes(1);
      expect(groq.complete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
      );
      expect(result.provider).toBe('groq');
      expect(openai.complete).not.toHaveBeenCalled();
    });

    it('should use default persona when none specified', async () => {
      await router.complete(baseRequest);
      expect(groq.complete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
      );
    });
  });

  describe('fallback behavior', () => {
    it('should fallback to OpenAI when Groq fails', async () => {
      groq.complete.mockRejectedValue(new Error('Groq 500'));

      const result = await router.complete(baseRequest);

      expect(groq.complete).toHaveBeenCalledTimes(1);
      expect(openai.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('openai');
    });

    it('should fallback through full chain when multiple fail', async () => {
      groq.complete.mockRejectedValue(new Error('Groq down'));
      openai.complete.mockRejectedValue(new Error('OpenAI down'));
      anthropic.complete.mockRejectedValue(new Error('Anthropic down'));

      const result = await router.complete(baseRequest);

      expect(gemini.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('gemini');
    });

    it('should throw when ALL providers fail', async () => {
      groq.complete.mockRejectedValue(new Error('Groq down'));
      openai.complete.mockRejectedValue(new Error('OpenAI down'));
      anthropic.complete.mockRejectedValue(new Error('Anthropic down'));
      gemini.complete.mockRejectedValue(new Error('Gemini down'));

      await expect(router.complete(baseRequest)).rejects.toThrow(
        'All LLM providers failed',
      );
    });

    it('should skip unavailable providers', async () => {
      groq.isAvailable.mockResolvedValue(false);

      const result = await router.complete(baseRequest);

      expect(groq.complete).not.toHaveBeenCalled();
      expect(openai.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('openai');
    });

    it('should throw when no providers are available', async () => {
      groq.isAvailable.mockResolvedValue(false);
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

    it('should fallback to Groq when Anthropic fails for Super Nigar', async () => {
      anthropic.complete.mockRejectedValue(new Error('Anthropic 429'));

      const result = await router.complete(baseRequest, ActiveRole.SUPER_NIGAR);

      expect(anthropic.complete).toHaveBeenCalledTimes(1);
      expect(groq.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('groq');
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

      // Crisis chain: OpenAI → Groq → Anthropic → Gemini
      expect(groq.complete).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe('groq');
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
      'should use Groq as primary for %s',
      async (persona) => {
        await router.complete(baseRequest, persona);
        expect(groq.complete).toHaveBeenCalledTimes(1);
        expect(groq.complete).toHaveBeenCalledWith(
          expect.objectContaining({ model: 'llama-3.3-70b-versatile' }),
        );
      },
    );
  });
});
