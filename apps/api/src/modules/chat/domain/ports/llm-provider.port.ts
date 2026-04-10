export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface LlmCompletionResponse {
  content: string;
  tokensUsed: number;
  model: string;
  provider: string;
  finishReason: string;
}

export const LLM_PROVIDER = 'LLM_PROVIDER';

export interface LlmProviderPort {
  readonly name: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  isAvailable(): Promise<boolean>;
}
