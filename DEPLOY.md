# Deploying AuraFlow Web to Vercel

Production is `https://online-file-organizer.vercel.app/`. A plain
`npm run build` now defaults to that origin, so the environment variables below
are **optional** — set them only to override the default (custom domain, preview
origin, or a GitHub Pages build).

## Option A — Deploy with the Vercel CLI

```powershell
# from C:\Users\ADMIN\Desktop\Aura\File-Organizer-Web
npx vercel login
npx vercel          # links the folder, creates a preview deployment
npx vercel --prod   # production deployment
```

Framework Preset: **Vite**. Build command: `npm run build`. Output directory:
`dist`.

## Option B — Import from GitHub

1. Push this project to a GitHub repository (it can live in its own repo, or the
   parent `Aura` repo with **Root Directory: `File-Organizer-Web`** in Vercel's
   project settings).
2. Import it in Vercel → Framework Preset **Vite**.
3. Deploy. No environment variables are required for the current production
   domain.

## Environment variables (all optional)

| Variable | Default when unset | When to set it |
|---|---|---|
| `BASE` | `/` | GitHub Pages project site: `/File-Organizer-Web/` |
| `CANONICAL_BASE_URL` | `https://online-file-organizer.vercel.app/` | A custom domain, preview origin, or GitHub Pages build |

- `BASE=/` because Vercel serves the site at the domain root. The GitHub Pages
  `/File-Organizer-Web/` prefix must NOT be used there.
- `CANONICAL_BASE_URL` drives every `<link rel="canonical">`, `og:url`,
  `sitemap.xml`, and the `Sitemap:` line in `robots.txt`. **If you add a custom
  domain, set it to the final URL with a trailing slash and redeploy** so SEO
  metadata matches where users actually visit.
- The build defaults live in `vite.config.ts`; `.env.example` documents the
  overrides.
- `vercel.json` (already in this folder) configures the CSP, security headers,
  clean-URL redirects, the 404 route, and immutable caching for
  `/assets/*`, `/fonts/*`, `og-cover.png`, and `favicon.svg` — nothing else to
  configure for them.

## Post-deploy verification (copy-paste)

```powershell
# 1. homepage 200
curl.exe -sI https://online-file-organizer.vercel.app/ | findstr /i "HTTP"
# 2. CSP + security headers are live
curl.exe -sI https://online-file-organizer.vercel.app/ | findstr /i "content-security-policy x-content-type-options referrer-policy permissions-policy"
# 3. unknown route serves the 404 page with status 404
curl.exe -s -o NUL -w "%{http_code}" https://online-file-organizer.vercel.app/no-such-page.html
# 4. sitemap uses the production domain
curl.exe -s https://online-file-organizer.vercel.app/sitemap.xml | findstr /i "loc" | Select-Object -First 4
# 5. robots.txt points at the production sitemap
curl.exe -s https://online-file-organizer.vercel.app/robots.txt
# 6. canonical tag matches the production domain
curl.exe -s https://online-file-organizer.vercel.app/ | findstr /i "rel=\"canonical\""
# 7. Google Search Console verification file still resolves
curl.exe -s -o NUL -w "%{http_code}" https://online-file-organizer.vercel.app/google0c010b13290b2d3d.html
```

Then in a real browser: run one organizer flow end-to-end (pick files → plan →
download manifest), confirm no console errors, and check that the site renders
on a phone (375 px) without horizontal scroll.

## Automated checks before deploying

```powershell
npm run typecheck
npm test
npm run build
node scripts/tools-test.mjs   # needs the built site + a browser for some checks
node scripts/smoke.mjs
```

## Known, documented limitations (non-blocking)

- `vite preview` locally serves `index.html` for unknown routes with HTTP 200 —
  on Vercel the custom `404.html` is served (verify with check #3 above).
- If a custom domain is added later, set `CANONICAL_BASE_URL` and redeploy.
- The first local `playwright` use requires `npx playwright install chromium`
  (only relevant to the dev smoke test, not to deployment). The smoke script
  falls back to installed Microsoft Edge when bundled Chromium is missing.
- `pdf-lib` and `fontkit` are loaded lazily only when a PDF/text-PDF workflow
  needs them, so the initial page load stays small. The build will still print a
  chunk-size warning for those lazy chunks; that is expected.
