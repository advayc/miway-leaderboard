import { memo } from 'react';
import { Map, MapMarker, MarkerContent, MarkerTooltip, MapRoute, MapControls } from '@/components/ui/map';

interface Vehicle {
  id: string;
  label?: string | null;
  routeNumber: string;
  routeName: string;
  latitude: number;
  longitude: number;
  bearing?: number | null;
  speedKmh: number;
  status: 'moving' | 'stopped';
}

interface RouteStop {
  name: string;
  lat: number;
  lon: number;
}

interface RouteShape {
  routeId: string;
  shapeId?: string;
  coordinates: [number, number][];
  stops?: RouteStop[];
}

interface ModalMapProps {
  vehicle: Vehicle;
  routeShape: RouteShape | null;
}

// Default landmarks - Mississauga City Centre and GO Transit terminals
const DEFAULT_LANDMARKS = [
  { name: 'Mississauga City Centre', lat: 43.5931, lon: -79.6424, type: 'city' },
  { name: 'Square One Bus Terminal', lat: 43.5934, lon: -79.6426, type: 'terminal' },
  { name: 'Port Credit GO', lat: 43.5505, lon: -79.5864, type: 'go' },
  { name: 'Clarkson GO', lat: 43.5115, lon: -79.6375, type: 'go' },
  { name: 'Cooksville GO', lat: 43.5830, lon: -79.6262, type: 'go' },
  { name: 'Dixie GO', lat: 43.5879, lon: -79.5657, type: 'go' },
  { name: 'Meadowvale GO', lat: 43.6172, lon: -79.7147, type: 'go' },
  { name: 'Streetsville GO', lat: 43.5817, lon: -79.7117, type: 'go' },
  { name: 'Erindale GO', lat: 43.5477, lon: -79.6585, type: 'go' },
  { name: 'Kipling Station', lat: 43.6373, lon: -79.5364, type: 'terminal' },
];

// Generate sample stops along the route if none provided
function generateStopsFromCoordinates(coordinates: [number, number][], routeName: string): RouteStop[] {
  if (coordinates.length < 2) return [];
  
  const stops: RouteStop[] = [];
  const numStops = Math.min(8, Math.max(3, Math.floor(coordinates.length / 10)));
  const step = Math.floor(coordinates.length / (numStops + 1));
  
  for (let i = 1; i <= numStops; i++) {
    const idx = Math.min(i * step, coordinates.length - 1);
    const coord = coordinates[idx];
    stops.push({
      name: i === 1 ? `${routeName} - Start` : 
            i === numStops ? `${routeName} - End` : 
            `Stop ${i}`,
      lon: coord[0],
      lat: coord[1]
    });
  }
  
  return stops;
}

const ModalMap = memo(function ModalMap({ vehicle, routeShape }: ModalMapProps) {
  // Get stops from route shape or generate from coordinates
  const stops = routeShape?.stops || 
    (routeShape?.coordinates ? generateStopsFromCoordinates(routeShape.coordinates, vehicle.routeName) : []);

  return (
    <Map 
      center={[vehicle.longitude, vehicle.latitude]} 
      zoom={13}
      className="h-full w-full"
    >
      <MapControls position="bottom-right" showZoom showLocate showCompass />
      {/* Route path */}
      {routeShape && routeShape.coordinates.length > 0 && (
        <MapRoute
          coordinates={routeShape.coordinates}
          color="#f05a28"
          width={4}
          opacity={0.7}
        />
      )}

      {/* Default landmarks - City Centre and GO terminals */}
      {DEFAULT_LANDMARKS.map((landmark) => (
        <MapMarker
          key={landmark.name}
          longitude={landmark.lon}
          latitude={landmark.lat}
        >
          <MarkerContent>
            <div className={`landmark-marker ${landmark.type}`}>
              {landmark.type === 'go' ? 'GO' : landmark.type === 'city' ? 'CC' : 'T'}
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="landmark-tooltip">
              <strong>{landmark.name}</strong>
            </div>
          </MarkerTooltip>
        </MapMarker>
      ))}
      
      {/* Route stops */}
      {stops.map((stop, index) => (
        <MapMarker
          key={`stop-${index}`}
          longitude={stop.lon}
          latitude={stop.lat}
        >
          <MarkerContent>
            <div className="stop-marker">
              <span className="stop-number">{index + 1}</span>
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="stop-tooltip">
              <strong>Stop {index + 1}</strong>
              <br />
              {stop.name}
            </div>
          </MarkerTooltip>
        </MapMarker>
      ))}

      {/* Bus marker */}
      <MapMarker
        longitude={vehicle.longitude}
        latitude={vehicle.latitude}
        rotation={vehicle.bearing ?? 0}
      >
        <MarkerContent>
          <div className={`bus-marker large ${vehicle.status}`}>
            <span className="bus-marker-label">{vehicle.routeNumber}</span>
          </div>
        </MarkerContent>
        <MarkerTooltip>
          <div className="bus-tooltip">
            <strong>{vehicle.routeNumber}</strong> - {vehicle.routeName}
            <br />
            {vehicle.speedKmh} km/h · {vehicle.status === 'moving' ? 'Active' : 'Stopped'}
          </div>
        </MarkerTooltip>
      </MapMarker>
    </Map>
  );
});

export default ModalMap;
