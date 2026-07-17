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

        // Quick color swatches
        const swatches = document.querySelectorAll('#color-swatches .swatch');
        swatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.getAttribute('data-color');
                state.primaryColor = color;
                primaryColorInput.value = color;
                colorIndicator.style.backgroundColor = color;
                // Update selected state
                swatches.forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
                // Switch to brush if not already on a drawing tool
                if (state.activeTool !== 'brush' && state.activeTool !== 'eraser' && state.activeTool !== 'fill') {
                    setTool('brush');
                }
            });
        });

        primaryColorInput.addEventListener('input', (e) => {
            state.primaryColor = e.target.value;
            colorIndicator.style.backgroundColor = state.primaryColor;
        });
        // 'change' fires when user closes the color picker (some browsers)
        primaryColorInput.addEventListener('change', (e) => {
            state.primaryColor = e.target.value;
            colorIndicator.style.backgroundColor = state.primaryColor;
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

            // Regenerate button
            document.getElementById('char-regenerate-btn').addEventListener('click', () => {
                redrawActiveCharacter();
                saveHistoryState();
            });
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
    function triggerAIGenerate() {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            alert('Por favor, escribe lo que quieres crear en la caja de prompt.');
            return;
        }

        showLoader('Conectando con el motor AI...', 'Inicializando modelo latente');
        
        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.floor(Math.random() * 8) + 4;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                
                // Finalize generation
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
        const isNoble     = matchesAny(['noble','rey','king','queen','reina','prince','principe','princess','princesa','lord','lady','duke']);
        const isElder     = matchesAny(['anciano','elder','viejo','old man','grandpa','abuelo','abuela']);
        const isChild     = matchesAny(['niño','nino','child','kid','boy','girl','chico','chica']);
        const isBlacksmith= matchesAny(['herrero','blacksmith','forjador']);
        const isInnkeeper = matchesAny(['posadero','innkeeper','tabernero']);
        const isBandit    = matchesAny(['bandido','bandit','ladron','thug','pirata','pirate','outlaw']);
        
        const isCharacter = isWarrior || isMage || isRogue || isHealer || isArcher || isPaladin ||
                            isMerchant || isVillager || isGuard || isNoble || isElder || isChild ||
                            isBlacksmith || isInnkeeper || isBandit ||
                            matchesAny(['personaje','character','hero','heroe','heroine','heroina','protagonista','player','jugador','avatar','npc','persona','human','humano','hombre','mujer']);

        // Creatures & monsters
        const isSlime     = matchesAny(['slime','limo','gelatina','blob','ameba']);
        const isGoblin    = matchesAny(['goblin','kobold','gnome','gnomo','duende']);
        const isSkeleton  = matchesAny(['skeleton','esqueleto','undead','muerto','zombie','lich','liche']);
        const isDragon    = matchesAny(['dragon','drake','wyrm','serpiente alada','dragón']);
        const isOrc       = matchesAny(['orc','orco','ogro','ogre','troll']);
        const isGhost     = matchesAny(['ghost','fantasma','espiritu','spirit','wraith','banshee','phantom']);
        const isSpider    = matchesAny(['spider','araña','aracnido','scorpion','escorpion']);
        const isBat       = matchesAny(['bat','murcielago','vampiro','vampire']);
        const isWolf      = matchesAny(['wolf','lobo','werewolf','licantro','lycanthrope','dog','perro','beast']);
        const isGolem     = matchesAny(['golem','construct','elemental','robot','automaton','automata']);
        const isBoss      = matchesAny(['jefe','boss','final boss','raid','demonio','demon','diablo','devil','titan','gigante','giant']);
        const isCreature  = isSlime || isGoblin || isSkeleton || isDragon || isOrc ||
                            isGhost || isSpider || isBat || isWolf || isGolem || isBoss ||
                            matchesAny(['monstruo','monster','criatura','creature','enemy','enemigo','bestia','beast','evil','maligno']);

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
                else if (isElder) typeToSelect = 'elder';
                else if (isChild) typeToSelect = 'child';
                else if (isBlacksmith) typeToSelect = 'blacksmith';
                else if (isInnkeeper) typeToSelect = 'innkeeper';
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

        // Weapons & items
        const isSword     = matchesAny(['espada','sword','katana','sable','daga','dagger','cuchillo','knife','hacha','axe','lanza','spear','pica','pike','mangual','flail']);
        const isBow       = matchesAny(['arco','bow','flecha','arrow','ballesta','crossbow','sling','honda']);
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
                drawSwordAsset(cx, cy, baseColor, accentColor, glowColor, style);
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
            } else {
                // Default: Magic Orb
                drawGemAsset(cx, cy, baseColor, accentColor, glowColor, style);
            }
        }
        
        // Apply premium canvas shading, grain and outline effects
        applyHighQualityEffects(style);
        
        if (style === 'realistic' || style === 'vector' || style === 'cartoon') {
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
    function drawSwordAsset(cx, cy, base, acc, glowCol, style) {
        ctx.save();
        
        // Diagonal rotation for traditional RPG sprite layout
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 4);
        ctx.translate(-cx, -cy);
        
        const pixelated = style === 'pixel';
        const realistic = style === 'realistic';
        const S = canvas.width / 256; // scale factor for resolution-independent drawing
        
        const bladeLen = canvas.height * 0.52;
        const bladeW   = pixelated ? 8 : (realistic ? Math.round(20 * S) : Math.round(14 * S));
        const guardW   = pixelated ? 24 : (realistic ? Math.round(56 * S) : Math.round(40 * S));
        const guardH   = realistic ? Math.round(10 * S) : Math.round(7 * S);

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

            // Outer rim — polished steel bevel
            const rimG = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
            rimG.addColorStop(0,    '#f8fafc');
            rimG.addColorStop(0.15, '#94a3b8');
            rimG.addColorStop(0.45, adjustBrightness(acc, -10));
            rimG.addColorStop(0.75, adjustBrightness(acc, -35));
            rimG.addColorStop(1,    '#0f172a');
            ctx.fillStyle = rimG;
            shieldPath(cx, cy, w, h); ctx.fill();

            // Rim highlight
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = Math.round(2 * S);
            shieldPath(cx, cy, w - bevel * 0.5, h - bevel * 0.5);
            ctx.stroke();

            // Inner enamel face
            const faceG = ctx.createRadialGradient(cx - w * 0.15, cy - h * 0.12, Math.round(8 * S), cx, cy, h * 0.55);
            faceG.addColorStop(0,   adjustBrightness(base, 40));
            faceG.addColorStop(0.4, base);
            faceG.addColorStop(1,   adjustBrightness(base, -45));
            ctx.fillStyle = faceG;
            shieldPath(cx, cy, w - bevel * 2, h - bevel * 2); ctx.fill();

            // Boss (center metal knob)
            const bossR = Math.round(18 * S);
            const bossG = ctx.createRadialGradient(cx - bossR * 0.3, cy - bossR * 0.3, 1, cx, cy, bossR * 1.1);
            bossG.addColorStop(0,   '#f8fafc');
            bossG.addColorStop(0.3, acc);
            bossG.addColorStop(0.7, adjustBrightness(acc, -30));
            bossG.addColorStop(1,   '#0f172a');
            ctx.fillStyle = bossG;
            ctx.beginPath(); ctx.arc(cx, cy, bossR, 0, Math.PI * 2); ctx.fill();
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
            ctx.fillStyle = acc;
            shieldPath(cx, cy, w, h); ctx.fill();

            ctx.fillStyle = base;
            shieldPath(cx, cy, w - bevel * 2, h - bevel * 2); ctx.fill();

            if (!pixelated) { ctx.shadowColor = base; ctx.shadowBlur = Math.round(12 * S); }
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy - Math.round(10 * S), Math.round(13 * S), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Simple cross emblem
            ctx.fillStyle = acc;
            ctx.fillRect(cx - Math.round(2.5 * S), cy - Math.round(20 * S), Math.round(5 * S), Math.round(20 * S));
            ctx.fillRect(cx - Math.round(10 * S), cy - Math.round(13 * S), Math.round(20 * S), Math.round(5 * S));
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
        const radius = pixelated ? 52 : Math.round(72 * S);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 5); // tilt
        ctx.translate(-cx, -cy);

        if (realistic) {
            // Bow body — curved wood limb
            const bowG = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
            bowG.addColorStop(0,   adjustBrightness(base, 30));
            bowG.addColorStop(0.25, base);
            bowG.addColorStop(0.6,  adjustBrightness(base, -20));
            bowG.addColorStop(1,   adjustBrightness(base, -40));
            ctx.strokeStyle = bowG;
            ctx.lineWidth = Math.round(10 * S);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx + radius * 0.35, cy, radius, Math.PI * 0.55, Math.PI * 1.45);
            ctx.stroke();
            // Specular streak along bow
            ctx.strokeStyle = 'rgba(255,255,255,0.28)';
            ctx.lineWidth = Math.round(2.5 * S);
            ctx.beginPath();
            ctx.arc(cx + radius * 0.35 + Math.round(2 * S), cy, radius - Math.round(2 * S), Math.PI * 0.62, Math.PI * 1.38);
            ctx.stroke();
            // String
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = Math.max(1, Math.round(1.5 * S));
            const topX = cx + radius * 0.35 + radius * Math.cos(Math.PI * 0.55);
            const topY = cy + radius * Math.sin(Math.PI * 0.55);
            const botX = cx + radius * 0.35 + radius * Math.cos(Math.PI * 1.45);
            const botY = cy + radius * Math.sin(Math.PI * 1.45);
            ctx.beginPath();
            ctx.moveTo(topX, topY);
            ctx.quadraticCurveTo(cx + radius * 0.22, cy, botX, botY);
            ctx.stroke();
            // Arrow on string
            ctx.strokeStyle = acc;
            ctx.lineWidth = Math.round(3 * S);
            ctx.beginPath();
            ctx.moveTo(cx + radius * 0.3, cy - radius * 0.8);
            ctx.lineTo(cx + radius * 0.3, cy + radius * 0.8);
            ctx.stroke();
            drawGlowHalo(cx, cy, radius * 0.55, glowCol, 2);
        } else {
            ctx.strokeStyle = base;
            ctx.lineWidth = pixelated ? 6 : Math.round(8 * S);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(cx + radius * 0.35, cy, radius, Math.PI * 0.55, Math.PI * 1.45);
            ctx.stroke();
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = pixelated ? 1 : Math.round(2 * S);
            const topX2 = cx + radius * 0.35 + radius * Math.cos(Math.PI * 0.55);
            const topY2 = cy + radius * Math.sin(Math.PI * 0.55);
            const botX2 = cx + radius * 0.35 + radius * Math.cos(Math.PI * 1.45);
            const botY2 = cy + radius * Math.sin(Math.PI * 1.45);
            ctx.beginPath(); ctx.moveTo(topX2, topY2); ctx.quadraticCurveTo(cx + radius * 0.22, cy, botX2, botY2); ctx.stroke();
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
        // Use 32x32 grid for detailed yet performant voxels
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
                            metalness: 0.15
                        });
                    }
                    
                    const posX = (x - size / 2) * voxelW;
                    const posY = ((size - y) - size / 2) * voxelW;
                    
                    // Extrusion depth layers to give it 3D thickness
                    const depth = 2;
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
        group.position.y = 0.3;
        return group;
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
                // Grip (longer, slightly curved representation)
                const gripGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.45, 12);
                const gripMatCustom = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }); // Black wrap
                const grip = new THREE.Mesh(gripGeo, gripMatCustom);
                grip.position.set(-0.02, -0.42, 0);
                grip.rotation.z = 0.08; // slightly angled grip
                group.add(grip);

                // Kashira (pommel cap)
                const pommelGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12);
                const pommel = new THREE.Mesh(pommelGeo, goldMat);
                pommel.position.set(-0.04, -0.65, 0);
                pommel.rotation.z = 0.08;
                group.add(pommel);

                // Tsuba (Japanese Circular Guard)
                const guardGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.02, 24);
                const guard = new THREE.Mesh(guardGeo, goldMat);
                guard.position.set(0, -0.2, 0);
                guard.rotation.x = Math.PI / 2;
                group.add(guard);

                // Curved Katana Blade built from 6 connected, angled segments
                const segments = 6;
                const segmentHeight = 0.22;
                let currentY = -0.2;
                let currentX = 0;
                let currentRotation = 0;

                for (let i = 0; i < segments; i++) {
                    const segGeo = new THREE.BoxGeometry(0.02, segmentHeight, 0.07);
                    const seg = new THREE.Mesh(segGeo, bladeMat);
                    
                    // Position at top of previous segment
                    seg.position.set(
                        currentX + Math.sin(currentRotation) * (segmentHeight / 2),
                        currentY + Math.cos(currentRotation) * (segmentHeight / 2),
                        0
                    );
                    seg.rotation.z = -currentRotation;
                    seg.castShadow = true;
                    group.add(seg);

                    // Update cursor for next segment (gradually curve to the left/right)
                    currentX += Math.sin(currentRotation) * segmentHeight;
                    currentY += Math.cos(currentRotation) * segmentHeight;
                    currentRotation += 0.06; // curvature step
                }
            } else {
                // --- 3D Traditional Medieval Sword ---
                // Grip
                const gripGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 12);
                const grip = new THREE.Mesh(gripGeo, woodMat);
                grip.position.y = -0.4;
                group.add(grip);
                
                // Pommel
                const pommelGeo = new THREE.SphereGeometry(0.06, 12, 12);
                const pommel = new THREE.Mesh(pommelGeo, goldMat);
                pommel.position.y = -0.58;
                group.add(pommel);
                
                // Guard
                const guardGeo = new THREE.BoxGeometry(0.44, 0.06, 0.08);
                const guard = new THREE.Mesh(guardGeo, steelMat);
                guard.position.y = -0.2;
                group.add(guard);
                
                // Blade
                const bladeGeo = new THREE.CylinderGeometry(0.005, 0.07, 1.2, 4);
                const blade = new THREE.Mesh(bladeGeo, bladeMat);
                blade.scale.set(1.4, 1, 0.15); // sharp edge diamond scaling
                blade.position.y = 0.4;
                group.add(blade);
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
            const corkGeo = new THREE.CylinderGeometry(0.13, 0.1, 0.12, 12);
            const cork = new THREE.Mesh(corkGeo, woodMat);
            cork.position.y = 0.65;
            group.add(cork);
            
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
        }
        else if (prompt.includes('escudo') || prompt.includes('shield')) {
            // --- 3D Shield ---
            // Shield Body
            const shieldGeo = new THREE.BoxGeometry(0.8, 1.0, 0.06);
            const shield = new THREE.Mesh(shieldGeo, materials.customMaterial);
            shield.position.y = 0.1;
            group.add(shield);
            
            // Metal rim
            const rimGeo = new THREE.BoxGeometry(0.86, 1.06, 0.08);
            const rim = new THREE.Mesh(rimGeo, steelMat);
            rim.position.set(0, 0.1, -0.01);
            group.add(rim);
        }
        else if (prompt.includes('cofre') || prompt.includes('chest') || prompt.includes('caja')) {
            // --- 3D Chest ---
            // Base
            const baseGeo = new THREE.BoxGeometry(1.0, 0.5, 0.75);
            const baseMesh = new THREE.Mesh(baseGeo, materials.customMaterial);
            baseMesh.position.y = -0.15;
            group.add(baseMesh);
            
            // Lid
            const lidGeo = new THREE.CylinderGeometry(0.375, 0.375, 1.0, 24, 1, false, 0, Math.PI);
            const lidMesh = new THREE.Mesh(lidGeo, materials.customMaterial);
            lidMesh.rotation.z = Math.PI / 2;
            lidMesh.position.y = 0.1;
            group.add(lidMesh);
            
            // Lock
            const lockGeo = new THREE.BoxGeometry(0.12, 0.12, 0.05);
            const lock = new THREE.Mesh(lockGeo, goldMat);
            lock.position.set(0, 0.1, 0.38);
            group.add(lock);
        }
        else if (prompt.includes('casco') || prompt.includes('helmet') || prompt.includes('yelmo')) {
            // --- 3D Helmet ---
            const domeGeo = new THREE.SphereGeometry(0.48, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
            const dome = new THREE.Mesh(domeGeo, steelMat);
            dome.position.y = 0.15;
            group.add(dome);

            const visGeo = new THREE.BoxGeometry(0.55, 0.18, 0.4);
            const visor = new THREE.Mesh(visGeo, bladeMat);
            visor.position.set(0, 0.22, 0.28);
            group.add(visor);
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
            // --- 3D Staff ---
            const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.4, 12);
            const shaft = new THREE.Mesh(shaftGeo, woodMat);
            shaft.position.y = 0.1;
            group.add(shaft);

            const headGeo = new THREE.SphereGeometry(0.15, 16, 16);
            const head = new THREE.Mesh(headGeo, bladeMat);
            head.position.y = 0.85;
            group.add(head);
        }
        else if (prompt.includes('llave') || prompt.includes('key')) {
            // --- 3D Key ---
            const loopGeo = new THREE.TorusGeometry(0.16, 0.04, 8, 24);
            const loop = new THREE.Mesh(loopGeo, goldMat);
            loop.position.y = -0.4;
            group.add(loop);

            const shaftGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 12);
            const shaft = new THREE.Mesh(shaftGeo, goldMat);
            shaft.position.y = 0.05;
            group.add(shaft);

            const bitGeo = new THREE.BoxGeometry(0.15, 0.22, 0.04);
            const bit = new THREE.Mesh(bitGeo, goldMat);
            bit.position.set(-0.1, 0.35, 0);
            group.add(bit);
        }
        else if (prompt.includes('pergamino') || prompt.includes('scroll') || prompt.includes('libro') || prompt.includes('book')) {
            // --- 3D Scroll ---
            const sheetGeo = new THREE.BoxGeometry(0.8, 0.02, 0.55);
            const sheet = new THREE.Mesh(sheetGeo, materials.customMaterial);
            sheet.position.y = 0.1;
            group.add(sheet);

            const rollGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.6, 16);
            const rollL = new THREE.Mesh(rollGeo, woodMat);
            rollL.rotation.x = Math.PI / 2;
            rollL.position.set(-0.43, 0.1, 0);
            const rollR = new THREE.Mesh(rollGeo, woodMat);
            rollR.rotation.x = Math.PI / 2;
            rollR.position.set(0.43, 0.1, 0);
            group.add(rollL);
            group.add(rollR);
        }
        else if (prompt.includes('personaje') || prompt.includes('character') || prompt.includes('npc') || prompt.includes('humano') || prompt.includes('guerrero') || prompt.includes('warrior') || prompt.includes('mago') || prompt.includes('mage') || prompt.includes('pícaro') || prompt.includes('rogue') || prompt.includes('sanador') || prompt.includes('healer') || prompt.includes('goblin') || prompt.includes('esqueleto') || prompt.includes('skeleton') || prompt.includes('orco') || prompt.includes('orc') || prompt.includes('ghost') || prompt.includes('fantasma') || prompt.includes('slime') || prompt.includes('monstruo') || prompt.includes('monster') || prompt.includes('golem') || prompt.includes('boss')) {
            // --- Stylized Premium 3D Character Model ---
            // Torso (maps custom texture!)
            const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.36);
            const torso = new THREE.Mesh(torsoGeo, materials.customMaterial);
            torso.position.y = 0.35;
            torso.castShadow = true;
            torso.receiveShadow = true;
            group.add(torso);

            // Head (procedural skin coloring matching the theme)
            const skinColorHex = document.querySelector('.skin-swatch.selected')?.getAttribute('data-skin') || '#fde8d0';
            const headGeo = new THREE.SphereGeometry(0.24, 32, 32);
            const headMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(skinColorHex),
                roughness: 0.6,
                metalness: 0.1
            });
            const head = new THREE.Mesh(headGeo, headMat);
            head.position.y = 0.82;
            head.castShadow = true;
            group.add(head);

            // Hair (matching active selection)
            const hairColorHex = document.querySelector('.hair-swatch.selected')?.getAttribute('data-hair') || '#1a0a00';
            const hairGeo = new THREE.SphereGeometry(0.26, 16, 16, 0, Math.PI * 2, 0, Math.PI / 1.6);
            const hairMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(hairColorHex),
                roughness: 0.85
            });
            const hair = new THREE.Mesh(hairGeo, hairMat);
            hair.position.set(0, 0.86, -0.02);
            hair.rotation.x = 0.2;
            hair.castShadow = true;
            group.add(hair);

            // Legs
            const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 12);
            const legMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
            const legL = new THREE.Mesh(legGeo, legMat);
            legL.position.set(-0.15, -0.15, 0);
            legL.castShadow = true;
            const legR = new THREE.Mesh(legGeo, legMat);
            legR.position.set(0.15, -0.15, 0);
            legR.castShadow = true;
            group.add(legL);
            group.add(legR);

            // Arms (uses the custom material texture map)
            const armGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.55, 12);
            const armL = new THREE.Mesh(armGeo, materials.customMaterial);
            armL.position.set(-0.35, 0.35, 0);
            armL.rotation.z = 0.15;
            armL.castShadow = true;
            const armR = new THREE.Mesh(armGeo, materials.customMaterial);
            armR.position.set(0.35, 0.35, 0);
            armR.rotation.z = -0.15;
            armR.castShadow = true;
            group.add(armL);
            group.add(armR);

            // Sword or Weapon
            if (prompt.includes('espada') || prompt.includes('sword') || prompt.includes('guerrero') || prompt.includes('warrior')) {
                const weaponGeo = new THREE.BoxGeometry(0.04, 0.75, 0.015);
                const weapon = new THREE.Mesh(weaponGeo, steelMat);
                weapon.position.set(0.48, 0.48, 0.2);
                weapon.rotation.x = -0.5;
                weapon.castShadow = true;
                group.add(weapon);
            }
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

        if (meshType !== 'isometric_terrain' && meshType !== 'voxel_3d' && meshType !== 'mesh_3d') {
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

        // If it's a monster/creature
        const monsterTypes = ['slime', 'goblin', 'skeleton', 'dragon', 'orc', 'ghost', 'spider', 'bat', 'wolf', 'golem', 'boss'];
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
        }

        const pantsColor = darkenColor(primary, 50);

        // Core base humanoid
        const { torsoTop, torsoBot, headR, bodyW, armW } = drawHumanoidBase(cx, cy - 15*S, skin, primary, pantsColor, S, px, opts);

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
            } else {
                ctx.ellipse(cx - headR*0.8, torsoTop - headR*0.3, headR*0.35, headR*0.6, 0.1, 0, Math.PI*2);
                ctx.ellipse(cx + headR*0.8, torsoTop - headR*0.3, headR*0.35, headR*0.6, -0.1, 0, Math.PI*2);
            }
            ctx.fill();
        }

        // Apply accessories dynamically
        if (hasHat || type === 'mage' || type === 'noble' || type === 'merchant') {
            ctx.fillStyle = type === 'noble' ? '#d4a017' : darkenColor(primary, 30);
            if (type === 'noble') {
                // Crown
                ctx.beginPath();
                ctx.moveTo(cx - headR*0.9, torsoTop - headR*0.9);
                ctx.lineTo(cx - headR*0.9, torsoTop - headR*1.3);
                ctx.lineTo(cx - headR*0.4, torsoTop - headR*1.1);
                ctx.lineTo(cx, torsoTop - headR*1.5);
                ctx.lineTo(cx + headR*0.4, torsoTop - headR*1.1);
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

        // — LEGS —
        const legW = bodyW * 0.38;
        ctx.fillStyle = legCol;
        // Left leg
        ctx.beginPath();
        ctx.roundRect(cx - legW - 2 * S, torsoBot - 4 * S, legW, legH, pixelated ? 0 : 4 * S);
        ctx.fill();
        // Right leg
        ctx.beginPath();
        ctx.roundRect(cx + 2 * S, torsoBot - 4 * S, legW, legH, pixelated ? 0 : 4 * S);
        ctx.fill();

        // Leg highlight
        const legHL = ctx.createLinearGradient(cx - legW - 2*S, torsoBot, cx, torsoBot);
        legHL.addColorStop(0, 'rgba(255,255,255,0.12)');
        legHL.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = legHL;
        ctx.beginPath();
        ctx.roundRect(cx - legW - 2*S, torsoBot - 4*S, legW, legH, pixelated ? 0 : 4*S);
        ctx.fill();

        // — TORSO —
        const torsoGrad = ctx.createLinearGradient(cx - bodyW/2, torsoTop, cx + bodyW/2, torsoBot);
        torsoGrad.addColorStop(0,   lightenColor(bodyCol, 35));
        torsoGrad.addColorStop(0.5, bodyCol);
        torsoGrad.addColorStop(1,   darkenColor(bodyCol, 35));
        ctx.fillStyle = torsoGrad;
        ctx.beginPath();
        ctx.roundRect(cx - bodyW/2, torsoTop, bodyW, bodyH, pixelated ? 0 : [8*S, 8*S, 4*S, 4*S]);
        ctx.fill();

        // Torso chest highlight
        if (!pixelated) {
            const chestHL = ctx.createRadialGradient(cx, torsoTop + bodyH*0.25, 0, cx, torsoTop + bodyH*0.25, bodyW*0.5);
            chestHL.addColorStop(0, 'rgba(255,255,255,0.18)');
            chestHL.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = chestHL;
            ctx.beginPath();
            ctx.roundRect(cx - bodyW/2, torsoTop, bodyW, bodyH, 8*S);
            ctx.fill();
        }

        // — ARMS —
        ctx.fillStyle = bodyCol;
        // Left arm
        ctx.beginPath();
        ctx.roundRect(cx - bodyW/2 - armW + 2*S, torsoTop + 4*S, armW, armH, pixelated ? 0 : 6*S);
        ctx.fill();
        // Right arm
        ctx.beginPath();
        ctx.roundRect(cx + bodyW/2 - 2*S, torsoTop + 4*S, armW, armH, pixelated ? 0 : 6*S);
        ctx.fill();

        // — HEAD —
        const headGrad = ctx.createRadialGradient(cx - headR*0.2, torsoTop - headR*0.8, headR*0.1, cx, torsoTop - headR*0.5, headR);
        headGrad.addColorStop(0, lightenColor(skin, 20));
        headGrad.addColorStop(0.7, skin);
        headGrad.addColorStop(1, darkenColor(skin, 20));
        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.ellipse(cx, torsoTop - headR * 0.5, headR, headR, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        const eyeY = torsoTop - headR * 0.4;
        const eyeSpacing = headR * 0.4;
        const eyeR = headR * 0.14;
        ctx.fillStyle = '#1a0a0a';
        ctx.beginPath(); ctx.arc(cx - eyeSpacing, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + eyeSpacing, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
        // Eye shine
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(cx - eyeSpacing + eyeR*0.4, eyeY - eyeR*0.3, eyeR*0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + eyeSpacing + eyeR*0.4, eyeY - eyeR*0.3, eyeR*0.4, 0, Math.PI * 2); ctx.fill();

        // Mouth
        ctx.strokeStyle = darkenColor(skin, 30);
        ctx.lineWidth = 1.5 * S;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, eyeY + headR*0.35, headR*0.2, 0.1, Math.PI - 0.1);
        ctx.stroke();

        return { torsoTop, torsoBot, headR, bodyW, armW };
    }

    function lightenColor(hex, amount) {
        const r = Math.min(255, parseInt(hex.slice(1,3),16) + amount);
        const g = Math.min(255, parseInt(hex.slice(3,5),16) + amount);
        const b = Math.min(255, parseInt(hex.slice(5,7),16) + amount);
        return `rgb(${r},${g},${b})`;
    }
    function darkenColor(hex, amount) {
        const r = Math.max(0, parseInt(hex.slice(1,3),16) - amount);
        const g = Math.max(0, parseInt(hex.slice(3,5),16) - amount);
        const b = Math.max(0, parseInt(hex.slice(5,7),16) - amount);
        return `rgb(${r},${g},${b})`;
    }
    /** Safely replace the alpha channel in an rgba() string e.g. glowAlpha(glow, 0.8) */
    function glowAlpha(rgbaStr, alpha) {
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

    // --- High-Quality 2D/3D Silhouette & Texturing Effects ---
    function applyHighQualityEffects(style) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);

        const w = canvas.width;
        const h = canvas.height;

        // 1. Clean black outlines for cartoon/pixel style (destination-over = draws behind existing pixels)
        if (style === 'cartoon' || style === 'pixel') {
            ctx.save();
            const offset = style === 'pixel' ? Math.max(1, Math.round(w / 128)) : Math.max(2, Math.round(w / 100));
            ctx.globalCompositeOperation = 'destination-over';
            ctx.globalAlpha = 1;
            // Draw solid black silhouette behind the image
            for (let dx = -offset; dx <= offset; dx += offset) {
                for (let dy = -offset; dy <= offset; dy += offset) {
                    if (dx !== 0 || dy !== 0) {
                        ctx.drawImage(tempCanvas, dx, dy);
                    }
                }
            }
            ctx.restore();
        }

        // 2. Very subtle noise grain — much less aggressive (was causing ugly grey wash)
        if (style === 'realistic') {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = 0.04; // was 0.08, now very subtle
            for (let i = 0; i < w; i += 2) {
                for (let j = 0; j < h; j += 2) {
                    ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
                    ctx.fillRect(i, j, 2, 2);
                }
            }
            ctx.restore();
        }

        // 3. Very subtle vignette (source-atop = only affects existing pixels, safe)
        ctx.save();
        ctx.globalCompositeOperation = 'source-atop';
        const grad = ctx.createRadialGradient(w/2, h/2, w * 0.3, w/2, h/2, w * 0.52);
        grad.addColorStop(0, 'rgba(255,255,255,0.03)');
        grad.addColorStop(1, 'rgba(0,0,0,0.10)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    }

    init();
});
