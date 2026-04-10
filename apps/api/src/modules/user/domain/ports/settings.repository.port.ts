import { UserSettings } from '../entities/user-settings.entity';

export const SETTINGS_REPOSITORY = 'SETTINGS_REPOSITORY';

export interface SettingsRepositoryPort {
  findByUserId(userId: string): Promise<UserSettings | null>;
  save(settings: UserSettings): Promise<void>;
  createDefault(userId: string): Promise<UserSettings>;
}
