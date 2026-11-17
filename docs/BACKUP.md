# Backups

Every Sunday at about 2 AM (Manila), the **Weekly backup** GitHub Action copies all of Dirary's data out of Supabase,
compresses it, encrypts it with a passphrase only you know, and keeps the encrypted file for 90 days. It is free:
it runs on GitHub's free Actions minutes and uses no paid Supabase feature.

What's in it: every table in the `public` schema (tasks, lists, money, food, workouts), data only. The tables
themselves come from `supabase/migrations`. Not in it: your Supabase login, and the bank notifications the phone
reads, which never leave the phone.

The repository is public, so anyone can see that the workflow ran. Only the encrypted file is uploaded, and without
the passphrase it's unreadable. Use a long passphrase and keep it in your password manager.

## Set it up (once)

1. **Connection string.** In Supabase: *Connect* (top of the project page) → *Session pooler* → copy the URI.
   It looks like `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Put your database password in place of `[YOUR-PASSWORD]`. (Use the session pooler, not the direct connection:
   GitHub's machines can't reach the direct one.)
2. **Passphrase.** Make one of at least 20 characters, for example four or five random words.
   Save it in your password manager first. Without it, no backup can be opened.
3. On GitHub: *Settings → Secrets and variables → Actions → New repository secret*. Add
   `SUPABASE_DB_URL` (the URI) and `BACKUP_PASSPHRASE` (the passphrase).
4. *Actions → Weekly backup → Run workflow* to make the first backup now and check that it works.

GitHub pauses scheduled workflows in a public repository after 60 days without any commits. If that happens,
GitHub emails you; open *Actions → Weekly backup* and press *Enable workflow*.

## Get a backup back

1. *Actions → Weekly backup* → pick a run → download the artifact under *Artifacts*, and unzip it.
2. Decrypt it (you'll be asked for the passphrase):

   ```bash
   gpg --decrypt dirary-backup-2026-11-22.sql.gz.gpg | gunzip > dirary-backup.sql
   ```

   `dirary-backup.sql` is plain text with every row. It holds your finances: delete it when you're done.

Restoring needs `psql` 18 or newer, because the backup is made with pg_dump 18. On a Mac: `brew install libpq`,
then use `$(brew --prefix libpq)/bin/psql`.

### Put it back into the same Supabase project

Only if data was lost. This replaces what's there now with the backup.

```bash
DB="<the same session pooler URI>"
psql "$DB" -v ON_ERROR_STOP=1 <<'SQL'
truncate lists, tasks, accounts, categories, transactions, fixed_expenses, money_plans, stashes,
  foods, food_logs, health_goals, water_logs, exercises, routines, workout_sessions, workout_sets, body_metrics cascade;
SQL
psql "$DB" -v ON_ERROR_STOP=1 -f dirary-backup.sql
```

Then on the phone, sign out and back in so it reloads everything from Supabase.

### Into a new Supabase project

1. Run every file in `supabase/migrations`, in order, in the new project's SQL editor.
2. Sign in to Dirary once with the new project, so your account exists there.
3. Find your new user id (*Authentication → Users*) and your old one (the `user_id` in any row of the backup).
4. Swap the ids, then restore:

   ```bash
   sed -i "s/<old-user-id>/<new-user-id>/g" dirary-backup.sql
   psql "<the new project's session pooler URI>" -v ON_ERROR_STOP=1 -f dirary-backup.sql
   ```

## Exporting by hand

Dirary on the web → *Your data* downloads everything as one JSON file, or tasks, transactions, the food log,
workout sets and body weight as CSV files for a spreadsheet.
