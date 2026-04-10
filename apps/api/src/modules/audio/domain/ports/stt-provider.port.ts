export interface SttResult {
  text: string;
  language: string;
  durationSeconds: number;
}

export const STT_PROVIDER = 'STT_PROVIDER';

export interface SttProviderPort {
  readonly name: string;
  /** Transcribe audio file to text */
  transcribe(filePath: string, languageHint?: string): Promise<SttResult>;
}
