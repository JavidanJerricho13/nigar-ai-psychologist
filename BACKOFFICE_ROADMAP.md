# Backoffice Implementation Roadmap (AdminJS)

> Step-by-step plan to build a full Admin Panel using AdminJS v7 + Express.
> Based on all 40+ metrics defined in BACKOFFICE_ARCHITECTURE.md.
> Admin runs as **isolated ESM process** in `apps/admin/` (separate from bot).

---

## Phase 1: AdminJS Setup & Core CRUD ✅ COMPLETED

**Implemented in:** `apps/admin/` (standalone ESM workspace)

- [x] **1.1** Created `apps/admin/` workspace with `"type": "module"` (ESM)
  - AdminJS v7 + @adminjs/express + @adminjs/prisma
  - Separate tsconfig: `module: ESNext`, `moduleResolution: bundler`
  - Fixed @tiptap peer deps via pnpm overrides in root package.json
- [x] **1.2** Created `apps/admin/src/main.ts` — standalone Express server
  - NOT inside NestJS — AdminJS v7 ESM is incompatible with CommonJS bot
  - Runs on port 3001 (bot stays on 3000, zero coupling)
- [x] **1.3** Cookie-based session auth via `buildAuthenticatedRouter()`
  - Credentials from `ADMIN_EMAIL` + `ADMIN_PASSWORD` in `.env`
  - Login page auto-generated at `/admin/login`
- [x] **1.4** All 9 Prisma resources registered with configured columns:
  - **Users** — telegramId, isActive, referralCode, createdAt (+ CSV export)
  - **UserProfiles** — name, gender, age, onboardingCompleted
  - **UserSettings** — activeRole, responseFormat, nigarBlackRudenessEnabled, language
  - **Credits** — balance, freeVoiceRemaining, totalPurchased, totalSpent
  - **Conversations** — roleUsed, messageCount, startedAt, endedAt
  - **Messages** — role, llmProvider, tokensUsed, createdAt (**content hidden** — encrypted)
  - **Transactions** — type, amount, description, createdAt (read-only + CSV export)
  - **Referrals** — referrerId, referredId, bonusCredited, createdAt (read-only)
  - **OnboardingStates** — currentStep, privacyAccepted, completedAt
- [x] **1.5** CSV export enabled on Users and Transactions
- [x] **1.6** Verified: `http://localhost:3001/admin` — login works, all tables browsable

**Launch:** `node apps/admin/dist/main.js`

---

## Phase 2: Schema Additions (Day 2)

**Goal:** Add tables for crisis tracking and admin audit log.

- [ ] **2.1** Add `CrisisEvent` model to `schema.prisma`
  ```prisma
  model CrisisEvent {
    id        String   @id @default(uuid()) @db.Uuid
    userId    String   @map("user_id") @db.Uuid
    severity  String   @db.VarChar(20)
    keywords  String[]
    handled   Boolean  @default(false)
    createdAt DateTime @default(now()) @map("created_at")
    user      User     @relation(fields: [userId], references: [id])
    @@index([userId, createdAt(sort: Desc)])
    @@map("crisis_events")
  }
  ```
- [ ] **2.2** Add `AdminAction` model
  ```prisma
  model AdminAction {
    id         String   @id @default(uuid()) @db.Uuid
    adminEmail String   @map("admin_email")
    action     String
    targetId   String?  @map("target_id")
    details    Json?    @db.JsonB
    createdAt  DateTime @default(now()) @map("created_at")
    @@map("admin_actions")
  }
  ```
- [ ] **2.3** Update `SendMessageUseCase` — persist crisis events to `CrisisEvent` table
- [ ] **2.4** Run `prisma db push` against Supabase
- [ ] **2.5** Register `CrisisEvent` and `AdminAction` in AdminJS

---

## Phase 3: Custom Actions & Business Logic (Day 3)

**Goal:** Admin can perform real operations — not just read data.

- [ ] **3.1** Custom action: **"Grant Credits"** on Users resource
  - Form: amount (number), description (text)
  - Calls `AddCreditsUseCase.execute({ userId, amount, type: 'gift', description })`
  - Logs to `AdminAction` table
- [ ] **3.2** Custom action: **"Ban/Unban User"** on Users resource
  - Toggles `isActive` field
  - Logs to `AdminAction` table
- [ ] **3.3** Custom action: **"Mark Crisis Handled"** on CrisisEvents resource
  - Sets `handled = true`
  - Logs to `AdminAction` table
- [ ] **3.4** Custom action: **"View Decrypted Messages"** on Conversations resource
  - Fetches messages for conversation
  - Decrypts content via `EncryptionService.decrypt()`
  - Shows in a custom component (read-only, no copy)
- [ ] **3.5** Custom action: **"Reset Onboarding"** on Users resource
  - Deletes `OnboardingState` record → user can `/start` fresh
  - Logs to `AdminAction` table

---

## Phase 4: Analytics Service — All 40+ Metrics (Day 4)

**Goal:** NestJS service implementing every metric from BACKOFFICE_ARCHITECTURE.md §2.

**⚠️ PERFORMANCE:** All analytics queries MUST be cached in Redis to protect the production DB.
- Heavy aggregations (retention cohorts, token sums over millions of messages) will kill the DB if run on every dashboard refresh.
- Every method in `analytics.service.ts` wraps its result in Redis cache with appropriate TTL.
- A `@Cron` job recalculates expensive metrics on schedule (not on-demand).

File: `apps/api/src/admin/services/analytics.service.ts`
File: `apps/api/src/admin/services/analytics-cache.service.ts`

### Caching Strategy
- [ ] **4.0a** Create `AnalyticsCacheService` — wraps Redis get/set with `admin:metrics:` prefix
  ```typescript
  // Pattern: check cache → return if fresh → else compute + cache
  async getCached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const cached = await this.redis.get(`admin:metrics:${key}`);
    if (cached) return JSON.parse(cached);
    const result = await compute();
    await this.redis.set(`admin:metrics:${key}`, JSON.stringify(result), 'EX', ttlSeconds);
    return result;
  }
  ```
- [ ] **4.0b** Cache TTLs per metric weight:
  | Query weight | TTL | Examples |
  |-------------|-----|---------|
  | Light (COUNT, simple aggregate) | 5 min | E1, E2, E9, D5 |
  | Medium (groupBy, multi-table) | 1 hour | F1-F3, C1-C4, E5-E8 |
  | Heavy (raw SQL, joins, cohorts) | 24 hours | E10 retention, F8 referral ROI, C9 avg length |
- [ ] **4.0c** `@Cron('0 */1 * * *')` — hourly: recalculate medium-weight metrics
- [ ] **4.0d** `@Cron('0 3 * * *')` — daily at 3 AM: recalculate heavy metrics (retention, LTV, demographics)

### A. Financial Metrics (F1–F10)
- [ ] **4.1** `getFinancialKpis()` returning:
  - **F1** Total Revenue: `prisma.transaction.aggregate({ where: { type: 'purchase' }, _sum: { amount: true } })`
  - **F2** Revenue by period: same + `where created_at >= DATE_TRUNC`
  - **F3** ARPU: `totalRevenue / COUNT(DISTINCT userId WHERE type='purchase')`
  - **F4** LTV Estimate: `ARPU × AVG(NOW() - users.created_at) in months`
  - **F7** Paying User Ratio: `paying_users / total_users × 100`
  - **F10** Outstanding Credits: `prisma.credit.aggregate({ _sum: { balance: true } })`
- [ ] **4.2** `getCreditBurnRate()` → **F5**: SUM spend last 24h
- [ ] **4.3** `getPopularPackages()` → **F6**: groupBy description, take 5
- [ ] **4.4** `getReferralRoi()` → **F8**: raw SQL from BACKOFFICE_ARCHITECTURE.md §7 (Top Referrers)
- [ ] **4.5** `getGiftEconomy()` → **F9**: COUNT + SUM WHERE type='gift'

### B. Engagement Metrics (E1–E13)
- [ ] **4.6** `getEngagementKpis()` returning:
  - **E1** Total Users: `prisma.user.count()`
  - **E2** DAU: `conversation.findMany({ startedAt >= today, distinct: ['userId'] })`
  - **E3** WAU/MAU: same with 7d/30d
  - **E4** Stickiness: `DAU / MAU × 100`
  - **E5** Avg Messages/Session: `conversation.aggregate({ _avg: { messageCount } })`
  - **E6** Avg Sessions/User: subquery count per user
  - **E9** New Users today: `user.count({ createdAt >= today })`
- [ ] **4.7** `getOnboardingFunnel()` → **E7 + E8**: completion rate + drop-off by step (Prisma groupBy from §2B)
- [ ] **4.8** `getRetentionCohorts()` → **E10 + E11**: raw SQL from §7 (D7 Retention Cohort query)
- [ ] **4.9** `getDemographics()` → **E12 + E13**: gender groupBy + age CASE buckets

### C. AI Analytics (C1–C11)
- [ ] **4.10** `getPersonaStats()` → **C1 + C2**: settings groupBy activeRole + conversations groupBy roleUsed
- [ ] **4.11** `getContentStats()` → **C3–C6, C10–C11**:
  - Rudeness rate, voice/text split, voice messages count, language dist, free voice used
- [ ] **4.12** `getTokenStats()` → **C7–C9**: total tokens, by provider (Prisma groupBy from §2C), avg response length

### D. Safety (D1, D5)
- [ ] **4.13** `getSafetyStats()` → **D1 + D5**: crisis count + severity groupBy + active conversations

---

## Phase 5: Dashboard API Endpoints + Components (Day 5-6)

**Goal:** REST endpoints + AdminJS custom dashboard with charts.

### API Endpoints (File: `apps/api/src/admin/controllers/metrics.controller.ts`)
- [ ] **5.1** `GET /admin/api/metrics/kpi` → `{ totalUsers, dau, wau, mau, revenue, arpu, onboardingRate, payingRatio }` (E1-E4, F1, F3, E7, F7)
- [ ] **5.2** `GET /admin/api/metrics/revenue?days=30` → `[{ day, amount, count }]` (F2 — SQL from §7)
- [ ] **5.3** `GET /admin/api/metrics/personas` → `[{ role, settingsCount, conversationsCount }]` (C1, C2)
- [ ] **5.4** `GET /admin/api/metrics/onboarding` → `[{ step, stuckUsers }]` (E8 — Funnel SQL from §7)
- [ ] **5.5** `GET /admin/api/metrics/providers` → `[{ provider, tokens, messages }]` (C8)
- [ ] **5.6** `GET /admin/api/metrics/retention` → `[{ week, cohortSize, w1, w4 }]` (E10 — SQL from §7)
- [ ] **5.7** `GET /admin/api/metrics/referrers?limit=20` → `[{ telegramId, code, referrals, revenue }]` (F8 — SQL from §7)
- [ ] **5.8** `GET /admin/api/metrics/safety` → `{ totalCrises, unhandled, bySeverity }` (D1)
- [ ] **5.9** Protect all `/admin/api/*` with admin auth guard

### Dashboard Components (File: `apps/api/src/admin/components/`)
- [ ] **5.10** `Dashboard.tsx` — 4 KPI cards (E1, E2, F1, E7) + revenue line chart + new users chart
- [ ] **5.11** `PersonaChart.tsx` — persona pie (C1) + voice/text donut (C4)
- [ ] **5.12** `OnboardingFunnel.tsx` — step drop-off bar chart (E8)
- [ ] **5.13** `ProviderStats.tsx` — tokens by provider bar chart (C8)
- [ ] **5.14** `CrisisWidget.tsx` — last 10 unhandled events with severity badges (D1)
- [ ] **5.15** `RetentionTable.tsx` — weekly cohort heatmap (E10)
- [ ] **5.16** `TopReferrers.tsx` — leaderboard table (F8)

Charts library: `recharts` (React, works inside AdminJS custom components)

---

## Phase 6: Alerting & Automation (Day 7)

**Goal:** Automated notifications for critical events.

- [ ] **6.1** NestJS `@Cron` job: daily crisis event summary → Telegram message to admin
- [ ] **6.2** NestJS `@Cron` job: weekly KPI report → email
- [ ] **6.3** Stripe webhook: failed payment alert → Telegram admin channel
- [ ] **6.4** Sentry alert rules: error spike → email/Telegram
- [ ] **6.5** AdminJS: highlight unhandled crisis events in red on dashboard

---

## File Structure

```
apps/admin/                              ← Isolated ESM workspace (separate from bot)
├── package.json                         — "type": "module", adminjs@7 deps
├── tsconfig.json                        — module: ESNext, moduleResolution: bundler
├── src/
│   ├── main.ts                          — ✅ Express + AdminJS + auth + 9 resources
│   ├── resources/                       — (Phase 3: custom action configs)
│   │   ├── user.resource.ts             — ban/unban, grant credits, reset onboarding
│   │   ├── conversation.resource.ts     — decrypted message viewer
│   │   └── crisis.resource.ts           — mark handled
│   ├── components/                      — (Phase 5-6: dashboard charts)
│   │   ├── Dashboard.tsx                — KPI cards + revenue chart
│   │   ├── PersonaChart.tsx             — Persona pie + voice/text donut
│   │   ├── OnboardingFunnel.tsx         — Step drop-off bar chart
│   │   ├── CrisisWidget.tsx             — Unhandled crisis alert list
│   │   └── RetentionTable.tsx           — Weekly cohort retention heatmap
│   ├── controllers/                     — (Phase 5: metrics API)
│   │   └── metrics.controller.ts        — GET /admin/api/metrics/*
│   └── services/                        — (Phase 4: analytics queries)
│       ├── analytics.service.ts         — All 40+ Prisma/SQL queries
│       └── analytics-cache.service.ts   — Redis cache wrapper + @Cron
└── dist/                                — Compiled ESM output
```

---

## Timeline Summary

| Phase | What | Duration | Status |
|-------|------|----------|--------|
| 1 | AdminJS setup + CRUD for all 9 tables | 1 day | ✅ **DONE** |
| 2 | Schema additions (CrisisEvent, AdminAction) | 1 day | ⬜ Next |
| 3 | Custom actions (grant credits, ban, decrypt, reset) | 1 day | ⬜ |
| 4 | Analytics service (all 40+ metrics) + Redis caching | 1 day | ⬜ |
| 5 | Dashboard API (9 endpoints) + components (7 charts) | 2 days | ⬜ |
| 6 | Alerting & automation (cron + Telegram + email) | 1 day | ⬜ |

**Remaining: ~6 days. Phase 1 completed.**

---

## Tech Stack

| Component | Choice |
|-----------|--------|
| Admin framework | AdminJS v7 + @adminjs/express + @adminjs/prisma |
| Runtime | Standalone Express process (ESM, `"type": "module"`) |
| Auth | express-session + cookie auth (ADMIN_EMAIL/PASSWORD from .env) |
| Charts | recharts (React, inside AdminJS custom components) — Phase 5 |
| Metrics API | Express routes at `/admin/api/metrics/*` — Phase 5 |
| Alerting | node-cron + grammY (Telegram) + nodemailer (email) — Phase 6 |
| Deployment | Separate process on port 3001 (bot on 3000, zero coupling) |

---

## Metrics Coverage Map

Every metric from BACKOFFICE_ARCHITECTURE.md §2 mapped to implementation:

| ID | Metric | Service Method | API Endpoint | Component |
|----|--------|---------------|-------------|-----------|
| F1 | Total Revenue | `getFinancialKpis()` | `/metrics/kpi` | Dashboard.tsx |
| F2 | Revenue by period | `getFinancialKpis()` | `/metrics/revenue` | Dashboard.tsx |
| F3 | ARPU | `getFinancialKpis()` | `/metrics/kpi` | Dashboard.tsx |
| F4 | LTV Estimate | `getFinancialKpis()` | `/metrics/kpi` | Dashboard.tsx |
| F5 | Credit Burn Rate | `getCreditBurnRate()` | `/metrics/kpi` | Dashboard.tsx |
| F6 | Popular Package | `getPopularPackages()` | `/metrics/revenue` | Dashboard.tsx |
| F7 | Paying User Ratio | `getFinancialKpis()` | `/metrics/kpi` | Dashboard.tsx |
| F8 | Referral ROI | `getReferralRoi()` | `/metrics/referrers` | TopReferrers.tsx |
| F9 | Gift Economy | `getGiftEconomy()` | `/metrics/kpi` | Dashboard.tsx |
| F10 | Outstanding Credits | `getFinancialKpis()` | `/metrics/kpi` | Dashboard.tsx |
| E1 | Total Users | `getEngagementKpis()` | `/metrics/kpi` | Dashboard.tsx |
| E2 | DAU | `getEngagementKpis()` | `/metrics/kpi` | Dashboard.tsx |
| E3 | WAU / MAU | `getEngagementKpis()` | `/metrics/kpi` | Dashboard.tsx |
| E4 | DAU/MAU Ratio | `getEngagementKpis()` | `/metrics/kpi` | Dashboard.tsx |
| E5 | Avg Messages/Session | `getEngagementKpis()` | `/metrics/kpi` | Dashboard.tsx |
| E6 | Avg Sessions/User | `getEngagementKpis()` | `/metrics/kpi` | Dashboard.tsx |
| E7 | Onboarding Rate | `getOnboardingFunnel()` | `/metrics/onboarding` | OnboardingFunnel.tsx |
| E8 | Onboarding Drop-off | `getOnboardingFunnel()` | `/metrics/onboarding` | OnboardingFunnel.tsx |
| E9 | New Users | `getEngagementKpis()` | `/metrics/kpi` | Dashboard.tsx |
| E10 | D1/D7/D30 Retention | `getRetentionCohorts()` | `/metrics/retention` | RetentionTable.tsx |
| E11 | Churn Rate | `getRetentionCohorts()` | `/metrics/retention` | RetentionTable.tsx |
| E12 | Gender Distribution | `getDemographics()` | `/metrics/kpi` | Dashboard.tsx |
| E13 | Age Distribution | `getDemographics()` | `/metrics/kpi` | Dashboard.tsx |
| C1 | Persona Popularity | `getPersonaStats()` | `/metrics/personas` | PersonaChart.tsx |
| C2 | Persona Usage | `getPersonaStats()` | `/metrics/personas` | PersonaChart.tsx |
| C3 | Rudeness Toggle Rate | `getContentStats()` | `/metrics/personas` | PersonaChart.tsx |
| C4 | Voice vs Text | `getContentStats()` | `/metrics/personas` | PersonaChart.tsx |
| C5 | Voice Messages Sent | `getContentStats()` | `/metrics/kpi` | Dashboard.tsx |
| C6 | Voice Replies | `getContentStats()` | `/metrics/kpi` | Dashboard.tsx |
| C7 | Total Tokens | `getTokenStats()` | `/metrics/providers` | ProviderStats.tsx |
| C8 | Tokens by Provider | `getTokenStats()` | `/metrics/providers` | ProviderStats.tsx |
| C9 | Avg Response Length | `getTokenStats()` | `/metrics/providers` | ProviderStats.tsx |
| C10 | Language Distribution | `getContentStats()` | `/metrics/kpi` | Dashboard.tsx |
| C11 | Free Voice Used | `getContentStats()` | `/metrics/kpi` | Dashboard.tsx |
| D1 | Crisis Detections | `getSafetyStats()` | `/metrics/safety` | CrisisWidget.tsx |
| D5 | Active Conversations | `getSafetyStats()` | `/metrics/safety` | Dashboard.tsx |
| Deployment | Same process as API (port 3000, route `/admin`) |
