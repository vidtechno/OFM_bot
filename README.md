# OFM Game

Telegram ichidagi multiplayer football manager game. Hozir repository **PHASE 1** holatida: bot bootstrap, Supabase ulanishi, Telegram user registration va asosiy keyboard tayyor.

## Talablar

- Node.js 22+
- npm 10+
- Supabase project
- `@ofmgame_bot` uchun Telegram bot tokeni
- Supabase CLI (migrationni CLI orqali qo'llash uchun)

## Local sozlash

```bash
npm install
cp .env.example .env
```

`.env` ichiga Telegram va Supabase qiymatlarini kiriting. `SUPABASE_SERVICE_ROLE_KEY` faqat serverda saqlanishi kerak; uni frontendga yoki Git repositoryga qo'ymang.

## Migration

Supabase CLI bilan projectni bir marta ulang va migrationni yuboring:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Yoki `supabase/migrations/202609210001_phase1_users.sql` faylini Supabase SQL Editor orqali bajaring.

Migration `users` va `manager_profiles` jadvallarini, indexlar, update triggerlari va RLSni yaratadi. Anon/authenticated rollarda to'g'ridan-to'g'ri access yo'q; bot server-side `service_role` bilan ishlaydi.

## Ishga tushirish

```bash
npm run dev
```

Productionga yaqin oddiy start:

```bash
npm run build
npm start
```

Startup vaqtida bot avval `users` jadvali orqali Supabase health check qiladi. Migration yoki environment noto'g'ri bo'lsa process aniq xato bilan to'xtaydi.

## Tekshirish

```bash
npm run check
```

Botni Telegramda ochib `/start` yuboring. User `users` jadvaliga upsert qilinadi, `manager_profiles` avtomatik yaratiladi va 2x2 asosiy keyboard ko'rinadi.

## Structure

```text
src/
  bot/          Telegram handlers va keyboards
  config/       Environment validation
  db/           Supabase client va health check
  lib/          Shared infrastructure
  users/        User persistence
supabase/
  migrations/   Versionlangan SQL migrations
tests/           Unit tests
```

PHASE 1 va PHASE 2 tayyor. Keyingi bosqich player data va real club squadlari.
To'liq development tartibi va rejalashtirilgan admin control center `ROADMAP.md` da saqlanadi.
