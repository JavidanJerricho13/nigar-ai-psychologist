import { User as PrismaUser, UserProfile as PrismaProfile, UserSettings as PrismaSettings } from '@nigar/prisma-client';
import { User } from '../../domain/entities/user.entity';
import { UserProfile } from '../../domain/entities/user-profile.entity';
import { UserSettings } from '../../domain/entities/user-settings.entity';
import { ActiveRole, ResponseFormat, Gender } from '@nigar/shared-types';

export class UserMapper {
  static toDomain(prisma: PrismaUser): User {
    return new User({
      id: prisma.id,
      telegramId: prisma.telegramId,
      phone: prisma.phone,
      email: prisma.email,
      isActive: prisma.isActive,
      referralCode: prisma.referralCode,
      referredBy: prisma.referredBy,
      createdAt: prisma.createdAt,
      updatedAt: prisma.updatedAt,
    });
  }
}

export class ProfileMapper {
  static toDomain(prisma: PrismaProfile, decryptedBio: string | null): UserProfile {
    return new UserProfile({
      id: prisma.id,
      userId: prisma.userId,
      name: prisma.name,
      gender: prisma.gender ? (prisma.gender as Gender) : null,
      age: prisma.age,
      bio: decryptedBio,
      onboardingCompleted: prisma.onboardingCompleted,
      createdAt: prisma.createdAt,
      updatedAt: prisma.updatedAt,
    });
  }
}

export class SettingsMapper {
  static toDomain(prisma: PrismaSettings): UserSettings {
    return new UserSettings({
      id: prisma.id,
      userId: prisma.userId,
      activeRole: prisma.activeRole as unknown as ActiveRole,
      responseFormat: prisma.responseFormat as unknown as ResponseFormat,
      nigarBlackRudenessEnabled: prisma.nigarBlackRudenessEnabled,
      language: prisma.language,
      createdAt: prisma.createdAt,
      updatedAt: prisma.updatedAt,
    });
  }
}
