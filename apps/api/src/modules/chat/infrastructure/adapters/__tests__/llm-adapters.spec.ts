import { OpenAiAdapter } from '../openai.adapter';
import { AnthropicAdapter } from '../anthropic.adapter';
import { GeminiAdapter } from '../gemini.adapter';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

function mockConfigService(overrides: Record<string, string> = {}) {
  return {
    get: jest.fn((key: string, defaultVal?: string) => {
      const map: Record<string, string> = {
        'llm.openaiKey': 'sk-test-openai',
        'llm.anthropicKey': 'sk-ant-test',
        'llm.googleKey': 'google-test-key',
        ...overrides,
      };
      return map[key] ?? defaultVal ?? '';
    }),
  } as any;
}

const baseRequest = {
  messages: [
    { role: 'system' as const, content: 'You are helpful.' },
    { role: 'user' as const, content: 'Hello' },
  ],
};

describe('OpenAiAdapter', () => {
  let adapter: OpenAiAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new OpenAiAdapter(mockConfigService());
  });

  it('should have name "openai"', () => {
    expect(adapter.name).toBe('openai');
  });

  it('should be available when API key is set', async () => {
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('should not be available when API key is empty', async () => {
    const noKey = new OpenAiAdapter(mockConfigService({ 'llm.openaiKey': '' }));
    expect(await noKey.isAvailable()).toBe(false);
  });

  it('should call OpenAI API with correct format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { total_tokens: 50 },
      }),
    });

    const result = await adapter.complete(baseRequest);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-openai',
        }),
      }),
    );
    expect(result.content).toBe('Hello!');
    expect(result.tokensUsed).toBe(50);
    expect(result.provider).toBe('openai');
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });

    await expect(adapter.complete(baseRequest)).rejects.toThrow('OpenAI API error: 429');
  });

  it('should use gpt-4o-mini as default model', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { total_tokens: 10 },
      }),
    });

    await adapter.complete(baseRequest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-4o-mini');
  });
});

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AnthropicAdapter(mockConfigService());
  });

  it('should have name "anthropic"', () => {
    expect(adapter.name).toBe('anthropic');
  });

  it('should separate system message from messages array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: 'Salam!' }],
        usage: { input_tokens: 20, output_tokens: 10 },
        stop_reason: 'end_turn',
      }),
    });

    const result = await adapter.complete(baseRequest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.system).toBe('You are helpful.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(result.content).toBe('Salam!');
    expect(result.tokensUsed).toBe(30);
  });

  it('should include anthropic-version header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ text: 'ok' }],
        usage: { input_tokens: 5, output_tokens: 5 },
      }),
    });

    await adapter.complete(baseRequest);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'anthropic-version': '2023-06-01',
          'x-api-key': 'sk-ant-test',
        }),
      }),
    );
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });

    await expect(adapter.complete(baseRequest)).rejects.toThrow('Anthropic API error: 500');
  });
});

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new GeminiAdapter(mockConfigService());
  });

  it('should have name "gemini"', () => {
    expect(adapter.name).toBe('gemini');
  });

  it('should convert messages to Gemini format', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Gemini reply' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 8 },
      }),
    });

    const result = await adapter.complete(baseRequest);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // System message should be in systemInstruction
    expect(body.systemInstruction.parts[0].text).toBe('You are helpful.');
    // User message should use "user" role
    expect(body.contents[0].role).toBe('user');
    expect(result.content).toBe('Gemini reply');
    expect(result.tokensUsed).toBe(23);
  });

  it('should include API key in URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: {},
      }),
    });

    await adapter.complete(baseRequest);

    expect(mockFetch.mock.calls[0][0]).toContain('key=google-test-key');
  });

  it('should use gemini-2.0-flash as default model', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: {},
      }),
    });

    await adapter.complete(baseRequest);

    expect(mockFetch.mock.calls[0][0]).toContain('gemini-2.0-flash');
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(adapter.complete(baseRequest)).rejects.toThrow('Gemini API error: 403');
  });
});
