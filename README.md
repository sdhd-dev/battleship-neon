# BATTLESHIP.NEON — Naval Combat OS

A modern, single-page Battleship arena built with **Next.js 14**, **TypeScript**, **Tailwind CSS**, **Framer Motion**, and **Supabase**.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

The game runs fully offline by default — auth and the leaderboard fall back to local profiles + a seeded board. Drop in Supabase keys to enable cloud auth + a global leaderboard:

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Expected Supabase table `leaderboard` with columns: `username (text, primary)`, `city (text)`, `wins (int)`, `accuracy (numeric)`, `rating (int)`, `updated_at (timestamptz)`. Auth uses email magic links via `signInWithOtp`.

## Features

- **10×10 grid** with classical no-touching ship placement rules
- **Three AI commanders**:
  - *Cadet* — random shots
  - *Officer* — neighbor hunt + line-extend after two hits
  - *Admiral* — full **probability-density** targeting that re-weights each placement when in search-and-destroy mode
- **Auto-place** + tap-to-place fleet builder with rotate, drag-to-move, and clear-all
- **Blitz mode** — 3-minute countdown; the timer pulses red below 30s
- **AI Coach** — after every match it grades you S/A/B/C/D and gives 3–4 strategy notes (accuracy, hunt efficiency, parity discipline, edge bias)
- **Leaderboard by city** with local seeds + optional Supabase cloud sync
- **Game history**, win/loss, accuracy stats — persisted to localStorage
- **Email auth** via Supabase magic links (graceful local fallback when cloud is off)
- **Upgrade to Pro** modal with 6 ship skins
- **Dark / light theme** toggle with persisted preference
- **Mobile responsive** layout, touch-friendly controls
- **Smooth animations** with Framer Motion (cell taps, hits, sunk reveals, board entrance, bar charts, leaderboard rows)

## Project layout

```
src/
├── app/
│   ├── layout.tsx        # Root layout — Theme + Auth providers
│   ├── page.tsx          # Main page — TopBar, Game, Stats, Leaderboard
│   └── globals.css       # Neon/glassmorphism design tokens + animations
├── components/
│   ├── AuthProvider.tsx  # Supabase OTP auth, falls back to local profile
│   ├── ThemeProvider.tsx
│   ├── TopBar.tsx
│   ├── Board.tsx
│   ├── ShipPlacement.tsx
│   ├── GameUI.tsx        # Phase machine: menu → placing → playing → over
│   ├── CoachPanel.tsx
│   ├── StatsPanel.tsx
│   ├── Leaderboard.tsx
│   └── UpgradeModal.tsx
└── lib/
    ├── game/
    │   ├── types.ts      # Board, Ship, ShipDef, etc.
    │   ├── board.ts      # placeShip / canPlace / autoPlace / applyAttack
    │   ├── ai.ts         # AI state + probability density
    │   └── coach.ts      # Post-game grading + tips
    ├── storage.ts        # localStorage + Supabase sync
    └── supabase/client.ts
```

## Build / lint

```bash
npm run build   # production build, type-check
npm run lint    # ESLint (incl. React Compiler rules)
```
