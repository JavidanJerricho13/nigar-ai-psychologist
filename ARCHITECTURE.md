# AI Psychologist "Nigar" — Architecture & Implementation Plan

## Context

**Problem:** Build an AI therapy chatbot ("Nigar") for the Azerbaijani market. Initially a Telegram bot, but the backend must be API-first so a mobile app can connect later. The product requires multi-LLM routing, voice support (STT/TTS), a complex 12-step onboarding FSM, dynamic persona system, and a credits/billing model.

**Key constraint:** The core domain must be strictly isolated from Telegram. Hexagonal Architecture (Ports & Adapters) so any transport (REST, WebSocket, mobile) can plug in without touching business logic.

---

## 1. Stack Justification

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Node.js 20 LTS | Ecosystem maturity, async I/O for LLM streaming |
| **Framework** | NestJS | Modular DI, first-class TypeScript, guards/interceptors/pipes for hexagonal boundaries |
| **Monorepo** | Turborepo + pnpm workspaces | Fast builds, shared packages, separate `apps/api` and `apps/tg-bot` |
| **ORM** | Prisma | Schema-first, airtight generated types, fast iteration for evolving data model |
| **Database** | PostgreSQL 16 | JSONB for FSM state, pgcrypto extension available, battle-tested |
| **Cache/FSM State** | Redis 7 | Sub-ms reads for FSM state, session tokens, rate limiting |
| **Telegram SDK** | grammY | TypeScript-first, cleaner API than Telegraf, active ecosystem |
| **Message Queue** | BullMQ (Redis-backed) | Audio pipeline needs async retry-able jobs; NestJS has `@nestjs/bullmq` |
| **STT** | OpenAI Whisper API (primary), Groq Whisper (fallback) | Whisper supports Azerbaijani ("az"); Groq is faster but may lack az support |
| **TTS** | ElevenLabs (primary), OpenAI TTS (fallback) | ElevenLabs has better voice quality; OpenAI TTS as cost-effective fallback |
| **LLM Providers** | OpenAI GPT-4o-mini (default), Claude Haiku (fallback), Gemini Flash (last resort) | Cost-effective for AZ market; per-persona overrides for quality-critical paths |
| **Deployment** | Railway (initial), VPS + Docker (scale) | Managed PG/Redis included; ~$20-40/mo at launch |

---

## 2. High-Level Architecture (C4 — Container Level)

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXTERNAL CLIENTS                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ Telegram  │  │ Mobile App   │  │ Web Dashboard (future)    │  │
│  │  Users    │  │ (future)     │  │                           │  │
│  └─────┬────┘  └──────┬───────┘  └────────────┬──────────────┘  │
└────────┼───────────────┼──────────────────────┼─────────────────┘
         │               │                      │
         ▼               ▼                      ▼
┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐
│  tg-bot     │  │ REST/WS API  │  │ Admin API (future)        │
│  (grammY    │  │ (NestJS      │  │                           │
│   adapter)  │  │  controllers)│  │                           │
└──────┬──────┘  └──────┬───────┘  └────────────┬──────────────┘
       │                │                       │
       └────────────────┼───────────────────────┘
                        │
                        ▼
         ┌──────────────────────────────┐
         │     CORE DOMAIN (NestJS)     │
         │                              │
         │  ┌────────────────────────┐  │
         │  │ Command Router         │  │
         │  │ (maps commands to      │  │
         │  │  use cases)            │  │
         │  └───────────┬────────────┘  │
         │              │               │
         │  ┌───────────▼────────────┐  │
         │  │ Use Cases              │  │
         │  │ • Onboarding FSM       │  │
         │  │ • Chat / Send Message  │  │
         │  │ • Profile CRUD         │  │
         │  │ • Credits / Billing    │  │
         │  │ • Referrals            │  │
         │  │ • Role Selection       │  │
         │  └───────────┬────────────┘  │
         │              │               │
         │  ┌───────────▼────────────┐  │
         │  │ Domain Ports           │  │
         │  │ (interfaces only)      │  │
         │  └───────────┬────────────┘  │
         └──────────────┼───────────────┘
                        │
          ┌─────────────┼─────────────────┐
          │             │                 │
          ▼             ▼                 ▼
┌──────────────┐ ┌─────────────┐ ┌──────────────────┐
│ DB Adapters  │ │ LLM Adapters│ │ Audio Adapters   │
│ (Prisma +    │ │ (OpenAI,    │ │ (Whisper STT,    │
│  PostgreSQL) │ │  Claude,    │ │  ElevenLabs TTS, │
│              │ │  Gemini)    │ │  FFmpeg convert)  │
│ Redis        │ │             │ │                  │
│ (sessions,   │ │ PII Strip   │ │ BullMQ queues    │
│  FSM cache)  │ │ Prompt Build│ │                  │
└──────────────┘ └─────────────┘ └──────────────────┘
```

**Flow for a Telegram voice message:**
1. User sends voice → grammY adapter downloads OGG (Opus codec)
2. Adapter calls `CommandRouter.handle({ type: 'voice', userId, audioBuffer })`
3. Router dispatches to `TranscribeVoice` use case → BullMQ job → Whisper STT
4. Transcript feeds into `SendMessage` use case → Prompt Builder → LLM
5. LLM response → if user prefers voice → `SynthesizeSpeech` use case → TTS (MP3/WAV output)
6. **FFmpeg converts TTS output → OGG Opus** (`ffmpeg -i input.mp3 -c:a libopus -b:a 48k -ar 48000 output.ogg`)
7. Result returned to adapter → adapter sends TG voice message via `ctx.replyWithVoice()`

**CRITICAL: Telegram voice format.** Telegram only displays audio as a native voice message (waveform UI) if it is OGG with Opus codec. MP3/WAV will be sent as a generic audio file (music player UI). All TTS output must be converted to OGG Opus via FFmpeg before sending.

**Streaming illusion for text responses.** Telegram has no native streaming. To simulate "typing" effect:
1. Send initial message with first chunk of text + `sendChatAction('typing')`
2. LLM streams tokens → buffer in batches of ~10-15 words
3. Call `editMessageText` every 1.5-2 seconds with accumulated text
4. Minimum interval between edits: 1.5s (to avoid Telegram 429 Too Many Requests)
5. On stream completion, send final `editMessageText` with full response

This is implemented in `apps/tg-bot/src/renderers/streaming.renderer.ts`.

---

## 3. Project Structure (Folder Tree)

```
aipsychologist/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
├── apps/
│   ├── api/                                    # NestJS Core API
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/
│   │   │   │   ├── configuration.ts            # Typed env config
│   │   │   │   └── validation.ts               # Zod env validation
│   │   │   ├── common/
│   │   │   │   ├── encryption/
│   │   │   │   │   └── encryption.service.ts   # AES-256-GCM for messages
│   │   │   │   ├── guards/
│   │   │   │   │   └── throttle.guard.ts
│   │   │   │   ├── interceptors/
│   │   │   │   └── filters/
│   │   │   │       └── global-exception.filter.ts
│   │   │   │
│   │   │   ├── modules/
│   │   │   │   ├── user/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── entities/
│   │   │   │   │   │   │   └── user.entity.ts
│   │   │   │   │   │   ├── ports/
│   │   │   │   │   │   │   └── user.repository.port.ts
│   │   │   │   │   │   └── use-cases/
│   │   │   │   │   │       ├── create-user.use-case.ts
│   │   │   │   │   │       └── update-profile.use-case.ts
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   ├── adapters/
│   │   │   │   │   │   │   └── prisma-user.repository.ts
│   │   │   │   │   │   └── mappers/
│   │   │   │   │   │       └── user.mapper.ts
│   │   │   │   │   └── user.module.ts
│   │   │   │   │
│   │   │   │   ├── onboarding/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── entities/
│   │   │   │   │   │   │   └── onboarding-state.entity.ts
│   │   │   │   │   │   ├── ports/
│   │   │   │   │   │   │   └── onboarding.repository.port.ts
│   │   │   │   │   │   ├── use-cases/
│   │   │   │   │   │   │   ├── advance-step.use-case.ts
│   │   │   │   │   │   │   └── complete-onboarding.use-case.ts
│   │   │   │   │   │   └── fsm/
│   │   │   │   │   │       ├── onboarding-fsm.ts           # Pure FSM engine
│   │   │   │   │   │       ├── step.interface.ts           # Step contract
│   │   │   │   │   │       └── steps/
│   │   │   │   │   │           ├── 01-greeting.step.ts
│   │   │   │   │   │           ├── 02-why-need.step.ts
│   │   │   │   │   │           ├── 03-what-discuss.step.ts
│   │   │   │   │   │           ├── 04-methods.step.ts
│   │   │   │   │   │           ├── 05-credentials.step.ts
│   │   │   │   │   │           ├── 06-heavy-warning.step.ts
│   │   │   │   │   │           ├── 07-privacy-policy.step.ts
│   │   │   │   │   │           ├── 08-social-proof.step.ts
│   │   │   │   │   │           ├── 09-voice-demo.step.ts
│   │   │   │   │   │           ├── 10-ask-gender.step.ts
│   │   │   │   │   │           ├── 11-ask-name.step.ts
│   │   │   │   │   │           ├── 12-ask-age.step.ts
│   │   │   │   │   │           ├── 13-ask-bio.step.ts
│   │   │   │   │   │           └── 14-summary.step.ts
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   └── adapters/
│   │   │   │   │   │       ├── prisma-onboarding.repository.ts
│   │   │   │   │   │       └── redis-onboarding-cache.adapter.ts
│   │   │   │   │   └── onboarding.module.ts
│   │   │   │   │
│   │   │   │   ├── chat/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── ports/
│   │   │   │   │   │   │   ├── llm-provider.port.ts
│   │   │   │   │   │   │   ├── prompt-builder.port.ts
│   │   │   │   │   │   │   └── pii-stripper.port.ts
│   │   │   │   │   │   └── use-cases/
│   │   │   │   │   │       ├── send-message.use-case.ts
│   │   │   │   │   │       └── build-context.use-case.ts
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   ├── adapters/
│   │   │   │   │   │   │   ├── openai.adapter.ts
│   │   │   │   │   │   │   ├── anthropic.adapter.ts
│   │   │   │   │   │   │   └── gemini.adapter.ts
│   │   │   │   │   │   ├── providers/
│   │   │   │   │   │   │   ├── llm-provider.factory.ts
│   │   │   │   │   │   │   └── fallback-router.ts
│   │   │   │   │   │   ├── prompt/
│   │   │   │   │   │   │   ├── prompt-builder.service.ts
│   │   │   │   │   │   │   └── templates/
│   │   │   │   │   │   │       ├── nigar-base.prompt.ts
│   │   │   │   │   │   │       ├── nigar-black.prompt.ts
│   │   │   │   │   │   │       ├── super-nigar.prompt.ts
│   │   │   │   │   │   │       ├── nigar-dost.prompt.ts
│   │   │   │   │   │   │       ├── nigar-trainer.prompt.ts
│   │   │   │   │   │   │       ├── nigar-18plus.prompt.ts
│   │   │   │   │   │   │       └── system-preamble.ts
│   │   │   │   │   │   ├── pii/
│   │   │   │   │   │   │   ├── pii-stripper.service.ts
│   │   │   │   │   │   │   └── pii-patterns.ts            # AZ-specific patterns
│   │   │   │   │   │   └── context/
│   │   │   │   │   │       └── sliding-window.service.ts
│   │   │   │   │   └── chat.module.ts
│   │   │   │   │
│   │   │   │   ├── audio/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── ports/
│   │   │   │   │   │   │   ├── stt-provider.port.ts
│   │   │   │   │   │   │   └── tts-provider.port.ts
│   │   │   │   │   │   └── use-cases/
│   │   │   │   │   │       ├── transcribe-voice.use-case.ts
│   │   │   │   │   │       └── synthesize-speech.use-case.ts
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   ├── adapters/
│   │   │   │   │   │   │   ├── openai-whisper.adapter.ts
│   │   │   │   │   │   │   ├── groq-whisper.adapter.ts
│   │   │   │   │   │   │   ├── elevenlabs-tts.adapter.ts
│   │   │   │   │   │   │   └── openai-tts.adapter.ts
│   │   │   │   │   │   ├── conversion/
│   │   │   │   │   │   │   └── ffmpeg.service.ts
│   │   │   │   │   │   └── queues/
│   │   │   │   │   │       ├── audio.producer.ts
│   │   │   │   │   │       └── audio.consumer.ts
│   │   │   │   │   └── audio.module.ts
│   │   │   │   │
│   │   │   │   ├── persona/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   └── use-cases/
│   │   │   │   │   │       └── get-persona.use-case.ts
│   │   │   │   │   └── persona.module.ts
│   │   │   │   │
│   │   │   │   ├── billing/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   ├── ports/
│   │   │   │   │   │   │   └── credit.repository.port.ts
│   │   │   │   │   │   └── use-cases/
│   │   │   │   │   │       ├── deduct-credits.use-case.ts
│   │   │   │   │   │       ├── add-credits.use-case.ts
│   │   │   │   │   │       └── get-balance.use-case.ts
│   │   │   │   │   ├── infrastructure/
│   │   │   │   │   │   └── adapters/
│   │   │   │   │   │       └── prisma-credit.repository.ts
│   │   │   │   │   └── billing.module.ts
│   │   │   │   │
│   │   │   │   ├── referral/
│   │   │   │   │   ├── domain/
│   │   │   │   │   │   └── use-cases/
│   │   │   │   │   │       ├── generate-code.use-case.ts
│   │   │   │   │   │       └── apply-referral.use-case.ts
│   │   │   │   │   └── referral.module.ts
│   │   │   │   │
│   │   │   │   └── command-router/
│   │   │   │       ├── command-registry.ts
│   │   │   │       └── command-router.module.ts
│   │   │   │
│   │   │   └── shared/
│   │   │       └── redis/
│   │   │           └── redis.module.ts
│   │   ├── test/
│   │   ├── tsconfig.json
│   │   └── nest-cli.json
│   │
│   └── tg-bot/                                  # Thin Telegram Adapter
│       ├── src/
│       │   ├── main.ts
│       │   ├── bot.module.ts
│       │   ├── adapters/
│       │   │   └── telegram.adapter.ts          # grammY Bot setup
│       │   ├── handlers/
│       │   │   ├── command.handler.ts           # /start, /roles, etc.
│       │   │   ├── message.handler.ts           # Free-text routing
│       │   │   ├── callback-query.handler.ts    # Inline keyboards
│       │   │   └── voice.handler.ts             # Voice download
│       │   ├── renderers/
│       │   │   ├── onboarding.renderer.ts       # StepOutput → InlineKeyboard
│       │   │   ├── streaming.renderer.ts        # Batched editMessageText for LLM streaming illusion
│       │   │   ├── menu.renderer.ts
│       │   │   └── message.renderer.ts
│       │   └── config/
│       │       └── bot.config.ts
│       └── tsconfig.json
│
├── packages/
│   ├── prisma-client/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── package.json
│   ├── shared-types/                            # Domain DTOs, enums, interfaces
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   ├── eslint-config/
│   └── tsconfig/
│
└── .github/
    └── workflows/
        └── ci.yml
```

---

## 4. Database Design (Prisma Schema)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto]
}

// ===================== ENUMS =====================

enum ActiveRole {
  nigar
  nigar_black
  super_nigar
  nigar_dost
  nigar_trainer
  nigar_18plus
}

enum ResponseFormat {
  voice
  text
  voice_and_text
}

enum Gender {
  male
  female
  skip
}

enum MessageRole {
  user
  assistant
  system
}

enum TransactionType {
  purchase
  spend
  gift
  referral_bonus
}

// ===================== MODELS =====================

model User {
  id           String   @id @default(uuid()) @db.Uuid
  telegramId   String?  @unique @map("telegram_id")
  phone        String?  @unique
  email        String?  @unique
  isActive     Boolean  @default(true) @map("is_active")
  referralCode String   @unique @default(uuid()) @map("referral_code")
  referredBy   String?  @map("referred_by") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  referrer        User?            @relation("UserReferrals", fields: [referredBy], references: [id])
  referredUsers   User[]           @relation("UserReferrals")
  profile         UserProfile?
  settings        UserSettings?
  credits         Credit?
  onboardingState OnboardingState?
  conversations   Conversation[]
  transactions    Transaction[]
  referralsMade   Referral[]       @relation("ReferrerReferrals")
  referralsFrom   Referral[]       @relation("ReferredReferrals")

  @@index([referredBy])
  @@map("users")
}

model UserProfile {
  id                  String   @id @default(uuid()) @db.Uuid
  userId              String   @unique @map("user_id") @db.Uuid
  name                String?  @db.VarChar(255)
  gender              Gender?
  age                 Int?
  bio                 String?  @db.VarChar(3000)
  onboardingCompleted Boolean  @default(false) @map("onboarding_completed")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("user_profiles")
}

model UserSettings {
  id                        String         @id @default(uuid()) @db.Uuid
  userId                    String         @unique @map("user_id") @db.Uuid
  activeRole                ActiveRole     @default(nigar) @map("active_role")
  responseFormat            ResponseFormat @default(text) @map("response_format")
  nigarBlackRudenessEnabled Boolean        @default(false) @map("nigar_black_rudeness_enabled")
  language                  String         @default("az") @db.VarChar(10)
  createdAt                 DateTime       @default(now()) @map("created_at")
  updatedAt                 DateTime       @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("user_settings")
}

model Conversation {
  id           String     @id @default(uuid()) @db.Uuid
  userId       String     @map("user_id") @db.Uuid
  roleUsed     ActiveRole @map("role_used")
  messageCount Int        @default(0) @map("message_count")
  startedAt    DateTime   @default(now()) @map("started_at")
  endedAt      DateTime?  @map("ended_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages Message[]

  @@index([userId, startedAt(sort: Desc)])
  @@map("conversations")
}

model Message {
  id             String      @id @default(uuid()) @db.Uuid
  conversationId String      @map("conversation_id") @db.Uuid
  role           MessageRole
  content        String      // AES-256-GCM encrypted at app layer
  audioUrl       String?     @map("audio_url")
  tokensUsed     Int?        @map("tokens_used")
  llmProvider    String?     @map("llm_provider") @db.VarChar(50)
  createdAt      DateTime    @default(now()) @map("created_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt(sort: Asc)])
  @@map("messages")
}

model Credit {
  id                 String   @id @default(uuid()) @db.Uuid
  userId             String   @unique @map("user_id") @db.Uuid
  balance            Decimal  @default(0) @db.Decimal(12, 2)
  freeVoiceRemaining Int      @default(3) @map("free_voice_remaining")
  totalPurchased     Decimal  @default(0) @map("total_purchased") @db.Decimal(12, 2)
  totalSpent         Decimal  @default(0) @map("total_spent") @db.Decimal(12, 2)
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("credits")
}

model Transaction {
  id          String          @id @default(uuid()) @db.Uuid
  userId      String          @map("user_id") @db.Uuid
  type        TransactionType
  amount      Decimal         @db.Decimal(12, 2)
  description String?         @db.VarChar(500)
  createdAt   DateTime        @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@map("transactions")
}

model Referral {
  id            String   @id @default(uuid()) @db.Uuid
  referrerId    String   @map("referrer_id") @db.Uuid
  referredId    String   @map("referred_id") @db.Uuid
  bonusCredited Boolean  @default(false) @map("bonus_credited")
  createdAt     DateTime @default(now()) @map("created_at")

  referrer User @relation("ReferrerReferrals", fields: [referrerId], references: [id], onDelete: Cascade)
  referred User @relation("ReferredReferrals", fields: [referredId], references: [id], onDelete: Cascade)

  @@unique([referrerId, referredId])
  @@index([referrerId])
  @@index([referredId])
  @@map("referrals")
}

model OnboardingState {
  id              String    @id @default(uuid()) @db.Uuid
  userId          String    @unique @map("user_id") @db.Uuid
  currentStep     Int       @default(0) @map("current_step")
  stepData        Json?     @default("{}") @map("step_data") @db.JsonB
  privacyAccepted Boolean   @default(false) @map("privacy_accepted")
  startedAt       DateTime  @default(now()) @map("started_at")
  completedAt     DateTime? @map("completed_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("onboarding_states")
}
```

**Redis Key Schema:**

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `onboarding:{userId}` | Hash | 24h | FSM current_step + step_data cache |
| `session:{telegramId}` | String | 7d | TG ID → userId mapping |
| `ratelimit:{userId}:{action}` | Sorted set | 60s | Sliding window rate limiter |
| `voice_remaining:{userId}` | String | none | Fast voice credit check |
| `conversation:{conversationId}:ctx` | List | 1h | Recent messages for LLM context |

**Encryption:** AES-256-GCM at the application layer (not pgcrypto). Implemented as a Prisma middleware that auto-encrypts `Message.content` on write and decrypts on read. Key managed via env var (KMS in production).

---

## 5. Onboarding FSM Design (Core Pattern)

The FSM is **transport-agnostic** — pure functions, no Telegram dependency:

```typescript
// step.interface.ts — the contract every step implements
interface StepDefinition {
  id: string;
  order: number;
  prompt(state: OnboardingState): StepOutput;     // What to display
  validate(input: UserInput): ValidationResult;    // Is input valid?
  extract(input: UserInput): Record<string, any>;  // Pull data from input
  nextStep(state: OnboardingState): string | null; // Conditional branching
}

interface StepOutput {
  text: string;
  imageUrl?: string;            // For carousel images
  audioUrl?: string;            // For voice demo (step 9)
  options?: ButtonOption[];     // For inline keyboards
  inputType: 'button' | 'text' | 'text_or_button';
  validation?: { maxLength?: number };
}

// onboarding-fsm.ts — pure orchestrator
function processStep(state: OnboardingState, input: UserInput): {
  newState: OnboardingState;
  output: StepOutput;
} {
  const currentStep = steps[state.currentStep];
  const validation = currentStep.validate(input);
  if (!validation.valid) return { newState: state, output: validation.errorOutput };

  const extracted = currentStep.extract(input);
  const updatedData = { ...state.stepData, ...extracted };
  const nextStepId = currentStep.nextStep({ ...state, stepData: updatedData });

  const newState = { ...state, currentStep: nextStepId, stepData: updatedData };
  const nextStep = steps[nextStepId];
  return { newState, output: nextStep.prompt(newState) };
}
```

The Telegram adapter's `onboarding.renderer.ts` maps `StepOutput` → grammY `InlineKeyboard`. A future mobile adapter maps `StepOutput` → JSON API response.

---

## 6. LLM Pipeline Design

**Prompt Assembly Order:**
```
[SYSTEM PREAMBLE — safety rails, AZ language instruction, response format]
[PERSONA BASE — selected role's personality and therapy approach]
[PERSONA MODIFIER — e.g., Nigar Black rudeness toggle appended dynamically]
[USER CONTEXT — age, gender, bio from profile]
[CONVERSATION HISTORY — sliding window, token-budgeted]
[CURRENT USER MESSAGE — PII-stripped]
```

**Fallback Routing:**
```
Default: GPT-4o-mini → Claude Haiku → Gemini Flash
Crisis detection: GPT-4o (higher capability for safety)
Super Nigar: Claude Sonnet (smartest available)
```

**PII Stripping (AZ-specific):** Phone (`+994`, `050/055/070/077`), emails, national IDs, addresses stripped and replaced with tokens `[PHONE_1]`, `[EMAIL_1]` before LLM call.

---

## 7. Implementation Phases

### Phase 0: Foundation (3-5 days) — Size: M
- Turborepo + pnpm monorepo scaffolding
- NestJS project in `apps/api/`, empty `apps/tg-bot/`
- Docker Compose: PostgreSQL 16, Redis 7
- Prisma schema + initial migration
- Typed config with Zod validation
- CI pipeline (lint, typecheck, test)

### Phase 1: Core Domain & FSM (7-10 days) — Size: L
- Onboarding FSM engine (14 steps, transport-agnostic)
- User/Profile/Settings CRUD use cases + Prisma adapters
- Command router (string commands → use case dispatch)
- Redis session management
- **Tests:** Unit tests for every FSM step (pure functions), integration tests for repositories

### Phase 2: Telegram Adapter (5-7 days) — Size: M
- grammY bot setup with webhook/long-polling toggle
- Command handlers → delegate to core use cases
- `onboarding.renderer.ts` maps `StepOutput` → InlineKeyboard
- Voice message download (OGG from TG API)
- **Tests:** Handler tests with mocked grammY context

### Phase 3: LLM Integration (8-12 days) — Size: L
- Multi-provider adapters (OpenAI, Claude, Gemini)
- Fallback router with retry logic
- Prompt builder with persona templates + dynamic modifiers
- PII stripping service (AZ patterns)
- Sliding window context manager (4000 token budget)
- **Tests:** Unit tests for prompt builder, PII stripper; mocked provider tests

### Phase 4: Audio Pipeline (5-7 days) — Size: M
- STT: OpenAI Whisper adapter (language hint: "az")
- TTS: ElevenLabs + OpenAI TTS adapters
- FFmpeg conversion: TTS output (MP3/WAV) → OGG Opus for Telegram voice (`libopus`, 48kHz)
- BullMQ queue for async audio jobs (concurrency: 3, retry: 2)
- Voice credit tracking (3 free, then paid)
- **Tests:** Queue integration tests, mocked STT/TTS

### Phase 5: Business Features (5-7 days) — Size: M
- Credits/billing: deduct, add, get balance
- Referral system: code generation, deep link capture, bonus grant
- `/balance`, `/pay`, `/referral`, `/roles`, `/settings` commands
- **Tests:** Credit arithmetic, referral flow edge cases

### Phase 6: Production (5-7 days) — Size: M
- Rate limiting (`@nestjs/throttler` + Redis)
- TG webhook secret guard
- Sentry error tracking
- Dockerfiles for api + tg-bot
- Railway deployment config
- Daily PostgreSQL backups to S3/R2
- Crisis detection prompt (Azerbaijan crisis hotline: 860-510-510)

**Phase Dependency Graph:**
```
Phase 0 → Phase 1 → Phase 2 (TG adapter)
                   → Phase 3 (LLM) ──────→ Phase 4 (Audio) → Phase 6
                   → Phase 5 (Business) ─→
```
Phases 2, 3, 5 can run in parallel after Phase 1.

---

## 8. Critical Early Decisions

1. **Azerbaijani STT quality:** Whisper supports "az" but quality may be poor. Test early in Phase 4 with real AZ voice samples. Fallback: user types instead.
2. **Crisis detection is non-negotiable before launch.** If user expresses suicidal ideation → detect in prompt layer → respond with emergency resources (AZ hotline: 860-510-510).
3. **Data residency:** AZ therapy data going to US-based LLM APIs. PII stripper partially mitigates. Research legal implications early.
4. **Do NOT use grammY `conversations` plugin for onboarding.** Build custom transport-agnostic FSM (Phase 1). grammY is a pure I/O adapter only.

---

## 9. Verification Plan

After each phase, verify end-to-end:
- **Phase 0:** `docker compose up` → API boots, connects to PG + Redis, migration runs
- **Phase 1:** Unit tests pass for all 14 FSM steps; `pnpm test` green
- **Phase 2:** Send `/start` to test bot → full onboarding carousel works, profile saved to DB
- **Phase 3:** Send text message → LLM responds with correct persona; kill primary provider → fallback works
- **Phase 4:** Send voice message → transcription → LLM response → TTS voice reply
- **Phase 5:** `/referral` generates code; new user with deep link → both get credits
- **Phase 6:** Load test with k6 (100 concurrent users); rate limiter blocks abuse; Sentry captures errors
