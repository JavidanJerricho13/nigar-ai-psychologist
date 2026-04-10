import { Injectable, Inject } from '@nestjs/common';
import { USER_REPOSITORY, UserRepositoryPort } from '../ports/user.repository.port';
import { PROFILE_REPOSITORY, ProfileRepositoryPort } from '../ports/profile.repository.port';
import { SETTINGS_REPOSITORY, SettingsRepositoryPort } from '../ports/settings.repository.port';
import { User } from '../entities/user.entity';
import { UserProfile } from '../entities/user-profile.entity';
import { UserSettings } from '../entities/user-settings.entity';

export interface FullProfile {
  user: User;
  profile: UserProfile | null;
  settings: UserSettings | null;
}

@Injectable()
export class GetUserFullProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
    @Inject(PROFILE_REPOSITORY) private readonly profileRepo: ProfileRepositoryPort,
    @Inject(SETTINGS_REPOSITORY) private readonly settingsRepo: SettingsRepositoryPort,
  ) {}

  async execute(userId: string): Promise<FullProfile | null> {
    const user = await this.userRepo.findById(userId);
    if (!user) return null;

    const [profile, settings] = await Promise.all([
      this.profileRepo.findByUserId(userId),
      this.settingsRepo.findByUserId(userId),
    ]);

    return { user, profile, settings };
  }

  async executeByTelegramId(telegramId: string): Promise<FullProfile | null> {
    const user = await this.userRepo.findByTelegramId(telegramId);
    if (!user) return null;

    const [profile, settings] = await Promise.all([
      this.profileRepo.findByUserId(user.id),
      this.settingsRepo.findByUserId(user.id),
    ]);

    return { user, profile, settings };
  }
}
