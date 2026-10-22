/**
 * Static SEO/security regression tests.
 *
 * These run against the source HTML and deployment config, so they catch the
 * mistakes that are easy to miss when editing pages by hand: duplicate titles,
 * a missing canonical, an accidental `noindex`, invalid JSON-LD, or a sitemap
 * that no longer matches the generated pages.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

/** Indexable pages, in sitemap order, as paths relative to the site root. */
const PAGES = [
  'index.html',
  'organizer.html',
  'converter.html',
  'image-to-pdf.html',
  'pdf-merger.html',
  'features.html',
  'guide.html',
  'guides/index.html',
  'guides/how-to-organize-files-by-type.html',
  'guides/how-to-clean-up-downloads-folder.html',
  'guides/how-to-organize-photos-and-documents.html',
  'guides/how-to-identify-duplicate-files.html',
  'guides/browser-file-organization-limits.html',
  'about.html',
  'privacy.html',
  'contact.html',
  'terms.html',
] as const;

const UI_PAGES = [...PAGES, '404.html'];

/** `index.html` and `guides/index.html` canonicalize to a directory URL. */
function canonicalPath(page: string): string {
  if (page === 'index.html') return '/';
  if (page === 'guides/index.html') return '/guides/';
  return `/${page}`;
}

function meta(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match?.[1] ?? null;
}

const title = (html: string) => meta(html, /<title>([^<]*)<\/title>/);
const description = (html: string) => meta(html, /<meta name="description" content="([^"]*)"\s*\/?>/);
const canonical = (html: string) => meta(html, /<link rel="canonical" href="([^"]*)"\s*\/?>/);
const robots = (html: string) => meta(html, /<meta name="robots" content="([^"]*)"\s*\/?>/);
const og = (html: string, property: string) =>
  meta(html, new RegExp(`<meta property="og:${property}" content="([^"]*)"\\s*/>`));
const twitter = (html: string, name: string) =>
  meta(html, new RegExp(`<meta name="twitter:${name}" content="([^"]*)"\\s*/>`));

function jsonLdBlocks(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => m[1]!,
  );
}

describe('indexable pages: titles, descriptions and canonical URLs', () => {
  const docs = PAGES.map((page) => ({ page, html: read(page) }));

  it('every page exists and has exactly one title, description and canonical', () => {
    for (const { page, html } of docs) {
      expect(html.match(/<title>/g), page).toHaveLength(1);
      expect(title(html), page).toBeTruthy();
      expect(html.match(/<meta name="description"/g), page).toHaveLength(1);
      expect(html.match(/<link rel="canonical"/g), page).toHaveLength(1);
    }
  });

  it('titles are unique and short enough to display in search results', () => {
    const titles = docs.map(({ page, html }) => ({ page, value: title(html)! }));
    expect(new Set(titles.map((t) => t.value)).size, 'duplicate <title>').toBe(titles.length);
    for (const { page, value } of titles) {
      // Count decoded characters roughly: HTML entities count as one character.
      const decoded = value.replace(/&[a-z]+;|&#\d+;/gi, 'x');
      expect(decoded.length, `${page}: title too long`).toBeLessThanOrEqual(70);
      expect(decoded.length, `${page}: title too short`).toBeGreaterThanOrEqual(20);
    }
  });

  it('descriptions are unique and within a useful length', () => {
    const descriptions = docs.map(({ page, html }) => ({ page, value: description(html)! }));
    expect(new Set(descriptions.map((d) => d.value)).size, 'duplicate description').toBe(
      descriptions.length,
    );
    for (const { page, value } of descriptions) {
      const decoded = value.replace(/&[a-z]+;|&#\d+;/gi, 'x');
      expect(decoded.length, `${page}: description too short`).toBeGreaterThanOrEqual(80);
      expect(decoded.length, `${page}: description too long`).toBeLessThanOrEqual(170);
    }
  });

  it('canonical, og:url and twitter metadata point at the same path', () => {
    for (const { page, html } of docs) {
      const expected = `__BASE_URL__${canonicalPath(page)}`;
      expect(canonical(html), page).toBe(expected);
      expect(og(html, 'url'), page).toBe(expected);
      expect(og(html, 'title'), page).toBeTruthy();
      expect(og(html, 'description'), page).toBeTruthy();
      const expectedType = page.startsWith('guides/') && page !== 'guides/index.html' ? 'article' : 'website';
      expect(og(html, 'type'), page).toBe(expectedType);
      expect(og(html, 'site_name'), page).toBe('AuraFlow Web');
      expect(og(html, 'locale'), page).toBe('en_US');
      expect(og(html, 'image'), page).toBe('__BASE_URL__/og-cover.png');
      expect(og(html, 'image:width'), page).toBe('1200');
      expect(og(html, 'image:height'), page).toBe('630');
      expect(og(html, 'image:alt'), page).toBeTruthy();
      expect(twitter(html, 'card'), page).toBe('summary_large_image');
      expect(twitter(html, 'title'), page).toBeTruthy();
      expect(twitter(html, 'description'), page).toBeTruthy();
      expect(twitter(html, 'image'), page).toBe('__BASE_URL__/og-cover.png');
    }
  });

  it('indexable pages are not accidentally noindexed', () => {
    for (const { page, html } of docs) {
      expect(robots(html), page).toBeNull();
      expect(html, page).not.toMatch(/content="noindex/i);
      expect(html, page).not.toMatch(/X-Robots-Tag/i);
    }
  });
});

describe('404 page', () => {
  const html = read('404.html');

  it('is noindex and has no canonical (so it cannot compete in search)', () => {
    expect(robots(html)).toContain('noindex');
    expect(canonical(html)).toBeNull();
  });

  it('has a human-readable title and links users back to the tools', () => {
    expect(title(html)).toMatch(/not found/i);
    expect(html).toMatch(/href="\.\/organizer\.html"/);
  });
});

describe('structured data', () => {
  it('every JSON-LD block is valid JSON with a schema.org context', () => {
    for (const page of UI_PAGES) {
      const blocks = jsonLdBlocks(read(page));
      for (const block of blocks) {
        const parsed = JSON.parse(block) as { '@context'?: string; '@type'?: string };
        expect(parsed['@context'], page).toBe('https://schema.org');
        expect(parsed['@type'], page).toBeTruthy();
      }
    }
  });

  it('does not invent aggregate ratings or reviews', () => {
    for (const page of UI_PAGES) {
      const html = read(page);
      expect(html, page).not.toMatch(/"aggregateRating"|"reviewCount"|"ratingValue"/);
    }
  });
});

describe('AdSense readiness guardrails', () => {
  it('does not ship ad code or a publisher ID before approval', () => {
    for (const page of UI_PAGES) {
      const html = read(page);
      expect(html, page).not.toMatch(/pagead2\.googlesyndication\.com/);
      expect(html, page).not.toMatch(/adsbygoogle/);
      expect(html, page).not.toMatch(/ca-pub-\d+/);
    }
    expect(existsSync(resolve(root, 'public/ads.txt'))).toBe(false);
  });
});

describe('sitemap and robots configuration', () => {
  const config = read('vite.config.ts');
  const sitemapBlock = config.slice(
    config.indexOf('const pages: Array<'),
    config.indexOf('];', config.indexOf('const pages: Array<')),
  );
  const sitemapPaths = [...sitemapBlock.matchAll(/\['([^']*)'/g)].map((m) => m[1]!);

  it('sitemap entries match the indexable pages exactly', () => {
    const expected = PAGES.map((page) =>
      page === 'index.html' ? '' : page === 'guides/index.html' ? 'guides/' : page,
    );
    expect(sitemapPaths).toEqual(expected);
  });

  it('the production canonical origin is the built-in default', () => {
    expect(config).toContain("'https://online-file-organizer.vercel.app/'");
    expect(config).not.toContain("https://heyitssuzain.github.io/File-Organizer-Web/'");
  });

  it('the static robots.txt fallback advertises the production sitemap', () => {
    const txt = read('public/robots.txt');
    expect(txt).toMatch(/^User-agent: \*$/m);
    expect(txt).toMatch(/^Allow: \/$/m);
    expect(txt).toContain('Sitemap: https://online-file-organizer.vercel.app/sitemap.xml');
  });

  it('the IndexNow key is stable and shared by the ping script and smoke check', () => {
    // The key must never change across builds: engine-validated URLs keep
    // pointing at /<key>.txt, and a mismatch breaks prior submissions.
    const keys = [read('vite.config.ts'), read('scripts/indexnow.mjs'), read('scripts/smoke.mjs')].map(
      (text) => text.match(/1f0e3749b2a8cd65/g)?.length ?? 0,
    );
    expect(keys[0]).toBeGreaterThan(0);
    expect(keys[1]).toBeGreaterThan(0);
    expect(keys[2]).toBeGreaterThan(0);
  });
});

describe('deployment headers', () => {
  const config = JSON.parse(read('vercel.json')) as {
    redirects: Array<{ source: string; destination: string; permanent: boolean }>;
    headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
  };
  const header = (source: string, key: string) =>
    config.headers.find((h) => h.source === source)?.headers.find((h) => h.key === key)?.value;

  it('redirects extension URLs to their canonical paths', () => {
    expect(config.redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/index.html', destination: '/', permanent: true }),
        expect.objectContaining({
          source: '/guides/index.html',
          destination: '/guides/',
          permanent: true,
        }),
      ]),
    );
  });

  it('keeps the security headers and noindexes the 404 page', () => {
    const csp = header('/(.*)', 'Content-Security-Policy');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(header('/(.*)', 'X-Frame-Options')).toBe('DENY');
    expect(header('/(.*)', 'X-Content-Type-Options')).toBe('nosniff');
    expect(header('/(.*)', 'Strict-Transport-Security')).toBeTruthy();
    expect(header('/(.*)', 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(header('/404.html', 'X-Robots-Tag')).toBe('noindex');
  });

  it('caches hashed assets immutably and keeps HTML revalidated', () => {
    expect(header('/assets/(.*)', 'Cache-Control')).toContain('immutable');
    expect(header('/fonts/(.*)', 'Cache-Control')).toContain('immutable');
    expect(header('/og-cover.png', 'Cache-Control')).toBeTruthy();
    expect(header('/(.*)', 'Cache-Control')).toBeUndefined();
  });
});
