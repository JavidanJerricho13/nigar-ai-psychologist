import { Injectable } from '@nestjs/common';
import { LlmMessage } from '../../domain/ports/llm-provider.port';

const TOKEN_BUDGET = 4000;

// Rough token estimation: ~4 chars per token for Azerbaijani/mixed text
const CHARS_PER_TOKEN = 4;

/**
 * Manages conversation context within a token budget.
 * Keeps the most recent messages that fit within TOKEN_BUDGET.
 */
@Injectable()
export class SlidingWindowService {
  /**
   * Trim conversation history to fit within the token budget.
   * Keeps messages from the end (most recent), drops oldest first.
   */
  trim(messages: LlmMessage[], budgetTokens: number = TOKEN_BUDGET): LlmMessage[] {
    if (messages.length === 0) return [];

    let totalTokens = 0;
    const result: LlmMessage[] = [];

    // Walk backwards from most recent
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens(messages[i].content);
      if (totalTokens + msgTokens > budgetTokens) break;
      totalTokens += msgTokens;
      result.unshift(messages[i]);
    }

    return result;
  }

  /** Estimate token count for a string */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /** Calculate total tokens for a set of messages */
  totalTokens(messages: LlmMessage[]): number {
    return messages.reduce(
      (sum, msg) => sum + this.estimateTokens(msg.content),
      0,
    );
  }
}
