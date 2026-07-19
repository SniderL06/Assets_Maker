/**
 * pollinations-generator.js
 * Pollinations.ai integration for Assets_Maker.AI
 *
 * Why this instead of (or before) HuggingFace:
 *  - No API key / no secret required for the anonymous tier, so nothing to
 *    leak in client-side code. Auth is just a "referrer" hint, which is
 *    public by design.
 *  - One simple GET request returns the image directly — no separate
 *    "which provider serves this model" lookup needed.
 *
 * Trade-offs to keep in mind:
 *  - Anonymous tier is rate-limited to ~1 request every 15 seconds, and may
 *    stamp a small watermark on the image (register at auth.pollinations.ai
 *    and pass a token to lift both limits — out of scope for this client-only
 *    integration, see the note in generate()).
 *  - There's no documented negative_prompt parameter, so negativePrompt is
 *    folded into the main prompt as an "avoid:" hint instead of a real
 *    negative-prompt conditioning pass.
 */

const PollinationsGenerator = (() => {
    const BASE_URL = 'https://image.pollinations.ai/prompt/';

    // Pollinations model catalogue changes over time; these two are the
    // long-standing general-purpose options. 'flux' = best quality,
    // 'turbo' = faster, both fine for game-asset-sized images.
    const STYLE_MODEL_MAP = {
        pixel: 'turbo',
        vector: 'flux',
        cartoon: 'flux',
        realistic: 'flux',
        voxel: 'turbo',
    };

    const STYLE_PROMPT_SUFFIX = {
        pixel: ', pixel art, 8-bit, retro game sprite, flat colors, pixel perfect, game asset, transparent background',
        vector: ', vector art, clean lines, flat design, SVG style, sharp edges, minimalist, game icon',
        cartoon: ', cartoon style, cel shaded, vibrant colors, thick outlines, animated series style, expressive',
        realistic: ', highly detailed, photorealistic, cinematic lighting, 8k, ray tracing, physically based rendering, professional render',
        voxel: ', voxel art, isometric, 3D pixel, low poly, minecraft style, cuboid, game asset',
    };

    function buildPrompt(userPrompt, style, negativePrompt) {
        const styleTag = STYLE_PROMPT_SUFFIX[style] || STYLE_PROMPT_SUFFIX.realistic;
        let enhanced = `${userPrompt}, game asset, isolated on plain background, centered composition, high detail${styleTag}`;
        if (negativePrompt) {
            // Pollinations has no dedicated negative-prompt parameter, so we
            // fold it into the text prompt as a soft hint instead.
            enhanced += `, avoid: ${negativePrompt}`;
        }
        return enhanced;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate an image via Pollinations.
     * Returns { dataUrl, modelUsed } on success, throws on failure.
     * onProgress(percent, statusText) is called during the attempt.
     */
    async function generate({ prompt, style = 'realistic', negativePrompt = '', width = 512, height = 512, seed = null, onProgress = null }) {
        const model = STYLE_MODEL_MAP[style] || 'flux';
        const enhancedPrompt = buildPrompt(prompt, style, negativePrompt);

        const params = new URLSearchParams({
            model,
            width: String(Math.min(Math.max(width, 256), 1024)),
            height: String(Math.min(Math.max(height, 256), 1024)),
            nologo: 'true',
            safe: 'true',
            // Public-by-design app identifier — not a secret, safe to leave in client code.
            referrer: (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'assets-maker-ai'
        });
        if (seed !== null && seed !== undefined) params.set('seed', String(seed));

        const url = `${BASE_URL}${encodeURIComponent(enhancedPrompt)}?${params.toString()}`;

        // The anonymous tier allows roughly 1 request/15s. If we get rate
        // limited (429) we back off and retry a couple of times rather than
        // failing immediately.
        const maxAttempts = 3;
        let lastError = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (onProgress) onProgress(15 + attempt * 25, attempt === 0 ? 'Enviando prompt a Pollinations...' : `Reintentando (${attempt + 1}/${maxAttempts})...`);

            try {
                const response = await fetch(url, { signal: AbortSignal.timeout(60000) });

                if (response.status === 429) {
                    lastError = new Error('Límite de velocidad (429): la capa gratuita anónima permite ~1 solicitud cada 15s.');
                    if (onProgress) onProgress(30 + attempt * 20, 'Límite de velocidad, esperando 15s...');
                    await sleep(15000);
                    continue;
                }

                if (!response.ok) {
                    const bodyText = await response.text().catch(() => '');
                    throw new Error(`Pollinations error ${response.status}: ${bodyText.slice(0, 200)}`);
                }

                const contentType = response.headers.get('content-type') || '';
                if (!contentType.startsWith('image/')) {
                    throw new Error(`Respuesta no es una imagen: ${contentType}`);
                }

                const blob = await response.blob();
                const dataUrl = await blobToDataUrl(blob);

                if (onProgress) onProgress(100, '¡Imagen generada con éxito!');
                return { dataUrl, modelUsed: `pollinations/${model}` };

            } catch (err) {
                lastError = err;
                if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                    lastError = new Error('Tiempo de espera agotado contactando Pollinations.');
                }
                // Network/CORS failures won't benefit from retrying immediately
                if (!String(lastError.message).includes('429')) break;
            }
        }

        throw lastError || new Error('Pollinations falló sin detalle de error');
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    return { generate };
})();

// Make globally available
window.PollinationsGenerator = PollinationsGenerator;
