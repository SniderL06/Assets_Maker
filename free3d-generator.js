/**
 * free3d-generator.js
 * Assets_Maker.AI — 100% free image-to-3D conversion
 *
 * Uses the public "stabilityai/TripoSR" Hugging Face Space (open-source,
 * MIT-licensed TripoSR model) through the official Gradio JS client. No API
 * key, no account, no signup required.
 *
 * HOW IT WORKS
 * TripoSR is IMAGE-to-3D, not text-to-3D. So instead of sending your text
 * prompt to a paid cloud API, we take the 2D asset you already generated
 * (with Pollinations) and already have on the canvas — including the
 * transparent background we cut out ourselves — and turn THAT into a 3D
 * mesh. This is why the "Generar 3D" button now works directly off of
 * whatever is currently drawn on the 2D canvas instead of asking for a
 * separate prompt.
 *
 * COST / LIMITS (be aware of these — it's free, not unlimited):
 *  - The Space runs on Hugging Face's "ZeroGPU" shared infrastructure.
 *    Anonymous visitors (no HF account) get a small daily GPU quota
 *    (a couple of minutes worth of compute — enough for a handful of
 *    generations per day). If you hit the quota you'll get a clear error;
 *    it resets after 24h.
 *  - It's noticeably slower than a paid API: usually 20-90 seconds,
 *    more if the Space is busy with other users' requests.
 *  - Quality/detail is more basic than commercial options like Tripo3D —
 *    it's a fast, real-time-oriented reconstruction model, not a
 *    high-fidelity one.
 *  - This calls a community-run public Space directly from the browser.
 *    If HuggingFace or the Space maintainers change the underlying
 *    app's function names, this integration may need a small update —
 *    check https://huggingface.co/spaces/stabilityai/TripoSR is still
 *    "Running" if generation stops working.
 */

const Free3DGenerator = (() => {
    'use strict';

    const SPACE_ID = 'stabilityai/TripoSR';
    // Pinning a version keeps this from silently breaking on a future
    // @gradio/client release; bump manually if you want newer client fixes.
    const GRADIO_CLIENT_CDN = 'https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js';

    let _clientModulePromise = null;
    let _connectedClientPromise = null;

    // Dynamic import works fine from inside a plain <script> (non-module) —
    // no need to change how this file is included in index.html.
    function loadGradioClientModule() {
        if (!_clientModulePromise) {
            _clientModulePromise = import(GRADIO_CLIENT_CDN);
        }
        return _clientModulePromise;
    }

    async function getClient() {
        if (!_connectedClientPromise) {
            _connectedClientPromise = (async () => {
                const { Client } = await loadGradioClientModule();
                return Client.connect(SPACE_ID);
            })();
        }
        return _connectedClientPromise;
    }

    /**
     * Opens a brand-new connection to the Space, bypassing the cached
     * client. Used before the /generate call because reusing the same
     * client/session across two sequential predict() calls was causing
     * the queue connection opened for /preprocess to be silently closed
     * afterwards — leaving the second predict() awaiting a dead
     * connection forever with no error and no new network request.
     */
    async function getFreshClient() {
        const { Client } = await loadGradioClientModule();
        return Client.connect(SPACE_ID);
    }

    /**
     * Wraps a promise so that instead of hanging forever if the ZeroGPU
     * queue stalls (quota exhausted, Space overloaded, dropped connection),
     * it rejects with a clear, actionable error after `ms` milliseconds.
     * Without this, client.predict() can sit unresolved indefinitely with
     * no network activity and no console error — exactly the "stuck at
     * 50%" symptom this fixes.
     */
    function withTimeout(promise, ms, timeoutMessage) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    /** Turns the current 2D canvas into a PNG Blob/File for upload. */
    function canvasToFile(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) return reject(new Error('No se pudo convertir el lienzo a imagen.'));
                resolve(new File([blob], 'asset.png', { type: 'image/png' }));
            }, 'image/png');
        });
    }

    /**
     * Convert the 2D asset currently on `canvas` into a 3D GLB model.
     * Returns { model: THREE.Group, glbUrl } — same shape the old
     * Tripo3D integration returned, so the calling code barely changes.
     */
    async function generateAndLoad(canvas, { onProgress } = {}) {
        if (onProgress) onProgress(5, 'Conectando con el Space gratuito de TripoSR...');
        const client = await getClient();

        if (onProgress) onProgress(15, 'Subiendo tu asset 2D...');
        const imageFile = await canvasToFile(canvas);

        // Our own background removal already produced a clean cutout, so we
        // tell TripoSR NOT to re-run its own background remover — it will
        // just composite our transparent PNG onto a neutral gray, which is
        // exactly what it expects for a pre-segmented image.
        if (onProgress) onProgress(30, 'Preprocesando imagen (TripoSR)...');
        // NOTA: se usa el formato posicional (array) en vez de un objeto con
        // nombres de clave. La metadata de la API de este Space no expone
        // `parameter_name` de forma fiable para cada parámetro, lo que hace
        // que el cliente de Gradio falle al mapear claves con nombre
        // ("No value provided for required parameter: undefined"). El orden
        // debe coincidir exactamente con la firma real en app.py:
        // def preprocess(input_image, do_remove_background, foreground_ratio)
        const preprocessResult = await withTimeout(
            client.predict('/preprocess', [
                imageFile,
                false, // do_remove_background
                0.9,   // foreground_ratio
            ]),
            45000,
            'TripoSR no respondió al preprocesar la imagen en 45s. El Space puede estar saturado o haberse cerrado la cola silenciosamente — intenta de nuevo en unos minutos, o revisa https://huggingface.co/spaces/stabilityai/TripoSR directamente.'
        );
        const processedImage = preprocessResult?.data?.[0];
        if (!processedImage) throw new Error('TripoSR no devolvió una imagen preprocesada.');

        if (onProgress) onProgress(50, 'Generando malla 3D (puede tardar 20-90s)...');
        // Fresh connection here on purpose — see getFreshClient() comment.
        const generateClient = await getFreshClient();
        // def generate(image, mc_resolution, formats=["obj", "glb"])
        const generateResult = await withTimeout(
            generateClient.predict('/generate', [
                processedImage,
                256, // mc_resolution
            ]),
            120000,
            'TripoSR no terminó de generar la malla 3D en 2 minutos. Esto casi siempre significa que se agotó la cuota gratuita diaria de GPU (ZeroGPU) para visitantes anónimos, o que el Space está muy saturado ahora mismo. Prueba de nuevo más tarde, o entra a https://huggingface.co/spaces/stabilityai/TripoSR para comprobar el estado del Space.'
        );
        // outputs=[output_model_obj, output_model_glb] in that order
        const glbFile = generateResult?.data?.[1];
        const glbUrl = glbFile?.url || glbFile?.path;
        if (!glbUrl) throw new Error('TripoSR no devolvió un archivo GLB descargable.');

        if (onProgress) onProgress(90, 'Descargando modelo GLB...');
        const model = await loadGLB(glbUrl);

        if (onProgress) onProgress(100, 'Modelo 3D generado.');
        return { model, glbUrl };
    }

    /** Load a GLB from URL using Three.js GLTFLoader (same as before). */
    async function loadGLB(url) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            loader.load(
                url,
                (gltf) => {
                    const model = gltf.scene;
                    const box = new THREE.Box3().setFromObject(model);
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z) || 1;
                    const scale = 1.8 / maxDim;
                    model.scale.setScalar(scale);

                    const center = box.getCenter(new THREE.Vector3());
                    model.position.sub(center.multiplyScalar(scale));
                    model.position.y += 0.05;

                    model.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    resolve(model);
                },
                null,
                (err) => reject(new Error(`No se pudo cargar el GLB: ${err.message || err}`))
            );
        });
    }

    return { generateAndLoad };
})();

window.Free3DGenerator = Free3DGenerator;
