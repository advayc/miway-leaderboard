# MiWay Live Leaderboard

This website shows live average route speeds for MiWay vehicles in Mississauga using GTFS-RT data.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript |
| Animations | Framer Motion |
| Build Tool | Vite |
| Backend | Vercel Serverless Functions |
| Data Source | MiWay GTFS-RT Feed |
| Analytics | Vercel Analytics |

## 🚀 Getting Started

### Prerequisites
- Node.js 20.x or later
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/advayc/miway-leaderboard.git
cd miway-leaderboard

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## 📊 How It Works

1. **Data Fetching** — The serverless API (`/api/miway`) fetches MiWay's live vehicle positions
2. **Speed Calculation** — Calculates average speed for each route based on active vehicles
3. **Change Detection** — Only routes with updated speeds are added to the update queue
4. **Queue Processing** — Updates are processed one at a time; if a position change occurs, the UI waits 1 second for the animation, otherwise it moves to the next update immediately
5. **Ranking** — Routes are sorted by speed, fastest at the top

## ➗ Math & Data Processing

This section explains the numeric steps used to turn raw GTFS-RT vehicle positions into the per-route averages shown on the leaderboard.

- Distance between two GPS points: we use the haversine formula to compute great-circle distance (meters) on the Earth.

```text
toRad(x) = x * π / 180
dLat = toRad(lat2 - lat1)
dLon = toRad(lon2 - lon1)
a = sin(dLat/2)^2 + cos(toRad(lat1)) * cos(toRad(lat2)) * sin(dLon/2)^2
c = 2 * atan2(sqrt(a), sqrt(1-a))
distance_m = R * c   (R ≈ 6,371,000 m)
```

- Instantaneous speed (when computing from two position snapshots):

```text
speed_mps = distance_m / time_delta_seconds
speed_kmh = speed_mps * 3.6
```

- Choosing between reported and computed speed:
  - If the vehicle report includes a numeric `speed` we accept it only if the converted km/h value is in the valid range (`MIN_SPEED_KMH = 1` to `MAX_SPEED_KMH = 75`).
  - Otherwise we compute speed from the vehicle's previous cached position only when:
    1) the time difference is within `MIN_TIME_DELTA_SECONDS = 8` and `MAX_TIME_DELTA_SECONDS = 120`, and
    2) the traveled distance is not an implausible jump (`MAX_JUMP_METERS = 600`).

- Aggregating per-route speeds:
  - We collect all valid speed samples (km/h) for a route variant during the snapshot pass.
  - To reduce outlier influence we sort the samples, and when there are at least 6 samples we trim the extremes: remove `trimCount = max(1, floor(n * 0.15))` samples from both the low and high ends.
  - The route average is the arithmetic mean of the remaining (trimmed) samples and is reported to one decimal place.

- Vehicle status: a vehicle is considered `moving` if `speed_kmh >= 2`, otherwise `stopped`.

These conservative filters (time windowing, jump limits, speed bounds, and trimming) help keep the leaderboard stable and resilient to noisy GPS, delayed timestamps, or occasional bad telemetry.

## 🗂️ Project Structure

```
miway-leaderboard/
├── api/
│   └── miway.ts            # Vercel serverless function for MiWay data
├── src/
│   ├── components/
│   │   └── LeaderboardPosition.tsx  # Individual route row component
│   ├── App.tsx             # Main application component
│   ├── LeaderboardQueue.ts # Queue data structure for updates
│   └── App.css             # Global styles
├── index.html
└── package.json
```

## 👤 Author

**advayc** — [advay.ca](https://advay.ca/)

This project is a fork of the original TTC leaderboard made by [](https://github.com/lukajvnic/ttc-leaderboard/tree/main/api)