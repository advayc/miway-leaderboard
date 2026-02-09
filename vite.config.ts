import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { getMiwayLeaderboard } from './api/miwayService'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
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

        server.middlewares.use('/api/ttc', async (_req, res) => {
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
      },
    },
  ],
})
