/**
 * hf-generator.js
 * HuggingFace Inference API integration for Assets_Maker.AI
 * Supports multiple tokens with automatic rotation and retry logic.
 *
 * Models used:
 *  - Primary: stabilityai/stable-diffusion-xl-base-1.0  (SDXL - best quality)
 *  - Fallback: black-forest-labs/FLUX.1-schnell         (Fast high quality)
 *  - Fallback2: stabilityai/stable-diffusion-2-1        (Always available)
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

    // --- Model Endpoints ---
    const MODELS = [
        // FLUX.1-schnell — fast, very high quality, runs well on free tier
        'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
        // SDXL — top quality
        'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
        // SD 2.1 — reliable fallback
        'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1',
        // Anything v4 — great for game art / anime style
        'https://api-inference.huggingface.co/models/xyn-ai/anything-v4.0',
        // Dreamshaper — great for characters
        'https://api-inference.huggingface.co/models/Lykon/dreamshaper-8',
    ];

    // Style→model preference mapping
    const STYLE_MODEL_MAP = {
        pixel:    [2, 3, 4],   // SD2.1 + Anything + Dreamshaper work well for pixel
        vector:   [1, 0, 2],   // SDXL best for vector/clean art
        cartoon:  [3, 4, 0],   // Anything + Dreamshaper for cartoon/anime
        realistic:[0, 1, 2],   // FLUX first, SDXL second for realistic
        voxel:    [2, 4, 1],   // SD2.1 + Dreamshaper for voxel art
    };

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
     * Call a single HF inference endpoint
     * Returns a Blob (image) or throws on error.
     */
    async function callModel(modelUrl, positivePrompt, negativePrompt, width, height, guidanceScale, token) {
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

        const modelOrder = STYLE_MODEL_MAP[style] || STYLE_MODEL_MAP.realistic;
        let lastError = null;

        for (let mi = 0; mi < modelOrder.length; mi++) {
            const modelIdx = modelOrder[mi];
            const modelUrl = MODELS[modelIdx];
            const modelName = modelUrl.split('/models/')[1];

            // Try up to 3 different tokens per model
            for (let ti = 0; ti < Math.min(3, TOKENS.length); ti++) {
                const token = getNextToken();

                if (onProgress) onProgress(
                    Math.round(10 + (mi * 30) + (ti * 5)),
                    `Intentando ${modelName} (token ${ti + 1})...`
                );

                try {
                    const blob = await callModel(modelUrl, positive, negative, width, height, guidanceScale, token);
                    const dataUrl = await blobToDataUrl(blob);

                    if (onProgress) onProgress(100, '¡Imagen generada con éxito!');
                    return { dataUrl, modelUsed: modelName };
                } catch (err) {
                    lastError = err;
                    console.warn(`[HFGenerator] ${modelName} failed with token ${ti}: ${err.message}`);

                    // If rate limited (429), rotate token; if model loading (503), wait briefly
                    if (err.message.includes('503')) {
                        if (onProgress) onProgress(
                            Math.round(15 + (mi * 25)),
                            `Modelo cargando, esperando...`
                        );
                        await sleep(5000);
                    } else if (err.message.includes('429')) {
                        // Rate limit — try next token immediately
                        continue;
                    } else if (err.message.includes('timeout') || err.message.includes('aborted')) {
                        if (onProgress) onProgress(
                            Math.round(20 + (mi * 25)),
                            'Tiempo de espera agotado, probando otro modelo...'
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
    return { generate, MODELS, TOKENS };
})();

// Make globally available
window.HFGenerator = HFGenerator;
