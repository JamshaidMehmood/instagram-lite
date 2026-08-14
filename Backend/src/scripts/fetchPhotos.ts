import fs from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';

import { logger } from '../config/logger';
import { readImageInfo } from '../utils/imageDimensions';

/**
 * Downloads real photographs for the seed using a real browser (Playwright /
 * Chromium), rather than generating placeholder gradients.
 *
 * Source is Lorem Picsum, which serves actual Unsplash photos and lets us pull
 * a specific photo at a specific size — `/id/{id}/{w}/{h}` — so every seeded
 * post gets a genuine image cropped to the aspect ratio the feed expects. Every
 * downloaded file is decoded and validated here before it is trusted, and the
 * server independently sniffs its real dimensions at upload time.
 *
 * Results are cached under `seed-assets/` (gitignored) and described by a
 * manifest, so re-seeding does not re-launch the browser or re-hit the network.
 */

export const SEED_ASSET_DIR = path.resolve(__dirname, '..', '..', 'seed-assets');
const MANIFEST_PATH = path.join(SEED_ASSET_DIR, 'manifest.json');
const CATALOG_URL = 'https://picsum.photos/v2/list?page=1&limit=100';
const NAV_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

export interface PhotoSpec {
  width: number;
  height: number;
}

export interface SeedPhoto {
  path: string;
  /** The Unsplash photographer — kept for attribution. */
  author: string;
  sourceUrl: string;
}

/**
 * Validates the shape of the catalog at runtime instead of trusting a cast.
 * A `JSON.parse(...) as CatalogEntry[]` would type-check but throw a cryptic
 * `catalog.filter is not a function` (or silently carry `undefined` fields) if
 * the API ever returns a non-array or drops a key.
 */
const CatalogSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      author: z.string().default(''),
      url: z.string().default(''),
    }),
  )
  .min(1, 'Photo catalog was empty');

type CatalogEntry = z.infer<typeof CatalogSchema>[number];

/**
 * The manifest records the requested dimensions per file, so the cache is keyed
 * on *what was asked for*, not merely how many photos there are. Without the
 * dimensions, changing a post's target size while keeping the same post count
 * would silently reuse a stale, wrong-aspect image.
 */
const ManifestEntrySchema = z.object({
  file: z.string(),
  author: z.string(),
  sourceUrl: z.string(),
  width: z.number(),
  height: z.number(),
});
type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
const ManifestSchema = z.array(ManifestEntrySchema);

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      logger.warn({ err: error, label, attempt, max: MAX_ATTEMPTS }, 'Download attempt failed, retrying');
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${MAX_ATTEMPTS} attempts`);
}

/**
 * Returns cached photos only if the manifest matches the *current* request
 * exactly — same count and, per position, the same requested dimensions — and
 * every named file is still on disk. Any mismatch forces a fresh download.
 */
function readCachedPhotos(specs: PhotoSpec[]): SeedPhoto[] | null {
  if (!fs.existsSync(MANIFEST_PATH)) return null;

  let manifest: ManifestEntry[];
  try {
    manifest = ManifestSchema.parse(JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')));
  } catch {
    return null;
  }

  if (manifest.length !== specs.length) return null;

  const matchesRequest = manifest.every((entry, index) => {
    const spec = specs[index];
    return spec && entry.width === spec.width && entry.height === spec.height;
  });
  if (!matchesRequest) return null;

  const photos = manifest.map((entry) => ({
    path: path.join(SEED_ASSET_DIR, entry.file),
    author: entry.author,
    sourceUrl: entry.sourceUrl,
  }));

  return photos.every((photo) => fs.existsSync(photo.path)) ? photos : null;
}

/**
 * Spreads the picks across the catalog so the seed does not open with eight
 * near-identical frames by the same photographer at the top of the list.
 */
function selectEntries(catalog: CatalogEntry[], count: number): CatalogEntry[] {
  if (catalog.length < count) {
    throw new Error(`Catalog returned only ${catalog.length} photos, needed ${count}`);
  }

  const step = Math.floor(catalog.length / count);
  return Array.from({ length: count }, (_, index) => catalog[index * step] as CatalogEntry);
}

/**
 * Downloads one photo and proves it is a real, decodable image before returning
 * its bytes. A 200 response carrying an HTML error page, a truncated body, or a
 * zero-byte payload would otherwise be cached and only surface much later — as
 * a crash inside the seed, after the database has already been wiped.
 */
async function downloadPhoto(page: Page, entry: CatalogEntry, spec: PhotoSpec): Promise<Buffer> {
  const url = `https://picsum.photos/id/${entry.id}/${spec.width}/${spec.height}`;

  return withRetry(`photo ${entry.id}`, async () => {
    const response = await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    if (!response?.ok()) {
      throw new Error(`Photo ${entry.id} returned status ${response?.status() ?? 'no response'}`);
    }

    const bytes = await response.body();
    const info = readImageInfo(bytes);
    if (!info) {
      throw new Error(`Photo ${entry.id} response was not a decodable image (${bytes.length} bytes)`);
    }
    if (info.width !== spec.width || info.height !== spec.height) {
      // Not fatal on its own — the server re-sniffs real dimensions — but a
      // mismatch usually means a resized error placeholder, so retry once more.
      logger.warn(
        { id: entry.id, requested: spec, actual: { width: info.width, height: info.height } },
        'Downloaded photo dimensions differ from request',
      );
    }
    return bytes;
  });
}

async function downloadWithBrowser(specs: PhotoSpec[]): Promise<SeedPhoto[]> {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch();
    const context = await browser.newContext({
      // A normal desktop UA; some CDNs vary responses for headless defaults.
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    });
    const page = await context.newPage();

    logger.info('Browsing the photo catalog…');
    const catalog = await withRetry('catalog', async () => {
      const response = await page.goto(CATALOG_URL, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      });
      if (!response?.ok()) {
        throw new Error(`Catalog request failed with status ${response?.status() ?? 'no response'}`);
      }
      // Validated, not cast: a non-array or field-renamed body fails loudly
      // here rather than misbehaving deep in the pipeline.
      return CatalogSchema.parse(JSON.parse(await response.text()));
    });

    const chosen = selectEntries(catalog, specs.length);
    const photos: SeedPhoto[] = [];

    for (let index = 0; index < specs.length; index += 1) {
      const entry = chosen[index] as CatalogEntry;
      const spec = specs[index] as PhotoSpec;

      const bytes = await downloadPhoto(page, entry, spec);

      // Written only after the bytes are proven to decode, so a poisoned
      // response never enters the cache.
      const file = `photo-${index}.jpg`;
      fs.writeFileSync(path.join(SEED_ASSET_DIR, file), bytes);

      logger.info({ index, id: entry.id, author: entry.author, bytes: bytes.length }, 'Downloaded photo');

      photos.push({ path: path.join(SEED_ASSET_DIR, file), author: entry.author, sourceUrl: entry.url });
    }

    // Manifest is written last, so a crash mid-run leaves no manifest and the
    // next run re-downloads rather than trusting a partial set.
    const manifest: ManifestEntry[] = photos.map((photo, index) => ({
      file: path.basename(photo.path),
      author: photo.author,
      sourceUrl: photo.sourceUrl,
      width: (specs[index] as PhotoSpec).width,
      height: (specs[index] as PhotoSpec).height,
    }));
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    return photos;
  } finally {
    await browser?.close();
  }
}

/**
 * Returns local paths to real photos, one per spec, downloading them via
 * Playwright on the first run and serving the cache thereafter.
 */
export async function ensureSeedPhotos(specs: PhotoSpec[]): Promise<SeedPhoto[]> {
  fs.mkdirSync(SEED_ASSET_DIR, { recursive: true });

  const cached = readCachedPhotos(specs);
  if (cached) {
    logger.info(`Reusing ${cached.length} cached seed photos`);
    return cached;
  }

  return downloadWithBrowser(specs);
}
