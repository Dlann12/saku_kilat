---
version: "1.0"
name: SakuKilat Pastel Consumer
description: Mobile-first Indonesian e-wallet and micro-finance workspace combining One-Thumb Reachability on phone viewports with an Open-Plane desktop workspace, tabular Manrope numerals, and pale category tiles.
colors:
  ground: "#F3F5F7"
  surface: "#FFFFFF"
  raised: "#F2F8FD"
  active: "#EAECEF"
  border: "#E6E6E6"
  rule: "#F4F4F4"
  control: "#D6D9DD"
  primary: "#1D5FD6"
  primary-soft: "#DCF1FF"
  primary-ink: "#0A3A80"
  action-dark: "#1B1D1F"
  text: "#1B1D1F"
  muted: "#5C6064"
  faint: "#6B6B6B"
  positive: "#2F7A45"
  pill-positive-bg: "#DCFAE5"
  pill-positive-ink: "#04250E"
  negative: "#C41C29"
  pill-negative-bg: "#FFEDEA"
  pill-negative-ink: "#831C1E"
  warning: "#92400E"
  pill-warning-bg: "#FFFBEB"
  pill-warning-ink: "#92400E"
  pocket-food-bg: "#FEF3C7"
  pocket-food-ink: "#78350F"
  pocket-transport-bg: "#DCF1FF"
  pocket-transport-ink: "#0A3A80"
  pocket-savings-bg: "#DCFAE5"
  pocket-savings-ink: "#04250E"
  pocket-bills-bg: "#CCFBF1"
  pocket-bills-ink: "#115E59"
typography:
  headline-lg:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  kpi-balance:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.02em
    fontFeature: "tnum"
  section-title:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
  card-title:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.4
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.35
  mono-id:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  none: 0px
  xs: 5px
  sm: 8px
  md: 10px
  lg: 20px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  action-tile:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: 40px
  button-dark:
    backgroundColor: "{colors.action-dark}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: 40px
  input:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: 40px
---

# SakuKilat Design System

## Overview
SakuKilat is a mobile-first digital wallet and micro-finance application built around speed, trust, and clear money separation ("Transaksi Cepat, Kelola Uang Tanpa Ribet"). The visual system uses the **Pastel Consumer** direction: crisp white panels on an off-white cool slate ground (`#F3F5F7`), pale category tiles paired with dark same-hue ink for Smart Pockets and quick actions, quiet money polarity (green `+` for income, neutral ink for spending), and zero visual clutter.

- **Desktop (>= 861px):** Open-plane layout with a `240px` labelled sidebar on the page ground and a fluid `1152px` multi-column workspace canvas (`24px` uniform gap). Never render a narrow `624px` phone column floating on desktop.
- **Mobile (<= 860px / 390px):** **One-Thumb Reachability** bottom navigation bar with 5 destinations (`Beranda`, `Riwayat`, prominent circular `QRIS` center action button, `Kantong`, `Profil`) and `44px+` touch targets, paired with a compact `48px` top header.

## Colors
- **Ground & Surfaces:** `#F3F5F7` ground, `#FFFFFF` primary surface, `#F2F8FD` raised hover/well, `#EAECEF` active nav pill.
- **Borders & Dividers:** `#E6E6E6` panel border (`1px solid`), `#F4F4F4` row dividers, `#D6D9DD` control border.
- **Ink Hierarchy (WCAG >= 4.5:1):** `#1B1D1F` primary ink, `#5C6064` muted secondary text, `#6B6B6B` faint metadata and placeholders.
- **Brand & Data Accent:** `#1D5FD6` cobalt blue (never violet/indigo), paired with `#DCF1FF` soft fill and `#0A3A80` dark ink.
- **Quiet Money Polarity:** Income uses `#2F7A45` with explicit `+` prefix; ordinary outgoings use `#1B1D1F` ink with `-` prefix (red `#C41C29` is reserved exclusively for errors, failed reversals, and limit/lockout alerts).
- **Smart Pocket Category Tints:** Each pocket uses a pale tint with dark same-hue ink (`Uang Makan` `#FEF3C7`/`#78350F`, `Transportasi` `#DCF1FF`/`#0A3A80`, `Dana Darurat` `#DCFAE5`/`#04250E`, `Tagihan` `#CCFBF1`/`#115E59`).

## Typography
- **Primary Face:** `Manrope` (weights `400`, `500`, `600`) across all headings, navigation, labels, and monetary amounts.
- **Monospace Face:** `JetBrains Mono` reserved strictly for Virtual Account numbers, Transaction Reference IDs, QRIS raw strings, and 20-digit PLN tokens.
- **Numeric Discipline:** Every Rupiah value, balance, quota counter, table cell, and chart tick enforces `font-variant-numeric: tabular-nums` and right-aligned columns in tables.
- **Scale & Case:** Sentence case throughout (no tracked uppercase table headers). Page title `28px` (22–24px on phone), Balance lead figure `32px`, Section title `20px`, Card title `16px`, Body `16px` (`14px` dense labels), Meta/Pills `12px` (never below `11px`).

## Layout
- **Grid & Gutters:** 12-column CSS Grid on desktop with a single uniform `24px` gap (`16px` margins on mobile). Cards in the same row share top and bottom alignment without dead empty bands.
- **One Question First:** Every screen answers its primary question in the lead block (`Total Saldo SakuKilat` + `Main vs Smart Pockets` breakdown on Home; `Mutasi & Pengeluaran` on History; `Merchant & Sumber Dana` on QRIS Checkout).
- **No Greeting Emoji:** Never place emoji in greetings, navigation labels, empty states, or category tiles; use consistent `1.5px` stroke `lucide-react` outline icons and crisp text labels.

## Elevation & Depth
- **Flat Surface Separation:** Cards rely on `1px solid #E6E6E6` borders against `#F3F5F7` ground — zero drop shadows on resting cards and zero gradient fills on balance cards or buttons.
- **Floating Elements Only:** Shadows (`0 8px 24px rgba(27, 29, 31, 0.08)`) are strictly limited to modals, bottom sheets, PIN keypads, and popovers.

## Shapes
- **Bimodal Radii Hierarchy:** Outer cards use `20px`; nested action tiles, inputs, and buttons use `10px`; inner list items/wells use `8px`; badges/sub-tags use `5px`; status pills and the center mobile QRIS trigger use `999px`.

## Components
- **Balance Lead Card:** Plain `#FFFFFF` card (`1px solid #E6E6E6`, `20px` radius) showing `Total Saldo SakuKilat`, `[Mata]` privacy toggle, `32px` tabular Rupiah figure, single-line `Saldo Utama` vs `Smart Pockets` split, and 3 primary action triggers (`Top Up`, `Transfer`, `Pindah`).
- **Action & PPOB Tiles:** Pale tinted tiles (`#DCF1FF` / `#0A3A80`) in a 4-column or 3-column aligned grid (`10px` radius), never icons floating in bright rainbow circles.
- **PIN & Biometric Authorization Sheet:** Modal/bottom-sheet 6-digit PIN keypad issuing a 60-second `tx_auth_token`, with optional simulated Biometric confirmation when enabled in security settings.
- **Chart Discipline:** Custom inline SVG charts (`3–5` `#F4F4F4` horizontal gridlines, no y-axis spine, round ticks above max, single cobalt hue `#1D5FD6`, zero gradients, honest zero baselines).
- **Status Pills:** `22px` height full pills (`#DCFAE5`/`#04250E` for `SUCCESS`/`VERIFIED`, `#FFFBEB`/`#92400E` for `PENDING`, `#FFEDEA`/`#831C1E` for `FAILED`/`REJECTED`).

## Do's and Don'ts
- **Do** compute every displayed total, category share, and pocket sum directly from persisted PostgreSQL double-entry ledger rows.
- **Do** disable payment/transfer buttons when balance is insufficient or KYC is required, explaining the exact reason next to the control.
- **Don't** use gradient cards, violet/indigo accents, glassmorphism blur, zebra table striping, or emoji characters anywhere in the interface.
- **Don't** leave a phone-sized column stranded in the center of a 1440px desktop screen; adapt cleanly between desktop Open-Plane and mobile One-Thumb Bottom Navigation.

