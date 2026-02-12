import { memo, useMemo, useRef, useEffect, useState } from 'react';
import { Map, MapMarker, MarkerContent, MapControls, MarkerTooltip } from '@/components/ui/map';

interface Vehicle {
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

interface AnimatedPosition {
  lat: number;
  lon: number;
  bearing: number;
}

interface MapViewProps {
  vehicles: Vehicle[];
  center: [number, number];
  onSelectBus: (vehicle: Vehicle) => void;
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

// Animated marker that smoothly transitions to new positions
function AnimatedBusMarker({ 
  vehicle, 
  onSelect 
}: { 
  vehicle: Vehicle; 
  onSelect: () => void;
}) {
  const [position, setPosition] = useState<AnimatedPosition>({
    lat: vehicle.latitude,
    lon: vehicle.longitude,
    bearing: vehicle.bearing ?? 0
  });
  
  const animationRef = useRef<number | null>(null);
  const targetRef = useRef({ lat: vehicle.latitude, lon: vehicle.longitude, bearing: vehicle.bearing ?? 0 });

  useEffect(() => {
    const target = { 
      lat: vehicle.latitude, 
      lon: vehicle.longitude, 
      bearing: vehicle.bearing ?? 0 
    };
    targetRef.current = target;

    // Animate to new position
    const startPos = { ...position };
    const startTime = performance.now();
    const duration = 800; // 800ms animation

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const newLat = startPos.lat + (target.lat - startPos.lat) * eased;
      const newLon = startPos.lon + (target.lon - startPos.lon) * eased;
      
      // Handle bearing interpolation (shortest path)
      let bearingDiff = target.bearing - startPos.bearing;
      if (bearingDiff > 180) bearingDiff -= 360;
      if (bearingDiff < -180) bearingDiff += 360;
      const newBearing = startPos.bearing + bearingDiff * eased;
      
      setPosition({ lat: newLat, lon: newLon, bearing: newBearing });
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [vehicle.latitude, vehicle.longitude, vehicle.bearing]);

  return (
    <MapMarker
      longitude={position.lon}
      latitude={position.lat}
      rotation={position.bearing}
      onClick={onSelect}
    >
      <MarkerContent>
        <div 
          className={`bus-marker ${vehicle.status}`}
          style={{
            transform: position.bearing ? `rotate(${position.bearing}deg)` : undefined
          }}
        >
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
  );
}

// Cluster nearby markers for better performance
function clusterVehicles(vehicles: Vehicle[], zoom: number): (Vehicle | { clusterId: string; count: number; lat: number; lon: number; vehicles: Vehicle[] })[] {
  // Only cluster when zoomed out (zoom < 13)
  if (zoom >= 13 || vehicles.length < 50) {
    return vehicles;
  }

  // Grid-based clustering
  const gridSize = zoom < 11 ? 0.02 : 0.01; // Larger grid for lower zoom
  const clusters: Record<string, { lat: number; lon: number; vehicles: Vehicle[] }> = {};

  vehicles.forEach(vehicle => {
    const gridX = Math.floor(vehicle.longitude / gridSize);
    const gridY = Math.floor(vehicle.latitude / gridSize);
    const key = `${gridX}_${gridY}`;

    if (!clusters[key]) {
      clusters[key] = { lat: 0, lon: 0, vehicles: [] };
    }
    clusters[key].vehicles.push(vehicle);
    clusters[key].lat += vehicle.latitude;
    clusters[key].lon += vehicle.longitude;
  });

  const result: (Vehicle | { clusterId: string; count: number; lat: number; lon: number; vehicles: Vehicle[] })[] = [];

  Object.entries(clusters).forEach(([key, cluster]) => {
    if (cluster.vehicles.length === 1) {
      result.push(cluster.vehicles[0]);
    } else {
      result.push({
        clusterId: key,
        count: cluster.vehicles.length,
        lat: cluster.lat / cluster.vehicles.length,
        lon: cluster.lon / cluster.vehicles.length,
        vehicles: cluster.vehicles
      });
    }
  });

  return result;
}

function isCluster(item: unknown): item is { clusterId: string; count: number; lat: number; lon: number; vehicles: Vehicle[] } {
  return typeof item === 'object' && item !== null && 'clusterId' in item;
}

const MapView = memo(function MapView({ vehicles, center, onSelectBus }: MapViewProps) {
  // Use a fixed zoom for clustering calculation - will be adjusted when user zooms
  const clusteredItems = useMemo(() => clusterVehicles(vehicles, 11), [vehicles]);
  
  // Track user location when they click the locate button
  const [userLocation, setUserLocation] = useState<{ longitude: number; latitude: number } | null>(null);

  return (
    <Map 
      center={center} 
      zoom={11}
      className="live-map"
      // expose rotate toggle in controls
      >
      {/* Add controls with rotate toggle enabled */}
      <MapControls position="bottom-right" showZoom showLocate showRotateToggle onLocate={setUserLocation} />
      
      {/* User location marker */}
      {userLocation && (
        <MapMarker
          longitude={userLocation.longitude}
          latitude={userLocation.latitude}
        >
          <MarkerContent>
            <div className="user-location-marker">
              <div className="user-location-dot" />
              <div className="user-location-ring" />
            </div>
          </MarkerContent>
          <MarkerTooltip>
            <div className="user-location-tooltip">
              <strong>Your Location</strong>
            </div>
          </MarkerTooltip>
        </MapMarker>
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

      {clusteredItems.map((item) => {
        if (isCluster(item)) {
          // Render cluster marker
          return (
            <MapMarker
              key={item.clusterId}
              longitude={item.lon}
              latitude={item.lat}
            >
              <MarkerContent>
                <div className="bus-cluster">
                  <span className="cluster-count">{item.count}</span>
                </div>
              </MarkerContent>
              <MarkerTooltip>
                <div className="bus-tooltip">
                  <strong>{item.count} buses</strong>
                  <br />
                  {item.vehicles.slice(0, 3).map(v => v.routeNumber).join(', ')}
                  {item.vehicles.length > 3 && ` +${item.vehicles.length - 3} more`}
                </div>
              </MarkerTooltip>
            </MapMarker>
          );
        }

        // Render individual animated vehicle marker
        const vehicle = item as Vehicle;
        return (
          <AnimatedBusMarker
            key={vehicle.id}
            vehicle={vehicle}
            onSelect={() => onSelectBus(vehicle)}
          />
        );
      })}
    </Map>
  );
});

export default MapView;
