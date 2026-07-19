/**
 * tripo3d-generator.js
 * Assets_Maker.AI — Tripo3D text-to-3D generation module
 *
 * Tripo3D API (https://platform.tripo3d.ai)
 *  - POST /v2/openapi/task           → submit generation task
 *  - GET  /v2/openapi/task/{task_id} → poll for completion
 *  - Returns a GLB download URL when finished
 *
 * Free tier: 200 credits on sign-up. 1 generation ≈ 1-3 credits.
 * Get your key at: https://platform.tripo3d.ai
 *
 * IMPORTANT — this file no longer calls api.tripo3d.ai directly from the
 * browser. That API doesn't send CORS headers for browser origins, so a
 * direct fetch() from here gets silently blocked. Instead we call our own
 * same-origin serverless proxy (/api/tripo3d/create and /api/tripo3d/status,
 * see those files) which forwards the request server-side. This also means
 * the key doesn't need to sit exposed in the browser's Network tab.
 */

const Tripo3DGenerator = (() => {
    'use strict';

    const BASE_URL = '/api/tripo3d'; // same-origin proxy, see /api/tripo3d/*.js
    const POLL_INTERVAL_MS = 3000;
    const MAX_POLL_ATTEMPTS = 60; // 3 min max

    let _apiKey = null;

    /** Set the API key (called from UI when user enters their key) */
    function setApiKey(key) {
        _apiKey = key ? key.trim() : null;
        if (_apiKey) {
            localStorage.setItem('tripo3d_api_key', _apiKey);
        }
    }

    /** Load stored API key from localStorage */
    function loadSavedKey() {
        const saved = localStorage.getItem('tripo3d_api_key');
        if (saved) _apiKey = saved;
        return _apiKey;
    }

    /** Check if we have a valid key */
    function hasKey() {
        return !!(loadSavedKey());
    }

    /** Submit a text-to-3D generation task */
    async function submitTask(prompt, styleHint = 'game') {
        const styleMap = {
            realistic: 'realistic',
            cartoon:   'cartoon',
            pixel:     'cartoon',
            vector:    'cartoon',
            voxel:     'voxel',
        };
        const tripoStyle = styleMap[styleHint] || 'cartoon';

        const body = {
            prompt: prompt,
            face_limit: 8000,  // keep polygon count manageable
            texture: true,
            pbr: true,
        };
        // Only forward a personal key if the user entered one — otherwise
        // the server-side TRIPO3D_API_KEY env var is used.
        if (_apiKey) body.apiKey = _apiKey;

        const response = await fetch(`${BASE_URL}/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            if (response.status === 401) throw new Error(data.error || 'API key inválida o no configurada. Verifica tu clave de Tripo3D o la variable TRIPO3D_API_KEY en Vercel.');
            if (response.status === 402) throw new Error('Sin créditos Tripo3D. Recarga tu cuenta en platform.tripo3d.ai');
            throw new Error(data.error || `Tripo3D error ${response.status}`);
        }

        if (!data.data?.task_id) throw new Error('Respuesta inesperada de Tripo3D.');
        return data.data.task_id;
    }

    /** Poll task until it completes or fails */
    async function pollTask(taskId, onProgress = null) {
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

            const qs = new URLSearchParams({ taskId });
            if (_apiKey) qs.set('apiKey', _apiKey);
            const response = await fetch(`${BASE_URL}/status?${qs.toString()}`);

            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `Poll error ${response.status}`);
            const task = data.data;

            const status   = task?.status;
            const progress = task?.progress ?? 0;

            if (onProgress) {
                onProgress(Math.round(10 + progress * 0.85), `Tripo3D: ${status} (${Math.round(progress)}%)`);
            }

            if (status === 'success') {
                // Find the glb download URL
                const glbUrl = task?.output?.pbr_model || task?.output?.model;
                if (!glbUrl) throw new Error('Modelo generado pero sin URL de descarga.');
                return glbUrl;
            }

            if (status === 'failed' || status === 'cancelled') {
                throw new Error(`Tripo3D falló: ${task?.error_message || status}`);
            }
        }
        throw new Error('Tripo3D tardó demasiado (timeout 3 minutos).');
    }

    /**
     * Main entry point: generate a 3D model and load it into a Three.js scene.
     * Returns { scene: THREE.Group, glbUrl: string }
     */
    async function generateAndLoad(prompt, { styleHint = 'cartoon', scene, onProgress } = {}) {
        if (onProgress) onProgress(5, 'Enviando prompt a Tripo3D...');
        const taskId = await submitTask(prompt, styleHint);

        if (onProgress) onProgress(10, `Tarea creada (${taskId.slice(0, 8)}...). Procesando en la nube...`);
        const glbUrl = await pollTask(taskId, onProgress);

        if (onProgress) onProgress(96, 'Descargando modelo GLB...');
        const model = await loadGLB(glbUrl);

        if (onProgress) onProgress(100, 'Modelo 3D cargado exitosamente.');
        return { model, glbUrl };
    }

    /** Load a GLB from URL using Three.js GLTFLoader */
    async function loadGLB(url) {
        return new Promise((resolve, reject) => {
            // GLTFLoader must be available (loaded via CDN in index.html)
            const loader = new THREE.GLTFLoader();
            loader.load(
                url,
                (gltf) => {
                    const model = gltf.scene;
                    // Auto-center and scale to unit size
                    const box = new THREE.Box3().setFromObject(model);
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const scale = 1.8 / maxDim;
                    model.scale.setScalar(scale);

                    const center = box.getCenter(new THREE.Vector3());
                    model.position.sub(center.multiplyScalar(scale));
                    model.position.y += 0.05;

                    // Enable shadows on all meshes
                    model.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow    = true;
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

    return {
        setApiKey,
        loadSavedKey,
        hasKey,
        generateAndLoad,
    };
})();
