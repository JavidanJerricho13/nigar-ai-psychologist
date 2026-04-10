import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmProviderPort,
  LlmCompletionRequest,
  LlmCompletionResponse,
} from '../../domain/ports/llm-provider.port';

@Injectable()
export class GeminiAdapter implements LlmProviderPort {
  readonly name = 'gemini';
  private readonly logger = new Logger(GeminiAdapter.name);
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('llm.googleKey', '');
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const model = request.model ?? 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    // Convert messages to Gemini format
    const systemInstruction = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
        contents,
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 0.7,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Gemini API error ${response.status}: ${errorBody}`);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const content =
      data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const tokensUsed =
      (data.usageMetadata?.promptTokenCount ?? 0) +
      (data.usageMetadata?.candidatesTokenCount ?? 0);

    return {
      content,
      tokensUsed,
      model,
      provider: this.name,
      finishReason: data.candidates?.[0]?.finishReason ?? 'unknown',
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}
