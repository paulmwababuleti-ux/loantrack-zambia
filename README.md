# LoanTrack - Phase 1: Foundation

Database, login, and the installable mobile shell. Everything runs on free tiers (Supabase Free + Vercel Free).

## What is in Phase 1
* **Database** (`supabase/schema.sql`): `admins`, `clients`, `loans`, `payments`, `activity_logs`, private photo storage, security rules.
* **5 admin accounts** (`supabase/seed_admins.sql`): one **Master Admin** (can approve and delete) and Loan Officers (can only create Pending loans).
  The rules live inside the database, so they cannot be bypassed from a phone or browser.
* **Login / Logout**: big buttons, 16px fields (no zoom on phones), show-password eye.
* **PWA from day 1**: `public/manifest.json`, `public/sw.js`, app icons, "Add to Home Screen".
* **Mobile shell**: top bar with hamburger menu, bottom navigation bar (Home, Clients, Loans, More).
  Clients and Loans are placeholders until Phases 2 and 3.
* The **Home** screen has a "Phase 1 check" so you can see at a glance that the database, login, role and PWA all work.

---

## Setup (about 30 minutes)

### A. Supabase (database + login)
1. <https://supabase.com>, **New project**. Choose a name, a strong database password (save it), and the region nearest you.
2. **Project Settings, API**: copy the **Project URL** and the **anon public** key.
3. **SQL Editor, New query**: paste all of `supabase/schema.sql`, click **Run**. It should say *Success*.
4. **Authentication, Sign In / Providers**: turn **off** "Allow new users to sign up" (only you create accounts).
5. **Authentication, Users, Add user, Create new user**: create **5 users** (email + password each), tick **Auto Confirm User**.
6. Open `supabase/seed_admins.sql`, change the 5 emails and names to match the users you just made, paste it into the SQL Editor and **Run**.
   You should see 5 rows. Exactly one is `master_admin`.

### B. Environment file
```
cp .env.example .env.local        # Windows: copy .env.example .env.local
```
Open `.env.local` and paste your two values:
```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
VITE_APP_NAME=LoanTrack
```
(The anon key is meant to be public; the database rules protect your data. Never put the `service_role` key here.)

### C. Test on your PC
Install Node.js 18+ from <https://nodejs.org>, then in this folder:
```
npm install
npm run dev
```
Open <http://localhost:5173> and sign in.
(To try login on your phone straight away: phone and PC on the same Wi-Fi, open the `Network:` address that `npm run dev` prints.
Login works over that address, but **installing as an app needs the https site in step D**.)

### D. Put it online on Vercel (needed to install on the phone)
1. Create a GitHub repository and push this folder:
```
git init && git add . && git commit -m "LoanTrack phase 1"
git branch -M main
git remote add origin https://github.com/YOU/loantrack.git
git push -u origin main
```
2. <https://vercel.com>, **Add New, Project**, import the repository (Vite is detected automatically).
3. **Environment Variables**: add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`. Click **Deploy**.
4. Open the `https://....vercel.app` address on your phone.

> Vercel's free Hobby plan is meant for personal, non-commercial use. If this becomes the company's live system, check their terms;
> Cloudflare Pages and Netlify are free alternatives with the same settings.

---

## Test checklist

**On the phone (Chrome on Android)**
1. Open the Vercel address. The login page fills the screen and the keyboard does not zoom the page.
2. Sign in with the **Master Admin**. Home says "Good morning/afternoon, NAME" and shows the **Master Admin** badge. Every line in *Phase 1 check* is green.
3. Tap the **hamburger** (top left): the menu slides in with your name, role, pages, install button, **Sign out**.
4. Tap **Install LoanTrack** in the menu (or Chrome menu, **Install app**). Open it from the home screen: it opens full screen with no browser bar, and the green splash screen shows first.
5. Tap the bottom bar: Home, Clients, Loans, More. Everything is reachable with your thumb.
6. Sign out, then sign in with a **Loan Officer**: the badge says **Loan Officer**.
7. Try a wrong password: you get a clear red message.

**On the PC**
1. Open the same address, sign in, sign out, sign in as a Loan Officer.
2. The app shows as a centered phone-style column. Chrome shows an install icon in the address bar.

**If something is red**, see Troubleshooting. When everything works, reply: **Phase 1 is clear, move to next**.

## Troubleshooting
| You see | Fix |
|---|---|
| "LoanTrack needs setup" | The two `VITE_` variables are missing. Add them (`.env.local` or Vercel) and restart / redeploy. |
| "Wrong email or password" but you are sure | Users must exist under Authentication, Users, with **Auto Confirm User** ticked. Reset the password there. |
| "No access yet" | The login exists but is not in `admins`. Run `seed_admins.sql` with that exact email. |
| "Database connected" is red | `schema.sql` did not run fully. Re-run it on a fresh project, or send me the red message. |
| No Install button on the phone | It only appears on the https site (not `localhost` or the Wi-Fi address). Visit twice, use Chrome, and try the Chrome menu, **Install app**. iPhone: Safari, Share, **Add to Home Screen**. |
| Old version still showing after an update | Close the app fully and open it again (the service worker updates on the next visit). |

## Files
```
supabase/schema.sql        tables, security rules, automatic activity log, photo buckets
supabase/seed_admins.sql   creates the 5 admin rows (1 Master Admin + 4 Loan Officers)
public/manifest.json       app name, icons, colours (installable)
public/sw.js               service worker
public/icons/              192, 512, maskable 512, Apple icon
src/components/AppShell.jsx    top bar, hamburger drawer, bottom navigation
src/pages/Login.jsx, Home.jsx
```
