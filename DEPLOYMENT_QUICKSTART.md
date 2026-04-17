# 🚀 Nigar AI — Production Deployment Quickstart

**Target**: Hetzner CPX21 VPS (€5.18/мес) + домен → **~$6-7/мес**.

---

## Содержание

1. [Ротация секретов (критично!)](#1-ротация-секретов)
2. [Покупка VPS и домена](#2-покупка-vps-и-домена)
3. [Настройка VPS](#3-настройка-vps)
4. [Деплой проекта](#4-деплой-проекта)
5. [Настройка Stripe webhook](#5-настройка-stripe-webhook)
6. [Проверка и тестирование](#6-проверка)

---

## 1. Ротация секретов

Все старые ключи в git — **должны быть выброшены**.

### Что ротировать (по приоритету):

| # | Сервис | Действие |
|---|--------|----------|
| 1 | **Telegram Bot** | @BotFather → `/revoke` старый токен, `/token` → новый |
| 2 | **Supabase** | Dashboard → Settings → Database → Reset password |
| 3 | **Stripe** | Dashboard → Developers → API keys → Roll secret key |
| 4 | **OpenAI** | Platform → API keys → Revoke + Create new |
| 5 | **Anthropic** | Console → Settings → API keys → Rotate |
| 6 | **Groq** | Console → API keys → Revoke + Create new |
| 7 | **ElevenLabs** | Profile → API keys → Regenerate |
| 8 | **Google AI** | Cloud Console → Credentials → Regenerate |
| 9 | **Admin Password** | Новый, минимум 16 символов |
| 10 | **ENCRYPTION_KEY** | `openssl rand -hex 32` (новый ключ — старые зашифрованные сообщения станут нечитаемы!) |

### Удаление старого `.env` из git:

```bash
# На локальной машине
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "security: remove .env from tracking"
git push

# Очистка из истории (требует git-filter-repo)
pip install git-filter-repo
git filter-repo --path .env --invert-paths --force
git push origin main --force-with-lease
```

⚠️ **force-push перезапишет историю.** Если работаешь один — OK. Если с командой — согласуй.

---

## 2. Покупка VPS и домена

### VPS — Hetzner CPX21

1. https://console.hetzner.cloud/
2. New project → "nigar-prod"
3. Add Server:
   - Location: **Helsinki** (низкая latency в AZ/EU)
   - Image: **Ubuntu 24.04**
   - Type: **CPX21** (2 vCPU, 4 GB RAM, 80 GB SSD — €5.18/мес)
   - SSH Keys: добавь свой публичный (`cat ~/.ssh/id_ed25519.pub`)
   - Name: `nigar-prod-01`
4. Create → запиши IP (например `168.119.xxx.xxx`)

### Домен — Namecheap (или любой регистратор)

1. Купи `nigar.ai` / `nigar-ai.com` (~$10/год)
2. В DNS управлении добавь A-record:
   - Host: `@` → Value: `IP твоего VPS`
   - Host: `www` → Value: `IP` (опционально)
   - TTL: 300

Проверь распространение DNS (5-30 минут):
```bash
dig +short your-domain.com
# Должен вернуть твой IP
```

---

## 3. Настройка VPS

Подключись по SSH:

```bash
ssh root@YOUR_VPS_IP
```

### Базовая безопасность

```bash
# Создать sudo юзера
adduser nigar
usermod -aG sudo nigar

# Скопировать SSH-ключ
rsync --archive --chown=nigar:nigar ~/.ssh /home/nigar

# Закрыть root-доступ и пароль
sudo nano /etc/ssh/sshd_config
# PermitRootLogin no
# PasswordAuthentication no
sudo systemctl restart ssh

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable

# Выйти и зайти как nigar
exit
ssh nigar@YOUR_VPS_IP
```

### Установить Docker

```bash
# Docker + Compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Перелогиниться
exit
ssh nigar@YOUR_VPS_IP

# Проверить
docker --version
docker compose version
```

---

## 4. Деплой проекта

### Клонировать репозиторий

```bash
cd ~
git clone https://github.com/YOUR_USER/aipsychologist.git
cd aipsychologist
```

### Создать `.env` с новыми (ротированными!) ключами

```bash
cp .env.production.example .env
nano .env
```

Заполни все секции. **ЗАПОЛНИ ВСЕ КЛЮЧИ НОВЫМИ (из шага 1)**.

Обрати внимание:
- `DOMAIN=your-domain.com` — без `https://`, без слэша
- `CORS_ORIGINS=https://your-domain.com`
- `REDIS_URL=redis://redis:6379` (имя контейнера, не localhost!)
- `ENCRYPTION_KEY` → `openssl rand -hex 32` на VPS
- `BOT_MODE=polling`

### Применить миграции БД

```bash
# Генерируем клиент и пушим схему
docker run --rm \
  -v $(pwd):/app \
  -w /app \
  --env-file .env \
  node:20-slim \
  sh -c "corepack enable && pnpm install && pnpm db:generate && cd packages/prisma-client && npx prisma db push"
```

### Собрать и запустить

```bash
# Первый билд (долго, ~5 минут)
docker compose -f docker-compose.prod.yml build

# Запуск в фоне
docker compose -f docker-compose.prod.yml up -d

# Логи
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

Должны появиться:
- `nigar-caddy` — Caddy HTTPS
- `nigar-api` — NestJS API
- `nigar-bot` — Telegram бот (POLLING mode)
- `nigar-redis` — Redis

Caddy автоматически получит SSL-сертификат от Let's Encrypt (первый раз ~30 сек).

### Проверка

```bash
# Снаружи (с локальной машины)
curl https://your-domain.com/api/v1/health
# Должно вернуть: {"status":"ok","service":"nigar-api",...}

# Логи бота
docker logs nigar-bot -f
# Должно быть: 🤖 Bot started in POLLING mode as @Nigar_Psixoloq_bot
```

---

## 5. Настройка Stripe webhook

1. Зайди в Stripe Dashboard → Developers → Webhooks → Add endpoint
2. URL: `https://your-domain.com/webhook/stripe`
3. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `payment_intent.payment_failed`
4. Нажми "Add endpoint" → скопируй `Signing secret` (начинается с `whsec_`)
5. Обнови `.env` на VPS:
   ```bash
   nano .env
   # Добавь STRIPE_WEBHOOK_SECRET=whsec_...
   docker compose -f docker-compose.prod.yml restart api
   ```

---

## 6. Проверка

Протестируй бота:

1. Открой `@YourBotName` в Telegram
2. `/start` — должен пройти онбординг (3 шага)
3. Напиши сообщение — бот ответит через LLM
4. `/subscribe` → выбери Premium → оплати (тестовая карта `4242 4242 4242 4242`)
5. После оплаты — должен автоматически обновиться tier
6. `/memory` — через 1 час после сессии или `/clear_chat` + новое сообщение → саммари

---

## Обновление кода

```bash
cd ~/aipsychologist
git pull
docker compose -f docker-compose.prod.yml build api bot
docker compose -f docker-compose.prod.yml up -d
```

---

## Бэкапы БД

Supabase делает ежедневные бэкапы в Free tier. Для дополнительной страховки:

```bash
# На VPS, раз в день cron:
crontab -e
# Добавить:
0 3 * * * cd ~/aipsychologist && bash infra/backup/pg-backup.sh >> /var/log/pg-backup.log 2>&1
```

---

## Мониторинг

- **Health**: `https://your-domain.com/api/v1/health`
- **Sentry**: все ошибки → Sentry Dashboard
- **Docker logs**: `docker compose logs -f --tail=100`
- **Resources**: `docker stats`

---

## Типовые проблемы

### Caddy не выдаёт SSL
```bash
docker logs nigar-caddy
# Убедись что DNS A-record указывает на VPS IP
# Открыты порты 80 и 443
```

### Бот не отвечает
```bash
docker logs nigar-bot | grep -iE "error|crisis|polling"
# Проверь TELEGRAM_BOT_TOKEN правильный
# Проверь что бот не в webhook mode
```

### API 502 Bad Gateway
```bash
docker logs nigar-api | tail -50
# Проверь DATABASE_URL доступен (Supabase allows IPs? )
# Проверь REDIS_URL=redis://redis:6379 (не localhost)
```

### Миграция упала
```bash
# Посмотреть детально
docker compose -f docker-compose.prod.yml run --rm api sh -c \
  "cd packages/prisma-client && npx prisma db push"
```

---

## Итого: стоимость в месяц

| Пункт | Цена |
|-------|------|
| Hetzner CPX21 | €5.18 |
| Домен (.com) | ~$1 (амортиз. от $10/год) |
| Supabase Free | $0 |
| Sentry Free | $0 |
| Groq API | $0 (free tier) |
| **Итого** | **~$7/мес** |

Платные подписки пользователей покрывают инфру **с 1-й подписки** (Premium 9.90 AZN ≈ $6).
