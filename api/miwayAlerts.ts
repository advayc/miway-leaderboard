import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAlertsSummary } from '../lib/miwayService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        const summary = await getAlertsSummary();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(summary);
    } catch (error) {
        console.error('Error fetching MiWay alerts:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
