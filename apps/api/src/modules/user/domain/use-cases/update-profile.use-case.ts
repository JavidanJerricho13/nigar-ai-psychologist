import { Injectable, Inject } from '@nestjs/common';
import { Gender } from '@nigar/shared-types';
import { PROFILE_REPOSITORY, ProfileRepositoryPort } from '../ports/profile.repository.port';
import { UserProfile } from '../entities/user-profile.entity';

export class ProfileValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'ProfileValidationError';
  }
}

export interface UpdateProfileInput {
  userId: string;
  name?: string;
  gender?: Gender;
  age?: number;
  bio?: string;
}

@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profileRepo: ProfileRepositoryPort,
  ) {}

  async execute(input: UpdateProfileInput): Promise<UserProfile> {
    this.validate(input);

    let profile = await this.profileRepo.findByUserId(input.userId);
    if (!profile) {
      profile = await this.profileRepo.createDefault(input.userId);
    }

    profile.updateProfile({
      name: input.name,
      gender: input.gender,
      age: input.age,
      bio: input.bio,
    });

    await this.profileRepo.save(profile);
    return profile;
  }

  private validate(input: UpdateProfileInput): void {
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (trimmed.length === 0) {
        throw new ProfileValidationError('name', 'Ad boş ola bilməz');
      }
      if (trimmed.length > 255) {
        throw new ProfileValidationError('name', 'Ad 255 simvoldan çox ola bilməz');
      }
    }

    if (input.age !== undefined) {
      if (!Number.isInteger(input.age) || input.age < 10 || input.age > 120) {
        throw new ProfileValidationError('age', 'Yaş 10-120 arasında olmalıdır');
      }
    }

    if (input.bio !== undefined) {
      if (input.bio.length > 3000) {
        throw new ProfileValidationError('bio', 'Bio 3000 simvoldan çox ola bilməz');
      }
    }

    if (input.gender !== undefined) {
      if (!Object.values(Gender).includes(input.gender)) {
        throw new ProfileValidationError('gender', 'Düzgün cinsiyyət seçin');
      }
    }
  }
}
