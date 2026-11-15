import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

if (process.env.VERCEL !== '1') {
  await import('./build-demo-data.mjs');
} else {
  const { TRAINROT_DATA_URL, TRAINROT_DATA_SHA256, BLOB_READ_WRITE_TOKEN, VERCEL_ENV } = process.env;
  if (VERCEL_ENV !== 'production' || !TRAINROT_DATA_URL ||
      !/^[a-f0-9]{64}$/.test(TRAINROT_DATA_SHA256 ?? '') || !BLOB_READ_WRITE_TOKEN) {
    throw new Error('Hosted builds require the configured production NYC dataset.');
  }

  const url = new URL(TRAINROT_DATA_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !url.hostname.endsWith('.private.blob.vercel-storage.com')) {
    throw new Error('Production subway data must be in private Vercel Blob storage.');
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${BLOB_READ_WRITE_TOKEN}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Production subway data download failed (${response.status}).`);

  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== TRAINROT_DATA_SHA256) {
    throw new Error('Production subway data failed its checksum.');
  }
  const { network, challenges, boroughs, original } = JSON.parse(bytes);
  if (!network?.metadata?.feedVersion || network.metadata.mapName ||
      !Array.isArray(network.walkingConnections) || !Array.isArray(network.retiredChallenges) ||
      !Array.isArray(challenges) || boroughs?.type !== 'FeatureCollection' || !Array.isArray(original)) {
    throw new Error('Production subway data is missing required NYC inputs.');
  }

  const output = new URL('../dist/data/', import.meta.url);
  mkdirSync(output, { recursive: true });
  for (const [name, data] of Object.entries({ network, challenges, boroughs })) {
    writeFileSync(new URL(`${name}.json`, output), JSON.stringify(data));
  }
  writeFileSync(new URL('./original-challenges.json', import.meta.url), JSON.stringify(original));
}
