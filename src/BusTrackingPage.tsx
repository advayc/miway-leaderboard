import { useEffect, useState } from 'react';
import './BusTrackingPage.css';

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
  const [feedPulse, setFeedPulse] = useState(false);

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

          {/* Bus Leaderboard */}
          <div className="bus-leaderboard">
            {routes.length === 0 ? (
              <div className="no-results">No buses found matching "{searchQuery}"</div>
            ) : (
              routes.map((route) => (
                <div key={route.routeNumber} className="route-group">
                  <div className="route-header">
                    <span className="route-number">{route.routeNumber}</span>
                    <span className="route-name">{route.routeName}</span>
                    <span className="vehicle-count">{route.vehicles.length} bus{route.vehicles.length !== 1 ? 'es' : ''}</span>
                  </div>
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
                    {selectedBus.latitude.toFixed(4)}, {selectedBus.longitude.toFixed(4)}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BusTrackingPage;
