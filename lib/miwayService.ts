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

type VehicleSnapshot = {
    lat: number;
    lon: number;
    timestampSec: number;
};

const vehicleCache = new Map<string, VehicleSnapshot>();
const VEHICLE_CACHE_TTL_SEC = 300;

const MIN_SPEED_KMH = 1;
const MAX_SPEED_KMH = 75;
const MIN_TIME_DELTA_SECONDS = 8;
const MAX_TIME_DELTA_SECONDS = 120;
const MAX_JUMP_METERS = 600;

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

function computeSpeedFromCache(
    cacheKey: string,
    lat: number,
    lon: number,
    timestampSec: number
): { speedMps?: number; reliable: boolean } {
    const previous = vehicleCache.get(cacheKey);
    if (!previous) {
        return { reliable: false };
    }

    const timeDeltaSeconds = timestampSec - previous.timestampSec;
    if (timeDeltaSeconds < MIN_TIME_DELTA_SECONDS || timeDeltaSeconds > MAX_TIME_DELTA_SECONDS) {
        return { reliable: false };
    }

    const distanceMeters = haversineMeters(previous.lat, previous.lon, lat, lon);
    if (distanceMeters > MAX_JUMP_METERS) {
        return { reliable: false };
    }

    return { speedMps: distanceMeters / timeDeltaSeconds, reliable: true };
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

function bearingToLetter(bearing: number): 'N' | 'E' | 'S' | 'W' {
    const deg = ((bearing % 360) + 360) % 360;
    if (deg >= 45 && deg < 135) return 'E';
    if (deg >= 135 && deg < 225) return 'S';
    if (deg >= 225 && deg < 315) return 'W';
    return 'N';
}

function bearingToLabel(letter: string): string {
    switch (letter) {
        case 'N': return 'Northbound';
        case 'S': return 'Southbound';
        case 'E': return 'Eastbound';
        case 'W': return 'Westbound';
        default: return 'Unknown';
    }
}

function formatRouteVariant(
    routeId: string,
    routeShortName: string,
    directionId?: number | null,
    bearing?: number | null
): { variantKey: string; routeNumber: string; directionLabel?: string } {
    if (directionId === 0) {
        return { variantKey: `${routeId}:N`, routeNumber: `${routeShortName}N`, directionLabel: 'Northbound' };
    }
    if (directionId === 1) {
        return { variantKey: `${routeId}:S`, routeNumber: `${routeShortName}S`, directionLabel: 'Southbound' };
    }

    if (typeof bearing === 'number' && Number.isFinite(bearing)) {
        const letter = bearingToLetter(bearing);
        return { variantKey: `${routeId}:${letter}`, routeNumber: `${routeShortName}${letter}`, directionLabel: bearingToLabel(letter) };
    }

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
    for (const [id, snapshot] of vehicleCache) {
        if (nowSec - snapshot.timestampSec > VEHICLE_CACHE_TTL_SEC) {
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
            vehicleCache.set(cacheKey, {
                lat: position.latitude,
                lon: position.longitude,
                timestampSec: timestampSeconds,
            });
        }

        if (resolvedSpeedMps === undefined) {
            continue;
        }

        const speedKmH = resolvedSpeedMps * 3.6;

        const routeNames = routeMap[routeId];
        const variant = formatRouteVariant(routeId, routeNames?.shortName || routeId, directionId, position.bearing ?? null);

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
    for (const [id, snapshot] of vehicleCache) {
        if (nowSec - snapshot.timestampSec > VEHICLE_CACHE_TTL_SEC) {
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
            vehicleCache.set(cacheKey, {
                lat: position.latitude,
                lon: position.longitude,
                timestampSec: timestampSeconds,
            });
        }

        if (resolvedSpeedMps === undefined) {
            continue;
        }

        const speedKmh = resolvedSpeedMps * 3.6;
        if (!isValidSpeedKmh(speedKmh)) {
            continue;
        }
        const routeNames = routeMap[routeId];
        const variant = formatRouteVariant(routeId, routeNames?.shortName || routeId, directionId, position.bearing ?? null);
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
            bearing: position.bearing ?? null,
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
