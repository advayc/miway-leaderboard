import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import './App.css'
import LeaderboardPosition from './components/LeaderboardPosition'
import { LeaderboardQueue, type LeaderboardData } from './LeaderboardQueue'
import { Analytics } from '@vercel/analytics/react'
import DataPage from './DataPage'

function App() {
  const [isImageOpen, setIsImageOpen] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData[]>([]);
  const leaderboardDataRef = useRef<LeaderboardData[]>([]);
  const leaderboardQueue = useRef(new LeaderboardQueue());
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const prevPositionsRef = useRef<Map<string, DOMRect> | null>(null);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/miway');
      const data = await response.json();

      if (response.status !== 200)
        throw new Error(`Failed to fetch: ${response.status}`);

      const newData: LeaderboardData[] = data.map((route: LeaderboardData) => ({
        routeNumber: route.routeNumber,
        routeName: route.routeName,
        speed: route.speed,
        speedMps: route.speedMps
      }));

      // Filter to find elements that are different from current leaderboard
      const changedData = newData.filter((newItem) => {
        const existingItem = leaderboardDataRef.current.find(
          (item) => item.routeNumber === newItem.routeNumber
        );
        return !existingItem || existingItem.speed !== newItem.speed || existingItem.speedMps !== newItem.speedMps;
      });

      // Add changed items to the queue
      leaderboardQueue.current.upsertAll(changedData);

    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  useEffect(() => {
    fetchLeaderboard();

    const fetch_interval = setInterval(() => {
      fetchLeaderboard();
    }, 1000);

    let updateTimeoutId: ReturnType<typeof setTimeout>;

    const processNextItem = () => {
      const nextItem = leaderboardQueue.current.popFront();
      if (nextItem) {
        // Compute what the new sorted data will be using the ref
        const prevData = leaderboardDataRef.current;
        prevPositionsRef.current = new Map();
        prevData.forEach((item) => {
          const el = itemRefs.current.get(item.routeNumber);
          if (el) {
            prevPositionsRef.current?.set(item.routeNumber, el.getBoundingClientRect());
          }
        });
        const existingIndex = prevData.findIndex(item => item.routeNumber === nextItem.routeNumber);
        let newData: LeaderboardData[];

        if (existingIndex !== -1) {
          newData = [...prevData];
          newData[existingIndex] = nextItem;
        } else {
          newData = [...prevData, nextItem];
        }

        const sortedData = [...newData].sort((a, b) => b.speed - a.speed);

        // Check if order changed by comparing route order
        const orderChanged = sortedData.some((item, index) =>
          prevData[index]?.routeNumber !== item.routeNumber
        );

        // Update state and ref
        leaderboardDataRef.current = sortedData;
        setLeaderboardData(sortedData);

        // If order didn't change, immediately process next item
        // Otherwise wait 1 second for animation
        updateTimeoutId = setTimeout(processNextItem, orderChanged ? 1000 : 0);
      } else {
        // Queue empty, check again in 1 second
        updateTimeoutId = setTimeout(processNextItem, 200);
      }
    };

    processNextItem();

    return () => {
      clearInterval(fetch_interval);
      clearTimeout(updateTimeoutId);
    }
  }, []);

  useLayoutEffect(() => {
    const prevPositions = prevPositionsRef.current;
    if (!prevPositions) return;

    leaderboardData.forEach((item) => {
      const el = itemRefs.current.get(item.routeNumber);
      if (!el) return;
      const nextRect = el.getBoundingClientRect();
      const prevRect = prevPositions.get(item.routeNumber);

      if (prevRect) {
        const deltaY = prevRect.top - nextRect.top;
        if (Math.abs(deltaY) > 0.5) {
          el.style.transform = `translateY(${deltaY}px)`;
          el.style.transition = 'transform 0s';
          requestAnimationFrame(() => {
            el.style.transition = 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1)';
            el.style.transform = 'translateY(0)';
          });
        }
      } else {
        el.classList.add('leaderboard-enter');
        const onEnd = () => {
          el.classList.remove('leaderboard-enter');
          el.removeEventListener('animationend', onEnd);
        };
        el.addEventListener('animationend', onEnd);
      }
    });
  }, [leaderboardData]);

  useEffect(() => {
    if (!isImageOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsImageOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImageOpen]);

  const LeaderboardPage = () => (
    <div className="wrapper">
      <div className="title">
        MIWAY LIVE LEADERBOARD
      </div>
      <div className="image-container">
        <img
          id="streetcar-image"
          className="zoomable-image"
          src="https://thepointer.com/photos/headers/nearly-60-of-mississauga-s-bus-fleet-to-be-hybrid-electric-by-end-of-next-year-the-pointer-5043eff9.jpg"
          alt="MiWay bus"
          onClick={() => setIsImageOpen(true)}
        />
      </div>
      <div className="information">
        MiWay publishes real-time vehicle updates across Mississauga.
        <br></br>
        This site ranks average route speeds using the live GTFS-RT feed.
      </div>
        <div className="leaderboard">
          {leaderboardData.length == 0 ? (
            <div className="loading">
              Loading
              <span className="loading-dots">
                <span>.</span><span>.</span><span>.</span>
              </span>
            </div>
          ) : (
            leaderboardData.map((position) => (
              <div
                key={position.routeNumber}
                className="leaderboard-item"
                ref={(node) => {
                  if (node) {
                    itemRefs.current.set(position.routeNumber, node);
                  } else {
                    itemRefs.current.delete(position.routeNumber);
                  }
                }}
              >
                <LeaderboardPosition
                  routeNumber={position.routeNumber}
                  routeName={position.routeName}
                  speed={position.speed}
                  speedMps={position.speedMps}
                />
              </div>
            ))
          )}
        </div>
      <div className="info">
        This leaderboard is live and shows the average speed<br></br>of all MiWay vehicles on a route with a short delay.
      </div>
      <div className="footer">
        <i>
          Created by <a href="https://advay.ca/" target="_blank" rel="noreferrer">advay chandorkar</a>.&nbsp;
          Built with MiWay real-time feeds. 
          
          View on <a href="https://github.com/advayc/miway-leaderboard" target="_blank" rel="noreferrer">GitHub</a>.
          <br />
          Credit to the original project: <a href="https://github.com/lukajvnic/ttc-leaderboard" target="_blank" rel="noreferrer">TTC Leaderboard</a>.
        </i>
      </div>
    </div>
  );

  return (
    <BrowserRouter>
      <nav className="nav">
        <Link to="/">Leaderboard</Link>
        <Link to="/feeds">Feed Status</Link>
      </nav>
      <Routes>
        <Route path="/" element={<LeaderboardPage />} />
        <Route path="/feeds" element={<DataPage />} />
      </Routes>
      {isImageOpen && (
        <div className="image-modal" onClick={() => setIsImageOpen(false)}>
          <div className="image-modal-content" onClick={(event) => event.stopPropagation()}>
            <button className="image-modal-close" onClick={() => setIsImageOpen(false)} aria-label="Close image">
              ×
            </button>
            <img
              src="https://thepointer.com/photos/headers/nearly-60-of-mississauga-s-bus-fleet-to-be-hybrid-electric-by-end-of-next-year-the-pointer-5043eff9.jpg"
              alt="MiWay bus enlarged"
            />
          </div>
        </div>
      )}
      <Analytics />
    </BrowserRouter>
  )
}

export default App
