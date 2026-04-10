import { Gender } from '@nigar/shared-types';

export class UserProfile {
  readonly id: string;
  readonly userId: string;
  name: string | null;
  gender: Gender | null;
  age: number | null;
  bio: string | null;
  onboardingCompleted: boolean;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(params: {
    id: string;
    userId: string;
    name?: string | null;
    gender?: Gender | null;
    age?: number | null;
    bio?: string | null;
    onboardingCompleted?: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = params.id;
    this.userId = params.userId;
    this.name = params.name ?? null;
    this.gender = params.gender ?? null;
    this.age = params.age ?? null;
    this.bio = params.bio ?? null;
    this.onboardingCompleted = params.onboardingCompleted ?? false;
    this.createdAt = params.createdAt;
    this.updatedAt = params.updatedAt;
  }

  updateProfile(data: {
    name?: string;
    gender?: Gender;
    age?: number;
    bio?: string;
  }): void {
    if (data.name !== undefined) this.name = data.name;
    if (data.gender !== undefined) this.gender = data.gender;
    if (data.age !== undefined) this.age = data.age;
    if (data.bio !== undefined) this.bio = data.bio;
    this.updatedAt = new Date();
  }
}
