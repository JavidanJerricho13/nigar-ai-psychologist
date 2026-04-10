export class AudioException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioException';
  }
}

export class TranscriptionFailedException extends AudioException {
  constructor(reason: string) {
    super(`Transcription failed: ${reason}`);
    this.name = 'TranscriptionFailedException';
  }
}

export class SynthesisFailedException extends AudioException {
  constructor(reason: string) {
    super(`Speech synthesis failed: ${reason}`);
    this.name = 'SynthesisFailedException';
  }
}

export class InsufficientCreditsException extends AudioException {
  constructor(userId: string) {
    super(`Insufficient voice credits for user ${userId}`);
    this.name = 'InsufficientCreditsException';
  }
}
