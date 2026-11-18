# Dirary

A personal app for tasks, money and health, on the web and Android, with Ink as the mascot.
Phase 0 (foundation) is done. Phase 1 (to-do) and Phase 2 (money) are built on the web and the phone and are being tested.

## What's here

| Folder | What it is |
| --- | --- |
| `apps/mobile` | The Android app (Expo). Dark shell, four tabs, sign-in, offline sync test, test widget |
| `apps/web` | The web app (React + Vite). Same four sections and sync test |
| `packages/ui` | Colours, type, spacing and the Ink mascot drawing |
| `packages/shared` | Supabase client, data schemas, the sync merge rule |
| `supabase/migrations` | Database tables and security rules |
| `tools/mascot` | Ink's fur generator and the PNG exporter |

## Setup

### 1. Install
```sh
corepack enable        # one time: makes pnpm available
pnpm install
```

### 2. Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor** and run each file in `supabase/migrations/`, oldest first. They are safe to run again.
3. Open **Authentication → Users → Add user** and create your account (email + password, auto-confirm on).
4. From **Project Settings → API**, copy the project URL and the publishable (anon) key.
5. Create `apps/web/.env.local` and `apps/mobile/.env.local` from the `.env.example` next to each, and fill both in.

### 3. Web
```sh
pnpm dev:web           # http://localhost:5173
```

### 4. Phone
The app uses widgets and a local database, so it needs its own development build. Expo Go won't run it.

**Option A, built in the cloud (no Android Studio):**
```sh
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
```
Install the APK from the link EAS gives you, then:
```sh
pnpm dev:mobile        # scan the QR code from the Dirary app
```

**Option B, built on this Mac (needs Android Studio and USB debugging):**
```sh
cd apps/mobile && npx expo run:android
```

After installing, long-press the home screen → Widgets → Dirary to add **Today's tasks**, **Ink's progress** and **Spent today**.

Rebuild the phone app (the same EAS command) whenever a native library, the widgets in `app.json`, or the app icon changes. Everyday code changes load from `pnpm dev:mobile` without a rebuild.

## Phase 0 exit gate
- [ ] The app on the A57 shows the dark shell and Ink in all five moods
- [ ] The test widget shows on the home screen
- [ ] Sign-in works on the phone and the web
- [ ] A note added on the phone appears on the web, and the other way round
- [ ] A note added in airplane mode syncs once the phone is back online

## Commands
| Command | What it does |
| --- | --- |
| `pnpm typecheck` | Type-checks every package |
| `pnpm test` | Runs unit tests |
| `pnpm mascot:export` | Cuts Ink out of the art in tools/mascot/source and rewrites every Ink picture (moods, paws, icon, splash, widgets, notifications). Needs Python with numpy, scipy and Pillow |
| `node install-skills.mjs` | Reinstalls the Claude skills into `.claude/skills` |

## Phase 1 exit gate
- [ ] Tasks added on the phone appear on the web, and the other way round
- [ ] Adding, editing and ticking tasks works in airplane mode and syncs afterwards
- [ ] "Submit report tomorrow 5pm !high" sets the date, time and urgency
- [ ] Ticking a repeating task creates the next one
- [ ] A reminder rings at its time with the app closed
- [ ] Ticking a task on the Today's tasks widget works without opening the app
- [ ] Seven days of using only Dirary for tasks, with no missed reminders and no sync conflicts

## Money (Phase 2)

- **Accounts, categories and budgets:** each expense category can have one monthly budget. Amounts are stored as whole centavos.
- **Quick add:** `250 jollibee #food @gcash`. Start with `+` for money in.
- **Auto-logging (Android):** the app saves transaction notifications from GCash, GoTyme and Security Bank on the phone, reads the ones that clearly state an amount and a direction, and puts them in **To review**. Nothing counts until you confirm it. The raw notification text never leaves the phone.
- **The notification reader is a first guess.** It was written before any real notifications were collected. Use **View samples → Share samples** on the phone's Money tab to export real ones, then the reader for each app can be made exact (`packages/shared/src/capture.ts`).
- **Transfers:** a move between your own accounts is linked as a pair and left out of spending and income.
- **Statement import (web):** upload a CSV once a month to catch what auto-logging missed.

### Turning on auto-logging on the Samsung A57
1. Money tab → **Turn on notification access** → enable Dirary. If it's greyed out: Dirary's App info → ⋮ → **Allow restricted settings**.
2. Settings → Apps → Dirary → Battery → **Unrestricted**, and add Dirary to **Never sleeping apps**.
3. Make sure transaction notifications are on inside GCash, GoTyme and Security Bank.

## Phase 2 exit gate
- [ ] Accounts and opening balances match each app
- [ ] A manual expense on the phone appears on the web, and the other way round
- [ ] A real GCash, GoTyme and Security Bank transaction each lands in To review with the right amount and direction
- [ ] A GoTyme → GCash cash-in is offered as a transfer and doesn't count as spending
- [ ] Budgets show the right amount left, and Ink reacts when one goes over
- [ ] The Spent today widget matches the app
- [ ] Seven days where every real transaction ends up logged and balances match each app within ₱1
- [ ] Security review of the money tables and notification handling
