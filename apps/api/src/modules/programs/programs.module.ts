import { Module } from '@nestjs/common';
import { ProgramService } from './domain/services/program.service';

@Module({
  providers: [ProgramService],
  exports: [ProgramService],
})
export class ProgramsModule {}
