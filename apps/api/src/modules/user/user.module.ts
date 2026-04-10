import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from './domain/ports/user.repository.port';
import { PROFILE_REPOSITORY } from './domain/ports/profile.repository.port';
import { SETTINGS_REPOSITORY } from './domain/ports/settings.repository.port';
import { PrismaUserRepository } from './infrastructure/adapters/prisma-user.repository';
import { PrismaProfileRepository } from './infrastructure/adapters/prisma-profile.repository';
import { PrismaSettingsRepository } from './infrastructure/adapters/prisma-settings.repository';
import { IdentifyUserUseCase } from './domain/use-cases/identify-user.use-case';
import { UpdateProfileUseCase } from './domain/use-cases/update-profile.use-case';
import { UpdateSettingsUseCase } from './domain/use-cases/update-settings.use-case';
import { GetUserFullProfileUseCase } from './domain/use-cases/get-user-full-profile.use-case';

@Module({
  providers: [
    // Ports → Adapters
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PROFILE_REPOSITORY, useClass: PrismaProfileRepository },
    { provide: SETTINGS_REPOSITORY, useClass: PrismaSettingsRepository },

    // Use Cases
    IdentifyUserUseCase,
    UpdateProfileUseCase,
    UpdateSettingsUseCase,
    GetUserFullProfileUseCase,
  ],
  exports: [
    IdentifyUserUseCase,
    UpdateProfileUseCase,
    UpdateSettingsUseCase,
    GetUserFullProfileUseCase,
  ],
})
export class UserModule {}
