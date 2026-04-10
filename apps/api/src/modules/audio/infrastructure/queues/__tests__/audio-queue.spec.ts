import { AudioProducer } from '../audio.producer';
import { TranscriptionConsumer } from '../audio.consumer';
import { TranscribeVoiceUseCase } from '../../../domain/use-cases/transcribe-voice.use-case';

describe('AudioProducer', () => {
  let producer: AudioProducer;
  const mockTranscriptionQueue: any = {
    add: jest.fn().mockResolvedValue({ id: 'job-t-1' }),
  };
  const mockSynthesisQueue: any = {
    add: jest.fn().mockResolvedValue({ id: 'job-s-1' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    producer = new AudioProducer(mockTranscriptionQueue, mockSynthesisQueue);
  });

  describe('enqueueTranscription', () => {
    it('should add job to transcription queue with correct data', async () => {
      const jobId = await producer.enqueueTranscription({
        userId: 'user-1',
        fileId: 'file-abc',
        filePath: '/tmp/voice.ogg',
        duration: 5,
      });

      expect(jobId).toBe('job-t-1');
      expect(mockTranscriptionQueue.add).toHaveBeenCalledWith(
        'transcribe',
        {
          userId: 'user-1',
          fileId: 'file-abc',
          filePath: '/tmp/voice.ogg',
          duration: 5,
        },
        expect.objectContaining({
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
        }),
      );
    });

    it('should set removeOnComplete and removeOnFail', async () => {
      await producer.enqueueTranscription({
        userId: 'user-1',
        fileId: 'f',
        filePath: '/tmp/v.ogg',
        duration: 3,
      });

      expect(mockTranscriptionQueue.add).toHaveBeenCalledWith(
        'transcribe',
        expect.any(Object),
        expect.objectContaining({
          removeOnComplete: 100,
          removeOnFail: 50,
        }),
      );
    });
  });

  describe('enqueueSynthesis', () => {
    it('should add job to synthesis queue with correct data', async () => {
      const jobId = await producer.enqueueSynthesis({
        userId: 'user-1',
        conversationId: 'conv-1',
        text: 'Salam!',
        replyTo: 'chat-123',
      });

      expect(jobId).toBe('job-s-1');
      expect(mockSynthesisQueue.add).toHaveBeenCalledWith(
        'synthesize',
        {
          userId: 'user-1',
          conversationId: 'conv-1',
          text: 'Salam!',
          replyTo: 'chat-123',
        },
        expect.objectContaining({
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
        }),
      );
    });
  });
});

describe('TranscriptionConsumer', () => {
  let consumer: TranscriptionConsumer;
  const mockTranscribeUseCase: jest.Mocked<Partial<TranscribeVoiceUseCase>> = {
    execute: jest.fn().mockResolvedValue({
      text: 'Salam, necəsən?',
      language: 'az',
      durationSeconds: 4,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    consumer = new TranscriptionConsumer(mockTranscribeUseCase as any);
  });

  it('should call transcribe use case with job data', async () => {
    const mockJob: any = {
      id: 'job-1',
      data: {
        userId: 'user-1',
        fileId: 'file-abc',
        filePath: '/tmp/voice.ogg',
        duration: 4,
      },
    };

    const result = await consumer.process(mockJob);

    expect(mockTranscribeUseCase.execute).toHaveBeenCalledWith({
      filePath: '/tmp/voice.ogg',
      userId: 'user-1',
    });
    expect(result).toBe('Salam, necəsən?');
  });

  it('should propagate errors from use case', async () => {
    mockTranscribeUseCase.execute!.mockRejectedValueOnce(
      new Error('Whisper timeout'),
    );

    const mockJob: any = {
      id: 'job-2',
      data: {
        userId: 'user-1',
        fileId: 'file-xyz',
        filePath: '/tmp/voice2.ogg',
        duration: 10,
      },
    };

    await expect(consumer.process(mockJob)).rejects.toThrow('Whisper timeout');
  });

  it('should return transcription text as job result', async () => {
    mockTranscribeUseCase.execute!.mockResolvedValueOnce({
      text: 'Uzun mesaj burada',
      language: 'az',
      durationSeconds: 15,
    });

    const mockJob: any = {
      id: 'job-3',
      data: {
        userId: 'user-2',
        fileId: 'file-long',
        filePath: '/tmp/long.ogg',
        duration: 15,
      },
    };

    const result = await consumer.process(mockJob);
    expect(result).toBe('Uzun mesaj burada');
  });
});
