# Dirary

Luther's personal life app: to-do, finance, health. Web + Android (Samsung A57), with home-screen widgets. Mascot: Ink, his dog.
Built one module at a time: Phase 0 Foundation → 1 To-do → 2 Finance → 3 Health → 4 Today view. Don't start a module before the previous one passes its exit gate.

## Layout
- `apps/mobile`: Expo (SDK 58) + Expo Router. Needs a development build, not Expo Go (widgets, SQLite).
- `apps/web`: React + Vite.
- `packages/ui`: design tokens and Ink's mood names. No runtime dependencies.
- `packages/shared`: Supabase client, zod schemas, sync merge rule.
- `supabase/migrations`: SQL. Every table has `user_id`, `updated_at`, `deleted_at` and row-level security on `user_id = auth.uid()`.
- `tools/mascot`: the Gemini Ink art (`source/`) and `cutout.py`, which cuts it out and writes every Ink picture.

## Rules
- Expo changes every release. Check the installed package types or the versioned docs before using an Expo API; add native packages with `npx expo install`.
- Design: read `docs/DESIGN.md`. Dark theme only. Colours, radii and fonts come from `@dirary/ui` tokens; never hard-code hex values in screens.
- Ink is a set of pictures cut from the Gemini art: `apps/mobile/assets/mascot` and `apps/web/public/ink`, one per mood plus her paws. To change her, replace the images in `tools/mascot/source` (flat green background) and run `pnpm mascot:export` (Python with numpy, scipy and Pillow); it also redraws the app icon, splash, favicon, widget previews and notification icon.
- Phone buttons use `Press` (`apps/mobile/src/components/press.tsx`), not `Pressable`: it squishes and ticks on touch.
- Notifications speak in Ink's voice (`packages/shared/src/inkVoice.ts`) and bark (`apps/mobile/assets/sounds/bark.wav`, channel `ink-bark-2`). Android fixes a channel's sound when it's made, so a new sound needs a new channel id.
- Sync: write to local SQLite first, mark dirty, push, then pull; last-write-wins on `updated_at` (`apps/mobile/src/lib/db.ts`).
- Tasks: all task rules (sorting, views, repeats, reminders, quick-add parsing) live in `packages/shared` and are shared by web and phone. The phone reads and writes through `apps/mobile/src/lib/tasks-store.ts`, which also refreshes reminders and widgets after every change.
- Widgets render from the local database (`apps/mobile/src/widgets`). Adding or changing a widget in `app.json` needs a new EAS build. The widget file starts with `'use no memo';`: the React Compiler breaks widget drawing.
- Money: all money rules (formatting, balances, summaries, budgets, transfers, quick add, CSV import, the notification reader) live in `packages/shared/src/money.ts`, `capture.ts` and `importCsv.ts`. Amounts are integer centavos, always positive, with a `direction`. Only confirmed transactions count toward balances and totals.
- Capture mode: `apps/mobile/modules/dirary-capture` is a local native module (Kotlin). Its listener saves notifications from allow-listed finance apps to a database on the phone. Raw notification text must never be synced, logged or sent anywhere; only parsed fields are. Changing the native module needs a new EAS build.
- Food data: search covers your foods, all of PhilFCT bundled offline (`packages/shared/src/philfctFoods.ts`, regenerate with `tools/philfct/build.py`), USDA (Supabase function) and, on the phone only, Open Food Facts (its search server blocks web pages). Free sources only: no paid food or vision APIs.
- Food camera: `apps/mobile/modules/dirary-food-lens` is a local native module (Kotlin) that runs Google's AIY food model (`food_V1`, Apache 2.0) through ML Kit on the phone. It only names the dish; calories come from food search. Photos never leave the phone. Changing it needs a new EAS build.
- Commits and pull requests: no Claude or AI attribution. No `Co-Authored-By: Claude`, no session links, no "Generated with" lines.
- Before calling work done: `pnpm typecheck && pnpm test`.
