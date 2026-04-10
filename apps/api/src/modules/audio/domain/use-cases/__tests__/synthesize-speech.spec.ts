import { SynthesizeSpeechUseCase } from '../synthesize-speech.use-case';
import { TtsProviderPort } from '../../ports/tts-provider.port';
import { FfmpegService } from '../../../infrastructure/conversion/ffmpeg.service';
import { SessionService } from '../../../../../shared/redis/session.service';
import { InsufficientCreditsException } from '../../exceptions/audio.exceptions';

const mockTts: jest.Mocked<TtsProviderPort> = {
  name: 'mock-tts',
  synthesize: jest.fn().mockResolvedValue({
    filePath: '/tmp/tts_output.mp3',
    format: 'mp3',
    durationSeconds: 5,
  }),
};

const mockFfmpeg: jest.Mocked<Partial<FfmpegService>> = {
  toOggOpus: jest.fn().mockResolvedValue('/tmp/output.ogg'),
  cleanup: jest.fn(),
};

const mockSession: any = {
  decrementVoice: jest.fn().mockResolvedValue(2), // 2 remaining after decrement
};

const mockPrisma: any = {
  credit: {
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
};

// Mock fs.readFileSync
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('fake-ogg-data')),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

describe('SynthesizeSpeechUseCase', () => {
  let useCase: SynthesizeSpeechUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.decrementVoice!.mockResolvedValue(2);
    useCase = new SynthesizeSpeechUseCase(
      mockTts,
      mockFfmpeg as any,
      mockSession as any,
      mockPrisma,
    );
  });

  it('should synthesize speech and return OGG buffer', async () => {
    const result = await useCase.execute({
      text: 'Salam!',
      userId: 'user-1',
    });

    expect(mockTts.synthesize).toHaveBeenCalled();
    expect(mockFfmpeg.toOggOpus).toHaveBeenCalledWith('/tmp/tts_output.mp3');
    expect(result.buffer).toBeDefined();
    expect(result.creditsRemaining).toBe(2);
  });

  it('should deduct voice credit via session', async () => {
    await useCase.execute({ text: 'Test', userId: 'user-1' });
    expect(mockSession.decrementVoice).toHaveBeenCalledWith('user-1');
  });

  it('should cleanup TTS temp file after conversion', async () => {
    await useCase.execute({ text: 'Test', userId: 'user-1' });
    expect(mockFfmpeg.cleanup).toHaveBeenCalledWith('/tmp/tts_output.mp3');
  });

  it('should throw InsufficientCreditsException when no credits', async () => {
    mockSession.decrementVoice!.mockResolvedValue(-1); // Exhausted
    mockPrisma.credit.findUnique.mockResolvedValue({ balance: 0 });

    await expect(
      useCase.execute({ text: 'Test', userId: 'user-1' }),
    ).rejects.toThrow(InsufficientCreditsException);
  });

  it('should use purchased balance when free credits exhausted', async () => {
    mockSession.decrementVoice!.mockResolvedValue(-1);
    mockPrisma.credit.findUnique.mockResolvedValue({ balance: 5 });
    mockPrisma.credit.update.mockResolvedValue({});

    const result = await useCase.execute({ text: 'Test', userId: 'user-1' });

    expect(mockPrisma.credit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        data: expect.objectContaining({
          balance: { decrement: 1 },
        }),
      }),
    );
    expect(result.creditsRemaining).toBe(4);
  });

  it('should work with 0 remaining free credits (last free use)', async () => {
    mockSession.decrementVoice!.mockResolvedValue(0);

    const result = await useCase.execute({ text: 'Test', userId: 'user-1' });
    expect(result.creditsRemaining).toBe(0);
  });
});
