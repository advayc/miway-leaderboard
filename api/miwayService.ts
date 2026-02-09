import type { VercelRequest, VercelResponse } from '@vercel/node';

export * from '../lib/miwayService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    return res.status(404).json({ error: 'Not found' });
}
