import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';

const GTFS_RT_VEHICLES_URL = 'https://www.miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb';
const GTFS_RT_TRIP_UPDATES_URL = 'https://www.miapp.ca/GTFS_RT/TripUpdate/TripUpdates.pb';
const GTFS_RT_ALERTS_URL = 'https://www.miapp.ca/gtfs_rt/Alerts/Alerts.pb';
const GTFS_STATIC_URL = 'https://www.miapp.ca/GTFS/google_transit.zip';

let routeMapCache: Record<string, { shortName: string; longName: string }> = {};
let routeMapFetchedAt = 0;
const ROUTE_MAP_TTL_MS = 1000 * 60 * 60 * 12;

// Shape cache: routeId -> coordinates array
let shapeCache: Record<string, [number, number][]> = {};
let routeToShapeCache: Record<string, string> = {}; // routeId -> shapeId
let shapeCacheFetchedAt = 0;
const SHAPE_CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
// Map from uppercased route short name (eg. "5", "101A") to GTFS route_id(s)
let routeShortNameToRouteIds: Record<string, string[]> = {};

type VehicleSnapshot = {
    lat: number;
    lon: number;
    timestampSec: number;
};

const MAX_HISTORY = 6;

// store a short history of recent snapshots per vehicle for better speed/bearing estimates
const vehicleCache = new Map<string, VehicleSnapshot[]>();
const VEHICLE_CACHE_TTL_SEC = 300;

const MIN_SPEED_KMH = 1;
const MAX_SPEED_KMH = 75;
const MIN_TIME_DELTA_SECONDS = 8;
const MAX_TIME_DELTA_SECONDS = 120;
const MAX_JUMP_METERS = 600;

const MAX_TOTAL_TIME_SECONDS = 120;

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function normalizeTimestampSec(timestamp?: unknown): number | undefined {
    if (timestamp === undefined || timestamp === null) return undefined;
    if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
    if (typeof timestamp === 'string') {
        const parsed = Number(timestamp);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    if (typeof timestamp === 'object') {
        const value = (timestamp as { toNumber?: () => number }).toNumber?.();
        return Number.isFinite(value) ? value : undefined;
    }
    return undefined;
}

function isValidSpeedKmh(speedKmh: number): boolean {
    return Number.isFinite(speedKmh) && speedKmh >= MIN_SPEED_KMH && speedKmh <= MAX_SPEED_KMH;
}

function calculateBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const toDeg = (v: number) => (v * 180) / Math.PI;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δλ = toRad(lon2 - lon1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return (toDeg(θ) + 360) % 360;
}

function computeSpeedFromCache(
    cacheKey: string,
    lat: number,
    lon: number,
    timestampSec: number
): { speedMps?: number; reliable: boolean; bearingDeg?: number } {
    const history = vehicleCache.get(cacheKey);
    if (!history || history.length === 0) return { reliable: false };

    // assemble a list of valid segments between consecutive snapshots including the new point
    const points: VehicleSnapshot[] = [...history, { lat, lon, timestampSec }];

    let totalDistance = 0;
    let totalTime = 0;
    const bearings: { bearing: number; weight: number }[] = [];

    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const dt = b.timestampSec - a.timestampSec;
        if (dt <= 0) continue;
        if (dt > MAX_TIME_DELTA_SECONDS) continue;
        const dist = haversineMeters(a.lat, a.lon, b.lat, b.lon);
        if (dist > MAX_JUMP_METERS) continue;
        totalDistance += dist;
        totalTime += dt;
        const segBearing = calculateBearingDeg(a.lat, a.lon, b.lat, b.lon);
        bearings.push({ bearing: segBearing, weight: dist });
    }
    // determine whether the computed speed should be considered reliable
    const reliable = totalTime >= MIN_TIME_DELTA_SECONDS && totalTime <= MAX_TOTAL_TIME_SECONDS;

    const speedMps = totalTime > 0 ? totalDistance / totalTime : undefined;

    // compute weighted circular mean of bearings when we have good segments
    let bearingDeg: number | undefined;
    if (bearings.length > 0) {
        let x = 0;
        let y = 0;
        for (const b of bearings) {
            const rad = (b.bearing * Math.PI) / 180;
            x += Math.cos(rad) * b.weight;
            y += Math.sin(rad) * b.weight;
        }
        const avgRad = Math.atan2(y, x);
        bearingDeg = (avgRad * 180) / Math.PI;
        bearingDeg = (bearingDeg + 360) % 360;
    } else {
        // fallback: if we couldn't build valid recent segments, try a simple bearing
        // from the last known snapshot to the current point even if dt or dist
        // exceed the normal thresholds. This gives a best-effort direction when
        // the feed doesn't provide directionId.
        if (points.length >= 2) {
            const a = points[points.length - 2];
            const b = points[points.length - 1];
            const dt = b.timestampSec - a.timestampSec;
            const dist = haversineMeters(a.lat, a.lon, b.lat, b.lon);
            if (dt > 0 && dist > 0) {
                bearingDeg = calculateBearingDeg(a.lat, a.lon, b.lat, b.lon);
                bearingDeg = (bearingDeg + 360) % 360;
            }
        }
    }

    return { speedMps, reliable, bearingDeg };
}

function pickSpeedMps(reportedMps?: number, computed?: { speedMps?: number; reliable: boolean }): number | undefined {
    if (reportedMps !== undefined && Number.isFinite(reportedMps)) {
        const reportedKmh = reportedMps * 3.6;
        if (isValidSpeedKmh(reportedKmh)) {
            return reportedMps;
        }
    }

    if (computed?.reliable && computed.speedMps !== undefined) {
        const computedKmh = computed.speedMps * 3.6;
        if (isValidSpeedKmh(computedKmh)) {
            return computed.speedMps;
        }
    }

    return undefined;
}

// (Direction helper functions removed.)

function formatRouteVariant(
    routeId: string,
    routeShortName: string,
    directionId?: number | null,
    _bearing?: number | null
): { variantKey: string; routeNumber: string; directionLabel?: string } {
    // Do NOT infer or guess direction for display. Only use an explicit
    // directionId coming from the GTFS feed to alter the visible route
    // number. This ensures the UI never displays a guessed direction.
    if (directionId === 0) {
        const letter = 'N';
        return { variantKey: `${routeId}:${letter}`, routeNumber: `${routeShortName}${letter}`, directionLabel: 'Northbound' };
    }
    if (directionId === 1) {
        const letter = 'S';
        return { variantKey: `${routeId}:${letter}`, routeNumber: `${routeShortName}${letter}`, directionLabel: 'Southbound' };
    }

    // Unknown/unspecified direction: keep the short name unchanged and use a
    // generic variant key. We intentionally ignore any computed bearing here.
    return { variantKey: `${routeId}:U`, routeNumber: routeShortName };
}

async function getRouteMap(): Promise<Record<string, { shortName: string; longName: string }>> {
    const now = Date.now();
    if (Object.keys(routeMapCache).length > 0 && now - routeMapFetchedAt < ROUTE_MAP_TTL_MS) {
        return routeMapCache;
    }
    try {
        const response = await fetch(GTFS_STATIC_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch GTFS static data: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const zip = new AdmZip(buffer);
        const routesEntry = zip.getEntry('routes.txt');

        if (!routesEntry) {
            throw new Error('routes.txt not found in GTFS static feed');
        }

        const routesCsv = routesEntry.getData().toString('utf-8');
        const records: Array<Record<string, string>> = parse(routesCsv, {
            columns: true,
            skip_empty_lines: true,
        });

        const map: Record<string, { shortName: string; longName: string }> = {};
        for (const record of records) {
            const routeId = record.route_id?.trim();
            if (!routeId) continue;
            const shortName = record.route_short_name?.trim() || routeId;
            const longName = record.route_long_name?.trim() || shortName;
            map[routeId] = { shortName, longName };
        }

        routeMapCache = map;
        routeMapFetchedAt = now;
        return routeMapCache;
    } catch (error) {
        console.warn('Failed to load GTFS static route map:', error);
        return routeMapCache;
    }
}

export interface MiwayLeaderboardEntry {
    routeNumber: string;
    routeName: string;
    speed: number;
    vehicleCount: number;
}

export interface FeedSummary {
    entityCount: number;
    updatedAt?: string;
    sample: Array<Record<string, string | number | null>>;
}

export interface MiwayVehicle {
    id: string;
    label?: string | null;
    routeId: string;
    routeNumber: string;
    routeName: string;
    latitude: number;
    longitude: number;
    bearing?: number | null;
    speedKmh: number;
    timestamp?: number;
    status: 'moving' | 'stopped';
}

export interface MiwayVehicleResponse {
    updatedAt?: string;
    stats: {
        total: number;
        moving: number;
        stopped: number;
        averageSpeed: number;
    };
    vehicles: MiwayVehicle[];
}

export async function getMiwayLeaderboard(): Promise<MiwayLeaderboardEntry[]> {
    const response = await fetch(GTFS_RT_VEHICLES_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch MiWay vehicle data: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    const routeMap = await getRouteMap();

    const entities = feed.entity ?? [];

    const nowSec = Math.floor(Date.now() / 1000);
    for (const [id, snapshots] of vehicleCache) {
        const last = snapshots?.[snapshots.length - 1];
        if (!last || nowSec - last.timestampSec > VEHICLE_CACHE_TTL_SEC) {
            vehicleCache.delete(id);
        }
    }

    const routeSpeeds: Record<string, number[]> = {};
    const routeMeta: Record<string, { routeNumber: string; routeName: string }> = {};

    for (const entity of entities) {
        const vehicle = entity.vehicle;
        if (!vehicle) continue;

        const routeId = vehicle.trip?.routeId;
        const position = vehicle.position;
        const reportedSpeedMps = typeof position?.speed === 'number' ? position.speed : undefined;
        const vehicleId = vehicle.vehicle?.id ?? entity.id;
        const timestampSeconds = normalizeTimestampSec(vehicle.timestamp);
        const directionId = vehicle.trip?.directionId ?? null;

        if (!routeId || !position || position.latitude === undefined || position.longitude === undefined) {
            continue;
        }

        const cacheKey = vehicleId ? `${routeId}:${vehicleId}` : undefined;
        const computed = cacheKey && timestampSeconds
            ? computeSpeedFromCache(cacheKey, position.latitude, position.longitude, timestampSeconds)
            : { reliable: false };

        const resolvedSpeedMps = pickSpeedMps(reportedSpeedMps, computed);

        if (cacheKey && timestampSeconds) {
            const hist = vehicleCache.get(cacheKey) ?? [];
            hist.push({ lat: position.latitude, lon: position.longitude, timestampSec: timestampSeconds });
            // keep only the last N samples
            if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
            vehicleCache.set(cacheKey, hist);
        }

        if (resolvedSpeedMps === undefined) {
            continue;
        }

        const speedKmH = resolvedSpeedMps * 3.6;

        const routeNames = routeMap[routeId];
        // prefer computed bearing, fall back to reported position bearing, then to a best-effort
        // bearing derived from the cache (last two snapshots) when available.
        // compute a best-effort bearing for internal use (not for display)
        // prefer computed, then reported position bearing, then cache-derived.
        let finalBearing: number | null = (computed as any)?.bearingDeg ?? position.bearing ?? null;
        if (finalBearing === null || finalBearing === undefined) {
            const hist = cacheKey ? vehicleCache.get(cacheKey) : undefined;
            if (hist && hist.length >= 2) {
                const a = hist[hist.length - 2];
                const b = hist[hist.length - 1];
                if (a && b && (a.lat !== b.lat || a.lon !== b.lon)) {
                    finalBearing = calculateBearingDeg(a.lat, a.lon, b.lat, b.lon);
                }
            }
        }
        // For display we must not guess direction. Only use feed-provided
        // directionId to alter the visible route number. Do not infer a
        // displayed direction from a computed bearing.
        const variant = formatRouteVariant(routeId, routeNames?.shortName || routeId, directionId, undefined);

        if (!routeSpeeds[variant.variantKey]) {
            routeSpeeds[variant.variantKey] = [];
            routeMeta[variant.variantKey] = {
                routeNumber: variant.routeNumber,
                routeName: routeNames?.longName || `Route ${routeId}`,
            };
        }

        routeSpeeds[variant.variantKey].push(speedKmH);
    }

    return Object.entries(routeSpeeds)
        .filter(([, speeds]) => speeds.length > 0)
        .map(([variantKey, speeds]) => {
            const sorted = [...speeds].sort((a, b) => a - b);
            let trimmed = sorted;
            if (sorted.length >= 6) {
                const trimCount = Math.max(1, Math.floor(sorted.length * 0.15));
                trimmed = sorted.slice(trimCount, sorted.length - trimCount);
            }
            const sum = trimmed.reduce((acc, val) => acc + val, 0);
            const speedKmh = parseFloat((sum / trimmed.length).toFixed(1));
            const routeInfo = routeMeta[variantKey];

            return {
                routeNumber: routeInfo?.routeNumber || variantKey,
                routeName: routeInfo?.routeName || 'Route',
                speed: speedKmh,
                vehicleCount: speeds.length,
            };
        })
        .sort((a, b) => b.speed - a.speed);
}

async function fetchFeed(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch feed: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
}

export async function getVehiclePositions(): Promise<MiwayVehicleResponse> {
    const feed = await fetchFeed(GTFS_RT_VEHICLES_URL);
    const routeMap = await getRouteMap();
    const entities = feed.entity ?? [];

    const vehicles: MiwayVehicle[] = [];
    let totalSpeed = 0;
    let moving = 0;
    let stopped = 0;

    const nowSec = Math.floor(Date.now() / 1000);
    for (const [id, snapshots] of vehicleCache) {
        const last = snapshots?.[snapshots.length - 1];
        if (!last || nowSec - last.timestampSec > VEHICLE_CACHE_TTL_SEC) {
            vehicleCache.delete(id);
        }
    }

    for (const entity of entities) {
        const vehicle = entity.vehicle;
        if (!vehicle) continue;

        const routeId = vehicle.trip?.routeId;
        const position = vehicle.position;
        const reportedSpeedMps = typeof position?.speed === 'number' ? position.speed : undefined;
        const timestampSeconds = normalizeTimestampSec(vehicle.timestamp);
        const directionId = vehicle.trip?.directionId ?? null;

        if (!routeId || !position || position.latitude === undefined || position.longitude === undefined) {
            continue;
        }

        const vehicleId = vehicle.vehicle?.id ?? entity.id ?? `${routeId}-${position.latitude}-${position.longitude}`;

        const cacheKey = `${routeId}:${vehicleId}`;
        const computed = timestampSeconds
            ? computeSpeedFromCache(cacheKey, position.latitude, position.longitude, timestampSeconds)
            : { reliable: false };

        const resolvedSpeedMps = pickSpeedMps(reportedSpeedMps, computed);

        if (timestampSeconds) {
            const hist = vehicleCache.get(cacheKey) ?? [];
            hist.push({ lat: position.latitude, lon: position.longitude, timestampSec: timestampSeconds });
            if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
            vehicleCache.set(cacheKey, hist);
        }

        if (resolvedSpeedMps === undefined) {
            continue;
        }

        const speedKmh = resolvedSpeedMps * 3.6;
        if (!isValidSpeedKmh(speedKmh)) {
            continue;
        }
        const routeNames = routeMap[routeId];
        let finalBearing: number | null = (computed as any)?.bearingDeg ?? position.bearing ?? null;
        if (finalBearing === null || finalBearing === undefined) {
            const hist = vehicleCache.get(cacheKey);
            if (hist && hist.length >= 2) {
                const a = hist[hist.length - 2];
                const b = hist[hist.length - 1];
                if (a && b && (a.lat !== b.lat || a.lon !== b.lon)) {
                    finalBearing = calculateBearingDeg(a.lat, a.lon, b.lat, b.lon);
                }
            }
        }
        const variant = formatRouteVariant(routeId, routeNames?.shortName || routeId, directionId, finalBearing ?? null);
        const status = speedKmh >= 2 ? 'moving' : 'stopped';

        if (status === 'moving') {
            moving += 1;
        } else {
            stopped += 1;
        }

        totalSpeed += speedKmh;
        vehicles.push({
            id: vehicleId,
            label: vehicle.vehicle?.label ?? null,
            routeId,
            routeNumber: variant.routeNumber,
            routeName: routeNames?.longName || `Route ${routeId}`,
            latitude: position.latitude,
            longitude: position.longitude,
            // prefer the computed/final bearing so consumers of this API see the
            // inferred compass direction when available
            bearing: finalBearing ?? null,
            speedKmh: Number.parseFloat(speedKmh.toFixed(1)),
            timestamp: timestampSeconds,
            status,
        });
    }

    const averageSpeed = vehicles.length > 0 ? totalSpeed / vehicles.length : 0;

    const headerTimestamp = normalizeTimestampSec(feed.header?.timestamp);

    return {
        updatedAt: headerTimestamp ? new Date(headerTimestamp * 1000).toISOString() : undefined,
        stats: {
            total: vehicles.length,
            moving,
            stopped,
            averageSpeed: Number.parseFloat(averageSpeed.toFixed(1)),
        },
        vehicles,
    };
}

export async function getTripUpdatesSummary(): Promise<FeedSummary> {
    const feed = await fetchFeed(GTFS_RT_TRIP_UPDATES_URL);
    const entities = feed.entity ?? [];
    const headerTimestamp = normalizeTimestampSec(feed.header?.timestamp);

    const sample = entities
        .filter((entity) => entity.tripUpdate)
        .slice(0, 5)
        .map((entity) => {
            const trip = entity.tripUpdate?.trip;
            return {
                tripId: trip?.tripId ?? null,
                routeId: trip?.routeId ?? null,
                stopUpdates: entity.tripUpdate?.stopTimeUpdate?.length ?? 0,
            };
        });

    return {
        entityCount: entities.length,
        updatedAt: headerTimestamp ? new Date(headerTimestamp * 1000).toISOString() : undefined,
        sample,
    };
}

export async function getAlertsSummary(): Promise<FeedSummary> {
    const feed = await fetchFeed(GTFS_RT_ALERTS_URL);
    const entities = feed.entity ?? [];
    const headerTimestamp = normalizeTimestampSec(feed.header?.timestamp);

    const sample = entities
        .filter((entity) => entity.alert)
        .slice(0, 5)
        .map((entity) => {
            const alert = entity.alert;
            const header = alert?.headerText?.translation?.[0]?.text ?? null;
            const effect = alert?.effect ?? null;
            return {
                header,
                effect,
            };
        });

    return {
        entityCount: entities.length,
        updatedAt: headerTimestamp ? new Date(headerTimestamp * 1000).toISOString() : undefined,
        sample,
    };
}

// Load shape data from GTFS static feed
async function loadShapeData(): Promise<void> {
    const now = Date.now();
    if (Object.keys(shapeCache).length > 0 && now - shapeCacheFetchedAt < SHAPE_CACHE_TTL_MS) {
        return;
    }

    try {
        const response = await fetch(GTFS_STATIC_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch GTFS static data: ${response.status}`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const zip = new AdmZip(buffer);

        // Parse shapes.txt
        const shapesEntry = zip.getEntry('shapes.txt');
        if (shapesEntry) {
            const shapesCsv = shapesEntry.getData().toString('utf-8');
            const shapeRecords: Array<Record<string, string>> = parse(shapesCsv, {
                columns: true,
                skip_empty_lines: true,
            });

            const shapesMap: Record<string, { seq: number; lat: number; lon: number }[]> = {};
            for (const record of shapeRecords) {
                const shapeId = record.shape_id?.trim();
                const lat = parseFloat(record.shape_pt_lat);
                const lon = parseFloat(record.shape_pt_lon);
                const seq = parseInt(record.shape_pt_sequence, 10);

                if (!shapeId || isNaN(lat) || isNaN(lon) || isNaN(seq)) continue;

                if (!shapesMap[shapeId]) {
                    shapesMap[shapeId] = [];
                }
                shapesMap[shapeId].push({ seq, lat, lon });
            }

            // Sort by sequence and convert to coordinate arrays
            for (const [shapeId, points] of Object.entries(shapesMap)) {
                points.sort((a, b) => a.seq - b.seq);
                shapeCache[shapeId] = points.map(p => [p.lon, p.lat]);
            }
        }

        // Parse trips.txt to map routeId -> shapeId
        const tripsEntry = zip.getEntry('trips.txt');
        if (tripsEntry) {
            const tripsCsv = tripsEntry.getData().toString('utf-8');
            const tripRecords: Array<Record<string, string>> = parse(tripsCsv, {
                columns: true,
                skip_empty_lines: true,
            });

            for (const record of tripRecords) {
                const routeId = record.route_id?.trim();
                const shapeId = record.shape_id?.trim();

                if (routeId && shapeId && !routeToShapeCache[routeId]) {
                    routeToShapeCache[routeId] = shapeId;
                }
            }
        }

        // Build reverse map from route short name -> route_id(s) so we can
        // resolve requests that pass the short name instead of GTFS route_id.
        try {
            const routeMap = await getRouteMap();
            routeShortNameToRouteIds = {};
            for (const [rId, meta] of Object.entries(routeMap)) {
                const short = (meta.shortName || '').toUpperCase();
                if (!short) continue;
                if (!routeShortNameToRouteIds[short]) routeShortNameToRouteIds[short] = [];
                routeShortNameToRouteIds[short].push(rId);
            }

            // Also build entries for base numbers without trailing letter (eg. 5N -> 5)
            const additions: Record<string, string[]> = {};
            for (const short of Object.keys(routeShortNameToRouteIds)) {
                const base = short.replace(/[A-Z]$/, '');
                if (base && base !== short) {
                    additions[base] = (additions[base] || []).concat(routeShortNameToRouteIds[short]);
                }
            }
            for (const k of Object.keys(additions)) {
                routeShortNameToRouteIds[k] = (routeShortNameToRouteIds[k] || []).concat(additions[k]);
            }
        } catch (e) {
            // ignore failures to build short-name map
        }

        shapeCacheFetchedAt = now;
    } catch (error) {
        console.warn('Failed to load GTFS shape data:', error);
    }
}

export interface RouteShapeResponse {
    routeId: string;
    shapeId?: string;
    coordinates: [number, number][];
}

export async function getRouteShape(routeId: string): Promise<RouteShapeResponse> {
    await loadShapeData();

    // Try direct lookup first (routeId is the GTFS route_id)
    let shapeId = routeToShapeCache[routeId];

    // If not found, the feed may be using the route short name (eg. "5", "101A")
    // instead of the internal GTFS route_id. Try to resolve the short name to
    // a route_id using the static routes.txt mapping.
    if (!shapeId) {
        try {
            const key = routeId.toUpperCase();
            // Direct short-name mapping (eg. "5", "101A")
            const routeIds = routeShortNameToRouteIds[key];
            if (routeIds && routeIds.length > 0) {
                // Prefer the first matching route_id that has a shape mapping
                for (const rid of routeIds) {
                    if (routeToShapeCache[rid]) {
                        shapeId = routeToShapeCache[rid];
                        break;
                    }
                }
            }

            // If still not found, try stripping a trailing letter and retry
            if (!shapeId) {
                const baseKey = key.replace(/[A-Z]$/, '');
                const baseRouteIds = routeShortNameToRouteIds[baseKey];
                if (baseRouteIds && baseRouteIds.length > 0) {
                    for (const rid of baseRouteIds) {
                        if (routeToShapeCache[rid]) {
                            shapeId = routeToShapeCache[rid];
                            break;
                        }
                    }
                }
            }
        } catch (e) {
            // ignore errors and fall through to empty coordinates
        }
    }

    const coordinates = shapeId ? shapeCache[shapeId] ?? [] : [];

    return {
        routeId,
        shapeId,
        coordinates,
    };
}

export async function getRouteShapes(): Promise<Record<string, [number, number][]>> {
    await loadShapeData();
    
    const result: Record<string, [number, number][]> = {};
    for (const [routeId, shapeId] of Object.entries(routeToShapeCache)) {
        if (shapeCache[shapeId]) {
            result[routeId] = shapeCache[shapeId];
        }
    }
    return result;
}
