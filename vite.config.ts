import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { getMiwayLeaderboard, getTripUpdatesSummary, getAlertsSummary, getVehiclePositions, getRouteShape } from './lib/miwayService'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'miway-api',
      configureServer(server) {
        server.middlewares.use('/api/miway', async (_req, res) => {
          try {
            const leaderboard = await getMiwayLeaderboard();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(leaderboard));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to fetch MiWay data' }));
          }
        });

        server.middlewares.use('/api/miway-trip-updates', async (_req, res) => {
          try {
            const summary = await getTripUpdatesSummary();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(summary));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to fetch MiWay trip updates' }));
          }
        });

        server.middlewares.use('/api/miway-alerts', async (_req, res) => {
          try {
            const summary = await getAlertsSummary();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(summary));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to fetch MiWay alerts' }));
          }
        });

        server.middlewares.use('/api/miway-vehicles', async (_req, res) => {
          try {
            const payload = await getVehiclePositions();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to fetch MiWay vehicle positions' }));
          }
        });

        server.middlewares.use('/api/miway-route-shape', async (req, res) => {
          try {
            const url = new URL(req.url || '', 'http://localhost');
            const routeId = url.searchParams.get('routeId');
            if (!routeId) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Missing routeId parameter' }));
              return;
            }
            const shape = await getRouteShape(routeId);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(shape));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to fetch route shape' }));
          }
        });

      },
    },
  ],
})
