import { PromptBuilderService } from '../prompt-builder.service';
import { ActiveRole } from '@nigar/shared-types';

describe('PromptBuilderService', () => {
  const builder = new PromptBuilderService();

  it('should include system preamble as first message', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR,
      rudenessEnabled: false,
      userContext: {},
      conversationHistory: [],
      currentMessage: 'Salam',
    });

    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Nigar');
    expect(messages[0].content).toContain('860-510-510');
  });

  it('should include persona base for Nigar', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR,
      rudenessEnabled: false,
      userContext: {},
      conversationHistory: [],
      currentMessage: 'Test',
    });

    expect(messages[0].content).toContain('Nigar Psixoloq');
    expect(messages[0].content).toContain('CBT');
  });

  it('should include persona base for Nigar Black', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR_BLACK,
      rudenessEnabled: false,
      userContext: {},
      conversationHistory: [],
      currentMessage: 'Test',
    });

    expect(messages[0].content).toContain('Nigar Black');
    expect(messages[0].content).toContain('provokativ');
  });

  it('should append rudeness modifier when enabled for Nigar Black', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR_BLACK,
      rudenessEnabled: true,
      userContext: {},
      conversationHistory: [],
      currentMessage: 'Test',
    });

    expect(messages[0].content).toContain('söyüş');
    expect(messages[0].content).toContain('kobudluq');
  });

  it('should NOT append rudeness modifier when disabled', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR_BLACK,
      rudenessEnabled: false,
      userContext: {},
      conversationHistory: [],
      currentMessage: 'Test',
    });

    expect(messages[0].content).not.toContain('söyüş');
  });

  it('should NOT append rudeness modifier for non-Black personas', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR,
      rudenessEnabled: true, // Enabled but wrong persona
      userContext: {},
      conversationHistory: [],
      currentMessage: 'Test',
    });

    expect(messages[0].content).not.toContain('kobudluq');
  });

  it('should include user context when provided', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR,
      rudenessEnabled: false,
      userContext: { name: 'Cavidan', age: 25, gender: 'male', bio: 'Stressliyəm' },
      conversationHistory: [],
      currentMessage: 'Test',
    });

    expect(messages[0].content).toContain('Cavidan');
    expect(messages[0].content).toContain('25');
    expect(messages[0].content).toContain('Kişi');
    expect(messages[0].content).toContain('Stressliyəm');
  });

  it('should include conversation history in order', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR,
      rudenessEnabled: false,
      userContext: {},
      conversationHistory: [
        { role: 'user', content: 'Salam' },
        { role: 'assistant', content: 'Salam! Necəsən?' },
      ],
      currentMessage: 'Yaxşıyam',
    });

    // system + 2 history + 1 current = 4 messages
    expect(messages.length).toBe(4);
    expect(messages[1].content).toBe('Salam');
    expect(messages[2].content).toBe('Salam! Necəsən?');
    expect(messages[3].content).toBe('Yaxşıyam');
  });

  it('should work for all 6 personas', () => {
    const personas = [
      ActiveRole.NIGAR,
      ActiveRole.NIGAR_BLACK,
      ActiveRole.SUPER_NIGAR,
      ActiveRole.NIGAR_DOST,
      ActiveRole.NIGAR_TRAINER,
      ActiveRole.NIGAR_18PLUS,
    ];

    for (const persona of personas) {
      const messages = builder.build({
        persona,
        rudenessEnabled: false,
        userContext: {},
        conversationHistory: [],
        currentMessage: 'Test',
      });

      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[0].role).toBe('system');
      expect(messages[messages.length - 1].role).toBe('user');
    }
  });

  it('should include Nigar Dost informal tone', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR_DOST,
      rudenessEnabled: false,
      userContext: {},
      conversationHistory: [],
      currentMessage: 'Test',
    });

    expect(messages[0].content).toContain('rəfiqə');
  });

  it('should include Nigar Trainer conflict coaching', () => {
    const messages = builder.build({
      persona: ActiveRole.NIGAR_TRAINER,
      rudenessEnabled: false,
      userContext: {},
      conversationHistory: [],
      currentMessage: 'Test',
    });

    expect(messages[0].content).toContain('konflikt');
  });
});
