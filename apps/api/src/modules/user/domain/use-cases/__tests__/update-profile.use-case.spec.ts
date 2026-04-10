import { Gender } from '@nigar/shared-types';
import { UpdateProfileUseCase, ProfileValidationError } from '../update-profile.use-case';
import { UserProfile } from '../../entities/user-profile.entity';
import { ProfileRepositoryPort } from '../../ports/profile.repository.port';

describe('UpdateProfileUseCase', () => {
  let useCase: UpdateProfileUseCase;
  let mockRepo: jest.Mocked<ProfileRepositoryPort>;

  const existingProfile = new UserProfile({
    id: 'profile-1',
    userId: 'user-1',
    name: 'Əli',
    gender: Gender.MALE,
    age: 25,
    bio: 'Test bio',
    onboardingCompleted: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    mockRepo = {
      findByUserId: jest.fn().mockResolvedValue(existingProfile),
      save: jest.fn().mockResolvedValue(undefined),
      createDefault: jest.fn(),
    };
    useCase = new UpdateProfileUseCase(mockRepo);
  });

  it('should update name successfully', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      name: 'Cavidan',
    });

    expect(result.name).toBe('Cavidan');
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should update age successfully', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      age: 30,
    });

    expect(result.age).toBe(30);
  });

  it('should update gender successfully', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      gender: Gender.FEMALE,
    });

    expect(result.gender).toBe(Gender.FEMALE);
  });

  it('should update bio successfully', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      bio: 'Yeni bio mətn',
    });

    expect(result.bio).toBe('Yeni bio mətn');
  });

  it('should update multiple fields at once', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      name: 'Nigar',
      age: 28,
      bio: 'Psixologiya ilə maraqlanıram',
    });

    expect(result.name).toBe('Nigar');
    expect(result.age).toBe(28);
    expect(result.bio).toBe('Psixologiya ilə maraqlanıram');
  });

  // Validation tests

  it('should reject empty name', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', name: '   ' }),
    ).rejects.toThrow(ProfileValidationError);

    await expect(
      useCase.execute({ userId: 'user-1', name: '   ' }),
    ).rejects.toThrow('boş');
  });

  it('should reject name longer than 255 chars', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', name: 'a'.repeat(256) }),
    ).rejects.toThrow(ProfileValidationError);
  });

  it('should reject age below 10', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', age: 5 }),
    ).rejects.toThrow(ProfileValidationError);
  });

  it('should reject age above 120', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', age: 150 }),
    ).rejects.toThrow(ProfileValidationError);
  });

  it('should reject non-integer age', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', age: 25.5 }),
    ).rejects.toThrow(ProfileValidationError);
  });

  it('should reject bio longer than 3000 chars', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', bio: 'x'.repeat(3001) }),
    ).rejects.toThrow(ProfileValidationError);
  });

  it('should accept bio exactly 3000 chars', async () => {
    const result = await useCase.execute({
      userId: 'user-1',
      bio: 'x'.repeat(3000),
    });

    expect(result.bio).toHaveLength(3000);
  });

  it('should create default profile if not found', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);

    const newProfile = new UserProfile({
      id: 'profile-new',
      userId: 'user-2',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockRepo.createDefault.mockResolvedValue(newProfile);

    const result = await useCase.execute({
      userId: 'user-2',
      name: 'Yeni İstifadəçi',
    });

    expect(mockRepo.createDefault).toHaveBeenCalledWith('user-2');
    expect(result.name).toBe('Yeni İstifadəçi');
  });

  it('should not call save when validation fails', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', age: -1 }),
    ).rejects.toThrow();

    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
