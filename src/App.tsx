import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './App.css'
import LeaderboardPosition from './components/LeaderboardPosition'
import { LeaderboardQueue, type LeaderboardData } from './LeaderboardQueue'
import { Analytics } from '@vercel/analytics/react'

function App() {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData[]>([]);
  const leaderboardDataRef = useRef<LeaderboardData[]>([]);
  const leaderboardQueue = useRef(new LeaderboardQueue());

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/miway');
      const data = await response.json();

      if (response.status !== 200)
        throw new Error(`Failed to fetch: ${response.status}`);

      const newData: LeaderboardData[] = data.map((route: LeaderboardData) => ({
        routeNumber: route.routeNumber,
        routeName: route.routeName,
        speed: route.speed
      }));

      // Filter to find elements that are different from current leaderboard
      const changedData = newData.filter((newItem) => {
        const existingItem = leaderboardDataRef.current.find(
          (item) => item.routeNumber === newItem.routeNumber
        );
        // Include if: doesn't exist in current data OR speed changed
        return !existingItem || existingItem.speed !== newItem.speed;
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

  return (
    <>
      <div className="wrapper">
        <div className="title">
          MIWAY LIVE LEADERBOARD
        </div>
        <div className="image-container">
          <img id="streetcar-image" src="https://thepointer.com/photos/headers/nearly-60-of-mississauga-s-bus-fleet-to-be-hybrid-electric-by-end-of-next-year-the-pointer-5043eff9.jpg" alt="MiWay bus" />
        </div>
        <div className="information">
          MiWay publishes real-time vehicle updates across Mississauga.
          <br></br>
          This site ranks average route speeds using the live GTFS-RT feed.
        </div>
        <div className="leaderboard">
          <AnimatePresence>
            {leaderboardData.length == 0 ? (
              <div className="loading">Loading...</div>
            ) : (
              leaderboardData.map((position) => (
                <motion.div
                  key={position.routeNumber}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <LeaderboardPosition
                    routeNumber={position.routeNumber}
                    routeName={position.routeName}
                    speed={position.speed}
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
        <div className="info">
          This leaderboard is live and shows the average speed<br></br>of all MiWay vehicles on a route with a short delay.
        </div>
        <div className="footer">
          <i>
            Created by <a href="https://advay.ca/" target="_blank" rel="noreferrer">advay chandorkar</a>.&nbsp;
            this project is a fork of the original <a href="https://github.com/lukajvnic/ttc-leaderboard" target="_blank" rel="noreferrer">TTC leaderboard</a>.
          </i>
        </div>
      </div>

      <Analytics />
    </>
  )
}

export default App
