# SakuKilat Full-Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete **SakuKilat** Indonesian e-wallet & micro-finance application covering all PRD modules (Auth/OTP/PIN/Biometric/KYC, Top-Up VA/Retail/Debit, Smart Pockets, Scan & Pay QRIS, P2P & BI-FAST Transfers, PPOB, Split Bill, Real-time History & Monthly Analytics, SakuKilat Bisnis Merchant Dashboard, and Admin/Ledger Audit & Gateway Simulator) backed by a strict PostgreSQL 16 Double-Entry Bookkeeping Ledger and Redis 7 session/OTP/lock store.

**Architecture:** Single cohesive Next.js 16 (App Router) + TypeScript full-stack workspace serving both the mobile-first/desktop-adaptive frontend and the REST API v1 (`/api/v1/...`), wired to Dockerized PostgreSQL 16 (port `54330`) and Redis 7 (port `6381`). Every monetary mutation executes inside an ACID PostgreSQL transaction using deterministic `SELECT ... FOR UPDATE` wallet locking (`ORDER BY id ASC`), append-only `ledger_entries` (`SUM(DEBIT) === SUM(CREDIT)` enforced), `X-Idempotency-Key` deduplication, `tx_auth_token` (60s PIN TTL) verification, and transactional `outbox_events`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, PostgreSQL 16 (`pg`), Redis 7 (`ioredis`), Zod, `lucide-react`, `qrcode`, `jsqr`, Vitest, Playwright (Chromium 1248).

## Global Constraints
- Follow `/home/kerja/Documents/SAKU/DESIGN.md` strictly: `pastel-consumer` tokens, `Manrope` + `JetBrains Mono`, `tabular-nums`, zero gradients/glows/emojis, 1440px Open-Plane desktop + 390px One-Thumb bottom navigation bar.
- Double-entry bookkeeping invariant: every transaction inserts balanced `DEBIT` and `CREDIT` rows into append-only `ledger_entries` (`UPDATE`/`DELETE` blocked by DB trigger).
- Balance limits per PRD US-02: `UNVERIFIED` max total user balance `Rp2.000.000`; `VERIFIED` max `Rp20.000.000`. Bank transfer requires `VERIFIED` KYC.
- Security per PRD §7 & §10: 6-digit OTP valid 180s; 3 wrong OTP attempts lock phone 15 minutes; 6-digit PIN hashed with `scrypt`; `tx_auth_token` valid 60s; NIK encrypted with `AES-256-GCM` + `SHA-256` hash; `HMAC-SHA256` + 30s anti-replay on bank VA webhook; `X-Idempotency-Key` required on all financial mutations.
- BI-FAST quota per PRD §5.C & §13: 10 free transfers per calendar month per user; Rp2.500 fee thereafter.
- Verify every component at runtime via Vitest integration tests against real PostgreSQL/Redis, `npm run build`, and Playwright headless Chromium verification across 1440px, 768px, and 390px viewports.

---

### Task 1: Infrastructure, Docker Compose (PostgreSQL 16 + Redis 7), & Next.js Project Scaffold

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.env.local`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces: Running PostgreSQL 16 at `127.0.0.1:54330` (`sakukilat`), Redis 7 at `127.0.0.1:6381`, configured Next.js TypeScript project with Vitest.

- [ ] **Step 1:** Create `docker-compose.yml` using `postgres:16-alpine` (port `54330:5432`) and `redis:7-alpine` (port `6381:6379`) with persistent volumes and healthchecks.
- [ ] **Step 2:** Create `.env.example`, `.env.local` (with `DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`, `NIK_ENCRYPTION_KEY`, `WEBHOOK_HMAC_SECRET`), and `.gitignore`.
- [ ] **Step 3:** Initialize `package.json` with `next`, `react`, `react-dom`, `pg`, `ioredis`, `zod`, `lucide-react`, `qrcode`, `jsqr`, plus devDeps (`typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/pg`, `@types/qrcode`, `tailwindcss`, `@tailwindcss/postcss`, `vitest`, `tsx`, `playwright`). Run `npm install`.
- [ ] **Step 4:** Bring up containers (`docker compose up -d`) and verify Postgres and Redis healthchecks are healthy.

---

### Task 2: Database Schema, Append-Only Ledger Triggers & Seed Data

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/pool.ts`
- Create: `src/db/migrate.ts`
- Create: `src/db/seed.ts`
- Create: `src/lib/redis.ts`
- Test: `tests/db-schema.test.ts`

**Interfaces:**
- Consumes: `DATABASE_URL`, `REDIS_URL`
- Produces: `pool`, `withDbTransaction()`, `runMigrations()`, `seedDatabase()`, tables: `users`, `kyc_documents`, `wallets`, `transactions`, `ledger_entries`, `idempotency_keys`, `split_bills`, `split_bill_participants`, `outbox_events`, `otp_codes`, `notifications`, `merchants`.

- [ ] **Step 1:** Write `src/db/schema.sql` implementing PRD Section 8 tables (`users`, `kyc_documents`, `wallets` with `CHECK (balance >= 0)`, `transactions`, `ledger_entries` with SQL `BEFORE UPDATE OR DELETE` append-only trigger, `idempotency_keys`, `split_bills`, `split_bill_participants`, `outbox_events`, `merchants`, `notifications`) and full indexes on FKs & query columns.
- [ ] **Step 2:** Implement `src/db/pool.ts` (`getPool()`, `withTransaction()`), `src/lib/redis.ts` (Redis client + graceful in-memory test fallback), `src/db/migrate.ts`, and `src/db/seed.ts` creating realistic reconciled personas (`Dlan Kusuma`, `Raka Pratama`, `Sari Wulandari`, `Pak Budi Santoso` + System Escrow/Fee/Merchant accounts) where every wallet balance equals the exact sum of its double-entry `ledger_entries`.
- [ ] **Step 3:** Run migration & seed (`npx tsx src/db/migrate.ts && npx tsx src/db/seed.ts`) and write/run `tests/db-schema.test.ts` verifying `SUM(DEBIT) === SUM(CREDIT)`, every wallet `balance` matches its `ledger_entries` net balance, and `UPDATE/DELETE` on `ledger_entries` raises a PostgreSQL exception.

---

### Task 3: Security & Cryptography Primitives + Ledger Engine

**Files:**
- Create: `src/lib/crypto.ts`
- Create: `src/lib/auth.ts`
- Create: `src/lib/idempotency.ts`
- Create: `src/lib/ledger.ts`
- Create: `src/lib/qris.ts`
- Test: `tests/ledger-and-security.test.ts`

**Interfaces:**
- Produces:
  - `hashPin()`, `verifyPin()` (`scrypt` + `timingSafeEqual`)
  - `encryptNik()`, `decryptNik()`, `hashNik()` (`AES-256-GCM` + `SHA-256`)
  - `signHmacSha256()`, `verifyHmacSha256()` (30s anti-replay window)
  - `signSessionJwt()`, `verifySessionJwt()`, `issueTxAuthToken()`, `consumeTxAuthToken()`
  - `executeDoubleEntryTransaction()` (deterministic wallet lock ordering, atomic balance update + balanced `ledger_entries` + `outbox_events` + `idempotency_keys`)
  - `parseQrisPayload()`, `buildQrisPayload()` (EMVCo TLV + CRC-16/CCITT-FALSE)

- [ ] **Step 1:** Write failing unit/integration tests in `tests/ledger-and-security.test.ts` covering PIN hash/verify, NIK AES-256-GCM round-trip, HMAC anti-replay expiry, QRIS TLV static/dynamic parse + CRC validation, imbalanced ledger rejection, concurrent transfers without deadlock, and idempotency replay vs payload-conflict (`409`).
- [ ] **Step 2:** Implement `src/lib/crypto.ts`, `src/lib/auth.ts`, `src/lib/idempotency.ts`, `src/lib/ledger.ts`, and `src/lib/qris.ts`.
- [ ] **Step 3:** Run `npx vitest run tests/ledger-and-security.test.ts` and verify all tests pass.

---

### Task 4: Domain Services & REST API v1 Routes (Auth, KYC, Wallets, Top-Up, QRIS, Transfers, PPOB, Split Bill, History, Merchant, Admin)

**Files:**
- Create: `src/lib/api-response.ts`
- Create: `src/lib/validators.ts`
- Create: `src/services/auth.service.ts`
- Create: `src/services/wallet.service.ts`
- Create: `src/services/payment.service.ts`
- Create: `src/services/split-bill.service.ts`
- Create: `src/services/merchant.service.ts`
- Create: `src/app/api/v1/health/route.ts`
- Create: `src/app/api/v1/auth/otp/request/route.ts`
- Create: `src/app/api/v1/auth/otp/verify/route.ts`
- Create: `src/app/api/v1/auth/register/route.ts`
- Create: `src/app/api/v1/auth/login/route.ts`
- Create: `src/app/api/v1/auth/logout/route.ts`
- Create: `src/app/api/v1/auth/pin/verify/route.ts`
- Create: `src/app/api/v1/auth/biometric/route.ts`
- Create: `src/app/api/v1/auth/me/route.ts`
- Create: `src/app/api/v1/auth/demo-switch/route.ts`
- Create: `src/app/api/v1/kyc/route.ts`
- Create: `src/app/api/v1/wallets/route.ts`
- Create: `src/app/api/v1/wallets/pockets/route.ts`
- Create: `src/app/api/v1/wallets/pockets/[id]/route.ts`
- Create: `src/app/api/v1/wallets/move/route.ts`
- Create: `src/app/api/v1/topups/route.ts`
- Create: `src/app/api/v1/webhooks/va/route.ts`
- Create: `src/app/api/v1/payments/qris/decode/route.ts`
- Create: `src/app/api/v1/payments/qris/execute/route.ts`
- Create: `src/app/api/v1/transfers/lookup/route.ts`
- Create: `src/app/api/v1/transfers/p2p/route.ts`
- Create: `src/app/api/v1/transfers/bank/route.ts`
- Create: `src/app/api/v1/ppob/catalog/route.ts`
- Create: `src/app/api/v1/ppob/inquire/route.ts`
- Create: `src/app/api/v1/ppob/execute/route.ts`
- Create: `src/app/api/v1/split-bills/route.ts`
- Create: `src/app/api/v1/split-bills/[id]/pay/route.ts`
- Create: `src/app/api/v1/transactions/route.ts`
- Create: `src/app/api/v1/transactions/[id]/route.ts`
- Create: `src/app/api/v1/analytics/summary/route.ts`
- Create: `src/app/api/v1/merchant/route.ts`
- Create: `src/app/api/v1/merchant/qris/route.ts`
- Create: `src/app/api/v1/merchant/settle/route.ts`
- Create: `src/app/api/v1/admin/overview/route.ts`
- Create: `src/app/api/v1/admin/kyc/[id]/review/route.ts`
- Create: `src/app/api/v1/admin/transactions/[id]/reverse/route.ts`
- Test: `tests/api-integration.test.ts`

- [ ] **Step 1:** Write integration tests in `tests/api-integration.test.ts` testing US-01 (OTP 180s + 3x fail lockout), US-02 (KYC limit Rp2M -> Rp20M + BI-FAST gate), US-03 (VA Top-Up HMAC webhook + `LIMIT_EXCEEDED`), US-04 (QRIS decode/execute + insufficient balance block), US-05 (P2P masked name + Rp0 fee + BI-FAST 10x free quota -> 11th Rp2.500), PPOB PLN token issuance, Split Bill equal & itemized payments, and Admin Auto-Reversal.
- [ ] **Step 2:** Implement domain services and REST API route handlers with consistent `{ data }` / `{ error: { code, message, details } }` error semantics and Zod validation.
- [ ] **Step 3:** Run `npx vitest run tests/api-integration.test.ts` and verify 100% pass.

---

### Task 5: Design System CSS, App Shell & Core Navigation (Desktop Open-Plane + Mobile One-Thumb Bottom Bar)

**Files:**
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/Formatters.ts`
- Create: `src/components/PinAuthModal.tsx`
- Create: `src/components/ReceiptModal.tsx`
- Create: `src/components/Charts.tsx`
- Create: `src/components/SakuLogo.tsx`

**Interfaces:**
- Produces: Manrope + JetBrains Mono font loading, `DESIGN.md` CSS custom properties, responsive Shell (`240px` desktop sidebar + `48px` mobile topbar + `One-Thumb` 5-slot bottom nav bar with elevated center QRIS circle), interactive 6-digit PIN / Biometric authorization sheet, printable/downloadable Digital Receipt sheet, and custom SVG Charts (`SpendChart`, `CategoryBreakdown`) obeying `app-screens.md`.

- [ ] **Step 1:** Implement `src/app/globals.css` and `src/app/layout.tsx` loading Manrope (`400`, `500`, `600`) and JetBrains Mono via `next/font/google`, setting `lang="id"`, and enforcing `tabular-nums`.
- [ ] **Step 2:** Implement `SakuLogo.tsx`, `Formatters.ts` (`formatRupiah`, `formatSignedRupiah`, `formatDateWib`, `maskPhone`), `PinAuthModal.tsx` (6-digit numeric pad + biometric shortcut + `tx_auth_token` issuance), `ReceiptModal.tsx` (digital resi + SVG/PNG export), `Charts.tsx`, and `AppShell.tsx` (with Persona/Demo Account switcher + live unread Sandbox Notification Inbox drawer).

---

### Task 6: Interactive Pages & End-to-End Flows (Consumer App, Merchant UMKM, Admin & Gateway Simulator)

**Files:**
- Create: `src/app/page.tsx` (Beranda: Home dashboard matching PRD wireframe + Desktop multi-column balance/pockets/PPOB/recent transactions)
- Create: `src/app/auth/page.tsx` (Registrasi, Login OTP WhatsApp/SMS, Buat PIN, Quick Demo Persona Selector)
- Create: `src/app/topup/page.tsx` (VA BCA/Mandiri/BNI/BRI/BSI, Alfamart/Indomaret, Kartu Debit + Instant VA Webhook Simulator)
- Create: `src/app/qris/page.tsx` (Camera QR scanner + Upload Gallery QR image via `jsQR` + Preset Merchant QR + PRD Confirmation Screen + Sumber Dana Pocket Picker + PIN Confirm)
- Create: `src/app/transfer/page.tsx` (P2P Sesama SakuKilat with masked name + Scan Profil QR + BI-FAST Bank Transfer with 10x/bulan quota gauge)
- Create: `src/app/pockets/page.tsx` (Kantong Pintar: Create/Edit/Lock pockets, Rp0 Pindah Saldo between Main <-> Pockets, Target Progress)
- Create: `src/app/ppob/page.tsx` (Pulsa/Paket Data, Token/Tagihan PLN, PDAM, BPJS Kesehatan, Voucher Game + Customer Inquiry & Receipt Token)
- Create: `src/app/split-bill/page.tsx` (Patungan: Bagi Rata & Per Item + Live Tagihan Masuk/Keluar + Bayar Patungan via P2P)
- Create: `src/app/riwayat/page.tsx` (Mutasi Real-time with filters, search, Category/Cashflow SVG Charts, CSV/Resi Export)
- Create: `src/app/profil/page.tsx` (KYC e-KTP + Liveness Camera/Upload Simulation, Keamanan PIN/Biometrik, Device Binding, Profil QR Code)
- Create: `src/app/merchant/page.tsx` (SakuKilat Bisnis: Pak Budi UMKM Warung Kopi, Generator QRIS Dinamis/Statis, Pemasukan Real-time, Pencairan Instan)
- Create: `src/app/admin/page.tsx` (Double-Entry Ledger Audit Proof, Outbox/Kafka Event Stream, Antrean Review KYC, Simulator Bank VA & Auto-Reversal)

- [ ] **Step 1:** Build `src/app/auth/page.tsx` and `src/app/page.tsx` (Beranda) with live DB state, balance privacy toggle, Smart Pockets cards, PPOB quick grid, and latest transactions.
- [ ] **Step 2:** Build `src/app/topup/page.tsx`, `src/app/pockets/page.tsx`, and `src/app/qris/page.tsx` with real EMVCo QRIS generator/decoder (`qrcode` + `jsqr` gallery upload + camera support + presets) and exact PRD Confirmation layout.
- [ ] **Step 3:** Build `src/app/transfer/page.tsx`, `src/app/ppob/page.tsx`, and `src/app/split-bill/page.tsx`.
- [ ] **Step 4:** Build `src/app/riwayat/page.tsx`, `src/app/profil/page.tsx`, `src/app/merchant/page.tsx`, and `src/app/admin/page.tsx`.

---

### Task 7: Verification, Production Build, Playwright E2E + Visual Inspection (1440px, 768px, 390px)

**Files:**
- Create: `tests/e2e/sakukilat.spec.ts` (or Playwright Node verification script)
- Verify: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

- [ ] **Step 1:** Run full Vitest suite (`npx vitest run`) covering DB invariants, crypto, security, and all API workflows.
- [ ] **Step 2:** Run TypeScript check (`npx tsc --noEmit`) and Next.js production build (`npm run build`), fixing any warnings or build errors.
- [ ] **Step 3:** Start production Next.js server (`npm run start`) and run Playwright E2E across real Chromium (`1440x900`, `768x1024`, `390x844`):
  - Test login/demo switch, Top Up VA webhook, Smart Pocket move, QRIS scan/preset payment + PIN confirmation + Receipt modal, P2P transfer, BI-FAST quota, PPOB PLN token, Split Bill create/pay, KYC submit + Admin approve, and verify zero console errors, zero horizontal overflow on 390px, and valid contrast/layout!
- [ ] **Step 4:** Run `design-taste-frontend/scripts/lint.mjs --app` and `inspect.mjs --app` (and manually inspect screenshots across 1440px, 768px, 390px) and fix any UI findings.

