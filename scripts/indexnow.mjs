/**
 * `npm run indexnow` — ping IndexNow-partnering engines (Bing, DuckDuckGo,
 * Yahoo, Yandex, Naver, Seznam, Ecosia) about every URL in the current
 * sitemap. Requires https://online-file-organizer.vercel.app/<key>.txt to be
 * live, so run this AFTER a successful production deploy.
 *
 * Google is NOT an IndexNow partner and ignores these pings — for Google use
 * Search Console (resubmit the sitemap or use URL Inspection → Request
 * indexing); the sitemap alone keeps Google's crawl schedule updated.
 */
import { readFileSync } from 'node:fs';

const BASE = 'https://online-file-organizer.vercel.app/';
const KEY = '1f0e3749b2a8cd65';

// Verify the key file is actually live, otherwise submissions are rejected.
const keyRes = await fetch(BASE + `${KEY}.txt`, { cache: 'no-store' });
if (!keyRes.ok) throw new Error(`Key file not reachable: ${BASE}${KEY}.txt → HTTP ${keyRes.status}`);
const liveKey = (await keyRes.text()).trim();
if (liveKey !== KEY) throw new Error(`Key file content mismatch (live: "${liveKey}")`);
console.log(`key file OK: ${BASE}${KEY}.txt`);

const sitemap = await (await fetch(BASE + 'sitemap.xml', { cache: 'no-store' })).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urls.length === 0) throw new Error('No URLs parsed from sitemap.xml');
console.log(`submitting ${urls.length} URLs to indexnow.org…`);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(BASE).host, key: KEY, keyLocation: `${BASE}${KEY}.txt`, urlList: urls }),
});
console.log(`HTTP ${res.status} ${res.status === 200 || res.status === 202 ? '— accepted' : res.status === 400 ? '— bad request' : res.status === 429 ? '— too many requests; retry later' : res.status}`);
if (res.status !== 200 && res.status !== 202) process.exit(1);
