import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { SettingsRepositoryPort } from '../../domain/ports/settings.repository.port';
import { UserSettings } from '../../domain/entities/user-settings.entity';
import { SettingsMapper } from '../mappers/user.mapper';

@Injectable()
export class PrismaSettingsRepository implements SettingsRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<UserSettings | null> {
    const record = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    return record ? SettingsMapper.toDomain(record) : null;
  }

  async save(settings: UserSettings): Promise<void> {
    await this.prisma.userSettings.upsert({
      where: { userId: settings.userId },
      create: {
        userId: settings.userId,
        activeRole: settings.activeRole as string as any,
        responseFormat: settings.responseFormat as string as any,
        nigarBlackRudenessEnabled: settings.nigarBlackRudenessEnabled,
        language: settings.language,
      },
      update: {
        activeRole: settings.activeRole as string as any,
        responseFormat: settings.responseFormat as string as any,
        nigarBlackRudenessEnabled: settings.nigarBlackRudenessEnabled,
        language: settings.language,
      },
    });
  }

  async createDefault(userId: string): Promise<UserSettings> {
    const record = await this.prisma.userSettings.create({
      data: { userId },
    });
    return SettingsMapper.toDomain(record);
  }
}
