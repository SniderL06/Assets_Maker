/**
 * farmventure-world.js
 * Comprehensive 3D World Diorama & Asset Palette System for Assets_Maker.AI
 * Integrates assets from E:\Farmventure (Kenney Nature Kit, Farm, Dungeon, etc.)
 */

const FarmventureWorld = (() => {
    'use strict';

    // Base path for assets
    const ASSET_BASE = 'E:/Farmventure/';

    // Catalog of available models by category
    const ASSET_CATALOG = {
        nature: [
            { id: 'tree_pineTallA', name: 'Pino Alto', file: 'kenney_nature-kit/Models/GLTF format/tree_pineTallA.glb', category: 'Bosque' },
            { id: 'tree_oak', name: 'Roble Frondoso', file: 'kenney_nature-kit/Models/GLTF format/tree_oak.glb', category: 'Bosque' },
            { id: 'tree_detailed', name: 'Árbol Detallado', file: 'kenney_nature-kit/Models/GLTF format/tree_detailed.glb', category: 'Bosque' },
            { id: 'tree_palmTall', name: 'Palmera Alta', file: 'kenney_nature-kit/Models/GLTF format/tree_palmTall.glb', category: 'Playa' },
            { id: 'rock_largeA', name: 'Roca Grande', file: 'kenney_nature-kit/Models/GLTF format/rock_largeA.glb', category: 'Rocas' },
            { id: 'rock_tallA', name: 'Roca Alta', file: 'kenney_nature-kit/Models/GLTF format/rock_tallA.glb', category: 'Rocas' },
            { id: 'cliff_waterfall_rock', name: 'Cascada', file: 'kenney_nature-kit/Models/GLTF format/cliff_waterfall_rock.glb', category: 'Agua' },
            { id: 'cliff_waterfallTop_rock', name: 'Cascada Cima', file: 'kenney_nature-kit/Models/GLTF format/cliff_waterfallTop_rock.glb', category: 'Agua' },
            { id: 'bridge_wood', name: 'Puente de Madera', file: 'kenney_nature-kit/Models/GLTF format/bridge_wood.glb', category: 'Estructuras' },
            { id: 'bridge_stone', name: 'Puente de Piedra', file: 'kenney_nature-kit/Models/GLTF format/bridge_stone.glb', category: 'Estructuras' },
            { id: 'ground_riverStraight', name: 'Río Recto', file: 'kenney_nature-kit/Models/GLTF format/ground_riverStraight.glb', category: 'Agua' },
            { id: 'ground_riverBend', name: 'Río Curvo', file: 'kenney_nature-kit/Models/GLTF format/ground_riverBend.glb', category: 'Agua' },
            { id: 'flower_redA', name: 'Flor Roja', file: 'kenney_nature-kit/Models/GLTF format/flower_redA.glb', category: 'Detalles' },
            { id: 'flower_purpleA', name: 'Flor Púrpura', file: 'kenney_nature-kit/Models/GLTF format/flower_purpleA.glb', category: 'Detalles' },
            { id: 'mushroom_redGroup', name: 'Hongos Rojos', file: 'kenney_nature-kit/Models/GLTF format/mushroom_redGroup.glb', category: 'Detalles' },
            { id: 'campfire_stones', name: 'Fogata de Piedras', file: 'kenney_nature-kit/Models/GLTF format/campfire_stones.glb', category: 'Estructuras' },
            { id: 'tent_detailedClosed', name: 'Tienda de Campaña', file: 'kenney_nature-kit/Models/GLTF format/tent_detailedClosed.glb', category: 'Estructuras' },
            { id: 'crop_pumpkin', name: 'Calabaza', file: 'kenney_nature-kit/Models/GLTF format/crop_pumpkin.glb', category: 'Cultivos' },
            { id: 'crops_cornStageD', name: 'Maíz Maduro', file: 'kenney_nature-kit/Models/GLTF format/crops_cornStageD.glb', category: 'Cultivos' },
            { id: 'fence_simple', name: 'Cerca Simple', file: 'kenney_nature-kit/Models/GLTF format/fence_simple.glb', category: 'Estructuras' },
            { id: 'fence_gate', name: 'Portón de Cerca', file: 'kenney_nature-kit/Models/GLTF format/fence_gate.glb', category: 'Estructuras' },
            { id: 'log_stackLarge', name: 'Pila de Troncos', file: 'kenney_nature-kit/Models/GLTF format/log_stackLarge.glb', category: 'Detalles' }
        ]
    };

    // Cache of loaded GLTF templates
    const loadedTemplates = new Map();

    /** Load a single GLB model with promise caching */
    function loadGLBModel(path) {
        if (loadedTemplates.has(path)) {
            return Promise.resolve(loadedTemplates.get(path).clone());
        }
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            const fullUrl = path.startsWith('http') || path.startsWith('/') || path.includes(':')
                ? path
                : ASSET_BASE + path;

            loader.load(
                fullUrl,
                (gltf) => {
                    const scene = gltf.scene;
                    scene.traverse(child => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    loadedTemplates.set(path, scene);
                    resolve(scene.clone());
                },
                undefined,
                (err) => {
                    console.warn(`[FarmventureWorld] Could not load ${fullUrl}:`, err);
                    resolve(null); // Return null gracefully
                }
            );
        });
    }

    /** Procedural Animated Water Material */
    function createWaterMaterial(color = 0x3b82f6) {
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.1,
            metalness: 0.8,
            transparent: true,
            opacity: 0.82,
            envMapIntensity: 1.2
        });
    }

    /**
     * Build an intricate 3D World Diorama with Cliff, Waterfall, River, Deep Forest, Village & Lake
     */
    async function buildWorldDiorama(options = {}) {
        const group = new THREE.Group();
        group.name = 'farmventure_diorama_world';

        const theme = options.theme || 'forest'; // 'forest', 'autumn', 'mountain', 'farm'

        // 1. BASE TERRAIN (Multi-tiered landscape)
        const baseGeo = new THREE.BoxGeometry(10, 0.6, 10);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x2e2017, roughness: 0.9 });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.y = -0.3;
        baseMesh.receiveShadow = true;
        group.add(baseMesh);

        // Top Grass Surface
        const grassGeo = new THREE.BoxGeometry(9.9, 0.2, 9.9);
        const grassMat = new THREE.MeshStandardMaterial({
            color: theme === 'autumn' ? 0xd97706 : (theme === 'mountain' ? 0x475569 : 0x15803d),
            roughness: 0.8
        });
        const grassMesh = new THREE.Mesh(grassGeo, grassMat);
        grassMesh.position.y = 0.1;
        grassMesh.receiveShadow = true;
        group.add(grassMesh);

        // 2. CLIFF & WATERFALL ELEVATION (Back-Left)
        const cliffGroup = new THREE.Group();
        const cliffTileMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
        
        for (let x = -4; x <= -1; x += 1.2) {
            for (let z = -4; z <= -1; z += 1.2) {
                const height = 1.2 + Math.sin(x * z) * 0.3;
                const cliffGeo = new THREE.BoxGeometry(1.2, height, 1.2);
                const cliff = new THREE.Mesh(cliffGeo, cliffTileMat);
                cliff.position.set(x, height / 2 + 0.2, z);
                cliff.castShadow = true;
                cliff.receiveShadow = true;
                cliffGroup.add(cliff);
            }
        }
        group.add(cliffGroup);

        // 3. LAKE & RIVER BED
        // Lake (Front Right)
        const lakeGeo = new THREE.CylinderGeometry(2.2, 2.0, 0.15, 32);
        const waterMat = createWaterMaterial(0x2563eb);
        const lakeMesh = new THREE.Mesh(lakeGeo, waterMat);
        lakeMesh.position.set(2.2, 0.21, 2.0);
        group.add(lakeMesh);

        // Lake shore ring
        const shoreGeo = new THREE.RingGeometry(2.15, 2.5, 32);
        const shoreMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.95, side: THREE.DoubleSide });
        const shoreMesh = new THREE.Mesh(shoreGeo, shoreMat);
        shoreMesh.rotation.x = Math.PI / 2;
        shoreMesh.position.set(2.2, 0.215, 2.0);
        group.add(shoreMesh);

        // River Channel from Waterfall to Lake
        const riverGeo = new THREE.PlaneGeometry(0.9, 4.2);
        const riverMesh = new THREE.Mesh(riverGeo, waterMat);
        riverMesh.rotation.x = -Math.PI / 2;
        riverMesh.rotation.z = Math.PI / 4;
        riverMesh.position.set(0, 0.218, -0.2);
        group.add(riverMesh);

        // Waterfall Stream (flowing down from cliff)
        const wfGeo = new THREE.PlaneGeometry(0.8, 1.4);
        const wfMat = new THREE.MeshStandardMaterial({
            color: 0x60a5fa,
            roughness: 0.1,
            transparent: true,
            opacity: 0.88,
            side: THREE.DoubleSide
        });
        const wfMesh = new THREE.Mesh(wfGeo, wfMat);
        wfMesh.position.set(-1.8, 0.9, -1.8);
        wfMesh.rotation.y = Math.PI / 4;
        group.add(wfMesh);

        // Particle mist at waterfall base
        const mistGroup = new THREE.Group();
        const mistMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
        for (let i = 0; i < 8; i++) {
            const partGeo = new THREE.SphereGeometry(0.1 + Math.random() * 0.1, 8, 8);
            const part = new THREE.Mesh(partGeo, mistMat);
            part.position.set(-1.5 + (Math.random() - 0.5) * 0.4, 0.25 + Math.random() * 0.2, -1.5 + (Math.random() - 0.5) * 0.4);
            mistGroup.add(part);
        }
        group.add(mistGroup);

        // 4. LOAD AND PLACE ASSETS FROM E:\Farmventure\kenney_nature-kit
        const loadProms = [];

        // Deep Forest (Back Right)
        const forestPositions = [
            { path: 'kenney_nature-kit/Models/GLTF format/tree_pineTallA.glb', pos: [3.2, 0.2, -3.5], s: 0.8 },
            { path: 'kenney_nature-kit/Models/GLTF format/tree_pineDefaultB.glb', pos: [4.0, 0.2, -2.2], s: 0.75 },
            { path: 'kenney_nature-kit/Models/GLTF format/tree_oak.glb', pos: [2.0, 0.2, -3.8], s: 0.85 },
            { path: 'kenney_nature-kit/Models/GLTF format/tree_detailed.glb', pos: [3.8, 0.2, -4.2], s: 0.9 },
            { path: 'kenney_nature-kit/Models/GLTF format/rock_largeA.glb', pos: [2.5, 0.2, -2.6], s: 0.6 },
            { path: 'kenney_nature-kit/Models/GLTF format/mushroom_redGroup.glb', pos: [2.8, 0.2, -3.1], s: 0.7 },
            { path: 'kenney_nature-kit/Models/GLTF format/flower_purpleA.glb', pos: [3.4, 0.2, -2.8], s: 0.8 }
        ];

        // Cliff & Waterfall tops
        const cliffAssets = [
            { path: 'kenney_nature-kit/Models/GLTF format/tree_pineSmallA.glb', pos: [-3.2, 1.4, -3.2], s: 0.7 },
            { path: 'kenney_nature-kit/Models/GLTF format/rock_tallA.glb', pos: [-2.2, 1.4, -3.6], s: 0.65 }
        ];

        // River Bridge & Camp
        const campAssets = [
            { path: 'kenney_nature-kit/Models/GLTF format/bridge_wood.glb', pos: [0.1, 0.22, -0.1], s: 0.65, rotY: Math.PI / 4 },
            { path: 'kenney_nature-kit/Models/GLTF format/tent_detailedClosed.glb', pos: [-2.8, 0.2, 1.8], s: 0.75, rotY: Math.PI / 6 },
            { path: 'kenney_nature-kit/Models/GLTF format/campfire_stones.glb', pos: [-2.0, 0.2, 2.2], s: 0.7 },
            { path: 'kenney_nature-kit/Models/GLTF format/log_stackLarge.glb', pos: [-3.5, 0.2, 2.5], s: 0.6 }
        ];

        // Farm & Crops (Front Left)
        const farmAssets = [
            { path: 'kenney_nature-kit/Models/GLTF format/crop_pumpkin.glb', pos: [-3.5, 0.2, -0.5], s: 0.8 },
            { path: 'kenney_nature-kit/Models/GLTF format/crops_cornStageD.glb', pos: [-2.8, 0.2, -0.5], s: 0.8 },
            { path: 'kenney_nature-kit/Models/GLTF format/fence_simple.glb', pos: [-3.2, 0.2, 0.2], s: 0.7 },
            { path: 'kenney_nature-kit/Models/GLTF format/fence_gate.glb', pos: [-2.2, 0.2, 0.2], s: 0.7 }
        ];

        const allItems = [...forestPositions, ...cliffAssets, ...campAssets, ...farmAssets];

        for (const item of allItems) {
            loadProms.push(
                loadGLBModel(item.path).then(m => {
                    if (m) {
                        m.position.set(...item.pos);
                        m.scale.setScalar(item.s || 1);
                        if (item.rotY) m.rotation.y = item.rotY;
                        group.add(m);
                    }
                })
            );
        }

        await Promise.all(loadProms);
        return group;
    }

    /**
     * Create the Asset Palette UI tab for browsing and inserting E:\Farmventure 3D models into the scene
     */
    function renderAssetPaletteUI(containerEl, onSelectAsset) {
        if (!containerEl) return;

        containerEl.innerHTML = `
            <div class="farmventure-palette-header" style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(168,85,247,0.2);">
                <h4 style="margin: 0; font-size: 0.85rem; color: #c4b5fd; display: flex; align-items: center; gap: 6px;">
                    <i data-lucide="trees"></i> Colección Farmventure 3D
                </h4>
                <p style="margin: 4px 0 0 0; font-size: 0.7rem; color: var(--text-muted);">Haz clic en cualquier asset para agregarlo al mundo 3D</p>
            </div>
            <div class="farmventure-categories" style="display: flex; gap: 4px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 8px;">
                <button class="btn btn-secondary btn-sm active" data-cat="all" style="font-size: 0.68rem; padding: 3px 8px;">Todos</button>
                <button class="btn btn-secondary btn-sm" data-cat="Bosque" style="font-size: 0.68rem; padding: 3px 8px;">Bosque</button>
                <button class="btn btn-secondary btn-sm" data-cat="Agua" style="font-size: 0.68rem; padding: 3px 8px;">Agua/Ríos</button>
                <button class="btn btn-secondary btn-sm" data-cat="Estructuras" style="font-size: 0.68rem; padding: 3px 8px;">Estructuras</button>
                <button class="btn btn-secondary btn-sm" data-cat="Cultivos" style="font-size: 0.68rem; padding: 3px 8px;">Cultivos</button>
            </div>
            <div class="farmventure-grid" id="farmventure-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; max-height: 220px; overflow-y: auto; padding-right: 4px;">
            </div>
        `;

        const grid = containerEl.querySelector('#farmventure-grid');

        function populateGrid(filterCat = 'all') {
            grid.innerHTML = '';
            const items = ASSET_CATALOG.nature.filter(item => filterCat === 'all' || item.category === filterCat);

            items.forEach(item => {
                const btn = document.createElement('button');
                btn.className = 'farmventure-asset-card';
                btn.style.cssText = `
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 6px;
                    padding: 8px 4px;
                    color: var(--text-color);
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                    transition: all 0.2s ease;
                `;
                btn.innerHTML = `
                    <div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(168, 85, 247, 0.15); display: flex; align-items: center; justify-content: center; color: #c4b5fd;">
                        📦
                    </div>
                    <span style="font-size: 0.65rem; font-weight: 500; text-align: center; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${item.name}</span>
                `;

                btn.addEventListener('mouseenter', () => {
                    btn.style.borderColor = 'rgba(168, 85, 247, 0.5)';
                    btn.style.transform = 'translateY(-2px)';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                    btn.style.transform = 'none';
                });

                btn.addEventListener('click', () => {
                    if (onSelectAsset) onSelectAsset(item);
                });

                grid.appendChild(btn);
            });
        }

        // Category filter handlers
        const catBtns = containerEl.querySelectorAll('.farmventure-categories button');
        catBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                catBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                populateGrid(btn.getAttribute('data-cat'));
            });
        });

        populateGrid('all');
        if (window.lucide) window.lucide.createIcons();
    }

    return {
        buildWorldDiorama,
        loadGLBModel,
        renderAssetPaletteUI,
        ASSET_CATALOG
    };
})();
