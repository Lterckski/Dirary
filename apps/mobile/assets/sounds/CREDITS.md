# Sounds

- `bark.wav`: "LBS_FX DOG Small Alert Bark001.wav" from Freesound (sound 163459), Creative Commons 0 (public domain).
  Trimmed to the bark (0.9 s) and raised to -1 dB peak. Used as the sound of the `ink-bark` notification channel.
  To change it, replace the file and give the channel a new id in `src/lib/reminders.ts`: Android fixes a channel's sound when it is first made.
