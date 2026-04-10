import { SlidingWindowService } from '../sliding-window.service';
import { LlmMessage } from '../../../domain/ports/llm-provider.port';

describe('SlidingWindowService', () => {
  const service = new SlidingWindowService();

  it('should return all messages when under budget', () => {
    const messages: LlmMessage[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ];

    const result = service.trim(messages, 1000);
    expect(result.length).toBe(2);
  });

  it('should drop oldest messages when over budget', () => {
    const messages: LlmMessage[] = [
      { role: 'user', content: 'A'.repeat(2000) },   // ~500 tokens
      { role: 'assistant', content: 'B'.repeat(2000) }, // ~500 tokens
      { role: 'user', content: 'C'.repeat(400) },     // ~100 tokens
      { role: 'assistant', content: 'D'.repeat(400) }, // ~100 tokens
    ];

    // Budget of 300 tokens — should only fit last 2 messages
    const result = service.trim(messages, 300);
    expect(result.length).toBe(2);
    expect(result[0].content).toContain('C');
    expect(result[1].content).toContain('D');
  });

  it('should return empty for empty input', () => {
    expect(service.trim([], 1000)).toEqual([]);
  });

  it('should estimate tokens correctly', () => {
    // ~4 chars per token
    expect(service.estimateTokens('Hello world')).toBe(3); // 11/4 = 2.75 → 3
    expect(service.estimateTokens('A'.repeat(100))).toBe(25);
  });

  it('should calculate total tokens for messages', () => {
    const messages: LlmMessage[] = [
      { role: 'user', content: 'A'.repeat(40) },   // 10 tokens
      { role: 'assistant', content: 'B'.repeat(80) }, // 20 tokens
    ];

    expect(service.totalTokens(messages)).toBe(30);
  });

  it('should keep most recent messages (not oldest)', () => {
    const messages: LlmMessage[] = [
      { role: 'user', content: 'old message 1' },
      { role: 'assistant', content: 'old response 1' },
      { role: 'user', content: 'recent message' },
      { role: 'assistant', content: 'recent response' },
    ];

    // Very small budget (5 tokens ≈ 20 chars) — should only fit last message
    const result = service.trim(messages, 5);
    expect(result.length).toBe(1);
    expect(result[0].content).toContain('recent response');
  });
});
