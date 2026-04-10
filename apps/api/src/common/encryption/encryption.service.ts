import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const hexKey = this.config.get<string>('encryption.key', '');
    // Accept hex key (64 chars) or raw string (32 chars)
    this.key =
      hexKey.length === 64
        ? Buffer.from(hexKey, 'hex')
        : crypto.createHash('sha256').update(hexKey).digest();
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: base64(iv + tag + ciphertext)
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(encoded: string): string {
    const buf = Buffer.from(encoded, 'base64');

    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  /** Encrypt if non-null, return null otherwise */
  encryptNullable(value: string | null): string | null {
    return value ? this.encrypt(value) : null;
  }

  /** Decrypt if non-null, return null otherwise */
  decryptNullable(value: string | null): string | null {
    if (!value) return null;
    try {
      return this.decrypt(value);
    } catch {
      return value; // Return raw if decryption fails (legacy unencrypted data)
    }
  }
}
