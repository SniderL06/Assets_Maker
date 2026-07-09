// ==========================================
// Assets_Maker.AI - Logic and Functionality
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // --- Application State ---
    const state = {
        currentWorkspace: '2d', // '2d', '2.5d', '3d'
        activeTool: 'brush', // 'brush', 'eraser', 'picker', 'fill', 'crop'
        primaryColor: '#a855f7',
        brushSize: 8,
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
        '3d': document.getElementById('tab-3d')
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

    // Three.js variables
    let scene, camera, renderer, currentMesh, materials = {}, orbitControls;
    let autoRotate = false;

    // --- Initial Setup ---
    function init() {
        // Setup Canvas Dimensions
        resizeCanvas(256, 256);
        clearCanvas();
        saveHistoryState();
        
        // Initial drawing background
        drawInitialPlaceholder();

        // Init 3D Viewport (Three.js)
        initThreeJS();

        // Event listeners
        setupEventListeners();
        setupCanvasDrawing();
        
        // Load default style preset
        updateStylePreset();
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
        } else {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
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
        // Draw a beautiful default crystal or sword asset
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        // Drawing a beautiful pixel art gem
        ctx.shadowColor = 'rgba(168, 85, 247, 0.5)';
        ctx.shadowBlur = 10;
        
        const gradient = ctx.createRadialGradient(cx, cy, 10, cx, cy, 80);
        gradient.addColorStop(0, '#d8b4fe');
        gradient.addColorStop(0.3, '#a855f7');
        gradient.addColorStop(0.8, '#701a75');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 70);
        ctx.lineTo(cx + 50, cy - 20);
        ctx.lineTo(cx + 40, cy + 40);
        ctx.lineTo(cx, cy + 70);
        ctx.lineTo(cx - 40, cy + 40);
        ctx.lineTo(cx - 50, cy - 20);
        ctx.closePath();
        ctx.fill();
        
        // Core highlight
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - 50);
        ctx.lineTo(cx + 10, cy - 50);
        ctx.lineTo(cx + 25, cy - 20);
        ctx.lineTo(cx, cy - 30);
        ctx.lineTo(cx - 25, cy - 20);
        ctx.closePath();
        ctx.fill();
        
        // Reset shadow
        ctx.shadowBlur = 0;
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
        // Workspaces Tabs
        Object.keys(workspaceTabs).forEach(key => {
            workspaceTabs[key].addEventListener('click', () => {
                switchWorkspace(key);
            });
        });

        // Tools
        Object.keys(tools).forEach(key => {
            tools[key].addEventListener('click', () => {
                setTool(key);
            });
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

        primaryColorInput.addEventListener('input', (e) => {
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
            canvas.style.transform = `scale(1) translate(0px, 0px)`;
            state.zoom = 1;
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
    }

    // --- Workspace Navigation ---
    function switchWorkspace(mode) {
        state.currentWorkspace = mode;
        
        // Update Tabs UI
        Object.keys(workspaceTabs).forEach(key => {
            workspaceTabs[key].classList.toggle('active', key === mode);
        });

        // Show/Hide relevant Viewports
        if (mode === '3d') {
            canvasContainer.style.display = 'none';
            threeContainer.style.display = 'flex';
            threeSettings.style.display = 'block';
            
            // Switch Mesh Select based on background or 2.5D context
            if (workspaceTabs['2.5d'].classList.contains('was-active') || workspaceTabs['2.5d'].getAttribute('data-active') === 'true') {
                threeMeshSelect.value = 'plane';
            }
            
            updateThreeTexture();
            onWindowResize();
        } else {
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
            tools[key].classList.toggle('active', key === toolName);
        });

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

        canvas.addEventListener('touchend', () => {
            const mouseEvent = new MouseEvent('mouseup', {});
            canvas.dispatchEvent(mouseEvent);
        });
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
        if (!isDrawing) return;
        const pos = getMousePos(e);
        
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        
        if (state.activeTool === 'brush') {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = state.primaryColor;
            ctx.lineWidth = state.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        } else if (state.activeTool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.lineWidth = state.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        }

        lastX = pos.x;
        lastY = pos.y;
    }

    function stopDrawing() {
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

    // --- Realtime Filter Application (CSS Filters based) ---
    function applyRealtimeFilters() {
        const filters = `
            brightness(${state.adjustments.brightness}%) 
            contrast(${state.adjustments.contrast}%) 
            saturate(${state.adjustments.saturation}%) 
            hue-rotate(${state.adjustments.hue}deg)
        `;
        canvas.style.filter = filters;
    }

    function bakeFiltersToCanvas() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw filtered image on temp canvas
        tempCtx.filter = canvas.style.filter;
        tempCtx.drawImage(canvas, 0, 0);
        
        // Reset canvas element CSS filters
        canvas.style.filter = 'none';
        
        // Copy back baked pixels
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0);
        
        updateThreeTexture();
    }

    function resetAdjustmentSliders() {
        state.adjustments = { brightness: 100, contrast: 100, saturation: 100, hue: 0 };
        Object.keys(adjSliders).forEach(key => {
            adjSliders[key].value = 100;
            if (key === 'hue') adjSliders[key].value = 0;
            const suffix = key === 'hue' ? '°' : '%';
            adjVals[key].textContent = `${state.adjustments[key]}${suffix}`;
        });
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

        // ---- Draw depending on asset category ----
        if (lp.includes('espada') || lp.includes('sword') || lp.includes('katana') || lp.includes('sable') || lp.includes('daga') || lp.includes('dagger')) {
            drawSwordAsset(cx, cy, baseColor, accentColor, glowColor, style);
        } else if (lp.includes('cofre') || lp.includes('chest') || lp.includes('caja') || lp.includes('tesoro')) {
            drawChestAsset(cx, cy, baseColor, accentColor, glowColor, style);
        } else if (lp.includes('escudo') || lp.includes('shield') || lp.includes('armadura') || lp.includes('armor')) {
            drawShieldAsset(cx, cy, baseColor, accentColor, glowColor, style);
        } else if (lp.includes('pocion') || lp.includes('potion') || lp.includes('frasco') || lp.includes('botella') || lp.includes('elixir')) {
            drawPotionAsset(cx, cy, baseColor, accentColor, glowColor, style);
        } else if (lp.includes('terreno') || lp.includes('bloque') || lp.includes('isométrico') || lp.includes('isometric') || lp.includes('tile') || state.currentWorkspace === '2.5d') {
            drawIsometricBlockAsset(cx, cy, baseColor, accentColor, glowColor, style);
        } else if (lp.includes('arco') || lp.includes('bow') || lp.includes('flecha') || lp.includes('arrow')) {
            drawBowAsset(cx, cy, baseColor, accentColor, glowColor, style);
        } else {
            // Default: Magic Orb / Gem
            drawGemAsset(cx, cy, baseColor, accentColor, glowColor, style);
        }
        
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

    // ============================================================
    // HIGH-QUALITY PROCEDURAL DRAWING ENGINE
    // ============================================================

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
            g.addColorStop(0,   glowColor.replace(/,[^,]+\)$/, `,${alpha})`));
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

            // Pommel
            const pomR2 = Math.round(6 * S);
            const pomG2 = pixelated ? acc : (() => { const g = ctx.createRadialGradient(cx-2,cy+Math.round(46*S)-2,1,cx,cy+Math.round(46*S),pomR2); g.addColorStop(0,'#fff'); g.addColorStop(0.5,acc); g.addColorStop(1,adjustBrightness(acc,-40)); return g; })();
            ctx.fillStyle = pomG2;
            ctx.beginPath();
            ctx.arc(cx, cy + Math.round(46 * S), pomR2, 0, Math.PI * 2);
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
            ctx.lineTo(cx, cy - bladeLen + Math.round(2 * S));
            ctx.lineTo(cx - Math.round(1 * S), cy - bladeLen + Math.round(12 * S));
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
            // Wood Grain Linear Gradient
            const woodGrad = ctx.createLinearGradient(cx, cy - h/4, cx, cy + h/2);
            woodGrad.addColorStop(0, base);
            woodGrad.addColorStop(0.5, adjustBrightness(base, -10));
            woodGrad.addColorStop(1, adjustBrightness(base, -25));
            ctx.fillStyle = woodGrad;
            ctx.fillRect(cx - w/2, cy - h/4, w, h*0.75);

            // Steel/Metal Trim Corner Reinforcements
            const metalGrad = ctx.createLinearGradient(cx - w/2, cy, cx + w/2, cy);
            metalGrad.addColorStop(0, acc);
            metalGrad.addColorStop(0.1, adjustBrightness(acc, -30));
            metalGrad.addColorStop(0.9, adjustBrightness(acc, -30));
            metalGrad.addColorStop(1, acc);
            
            ctx.fillStyle = metalGrad;
            ctx.fillRect(cx - w/2, cy - h/4, 12, h*0.75);
            ctx.fillRect(cx + w/2 - 12, cy - h/4, 12, h*0.75);

            // Lid of the chest with reflection gradients
            ctx.fillStyle = woodGrad;
            ctx.beginPath();
            ctx.arc(cx, cy - h/4, w/2, Math.PI, 0);
            ctx.fill();

            // Rounded Lid Corners Metallic
            ctx.fillStyle = acc;
            ctx.beginPath();
            ctx.arc(cx, cy - h/4, w/2, Math.PI, Math.PI + 0.25);
            ctx.lineTo(cx - w/2 + 12, cy - h/4);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy - h/4, w/2, 0, -0.25, true);
            ctx.lineTo(cx + w/2 - 12, cy - h/4);
            ctx.closePath();
            ctx.fill();

            // Lock plate
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(cx - 10, cy - h/4 + 2, 20, 20);
            ctx.strokeStyle = acc;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - 10, cy - h/4 + 2, 20, 20);

            const lockGlow = ctx.createRadialGradient(cx, cy - h/4 + 10, 1, cx, cy - h/4 + 10, 5);
            lockGlow.addColorStop(0, '#ffffff');
            lockGlow.addColorStop(1, acc);
            ctx.fillStyle = lockGlow;
            ctx.beginPath();
            ctx.arc(cx, cy - h/4 + 10, 4, 0, Math.PI * 2);
            ctx.fill();
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
                loadCanvasFromURL(asset.dataURL);
                document.querySelectorAll('.gallery-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                promptInput.value = asset.prompt;
                // update style option view
                const styleOpt = document.querySelector(`.style-option[data-style="${asset.style}"]`);
                if (styleOpt) {
                    styleOptions.forEach(o => o.classList.remove('active'));
                    styleOpt.classList.add('active');
                }
            });

            galleryContainer.appendChild(item);
        });
    }

    // --- Three.js 3D Viewer Implementation ---
    function initThreeJS() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080b13);
        
        // Camera setup
        camera = new THREE.PerspectiveCamera(45, threeViewport.clientWidth / threeViewport.clientHeight, 0.1, 100);
        camera.position.set(0, 2, 4);

        // Renderer setup
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(threeViewport.clientWidth, threeViewport.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        
        threeViewport.innerHTML = '';
        threeViewport.appendChild(renderer.domElement);

        // Controls
        orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;
        orbitControls.maxPolarAngle = Math.PI / 2 + 0.1; // Limit panning below plane

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(5, 8, 5);
        dirLight1.castShadow = true;
        scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xa855f7, 0.3); // Purple accent light
        dirLight2.position.set(-5, 3, -5);
        scene.add(dirLight2);

        // Floor Grid
        const gridHelper = new THREE.GridHelper(10, 20, 0x1f2937, 0x1f2937);
        gridHelper.position.y = -1;
        scene.add(gridHelper);

        // Build base textures & material
        materials.canvasTex = new THREE.CanvasTexture(canvas);
        materials.canvasTex.minFilter = THREE.NearestFilter;
        materials.canvasTex.magFilter = THREE.NearestFilter; // Preserve pixel arts crispiness
        
        // Materials creation
        materials.customMaterial = new THREE.MeshStandardMaterial({
            map: materials.canvasTex,
            roughness: state.material.roughness,
            metalness: state.material.metalness,
            bumpMap: materials.canvasTex,
            bumpScale: state.material.bumpScale,
            transparent: true,
            side: THREE.DoubleSide
        });

        // Load polygonal mesh initially
        updateThreeMesh('mesh_3d');

        // Start render loop
        animateThreeJS();
        
        window.addEventListener('resize', onWindowResize);
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
            roughness: 0.15,
            metalness: 0.95,
            emissive: isGlowing ? new THREE.Color(elementColor) : new THREE.Color(0x000000),
            emissiveIntensity: isGlowing ? 0.6 : 0
        });

        if (prompt.includes('espada') || prompt.includes('sword') || prompt.includes('arma') || prompt.includes('hoja') || prompt.includes('katana')) {
            // --- 3D Sword ---
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
            
            // Blade (uses solid colored metallic/glowing material for a perfect connected look!)
            const bladeGeo = new THREE.CylinderGeometry(0.005, 0.07, 1.2, 4);
            const blade = new THREE.Mesh(bladeGeo, bladeMat);
            blade.scale.set(1.4, 1, 0.15); // sharp edge diamond scaling
            blade.position.y = 0.4;
            group.add(blade);
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
        else {
            // --- 3D Gem / Default Orb ---
            const gemGeo = new THREE.OctahedronGeometry(0.55, 0);
            const gem = new THREE.Mesh(gemGeo, materials.customMaterial);
            gem.position.y = 0.1;
            group.add(gem);
        }
        
        return group;
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
        if (state.currentWorkspace === '3d' && (threeMeshSelect.value === 'voxel_3d' || threeMeshSelect.value === 'mesh_3d')) {
            updateThreeMesh(threeMeshSelect.value);
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
        
        if (autoRotate && currentMesh) {
            currentMesh.rotation.y += 0.01;
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
    init();
});
