/**
 * hf-generator.js
 * HuggingFace Inference API integration for Assets_Maker.AI
 * Supports multiple tokens with automatic rotation and retry logic.
 *
 * IMPORTANT (2026): Hugging Face's own free "hf-inference" provider now mostly
 * serves small CPU models (embeddings, classification, tiny LLMs) — it does
 * NOT serve big image models like SDXL/FLUX anymore. Image generation is
 * served by third-party "Inference Providers" (fal-ai, Together, Replicate,
 * etc.) behind the same router, and WHICH provider serves a given model
 * changes over time. So instead of hardcoding a provider name (which breaks
 * whenever HF's provider lineup changes), we ask the Hub API which provider
 * currently serves each model before calling it.
 */

const HFGenerator = (() => {
    // --- Token Pool ---
    const TOKENS = [
        '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',
        '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',
        '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',
        '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',
        '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',
        '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',
        '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',
        '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',
        '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',
        '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'
    ];

    let currentTokenIndex = 0;

    function getNextToken() {
        const token = TOKENS[currentTokenIndex];
        currentTokenIndex = (currentTokenIndex + 1) % TOKENS.length;
        return token;
    }

    // --- Candidate models, tried in this order regardless of style ---
    // (style-specialized community checkpoints like anything-v4/dreamshaper
    // are no longer reliably served by any provider through the free router,
    // so we stick to actively-maintained models that Inference Providers do
    // carry as of 2026.)
    const MODEL_IDS = [
        'black-forest-labs/FLUX.1-schnell',
        'black-forest-labs/FLUX.1-dev',
        'stabilityai/stable-diffusion-3.5-large-turbo',
        'stabilityai/stable-diffusion-xl-base-1.0',
    ];

    // Cache of resolved providers so we don't re-query the Hub API on every
    // single generation for the same model.
    const providerCache = new Map();

    /**
     * Ask the HF Hub API which Inference Provider currently serves this
     * model for the text-to-image task, and return its provider id
     * (e.g. "fal-ai"). Throws if nothing currently serves it.
     */
    async function resolveProvider(modelId, token) {
        if (providerCache.has(modelId)) return providerCache.get(modelId);

        const infoUrl = `https://huggingface.co/api/models/${modelId}?expand[]=inferenceProviderMapping`;
        const res = await fetch(infoUrl, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!res.ok) {
            throw new Error(`No se pudo consultar proveedores para ${modelId}: ${res.status}`);
        }
        const data = await res.json();
        const mapping = data.inferenceProviderMapping || {};

        // Prefer a provider whose status is "live" for the text-to-image task.
        const entries = Object.entries(mapping);
        const live = entries.find(([, info]) => (info.status === 'live') && (!info.task || info.task === 'text-to-image'));
        const chosen = live || entries[0];
        if (!chosen) {
            throw new Error(`Ningún proveedor sirve actualmente ${modelId} (puede haber sido retirado)`);
        }

        providerCache.set(modelId, chosen[0]);
        return chosen[0];
    }

    // --- Style → prompt enhancement ---
    const STYLE_PROMPT_SUFFIX = {
        pixel: ', pixel art, 8-bit, retro game sprite, flat colors, pixel perfect, game asset, transparent background',
        vector: ', vector art, clean lines, flat design, SVG style, sharp edges, minimalist, game icon',
        cartoon: ', cartoon style, cel shaded, vibrant colors, thick outlines, animated series style, expressive',
        realistic: ', highly detailed, photorealistic, cinematic lighting, 8k, ray tracing, physically based rendering, professional render',
        voxel: ', voxel art, isometric, 3D pixel, low poly, minecraft style, cuboid, game asset',
    };

    const NEGATIVE_PROMPT_BASE = 'blurry, bad anatomy, deformed, ugly, low quality, watermark, text, signature, extra limbs, missing limbs, cropped, worst quality, jpeg artifacts, noise, overexposed, underexposed';

    /**
     * Enhance prompt for style and subject
     */
    function buildPrompt(userPrompt, style, negativePrompt) {
        const styleTag = STYLE_PROMPT_SUFFIX[style] || STYLE_PROMPT_SUFFIX.realistic;
        const enhancedPositive = `${userPrompt}, game asset, isolated on transparent background, centered composition, high detail${styleTag}`;
        const enhancedNegative = `${NEGATIVE_PROMPT_BASE}${negativePrompt ? ', ' + negativePrompt : ''}`;
        return { positive: enhancedPositive, negative: enhancedNegative };
    }

    /**
     * Call a single HF inference endpoint (after resolving its live provider)
     * Returns a Blob (image) or throws on error.
     */
    async function callModel(modelId, positivePrompt, negativePrompt, width, height, guidanceScale, token) {
        let provider;
        try {
            provider = await resolveProvider(modelId, token);
        } catch (resolveErr) {
            throw new Error(`No disponible: ${resolveErr.message}`);
        }

        const modelUrl = `https://router.huggingface.co/${provider}/models/${modelId}`;
        const body = {
            inputs: positivePrompt,
            parameters: {
                negative_prompt: negativePrompt,
                width: Math.min(width, 1024),
                height: Math.min(height, 1024),
                guidance_scale: guidanceScale,
                num_inference_steps: 30,
                num_images_per_prompt: 1
            }
        };

        let response;
        try {
            response = await fetch(modelUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Wait-For-Model': 'true'
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(90000) // 90s timeout
            });
        } catch (fetchErr) {
            // No hay proxy de respaldo: los proxies CORS públicos no reenvían
            // cabeceras Authorization, así que nunca funcionan aquí. Si esto falla,
            // suele ser un problema de red/DNS o de que el token no es válido.
            throw new Error(`No se pudo contactar con ${modelUrl}: ${fetchErr.message}`);
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            // Surface billing/permission problems distinctly from "not supported"
            if (response.status === 402) {
                throw new Error(`Pago requerido (402) en el proveedor "${provider}": necesitas créditos/facturación activados en huggingface.co/settings/inference-providers`);
            }
            if (response.status === 403) {
                throw new Error(`Sin permiso (403) en el proveedor "${provider}": revisa que el token tenga el permiso "Make calls to Inference Providers"`);
            }
            // A provider we thought was "live" can still reject the request — drop
            // it from the cache so the next attempt re-resolves instead of retrying
            // the same dead combination.
            if (response.status === 400 || response.status === 404) {
                providerCache.delete(modelId);
            }
            throw new Error(`Model error ${response.status}: ${errorText.slice(0, 200)}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            throw new Error(`Non-image response: ${contentType}`);
        }

        return await response.blob();
    }

    /**
     * Generate image with fallback chain across models and tokens.
     * Calls onProgress(percent, statusText) during generation.
     * Returns { dataUrl: string, modelUsed: string } on success.
     * Throws Error on total failure.
     */
    async function generate({ prompt, style = 'realistic', negativePrompt = '', width = 512, height = 512, guidanceScale = 7.5, onProgress = null }) {
        const { positive, negative } = buildPrompt(prompt, style, negativePrompt);

        let lastError = null;

        for (let mi = 0; mi < MODEL_IDS.length; mi++) {
            const modelId = MODEL_IDS[mi];

            // Try up to 3 different tokens per model
            for (let ti = 0; ti < Math.min(3, TOKENS.length); ti++) {
                const token = getNextToken();

                if (onProgress) onProgress(
                    Math.round(10 + (mi * 20) + (ti * 5)),
                    `Intentando ${modelId} (token ${ti + 1})...`
                );

                try {
                    const blob = await callModel(modelId, positive, negative, width, height, guidanceScale, token);
                    const dataUrl = await blobToDataUrl(blob);

                    if (onProgress) onProgress(100, '¡Imagen generada con éxito!');
                    return { dataUrl, modelUsed: modelId };
                } catch (err) {
                    lastError = err;
                    console.warn(`[HFGenerator] ${modelId} failed with token ${ti}: ${err.message}`);

                    // If rate limited (429), rotate token; if model loading (503), wait briefly
                    if (err.message.includes('503')) {
                        if (onProgress) onProgress(
                            Math.round(15 + (mi * 20)),
                            `Modelo cargando, esperando...`
                        );
                        await sleep(5000);
                    } else if (err.message.includes('429')) {
                        // Rate limit — try next token immediately
                        continue;
                    } else if (err.message.includes('timeout') || err.message.includes('aborted') || err.message.includes('No disponible')) {
                        if (onProgress) onProgress(
                            Math.round(20 + (mi * 20)),
                            'Modelo no disponible, probando otro...'
                        );
                        break; // Try next model
                    }
                }
            }
        }

        throw new Error(lastError ? lastError.message : 'Todos los modelos fallaron');
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Public API
    return { generate, MODEL_IDS, TOKENS };
})();

// Make globally available
window.HFGenerator = HFGenerator;
