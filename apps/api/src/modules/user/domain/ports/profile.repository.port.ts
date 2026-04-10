import { UserProfile } from '../entities/user-profile.entity';

export const PROFILE_REPOSITORY = 'PROFILE_REPOSITORY';

export interface ProfileRepositoryPort {
  findByUserId(userId: string): Promise<UserProfile | null>;
  save(profile: UserProfile): Promise<void>;
  createDefault(userId: string): Promise<UserProfile>;
}
