import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { EncryptionService } from '../../../../common/encryption/encryption.service';
import { ProfileRepositoryPort } from '../../domain/ports/profile.repository.port';
import { UserProfile } from '../../domain/entities/user-profile.entity';
import { ProfileMapper } from '../mappers/user.mapper';

@Injectable()
export class PrismaProfileRepository implements ProfileRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async findByUserId(userId: string): Promise<UserProfile | null> {
    const record = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!record) return null;

    const decryptedBio = this.encryption.decryptNullable(record.bio);
    return ProfileMapper.toDomain(record, decryptedBio);
  }

  async save(profile: UserProfile): Promise<void> {
    const encryptedBio = this.encryption.encryptNullable(profile.bio);

    await this.prisma.userProfile.upsert({
      where: { userId: profile.userId },
      create: {
        userId: profile.userId,
        name: profile.name,
        gender: profile.gender as string as any,
        age: profile.age,
        bio: encryptedBio,
        onboardingCompleted: profile.onboardingCompleted,
      },
      update: {
        name: profile.name,
        gender: profile.gender as string as any,
        age: profile.age,
        bio: encryptedBio,
        onboardingCompleted: profile.onboardingCompleted,
      },
    });
  }

  async createDefault(userId: string): Promise<UserProfile> {
    const record = await this.prisma.userProfile.create({
      data: { userId },
    });
    return ProfileMapper.toDomain(record, null);
  }
}
