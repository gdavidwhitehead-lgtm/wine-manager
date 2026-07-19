# Wine Manager

A static HTML dashboard for managing the wine collection in `Wine_Collection_Inventory_Rebuilt.xlsx`.

Open `index.html` in a browser to use the dashboard. The data export lives in `data/wines.js` and was generated from the workbook's `Cellar Database` sheet.

## Features

- Collection metrics for total bottles, unique wines, drink-now bottles, and holds
- Filters for search, color, cellaring status, and region
- Sort options for drink priority, quantity, rating, vintage, and winery
- Visual summaries for color balance, cellaring status, and top regions
- Priority lists for bottles to open soon and low-stock wines
- Full searchable inventory table
- Add, edit, and delete wines directly in the browser
- Supabase cloud sync for GitHub Pages hosting
- Local browser persistence and import/export backup

## Cloud Sync Setup

GitHub Pages is static, so this dashboard uses Supabase for the database and login while keeping the front end hosted on GitHub Pages.

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase-schema.sql`.
3. In Supabase Auth settings, add your GitHub Pages URL to the allowed redirect URLs.
4. Copy the project URL and anon public key into `config.js`.
5. Commit and push `config.js`, `supabase-schema.sql`, and the dashboard files.

`config.js` should look like this after setup:

```js
window.WINE_MANAGER_CONFIG = {
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your-anon-public-key",
  tableName: "wines",
};
```

The anon key is intended for browser apps. Row-level security in `supabase-schema.sql` limits each signed-in user to their own wines.

## Google Login Setup

The app supports Google OAuth to avoid Supabase's built-in email rate limits.

In Supabase:

1. Go to **Authentication > Sign In / Providers**.
2. Enable **Google**.
3. Add the Google OAuth Client ID and Client Secret.
4. Keep your GitHub Pages URL in **Authentication > URL Configuration** as the Site URL and an allowed redirect URL.

In Google Cloud Console:

1. Create or open an OAuth client for a web application.
2. Add this authorized redirect URI:

```text
https://unzeynqyzofpgsdjhgen.supabase.co/auth/v1/callback
```

After that, use **Cloud Sync > Continue with Google** in the dashboard.

## AI Research Backend

The dashboard includes a Supabase Edge Function at `supabase/functions/research-wine/index.ts`. It calls the OpenAI Responses API with web search enabled, returns structured research, and stores the result in the `wine_research` table.

Setup:

1. Re-run `supabase-schema.sql` in the Supabase SQL editor to add the `wine_research` table.
2. Install the Supabase CLI if needed.
3. Link this repo to your Supabase project.
4. Set the OpenAI key as a Supabase secret.
5. Deploy the function.

Commands:

```bash
supabase link --project-ref unzeynqyzofpgsdjhgen
supabase secrets set OPENAI_API_KEY=your-openai-api-key
supabase functions deploy research-wine
```

After deployment, sign in with **Cloud Sync**, click a wine, then use **Research with AI** in the wine detail popup.

## How Saving Works

- Before Supabase is configured, edits save locally in the browser.
- After Supabase is configured, use **Sign In** to receive an email sign-in link.
- Once signed in, add/edit/delete actions sync to Supabase and also keep a local cache.
- If the cloud is unavailable, the app still keeps local changes and shows the sync issue.

## Backup Export

Use **Export** to download the current inventory as `wines.js`. To update the repo fallback data:

1. Use **Export** in the dashboard.
2. Replace `data/wines.js` in the repo with the downloaded `wines.js`.
3. Commit and push the change to GitHub.

Use **Import** to load a previously exported `wines.js` or JSON file into the browser.
