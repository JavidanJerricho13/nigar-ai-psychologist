/**
 * AdminJS panel — standalone Express integration (no @adminjs/nestjs).
 *
 * @adminjs/nestjs is pure ESM and incompatible with our CommonJS project.
 * Instead, we mount AdminJS directly on the Express app via buildRouter().
 */
import { Module } from '@nestjs/common';

@Module({})
export class AdminPanelModule {}
