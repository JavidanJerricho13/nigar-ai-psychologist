import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { OnboardingRepositoryPort } from '../../domain/ports/onboarding.repository.port';
import { OnboardingState } from '../../domain/entities/onboarding-state.entity';

@Injectable()
export class PrismaOnboardingRepository implements OnboardingRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<OnboardingState | null> {
    const record = await this.prisma.onboardingState.findUnique({
      where: { userId },
    });

    if (!record) return null;

    return new OnboardingState({
      userId: record.userId,
      currentStep: this.stepFromInt(record.currentStep),
      stepData: (record.stepData as Record<string, unknown>) ?? {},
      completedSteps:
        ((record.stepData as Record<string, unknown>)?.completedSteps as string[]) ?? [],
      privacyAccepted: record.privacyAccepted,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    });
  }

  async save(state: OnboardingState): Promise<void> {
    const stepData = {
      ...state.stepData,
      completedSteps: state.completedSteps,
    };

    await this.prisma.onboardingState.upsert({
      where: { userId: state.userId },
      create: {
        userId: state.userId,
        currentStep: this.stepToInt(state.currentStep),
        stepData,
        privacyAccepted: state.privacyAccepted,
        startedAt: state.startedAt,
        completedAt: state.completedAt,
      },
      update: {
        currentStep: this.stepToInt(state.currentStep),
        stepData,
        privacyAccepted: state.privacyAccepted,
        completedAt: state.completedAt,
      },
    });

    // If completed, also update the user profile
    if (state.isCompleted) {
      await this.syncUserProfile(state);
    }
  }

  async isCompleted(userId: string): Promise<boolean> {
    const record = await this.prisma.onboardingState.findUnique({
      where: { userId },
      select: { completedAt: true },
    });
    return record?.completedAt !== null && record?.completedAt !== undefined;
  }

  /** Flatten collected data into UserProfile + UserSettings on completion */
  private async syncUserProfile(state: OnboardingState): Promise<void> {
    const d = state.stepData;

    // Upsert profile
    await this.prisma.userProfile.upsert({
      where: { userId: state.userId },
      create: {
        userId: state.userId,
        name: (d.name as string) || null,
        gender: this.mapGender(d.gender as string),
        age: (d.age as number) || null,
        bio: (d.bio as string) || null,
        onboardingCompleted: true,
      },
      update: {
        name: (d.name as string) || null,
        gender: this.mapGender(d.gender as string),
        age: (d.age as number) || null,
        bio: (d.bio as string) || null,
        onboardingCompleted: true,
      },
    });

    // Upsert settings
    const format = d.responseFormat as string;
    await this.prisma.userSettings.upsert({
      where: { userId: state.userId },
      create: {
        userId: state.userId,
        responseFormat: this.mapFormat(format),
      },
      update: {
        responseFormat: this.mapFormat(format),
      },
    });
  }

  private mapGender(g: string | undefined): 'male' | 'female' | 'skip' | null {
    if (g === 'male' || g === 'female' || g === 'skip') return g;
    return null;
  }

  private mapFormat(f: string | undefined): 'voice' | 'text' | 'voice_and_text' {
    if (f === 'voice' || f === 'voice_and_text') return f;
    return 'text';
  }

  /** Map step string ID to int (for DB storage) */
  private stepToInt(stepId: string): number {
    const map: Record<string, number> = {
      greeting: 0,
      why_need: 1,
      what_discuss: 2,
      methods: 3,
      credentials: 4,
      heavy_warning: 5,
      privacy_policy: 6,
      social_proof: 7,
      voice_demo: 8,
      ask_gender: 9,
      ask_name: 10,
      ask_age: 11,
      ask_bio: 12,
      completed: 13,
    };
    return map[stepId] ?? 0;
  }

  /** Map int from DB back to step string ID */
  private stepFromInt(stepInt: number): string {
    const map: Record<number, string> = {
      0: 'greeting',
      1: 'why_need',
      2: 'what_discuss',
      3: 'methods',
      4: 'credentials',
      5: 'heavy_warning',
      6: 'privacy_policy',
      7: 'social_proof',
      8: 'voice_demo',
      9: 'ask_gender',
      10: 'ask_name',
      11: 'ask_age',
      12: 'ask_bio',
      13: 'completed',
    };
    return map[stepInt] ?? 'greeting';
  }
}
