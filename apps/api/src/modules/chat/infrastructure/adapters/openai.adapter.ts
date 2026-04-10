import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmProviderPort,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '../../domain/ports/llm-provider.port';

@Injectable()
export class OpenAiAdapter implements LlmProviderPort {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('llm.openaiKey', '');
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model ?? 'gpt-4o-mini';

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
      this.logger.error(`OpenAI API error ${response.status}: ${errorBody}`);
      throw new Error(`OpenAI API error: ${response.status}`);
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
