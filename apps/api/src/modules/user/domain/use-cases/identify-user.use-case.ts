import { Injectable, Inject, Logger } from '@nestjs/common';
import { USER_REPOSITORY, UserRepositoryPort } from '../ports/user.repository.port';
import { PROFILE_REPOSITORY, ProfileRepositoryPort } from '../ports/profile.repository.port';
import { SETTINGS_REPOSITORY, SettingsRepositoryPort } from '../ports/settings.repository.port';
import { User } from '../entities/user.entity';

export interface IdentifyUserInput {
  telegramId: string;
  referralCode?: string;
}

export interface IdentifyUserOutput {
  user: User;
  isNew: boolean;
}

@Injectable()
export class IdentifyUserUseCase {
  private readonly logger = new Logger(IdentifyUserUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepositoryPort,
    @Inject(PROFILE_REPOSITORY) private readonly profileRepo: ProfileRepositoryPort,
    @Inject(SETTINGS_REPOSITORY) private readonly settingsRepo: SettingsRepositoryPort,
  ) {}

  async execute(input: IdentifyUserInput): Promise<IdentifyUserOutput> {
    // Try to find existing user
    const existing = await this.userRepo.findByTelegramId(input.telegramId);
    if (existing) {
      return { user: existing, isNew: false };
    }

    // Create new user
    const user = await this.userRepo.create(input.telegramId, input.referralCode);

    // Bootstrap default profile and settings
    await this.profileRepo.createDefault(user.id);
    await this.settingsRepo.createDefault(user.id);

    this.logger.log(`New user created: ${user.id} (tg: ${input.telegramId})`);
    return { user, isNew: true };
  }
}
