import fs from 'fs';
import path from 'path';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';

const GTFS_RT_VEHICLES_URL = 'https://www.miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb';
const GTFS_RT_TRIP_UPDATES_URL = 'https://www.miapp.ca/GTFS_RT/TripUpdate/TripUpdates.pb';
const GTFS_RT_ALERTS_URL = 'https://www.miapp.ca/gtfs_rt/Alerts/Alerts.pb';
const GTFS_STATIC_URL = 'https://www.miapp.ca/GTFS/google_transit.zip';

function replacer(_key, value) {
  if (value && typeof value === 'object') {
    // protobufjs Long objects
    if (typeof value.toNumber === 'function') return value.toNumber();
    // Uint8Array -> base64
    if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  }
  return value;
}

async function fetchArrayBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.arrayBuffer();
}

async function fetchAndDecodePb(url) {
  const buf = await fetchArrayBuffer(url);
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buf));
  return feed;
}

async function fetchStaticRoutes() {
  const buf = Buffer.from(await fetchArrayBuffer(GTFS_STATIC_URL));
  const zip = new AdmZip(buf);
  const entry = zip.getEntry('routes.txt');
  if (!entry) return null;
  const csv = entry.getData().toString('utf-8');
  const records = parse(csv, { columns: true, skip_empty_lines: true });
  return { csv, records };
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'outputs');
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const [vehiclesFeed, tripUpdatesFeed, alertsFeed, staticRoutes] = await Promise.all([
      fetchAndDecodePb(GTFS_RT_VEHICLES_URL),
      fetchAndDecodePb(GTFS_RT_TRIP_UPDATES_URL),
      fetchAndDecodePb(GTFS_RT_ALERTS_URL),
      fetchStaticRoutes(),
    ]);

    const files = [
      { name: 'raw-vehicles.json', data: vehiclesFeed },
      { name: 'raw-trip-updates.json', data: tripUpdatesFeed },
      { name: 'raw-alerts.json', data: alertsFeed },
      { name: 'raw-routes.json', data: staticRoutes },
    ];

    for (const f of files) {
      const p = path.join(outDir, f.name);
      fs.writeFileSync(p, JSON.stringify(f.data, replacer, 2), 'utf-8');
      console.log('Wrote', p);
    }
  } catch (err) {
    console.error('Error fetching raw feeds:', err);
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.cwd()}/scripts/fetch-miway-raw.js` || import.meta.url.endsWith('/scripts/fetch-miway-raw.js')) {
  main();
}
