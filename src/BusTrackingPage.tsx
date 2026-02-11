import { useEffect, useState, useRef, useCallback, memo, lazy, Suspense, useMemo } from 'react';
import './BusTrackingPage.css';
import { getRouteInfo, getRouteTypeLabel } from '@/data/miwayRoutes';

// Lazy load heavy map components for bundle optimization
const MapView = lazy(() => import('./components/MapView'));
const ModalMap = lazy(() => import('./components/ModalMap'));

// Loading fallback for lazy components
const MapLoadingFallback = () => (
  <div className="map-loading">Loading map...</div>
);

// Animated number component with fast flip/countdown effect
const FlipNumber = memo(function FlipNumber({ value, suffix = '' }: { value: number | string; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isFlipping, setIsFlipping] = useState(false);
  const prevValue = useRef(value);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevValue.current !== value) {
      const prevNum = typeof prevValue.current === 'number' ? prevValue.current : parseInt(String(prevValue.current), 10);
      const nextNum = typeof value === 'number' ? value : parseInt(String(value), 10);
      
      // If both are valid numbers and difference is small, do countdown animation
      if (!isNaN(prevNum) && !isNaN(nextNum) && Math.abs(nextNum - prevNum) <= 20 && Math.abs(nextNum - prevNum) > 0) {
        const diff = nextNum - prevNum;
        const step = diff > 0 ? 1 : -1;
        const steps = Math.abs(diff);
        const duration = Math.min(300, steps * 30); // Max 300ms, 30ms per step
        const stepTime = duration / steps;
        
        let current = prevNum;
        let stepCount = 0;
        
        const animate = () => {
          stepCount++;
          current += step;
          setDisplayValue(current);
          setIsFlipping(true);
          
          if (stepCount < steps) {
            animationRef.current = window.setTimeout(animate, stepTime) as unknown as number;
          } else {
            setIsFlipping(false);
          }
        };
        
        if (animationRef.current) {
          clearTimeout(animationRef.current);
        }
        animate();
      } else {
        // For non-numeric or large changes, do quick flip
        setIsFlipping(true);
        const timeout = setTimeout(() => {
          setDisplayValue(value);
          setIsFlipping(false);
        }, 80);
        prevValue.current = value;
        return () => clearTimeout(timeout);
      }
      
      prevValue.current = value;
    }
  }, [value]);

  return (
    <span className={`flip-number ${isFlipping ? 'flipping' : ''}`}>
      {displayValue}{suffix}
    </span>
  );
});

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

interface RouteShapeResponse {
  routeId: string;
  shapeId?: string;
  coordinates: [number, number][];
  stops?: Array<{ name: string; lat: number; lon: number }>;
}

type ViewMode = 'list' | 'map';

// Favorites management
const FAVORITES_KEY = 'miway-favorite-buses';

function loadFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favorites: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
  } catch (e) {
    console.error('Failed to save favorites:', e);
  }
}

function BusTrackingPage() {
  const PULSE_ANIMATION_DURATION = 700;
  const REFRESH_INTERVAL_MS = 3000;
  
  const [vehicleData, setVehicleData] = useState<MiwayVehicleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBus, setSelectedBus] = useState<MiwayVehicle | null>(null);
  const [feedPulse, setFeedPulse] = useState(false);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const lastFetchTime = useRef<number>(Date.now());
  
  // Route shape for modal
  const [routeShape, setRouteShape] = useState<RouteShapeResponse | null>(null);
  const [loadingShape, setLoadingShape] = useState(false);

  // Mississauga center coordinates
  const MISSISSAUGA_CENTER: [number, number] = [-79.6441, 43.5890];

  const toggleFavorite = useCallback((vehicleId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(vehicleId)) {
        next.delete(vehicleId);
      } else {
        next.add(vehicleId);
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/api/miway-vehicles');
      const data = await response.json();
      setVehicleData(prev => {
        // Preserve same array/object references when possible to avoid re-renders that clear hover states
        if (!prev) return data;

        const sameStats = prev.stats.total === data.stats.total
          && prev.stats.moving === data.stats.moving
          && prev.stats.stopped === data.stats.stopped
          && prev.stats.averageSpeed === data.stats.averageSpeed;

        const prevVehiclesById = new Map(prev.vehicles.map(v => [v.id, v]));
        let changed = !sameStats || prev.vehicles.length !== data.vehicles.length;

        const mergedVehicles = data.vehicles.map((v: MiwayVehicle) => {
          const existing = prevVehiclesById.get(v.id);
          if (!existing) {
            changed = true;
            return v;
          }

          const same =
            existing.latitude === v.latitude &&
            existing.longitude === v.longitude &&
            existing.speedKmh === v.speedKmh &&
            existing.status === v.status &&
            existing.bearing === v.bearing &&
            existing.routeName === v.routeName &&
            existing.routeNumber === v.routeNumber;

          if (same) {
            return existing;
          }
          changed = true;
          return v;
        });

        if (!changed) {
          return prev;
        }

        return {
          ...data,
          vehicles: mergedVehicles,
        };
      });
      setFeedPulse(true);
      lastFetchTime.current = Date.now();
      setSecondsAgo(0);
    } catch (error) {
      console.error('Failed to load vehicle data:', error);
    } finally {
      setLoading(false);
      setTimeout(() => setFeedPulse(false), PULSE_ANIMATION_DURATION);
    }
  }, []);

  // Data fetch interval - 3 seconds
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadData]);

  // Seconds ago counter - updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastFetchTime.current) / 1000);
      setSecondsAgo(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Escape to close modal
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

  // Fetch route shape when bus is selected
  useEffect(() => {
    if (!selectedBus) {
      setRouteShape(null);
      return;
    }
    
    const fetchShape = async () => {
      setLoadingShape(true);
      try {
        const response = await fetch(`/api/miway-route-shape?routeId=${selectedBus.routeId}`);
        const data = await response.json();
        setRouteShape(data);
      } catch (error) {
        console.error('Failed to load route shape:', error);
        setRouteShape(null);
      } finally {
        setLoadingShape(false);
      }
    };
    
    fetchShape();
  }, [selectedBus?.routeId]);

  // Filter vehicles by search query only
  const filteredVehicles = useMemo(() => {
    const base = vehicleData?.vehicles?.filter((vehicle) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase().trim();

      // routeNumber may include a trailing direction letter (eg. "26N").
      // Also match against the base route number (eg. "26").
      const routeNum = vehicle.routeNumber?.toLowerCase() || '';
      const baseRouteNum = routeNum.replace(/[a-z]$/i, '');
      const routeId = vehicle.routeId?.toLowerCase() || '';
      const label = vehicle.label?.toLowerCase() || '';

      return (
        routeNum.includes(query) ||
        baseRouteNum.includes(query) ||
        vehicle.routeName.toLowerCase().includes(query) ||
        routeId.includes(query) ||
        vehicle.id.toLowerCase().includes(query) ||
        label.includes(query)
      );
    }) || [];

    if (showFavoritesOnly) {
      return base.filter((v) => favorites.has(v.id));
    }
    return base;
  }, [vehicleData?.vehicles, searchQuery, showFavoritesOnly, favorites]);

  // Separate favorites and regular vehicles
  const { favoriteVehicles, regularVehicles } = useMemo(() => {
    const favs: MiwayVehicle[] = [];
    const regs: MiwayVehicle[] = [];
    
    filteredVehicles.forEach(vehicle => {
      if (favorites.has(vehicle.id)) {
        favs.push(vehicle);
      } else {
        regs.push(vehicle);
      }
    });
    
    return { favoriteVehicles: favs, regularVehicles: regs };
  }, [filteredVehicles, favorites]);

  const groupVehiclesByRoute = (vehicles: MiwayVehicle[]) => {
    const grouped = vehicles.reduce((acc, vehicle) => {
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

    return Object.values(grouped).sort((a, b) => 
      a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true })
    );
  };

  const favoriteRoutes = groupVehiclesByRoute(favoriteVehicles);
  const regularRoutes = groupVehiclesByRoute(regularVehicles);

  const stats = vehicleData?.stats;
  const movingRatio = stats ? Math.min(100, Math.round((stats.moving / Math.max(stats.total, 1)) * 100)) : 0;
  const stoppedRatio = stats ? 100 - movingRatio : 0;

  const toggleRoute = (routeNumber: string) => {
    const newExpanded = new Set(expandedRoutes);
    if (newExpanded.has(routeNumber)) {
      newExpanded.delete(routeNumber);
    } else {
      newExpanded.add(routeNumber);
    }
    setExpandedRoutes(newExpanded);
  };

  // Get route info for modal
  const selectedRouteInfo = selectedBus ? getRouteInfo(selectedBus.routeNumber) : null;
  
  // Get live vehicle data for modal
  const liveSelectedVehicle = selectedBus 
    ? vehicleData?.vehicles?.find(v => v.id === selectedBus.id) ?? selectedBus
    : null;

  const isFavorite = selectedBus ? favorites.has(selectedBus.id) : false;

  const renderRouteGroup = (route: { routeNumber: string; routeName: string; vehicles: MiwayVehicle[] }, isFav: boolean) => (
    <div key={route.routeNumber} className="route-group">
      <div 
        className="route-header"
        onClick={() => toggleRoute(route.routeNumber)}
      >
        <span className="route-number">{route.routeNumber}</span>
        <span className="route-name">{route.routeName}</span>
        <span className="vehicle-count">{route.vehicles.length} bus{route.vehicles.length !== 1 ? 'es' : ''}</span>
        <span className="expand-indicator">{expandedRoutes.has(route.routeNumber) ? '-' : '+'}</span>
      </div>
      {expandedRoutes.has(route.routeNumber) && (
        <div className="vehicle-list">
          {route.vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className={`vehicle-item ${vehicle.status} ${isFav ? 'favorite' : ''}`}
              onClick={() => setSelectedBus(vehicle)}
            >
              <div className="vehicle-id">
                {favorites.has(vehicle.id) && <span className="favorite-star">★</span>}
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
  );

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
          {/* Live Indicator */}
          <div className={`live-indicator ${feedPulse ? 'pulse' : ''}`}>
            <span className="live-dot" />
            <span className="live-text">
              Updated {secondsAgo}s ago
            </span>
          </div>

          {/* Stats Overview */}
          <div className="tracking-stats">
            <div className="status-card">
              <span>Total Buses</span>
              <strong><FlipNumber value={stats?.total ?? 0} /></strong>
            </div>
            <div className="status-card">
              <span>Moving</span>
              <strong><FlipNumber value={stats?.moving ?? 0} /></strong>
            </div>
            <div className="status-card">
              <span>Stopped</span>
              <strong><FlipNumber value={stats?.stopped ?? 0} /></strong>
            </div>
            <div className="status-card">
              <span>Avg Speed</span>
              <strong><FlipNumber value={stats?.averageSpeed ?? 0} suffix=" km/h" /></strong>
            </div>
          </div>

          {/* Fleet Status Bar */}
          <div className="fleet-status-container">
            <div className="fleet-status-header">
              <span className="fleet-status-label">Fleet Status</span>
              <span className="fleet-status-legend">
                <span className="legend-item"><span className="legend-dot moving" /><FlipNumber value={stats?.moving ?? 0} /> active</span>
                <span className="legend-item"><span className="legend-dot stopped" /><FlipNumber value={stats?.stopped ?? 0} /> stopped</span>
              </span>
            </div>
            <div className="fleet-status-bar">
              <div 
                className="fleet-segment moving" 
                style={{ width: `${movingRatio}%` }}
              />
              <div 
                className="fleet-segment stopped" 
                style={{ width: `${stoppedRatio}%` }}
              />
            </div>
          </div>

          {/* View Toggle */}
          <div className="view-toggle">
            <button 
              className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              List
            </button>
            <button 
              className={`toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
              onClick={() => setViewMode('map')}
            >
              Map
            </button>
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
              <button className="search-clear" onClick={() => setSearchQuery('')}>x</button>
            )}
            <button
              className={`favorites-toggle ${showFavoritesOnly ? 'active' : ''}`}
              onClick={() => setShowFavoritesOnly((v) => !v)}
              title={showFavoritesOnly ? 'Show all buses' : 'Show only favorited buses'}
            >
              ★ Fav
            </button>
          </div>

          {viewMode === 'map' ? (
            /* Full Map View with clustering */
            <div className="live-map-container">
              <Suspense fallback={<MapLoadingFallback />}>
                <MapView
                  vehicles={filteredVehicles}
                  center={MISSISSAUGA_CENTER}
                  onSelectBus={setSelectedBus}
                />
              </Suspense>
            </div>
          ) : (
            /* List View */
            <div className="bus-leaderboard">
              {favoriteRoutes.length === 0 && regularRoutes.length === 0 ? (
                <div className="no-results">
                  {searchQuery 
                    ? `No buses found matching "${searchQuery}"`
                    : 'No buses currently active'
                  }
                </div>
              ) : (
                <>
                  {/* Favorite Buses Section */}
                  {favoriteRoutes.length > 0 && (
                    <div className="favorites-section">
                      <div className="section-header">
                        <span className="section-icon">★</span>
                        <span className="section-title">Favorite Buses</span>
                        <span className="section-count">{favoriteVehicles.length}</span>
                      </div>
                      {favoriteRoutes.map(route => renderRouteGroup(route, true))}
                    </div>
                  )}

                  {/* All Buses Section */}
                  {regularRoutes.length > 0 && (
                    <div className="all-buses-section">
                      {favoriteRoutes.length > 0 && (
                        <div className="section-header">
                          <span className="section-title">All Buses</span>
                          <span className="section-count">{regularVehicles.length}</span>
                        </div>
                      )}
                      {regularRoutes.map(route => renderRouteGroup(route, false))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {vehicleData?.updatedAt && (
            <p className="last-updated">Last updated: {new Date(vehicleData.updatedAt).toLocaleString()}</p>
          )}
        </>
      )}

      {/* Bus Detail Modal */}
      {selectedBus && liveSelectedVehicle && (
        <div className="bus-modal" onClick={() => setSelectedBus(null)}>
          <div className="bus-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="bus-modal-actions">
              <button 
                className={`bus-favorite-btn ${isFavorite ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(selectedBus.id);
                }}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                ★
              </button>
              <button 
                className="bus-modal-close" 
                onClick={() => setSelectedBus(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            <div className="bus-modal-header">
              <div className="bus-modal-title">
                <span className="route-badge">{liveSelectedVehicle.routeNumber}</span>
                <span className="route-name-modal">{liveSelectedVehicle.routeName}</span>
              </div>
              <div className={`status-indicator ${liveSelectedVehicle.status}`}>
                {liveSelectedVehicle.status === 'moving' ? 'ACTIVE' : 'STOPPED'}
              </div>
            </div>

            {/* Map directly under header */}
            <div className="modal-map-inline">
              {loadingShape ? (
                <div className="map-loading">Loading route...</div>
              ) : (
                <Suspense fallback={<MapLoadingFallback />}>
                  <ModalMap
                    vehicle={liveSelectedVehicle}
                    routeShape={routeShape}
                  />
                </Suspense>
              )}
            </div>
            <div className="bus-modal-body">
              {/* Route Info from static data */}
              {selectedRouteInfo && (
                <div className="route-info-section">
                  <div className="route-type-badge">{getRouteTypeLabel(selectedRouteInfo.type)}</div>
                  <div className="route-termini">
                    <span className="termini-label">Route:</span>
                    <span className="termini-text">
                      {selectedRouteInfo.termini.direction1} - {selectedRouteInfo.termini.direction2}
                    </span>
                  </div>
                  <div className="route-availability">
                    <span className="availability-label">Service:</span>
                    <span className="availability-text">{selectedRouteInfo.availability}</span>
                  </div>
                </div>
              )}
              
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Vehicle ID</span>
                  <span className="detail-value">{liveSelectedVehicle.label || liveSelectedVehicle.id}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Speed</span>
                  <span className="detail-value">{liveSelectedVehicle.speedKmh} km/h</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Location</span>
                  <span className="detail-value">
                    <LocationInfo lat={liveSelectedVehicle.latitude} lon={liveSelectedVehicle.longitude} />
                  </span>
                </div>
                {liveSelectedVehicle.bearing !== null && liveSelectedVehicle.bearing !== undefined && (
                  <div className="detail-item">
                    <span className="detail-label">Bearing</span>
                    <span className="detail-value">{liveSelectedVehicle.bearing.toFixed(0)} deg</span>
                  </div>
                )}
                {liveSelectedVehicle.timestamp && (
                  <div className="detail-item">
                    <span className="detail-label">Last Update</span>
                    <span className="detail-value">
                      {new Date(liveSelectedVehicle.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
              {liveSelectedVehicle.bearing !== null && liveSelectedVehicle.bearing !== undefined && (
                <div className="bearing-compass">
                  <div className="compass-circle">
                    <div 
                      className="compass-needle" 
                      style={{ transform: `rotate(${liveSelectedVehicle.bearing}deg)` }}
                    />
                    <div className="compass-label compass-n">N</div>
                    <div className="compass-label compass-e">E</div>
                    <div className="compass-label compass-s">S</div>
                    <div className="compass-label compass-w">W</div>
                  </div>
                  <div className="bearing-text">{liveSelectedVehicle.bearing.toFixed(0)} deg</div>
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

function LocationInfo({ lat, lon }: { lat: number; lon: number }) {
  const latStr = Math.abs(lat).toFixed(4) + (lat >= 0 ? 'N' : 'S');
  const lonStr = Math.abs(lon).toFixed(4) + (lon >= 0 ? 'E' : 'W');

  const stopHash = Math.abs(Math.round((lat + lon) * 100)) % 1000;
  const stopName = `Stop ${stopHash}`;

  return (
    <>
      {`Near ${lonStr}, ${latStr}`}<br />
      <em>Possible stop:</em> {stopName}
    </>
  );
}
