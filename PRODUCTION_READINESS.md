# Production Readiness Report — Nigar AI Psychologist

**Дата**: 17 апреля 2026  
**Общая оценка**: 6/10 — НЕ готов к продакшену  
**Статус**: Требуется устранение критических проблем

---

## Содержание

1. [Критические проблемы (блокеры)](#1-критические-проблемы-блокеры)
2. [Высокий приоритет](#2-высокий-приоритет)
3. [Средний приоритет](#3-средний-приоритет)
4. [Что сделано хорошо](#4-что-сделано-хорошо)
5. [Тестовое покрытие](#5-тестовое-покрытие)
6. [Инфраструктура и деплой](#6-инфраструктура-и-деплой)
7. [Дорожная карта к продакшену](#7-дорожная-карта-к-продакшену)

---

## 1. Критические проблемы (блокеры)

### 1.1 Секреты в Git-репозитории

**Severity**: CRITICAL

Файл `.env` отслеживается Git, несмотря на наличие в `.gitignore`. Содержит реальные ключи:

| Секрет | Статус |
|--------|--------|
| `DATABASE_URL` | Пароль от Supabase в открытом виде |
| `TELEGRAM_BOT_TOKEN` | Реальный токен бота |
| `ELEVENLABS_API_KEY` | Реальный API-ключ |
| `GROQ_API_KEY` | Реальный API-ключ |
| `STRIPE_SECRET_KEY` | Тестовый ключ, но раскрыт |
| `ADMIN_PASSWORD` | `chelidze13` — в открытом виде |
| `ENCRYPTION_KEY` | `1234567890abcdef...` — слабый, предсказуемый |

**Действия**:
- Немедленно ротировать ВСЕ ключи
- Удалить `.env` из git-истории: `git filter-repo --path .env --invert-paths`
- Внедрить менеджер секретов (Vault, AWS Secrets Manager, GitHub Secrets)

---

### 1.2 Слабое шифрование

**Severity**: CRITICAL  
**Файл**: `apps/api/src/common/encryption/encryption.service.ts`

- `ENCRYPTION_KEY` — 16 байт вместо требуемых 32 байт (256 бит)
- Сервис молча хеширует ключ через SHA256, если длина неверная — опасное поведение
- Нет механизма ротации ключей

**Рекомендация**:
```bash
# Генерация корректного ключа
openssl rand -hex 32
```

Валидация в `configuration.ts`:
```typescript
ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, 'Must be 64 hex characters (256 bits)')
```

---

### 1.3 CI/CD пайплайн не завершён

**Severity**: CRITICAL

- Существует только `ci.yml` (lint + typecheck + test)
- НЕТ workflow для сборки Docker-образов
- НЕТ push в ghcr.io
- НЕТ автоматического деплоя на VPS
- `DEPLOYMENT.md` описывает идеальную схему, но она не реализована

**Действие**: Создать `build-and-deploy.yml` с этапами: build → push → migrate → deploy

---

### 1.4 Нет production Docker Compose

**Severity**: CRITICAL

- `docker-compose.yml` только для локального Redis
- Отсутствует `docker-compose.prod.yml` с полным стеком (API, bot, admin, Redis, Caddy)
- Нет Caddyfile для HTTPS reverse proxy

---

## 2. Высокий приоритет

### 2.1 Безопасность админ-панели

**Файл**: `apps/admin/src/main.ts`

| Проблема | Описание |
|----------|----------|
| Пароль в открытом виде | Нет bcrypt/argon2 хеширования |
| Нет rate-limiting на логин | Brute-force атаки возможны |
| Нет 2FA/MFA | Одна пара email/password |
| Слабый session secret | Используется `ENCRYPTION_KEY` или хардкод-фоллбэк |
| Нет CSRF-защиты | SameSite cookie не настроен |

---

### 2.2 CORS и Security Headers

**Файл**: `apps/api/src/main.ts`

```typescript
// ТЕКУЩЕЕ — разрешает ВСЕ origins
app.enableCors();

// РЕКОМЕНДАЦИЯ
app.enableCors({
  origin: process.env.CORS_ORIGIN?.split(',') || 'https://yourdomain.com',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});
```

Отсутствуют security headers — нет `helmet()`:
- Content-Security-Policy
- HSTS
- X-Frame-Options
- X-Content-Type-Options

---

### 2.3 Health Check неполный

**Файл**: `apps/api/src/health.controller.ts`

```
GET /health → { status: 'ok' }
```

Не проверяет: PostgreSQL, Redis, внешние API. Нет readiness/liveness разделения для Kubernetes/Docker healthcheck.

---

### 2.4 Timing-safe сравнение отсутствует

**Файл**: `apps/api/src/modules/alerting/controllers/alerts-debug.controller.ts`

```typescript
// ТЕКУЩЕЕ — уязвимо к timing attack
if (!token || token !== expected) { ... }

// РЕКОМЕНДАЦИЯ
import { timingSafeEqual } from 'crypto';
const a = Buffer.from(token);
const b = Buffer.from(expected);
if (a.length !== b.length || !timingSafeEqual(a, b)) { ... }
```

---

## 3. Средний приоритет

| # | Проблема | Файл/Модуль | Описание |
|---|----------|-------------|----------|
| 3.1 | BullMQ без DLQ | `audio/infrastructure/queues/` | Неудачные job'ы после 2 retry удаляются без возможности расследования |
| 3.2 | Нет job timeout | BullMQ consumers | Задачи могут зависнуть навсегда |
| 3.3 | Rate limiting одинаковый | `app.module.ts` | Нет per-endpoint и per-user ограничений на LLM-вызовы |
| 3.4 | PII stripper — false positives | `chat/infrastructure/pii/` | Кредитные карты без Luhn-валидации, слишком жадные regex |
| 3.5 | Нет structured logging | Весь проект | Console.log вместо JSON для агрегации (Loki/ELK) |
| 3.6 | Нет correlation ID | Весь проект | Невозможно трассировать запросы между сервисами |
| 3.7 | Бэкап cron не настроен | `infra/backup/pg-backup.sh` | Скрипт существует, но не запланирован |
| 3.8 | Нет graceful shutdown timeout | `main.ts` (все apps) | Процесс может зависнуть при остановке |
| 3.9 | Admin panel без shutdown handler | `apps/admin/src/main.ts` | node-cron задачи не останавливаются корректно |
| 3.10 | Кризис-детекция — только keywords | `crisis-detector.service.ts` | Нет LLM-верификации, возможны false positives |

---

## 4. Что сделано хорошо

### Архитектура
- Hexagonal Architecture (Ports & Adapters) — чистое разделение домена и инфраструктуры
- Monorepo с Turborepo и pnpm workspaces
- Модульная структура NestJS с 7 доменными модулями
- Shared packages: prisma-client, shared-types, eslint-config, tsconfig

### Безопасность (частично)
- AES-256-GCM шифрование сообщений at rest (при корректном ключе)
- PII stripping перед отправкой в LLM
- Мультиязычная crisis detection (азербайджанский, русский, английский)
- Аудит-лог действий администратора (таблица `AdminAction`)
- Global exception filter — не утекают stack traces

### LLM интеграция
- Multi-LLM fallback: OpenAI → Claude → Gemini
- 6 персон с отдельными промпт-шаблонами
- Sliding window для контекста (последние 20 сообщений)
- Prompt builder с per-persona конфигурацией

### Инфраструктура (частично)
- Sentry для мониторинга ошибок (10% trace sampling)
- BullMQ для асинхронной обработки аудио
- Redis для FSM-состояний, сессий, rate limiting
- Zod-валидация конфигурации при старте
- Graceful shutdown в tg-bot (SIGINT/SIGTERM)

### Админ-панель
- AdminJS с CRUD для всех моделей
- Аналитический дашборд с KPI (DAU, MAU, stickiness, revenue, ARPU)
- Кэширование метрик в Redis
- Недельные email-отчёты
- Кастомные действия: grant credits, ban/unban, reset onboarding

### Аудио пайплайн
- STT: OpenAI Whisper (основной) + Groq (fallback)
- TTS: ElevenLabs (основной) + OpenAI (fallback)
- FFmpeg конвертация MP3 → OGG Opus для Telegram

---

## 5. Тестовое покрытие

### Общая статистика

**Всего тест-файлов**: 21  
**Всего модулей**: 108  
**Покрытие**: ~18.5%

### Покрытие по модулям

| Модуль | Тестов | Модулей | Покрытие |
|--------|--------|---------|----------|
| chat | 6 | 15 | 40% |
| audio | 3 | 14 | 21% |
| command-router | 1 | 5 | 20% |
| billing | 2 | 11 | 18% |
| referral | 1 | 6 | 17% |
| onboarding | 3 | 25 | 12% |
| user | 1 | 15 | 7% |
| alerting | 0 | 4 | 0% |
| tg-bot | 2 | 13 | 15% |
| shared (redis) | 1 | 1 | 100% |

### Критические пути

| Путь | Протестирован? | Качество |
|------|---------------|----------|
| Crisis detection | Да | Отлично — мультиязычные edge cases |
| LLM fallback routing | Да | Отлично — полная цепочка из 4 провайдеров |
| PII stripping | Да | Хорошо — множество форматов, но без Luhn |
| Billing/Credits | Да | Хорошо — deduction, addition, balance |
| Onboarding FSM | Да | Хорошо — 13 шагов, skip paths |
| **SendMessageUseCase** | **НЕТ** | Основной flow чата не протестирован |
| **IdentifyUserUseCase** | **НЕТ** | Идентификация пользователя не протестирована |
| **AdvanceStepUseCase** | **НЕТ** | Продвижение онбординга не протестировано |
| **Alerting модуль** | **НЕТ** | 0 тестов |
| **Stripe webhook** | **НЕТ** | Платёжная интеграция не протестирована |
| E2E тесты | **НЕТ** | Отсутствуют полностью |

### CI/CD для тестов

- `.github/workflows/ci.yml` запускает `pnpm test` на push/PR в main
- Jest конфигурация с coverage collection настроена
- Coverage reports не отслеживаются и не enforcement'ятся

---

## 6. Инфраструктура и деплой

### Что есть

| Компонент | Статус | Файл |
|-----------|--------|------|
| Dockerfile (API) | Есть | `infra/Dockerfile.api` |
| Dockerfile (Bot) | Есть | `infra/Dockerfile.tg-bot` |
| docker-compose (dev) | Есть | `docker-compose.yml` (только Redis) |
| CI pipeline | Частично | `.github/workflows/ci.yml` |
| Backup script | Есть | `infra/backup/pg-backup.sh` |
| Prisma migrations | Есть | `0001_init` |
| Health endpoint | Базовый | `GET /health` |
| Sentry | Настроен | `sentry.init.ts` |
| Deployment docs | Подробные | `DEPLOYMENT.md` |

### Чего нет

| Компонент | Критичность |
|-----------|------------|
| `build-and-deploy.yml` workflow | CRITICAL |
| `docker-compose.prod.yml` | CRITICAL |
| Caddyfile / nginx config | CRITICAL |
| Health checks с проверкой зависимостей | HIGH |
| Backup cron job | HIGH |
| Structured JSON logging | MEDIUM |
| Prometheus metrics | LOW |
| Terraform / IaC | LOW |
| Multi-region backups | LOW |

### Redis конфигурация

```typescript
// Retry strategy — корректно
retryStrategy: (times) => Math.min(times * 200, 2000)
maxRetriesPerRequest: 3
```

Нет circuit breaker при полном отказе Redis — BullMQ очереди зависнут.

### BullMQ конфигурация

```
Concurrency: 3 (transcription + synthesis)
Attempts: 2 с exponential backoff (3s → 6s)
removeOnComplete: 100
removeOnFail: 50
Dead Letter Queue: НЕТ
Job timeout: НЕТ
```

---

## 7. Дорожная карта к продакшену

### Фаза 1 — Устранение блокеров (1-2 дня)

- [ ] Ротировать все скомпрометированные ключи (DB, Telegram, Stripe, ElevenLabs, Groq)
- [ ] Удалить `.env` из git-истории (`git filter-repo --path .env --invert-paths`)
- [ ] Сгенерировать 256-битный ключ шифрования (`openssl rand -hex 32`)
- [ ] Ужесточить валидацию `ENCRYPTION_KEY` в Zod-схеме
- [ ] Настроить CORS с whitelist origins
- [ ] Добавить `helmet()` для security headers
- [ ] Захешировать пароль администратора через bcrypt

### Фаза 2 — Инфраструктура (3-5 дней)

- [ ] Создать `docker-compose.prod.yml` (API + Bot + Admin + Redis + Caddy)
- [ ] Создать Caddyfile с HTTPS и reverse proxy
- [ ] Реализовать `build-and-deploy.yml` (build → push ghcr.io → SSH deploy)
- [ ] Расширить health check: проверка DB, Redis, внешних API
- [ ] Настроить backup cron (`0 3 * * *`)
- [ ] Добавить graceful shutdown timeout (30 секунд)
- [ ] Настроить GitHub Secrets для деплоя

### Фаза 3 — Качество и безопасность (1-2 недели)

- [ ] Написать тесты для `SendMessageUseCase`
- [ ] Написать тесты для `IdentifyUserUseCase`
- [ ] Написать тесты для alerting модуля
- [ ] Написать тесты для Stripe webhook
- [ ] Добавить E2E тесты для основных user flows
- [ ] Настроить coverage threshold (минимум 60%)
- [ ] Внедрить Dead Letter Queue для BullMQ
- [ ] Добавить job timeout для audio processing
- [ ] Настроить per-user rate limiting на LLM-вызовы
- [ ] Добавить 2FA для админ-панели
- [ ] Внедрить timing-safe сравнение для токенов
- [ ] Добавить CSRF-защиту для админ-панели

### Фаза 4 — Observability (2-4 недели)

- [ ] Structured JSON logging
- [ ] Correlation ID для трассировки запросов
- [ ] Sentry alerts → Telegram
- [ ] Uptime monitoring
- [ ] Prometheus metrics export
- [ ] Grafana dashboards для инфраструктуры
- [ ] Log rotation и retention policy

---

## Заключение

Проект **Nigar** архитектурно зрелый и хорошо спроектированный. Hexagonal architecture, multi-LLM fallback, шифрование сообщений и crisis detection демонстрируют серьёзный подход к разработке.

Однако **утечка секретов в Git**, **неполный CI/CD пайплайн**, **слабая безопасность админ-панели** и **низкое тестовое покрытие** (18.5%) делают проект непригодным для продакшена в текущем состоянии.

**После выполнения Фаз 1-2 (~1 неделя) проект можно безопасно развернуть в продакшен.**
