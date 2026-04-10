import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmProviderPort,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
} from '../../domain/ports/llm-provider.port';

@Injectable()
export class AnthropicAdapter implements LlmProviderPort {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicAdapter.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.anthropic.com/v1/messages';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('llm.anthropicKey', '');
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model ?? 'claude-haiku-4-5-20251001';

    // Anthropic requires system message separate from messages array
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const nonSystemMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: systemMessage?.content ?? '',
        messages: nonSystemMessages,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Anthropic API error ${response.status}: ${errorBody}`);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const content = data.content?.[0]?.text ?? '';

    return {
      content,
      tokensUsed:
        (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      model,
      provider: this.name,
      finishReason: data.stop_reason ?? 'unknown',
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
