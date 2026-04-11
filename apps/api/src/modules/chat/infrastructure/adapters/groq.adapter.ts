import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmProviderPort,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '../../domain/ports/llm-provider.port';

/**
 * Groq adapter — OpenAI-compatible API with ultra-fast inference.
 * Default model: llama-3.3-70b-versatile
 * Used as PRIMARY provider for testing (free tier available).
 */
@Injectable()
export class GroqAdapter implements LlmProviderPort {
  readonly name = 'groq';
  private readonly logger = new Logger(GroqAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('audio.groqKey', '');
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model ?? 'llama-3.3-70b-versatile';

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Groq API error ${response.status}: ${errorBody}`);
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      tokensUsed: data.usage?.total_tokens ?? 0,
      model,
      provider: this.name,
      finishReason: choice?.finish_reason ?? 'unknown',
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
