# Nox — online messenger starter

Nox is a Discord-inspired dark web messenger starter built with React, TypeScript, Vite and Supabase.

## What works in this starter

- Responsive dark UI, server rail, channel list, member panel
- Demo mode with sample conversations and local-only messages
- Supabase email/password sign-up and sign-in UI
- Profile loading, server and channel creation
- Message persistence and realtime inserts for channel messages
- Search registered users by username or display name and start private conversations
- Direct messages stored in Supabase with membership-based Row Level Security and realtime updates
- Friend requests with accept/decline and shared profile avatars
- PostgreSQL schema and Row Level Security (RLS) starter policies

## Important current limits

- Server invitations and joining other users' servers are not implemented yet.
- The included SQL is a starter, not a complete security audit. Before public production use, add an invitation/join flow and review RLS carefully. The starter only allows a server owner to add their own initial membership; other users cannot join until an invitation/join flow is implemented.
- Demo messages are local to the browser and are not shared.
- No voice/video, chat attachments, moderation, or push notifications yet. Message search is limited to content already loaded in the browser.

## 1. Run locally

Install Node.js 20 or newer, then from this folder:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open the local URL printed by Vite (usually http://localhost:5173).

The app runs in demo mode until Supabase credentials are added.

## 2. Create a Supabase project

1. Open https://supabase.com and create a project.
2. In the project dashboard, open **SQL Editor**.
3. Copy and run the entire contents of `supabase/schema.sql`.
4. Run `supabase/nox-upgrade.sql` to add private messages, friend requests, shared avatars, editable usernames and profile bios, message deletion, channel slowmode, shared profile statuses, realtime notifications, DM server-invite cards, server deletion and server/channel settings. It can also be run again on an existing project to apply the latest updates.
5. Open **Project Settings → API** (or the project's API keys page) and copy the Project URL and publishable/anon key.
6. Put those values in `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

7. In **Authentication → URL Configuration**, add your local URL (for example `http://localhost:5173`) to the allowed redirect/site URLs. For production, add the GitHub Pages URL too.
8. In **Authentication → Providers**, ensure Email is enabled. For quick testing, you can decide whether to require email confirmation in the Supabase Auth settings.
9. Restart Vite after editing `.env.local`.

Never put a Supabase `service_role` key in a browser app or commit it to GitHub. The publishable/anon key is designed for browser use only when RLS policies are enabled and correct.

## 3. Publish on GitHub Pages

### A. Create a repository

Create a new GitHub repository, e.g. `nox-messenger`, and push this project.

```bash
git init
git add .
git commit -m "Initial Nox messenger"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nox-messenger.git
git push -u origin main
```

### B. Configure the frontend environment

For a public deployment, do not rely on an untracked `.env.local` on GitHub's build runner. Add GitHub repository **Settings → Secrets and variables → Actions → Variables**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The anon/publishable key is public by design; RLS is what protects data. Using Actions variables makes build setup easier, but never put a `service_role` key here or in frontend code.

### C. Add GitHub Actions workflow

Create `.github/workflows/deploy.yml` with:

```yaml
name: Deploy Nox to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Commit and push the workflow. Then open repository **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.

The site will be at `https://YOUR_USERNAME.github.io/nox-messenger/`. This project uses Vite `base: "./"` so its assets work from a project subpath.

### D. Set Supabase production URLs

In Supabase Authentication URL Configuration, add the deployed GitHub Pages URL to the allowed site URLs. If email confirmation is enabled, make sure the confirmation flow returns to a permitted URL.

## 4. Quick sanity check

```bash
npm run build
```

Then test:
1. Create a new account.
2. Sign in and create a server.
3. Add a channel.
4. Open the same site in another browser/session and create a separate account.
5. To let the second account see a server, an invitation/join flow must be implemented; it is not included yet. For realtime testing, use two sessions that are both members of the same server (you can add membership through a carefully controlled admin/test flow while developing).

## Suggested next milestone

Implement direct messages and a safe server invite/join workflow using expiring invite codes, then tighten membership policies before public launch.
