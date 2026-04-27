import { Injectable, Logger } from '@nestjs/common';
import {
  LlmProviderPort,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '../../domain/ports/llm-provider.port';
import { GroqAdapter } from '../adapters/groq.adapter';
import { OpenAiAdapter } from '../adapters/openai.adapter';
import { AnthropicAdapter } from '../adapters/anthropic.adapter';
import { GeminiAdapter } from '../adapters/gemini.adapter';
import { ActiveRole } from '@nigar/shared-types';

interface ProviderChain {
  providers: LlmProviderPort[];
  defaultModel?: string;
}

/**
 * Fallback router that tries providers in order.
 *
 * Default chain: OpenAI gpt-4o-mini → Groq → Anthropic → Gemini
 * Crisis:        OpenAI GPT-4o → Groq → Anthropic → Gemini
 * Super Nigar:   Anthropic Sonnet → OpenAI → Groq → Gemini
 */
@Injectable()
export class FallbackRouter {
  private readonly logger = new Logger(FallbackRouter.name);

  constructor(
    private readonly groq: GroqAdapter,
    private readonly openai: OpenAiAdapter,
    private readonly anthropic: AnthropicAdapter,
    private readonly gemini: GeminiAdapter,
  ) {}

  async complete(
    request: LlmCompletionRequest,
    persona: ActiveRole = ActiveRole.NIGAR,
    isCrisis = false,
  ): Promise<LlmCompletionResponse> {
    const chain = this.getChain(persona, isCrisis);

    for (let i = 0; i < chain.providers.length; i++) {
      const provider = chain.providers[i];
      const isAvailable = await provider.isAvailable();

      if (!isAvailable) {
        this.logger.warn(`Provider ${provider.name} not available, skipping`);
        continue;
      }

      try {
        const enrichedRequest: LlmCompletionRequest = {
          ...request,
          model: i === 0 ? (chain.defaultModel ?? request.model) : undefined,
        };

        const response = await provider.complete(enrichedRequest);

        if (i > 0) {
          this.logger.warn(
            `Used fallback provider ${provider.name} (primary failed)`,
          );
        }

        return response;
      } catch (error) {
        this.logger.error(
          `Provider ${provider.name} failed: ${(error as Error).message}`,
        );

        if (i === chain.providers.length - 1) {
          throw new Error(
            `All LLM providers failed. Last error: ${(error as Error).message}`,
          );
        }
      }
    }

    throw new Error('No LLM providers available');
  }

  private getChain(persona: ActiveRole, isCrisis: boolean): ProviderChain {
    if (isCrisis) {
      return {
        providers: [this.openai, this.groq, this.anthropic, this.gemini],
        defaultModel: 'gpt-4o',
      };
    }

    switch (persona) {
      case ActiveRole.SUPER_NIGAR:
        return {
          providers: [this.anthropic, this.openai, this.groq, this.gemini],
          defaultModel: 'claude-sonnet-4-5-20250514',
        };

      default:
        // OpenAI gpt-4o-mini as primary (better understanding of cultural nuance)
        // with Groq as a fast/free fallback if OpenAI hiccups.
        return {
          providers: [this.openai, this.groq, this.anthropic, this.gemini],
          defaultModel: 'gpt-4o-mini',
        };
    }
  }
}
