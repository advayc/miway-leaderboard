import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GTFS_STATIC_URL = 'https://www.miapp.ca/GTFS/google_transit.zip';

interface RouteShape {
    routeId: string;
    routeShortName: string;
    routeLongName: string;
    shapeId: string;
    coordinates: [number, number][];
}

interface RouteMap {
    [routeId: string]: {
        shortName: string;
        longName: string;
    };
}

async function buildRouteShapes() {
    console.log('📦 Downloading GTFS static feed...');
    const response = await fetch(GTFS_STATIC_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch GTFS static data: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const zip = new AdmZip(buffer);

    console.log('📋 Parsing routes.txt...');
    const routesEntry = zip.getEntry('routes.txt');
    const routeMap: RouteMap = {};
    
    if (routesEntry) {
        const routesCsv = routesEntry.getData().toString('utf-8');
        const routeRecords: Array<Record<string, string>> = parse(routesCsv, {
            columns: true,
            skip_empty_lines: true,
        });

        for (const record of routeRecords) {
            const routeId = record.route_id?.trim();
            const shortName = record.route_short_name?.trim();
            const longName = record.route_long_name?.trim();

            if (routeId) {
                routeMap[routeId] = {
                    shortName: shortName || '',
                    longName: longName || '',
                };
            }
        }
    }

    console.log('🗺️  Parsing shapes.txt...');
    const shapesEntry = zip.getEntry('shapes.txt');
    const shapesMap: Record<string, { seq: number; lat: number; lon: number }[]> = {};
    
    if (shapesEntry) {
        const shapesCsv = shapesEntry.getData().toString('utf-8');
        const shapeRecords: Array<Record<string, string>> = parse(shapesCsv, {
            columns: true,
            skip_empty_lines: true,
        });

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
    }

    // Sort and convert to coordinate arrays
    const shapeCache: Record<string, [number, number][]> = {};
    for (const [shapeId, points] of Object.entries(shapesMap)) {
        points.sort((a, b) => a.seq - b.seq);
        shapeCache[shapeId] = points.map(p => [p.lon, p.lat]);
    }

    console.log('🚌 Parsing trips.txt...');
    const tripsEntry = zip.getEntry('trips.txt');
    const routeToShapeMap: Record<string, string> = {};
    
    if (tripsEntry) {
        const tripsCsv = tripsEntry.getData().toString('utf-8');
        const tripRecords: Array<Record<string, string>> = parse(tripsCsv, {
            columns: true,
            skip_empty_lines: true,
        });

        for (const record of tripRecords) {
            const routeId = record.route_id?.trim();
            const shapeId = record.shape_id?.trim();

            if (routeId && shapeId && !routeToShapeMap[routeId]) {
                routeToShapeMap[routeId] = shapeId;
            }
        }
    }

    console.log('🔗 Building route shapes...');
    const routeShapes: RouteShape[] = [];
    const routeShortNameIndex: Record<string, RouteShape> = {};

    for (const [routeId, shapeId] of Object.entries(routeToShapeMap)) {
        const coordinates = shapeCache[shapeId];
        if (!coordinates || coordinates.length === 0) continue;

        const routeInfo = routeMap[routeId];
        const routeShape: RouteShape = {
            routeId,
            routeShortName: routeInfo?.shortName || routeId,
            routeLongName: routeInfo?.longName || '',
            shapeId,
            coordinates,
        };

        routeShapes.push(routeShape);

        // Build short name index (e.g., "5", "26N")
        if (routeInfo?.shortName) {
            const shortName = routeInfo.shortName.toUpperCase();
            routeShortNameIndex[shortName] = routeShape;

            // Also index base number without trailing letter (e.g., "26N" -> "26")
            const baseNumber = shortName.replace(/[A-Z]$/, '');
            if (baseNumber && baseNumber !== shortName && !routeShortNameIndex[baseNumber]) {
                routeShortNameIndex[baseNumber] = routeShape;
            }
        }
    }

    console.log(`✅ Generated ${routeShapes.length} route shapes`);

    // Write to file
    const outputData = {
        generatedAt: new Date().toISOString(),
        routeCount: routeShapes.length,
        routes: routeShapes,
        index: routeShortNameIndex,
    };

    const outputDir = join(__dirname, '..', 'src', 'data');
    mkdirSync(outputDir, { recursive: true });
    
    const outputPath = join(outputDir, 'route-shapes.json');
    writeFileSync(outputPath, JSON.stringify(outputData, null, 2));

    console.log(`💾 Saved to ${outputPath}`);
    console.log(`📊 File size: ${(Buffer.byteLength(JSON.stringify(outputData)) / 1024 / 1024).toFixed(2)} MB`);
}

buildRouteShapes().catch((error) => {
    console.error('❌ Error building route shapes:', error);
    process.exit(1);
});
