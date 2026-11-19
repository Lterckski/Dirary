# Dirary design language

Dark, bold and a little playful. Inspired by Agila: Finance Coach's friendly, mascot-led coaching, pushed darker and bolder.
The source of truth for values is `packages/ui/src/tokens.ts`.

| Token | Value | Used for |
| --- | --- | --- |
| night / surface / raised | #0A0B0E / #14161B / #1C1F26 | Background, cards, chips and inputs |
| line | #2A2E37 | Borders, progress tracks |
| text / muted / faint | #F4F5F7 / #A3A9B6 / #7D8492 | Body text, secondary labels, placeholders |
| inkBlue | #7C83FF | Progress, primary buttons, "done", active tab |
| tongue | #FF7AA2 | Celebrations, streaks |
| amber / red | #FFB547 / #FF5C5C | Due soon / overdue or over budget |

- **Type:** Bricolage Grotesque 800 for numbers and titles, Inter for everything you read. Tabular figures for amounts.
- **Shape:** cards radius 24, rows 20, inputs 14, checkboxes 9, buttons and chips fully round. Touch targets at least 48.
- **Surfaces:** flat. No gradients or shadows on UI; depth comes from the three background steps.
- **Text on inkBlue** is night (#0A0B0E), never white.

## Ink, the mascot
Pictures cut from the Gemini art, one per mood, plus her paws for leaning on a card. See `docs/mascot-moods.png`.

| Mood | When |
| --- | --- |
| happy | Default: home, widgets, app icon |
| coach | Tips, nudges, the chat button |
| cheer | Something finished: task ticked, budget kept, workout logged |
| sleepy | Empty states, nothing due |
| worried | Overdue task, over budget, missed log. Gentle, never nagging |

Ink speaks in short, friendly lines. One line at a time.

In phone notifications she's cheekier, like a pet that wants attention: a little guilt-trippy, never mean ("Nothing in the food log yet. Ink is not judging. (Ink is judging.)"). They bark.

## Motion
- Everything you can tap on the phone squishes a little while held and springs back (`Press`), with a light haptic tick. The + button squishes more and ticks harder.
