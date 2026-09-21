# OFM Game

Telegram ichidagi multiplayer football manager game. Bot ikkita rejimda ishlay oladi:
1. **Lokal development (`BOT_MODE=polling`)**: Kompyuteringizda tezkor sinov uchun long polling.
2. **Production webhook (`BOT_MODE=webhook`)**: Supabase Edge Functions orqali serverless 24/7 rejimda, kompyuteringiz o'chiq bo'lsa ham ishlaydi.

---

## Talablar

- Node.js 22+
- npm 10+
- Supabase project
- Telegram bot tokeni (`@BotFather` dan)
- Supabase CLI

---

## Local sozlash

```bash
npm install
cp .env.example .env
```

`.env` ichiga Telegram va Supabase qiymatlarini kiriting:
- `TELEGRAM_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BOT_MODE=polling` (lokal rejim uchun)
- `TELEGRAM_WEBHOOK_SECRET` (ixtiyoriy, xavfsizlik uchun random string)

---

## Migration (Database yangilash)

Supabase CLI orqali loyihani ulang va migratsiyalarni bazaga qo'llang:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

Yoki `supabase/migrations/` papkasidagi barcha migratsiyalarni (shu jumladan `202609210016_telegram_processed_updates.sql` ni) Supabase Dashboard > SQL Editor orqali bajaring.

---

## Local Development (Polling rejimida)

Lokal kompyuterda ishlab turish va test qilish uchun:

```bash
npm run dev
```

Bot long polling orqali Telegram bilan ulanadi va kod o'zgarganda avtomatik qayta yuklanadi.

---

## Production: Supabase Edge Functions (Webhook) Deployment

Bot kompyuteringiz o'chiq paytida ham 24/7 ishlab turishi uchun uni Supabase Edge Function (`telegram-webhook`) sifatida joylang.

### 1-qadam: Supabase Secrets sozlash

Bot token va webhook xavfsizlik tokenini Supabase'ga secret sifatida yuklang:

```bash
npx supabase secrets set TELEGRAM_BOT_TOKEN="SIZNING_TELEGRAM_BOT_TOKEN"
npx supabase secrets set TELEGRAM_WEBHOOK_SECRET="SIZNING_MAXFIY_TOKENINGIZ"
```

*(Eslatma: `SUPABASE_URL` va `SUPABASE_SERVICE_ROLE_KEY` Supabase Edge Runtime tomonidan avtomatik ravishda muhitga uzatiladi).*

### 2-qadam: Edge Functionni tayyorlash va deploy qilish

Edge functionni jamlang va Supabase'ga yuboring (`--no-verify-jwt` bayrog'i shart, chunki Telegram serverlari anon-key bilan kelmaydi):

```bash
npm run build:webhook
npx supabase functions deploy telegram-webhook --no-verify-jwt
```

### 3-qadam: Telegram Webhookni faollashtirish

Telegramga webhook manzilini (`https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook`) ro'yxatdan o'tkazing:

```bash
npm run webhook:set
```

### 4-qadam: Webhook holatini tekshirish

```bash
npm run webhook:info
```

### 5-qadam: Polling rejimiga qaytish (agar kerak bo'lsa)

Agar yana kompyuteringizdan `npm run dev` orqali lokal ishlatmoqchi bo'lsangiz, avval webhookni o'chiring:

```bash
npm run webhook:delete
```

---

## Deploymentdan keyingi tekshirish (Checklist)

Edge function deploy qilingandan so'ng quyidagi tekshiruvlarni bajaring:

- [ ] **1. Function Health Check (GET)**:
  Brauzer yoki terminal orqali tekshiring:
  ```bash
  curl -i https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook
  ```
  Natija: `HTTP/2 200` va `{"status":"ok","service":"telegram-webhook",...}` chiqishi kerak.

- [ ] **2. Telegram Webhook Info**:
  ```bash
  npm run webhook:info
  ```
  Natija: `Webhook Holati: FAOL (Active)`, `last_error_message: Yo'q` bo'lishi kerak.

- [ ] **3. `/start` buyrug'i**:
  Telegramda botga kiring va `/start` yuboring. Bot xush kelibsiz xabari va asosiy 2x2 menyuni qaytarishi kerak.

- [ ] **4. Reply Keyboard**:
  "🎮 O‘yinga kirish", "🏆 Reyting", "👤 Profilim", "ℹ️ Qo‘llanma" tugmalarini bosing. Har bir bo'lim to'g'ri javob berishi kerak.

- [ ] **5. Inline Callback Query**:
  "🎮 O‘yinga kirish" -> Mavjud ligani tanlang -> Klublar ro'yxatidan bo'sh klubni tanlang va tasdiqlang. Dashboard to'g'ri ochilishi kerak.

- [ ] **6. Database Write & Idempotency**:
  Supabase Dashboard > Table Editor bo'limida:
  - `users` jadvalida Telegram IDingiz paydo bo'lganini;
  - `manager_profiles` yaratilganini;
  - `telegram_processed_updates` jadvalida `update_id` yozilib, `status: 'completed'` bo'lganini tekshiring.

---

## Avtomatik testlar va tekshiruv

```bash
npm run check
```
TypeScript tiplari va barcha Vitest unit testlarini to'liq tekshiradi.
