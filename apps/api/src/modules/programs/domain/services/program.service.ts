import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PROGRAM_MAP, PROGRAM_CATALOG, ProgramDefinition } from '../data/program-catalog';

export interface ProgramProgress {
  programId: string;
  programName: string;
  currentWeek: number;
  currentDay: number;
  totalWeeks: number;
  completedDays: number;
  totalDays: number;
  progressPercent: number;
  status: string;
}

export interface TodayExercise {
  programId: string;
  programName: string;
  weekTitle: string;
  dayTitle: string;
  exerciseTitle: string;
  exerciseDescription: string;
  llmPrompt: string;
  durationMinutes: number;
  type: string;
  week: number;
  day: number;
}

@Injectable()
export class ProgramService {
  private readonly logger = new Logger(ProgramService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** List all available programs */
  getAvailablePrograms(): Array<{
    id: string;
    name: string;
    description: string;
    approach: string;
    totalWeeks: number;
    targetAudience: string;
  }> {
    return PROGRAM_CATALOG.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      approach: p.approach,
      totalWeeks: p.totalWeeks,
      targetAudience: p.targetAudience,
    }));
  }

  /** Start a program for a user */
  async startProgram(userId: string, programId: string): Promise<ProgramProgress> {
    const program = PROGRAM_MAP.get(programId);
    if (!program) throw new Error(`Proqram tapılmadı: ${programId}`);

    // Check if user already has this program
    const existing = await this.prisma.userProgram.findUnique({
      where: { userId_programId: { userId, programId } },
    });

    if (existing && existing.status === 'active') {
      throw new Error('Bu proqram artıq aktivdir.');
    }

    const userProgram = existing
      ? await this.prisma.userProgram.update({
          where: { id: existing.id },
          data: { status: 'active', currentWeek: 1, currentDay: 1, completedDays: 0, completedAt: null },
        })
      : await this.prisma.userProgram.create({
          data: { userId, programId, totalWeeks: program.totalWeeks },
        });

    this.logger.log(`Program started: ${programId} for user ${userId.slice(0, 8)}`);

    return this.buildProgress(userProgram, program);
  }

  /** Get the user's active program(s) progress */
  async getActivePrograms(userId: string): Promise<ProgramProgress[]> {
    const programs = await this.prisma.userProgram.findMany({
      where: { userId, status: 'active' },
    });

    return programs
      .map((up) => {
        const def = PROGRAM_MAP.get(up.programId);
        return def ? this.buildProgress(up, def) : null;
      })
      .filter(Boolean) as ProgramProgress[];
  }

  /** Get today's exercise for the user's active program */
  async getTodayExercise(userId: string, programId: string): Promise<TodayExercise | null> {
    const userProgram = await this.prisma.userProgram.findUnique({
      where: { userId_programId: { userId, programId } },
    });

    if (!userProgram || userProgram.status !== 'active') return null;

    const program = PROGRAM_MAP.get(programId);
    if (!program) return null;

    const weekDef = program.weeks.find((w) => w.week === userProgram.currentWeek);
    if (!weekDef) return null;

    const dayDef = weekDef.days.find((d) => d.day === userProgram.currentDay);
    if (!dayDef) return null;

    const exercise = dayDef.exercises[0]; // First exercise of the day
    if (!exercise) return null;

    return {
      programId,
      programName: program.name,
      weekTitle: weekDef.title,
      dayTitle: dayDef.title,
      exerciseTitle: exercise.title,
      exerciseDescription: exercise.description,
      llmPrompt: exercise.prompt,
      durationMinutes: exercise.durationMinutes,
      type: exercise.type,
      week: userProgram.currentWeek,
      day: userProgram.currentDay,
    };
  }

  /** Complete today's exercise and advance to the next day */
  async completeDay(
    userId: string,
    programId: string,
    moodBefore?: number,
    moodAfter?: number,
    notes?: string,
  ): Promise<{ advanced: boolean; completed: boolean; progress: ProgramProgress }> {
    const userProgram = await this.prisma.userProgram.findUnique({
      where: { userId_programId: { userId, programId } },
    });

    if (!userProgram || userProgram.status !== 'active') {
      throw new Error('Aktiv proqram tapılmadı.');
    }

    const program = PROGRAM_MAP.get(programId);
    if (!program) throw new Error('Proqram tapılmadı.');

    // Record day entry
    await this.prisma.programDayEntry.create({
      data: {
        userProgramId: userProgram.id,
        week: userProgram.currentWeek,
        day: userProgram.currentDay,
        exerciseDone: true,
        moodBefore,
        moodAfter,
        userNotes: notes,
      },
    });

    // Advance to next day
    let nextWeek = userProgram.currentWeek;
    let nextDay = userProgram.currentDay + 1;
    let isCompleted = false;

    const weekDef = program.weeks.find((w) => w.week === nextWeek);
    if (!weekDef || nextDay > weekDef.days.length) {
      // Move to next week
      nextWeek++;
      nextDay = 1;

      if (nextWeek > program.totalWeeks) {
        // Program completed
        isCompleted = true;
      }
    }

    const updated = await this.prisma.userProgram.update({
      where: { id: userProgram.id },
      data: {
        currentWeek: isCompleted ? userProgram.currentWeek : nextWeek,
        currentDay: isCompleted ? userProgram.currentDay : nextDay,
        completedDays: { increment: 1 },
        status: isCompleted ? 'completed' : 'active',
        completedAt: isCompleted ? new Date() : null,
      },
    });

    if (isCompleted) {
      this.logger.log(`Program completed: ${programId} for user ${userId.slice(0, 8)}`);
    }

    return {
      advanced: !isCompleted,
      completed: isCompleted,
      progress: this.buildProgress(updated, program),
    };
  }

  private buildProgress(
    userProgram: { currentWeek: number; currentDay: number; totalWeeks: number; completedDays: number; status: string; programId: string },
    program: ProgramDefinition,
  ): ProgramProgress {
    const totalDays = program.weeks.reduce((sum, w) => sum + w.days.length, 0);
    return {
      programId: userProgram.programId,
      programName: program.name,
      currentWeek: userProgram.currentWeek,
      currentDay: userProgram.currentDay,
      totalWeeks: userProgram.totalWeeks,
      completedDays: userProgram.completedDays,
      totalDays,
      progressPercent: Math.round((userProgram.completedDays / totalDays) * 100),
      status: userProgram.status,
    };
  }
}
