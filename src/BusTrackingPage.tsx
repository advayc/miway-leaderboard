import { useEffect, useState } from 'react';
import './BusTrackingPage.css';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, useMap } from 'react-leaflet';
// Use mapcn's React map component — install with:
//   npx shadcn@latest add @mapcn/map
import { Map as MapCn, MapControls } from '@mapcn/map';

interface MiwayVehicle {
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

interface MiwayVehicleResponse {
  updatedAt?: string;
  stats: {
    total: number;
    moving: number;
    stopped: number;
    averageSpeed: number;
  };
  vehicles: MiwayVehicle[];
}

function BusTrackingPage() {
  const PULSE_ANIMATION_DURATION = 700; // ms, matches CSS animation duration
  const [vehicleData, setVehicleData] = useState<MiwayVehicleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBus, setSelectedBus] = useState<MiwayVehicle | null>(null);
  // location suggestion for a selected bus (reverse-geocoded text + nearest stop suggestion)
  // We'll compute this on demand inside the modal instead of storing it in state for now.
  const [feedPulse, setFeedPulse] = useState(false);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/api/miway-vehicles');
        const data = await response.json();
        setVehicleData(data);
        setFeedPulse(true);
      } catch (error) {
        console.error('Failed to load vehicle data:', error);
      } finally {
        setLoading(false);
        setTimeout(() => setFeedPulse(false), PULSE_ANIMATION_DURATION);
      }
    };

    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  // Close modal when ESC is pressed
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedBus(null);
    }
    if (selectedBus) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
    return;
  }, [selectedBus]);

  const filteredVehicles = vehicleData?.vehicles?.filter((vehicle) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      vehicle.routeNumber.toLowerCase().includes(query) ||
      vehicle.routeName.toLowerCase().includes(query) ||
      vehicle.id.toLowerCase().includes(query) ||
      vehicle.label?.toLowerCase().includes(query)
    );
  }) || [];

  // Group vehicles by route
  const vehiclesByRoute = filteredVehicles.reduce((acc, vehicle) => {
    const key = vehicle.routeNumber;
    if (!acc[key]) {
      acc[key] = {
        routeNumber: vehicle.routeNumber,
        routeName: vehicle.routeName,
        vehicles: [],
      };
    }
    acc[key].vehicles.push(vehicle);
    return acc;
  }, {} as Record<string, { routeNumber: string; routeName: string; vehicles: MiwayVehicle[] }>);

  const routes = Object.values(vehiclesByRoute).sort((a, b) => 
    a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true })
  );

  const movingRatio = vehicleData?.stats ? Math.min(100, Math.round((vehicleData.stats.moving / Math.max(vehicleData.stats.total, 1)) * 100)) : 0;
  const stoppedRatio = vehicleData?.stats ? 100 - movingRatio : 0;

  const toggleRoute = (routeNumber: string) => {
    const newExpanded = new Set(expandedRoutes);
    if (newExpanded.has(routeNumber)) {
      newExpanded.delete(routeNumber);
    } else {
      newExpanded.add(routeNumber);
    }
    setExpandedRoutes(newExpanded);
  };

  return (
    <div className="wrapper">
      <div className="title">LIVE BUS TRACKING</div>
      <div className="information">
        Real-time updates from MiWay buses across the network.
      </div>

      {loading ? (
        <div className="loading">Loading<span className="loading-dots"><span>.</span><span>.</span><span>.</span></span></div>
      ) : (
        <>
          {/* Stats Overview */}
          <div className={`tracking-stats ${feedPulse ? 'feed-pulse' : ''}`}>
            <div className="status-card">
              <span>Total Buses</span>
              <strong>{vehicleData?.stats?.total ?? 0}</strong>
            </div>
            <div className="status-card">
              <span>Moving</span>
              <strong>{vehicleData?.stats?.moving ?? 0}</strong>
            </div>
            <div className="status-card">
              <span>Stopped</span>
              <strong>{vehicleData?.stats?.stopped ?? 0}</strong>
            </div>
            <div className="status-card">
              <span>Avg Speed</span>
              <strong>{vehicleData?.stats?.averageSpeed ?? 0} km/h</strong>
            </div>
          </div>

          {/* Movement Gauge */}
          <div className="movement-gauge-container">
            <div className="gauge-label">Fleet Status</div>
            <div className="gauge-bar">
              <span style={{ width: `${movingRatio}%` }} />
              <span className="gauge-secondary" style={{ width: `${stoppedRatio}%` }} />
            </div>
            <div className="gauge-caption">
              {movingRatio}% moving · {stoppedRatio}% stopped
            </div>
          </div>

          {/* Search Bar */}
          <div className="search-container">
            <input
              type="text"
              className="search-input"
              placeholder="Search by route number, name, or vehicle ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>

          {/* page-top-map removed to avoid large gap; live map is available inside each bus modal */}

          {/* Bus Leaderboard */}
          <div className="bus-leaderboard">
            {routes.length === 0 ? (
              <div className="no-results">No buses found matching "{searchQuery}"</div>
            ) : (
              routes.map((route) => (
                <div key={route.routeNumber} className="route-group">
                  <div 
                    className="route-header"
                    onClick={() => toggleRoute(route.routeNumber)}
                  >
                    <span className="route-number">{route.routeNumber}</span>
                    <span className="route-name">{route.routeName}</span>
                    <span className="vehicle-count">{route.vehicles.length} bus{route.vehicles.length !== 1 ? 'es' : ''}</span>
                    <span className="expand-indicator">{expandedRoutes.has(route.routeNumber) ? '−' : '+'}</span>
                  </div>
                  {expandedRoutes.has(route.routeNumber) && (
                    <div className="vehicle-list">
                      {route.vehicles.map((vehicle) => (
                        <div
                          key={vehicle.id}
                          className={`vehicle-item ${vehicle.status}`}
                          onClick={() => setSelectedBus(vehicle)}
                        >
                          <div className="vehicle-id">
                            {vehicle.label || vehicle.id}
                          </div>
                          <div className="vehicle-info">
                            <span className="vehicle-speed">{vehicle.speedKmh} km/h</span>
                            <span className={`status-badge ${vehicle.status}`}>
                              {vehicle.status === 'moving' ? 'ACTIVE' : 'STOPPED'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {vehicleData?.updatedAt && (
            <p className="last-updated">Last updated: {new Date(vehicleData.updatedAt).toLocaleString()}</p>
          )}
        </>
      )}

      {/* Bus Detail Modal */}
      {selectedBus && (
        <div className="bus-modal" onClick={() => setSelectedBus(null)}>
          <div className="bus-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="bus-modal-close" onClick={() => setSelectedBus(null)}>×</button>
            <div className="bus-modal-header">
              <div className="bus-modal-title">
                <span className="route-badge">{selectedBus.routeNumber}</span>
                <span className="route-name-modal">{selectedBus.routeName}</span>
              </div>
              <div className={`status-indicator ${selectedBus.status}`}>
                {selectedBus.status === 'moving' ? 'ACTIVE' : 'STOPPED'}
              </div>
              </div>
              <div className="bus-modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Vehicle ID</span>
                  <span className="detail-value">{selectedBus.label || selectedBus.id}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Speed</span>
                  <span className="detail-value">{selectedBus.speedKmh} km/h</span>
                </div>
                  <div className="detail-item">
                    <span className="detail-label">Location</span>
                    <span className="detail-value">
                      {/* Reverse-geocode the coords into a human location and suggest nearest stop */}
                      <LocationInfo lat={selectedBus.latitude} lon={selectedBus.longitude} />
                    </span>
                  </div>
                {selectedBus.bearing !== null && selectedBus.bearing !== undefined && (
                  <div className="detail-item">
                    <span className="detail-label">Bearing</span>
                    <span className="detail-value">{selectedBus.bearing.toFixed(0)}°</span>
                  </div>
                )}
                {selectedBus.timestamp && (
                  <div className="detail-item">
                    <span className="detail-label">Last Update</span>
                    <span className="detail-value">
                      {new Date(selectedBus.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
              {selectedBus.bearing !== null && selectedBus.bearing !== undefined && (
                <div className="bearing-compass">
                  <div className="compass-circle">
                    <div 
                      className="compass-needle" 
                      style={{ transform: `rotate(${selectedBus.bearing}deg)` }}
                    />
                    <div className="compass-label compass-n">N</div>
                    <div className="compass-label compass-e">E</div>
                    <div className="compass-label compass-s">S</div>
                    <div className="compass-label compass-w">W</div>
                  </div>
                  <div className="bearing-text">{selectedBus.bearing.toFixed(0)}°</div>
                </div>
              )}
              {/* Live map: center on the selected bus and update as feed refreshes */}
              <div className="modal-map">
                {/** Determine latest vehicle position from feed when available **/}
                {(() => {
                  const liveVehicle = vehicleData?.vehicles?.find(v => v.id === selectedBus.id) ?? selectedBus;
                  const position: [number, number] = [liveVehicle.latitude, liveVehicle.longitude];

                  function MapAutoCenter({ position }: { position: [number, number] }) {
                    const map = useMap();
                    useEffect(() => {
                      if (position && map) {
                        map.setView(position, 15);
                      }
                    }, [position, map]);
                    return null;
                  }

                  return (
                    <MapContainer center={position} zoom={15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
                      <TileLayer
                        attribution='&copy; OpenStreetMap contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <MapAutoCenter position={position} />
                      <CircleMarker center={position} radius={9} pathOptions={{ color: liveVehicle.status === 'moving' ? '#10b981' : '#ef4444', fillOpacity: 1 }} />
                    </MapContainer>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Helper: reverse-geocode-ish (no external API) */}
      {/* For now, LocationInfo is a simple function component that formats coords into a plausible address and stop suggestion. */}
      
    </div>
  );
}

export default BusTrackingPage;

// Simple, local formatting component that turns lat/lon into a readable location string
function LocationInfo({ lat, lon }: { lat: number; lon: number }) {
  // naive heuristic-based location formatter — in a real app we'd call a geocoding API
  const latStr = Math.abs(lat).toFixed(4) + (lat >= 0 ? 'N' : 'S');
  const lonStr = Math.abs(lon).toFixed(4) + (lon >= 0 ? 'E' : 'W');

  // suggest a stop name based on rounded coords (deterministic placeholder)
  const stopHash = Math.abs(Math.round((lat + lon) * 100)) % 1000;
  const stopName = `Stop ${stopHash}`;

  return (
    <>
      {`Near ${lonStr}, ${latStr}`}<br />
      <em>Possible stop:</em> {stopName}
    </>
  );
}
