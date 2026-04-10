import { User } from '../entities/user.entity';

export const USER_REPOSITORY = 'USER_REPOSITORY';

export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
  findByTelegramId(telegramId: string): Promise<User | null>;
  create(telegramId: string, referredBy?: string): Promise<User>;
}
