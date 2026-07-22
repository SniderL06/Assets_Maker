// ==========================================
// Assets_Maker.AI - Logic and Functionality
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    const state = {
        currentWorkspace: '2d', // '2d', '2.5d', '3d'
        activeTool: 'pan', // 'pan', 'brush', 'eraser', 'picker', 'fill', 'crop'
        primaryColor: '#a855f7',
        brushSize: 8,
        brushOpacity: 1,
        canvasWidth: 256,
        canvasHeight: 256,
        gridVisible: false,
        zoom: 1,
        
        // Adjustments
        adjustments: {
            brightness: 100,
            contrast: 100,
            saturation: 100,
            hue: 0
        },

        // Material 3D Options
        material: {
            roughness: 0.5,
            metalness: 0.1,
            bumpScale: 0.02
        },
        
        // Gallery Storage
        library: [],
        currentAssetId: null,

        // Undo/Redo Stacks
        undoStack: [],
        redoStack: []
    };

    // --- DOM Elements ---
    const workspaceTabs = {
        '2d': document.getElementById('tab-2d'),
        '2.5d': document.getElementById('tab-25d'),
        '3d': document.getElementById('tab-3d'),
        'split': document.getElementById('tab-split')
    };
    const canvasContainer = document.getElementById('canvas-container');
    const canvas = document.getElementById('editor-canvas');
    const ctx = canvas.getContext('2d');
    const canvasGridHelper = document.getElementById('canvas-grid-helper');
    const threeContainer = document.getElementById('three-container');
    const threeViewport = document.getElementById('three-viewport');
    const threeSettings = document.getElementById('three-settings');
    const threeMeshSelect = document.getElementById('three-mesh-select');

    // Controls
    const promptInput = document.getElementById('prompt-input');
    const inpaintPrompt = document.getElementById('inpaint-prompt');
    const styleOptions = document.querySelectorAll('.style-option');
    const resSelect = document.getElementById('res-select');
    const bgSelect = document.getElementById('bg-select');
    const generateBtn = document.getElementById('generate-btn');
    const inpaintBtn = document.getElementById('inpaint-btn');
    const exportBtn = document.getElementById('export-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const btnToggleGrid = document.getElementById('btn-toggle-grid');
    const brushSizeSlider = document.getElementById('brush-size');
    const brushSizeVal = document.getElementById('brush-size-val');
    const primaryColorInput = document.getElementById('primary-color');
    const colorIndicator = document.querySelector('.color-indicator');
    
    // Tools
    const tools = {
        pan: document.getElementById('tool-pan'),
        brush: document.getElementById('tool-brush'),
        eraser: document.getElementById('tool-eraser'),
        picker: document.getElementById('tool-picker'),
        fill: document.getElementById('tool-fill'),
        crop: document.getElementById('tool-crop')
    };

    // Crop UI Elements
    const cropBox = document.getElementById('crop-box');
    const cropConfirm = document.getElementById('crop-confirm');
    const cropCancel = document.getElementById('crop-cancel');

    // Adjustments Elements
    const adjSliders = {
        brightness: document.getElementById('adj-brightness'),
        contrast: document.getElementById('adj-contrast'),
        saturation: document.getElementById('adj-saturation'),
        hue: document.getElementById('adj-hue')
    };
    const adjVals = {
        brightness: document.getElementById('brightness-val'),
        contrast: document.getElementById('contrast-val'),
        saturation: document.getElementById('saturation-val'),
        hue: document.getElementById('hue-val')
    };
    const applyAdjustmentsBtn = document.getElementById('btn-apply-adjustments');
    const resetAdjustmentsBtn = document.getElementById('btn-reset-adjustments');
    
    // Loading Modal
    const loadingOverlay = document.getElementById('loading-overlay');
    const loaderTitle = document.getElementById('loader-title');
    const progressFill = document.getElementById('progress-fill');
    const progressPercent = document.getElementById('progress-percent');
    
    // Gallery
    const galleryContainer = document.getElementById('gallery-container');
    const galleryEmpty = document.getElementById('gallery-empty');

    // Drawing variables
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;
    
    // Filter overlay canvas (sits on top of editor canvas for CSS filter preview)
    let filterOverlay = null;

    // Three.js variables
    let scene, camera, renderer, currentMesh, materials = {}, orbitControls;
    let autoRotate = false;
    let jointController = null;

    // --- Initial Setup ---
    function init() {
        try {
            // Setup Canvas Dimensions
            resizeCanvas(256, 256);
            initThreeJS();

            // Load default style preset (resizes canvas to correct style size first)
            updateStylePreset();

            // Initial drawing background
            drawInitialPlaceholder();
            populateModelSearchResults(""); // Pre-populate search grid on load
            saveHistoryState();

            // Event listeners
            setupEventListeners();
            setupCanvasDrawing();

            // Initialize Farmventure Asset Palette UI
            if (window.FarmventureWorld) {
                const paletteContainer = document.getElementById('farmventure-palette-container');
                if (paletteContainer) {
                    FarmventureWorld.renderAssetPaletteUI(paletteContainer, (asset) => {
                        // Switch to 3D mode if in 2D
                        const threeContainer = document.getElementById('three-container');
                        const canvasContainer = document.getElementById('canvas-container');
                        if (threeContainer) threeContainer.style.display = 'block';
                        if (canvasContainer) canvasContainer.style.display = 'none';

                        showLoader(`📦 Insertando ${asset.name}...`, 'Cargando modelo 3D...');
                        FarmventureWorld.loadGLBModel(asset.file).then(mesh => {
                            hideLoader();
                            if (mesh) {
                                // Position randomly near center of 3D world
                                mesh.position.set(
                                    (Math.random() - 0.5) * 3,
                                    0.2,
                                    (Math.random() - 0.5) * 3
                                );
                                mesh.scale.setScalar(0.75);
                                scene.add(mesh);
                                showNotification(`✨ ${asset.name} agregado al mundo 3D`);
                            } else {
                                showNotification(`⚠️ No se pudo cargar ${asset.name}`);
                            }
                        }).catch(err => {
                            hideLoader();
                            showNotification(`⚠️ Error al cargar asset: ${err.message}`);
                        });
                    });
                }
            }
        } catch (error) {
            console.error("Runtime error during init:", error);
            showNotification("Error de inicialización: " + error.message);
        }
    }

    // --- Canvas Operations ---
    function resizeCanvas(width, height) {
        state.canvasWidth = width;
        state.canvasHeight = height;
        
        // Save current canvas content
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);

        canvas.width = width;
        canvas.height = height;
        
        // Apply smooth rendering settings — re-applied after resize
        const activeStyleOpt = document.querySelector('.style-option.active');
        const currentStyle = activeStyleOpt ? activeStyleOpt.getAttribute('data-style') : 'pixel';
        if (currentStyle === 'pixel') {
            ctx.imageSmoothingEnabled = false;
            canvas.style.imageRendering = 'pixelated';
        } else {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            canvas.style.imageRendering = 'auto';
        }
        
        // Draw back saved content or scale it
        ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, width, height);
        
        // Adjust display sizing of canvas element
        const maxDisplaySize = 450;
        let displayWidth, displayHeight;
        if (width >= height) {
            displayWidth = maxDisplaySize;
            displayHeight = (height / width) * maxDisplaySize;
        } else {
            displayHeight = maxDisplaySize;
            displayWidth = (width / height) * maxDisplaySize;
        }
        
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        canvasContainer.style.width = `${displayWidth}px`;
        canvasContainer.style.height = `${displayHeight}px`;

        // Recreate filter overlay to match canvas display size
        if (filterOverlay) filterOverlay.remove();
        filterOverlay = document.createElement('canvas');
        filterOverlay.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: ${displayWidth}px;
            height: ${displayHeight}px;
            pointer-events: none;
            border-radius: 4px;
        `;
        filterOverlay.width = width;
        filterOverlay.height = height;
        canvasContainer.appendChild(filterOverlay);
        // Reset any current filter preview
        applyRealtimeFilters();
    }

    function clearCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (bgSelect.value === 'solid') {
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        updateThreeTexture();
    }

    function drawInitialPlaceholder() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw a clean, minimal pixel grid pattern to represent an empty canvas
        const size = 16;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += size) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += size) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Beautiful placeholder text instructing the user
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Lienzo Vacío', canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = '400 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillText('Usa IA Forge o Buscar 3D para comenzar', canvas.width / 2, canvas.height / 2 + 10);

        updateThreeTexture();
    }

    // --- History (Undo/Redo) ---
    function saveHistoryState() {
        // Limit history to 20 states
        if (state.undoStack.length >= 20) {
            state.undoStack.shift();
        }
        state.undoStack.push(canvas.toDataURL());
        state.redoStack = []; // Clear redo on new action
        updateUndoRedoButtons();
    }

    function undo() {
        if (state.undoStack.length > 1) {
            const currentState = state.undoStack.pop();
            state.redoStack.push(currentState);
            
            const prevState = state.undoStack[state.undoStack.length - 1];
            loadCanvasFromURL(prevState);
        }
    }

    function redo() {
        if (state.redoStack.length > 0) {
            const nextState = state.redoStack.pop();
            state.undoStack.push(nextState);
            loadCanvasFromURL(nextState);
        }
    }

    function loadCanvasFromURL(url) {
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            updateThreeTexture();
            updateUndoRedoButtons();
        };
        img.src = url;
    }

    function updateUndoRedoButtons() {
        undoBtn.disabled = state.undoStack.length <= 1;
        redoBtn.disabled = state.redoStack.length === 0;
    }

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        try {
            // Workspaces Tabs
            Object.keys(workspaceTabs).forEach(key => {
                if (workspaceTabs[key]) {
                    workspaceTabs[key].addEventListener('click', () => {
                        switchWorkspace(key);
                    });
                }
            });

        // Tools
        Object.keys(tools).forEach(key => {
            if (tools[key]) {
                tools[key].addEventListener('click', () => setTool(key));
            }
        });

        // Keyboard shortcuts (global)
        document.addEventListener('keydown', (e) => {
            // Skip when typing in an input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const k = e.key.toLowerCase();
            if (k === 'v') setTool('pan');
            else if (k === 'b') setTool('brush');
            else if (k === 'e') setTool('eraser');
            else if (k === 'i') setTool('picker');
            else if (k === 'g') setTool('fill');
            else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); }
            else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
        });

        // Crop cancel/confirm
        cropConfirm.addEventListener('click', performCrop);
        cropCancel.addEventListener('click', () => {
            cropBox.style.display = 'none';
            setTool('brush');
        });

        // Style select options
        styleOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                styleOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                updateStylePreset();
            });
        });

        // Prompt inputs and guidance
        document.getElementById('ai-guidance').addEventListener('input', (e) => {
            document.getElementById('guidance-val').textContent = e.target.value;
        });

        // Brush & Color UI
        brushSizeSlider.addEventListener('input', (e) => {
            state.brushSize = parseInt(e.target.value);
            brushSizeVal.textContent = `${state.brushSize}px`;
        });

        // Brush opacity
        const brushOpacitySlider = document.getElementById('brush-opacity');
        const brushOpacityVal = document.getElementById('brush-opacity-val');
        if (brushOpacitySlider) {
            brushOpacitySlider.addEventListener('input', (e) => {
                state.brushOpacity = parseInt(e.target.value) / 100;
                brushOpacityVal.textContent = `${e.target.value}%`;
            });
        }

        // Setup swatch helper
        function setupSwatch(swatchElement) {
            swatchElement.addEventListener('click', () => {
                const color = swatchElement.getAttribute('data-color');
                state.primaryColor = color;
                primaryColorInput.value = color;
                colorIndicator.style.backgroundColor = color;
                
                // Update selected state across all swatches
                document.querySelectorAll('#color-swatches .swatch').forEach(s => s.classList.remove('selected'));
                swatchElement.classList.add('selected');
                
                // Switch to brush if not already on a drawing tool
                if (state.activeTool !== 'brush' && state.activeTool !== 'eraser' && state.activeTool !== 'fill') {
                    setTool('brush');
                }
            });
        }

        // Quick color swatches initialization
        const initialSwatches = document.querySelectorAll('#color-swatches .swatch');
        initialSwatches.forEach(swatch => setupSwatch(swatch));

        // Add custom color button trigger
        const swatchAddBtn = document.getElementById('swatch-add');
        if (swatchAddBtn) {
            swatchAddBtn.addEventListener('click', () => {
                primaryColorInput.click();
            });
        }

        primaryColorInput.addEventListener('input', (e) => {
            const val = e.target.value;
            state.primaryColor = val;
            colorIndicator.style.backgroundColor = val;
        });

        // Add dynamically chosen colors to swatches row
        primaryColorInput.addEventListener('change', (e) => {
            const newColor = e.target.value;
            state.primaryColor = newColor;
            colorIndicator.style.backgroundColor = newColor;

            // Check if this color already exists in swatches to avoid duplication
            let existing = false;
            document.querySelectorAll('#color-swatches .swatch').forEach(s => {
                if (s.getAttribute('data-color').toLowerCase() === newColor.toLowerCase()) {
                    existing = s;
                }
            });

            if (existing) {
                existing.click();
            } else {
                // Create a new dynamic swatch
                const newSwatch = document.createElement('div');
                newSwatch.className = 'swatch selected';
                newSwatch.style.background = newColor;
                newSwatch.setAttribute('data-color', newColor);
                newSwatch.title = `Color: ${newColor}`;
                
                // Insert before the plus button
                const parent = document.getElementById('color-swatches');
                if (parent && swatchAddBtn) {
                    parent.insertBefore(newSwatch, swatchAddBtn);
                    setupSwatch(newSwatch);
                    
                    // Unselect others
                    document.querySelectorAll('#color-swatches .swatch').forEach(s => {
                        if (s !== newSwatch) s.classList.remove('selected');
                    });
                }
            }
        });

        btnToggleGrid.addEventListener('click', () => {
            state.gridVisible = !state.gridVisible;
            if (state.gridVisible) {
                canvasGridHelper.classList.add('show');
                btnToggleGrid.classList.add('active');
            } else {
                canvasGridHelper.classList.remove('show');
                btnToggleGrid.classList.remove('active');
            }
        });

        document.getElementById('btn-clear').addEventListener('click', () => {
            if (confirm('¿Limpiar todo el lienzo?')) {
                clearCanvas();
                saveHistoryState();
            }
        });

        document.getElementById('btn-center-view').addEventListener('click', () => {
            state.zoom = 1;
            panX = 0;
            panY = 0;
            updateCanvasTransform();
        });

        // Generate AI Asset Trigger
        generateBtn.addEventListener('click', triggerAIGenerate);
        inpaintBtn.addEventListener('click', triggerAIInpaint);

        // Filters sliders
        Object.keys(adjSliders).forEach(key => {
            adjSliders[key].addEventListener('input', (e) => {
                state.adjustments[key] = parseInt(e.target.value);
                const suffix = key === 'hue' ? '°' : '%';
                adjVals[key].textContent = `${state.adjustments[key]}${suffix}`;
                applyRealtimeFilters();
            });
        });

        applyAdjustmentsBtn.addEventListener('click', () => {
            bakeFiltersToCanvas();
            resetAdjustmentSliders();
            saveHistoryState();
        });

        resetAdjustmentsBtn.addEventListener('click', () => {
            resetAdjustmentSliders();
            applyRealtimeFilters();
        });

        // Three settings (bump, metal, rough)
        document.getElementById('three-roughness').addEventListener('input', (e) => {
            state.material.roughness = parseFloat(e.target.value);
            updateThreeMaterial();
        });
        document.getElementById('three-metalness').addEventListener('input', (e) => {
            state.material.metalness = parseFloat(e.target.value);
            updateThreeMaterial();
        });
        document.getElementById('three-bump').addEventListener('input', (e) => {
            state.material.bumpScale = parseFloat(e.target.value);
            updateThreeMaterial();
        });

        threeMeshSelect.addEventListener('change', (e) => {
            updateThreeMesh(e.target.value);
        });

        document.getElementById('three-wireframe-btn').addEventListener('click', () => {
            if (currentMesh) {
                const materialsList = Array.isArray(currentMesh.material) ? currentMesh.material : [currentMesh.material];
                materialsList.forEach(mat => {
                    mat.wireframe = !mat.wireframe;
                });
            }
        });

        document.getElementById('three-auto-rotate-btn').addEventListener('click', (e) => {
            autoRotate = !autoRotate;
            e.currentTarget.classList.toggle('active', autoRotate);
        });

        exportBtn.addEventListener('click', exportAsset);

        // Resolution change resets canvas sizes to match standard sizes
        resSelect.addEventListener('change', (e) => {
            const newRes = parseInt(e.target.value);
            if (confirm(`¿Cambiar la resolución del lienzo a ${newRes}x${newRes}? Esto podría estirar o recortar la imagen actual.`)) {
                resizeCanvas(newRes, newRes);
                saveHistoryState();
            }
        });
        
        // Character Editor interactions
        const charEditorPanel = document.getElementById('char-editor-panel');
        if (charEditorPanel) {
            // Type button selection
            charEditorPanel.querySelectorAll('.char-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    charEditorPanel.querySelectorAll('.char-type-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    redrawActiveCharacter();
                });
            });

            // Skin tone swatches
            charEditorPanel.querySelectorAll('.skin-swatch').forEach(sw => {
                sw.addEventListener('click', () => {
                    charEditorPanel.querySelectorAll('.skin-swatch').forEach(s => s.classList.remove('selected'));
                    sw.classList.add('selected');
                    redrawActiveCharacter();
                });
            });

            // Hair swatches
            charEditorPanel.querySelectorAll('.hair-swatch').forEach(sw => {
                sw.addEventListener('click', () => {
                    charEditorPanel.querySelectorAll('.hair-swatch').forEach(s => s.classList.remove('selected'));
                    sw.classList.add('selected');
                    redrawActiveCharacter();
                });
            });

            // Color inputs
            document.getElementById('char-outfit-primary').addEventListener('input', (e) => {
                document.getElementById('char-outfit-primary-ind').style.background = e.target.value;
                redrawActiveCharacter();
            });
            document.getElementById('char-outfit-accent').addEventListener('input', (e) => {
                document.getElementById('char-outfit-accent-ind').style.background = e.target.value;
                redrawActiveCharacter();
            });

            // Body size slider
            const sizeSlider = document.getElementById('char-size-slider');
            const sizeVal = document.getElementById('char-size-val');
            if (sizeSlider) {
                sizeSlider.addEventListener('input', (e) => {
                    const val = parseInt(e.target.value);
                    const labels = ['Delgado / Pequeño', 'Normal', 'Grande / Fuerte'];
                    sizeVal.textContent = labels[val];
                    redrawActiveCharacter();
                });
            }

            // Emotion / expression
            charEditorPanel.querySelectorAll('.emotion-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    charEditorPanel.querySelectorAll('.emotion-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    redrawActiveCharacter();
                });
            });

            // Accessories checkboxes
            charEditorPanel.querySelectorAll('.acc-toggle input[type="checkbox"]').forEach(chk => {
                chk.addEventListener('change', redrawActiveCharacter);
            });

            // 3D Pose Presets wiring
            charEditorPanel.querySelectorAll('.pose-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    charEditorPanel.querySelectorAll('.pose-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const pose = btn.getAttribute('data-pose');
                    if (jointController) {
                        jointController.applyPose(pose);
                    }
                });
            });

            // Regenerate button
            document.getElementById('char-regenerate-btn').addEventListener('click', () => {
                redrawActiveCharacter();
                saveHistoryState();
            });
        }

        // Scene Editor interactions
        const sceneEditorPanel = document.getElementById('scene-editor-panel');
        if (sceneEditorPanel) {
            // Scene type button selection
            ['scene-type-grid', 'scene-time-grid', 'scene-weather-grid'].forEach(gridId => {
                const grid = document.getElementById(gridId);
                if (!grid) return;
                grid.querySelectorAll('.char-type-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        grid.querySelectorAll('.char-type-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                    });
                });
            });

            // Regenerate scene button
            const btnRegenScene = document.getElementById('btn-regen-scene');
            if (btnRegenScene) {
                btnRegenScene.addEventListener('click', () => {
                    const sceneType = sceneEditorPanel.querySelector('[data-scene-type].active')?.getAttribute('data-scene-type') || 'forest';
                    const sceneTime = sceneEditorPanel.querySelector('[data-scene-time].active')?.getAttribute('data-scene-time') || 'day';
                    const sceneWeather = sceneEditorPanel.querySelector('[data-scene-weather].active')?.getAttribute('data-scene-weather') || 'clear';
                    
                    // Build a prompt from selected options and regenerate
                    const promptEl = document.getElementById('asset-prompt');
                    const oldPrompt = promptEl ? promptEl.value : '';
                    const scenePrompt = `${sceneType} ${sceneTime} ${sceneWeather} escenario landscape`;
                    if (promptEl) promptEl.value = scenePrompt;
                    
                    generateProceduralAsset();
                    
                    if (promptEl) promptEl.value = oldPrompt;
                    saveHistoryState();
                });
            }
        }

        // Left Panel Tab Switching (AI Forge / Buscar 3D)
        const leftTabAi = document.getElementById('left-tab-ai');
        const leftTabSearch = document.getElementById('left-tab-search');
        const aiForgeContent = document.getElementById('ai-forge-content');
        const modelSearchContent = document.getElementById('model-search-content');

        if (leftTabAi && leftTabSearch && aiForgeContent && modelSearchContent) {
            leftTabAi.addEventListener('click', () => {
                leftTabAi.classList.add('active');
                leftTabSearch.classList.remove('active');
                aiForgeContent.style.display = 'block';
                modelSearchContent.style.display = 'none';
            });

            leftTabSearch.addEventListener('click', () => {
                leftTabSearch.classList.add('active');
                leftTabAi.classList.remove('active');
                aiForgeContent.style.display = 'none';
                modelSearchContent.style.display = 'block';
                populateModelSearchResults(""); // load initial models list
            });
        }

        // 3D Model Search button & input
        const modelSearchBtn = document.getElementById('model-search-btn');
        const modelSearchInput = document.getElementById('model-search-input');
        if (modelSearchBtn && modelSearchInput) {
            modelSearchBtn.addEventListener('click', () => {
                populateModelSearchResults(modelSearchInput.value);
            });
            modelSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    populateModelSearchResults(modelSearchInput.value);
                }
            });
        }
        } catch (error) {
            console.error("Runtime error in setupEventListeners:", error);
        }
    }

    function redrawActiveCharacter() {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const activeStyleOpt = document.querySelector('.style-option.active');
        const style = activeStyleOpt ? activeStyleOpt.getAttribute('data-style') : 'pixel';

        const charEditor = document.getElementById('char-editor-panel');
        const activeTypeBtn = charEditor.querySelector('.char-type-btn.active');
        const customType = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'warrior';
        
        const activeSkin = charEditor.querySelector('.skin-swatch.selected');
        const customSkin = activeSkin ? activeSkin.getAttribute('data-skin') : '#e8b89a';
        
        const activeHair = charEditor.querySelector('.hair-swatch.selected');
        const customHair = activeHair ? activeHair.getAttribute('data-hair') : '#1a0a00';

        const customPrimary = document.getElementById('char-outfit-primary').value;
        const customAccent = document.getElementById('char-outfit-accent').value;
        
        drawConfiguredCharacter(cx, cy, customType, customSkin, customHair, customPrimary, customAccent, style);
        updateThreeTexture();
    }


    // --- Workspace Navigation ---
    function switchWorkspace(mode) {
        state.currentWorkspace = mode;
        const viewportWrapper = document.querySelector('.viewport-wrapper');
        
        // Update Tabs UI
        Object.keys(workspaceTabs).forEach(key => {
            if (workspaceTabs[key]) {
                workspaceTabs[key].classList.toggle('active', key === mode);
            }
        });

        // Show/Hide relevant Viewports
        if (mode === 'split') {
            if (viewportWrapper) viewportWrapper.classList.add('split-mode');
            canvasContainer.style.display = 'block';
            threeContainer.style.display = 'flex';
            threeSettings.style.display = 'block';
            updateThreeTexture();
            onWindowResize();
        } else if (mode === '3d') {
            if (viewportWrapper) viewportWrapper.classList.remove('split-mode');
            canvasContainer.style.display = 'none';
            threeContainer.style.display = 'flex';
            threeSettings.style.display = 'block';
            updateThreeTexture();
            onWindowResize();
        } else {
            if (viewportWrapper) viewportWrapper.classList.remove('split-mode');
            canvasContainer.style.display = 'block';
            threeContainer.style.display = 'none';
            threeSettings.style.display = 'none';
            
            // Mark last active 2D/2.5D tab
            if (mode === '2.5d') {
                workspaceTabs['2.5d'].setAttribute('data-active', 'true');
                workspaceTabs['2d'].setAttribute('data-active', 'false');
            } else {
                workspaceTabs['2d'].setAttribute('data-active', 'true');
                workspaceTabs['2.5d'].setAttribute('data-active', 'false');
            }
        }
    }

    function setTool(toolName) {
        state.activeTool = toolName;
        Object.keys(tools).forEach(key => {
            if (tools[key]) tools[key].classList.toggle('active', key === toolName);
        });

        // Update canvas cursor per tool
        const cursors = {
            pan: 'grab',
            brush: 'crosshair',
            eraser: 'cell',
            picker: 'copy',
            fill: 'cell',
            crop: 'default'
        };
        canvas.style.cursor = cursors[toolName] || 'crosshair';

        // Reset composite operation to default when switching tools
        ctx.globalCompositeOperation = 'source-over';

        if (toolName === 'crop') {
            initCropOverlay();
        } else {
            cropBox.style.display = 'none';
        }
    }


    function updateStylePreset() {
        const activeStyleOpt = document.querySelector('.style-option.active');
        const style = activeStyleOpt ? activeStyleOpt.getAttribute('data-style') : 'pixel';
        
        // Auto-adjust resolution for styles
        if (style === 'pixel') {
            resSelect.value = '64';
            resizeCanvas(64, 64);
            ctx.imageSmoothingEnabled = false;
        } else if (style === 'realistic') {
            resSelect.value = '512';
            resizeCanvas(512, 512);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
        } else {
            resSelect.value = '256';
            resizeCanvas(256, 256);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
        }
    }

    // --- Drawing Engine logic ---
    function setupCanvasDrawing() {
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseleave', stopDrawing);

        // Touch Support
        canvas.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        }, {passive: true});

        canvas.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        }, {passive: true});

        // Zoom on Mouse Wheel over the Canvas Container
        canvasContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.08;
            if (e.deltaY < 0) {
                state.zoom = Math.min(15, state.zoom + state.zoom * zoomSpeed);
            } else {
                state.zoom = Math.max(0.5, state.zoom - state.zoom * zoomSpeed);
            }
            updateCanvasTransform();
        }, { passive: false });
    }

    function updateCanvasTransform() {
        canvas.style.transform = `scale(${state.zoom}) translate(${panX}px, ${panY}px)`;
        // Keep grid helper aligned
        if (canvasGridHelper) {
            canvasGridHelper.style.transform = `scale(${state.zoom}) translate(${panX}px, ${panY}px)`;
        }
        if (filterOverlay) {
            filterOverlay.style.transform = `scale(${state.zoom}) translate(${panX}px, ${panY}px)`;
        }
    }

    function getMousePos(evt) {
        const rect = canvas.getBoundingClientRect();
        // Calculate coordinate scale factors
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    }

    function startDrawing(e) {
        // Pan mode: start dragging the canvas view instead of drawing
        if (state.activeTool === 'pan') {
            isPanning = true;
            startPanX = e.clientX - panX * state.zoom;
            startPanY = e.clientY - panY * state.zoom;
            canvas.style.cursor = 'grabbing';
            return;
        }

        isDrawing = true;
        const pos = getMousePos(e);
        lastX = pos.x;
        lastY = pos.y;

        if (state.activeTool === 'picker') {
            pickColor(pos.x, pos.y);
            isDrawing = false;
        } else if (state.activeTool === 'fill') {
            floodFill(Math.floor(pos.x), Math.floor(pos.y), hexToRgb(state.primaryColor));
            saveHistoryState();
            isDrawing = false;
        }
    }

    function draw(e) {
        // Handle canvas Panning/Dragging in pan tool mode
        if (state.activeTool === 'pan' && isPanning) {
            panX = (e.clientX - startPanX) / state.zoom;
            panY = (e.clientY - startPanY) / state.zoom;
            updateCanvasTransform();
            return;
        }

        // Pan mode never draws
        if (state.activeTool === 'pan' || !isDrawing) return;
        const pos = getMousePos(e);
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        
        if (state.activeTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = state.brushOpacity;
            ctx.strokeStyle = state.primaryColor;
            ctx.lineWidth = state.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.filter = 'none';
            ctx.stroke();
        } else if (state.activeTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.globalAlpha = state.brushOpacity;
            ctx.lineWidth = state.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
        ctx.restore();

        lastX = pos.x;
        lastY = pos.y;
        
        // Live-update filter overlay
        applyRealtimeFilters();
    }

    function stopDrawing() {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = 'grab';
        }
        if (isDrawing) {
            isDrawing = false;
            saveHistoryState();
        }
    }

    // Eyedropper / Color Picker
    function pickColor(x, y) {
        const imgData = ctx.getImageData(x, y, 1, 1).data;
        if (imgData[3] > 0) { // If not transparent
            const hex = rgbToHex(imgData[0], imgData[1], imgData[2]);
            state.primaryColor = hex;
            primaryColorInput.value = hex;
            colorIndicator.style.backgroundColor = hex;
            setTool('brush');
        }
    }

    // Flood Fill algorithm
    function floodFill(startX, startY, fillColor) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const width = imgData.width;
        const height = imgData.height;
        
        const targetColor = getPixelColor(data, startX, startY, width);
        if (colorsMatch(targetColor, fillColor)) return;

        const queue = [[startX, startY]];
        while (queue.length > 0) {
            const [x, y] = queue.shift();
            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            
            const currentPixelIndex = (y * width + x) * 4;
            const currentColor = [
                data[currentPixelIndex],
                data[currentPixelIndex + 1],
                data[currentPixelIndex + 2],
                data[currentPixelIndex + 3]
            ];

            if (colorsMatch(currentColor, targetColor)) {
                setPixelColor(data, currentPixelIndex, fillColor);
                queue.push([x + 1, y]);
                queue.push([x - 1, y]);
                queue.push([x, y + 1]);
                queue.push([x, y - 1]);
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    function getPixelColor(data, x, y, width) {
        const idx = (y * width + x) * 4;
        return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    }

    function setPixelColor(data, index, color) {
        data[index] = color[0];
        data[index + 1] = color[1];
        data[index + 2] = color[2];
        data[index + 3] = color[3] !== undefined ? color[3] : 255;
    }

    function colorsMatch(c1, c2) {
        return Math.abs(c1[0] - c2[0]) < 5 &&
               Math.abs(c1[1] - c2[1]) < 5 &&
               Math.abs(c1[2] - c2[2]) < 5 &&
               Math.abs(c1[3] - c2[3]) < 5;
    }

    // Color conversion helpers
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16),
            parseInt(result[2], 16),
            parseInt(result[3], 16),
            255
        ] : [0, 0, 0, 255];
    }

    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    // --- Crop Action Implementation ---
    let cropStart = {x: 0, y: 0};
    let cropEnd = {x: 0, y: 0};

    function initCropOverlay() {
        const displayWidth = parseFloat(canvas.style.width);
        const displayHeight = parseFloat(canvas.style.height);
        
        cropBox.style.width = `${displayWidth * 0.8}px`;
        cropBox.style.height = `${displayHeight * 0.8}px`;
        cropBox.style.top = `${displayHeight * 0.1}px`;
        cropBox.style.left = `${displayWidth * 0.1}px`;
        cropBox.style.display = 'block';
    }

    function performCrop() {
        const rect = canvas.getBoundingClientRect();
        const cropRect = cropBox.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const cropX = Math.floor((cropRect.left - rect.left) * scaleX);
        const cropY = Math.floor((cropRect.top - rect.top) * scaleY);
        const cropW = Math.floor(cropRect.width * scaleX);
        const cropH = Math.floor(cropRect.height * scaleY);

        if (cropW > 4 && cropH > 4) {
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const cropCtx = cropCanvas.getContext('2d');
            cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

            resizeCanvas(cropW, cropH);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(cropCanvas, 0, 0);

            cropBox.style.display = 'none';
            setTool('brush');
            saveHistoryState();
        }
    }

    // --- Realtime Filter Application (overlay canvas approach) ---
    function applyRealtimeFilters() {
        if (!filterOverlay) return;
        const ovCtx = filterOverlay.getContext('2d');
        
        // Check if any adjustment is non-default
        const hasFilter = state.adjustments.brightness !== 100 ||
                          state.adjustments.contrast !== 100 ||
                          state.adjustments.saturation !== 100 ||
                          state.adjustments.hue !== 0;
        
        ovCtx.clearRect(0, 0, filterOverlay.width, filterOverlay.height);
        
        if (hasFilter) {
            const filterStr = `brightness(${state.adjustments.brightness}%) contrast(${state.adjustments.contrast}%) saturate(${state.adjustments.saturation}%) hue-rotate(${state.adjustments.hue}deg)`;
            ovCtx.filter = filterStr;
            ovCtx.drawImage(canvas, 0, 0);
            filterOverlay.style.opacity = '1';
        } else {
            filterOverlay.style.opacity = '0';
        }
    }

    function bakeFiltersToCanvas() {
        if (!filterOverlay) return;
        const hasFilter = state.adjustments.brightness !== 100 ||
                          state.adjustments.contrast !== 100 ||
                          state.adjustments.saturation !== 100 ||
                          state.adjustments.hue !== 0;
        if (!hasFilter) return;
        
        const filterStr = `brightness(${state.adjustments.brightness}%) contrast(${state.adjustments.contrast}%) saturate(${state.adjustments.saturation}%) hue-rotate(${state.adjustments.hue}deg)`;
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.filter = filterStr;
        tempCtx.drawImage(canvas, 0, 0);
        
        // Reset state
        state.adjustments = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
        canvas.style.filter = 'none';
        
        // Bake back
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        
        // Hide overlay
        const ovCtx = filterOverlay.getContext('2d');
        ovCtx.clearRect(0, 0, filterOverlay.width, filterOverlay.height);
        filterOverlay.style.opacity = '0';
        
        updateThreeTexture();
    }

    function resetAdjustmentSliders() {
        state.adjustments = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
        Object.keys(adjSliders).forEach(key => {
            adjSliders[key].value = state.adjustments[key];
            const suffix = key === 'hue' ? '°' : '%';
            adjVals[key].textContent = `${state.adjustments[key]}${suffix}`;
        });
        // Hide filter overlay
        if (filterOverlay) {
            const ovCtx = filterOverlay.getContext('2d');
            ovCtx.clearRect(0, 0, filterOverlay.width, filterOverlay.height);
            filterOverlay.style.opacity = '0';
        }
        canvas.style.filter = 'none';
    }

    // --- AI Generator Simulation Engine ---
    // Engine state — 'advanced' uses Pollinations.ai; 'procedural' uses local canvas art
    let selectedEngine = 'advanced'; // default to HF

    function initEngineButtons() {
        const btnProcedural = document.getElementById('engine-procedural');
        const btnAdvanced   = document.getElementById('engine-advanced');
        if (!btnProcedural || !btnAdvanced) return;

        function setEngine(mode) {
            selectedEngine = mode;
            btnProcedural.classList.toggle('active', mode === 'procedural');
            btnAdvanced.classList.toggle('active', mode === 'advanced');
            const statusBar = document.getElementById('hf-status-bar');
            if (statusBar) statusBar.style.display = mode === 'advanced' ? 'flex' : 'none';
        }

        btnProcedural.addEventListener('click', () => setEngine('procedural'));
        btnAdvanced.addEventListener('click',   () => setEngine('advanced'));

        // Default: advanced selected
        setEngine('advanced');
    }

    // Call during init
    initEngineButtons();

    // ─── TRIPO3D 3D AI INTEGRATION ───────────────────────────────────────────
    function initTripo3D() {
        const saveKeyBtn     = document.getElementById('tripo3d-save-key');
        const keyInput       = document.getElementById('tripo3d-api-key');
        const keyStatus      = document.getElementById('tripo3d-key-status');
        const generateBtn    = document.getElementById('tripo3d-generate-btn');

        if (!saveKeyBtn || !keyInput || !generateBtn) return;

        function updateKeyStatus() {
            if (window.Tripo3DGenerator && Tripo3DGenerator.hasKey()) {
                if (keyStatus) keyStatus.textContent = '✅ Clave Tripo3D activa — listo para generar 3D real';
                if (generateBtn) {
                    generateBtn.style.background = 'rgba(168,85,247,0.2)';
                    generateBtn.style.borderColor = 'rgba(168,85,247,0.7)';
                }
            } else {
                if (keyStatus) keyStatus.innerHTML = '🔑 Sin clave. Regístrate gratis en <a href="https://platform.tripo3d.ai" target="_blank" style="color:#a78bfa;">platform.tripo3d.ai</a> — 200 créditos gratis.';
            }
        }

        // Restore saved key
        if (window.Tripo3DGenerator) {
            const saved = Tripo3DGenerator.loadSavedKey();
            if (saved) {
                keyInput.value = saved;
                updateKeyStatus();
            }
        }

        saveKeyBtn.addEventListener('click', () => {
            const key = keyInput.value.trim();
            if (!key) {
                showNotification('⚠️ Ingresa una API key válida de Tripo3D');
                return;
            }
            if (window.Tripo3DGenerator) Tripo3DGenerator.setApiKey(key);
            updateKeyStatus();
            showNotification('✅ Clave Tripo3D guardada correctamente');
        });

        generateBtn.addEventListener('click', async () => {
            if (!window.Tripo3DGenerator || !Tripo3DGenerator.hasKey()) {
                showNotification('⚠️ Primero guarda tu API key de Tripo3D. Regístrate gratis en platform.tripo3d.ai');
                return;
            }
            const prompt = promptInput.value.trim();
            if (!prompt) {
                showNotification('⚠️ Escribe un prompt para generar el modelo 3D');
                return;
            }

            // Switch to 3D view
            const threeContainer = document.getElementById('three-container');
            const canvasContainer = document.getElementById('canvas-container');
            if (threeContainer) threeContainer.style.display = 'block';
            if (canvasContainer) canvasContainer.style.display = 'none';

            const activeStyleOpt = document.querySelector('.style-option.active');
            const style = activeStyleOpt ? activeStyleOpt.getAttribute('data-style') : 'cartoon';

            showLoader('🎲 Tripo3D — Generando modelo 3D real...', 'Enviando prompt a la nube...');
            updateLoaderProgress(5, 'Conectando con Tripo3D...');

            try {
                const { model } = await Tripo3DGenerator.generateAndLoad(prompt, {
                    styleHint: style,
                    onProgress: (pct, msg) => updateLoaderProgress(pct, msg)
                });

                // Remove existing mesh and add the new GLB model
                if (currentMesh) scene.remove(currentMesh);
                currentMesh = model;
                scene.add(currentMesh);
                orbitControls.target.set(0, 0.5, 0);
                orbitControls.update();

                hideLoader();
                showNotification('🎲 Modelo 3D real generado por Tripo3D. ¡Puedes rotarlo con el ratón!');

            } catch (err) {
                hideLoader();
                console.error('[Tripo3D] Error:', err);
                showNotification(`⚠️ Tripo3D: ${err.message.slice(0, 100)}`);
            }
        });
    }
    initTripo3D();

    async function triggerAIGenerate() {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            alert('Por favor, escribe lo que quieres crear en la caja de prompt.');
            return;
        }

        if (selectedEngine === 'advanced' && window.PollinationsGenerator) {
            // ---- Real Image Generation via Pollinations.ai (no API key needed) ----
            const activeStyleOpt = document.querySelector('.style-option.active');
            const style = activeStyleOpt ? activeStyleOpt.getAttribute('data-style') : 'realistic';
            const negativePrompt = document.getElementById('negative-prompt')?.value?.trim() || '';
            const guidanceScale  = parseFloat(document.getElementById('ai-guidance')?.value || '7.5');
            const resolution     = parseInt(document.getElementById('res-select')?.value || '512');

            showLoader('🧠 IA Avanzada — Generando con Pollinations...', 'Conectando con Pollinations...');
            updateLoaderProgress(5, 'Enviando prompt...');

            // Update status dot
            const statusDot  = document.getElementById('hf-status-dot');
            const statusText = document.getElementById('hf-status-text');
            if (statusDot)  { statusDot.style.background = '#f59e0b'; }
            if (statusText) { statusText.textContent = 'Generando imagen...'; }

            try {
                const result = await PollinationsGenerator.generate({
                    prompt,
                    style,
                    negativePrompt,
                    width: Math.max(resolution, 512),
                    height: Math.max(resolution, 512),
                    guidanceScale,
                    onProgress: (pct, msg) => updateLoaderProgress(pct, msg)
                });

                // Load the generated image onto the canvas
                const img = new Image();
                img.onload = () => {
                    canvas.dataset.hasAsset = 'true';
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    updateThreeTexture();
                    hideLoader();
                    saveHistoryState();

                    // Also auto-update 3D view
                    if (style === 'realistic' || style === 'vector' || style === 'cartoon') {
                        threeMeshSelect.value = 'mesh_3d';
                        updateThreeMesh('mesh_3d');
                    }

                    if (statusDot)  { statusDot.style.background = '#22c55e'; }
                    if (statusText) { statusText.textContent = `✓ Modelo: ${result.modelUsed}`; }

                    showNotification(`✨ Imagen generada por ${result.modelUsed}`);
                };
                img.onerror = () => {
                    hideLoader();
                    showNotification('⚠️ Error cargando imagen. Usando generación procedural.');
                    fallbackToProcedural(prompt);
                };
                img.src = result.dataUrl;

            } catch (err) {
                console.error('[Pollinations] Generation failed:', err);
                if (statusDot)  { statusDot.style.background = '#ef4444'; }
                if (statusText) { statusText.textContent = `Error: ${err.message.slice(0, 60)}`; }
                hideLoader();
                showNotification(`⚠️ Pollinations falló: ${err.message.slice(0, 80)}. Usando arte procedural.`);
                fallbackToProcedural(prompt);
            }

        } else {
            // ---- Procedural (local) generation ----
            fallbackToProcedural(prompt);
        }
    }

    function fallbackToProcedural(prompt) {
        showLoader('⚡ Generando asset procedural...', 'Calculando paleta de colores...');
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.floor(Math.random() * 8) + 4;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                generateProceduralAsset(prompt);
                hideLoader();
                saveHistoryState();
            }
            updateLoaderProgress(progress, getLoaderSubtitle(progress));
        }, 120);
    }

    function triggerAIInpaint() {
        const prompt = inpaintPrompt.value.trim();
        if (!prompt) {
            alert('Por favor, escribe las modificaciones para el retoque IA.');
            return;
        }
        
        showLoader('Retocando con IA (Inpaint)...', 'Analizando máscara pintada');
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                
                // Inpaint mock adjustment
                performAIInpaintMock(prompt);
                hideLoader();
                saveHistoryState();
            }
            updateLoaderProgress(progress, 'Redibujando sección editada...');
        }, 100);
    }

    function showLoader(title, subtitle) {
        loaderTitle.textContent = title;
        document.getElementById('loader-subtitle').textContent = subtitle;
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        loadingOverlay.classList.add('active');
    }

    function updateLoaderProgress(progress, subtitle) {
        progressFill.style.width = `${progress}%`;
        progressPercent.textContent = `${progress}%`;
        if (subtitle) {
            document.getElementById('loader-subtitle').textContent = subtitle;
        }
    }

    function hideLoader() {
        loadingOverlay.classList.remove('active');
    }

    function getLoaderSubtitle(prog) {
        if (prog < 25) return 'Calculando mapas de ruido difuso...';
        if (prog < 50) return 'Delineando silueta de asset y bordes...';
        if (prog < 75) return 'Procesando texturas e iluminando volumen...';
        return 'Finalizando renderizado de mapas normales y de altura...';
    }

    // --- Procedural Asset Art Engine ---
    function generateProceduralAsset(prompt) {
        const activeStyleOpt = document.querySelector('.style-option.active');
        const style = activeStyleOpt ? activeStyleOpt.getAttribute('data-style') : 'pixel';
        
        // Mark that an asset has now been generated so 3D uses canvas texture
        canvas.dataset.hasAsset = 'true';
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Ensure correct rendering quality per style
        if (style === 'pixel') {
            ctx.imageSmoothingEnabled = false;
        } else {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
        }

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        // ---- Rich Color Palette selection based on prompt keywords ----
        let baseColor = '#c026d3';   // Vivid magenta default
        let accentColor = '#3b82f6'; // Blue
        let glowColor = 'rgba(192,38,211,0.55)';
        
        const lp = prompt.toLowerCase();
        
        if (lp.includes('fuego') || lp.includes('fire') || lp.includes('rojo') || lp.includes('flama') || lp.includes('llama')) {
            baseColor = '#dc2626'; accentColor = '#fb923c'; glowColor = 'rgba(220,38,38,0.6)';
        } else if (lp.includes('hielo') || lp.includes('ice') || lp.includes('frost') || lp.includes('azul') || lp.includes('agua') || lp.includes('glacial')) {
            baseColor = '#2563eb'; accentColor = '#7dd3fc'; glowColor = 'rgba(56,189,248,0.6)';
        } else if (lp.includes('tierra') || lp.includes('piedra') || lp.includes('stone') || lp.includes('roca') || lp.includes('granito')) {
            baseColor = '#92400e'; accentColor = '#9ca3af'; glowColor = 'rgba(107,114,128,0.4)';
        } else if (lp.includes('madera') || lp.includes('wood') || lp.includes('cofre') || lp.includes('chest') || lp.includes('tronco')) {
            baseColor = '#b45309'; accentColor = '#fde68a'; glowColor = 'rgba(251,191,36,0.45)';
        } else if (lp.includes('bosque') || lp.includes('planta') || lp.includes('veneno') || lp.includes('verde') || lp.includes('naturaleza')) {
            baseColor = '#059669'; accentColor = '#6ee7b7'; glowColor = 'rgba(16,185,129,0.55)';
        } else if (lp.includes('oro') || lp.includes('gold') || lp.includes('luz') || lp.includes('sagrado') || lp.includes('divino')) {
            baseColor = '#d97706'; accentColor = '#fef9c3'; glowColor = 'rgba(251,191,36,0.65)';
        } else if (lp.includes('sombra') || lp.includes('vacio') || lp.includes('oscuro') || lp.includes('dark') || lp.includes('abismo')) {
        baseColor = '#581c87'; accentColor = '#f472b6'; glowColor = 'rgba(168,85,247,0.6)';
        } else if (lp.includes('rayo') || lp.includes('lightning') || lp.includes('electrico') || lp.includes('tormenta')) {
            baseColor = '#eab308'; accentColor = '#e0f2fe'; glowColor = 'rgba(234,179,8,0.7)';
        } else if (lp.includes('veneno') || lp.includes('poison') || lp.includes('acido')) {
            baseColor = '#65a30d'; accentColor = '#d9f99d'; glowColor = 'rgba(101,163,13,0.6)';
        }

        // ---- Helper: detect asset family from prompt ----
        function matchesAny(keys) { return keys.some(k => lp.includes(k)); }

        // Humanoids & NPCs
        const isWarrior   = matchesAny(['guerrero','warrior','knight','caballero','fighter','soldado','paladin','barbarian','barbaro']);
        const isMage      = matchesAny(['mago','mage','wizard','hechicero','brujo','sorcerer','warlock','witch']);
        const isRogue     = matchesAny(['rogue','ladron','thief','asesino','assassin','pirate','pirata','ninja','ranger','arquero']);
        const isHealer    = matchesAny(['curandero','healer','priest','sacerdote','clerigo','cleric','monk','monje']);
        const isArcher    = matchesAny(['archer','arquero','tirador','hunter','cazador']);
        const isPaladin   = matchesAny(['paladin','paladín','templario','templar']);
        
        // Normal NPCs
        const isMerchant  = matchesAny(['comerciante','merchant','vendedor','shopkeeper','mercader']);
        const isVillager  = matchesAny(['aldeano','villager','campesino','peasant','citizen','ciudadano','granjar','farmer']);
        const isGuard     = matchesAny(['guardia','guard','soldier','soldado','vigilante','police']);
        const isNoble     = matchesAny(['noble','rey','king','queen','reina','prince','principe','lord','lady','duke']);
        const isPrincess  = matchesAny(['princess','princesa','reina','queen']);
        const isElder     = matchesAny(['anciano','elder','viejo','old man','grandpa','abuelo','abuela']);
        const isChild     = matchesAny(['niño','nino','child','kid','boy','girl','chico','chica']);
        const isBlacksmith= matchesAny(['herrero','blacksmith','forjador']);
        const isInnkeeper = matchesAny(['posadero','innkeeper','tabernero']);
        const isBeggar    = matchesAny(['vago','beggar','mendigo','pobre']);
        const isBandit    = matchesAny(['bandido','bandit','ladron','thug','pirata','pirate','outlaw']);
        
        const isCharacter = isWarrior || isMage || isRogue || isHealer || isArcher || isPaladin ||
                            isMerchant || isVillager || isGuard || isNoble || isPrincess || isElder || isChild ||
                            isBlacksmith || isInnkeeper || isBeggar || isBandit ||
                            matchesAny(['personaje','character','hero','heroe','heroine','heroina','protagonista','player','jugador','avatar','npc','persona','human','humano','hombre','mujer']);

        // Creatures, monsters & animals
        const isSlime     = matchesAny(['slime','limo','gelatina','blob','ameba']);
        const isGoblin    = matchesAny(['goblin','kobold','gnome','gnomo','duende']);
        const isSkeleton  = matchesAny(['skeleton','esqueleto','undead','muerto','zombie','lich','liche']);
        const isDragon    = matchesAny(['dragon','drake','wyrm','serpiente alada','dragón']);
        const isOrc       = matchesAny(['orc','orco','ogro','ogre','troll']);
        const isGhost     = matchesAny(['ghost','fantasma','espiritu','spirit','wraith','banshee','phantom']);
        const isSpider    = matchesAny(['spider','araña','aracnido','scorpion','escorpion']);
        const isBat       = matchesAny(['bat','murcielago','vampiro','vampire']);
        const isWolf      = matchesAny(['wolf','lobo','werewolf','licantro','lycanthrope','beast']);
        const isDog       = matchesAny(['dog','perro','cachorro','puppy']);
        const isCat       = matchesAny(['cat','gato','felino','kitten']);
        const isChicken   = matchesAny(['chicken','gallina','gallo','pollo']);
        const isGolem     = matchesAny(['golem','construct','elemental','robot','automaton','automata']);
        const isBoss      = matchesAny(['jefe','boss','final boss','raid','demonio','demon','diablo','devil','titan','gigante','giant']);
        const isCreature  = isSlime || isGoblin || isSkeleton || isDragon || isOrc ||
                            isGhost || isSpider || isBat || isWolf || isDog || isCat || isChicken || isGolem || isBoss ||
                            matchesAny(['monstruo','monster','criatura','creature','enemy','enemigo','bestia','beast','evil','maligno','animal']);

        // Show/Hide Character Editor Panel in Right Panel
        const charEditor = document.getElementById('char-editor-panel');
        if (isCharacter || isCreature) {
            if (charEditor) {
                charEditor.style.display = 'block';
                // Auto-select type button
                let typeToSelect = 'warrior';
                if (isWarrior) typeToSelect = 'warrior';
                else if (isMage) typeToSelect = 'mage';
                else if (isRogue) typeToSelect = 'rogue';
                else if (isHealer) typeToSelect = 'healer';
                else if (isArcher) typeToSelect = 'archer';
                else if (isPaladin) typeToSelect = 'paladin';
                else if (isMerchant) typeToSelect = 'merchant';
                else if (isVillager) typeToSelect = 'villager';
                else if (isGuard) typeToSelect = 'guard';
                else if (isNoble) typeToSelect = 'noble';
                else if (isPrincess) typeToSelect = 'princess';
                else if (isElder) typeToSelect = 'elder';
                else if (isChild) typeToSelect = 'child';
                else if (isBlacksmith) typeToSelect = 'blacksmith';
                else if (isInnkeeper) typeToSelect = 'innkeeper';
                else if (isBeggar) typeToSelect = 'beggar';
                else if (isBandit) typeToSelect = 'bandit';
                else if (isSlime) typeToSelect = 'slime';
                else if (isGoblin) typeToSelect = 'goblin';
                else if (isSkeleton) typeToSelect = 'skeleton';
                else if (isDragon) typeToSelect = 'dragon';
                else if (isOrc) typeToSelect = 'orc';
                else if (isGhost) typeToSelect = 'ghost';
                else if (isSpider) typeToSelect = 'spider';
                else if (isBat) typeToSelect = 'bat';
                else if (isWolf) typeToSelect = 'wolf';
                else if (isDog) typeToSelect = 'dog';
                else if (isCat) typeToSelect = 'cat';
                else if (isChicken) typeToSelect = 'chicken';
                else if (isGolem) typeToSelect = 'golem';
                else if (isBoss) typeToSelect = 'boss';

                const typeBtn = charEditor.querySelector(`.char-type-btn[data-type="${typeToSelect}"]`);
                if (typeBtn) {
                    charEditor.querySelectorAll('.char-type-btn').forEach(b => b.classList.remove('active'));
                    typeBtn.classList.add('active');
                }
            }
        } else {
            if (charEditor) charEditor.style.display = 'none';
        }

        // Show/Hide Scene Editor Panel
        const sceneEditor = document.getElementById('scene-editor-panel');
        const isScenePrompt = matchesAny(['escenario','escena','scenario','background','fondo','paisaje','landscape','bosque','forest','cueva','cave','mazmorra','dungeon','ciudad','city','montaña','mountain','mar','sea','playa','beach','cielo','sky','desierto','desert','pantano','swamp','ruinas','ruins','nieve','tundra']);
        if (sceneEditor) {
            if (isScenePrompt) {
                sceneEditor.style.display = 'block';
                // Auto-select scene type btn if matches
                const sceneTypeMap = {
                    'forest': ['bosque','forest'], 'mountain': ['montaña','mountain'],
                    'dungeon': ['mazmorra','dungeon'], 'beach': ['playa','beach','mar','sea'],
                    'city': ['ciudad','city'], 'snow': ['nieve','tundra'],
                    'cave': ['cueva','cave'], 'desert': ['desierto','desert'],
                    'swamp': ['pantano','swamp'], 'ruins': ['ruinas','ruins'],
                    'sky': ['cielo','sky']
                };
                for (const [type, keywords] of Object.entries(sceneTypeMap)) {
                    if (keywords.some(kw => p.includes(kw))) {
                        const typeGrid = document.getElementById('scene-type-grid');
                        if (typeGrid) {
                            typeGrid.querySelectorAll('.char-type-btn').forEach(b => b.classList.remove('active'));
                            const btn = typeGrid.querySelector(`[data-scene-type="${type}"]`);
                            if (btn) btn.classList.add('active');
                        }
                        break;
                    }
                }
            } else {
                sceneEditor.style.display = 'none';
            }
        }

        // Weapons & items
        const isSword     = matchesAny(['espada','sword','katana','sable','daga','dagger','cuchillo','knife']);
        const isAxe       = matchesAny(['hacha','axe','hachuela','tomahawk']);
        const isSpear     = matchesAny(['lanza','spear','pica','pike','lance','tridente','trident']);
        const isMace       = matchesAny(['mangual','flail','maza','mace','martillo','hammer']);
        const isHoe       = matchesAny(['azada','hoe','azadon','azadón','pico','pickaxe','rastrillo','rake','pala','shovel']);
        const isArrow     = matchesAny(['flecha','arrow','saeta']);
        const isSickle    = matchesAny(['hoz','hoces','guadaña','guadana','scythe','sickle']);
        const isBow       = matchesAny(['arco','bow','ballesta','crossbow','sling','honda']);
        const isStaff     = matchesAny(['baston','staff','varita','wand','cetro','scepter','totem']);
        const isShield    = matchesAny(['escudo','shield','armadura','armor']);
        const isHelmet    = matchesAny(['casco','helmet','yelmo','coraza','sombrero','hat']);
        const isPotion    = matchesAny(['pocion','potion','frasco','botella','elixir','brebaje','flask']);
        const isChest     = matchesAny(['cofre','chest','caja','tesoro','treasure','baul']);
        const isRing      = matchesAny(['anillo','ring','alianza','joya','gem','gema','amulet','amuleto']);
        const isKey       = matchesAny(['llave','key']);
        const isScroll    = matchesAny(['pergamino','scroll','libro','book','tomo','grimoire']);
        const isCoin      = matchesAny(['moneda','coin','oro','gold','dinero','money','bolsa','bag']);
        const isPoison    = matchesAny(['veneno','poison','acido','acid','flask']);
        const isTree      = matchesAny(['arbol','tree','planta','plant','flor','flower','hongo','mushroom','seta']);
        const isBuilding  = matchesAny(['torre','tower','castillo','castle','edificio','building','puerta','door','muralla','wall']);
        const isTile      = matchesAny(['terreno','bloque','isométrico','isometric','tile','suelo','ground','cesped','grass','nieve','snow','lava','desierto']);
        const isLongVariant = matchesAny(['larga','largo','long','greatsword','mandoble','claymore','two-handed','dos manos']);
        const isMiniVariant = matchesAny(['mini','pequeña','pequena','pequeño','pequeno','chica','chico','corta','corto','small']);


        // Check if we use custom parameters from active editor
        const isCustomActive = charEditor && charEditor.style.display === 'block';
        if (isCustomActive) {
            const activeTypeBtn = charEditor.querySelector('.char-type-btn.active');
            const customType = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'warrior';
            
            const activeSkin = charEditor.querySelector('.skin-swatch.selected');
            const customSkin = activeSkin ? activeSkin.getAttribute('data-skin') : '#e8b89a';
            
            const activeHair = charEditor.querySelector('.hair-swatch.selected');
            const customHair = activeHair ? activeHair.getAttribute('data-hair') : '#1a0a00';

            const customPrimary = document.getElementById('char-outfit-primary').value;
            const customAccent = document.getElementById('char-outfit-accent').value;
            
            // Invoke dynamic drawer
            drawConfiguredCharacter(cx, cy, customType, customSkin, customHair, customPrimary, customAccent, style);
        } else {
            // ---- Draw depending on detected category ----
            if (isCharacter) {
                if      (isWarrior) drawCharacterWarrior(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isMage)    drawCharacterMage(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isRogue)   drawCharacterRogue(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isHealer)  drawCharacterHealer(cx, cy, baseColor, accentColor, glowColor, style);
                else                drawCharacterWarrior(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isCreature) {
                if      (isSlime)    drawCreatureSlime(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isGoblin)   drawCreatureGoblin(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isSkeleton) drawCreatureSkeleton(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isDragon)   drawCreatureDragon(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isOrc)      drawCreatureOrc(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isGhost)    drawCreatureGhost(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isSpider)   drawCreatureSpider(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isBat)      drawCreatureBat(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isWolf)     drawCreatureWolf(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isGolem)    drawCreatureGolem(cx, cy, baseColor, accentColor, glowColor, style);
                else if (isBoss)     drawCreatureBoss(cx, cy, baseColor, accentColor, glowColor, style);
                else                 drawCreatureGoblin(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isSword) {
                drawSwordAsset(cx, cy, baseColor, accentColor, glowColor, style, isLongVariant);
            } else if (isAxe) {
                drawAxeAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isSpear) {
                drawSpearAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isMace) {
                drawMaceAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isHoe) {
                drawHoeAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isArrow) {
                drawArrowAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isSickle) {
                drawSickleAsset(cx, cy, baseColor, accentColor, glowColor, style, isMiniVariant);
            } else if (isChest) {
                drawChestAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isShield) {
                drawShieldAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isPotion || isPoison) {
                drawPotionAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isTile) {
                drawIsometricBlockAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isBow) {
                drawBowAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isHelmet) {
                drawHelmetAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isRing) {
                drawRingAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isStaff) {
                drawStaffAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isKey) {
                drawKeyAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isScroll) {
                drawScrollAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isCoin) {
                drawCoinAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isTree) {
                drawTreeAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (isBuilding) {
                drawBuildingAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else if (matchesAny(['escenario','escena','scenario','background','fondo','paisaje','landscape','bosque','forest','cueva','cave','mazmorra','dungeon','ciudad','city','montaña','mountain','mar','sea','playa','beach','cielo','sky'])) {
                drawSceneAsset(cx, cy, baseColor, accentColor, glowColor, style);
            } else {
                // Default: Magic Orb
                drawGemAsset(cx, cy, baseColor, accentColor, glowColor, style);
            }
        }
        
        // Apply premium canvas shading, grain and outline effects
        applyHighQualityEffects(style);
        
        const isScene = matchesAny(['escenario','escena','scenario','background','fondo','paisaje','landscape','bosque','forest','cueva','cave','ciudad','city','montaña','mountain','mar','sea']);
        if (isScene) {
            threeMeshSelect.value = 'scene_3d';
            updateThreeMesh('scene_3d');
        } else if (style === 'realistic' || style === 'vector' || style === 'cartoon') {
            threeMeshSelect.value = 'mesh_3d';
            updateThreeMesh('mesh_3d');
        } else {
            threeMeshSelect.value = 'voxel_3d';
            updateThreeMesh('voxel_3d');
        }
        
        // Add to saved library
        saveAssetToLibrary(prompt);
    }
    
    /** Noise helper — simple pseudo-random offset for texture grain */
    function noiseOffset(seed, amp) {
        return (Math.sin(seed * 127.1 + 311.7) * 43758.5453) % amp - amp / 2;
    }

    /** Draw a soft ambient-occlusion shadow ellipse beneath the asset */
    function drawDropShadow(cx, cy, rx, ry, opacity = 0.45) {
        const shadow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
        shadow.addColorStop(0,   `rgba(0,0,0,${opacity})`);
        shadow.addColorStop(0.6, `rgba(0,0,0,${opacity * 0.5})`);
        shadow.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.save();
        ctx.scale(1, ry / Math.max(rx, ry));
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.ellipse(cx, cy * Math.max(rx, ry) / ry, rx, Math.max(rx, ry), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** Draw specular hotspot */
    function drawSpecular(x, y, r, alpha = 0.6) {
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        g.addColorStop(0,   `rgba(255,255,255,${alpha})`);
        g.addColorStop(0.4, `rgba(255,255,255,${alpha * 0.3})`);
        g.addColorStop(1,   'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x - r * 0.3, y - r * 0.3, r, r * 0.65, -Math.PI / 5, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Draw glowing outer halo */
    function drawGlowHalo(cx, cy, r, glowColor, layers = 3) {
        for (let i = layers; i >= 1; i--) {
            const alpha = 0.08 * i;
            const g = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * (1 + i * 0.35));
            // Safely swap out alpha in rgb/rgba strings
            let rgbaParts = glowColor.split(',');
            if (rgbaParts.length > 3) {
                rgbaParts[3] = ` ${alpha})`;
                g.addColorStop(0, rgbaParts.join(','));
            } else {
                g.addColorStop(0, glowColor);
            }
            g.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, r * (1 + i * 0.35), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Procedural Drawing Routines
    function drawSwordAsset(cx, cy, base, acc, glowCol, style, isLong = false) {
        ctx.save();
        
        // Diagonal rotation for traditional RPG sprite layout
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);
        
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256; // scale factor for resolution-independent drawing
        
        const bladeLen = canvas.height * (isLong ? 0.66 : 0.52);
        const bladeW   = pixelated ? (isLong ? 7 : 8) : (realistic ? Math.round((isLong ? 17 : 20) * S) : Math.round((isLong ? 12 : 14) * S));
        const guardW   = pixelated ? (isLong ? 30 : 24) : (realistic ? Math.round((isLong ? 68 : 56) * S) : Math.round((isLong ? 48 : 40) * S));
        const guardH   = realistic ? Math.round(10 * S) : Math.round(7 * S);
        const gripExtra = isLong ? Math.round(22 * S) : 0; // longsword grip has extra room for a second hand

        // ---- DROP SHADOW ----
        if (!pixelated) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.filter = 'blur(6px)';
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - bladeW, cy - bladeLen, bladeW * 2, bladeLen + guardH * 4);
            ctx.restore();
        }

        if (realistic) {
            // ---- POMMEL — multi-stop radial gold orb ----
            const pomY  = cy + guardH * 4 + Math.round(22 * S);
            const pomR  = Math.round(9 * S);
            const pomG  = ctx.createRadialGradient(cx - pomR * 0.3, pomY - pomR * 0.3, 1, cx, pomY, pomR * 1.1);
            pomG.addColorStop(0,   '#fffde4');
            pomG.addColorStop(0.25, '#fbbf24');
            pomG.addColorStop(0.6,  '#b45309');
            pomG.addColorStop(1,    '#451a03');
            ctx.fillStyle = pomG;
            ctx.beginPath();
            ctx.arc(cx, pomY, pomR, 0, Math.PI * 2);
            ctx.fill();
            // pommel rim
            ctx.strokeStyle = 'rgba(255,220,60,0.45)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            drawSpecular(cx - pomR * 0.25, pomY - pomR * 0.25, pomR * 0.55, 0.75);

            // ---- GRIP — leather-wrapped handle ----
            const gripH = Math.round(30 * S);
            const gripW = Math.round(7 * S);
            const gripY = cy + guardH * 4;
            // Leather base
            const gG = ctx.createLinearGradient(cx - gripW, gripY, cx + gripW, gripY);
            gG.addColorStop(0,   '#2d1301');
            gG.addColorStop(0.25, '#7c2d12');
            gG.addColorStop(0.5,  '#c2410c');
            gG.addColorStop(0.75, '#7c2d12');
            gG.addColorStop(1,   '#2d1301');
            ctx.fillStyle = gG;
            ctx.beginPath();
            ctx.roundRect(cx - gripW / 2, gripY, gripW, gripH, 2);
            ctx.fill();
            // Wrapping ribbing bands
            ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
            const step = Math.round(4.5 * S);
            for (let yy = gripY + step * 0.6; yy < gripY + gripH - 2; yy += step) {
                // dark under-band
                ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                ctx.beginPath();
                ctx.moveTo(cx - gripW / 2, yy);
                ctx.lineTo(cx + gripW / 2, yy + Math.round(2 * S));
                ctx.stroke();
                // light over-band
                ctx.strokeStyle = 'rgba(255,200,100,0.18)';
                ctx.beginPath();
                ctx.moveTo(cx - gripW / 2, yy + 1);
                ctx.lineTo(cx + gripW / 2, yy + Math.round(2 * S) + 1);
                ctx.stroke();
            }
            // Grip specular edge
            ctx.strokeStyle = 'rgba(255,255,255,0.12)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx - gripW / 2 + 1, gripY + 2);
            ctx.lineTo(cx - gripW / 2 + 1, gripY + gripH - 2);
            ctx.stroke();

            // ---- GUARD — polished chrome crossguard ----
            const grdY = cy + guardH * 0.5;
            const grdG = ctx.createLinearGradient(cx - guardW / 2, grdY, cx + guardW / 2, grdY + guardH);
            grdG.addColorStop(0,    '#0f172a');
            grdG.addColorStop(0.15, '#64748b');
            grdG.addColorStop(0.35, '#e2e8f0');
            grdG.addColorStop(0.5,  '#f8fafc');
            grdG.addColorStop(0.65, '#e2e8f0');
            grdG.addColorStop(0.85, '#64748b');
            grdG.addColorStop(1,    '#0f172a');
            ctx.fillStyle = grdG;
            ctx.beginPath();
            ctx.ellipse(cx, grdY + guardH / 2, guardW / 2, guardH, 0, 0, Math.PI * 2);
            ctx.fill();
            // Guard rim
            ctx.strokeStyle = 'rgba(100,116,139,0.8)';
            ctx.lineWidth = 1;
            ctx.stroke();
            // Guard specular top
            ctx.strokeStyle = 'rgba(255,255,255,0.55)';
            ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
            ctx.beginPath();
            ctx.ellipse(cx, grdY + guardH * 0.35, guardW * 0.42, guardH * 0.3, 0, Math.PI, 0);
            ctx.stroke();
            // Small gems on guard tips
            [cx - guardW / 2 + Math.round(4 * S), cx + guardW / 2 - Math.round(4 * S)].forEach(gx => {
                const gemG = ctx.createRadialGradient(gx - 2, grdY + guardH / 2 - 2, 0, gx, grdY + guardH / 2, Math.round(5 * S));
                gemG.addColorStop(0, '#fff');
                gemG.addColorStop(0.4, acc);
                gemG.addColorStop(1,   adjustBrightness(acc, -40));
                ctx.fillStyle = gemG;
                ctx.beginPath();
                ctx.arc(gx, grdY + guardH / 2, Math.round(5 * S), 0, Math.PI * 2);
                ctx.fill();
            });

            // ---- BLADE — metallic gradient with fuller groove ----
            const bladeTop  = cy - bladeLen;
            const bladeBase = cy + guardH * 0.5;
            
            // Outer glow halo
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.shadowColor = base;
            ctx.shadowBlur  = Math.round(30 * S);
            ctx.strokeStyle = base;
            ctx.lineWidth   = bladeW;
            ctx.beginPath();
            ctx.moveTo(cx, bladeBase);
            ctx.lineTo(cx, bladeTop);
            ctx.stroke();
            ctx.restore();

            // Main blade body — multi-stop metallic
            const bladeG = ctx.createLinearGradient(cx - bladeW / 2, bladeBase, cx + bladeW / 2, bladeBase);
            bladeG.addColorStop(0,    adjustBrightness(base, -35));
            bladeG.addColorStop(0.12, '#b0b8c4');
            bladeG.addColorStop(0.28, '#dde4ed');
            bladeG.addColorStop(0.45, '#ffffff');
            bladeG.addColorStop(0.55, base);
            bladeG.addColorStop(0.72, '#ffffff');
            bladeG.addColorStop(0.88, '#b0b8c4');
            bladeG.addColorStop(1,    adjustBrightness(base, -35));
            ctx.fillStyle = bladeG;
            ctx.beginPath();
            ctx.moveTo(cx - bladeW / 2, bladeBase);
            ctx.lineTo(cx + bladeW / 2, bladeBase);
            ctx.lineTo(cx + bladeW * 0.25, bladeTop + Math.round(18 * S));
            ctx.lineTo(cx,              bladeTop);
            ctx.lineTo(cx - bladeW * 0.25, bladeTop + Math.round(18 * S));
            ctx.closePath();
            ctx.fill();

            // Fuller / Groove — dark center line with color reflection
            const fullerG = ctx.createLinearGradient(cx - Math.round(2 * S), bladeBase, cx + Math.round(2 * S), bladeBase);
            fullerG.addColorStop(0,   'rgba(0,0,0,0.65)');
            fullerG.addColorStop(0.5, acc);
            fullerG.addColorStop(1,   'rgba(0,0,0,0.65)');
            ctx.fillStyle = fullerG;
            ctx.fillRect(cx - Math.round(1.5 * S), bladeBase - (bladeLen - Math.round(28 * S)), Math.round(3 * S), bladeLen - Math.round(38 * S));

            // Sharp edge specular
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = Math.max(0.5, S * 0.8);
            ctx.beginPath();
            ctx.moveTo(cx - bladeW / 2 + Math.round(1.5 * S), bladeBase);
            ctx.lineTo(cx - bladeW * 0.22, bladeTop + Math.round(16 * S));
            ctx.lineTo(cx,              bladeTop);
            ctx.stroke();

            // Subtle edge ambient-occlusion darkening
            ctx.strokeStyle = 'rgba(0,0,0,0.22)';
            ctx.lineWidth = Math.max(1, Math.round(2 * S));
            ctx.beginPath();
            ctx.moveTo(cx + bladeW / 2 - Math.round(1.5 * S), bladeBase);
            ctx.lineTo(cx + bladeW * 0.22, bladeTop + Math.round(16 * S));
            ctx.lineTo(cx, bladeTop + 1);
            ctx.stroke();

        } else {
            // ---- PIXEL / CARTOON SWORD ----
            const lw = pixelated ? 0 : Math.round(1.5 * S);

            // Guard
            ctx.fillStyle = pixelated ? '#4b5563' : adjustBrightness(acc, -20);
            ctx.fillRect(cx - guardW / 2, cy + Math.round(8 * S), guardW, guardH * 2);
            ctx.fillStyle = acc;
            ctx.fillRect(cx - Math.round(5 * S), cy + Math.round(6 * S), Math.round(10 * S), Math.round(5 * S));

            // Grip
            const gG2 = pixelated ? null : ctx.createLinearGradient(cx - Math.round(4 * S), cy, cx + Math.round(4 * S), cy);
            if (!pixelated) { gG2.addColorStop(0, '#451a03'); gG2.addColorStop(0.5, '#b45309'); gG2.addColorStop(1, '#451a03'); }
            ctx.fillStyle = pixelated ? '#78350f' : gG2;
            ctx.fillRect(cx - Math.round(4 * S), cy + Math.round(16 * S), Math.round(8 * S), Math.round(28 * S));

            // Pommel — sits directly below the grip, connected
            const pomR2 = Math.round(6 * S);
            const gripBottomY = cy + Math.round(16 * S) + Math.round(28 * S); // grip top + grip height
            const pomCY = gripBottomY + pomR2; // flush against grip bottom
            const pomG2 = pixelated ? acc : (() => { const g = ctx.createRadialGradient(cx-2,pomCY-2,1,cx,pomCY,pomR2); g.addColorStop(0,'#fff'); g.addColorStop(0.5,acc); g.addColorStop(1,adjustBrightness(acc,-40)); return g; })();
            ctx.fillStyle = pomG2;
            ctx.beginPath();
            ctx.arc(cx, pomCY, pomR2, 0, Math.PI * 2);
            ctx.fill();

            // Blade with glow
            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(18 * S); }
            const bG2 = pixelated ? base : (() => { const g = ctx.createLinearGradient(cx-bladeW/2, cy, cx+bladeW/2, cy); g.addColorStop(0,adjustBrightness(base,-30)); g.addColorStop(0.4,'#fff'); g.addColorStop(0.6,'#fff'); g.addColorStop(1,adjustBrightness(base,-30)); return g; })();
            ctx.fillStyle = bG2;
            ctx.beginPath();
            ctx.moveTo(cx - bladeW / 2, cy + Math.round(8 * S));
            ctx.lineTo(cx + bladeW / 2, cy + Math.round(8 * S));
            ctx.lineTo(cx + bladeW * 0.3, cy - bladeLen + Math.round(15 * S));
            ctx.lineTo(cx, cy - bladeLen);
            ctx.lineTo(cx - bladeW * 0.3, cy - bladeLen + Math.round(15 * S));
            ctx.closePath();
            ctx.fill();
            if (!pixelated) ctx.shadowBlur = 0;

            // Blade edge highlight
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.moveTo(cx - Math.round(2 * S), cy + Math.round(6 * S));
            ctx.lineTo(cx + Math.round(2 * S), cy + Math.round(6 * S));
            ctx.lineTo(cx + Math.round(1 * S), cy - bladeLen + Math.round(12 * S));
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
        updateThreeTexture();
    }

    // ---- AXE ASSET (hacha) ----
    function drawAxeAsset(cx, cy, base, acc, glowCol, style) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);

        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;

        const shaftLen = canvas.height * 0.58;
        const shaftW   = pixelated ? 7 : Math.round(9 * S);
        const shaftTop = cy - shaftLen * 0.32;
        const shaftBot = cy + shaftLen * 0.68;
        const headY    = shaftTop + Math.round(10 * S);
        const headR    = pixelated ? 30 : Math.round(46 * S);

        // ---- DROP SHADOW ----
        if (!pixelated) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.filter = 'blur(6px)';
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - headR, shaftTop - headR * 0.6, headR * 2, shaftBot - shaftTop + headR);
            ctx.restore();
        }

        if (realistic) {
            // Shaft — wood grain
            const shaftG = ctx.createLinearGradient(cx - shaftW / 2, shaftTop, cx + shaftW / 2, shaftTop);
            shaftG.addColorStop(0,    '#2d1301');
            shaftG.addColorStop(0.3,  '#7c3f18');
            shaftG.addColorStop(0.55, '#a2611f');
            shaftG.addColorStop(0.8,  '#7c3f18');
            shaftG.addColorStop(1,    '#2d1301');
            ctx.fillStyle = shaftG;
            ctx.beginPath();
            ctx.roundRect(cx - shaftW / 2, shaftTop, shaftW, shaftBot - shaftTop, shaftW * 0.4);
            ctx.fill();
            // wrapped leather grip near bottom
            const gripY = shaftBot - Math.round(34 * S);
            ctx.fillStyle = '#1c0f08';
            for (let yy = gripY; yy < shaftBot - Math.round(4 * S); yy += Math.round(5 * S)) {
                ctx.fillRect(cx - shaftW / 2 - 1, yy, shaftW + 2, Math.round(2.5 * S));
            }
            // pommel cap
            ctx.fillStyle = adjustBrightness(acc, -20);
            ctx.beginPath();
            ctx.arc(cx, shaftBot - Math.round(2 * S), Math.round(6 * S), 0, Math.PI * 2);
            ctx.fill();

            // Metal langets (straps binding head to shaft)
            ctx.fillStyle = adjustBrightness(acc, -10);
            ctx.fillRect(cx - shaftW * 0.9, headY - Math.round(4 * S), shaftW * 1.8, Math.round(30 * S));

            // ---- AXE HEAD — single broad crescent blade on one side ----
            ctx.save();
            ctx.shadowColor = base;
            ctx.shadowBlur = Math.round(20 * S);
            const headG = ctx.createLinearGradient(cx, headY - headR, cx + headR, headY + headR);
            headG.addColorStop(0,    adjustBrightness(base, -35));
            headG.addColorStop(0.25, '#dde4ed');
            headG.addColorStop(0.5,  '#ffffff');
            headG.addColorStop(0.55, base);
            headG.addColorStop(0.8,  '#b0b8c4');
            headG.addColorStop(1,    adjustBrightness(base, -40));
            ctx.fillStyle = headG;
            ctx.beginPath();
            ctx.moveTo(cx + shaftW * 0.6, headY - Math.round(20 * S));
            ctx.quadraticCurveTo(cx + headR * 1.15, headY - headR * 0.55, cx + headR * 0.55, headY);
            ctx.quadraticCurveTo(cx + headR * 1.2, headY + headR * 0.65, cx + shaftW * 0.6, headY + Math.round(24 * S));
            ctx.quadraticCurveTo(cx + shaftW * 1.6, headY, cx + shaftW * 0.6, headY - Math.round(20 * S));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // Edge specular
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
            ctx.beginPath();
            ctx.moveTo(cx + shaftW * 0.6, headY - Math.round(18 * S));
            ctx.quadraticCurveTo(cx + headR * 1.1, headY - headR * 0.5, cx + headR * 0.55, headY);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath();
            ctx.moveTo(cx + headR * 0.55, headY);
            ctx.quadraticCurveTo(cx + headR * 1.15, headY + headR * 0.6, cx + shaftW * 0.6, headY + Math.round(22 * S));
            ctx.stroke();

            drawGlowHalo(cx + headR * 0.4, headY, headR * 0.55, glowCol, 2);
        } else {
            // ---- PIXEL / CARTOON AXE ----
            ctx.fillStyle = pixelated ? '#78350f' : '#7c3f18';
            ctx.fillRect(cx - shaftW / 2, shaftTop, shaftW, shaftBot - shaftTop);

            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(14 * S); }
            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.moveTo(cx + shaftW * 0.5, headY - Math.round(16 * S));
            ctx.quadraticCurveTo(cx + headR, headY - headR * 0.5, cx + headR * 0.5, headY);
            ctx.quadraticCurveTo(cx + headR, headY + headR * 0.5, cx + shaftW * 0.5, headY + Math.round(18 * S));
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.moveTo(cx + shaftW * 0.5, headY - Math.round(14 * S));
            ctx.quadraticCurveTo(cx + headR * 0.85, headY - headR * 0.42, cx + headR * 0.45, headY);
            ctx.lineTo(cx + shaftW * 1.1, headY - Math.round(2 * S));
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = acc;
            ctx.fillRect(cx - shaftW * 0.8, headY - Math.round(4 * S), shaftW * 1.6, Math.round(8 * S));
        }

        ctx.restore();
        updateThreeTexture();
    }

    // ---- SPEAR ASSET (lanza) ----
    function drawSpearAsset(cx, cy, base, acc, glowCol, style) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);

        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;

        const shaftLen = canvas.height * 0.82;
        const shaftW   = pixelated ? 5 : Math.round(6 * S);
        const shaftTop = cy - shaftLen * 0.56;
        const shaftBot = cy + shaftLen * 0.44;
        const headLen  = pixelated ? 34 : Math.round(52 * S);
        const headW    = pixelated ? 12 : Math.round(16 * S);

        if (!pixelated) {
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.filter = 'blur(6px)';
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - headW, shaftTop - headLen * 0.3, headW * 2, shaftBot - shaftTop + headLen);
            ctx.restore();
        }

        // ---- SHAFT ----
        const shaftG = ctx.createLinearGradient(cx - shaftW / 2, shaftTop, cx + shaftW / 2, shaftTop);
        if (realistic) {
            shaftG.addColorStop(0,    '#2d1301');
            shaftG.addColorStop(0.35, '#8a4a1c');
            shaftG.addColorStop(0.55, '#c2802f');
            shaftG.addColorStop(0.75, '#8a4a1c');
            shaftG.addColorStop(1,    '#2d1301');
        } else {
            shaftG.addColorStop(0, '#78350f');
            shaftG.addColorStop(0.5, '#a35a1e');
            shaftG.addColorStop(1, '#78350f');
        }
        ctx.fillStyle = shaftG;
        ctx.fillRect(cx - shaftW / 2, shaftTop + headLen * 0.55, shaftW, shaftBot - shaftTop - headLen * 0.55);

        // wrapped grip band + tail cap
        ctx.fillStyle = realistic ? '#1c0f08' : '#3f2409';
        for (let yy = shaftBot - Math.round(50 * S); yy < shaftBot - Math.round(10 * S); yy += Math.round(6 * S)) {
            ctx.fillRect(cx - shaftW / 2 - 1, yy, shaftW + 2, Math.round(2.5 * S));
        }
        ctx.fillStyle = adjustBrightness(acc, -20);
        ctx.beginPath();
        ctx.moveTo(cx - shaftW, shaftBot - Math.round(6 * S));
        ctx.lineTo(cx + shaftW, shaftBot - Math.round(6 * S));
        ctx.lineTo(cx, shaftBot + Math.round(6 * S));
        ctx.closePath();
        ctx.fill();

        // Socket binding where head meets shaft
        ctx.fillStyle = adjustBrightness(acc, -5);
        ctx.fillRect(cx - shaftW * 0.9, shaftTop + headLen * 0.5, shaftW * 1.8, Math.round(12 * S));

        // ---- SPEARHEAD — leaf-shaped blade ----
        if (realistic) {
            ctx.save();
            ctx.shadowColor = base;
            ctx.shadowBlur = Math.round(22 * S);
            const headG = ctx.createLinearGradient(cx - headW / 2, shaftTop, cx + headW / 2, shaftTop);
            headG.addColorStop(0,    adjustBrightness(base, -35));
            headG.addColorStop(0.3,  '#dde4ed');
            headG.addColorStop(0.5,  '#ffffff');
            headG.addColorStop(0.55, base);
            headG.addColorStop(0.85, '#b0b8c4');
            headG.addColorStop(1,    adjustBrightness(base, -40));
            ctx.fillStyle = headG;
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - headLen);
            ctx.quadraticCurveTo(cx + headW * 0.65, shaftTop - headLen * 0.4, cx + headW * 0.28, shaftTop + headLen * 0.35);
            ctx.lineTo(cx - headW * 0.28, shaftTop + headLen * 0.35);
            ctx.quadraticCurveTo(cx - headW * 0.65, shaftTop - headLen * 0.4, cx, shaftTop - headLen);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Center ridge
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = Math.max(1, Math.round(1.2 * S));
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - headLen + Math.round(4 * S));
            ctx.lineTo(cx, shaftTop + headLen * 0.3);
            ctx.stroke();

            // Edge specular
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = Math.max(0.6, S * 0.8);
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - headLen);
            ctx.quadraticCurveTo(cx + headW * 0.55, shaftTop - headLen * 0.4, cx + headW * 0.22, shaftTop + headLen * 0.3);
            ctx.stroke();

            drawGlowHalo(cx, shaftTop - headLen * 0.4, headLen * 0.4, glowCol, 2);
        } else {
            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(14 * S); }
            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - headLen);
            ctx.lineTo(cx + headW * 0.5, shaftTop + headLen * 0.3);
            ctx.lineTo(cx - headW * 0.5, shaftTop + headLen * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - headLen + Math.round(4 * S));
            ctx.lineTo(cx + Math.round(2.5 * S), shaftTop + headLen * 0.2);
            ctx.lineTo(cx - Math.round(1 * S), shaftTop + headLen * 0.2);
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
        updateThreeTexture();
    }

    // ---- MACE ASSET (maza / mangual / martillo) ----
    function drawMaceAsset(cx, cy, base, acc, glowCol, style) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);

        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;

        const shaftLen = canvas.height * 0.5;
        const shaftW   = pixelated ? 7 : Math.round(9 * S);
        const shaftBot = cy + shaftLen * 0.62;
        const shaftTop = cy - shaftLen * 0.38;
        const headR    = pixelated ? 26 : Math.round(38 * S);
        const headCY   = shaftTop - headR * 0.55;

        if (!pixelated) {
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.filter = 'blur(6px)';
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - headR, headCY - headR, headR * 2, shaftBot - headCY + headR);
            ctx.restore();
        }

        // ---- SHAFT / HANDLE ----
        const shaftG = ctx.createLinearGradient(cx - shaftW / 2, shaftTop, cx + shaftW / 2, shaftTop);
        shaftG.addColorStop(0,   '#1c0f08');
        shaftG.addColorStop(0.5, realistic ? '#5c2d12' : '#78350f');
        shaftG.addColorStop(1,   '#1c0f08');
        ctx.fillStyle = shaftG;
        ctx.beginPath();
        ctx.roundRect(cx - shaftW / 2, shaftTop, shaftW, shaftBot - shaftTop, shaftW * 0.4);
        ctx.fill();
        // leather wrap
        for (let yy = shaftBot - Math.round(36 * S); yy < shaftBot - Math.round(6 * S); yy += Math.round(5 * S)) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(cx - shaftW / 2 - 1, yy, shaftW + 2, Math.round(2 * S));
        }
        // pommel loop
        ctx.fillStyle = adjustBrightness(acc, -20);
        ctx.beginPath();
        ctx.arc(cx, shaftBot - Math.round(2 * S), Math.round(5 * S), 0, Math.PI * 2);
        ctx.fill();

        // Collar binding head to shaft
        ctx.fillStyle = adjustBrightness(acc, -10);
        ctx.fillRect(cx - shaftW * 0.9, shaftTop - Math.round(2 * S), shaftW * 1.8, Math.round(14 * S));

        if (realistic) {
            // ---- FLANGED MACE HEAD ----
            ctx.save();
            ctx.shadowColor = base;
            ctx.shadowBlur = Math.round(22 * S);
            const headG = ctx.createRadialGradient(cx - headR * 0.3, headCY - headR * 0.3, 1, cx, headCY, headR * 1.1);
            headG.addColorStop(0,   '#f8fafc');
            headG.addColorStop(0.35, base);
            headG.addColorStop(0.75, adjustBrightness(base, -35));
            headG.addColorStop(1,   '#0f172a');
            ctx.fillStyle = headG;
            ctx.beginPath();
            ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Flanges — angular metal fins radiating from head
            const flangeCount = 6;
            for (let i = 0; i < flangeCount; i++) {
                const a = (Math.PI * 2 / flangeCount) * i - Math.PI / 2;
                const fx1 = cx + Math.cos(a) * headR * 0.35;
                const fy1 = headCY + Math.sin(a) * headR * 0.35;
                const fx2 = cx + Math.cos(a) * headR * 1.25;
                const fy2 = headCY + Math.sin(a) * headR * 1.25;
                const perpA = a + Math.PI / 2;
                const fw = headR * 0.16;
                const flangeG = ctx.createLinearGradient(fx1, fy1, fx2, fy2);
                flangeG.addColorStop(0, adjustBrightness(acc, -10));
                flangeG.addColorStop(0.5, '#e2e8f0');
                flangeG.addColorStop(1, adjustBrightness(acc, -30));
                ctx.fillStyle = flangeG;
                ctx.beginPath();
                ctx.moveTo(fx1 + Math.cos(perpA) * fw, fy1 + Math.sin(perpA) * fw);
                ctx.lineTo(fx2 + Math.cos(perpA) * fw * 0.4, fy2 + Math.sin(perpA) * fw * 0.4);
                ctx.lineTo(fx2 - Math.cos(perpA) * fw * 0.4, fy2 - Math.sin(perpA) * fw * 0.4);
                ctx.lineTo(fx1 - Math.cos(perpA) * fw, fy1 - Math.sin(perpA) * fw);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.25)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            drawSpecular(cx - headR * 0.3, headCY - headR * 0.3, headR * 0.4, 0.7);
            drawGlowHalo(cx, headCY, headR * 1.2, glowCol, 2);
        } else {
            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(14 * S); }
            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.arc(cx, headCY, headR, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // simple spikes
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 / 6) * i;
                const sx1 = cx + Math.cos(a) * headR * 0.8;
                const sy1 = headCY + Math.sin(a) * headR * 0.8;
                const sx2 = cx + Math.cos(a) * headR * 1.35;
                const sy2 = headCY + Math.sin(a) * headR * 1.35;
                ctx.fillStyle = acc;
                ctx.beginPath();
                ctx.moveTo(sx1 + Math.cos(a + Math.PI / 2) * 4, sy1 + Math.sin(a + Math.PI / 2) * 4);
                ctx.lineTo(sx2, sy2);
                ctx.lineTo(sx1 - Math.cos(a + Math.PI / 2) * 4, sy1 - Math.sin(a + Math.PI / 2) * 4);
                ctx.closePath();
                ctx.fill();
            }
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(cx - headR * 0.3, headCY - headR * 0.3, headR * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        updateThreeTexture();
    }

    // ---- HOE ASSET (azada) ----
    function drawHoeAsset(cx, cy, base, acc, glowCol, style) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);

        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;

        const shaftLen = canvas.height * 0.62;
        const shaftW   = pixelated ? 6 : Math.round(7 * S);
        const shaftTop = cy - shaftLen * 0.42;
        const shaftBot = cy + shaftLen * 0.58;
        const bladeW   = pixelated ? 40 : Math.round(56 * S);
        const bladeH   = pixelated ? 18 : Math.round(24 * S);

        if (!pixelated) {
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.filter = 'blur(6px)';
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - bladeW / 2, shaftTop - bladeH, bladeW, shaftBot - shaftTop + bladeH);
            ctx.restore();
        }

        // ---- SHAFT ----
        const shaftG = ctx.createLinearGradient(cx - shaftW / 2, shaftTop, cx + shaftW / 2, shaftTop);
        shaftG.addColorStop(0,   '#2d1301');
        shaftG.addColorStop(0.5, realistic ? '#a2611f' : '#94530f');
        shaftG.addColorStop(1,   '#2d1301');
        ctx.fillStyle = shaftG;
        ctx.fillRect(cx - shaftW / 2, shaftTop + Math.round(6 * S), shaftW, shaftBot - shaftTop - Math.round(6 * S));
        if (realistic) {
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(cx - shaftW / 2, shaftTop + Math.round(6 * S), Math.max(1, shaftW * 0.25), shaftBot - shaftTop - Math.round(6 * S));
        }
        // grip wrap near bottom
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (let yy = shaftBot - Math.round(38 * S); yy < shaftBot - Math.round(8 * S); yy += Math.round(5 * S)) {
            ctx.fillRect(cx - shaftW / 2 - 1, yy, shaftW + 2, Math.round(2 * S));
        }

        // ---- METAL COLLAR / SOCKET connecting blade to shaft ----
        const collarG = ctx.createLinearGradient(cx - shaftW * 0.8, shaftTop, cx + shaftW * 0.8, shaftTop);
        collarG.addColorStop(0, adjustBrightness(acc, -25));
        collarG.addColorStop(0.5, realistic ? adjustBrightness(acc, 10) : acc);
        collarG.addColorStop(1, adjustBrightness(acc, -25));
        ctx.fillStyle = collarG;
        ctx.beginPath();
        ctx.moveTo(cx - shaftW * 0.8, shaftTop + Math.round(6 * S));
        ctx.lineTo(cx + shaftW * 0.8, shaftTop + Math.round(6 * S));
        ctx.lineTo(cx + Math.round(6 * S), shaftTop - Math.round(4 * S));
        ctx.lineTo(cx - Math.round(6 * S), shaftTop - Math.round(4 * S));
        ctx.closePath();
        ctx.fill();
        if (realistic) {
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = Math.max(0.6, S * 0.5);
            ctx.stroke();
            // Rivets pinning collar to shaft
            [-1, 1].forEach(side => {
                const rx = cx + side * shaftW * 0.5, ry = shaftTop + Math.round(3 * S);
                const rG = ctx.createRadialGradient(rx - 1, ry - 1, 0, rx, ry, Math.round(2.4 * S));
                rG.addColorStop(0, '#fff'); rG.addColorStop(1, adjustBrightness(acc, -40));
                ctx.fillStyle = rG;
                ctx.beginPath(); ctx.arc(rx, ry, Math.round(2 * S), 0, Math.PI * 2); ctx.fill();
            });
        }

        // ---- HOE BLADE — flat trapezoidal blade angled perpendicular to shaft ----
        if (realistic) {
            ctx.save();
            ctx.shadowColor = base;
            ctx.shadowBlur = Math.round(18 * S);
            const bladeG = ctx.createLinearGradient(cx - bladeW / 2, shaftTop, cx + bladeW / 2, shaftTop);
            bladeG.addColorStop(0,    adjustBrightness(base, -35));
            bladeG.addColorStop(0.25, '#dde4ed');
            bladeG.addColorStop(0.5,  '#ffffff');
            bladeG.addColorStop(0.55, base);
            bladeG.addColorStop(0.8,  '#b0b8c4');
            bladeG.addColorStop(1,    adjustBrightness(base, -40));
            ctx.fillStyle = bladeG;
            ctx.beginPath();
            ctx.moveTo(cx - Math.round(7 * S), shaftTop - Math.round(2 * S));
            ctx.lineTo(cx + Math.round(7 * S), shaftTop - Math.round(2 * S));
            ctx.lineTo(cx + bladeW / 2, shaftTop - bladeH);
            ctx.quadraticCurveTo(cx, shaftTop - bladeH * 1.35, cx - bladeW / 2, shaftTop - bladeH);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Blade thickness bevel — thin darker strip along the back edge for depth
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            ctx.beginPath();
            ctx.moveTo(cx - Math.round(7 * S), shaftTop - Math.round(2 * S));
            ctx.lineTo(cx + Math.round(7 * S), shaftTop - Math.round(2 * S));
            ctx.lineTo(cx + bladeW * 0.42, shaftTop - bladeH * 0.78);
            ctx.lineTo(cx - bladeW * 0.42, shaftTop - bladeH * 0.78);
            ctx.closePath();
            ctx.fill();

            // Center ridge for definition
            ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            ctx.lineWidth = Math.max(0.6, S * 0.6);
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - Math.round(2 * S));
            ctx.lineTo(cx, shaftTop - bladeH * 1.1);
            ctx.stroke();

            // Edge specular
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = Math.max(1, Math.round(1.3 * S));
            ctx.beginPath();
            ctx.moveTo(cx - bladeW / 2, shaftTop - bladeH);
            ctx.quadraticCurveTo(cx, shaftTop - bladeH * 1.32, cx + bladeW / 2, shaftTop - bladeH);
            ctx.stroke();

            drawGlowHalo(cx, shaftTop - bladeH, bladeW * 0.35, glowCol, 2);
        } else {
            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(12 * S); }
            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.moveTo(cx - Math.round(6 * S), shaftTop);
            ctx.lineTo(cx + Math.round(6 * S), shaftTop);
            ctx.lineTo(cx + bladeW / 2, shaftTop - bladeH);
            ctx.lineTo(cx - bladeW / 2, shaftTop - bladeH);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            // Outline for a crisper cartoon silhouette
            ctx.strokeStyle = adjustBrightness(base, -45);
            ctx.lineWidth = pixelated ? 1.5 : Math.round(1.6 * S);
            ctx.stroke();

            // Bottom shade for a hint of thickness
            ctx.fillStyle = adjustBrightness(base, -25);
            ctx.beginPath();
            ctx.moveTo(cx - Math.round(6 * S), shaftTop);
            ctx.lineTo(cx + Math.round(6 * S), shaftTop);
            ctx.lineTo(cx + bladeW * 0.42, shaftTop - bladeH * 0.35);
            ctx.lineTo(cx - bladeW * 0.42, shaftTop - bladeH * 0.35);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.fillRect(cx - bladeW / 2, shaftTop - bladeH, bladeW, Math.round(3 * S));
        }

        ctx.restore();
        updateThreeTexture();
    }

    // ---- ARROW ASSET (flecha) ----
    function drawArrowAsset(cx, cy, base, acc, glowCol, style) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);

        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;

        const shaftLen = canvas.height * 0.68;
        const shaftW   = pixelated ? 3 : Math.round(3.5 * S);
        const shaftTop = cy - shaftLen * 0.55;
        const shaftBot = cy + shaftLen * 0.45;
        const headLen  = pixelated ? 20 : Math.round(28 * S);
        const headW    = pixelated ? 10 : Math.round(13 * S);
        const fletchLen = pixelated ? 22 : Math.round(30 * S);
        const fletchW   = pixelated ? 12 : Math.round(16 * S);

        if (!pixelated) {
            ctx.save();
            ctx.globalAlpha = 0.2;
            ctx.filter = 'blur(5px)';
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - fletchW, shaftTop - headLen, fletchW * 2, shaftBot - shaftTop + headLen);
            ctx.restore();
        }

        // ---- SHAFT ----
        const shaftG = ctx.createLinearGradient(cx - shaftW / 2, shaftTop, cx + shaftW / 2, shaftTop);
        shaftG.addColorStop(0, '#3a220a');
        shaftG.addColorStop(0.5, realistic ? '#a2611f' : '#94530f');
        shaftG.addColorStop(1, '#3a220a');
        ctx.fillStyle = shaftG;
        ctx.fillRect(cx - shaftW / 2, shaftTop + headLen * 0.5, shaftW, shaftBot - shaftTop - headLen * 0.5);

        // ---- ARROWHEAD ----
        if (realistic) {
            ctx.save();
            ctx.shadowColor = base;
            ctx.shadowBlur = Math.round(14 * S);
            const headG = ctx.createLinearGradient(cx - headW / 2, shaftTop, cx + headW / 2, shaftTop);
            headG.addColorStop(0,    adjustBrightness(base, -35));
            headG.addColorStop(0.3,  '#dde4ed');
            headG.addColorStop(0.5,  '#ffffff');
            headG.addColorStop(0.55, base);
            headG.addColorStop(1,    adjustBrightness(base, -40));
            ctx.fillStyle = headG;
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - headLen);
            ctx.lineTo(cx + headW / 2, shaftTop + headLen * 0.35);
            ctx.lineTo(cx + Math.round(2 * S), shaftTop + headLen * 0.15);
            ctx.lineTo(cx - Math.round(2 * S), shaftTop + headLen * 0.15);
            ctx.lineTo(cx - headW / 2, shaftTop + headLen * 0.35);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = Math.max(0.6, S * 0.7);
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - headLen);
            ctx.lineTo(cx + headW * 0.4, shaftTop + headLen * 0.3);
            ctx.stroke();
        } else {
            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(10 * S); }
            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.moveTo(cx, shaftTop - headLen);
            ctx.lineTo(cx + headW / 2, shaftTop + headLen * 0.3);
            ctx.lineTo(cx - headW / 2, shaftTop + headLen * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // ---- FLETCHING — three feather vanes near the nock end ----
        const fY = shaftBot - fletchLen * 0.7;
        const fletchColors = [acc, adjustBrightness(acc, 20), adjustBrightness(acc, -20)];
        [-1, 0, 1].forEach((side, i) => {
            ctx.save();
            const vaneG = realistic
                ? (() => { const g = ctx.createLinearGradient(cx, fY, cx + side * fletchW, fY); g.addColorStop(0, adjustBrightness(fletchColors[i], -10)); g.addColorStop(1, fletchColors[i]); return g; })()
                : fletchColors[i];
            ctx.fillStyle = vaneG;
            if (!pixelated) { ctx.globalAlpha = 0.92; }
            ctx.beginPath();
            ctx.moveTo(cx, fY);
            ctx.quadraticCurveTo(cx + side * fletchW * (side === 0 ? 0.001 : 1), fY + fletchLen * 0.35, cx + side * fletchW * (side === 0 ? 0.001 : 0.75), fY + fletchLen);
            ctx.lineTo(cx, fY + fletchLen * 0.85);
            ctx.closePath();
            ctx.fill();
            if (realistic) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 0.6;
                ctx.stroke();
            }
            ctx.restore();
        });

        // Nock
        ctx.fillStyle = '#1c0f08';
        ctx.fillRect(cx - shaftW, shaftBot - Math.round(3 * S), shaftW * 2, Math.round(6 * S));

        if (realistic) drawGlowHalo(cx, shaftTop - headLen * 0.3, headLen * 0.5, glowCol, 1);

        ctx.restore();
        updateThreeTexture();
    }

    // ---- SICKLE ASSET (hoz / mini hoz) ----
    function drawSickleAsset(cx, cy, base, acc, glowCol, style, isMini = false) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);

        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;

        const scale = isMini ? 0.62 : 1;
        const handleLen = canvas.height * 0.4 * scale;
        const handleW   = pixelated ? 6 : Math.round(8 * S * scale);
        const handleBot = cy + handleLen * 0.8;
        const handleTop = cy - handleLen * 0.2;
        const bladeR    = pixelated ? 34 * scale : Math.round(54 * S * scale);

        if (!pixelated) {
            ctx.save();
            ctx.globalAlpha = 0.22;
            ctx.filter = 'blur(6px)';
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - bladeR, handleTop - bladeR * 1.6, bladeR * 2, handleBot - handleTop + bladeR * 1.6);
            ctx.restore();
        }

        // ---- HANDLE — wood grip ----
        const handleG = ctx.createLinearGradient(cx - handleW / 2, handleTop, cx + handleW / 2, handleTop);
        handleG.addColorStop(0,   '#2d1301');
        handleG.addColorStop(0.5, realistic ? '#8a4a1c' : '#78350f');
        handleG.addColorStop(1,   '#2d1301');
        ctx.fillStyle = handleG;
        ctx.beginPath();
        ctx.roundRect(cx - handleW / 2, handleTop, handleW, handleBot - handleTop, handleW * 0.4);
        ctx.fill();
        // grip wrap
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (let yy = handleTop + Math.round(8 * S); yy < handleBot - Math.round(10 * S); yy += Math.round(5 * S)) {
            ctx.fillRect(cx - handleW / 2 - 1, yy, handleW + 2, Math.round(2 * S));
        }
        // pommel cap
        ctx.fillStyle = adjustBrightness(acc, -20);
        ctx.beginPath();
        ctx.arc(cx, handleBot - Math.round(2 * S), Math.round(4 * S * scale), 0, Math.PI * 2);
        ctx.fill();

        // Metal ferrule where blade meets handle
        ctx.fillStyle = adjustBrightness(acc, -10);
        ctx.fillRect(cx - handleW * 0.9, handleTop - Math.round(2 * S), handleW * 1.8, Math.round(12 * S));

        // ---- CURVED CRESCENT BLADE ----
        const bladeCX = cx;
        const bladeCY = handleTop - bladeR * 0.15;
        if (realistic) {
            ctx.save();
            ctx.shadowColor = base;
            ctx.shadowBlur = Math.round(20 * S);
            const bladeG = ctx.createLinearGradient(bladeCX - bladeR, bladeCY - bladeR, bladeCX + bladeR, bladeCY + bladeR);
            bladeG.addColorStop(0,    adjustBrightness(base, -35));
            bladeG.addColorStop(0.28, '#dde4ed');
            bladeG.addColorStop(0.5,  '#ffffff');
            bladeG.addColorStop(0.58, base);
            bladeG.addColorStop(0.82, '#b0b8c4');
            bladeG.addColorStop(1,    adjustBrightness(base, -40));
            ctx.fillStyle = bladeG;
            ctx.beginPath();
            // Outer curve (cutting edge) sweeping from handle up and around
            ctx.arc(bladeCX, bladeCY, bladeR, Math.PI * 1.15, Math.PI * 2.05, false);
            // Inner curve (spine) back to handle, thinner arc
            ctx.arc(bladeCX, bladeCY, bladeR * 0.62, Math.PI * 2.05, Math.PI * 1.15, true);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Edge specular along outer curve
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = Math.max(1, Math.round(1.4 * S));
            ctx.beginPath();
            ctx.arc(bladeCX, bladeCY, bladeR, Math.PI * 1.18, Math.PI * 1.85, false);
            ctx.stroke();

            // Inner spine shading
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = Math.max(1, Math.round(2 * S));
            ctx.beginPath();
            ctx.arc(bladeCX, bladeCY, bladeR * 0.62, Math.PI * 1.2, Math.PI * 2, false);
            ctx.stroke();

            drawGlowHalo(bladeCX, bladeCY - bladeR * 0.3, bladeR * 0.6, glowCol, 2);
        } else {
            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(14 * S); }
            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.arc(bladeCX, bladeCY, bladeR, Math.PI * 1.15, Math.PI * 2.05, false);
            ctx.arc(bladeCX, bladeCY, bladeR * 0.6, Math.PI * 2.05, Math.PI * 1.15, true);
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.lineWidth = Math.max(1, Math.round(2 * S));
            ctx.beginPath();
            ctx.arc(bladeCX, bladeCY, bladeR, Math.PI * 1.2, Math.PI * 1.8, false);
            ctx.stroke();
        }

        ctx.restore();
        updateThreeTexture();
    }

    function drawChestAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const w = pixelated ? 80 : Math.round(110 * S);
        const h = pixelated ? 64 : Math.round(90 * S);

        ctx.save();

        // Drop shadow
        if (!pixelated) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.filter = 'blur(8px)';
            ctx.fillStyle = '#000';
            ctx.fillRect(cx - w / 2 + 8, cy + h * 0.4, w - 16, 20);
            ctx.restore();
        }

        if (realistic) {
            // ---- HIGH QUALITY CHEST ----
            // Body wood — multi-layer grain simulation
            const bodyGrad = ctx.createLinearGradient(cx, cy - h / 4, cx, cy + h * 0.55);
            bodyGrad.addColorStop(0,    adjustBrightness(base, 25));
            bodyGrad.addColorStop(0.25, base);
            bodyGrad.addColorStop(0.6,  adjustBrightness(base, -18));
            bodyGrad.addColorStop(1,    adjustBrightness(base, -38));
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.roundRect(cx - w / 2, cy - h / 4, w, h * 0.75, 4);
            ctx.fill();

            // Plank grain lines
            ctx.save();
            ctx.clip();
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.lineWidth = 1.5;
            for (let gx = cx - w / 2 + Math.round(22 * S); gx < cx + w / 2; gx += Math.round(22 * S)) {
                ctx.beginPath();
                ctx.moveTo(gx, cy - h / 4);
                ctx.lineTo(gx + noiseOffset(gx, 4), cy + h * 0.5);
                ctx.stroke();
            }
            ctx.restore();

            // Metal trim sides
            const metalG = ctx.createLinearGradient(cx - w / 2, cy, cx + w / 2, cy);
            metalG.addColorStop(0,   '#f8fafc');
            metalG.addColorStop(0.06,adjustBrightness(acc, -20));
            metalG.addColorStop(0.94,adjustBrightness(acc, -20));
            metalG.addColorStop(1,   '#f8fafc');
            const trimW = Math.round(14 * S);
            ctx.fillStyle = metalG;
            ctx.fillRect(cx - w / 2, cy - h / 4, trimW, h * 0.75);
            ctx.fillRect(cx + w / 2 - trimW, cy - h / 4, trimW, h * 0.75);

            // Horizontal hoop
            const hoopG = ctx.createLinearGradient(cx - w / 2, cy + h * 0.08, cx - w / 2, cy + h * 0.18);
            hoopG.addColorStop(0, adjustBrightness(acc, 30));
            hoopG.addColorStop(0.5, acc);
            hoopG.addColorStop(1, adjustBrightness(acc, -30));
            ctx.fillStyle = hoopG;
            ctx.fillRect(cx - w / 2 + trimW, cy + h * 0.08, w - trimW * 2, Math.round(8 * S));

            // Lid arc — wood
            ctx.fillStyle = bodyGrad;
            ctx.beginPath();
            ctx.arc(cx, cy - h / 4, w / 2, Math.PI, 0);
            ctx.fill();

            // Lid highlight — top sheen
            const lidSheen = ctx.createLinearGradient(cx - w / 2, cy - h / 4 - w / 2, cx + w / 2, cy - h / 4);
            lidSheen.addColorStop(0, 'rgba(255,255,255,0.22)');
            lidSheen.addColorStop(0.5,'rgba(255,255,255,0.08)');
            lidSheen.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = lidSheen;
            ctx.beginPath();
            ctx.arc(cx, cy - h / 4, w / 2, Math.PI, 0);
            ctx.fill();

            // Lid metal corners
            ctx.fillStyle = metalG;
            [[Math.PI, Math.PI + 0.28], [0, -0.28]].forEach(([a, b]) => {
                ctx.beginPath();
                ctx.arc(cx, cy - h / 4, w / 2, a, b, a > b);
                ctx.lineTo(a < 0 ? cx + w / 2 - trimW : cx - w / 2 + trimW, cy - h / 4);
                ctx.closePath();
                ctx.fill();
            });

            // Lock plate
            ctx.fillStyle = '#0f172a';
            const lkW = Math.round(22 * S), lkH = Math.round(22 * S);
            ctx.beginPath();
            ctx.roundRect(cx - lkW / 2, cy - h / 4 + 2, lkW, lkH, 3);
            ctx.fill();
            ctx.strokeStyle = acc;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Lock glow gem
            const lkG = ctx.createRadialGradient(cx - 2, cy - h / 4 + lkH / 2 - 2, 1, cx, cy - h / 4 + lkH / 2, Math.round(6 * S));
            lkG.addColorStop(0, '#fff');
            lkG.addColorStop(0.4, acc);
            lkG.addColorStop(1, adjustBrightness(acc, -30));
            ctx.fillStyle = lkG;
            ctx.beginPath();
            ctx.arc(cx, cy - h / 4 + lkH / 2, Math.round(5 * S), 0, Math.PI * 2);
            ctx.fill();
            drawSpecular(cx - Math.round(3 * S), cy - h / 4 + lkH * 0.3, Math.round(3 * S), 0.8);

            // Coin glow underneath
            drawGlowHalo(cx, cy + h * 0.5, w * 0.4, glowCol, 2);
        } else {
            // ---- PIXEL / CARTOON CHEST ----
            ctx.fillStyle = base;
            ctx.fillRect(cx - w / 2, cy - h / 4, w, h * 0.75);
            ctx.strokeStyle = '#27272a';
            ctx.lineWidth = pixelated ? 2 : Math.round(3 * S);
            ctx.strokeRect(cx - w / 2, cy - h / 4, w, h * 0.75);

            ctx.fillStyle = acc;
            const tw = pixelated ? 10 : Math.round(12 * S);
            ctx.fillRect(cx - w / 2, cy - h / 4, tw, h * 0.75);
            ctx.fillRect(cx + w / 2 - tw, cy - h / 4, tw, h * 0.75);

            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.arc(cx, cy - h / 4, w / 2, Math.PI, 0);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = acc;
            ctx.beginPath();
            ctx.arc(cx, cy - h / 4, w / 2, Math.PI, Math.PI + 0.22);
            ctx.lineTo(cx - w / 2 + tw, cy - h / 4);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.arc(cx, cy - h / 4, w / 2, 0, -0.22, true);
            ctx.lineTo(cx + w / 2 - tw, cy - h / 4);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#1e1b4b';
            ctx.fillRect(cx - Math.round(7 * S), cy - h / 4 + Math.round(4 * S), Math.round(14 * S), Math.round(16 * S));
            ctx.fillStyle = acc;
            ctx.beginPath();
            ctx.arc(cx, cy - h / 4 + Math.round(10 * S), Math.round(4 * S), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        updateThreeTexture();
    }

    function drawShieldAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const w = pixelated ? 70 : Math.round(100 * S);
        const h = pixelated ? 80 : Math.round(115 * S);
        const bevel = Math.round(10 * S);

        ctx.save();

        // ---- Shield path helper ----
        const shieldPath = (ox, oy, ow, oh, flip = false) => {
            ctx.beginPath();
            ctx.moveTo(ox - ow / 2, oy - oh / 2);
            ctx.lineTo(ox + ow / 2, oy - oh / 2);
            ctx.quadraticCurveTo(ox + ow / 2, oy + oh * 0.12, ox, oy + oh / 2);
            ctx.quadraticCurveTo(ox - ow / 2, oy + oh * 0.12, ox - ow / 2, oy - oh / 2);
            ctx.closePath();
        };

        if (realistic) {
            // Drop shadow
            ctx.save(); ctx.globalAlpha = 0.3; ctx.filter = 'blur(10px)';
            ctx.fillStyle = '#000';
            shieldPath(cx, cy, w, h); ctx.fill();
            ctx.restore();

            // Leather strap peeking out from behind the bottom edge
            ctx.save();
            ctx.fillStyle = adjustBrightness('#5b3a1e', -10);
            ctx.beginPath();
            ctx.moveTo(cx - Math.round(9 * S), cy + h * 0.42);
            ctx.lineTo(cx + Math.round(9 * S), cy + h * 0.42);
            ctx.lineTo(cx + Math.round(6 * S), cy + h * 0.58);
            ctx.lineTo(cx - Math.round(6 * S), cy + h * 0.58);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // Outer rim — polished steel bevel with extra graduation for depth
            const rimG = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
            rimG.addColorStop(0,    '#f8fafc');
            rimG.addColorStop(0.12, '#cbd5e1');
            rimG.addColorStop(0.28, '#94a3b8');
            rimG.addColorStop(0.45, adjustBrightness(acc, -10));
            rimG.addColorStop(0.65, adjustBrightness(acc, -22));
            rimG.addColorStop(0.85, adjustBrightness(acc, -35));
            rimG.addColorStop(1,    '#0f172a');
            ctx.fillStyle = rimG;
            shieldPath(cx, cy, w, h); ctx.fill();

            // Rim highlight
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = Math.round(2 * S);
            shieldPath(cx, cy, w - bevel * 0.5, h - bevel * 0.5);
            ctx.stroke();

            // Thin dark groove between rim and face for a machined look
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = Math.max(0.6, S * 0.6);
            shieldPath(cx, cy, w - bevel * 1.5, h - bevel * 1.5);
            ctx.stroke();

            // Inner enamel face
            const faceG = ctx.createRadialGradient(cx - w * 0.15, cy - h * 0.12, Math.round(8 * S), cx, cy, h * 0.55);
            faceG.addColorStop(0,   adjustBrightness(base, 40));
            faceG.addColorStop(0.4, base);
            faceG.addColorStop(1,   adjustBrightness(base, -45));
            ctx.fillStyle = faceG;
            shieldPath(cx, cy, w - bevel * 2, h - bevel * 2); ctx.fill();

            // Faint diagonal sheen across the face
            ctx.save();
            shieldPath(cx, cy, w - bevel * 2, h - bevel * 2);
            ctx.clip();
            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = Math.round(10 * S);
            ctx.beginPath();
            ctx.moveTo(cx - w * 0.5, cy - h * 0.5);
            ctx.lineTo(cx, cy + h * 0.1);
            ctx.stroke();
            ctx.restore();

            // Corner rivets on the face, near the top corners
            [-1, 1].forEach(side => {
                const rx = cx + side * (w / 2 - bevel * 1.4), ry = cy - h * 0.32;
                const rG = ctx.createRadialGradient(rx - 1, ry - 1, 0, rx, ry, Math.round(3.5 * S));
                rG.addColorStop(0, '#fff'); rG.addColorStop(1, '#64748b');
                ctx.fillStyle = rG;
                ctx.beginPath(); ctx.arc(rx, ry, Math.round(3 * S), 0, Math.PI * 2); ctx.fill();
            });

            // Boss (center metal knob)
            const bossR = Math.round(18 * S);
            const bossG = ctx.createRadialGradient(cx - bossR * 0.3, cy - bossR * 0.3, 1, cx, cy, bossR * 1.1);
            bossG.addColorStop(0,   '#f8fafc');
            bossG.addColorStop(0.3, acc);
            bossG.addColorStop(0.7, adjustBrightness(acc, -30));
            bossG.addColorStop(1,   '#0f172a');
            ctx.fillStyle = bossG;
            ctx.beginPath(); ctx.arc(cx, cy, bossR, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.lineWidth = Math.max(0.6, S * 0.6);
            ctx.stroke();
            drawSpecular(cx - bossR * 0.3, cy - bossR * 0.3, bossR * 0.5, 0.8);

            // Decorative rivets around boss
            for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
                const rx = cx + Math.cos(a) * bossR * 1.7;
                const ry = cy + Math.sin(a) * bossR * 1.7;
                const rG = ctx.createRadialGradient(rx - 1, ry - 1, 0, rx, ry, Math.round(4 * S));
                rG.addColorStop(0, '#fff'); rG.addColorStop(1, '#64748b');
                ctx.fillStyle = rG;
                ctx.beginPath(); ctx.arc(rx, ry, Math.round(3.5 * S), 0, Math.PI * 2); ctx.fill();
            }

            // Glow halo edge
            drawGlowHalo(cx, cy, Math.max(w, h) * 0.52, glowCol, 2);

        } else {
            // ---- PIXEL / CARTOON SHIELD ----
            ctx.fillStyle = adjustBrightness(acc, -20);
            shieldPath(cx, cy, w, h); ctx.fill();

            const faceG = pixelated ? base : (() => {
                const g = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
                g.addColorStop(0, adjustBrightness(base, 22));
                g.addColorStop(1, adjustBrightness(base, -15));
                return g;
            })();
            ctx.fillStyle = faceG;
            shieldPath(cx, cy, w - bevel * 2, h - bevel * 2); ctx.fill();

            if (!pixelated) {
                ctx.strokeStyle = adjustBrightness(acc, -40);
                ctx.lineWidth = Math.round(1.5 * S);
                shieldPath(cx, cy, w - bevel * 2, h - bevel * 2); ctx.stroke();
            }

            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(12 * S); }
            const bossG2 = pixelated ? '#ffffff' : (() => {
                const g = ctx.createRadialGradient(cx - 3 * S, cy - Math.round(13 * S), 0, cx, cy - Math.round(10 * S), Math.round(13 * S));
                g.addColorStop(0, '#ffffff');
                g.addColorStop(1, adjustBrightness(acc, 10));
                return g;
            })();
            ctx.fillStyle = bossG2;
            ctx.beginPath();
            ctx.arc(cx, cy - Math.round(10 * S), Math.round(13 * S), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            if (!pixelated) {
                ctx.strokeStyle = adjustBrightness(acc, -30);
                ctx.lineWidth = Math.round(1 * S);
                ctx.stroke();
            }

            // Cross emblem with a thin border for a crisper, more "polished" silhouette
            ctx.fillStyle = acc;
            ctx.strokeStyle = adjustBrightness(acc, -45);
            ctx.lineWidth = pixelated ? 1 : Math.round(1 * S);
            [
                [cx - Math.round(2.5 * S), cy - Math.round(20 * S), Math.round(5 * S), Math.round(20 * S)],
                [cx - Math.round(10 * S), cy - Math.round(13 * S), Math.round(20 * S), Math.round(5 * S)]
            ].forEach(([x, y, ww, hh]) => {
                ctx.fillRect(x, y, ww, hh);
                if (!pixelated) ctx.strokeRect(x, y, ww, hh);
            });

            // Corner studs for a bit more detail on the non-realistic variant
            if (!pixelated) {
                [-1, 1].forEach(side => {
                    const rx = cx + side * (w / 2 - bevel * 1.3), ry = cy - h * 0.3;
                    ctx.fillStyle = '#f1f5f9';
                    ctx.beginPath(); ctx.arc(rx, ry, Math.round(2.5 * S), 0, Math.PI * 2); ctx.fill();
                });
            }
        }

        ctx.restore();
        updateThreeTexture();
    }

    function drawPotionAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const w = pixelated ? 50 : Math.round(80 * S);
        const h = pixelated ? 75 : Math.round(110 * S);

        ctx.save();

        if (realistic) {
            // ---- HIGH QUALITY POTION ----
            const bulbR  = w / 2;
            const bulbCY = cy + Math.round(22 * S);
            const neckW  = Math.round(18 * S);
            const neckH  = Math.round(55 * S);
            const neckX  = cx - neckW / 2;
            const neckY  = bulbCY - bulbR - neckH + Math.round(6 * S);

            // Drop shadow
            ctx.save(); ctx.globalAlpha = 0.25; ctx.filter = 'blur(10px)';
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.ellipse(cx + 6, bulbCY + bulbR * 0.8, bulbR * 0.6, bulbR * 0.2, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // Liquid fill inside bulb
            const liqG = ctx.createRadialGradient(cx - bulbR * 0.25, bulbCY - bulbR * 0.22, bulbR * 0.08, cx, bulbCY, bulbR);
            liqG.addColorStop(0,   '#ffffff');
            liqG.addColorStop(0.18, acc);
            liqG.addColorStop(0.55, base);
            liqG.addColorStop(0.85, adjustBrightness(base, -30));
            liqG.addColorStop(1,   adjustBrightness(base, -50));
            ctx.fillStyle = liqG;
            ctx.beginPath(); ctx.arc(cx, bulbCY, bulbR, 0, Math.PI * 2); ctx.fill();

            // Animated bubbles
            [[-bulbR * 0.3, bulbR * 0.1, bulbR * 0.1], [bulbR * 0.2, -bulbR * 0.2, bulbR * 0.06], [-bulbR * 0.1, -bulbR * 0.35, bulbR * 0.08]].forEach(([bx, by, br]) => {
                const bG = ctx.createRadialGradient(cx + bx - br * 0.3, bulbCY + by - br * 0.3, 0, cx + bx, bulbCY + by, br);
                bG.addColorStop(0, 'rgba(255,255,255,0.8)');
                bG.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = bG;
                ctx.beginPath(); ctx.arc(cx + bx, bulbCY + by, br, 0, Math.PI * 2); ctx.fill();
            });

            // Glass bulb outline (translucent)
            const glassG = ctx.createLinearGradient(cx - bulbR, bulbCY, cx + bulbR, bulbCY);
            glassG.addColorStop(0,   'rgba(255,255,255,0.5)');
            glassG.addColorStop(0.1, 'rgba(255,255,255,0.08)');
            glassG.addColorStop(0.9, 'rgba(255,255,255,0.08)');
            glassG.addColorStop(1,   'rgba(255,255,255,0.5)');
            ctx.strokeStyle = glassG;
            ctx.lineWidth = Math.round(4 * S);
            ctx.beginPath(); ctx.arc(cx, bulbCY, bulbR + 1, 0, Math.PI * 2); ctx.stroke();

            // Inner crescent reflection
            ctx.strokeStyle = 'rgba(255,255,255,0.6)';
            ctx.lineWidth = Math.round(2.5 * S);
            ctx.beginPath();
            ctx.arc(cx, bulbCY, bulbR * 0.68, Math.PI * 0.6, Math.PI * 1.35);
            ctx.stroke();

            // Neck — semi-transparent glass tube
            const neckG = ctx.createLinearGradient(neckX, neckY, neckX + neckW, neckY);
            neckG.addColorStop(0,   'rgba(255,255,255,0.45)');
            neckG.addColorStop(0.3, 'rgba(255,255,255,0.08)');
            neckG.addColorStop(0.7, 'rgba(255,255,255,0.08)');
            neckG.addColorStop(1,   'rgba(255,255,255,0.45)');
            // Liquid color filling neck
            ctx.fillStyle = base + 'aa'; // semi-transparent
            ctx.beginPath(); ctx.roundRect(neckX + 2, neckY, neckW - 4, neckH, 2); ctx.fill();
            ctx.strokeStyle = neckG;
            ctx.lineWidth = Math.round(2.5 * S);
            ctx.beginPath(); ctx.roundRect(neckX, neckY, neckW, neckH, 3); ctx.stroke();

            // Cork
            const corkY = neckY - Math.round(10 * S);
            const corkH = Math.round(12 * S);
            const corkG = ctx.createLinearGradient(neckX - 3, corkY, neckX + neckW + 3, corkY + corkH);
            corkG.addColorStop(0,   '#6b3a1a');
            corkG.addColorStop(0.3, '#c2641c');
            corkG.addColorStop(0.6, '#b45309');
            corkG.addColorStop(1,   '#6b3a1a');
            ctx.fillStyle = corkG;
            ctx.beginPath(); ctx.roundRect(neckX - Math.round(3 * S), corkY, neckW + Math.round(6 * S), corkH, 3); ctx.fill();
            drawSpecular(cx - Math.round(4 * S), corkY + Math.round(3 * S), Math.round(6 * S), 0.55);

            // Glow outer halo from the liquid
            drawGlowHalo(cx, bulbCY, bulbR * 1.05, glowCol, 3);
            drawSpecular(cx - bulbR * 0.28, bulbCY - bulbR * 0.28, bulbR * 0.42, 0.5);

        } else {
            // ---- PIXEL / CARTOON POTION ----
            const bulbR2 = w / 2, bulbCY2 = cy + Math.round(20 * S);
            const nkW = Math.round(14 * S), nkH = Math.round(48 * S);
            const nkX = cx - nkW / 2, nkY = bulbCY2 - bulbR2 - nkH + Math.round(6 * S);

            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(20 * S); }
            ctx.fillStyle = base;
            ctx.beginPath(); ctx.arc(cx, bulbCY2, bulbR2, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = pixelated ? 3 : Math.round(4 * S);
            ctx.beginPath(); ctx.arc(cx, bulbCY2, bulbR2 + 2, 0, Math.PI * 2); ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.fillRect(nkX, nkY, nkW, nkH);
            ctx.strokeStyle = '#ffffff';
            ctx.strokeRect(nkX, nkY, nkW, nkH);

            ctx.fillStyle = '#b45309';
            ctx.fillRect(nkX - Math.round(3 * S), nkY - Math.round(10 * S), nkW + Math.round(6 * S), Math.round(10 * S));

            // Bubbles
            ctx.fillStyle = acc;
            [[cx - bulbR2 * 0.3, bulbCY2 + bulbR2 * 0.1, bulbR2 * 0.12],
             [cx + bulbR2 * 0.25, bulbCY2 - bulbR2 * 0.2, bulbR2 * 0.08],
             [cx - bulbR2 * 0.1, bulbCY2 - bulbR2 * 0.35, bulbR2 * 0.1]].forEach(([bx, by, br]) => {
                ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
            });
        }

        ctx.restore();
        updateThreeTexture();
    }

    function drawIsometricBlockAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const w = pixelated ? 96 : Math.round(148 * S);
        const h = w / 2; // Isometric ratio

        ctx.save();

        const drawFace = (points, fillStyle) => {
            ctx.fillStyle = fillStyle;
            ctx.beginPath();
            ctx.moveTo(...points[0]);
            points.slice(1).forEach(p => ctx.lineTo(...p));
            ctx.closePath();
            ctx.fill();
        };

        const topPts  = [[cx, cy - h], [cx + w/2, cy - h/2], [cx, cy], [cx - w/2, cy - h/2]];
        const leftPts = [[cx, cy],     [cx - w/2, cy - h/2], [cx - w/2, cy + h/2], [cx, cy + h]];
        const rightPts= [[cx, cy],     [cx + w/2, cy - h/2], [cx + w/2, cy + h/2], [cx, cy + h]];

        if (realistic) {
            // Ambient-occlusion drop shadow
            ctx.save(); ctx.globalAlpha = 0.3; ctx.filter = 'blur(10px)';
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.9, w * 0.45, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // ---- Left face — dirt / stone underlit ----
            const lG = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx, cy + h);
            lG.addColorStop(0,   adjustBrightness(base, -5));
            lG.addColorStop(0.5, adjustBrightness(base, -22));
            lG.addColorStop(1,   adjustBrightness(base, -42));
            drawFace(leftPts, lG);

            // Vertical crack texture on left face
            ctx.save(); ctx.beginPath(); ctx.moveTo(...leftPts[0]); leftPts.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath(); ctx.clip();
            ctx.strokeStyle = 'rgba(0,0,0,0.12)';
            ctx.lineWidth = Math.round(1.5 * S);
            for (let i = 0; i < 4; i++) {
                const gx = cx - w * 0.4 + i * w * 0.12;
                ctx.beginPath(); ctx.moveTo(gx, cy - h * 0.4); ctx.lineTo(gx + noiseOffset(i, 8), cy + h * 0.5); ctx.stroke();
            }
            ctx.restore();

            // ---- Right face — darkest ----
            const rG = ctx.createLinearGradient(cx, cy - h / 2, cx + w / 2, cy + h);
            rG.addColorStop(0,   adjustBrightness(base, -28));
            rG.addColorStop(1,   adjustBrightness(base, -55));
            drawFace(rightPts, rG);

            // Right face AO corner edge
            ctx.save(); ctx.beginPath(); ctx.moveTo(...rightPts[0]); rightPts.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath(); ctx.clip();
            const aoG = ctx.createLinearGradient(cx, cy, cx + Math.round(8 * S), cy);
            aoG.addColorStop(0, 'rgba(0,0,0,0.35)'); aoG.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = aoG; ctx.fillRect(cx, cy - h, Math.round(12 * S), h * 2);
            ctx.restore();

            // ---- Top face — lit surface ----
            const tG = ctx.createLinearGradient(cx - w / 2, cy - h, cx + w / 2, cy - h / 2);
            tG.addColorStop(0,   adjustBrightness(acc, 20));
            tG.addColorStop(0.3, acc);
            tG.addColorStop(0.7, adjustBrightness(acc, 8));
            tG.addColorStop(1,   adjustBrightness(acc, -14));
            drawFace(topPts, tG);

            // Top surface specular sheen
            const topSheen = ctx.createLinearGradient(cx - w / 2, cy - h, cx, cy - h / 2);
            topSheen.addColorStop(0, 'rgba(255,255,255,0.2)');
            topSheen.addColorStop(0.5, 'rgba(255,255,255,0.06)');
            topSheen.addColorStop(1, 'rgba(255,255,255,0)');
            drawFace(topPts, topSheen);

            // Grass overhang detail
            ctx.fillStyle = adjustBrightness(acc, 15);
            ctx.beginPath();
            ctx.moveTo(cx - w / 2, cy - h / 2);
            ctx.bezierCurveTo(cx - w * 0.32, cy - h * 0.18, cx - w * 0.18, cy + Math.round(8 * S), cx, cy + Math.round(7 * S));
            ctx.bezierCurveTo(cx + w * 0.18, cy + Math.round(8 * S), cx + w * 0.32, cy - h * 0.18, cx + w / 2, cy - h / 2);
            ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();

            // Block edge outlines
            ctx.strokeStyle = 'rgba(0,0,0,0.25)';
            ctx.lineWidth = Math.round(1.5 * S);
            ctx.beginPath();
            topPts.forEach((p, i) => i === 0 ? ctx.moveTo(...p) : ctx.lineTo(...p));
            ctx.closePath(); ctx.stroke();

        } else {
            // ---- PIXEL / CARTOON ISO BLOCK ----
            drawFace(leftPts,  base);
            drawFace(rightPts, adjustBrightness(base, -22));
            drawFace(topPts,   acc);

            ctx.fillStyle = acc;
            ctx.beginPath();
            ctx.moveTo(cx - w / 2, cy - h / 2);
            ctx.lineTo(cx - w / 4, cy - h / 4 + Math.round(12 * S));
            ctx.lineTo(cx, cy + Math.round(14 * S));
            ctx.lineTo(cx + w / 4, cy - h / 4 + Math.round(12 * S));
            ctx.lineTo(cx + w / 2, cy - h / 2);
            ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
        }

        ctx.restore();
        updateThreeTexture();
    }

    function drawGemAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const w = pixelated ? 64 : Math.round(90 * S);
        
        ctx.save();

        // Gem silhouette path (octagonal)
        const gemPath = (size) => {
            const c = size / 2;
            const c3 = size * 0.3;
            ctx.beginPath();
            ctx.moveTo(cx,          cy - c);
            ctx.lineTo(cx + c3,     cy - c * 0.45);
            ctx.lineTo(cx + c,      cy);
            ctx.lineTo(cx + c3,     cy + c * 0.55);
            ctx.lineTo(cx,          cy + c);
            ctx.lineTo(cx - c3,     cy + c * 0.55);
            ctx.lineTo(cx - c,      cy);
            ctx.lineTo(cx - c3,     cy - c * 0.45);
            ctx.closePath();
        };

        if (realistic) {
            // Outer glow
            drawGlowHalo(cx, cy, w * 0.52, glowCol, 3);

            // Main body — deep crystal radial gradient
            const gemG = ctx.createRadialGradient(cx - w * 0.2, cy - w * 0.2, w * 0.04, cx, cy, w * 0.65);
            gemG.addColorStop(0,    '#ffffff');
            gemG.addColorStop(0.15, acc);
            gemG.addColorStop(0.45, base);
            gemG.addColorStop(0.75, adjustBrightness(base, -30));
            gemG.addColorStop(1,    adjustBrightness(base, -60));
            ctx.fillStyle = gemG;
            gemPath(w); ctx.fill();

            // Inner depth / dark volume
            const innerG = ctx.createRadialGradient(cx, cy + w * 0.1, w * 0.05, cx, cy, w * 0.45);
            innerG.addColorStop(0, 'rgba(0,0,0,0)');
            innerG.addColorStop(0.6, 'rgba(0,0,0,0)');
            innerG.addColorStop(1, 'rgba(0,0,0,0.35)');
            ctx.fillStyle = innerG;
            gemPath(w); ctx.fill();

            // Facet lines
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = Math.max(0.8, S);
            [[cx, cy - w / 2, cx, cy + w / 2],
             [cx - w / 2, cy, cx + w / 2, cy],
             [cx - w * 0.3, cy - w * 0.45, cx + w * 0.3, cy + w * 0.55],
             [cx + w * 0.3, cy - w * 0.45, cx - w * 0.3, cy + w * 0.55]].forEach(([x1,y1,x2,y2]) => {
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            });

            // Top crown shine
            const topShine = ctx.createLinearGradient(cx - w * 0.3, cy - w * 0.5, cx + w * 0.3, cy - w * 0.1);
            topShine.addColorStop(0, 'rgba(255,255,255,0.6)');
            topShine.addColorStop(0.5,'rgba(255,255,255,0.15)');
            topShine.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = topShine;
            ctx.beginPath();
            ctx.moveTo(cx, cy - w / 2);
            ctx.lineTo(cx + w * 0.3, cy - w * 0.45);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx - w * 0.3, cy - w * 0.45);
            ctx.closePath(); ctx.fill();

            // Specular hotspot
            drawSpecular(cx - w * 0.15, cy - w * 0.18, w * 0.22, 0.7);

            // Sparkle star particles
            [[cx + w * 0.48, cy - w * 0.02], [cx - w * 0.48, cy + w * 0.05], [cx, cy - w * 0.52], [cx + w * 0.15, cy + w * 0.52]].forEach(([sx, sy]) => {
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = Math.max(0.8, S * 0.8);
                const sl = Math.round(7 * S);
                ctx.beginPath(); ctx.moveTo(sx - sl, sy); ctx.lineTo(sx + sl, sy);
                ctx.moveTo(sx, sy - sl); ctx.lineTo(sx, sy + sl); ctx.stroke();
            });

        } else {
            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(18 * S); }
            ctx.fillStyle = base;
            gemPath(w); ctx.fill();
            ctx.shadowBlur = 0;

            // Facet shading
            ctx.fillStyle = acc;
            ctx.beginPath();
            ctx.moveTo(cx, cy - w / 2);
            ctx.lineTo(cx + w / 2, cy);
            ctx.lineTo(cx, cy);
            ctx.closePath(); ctx.fill();

            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.beginPath();
            ctx.moveTo(cx, cy - w / 2);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx - w / 4, cy - w / 4);
            ctx.closePath(); ctx.fill();
        }

        ctx.restore();
        updateThreeTexture();
    }

    // ---- BOW ASSET ----
    function drawBowAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const radius = pixelated ? 54 : Math.round(76 * S);
        const armX = cx + radius * 0.32;
        const topAngle = Math.PI * 0.58;
        const botAngle = Math.PI * 1.42;
        const topX = armX + radius * Math.cos(topAngle);
        const topY = cy + radius * Math.sin(topAngle);
        const botX = armX + radius * Math.cos(botAngle);
        const botY = cy + radius * Math.sin(botAngle);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 5); // tilt
        ctx.translate(-cx, -cy);

        if (realistic) {
            // Drop shadow
            ctx.save();
            ctx.globalAlpha = 0.25; ctx.filter = 'blur(6px)';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = Math.round(13 * S);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(armX + Math.round(3 * S), cy + Math.round(3 * S), radius, topAngle, botAngle);
            ctx.stroke();
            ctx.restore();

            // ---- Bow limbs — layered wood gradient (recurve profile) ----
            const bowG = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
            bowG.addColorStop(0,    adjustBrightness(base, 45));
            bowG.addColorStop(0.22, adjustBrightness(base, 15));
            bowG.addColorStop(0.5,  base);
            bowG.addColorStop(0.75, adjustBrightness(base, -25));
            bowG.addColorStop(1,    adjustBrightness(base, -48));
            ctx.strokeStyle = bowG;
            ctx.lineWidth = Math.round(11 * S);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(armX, cy, radius, topAngle, botAngle);
            ctx.stroke();

            // Dark outline for definition
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = Math.max(1, Math.round(1 * S));
            ctx.beginPath();
            ctx.arc(armX, cy, radius + Math.round(5.5 * S), topAngle, botAngle);
            ctx.stroke();

            // Wood-grain streaks
            ctx.save();
            ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            ctx.lineWidth = Math.max(0.6, S * 0.6);
            for (let t = 0.12; t < 0.95; t += 0.13) {
                const a = topAngle + (botAngle - topAngle) * t;
                ctx.beginPath();
                ctx.arc(armX, cy, radius - Math.round(3 * S), a, a + 0.05);
                ctx.stroke();
            }
            ctx.restore();

            // Specular highlight streak along outer curve
            ctx.strokeStyle = 'rgba(255,255,255,0.32)';
            ctx.lineWidth = Math.round(2.2 * S);
            ctx.beginPath();
            ctx.arc(armX + Math.round(2 * S), cy, radius - Math.round(2.5 * S), topAngle + 0.08, botAngle - 0.08);
            ctx.stroke();

            // Tip nocks (horn caps at each end)
            [[topX, topY, topAngle], [botX, botY, botAngle]].forEach(([tx, ty]) => {
                const capG = ctx.createRadialGradient(tx - 2 * S, ty - 2 * S, 0, tx, ty, Math.round(7 * S));
                capG.addColorStop(0, '#f5efe3');
                capG.addColorStop(0.5, acc);
                capG.addColorStop(1, adjustBrightness(acc, -35));
                ctx.fillStyle = capG;
                ctx.beginPath();
                ctx.arc(tx, ty, Math.round(6 * S), 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = Math.max(0.6, S * 0.6);
                ctx.stroke();
            });

            // ---- Grip / riser — wrapped leather at center ----
            const gripH = Math.round(30 * S), gripW = Math.round(11 * S);
            ctx.save();
            ctx.translate(armX - radius * 0.03, cy);
            const gripG = ctx.createLinearGradient(-gripW / 2, 0, gripW / 2, 0);
            gripG.addColorStop(0, adjustBrightness(acc, -30));
            gripG.addColorStop(0.5, acc);
            gripG.addColorStop(1, adjustBrightness(acc, -45));
            ctx.fillStyle = gripG;
            ctx.beginPath();
            ctx.roundRect(-gripW / 2, -gripH / 2, gripW, gripH, Math.round(3 * S));
            ctx.fill();
            // Wrap bands
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = Math.max(0.7, S * 0.7);
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.moveTo(-gripW / 2, i * gripH / 5.5);
                ctx.lineTo(gripW / 2, i * gripH / 5.5);
                ctx.stroke();
            }
            ctx.restore();

            // ---- Bowstring — taut, subtle double-strand look ----
            const midPullX = armX - radius * 0.18;
            ctx.strokeStyle = '#f1f5f9';
            ctx.lineWidth = Math.max(1, Math.round(1.4 * S));
            ctx.beginPath();
            ctx.moveTo(topX, topY);
            ctx.quadraticCurveTo(midPullX, cy, botX, botY);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(15,23,42,0.25)';
            ctx.lineWidth = Math.max(0.5, S * 0.5);
            ctx.beginPath();
            ctx.moveTo(topX, topY);
            ctx.quadraticCurveTo(midPullX + Math.round(1 * S), cy, botX, botY);
            ctx.stroke();

            // ---- Nocked arrow resting on the string ----
            const arrowTipX = armX - radius * 0.62;
            ctx.strokeStyle = adjustBrightness('#8a5a2b', -10);
            ctx.lineWidth = Math.round(2.4 * S);
            ctx.beginPath();
            ctx.moveTo(arrowTipX, cy);
            ctx.lineTo(midPullX + Math.round(2 * S), cy);
            ctx.stroke();
            // Arrowhead
            ctx.save();
            ctx.shadowColor = base; ctx.shadowBlur = Math.round(8 * S);
            ctx.fillStyle = adjustBrightness(base, -10);
            ctx.beginPath();
            ctx.moveTo(arrowTipX - Math.round(9 * S), cy);
            ctx.lineTo(arrowTipX + Math.round(2 * S), cy - Math.round(4 * S));
            ctx.lineTo(arrowTipX + Math.round(2 * S), cy + Math.round(4 * S));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            // Fletching
            ctx.fillStyle = acc;
            ctx.beginPath();
            ctx.moveTo(midPullX + Math.round(2 * S), cy);
            ctx.lineTo(midPullX + Math.round(9 * S), cy - Math.round(5 * S));
            ctx.lineTo(midPullX + Math.round(9 * S), cy + Math.round(5 * S));
            ctx.closePath();
            ctx.fill();

            drawGlowHalo(armX, cy, radius * 0.6, glowCol, 2);
        } else {
            // ---- PIXEL / CARTOON BOW ----
            ctx.strokeStyle = pixelated ? base : adjustBrightness(base, -15);
            ctx.lineWidth = pixelated ? 7 : Math.round(9 * S);
            ctx.lineCap = pixelated ? 'butt' : 'round';
            ctx.beginPath();
            ctx.arc(armX, cy, radius, topAngle, botAngle);
            ctx.stroke();

            if (!pixelated) {
                ctx.strokeStyle = adjustBrightness(base, 25);
                ctx.lineWidth = Math.round(3 * S);
                ctx.beginPath();
                ctx.arc(armX + Math.round(1.5 * S), cy, radius - Math.round(2 * S), topAngle + 0.1, botAngle - 0.1);
                ctx.stroke();
            }

            // Tip caps
            [[topX, topY], [botX, botY]].forEach(([tx, ty]) => {
                ctx.fillStyle = acc;
                ctx.beginPath();
                ctx.arc(tx, ty, pixelated ? 4 : Math.round(5.5 * S), 0, Math.PI * 2);
                ctx.fill();
            });

            // Grip block
            ctx.fillStyle = acc;
            const gw = pixelated ? 8 : Math.round(10 * S), gh = pixelated ? 22 : Math.round(28 * S);
            ctx.fillRect(armX - gw / 2 - radius * 0.02, cy - gh / 2, gw, gh);

            // String
            ctx.strokeStyle = pixelated ? '#e5e7eb' : '#d1d5db';
            ctx.lineWidth = pixelated ? 1 : Math.round(2 * S);
            ctx.beginPath();
            ctx.moveTo(topX, topY);
            ctx.quadraticCurveTo(armX - radius * 0.18, cy, botX, botY);
            ctx.stroke();

            // Simple nocked arrow
            ctx.strokeStyle = '#94530f';
            ctx.lineWidth = pixelated ? 2 : Math.round(3 * S);
            ctx.beginPath();
            ctx.moveTo(armX - radius * 0.62, cy);
            ctx.lineTo(armX - radius * 0.16, cy);
            ctx.stroke();
            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.moveTo(armX - radius * 0.72, cy);
            ctx.lineTo(armX - radius * 0.58, cy - Math.round(4 * S));
            ctx.lineTo(armX - radius * 0.58, cy + Math.round(4 * S));
            ctx.closePath();
            ctx.fill();
        }

        ctx.restore();
        updateThreeTexture();
    }

    // ---- HELMET ASSET ----
    function drawHelmetAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const w = pixelated ? 70 : Math.round(92 * S);
        const h = pixelated ? 70 : Math.round(92 * S);

        ctx.save();
        if (realistic) {
            drawDropShadow(cx, cy + h * 0.45, w * 0.45, h * 0.15, 0.3);
            
            // Helmet dome
            const domeGrad = ctx.createLinearGradient(cx - w/2, cy - h/2, cx + w/2, cy + h/2);
            domeGrad.addColorStop(0, '#f8fafc');
            domeGrad.addColorStop(0.3, acc);
            domeGrad.addColorStop(0.7, adjustBrightness(acc, -35));
            domeGrad.addColorStop(1, '#0f172a');
            ctx.fillStyle = domeGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, w * 0.48, Math.PI, 0);
            ctx.lineTo(cx + w * 0.48, cy + h * 0.2);
            ctx.lineTo(cx - w * 0.48, cy + h * 0.2);
            ctx.closePath();
            ctx.fill();

            // Visor / Mask
            const visGrad = ctx.createLinearGradient(cx - w/3, cy, cx + w/3, cy);
            visGrad.addColorStop(0, adjustBrightness(base, -40));
            visGrad.addColorStop(0.5, base);
            visGrad.addColorStop(1, adjustBrightness(base, -40));
            ctx.fillStyle = visGrad;
            ctx.beginPath();
            ctx.roundRect(cx - w * 0.35, cy - h * 0.05, w * 0.7, h * 0.32, 4);
            ctx.fill();

            // Visor slit glow
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = Math.round(3 * S);
            ctx.shadowColor = base;
            ctx.shadowBlur = Math.round(15 * S);
            ctx.beginPath();
            ctx.moveTo(cx - w * 0.25, cy + h * 0.08);
            ctx.lineTo(cx + w * 0.25, cy + h * 0.08);
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Plume / Feather crest
            const plumeG = ctx.createRadialGradient(cx, cy - h * 0.6, 5, cx, cy - h * 0.4, h * 0.4);
            plumeG.addColorStop(0, '#fff');
            plumeG.addColorStop(0.5, base);
            plumeG.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = plumeG;
            ctx.beginPath();
            ctx.moveTo(cx, cy - h * 0.45);
            ctx.quadraticCurveTo(cx - w * 0.25, cy - h * 0.75, cx - w * 0.1, cy - h * 0.9);
            ctx.quadraticCurveTo(cx, cy - h * 0.7, cx, cy - h * 0.45);
            ctx.fill();
        } else {
            ctx.fillStyle = acc;
            ctx.beginPath();
            ctx.arc(cx, cy, w * 0.48, Math.PI, 0);
            ctx.lineTo(cx + w * 0.48, cy + h * 0.2);
            ctx.lineTo(cx - w * 0.48, cy + h * 0.2);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = base;
            ctx.fillRect(cx - w * 0.35, cy - h * 0.05, w * 0.7, h * 0.25);
            ctx.fillStyle = '#fff';
            ctx.fillRect(cx - w * 0.25, cy + h * 0.02, w * 0.5, pixelated ? 3 : Math.round(4 * S));
        }
        ctx.restore();
        updateThreeTexture();
    }

    // ---- RING ASSET ----
    function drawRingAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const r = pixelated ? 45 : Math.round(62 * S);

        ctx.save();
        if (realistic) {
            drawDropShadow(cx, cy + r * 0.7, r * 0.6, r * 0.2, 0.25);

            // Ring band (Gold/Steel Torus aspect)
            const bandG = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 0.7);
            bandG.addColorStop(0, 'rgba(0,0,0,0)');
            bandG.addColorStop(0.65, adjustBrightness(acc, -30));
            bandG.addColorStop(0.85, acc);
            bandG.addColorStop(0.92, '#ffffff');
            bandG.addColorStop(1, adjustBrightness(acc, -40));
            ctx.fillStyle = bandG;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
            ctx.fill();

            // Gem setting / crown
            const gemR = Math.round(18 * S);
            const gemY = cy - r * 0.6;
            const gemG = ctx.createRadialGradient(gemX = cx - gemR * 0.3, gemY - gemR * 0.3, 1, cx, gemY, gemR);
            gemG.addColorStop(0, '#ffffff');
            gemG.addColorStop(0.3, base);
            gemG.addColorStop(0.8, adjustBrightness(base, -40));
            gemG.addColorStop(1, '#000000');
            
            ctx.save();
            ctx.shadowColor = base;
            ctx.shadowBlur = Math.round(20 * S);
            ctx.fillStyle = gemG;
            ctx.beginPath();
            ctx.arc(cx, gemY, gemR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            drawSpecular(cx - gemR * 0.25, gemY - gemR * 0.25, gemR * 0.5, 0.85);
        } else {
            ctx.strokeStyle = acc;
            ctx.lineWidth = pixelated ? 8 : Math.round(12 * S);
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.arc(cx, cy - r * 0.5, pixelated ? 10 : Math.round(15 * S), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        updateThreeTexture();
    }

    // ---- STAFF / WAND ASSET ----
    function drawStaffAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const len = canvas.height * 0.65;
        const thick = pixelated ? 4 : Math.round(6 * S);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4); // traditional angle
        ctx.translate(-cx, -cy);

        if (realistic) {
            // Wood Shaft
            const shaftG = ctx.createLinearGradient(cx - thick, cy - len/2, cx + thick, cy + len/2);
            shaftG.addColorStop(0, '#5c2d12');
            shaftG.addColorStop(0.5, '#b45309');
            shaftG.addColorStop(1, '#5c2d12');
            ctx.fillStyle = shaftG;
            ctx.fillRect(cx - thick/2, cy - len/2, thick, len);

            // Specular highlight on staff shaft
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(cx - thick/2, cy - len/2, Math.max(1, thick * 0.25), len);

            // Metallic bindings
            ctx.fillStyle = acc;
            ctx.fillRect(cx - thick * 0.8, cy - len * 0.3, thick * 1.6, Math.round(8 * S));
            ctx.fillRect(cx - thick * 0.8, cy + len * 0.3, thick * 1.6, Math.round(8 * S));

            // Floating Magic Crystal Gem at top
            const cryR = Math.round(18 * S);
            const cryY = cy - len / 2 - cryR * 0.9;
            
            drawGlowHalo(cx, cryY, cryR, glowCol, 3);

            const cryG = ctx.createRadialGradient(cx - cryR * 0.3, cryY - cryR * 0.3, 1, cx, cryY, cryR);
            cryG.addColorStop(0, '#ffffff');
            cryG.addColorStop(0.3, base);
            cryG.addColorStop(0.8, adjustBrightness(base, -40));
            cryG.addColorStop(1, '#000');
            ctx.fillStyle = cryG;
            ctx.beginPath();
            ctx.moveTo(cx, cryY - cryR);
            ctx.lineTo(cx + cryR * 0.7, cryY);
            ctx.lineTo(cx, cryY + cryR);
            ctx.lineTo(cx - cryR * 0.7, cryY);
            ctx.closePath();
            ctx.fill();
            drawSpecular(cx - cryR * 0.2, cryY - cryR * 0.2, cryR * 0.45, 0.8);
        } else {
            ctx.fillStyle = '#78350f';
            ctx.fillRect(cx - thick/2, cy - len/2, thick, len);

            ctx.fillStyle = base;
            ctx.beginPath();
            ctx.arc(cx, cy - len/2 - Math.round(8 * S), Math.round(12 * S), 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = acc;
            ctx.fillRect(cx - thick, cy - len * 0.3, thick * 2, Math.round(6 * S));
        }
        ctx.restore();
        updateThreeTexture();
    }

    // ---- KEY ASSET ----
    function drawKeyAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const len = canvas.height * 0.5;
        const shaftW = pixelated ? 4 : Math.round(6 * S);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);

        if (realistic) {
            // Gold base color
            const keyGrad = ctx.createLinearGradient(cx - shaftW, cy - len/2, cx + shaftW, cy + len/2);
            keyGrad.addColorStop(0, '#fbbf24');
            keyGrad.addColorStop(0.5, '#d97706');
            keyGrad.addColorStop(1, '#78350f');

            // Key handle (bow)
            const handleR = Math.round(20 * S);
            const handleY = cy + len / 2 - handleR;
            ctx.strokeStyle = keyGrad;
            ctx.lineWidth = Math.round(7 * S);
            ctx.beginPath();
            ctx.arc(cx, handleY, handleR, 0, Math.PI * 2);
            ctx.stroke();
            // spec
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx - handleR * 0.2, handleY - handleR * 0.2, handleR, Math.PI * 0.9, Math.PI * 1.4);
            ctx.stroke();

            // Key shaft
            ctx.fillStyle = keyGrad;
            ctx.fillRect(cx - shaftW/2, cy - len/2 + handleR, shaftW, len - handleR * 1.5);

            // Key bit (teeth)
            const bitW = Math.round(15 * S);
            const bitH = Math.round(22 * S);
            const bitY = cy - len/2 + handleR + Math.round(4 * S);
            ctx.fillRect(cx - shaftW/2 - bitW, bitY, bitW, bitH);
            
            // Teeth cuts
            ctx.fillStyle = '#080b13'; // screen bg compositing
            ctx.fillRect(cx - shaftW/2 - bitW + Math.round(3 * S), bitY + Math.round(6 * S), Math.round(6 * S), Math.round(5 * S));
            ctx.fillRect(cx - shaftW/2 - bitW + Math.round(9 * S), bitY + Math.round(15 * S), Math.round(6 * S), Math.round(5 * S));
        } else {
            ctx.fillStyle = acc;
            ctx.fillRect(cx - shaftW/2, cy - len/2, shaftW, len * 0.8);
            
            // Handle loop
            ctx.strokeStyle = acc;
            ctx.lineWidth = pixelated ? 4 : Math.round(6 * S);
            ctx.beginPath();
            ctx.arc(cx, cy + len * 0.3, pixelated ? 12 : Math.round(16 * S), 0, Math.PI * 2);
            ctx.stroke();

            // Key bit
            ctx.fillRect(cx - shaftW/2 - Math.round(12 * S), cy - len/2 + Math.round(5 * S), Math.round(12 * S), Math.round(16 * S));
        }
        ctx.restore();
        updateThreeTexture();
    }

    // ---- SCROLL / BOOK ASSET ----
    function drawScrollAsset(cx, cy, base, acc, glowCol, style) {
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256;
        const w = pixelated ? 80 : Math.round(110 * S);
        const h = pixelated ? 55 : Math.round(76 * S);

        ctx.save();
        if (realistic) {
            drawDropShadow(cx, cy + h * 0.45, w * 0.45, h * 0.15, 0.25);

            // Aged parchment paper base
            const papG = ctx.createLinearGradient(cx - w/2, cy, cx + w/2, cy);
            papG.addColorStop(0, '#d97706'); // scroll ends
            papG.addColorStop(0.12, '#fef3c7');
            papG.addColorStop(0.5, '#fefbeb');
            papG.addColorStop(0.88, '#fef3c7');
            papG.addColorStop(1, '#d97706');
            ctx.fillStyle = papG;
            ctx.beginPath();
            ctx.roundRect(cx - w * 0.44, cy - h * 0.4, w * 0.88, h * 0.8, 3);
            ctx.fill();

            // Wooden handles (rolls at the ends)
            const handleW = Math.round(8 * S);
            const handleH = h + Math.round(16 * S);
            const woodG = ctx.createLinearGradient(cx, cy - handleH/2, cx, cy + handleH/2);
            woodG.addColorStop(0, '#78350f');
            woodG.addColorStop(0.5, '#b45309');
            woodG.addColorStop(1, '#78350f');
            ctx.fillStyle = woodG;
            ctx.beginPath();
            ctx.roundRect(cx - w * 0.47, cy - handleH/2, handleW, handleH, 2);
            ctx.roundRect(cx + w * 0.47 - handleW, cy - handleH/2, handleW, handleH, 2);
            ctx.fill();

            // Ribbon wrapping the scroll
            ctx.fillStyle = base;
            ctx.fillRect(cx - Math.round(4 * S), cy - h * 0.4, Math.round(8 * S), h * 0.8);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - Math.round(4 * S), cy - h * 0.4, Math.round(8 * S), h * 0.8);

            // Glowing magic runes on scroll surface
            ctx.strokeStyle = glowCol;
            ctx.lineWidth = Math.round(2 * S);
            ctx.shadowColor = glowCol;
            ctx.shadowBlur = Math.round(10 * S);
            ctx.beginPath();
            ctx.moveTo(cx - w * 0.25, cy - h * 0.1);
            ctx.lineTo(cx - w * 0.12, cy - h * 0.18);
            ctx.moveTo(cx + w * 0.12, cy + h * 0.1);
            ctx.lineTo(cx + w * 0.25, cy + h * 0.02);
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = '#fef3c7';
            ctx.fillRect(cx - w*0.4, cy - h*0.4, w*0.8, h*0.8);

            ctx.fillStyle = '#78350f';
            ctx.fillRect(cx - w*0.45, cy - h*0.5, Math.round(8 * S), h);
            ctx.fillRect(cx + w*0.37, cy - h*0.5, Math.round(8 * S), h);

            ctx.fillStyle = base;
            ctx.fillRect(cx - Math.round(5 * S), cy - h*0.4, Math.round(10 * S), h*0.8);
        }
        ctx.restore();
        updateThreeTexture();
    }

    // Color brightness helper for canvas draw
    function adjustBrightness(hex, percent) {
        let R = parseInt(hex.substring(1, 3), 16);
        let G = parseInt(hex.substring(3, 5), 16);
        let B = parseInt(hex.substring(5, 7), 16);

        R = parseInt(R * (100 + percent) / 100);
        G = parseInt(G * (100 + percent) / 100);
        B = parseInt(B * (100 + percent) / 100);

        R = (R < 255) ? R : 255;
        G = (G < 255) ? G : 255;
        B = (B < 255) ? B : 255;

        R = (R > 0) ? R : 0;
        G = (G > 0) ? G : 0;
        B = (B > 0) ? B : 0;

        const rHex = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
        const gHex = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
        const bHex = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

        return "#" + rHex + gHex + bHex;
    }

    // Inpaint Mask modifications simulation
    function performAIInpaintMock(prompt) {
        // Redraw color layers inside the painted regions, or add magic spark particles in the direction of the prompt.
        // We'll overlay a beautiful neon gradient corresponding to the user color selection or inpaint prompt on top.
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop'; // Retouch within existing sprite pixels
        
        const lowerPrompt = prompt.toLowerCase();
        let color = state.primaryColor;
        
        if (lowerPrompt.includes('rojo') || lowerPrompt.includes('fuego') || lowerPrompt.includes('red')) {
            color = '#ef4444';
        } else if (lowerPrompt.includes('azul') || lowerPrompt.includes('ice') || lowerPrompt.includes('blue')) {
            color = '#3b82f6';
        } else if (lowerPrompt.includes('verde') || lowerPrompt.includes('green')) {
            color = '#10b981';
        } else if (lowerPrompt.includes('oro') || lowerPrompt.includes('dorado') || lowerPrompt.includes('gold')) {
            color = '#fbbf24';
        } else if (lowerPrompt.includes('blanco') || lowerPrompt.includes('luz') || lowerPrompt.includes('white')) {
            color = '#ffffff';
        }
        
        // Apply procedural decals based on prompt
        if (lowerPrompt.includes('runas') || lowerPrompt.includes('runes') || lowerPrompt.includes('letras')) {
            // Draw runic pattern
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.moveTo(cx - 10, cy - 20);
            ctx.lineTo(cx, cy - 10);
            ctx.lineTo(cx + 10, cy - 20);
            ctx.moveTo(cx, cy - 10);
            ctx.lineTo(cx, cy + 10);
            ctx.stroke();
        } else {
            // Glow Overlay edit
            const radGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, canvas.width*0.4);
            radGrad.addColorStop(0, color);
            radGrad.addColorStop(0.5, 'rgba(0,0,0,0)');
            ctx.fillStyle = radGrad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.restore();
        updateThreeTexture();
    }

    // --- Saved Assets Gallery ---
    function saveAssetToLibrary(promptText) {
        const dataURL = canvas.toDataURL();
        const asset = {
            id: Date.now(),
            dataURL: dataURL,
            prompt: promptText,
            style: document.querySelector('.style-option.active').getAttribute('data-style')
        };
        state.library.push(asset);
        
        renderGallery();
    }

    function renderGallery() {
        if (state.library.length === 0) {
            galleryEmpty.style.display = 'block';
            return;
        }
        galleryEmpty.style.display = 'none';
        
        // Remove existing items except empty state
        const items = galleryContainer.querySelectorAll('.gallery-item');
        items.forEach(i => i.remove());

        state.library.forEach(asset => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            if (state.currentAssetId === asset.id) {
                item.className += ' active';
            }
            
            const img = document.createElement('img');
            img.src = asset.dataURL;
            img.alt = asset.prompt;
            
            const badge = document.createElement('span');
            badge.className = 'gallery-item-badge';
            badge.textContent = asset.style.toUpperCase();
            
            item.appendChild(img);
            item.appendChild(badge);
            
            item.addEventListener('click', () => {
                state.currentAssetId = asset.id;
                
                // Mark that we have an active asset loaded
                canvas.dataset.hasAsset = 'true';
                
                // Match resolution to style first
                const style = asset.style || 'pixel';
                const targetRes = style === 'pixel' ? 64 : (style === 'realistic' ? 512 : 256);
                resizeCanvas(targetRes, targetRes);
                
                loadCanvasFromURL(asset.dataURL);
                
                document.querySelectorAll('.gallery-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                promptInput.value = asset.prompt;
                
                // update style option view
                const styleOpt = document.querySelector(`.style-option[data-style="${style}"]`);
                if (styleOpt) {
                    styleOptions.forEach(o => o.classList.remove('active'));
                    styleOpt.classList.add('active');
                }
                
                // Automatically regenerate 3D view
                setTimeout(() => {
                    updateThreeMesh(threeMeshSelect.value);
                    updateThreeTexture();
                }, 100);
            });

            galleryContainer.appendChild(item);
        });
    }

    // --- Three.js 3D Viewer Implementation ---
    function initThreeJS() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050810);
        scene.fog = new THREE.FogExp2(0x050810, 0.08);
        
        // Camera setup — slightly closer and higher for a heroic view
        camera = new THREE.PerspectiveCamera(42, threeViewport.clientWidth / threeViewport.clientHeight, 0.05, 150);
        camera.position.set(0, 1.4, 3.2);

        // High-Quality Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, precision: 'highp' });
        renderer.setSize(threeViewport.clientWidth, threeViewport.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
        renderer.toneMapping = THREE.ACESFilmicToneMapping; // Cinematic tone mapping
        renderer.toneMappingExposure = 1.15;
        
        threeViewport.innerHTML = '';
        threeViewport.appendChild(renderer.domElement);

        // Controls — smooth damping with limits
        orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.06;
        orbitControls.maxPolarAngle = Math.PI * 0.85;
        orbitControls.minDistance = 0.8;
        orbitControls.maxDistance = 8;
        orbitControls.target.set(0, 0.2, 0);
        orbitControls.zoomSpeed = 0.7;
        orbitControls.rotateSpeed = 0.6;

        // --- Premium 5-Point Lighting Rig ---
        // Ambient fill
        const ambientLight = new THREE.AmbientLight(0x9bb0d0, 0.35);
        scene.add(ambientLight);

        // Key light (main)
        const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.0);
        keyLight.position.set(3, 6, 4);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 0.1;
        keyLight.shadow.camera.far = 20;
        keyLight.shadow.camera.left = -5;
        keyLight.shadow.camera.right = 5;
        keyLight.shadow.camera.top = 5;
        keyLight.shadow.camera.bottom = -5;
        keyLight.shadow.bias = -0.001;
        keyLight.shadow.radius = 3;
        scene.add(keyLight);

        // Fill light (soft opposite side)
        const fillLight = new THREE.DirectionalLight(0x6699ff, 0.35);
        fillLight.position.set(-4, 2, -3);
        scene.add(fillLight);

        // Rim / back-light (separates model from background)
        const rimLight = new THREE.DirectionalLight(0xc084fc, 0.6);
        rimLight.position.set(-1, 4, -5);
        scene.add(rimLight);

        // Top fill (sky-like)
        const topLight = new THREE.DirectionalLight(0xaaccff, 0.25);
        topLight.position.set(0, 8, 0);
        scene.add(topLight);

        // Ground bounce
        const bounceLight = new THREE.DirectionalLight(0x4ade80, 0.1);
        bounceLight.position.set(0, -3, 0);
        scene.add(bounceLight);

        // Floor: Reflective Grid
        const gridHelper = new THREE.GridHelper(12, 24, 0x1e293b, 0x0f172a);
        gridHelper.position.y = -1.05;
        scene.add(gridHelper);

        // Shadow catcher plane
        const planeGeo = new THREE.PlaneGeometry(8, 8);
        const planeMat = new THREE.MeshStandardMaterial({
            color: 0x080b13,
            roughness: 1,
            metalness: 0,
            transparent: true,
            opacity: 0.5
        });
        const shadowPlane = new THREE.Mesh(planeGeo, planeMat);
        shadowPlane.rotation.x = -Math.PI / 2;
        shadowPlane.position.y = -1.04;
        shadowPlane.receiveShadow = true;
        scene.add(shadowPlane);

        // Build base textures & material
        window.materials = materials;
        materials.canvasTex = new THREE.CanvasTexture(canvas);
        materials.canvasTex.minFilter = THREE.LinearMipMapLinearFilter;
        materials.canvasTex.magFilter = THREE.LinearFilter;
        materials.canvasTex.generateMipmaps = true;
        materials.canvasTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        
        // Materials creation — NO bumpMap (same-texture bumpMap darkens the mesh)
        materials.customMaterial = new THREE.MeshStandardMaterial({
            map: materials.canvasTex,
            roughness: 0.45,
            metalness: 0.05,
            transparent: true,
            alphaTest: 0.05,
            side: THREE.DoubleSide,
            envMapIntensity: 0.8
        });

        // Load polygonal mesh initially — with a placeholder so the viewer isn't black on load
        showPlaceholder3D();

        // Start render loop
        animateThreeJS();
        
        window.addEventListener('resize', onWindowResize);

        // Show mouse hint overlay on 3D viewport
        const hint = document.createElement('div');
        hint.id = 'three-controls-hint';
        hint.style.cssText = `
            position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.55); color: rgba(255,255,255,0.6);
            font-size: 0.7rem; padding: 5px 12px; border-radius: 20px;
            pointer-events: none; white-space: nowrap; font-family: 'Plus Jakarta Sans', sans-serif;
            backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.08);
            transition: opacity 0.5s ease;
        `;
        hint.textContent = '🖱 Arrastra para rotar · Rueda para zoom · Click derecho para mover';
        threeViewport.style.position = 'relative';
        threeViewport.appendChild(hint);
        setTimeout(() => { hint.style.opacity = '0'; }, 5000);
    }

    function generateVoxelMesh() {
        const group = new THREE.Group();
        
        // Dynamic grid sampling size for voxels based on canvas resolution
        const size = Math.min(canvas.width, 32);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = size;
        tempCanvas.height = size;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw editor canvas to low-res canvas
        tempCtx.drawImage(canvas, 0, 0, size, size);
        
        const imgData = tempCtx.getImageData(0, 0, size, size);
        const data = imgData.data;
        
        const voxelW = 1.6 / size;
        const boxGeometry = new THREE.BoxGeometry(voxelW, voxelW, voxelW);
        const materialsCache = {};
        
        const activeTypeBtn = document.querySelector('#char-editor-panel .char-type-btn.active');
        const activeType = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'warrior';
        const isAnimal = ['dog', 'cat', 'chicken', 'wolf'].includes(activeType);

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = (y * size + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];
                
                // Voxel is spawned if pixel opacity is significant
                if (a > 50) {
                    const hexColor = rgbToHex(r, g, b);
                    
                    if (!materialsCache[hexColor]) {
                        materialsCache[hexColor] = new THREE.MeshStandardMaterial({
                            color: new THREE.Color(hexColor),
                            roughness: 0.6,
                            metalness: 0.12
                        });
                    }
                    
                    const posX = (x - size / 2) * voxelW;
                    const posY = ((size - y) - size / 2) * voxelW;
                    
                    // Intelligent variable extrusion depth for true 3D volume
                    let depth = 2;

                    if (isAnimal) {
                        // Animals: sculpt a rounded cylindrical body or egg shape
                        const centerX = size / 2;
                        const centerY = size / 2;
                        const distToCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                        
                        // Round voxel shell depth
                        const radius = size * 0.38;
                        if (distToCenter < radius) {
                            depth = Math.round(Math.sqrt(Math.max(1, Math.pow(radius, 2) - Math.pow(distToCenter, 2))) * 0.7);
                        } else {
                            depth = 2;
                        }
                    } else {
                        // Humanoids: differentiate Head, Torso, Arms, Legs
                        if (y < size * 0.35) {
                            // Head region: sphere-like volume
                            const headCenterX = size / 2;
                            const headCenterY = size * 0.18;
                            const distToHeadCenter = Math.sqrt(Math.pow(x - headCenterX, 2) + Math.pow(y - headCenterY, 2));
                            const headRadius = size * 0.18;

                            if (distToHeadCenter < headRadius) {
                                depth = Math.round(Math.sqrt(Math.max(4, Math.pow(headRadius, 2) - Math.pow(distToHeadCenter, 2))) * 1.3);
                            } else {
                                depth = 4; // Hat brim / hair extensions
                            }
                        } else if (y >= size * 0.35 && y < size * 0.68) {
                            // Torso and arms
                            const distToCenterX = Math.abs(x - size / 2);
                            if (distToCenterX < size * 0.22) {
                                depth = 8; // Torso body
                            } else {
                                depth = 4; // Arms/accessories
                            }
                        } else {
                            // Legs and feet
                            depth = 5;
                        }
                    }

                    depth = Math.max(2, depth); // safety minimum

                    for (let z = 0; z < depth; z++) {
                        const posZ = (z - (depth - 1) / 2) * voxelW;
                        const voxelMesh = new THREE.Mesh(boxGeometry, materialsCache[hexColor]);
                        voxelMesh.position.set(posX, posY, posZ);
                        voxelMesh.castShadow = true;
                        voxelMesh.receiveShadow = true;
                        group.add(voxelMesh);
                    }
                }
            }
        }
        
        // Adjust vertical position to fit the floor grid
        group.position.y = 0.35;
        return group;
    }

    // ─── SHAPE HELPERS — reusable geometry builders so 3D props read as
    // crafted objects (soft edges, real silhouettes) instead of raw
    // Box/Cylinder primitives glued together. ─────────────────────────────
    function createRoundedRectShape(w, h, r) {
        const shape = new THREE.Shape();
        const x = -w / 2, y = -h / 2;
        r = Math.min(r, w / 2, h / 2);
        shape.moveTo(x, y + r);
        shape.lineTo(x, y + h - r);
        shape.quadraticCurveTo(x, y + h, x + r, y + h);
        shape.lineTo(x + w - r, y + h);
        shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
        shape.lineTo(x + w, y + r);
        shape.quadraticCurveTo(x + w, y, x + w - r, y);
        shape.lineTo(x + r, y);
        shape.quadraticCurveTo(x, y, x, y + r);
        return shape;
    }

    // Drop-in replacement for `new THREE.BoxGeometry(w,h,d)` with softened,
    // beveled edges that catch light instead of a flat plastic-looking box.
    function createBeveledBox(w, h, depth, bevel = Math.min(w, h) * 0.08) {
        bevel = Math.min(bevel, depth / 2 - 0.001, Math.min(w, h) / 2 - 0.001);
        bevel = Math.max(bevel, 0.001);
        const shape = createRoundedRectShape(w, h, bevel * 1.4);
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: depth - bevel * 2,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 3,
            curveSegments: 6
        });
        geo.translate(0, 0, -(depth - bevel * 2) / 2 - bevel);
        return geo;
    }

    function generateReal3DMesh() {
        const group = new THREE.Group();
        const prompt = promptInput.value.toLowerCase();
        
        // Custom materials for hilt, crossguards, metal corners
        const steelMat = new THREE.MeshStandardMaterial({
            color: 0xd1d5db,
            roughness: 0.2,
            metalness: 0.85
        });
        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            roughness: 0.15,
            metalness: 0.9
        });
        const woodMat = new THREE.MeshStandardMaterial({
            color: 0x78350f,
            roughness: 0.8
        });
        
        // Determine colors dynamically from the generated theme
        let elementColor = 0xd1d5db; // default silver
        let isGlowing = false;
        if (prompt.includes('fuego') || prompt.includes('fire') || prompt.includes('rojo') || prompt.includes('flama') || prompt.includes('katana')) {
            elementColor = 0xef4444; // Red/orange
            isGlowing = true;
        } else if (prompt.includes('hielo') || prompt.includes('ice') || prompt.includes('azul') || prompt.includes('agua')) {
            elementColor = 0x3b82f6; // Blue
            isGlowing = true;
        } else if (prompt.includes('bosque') || prompt.includes('planta') || prompt.includes('veneno') || prompt.includes('verde')) {
            elementColor = 0x10b981; // Green
            isGlowing = true;
        } else if (prompt.includes('oro') || prompt.includes('gold') || prompt.includes('luz') || prompt.includes('sagrado')) {
            elementColor = 0xfbbf24; // Gold
            isGlowing = true;
        } else if (prompt.includes('sombra') || prompt.includes('vacio') || prompt.includes('oscuro') || prompt.includes('dark')) {
            elementColor = 0x8b5cf6; // Purple
            isGlowing = true;
        }

        const bladeMat = new THREE.MeshStandardMaterial({
            color: elementColor,
            roughness: 0.35,   // more roughness = visible under lights without env map
            metalness: 0.55,   // was 0.95, high metalness needs env map or it goes black
            emissive: new THREE.Color(elementColor),
            emissiveIntensity: isGlowing ? 0.45 : 0.08 // always some glow so it's visible
        });

        if (prompt.includes('espada') || prompt.includes('sword') || prompt.includes('arma') || prompt.includes('hoja') || prompt.includes('katana') || prompt.includes('sable')) {
            const isKatana = prompt.includes('katana') || prompt.includes('sable');

            if (isKatana) {
                // --- 3D Katana (Japanese Sword) ---
                // Grip with wrapped ito ridges
                const gripGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.45, 16);
                const gripMatCustom = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }); // Black wrap
                const grip = new THREE.Mesh(gripGeo, gripMatCustom);
                grip.position.set(-0.02, -0.42, 0);
                grip.rotation.z = 0.08; // slightly angled grip
                grip.castShadow = true;
                group.add(grip);
                const itoMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 });
                for (let i = 0; i < 7; i++) {
                    const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.005, 6, 10), itoMat);
                    wrap.rotation.x = Math.PI / 2;
                    wrap.position.set(-0.02 - i * 0.006, -0.63 + i * 0.062, 0);
                    group.add(wrap);
                }

                // Kashira (pommel cap)
                const pommelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 16);
                const pommel = new THREE.Mesh(pommelGeo, goldMat);
                pommel.position.set(-0.04, -0.65, 0);
                pommel.rotation.z = 0.08;
                group.add(pommel);

                // Tsuba (Japanese Circular Guard)
                const guardGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 32);
                const guard = new THREE.Mesh(guardGeo, goldMat);
                guard.position.set(0, -0.2, 0);
                guard.rotation.x = Math.PI / 2;
                guard.castShadow = true;
                group.add(guard);

                // Curved katana blade — more, smaller segments for a smooth arc,
                // and each segment tapers narrower toward the tip like a real blade.
                const segments = 12;
                const segmentHeight = 0.11;
                let currentY = -0.2;
                let currentX = 0;
                let currentRotation = 0;

                for (let i = 0; i < segments; i++) {
                    const t = i / (segments - 1);
                    const segW = 0.07 * (1 - t * 0.55); // taper toward the tip
                    const segGeo = new THREE.BoxGeometry(0.016, segmentHeight, segW);
                    const seg = new THREE.Mesh(segGeo, bladeMat);

                    seg.position.set(
                        currentX + Math.sin(currentRotation) * (segmentHeight / 2),
                        currentY + Math.cos(currentRotation) * (segmentHeight / 2),
                        0
                    );
                    seg.rotation.z = -currentRotation;
                    seg.castShadow = true;
                    group.add(seg);

                    currentX += Math.sin(currentRotation) * segmentHeight;
                    currentY += Math.cos(currentRotation) * segmentHeight;
                    currentRotation += 0.035; // gentler, smoother curvature step
                }

                // Sharp tip (kissaki)
                const tipGeo = new THREE.ConeGeometry(0.03, 0.07, 4);
                const tip = new THREE.Mesh(tipGeo, bladeMat);
                tip.position.set(currentX, currentY + 0.035 * Math.cos(currentRotation), 0);
                tip.rotation.z = -currentRotation;
                tip.castShadow = true;
                group.add(tip);
            } else {
                // --- 3D Traditional Medieval Sword ---
                // Grip with wrapped leather ridges
                const gripGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 16);
                const grip = new THREE.Mesh(gripGeo, woodMat);
                grip.position.y = -0.4;
                grip.castShadow = true;
                group.add(grip);
                const wrapMat = new THREE.MeshStandardMaterial({ color: 0x1c0f04, roughness: 0.85 });
                for (let i = 0; i < 6; i++) {
                    const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, 6, 12), wrapMat);
                    ridge.rotation.x = Math.PI / 2;
                    ridge.position.y = -0.55 + i * 0.055;
                    group.add(ridge);
                }

                // Pommel
                const pommelGeo = new THREE.SphereGeometry(0.065, 20, 16);
                const pommel = new THREE.Mesh(pommelGeo, goldMat);
                pommel.position.y = -0.6;
                pommel.castShadow = true;
                group.add(pommel);

                // Guard — beveled bar instead of a plain flat box
                const guardGeo = createBeveledBox(0.46, 0.05, 0.09, 0.015);
                const guard = new THREE.Mesh(guardGeo, steelMat);
                guard.position.y = -0.21;
                guard.castShadow = true;
                group.add(guard);

                // Blade — real tapered silhouette drawn to a point, with beveled
                // edges, instead of a 4-sided cone stretched into a diamond.
                const bladeShape = new THREE.Shape();
                bladeShape.moveTo(-0.065, 0);
                bladeShape.lineTo(-0.05, 0.9);
                bladeShape.quadraticCurveTo(-0.02, 1.08, 0, 1.15);
                bladeShape.quadraticCurveTo(0.02, 1.08, 0.05, 0.9);
                bladeShape.lineTo(0.065, 0);
                bladeShape.closePath();
                const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, {
                    depth: 0.018,
                    bevelEnabled: true,
                    bevelThickness: 0.006,
                    bevelSize: 0.006,
                    bevelSegments: 2,
                    curveSegments: 10
                });
                bladeGeo.translate(0, -0.19, -0.009);
                const blade = new THREE.Mesh(bladeGeo, bladeMat);
                blade.castShadow = true;
                group.add(blade);

                // Fuller groove — thin glowing inset strip running down the blade
                const fullerMat = new THREE.MeshStandardMaterial({
                    color: elementColor,
                    emissive: new THREE.Color(elementColor),
                    emissiveIntensity: isGlowing ? 0.6 : 0.15,
                    roughness: 0.3,
                    metalness: 0.4
                });
                const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.82, 0.006), fullerMat);
                fuller.position.set(0, 0.22, 0.006);
                group.add(fuller);
            }
        }
        else if (prompt.includes('pocion') || prompt.includes('potion') || prompt.includes('frasco') || prompt.includes('botella')) {
            // --- 3D Potion Bottle ---
            // Bottle Glass Outer Physical Transparency
            const glassGeo = new THREE.SphereGeometry(0.45, 32, 32);
            const glassMat = new THREE.MeshPhysicalMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.25,
                roughness: 0.1,
                metalness: 0.1,
                transmission: 0.9,
                ior: 1.5
            });
            const glass = new THREE.Mesh(glassGeo, glassMat);
            glass.position.y = 0.1;
            group.add(glass);
            
            // Neck
            const neckGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 16);
            const neck = new THREE.Mesh(neckGeo, glassMat);
            neck.position.y = 0.5;
            group.add(neck);
            
            // Cork
            const corkGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.12, 16);
            const cork = new THREE.Mesh(corkGeo, woodMat);
            cork.position.y = 0.65;
            group.add(cork);

            // Twine wrapped around the cork
            const twineMat = new THREE.MeshStandardMaterial({ color: 0xd6c19a, roughness: 0.9 });
            for (let i = 0; i < 2; i++) {
                const twine = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.008, 6, 16), twineMat);
                twine.rotation.x = Math.PI / 2;
                twine.position.y = 0.6 + i * 0.05;
                group.add(twine);
            }

            // Label ribbon tied around the neck, colored to match the element
            const labelMat = new THREE.MeshStandardMaterial({ color: elementColor, roughness: 0.7 });
            const label = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.025, 8, 24, Math.PI * 1.3), labelMat);
            label.rotation.x = Math.PI / 2;
            label.position.y = 0.4;
            group.add(label);
            const labelTagGeo = createBeveledBox(0.1, 0.13, 0.01, 0.01);
            const labelTag = new THREE.Mesh(labelTagGeo, new THREE.MeshStandardMaterial({ color: 0xf5ecd8, roughness: 0.8 }));
            labelTag.position.set(0, 0.36, 0.13);
            labelTag.rotation.x = -0.15;
            group.add(labelTag);
            
            // Liquid Core
            const liqMat = new THREE.MeshStandardMaterial({
                color: elementColor,
                roughness: 0.1,
                metalness: 0.1,
                emissive: isGlowing ? new THREE.Color(elementColor) : new THREE.Color(0x000000),
                emissiveIntensity: isGlowing ? 0.5 : 0
            });
            const liqGeo = new THREE.SphereGeometry(0.42, 24, 24);
            const liquid = new THREE.Mesh(liqGeo, liqMat);
            liquid.position.y = 0.1;
            group.add(liquid);

            // Rising bubbles for a bit of life inside the liquid
            const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
            [[0.1, 0.0, 0.05, 0.02], [-0.12, 0.2, -0.08, 0.015], [0.05, 0.35, 0.1, 0.018]].forEach(([bx, by, bz, br]) => {
                const bubble = new THREE.Mesh(new THREE.SphereGeometry(br, 8, 8), bubbleMat);
                bubble.position.set(bx, by + 0.1, bz);
                group.add(bubble);
            });
        }
        else if (prompt.includes('escudo') || prompt.includes('shield')) {
            // --- 3D Shield — real heater-shield silhouette instead of a flat rectangle ---
            const shieldShape = new THREE.Shape();
            shieldShape.moveTo(-0.42, 0.55);
            shieldShape.quadraticCurveTo(-0.44, 0.62, -0.30, 0.62);
            shieldShape.lineTo(0.30, 0.62);
            shieldShape.quadraticCurveTo(0.44, 0.62, 0.42, 0.55);
            shieldShape.lineTo(0.40, 0.05);
            shieldShape.quadraticCurveTo(0.40, -0.45, 0, -0.72); // tapers to a point
            shieldShape.quadraticCurveTo(-0.40, -0.45, -0.40, 0.05);
            shieldShape.lineTo(-0.42, 0.55);

            const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, {
                depth: 0.05,
                bevelEnabled: true,
                bevelThickness: 0.022,
                bevelSize: 0.018,
                bevelSegments: 3,
                curveSegments: 14
            });
            shieldGeo.translate(0, 0, -0.025);
            const shield = new THREE.Mesh(shieldGeo, materials.customMaterial);
            shield.castShadow = true;
            group.add(shield);

            // Metal rim tracing the same silhouette, slightly larger, sitting behind
            const rimGeo = new THREE.ExtrudeGeometry(shieldShape, {
                depth: 0.025, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.025, bevelSegments: 2, curveSegments: 14
            });
            rimGeo.scale(1.07, 1.05, 1);
            rimGeo.translate(0, 0, -0.075);
            const rim = new THREE.Mesh(rimGeo, steelMat);
            group.add(rim);

            // Central raised boss
            const bossGeo = new THREE.SphereGeometry(0.12, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
            const boss = new THREE.Mesh(bossGeo, steelMat);
            boss.rotation.x = -Math.PI / 2;
            boss.position.set(0, 0.03, 0.05);
            boss.castShadow = true;
            group.add(boss);

            // Rivets around the rim
            const rivetGeo = new THREE.SphereGeometry(0.022, 8, 8);
            [[-0.32, 0.4], [0.32, 0.4], [-0.34, -0.1], [0.34, -0.1], [0, -0.55]].forEach(([rx, ry]) => {
                const rivet = new THREE.Mesh(rivetGeo, goldMat);
                rivet.position.set(rx, ry, 0.03);
                group.add(rivet);
            });
        }
        else if (prompt.includes('cofre') || prompt.includes('chest') || prompt.includes('caja')) {
            // --- 3D Chest — beveled panels + plank seams + corner braces so it
            // reads as a crafted object instead of two stacked raw boxes. ---
            const baseGeo = createBeveledBox(1.0, 0.5, 0.75, 0.025);
            const baseMesh = new THREE.Mesh(baseGeo, materials.customMaterial);
            baseMesh.position.y = -0.15;
            baseMesh.castShadow = true;
            group.add(baseMesh);
            
            // Lid
            const lidGeo = new THREE.CylinderGeometry(0.375, 0.375, 1.0, 32, 1, false, 0, Math.PI);
            const lidMesh = new THREE.Mesh(lidGeo, materials.customMaterial);
            lidMesh.rotation.z = Math.PI / 2;
            lidMesh.position.y = 0.1;
            lidMesh.castShadow = true;
            group.add(lidMesh);

            // Wood plank seams on the front face
            const seamMat = new THREE.MeshStandardMaterial({ color: 0x2b1608, roughness: 0.9 });
            [-0.3, 0, 0.3].forEach(sx => {
                const seam = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.48, 0.02), seamMat);
                seam.position.set(sx, -0.15, 0.375);
                group.add(seam);
            });

            // Metal corner braces on the base
            [[-0.5, 0.38], [0.5, 0.38], [-0.5, -0.38], [0.5, -0.38]].forEach(([bx, bz]) => {
                const brace = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), steelMat);
                brace.position.set(bx, -0.15, bz);
                brace.castShadow = true;
                group.add(brace);
            });
            
            // Lock plate + shackle + keyhole
            const lockPlate = new THREE.Mesh(createBeveledBox(0.16, 0.18, 0.04, 0.014), goldMat);
            lockPlate.position.set(0, 0.08, 0.385);
            group.add(lockPlate);
            const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.014, 8, 16, Math.PI), steelMat);
            shackle.position.set(0, 0.17, 0.385);
            shackle.rotation.z = Math.PI;
            group.add(shackle);
            const keyhole = new THREE.Mesh(new THREE.CircleGeometry(0.02, 10), new THREE.MeshStandardMaterial({ color: 0x111111 }));
            keyhole.position.set(0, 0.06, 0.408);
            group.add(keyhole);
        }
        else if (prompt.includes('casco') || prompt.includes('helmet') || prompt.includes('yelmo')) {
            // --- 3D Helmet — curved visor + rim + crest instead of a dome with a floating flat box ---
            const domeGeo = new THREE.SphereGeometry(0.48, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2);
            const dome = new THREE.Mesh(domeGeo, steelMat);
            dome.position.y = 0.15;
            dome.castShadow = true;
            group.add(dome);

            // Rim band around the base of the dome
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.025, 10, 32), steelMat);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = 0.15;
            group.add(rim);

            // Curved visor — a real cylindrical band instead of a flat box
            const visGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16, 1, true, -Math.PI * 0.32, Math.PI * 0.64);
            const visor = new THREE.Mesh(visGeo, bladeMat);
            visor.position.set(0, 0.1, 0.02);
            visor.castShadow = true;
            group.add(visor);

            // Eye slit
            const slit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.05), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }));
            slit.position.set(0, 0.14, 0.31);
            group.add(slit);

            // Crest / plume socket
            const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.42), new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 }));
            crest.position.set(0, 0.62, 0);
            group.add(crest);
        }
        else if (prompt.includes('anillo') || prompt.includes('ring')) {
            // --- 3D Ring ---
            const ringGeo = new THREE.TorusGeometry(0.35, 0.08, 12, 48);
            const ringMesh = new THREE.Mesh(ringGeo, goldMat);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.position.y = 0.1;
            group.add(ringMesh);

            const gemGeo = new THREE.OctahedronGeometry(0.12, 0);
            const gemMesh = new THREE.Mesh(gemGeo, bladeMat);
            gemMesh.position.set(0, 0.44, 0);
            group.add(gemMesh);
        }
        else if (prompt.includes('baston') || prompt.includes('staff') || prompt.includes('varita') || prompt.includes('wand')) {
            // --- 3D Staff — crystal held by claw prongs instead of a floating sphere ---
            const shaftGeo = new THREE.CylinderGeometry(0.025, 0.03, 1.4, 16);
            const shaft = new THREE.Mesh(shaftGeo, woodMat);
            shaft.position.y = 0.1;
            shaft.castShadow = true;
            group.add(shaft);

            // Wrapped grip band
            const wrapMat = new THREE.MeshStandardMaterial({ color: 0x1c0f04, roughness: 0.85 });
            for (let i = 0; i < 5; i++) {
                const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 6, 12), wrapMat);
                wrap.rotation.x = Math.PI / 2;
                wrap.position.y = -0.35 + i * 0.06;
                group.add(wrap);
            }

            // Crystal (faceted, glowing with the element color)
            const headGeo = new THREE.OctahedronGeometry(0.15, 0);
            const head = new THREE.Mesh(headGeo, bladeMat);
            head.position.y = 0.88;
            head.castShadow = true;
            group.add(head);

            // Claw prongs gripping the crystal from below
            const clawMat = goldMat;
            for (let i = 0; i < 3; i++) {
                const angle = (i / 3) * Math.PI * 2;
                const claw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.006, 0.22, 6), clawMat);
                claw.position.set(Math.cos(angle) * 0.09, 0.72, Math.sin(angle) * 0.09);
                claw.rotation.z = Math.cos(angle) * 0.5;
                claw.rotation.x = -Math.sin(angle) * 0.5;
                group.add(claw);
            }
            const collar = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 8, 16), goldMat);
            collar.rotation.x = Math.PI / 2;
            collar.position.y = 0.7;
            group.add(collar);
        }
        else if (prompt.includes('llave') || prompt.includes('key')) {
            // --- 3D Key — ornate scrollwork bit instead of a plain flat box ---
            const loopGeo = new THREE.TorusGeometry(0.16, 0.045, 10, 28);
            const loop = new THREE.Mesh(loopGeo, goldMat);
            loop.position.y = -0.4;
            loop.castShadow = true;
            group.add(loop);

            // Inner scrollwork detail inside the bow (loop)
            const scrollGeo = new THREE.TorusGeometry(0.07, 0.014, 8, 16);
            const scroll = new THREE.Mesh(scrollGeo, goldMat);
            scroll.position.y = -0.4;
            group.add(scroll);

            const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 16);
            const shaft = new THREE.Mesh(shaftGeo, goldMat);
            shaft.position.y = 0.05;
            shaft.castShadow = true;
            group.add(shaft);

            // Bit — a small stepped silhouette instead of a flat rectangle
            const bitShape = new THREE.Shape();
            bitShape.moveTo(0, -0.11);
            bitShape.lineTo(0.16, -0.11);
            bitShape.lineTo(0.16, -0.02);
            bitShape.lineTo(0.1, -0.02);
            bitShape.lineTo(0.1, 0.05);
            bitShape.lineTo(0.16, 0.05);
            bitShape.lineTo(0.16, 0.11);
            bitShape.lineTo(0, 0.11);
            bitShape.closePath();
            const bitGeo = new THREE.ExtrudeGeometry(bitShape, {
                depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4
            });
            bitGeo.translate(-0.13, 0.35, -0.0175);
            const bit = new THREE.Mesh(bitGeo, goldMat);
            bit.castShadow = true;
            group.add(bit);
        }
        else if (prompt.includes('pergamino') || prompt.includes('scroll') || prompt.includes('libro') || prompt.includes('book')) {
            // --- 3D Scroll — gently curled paper instead of a perfectly flat sheet ---
            const sheetGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 24, 4, true, -0.3, 0.6);
            const sheet = new THREE.Mesh(sheetGeo, materials.customMaterial);
            sheet.rotation.z = Math.PI / 2;
            sheet.position.y = 0.1;
            sheet.castShadow = true;
            group.add(sheet);

            const rollGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 16);
            const rollL = new THREE.Mesh(rollGeo, woodMat);
            rollL.rotation.x = Math.PI / 2;
            rollL.position.set(-0.43, 0.1, 0);
            rollL.castShadow = true;
            const rollR = new THREE.Mesh(rollGeo, woodMat);
            rollR.rotation.x = Math.PI / 2;
            rollR.position.set(0.43, 0.1, 0);
            rollR.castShadow = true;
            group.add(rollL);
            group.add(rollR);

            // Wax seal ribbon holding the scroll shut
            const ribbonMat = new THREE.MeshStandardMaterial({ color: elementColor, roughness: 0.6 });
            const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.015, 8, 6, Math.PI), ribbonMat);
            ribbon.rotation.y = Math.PI / 2;
            ribbon.position.set(0, 0.1, 0);
            group.add(ribbon);
            const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16), ribbonMat);
            seal.rotation.x = Math.PI / 2;
            seal.position.set(0, 0.1, 0.29);
            group.add(seal);
        }
        else if (prompt.includes('arbol') || prompt.includes('árbol') || prompt.includes('tree') || prompt.includes('planta') || prompt.includes('plant') || prompt.includes('flor') || prompt.includes('flower') || prompt.includes('hongo') || prompt.includes('mushroom') || prompt.includes('seta')) {
            // --- 3D Tree / Plant / Flower / Mushroom (this category didn't exist
            // before — prompts like "árbol" used to fall through to the generic
            // gem fallback, which is the jagged purple blob you saw). ---
            const isMushroom = prompt.includes('hongo') || prompt.includes('mushroom') || prompt.includes('seta');
            const isFlower = prompt.includes('flor') || prompt.includes('flower');
            const natureColorHex = document.querySelector('.swatch.selected')?.getAttribute('data-color');

            if (isMushroom) {
                // Stem
                const stemMat = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.7 });
                const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.42, 16), stemMat);
                stem.position.y = -0.19;
                stem.castShadow = true;
                group.add(stem);

                // Cap (dome) + gill underside, instead of a single flat sphere
                const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(natureColorHex || '#dc2626'), roughness: 0.55 });
                const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2.1), capMat);
                cap.position.y = 0.05;
                cap.castShadow = true;
                group.add(cap);
                const gillMat = new THREE.MeshStandardMaterial({ color: 0xe5decf, roughness: 0.9, side: THREE.DoubleSide });
                const gill = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.1, 0.06, 24, 1, true), gillMat);
                gill.position.y = 0.02;
                group.add(gill);

                // White spots on the cap
                const spotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
                [[0, 0.28, 0.18], [-0.22, 0.2, 0.1], [0.2, 0.2, 0.14], [-0.1, 0.32, -0.1], [0.12, 0.3, -0.18]].forEach(([sx, sy, sz]) => {
                    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), spotMat);
                    spot.position.set(sx, sy, sz);
                    group.add(spot);
                });
            } else if (isFlower) {
                // Stem (slightly curved)
                const stemMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.7 });
                const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.65, 10), stemMat);
                stem.position.y = -0.15;
                stem.castShadow = true;
                group.add(stem);

                // Leaf
                const leaf = new THREE.Mesh(createBeveledBox(0.22, 0.08, 0.02, 0.015), stemMat);
                leaf.position.set(-0.14, -0.25, 0);
                leaf.rotation.z = 0.4;
                group.add(leaf);

                // Petals fanned around the center, instead of one flat disc
                const petalMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(natureColorHex || '#f472b6'), roughness: 0.5 });
                for (let p = 0; p < 6; p++) {
                    const angle = (p / 6) * Math.PI * 2;
                    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), petalMat);
                    petal.scale.set(0.55, 1, 0.3);
                    petal.position.set(Math.cos(angle) * 0.13, 0.2 + Math.abs(Math.sin(angle)) * 0.01, Math.sin(angle) * 0.13);
                    petal.rotation.z = angle;
                    petal.castShadow = true;
                    group.add(petal);
                }
                const center = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5 }));
                center.position.y = 0.2;
                group.add(center);
            } else {
                // --- Tree ---
                const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9 });
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, 0.55, 12), trunkMat);
                trunk.position.y = -0.28;
                trunk.castShadow = true;
                group.add(trunk);

                // Root flare at the base
                for (let i = 0; i < 4; i++) {
                    const angle = (i / 4) * Math.PI * 2;
                    const root = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 6), trunkMat);
                    root.position.set(Math.cos(angle) * 0.09, -0.53, Math.sin(angle) * 0.09);
                    root.rotation.z = Math.cos(angle) * 0.5;
                    root.rotation.x = Math.sin(angle) * 0.5;
                    group.add(root);
                }

                // Layered foliage — several overlapping rounded clumps instead
                // of one plain sphere, so the canopy reads as a real silhouette.
                const foliageColor = new THREE.Color(natureColorHex || '#22c55e');
                const foliageMat = new THREE.MeshStandardMaterial({ color: foliageColor, roughness: 0.85 });
                const foliageMatLight = new THREE.MeshStandardMaterial({ color: foliageColor.clone().offsetHSL(0, 0, 0.08), roughness: 0.8 });
                [[0, 0.15, 0, 0.42, foliageMat], [-0.22, 0.05, 0.1, 0.3, foliageMatLight], [0.24, 0.08, -0.08, 0.3, foliageMatLight], [0, 0.42, 0, 0.28, foliageMatLight]]
                    .forEach(([fx, fy, fz, fr, mat]) => {
                        const clump = new THREE.Mesh(new THREE.SphereGeometry(fr, 16, 12), mat);
                        clump.position.set(fx, fy, fz);
                        clump.castShadow = true;
                        group.add(clump);
                    });

                // A few fruit highlights
                const fruitMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
                [[0.18, 0.1, 0.28], [-0.24, 0.2, 0.15], [0.05, 0.35, 0.22]].forEach(([px, py, pz]) => {
                    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), fruitMat);
                    fruit.position.set(px, py, pz);
                    group.add(fruit);
                });
            }
        }
        else if (prompt.includes('torre') || prompt.includes('tower') || prompt.includes('castillo') || prompt.includes('castle') || prompt.includes('edificio') || prompt.includes('building') || prompt.includes('puerta') || prompt.includes('door') || prompt.includes('muralla') || prompt.includes('wall')) {
            // --- 3D Tower / Building (previously fell through to the generic gem) ---
            const stoneMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85, metalness: 0.05 });
            const roofMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.6 });

            // Foundation
            const base = new THREE.Mesh(createBeveledBox(0.7, 0.15, 0.7, 0.02), stoneMat);
            base.position.y = -0.55;
            base.castShadow = true; base.receiveShadow = true;
            group.add(base);

            // Octagonal tower body — reads as a real turret instead of a plain box
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.9, 8), stoneMat);
            body.position.y = -0.02;
            body.castShadow = true;
            group.add(body);

            // Brick seam rings for surface texture
            const seamMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 });
            for (let i = 0; i < 4; i++) {
                const seam = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.008, 6, 8), seamMat);
                seam.rotation.x = Math.PI / 2;
                seam.position.y = -0.35 + i * 0.24;
                group.add(seam);
            }

            // Battlements around the top
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const crenel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), stoneMat);
                crenel.position.set(Math.cos(angle) * 0.33, 0.48, Math.sin(angle) * 0.33);
                crenel.rotation.y = -angle;
                group.add(crenel);
            }

            // Conical roof
            const roof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 8), roofMat);
            roof.position.y = 0.7;
            roof.castShadow = true;
            group.add(roof);

            // Arched door
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x3f2a14, roughness: 0.8 });
            const doorShape = new THREE.Shape();
            doorShape.moveTo(-0.11, -0.16);
            doorShape.lineTo(-0.11, 0.05);
            doorShape.quadraticCurveTo(-0.11, 0.16, 0, 0.16);
            doorShape.quadraticCurveTo(0.11, 0.16, 0.11, 0.05);
            doorShape.lineTo(0.11, -0.16);
            doorShape.closePath();
            const door = new THREE.Mesh(new THREE.ExtrudeGeometry(doorShape, { depth: 0.04, bevelEnabled: false, curveSegments: 10 }), doorMat);
            door.position.set(0, -0.5, 0.35);
            group.add(door);

            // Small arched windows
            const windowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.5, roughness: 0.5 });
            [[0.34, 0.1], [-0.34, 0.1]].forEach(([wx, wy]) => {
                const win = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8, 1, false, 0, Math.PI), windowMat);
                win.rotation.z = Math.PI / 2;
                win.position.set(wx, wy, 0);
                group.add(win);
            });
        }
        else if (prompt.includes('terreno') || prompt.includes('bloque') || prompt.includes('isometrico') || prompt.includes('isométrico') || prompt.includes('tile') || prompt.includes('suelo') || /\bground\b/.test(prompt) || prompt.includes('cesped') || prompt.includes('césped') || prompt.includes('grass') || prompt.includes('nieve') || prompt.includes('snow') || prompt.includes('lava') || prompt.includes('desierto') || prompt.includes('desert')) {
            // --- 3D Ground / Floor Tile (previously didn't exist in 3D at all) ---
            const isSnow = prompt.includes('nieve') || prompt.includes('snow');
            const isLava = prompt.includes('lava');
            const isDesert = prompt.includes('desierto') || prompt.includes('desert');
            const isGrass = !isSnow && !isLava && !isDesert;

            let topColor = 0x4ade80, sideColor = 0x78350f;
            if (isSnow) { topColor = 0xf8fafc; sideColor = 0x94a3b8; }
            else if (isLava) { topColor = 0xea580c; sideColor = 0x27272a; }
            else if (isDesert) { topColor = 0xe9c46a; sideColor = 0xb08968; }

            const topMat = new THREE.MeshStandardMaterial({
                color: topColor, roughness: isLava ? 0.4 : 0.9,
                emissive: isLava ? new THREE.Color(0xea580c) : new THREE.Color(0x000000),
                emissiveIntensity: isLava ? 0.5 : 0
            });
            const sideMat = new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.95 });

            // Isometric-style block with a distinct top face and dirt sides,
            // instead of one flat-colored cube.
            const block = new THREE.Mesh(
                new THREE.BoxGeometry(1.0, 0.32, 1.0),
                [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]
            );
            block.position.y = -0.16;
            block.castShadow = true; block.receiveShadow = true;
            group.add(block);

            // Surface detail matching the terrain type
            if (isGrass) {
                const bladeMatGrass = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8 });
                for (let i = 0; i < 14; i++) {
                    const gx = (Math.random() - 0.5) * 0.85, gz = (Math.random() - 0.5) * 0.85;
                    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.09, 4), bladeMatGrass);
                    blade.position.set(gx, 0.03, gz);
                    blade.rotation.x = (Math.random() - 0.5) * 0.3;
                    group.add(blade);
                }
            } else if (isSnow) {
                for (let i = 0; i < 10; i++) {
                    const gx = (Math.random() - 0.5) * 0.85, gz = (Math.random() - 0.5) * 0.85;
                    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.04 + Math.random() * 0.03, 8, 6), topMat);
                    bump.position.set(gx, 0.02, gz);
                    bump.scale.y = 0.5;
                    group.add(bump);
                }
            } else if (isDesert) {
                const duneMat = new THREE.MeshStandardMaterial({ color: 0xd4a24c, roughness: 0.9 });
                for (let i = 0; i < 3; i++) {
                    const gx = (Math.random() - 0.5) * 0.6, gz = (Math.random() - 0.5) * 0.6;
                    const dune = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), duneMat);
                    dune.scale.set(1, 0.25, 1);
                    dune.position.set(gx, 0.02, gz);
                    group.add(dune);
                }
            } else if (isLava) {
                const crackMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 1, roughness: 0.3 });
                [[0.1, 0.2], [-0.15, -0.1], [0.2, -0.2]].forEach(([cx2, cz2]) => {
                    const crack = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), crackMat);
                    crack.position.set(cx2, 0.02, cz2);
                    crack.scale.y = 0.15;
                    group.add(crack);
                });
            }
        }
        else if (prompt.includes('dog') || prompt.includes('perro') || prompt.includes('cat') || prompt.includes('gato') || prompt.includes('wolf') || prompt.includes('lobo') || prompt.includes('chicken') || prompt.includes('gallina') || prompt.includes('gallo') || prompt.includes('pollo')) {
            const isChicken = prompt.includes('chicken') || prompt.includes('gallina') || prompt.includes('gallo') || prompt.includes('pollo');
            const activeSwatch = document.querySelector('.swatch.selected');
            const animalColorHex = activeSwatch ? activeSwatch.getAttribute('data-color') : '#c026d3';
            const animalMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(animalColorHex),
                roughness: 0.75,
                metalness: 0.05
            });

            if (isChicken) {
                // --- Plump 3D Chicken ---
                const bodyGeo = new THREE.SphereGeometry(0.38, 24, 24);
                const bodyMesh = new THREE.Mesh(bodyGeo, animalMat);
                bodyMesh.position.y = 0.2;
                bodyMesh.scale.set(1, 1.1, 1.15);
                bodyMesh.castShadow = true;
                group.add(bodyMesh);

                // Orange Beak
                const beakGeo = new THREE.ConeGeometry(0.06, 0.15, 4);
                const beakMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.5 });
                const beak = new THREE.Mesh(beakGeo, beakMat);
                beak.position.set(0, 0.28, -0.42);
                beak.rotation.x = -Math.PI / 2.2;
                group.add(beak);

                // Red comb on top of the head
                const combMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
                for (let i = 0; i < 3; i++) {
                    const comb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), combMat);
                    comb.position.set(0, 0.42 + (i === 1 ? 0.02 : 0), -0.32 + i * 0.06);
                    comb.scale.set(0.7, 1, 0.6);
                    group.add(comb);
                }
                // Wattle under the beak
                const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), combMat);
                wattle.position.set(0, 0.2, -0.4);
                wattle.scale.set(0.7, 1.2, 0.7);
                group.add(wattle);

                // Eyes
                const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
                [-0.1, 0.1].forEach(ex => {
                    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeMat);
                    eye.position.set(ex, 0.32, -0.38);
                    group.add(eye);
                });

                // Wings (flattened, pressed against the sides)
                const wingMat = new THREE.MeshStandardMaterial({ color: adjustBrightness(animalColorHex, -15), roughness: 0.8 });
                [-1, 1].forEach(side => {
                    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), wingMat);
                    wing.scale.set(0.35, 0.85, 0.6);
                    wing.position.set(side * 0.32, 0.18, 0.02);
                    wing.rotation.z = side * 0.2;
                    group.add(wing);
                });

                // Tail feathers, fanned at the back
                const tailMat = new THREE.MeshStandardMaterial({ color: adjustBrightness(animalColorHex, -10), roughness: 0.7 });
                for (let i = -1; i <= 1; i++) {
                    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 6), tailMat);
                    feather.position.set(i * 0.08, 0.42, 0.38);
                    feather.rotation.x = Math.PI * 0.62 + i * 0.05;
                    feather.rotation.z = i * 0.15;
                    group.add(feather);
                }

                // Tiny legs with feet
                const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18, 8);
                const legMat = new THREE.MeshStandardMaterial({ color: 0xf97316 });
                [-0.12, 0.12].forEach(lx => {
                    const leg = new THREE.Mesh(legGeo, legMat);
                    leg.position.set(lx, -0.15, 0);
                    group.add(leg);
                    for (let t = -1; t <= 1; t++) {
                        const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), legMat);
                        toe.position.set(lx + t * 0.03, -0.24, -0.03 + Math.abs(t) * 0.02);
                        toe.rotation.x = Math.PI / 2.3;
                        toe.rotation.z = t * 0.4;
                        group.add(toe);
                    }
                });
            } else {
                // --- Quadrupeds: Dog, Cat, Wolf ---
                const isCat = prompt.includes('cat') || prompt.includes('gato');
                const isWolf = prompt.includes('wolf') || prompt.includes('lobo');

                // Torso — cylinder capped with hemispheres so it reads as a
                // rounded body instead of a tube with flat front/back ends.
                const bodyGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.58, 16, 1, true);
                const bodyMesh = new THREE.Mesh(bodyGeo, animalMat);
                bodyMesh.rotation.x = Math.PI / 2;
                bodyMesh.position.y = 0.25;
                bodyMesh.castShadow = true;
                group.add(bodyMesh);
                [[-0.29, 1], [0.29, -1]].forEach(([zOff]) => {
                    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), animalMat);
                    cap.rotation.x = zOff > 0 ? Math.PI / 2 : -Math.PI / 2;
                    cap.position.set(0, 0.25, zOff);
                    cap.castShadow = true;
                    group.add(cap);
                });

                // Head
                const headGeo = new THREE.SphereGeometry(0.18, 24, 24);
                const head = new THREE.Mesh(headGeo, animalMat);
                head.position.set(0, 0.54, -0.36);
                head.castShadow = true;
                group.add(head);

                // Snout
                const snoutGeo = new THREE.BoxGeometry(0.12, 0.1, 0.14);
                const snoutMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.7 });
                const snout = new THREE.Mesh(snoutGeo, snoutMat);
                snout.position.set(0, 0.5, -0.48);
                group.add(snout);

                // Nose + eyes
                const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
                nose.position.set(0, 0.51, -0.55);
                group.add(nose);
                const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
                [-0.09, 0.09].forEach(ex => {
                    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), eyeMat);
                    eye.position.set(ex, 0.58, -0.44);
                    group.add(eye);
                });

                // Ears
                const earGeo = isCat 
                    ? new THREE.ConeGeometry(0.06, 0.12, 4)
                    : new THREE.BoxGeometry(0.06, isWolf ? 0.24 : 0.18, 0.08);
                const earMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.8 });
                const earL = new THREE.Mesh(earGeo, earMat);
                const earR = new THREE.Mesh(earGeo, earMat);
                
                if (isCat) {
                    earL.position.set(-0.12, 0.7, -0.32);
                    earR.position.set(0.12, 0.7, -0.32);
                } else {
                    earL.position.set(-0.19, isWolf ? 0.62 : 0.55, -0.32);
                    earR.position.set(0.19, isWolf ? 0.62 : 0.55, -0.32);
                }
                group.add(earL);
                group.add(earR);

                // 4 legs, each with a small paw
                const legGeo = new THREE.CylinderGeometry(0.04, 0.036, 0.38, 8);
                const pawMat = animalMat;
                [[-0.18, -0.22], [0.18, -0.22], [-0.18, 0.22], [0.18, 0.22]].forEach(([lx, lz]) => {
                    const leg = new THREE.Mesh(legGeo, animalMat);
                    leg.position.set(lx, 0.05, lz);
                    leg.castShadow = true;
                    group.add(leg);
                    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), pawMat);
                    paw.scale.set(1, 0.6, 1.1);
                    paw.position.set(lx, -0.14, lz + 0.02);
                    group.add(paw);
                });

                // Tail — tapered, curved up at the tip; bushier for the wolf
                const tailSegs = isWolf ? 5 : 4;
                let tx = 0, ty = 0.32, tz = 0.34, trot = -0.5;
                for (let i = 0; i < tailSegs; i++) {
                    const segLen = 0.14;
                    const segR = (isWolf ? 0.045 : 0.03) * (1 - i / tailSegs * 0.5);
                    const seg = new THREE.Mesh(new THREE.CylinderGeometry(segR, segR * 0.85, segLen, 8), animalMat);
                    seg.position.set(tx + Math.sin(trot) * segLen * 0.5, ty + Math.cos(trot) * segLen * 0.5 - 0.1, tz);
                    seg.rotation.x = trot;
                    seg.castShadow = true;
                    group.add(seg);
                    tx += Math.sin(trot) * segLen;
                    ty += Math.cos(trot) * segLen - 0.02;
                    tz += 0.02;
                    trot -= isCat ? 0.15 : 0.3;
                }
            }
        }
        else if (prompt.includes('personaje') || prompt.includes('character') || prompt.includes('npc') || prompt.includes('humano') || prompt.includes('guerrero') || prompt.includes('warrior') || prompt.includes('mago') || prompt.includes('mage') || prompt.includes('pícaro') || prompt.includes('rogue') || prompt.includes('sanador') || prompt.includes('healer') || prompt.includes('goblin') || prompt.includes('esqueleto') || prompt.includes('skeleton') || prompt.includes('orco') || prompt.includes('orc') || prompt.includes('ghost') || prompt.includes('fantasma') || prompt.includes('slime') || prompt.includes('monstruo') || prompt.includes('monster') || prompt.includes('golem') || prompt.includes('boss') || prompt.includes('princesa') || prompt.includes('princess') || prompt.includes('vago') || prompt.includes('beggar') || prompt.includes('noble')) {
            // --- Stylized Premium 3D Character Model ---
            // Torso (maps custom texture!)
            // Get customizable variables from UI
            const activeTypeBtn = document.querySelector('#char-editor-panel .char-type-btn.active');
            const characterType = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'warrior';

            const activeSkin = document.querySelector('#char-editor-panel .skin-swatch.selected');
            const skinColor = activeSkin ? activeSkin.getAttribute('data-skin') : '#e8b89a';

            const activeHair = document.querySelector('#char-editor-panel .hair-swatch.selected');
            const hairColor = activeHair ? activeHair.getAttribute('data-hair') : '#1a0a00';

            const outfitPrimary = document.getElementById('char-outfit-primary')?.value || '#4a6fa5';
            const outfitAccent = document.getElementById('char-outfit-accent')?.value || '#2d3a4a';

            // Check gender/variants from prompt or settings
            const gender = prompt.includes('female') || prompt.includes('mujer') || prompt.includes('chica') || prompt.includes('princesa') || prompt.includes('reina') ? 'female' : 'male';

            // Build realistic mesh using modular organic procedural constructor
            const realChar = RealisticCharacter.build({
                type: characterType,
                skinColor: skinColor,
                hairColor: hairColor,
                primaryColor: outfitPrimary,
                accentColor: outfitAccent,
                gender: gender
            });

            group.add(realChar);

            // Recreate joint controller interactions
            setTimeout(() => {
                if (jointController) {
                    jointController.destroy();
                    jointController = null;
                }
                if (renderer && camera) {
                    jointController = RealisticCharacter.createJointController(realChar, renderer, camera, orbitControls);
                    
                    // Apply current active pose preset
                    const activePoseBtn = document.querySelector('.pose-btn.active');
                    if (activePoseBtn) {
                        const poseName = activePoseBtn.getAttribute('data-pose');
                        jointController.applyPose(poseName);
                    }
                }
            }, 50);
        }

        else if ((prompt.includes('bosque') || prompt.includes('forest')) &&
            !prompt.includes('montaña') && !prompt.includes('mountain') && !prompt.includes('mar') && !prompt.includes('sea') &&
            !prompt.includes('ciudad') && !prompt.includes('city') && !prompt.includes('cueva') && !prompt.includes('cave') &&
            !prompt.includes('paisaje') && !prompt.includes('landscape') && !prompt.includes('escenario') && !prompt.includes('escena') &&
            !prompt.includes('scenario') && !prompt.includes('background') && !prompt.includes('fondo')) {
            // --- 3D Forest patch: grass ground + a cluster of varied trees.
            // A standalone "bosque"/"forest" gets its own dense cluster; if the
            // prompt also mentions mountains/city/etc it falls through to the
            // full scene diorama below instead. ---
            const ground = new THREE.Mesh(
                new THREE.CylinderGeometry(1.1, 1.1, 0.1, 32),
                new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.95 })
            );
            ground.position.y = -0.45;
            ground.receiveShadow = true;
            group.add(ground);

            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9 });
            const foliageColors = [0x22c55e, 0x16a34a, 0x15803d];
            const buildTree3D = (px, pz, scale, colorIdx) => {
                const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 0.4 * scale, 10), trunkMat);
                trunk.position.set(px, -0.4 + 0.2 * scale, pz);
                trunk.castShadow = true;
                group.add(trunk);
                const foliageMat = new THREE.MeshStandardMaterial({ color: foliageColors[colorIdx % foliageColors.length], roughness: 0.85 });
                [[0, 0.55, 0.32], [-0.12, 0.42, 0.24], [0.14, 0.46, 0.24]].forEach(([fx, fy, fr]) => {
                    const clump = new THREE.Mesh(new THREE.SphereGeometry(fr * scale, 12, 10), foliageMat);
                    clump.position.set(px + fx * scale, -0.4 + fy * scale, pz);
                    clump.castShadow = true;
                    group.add(clump);
                });
            };

            const positions = [[-0.55, 1.0, 0.85], [0.5, 0.85, 0.7], [0.0, 0.7, 1.0], [-0.75, 0.75, 0.6], [0.75, 0.65, 0.75], [-0.15, 0.8, 0.55]];
            positions.forEach(([px, pz, scale], i) => buildTree3D(px, pz, scale, i));

            // Scattered rocks on the forest floor
            const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9 });
            [[0.3, 0.55], [-0.4, -0.5]].forEach(([rx, rz]) => {
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), rockMat);
                rock.position.set(rx, -0.4, rz);
                rock.castShadow = true;
                group.add(rock);
            });
        }
        else if (prompt.includes('escenario') || prompt.includes('escena') || prompt.includes('scenario') || prompt.includes('background') || prompt.includes('fondo') || prompt.includes('paisaje') || prompt.includes('landscape') || prompt.includes('bosque') || prompt.includes('forest') || prompt.includes('cueva') || prompt.includes('cave') || prompt.includes('ciudad') || prompt.includes('city') || prompt.includes('montaña') || prompt.includes('mountain') || prompt.includes('mar') || prompt.includes('sea')) {
            // --- 3D Scene Diorama ---
            
            // Ground plane (large flat base with canvas texture)
            const groundGeo = new THREE.BoxGeometry(3.2, 0.06, 2.2);
            const ground = new THREE.Mesh(groundGeo, materials.customMaterial);
            ground.position.y = -0.42;
            ground.receiveShadow = true;
            group.add(ground);

            // Back sky backdrop panel
            const skyGeo = new THREE.PlaneGeometry(3.0, 1.8);
            const sky = new THREE.Mesh(skyGeo, materials.customMaterial);
            sky.position.set(0, 0.5, 1.05);
            sky.rotation.y = Math.PI;
            group.add(sky);

            // Mountain 1 (left, tallest)
            const mtn1Geo = new THREE.ConeGeometry(0.65, 1.1, 4);
            const mtnMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.85, metalness: 0.05 });
            const mtn1 = new THREE.Mesh(mtn1Geo, mtnMat);
            mtn1.position.set(-0.8, 0.18, 0.5);
            mtn1.rotation.y = Math.PI / 4;
            mtn1.castShadow = true;
            group.add(mtn1);

            // Mountain 1 snow cap
            const snowCapGeo = new THREE.ConeGeometry(0.22, 0.3, 4);
            const snowMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.9 });
            const snowCap = new THREE.Mesh(snowCapGeo, snowMat);
            snowCap.position.set(-0.8, 0.73, 0.5);
            snowCap.rotation.y = Math.PI / 4;
            group.add(snowCap);

            // Mountain 2 (right, medium)
            const mtn2Geo = new THREE.ConeGeometry(0.5, 0.85, 5);
            const mtn2 = new THREE.Mesh(mtn2Geo, mtnMat);
            mtn2.position.set(0.7, 0.08, 0.6);
            mtn2.castShadow = true;
            group.add(mtn2);

            // Mountain 3 (center-back, small)
            const mtn3Geo = new THREE.ConeGeometry(0.35, 0.65, 4);
            const mtn3 = new THREE.Mesh(mtn3Geo, new THREE.MeshStandardMaterial({ color: 0x718096, roughness: 0.8 }));
            mtn3.position.set(0.0, 0.0, 0.8);
            mtn3.rotation.y = Math.PI / 5;
            group.add(mtn3);

            // Pine Trees
            const drawPine3D = (px, pz, tHeight) => {
                const trunkGeo = new THREE.CylinderGeometry(0.025, 0.025, tHeight * 0.3, 8);
                const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
                const trunk = new THREE.Mesh(trunkGeo, trunkMat);
                trunk.position.set(px, -0.42 + tHeight * 0.15, pz);
                group.add(trunk);

                const leavesGeo = new THREE.ConeGeometry(tHeight * 0.22, tHeight * 0.72, 7);
                const leavesMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });
                const leaves = new THREE.Mesh(leavesGeo, leavesMat);
                leaves.position.set(px, -0.42 + tHeight * 0.52, pz);
                leaves.castShadow = true;
                group.add(leaves);
            };

            drawPine3D(-1.2, 0.0, 0.7);
            drawPine3D(-1.0, -0.3, 0.55);
            drawPine3D(1.1, 0.1, 0.65);
            drawPine3D(1.35, -0.35, 0.48);
            drawPine3D(0.3, -0.6, 0.42);
        }
        else {
            // --- 3D Gem / Default Orb ---
            // Use canvas texture ONLY if something has been generated, otherwise use a stylized material
            const hasAsset = canvas.dataset.hasAsset === 'true';
            const gemMat = hasAsset
                ? materials.customMaterial
                : new THREE.MeshStandardMaterial({
                    color: 0xa855f7,
                    roughness: 0.05,
                    metalness: 0.1,
                    emissive: new THREE.Color(0x7c3aed),
                    emissiveIntensity: 0.45,
                    transparent: true,
                    opacity: 0.92
                });
            const gemGeo = new THREE.OctahedronGeometry(0.55, 2);
            const gem = new THREE.Mesh(gemGeo, gemMat);
            gem.position.y = 0.1;
            gem.castShadow = true;
            gem.receiveShadow = true;
            group.add(gem);

            // Floating glow ring under the gem
            const ringGeo = new THREE.TorusGeometry(0.55, 0.025, 12, 64);
            const ringMat = new THREE.MeshStandardMaterial({
                color: 0xa855f7,
                emissive: new THREE.Color(0xa855f7),
                emissiveIntensity: 0.9,
                roughness: 0.1,
                metalness: 0.5
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.y = -0.3;
            ring.rotation.x = Math.PI / 2;
            group.add(ring);
        }
        
        return group;
    }

    // Shows a beautiful placeholder gem in the 3D viewer before any asset is generated
    function showPlaceholder3D() {
        if (currentMesh) scene.remove(currentMesh);
        const group = new THREE.Group();

        // Main gem — sharp faceted diamond (detail=0 gives clean angular faces)
        const gemGeo = new THREE.OctahedronGeometry(0.6, 0);
        const gemMat = new THREE.MeshStandardMaterial({
            color: 0xa855f7,
            roughness: 0.08,
            metalness: 0.1,
            emissive: new THREE.Color(0x6d28d9),
            emissiveIntensity: 0.55,
            transparent: true,
            opacity: 0.95,
            flatShading: true  // keep the sharp faceted look
        });
        const gem = new THREE.Mesh(gemGeo, gemMat);
        gem.position.y = 0.15;
        gem.castShadow = true;
        group.add(gem);

        // A second smaller gem offset for depth
        const gem2Geo = new THREE.OctahedronGeometry(0.22, 0);
        const gem2Mat = new THREE.MeshStandardMaterial({
            color: 0xc084fc,
            roughness: 0.05,
            metalness: 0.1,
            emissive: new THREE.Color(0xa855f7),
            emissiveIntensity: 0.7,
            flatShading: true
        });
        const gem2 = new THREE.Mesh(gem2Geo, gem2Mat);
        gem2.position.set(0.55, 0.4, 0.1);
        gem2.castShadow = true;
        group.add(gem2);

        // Glow ring beneath the gem
        const ringGeo = new THREE.TorusGeometry(0.55, 0.018, 10, 64);
        const ringMat = new THREE.MeshStandardMaterial({
            color: 0xc084fc,
            emissive: new THREE.Color(0xc084fc),
            emissiveIntensity: 1.5,
            roughness: 0.05
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = -0.38;
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        currentMesh = group;
        currentMesh.userData.isPlaceholder = true;
        scene.add(currentMesh);
    }

    function updateThreeMesh(meshType) {

        if (currentMesh) scene.remove(currentMesh);

        let geometry;
        
        if (meshType === 'mesh_3d') {
            currentMesh = generateReal3DMesh();
        }
        else if (meshType === 'voxel_3d') {
            currentMesh = generateVoxelMesh();
        }
        else if (meshType === 'cube') {
            geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
            currentMesh = new THREE.Mesh(geometry, materials.customMaterial);
        } 
        else if (meshType === 'sphere') {
            geometry = new THREE.SphereGeometry(0.8, 64, 64);
            currentMesh = new THREE.Mesh(geometry, materials.customMaterial);
        } 
        else if (meshType === 'cylinder') {
            geometry = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 32);
            currentMesh = new THREE.Mesh(geometry, materials.customMaterial);
        } 
        else if (meshType === 'plane') {
            geometry = new THREE.PlaneGeometry(1.6, 1.6);
            currentMesh = new THREE.Mesh(geometry, materials.customMaterial);
        } 
        else if (meshType === 'character') {
            // A sprite billboard that rotates to look at camera or just stays vertical
            geometry = new THREE.PlaneGeometry(1.2, 1.8);
            currentMesh = new THREE.Mesh(geometry, materials.customMaterial);
            currentMesh.position.y = 0.4;
        } 
        else if (meshType === 'isometric_terrain') {
            // Procedural isometric block model
            const group = new THREE.Group();
            
            // Generate standard tile dimensions
            const topGeo = new THREE.BoxGeometry(1.5, 0.3, 1.5);
            const baseGeo = new THREE.BoxGeometry(1.5, 0.9, 1.5);
            
            // Map texture to top face
            const topMaterial = materials.customMaterial;
            
            const dirtMaterial = new THREE.MeshStandardMaterial({
                color: 0x4b3621,
                roughness: 0.9
            });
            
            const baseMesh = new THREE.Mesh(baseGeo, dirtMaterial);
            baseMesh.position.y = -0.45;
            
            const topMesh = new THREE.Mesh(topGeo, topMaterial);
            topMesh.position.y = 0.15;
            
            group.add(baseMesh);
            group.add(topMesh);
            currentMesh = group;
        }
        else if (meshType === 'scene_3d') {
            if (window.FarmventureWorld) {
                showLoader('🏔️ Generando Diorama 3D...', 'Cargando terreno, ríos, cascadas y bosques...');
                FarmventureWorld.buildWorldDiorama().then(dioramaGroup => {
                    if (currentMesh) scene.remove(currentMesh);
                    currentMesh = dioramaGroup;
                    scene.add(currentMesh);
                    orbitControls.target.set(0, 0.4, 0);
                    orbitControls.update();
                    hideLoader();
                }).catch(err => {
                    console.error('[FarmventureWorld] Error building diorama:', err);
                    currentMesh = generateReal3DMesh();
                    scene.add(currentMesh);
                    hideLoader();
                });
                return; // async loader takes care of scene.add
            } else {
                currentMesh = generateReal3DMesh();
            }
        }

        if (meshType !== 'isometric_terrain' && meshType !== 'voxel_3d' && meshType !== 'mesh_3d' && meshType !== 'scene_3d') {
            currentMesh.castShadow = true;
            currentMesh.receiveShadow = true;
        }
        
        scene.add(currentMesh);
    }

    function updateThreeTexture() {
        if (materials.canvasTex) {
            materials.canvasTex.needsUpdate = true;
        }
        // Regenerate voxel mesh in real-time when the user is painting on it
        if (threeMeshSelect && threeMeshSelect.value === 'voxel_3d') {
            updateThreeMesh('voxel_3d');
        }
    }

    function updateThreeMaterial() {
        if (materials.customMaterial) {
            materials.customMaterial.roughness = state.material.roughness;
            materials.customMaterial.metalness = state.material.metalness;
            materials.customMaterial.bumpScale = state.material.bumpScale;
            materials.customMaterial.needsUpdate = true;
        }
    }

    function onWindowResize() {
        if (camera && renderer && threeViewport) {
            camera.aspect = threeViewport.clientWidth / threeViewport.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(threeViewport.clientWidth, threeViewport.clientHeight);
        }
    }

    function animateThreeJS() {
        requestAnimationFrame(animateThreeJS);
        
        const t = performance.now() * 0.001; // seconds

        if (currentMesh) {
            // Always gently rotate the placeholder gem
            if (currentMesh.userData.isPlaceholder) {
                currentMesh.rotation.y = t * 0.5;
                currentMesh.position.y = Math.sin(t * 1.2) * 0.07; // gentle bobbing
            } else if (autoRotate) {
                currentMesh.rotation.y += 0.008;
            }
        }
        
        if (orbitControls) {
            orbitControls.update();
        }

        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }


    // --- Export Logic ---
    function exportAsset() {
        if (state.currentWorkspace === '3d') {
            // Export 3D Mesh to OBJ
            if (!currentMesh) return;
            const exporter = new THREE.OBJExporter();
            const result = exporter.parse(currentMesh);
            
            downloadFile(result, 'asset_3d.obj', 'text/plain');
        } else {
            // Export 2D Canvas Image
            const dataURL = canvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.download = 'game_asset.png';
            link.href = dataURL;
            link.click();
        }
    }

    function downloadFile(content, fileName, contentType) {
        const a = document.createElement("a");
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // --- Launch ---

    // ============================================================
    // CHARACTER DRAWING ENGINE
    // ============================================================

    /** Main router for character and creature customization in the live editor */
    function drawConfiguredCharacter(cx, cy, type, skin, hair, primary, accent, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';
        const glow = primary + '55';

        // Size multiplier from slider
        const sizeVal = parseInt(document.getElementById('char-size-slider')?.value || 1);
        let scale = 1.0;
        if (sizeVal === 0) scale = 0.85; // thin/small
        if (sizeVal === 2) scale = 1.15; // strong/big

        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        // Fetch checkboxed accessories
        const hasHat = document.getElementById('acc-hat')?.checked;
        const hasCape = document.getElementById('acc-cape')?.checked;
        const hasBag = document.getElementById('acc-bag')?.checked;
        const hasScarf = document.getElementById('acc-scarf')?.checked;
        const hasGlasses = document.getElementById('acc-glasses')?.checked;
        const hasWeapon = document.getElementById('acc-weapon')?.checked;

        // Fetch emotion
        const activeEmotionBtn = document.querySelector('#char-emotion-grid .emotion-btn.active');
        const emotion = activeEmotionBtn ? activeEmotionBtn.getAttribute('data-emotion') : 'neutral';

        // If it's a monster/creature or animal
        const monsterTypes = ['slime', 'goblin', 'skeleton', 'dragon', 'orc', 'ghost', 'spider', 'bat', 'wolf', 'dog', 'cat', 'chicken', 'golem', 'boss'];
        if (monsterTypes.includes(type)) {
            if (type === 'slime') drawCreatureSlime(cx, cy, primary, accent, glow, style);
            else if (type === 'goblin') drawCreatureGoblin(cx, cy, primary, accent, glow, style);
            else if (type === 'skeleton') drawCreatureSkeleton(cx, cy, primary, accent, glow, style);
            else if (type === 'dragon') drawCreatureDragon(cx, cy, primary, accent, glow, style);
            else if (type === 'orc') drawCreatureOrc(cx, cy, primary, accent, glow, style);
            else if (type === 'ghost') drawCreatureGhost(cx, cy, primary, accent, glow, style);
            else if (type === 'spider') drawCreatureSpider(cx, cy, primary, accent, glow, style);
            else if (type === 'bat') drawCreatureBat(cx, cy, primary, accent, glow, style);
            else if (type === 'wolf') drawCreatureWolf(cx, cy, primary, accent, glow, style);
            else if (type === 'dog') drawCreatureDog(cx, cy, primary, accent, glow, style);
            else if (type === 'cat') drawCreatureCat(cx, cy, primary, accent, glow, style);
            else if (type === 'chicken') drawCreatureChicken(cx, cy, primary, accent, glow, style);
            else if (type === 'golem') drawCreatureGolem(cx, cy, primary, accent, glow, style);
            else if (type === 'boss') drawCreatureBoss(cx, cy, primary, accent, glow, style);
            ctx.restore();
            return;
        }
        // Draw Cape Behind (if enabled)
        if (hasCape) {
            ctx.fillStyle = darkenColor(primary, 40);
            ctx.beginPath();
            ctx.roundRect(cx - 24*S, cy - 10*S, 48*S, 65*S, px ? 0 : 8*S);
            ctx.fill();
        }

        // Humanoid body configuration options
        let opts = { bodyH: 56*S, bodyW: 32*S };
        if (type === 'child') {
            opts.bodyH = 38*S; opts.bodyW = 26*S; opts.legH = 26*S; opts.headR = 24*S;
        } else if (type === 'guard' || type === 'paladin' || type === 'blacksmith') {
            opts.bodyW = 38*S; opts.bodyH = 60*S;
        } else if (type === 'princess') {
            opts.bodyH = 58*S; opts.bodyW = 30*S;
        }

        // Custom colors for specific NPC types
        let clothingColor = primary;
        let pantsColor = darkenColor(primary, 50);
        
        if (type === 'beggar') {
            clothingColor = '#78350f'; // Rags brown
            pantsColor = '#451a03';
        } else if (type === 'princess') {
            clothingColor = primary; // Keep beautiful primary dress color
        }

        // Core base humanoid
        const { torsoTop, torsoBot, headR, bodyW, armW } = drawHumanoidBase(cx, cy - 15*S, skin, clothingColor, pantsColor, S, px, opts);

        // Princess dress overlay (flowing skirt over the legs)
        if (type === 'princess') {
            ctx.fillStyle = clothingColor;
            ctx.beginPath();
            ctx.moveTo(cx - bodyW * 0.55, torsoBot - 6*S);
            ctx.lineTo(cx - bodyW * 1.1, torsoBot + 32*S);
            ctx.lineTo(cx + bodyW * 1.1, torsoBot + 32*S);
            ctx.lineTo(cx + bodyW * 0.55, torsoBot - 6*S);
            ctx.closePath();
            ctx.fill();
            // Dress trim
            ctx.fillStyle = accent;
            ctx.fillRect(cx - bodyW * 1.0, torsoBot + 28*S, bodyW * 2.0, 4*S);
        }

        // Beggar tattered details (draw patches)
        if (type === 'beggar') {
            ctx.fillStyle = '#4b5563'; // Grey patches
            ctx.fillRect(cx - bodyW * 0.3, torsoTop + 14*S, 6*S, 6*S);
            ctx.fillStyle = '#065f46'; // Green patch on arm
            ctx.fillRect(cx + bodyW * 0.5, torsoTop + 10*S, 4*S, 6*S);
        }

        // Render hair
        ctx.fillStyle = hair;
        if (type !== 'guard' && type !== 'paladin') {
            // Hair cap
            ctx.beginPath();
            ctx.ellipse(cx, torsoTop - headR * 0.65, headR * 1.05, headR * 0.7, 0, Math.PI, 0);
            ctx.fill();
            // Hair sides/back
            ctx.beginPath();
            if (type === 'elder') {
                // Bald top, grey hair sides
                ctx.fillStyle = '#d1d5db';
                ctx.ellipse(cx - headR*0.7, torsoTop - headR*0.4, headR*0.4, headR*0.6, 0.2, 0, Math.PI*2);
                ctx.ellipse(cx + headR*0.7, torsoTop - headR*0.4, headR*0.4, headR*0.6, -0.2, 0, Math.PI*2);
            } else if (type === 'princess') {
                // Long elegant flowing hair
                ctx.ellipse(cx - headR*0.75, torsoTop - headR*0.1, headR*0.4, headR*1.4, 0.05, 0, Math.PI*2);
                ctx.ellipse(cx + headR*0.75, torsoTop - headR*0.1, headR*0.4, headR*1.4, -0.05, 0, Math.PI*2);
            } else {
                ctx.ellipse(cx - headR*0.8, torsoTop - headR*0.3, headR*0.35, headR*0.6, 0.1, 0, Math.PI*2);
                ctx.ellipse(cx + headR*0.8, torsoTop - headR*0.3, headR*0.35, headR*0.6, -0.1, 0, Math.PI*2);
            }
            ctx.fill();
        }

        // Apply accessories dynamically
        if (hasHat || type === 'mage' || type === 'noble' || type === 'princess' || type === 'merchant') {
            ctx.fillStyle = (type === 'noble' || type === 'princess') ? '#d4a017' : darkenColor(primary, 30);
            if (type === 'noble' || type === 'princess') {
                // Crown / Tiara
                ctx.beginPath();
                ctx.moveTo(cx - headR*0.9, torsoTop - headR*0.9);
                ctx.lineTo(cx - headR*0.9, torsoTop - headR*1.3);
                if (type === 'princess') {
                    // Small delicate tiara
                    ctx.lineTo(cx - headR*0.3, torsoTop - headR*1.15);
                    ctx.lineTo(cx, torsoTop - headR*1.4);
                    ctx.lineTo(cx + headR*0.3, torsoTop - headR*1.15);
                } else {
                    // Full king crown
                    ctx.lineTo(cx - headR*0.4, torsoTop - headR*1.1);
                    ctx.lineTo(cx, torsoTop - headR*1.5);
                    ctx.lineTo(cx + headR*0.4, torsoTop - headR*1.1);
                }
                ctx.lineTo(cx + headR*0.9, torsoTop - headR*1.3);
                ctx.lineTo(cx + headR*0.9, torsoTop - headR*0.9);
                ctx.closePath(); ctx.fill();
            } else if (type === 'mage') {
                // Wizard hat
                ctx.beginPath();
                ctx.moveTo(cx, torsoTop - headR * 2.3);
                ctx.lineTo(cx - headR * 1.1, torsoTop - headR * 0.5);
                ctx.lineTo(cx + headR * 1.1, torsoTop - headR * 0.5);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = accent;
                ctx.fillRect(cx - headR*0.8, torsoTop - headR*0.7, headR*1.6, 4*S);
            } else {
                // Generic top hat / cap
                ctx.fillRect(cx - headR*0.8, torsoTop - headR*1.3, headR*1.6, 12*S);
                ctx.fillRect(cx - headR*1.2, torsoTop - headR*0.9, headR*2.4, 4*S);
            }
        }

        // Scarf
        if (hasScarf) {
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.roundRect(cx - 15*S, torsoTop - 2*S, 30*S, 8*S, 3*S);
            ctx.fill();
            // Hanging tail
            ctx.fillRect(cx + 4*S, torsoTop + 4*S, 8*S, 18*S);
        }

        // Glasses
        if (hasGlasses) {
            ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 2*S;
            ctx.beginPath();
            ctx.arc(cx - headR*0.4, torsoTop - headR*0.4, 6*S, 0, Math.PI*2);
            ctx.arc(cx + headR*0.4, torsoTop - headR*0.4, 6*S, 0, Math.PI*2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - headR*0.1, torsoTop - headR*0.4);
            ctx.lineTo(cx + headR*0.1, torsoTop - headR*0.4);
            ctx.stroke();
        }

        // Bag / satchel
        if (hasBag || type === 'merchant') {
            ctx.fillStyle = '#78350f';
            ctx.beginPath();
            ctx.roundRect(cx - bodyW*0.6, torsoBot - 16*S, 14*S, 14*S, 3*S);
            ctx.fill();
            // Shoulder strap
            ctx.strokeStyle = '#541c00'; ctx.lineWidth = 2*S;
            ctx.beginPath();
            ctx.moveTo(cx - bodyW/2, torsoTop + 8*S);
            ctx.lineTo(cx + bodyW*0.2, torsoBot - 10*S);
            ctx.stroke();
        }

        // Weapon or tools in hand
        if (hasWeapon || type === 'warrior' || type === 'guard' || type === 'paladin' || type === 'blacksmith') {
            ctx.save();
            ctx.translate(cx + bodyW/2 + armW + 4*S, torsoTop + 36*S);
            if (type === 'blacksmith') {
                // Hammer
                ctx.fillStyle = '#4b5563'; ctx.fillRect(-8*S, -16*S, 16*S, 8*S);
                ctx.fillStyle = '#78350f'; ctx.fillRect(-2*S, -8*S, 4*S, 24*S);
            } else {
                // Sword
                ctx.fillStyle = '#9ca3af'; ctx.fillRect(-2*S, -45*S, 4*S, 45*S);
                ctx.fillStyle = '#d4a017'; ctx.fillRect(-8*S, -5*S, 16*S, 3*S);
                ctx.fillStyle = '#4b5563'; ctx.fillRect(-1.5*S, 0, 3*S, 10*S);
            }
            ctx.restore();
        }

        // Innkeeper mug
        if (type === 'innkeeper') {
            ctx.fillStyle = '#d97706'; ctx.fillRect(cx - bodyW*0.7, torsoTop + 24*S, 10*S, 12*S);
            ctx.fillStyle = '#fff'; ctx.fillRect(cx - bodyW*0.7, torsoTop + 20*S, 10*S, 4*S); // Foam
        }

        // Render specific emotions overriding base smile
        const eyeY = torsoTop - headR * 0.4;
        const eyeSpacing = headR * 0.4;

        if (emotion !== 'neutral') {
            // Overwrite face features area
            ctx.fillStyle = skin;
            ctx.beginPath();
            ctx.arc(cx, torsoTop - headR*0.35, headR*0.7, 0, Math.PI*2);
            ctx.fill();

            // Eyes per emotion
            ctx.fillStyle = '#1a0a0a';
            ctx.strokeStyle = '#1a0a0a';
            ctx.lineWidth = 2*S;
            ctx.lineCap = 'round';

            if (emotion === 'angry') {
                ctx.beginPath(); ctx.moveTo(cx - eyeSpacing - 5*S, eyeY - 4*S); ctx.lineTo(cx - eyeSpacing + 3*S, eyeY - 1*S); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(cx + eyeSpacing + 5*S, eyeY - 4*S); ctx.lineTo(cx + eyeSpacing - 3*S, eyeY - 1*S); ctx.stroke();
                ctx.beginPath(); ctx.arc(cx - eyeSpacing, eyeY, 3*S, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(cx + eyeSpacing, eyeY, 3*S, 0, Math.PI*2); ctx.fill();
            } else if (emotion === 'happy') {
                // Curved upward arcs
                ctx.beginPath(); ctx.arc(cx - eyeSpacing, eyeY + 1*S, 5*S, Math.PI, 0); ctx.stroke();
                ctx.beginPath(); ctx.arc(cx + eyeSpacing, eyeY + 1*S, 5*S, Math.PI, 0); ctx.stroke();
            } else if (emotion === 'sad') {
                // Curved downward arcs
                ctx.beginPath(); ctx.arc(cx - eyeSpacing, eyeY + 3*S, 4*S, 0, Math.PI, true); ctx.stroke();
                ctx.beginPath(); ctx.arc(cx + eyeSpacing, eyeY + 3*S, 4*S, 0, Math.PI, true); ctx.stroke();
            } else if (emotion === 'surprised') {
                // Wide circles
                ctx.beginPath(); ctx.arc(cx - eyeSpacing, eyeY, 4.5*S, 0, Math.PI*2); ctx.stroke();
                ctx.beginPath(); ctx.arc(cx + eyeSpacing, eyeY, 4.5*S, 0, Math.PI*2); ctx.stroke();
            } else if (emotion === 'wink') {
                ctx.beginPath(); ctx.arc(cx - eyeSpacing, eyeY, 3.5*S, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.moveTo(cx + eyeSpacing - 4*S, eyeY); ctx.lineTo(cx + eyeSpacing + 4*S, eyeY); ctx.stroke();
            }

            // Mouth per emotion
            if (emotion === 'happy') {
                ctx.fillStyle = '#991b1b';
                ctx.beginPath(); ctx.arc(cx, eyeY + headR*0.35, headR*0.25, 0, Math.PI); ctx.fill();
            } else if (emotion === 'sad') {
                ctx.beginPath(); ctx.arc(cx, eyeY + headR*0.45, headR*0.2, Math.PI, 0); ctx.stroke();
            } else if (emotion === 'angry') {
                ctx.beginPath(); ctx.moveTo(cx - 6*S, eyeY + headR*0.4); ctx.lineTo(cx + 6*S, eyeY + headR*0.4); ctx.stroke();
            } else if (emotion === 'surprised') {
                ctx.beginPath(); ctx.arc(cx, eyeY + headR*0.4, 5*S, 0, Math.PI*2); ctx.stroke();
            }
        }

        ctx.restore();
    }

    // ============================================================
    // CHARACTER DRAWING ENGINE
    // ============================================================


    /** Core humanoid body builder used by all character types */
    function drawHumanoidBase(cx, cy, skin, bodyCol, legCol, S, pixelated, opts = {}) {
        const {
            headR    = 28 * S,
            bodyH    = 56 * S,
            bodyW    = 32 * S,
            legH     = 40 * S,
            armW     = 12 * S,
            armH     = 44 * S,
        } = opts;

        const torsoTop = cy - headR - bodyH * 0.1;
        const torsoBot = torsoTop + bodyH;

        // Drop shadow
        drawDropShadow(cx, cy + legH + headR * 0.6, bodyW * 0.9, bodyW * 0.2, 0.4);

        // — LEGS — with knee cap detail
        const legW = bodyW * 0.38;
        // Left leg
        const leftLegGrad = ctx.createLinearGradient(cx - legW - 2*S, 0, cx, 0);
        leftLegGrad.addColorStop(0, darkenColor(legCol, 25));
        leftLegGrad.addColorStop(0.4, lightenColor(legCol, 15));
        leftLegGrad.addColorStop(1, darkenColor(legCol, 10));
        ctx.fillStyle = leftLegGrad;
        ctx.beginPath();
        ctx.roundRect(cx - legW - 2*S, torsoBot - 4*S, legW, legH, pixelated ? 0 : [3*S, 3*S, 5*S, 5*S]);
        ctx.fill();
        // Right leg
        const rightLegGrad = ctx.createLinearGradient(cx, 0, cx + legW + 2*S, 0);
        rightLegGrad.addColorStop(0, lightenColor(legCol, 15));
        rightLegGrad.addColorStop(0.6, darkenColor(legCol, 10));
        rightLegGrad.addColorStop(1, darkenColor(legCol, 30));
        ctx.fillStyle = rightLegGrad;
        ctx.beginPath();
        ctx.roundRect(cx + 2*S, torsoBot - 4*S, legW, legH, pixelated ? 0 : [3*S, 3*S, 5*S, 5*S]);
        ctx.fill();

        // Knee caps
        if (!pixelated) {
            const kneeY = torsoBot + legH * 0.42;
            ctx.fillStyle = lightenColor(legCol, 8);
            ctx.beginPath(); ctx.ellipse(cx - legW/2 - 2*S, kneeY, legW*0.35, legW*0.28, 0, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + legW/2 + 2*S, kneeY, legW*0.35, legW*0.28, 0, 0, Math.PI*2); ctx.fill();
            // Knee highlight
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.beginPath(); ctx.ellipse(cx - legW/2 - 2*S - legW*0.08, kneeY - legW*0.1, legW*0.15, legW*0.12, -0.3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + legW/2 + 2*S - legW*0.08, kneeY - legW*0.1, legW*0.15, legW*0.12, -0.3, 0, Math.PI*2); ctx.fill();
        }

        // Shoe/boot base
        ctx.fillStyle = darkenColor(legCol, 50);
        ctx.beginPath(); ctx.roundRect(cx - legW - 4*S, torsoBot + legH - 4*S, legW + 3*S, 6*S, pixelated ? 0 : [0, 0, 4*S, 4*S]); ctx.fill();
        ctx.beginPath(); ctx.roundRect(cx + 1*S, torsoBot + legH - 4*S, legW + 3*S, 6*S, pixelated ? 0 : [0, 0, 4*S, 4*S]); ctx.fill();

        // — TORSO — with muscle definition
        const torsoGrad = ctx.createLinearGradient(cx - bodyW/2, torsoTop, cx + bodyW/2, torsoBot);
        torsoGrad.addColorStop(0,   lightenColor(bodyCol, 40));
        torsoGrad.addColorStop(0.35, lightenColor(bodyCol, 10));
        torsoGrad.addColorStop(0.7, bodyCol);
        torsoGrad.addColorStop(1,   darkenColor(bodyCol, 40));
        ctx.fillStyle = torsoGrad;
        ctx.beginPath();
        ctx.roundRect(cx - bodyW/2, torsoTop, bodyW, bodyH, pixelated ? 0 : [8*S, 8*S, 4*S, 4*S]);
        ctx.fill();

        // Chest muscle highlight (pectoral lines)
        if (!pixelated) {
            const chestHL = ctx.createRadialGradient(cx - bodyW*0.15, torsoTop + bodyH*0.22, 0, cx - bodyW*0.15, torsoTop + bodyH*0.22, bodyW*0.42);
            chestHL.addColorStop(0, 'rgba(255,255,255,0.20)');
            chestHL.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = chestHL;
            ctx.beginPath();
            ctx.roundRect(cx - bodyW/2, torsoTop, bodyW, bodyH, 8*S);
            ctx.fill();

            // Pectoral division line
            ctx.strokeStyle = 'rgba(0,0,0,0.10)';
            ctx.lineWidth = 1.5*S;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx, torsoTop + 8*S);
            ctx.lineTo(cx, torsoTop + bodyH * 0.52);
            ctx.stroke();

            // Ab lines (horizontal)
            ctx.strokeStyle = 'rgba(0,0,0,0.08)';
            ctx.lineWidth = 1*S;
            [0.38, 0.52, 0.66].forEach(frac => {
                const y = torsoTop + bodyH * frac;
                ctx.beginPath();
                ctx.moveTo(cx - bodyW * 0.4, y);
                ctx.lineTo(cx + bodyW * 0.4, y);
                ctx.stroke();
            });
        }

        // — NECK —
        const neckW = headR * 0.45;
        const neckH = headR * 0.35;
        const neckGrad = ctx.createLinearGradient(cx - neckW, torsoTop - neckH, cx + neckW, torsoTop);
        neckGrad.addColorStop(0, darkenColor(skin, 10));
        neckGrad.addColorStop(1, skin);
        ctx.fillStyle = neckGrad;
        ctx.beginPath();
        ctx.roundRect(cx - neckW, torsoTop - neckH, neckW * 2, neckH + 2*S, pixelated ? 0 : 3*S);
        ctx.fill();

        // — ARMS — with shoulder roundness and hand
        const shoulderY = torsoTop + 4*S;
        // Left arm
        const leftArmGrad = ctx.createLinearGradient(cx - bodyW/2 - armW + 2*S, 0, cx - bodyW/2 + 2*S, 0);
        leftArmGrad.addColorStop(0, darkenColor(bodyCol, 20));
        leftArmGrad.addColorStop(0.5, lightenColor(bodyCol, 10));
        leftArmGrad.addColorStop(1, darkenColor(bodyCol, 5));
        ctx.fillStyle = leftArmGrad;
        ctx.beginPath();
        ctx.roundRect(cx - bodyW/2 - armW + 2*S, shoulderY, armW, armH, pixelated ? 0 : [6*S, 6*S, 5*S, 5*S]);
        ctx.fill();
        // Right arm
        const rightArmGrad = ctx.createLinearGradient(cx + bodyW/2 - 2*S, 0, cx + bodyW/2 - 2*S + armW, 0);
        rightArmGrad.addColorStop(0, lightenColor(bodyCol, 10));
        rightArmGrad.addColorStop(0.5, bodyCol);
        rightArmGrad.addColorStop(1, darkenColor(bodyCol, 25));
        ctx.fillStyle = rightArmGrad;
        ctx.beginPath();
        ctx.roundRect(cx + bodyW/2 - 2*S, shoulderY, armW, armH, pixelated ? 0 : [6*S, 6*S, 5*S, 5*S]);
        ctx.fill();

        // Shoulder sphere overlay for roundness
        if (!pixelated) {
            const lSh = ctx.createRadialGradient(cx - bodyW/2 - armW*0.1, shoulderY + armW*0.3, 0, cx - bodyW/2 - armW*0.1, shoulderY + armW*0.3, armW*0.6);
            lSh.addColorStop(0, 'rgba(255,255,255,0.18)');
            lSh.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = lSh;
            ctx.beginPath(); ctx.arc(cx - bodyW/2 - armW*0.1, shoulderY + armW*0.3, armW*0.6, 0, Math.PI*2); ctx.fill();
            const rSh = ctx.createRadialGradient(cx + bodyW/2 + armW*0.1, shoulderY + armW*0.3, 0, cx + bodyW/2 + armW*0.1, shoulderY + armW*0.3, armW*0.6);
            rSh.addColorStop(0, 'rgba(255,255,255,0.18)');
            rSh.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = rSh;
            ctx.beginPath(); ctx.arc(cx + bodyW/2 + armW*0.1, shoulderY + armW*0.3, armW*0.6, 0, Math.PI*2); ctx.fill();
        }

        // Hands (simple mitten shapes at end of arms)
        const handY = shoulderY + armH - 2*S;
        ctx.fillStyle = skin;
        // Left hand
        ctx.beginPath();
        ctx.ellipse(cx - bodyW/2 - armW/2 + 2*S, handY + armW * 0.45, armW*0.5, armW*0.45, 0, 0, Math.PI*2);
        ctx.fill();
        // Right hand
        ctx.beginPath();
        ctx.ellipse(cx + bodyW/2 + armW/2 - 2*S, handY + armW * 0.45, armW*0.5, armW*0.45, 0, 0, Math.PI*2);
        ctx.fill();

        // — HEAD — with proper proportions
        const headY = torsoTop - headR * 0.5;
        const headGrad = ctx.createRadialGradient(cx - headR*0.2, headY - headR*0.3, headR*0.1, cx, headY, headR * 1.05);
        headGrad.addColorStop(0, lightenColor(skin, 25));
        headGrad.addColorStop(0.5, skin);
        headGrad.addColorStop(0.85, darkenColor(skin, 15));
        headGrad.addColorStop(1, darkenColor(skin, 30));
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        // Slightly ovoid head (wider at cheeks)
        ctx.ellipse(cx, headY, headR * 1.02, headR, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ears
        if (!pixelated) {
            const earY = headY;
            const earW = headR * 0.18;
            const earH = headR * 0.28;
            ctx.fillStyle = darkenColor(skin, 8);
            // Left ear
            ctx.beginPath(); ctx.ellipse(cx - headR * 0.95, earY, earW, earH, 0, 0, Math.PI * 2); ctx.fill();
            // Right ear
            ctx.beginPath(); ctx.ellipse(cx + headR * 0.95, earY, earW, earH, 0, 0, Math.PI * 2); ctx.fill();
            // Inner ear
            ctx.fillStyle = darkenColor(skin, 20);
            ctx.beginPath(); ctx.ellipse(cx - headR * 0.95, earY + earH*0.05, earW * 0.55, earH * 0.5, 0.2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + headR * 0.95, earY + earH*0.05, earW * 0.55, earH * 0.5, -0.2, 0, Math.PI * 2); ctx.fill();
        }

        // Eyebrow ridge (subtle forehead shadow)
        if (!pixelated) {
            ctx.fillStyle = darkenColor(skin, 12);
            ctx.beginPath();
            ctx.ellipse(cx, headY - headR * 0.28, headR * 0.9, headR * 0.18, 0, Math.PI, 0);
            ctx.fill();
        }

        // Eyes with iris
        const eyeY = headY - headR * 0.12;
        const eyeSpacing = headR * 0.38;
        const eyeR = headR * 0.16;
        // Eye whites
        ctx.fillStyle = '#f8f4ef';
        ctx.beginPath(); ctx.ellipse(cx - eyeSpacing, eyeY, eyeR * 1.3, eyeR, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + eyeSpacing, eyeY, eyeR * 1.3, eyeR, 0, 0, Math.PI * 2); ctx.fill();
        // Iris
        ctx.fillStyle = '#3b2e1e';
        ctx.beginPath(); ctx.arc(cx - eyeSpacing, eyeY, eyeR * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + eyeSpacing, eyeY, eyeR * 0.8, 0, Math.PI * 2); ctx.fill();
        // Pupil
        ctx.fillStyle = '#0a0806';
        ctx.beginPath(); ctx.arc(cx - eyeSpacing, eyeY, eyeR * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + eyeSpacing, eyeY, eyeR * 0.45, 0, Math.PI * 2); ctx.fill();
        // Eye shine
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.arc(cx - eyeSpacing + eyeR*0.35, eyeY - eyeR*0.3, eyeR*0.35, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + eyeSpacing + eyeR*0.35, eyeY - eyeR*0.3, eyeR*0.35, 0, Math.PI * 2); ctx.fill();

        // Eyebrows
        ctx.fillStyle = darkenColor(skin, 50);
        ctx.beginPath();
        ctx.ellipse(cx - eyeSpacing, eyeY - eyeR * 1.5, eyeR * 1.2, eyeR * 0.35, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + eyeSpacing, eyeY - eyeR * 1.5, eyeR * 1.2, eyeR * 0.35, -0.15, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        if (!pixelated) {
            const noseY = eyeY + headR * 0.32;
            const noseW = headR * 0.18;
            ctx.fillStyle = darkenColor(skin, 18);
            // Nose tip
            ctx.beginPath(); ctx.ellipse(cx, noseY, noseW * 0.6, noseW * 0.4, 0, 0, Math.PI * 2); ctx.fill();
            // Nose bridge (subtle line)
            ctx.strokeStyle = darkenColor(skin, 12);
            ctx.lineWidth = 1.2*S;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(cx, eyeY + eyeR);
            ctx.quadraticCurveTo(cx + noseW*0.3, noseY - noseW*0.5, cx, noseY);
            ctx.stroke();
            // Nostrils
            ctx.fillStyle = darkenColor(skin, 28);
            ctx.beginPath(); ctx.ellipse(cx - noseW*0.5, noseY + noseW*0.1, noseW*0.28, noseW*0.2, 0.3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx + noseW*0.5, noseY + noseW*0.1, noseW*0.28, noseW*0.2, -0.3, 0, Math.PI*2); ctx.fill();
        }

        // Mouth / Smile
        const mouthY = headY + headR * 0.42;
        ctx.strokeStyle = darkenColor(skin, 35);
        ctx.lineWidth = pixelated ? Math.max(1, S) : 2*S;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - headR * 0.24, mouthY);
        ctx.quadraticCurveTo(cx, mouthY + headR * 0.10, cx + headR * 0.24, mouthY);
        ctx.stroke();

        // Lip line (upper)
        if (!pixelated) {
            ctx.strokeStyle = darkenColor(skin, 25);
            ctx.lineWidth = 1.2*S;
            ctx.beginPath();
            ctx.moveTo(cx - headR * 0.22, mouthY);
            ctx.quadraticCurveTo(cx - headR * 0.08, mouthY - headR * 0.045, cx, mouthY - headR * 0.035);
            ctx.quadraticCurveTo(cx + headR * 0.08, mouthY - headR * 0.045, cx + headR * 0.22, mouthY);
            ctx.stroke();
        }

        return { torsoTop, torsoBot, headR, bodyW, armW };
    }

    function parseColor(col) {
        if (!col) return { r: 128, g: 128, b: 128 };
        col = col.trim();
        // Handle rgb/rgba formats
        if (col.startsWith('rgb')) {
            const matches = col.match(/\d+/g);
            if (matches && matches.length >= 3) {
                return {
                    r: parseInt(matches[0]),
                    g: parseInt(matches[1]),
                    b: parseInt(matches[2])
                };
            }
        }
        // Handle hex formats
        if (col.startsWith('#')) {
            let hex = col.slice(1);
            if (hex.length === 3) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            return {
                r: parseInt(hex.slice(0, 2), 16) || 0,
                g: parseInt(hex.slice(2, 4), 16) || 0,
                b: parseInt(hex.slice(4, 6), 16) || 0
            };
        }
        // Named colors or fallback
        return { r: 128, g: 128, b: 128 };
    }

    function lightenColor(col, amount) {
        const { r, g, b } = parseColor(col);
        return `rgb(${Math.min(255, r + amount)},${Math.min(255, g + amount)},${Math.min(255, b + amount)})`;
    }
    
    function darkenColor(col, amount) {
        const { r, g, b } = parseColor(col);
        return `rgb(${Math.max(0, r - amount)},${Math.max(0, g - amount)},${Math.max(0, b - amount)})`;
    }
    /** Safely replace the alpha channel in an rgba() string e.g. glowAlpha(glow, 0.8) */
    function glowAlpha(rgbaStr, alpha) {
        if (!rgbaStr) return `rgba(168,85,247,${alpha})`;
        const parts = rgbaStr.split(',');
        if (parts.length >= 4) {
            parts[3] = ' ' + alpha + ')';
            return parts.join(',');
        }
        return rgbaStr;
    }

    // ─── WARRIOR ───────────────────────────────────────────────────────────
    function drawCharacterWarrior(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';

        // Background glow aura
        drawGlowHalo(cx, cy, 80*S, glow, 2);

        const skin = '#e8b89a';
        const armor = base;
        const plate = acc;
        const pants = darkenColor(base, 60);

        // Draw base humanoid
        const { torsoTop, torsoBot, headR, bodyW, armW } = drawHumanoidBase(cx, cy - 20*S, skin, armor, pants, S, px, {
            bodyH: 58*S, bodyW: 36*S
        });

        // Shoulder plates (pauldrons)
        const shoulderR = 14*S;
        ctx.fillStyle = plate;
        ctx.beginPath(); ctx.ellipse(cx - bodyW/2 - armW/2 + 2*S, torsoTop + 4*S, shoulderR, shoulderR*0.7, -0.3, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + bodyW/2 + armW/2 - 2*S, torsoTop + 4*S, shoulderR, shoulderR*0.7, 0.3, 0, Math.PI*2); ctx.fill();
        // Shoulder edge
        ctx.strokeStyle = lightenColor(plate, 30); ctx.lineWidth = 1.5*S;
        ctx.beginPath(); ctx.ellipse(cx - bodyW/2 - armW/2 + 2*S, torsoTop + 4*S, shoulderR, shoulderR*0.7, -0.3, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx + bodyW/2 + armW/2 - 2*S, torsoTop + 4*S, shoulderR, shoulderR*0.7, 0.3, 0, Math.PI*2); ctx.stroke();

        // Chest cross-plate
        ctx.strokeStyle = lightenColor(armor, 40); ctx.lineWidth = 2*S;
        ctx.beginPath(); ctx.moveTo(cx, torsoTop + 8*S); ctx.lineTo(cx, torsoBot - 8*S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - bodyW*0.3, torsoTop + bodyW*0.4); ctx.lineTo(cx + bodyW*0.3, torsoTop + bodyW*0.4); ctx.stroke();

        // Belt
        ctx.fillStyle = darkenColor(base, 80);
        ctx.fillRect(cx - bodyW/2 - 1*S, torsoBot - 12*S, bodyW + 2*S, 8*S);
        ctx.fillStyle = '#d4a017';
        ctx.fillRect(cx - 5*S, torsoBot - 12*S, 10*S, 8*S);

        // Helmet
        const helmetCol = plate;
        ctx.fillStyle = helmetCol;
        ctx.beginPath();
        ctx.ellipse(cx, torsoTop - headR*0.5 - headR*0.4, headR*1.15, headR*0.85, 0, Math.PI, 0);
        ctx.fill();
        // Visor slit
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(cx - headR*0.55, torsoTop - headR*0.6, headR*1.1, headR*0.22);
        // Helmet highlight
        drawSpecular(cx - headR*0.2, torsoTop - headR*1.1, headR*0.5, 0.35);
        // Plume
        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3*S; ctx.lineCap = 'round';
        for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(cx + i*4*S, torsoTop - headR*1.4);
            ctx.quadraticCurveTo(cx + i*6*S - 4*S, torsoTop - headR*2.2, cx + i*8*S - 2*S, torsoTop - headR*1.8);
            ctx.stroke();
        }

        // Sword in right hand
        ctx.save();
        ctx.translate(cx + bodyW/2 + armW + 6*S, torsoTop + 40*S);
        ctx.rotate(-0.35);
        // Blade
        const bladeGrad = ctx.createLinearGradient(-4*S, 0, 4*S, -60*S);
        bladeGrad.addColorStop(0, '#9ca3af'); bladeGrad.addColorStop(0.5, '#f3f4f6'); bladeGrad.addColorStop(1, '#d1d5db');
        ctx.fillStyle = bladeGrad;
        ctx.beginPath(); ctx.moveTo(-4*S, 0); ctx.lineTo(4*S, 0); ctx.lineTo(1*S, -62*S); ctx.lineTo(-1*S, -62*S); ctx.closePath(); ctx.fill();
        // Guard
        ctx.fillStyle = '#d4a017';
        ctx.fillRect(-10*S, -6*S, 20*S, 4*S);
        // Handle
        ctx.fillStyle = '#7c3a00';
        ctx.fillRect(-3*S, -4*S, 6*S, 18*S);
        ctx.restore();

        ctx.restore();
    }

    // ─── MAGE ──────────────────────────────────────────────────────────────
    function drawCharacterMage(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';

        drawGlowHalo(cx, cy, 90*S, glow, 3);

        const skin = '#f0d0b0';
        const robe = base;
        const trim = acc;

        // Draw base with wide robe
        const { torsoTop, torsoBot, headR, bodyW } = drawHumanoidBase(cx, cy - 15*S, skin, robe, darkenColor(robe, 50), S, px, {
            bodyH: 70*S, bodyW: 38*S, legH: 28*S
        });

        // Robe bottom flare
        ctx.fillStyle = darkenColor(robe, 20);
        ctx.beginPath();
        ctx.moveTo(cx - bodyW/2 - 8*S, torsoBot - 4*S);
        ctx.lineTo(cx - bodyW*0.8, torsoBot + 28*S);
        ctx.lineTo(cx + bodyW*0.8, torsoBot + 28*S);
        ctx.lineTo(cx + bodyW/2 + 8*S, torsoBot - 4*S);
        ctx.closePath(); ctx.fill();

        // Robe trim details
        ctx.strokeStyle = trim; ctx.lineWidth = 3*S;
        // Collar trim
        ctx.beginPath(); ctx.arc(cx, torsoTop + 6*S, 10*S, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        // Vertical trim lines
        ctx.strokeStyle = lightenColor(trim, 20); ctx.lineWidth = 1.5*S;
        ctx.beginPath(); ctx.moveTo(cx, torsoTop); ctx.lineTo(cx, torsoBot + 28*S); ctx.stroke();

        // Glowing rune symbol on chest
        ctx.fillStyle = glowAlpha(glow, 0.8);
        ctx.font = `bold ${18*S}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText('✦', cx, torsoTop + bodyW * 0.55);

        // Pointed hat
        ctx.fillStyle = robe;
        ctx.beginPath();
        ctx.moveTo(cx, torsoTop - headR * 2.5);
        ctx.lineTo(cx - headR * 1.2, torsoTop - headR * 0.3);
        ctx.lineTo(cx + headR * 1.2, torsoTop - headR * 0.3);
        ctx.closePath(); ctx.fill();
        // Hat brim
        ctx.fillStyle = darkenColor(robe, 30);
        ctx.beginPath(); ctx.ellipse(cx, torsoTop - headR * 0.3, headR * 1.5, 5*S, 0, 0, Math.PI*2); ctx.fill();
        // Hat band
        ctx.strokeStyle = trim; ctx.lineWidth = 3*S;
        ctx.beginPath(); ctx.moveTo(cx - headR * 1.0, torsoTop - headR * 0.8); ctx.lineTo(cx + headR * 1.0, torsoTop - headR * 0.8); ctx.stroke();

        // Staff in left hand
        ctx.save();
        ctx.translate(cx - bodyW/2 - 14*S, torsoTop - 10*S);
        // Staff pole
        const staffGrad = ctx.createLinearGradient(-3*S, 0, 3*S, 100*S);
        staffGrad.addColorStop(0, '#6b3a00'); staffGrad.addColorStop(0.5, '#a05a00'); staffGrad.addColorStop(1, '#6b3a00');
        ctx.fillStyle = staffGrad;
        ctx.fillRect(-3*S, 0, 6*S, 100*S);
        // Orb on top
        drawGlowHalo(0, -12*S, 18*S, glow, 2);
        const orbG = ctx.createRadialGradient(-4*S, -16*S, 2*S, 0, -12*S, 14*S);
        orbG.addColorStop(0, 'white'); orbG.addColorStop(0.3, lightenColor(base, 40)); orbG.addColorStop(1, base);
        ctx.fillStyle = orbG;
        ctx.beginPath(); ctx.arc(0, -12*S, 13*S, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    // ─── ROGUE ─────────────────────────────────────────────────────────────
    function drawCharacterRogue(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';

        const skin = '#c8966a';
        const leather = '#3d2b1f';
        const cloak = base;

        const { torsoTop, torsoBot, headR, bodyW, armW } = drawHumanoidBase(cx, cy - 20*S, skin, leather, '#2a1a0f', S, px, {
            bodyH: 55*S, bodyW: 30*S
        });

        // Hood / mask
        ctx.fillStyle = cloak;
        ctx.beginPath();
        ctx.ellipse(cx, torsoTop - headR*0.55, headR*1.1, headR*1.05, 0, 0, Math.PI*2);
        ctx.fill();
        // Face visible (lower half only)
        ctx.fillStyle = skin;
        ctx.beginPath();
        ctx.ellipse(cx, torsoTop - headR*0.3, headR*0.75, headR*0.55, 0, 0, Math.PI);
        ctx.fill();
        // Mask slit
        ctx.fillStyle = '#000';
        ctx.fillRect(cx - headR*0.55, torsoTop - headR*0.72, headR*1.1, headR*0.25);

        // Cloak behind
        ctx.fillStyle = darkenColor(cloak, 30);
        ctx.beginPath();
        ctx.moveTo(cx - bodyW*0.8, torsoTop + 8*S);
        ctx.quadraticCurveTo(cx - bodyW*1.4, torsoBot + 20*S, cx - bodyW*0.5, torsoBot + 35*S);
        ctx.lineTo(cx + bodyW*0.5, torsoBot + 35*S);
        ctx.quadraticCurveTo(cx + bodyW*1.4, torsoBot + 20*S, cx + bodyW*0.8, torsoTop + 8*S);
        ctx.fill();

        // Two daggers (crossed) on back
        ctx.save();
        ctx.translate(cx, torsoTop + 20*S);
        // Dagger 1
        ctx.save(); ctx.rotate(0.35);
        ctx.fillStyle = '#9ca3af'; ctx.fillRect(-2*S, -30*S, 4*S, 30*S);
        ctx.fillStyle = '#7c5c00'; ctx.fillRect(-3*S, 0, 6*S, 10*S);
        ctx.restore();
        // Dagger 2
        ctx.save(); ctx.rotate(-0.35);
        ctx.fillStyle = '#9ca3af'; ctx.fillRect(-2*S, -30*S, 4*S, 30*S);
        ctx.fillStyle = '#7c5c00'; ctx.fillRect(-3*S, 0, 6*S, 10*S);
        ctx.restore();
        ctx.restore();

        // Belt with pouches
        ctx.fillStyle = '#4a3828'; ctx.fillRect(cx - bodyW/2 - 1*S, torsoBot - 10*S, bodyW + 2*S, 6*S);
        ctx.fillStyle = '#3d2b1f'; ctx.fillRect(cx - 12*S, torsoBot - 11*S, 9*S, 8*S);
        ctx.fillStyle = '#3d2b1f'; ctx.fillRect(cx + 3*S,  torsoBot - 11*S, 9*S, 8*S);

        ctx.restore();
    }

    // ─── HEALER ────────────────────────────────────────────────────────────
    function drawCharacterHealer(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';

        drawGlowHalo(cx, cy, 85*S, 'rgba(200,255,200,0.4)', 2);

        const skin = '#f5deb3';
        const robe = '#f0f0f0';
        const cross = base;

        const { torsoTop, torsoBot, headR, bodyW } = drawHumanoidBase(cx, cy - 15*S, skin, robe, '#d0d0d0', S, px, {
            bodyH: 68*S, bodyW: 36*S, legH: 25*S
        });

        // Cross symbol on chest
        ctx.fillStyle = cross;
        const cxc = cx, cyc = torsoTop + bodyW * 0.4;
        ctx.fillRect(cxc - 3*S, cyc - 12*S, 6*S, 22*S);
        ctx.fillRect(cxc - 10*S, cyc - 4*S, 20*S, 6*S);

        // Gold halo
        ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 3*S;
        ctx.setLineDash([4*S, 3*S]);
        ctx.beginPath(); ctx.arc(cx, torsoTop - headR*1.1, headR*1.3, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);

        // Healing staff (scepter with cross)
        ctx.save();
        ctx.translate(cx + bodyW/2 + 10*S, torsoTop - 10*S);
        ctx.fillStyle = '#d4a017'; ctx.fillRect(-3*S, 0, 6*S, 90*S);
        ctx.fillRect(-10*S, 12*S, 20*S, 5*S);
        // Glow on tip
        drawGlowHalo(0, 0, 14*S, 'rgba(200,255,200,0.5)', 2);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 8*S, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    // ============================================================
    // CREATURE DRAWING ENGINE
    // ============================================================

    // ─── SLIME ─────────────────────────────────────────────────────────────
    function drawCreatureSlime(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;

        drawGlowHalo(cx, cy + 10*S, 75*S, glow, 3);
        drawDropShadow(cx, cy + 55*S, 55*S, 15*S, 0.4);

        // Main slime body (translucent blob)
        const blobG = ctx.createRadialGradient(cx - 15*S, cy - 10*S, 5*S, cx, cy + 10*S, 60*S);
        blobG.addColorStop(0, lightenColor(base, 60) + 'cc');
        blobG.addColorStop(0.5, base + 'bb');
        blobG.addColorStop(1, darkenColor(base, 40) + 'aa');
        ctx.fillStyle = blobG;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 15*S, 58*S, 48*S, 0, 0, Math.PI*2);
        ctx.fill();

        // Inner nucleus
        const nucG = ctx.createRadialGradient(cx, cy + 10*S, 5*S, cx, cy + 10*S, 28*S);
        nucG.addColorStop(0, lightenColor(base, 40) + 'aa');
        nucG.addColorStop(1, 'transparent');
        ctx.fillStyle = nucG;
        ctx.beginPath(); ctx.ellipse(cx, cy + 10*S, 28*S, 22*S, 0, 0, Math.PI*2); ctx.fill();

        // Drip on top
        ctx.fillStyle = base + 'cc';
        ctx.beginPath();
        ctx.moveTo(cx - 8*S, cy - 30*S);
        ctx.quadraticCurveTo(cx, cy - 48*S, cx + 8*S, cy - 30*S);
        ctx.quadraticCurveTo(cx + 4*S, cy - 20*S, cx, cy - 33*S);
        ctx.fill();

        // Eyes (white + pupil)
        const eyeY = cy + 2*S;
        [-18*S, 18*S].forEach(ex => {
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.ellipse(cx + ex, eyeY, 10*S, 12*S, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.ellipse(cx + ex + 2*S, eyeY + 1*S, 5*S, 7*S, 0.3, 0, Math.PI*2); ctx.fill();
            // Shine
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.beginPath(); ctx.arc(cx + ex + 3*S, eyeY - 3*S, 2.5*S, 0, Math.PI*2); ctx.fill();
        });

        // Shine highlight on body
        drawSpecular(cx - 15*S, cy - 10*S, 30*S, 0.3);

        // Small bubbles inside
        [[cx-20*S, cy+30*S,4*S],[cx+25*S,cy+25*S,3*S],[cx+5*S,cy+38*S,2.5*S]].forEach(([bx,by,br]) => {
            ctx.strokeStyle = lightenColor(base,50)+'88'; ctx.lineWidth = 1.5*S;
            ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2); ctx.stroke();
        });
        ctx.restore();
    }

    // ─── GOBLIN ────────────────────────────────────────────────────────────
    function drawCreatureGoblin(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';

        const skin = '#4ade80';
        const leather = '#5c3d11';

        drawDropShadow(cx, cy + 60*S, 40*S, 12*S, 0.4);

        // Short legs
        ctx.fillStyle = '#3a2508';
        ctx.beginPath(); ctx.roundRect(cx - 18*S, cy + 22*S, 14*S, 34*S, px?0:4*S); ctx.fill();
        ctx.beginPath(); ctx.roundRect(cx + 4*S, cy + 22*S, 14*S, 34*S, px?0:4*S); ctx.fill();

        // Tattered vest/body
        const torsoG = ctx.createLinearGradient(cx-20*S, cy-10*S, cx+20*S, cy+30*S);
        torsoG.addColorStop(0, leather); torsoG.addColorStop(1, darkenColor(leather, 30));
        ctx.fillStyle = torsoG;
        ctx.beginPath(); ctx.roundRect(cx - 20*S, cy - 12*S, 40*S, 36*S, px?0:6*S); ctx.fill();

        // Arms (skinny, reaching forward)
        ctx.fillStyle = skin;
        // Left arm
        ctx.beginPath(); ctx.roundRect(cx - 32*S, cy - 6*S, 13*S, 32*S, px?0:5*S); ctx.fill();
        // Right arm
        ctx.beginPath(); ctx.roundRect(cx + 19*S, cy - 6*S, 13*S, 32*S, px?0:5*S); ctx.fill();

        // Clawed hands
        [[-26*S, cy+26*S],[cx+25*S, cy+26*S]].forEach(([hx, hy]) => {
            ctx.fillStyle = darkenColor(skin, 20);
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath(); ctx.ellipse(hx + i*4*S, hy, 3*S, 6*S, i*0.2, 0, Math.PI*2); ctx.fill();
            }
        });

        // Big goblin head
        const headG = ctx.createRadialGradient(cx-8*S, cy-40*S, 4*S, cx, cy-28*S, 28*S);
        headG.addColorStop(0, lightenColor(skin, 20)); headG.addColorStop(1, skin);
        ctx.fillStyle = headG;
        ctx.beginPath(); ctx.ellipse(cx, cy - 28*S, 26*S, 24*S, 0, 0, Math.PI*2); ctx.fill();

        // Big ears
        ctx.fillStyle = darkenColor(skin, 15);
        ctx.beginPath(); ctx.ellipse(cx - 28*S, cy - 28*S, 10*S, 7*S, -0.4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 28*S, cy - 28*S, 10*S, 7*S, 0.4, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = lightenColor(skin, 15);
        ctx.beginPath(); ctx.ellipse(cx - 28*S, cy - 28*S, 6*S, 4*S, -0.4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 28*S, cy - 28*S, 6*S, 4*S, 0.4, 0, Math.PI*2); ctx.fill();

        // Eyes (evil yellow)
        [-10*S, 10*S].forEach(ex => {
            ctx.fillStyle = '#facc15';
            ctx.beginPath(); ctx.ellipse(cx + ex, cy - 26*S, 7*S, 6*S, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath(); ctx.ellipse(cx + ex, cy - 26*S, 3*S, 5*S, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath(); ctx.arc(cx + ex + 2*S, cy - 28*S, 2*S, 0, Math.PI*2); ctx.fill();
        });

        // Nose
        ctx.fillStyle = darkenColor(skin, 25);
        ctx.beginPath(); ctx.ellipse(cx, cy - 18*S, 5*S, 4*S, 0, 0, Math.PI*2); ctx.fill();

        // Grin with teeth
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx, cy - 10*S, 10*S, 0.1, Math.PI - 0.1); ctx.fill();
        ctx.fillStyle = '#f8f8f8';
        for (let i = -2; i <= 2; i++) {
            ctx.fillRect(cx + i*4*S - 2*S, cy - 20*S, 3*S, 6*S);
        }

        // Crude club weapon
        ctx.save();
        ctx.translate(cx + 26*S, cy - 5*S);
        ctx.rotate(0.4);
        ctx.fillStyle = '#5c4033'; ctx.fillRect(-3*S, -50*S, 6*S, 55*S);
        ctx.fillStyle = '#3d2b1f';
        ctx.beginPath(); ctx.ellipse(0, -48*S, 10*S, 8*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        ctx.restore();
    }

    // ─── SKELETON ──────────────────────────────────────────────────────────
    function drawCreatureSkeleton(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';

        drawDropShadow(cx, cy + 65*S, 35*S, 10*S, 0.35);

        const bone = '#e8e0c8';
        const joint = '#c8c0a0';
        const dark = '#333';

        // Legs (bones with joints)
        [[-12*S],[12*S]].forEach(([lx]) => {
            ctx.strokeStyle = bone; ctx.lineWidth = 7*S; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(cx + lx, cy + 20*S); ctx.lineTo(cx + lx, cy + 55*S); ctx.stroke();
            ctx.fillStyle = joint;
            ctx.beginPath(); ctx.arc(cx + lx, cy + 20*S, 5*S, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + lx, cy + 55*S, 5*S, 0, Math.PI*2); ctx.fill();
        });

        // Pelvis
        ctx.strokeStyle = bone; ctx.lineWidth = 7*S;
        ctx.beginPath(); ctx.moveTo(cx - 16*S, cy + 20*S); ctx.lineTo(cx + 16*S, cy + 20*S); ctx.stroke();

        // Spine
        ctx.beginPath(); ctx.moveTo(cx, cy + 20*S); ctx.lineTo(cx, cy - 30*S); ctx.stroke();

        // Ribcage
        ctx.strokeStyle = bone; ctx.lineWidth = 4*S;
        for (let r = 0; r < 4; r++) {
            const ry = cy - 5*S - r*10*S;
            const rw = (18 - r*2)*S;
            ctx.beginPath(); ctx.ellipse(cx, ry, rw, 8*S, 0, 0, Math.PI*2); ctx.stroke();
        }

        // Arms (bones)
        [[-1,cx - 28*S],[1,cx + 22*S]].forEach(([dir, ax]) => {
            ctx.strokeStyle = bone; ctx.lineWidth = 6*S; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(ax + 6*dir*S, cy - 25*S); ctx.lineTo(ax, cy + 10*S); ctx.stroke();
            ctx.fillStyle = joint;
            ctx.beginPath(); ctx.arc(ax + 6*dir*S, cy - 25*S, 4*S, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(ax, cy + 10*S, 4*S, 0, Math.PI*2); ctx.fill();
            // Hand fingers
            for (let f = 0; f < 3; f++) {
                ctx.strokeStyle = bone; ctx.lineWidth = 2.5*S;
                ctx.beginPath(); ctx.moveTo(ax + (f-1)*4*S, cy + 10*S); ctx.lineTo(ax + (f-1)*5*S, cy + 24*S); ctx.stroke();
            }
        });

        // Collarbone
        ctx.strokeStyle = bone; ctx.lineWidth = 6*S;
        ctx.beginPath(); ctx.moveTo(cx - 22*S, cy - 25*S); ctx.lineTo(cx + 22*S, cy - 25*S); ctx.stroke();

        // Skull
        const skullG = ctx.createRadialGradient(cx - 6*S, cy - 60*S, 4*S, cx, cy - 52*S, 24*S);
        skullG.addColorStop(0, '#fff8e8'); skullG.addColorStop(1, bone);
        ctx.fillStyle = skullG;
        ctx.beginPath(); ctx.ellipse(cx, cy - 52*S, 23*S, 22*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = joint; ctx.lineWidth = 1.5*S;
        ctx.beginPath(); ctx.ellipse(cx, cy - 52*S, 23*S, 22*S, 0, 0, Math.PI*2); ctx.stroke();

        // Eye sockets
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.ellipse(cx - 9*S, cy - 54*S, 7*S, 7*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 9*S, cy - 54*S, 7*S, 7*S, 0, 0, Math.PI*2); ctx.fill();
        // Glow in eyes
        const eyeGlow = glowAlpha(glow, 0.9);
        ctx.fillStyle = eyeGlow;
        ctx.beginPath(); ctx.arc(cx - 9*S, cy - 54*S, 4*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 9*S, cy - 54*S, 4*S, 0, Math.PI*2); ctx.fill();

        // Nasal cavity
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.moveTo(cx, cy - 44*S); ctx.lineTo(cx - 3*S, cy - 40*S); ctx.lineTo(cx + 3*S, cy - 40*S); ctx.closePath(); ctx.fill();

        // Jaw / teeth
        ctx.fillStyle = joint;
        ctx.beginPath(); ctx.ellipse(cx, cy - 36*S, 14*S, 8*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff8e8';
        for (let t = -2; t <= 2; t++) {
            ctx.fillRect(cx + t*5*S - 2*S, cy - 43*S, 3*S, 7*S);
        }

        // Rusty sword
        ctx.save(); ctx.translate(cx + 26*S, cy - 10*S); ctx.rotate(-0.2);
        ctx.fillStyle = '#7a6a5a'; ctx.beginPath(); ctx.moveTo(-3*S,0); ctx.lineTo(3*S,0); ctx.lineTo(1*S,-56*S); ctx.lineTo(-1*S,-56*S); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#5c3a00'; ctx.fillRect(-9*S,-5*S,18*S,4*S);
        ctx.fillStyle = '#4a2a00'; ctx.fillRect(-2.5*S,-3*S,5*S,16*S);
        ctx.restore();

        ctx.restore();
    }

    // ─── DRAGON ────────────────────────────────────────────────────────────
    function drawCreatureDragon(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;

        drawGlowHalo(cx, cy, 100*S, glow, 4);
        drawDropShadow(cx, cy + 80*S, 75*S, 20*S, 0.5);

        const scale = base;
        const belly = lightenColor(acc, 30);
        const wing = darkenColor(base, 20);

        // Wings (behind body)
        [[-1, cx-45*S],[1, cx+45*S]].forEach(([dir, wx]) => {
            const wGrad = ctx.createLinearGradient(wx, cy - 60*S, cx, cy);
            wGrad.addColorStop(0, wing + 'cc'); wGrad.addColorStop(1, darkenColor(wing,40) + '88');
            ctx.fillStyle = wGrad;
            ctx.beginPath();
            ctx.moveTo(cx + dir*20*S, cy - 20*S);
            ctx.quadraticCurveTo(wx - dir*20*S, cy - 80*S, wx - dir*30*S, cy - 55*S);
            ctx.quadraticCurveTo(wx, cy - 30*S, cx + dir*22*S, cy + 20*S);
            ctx.closePath(); ctx.fill();
            // Wing membrane ribs
            ctx.strokeStyle = darkenColor(wing,50)+'aa'; ctx.lineWidth = 2*S;
            for (let i = 0; i < 3; i++) {
                const t = (i+1)/4;
                ctx.beginPath();
                ctx.moveTo(cx + dir*20*S, cy - 20*S + t*40*S);
                ctx.quadraticCurveTo(wx - dir*(20-i*5)*S, cy - (80-t*60)*S, wx - dir*30*S, cy - 55*S + i*10*S);
                ctx.stroke();
            }
        });

        // Tail
        ctx.strokeStyle = scale; ctx.lineWidth = 16*S; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + 30*S, cy + 30*S);
        ctx.quadraticCurveTo(cx + 80*S, cy + 60*S, cx + 90*S, cy + 20*S);
        ctx.stroke();
        ctx.lineWidth = 8*S;
        ctx.beginPath();
        ctx.moveTo(cx + 80*S, cy + 60*S);
        ctx.lineTo(cx + 100*S, cy + 15*S);
        ctx.stroke();

        // Body
        const bodyG = ctx.createRadialGradient(cx-20*S, cy-10*S, 10*S, cx, cy+10*S, 65*S);
        bodyG.addColorStop(0, lightenColor(scale,30)); bodyG.addColorStop(0.6, scale); bodyG.addColorStop(1, darkenColor(scale,30));
        ctx.fillStyle = bodyG;
        ctx.beginPath(); ctx.ellipse(cx, cy + 10*S, 50*S, 55*S, 0, 0, Math.PI*2); ctx.fill();

        // Belly plates
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(cx, cy + 20*S, 28*S, 40*S, 0, 0, Math.PI*2); ctx.fill();
        // Belly lines
        ctx.strokeStyle = darkenColor(belly, 20); ctx.lineWidth = 1.5*S;
        for (let i = 0; i < 5; i++) {
            ctx.beginPath(); ctx.ellipse(cx, cy + 5*S + i*12*S, 25*S - i*2*S, 5*S, 0, 0, Math.PI); ctx.stroke();
        }

        // Legs
        ctx.fillStyle = scale;
        [[-28*S, 0.3],[28*S, -0.3]].forEach(([lx, angle]) => {
            ctx.save(); ctx.translate(cx + lx, cy + 50*S); ctx.rotate(angle);
            ctx.fillRect(-10*S, 0, 20*S, 28*S);
            // Claws
            ctx.fillStyle = '#d4d4d4';
            for (let c = -1; c <= 1; c++) { ctx.beginPath(); ctx.moveTo(c*6*S, 28*S); ctx.lineTo(c*8*S, 40*S); ctx.lineTo(c*3*S, 28*S); ctx.fill(); }
            ctx.restore();
        });

        // Neck
        ctx.fillStyle = scale;
        ctx.beginPath(); ctx.ellipse(cx - 10*S, cy - 48*S, 18*S, 28*S, -0.3, 0, Math.PI*2); ctx.fill();

        // Head
        const headG2 = ctx.createRadialGradient(cx-25*S, cy-85*S, 5*S, cx-15*S, cy-75*S, 38*S);
        headG2.addColorStop(0, lightenColor(scale,25)); headG2.addColorStop(1, scale);
        ctx.fillStyle = headG2;
        ctx.beginPath();
        ctx.moveTo(cx - 42*S, cy - 68*S);
        ctx.quadraticCurveTo(cx - 30*S, cy - 100*S, cx + 5*S, cy - 95*S);
        ctx.quadraticCurveTo(cx + 20*S, cy - 80*S, cx + 25*S, cy - 65*S);
        ctx.quadraticCurveTo(cx + 10*S, cy - 55*S, cx - 10*S, cy - 55*S);
        ctx.closePath(); ctx.fill();

        // Horns
        ctx.fillStyle = '#c8b090';
        [[-20*S, -5*S],[5*S, -2*S]].forEach(([hx,_]) => {
            ctx.beginPath();
            ctx.moveTo(cx + hx, cy - 95*S);
            ctx.quadraticCurveTo(cx + hx - 5*S, cy - 118*S, cx + hx + 4*S, cy - 110*S);
            ctx.closePath(); ctx.fill();
        });

        // Dragon eye
        ctx.fillStyle = '#facc15';
        ctx.beginPath(); ctx.ellipse(cx - 5*S, cy - 75*S, 8*S, 6*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.ellipse(cx - 5*S, cy - 75*S, 3*S, 5*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(cx - 3*S, cy - 77*S, 2*S, 0, Math.PI*2); ctx.fill();

        // Fire breath
        const fireG = ctx.createLinearGradient(cx + 20*S, cy - 68*S, cx + 80*S, cy - 80*S);
        fireG.addColorStop(0, '#fbbf24'); fireG.addColorStop(0.4, '#ef4444'); fireG.addColorStop(1, 'transparent');
        ctx.fillStyle = fireG;
        ctx.beginPath();
        ctx.moveTo(cx + 22*S, cy - 64*S);
        ctx.quadraticCurveTo(cx + 55*S, cy - 82*S, cx + 82*S, cy - 90*S);
        ctx.quadraticCurveTo(cx + 55*S, cy - 68*S, cx + 22*S, cy - 60*S);
        ctx.closePath(); ctx.fill();

        ctx.restore();
    }

    // ─── ORC ───────────────────────────────────────────────────────────────
    function drawCreatureOrc(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';
        const skin = '#5c8c3e';

        drawDropShadow(cx, cy + 70*S, 55*S, 15*S, 0.5);

        // Massive legs
        ctx.fillStyle = '#3a2508';
        ctx.beginPath(); ctx.roundRect(cx-22*S, cy+28*S, 18*S, 40*S, px?0:5*S); ctx.fill();
        ctx.beginPath(); ctx.roundRect(cx+4*S, cy+28*S, 18*S, 40*S, px?0:5*S); ctx.fill();

        // Muscular torso
        const tG = ctx.createLinearGradient(cx-32*S, cy-20*S, cx+32*S, cy+32*S);
        tG.addColorStop(0, lightenColor(skin,20)); tG.addColorStop(1, darkenColor(skin,20));
        ctx.fillStyle = tG;
        ctx.beginPath(); ctx.roundRect(cx-30*S, cy-18*S, 60*S, 50*S, px?0:8*S); ctx.fill();

        // Massive arms
        ctx.fillStyle = skin;
        ctx.beginPath(); ctx.roundRect(cx-46*S, cy-12*S, 17*S, 44*S, px?0:7*S); ctx.fill();
        ctx.beginPath(); ctx.roundRect(cx+29*S, cy-12*S, 17*S, 44*S, px?0:7*S); ctx.fill();

        // Fists
        ctx.fillStyle = darkenColor(skin,15);
        ctx.beginPath(); ctx.ellipse(cx-38*S, cy+34*S, 11*S, 9*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx+38*S, cy+34*S, 11*S, 9*S, 0, 0, Math.PI*2); ctx.fill();
        // Knuckles
        ctx.fillStyle = darkenColor(skin,30);
        for (let k = -1; k <= 1; k++) {
            ctx.beginPath(); ctx.arc(cx-38*S + k*4*S, cy+30*S, 2*S, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx+38*S + k*4*S, cy+30*S, 2*S, 0, Math.PI*2); ctx.fill();
        }

        // Battle armor plate on chest
        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.roundRect(cx-22*S, cy-12*S, 44*S, 28*S, 4*S); ctx.fill();
        // Rivets
        ctx.fillStyle = lightenColor(acc, 40);
        [[cx-16*S,cy-6*S],[cx+16*S,cy-6*S],[cx-16*S,cy+10*S],[cx+16*S,cy+10*S]].forEach(([px2,py2]) => {
            ctx.beginPath(); ctx.arc(px2, py2, 3*S, 0, Math.PI*2); ctx.fill();
        });

        // Huge head
        const hG = ctx.createRadialGradient(cx-10*S, cy-52*S, 5*S, cx, cy-42*S, 34*S);
        hG.addColorStop(0, lightenColor(skin,15)); hG.addColorStop(1, skin);
        ctx.fillStyle = hG;
        ctx.beginPath(); ctx.ellipse(cx, cy-42*S, 30*S, 28*S, 0, 0, Math.PI*2); ctx.fill();

        // Angry brow
        ctx.strokeStyle = darkenColor(skin,40); ctx.lineWidth = 4*S; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx-18*S, cy-56*S); ctx.lineTo(cx-4*S, cy-52*S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx+18*S, cy-56*S); ctx.lineTo(cx+4*S, cy-52*S); ctx.stroke();

        // Eyes
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.ellipse(cx-12*S, cy-44*S, 7*S, 6*S, -0.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx+12*S, cy-44*S, 7*S, 6*S, 0.2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(cx-12*S, cy-44*S, 3*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx+12*S, cy-44*S, 3*S, 0, Math.PI*2); ctx.fill();

        // Tusks
        ctx.fillStyle = '#f0e68c';
        ctx.beginPath(); ctx.moveTo(cx-8*S, cy-30*S); ctx.lineTo(cx-14*S, cy-18*S); ctx.lineTo(cx-5*S, cy-28*S); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx+8*S, cy-30*S); ctx.lineTo(cx+14*S, cy-18*S); ctx.lineTo(cx+5*S, cy-28*S); ctx.closePath(); ctx.fill();

        ctx.restore();
    }

    // ─── GHOST ─────────────────────────────────────────────────────────────
    function drawCreatureGhost(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;

        // Eerie glow
        drawGlowHalo(cx, cy, 90*S, glow, 4);

        ctx.globalAlpha = 0.82;

        // Wispy tail
        const tailG = ctx.createLinearGradient(cx, cy + 20*S, cx, cy + 85*S);
        tailG.addColorStop(0, base + 'cc'); tailG.addColorStop(1, 'transparent');
        ctx.fillStyle = tailG;
        ctx.beginPath();
        ctx.moveTo(cx - 30*S, cy + 20*S);
        ctx.quadraticCurveTo(cx - 50*S, cy + 60*S, cx - 20*S, cy + 85*S);
        ctx.lineTo(cx, cy + 75*S);
        ctx.lineTo(cx + 20*S, cy + 85*S);
        ctx.quadraticCurveTo(cx + 50*S, cy + 60*S, cx + 30*S, cy + 20*S);
        ctx.closePath(); ctx.fill();

        // Main ghost body
        const bodyG = ctx.createRadialGradient(cx - 12*S, cy - 20*S, 5*S, cx, cy, 55*S);
        bodyG.addColorStop(0, lightenColor(base, 50) + 'ee');
        bodyG.addColorStop(0.6, base + 'cc');
        bodyG.addColorStop(1, darkenColor(base, 20) + '88');
        ctx.fillStyle = bodyG;
        ctx.beginPath();
        ctx.arc(cx, cy - 10*S, 52*S, Math.PI, 0);
        ctx.lineTo(cx + 30*S, cy + 20*S);
        ctx.lineTo(cx, cy + 10*S);
        ctx.lineTo(cx - 30*S, cy + 20*S);
        ctx.closePath(); ctx.fill();

        // Arms reaching out
        ctx.fillStyle = base + 'aa';
        ctx.beginPath(); ctx.ellipse(cx - 58*S, cy - 5*S, 18*S, 9*S, -0.4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 58*S, cy - 5*S, 18*S, 9*S, 0.4, 0, Math.PI*2); ctx.fill();

        // Face
        ctx.globalAlpha = 1;
        // Dark empty eyes
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.beginPath(); ctx.ellipse(cx - 16*S, cy - 16*S, 10*S, 12*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 16*S, cy - 16*S, 10*S, 12*S, 0, 0, Math.PI*2); ctx.fill();
        // Glow in eyes
        ctx.fillStyle = glowAlpha(glow, 0.9);
        ctx.beginPath(); ctx.arc(cx - 16*S, cy - 16*S, 5*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 16*S, cy - 16*S, 5*S, 0, Math.PI*2); ctx.fill();
        // Wailing mouth
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.beginPath(); ctx.ellipse(cx, cy + 4*S, 12*S, 10*S, 0, 0, Math.PI*2); ctx.fill();

        ctx.restore();
    }

    // ─── SPIDER ────────────────────────────────────────────────────────────
    function drawCreatureSpider(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;

        drawGlowHalo(cx, cy, 60*S, glow, 2);
        drawDropShadow(cx, cy + 40*S, 60*S, 14*S, 0.4);

        // Spider legs (4 per side)
        const legAngles = [-0.9, -0.45, 0.1, 0.6];
        [-1, 1].forEach(dir => {
            legAngles.forEach((angle, i) => {
                ctx.strokeStyle = base; ctx.lineWidth = 4*S; ctx.lineCap = 'round';
                const startX = cx + dir * 25*S;
                const startY = cy - 10*S + i * 10*S;
                const midX = cx + dir * (50 + i*8)*S;
                const midY = cy - (30 - i*20)*S;
                const endX = cx + dir * (30 + i*12)*S;
                const endY = cy + (20 + i*10)*S;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(midX, midY);
                ctx.lineTo(endX, endY);
                ctx.stroke();
            });
        });

        // Abdomen (large oval)
        const abdG = ctx.createRadialGradient(cx - 8*S, cy + 20*S, 5*S, cx, cy + 20*S, 36*S);
        abdG.addColorStop(0, lightenColor(base, 30)); abdG.addColorStop(1, darkenColor(base, 20));
        ctx.fillStyle = abdG;
        ctx.beginPath(); ctx.ellipse(cx, cy + 20*S, 34*S, 30*S, 0, 0, Math.PI*2); ctx.fill();
        // Pattern on abdomen
        ctx.fillStyle = acc;
        ctx.beginPath(); ctx.ellipse(cx, cy + 18*S, 12*S, 16*S, 0, 0, Math.PI*2); ctx.fill();

        // Cephalothorax (head+body)
        const thoraxG = ctx.createRadialGradient(cx - 5*S, cy - 14*S, 3*S, cx, cy - 10*S, 22*S);
        thoraxG.addColorStop(0, lightenColor(base, 20)); thoraxG.addColorStop(1, base);
        ctx.fillStyle = thoraxG;
        ctx.beginPath(); ctx.ellipse(cx, cy - 10*S, 22*S, 18*S, 0, 0, Math.PI*2); ctx.fill();

        // 8 eyes
        const eyePositions = [[-10*S,-20*S,4.5*S],[-4*S,-22*S,4.5*S],[4*S,-22*S,4.5*S],[10*S,-20*S,4.5*S],
                               [-8*S,-14*S,3*S],[-2*S,-14*S,3*S],[2*S,-14*S,3*S],[8*S,-14*S,3*S]];
        eyePositions.forEach(([ex, ey, er]) => {
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.arc(cx + ex, cy + ey, er, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = glowAlpha(glow, 0.8);
            ctx.beginPath(); ctx.arc(cx + ex, cy + ey, er * 0.5, 0, Math.PI*2); ctx.fill();
        });

        // Fangs
        ctx.strokeStyle = '#d4d4d4'; ctx.lineWidth = 3*S; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 6*S, cy - 4*S); ctx.lineTo(cx - 8*S, cy + 6*S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 6*S, cy - 4*S); ctx.lineTo(cx + 8*S, cy + 6*S); ctx.stroke();

        ctx.restore();
    }

    // ─── BAT ───────────────────────────────────────────────────────────────
    function drawCreatureBat(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;

        drawGlowHalo(cx, cy, 70*S, glow, 2);

        // Wings
        [-1, 1].forEach(dir => {
            const wingG = ctx.createLinearGradient(cx, cy, cx + dir*80*S, cy - 40*S);
            wingG.addColorStop(0, base + 'dd'); wingG.addColorStop(1, darkenColor(base,30) + '66');
            ctx.fillStyle = wingG;
            ctx.beginPath();
            ctx.moveTo(cx + dir*12*S, cy - 8*S);
            ctx.quadraticCurveTo(cx + dir*45*S, cy - 60*S, cx + dir*75*S, cy - 40*S);
            ctx.quadraticCurveTo(cx + dir*60*S, cy + 10*S, cx + dir*15*S, cy + 12*S);
            ctx.closePath(); ctx.fill();
            // Wing fingers
            ctx.strokeStyle = darkenColor(base,40)+'aa'; ctx.lineWidth = 1.5*S;
            for (let f = 1; f <= 3; f++) {
                ctx.beginPath();
                ctx.moveTo(cx + dir*12*S, cy - 4*S);
                ctx.lineTo(cx + dir*(30+f*15)*S, cy - (30+f*8)*S);
                ctx.stroke();
            }
        });

        // Body
        const bodyG = ctx.createRadialGradient(cx-5*S, cy-5*S, 3*S, cx, cy, 18*S);
        bodyG.addColorStop(0, lightenColor(base,20)); bodyG.addColorStop(1, base);
        ctx.fillStyle = bodyG;
        ctx.beginPath(); ctx.ellipse(cx, cy, 16*S, 20*S, 0, 0, Math.PI*2); ctx.fill();

        // Head
        const hG = ctx.createRadialGradient(cx-5*S, cy-30*S, 3*S, cx, cy-24*S, 18*S);
        hG.addColorStop(0, lightenColor(base,20)); hG.addColorStop(1, base);
        ctx.fillStyle = hG;
        ctx.beginPath(); ctx.ellipse(cx, cy - 24*S, 16*S, 14*S, 0, 0, Math.PI*2); ctx.fill();

        // Ears
        ctx.fillStyle = darkenColor(base, 20);
        ctx.beginPath(); ctx.moveTo(cx - 12*S, cy - 34*S); ctx.lineTo(cx - 18*S, cy - 52*S); ctx.lineTo(cx - 4*S, cy - 36*S); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 12*S, cy - 34*S); ctx.lineTo(cx + 18*S, cy - 52*S); ctx.lineTo(cx + 4*S, cy - 36*S); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ec4899';
        ctx.beginPath(); ctx.moveTo(cx - 10*S, cy - 36*S); ctx.lineTo(cx - 14*S, cy - 48*S); ctx.lineTo(cx - 5*S, cy - 37*S); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 10*S, cy - 36*S); ctx.lineTo(cx + 14*S, cy - 48*S); ctx.lineTo(cx + 5*S, cy - 37*S); ctx.closePath(); ctx.fill();

        // Eyes (glowing red)
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(cx - 6*S, cy - 24*S, 5*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 6*S, cy - 24*S, 5*S, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(cx - 6*S, cy - 24*S, 3*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 6*S, cy - 24*S, 3*S, 0, Math.PI*2); ctx.fill();

        // Fangs
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(cx - 4*S, cy - 14*S); ctx.lineTo(cx - 6*S, cy - 6*S); ctx.lineTo(cx - 1*S, cy - 13*S); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx + 4*S, cy - 14*S); ctx.lineTo(cx + 6*S, cy - 6*S); ctx.lineTo(cx + 1*S, cy - 13*S); ctx.closePath(); ctx.fill();

        ctx.restore();
    }

    // ─── WOLF ──────────────────────────────────────────────────────────────
    function drawCreatureWolf(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;

        drawDropShadow(cx, cy + 60*S, 55*S, 15*S, 0.45);

        const fur = base;
        const belly = lightenColor(acc, 20);

        // Body (crouched)
        const bodyG = ctx.createRadialGradient(cx - 15*S, cy - 5*S, 10*S, cx, cy + 5*S, 50*S);
        bodyG.addColorStop(0, lightenColor(fur,20)); bodyG.addColorStop(1, fur);
        ctx.fillStyle = bodyG;
        ctx.beginPath(); ctx.ellipse(cx, cy + 5*S, 50*S, 32*S, 0, 0, Math.PI*2); ctx.fill();

        // Belly
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(cx, cy + 12*S, 30*S, 20*S, 0, 0, Math.PI*2); ctx.fill();

        // Legs (4 paws)
        const paws = [[-30*S,30*S],[-12*S,30*S],[12*S,30*S],[30*S,30*S]];
        paws.forEach(([px2, py]) => {
            ctx.fillStyle = fur; ctx.beginPath(); ctx.roundRect(cx+px2-6*S, cy+py, 12*S, 28*S, [4*S,4*S,8*S,8*S]); ctx.fill();
        });
        // Tail
        ctx.strokeStyle = fur; ctx.lineWidth = 16*S; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx + 45*S, cy - 5*S); ctx.quadraticCurveTo(cx + 75*S, cy - 40*S, cx + 60*S, cy - 60*S); ctx.stroke();
        ctx.strokeStyle = lightenColor(fur,30); ctx.lineWidth = 8*S;
        ctx.beginPath(); ctx.moveTo(cx + 45*S, cy - 5*S); ctx.quadraticCurveTo(cx + 75*S, cy - 40*S, cx + 60*S, cy - 60*S); ctx.stroke();

        // Neck
        ctx.fillStyle = fur;
        ctx.beginPath(); ctx.ellipse(cx - 38*S, cy - 22*S, 18*S, 22*S, -0.4, 0, Math.PI*2); ctx.fill();

        // Head
        ctx.beginPath(); ctx.ellipse(cx - 52*S, cy - 32*S, 24*S, 20*S, -0.2, 0, Math.PI*2); ctx.fill();

        // Snout / muzzle
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(cx - 70*S, cy - 28*S, 16*S, 10*S, -0.15, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#cc2222';
        ctx.beginPath(); ctx.arc(cx - 72*S, cy - 22*S, 3*S, 0, Math.PI*2); ctx.fill();

        // Ears
        ctx.fillStyle = fur;
        ctx.beginPath(); ctx.moveTo(cx - 58*S, cy - 48*S); ctx.lineTo(cx - 66*S, cy - 65*S); ctx.lineTo(cx - 46*S, cy - 50*S); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - 42*S, cy - 48*S); ctx.lineTo(cx - 44*S, cy - 64*S); ctx.lineTo(cx - 32*S, cy - 50*S); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ec4899';
        ctx.beginPath(); ctx.moveTo(cx - 56*S, cy - 50*S); ctx.lineTo(cx - 62*S, cy - 62*S); ctx.lineTo(cx - 48*S, cy - 52*S); ctx.closePath(); ctx.fill();

        // Eyes (glowing)
        ctx.fillStyle = glowAlpha(glow, 0.9);
        ctx.beginPath(); ctx.ellipse(cx - 44*S, cy - 36*S, 6*S, 5*S, 0.2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.ellipse(cx - 44*S, cy - 36*S, 3*S, 4*S, 0.2, 0, Math.PI*2); ctx.fill();

        // Snarl / teeth
        ctx.fillStyle = '#fff';
        for (let t = -2; t <= 1; t++) {
            ctx.beginPath(); ctx.moveTo(cx - 70*S + t*4*S, cy - 22*S); ctx.lineTo(cx - 68*S + t*4*S, cy - 15*S); ctx.lineTo(cx - 66*S + t*4*S, cy - 22*S); ctx.closePath(); ctx.fill();
        }

        ctx.restore();
    }

    // ─── DOG ───────────────────────────────────────────────────────────────
    function drawCreatureDog(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        drawDropShadow(cx, cy + 60*S, 48*S, 14*S, 0.4);

        const fur = base;
        const belly = lightenColor(acc, 20);
        const darkFur = darkenColor(base, 22);

        // Volumetric Body Gradient
        const bodyGrad = ctx.createRadialGradient(cx - 5*S, cy + 5*S, 10*S, cx, cy + 8*S, 44*S);
        bodyGrad.addColorStop(0, lightenColor(fur, 18));
        bodyGrad.addColorStop(0.7, fur);
        bodyGrad.addColorStop(1, darkFur);

        ctx.fillStyle = bodyGrad;
        ctx.beginPath(); ctx.ellipse(cx, cy + 8*S, 44*S, 30*S, 0, 0, Math.PI*2); ctx.fill();

        // Belly patch
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(cx - 5*S, cy + 12*S, 25*S, 18*S, 0, 0, Math.PI*2); ctx.fill();

        // 4 Legs with shadows
        const paws = [
            { x: -24*S, front: true },
            { x: -8*S, front: false },
            { x: 8*S, front: false },
            { x: 24*S, front: true }
        ];
        paws.forEach(p => {
            ctx.fillStyle = p.front ? fur : darkFur;
            ctx.beginPath(); ctx.roundRect(cx + p.x - 5*S, cy + 14*S, 10*S, 18*S, 5*S); ctx.fill();
            
            // Paws details
            ctx.fillStyle = belly;
            ctx.beginPath(); ctx.ellipse(cx + p.x, cy + 32*S, 6*S, 3*S, 0, 0, Math.PI*2); ctx.fill();
        });

        // Tail
        ctx.strokeStyle = darkFur; ctx.lineWidth = 10*S; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx + 38*S, cy - 2*S); ctx.quadraticCurveTo(cx + 60*S, cy - 25*S, cx + 55*S, cy - 35*S); ctx.stroke();

        // Neck
        ctx.fillStyle = fur;
        ctx.beginPath(); ctx.ellipse(cx - 30*S, cy - 18*S, 16*S, 20*S, -0.3, 0, Math.PI*2); ctx.fill();

        // Head (spherical volume)
        const headGrad = ctx.createRadialGradient(cx - 44*S, cy - 30*S, 4*S, cx - 42*S, cy - 28*S, 22*S);
        headGrad.addColorStop(0, lightenColor(fur, 20));
        headGrad.addColorStop(0.7, fur);
        headGrad.addColorStop(1, darkFur);
        ctx.fillStyle = headGrad;
        ctx.beginPath(); ctx.ellipse(cx - 42*S, cy - 28*S, 22*S, 20*S, -0.1, 0, Math.PI*2); ctx.fill();

        // Muzzle / Snout (friendly dog mouth)
        ctx.fillStyle = belly;
        ctx.beginPath(); ctx.ellipse(cx - 58*S, cy - 24*S, 12*S, 9*S, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath(); ctx.arc(cx - 64*S, cy - 27*S, 3.5*S, 0, Math.PI*2); ctx.fill(); // Nose

        // Tongue
        ctx.fillStyle = '#f87171';
        ctx.beginPath(); ctx.roundRect(cx - 60*S, cy - 19*S, 6*S, 10*S, 3*S); ctx.fill();

        // Floppy Ears
        ctx.fillStyle = darkFur;
        ctx.beginPath(); ctx.ellipse(cx - 38*S, cy - 26*S, 8*S, 16*S, 0.25, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx - 48*S, cy - 26*S, 8*S, 16*S, -0.25, 0, Math.PI*2); ctx.fill();

        // Big friendly eyes with pupil and spec reflection
        [-1, 1].forEach(side => {
            const eyeX = cx - 40*S + side*6*S;
            const eyeY = cy - 34*S;
            
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(eyeX, eyeY, 4.5*S, 0, Math.PI*2); ctx.fill();
            
            ctx.fillStyle = '#1e1b4b';
            ctx.beginPath(); ctx.arc(eyeX, eyeY, 2.5*S, 0, Math.PI*2); ctx.fill();

            // Spec
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(eyeX + 1*S, eyeY - 1*S, 1*S, 0, Math.PI*2); ctx.fill();
        });

        ctx.restore();
    }

    // ─── CAT ───────────────────────────────────────────────────────────────
    function drawCreatureCat(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        drawDropShadow(cx, cy + 60*S, 42*S, 12*S, 0.35);

        const coat = base;
        const chest = lightenColor(acc, 20);
        const darkCoat = darkenColor(base, 25);

        // Body Gradient (volume simulation)
        const bodyGrad = ctx.createRadialGradient(cx - 5*S, cy + 5*S, 8*S, cx, cy + 12*S, 32*S);
        bodyGrad.addColorStop(0, lightenColor(coat, 20));
        bodyGrad.addColorStop(0.6, coat);
        bodyGrad.addColorStop(1, darkCoat);

        // Slender curved back body
        ctx.fillStyle = bodyGrad;
        ctx.beginPath(); 
        ctx.ellipse(cx + 8*S, cy + 16*S, 32*S, 20*S, -0.1, 0, Math.PI*2); 
        ctx.fill();

        // Chest/Shoulder connection patch
        const chestGrad = ctx.createLinearGradient(cx - 20*S, cy + 5*S, cx - 5*S, cy + 25*S);
        chestGrad.addColorStop(0, lightenColor(chest, 15));
        chestGrad.addColorStop(1, darkenColor(chest, 10));
        ctx.fillStyle = chestGrad;
        ctx.beginPath(); 
        ctx.ellipse(cx - 10*S, cy + 12*S, 18*S, 14*S, 0.15, 0, Math.PI*2); 
        ctx.fill();

        // Elegant curved tail with dual-tone shading
        ctx.strokeStyle = darkCoat; 
        ctx.lineWidth = 7.5*S; 
        ctx.lineCap = 'round';
        ctx.beginPath(); 
        ctx.moveTo(cx + 28*S, cy + 10*S); 
        ctx.quadraticCurveTo(cx + 62*S, cy - 8*S, cx + 52*S, cy - 38*S); 
        ctx.stroke();

        ctx.strokeStyle = coat; 
        ctx.lineWidth = 4*S;
        ctx.beginPath(); 
        ctx.moveTo(cx + 28*S, cy + 10*S); 
        ctx.quadraticCurveTo(cx + 60*S, cy - 8*S, cx + 51*S, cy - 36*S); 
        ctx.stroke();

        // 4 Legs with occlusion shadows at the joints
        const paws = [
            { x: -18*S, y: 32*S, front: true },
            { x: -6*S, y: 32*S, front: false },
            { x: 8*S, y: 32*S, front: false },
            { x: 22*S, y: 32*S, front: true }
        ];
        paws.forEach(p => {
            ctx.fillStyle = p.front ? coat : darkCoat;
            ctx.beginPath(); 
            ctx.roundRect(cx + p.x - 3.5*S, cy + 16*S, 7*S, 18*S, 3.5*S); 
            ctx.fill();
            
            // Paw tips/details
            ctx.fillStyle = chest;
            ctx.beginPath();
            ctx.ellipse(cx + p.x, cy + 34*S, 4.5*S, 2.5*S, 0, 0, Math.PI*2);
            ctx.fill();
        });

        // Neck
        ctx.fillStyle = coat;
        ctx.beginPath(); 
        ctx.ellipse(cx - 20*S, cy - 8*S, 10*S, 16*S, -0.22, 0, Math.PI*2); 
        ctx.fill();

        // Head (rounded and organic)
        const headGrad = ctx.createRadialGradient(cx - 30*S, cy - 25*S, 3*S, cx - 27*S, cy - 23*S, 20*S);
        headGrad.addColorStop(0, lightenColor(coat, 22));
        headGrad.addColorStop(0.7, coat);
        headGrad.addColorStop(1, darkCoat);
        ctx.fillStyle = headGrad;
        ctx.beginPath(); 
        ctx.ellipse(cx - 28*S, cy - 23*S, 19*S, 17*S, 0, 0, Math.PI*2); 
        ctx.fill();

        // Pointy Ears with pink inner cavity
        [-1, 1].forEach(side => {
            const ex = cx - 28*S + side*12*S;
            const ey = cy - 36*S;
            
            ctx.fillStyle = darkCoat;
            ctx.beginPath();
            ctx.moveTo(ex - 6*S, ey + 4*S);
            ctx.lineTo(ex, ey - 14*S);
            ctx.lineTo(ex + 8*S, ey + 2*S);
            ctx.closePath();
            ctx.fill();

            // Inner ear
            ctx.fillStyle = '#fda4af'; // Soft rose pink
            ctx.beginPath();
            ctx.moveTo(ex - 3*S, ey + 3*S);
            ctx.lineTo(ex, ey - 9*S);
            ctx.lineTo(ex + 5*S, ey + 1*S);
            ctx.closePath();
            ctx.fill();
        });

        // Glowing realistic eyes (with beautiful pupil and specular reflection)
        [-1, 1].forEach(side => {
            const eyeX = cx - 28*S + side*7.5*S;
            const eyeY = cy - 26*S;

            // Iris
            const irisGrad = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY, 4*S);
            irisGrad.addColorStop(0, '#eab308'); // Golden yellow core
            irisGrad.addColorStop(1, '#a3e635'); // Lime green edge
            ctx.fillStyle = irisGrad;
            ctx.beginPath(); 
            ctx.ellipse(eyeX, eyeY, 4.5*S, 4*S, 0, 0, Math.PI*2); 
            ctx.fill();

            // Slit pupil
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.ellipse(eyeX, eyeY, 1.2*S, 3.2*S, 0, 0, Math.PI*2);
            ctx.fill();

            // Specular reflection dot
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(eyeX + 1.2*S, eyeY - 1.2*S, 0.9*S, 0, Math.PI*2);
            ctx.fill();
        });

        // Muzzle & Whiskers
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath(); ctx.arc(cx - 30.5*S, cy - 19.5*S, 3.2*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 26.5*S, cy - 19.5*S, 3.2*S, 0, Math.PI*2); ctx.fill();
        
        // Nose (pink)
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.moveTo(cx - 30*S, cy - 21.5*S);
        ctx.lineTo(cx - 27*S, cy - 21.5*S);
        ctx.lineTo(cx - 28.5*S, cy - 19.5*S);
        ctx.closePath();
        ctx.fill();

        // Delicate Whiskers
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; 
        ctx.lineWidth = 0.85*S;
        ctx.beginPath(); ctx.moveTo(cx - 32*S, cy - 19*S); ctx.lineTo(cx - 46*S, cy - 21*S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 32*S, cy - 19*S); ctx.lineTo(cx - 44*S, cy - 15*S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 25*S, cy - 19*S); ctx.lineTo(cx - 11*S, cy - 21*S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 25*S, cy - 19*S); ctx.lineTo(cx - 13*S, cy - 15*S); ctx.stroke();

        ctx.restore();
    }


    // ─── CHICKEN ───────────────────────────────────────────────────────────
    function drawCreatureChicken(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        drawDropShadow(cx, cy + 50*S, 34*S, 10*S, 0.35);

        // Body (plump round chicken)
        ctx.fillStyle = '#f8fafc'; // White feathers base
        ctx.beginPath(); ctx.arc(cx, cy + 8*S, 32*S, 0, Math.PI*2); ctx.fill();

        // Wing
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath(); ctx.ellipse(cx + 8*S, cy + 12*S, 16*S, 10*S, 0.2, 0, Math.PI*2); ctx.fill();

        // Comb (Crest on top)
        ctx.fillStyle = '#ef4444'; // Bright red
        ctx.beginPath(); ctx.arc(cx - 8*S, cy - 25*S, 7*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy - 29*S, 8*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 8*S, cy - 25*S, 6*S, 0, Math.PI*2); ctx.fill();
        // Wattles under beak
        ctx.beginPath(); ctx.ellipse(cx - 22*S, cy - 4*S, 4*S, 8*S, 0, 0, Math.PI*2); ctx.fill();

        // Beak (small orange triangle)
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(cx - 24*S, cy - 12*S);
        ctx.lineTo(cx - 36*S, cy - 8*S);
        ctx.lineTo(cx - 24*S, cy - 4*S);
        ctx.closePath(); ctx.fill();

        // Legs (thin orange sticks)
        ctx.strokeStyle = '#f97316'; ctx.lineWidth = 3.5*S; ctx.lineCap = 'round';
        [[-8*S],[8*S]].forEach(([lx]) => {
            ctx.beginPath(); ctx.moveTo(cx + lx, cy + 34*S); ctx.lineTo(cx + lx, cy + 50*S); ctx.stroke();
            // Feet
            ctx.beginPath(); ctx.moveTo(cx + lx, cy + 50*S); ctx.lineTo(cx + lx - 6*S, cy + 54*S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + lx, cy + 50*S); ctx.lineTo(cx + lx + 6*S, cy + 54*S); ctx.stroke();
        });

        // Eyes (black dot with shine)
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(cx - 15*S, cy - 14*S, 3.5*S, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(cx - 16.5*S, cy - 15.5*S, 1*S, 0, Math.PI*2); ctx.fill();

        ctx.restore();
    }

    // ─── GOLEM ─────────────────────────────────────────────────────────────
    function drawCreatureGolem(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const px = style === 'pixel';

        drawGlowHalo(cx, cy, 80*S, glow, 2);
        drawDropShadow(cx, cy + 75*S, 60*S, 18*S, 0.5);

        const rock = base;
        const rune = acc;

        // Block legs
        [[cx-18*S,cy+30*S],[cx+4*S,cy+30*S]].forEach(([lx,ly]) => {
            const lG = ctx.createLinearGradient(lx, ly, lx+16*S, ly+40*S);
            lG.addColorStop(0, lightenColor(rock,15)); lG.addColorStop(1, darkenColor(rock,20));
            ctx.fillStyle = lG;
            ctx.beginPath(); ctx.roundRect(lx, ly, 16*S, 42*S, px?0:4*S); ctx.fill();
            ctx.strokeStyle = darkenColor(rock,40); ctx.lineWidth = 2*S;
            ctx.strokeRect(lx, ly, 16*S, 42*S);
        });

        // Massive torso (cube-like)
        const torsoG = ctx.createLinearGradient(cx-38*S, cy-20*S, cx+38*S, cy+34*S);
        torsoG.addColorStop(0, lightenColor(rock,20)); torsoG.addColorStop(1, darkenColor(rock,25));
        ctx.fillStyle = torsoG;
        ctx.beginPath(); ctx.roundRect(cx-36*S, cy-18*S, 72*S, 52*S, px?0:6*S); ctx.fill();
        ctx.strokeStyle = darkenColor(rock,40); ctx.lineWidth = 2.5*S;
        ctx.strokeRect(cx-36*S, cy-18*S, 72*S, 52*S);

        // Crack lines on torso
        ctx.strokeStyle = darkenColor(rock,50)+'aa'; ctx.lineWidth = 1.5*S;
        ctx.beginPath(); ctx.moveTo(cx-10*S, cy-18*S); ctx.lineTo(cx+5*S, cy+10*S); ctx.lineTo(cx-5*S, cy+34*S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx+20*S, cy-10*S); ctx.lineTo(cx+30*S, cy+20*S); ctx.stroke();

        // Rune glow on chest
        drawGlowHalo(cx, cy + 8*S, 20*S, glow, 2);
        ctx.fillStyle = rune;
        ctx.font = `bold ${22*S}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText('⬡', cx, cy + 16*S);

        // Block arms
        [[cx-52*S, cy-14*S],[cx+36*S, cy-14*S]].forEach(([ax, ay]) => {
            const aG = ctx.createLinearGradient(ax, ay, ax+16*S, ay+52*S);
            aG.addColorStop(0, lightenColor(rock,10)); aG.addColorStop(1, darkenColor(rock,30));
            ctx.fillStyle = aG;
            ctx.beginPath(); ctx.roundRect(ax, ay, 16*S, 52*S, px?0:4*S); ctx.fill();
            ctx.strokeStyle = darkenColor(rock,40); ctx.lineWidth = 2*S;
            ctx.strokeRect(ax, ay, 16*S, 52*S);
        });

        // Square head
        const headG = ctx.createLinearGradient(cx-28*S, cy-75*S, cx+28*S, cy-22*S);
        headG.addColorStop(0, lightenColor(rock,25)); headG.addColorStop(1, rock);
        ctx.fillStyle = headG;
        ctx.beginPath(); ctx.roundRect(cx-26*S, cy-72*S, 52*S, 56*S, px?0:6*S); ctx.fill();
        ctx.strokeStyle = darkenColor(rock,40); ctx.lineWidth = 2.5*S;
        ctx.strokeRect(cx-26*S, cy-72*S, 52*S, 56*S);

        // Glowing eyes (rectangular)
        ctx.fillStyle = glowAlpha(glow, 0.9);
        ctx.fillRect(cx - 18*S, cy - 58*S, 10*S, 6*S);
        ctx.fillRect(cx + 8*S, cy - 58*S, 10*S, 6*S);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(cx - 17*S, cy - 58*S, 4*S, 3*S);
        ctx.fillRect(cx + 9*S, cy - 58*S, 4*S, 3*S);

        ctx.restore();
    }

    // ─── BOSS ──────────────────────────────────────────────────────────────
    function drawCreatureBoss(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;

        // Epic aura
        drawGlowHalo(cx, cy, 110*S, glow, 5);
        drawDropShadow(cx, cy + 95*S, 80*S, 25*S, 0.6);

        const demonSkin = darkenColor(base, 30);
        const hornsCol = darkenColor(base, 60);
        const glowStr = glowAlpha(glow, 0.95);

        // Cape/wings
        [-1,1].forEach(dir => {
            const wG = ctx.createLinearGradient(cx, cy-50*S, cx+dir*90*S, cy+50*S);
            wG.addColorStop(0, darkenColor(base,50)+'cc'); wG.addColorStop(1, 'transparent');
            ctx.fillStyle = wG;
            ctx.beginPath();
            ctx.moveTo(cx + dir*22*S, cy - 50*S);
            ctx.quadraticCurveTo(cx + dir*80*S, cy - 30*S, cx + dir*90*S, cy + 50*S);
            ctx.quadraticCurveTo(cx + dir*60*S, cy + 70*S, cx + dir*25*S, cy + 30*S);
            ctx.closePath(); ctx.fill();
        });

        // Massive legs
        [[cx-22*S,cy+38*S],[cx+6*S,cy+38*S]].forEach(([lx,ly]) => {
            ctx.fillStyle = demonSkin;
            ctx.beginPath(); ctx.roundRect(lx, ly, 18*S, 55*S, 5*S); ctx.fill();
            ctx.fillStyle = darkenColor(demonSkin,20);
            ctx.beginPath(); ctx.roundRect(lx-2*S, ly+40*S, 22*S, 18*S, [2*S,2*S,6*S,6*S]); ctx.fill();
        });

        // Torso (wide, muscled)
        const tG = ctx.createLinearGradient(cx-45*S, cy-25*S, cx+45*S, cy+42*S);
        tG.addColorStop(0, lightenColor(demonSkin,15)); tG.addColorStop(1, darkenColor(demonSkin,15));
        ctx.fillStyle = tG;
        ctx.beginPath(); ctx.roundRect(cx-42*S, cy-22*S, 84*S, 64*S, 8*S); ctx.fill();

        // Abs / muscle lines
        ctx.strokeStyle = darkenColor(demonSkin,35); ctx.lineWidth = 2*S;
        for (let m = 0; m < 3; m++) {
            ctx.beginPath(); ctx.moveTo(cx-18*S, cy+m*18*S); ctx.lineTo(cx+18*S, cy+m*18*S); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(cx, cy-15*S); ctx.lineTo(cx, cy+35*S); ctx.stroke();

        // Glowing chest rune
        drawGlowHalo(cx, cy+8*S, 25*S, glow, 3);
        ctx.fillStyle = glowStr;
        ctx.font = `bold ${28*S}px serif`;
        ctx.textAlign = 'center';
        ctx.fillText('☠', cx, cy + 20*S);

        // Arms
        [[cx-58*S,cy-18*S,-0.2],[cx+42*S,cy-18*S,0.2]].forEach(([ax,ay,rot]) => {
            ctx.save(); ctx.translate(ax, ay); ctx.rotate(rot);
            const aG = ctx.createLinearGradient(-12*S, 0, 12*S, 56*S);
            aG.addColorStop(0, lightenColor(demonSkin,10)); aG.addColorStop(1, demonSkin);
            ctx.fillStyle = aG; ctx.beginPath(); ctx.roundRect(-12*S, 0, 24*S, 56*S, 8*S); ctx.fill();
            // Fist
            ctx.fillStyle = darkenColor(demonSkin, 20);
            ctx.beginPath(); ctx.ellipse(0, 60*S, 14*S, 12*S, 0, 0, Math.PI*2); ctx.fill();
            // Claws
            ctx.fillStyle = '#c8b090';
            for (let c = -1; c <= 1; c++) {
                ctx.beginPath(); ctx.moveTo(c*8*S, 70*S); ctx.lineTo(c*10*S, 84*S); ctx.lineTo(c*4*S, 70*S); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        });

        // Head
        const hG = ctx.createRadialGradient(cx-15*S, cy-68*S, 5*S, cx, cy-55*S, 40*S);
        hG.addColorStop(0, lightenColor(demonSkin,20)); hG.addColorStop(1, demonSkin);
        ctx.fillStyle = hG;
        ctx.beginPath(); ctx.ellipse(cx, cy - 54*S, 36*S, 32*S, 0, 0, Math.PI*2); ctx.fill();

        // Horns (large, curved)
        [[cx-28*S,-0.6],[cx+28*S,0.6]].forEach(([hx, ang]) => {
            ctx.fillStyle = hornsCol;
            ctx.save(); ctx.translate(hx, cy - 82*S); ctx.rotate(ang);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-12*S, -35*S, 5*S, -55*S); ctx.lineTo(8*S, -42*S); ctx.quadraticCurveTo(-2*S,-25*S, 10*S, 0); ctx.closePath(); ctx.fill();
            ctx.restore();
        });

        // Boss eyes (blazing)
        [[cx-15*S],[cx+15*S]].forEach(([ex]) => {
            drawGlowHalo(ex, cy - 58*S, 14*S, glow, 2);
            ctx.fillStyle = '#111';
            ctx.beginPath(); ctx.ellipse(ex, cy - 58*S, 9*S, 8*S, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = glowStr;
            ctx.beginPath(); ctx.ellipse(ex, cy - 58*S, 5*S, 7*S, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath(); ctx.arc(ex + 2*S, cy - 62*S, 2.5*S, 0, Math.PI*2); ctx.fill();
        });

        // Demonic grin
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(cx, cy - 40*S, 16*S, 0.1, Math.PI - 0.1); ctx.fill();
        ctx.fillStyle = '#f8f8f8';
        for (let t = -3; t <= 3; t++) {
            ctx.beginPath(); ctx.moveTo(cx + t*5*S, cy - 42*S); ctx.lineTo(cx + t*6*S, cy - 34*S); ctx.lineTo(cx + (t+0.5)*5*S, cy - 42*S); ctx.closePath(); ctx.fill();
        }

        ctx.restore();
    }

    // ─── COIN ──────────────────────────────────────────────────────────────
    function drawCoinAsset(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const R = 72 * S;

        drawGlowHalo(cx, cy, R * 1.2, glow, 3);
        drawDropShadow(cx, cy + R * 0.9, R * 0.9, R * 0.2, 0.4);

        // Coin body
        const coinG = ctx.createRadialGradient(cx - R*0.3, cy - R*0.3, R*0.05, cx, cy, R);
        coinG.addColorStop(0, '#fff8dc'); coinG.addColorStop(0.4, '#ffd700'); coinG.addColorStop(0.7, base); coinG.addColorStop(1, darkenColor(base, 40));
        ctx.fillStyle = coinG;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();

        // Rim
        ctx.strokeStyle = darkenColor(base, 30); ctx.lineWidth = 5*S;
        ctx.beginPath(); ctx.arc(cx, cy, R - 2*S, 0, Math.PI*2); ctx.stroke();
        ctx.strokeStyle = lightenColor(base, 40); ctx.lineWidth = 2*S;
        ctx.beginPath(); ctx.arc(cx, cy, R - 6*S, 0, Math.PI*2); ctx.stroke();

        // Star / symbol
        ctx.fillStyle = darkenColor(base, 50);
        ctx.font = `bold ${R * 0.85}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', cx + 1*S, cy + 2*S);
        ctx.fillStyle = lightenColor(base, 30);
        ctx.fillText('★', cx, cy);

        drawSpecular(cx - R*0.25, cy - R*0.25, R * 0.5, 0.45);
        ctx.restore();
    }

    // ─── TREE / PLANT ──────────────────────────────────────────────────────
    function drawTreeAsset(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;
        const lp2 = promptInput.value.toLowerCase();
        const isMushroom = lp2.includes('hongo') || lp2.includes('mushroom') || lp2.includes('seta');
        const isFlower   = lp2.includes('flor') || lp2.includes('flower');

        if (isMushroom) {
            // Stem
            const stemG = ctx.createLinearGradient(cx-12*S,cy+20*S,cx+12*S,cy+70*S);
            stemG.addColorStop(0,'#f5f0e0'); stemG.addColorStop(1,'#d4caa0');
            ctx.fillStyle = stemG;
            ctx.beginPath(); ctx.roundRect(cx-12*S, cy+20*S, 24*S, 55*S, [4*S,4*S,8*S,8*S]); ctx.fill();
            // Cap
            drawGlowHalo(cx, cy-10*S, 60*S, glow, 2);
            const capG = ctx.createRadialGradient(cx-15*S, cy-30*S, 5*S, cx, cy, 55*S);
            capG.addColorStop(0, lightenColor(base,30)); capG.addColorStop(0.6, base); capG.addColorStop(1, darkenColor(base,30));
            ctx.fillStyle = capG;
            ctx.beginPath(); ctx.ellipse(cx, cy, 55*S, 40*S, 0, Math.PI, 0); ctx.fill();
            ctx.beginPath(); ctx.ellipse(cx, cy, 55*S, 14*S, 0, 0, Math.PI*2); ctx.fill();
            // Spots
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            [[0,-22],[-20,-12],[20,-12],[-8,-32],[8,-32]].forEach(([dx,dy]) => {
                ctx.beginPath(); ctx.arc(cx+dx*S, cy+dy*S, 7*S, 0, Math.PI*2); ctx.fill();
            });
        } else if (isFlower) {
            // Stem
            ctx.strokeStyle = '#059669'; ctx.lineWidth = 5*S; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(cx, cy+70*S); ctx.quadraticCurveTo(cx-15*S, cy+20*S, cx, cy-10*S); ctx.stroke();
            // Leaf
            ctx.fillStyle = '#059669';
            ctx.beginPath(); ctx.ellipse(cx-25*S, cy+30*S, 20*S, 10*S, -0.5, 0, Math.PI*2); ctx.fill();
            // Petals
            const petalCol = base;
            for (let p = 0; p < 6; p++) {
                const angle = (p / 6) * Math.PI * 2;
                ctx.fillStyle = petalCol;
                ctx.save(); ctx.translate(cx, cy-10*S); ctx.rotate(angle);
                ctx.beginPath(); ctx.ellipse(0, -25*S, 10*S, 20*S, 0, 0, Math.PI*2); ctx.fill();
                ctx.restore();
            }
            // Center
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath(); ctx.arc(cx, cy-10*S, 14*S, 0, Math.PI*2); ctx.fill();
        } else {
            // Tree trunk
            const trunkG = ctx.createLinearGradient(cx-16*S, cy+20*S, cx+16*S, cy+80*S);
            trunkG.addColorStop(0,'#8b5e3c'); trunkG.addColorStop(1,'#5c3d1f');
            ctx.fillStyle = trunkG;
            ctx.beginPath(); ctx.roundRect(cx-16*S, cy+25*S, 32*S, 60*S, 4*S); ctx.fill();
            // Bark lines
            ctx.strokeStyle = darkenColor('#8b5e3c', 30); ctx.lineWidth = 2*S;
            ctx.beginPath(); ctx.moveTo(cx-5*S,cy+30*S); ctx.lineTo(cx-8*S,cy+80*S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx+5*S,cy+30*S); ctx.lineTo(cx+8*S,cy+80*S); ctx.stroke();
            // Foliage (layered)
            [[0,0,55*S,48*S],[0,-32*S,46*S,40*S],[0,-58*S,36*S,32*S]].forEach(([dx,dy,rw,rh],i) => {
                drawGlowHalo(cx+dx, cy+dy, rw*0.8, 'rgba(5,150,105,0.3)', 1);
                const leafG = ctx.createRadialGradient(cx+dx-rw*0.25, cy+dy-rh*0.25, rh*0.1, cx+dx, cy+dy, rw);
                leafG.addColorStop(0, i===0?'#6ee7b7':i===1?lightenColor(base,20):lightenColor(base,35));
                leafG.addColorStop(0.6, base);
                leafG.addColorStop(1, darkenColor(base,25));
                ctx.fillStyle = leafG;
                ctx.beginPath(); ctx.ellipse(cx+dx, cy+dy, rw, rh, 0, 0, Math.PI*2); ctx.fill();
            });
            // Random fruit
            if (acc !== '#3b82f6') {
                const fruitPositions = [[-28*S,-18*S],[22*S,-12*S],[0,-45*S]];
                fruitPositions.forEach(([fx,fy]) => {
                    ctx.fillStyle = acc;
                    ctx.beginPath(); ctx.arc(cx+fx, cy+fy, 8*S, 0, Math.PI*2); ctx.fill();
                    drawSpecular(cx+fx-2*S, cy+fy-2*S, 5*S, 0.4);
                });
            }
        }
        ctx.restore();
    }

    // ─── BUILDING / TOWER ──────────────────────────────────────────────────
    function drawBuildingAsset(cx, cy, base, acc, glow, style) {
        ctx.save();
        const S = canvas.width / 256;

        drawGlowHalo(cx, cy - 30*S, 60*S, glow, 2);
        drawDropShadow(cx, cy + 80*S, 55*S, 18*S, 0.5);

        const stone = base;
        const accent = acc;

        // Base / foundation
        ctx.fillStyle = darkenColor(stone, 30);
        ctx.beginPath(); ctx.roundRect(cx - 50*S, cy + 55*S, 100*S, 20*S, 4*S); ctx.fill();

        // Tower body
        const wallG = ctx.createLinearGradient(cx - 38*S, cy - 60*S, cx + 38*S, cy + 60*S);
        wallG.addColorStop(0, lightenColor(stone, 20)); wallG.addColorStop(0.5, stone); wallG.addColorStop(1, darkenColor(stone, 20));
        ctx.fillStyle = wallG;
        ctx.beginPath(); ctx.roundRect(cx - 36*S, cy - 55*S, 72*S, 115*S, 4*S); ctx.fill();

        // Stone bricks texture
        ctx.strokeStyle = darkenColor(stone, 35); ctx.lineWidth = 1.5*S;
        for (let row = 0; row < 8; row++) {
            const y = cy - 55*S + row * 14*S;
            const offset = (row % 2) * 18*S;
            for (let col = -2; col <= 2; col++) {
                ctx.strokeRect(cx + col * 36*S + offset - 18*S, y, 36*S, 14*S);
            }
        }

        // Door arch
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(cx, cy + 38*S, 18*S, Math.PI, 0);
        ctx.rect(cx - 18*S, cy + 38*S, 36*S, 18*S);
        ctx.fill();

        // Windows
        [[cx, cy - 30*S],[cx - 20*S, cy + 5*S],[cx + 20*S, cy + 5*S]].forEach(([wx, wy]) => {
            ctx.fillStyle = glowAlpha(glow, 0.7);
            ctx.beginPath(); ctx.arc(wx, wy - 4*S, 9*S, Math.PI, 0); ctx.rect(wx - 9*S, wy - 4*S, 18*S, 10*S); ctx.fill();
            ctx.strokeStyle = darkenColor(stone, 40); ctx.lineWidth = 2*S;
            ctx.beginPath(); ctx.arc(wx, wy - 4*S, 9*S, Math.PI, 0); ctx.stroke();
            ctx.beginPath(); ctx.rect(wx - 9*S, wy - 4*S, 18*S, 10*S); ctx.stroke();
        });

        // Battlements (top)
        ctx.fillStyle = lightenColor(stone, 10);
        for (let b = -3; b <= 3; b++) {
            if (b % 2 === 0) ctx.fillRect(cx + b * 12*S - 5*S, cy - 70*S, 10*S, 16*S);
        }

        // Pointed roof
        const roofG = ctx.createLinearGradient(cx, cy - 70*S, cx, cy - 110*S);
        roofG.addColorStop(0, accent); roofG.addColorStop(1, darkenColor(accent, 30));
        ctx.fillStyle = roofG;
        ctx.beginPath();
        ctx.moveTo(cx - 40*S, cy - 70*S);
        ctx.lineTo(cx, cy - 112*S);
        ctx.lineTo(cx + 40*S, cy - 70*S);
        ctx.closePath(); ctx.fill();

        // Flag on top
        ctx.strokeStyle = '#8b5e3c'; ctx.lineWidth = 2.5*S;
        ctx.beginPath(); ctx.moveTo(cx, cy - 112*S); ctx.lineTo(cx, cy - 130*S); ctx.stroke();
        ctx.fillStyle = '#dc2626';
        ctx.beginPath(); ctx.moveTo(cx, cy - 130*S); ctx.lineTo(cx + 20*S, cy - 122*S); ctx.lineTo(cx, cy - 114*S); ctx.closePath(); ctx.fill();

        ctx.restore();
    }
    // --- Curated Free 3D Models Database ---
    const searchModelsData = [
        { name: "Espada de Caballero", icon: "⚔️", badge: "Arma", seed: "espada", prompt: "espada de caballero antigua con runas" },
        { name: "Sable de Pirata", icon: "🗡️", badge: "Arma", seed: "espada", prompt: "sable pirata gastado de acero y empuñadura de cuero" },
        { name: "Báculo Arcano", icon: "🧙", badge: "Mágico", seed: "baston", prompt: "baston magico de madera de roble con gema de cristal brillante" },
        { name: "Escudo Templario", icon: "🛡️", badge: "Defensa", seed: "escudo", prompt: "escudo templario de metal pesado con cruz roja" },
        { name: "Yelmo de Hierro", icon: "🪖", badge: "Casco", seed: "casco", prompt: "casco yelmo de caballero medieval de hierro forjado" },
        { name: "Cofre del Tesoro", icon: "📦", badge: "Cofre", seed: "cofre", prompt: "cofre del tesoro de madera y oro con cerradura antigua" },
        { name: "Poción de Vida", icon: "🧪", badge: "Poción", seed: "pocion", prompt: "pocion de vida elixir rojo en frasco de cristal redondo" },
        { name: "Poción de Veneno", icon: "☠️", badge: "Poción", seed: "pocion", prompt: "pocion de veneno liquido verde acido burbujeante" },
        { name: "Anillo del Poder", icon: "💍", badge: "Anillo", seed: "anillo", prompt: "anillo de oro con gema preciosa de rubi rojo" },
        { name: "Llave de Mazmorra", icon: "🔑", badge: "Llave", seed: "llave", prompt: "llave antigua de bronce de mazmorra" },
        { name: "Pergamino Sagrado", icon: "📜", badge: "Pergamino", seed: "pergamino", prompt: "pergamino antiguo de cuero con sellos magicos" },
        { name: "Moneda de Oro", icon: "🪙", badge: "Moneda", seed: "moneda", prompt: "moneda de oro antigua acuñada con corona" }
    ];

    function populateModelSearchResults(query = "") {
        const grid = document.getElementById('model-results-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        const q = query.toLowerCase();
        
        const filtered = searchModelsData.filter(m => 
            m.name.toLowerCase().includes(q) || 
            m.badge.toLowerCase().includes(q) ||
            m.prompt.toLowerCase().includes(q)
        );
        
        if (filtered.length === 0) {
            grid.innerHTML = '<div style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 2rem;">No se encontraron modelos.</div>';
            return;
        }
        
        filtered.forEach(model => {
            const card = document.createElement('div');
            card.className = 'model-card';
            card.innerHTML = `
                <div class="model-card-icon">${model.icon}</div>
                <div class="model-card-title">${model.name}</div>
                <span class="model-card-badge">${model.badge}</span>
            `;
            
            card.addEventListener('click', () => {
                promptInput.value = model.prompt;
                
                // Switch back to AI Forge tab
                const leftTabAi = document.getElementById('left-tab-ai');
                if (leftTabAi) leftTabAi.click();
                
                // Show notification text and trigger procedural generator
                showNotification(`Cargando modelo "${model.name}"...`);
                generateProceduralAsset(model.prompt);
                switchWorkspace('split');
            });
            grid.appendChild(card);
        });
    }

    // --- Interactive Toast Notification Helper ---
    function showNotification(message) {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: rgba(15, 23, 42, 0.95);
                border: 1px solid var(--accent);
                color: var(--text-light);
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                font-family: 'Plus Jakarta Sans', sans-serif;
                font-size: 0.9rem;
                font-weight: 500;
                z-index: 9999;
                opacity: 0;
                transform: translateY(10px);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<i data-lucide="info" style="color:var(--accent); width:18px; height:18px;"></i> <span>${message}</span>`;
        if (window.lucide) window.lucide.createIcons({ attrs: { style: 'width:18px; height:18px;' } });
        
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
        }, 3000);
    }

    // ─── SCENE / LANDSCAPE ──────────────────────────────────────────────────
    function drawSceneAsset(cx, cy, base, acc, glow, style) {
        ctx.save();
        const w = canvas.width;
        const h = canvas.height;
        const S = w / 256;
        const px = style === 'pixel';

        // 1. Sky Gradient (from horizon to zenith)
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, darkenColor(base, 50));
        skyGrad.addColorStop(0.6, base);
        skyGrad.addColorStop(1, lightenColor(acc, 20));
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        // 2. Sun / Moon
        const sunX = w * 0.7;
        const sunY = h * 0.25;
        const sunR = 24 * S;
        ctx.save();
        if (!px) {
            // Glowing sun halo
            drawGlowHalo(sunX, sunY, sunR * 2.2, glowAlpha(glow, 0.45), 3);
        }
        ctx.fillStyle = '#fffbeb';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 3. Clouds
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        const drawCloud = (cx2, cy2, cw) => {
            ctx.beginPath();
            if (px) {
                // Pixel blocks cloud
                ctx.fillRect(cx2 - cw*0.6, cy2 - 4*S, cw*1.2, 10*S);
                ctx.fillRect(cx2 - cw*0.4, cy2 - 10*S, cw*0.8, 10*S);
                ctx.fillRect(cx2 - cw*0.2, cy2 - 14*S, cw*0.4, 10*S);
            } else {
                ctx.ellipse(cx2, cy2, cw, cw * 0.4, 0, 0, Math.PI * 2);
                ctx.ellipse(cx2 - cw*0.4, cy2 - 4*S, cw * 0.5, cw * 0.4, 0, 0, Math.PI * 2);
                ctx.ellipse(cx2 + cw*0.4, cy2 - 4*S, cw * 0.5, cw * 0.4, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fill();
        };
        drawCloud(w * 0.3, h * 0.2, 38 * S);
        drawCloud(w * 0.8, h * 0.15, 26 * S);

        // 4. Distant Mountains (Layer 1 - Far)
        ctx.fillStyle = darkenColor(base, 25);
        ctx.beginPath();
        if (px) {
            ctx.moveTo(0, h);
            ctx.lineTo(0, h * 0.6);
            ctx.lineTo(w * 0.25, h * 0.45);
            ctx.lineTo(w * 0.5, h * 0.65);
            ctx.lineTo(w * 0.75, h * 0.5);
            ctx.lineTo(w, h * 0.62);
            ctx.lineTo(w, h);
        } else {
            ctx.moveTo(0, h);
            ctx.lineTo(0, h * 0.6);
            ctx.quadraticCurveTo(w * 0.25, h * 0.4, w * 0.5, h * 0.6);
            ctx.quadraticCurveTo(w * 0.75, h * 0.45, w, h * 0.6);
            ctx.lineTo(w, h);
        }
        ctx.closePath(); ctx.fill();

        // 5. Midground Mountains (Layer 2)
        ctx.fillStyle = darkenColor(base, 10);
        ctx.beginPath();
        if (px) {
            ctx.moveTo(0, h);
            ctx.lineTo(0, h * 0.7);
            ctx.lineTo(w * 0.35, h * 0.55);
            ctx.lineTo(w * 0.6, h * 0.72);
            ctx.lineTo(w * 0.82, h * 0.58);
            ctx.lineTo(w, h * 0.75);
            ctx.lineTo(w, h);
        } else {
            ctx.moveTo(0, h);
            ctx.lineTo(0, h * 0.7);
            ctx.quadraticCurveTo(w * 0.38, h * 0.52, w * 0.65, h * 0.7);
            ctx.quadraticCurveTo(w * 0.85, h * 0.55, w, h * 0.72);
            ctx.lineTo(w, h);
        }
        ctx.closePath(); ctx.fill();

        // 6. Foreground Terrain / Hills (Layer 3 - Close)
        const foreGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
        foreGrad.addColorStop(0, darkenColor(acc, 30));
        foreGrad.addColorStop(1, darkenColor(acc, 50));
        ctx.fillStyle = foreGrad;
        ctx.beginPath();
        if (px) {
            ctx.moveTo(0, h);
            ctx.lineTo(0, h * 0.82);
            ctx.lineTo(w * 0.3, h * 0.78);
            ctx.lineTo(w * 0.7, h * 0.85);
            ctx.lineTo(w, h * 0.8);
            ctx.lineTo(w, h);
        } else {
            ctx.moveTo(0, h);
            ctx.lineTo(0, h * 0.8);
            ctx.quadraticCurveTo(w * 0.4, h * 0.75, w * 0.75, h * 0.83);
            ctx.quadraticCurveTo(w * 0.9, h * 0.78, w, h * 0.82);
            ctx.lineTo(w, h);
        }
        ctx.closePath(); ctx.fill();

        // 7. Silhouetted Pine Trees in foreground
        const drawPine = (tx, ty, th) => {
            const tw = th * 0.45;
            ctx.fillStyle = darkenColor(acc, 55);
            
            // Trunk
            ctx.fillRect(tx - 2*S, ty, 4*S, th * 0.35);

            // Leaf triangles
            ctx.beginPath();
            if (px) {
                ctx.moveTo(tx, ty - th);
                ctx.lineTo(tx - tw, ty - th * 0.3);
                ctx.lineTo(tx + tw, ty - th * 0.3);
            } else {
                ctx.moveTo(tx, ty - th);
                ctx.quadraticCurveTo(tx - tw * 0.5, ty - th * 0.75, tx - tw, ty - th * 0.35);
                ctx.lineTo(tx + tw, ty - th * 0.35);
                ctx.quadraticCurveTo(tx + tw * 0.5, ty - th * 0.75, tx, ty - th);
            }
            ctx.closePath(); ctx.fill();
        };

        // Draw a small forest grouping on the hills
        drawPine(w * 0.15, h * 0.85, 36 * S);
        drawPine(w * 0.22, h * 0.88, 24 * S);
        drawPine(w * 0.78, h * 0.9, 44 * S);
        drawPine(w * 0.86, h * 0.92, 30 * S);

        ctx.restore();
    }

    // --- High-Quality 2D/3D Silhouette & Texturing Effects ---
    function applyHighQualityEffects(style) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);

        const w = canvas.width;
        const h = canvas.height;

        // ═══════════════════════════════════════════════════════════
        // 1. PIXEL ART — quantize colors + sharp outlines
        // ═══════════════════════════════════════════════════════════
        if (style === 'pixel') {
            // Reduce palette to chunky pixels (2× downscale/upscale trick)
            const factor = Math.max(2, Math.round(w / 64));
            const tiny = document.createElement('canvas');
            tiny.width  = Math.round(w / factor);
            tiny.height = Math.round(h / factor);
            const tinyCtx = tiny.getContext('2d');
            tinyCtx.imageSmoothingEnabled = false;
            tinyCtx.drawImage(tempCanvas, 0, 0, tiny.width, tiny.height);
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(tiny, 0, 0, w, h);

            // Refresh tempCanvas with quantized version
            tempCtx.clearRect(0, 0, w, h);
            tempCtx.drawImage(canvas, 0, 0);
        }

        // ═══════════════════════════════════════════════════════════
        // 2. OUTLINES — thick + sharp for cartoon/pixel, thin for others
        // ═══════════════════════════════════════════════════════════
        if (style === 'cartoon' || style === 'pixel') {
            ctx.save();
            const outlineW = style === 'pixel'
                ? Math.max(1, Math.round(w / 128))
                : Math.max(2, Math.round(w / 80));
            ctx.globalCompositeOperation = 'destination-over';
            ctx.globalAlpha = 1;
            // Black silhouette pushed in 8 directions
            const offsets = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
            for (const [dx, dy] of offsets) {
                ctx.drawImage(tempCanvas, dx * outlineW, dy * outlineW);
            }
            ctx.restore();

            // Inner line-art shading: dark edges inside the shape
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.15;
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.restore();
        } else if (style === 'vector') {
            // Thin crisp outline
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.globalAlpha = 0.7;
            const ov = Math.max(1, Math.round(w / 200));
            [[0,-ov],[0,ov],[-ov,0],[ov,0]].forEach(([dx,dy]) => ctx.drawImage(tempCanvas, dx, dy));
            ctx.restore();
        } else {
            // Realistic/voxel: ultra-thin shadow edge
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.globalAlpha = 0.45;
            const rv = Math.max(1, Math.round(w / 220));
            [[rv,rv],[-rv,rv]].forEach(([dx,dy]) => ctx.drawImage(tempCanvas, dx, dy));
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════════════
        // 3. DIRECTIONAL LIGHTING — top-left key light + bottom-right fill
        // ═══════════════════════════════════════════════════════════
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';

        // Key light: upper-left illumination
        const keyLight = ctx.createLinearGradient(0, 0, w * 0.6, h * 0.7);
        keyLight.addColorStop(0,   'rgba(255,255,240,0.14)');
        keyLight.addColorStop(0.3, 'rgba(255,255,255,0.06)');
        keyLight.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = keyLight;
        ctx.fillRect(0, 0, w, h);

        // Fill light: lower-right shadow
        const fillLight = ctx.createLinearGradient(w, h, w * 0.4, h * 0.3);
        fillLight.addColorStop(0,   'rgba(20,10,40,0.20)');
        fillLight.addColorStop(0.4, 'rgba(0,0,0,0.10)');
        fillLight.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = fillLight;
        ctx.fillRect(0, 0, w, h);

        ctx.restore();

        // ═══════════════════════════════════════════════════════════
        // 4. RIM LIGHT — subtle cool-blue edge on right side
        // ═══════════════════════════════════════════════════════════
        if (style === 'realistic' || style === 'cartoon') {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = style === 'realistic' ? 0.08 : 0.05;
            const rimLight = ctx.createLinearGradient(w, 0, w * 0.5, h);
            rimLight.addColorStop(0,   'rgba(120,180,255,1)');
            rimLight.addColorStop(0.15,'rgba(60,120,255,0.5)');
            rimLight.addColorStop(1,   'rgba(0,0,0,0)');
            ctx.fillStyle = rimLight;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════════════
        // 5. AMBIENT OCCLUSION — darken corners & contact points
        // ═══════════════════════════════════════════════════════════
        if (style !== 'pixel') {
            ctx.save();
            ctx.globalCompositeOperation = 'source-atop';
            // Corner darkening
            const ao = ctx.createRadialGradient(w/2, h/2, h * 0.25, w/2, h/2, h * 0.6);
            ao.addColorStop(0, 'rgba(0,0,0,0)');
            ao.addColorStop(1, 'rgba(0,0,0,0.12)');
            ctx.fillStyle = ao;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════════════
        // 6. CEL SHADE STEP — cartoon style gets hard shadow bands
        // ═══════════════════════════════════════════════════════════
        if (style === 'cartoon') {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.10;
            // Diagonal shadow band from top-right to lower-left
            const celGrad = ctx.createLinearGradient(w, 0, 0, h);
            celGrad.addColorStop(0,   'rgba(60,40,120,1)');
            celGrad.addColorStop(0.4, 'rgba(60,40,120,0)');
            celGrad.addColorStop(0.6, 'rgba(60,40,120,0)');
            celGrad.addColorStop(1,   'rgba(60,40,120,0.8)');
            ctx.fillStyle = celGrad;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════════════
        // 7. FILM GRAIN — adds texture and depth
        // ═══════════════════════════════════════════════════════════
        if (style === 'realistic' || style === 'vector' || style === 'cartoon') {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            const grainAlpha = style === 'realistic' ? 0.04 : 0.018;
            const grainSize  = style === 'realistic' ? 2 : 3;
            ctx.globalAlpha = grainAlpha;
            for (let i = 0; i < w; i += grainSize) {
                for (let j = 0; j < h; j += grainSize) {
                    const v = Math.random() > 0.5 ? 255 : 0;
                    ctx.fillStyle = `rgb(${v},${v},${v})`;
                    ctx.fillRect(i, j, grainSize, grainSize);
                }
            }
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════════════
        // 8. CHROMATIC ABERRATION (subtle) — realistic only
        // ═══════════════════════════════════════════════════════════
        if (style === 'realistic') {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.025;
            // Red channel shifted left
            ctx.drawImage(tempCanvas, -1, 0);
            ctx.restore();
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.015;
            // Blue channel shifted right
            ctx.drawImage(tempCanvas, 1, 0);
            ctx.restore();
        }

        // ═══════════════════════════════════════════════════════════
        // 9. VIGNETTE — final cinematic frame
        // ═══════════════════════════════════════════════════════════
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        const vignette = ctx.createRadialGradient(w/2, h/2, w * 0.28, w/2, h/2, w * 0.56);
        vignette.addColorStop(0, 'rgba(255,255,255,0.015)');
        vignette.addColorStop(0.6, 'rgba(0,0,0,0)');
        vignette.addColorStop(1,   'rgba(0,0,0,0.18)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    init();
});
