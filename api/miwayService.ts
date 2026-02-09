import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';

const GTFS_RT_VEHICLES_URL = 'https://www.miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb';
const GTFS_STATIC_URL = 'https://www.miapp.ca/GTFS/google_transit.zip';

let routeMapCache: Record<string, { shortName: string; longName: string }> = {};
let routeMapFetchedAt = 0;
const ROUTE_MAP_TTL_MS = 1000 * 60 * 60 * 12;

type VehicleSnapshot = {
    lat: number;
    lon: number;
    timestamp: number;
};

const vehicleCache = new Map<string, VehicleSnapshot>();
const VEHICLE_CACHE_TTL_MS = 1000 * 60 * 5;

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

function normalizeTimestamp(timestamp?: number | { toNumber?: () => number } | null): number | undefined {
    if (timestamp === undefined || timestamp === null) return undefined;
    if (typeof timestamp === 'number') return timestamp;
    return timestamp.toNumber?.();
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
}

export async function getMiwayLeaderboard(): Promise<MiwayLeaderboardEntry[]> {
    const response = await fetch(GTFS_RT_VEHICLES_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch MiWay vehicle data: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    const routeMap = await getRouteMap();

    const routeStats: Record<string, { totalSpeed: number; count: number }> = {};

    const entities = feed.entity ?? [];

    const now = Date.now();
    for (const [id, snapshot] of vehicleCache) {
        if (now - snapshot.timestamp * 1000 > VEHICLE_CACHE_TTL_MS) {
            vehicleCache.delete(id);
        }
    }

    for (const entity of entities) {
        const vehicle = entity.vehicle;
        if (!vehicle) continue;

        const routeId = vehicle.trip?.routeId ?? vehicle.trip?.routeId;
        const position = vehicle.position;
        const speedMetersPerSecond = position?.speed;
        const vehicleId = vehicle.vehicle?.id || entity.id;
        const timestampSeconds = normalizeTimestamp(vehicle.timestamp);

        if (!routeId || !position || position.latitude === undefined || position.longitude === undefined) {
            continue;
        }

        let resolvedSpeedMetersPerSecond = speedMetersPerSecond;

        if ((!Number.isFinite(resolvedSpeedMetersPerSecond) || resolvedSpeedMetersPerSecond === undefined) && vehicleId && timestampSeconds) {
            const previous = vehicleCache.get(vehicleId);
            if (previous && timestampSeconds > previous.timestamp) {
                const distanceMeters = haversineMeters(
                    previous.lat,
                    previous.lon,
                    position.latitude,
                    position.longitude
                );
                const timeDeltaSeconds = timestampSeconds - previous.timestamp;
                if (timeDeltaSeconds > 0) {
                    resolvedSpeedMetersPerSecond = distanceMeters / timeDeltaSeconds;
                }
            }
        }

        if (vehicleId && timestampSeconds) {
            vehicleCache.set(vehicleId, {
                lat: position.latitude,
                lon: position.longitude,
                timestamp: timestampSeconds,
            });
        }

        if (!Number.isFinite(resolvedSpeedMetersPerSecond)) {
            continue;
        }

        const speedKmH = (resolvedSpeedMetersPerSecond as number) * 3.6;

        if (!routeStats[routeId]) {
            routeStats[routeId] = { totalSpeed: 0, count: 0 };
        }

        routeStats[routeId].totalSpeed += speedKmH;
        routeStats[routeId].count += 1;
    }

    return Object.entries(routeStats)
        .map(([routeId, stats]) => {
            const averageSpeed = stats.totalSpeed / stats.count;
            const routeNames = routeMap[routeId];

            return {
                routeNumber: routeNames?.shortName || routeId,
                routeName: routeNames?.longName || `Route ${routeId}`,
                speed: parseFloat(averageSpeed.toFixed(1)),
            };
        })
        .sort((a, b) => b.speed - a.speed);
}
