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
