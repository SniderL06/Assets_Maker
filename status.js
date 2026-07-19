// /api/tripo3d/status.js
// Vercel Serverless Function — proxies "poll task" calls to Tripo3D.
// See create.js for why this proxy exists (CORS + key secrecy).
//
// Usage: GET /api/tripo3d/status?taskId=xxxx[&apiKey=yyyy]

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.TRIPO3D_API_KEY || req.query?.apiKey;
    const taskId = req.query?.taskId;

    if (!apiKey) {
        return res.status(401).json({ error: 'No hay API key de Tripo3D configurada.' });
    }
    if (!taskId) {
        return res.status(400).json({ error: 'Falta "taskId" en la query string.' });
    }

    try {
        const tripoResponse = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${encodeURIComponent(taskId)}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
        });

        const data = await tripoResponse.json().catch(() => ({}));

        if (!tripoResponse.ok) {
            return res.status(tripoResponse.status).json({
                error: data?.message || data?.error || `Tripo3D respondió ${tripoResponse.status}`,
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('[api/tripo3d/status] error:', err);
        return res.status(502).json({ error: 'No se pudo contactar con Tripo3D: ' + err.message });
    }
}
