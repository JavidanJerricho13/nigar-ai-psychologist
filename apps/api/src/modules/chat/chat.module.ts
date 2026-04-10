import { Module } from '@nestjs/common';
import { OpenAiAdapter } from './infrastructure/adapters/openai.adapter';
import { AnthropicAdapter } from './infrastructure/adapters/anthropic.adapter';
import { GeminiAdapter } from './infrastructure/adapters/gemini.adapter';
import { FallbackRouter } from './infrastructure/providers/fallback-router';
import { PromptBuilderService } from './infrastructure/prompt/prompt-builder.service';
import { PiiStripperService } from './infrastructure/pii/pii-stripper.service';
import { SlidingWindowService } from './infrastructure/context/sliding-window.service';
import { SendMessageUseCase } from './domain/use-cases/send-message.use-case';

@Module({
  providers: [
    // LLM Adapters
    OpenAiAdapter,
    AnthropicAdapter,
    GeminiAdapter,

    // Router
    FallbackRouter,

    // Prompt pipeline
    PromptBuilderService,
    PiiStripperService,
    SlidingWindowService,

    // Use Cases
    SendMessageUseCase,
  ],
  exports: [
    SendMessageUseCase,
    PiiStripperService,
    FallbackRouter,
  ],
})
export class ChatModule {}
