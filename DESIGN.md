---
version: "2.0"
name: Saku Emerald Consumer
description: Mobile-first Indonesian e-wallet workspace pairing One-Thumb mobile navigation (Beranda, Kirim, QRIS, Riwayat, Saya) with an adaptive desktop sidebar, grounded in cool off-white pastel surfaces (#FAF8FF) and deep Emerald brand accents (#006948).
dial: "ENERGY 2 / RHYTHM 2 / MOTION 1"
design_read: "Financial consumer web wallet for everyday Indonesian transactions, in a structured Emerald-on-linen mobile-first visual language, dial ENERGY 2 / RHYTHM 2 / MOTION 1."
colors:
  ground: "#FAF8FF"
  surface: "#FFFFFF"
  container-low: "#F2F3FF"
  container: "#EAEDFF"
  container-high: "#E2E7FF"
  container-highest: "#DAE2FD"
  raised: "#F2F3FF"
  active: "#E2E7FF"
  border: "#DDE2EC"
  rule: "#ECEFF6"
  control: "#8B9790"
  primary: "#006948"
  primary-container: "#007C56"
  primary-soft: "#E2FAEF"
  primary-ink: "#005137"
  primary-tint-dark: "#002114"
  secondary-container: "#6CF8BB"
  action-dark: "#131B2E"
  text: "#131B2E"
  variant: "#3D4A42"
  muted: "#526058"
  faint: "#526058"
  positive: "#006948"
  pill-positive-bg: "#DFF8EC"
  pill-positive-ink: "#005137"
  negative: "#BA1A1A"
  pill-negative-bg: "#FFDAD6"
  pill-negative-ink: "#93000A"
  warning: "#92400E"
  pill-warning-bg: "#FEF3C7"
  pill-warning-ink: "#78350F"
  pocket-food-bg: "#FEF3C7"
  pocket-food-ink: "#78350F"
  pocket-transport-bg: "#E2E7FF"
  pocket-transport-ink: "#131B2E"
  pocket-savings-bg: "#DFF8EC"
  pocket-savings-ink: "#005137"
  pocket-bills-bg: "#CCFBF1"
  pocket-bills-ink: "#115E59"
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  kpi-balance:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.02em
    fontFeature: "tnum"
  section-title:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.35
  card-title:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.35
  mono-id:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: 6px
  sm: 10px
  md: 12px
  lg: 16px
  xl: 20px
  full: 9999px
---

# Saku (SakuKilat) Design System

## R-31 Architectural & Visual Rationale
- **Color (`#006948` -> `#007C56` Emerald on `#FAF8FF` / `#FFFFFF`):** Deep Emerald identifies the active balance card, primary CTAs, and center QRIS trigger against cool pastel surfaces (`>= 5.23:1` white-on-emerald and `>= 6.6:1` charcoal/slate-on-surface contrast, verified WCAG AA).
- **Layout & Rhythm (`Dial RHYTHM 2`):** Each route highlights one primary action (Balance Hero + Quick Grid on Home; Recipient & Big Amount input on Transfer; Camera/QR Switcher on QRIS; Cashflow Chart + Grouped Timeline on History; Ticket Receipt overlay) while expanding from one-thumb mobile bottom navigation (`<= 860px`) to a persistent `240px` desktop sidebar (`>= 861px`).
- **Typography (`Plus Jakarta Sans` + `JetBrains Mono`):** Rounded humanist geometric letterforms match Indonesian consumer banking clarity, while monospace with `tabular-nums` stays restricted to Virtual Account codes, QR payloads, PLN tokens, and reference numbers.
- **Elevation & Shapes:** Content cards sit flush on `#FAF8FF` with crisp `#DDE2EC` borders (`1px`); elevation shadow (`0 12px 28px -8px`) is restricted strictly to dialogs, the floating QRIS tab trigger, and the primary Emerald balance hero card.
- **Content Integrity:** No unverified security theater (`256-bit`, `OJK/LPS` copy), no fake loyalty points, no external stock portrait URLs (clean typographic initials avatars), no decorative emojis, and no dead settings buttons.
