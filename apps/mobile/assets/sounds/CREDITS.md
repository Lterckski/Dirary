# Sounds

- `bark.wav`: a small dog's bark recorded and supplied by Luther (Nov 2026). Trimmed to 3.95 s, mono 44.1 kHz, -1 dB peak.
  It is the sound of the `ink-bark-2` notification channel.
  To change it, replace the file and give the channel a new id in `src/lib/reminders.ts` (and `defaultChannel` in app.json):
  Android fixes a channel's sound when it is first made, so phones that already have the channel keep the old sound.
