/** Job data for audio transcription queue */
export interface TranscriptionJobData {
  userId: string;
  fileId: string;
  filePath: string;
  duration: number;
  conversationId?: string;
}

/** Job data for audio synthesis queue */
export interface SynthesisJobData {
  userId: string;
  conversationId: string;
  text: string;
  /** Where to send the result (e.g., telegramChatId) */
  replyTo: string;
}

export const TRANSCRIPTION_QUEUE = 'audio-transcription';
export const SYNTHESIS_QUEUE = 'audio-synthesis';
