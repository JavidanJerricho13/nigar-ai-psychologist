import { TelegramAdapter } from '../telegram.adapter';

/** Helper to build a minimal mocked grammY Context */
function mockContext(overrides: Record<string, any> = {}): any {
  return {
    from: { id: 12345, first_name: 'Əli', username: 'ali_az' },
    message: null,
    callbackQuery: null,
    ...overrides,
  };
}

describe('TelegramAdapter', () => {
  describe('toCommandRequest', () => {
    it('should parse /start command', () => {
      const ctx = mockContext({
        message: { text: '/start', voice: undefined },
      });

      const req = TelegramAdapter.toCommandRequest(ctx);

      expect(req).not.toBeNull();
      expect(req!.command).toBe('/start');
      expect(req!.telegramId).toBe('12345');
      expect(req!.userInput!.type).toBe('command');
      expect(req!.userInput!.value).toBe('start');
    });

    it('should parse /start with deep link parameter', () => {
      const ctx = mockContext({
        message: { text: '/start REF_ABC123', voice: undefined },
      });

      const req = TelegramAdapter.toCommandRequest(ctx);

      expect(req!.command).toBe('/start');
      expect(req!.deepLinkParam).toBe('REF_ABC123');
      expect(req!.payload).toBe('REF_ABC123');
    });

    it('should parse /roles command', () => {
      const ctx = mockContext({
        message: { text: '/roles', voice: undefined },
      });

      const req = TelegramAdapter.toCommandRequest(ctx);

      expect(req!.command).toBe('/roles');
      expect(req!.userInput!.value).toBe('roles');
    });

    it('should parse callback query (inline keyboard press)', () => {
      const ctx = mockContext({
        callbackQuery: { data: 'next' },
      });

      const req = TelegramAdapter.toCommandRequest(ctx);

      expect(req).not.toBeNull();
      expect(req!.command).toBe('');
      expect(req!.userInput!.type).toBe('callback');
      expect(req!.userInput!.value).toBe('next');
    });

    it('should parse voice message', () => {
      const ctx = mockContext({
        message: {
          voice: { file_id: 'voice_file_abc', duration: 5 },
          text: undefined,
        },
      });

      const req = TelegramAdapter.toCommandRequest(ctx);

      expect(req).not.toBeNull();
      expect(req!.userInput!.type).toBe('voice');
      expect(req!.userInput!.value).toBe('voice_file_abc');
    });

    it('should parse free text message', () => {
      const ctx = mockContext({
        message: { text: 'Salam, necəsən?', voice: undefined },
      });

      const req = TelegramAdapter.toCommandRequest(ctx);

      expect(req).not.toBeNull();
      expect(req!.command).toBe('Salam, necəsən?');
      expect(req!.userInput!.type).toBe('text');
      expect(req!.userInput!.value).toBe('Salam, necəsən?');
    });

    it('should return null if no from', () => {
      const ctx = mockContext({ from: null });
      expect(TelegramAdapter.toCommandRequest(ctx)).toBeNull();
    });

    it('should return null for empty context', () => {
      const ctx = mockContext({
        from: { id: 1, first_name: 'X' },
        message: null,
        callbackQuery: null,
      });
      expect(TelegramAdapter.toCommandRequest(ctx)).toBeNull();
    });
  });

  describe('getDisplayName', () => {
    it('should return first_name', () => {
      const ctx = mockContext();
      expect(TelegramAdapter.getDisplayName(ctx)).toBe('Əli');
    });

    it('should fall back to username', () => {
      const ctx = mockContext({
        from: { id: 1, first_name: '', username: 'ali_az' },
      });
      expect(TelegramAdapter.getDisplayName(ctx)).toBe('ali_az');
    });

    it('should fall back to Dostum', () => {
      const ctx = mockContext({ from: null });
      expect(TelegramAdapter.getDisplayName(ctx)).toBe('Dostum');
    });
  });
});
