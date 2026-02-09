import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTripUpdatesSummary } from '../lib/miwayService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const summary = await getTripUpdatesSummary();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching MiWay trip updates:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
