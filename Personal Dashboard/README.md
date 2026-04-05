# Personal Dashboard Prototype

A mobile-first personal dashboard with 3 domains:
- Knowledge
- Physical
- Financial

This prototype is zero-build (plain HTML/CSS/JS) so it is easy to maintain with limited HTML/CSS experience.

## Features
- Bottom-tab navigation for the 3 domains
- Drag-and-drop widget reordering (saved per domain)
- Notes + learning goals
- Habit tracker + workout log
- Budget + expense tracking
- Simple built-in charts (goal progress, workouts, 7-day spending)
- Local persistence via browser `localStorage`
- Optional Supabase auth + cloud sync

## Project Files
- `index.html`: app structure
- `styles.css`: mobile-first styles
- `app.js`: logic, rendering, persistence, and Supabase integration
- `config.js`: local config with Supabase keys (kept blank by default)
- `config.example.js`: template config
- `supabase-schema.sql`: SQL for table + RLS policies

## Run Locally
From this folder, run either of these:

```bash
python3 -m http.server 8080
```

Then open:
- `http://localhost:8080`

## Enable Supabase Sync
1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase-schema.sql`.
3. Copy `config.example.js` into `config.js` (or edit `config.js`) and set:
   - `supabaseUrl`
   - `supabaseAnonKey`
4. Open the app and use email login for magic-link auth.

If `config.js` values are blank, app works in local-only mode.

## Next Step Options
- Replace list items with richer cards/charts
- Add data export/import (JSON)
- Add recurring habits and monthly financial summaries
- Migrate to Next.js later once Node is installed
