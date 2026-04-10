export interface TtsResult {
  /** Path to generated audio file */
  filePath: string;
  /** Audio format (mp3, wav, ogg) */
  format: string;
  /** Duration in seconds (estimated) */
  durationSeconds: number;
}

export const TTS_PROVIDER = 'TTS_PROVIDER';

export interface TtsProviderPort {
  readonly name: string;
  /** Synthesize text to speech, return path to audio file */
  synthesize(text: string, outputPath: string): Promise<TtsResult>;
}
