# Dirary

A personal app for tasks, money and health, on the web and Android, with Ink as the mascot.
This is Phase 0: the foundation. The full plan is in the Development Plan doc.

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
2. Open **SQL Editor**, paste the file in `supabase/migrations/`, and run it.
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

After installing, long-press the home screen → Widgets → Dirary to add the test widget.

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
| `pnpm mascot:export` | Re-renders Ink's PNGs (widgets, app icon, splash) after the drawing changes |
| `node install-skills.mjs` | Reinstalls the Claude skills into `.claude/skills` |
