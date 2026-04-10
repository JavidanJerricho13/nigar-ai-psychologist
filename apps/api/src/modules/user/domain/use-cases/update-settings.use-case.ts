import { Injectable, Inject } from '@nestjs/common';
import { ActiveRole, ResponseFormat } from '@nigar/shared-types';
import { SETTINGS_REPOSITORY, SettingsRepositoryPort } from '../ports/settings.repository.port';
import { UserSettings } from '../entities/user-settings.entity';

export interface UpdateSettingsInput {
  userId: string;
  activeRole?: ActiveRole;
  responseFormat?: ResponseFormat;
  nigarBlackRudenessEnabled?: boolean;
  language?: string;
}

@Injectable()
export class UpdateSettingsUseCase {
  constructor(
    @Inject(SETTINGS_REPOSITORY) private readonly settingsRepo: SettingsRepositoryPort,
  ) {}

  async execute(input: UpdateSettingsInput): Promise<UserSettings> {
    let settings = await this.settingsRepo.findByUserId(input.userId);
    if (!settings) {
      settings = await this.settingsRepo.createDefault(input.userId);
    }

    settings.updateSettings({
      activeRole: input.activeRole,
      responseFormat: input.responseFormat,
      nigarBlackRudenessEnabled: input.nigarBlackRudenessEnabled,
      language: input.language,
    });

    await this.settingsRepo.save(settings);
    return settings;
  }
}
