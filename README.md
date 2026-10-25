# FRATELLI VINEYARDS — THA Akluj Lab Analysis PWA

A simple, read-only Progressive Web App (PWA) for viewing wine laboratory analysis rows from the `THA Akluj` Google Sheets tab. It supports search, tank/wine grouping, a date filter, latest analysis date per group, manual refresh, and a 60-second refresh while open.

## Before you start — important data privacy note

A Google Sheets **Publish to web** CSV can be viewed by anyone who has the published URL (and potentially indexed/shared more broadly). Only publish data that your winery has authorised for public access. If these are confidential winery QC/production records, ask your Google Workspace/IT administrator for an approved authenticated solution instead; do not publish confidential lab data publicly.

## Step 1 — make a GitHub repository

1. Sign in to GitHub.
2. Click **+** → **New repository**.
3. Name it `fratelli-winery-lab`.
4. Choose **Public** only if your organisation permits public hosting. GitHub Pages sites are publicly accessible; for sensitive data, use an organisation-approved private/authenticated solution.
5. Create the repository.
6. Upload all files and the `assets` folder from this ZIP, preserving the folder structure. `index.html` must be in the repository root.

## Step 2 — obtain the CSV URL for THA Akluj

1. Open the Google Sheet you shared.
2. Select **File → Share → Publish to web**.
3. In the first dropdown, select only the **THA Akluj** tab (not the entire spreadsheet).
4. In the format dropdown, select **Comma-separated values (.csv)**.
5. Click **Publish** and confirm only if you have approval to expose this data.
6. Copy the published CSV URL. Do not use the normal `/edit?...` browser URL.
7. In GitHub, open `app.js`, click the pencil icon, and find this line near the top:

   `const CSV_URL = "PASTE_PUBLISHED_THA_AKLUJ_CSV_URL_HERE";`

8. Replace the text inside the quotes with the CSV URL you copied. Keep the quotes. Click **Commit changes**.

The app attempts to recognise columns containing tank, wine, and analysis date in their headings. If your sheet uses unusual header names, update the candidate lists in `findColumn()` in `app.js` to match your exact column headers.

## Step 3 — enable GitHub Pages

1. Open your repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Choose branch **main** and folder **/(root)**, then click **Save**.
5. Wait for GitHub Pages to publish, then open the URL shown in Settings → Pages.

Official guide: https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## Step 4 — install it on your phone

1. Open your GitHub Pages URL in Chrome on Android.
2. Open Chrome's three-dot menu.
3. Tap **Install app** or **Add to Home screen** (wording varies).
4. Open the new Fratelli Lab icon.

## How updating works

- While the app is open, it requests the CSV again every 60 seconds and when you tap **Refresh**.
- Google says published Sheet updates can take a few minutes to appear. Therefore, the app cannot guarantee that a new cell appears instantly.
- The app caches its own interface for faster loading; analysis CSV requests use `cache: no-store` and include a refresh query parameter.
- If data does not update, verify the tab was published, automatic republishing is enabled, and the CSV URL points to `THA Akluj`.

## Notes / troubleshooting

- `Could not load the sheet`: the URL may be an edit link, the tab may not be published, or access may be blocked.
- `Received a web page instead of CSV`: copy the published CSV URL again.
- `No analysis rows match your search`: clear search/date filters.
- Latest date depends on the sheet's analysis-date column. If date values are text in an unusual format, adjust `parseDate()`.
- This starter app does not edit Google Sheets. It is a read-only viewer.
- The supplied Fratelli logo is included as `assets/fratelli-logo.png`.
