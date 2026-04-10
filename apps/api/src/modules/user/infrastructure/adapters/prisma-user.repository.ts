import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { UserRepositoryPort } from '../../domain/ports/user.repository.port';
import { User } from '../../domain/entities/user.entity';
import { UserMapper } from '../mappers/user.mapper';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? UserMapper.toDomain(record) : null;
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { telegramId },
    });
    return record ? UserMapper.toDomain(record) : null;
  }

  async create(telegramId: string, referredBy?: string): Promise<User> {
    const record = await this.prisma.user.create({
      data: {
        telegramId,
        referredBy: referredBy ?? null,
      },
    });
    return UserMapper.toDomain(record);
  }
}
