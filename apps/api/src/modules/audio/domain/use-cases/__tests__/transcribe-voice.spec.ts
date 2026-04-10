import { TranscribeVoiceUseCase } from '../transcribe-voice.use-case';
import { SttProviderPort } from '../../ports/stt-provider.port';
import { FfmpegService } from '../../../infrastructure/conversion/ffmpeg.service';
import { TranscriptionFailedException } from '../../exceptions/audio.exceptions';

const mockStt: jest.Mocked<SttProviderPort> = {
  name: 'mock-stt',
  transcribe: jest.fn().mockResolvedValue({
    text: 'Salam, necəsən?',
    language: 'az',
    durationSeconds: 3,
  }),
};

const mockFfmpeg: any = {
  oggToWav: jest.fn().mockResolvedValue('/tmp/converted.wav'),
  cleanup: jest.fn(),
};

describe('TranscribeVoiceUseCase', () => {
  let useCase: TranscribeVoiceUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new TranscribeVoiceUseCase(mockStt, mockFfmpeg as any);
  });

  it('should convert OGG to WAV then transcribe', async () => {
    const result = await useCase.execute({
      filePath: '/tmp/voice.ogg',
      userId: 'user-1',
    });

    expect(mockFfmpeg.oggToWav).toHaveBeenCalledWith('/tmp/voice.ogg');
    expect(mockStt.transcribe).toHaveBeenCalledWith('/tmp/converted.wav', 'az');
    expect(result.text).toBe('Salam, necəsən?');
    expect(result.language).toBe('az');
  });

  it('should use "az" as default language hint', async () => {
    await useCase.execute({ filePath: '/tmp/voice.ogg', userId: 'user-1' });
    expect(mockStt.transcribe).toHaveBeenCalledWith(expect.any(String), 'az');
  });

  it('should allow custom language hint', async () => {
    await useCase.execute({
      filePath: '/tmp/voice.ogg',
      userId: 'user-1',
      languageHint: 'ru',
    });
    expect(mockStt.transcribe).toHaveBeenCalledWith(expect.any(String), 'ru');
  });

  it('should cleanup WAV file after transcription', async () => {
    await useCase.execute({ filePath: '/tmp/voice.ogg', userId: 'user-1' });
    expect(mockFfmpeg.cleanup).toHaveBeenCalledWith('/tmp/converted.wav');
  });

  it('should cleanup WAV even on STT failure', async () => {
    mockStt.transcribe.mockRejectedValueOnce(new Error('API down'));

    await expect(
      useCase.execute({ filePath: '/tmp/voice.ogg', userId: 'user-1' }),
    ).rejects.toThrow(TranscriptionFailedException);

    expect(mockFfmpeg.cleanup).toHaveBeenCalledWith('/tmp/converted.wav');
  });

  it('should throw TranscriptionFailedException on FFmpeg error', async () => {
    mockFfmpeg.oggToWav!.mockRejectedValueOnce(new Error('FFmpeg not found'));

    await expect(
      useCase.execute({ filePath: '/tmp/voice.ogg', userId: 'user-1' }),
    ).rejects.toThrow(TranscriptionFailedException);
  });
});
