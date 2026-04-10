import { Injectable, Logger } from '@nestjs/common';
import { BotService } from '../adapters/bot.service';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DownloadedVoice {
  /** Local file path to the downloaded OGG Opus file */
  filePath: string;
  /** Original Telegram file_id */
  fileId: string;
  /** File size in bytes */
  fileSize: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * Downloads voice messages (OGG Opus) from Telegram's file API.
 * Telegram voice messages are always OGG with Opus codec.
 */
@Injectable()
export class VoiceDownloadService {
  private readonly logger = new Logger(VoiceDownloadService.name);

  constructor(private readonly botService: BotService) {}

  /**
   * Download a voice message from Telegram by file_id.
   * Returns the local path to the downloaded OGG file.
   */
  async download(fileId: string, duration: number): Promise<DownloadedVoice> {
    // 1. Get file info from Telegram API
    const file = await this.botService.bot.api.getFile(fileId);

    if (!file.file_path) {
      throw new Error(`Telegram returned no file_path for file_id: ${fileId}`);
    }

    // 2. Build download URL
    const token = this.botService.bot.token;
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    // 3. Download to temp directory
    const tempDir = path.join(os.tmpdir(), 'nigar-voice');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = `${fileId.slice(0, 16)}_${Date.now()}.ogg`;
    const filePath = path.join(tempDir, fileName);

    await this.downloadFile(url, filePath);

    const stats = fs.statSync(filePath);

    this.logger.log(
      `Downloaded voice: ${fileName} (${stats.size} bytes, ${duration}s)`,
    );

    return {
      filePath,
      fileId,
      fileSize: stats.size,
      duration,
    };
  }

  /** Clean up a downloaded file after processing */
  cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      this.logger.warn(`Failed to cleanup ${filePath}: ${(err as Error).message}`);
    }
  }

  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);

      https
        .get(url, (response) => {
          if (response.statusCode !== 200) {
            fileStream.close();
            fs.unlinkSync(destPath);
            reject(
              new Error(
                `Failed to download: HTTP ${response.statusCode}`,
              ),
            );
            return;
          }

          response.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
        })
        .on('error', (err) => {
          fileStream.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          reject(err);
        });
    });
  }
}
