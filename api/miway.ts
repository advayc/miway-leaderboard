import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getMiwayLeaderboard } from './miwayService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const leaderboard = await getMiwayLeaderboard();

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        return res.status(200).json(leaderboard);
    } catch (error) {
        console.error('Error fetching MiWay data:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
