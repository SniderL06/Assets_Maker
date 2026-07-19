// /api/tripo3d/create.js
// Vercel Serverless Function — proxies "create task" calls to Tripo3D.
//
// WHY THIS EXISTS:
// The browser cannot call api.tripo3d.ai directly. Tripo3D's API is meant
// for server-to-server use and does not return the CORS headers a browser
// requires, so a client-side fetch() to it is blocked before your code ever
// sees a response. Routing the call through this same-origin endpoint fixes
// that, and also means the real API key never has to sit in localStorage or
// be visible in the browser's Network tab.
//
// SETUP:
// In your Vercel project settings → Environment Variables, add:
//   TRIPO3D_API_KEY = <your key from platform.tripo3d.ai>
// Redeploy after adding it.
//
// If you'd rather let each visitor use their OWN Tripo3D key (e.g. a public
// demo where you don't want to pay for everyone's credits), the front-end
// can still send one in the request body as `apiKey` — it's used as a
// fallback only if TRIPO3D_API_KEY isn't set server-side.

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.TRIPO3D_API_KEY || req.body?.apiKey;
    if (!apiKey) {
        return res.status(401).json({
            error: 'No hay API key de Tripo3D configurada. Añade TRIPO3D_API_KEY en las variables de entorno de Vercel, o envía una clave personal desde el cliente.'
        });
    }

    const { prompt, face_limit, texture, pbr } = req.body || {};
    if (!prompt) {
        return res.status(400).json({ error: 'Falta "prompt" en el cuerpo de la petición.' });
    }

    try {
        const tripoResponse = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'text_to_model',
                prompt,
                face_limit: face_limit ?? 8000,
                texture: texture ?? true,
                pbr: pbr ?? true,
            }),
        });

        const data = await tripoResponse.json().catch(() => ({}));

        if (!tripoResponse.ok) {
            return res.status(tripoResponse.status).json({
                error: data?.message || data?.error || `Tripo3D respondió ${tripoResponse.status}`,
            });
        }

        return res.status(200).json(data);
    } catch (err) {
        console.error('[api/tripo3d/create] error:', err);
        return res.status(502).json({ error: 'No se pudo contactar con Tripo3D: ' + err.message });
    }
}
