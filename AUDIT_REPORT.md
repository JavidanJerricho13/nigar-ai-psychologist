# AI Psychologist "Nigar" — Full Project Audit & Readiness Report

**Date:** April 11, 2026  
**Auditor:** Claude Opus 4.6  
**Codebase:** 17 spec files, 277+ tests, 8 NestJS modules, ~6,500 lines of production code

---

## 1. Feature Progress (Technical Audit)

### Onboarding FSM (13 steps)
```
██████████████████████████████████████████████████ 95%
```
**What works:** 13 steps fully implemented (greeting → bio), FSM engine processes state transitions, Redis caching with 24h TTL, Prisma persistence with auto-sync to UserProfile + UserSettings on completion, skip path bypasses carousel. 140 tests.  
**What's missing:** No image assets for carousel steps (imageUrl references files that don't exist yet). Summary step (14th) is built into FSM completion output, not a separate step class.

### Multi-LLM Integration & Fallbacks
```
████████████████████████████████████████████░░░░░░ 85%
```
**What works:** 3 provider adapters (OpenAI, Anthropic, Gemini) with correct API formats. FallbackRouter chains providers with per-persona routing (Super Nigar → Claude Sonnet, Crisis → GPT-4o). 6 persona templates with dynamic rudeness modifier. PromptBuilder assembles 6-layer prompt. PII stripper with AZ patterns. Sliding window (4000 tokens). SendMessageUseCase fully implemented end-to-end. 134 tests.  
**What's missing:** `CommandRouter.handleChat()` is a **stub** — SendMessageUseCase exists but is NOT called from the router. This is the #1 blocker for the bot to actually chat.

### Audio Pipeline (STT/TTS/FFmpeg)
```
████████████████████████████████████░░░░░░░░░░░░░░ 70%
```
**What works:** Whisper STT adapter (az hint), ElevenLabs + OpenAI TTS adapters, FFmpeg conversion (OGG↔WAV, MP3→OGG Opus 48kHz libopus), BullMQ producer + transcription consumer (concurrency:3, retry:2), voice credit tracking (3 free → paid → InsufficientCreditsException). 65 tests.  
**What's missing:** SynthesisConsumer not implemented (producer enqueues but nothing processes synthesis jobs). TG VoiceHandler downloads OGG but doesn't queue for STT — just passes file_id as text to CommandRouter. Audio pipeline is not wired end-to-end from Telegram yet.

### Billing & Credit System
```
██████████████████████████████████████████████░░░░ 90%
```
**What works:** GetBalance, DeductCredits, AddCredits use cases. All operations atomic via Prisma $transaction. Transaction table logging (every mutation creates audit record). InsufficientBalanceException. Voice credit deduction in SynthesizeSpeechUseCase. 36 tests.  
**What's missing:** No payment processor integration (Stripe/local). `/pay` command is a stub. No payment webhook handler. No receipt generation.

### Referral System
```
██████████████████████████████████████████████████ 95%
```
**What works:** ApplyReferralUseCase grants 5 credits to referrer + 3 to referred. Self-referral prevention. Double-referral prevention. Deep link parsing from `/start REF_CODE`. Auto-apply on new user registration in CommandRouter. GetReferralInfoUseCase with stats. 38 tests.  
**What's missing:** No referral analytics dashboard. No referral code sharing button in TG (just text display).

### Command Router & Handlers
```
████████████████████████████████████████░░░░░░░░░░ 80%
```
**What works:** 22 commands registered. 9 fully implemented (/start, /roles, /settings, /info, /format, /balance, /referral, /support, /other). Onboarding interception (blocks commands during onboarding). Deep link referral handling. 45 tests.  
**What's missing:** 13 commands are stubs (/pay, /topics, /art, /progress, /image, /tales, /nigar_files, /credits, /gift, /clear_chat, /memory, /about_company, /b2b). `handleChat()` returns placeholder instead of calling SendMessageUseCase.

---

## 2. Production Readiness (Stability & Security)

### Error Tracking (Sentry)
```
████████████████████████████████████████░░░░░░░░░░ 75%
```
**Implemented:** initSentry() in main.ts and bot-entry.ts. GlobalExceptionFilter catches 5xx and sends to Sentry with tags.  
**Missing:** No Sentry DSN configured in .env (value is placeholder). No performance monitoring. No custom breadcrumbs for command flow tracing. No alerts configured.

### Rate Limiting & Security
```
██████████████████████████████████████████████░░░░ 85%
```
**Implemented:** @nestjs/throttler with 3-tier limits (3/sec, 30/min, 500/hour). WebhookSecretGuard validates Telegram header. AES-256-GCM encryption for sensitive data. PII stripping before LLM calls.  
**Missing:** No per-user rate limiting (global only). No IP-based blocking. throttler-storage-redis not configured (uses in-memory — won't work across instances).

### Crisis Detection (Safety Layer)
```
██████████████████████████████████████████████████ 95%
```
**Implemented:** CrisisDetectorService with 33 keywords (AZ/RU/EN). Two-stage detection (keyword scan → LLM verification). Mandatory safety message with hotline 860-510-510 + 116-111 (child line). Bypasses ALL persona styles. Integrated into SendMessageUseCase. Audit logging. 16 tests.  
**Missing:** No admin alerting when crisis detected (just logs). No follow-up check system.

### Database Migrations & Backups
```
████████████████████████████████████████░░░░░░░░░░ 80%
```
**Implemented:** Prisma schema with 9 models, initial migration applied to Supabase. pg-backup.sh with S3/R2 upload and 30-day retention. docker-compose.yml for local Redis.  
**Missing:** No automated migration CI step. No migration rollback strategy. Backup script not tested against Supabase (designed for standard pg_dump). No monitoring for failed backups.

---

## 3. Business Maturity

### Ready for First Sales
```
████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░ 45%
```

**Why 45%:** The product can onboard users (FSM works), show profiles, handle referrals, and track credits. But users CANNOT actually chat with the AI (handleChat is a stub) and CANNOT pay for credits (/pay is a stub). These are the two core revenue activities.

### Overall Production Grade: **Late Alpha / Early Beta**

The architecture is production-grade (hexagonal, tested, encrypted, rate-limited). But the product is not yet end-to-end functional for the core user journey: **Send message → Get AI response → Use voice → Pay for more**.

---

## 4. Critical Gaps — Top 5 Before First Paying User

### 1. 🔴 Wire SendMessageUseCase into CommandRouter (BLOCKER)
**File:** `apps/api/src/modules/command-router/command-router.service.ts` line 330-339  
**Effort:** Small (inject SendMessageUseCase, replace stub with real call)  
**Impact:** Without this, the bot CANNOT respond with AI — the entire product is non-functional for chat.

### 2. 🔴 Wire Audio Pipeline End-to-End (BLOCKER for voice)
**Files:** `apps/tg-bot/src/handlers/voice.handler.ts`, `apps/api/src/modules/audio/`  
**Effort:** Medium (connect VoiceHandler → AudioProducer → STT → SendMessage → TTS → reply)  
**Impact:** Voice messages are the key differentiator. Currently downloads OGG but doesn't transcribe.

### 3. 🟡 Payment Integration (/pay command)
**File:** New payment adapter + update CommandRouter  
**Effort:** Large (Stripe integration, webhook handler, credit fulfillment)  
**Impact:** No revenue without payments. Can soft-launch with free tier first.

### 4. 🟡 Set Real API Keys in .env
**File:** `.env`  
**Current:** OpenAI, Anthropic, Google, ElevenLabs keys are all placeholders (`sk-xxx`)  
**Impact:** LLM and TTS calls will fail with 401 until real keys are set.

### 5. 🟡 Onboarding Image Assets
**What:** Carousel steps reference `imageUrl: 'onboarding/why-need.png'` etc. but no actual images exist  
**Impact:** Steps work without images (text + buttons only) but look incomplete vs the Anna bot reference

---

## Verification

To test the current state end-to-end:
1. `cd /mnt/c/Users/user/Others/Desktop/aipsychologist && node apps/api/dist/bot-entry.js`
2. Send `/start` to @Nigar_Psixoloq_bot in Telegram
3. Tap through onboarding carousel buttons
4. Enter name, age, bio → should see completion summary
5. Send free text → currently returns "LLM inteqrasiyası tezliklə aktiv olacaq" (stub)
6. `/balance` → shows credits
7. `/referral` → shows referral code
