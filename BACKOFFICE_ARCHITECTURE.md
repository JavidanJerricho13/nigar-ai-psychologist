# Nigar AI — Backoffice Architecture & Metrics Specification

**Date:** April 11, 2026
**Status:** Specification (pre-implementation)

---

## 1. Schema Entity Map

```
┌──────────┐    ┌──────────────┐    ┌──────────────┐
│  users   │───→│ user_profiles│    │ user_settings │
│          │───→│              │    │ (role, format)│
│          │───→│              │    └──────────────┘
│          │    └──────────────┘
│          │───→ credits (balance, voice_remaining)
│          │───→ transactions[] (purchase, spend, gift, referral)
│          │───→ conversations[] ───→ messages[] (content, tokens, provider)
│          │───→ referrals[] (referrer ↔ referred)
│          │───→ onboarding_states (step, stepData, completed)
└──────────┘
```

**9 tables, 5 enums, 7 indexes.** All data needed for analytics exists in the schema.

---

## 2. Metrics Dashboard — 4 Pillars

### A. Financial & Unit Economics

| # | Metric | SQL/Prisma Logic | Frequency |
|---|--------|------------------|-----------|
| F1 | **Total Revenue** | `SELECT SUM(amount) FROM transactions WHERE type = 'purchase'` | Real-time |
| F2 | **Revenue (today/week/month)** | Same + `WHERE created_at >= DATE_TRUNC('day', NOW())` | Daily |
| F3 | **ARPU** (Avg Revenue Per User) | `Total Revenue / COUNT(DISTINCT users WHERE has_purchase)` | Weekly |
| F4 | **LTV Estimate** | `ARPU × avg_user_lifetime_months` — lifetime = `AVG(NOW() - users.created_at)` for active users | Monthly |
| F5 | **Credit Burn Rate** | `SELECT SUM(amount) FROM transactions WHERE type = 'spend' AND created_at >= NOW() - '24h'` | Daily |
| F6 | **Most Popular Package** | `SELECT description, COUNT(*) FROM transactions WHERE type = 'purchase' GROUP BY description ORDER BY count DESC` | Weekly |
| F7 | **Paying User Ratio** | `COUNT(users WITH purchase) / COUNT(all users) × 100` | Weekly |
| F8 | **Referral ROI** | `SUM(referral_bonus credits granted) vs SUM(revenue from referred users)` — join referrals → transactions | Monthly |
| F9 | **Gift Economy** | `SELECT COUNT(*), SUM(ABS(amount)) FROM transactions WHERE type = 'gift'` | Weekly |
| F10 | **Outstanding Credits** | `SELECT SUM(balance) FROM credits` — total unspent credits (liability) | Real-time |

**Prisma queries:**
```typescript
// F1: Total Revenue
const revenue = await prisma.transaction.aggregate({
  where: { type: 'purchase' },
  _sum: { amount: true },
});

// F3: ARPU
const payingUsers = await prisma.transaction.findMany({
  where: { type: 'purchase' },
  distinct: ['userId'],
  select: { userId: true },
});
const arpu = revenue._sum.amount / payingUsers.length;

// F6: Popular packages
const packages = await prisma.transaction.groupBy({
  by: ['description'],
  where: { type: 'purchase' },
  _count: true,
  orderBy: { _count: { description: 'desc' } },
  take: 5,
});
```

---

### B. User Engagement & Retention

| # | Metric | SQL/Prisma Logic | Frequency |
|---|--------|------------------|-----------|
| E1 | **Total Users** | `SELECT COUNT(*) FROM users` | Real-time |
| E2 | **DAU** (Daily Active Users) | `SELECT COUNT(DISTINCT user_id) FROM conversations WHERE started_at >= TODAY` | Daily |
| E3 | **WAU / MAU** | Same with `>= 7 days ago` / `>= 30 days ago` | Weekly |
| E4 | **DAU/MAU Ratio** (stickiness) | `DAU / MAU × 100` — above 20% = good | Daily |
| E5 | **Avg Messages/Session** | `SELECT AVG(message_count) FROM conversations WHERE message_count > 0` | Weekly |
| E6 | **Avg Sessions/User** | `SELECT AVG(conv_count) FROM (SELECT COUNT(*) conv_count FROM conversations GROUP BY user_id)` | Weekly |
| E7 | **Onboarding Completion Rate** | `COUNT(onboarding_states WHERE completed_at IS NOT NULL) / COUNT(onboarding_states) × 100` | Daily |
| E8 | **Onboarding Drop-off by Step** | `SELECT current_step, COUNT(*) FROM onboarding_states WHERE completed_at IS NULL GROUP BY current_step` | Weekly |
| E9 | **New Users (today/week)** | `SELECT COUNT(*) FROM users WHERE created_at >= TODAY` | Daily |
| E10 | **D1/D7/D30 Retention** | Users who had conversation on day 1/7/30 after signup ÷ total signups in cohort | Weekly |
| E11 | **Churn Rate** | Users with no conversation in last 30 days ÷ total users | Monthly |
| E12 | **Gender Distribution** | `SELECT gender, COUNT(*) FROM user_profiles GROUP BY gender` | Static |
| E13 | **Age Distribution** | `SELECT CASE WHEN age < 18 THEN '<18' WHEN age < 25 THEN '18-24' ... END, COUNT(*) FROM user_profiles GROUP BY 1` | Static |

**Prisma queries:**
```typescript
// E2: DAU
const today = new Date(); today.setHours(0,0,0,0);
const dau = await prisma.conversation.findMany({
  where: { startedAt: { gte: today } },
  distinct: ['userId'],
  select: { userId: true },
});

// E7: Onboarding completion rate
const [total, completed] = await Promise.all([
  prisma.onboardingState.count(),
  prisma.onboardingState.count({ where: { completedAt: { not: null } } }),
]);
const completionRate = (completed / total) * 100;

// E8: Drop-off by step
const dropoffs = await prisma.onboardingState.groupBy({
  by: ['currentStep'],
  where: { completedAt: null },
  _count: true,
  orderBy: { currentStep: 'asc' },
});
```

---

### C. AI Persona & Content Analytics

| # | Metric | SQL/Prisma Logic | Frequency |
|---|--------|------------------|-----------|
| C1 | **Persona Popularity** | `SELECT active_role, COUNT(*) FROM user_settings GROUP BY active_role ORDER BY count DESC` | Weekly |
| C2 | **Persona Usage (conversations)** | `SELECT role_used, COUNT(*) FROM conversations GROUP BY role_used` | Weekly |
| C3 | **Rudeness Toggle Rate** | `SELECT COUNT(*) FILTER (WHERE nigar_black_rudeness_enabled) / COUNT(*) FROM user_settings` | Weekly |
| C4 | **Voice vs Text Preference** | `SELECT response_format, COUNT(*) FROM user_settings GROUP BY response_format` | Weekly |
| C5 | **Voice Messages Sent** | `SELECT COUNT(*) FROM messages WHERE audio_url IS NOT NULL AND role = 'user'` | Daily |
| C6 | **Voice Replies Generated** | `SELECT COUNT(*) FROM messages WHERE audio_url IS NOT NULL AND role = 'assistant'` | Daily |
| C7 | **Total Tokens Consumed** | `SELECT SUM(tokens_used) FROM messages WHERE tokens_used IS NOT NULL` | Daily |
| C8 | **Tokens by Provider** | `SELECT llm_provider, SUM(tokens_used), COUNT(*) FROM messages GROUP BY llm_provider` | Weekly |
| C9 | **Avg Response Length** | `SELECT AVG(LENGTH(content)) FROM messages WHERE role = 'assistant'` | Weekly |
| C10 | **Language Distribution** | `SELECT language, COUNT(*) FROM user_settings GROUP BY language` | Static |
| C11 | **Free Voice Credits Used** | `3 - AVG(free_voice_remaining) FROM credits` (per user) | Weekly |

**Prisma queries:**
```typescript
// C1: Persona popularity
const roles = await prisma.userSettings.groupBy({
  by: ['activeRole'],
  _count: true,
  orderBy: { _count: { activeRole: 'desc' } },
});

// C8: Tokens by provider
const providerStats = await prisma.message.groupBy({
  by: ['llmProvider'],
  where: { llmProvider: { not: null } },
  _sum: { tokensUsed: true },
  _count: true,
});
```

---

### D. System Health & Safety

| # | Metric | Source | Frequency |
|---|--------|--------|-----------|
| D1 | **Crisis Detections** | Application logs (`🆘 CRISIS DETECTED`) — NOT in DB yet | Daily |
| D2 | **Failed Payments** | Stripe dashboard OR add `status` column to transactions | Daily |
| D3 | **LLM Error Rate** | Application logs (`All LLM providers failed`) | Hourly |
| D4 | **Avg Response Time** | Application logs (`[Xms] /command`) | Hourly |
| D5 | **Active Conversations** | `SELECT COUNT(*) FROM conversations WHERE ended_at IS NULL AND started_at >= NOW() - '1h'` | Real-time |
| D6 | **Bot Uptime** | External monitor (UptimeRobot / Railway healthcheck) | Continuous |
| D7 | **Redis Cache Hit Rate** | Redis INFO stats | Hourly |
| D8 | **DB Connection Pool** | Prisma metrics (if enabled) | Hourly |

**⚠️ Schema Gap:** Crisis events are only logged, not persisted to DB. Recommendation:

```prisma
model CrisisEvent {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  messageId String?  @map("message_id") @db.Uuid
  severity  String   // "low", "medium", "high", "critical"
  keywords  String[] // matched keywords
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])
  @@map("crisis_events")
}
```

---

## 3. Backoffice Tech Stack — ✅ IMPLEMENTED

### Chosen: **AdminJS v7 (ESM) — Isolated Express Process**

| Aspect | Detail |
|--------|--------|
| **Location** | `apps/admin/` — separate workspace in monorepo |
| **Runtime** | Standalone Express server (NOT inside NestJS/bot process) |
| **Module system** | ESM (`"type": "module"`) — AdminJS v7 requires it |
| **Port** | 3001 (bot runs on 3000 — fully isolated) |
| **Auth** | Cookie-based session (ADMIN_EMAIL + ADMIN_PASSWORD from .env) |
| **ORM** | @adminjs/prisma — direct PrismaClient, shared @nigar/prisma-client |
| **Launch** | `node apps/admin/dist/main.js` |

**Key architectural decision:** AdminJS v7 is pure ESM, bot is CommonJS. They CANNOT coexist in the same process. Solution: separate `apps/admin/` workspace with its own `package.json`, `tsconfig.json`, and `"type": "module"`.

**Known fix applied:** `@tiptap/core` and `@tiptap/pm` overridden to `2.27.2` in root `package.json` to resolve AdminJS v7 internal peer dependency conflict.

---

## 4. Admin Authentication — ✅ IMPLEMENTED

| Aspect | Implementation |
|--------|---------------|
| **Auth method** | Cookie-based session via `@adminjs/express` `buildAuthenticatedRouter()` |
| **Credentials** | `ADMIN_EMAIL` + `ADMIN_PASSWORD` from `.env` |
| **Session secret** | Uses `ENCRYPTION_KEY` from `.env` |
| **Login page** | Auto-generated at `/admin/login` by AdminJS |
| **Cookie name** | `nigar-admin` |

**Future enhancements (not yet implemented):**
- 2FA via `speakeasy` package
- `AdminAction` audit log table
- Multiple admin accounts

---

## 5. Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│  NIGAR AI BACKOFFICE                    [Admin] [⚙️] │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ 📊 Home  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       │
│ 👥 Users │  │ DAU │ │ Rev │ │Users│ │ LTV │       │
│ 💬 Chats │  │ 142 │ │$380 │ │ 2.1k│ │$4.2 │       │
│ 💰 Billing│ └─────┘ └─────┘ └─────┘ └─────┘       │
│ 🎭 Personas│                                       │
│ 🆘 Safety │  ┌──────────────────────────────┐      │
│ ⚙️ System │  │    Revenue Chart (30 days)    │      │
│          │  │    ~~~~~~~~~~~~~~~~~~~~~~~~    │      │
│          │  └──────────────────────────────┘      │
│          │                                          │
│          │  ┌──────────────┐ ┌──────────────┐      │
│          │  │ Persona Pie  │ │ Onboarding   │      │
│          │  │ Chart        │ │ Funnel       │      │
│          │  └──────────────┘ └──────────────┘      │
└──────────┴──────────────────────────────────────────┘
```

**Pages:**
1. **Home** — KPIs (F1, E1, E2, E7), revenue chart, signup chart
2. **Users** — table with search, filter by role/gender/age, view profile
3. **Conversations** — list with persona filter, message count, duration
4. **Billing** — revenue chart, transactions table, package breakdown
5. **Personas** — pie chart (C1), rudeness toggle rate (C3), voice split (C4)
6. **Safety** — crisis events (D1), hotline triggers, flagged conversations
7. **System** — token consumption (C7), provider distribution (C8), error rates

---

## 6. Missing Schema Additions (Recommended)

To unlock all metrics above, add these to `schema.prisma`:

```prisma
// 1. Crisis event tracking (currently only logged, not persisted)
model CrisisEvent {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  severity  String   @db.VarChar(20) // none, low, medium, high, critical
  keywords  String[] // matched crisis keywords
  handled   Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])
  @@index([userId, createdAt(sort: Desc)])
  @@map("crisis_events")
}

// 2. Admin audit log
model AdminAction {
  id        String   @id @default(uuid()) @db.Uuid
  adminEmail String  @map("admin_email")
  action    String   // "ban_user", "adjust_credits", "view_conversation"
  targetId  String?  @map("target_id") // userId or conversationId
  details   Json?    @db.JsonB
  createdAt DateTime @default(now()) @map("created_at")

  @@map("admin_actions")
}

// 3. Add to User model (for D1 tracking)
// crisisEvents CrisisEvent[]
```

---

## 7. Key SQL Queries for Dashboards

### Revenue Over Time (daily, last 30 days)
```sql
SELECT DATE_TRUNC('day', created_at) AS day,
       SUM(amount) AS revenue,
       COUNT(*) AS transactions
FROM transactions
WHERE type = 'purchase' AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 1;
```

### Onboarding Funnel
```sql
SELECT current_step,
       COUNT(*) AS users_at_step,
       COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS completed
FROM onboarding_states
GROUP BY current_step
ORDER BY current_step;
```

### D7 Retention Cohort
```sql
WITH cohort AS (
  SELECT id, DATE_TRUNC('week', created_at) AS signup_week
  FROM users
),
activity AS (
  SELECT user_id, DATE_TRUNC('week', started_at) AS active_week
  FROM conversations
)
SELECT c.signup_week,
       COUNT(DISTINCT c.id) AS cohort_size,
       COUNT(DISTINCT CASE WHEN a.active_week = c.signup_week + INTERVAL '1 week' THEN c.id END) AS retained_w1,
       COUNT(DISTINCT CASE WHEN a.active_week = c.signup_week + INTERVAL '4 weeks' THEN c.id END) AS retained_w4
FROM cohort c
LEFT JOIN activity a ON c.id = a.user_id
GROUP BY 1 ORDER BY 1;
```

### Top Referrers
```sql
SELECT u.telegram_id, u.referral_code,
       COUNT(r.id) AS referrals,
       COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'purchase'), 0) AS revenue_from_referred
FROM users u
JOIN referrals r ON u.id = r.referrer_id
LEFT JOIN transactions t ON r.referred_id = t.user_id
GROUP BY u.id ORDER BY referrals DESC
LIMIT 20;
```
