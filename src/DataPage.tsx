import { useEffect, useState } from 'react';
import './App.css';

interface FeedSummary {
  entityCount: number;
  updatedAt?: string;
  sample: Array<Record<string, string | number | null>>;
}

const renderSample = (sample: Array<Record<string, string | number | null>>) => (
  <div className="sample-list">
    {sample.length === 0 ? (
      <p className="muted">No sample data available.</p>
    ) : (
      sample.map((entry, index) => (
        <div key={`${index}`} className="sample-item">
          {Object.entries(entry).map(([key, value]) => (
            <div key={key} className="sample-row">
              <span className="sample-key">{key}</span>
              <span className="sample-value">{value ?? 'N/A'}</span>
            </div>
          ))}
        </div>
      ))
    )}
  </div>
);

function DataPage() {
  const [tripUpdates, setTripUpdates] = useState<FeedSummary | null>(null);
  const [alerts, setAlerts] = useState<FeedSummary | null>(null);
  const [vehicleStatus, setVehicleStatus] = useState<{ total: number; moving: number; stopped: number; averageSpeed: number } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [feedPulse, setFeedPulse] = useState({ vehicles: false, trips: false, alerts: false });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [tripRes, alertRes] = await Promise.all([
          fetch('/api/miway-trip-updates'),
          fetch('/api/miway-alerts'),
        ]);

        const tripData = await tripRes.json();
        const alertData = await alertRes.json();

        const vehicleRes = await fetch('/api/miway-vehicles');
        const vehicleData = await vehicleRes.json();

        setTripUpdates(tripData);
        setAlerts(alertData);
        setVehicleStatus(vehicleData.stats ?? null);
        setUpdatedAt(vehicleData.updatedAt);
        setFeedPulse({ vehicles: true, trips: true, alerts: true });
      } catch (error) {
        console.error('Failed to load MiWay feeds:', error);
      } finally {
        setLoading(false);
        setTimeout(() => setFeedPulse({ vehicles: false, trips: false, alerts: false }), 700);
      }
    };

    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const movingRatio = vehicleStatus ? Math.min(100, Math.round((vehicleStatus.moving / Math.max(vehicleStatus.total, 1)) * 100)) : 0;
  const stoppedRatio = vehicleStatus ? 100 - movingRatio : 0;
  const speedRatio = vehicleStatus ? Math.min(100, Math.round((vehicleStatus.averageSpeed / 60) * 100)) : 0;

  return (
    <div className="wrapper">
      <div className="title">MIWAY FEED STATUS</div>
      <div className="information">
        Live summaries from the MiWay GTFS-RT feeds with visual health indicators.
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="data-grid">
          <div className={`data-card feed-card ${feedPulse.vehicles ? 'feed-pulse' : ''}`}>
            <h3>Vehicle Status</h3>
            <div className="status-grid">
              <div className="status-card">
                <span>Total Vehicles</span>
                <strong>{vehicleStatus?.total ?? 0}</strong>
              </div>
              <div className="status-card">
                <span>Moving</span>
                <strong>{vehicleStatus?.moving ?? 0}</strong>
              </div>
              <div className="status-card">
                <span>Stopped</span>
                <strong>{vehicleStatus?.stopped ?? 0}</strong>
              </div>
              <div className="status-card">
                <span>Avg Speed</span>
                <strong>{vehicleStatus?.averageSpeed ?? 0} km/h</strong>
              </div>
            </div>
            <div className="feed-gauges">
              <div>
                <div className="gauge-label">Movement Mix</div>
                <div className="gauge-bar">
                  <span style={{ width: `${movingRatio}%` }} />
                  <span className="gauge-secondary" style={{ width: `${stoppedRatio}%` }} />
                </div>
                <div className="gauge-caption">
                  {movingRatio}% moving · {stoppedRatio}% stopped
                </div>
              </div>
              <div>
                <div className="gauge-label">Avg Speed</div>
                <div className="gauge-bar single">
                  <span style={{ width: `${speedRatio}%` }} />
                </div>
                <div className="gauge-caption">Relative to 60 km/h baseline</div>
              </div>
            </div>
            {updatedAt && <p className="muted">Updated: {new Date(updatedAt).toLocaleString()}</p>}
          </div>
          <div className={`data-card feed-card ${feedPulse.trips ? 'feed-pulse' : ''}`}>
            <h3>Trip Updates</h3>
            <div className="feed-metric">
              <div>
                <div className="metric-value">{tripUpdates?.entityCount ?? 0}</div>
                <div className="metric-label">Entities</div>
              </div>
              <div className="metric-chip">Updated {tripUpdates?.updatedAt ? new Date(tripUpdates.updatedAt).toLocaleTimeString() : 'Unknown'}</div>
            </div>
            <div className="feed-activity">
              <div>
                <div className="gauge-label">Feed Activity</div>
                <div className="gauge-bar single">
                  <span style={{ width: `${Math.min(100, (tripUpdates?.entityCount ?? 0) / 2)}%` }} />
                </div>
                <div className="gauge-caption">Scale: 0–200 entities</div>
              </div>
            </div>
            {renderSample(tripUpdates?.sample ?? [])}
          </div>
          <div className={`data-card feed-card ${feedPulse.alerts ? 'feed-pulse' : ''}`}>
            <h3>Alerts</h3>
            <div className="feed-metric">
              <div>
                <div className="metric-value">{alerts?.entityCount ?? 0}</div>
                <div className="metric-label">Entities</div>
              </div>
              <div className="metric-chip">Updated {alerts?.updatedAt ? new Date(alerts.updatedAt).toLocaleTimeString() : 'Unknown'}</div>
            </div>
            <div className="feed-activity">
              <div>
                <div className="gauge-label">Feed Activity</div>
                <div className="gauge-bar single">
                  <span style={{ width: `${Math.min(100, (alerts?.entityCount ?? 0) * 10)}%` }} />
                </div>
                <div className="gauge-caption">Scale: 0–10 alerts</div>
              </div>
            </div>
            {renderSample(alerts?.sample ?? [])}
          </div>
        </div>
      )}
    </div>
  );
}

export default DataPage;
