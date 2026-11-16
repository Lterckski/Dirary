# Dirary

Luther's personal life app: to-do, finance, health. Web + Android (Samsung A57), with home-screen widgets. Mascot: Ink, his dog.
Built one module at a time: Phase 0 Foundation → 1 To-do → 2 Finance → 3 Health → 4 Today view. Don't start a module before the previous one passes its exit gate.

## Layout
- `apps/mobile`: Expo (SDK 58) + Expo Router. Needs a development build, not Expo Go (widgets, SQLite).
- `apps/web`: React + Vite.
- `packages/ui`: design tokens and the Ink mascot drawing. No runtime dependencies.
- `packages/shared`: Supabase client, zod schemas, sync merge rule.
- `supabase/migrations`: SQL. Every table has `user_id`, `updated_at`, `deleted_at` and row-level security on `user_id = auth.uid()`.
- `tools/mascot`: fur-path generator and PNG exporter.

## Rules
- Expo changes every release. Check the installed package types or the versioned docs before using an Expo API; add native packages with `npx expo install`.
- Design: read `docs/DESIGN.md`. Dark theme only. Colours, radii and fonts come from `@dirary/ui` tokens; never hard-code hex values in screens.
- Ink is one drawing (`packages/ui/src/mascot/createMascot.ts`). After changing it, run `pnpm mascot:export` to refresh the widget and icon PNGs.
- Sync: write to local SQLite first, mark dirty, push, then pull; last-write-wins on `updated_at` (`apps/mobile/src/lib/sync.ts`).
- Money is stored as integer centavos.
- Commits and pull requests: no Claude or AI attribution. No `Co-Authored-By: Claude`, no session links, no "Generated with" lines.
- Before calling work done: `pnpm typecheck && pnpm test`.
