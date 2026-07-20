/**
 * pollinations-generator.js
 * Pollinations.ai integration for Assets_Maker.AI
 *
 * Why Pollinations (HuggingFace was removed — its free image-generation
 * tier became unreliable/discontinued for this use case):
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

    // Rough hex -> descriptive color name mapping so the prompt reads
    // naturally ("solid white background") instead of a raw hex code, which
    // diffusion models tend to ignore or misinterpret.
    function describeHexColor(hex) {
        if (!hex) return 'white';
        const h = hex.replace('#', '').toLowerCase();
        const map = {
            ffffff: 'pure white', '000000': 'pure black',
            '00ff00': 'chroma key green', '0f0': 'chroma key green',
            ff00ff: 'chroma key magenta', f0f: 'chroma key magenta',
            '00ffff': 'cyan',
        };
        if (map[h]) return map[h];
        // Fallback: parse RGB and describe roughly
        const r = parseInt(h.substring(0, 2), 16) || 0;
        const g = parseInt(h.substring(2, 4), 16) || 0;
        const b = parseInt(h.substring(4, 6), 16) || 0;
        if (r > 235 && g > 235 && b > 235) return 'pure white';
        if (r < 20 && g < 20 && b < 20) return 'pure black';
        return `solid flat color (RGB ${r},${g},${b})`;
    }

    // Item prompts trip up diffusion models more than characters do:
    // duplicated parts, a floating disembodied hand "holding" the item,
    // off-center/angled poses instead of a clean icon view, fused or
    // asymmetrical shapes. We add targeted boosters/negatives per item
    // CATEGORY rather than one generic "weapon" bucket — mixing categories
    // is what caused a bug where asking for "escudo" (shield) started
    // returning swords: Pollinations has no real negative-prompt parameter
    // (see note in buildPrompt), so "avoid: ..." is just plain text in the
    // same prompt, and any word we mention — even to say "no blade" — can
    // still leak into the image. So a shield prompt must never contain the
    // words "blade"/"sword" at all, in either direction. Bilingual (ES/EN)
    // since prompts here come from a Spanish-language UI.
    const ITEM_CATEGORIES = [
        {
            name: 'blade',
            keywords: ['espada', 'sable', 'katana', 'daga', 'puñal', 'cuchillo', 'machete', 'navaja',
                       'sword', 'dagger', 'blade', 'knife'],
            positive: ', single bladed weapon, one blade only, clean side profile icon view, symmetrical blade, sharp clean silhouette, no hand, no fingers, not held, floating in place, game inventory icon',
            negative: 'duplicate blade, two swords, extra blade, fused blade, mutated handle, floating fingers, holding hand, hand holding sword, asymmetrical blade, warped blade, bent blade, wrong perspective',
        },
        {
            name: 'polearmOrBlunt',
            keywords: ['lanza', 'hacha', 'maza', 'martillo de guerra', 'bastón', 'vara',
                       'axe', 'spear', 'mace', 'warhammer', 'staff', 'wand'],
            positive: ', single weapon, one item only, clean side profile icon view, symmetrical design, sharp clean silhouette, no hand, no fingers, not held, floating in place, game inventory icon',
            negative: 'duplicate weapon, two weapons, extra head, fused parts, mutated handle, floating fingers, holding hand, hand holding weapon, asymmetrical, warped shape, bent shape, wrong perspective',
        },
        {
            name: 'ranged',
            keywords: ['arco', 'ballesta', 'pistola', 'rifle', 'escopeta',
                       'bow', 'crossbow', 'gun', 'pistol', 'rifle'],
            positive: ', single ranged weapon, one item only, clean side profile icon view, symmetrical design, sharp clean silhouette, no hand, no fingers, not held, floating in place, game inventory icon',
            negative: 'duplicate weapon, two weapons, extra barrel, fused parts, floating fingers, holding hand, hand holding weapon, asymmetrical, warped shape, wrong perspective',
        },
        {
            name: 'shield',
            keywords: ['escudo', 'shield'],
            // Deliberately no mention of "blade"/"sword"/"weapon" anywhere
            // here, positive or negative — see comment above.
            positive: ', single shield, one item only, round or kite shield shape, seen from the front, symmetrical design, clean silhouette, no hand, no fingers, not held, floating in place, game inventory icon',
            negative: 'duplicate shield, two shields, extra straps, mutated shape, floating fingers, holding hand, asymmetrical, warped shape, wrong perspective',
        },
    ];

    function detectItemCategory(userPrompt) {
        const p = userPrompt.toLowerCase();
        return ITEM_CATEGORIES.find(cat => cat.keywords.some(kw => p.includes(kw))) || null;
    }

    function buildPrompt(userPrompt, style, negativePrompt, bgColor) {
        const styleTag = STYLE_PROMPT_SUFFIX[style] || STYLE_PROMPT_SUFFIX.realistic;
        const bgDescription = bgColor ? describeHexColor(bgColor) : 'plain';
        const itemCategory = detectItemCategory(userPrompt);
        // Being explicit about a SINGLE, FLAT, SHADOWLESS backdrop is what
        // actually matters for chroma-keying afterwards — a vague "isolated
        // on plain background" often still gets soft gradients/shadows that
        // don't key out cleanly.
        let enhanced = `${userPrompt}, game asset, centered composition, high detail${styleTag}${itemCategory ? itemCategory.positive : ''}, isolated on a single solid ${bgDescription} background, flat uniform background color, no gradient, no shadow on background, no texture on background, studio product shot lighting`;
        const combinedNegative = itemCategory
            ? (negativePrompt ? `${itemCategory.negative}, ${negativePrompt}` : itemCategory.negative)
            : negativePrompt;
        if (combinedNegative) {
            // Pollinations has no dedicated negative-prompt parameter, so we
            // fold it into the text prompt as a soft hint instead.
            enhanced += `, avoid: ${combinedNegative}`;
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
    async function generate({ prompt, style = 'realistic', negativePrompt = '', width = 512, height = 512, seed = null, bgColor = null, onProgress = null }) {
        const model = STYLE_MODEL_MAP[style] || 'flux';
        const enhancedPrompt = buildPrompt(prompt, style, negativePrompt, bgColor);

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
