# AI Psychologist "Nigar" — Completion Roadmap

> All tasks required to reach 100% Production & Sales Readiness.
> Ordered by priority. Blockers first.

---

## Priority 1: Core Chat Loop (BLOCKER — bot can't respond without this)

- [ ] **Wire `SendMessageUseCase` into `CommandRouter.handleChat()`**
  - File: `apps/api/src/modules/command-router/command-router.service.ts` (line 330-339)
  - Inject `SendMessageUseCase` into constructor
  - Replace stub with: fetch user profile → call `sendMessage.execute()` → return AI response
  - File: `apps/api/src/modules/command-router/command-router.module.ts` — import `ChatModule`
- [ ] **Wire `SendMessageUseCase` into `bot-entry.ts` chat flow**
  - File: `apps/api/src/bot-entry.ts` — the inline `handleChat` equivalent must call SendMessageUseCase
- [ ] **Set real OpenAI API key in `.env`**
  - File: `.env` — replace `OPENAI_API_KEY=sk-xxx` with real key
- [ ] **Test end-to-end: send text → get AI response in Telegram**
- [ ] **Implement `/clear_chat` command** (clear conversation context from Redis)
  - File: `apps/api/src/modules/command-router/command-router.service.ts`
  - Call `session.clearConversationContext(conversationId)`

---

## Priority 2: Voice Pipeline (core differentiator)

- [ ] **Wire VoiceHandler → STT transcription**
  - File: `apps/tg-bot/src/handlers/voice.handler.ts`
  - After downloading OGG, call `TranscribeVoiceUseCase.execute()` directly (skip queue for MVP)
  - Pass transcribed text to `CommandRouter.dispatch()` as text message
- [ ] **Wire TTS response for voice-preference users**
  - In `CommandRouter.handleChat()`: check user's `responseFormat` setting
  - If `voice` or `voice_and_text`: call `SynthesizeSpeechUseCase.execute()` after LLM response
  - Return OGG buffer in `CommandResponse.meta.audioBuffer`
- [ ] **Update bot-entry.ts to send voice replies**
  - After getting response, if `meta.audioBuffer` exists → `ctx.replyWithVoice(buffer)`
- [ ] **Implement `SynthesisConsumer`** (BullMQ consumer for TTS queue)
  - File: `apps/api/src/modules/audio/infrastructure/queues/synthesis.consumer.ts`
  - Process synthesis jobs and store result
- [ ] **Set ElevenLabs API key in `.env`**
  - File: `.env` — replace `ELEVENLABS_API_KEY=xxx` and `ELEVENLABS_VOICE_ID=xxx`
- [ ] **Test end-to-end: send voice → get voice reply in Telegram**

---

## Priority 3: Role Switching (makes personas usable)

- [ ] **Implement role switching via callback buttons**
  - File: `apps/api/src/modules/command-router/command-router.service.ts` → `handleSettings()`
  - When user taps a role button from `/roles`, call `updateSettings.execute({ activeRole })`
- [ ] **Pass active role to `SendMessageUseCase` from router**
  - Fetch `settings.activeRole` and `settings.nigarBlackRudenessEnabled`
  - Pass as `persona` and `rudenessEnabled` params
- [ ] **Implement `/nigar_black` settings toggle**
  - Handler for toggling `nigarBlackRudenessEnabled` on/off
  - Show current state + toggle button

---

## Priority 4: Payments & Monetization

- [ ] **Implement `/pay` command with credit packages**
  - File: `apps/api/src/modules/command-router/command-router.service.ts`
  - Show inline buttons: "10 kreditlər — $X", "50 kreditlər — $X", "100 kreditlər — $X"
- [ ] **Create payment adapter stub** (for testing without real processor)
  - File: `apps/api/src/modules/billing/infrastructure/adapters/payment.adapter.ts`
  - Interface: `PaymentAdapterPort.createCheckout(userId, amount)`
- [ ] **Integrate Stripe**
  - Create Stripe checkout session → redirect user
  - Webhook handler: on payment success → `AddCreditsUseCase.execute()`
  - File: `apps/api/src/modules/billing/infrastructure/adapters/stripe.adapter.ts`
- [ ] **Implement `/credits` command** — show transaction history
  - Query `Transaction` table, display last 10 transactions
- [ ] **Implement `/gift` command** — transfer credits to another user
  - Atomic deduct from sender + add to receiver

---

## Priority 5: Essential Commands (user-facing features)

- [ ] **Implement `/topics` command** — predefined conversation starters
  - Show list of topic buttons (stress, relationships, career, etc.)
  - On select: pre-fill system prompt with topic context
- [ ] **Implement `/progress` command** — usage statistics
  - Total messages sent, sessions count, voice messages used
  - Query from `Conversation` + `Message` tables
- [ ] **Implement `/memory` command** — show what bot remembers
  - Display last N messages from current conversation context (Redis)
- [ ] **Implement `/support` command** — real contact info
  - Replace stub with actual support email/TG channel link
- [ ] **Implement `/about_company` command** — company info
  - Replace stub with actual company details

---

## Priority 6: Onboarding Polish

- [ ] **Create/upload onboarding image assets**
  - `assets/onboarding/why-need.png`
  - `assets/onboarding/what-discuss.png`
  - `assets/onboarding/methods.png`
  - `assets/onboarding/credentials.png`
  - `assets/onboarding/heavy-warning.png`
  - `assets/onboarding/social-proof.png`
- [ ] **Upload pre-recorded Nigar voice demo**
  - `assets/onboarding/nigar-voice-demo.ogg` (OGG Opus format)
- [ ] **Update renderers to send images from assets**
  - File: `apps/tg-bot/src/renderers/message.renderer.ts`
  - Map `imageUrl` to Telegram `sendPhoto()` with actual file

---

## Priority 7: Production Infrastructure

- [ ] **Configure Sentry DSN in `.env`**
  - Create Sentry project → copy DSN → set `SENTRY_DSN=` in `.env`
- [ ] **Switch throttler to Redis storage**
  - File: `apps/api/src/app.module.ts`
  - Install `@nestjs/throttler` storage adapter for Redis (ioredis)
  - Pass Redis connection to ThrottlerModule config
- [ ] **Set Anthropic API key in `.env`**
  - `ANTHROPIC_API_KEY=sk-ant-...`
- [ ] **Set Google AI API key in `.env`**
  - `GOOGLE_AI_API_KEY=...`
- [ ] **Set Groq API key in `.env`** (already set: `gsk_JEO...`)
  - ✅ Already configured
- [ ] **Add CI step for Prisma migrations**
  - File: `.github/workflows/ci.yml`
  - Add: `pnpm db:generate` before typecheck
- [ ] **Test Docker builds**
  - `docker build -f infra/Dockerfile.api .`
  - `docker build -f infra/Dockerfile.tg-bot .`
- [ ] **Deploy to Railway**
  - Connect GitHub repo → auto-deploy from `main`
  - Set all env vars in Railway dashboard

---

## Priority 8: Nice-to-Have (post-launch)

- [ ] **Implement `/image` command** — AI image generation (DALL-E / fal.ai)
- [ ] **Implement `/tales` command** — therapeutic story generator
- [ ] **Implement `/art` command** — art therapy analysis
- [ ] **Implement `/nigar_files` command** — downloadable resources
- [ ] **Implement `/b2b` command** — business partnership info
- [ ] **Implement `/ping` command** — reminder scheduling
- [ ] **Add Telegram streaming illusion** (editMessageText batching)
  - File: `apps/tg-bot/src/renderers/streaming.renderer.ts`
  - Batch: 10-15 words per edit, 1.5s minimum interval
- [ ] **Referral sharing button** — one-tap share via Telegram
- [ ] **Admin dashboard** — user stats, crisis alerts, revenue metrics
- [ ] **Mobile app REST API controllers** — prepare for Phase 2 (mobile)

---

## Completion Milestones

| Milestone | Tasks | Status |
|-----------|-------|--------|
| **Bot responds to text** | Priority 1 | ❌ Blocked |
| **Bot responds to voice** | Priority 1 + 2 | ❌ Blocked |
| **Users can switch personas** | Priority 3 | ❌ |
| **Users can pay** | Priority 4 | ❌ |
| **MVP Launch** | Priority 1-5 | ❌ |
| **Production Deploy** | Priority 1-7 | ❌ |
| **Full Feature Set** | All | ❌ |
