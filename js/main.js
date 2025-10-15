
document.addEventListener('DOMContentLoaded', () => {
            // Helpers to load scripts and initialize Firebase without hardcoding secrets in the repo
            const loadScript = (src) => new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src; s.async = true; s.defer = false;
                s.onload = () => resolve(true);
                s.onerror = () => reject(new Error('Failed to load ' + src));
                document.head.appendChild(s);
            });

            const ensureFirebaseInitialized = async () => {
                try {
                    // 1) If already initialized (e.g., by a previous script), nothing to do
                    if (window.firebase?.apps?.length) return true;
                    // 2) Try to load project-specific config from a non-committed file
                    try {
                        await loadScript('config/firebase-config.js'); // should set window.__FIREBASE_CONFIG__
                    } catch { }
                    if (window.__FIREBASE_CONFIG__) {
                        try { firebase.initializeApp(window.__FIREBASE_CONFIG__); return true; } catch { }
                    }
                    // 3) If hosted on Firebase Hosting, attempt auto-init script
                    try {
                        await loadScript('/__/firebase/init.js');
                        // If it succeeded, firebase should be initialized now
                        if (window.firebase?.apps?.length) return true;
                    } catch { }
                } catch { }
                return false;
            };

            (async () => {
                let initialized = await ensureFirebaseInitialized();
                let isDemoMode = !initialized;
                window.__IS_DEMO__ = isDemoMode;
                let db = null;
                try { if (!isDemoMode) { db = firebase.firestore(); } } catch { }
            // Enable Bootstrap tooltips globally
            const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
            // --- Global State and Constants ---
            const state = {
                unit: 'meter',
                screenWidth: 2,
                screenHeight: 2,
                isPanelCountMode: false,
                panelsInWidth: 4,
                panelsInHeight: 4,
                panelWidth: 0.5,
                panelHeight: 0.5,
                panelResWidth: 128,
                panelResHeight: 128,
                totalResWidth: 0,
                totalResHeight: 0,
                color1: '#4a90e2',
                color2: '#f5a623',
                isColor2Brighter: true,
                isDarkMode: true, // Default to dark mode
                uiAccentColor: '#0d6efd',
                outlineEnabled: true,
                outlineColor: '#000000',
                outlineSize: 2,
                rasterEnabled: false,
                rasterColor: '#000000',
                rasterSize: 1,
                circleEffectEnabled: true,
                circleEffectColor: '#ffffff',
                circleEffectSize: 100,
                circleEffectSizeManuallySet: false,
                circleEffectThickness: 2,
                crossLineEffectEnabled: true,
                crossLineColor: '#ffffff',
                crossLineSize: 2,
                invertColorsEnabled: false,
                grayscaleEnabled: false,
                importedPixelMap: null, // This will now hold the currently displayed map, not the stored ones
                zoomLevel: 1,
                
                // Store panel dimensions for snapping
                panelPxWidth: 0,
                panelPxHeight: 0,

                // Text & Numbering State
                numberingEnabled: true,
                numberingFormat: '1,1',
                numberingPosition: 'top-left', // Default position changed to top-left
                numberingSize: 30,
                numberingColor: '#000000',
                customTextEnabled: true,
                customText: 'Led Screen',
                customTextSize: 30,
                customTextColor: '#000000',
                customTextSizeManuallySet: false,
                customTextX: null,
                customTextY: null,
                customTextPositionManuallySet: false,
                customTextBgEnabled: true,
                customTextBgColor: '#ffffff',
                customTextBgOpacity: 0.5,
                customTextBgOpacity: 0.5,
                specificationEnabled: true,
                specificationColor: '#ffffff',
                specificationSize: 14,
                specificationSizeManuallySet: false,
                specificationX: 10,
                specificationY: null,
                specificationPositionManuallySet: false,
                specificationFormat: 'single-line',
                specificationBgEnabled: true,
                specificationBgColor: '#000000',
                oneLineText: '',
                
                // Manual Drawing State (on PixelMap tab)
                isDrawingMode: false,
                isSelecting: false, // For selection rectangle
                selectionRect: null, // {startX, startY, endX, endY, grid: {startRow, ...}}
                drawingColor: '#ff0000',
                drawingWidth: 5,
                drawnLines: [], // Stores completed straight lines
                activeTopology: null,
                drawingLineCounter: 1, // Counter for numbered lines
                
                // CanvasMap-specific state
                canvasMapWidth: 3840,
                canvasMapHeight: 2160,
                canvasMapZoomLevel: 1, 
                storedPixelMaps: [], // Array to store all imported pixel maps
                savedCanvases: [],
                currentCanvasId: null, // Array to store saved canvas layouts
                currentCanvasId: null, // ID of the currently loaded canvas
                canvasMapObjects: [], // Array to store objects drawn on CanvasMap
                canvasMapRulerEnabled: true,
                canvasMapRulerPosition: 'inside',
                canvasMapGridEnabled: true,
                canvasMapGridColor: '#cccccc',
                canvasMapGridSpacing: 50,
                canvasMapMagnetEnabled: true,
                canvasMapMagnetThreshold: 10,
                canvasMapShowGap: true,
                canvasMapGapColor: '#ff0000',
                canvasMapShowCoordinates: true,
                mediaServer: 'resolume',
                pdfFilename: 'canvasmap_details',
                pdfProjectName: '',
                pdfVenue: '',
                pdfDrawnBy: '',
                pdfSales: '',
                pdfClient: '',
                pdfUnit: '',
                pdfEmail: '',
                pdfIncludeCanvasSnapshot: true,
                logoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', // Default placeholder
                // PDF preview performance flags
                pdfPreviewDirty: true,
                pdfPreviewReady: false,
                lastPdfPreviewUrl: null,
                
                // Panel removal state
                removedPanels: new Set(), // Store coordinates of removed panels as a Set of "row,col" strings
                
                // Hover effect state
                hoveredPanelCoords: null, // Stores {row, col} of the currently hovered panel
            };

            const unitConversions = {
                meter: 1,
                cm: 100,
                mm: 1000,
                feet: 3.28084,
            };
            
            // --- DOM Elements ---
            const pixelMapCanvas = document.getElementById('pixelMapCanvas');
            const ctx = pixelMapCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
            const drawingOverlayCanvas = document.getElementById('drawingOverlayCanvas'); 
            const drawingCtx = drawingOverlayCanvas.getContext('2d', { alpha: true }); 
            
            const canvasInfo = document.getElementById('canvasInfo');
            const canvasContainer = document.getElementById('canvasContainer');
            const fontSelectModal = document.getElementById('fontSelectModal');
            // alias for legacy variable names used elsewhere in the script
            const fontSelect = fontSelectModal;
            const colorModeToggle = document.getElementById('colorModeToggleModal');
            const colorModeToggleModal = colorModeToggle;
            const uiAccentColorInput = document.getElementById('uiAccentColorInputModal');
            // alias for consistency across the code
            const uiAccentColorInputModal = uiAccentColorInput;
            const fontPreviewModal = document.getElementById('fontPreviewModal');
            const accentSwatches = document.getElementById('accentSwatches');
            const resetUiPrefsBtn = document.getElementById('resetUiPrefsBtn');
            const loginMenuItem = document.getElementById('loginMenuItem');
            const logoutMenuItem = document.getElementById('logoutMenuItem');
            const profileMenuItem = document.getElementById('profileMenuItem');
                const userNameDisplay = document.getElementById('userNameDisplay');
            const logoutInProfileBtn = document.getElementById('logoutInProfileBtn');
            const resetAllBtn = document.getElementById('resetAllBtnModal');
            const resetAllBtnModal = resetAllBtn;
            const unitSelector = document.getElementById('unitSelector');
            const sizingModeToggle = document.getElementById('sizingModeToggle');
            const screenDimensionsGroup = document.getElementById('screenDimensionsGroup');
            const panelCountGroup = document.getElementById('panelCountGroup');
            const panelsWidthInput = document.getElementById('panelsWidthInput');
            const panelsHeightInput = document.getElementById('panelsHeightInput');
            const unitLabels = document.querySelectorAll('.unit-label');
            const screenWidthInput = document.getElementById('screenWidth');
            const screenHeightInput = document.getElementById('screenHeight');
            const panelWidthSelect = document.getElementById('panelWidthSelect');
            const panelHeightSelect = document.getElementById('panelHeightSelect');
            const panelResWidthInput = document.getElementById('panelResWidth');
            const panelResHeightInput = document.getElementById('panelResHeight');
            // Profile modal elements
            const profileModalEl = document.getElementById('profileModal');
            const profileNameInput = document.getElementById('profileNameInput');
            const profileEmailInput = document.getElementById('profileEmailInput');
            const profileCompanyInput = document.getElementById('profileCompanyInput');
            const profileTitleInput = document.getElementById('profileTitleInput');
            const profilePhoneInput = document.getElementById('profilePhoneInput');
            const profileNotesInput = document.getElementById('profileNotesInput');
            const saveProfileBtn = document.getElementById('saveProfileBtn');
            const clearProfileBtn = document.getElementById('clearProfileBtn');

            const PROFILE_STORAGE_KEY = 'userProfile';

            const getStoredProfile = () => {
                try { return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)) || {}; } catch { return {}; }
            };

            const setStoredProfile = (data) => {
                try { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(data || {})); } catch { }
            };

            const populateProfileForm = (data = {}) => {
                if (!profileNameInput) return; // if modal not present, skip
                profileNameInput.value = data.name || '';
                profileEmailInput.value = data.email || '';
                profileCompanyInput.value = data.company || '';
                profileTitleInput.value = data.title || '';
                profilePhoneInput.value = data.phone || '';
                profileNotesInput.value = data.notes || '';
            };

            const readProfileForm = () => ({
                name: (profileNameInput?.value || '').trim(),
                email: (profileEmailInput?.value || '').trim(),
                company: (profileCompanyInput?.value || '').trim(),
                title: (profileTitleInput?.value || '').trim(),
                phone: (profilePhoneInput?.value || '').trim(),
                notes: (profileNotesInput?.value || '').trim(),
            });

            // Hook for future authentication integration
            const applyAuthProfile = (authUser) => {
                if (!authUser) return; // expected fields: displayName, email, phoneNumber
                const current = getStoredProfile();
                const fromAuth = {
                    name: authUser.displayName || current.name,
                    email: authUser.email || current.email,
                    phone: authUser.phoneNumber || current.phone,
                };
                const merged = { ...current, ...fromAuth };
                setStoredProfile(merged);
                populateProfileForm(merged);
            };

            // ===== Profile: Firestore helpers (when Firebase is configured) =====
            const getCurrentUserId = () => {
                if (window.__IS_DEMO__) return null;
                try { return firebase.auth().currentUser?.uid || null; } catch { return null; }
            };

            const loadProfileFromCloud = async (uid) => {
                if (!uid || window.__IS_DEMO__ || !db) return null;
                try {
                    const ref = db.collection('profiles').doc(uid);
                    const snap = await ref.get();
                    return snap.exists ? snap.data() : null;
                } catch (e) {
                    console.warn('Profile load failed:', e);
                    return null;
                }
            };

            const saveProfileToCloud = async (uid, data) => {
                if (!uid || window.__IS_DEMO__ || !db) throw new Error('Cloud unavailable');
                const payload = { ...data, updatedAt: new Date().toISOString() };
                if (!payload.displayName && data.name) payload.displayName = data.name;
                const ref = db.collection('profiles').doc(uid);
                await ref.set(payload, { merge: true });
                return true;
            };
            const color1Input = document.getElementById('color1Input');
            const color2Input = document.getElementById('color2Input');
            const color2BrightnessToggle = document.getElementById('color2BrightnessToggle');
            const color1Preview = document.getElementById('color1Preview');
            const color2Preview = document.getElementById('color2Preview');
            const outlineToggle = document.getElementById('outlineToggle');
            const outlineColorInput = document.getElementById('outlineColorInput');
            const outlineSizeInput = document.getElementById('outlineSizeInput');
            const rasterEffectToggle = document.getElementById('rasterEffectToggle');
            const rasterColorInput = document.getElementById('rasterColorInput');
            const rasterSizeInput = document.getElementById('rasterSizeInput');
            const circleEffectToggle = document.getElementById('circleEffectToggle');
            const circleEffectColorInput = document.getElementById('circleEffectColorInput');
            const circleEffectSizeInput = document.getElementById('circleEffectSizeInput');
            const circleEffectSizeValue = document.getElementById('circleEffectSizeValue');
            const circleEffectThicknessInput = document.getElementById('circleEffectThicknessInput');
            const crossLineEffectToggle = document.getElementById('crossLineEffectToggle');
            const crossLineColorInput = document.getElementById('crossLineColorInput');
            const crossLineSizeInput = document.getElementById('crossLineSizeInput');
            const invertColorsToggle = document.getElementById('invertColorsToggle');
            const grayscaleToggle = document.getElementById('grayscaleToggle');
            const zoomInBtn = document.getElementById('zoomInBtn');
            const zoomOutBtn = document.getElementById('zoomOutBtn');
            const fitToScreenBtn = document.getElementById('fitToScreenBtn');
            const actualResolutionBtn = document.getElementById('actualResolutionBtn');
            const exportPngBtn = document.getElementById('exportPngBtn');
            const exportJpgBtn = document.getElementById('exportJpgBtn');
            const exportOutlineBtn = document.getElementById('exportOutlineBtn');
            const sendToCanvasBtn = document.getElementById('sendToCanvasBtn');
            const canvasMapCanvas = document.getElementById('canvasMapCanvas');
            const canvasMapCtx = canvasMapCanvas.getContext('2d', { alpha: true });
            const canvasWidthInput = document.getElementById('canvasWidth');
            const canvasHeightInput = document.getElementById('canvasHeight');
            const importedMapsGallery = document.getElementById('importedMapsGallery'); 
            const savedCanvasesGallery = document.getElementById('savedCanvasesGallery');
            const saveCanvasBtn = document.getElementById('saveCanvasBtn');
            const saveProjectBtnModal = document.getElementById('saveProjectBtnModal');
            const loadProjectBtnModal = document.getElementById('loadProjectBtnModal');
            const loadProjectInput = document.getElementById('loadProjectInputModal');
            const pixelMapSentGallery = document.getElementById('pixelMapSentGallery');
            if (pixelMapSentGallery) {
                pixelMapSentGallery.addEventListener('click', (e) => {
                    const sentItem = e.target.closest('.sent-item');
                    if (sentItem && sentItem.dataset.mapId) {
                        const mapId = parseInt(sentItem.dataset.mapId, 10);
                        loadPixelMapState(mapId);
                    }
                });

                pixelMapSentGallery.addEventListener('dragstart', (e) => {
                    const draggableItem = e.target.closest('.sent-item');
                    if (draggableItem) {
                        e.dataTransfer.setData('text/plain', draggableItem.dataset.mapId);
                        e.dataTransfer.effectAllowed = 'copy';
                    }
                });
            }

            if (canvasContainer) {
                canvasContainer.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                });

                canvasContainer.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const mapId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    if (!isNaN(mapId)) {
                        loadPixelMapState(mapId);
                    }
                });
            }

            const collapseToggles = document.querySelectorAll('.collapse-header');



            // Modal & Message Box Elements
            const modalBackdrop = document.getElementById('modalBackdrop');
            const messageBox = document.getElementById('messageBox');
            const messageText = document.getElementById('messageText');
            const closeMessageBtn = document.getElementById('closeMessageBtn');
            const saveCanvasModal = document.getElementById('saveCanvasModal');
            const saveCanvasNameInput = document.getElementById('saveCanvasNameInput');
            const saveCanvasConfirmBtn = document.getElementById('saveCanvasConfirmBtn');
            const saveCanvasCancelBtn = document.getElementById('saveCanvasCancelBtn');

            // Text & Numbering DOM elements
            const numberingToggle = document.getElementById('numberingToggle');
            const numberingFormatSelect = document.getElementById('numberingFormat');
            const numberingPositionSelect = document.getElementById('numberingPosition');
            const numberingSizeInput = document.getElementById('numberingSizeInput');
            const numberingColorInput = document.getElementById('numberingColorInput');
            const customTextToggle = document.getElementById('customTextToggle');
            const customTextInput = document.getElementById('customTextInput');
            const customTextSizeInput = document.getElementById('customTextSizeInput');
            const customTextColorInput = document.getElementById('customTextColorInput');
            const customTextBgColorInput = document.getElementById('customTextBgColorInput');
            const customTextBgOpacityInput = document.getElementById('customTextBgOpacityInput');
            const customTextBgOpacityValue = document.getElementById('customTextBgOpacityValue');
            const customTextBgToggle = document.getElementById('customTextBgToggle');
            const customTextXInput = document.getElementById('customTextXInput');
            const customTextXValue = document.getElementById('customTextXValue');
            const customTextYInput = document.getElementById('customTextYInput');
            const customTextYValue = document.getElementById('customTextYValue');
            const specificationToggle = document.getElementById('specificationToggle');
            const specificationFormatToggle = document.getElementById('specificationFormatToggle');
            const specificationSizeInput = document.getElementById('specificationSizeInput');
            const specificationColorInput = document.getElementById('specificationColorInput');
            const specificationXInput = document.getElementById('specificationXInput');
            const specificationXValue = document.getElementById('specificationXValue');
            const specificationYInput = document.getElementById('specificationYInput');
            const specificationYValue = document.getElementById('specificationYValue');
            const oneLineTextInput = document.getElementById('oneLineTextInput');
            const specificationBgColorInput = document.getElementById('specificationBgColorInput');
            const specificationBgToggle = document.getElementById('specificationBgToggle');
            
            // Manual Drawing DOM elements (on PixelMap tab)
            const drawModeToggle = document.getElementById('drawModeToggle');
            const drawingColorInput = document.getElementById('drawingColorInput');
            const drawingWidthInput = document.getElementById('drawingWidthInput');
            const drawingArrowStartToggle = document.getElementById('drawingArrowStartToggle'); 
            const drawingArrowEndToggle = document.getElementById('drawingArrowEndToggle');     
            const undoBtn = document.getElementById('undoBtn'); // New element
            const clearDrawingOverlayBtn = document.getElementById('clearDrawingOverlayBtn'); 

            // CanvasMap Zoom and View Controls
            const canvasMapZoomInBtn = document.getElementById('canvasMapZoomInBtn');
            const canvasMapZoomOutBtn = document.getElementById('canvasMapZoomOutBtn');
            const canvasMapFitToScreenBtn = document.getElementById('canvasMapFitToScreenBtn');
            const canvasMapActualSizeBtn = document.getElementById('canvasMapActualSizeBtn');
            const canvasMapContainer = document.getElementById('canvasMapContainer');
            const rulerContainer = document.getElementById('rulerContainer');
            const rulerHorizontal = document.getElementById('rulerHorizontal');
            const rulerVertical = document.getElementById('rulerVertical');
            const rulerToggle = document.getElementById('rulerToggle');
            const rulerPositionToggle = document.getElementById('rulerPositionToggle');
            const gridlineToggle = document.getElementById('gridlineToggle');
            const gridlineColorInput = document.getElementById('gridlineColorInput');
            const gridlineSpacingInput = document.getElementById('gridlineSpacingInput');
            const magnetToggle = document.getElementById('magnetToggle');
            const magnetThresholdInput = document.getElementById('magnetThresholdInput');
            const gapToggle = document.getElementById('gapToggle');
            const gapColorInput = document.getElementById('gapColorInput');
            const coordinatesToggle = document.getElementById('coordinatesToggle');
            const exportCanvasPngBtn = document.getElementById('exportCanvasPngBtn');
            const exportCanvasJpgBtn = document.getElementById('exportCanvasJpgBtn');
            const exportCanvasPdfBtn = document.getElementById('exportCanvasPdfBtn');
            const exportCanvasPdfBtnNew = document.getElementById('exportCanvasPdfBtnNew');
            const exportCanvasXmlBtn = document.getElementById('exportCanvasXmlBtn');
            // PDF Preview
            const generatePdfPreviewBtn = document.getElementById('generatePdfPreviewBtn');

            // Object Properties Panel
            const noObjectSelectedMessage = document.getElementById('noObjectSelectedMessage');
            const propertiesContent = document.getElementById('propertiesContent');
            const targetXInput = document.getElementById('targetX');
            const targetYInput = document.getElementById('targetY');
            const targetRotationInput = document.getElementById('targetRotation');
            const duplicateBtn = document.getElementById('duplicateBtn');
            const deleteBtn = document.getElementById('deleteBtn');
            const mediaServerSelect = document.getElementById('mediaServerSelect');
            const pdfFilenameInput = document.getElementById('pdfFilenameInput');
            const pdfProjectNameInput = document.getElementById('pdfProjectNameInput');
            const pdfVenueInput = document.getElementById('pdfVenueInput');
            const pdfDrawnByInput = document.getElementById('pdfDrawnByInput');
            const pdfSalesInput = document.getElementById('pdfSalesInput');
            const pdfClientInput = document.getElementById('pdfClientInput');
            const pdfUnitInput = document.getElementById('pdfUnitInput');
            const pdfEmailInput = document.getElementById('pdfEmailInput');
            const pdfIncludeCanvasSnapshotToggle = document.getElementById('pdfIncludeCanvasSnapshotToggle');
            const logoUpload = document.getElementById('logoUpload');
            const logoPreview = document.getElementById('logoPreview');
            
            // Multi-Export Modal Elements
            const multiExportModal = document.getElementById('multiExportModal');
            const multiExportCanvasList = document.getElementById('multiExportCanvasList');
            const multiExportSelectAllBtn = document.getElementById('multiExportSelectAllBtn');
            const multiExportDeselectAllBtn = document.getElementById('multiExportDeselectAllBtn');
            const multiExportCancelBtn = document.getElementById('multiExportCancelBtn');
            const multiExportConfirmBtn = document.getElementById('multiExportConfirmBtn');
            const multiExportIncludeSpecPage = document.getElementById('multiExportIncludeSpecPage');
            
            // CanvasMap Dragging state
            let isDraggingCanvasMapObject = false;
            let selectedCanvasMapObject = null;
            let dragOffsetX = 0;
            let dragOffsetY = 0;

            // --- Helper Functions ---
            /**
             * Shows the modal backdrop.
             */
            const showBackdrop = () => modalBackdrop.classList.add('visible');
            
            /**
             * Hides the modal backdrop.
             */
            const hideBackdrop = () => modalBackdrop.classList.remove('visible');

            /**
             * Shows a custom message box.
             * @param {string} message The message to display.
             */
            const showMessageBox = (message) => {
                messageText.textContent = message;
                showBackdrop();
                messageBox.classList.add('visible');
            };

            /**
             * Hides the custom message box.
             */
            const hideMessageBox = () => {
                messageBox.classList.remove('visible');
                // Hide backdrop only if no other modal is visible
                if (!saveCanvasModal.classList.contains('visible')) {
                    hideBackdrop();
                }
            };

            // Non-blocking global toast notifications (always on top)
            const showToast = (message, variant = 'primary', delayMs = 2200) => {
                try {
                    const container = document.getElementById('toastContainer');
                    if (!container) return;
                    const id = 'toast-' + Date.now();
                    const bg = {
                        success: 'bg-success text-white',
                        danger: 'bg-danger text-white',
                        warning: 'bg-warning text-dark',
                        info: 'bg-info text-dark',
                        primary: 'bg-primary text-white',
                    }[variant] || 'bg-primary text-white';
                    const div = document.createElement('div');
                    div.id = id;
                    div.className = `toast align-items-center ${bg} border-0 shadow`;
                    div.setAttribute('role', 'status');
                    div.setAttribute('aria-live', 'polite');
                    div.setAttribute('aria-atomic', 'true');
                    div.innerHTML = `
                        <div class="d-flex">
                          <div class="toast-body">${message}</div>
                          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                        </div>`;
                    container.appendChild(div);
                    const toast = new bootstrap.Toast(div, { delay: delayMs, autohide: true });
                    toast.show();
                    div.addEventListener('hidden.bs.toast', () => div.remove());
                } catch { }
            };

            /**
             * Debounces a function, delaying its execution.
             * @param {Function} func The function to debounce.
             * @param {number} delay The delay in milliseconds.
             * @returns {Function} The debounced function.
             */
            const debounce = (func, delay) => {
                let timeout;
                return function(...args) {
                    const context = this;
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(context, args), delay);
                };
            };

            /**
             * Converts a value from one unit to another based on the unitConversions map.
             * @param {number} value The value to convert.
             * @param {string} fromUnit The original unit.
             * @param {string} toUnit The target unit.
             * @returns {number} The converted value.
             */
            const convertUnits = (value, fromUnit, toUnit) => {
                if (fromUnit === toUnit) return value;
                const baseValue = value / unitConversions[fromUnit];
                return baseValue * unitConversions[toUnit];
            };
            
            /**
             * Adjusts the brightness of a hex color.
             * @param {string} hex The hex color string.
             * @param {number} percent The percentage to brighten by (e.g., 50 for 50%).
             * @returns {string} The new hex color string.
             */
            const adjustColorBrightness = (hex, percent) => {
                let color = hex.startsWith('#') ? hex.slice(1) : hex;
                const r = parseInt(color.substring(0, 2), 16);
                const g = parseInt(color.substring(2, 4), 16);
                const b = parseInt(color.substring(4, 6), 16);
                const p = percent / 100;
                const newR = Math.min(255, Math.round(r + (255 - r) * p));
                const newG = Math.min(255, Math.round(g + (255 - g) * p));
                const newB = Math.min(255, Math.round(b + (255 - b) * p));
                const toHex = c => ('00' + c.toString(16)).slice(-2);
                return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`;
            };

            /**
             * Converts a hex color to rgba with specified alpha.
             * @param {string} hex The hex color string.
             * @param {number} alpha The alpha value (0-1).
             * @returns {string} The rgba color string.
             */
            const hexToRgba = (hex, alpha) => {
                let color = hex.startsWith('#') ? hex.slice(1) : hex;
                const r = parseInt(color.substring(0, 2), 16);
                const g = parseInt(color.substring(2, 4), 16);
                const b = parseInt(color.substring(4, 6), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            };

            /**
             * Draws a rounded rectangle on the canvas.
             * @param {CanvasRenderingContext2D} ctx The canvas context.
             * @param {number} x The x position.
             * @param {number} y The y position.
             * @param {number} width The width.
             * @param {number} height The height.
             * @param {number} radius The corner radius.
             */
            const drawRoundedRect = (ctx, x, y, width, height, radius) => {
                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + width - radius, y);
                ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
                ctx.lineTo(x + width, y + height - radius);
                ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
                ctx.lineTo(x + radius, y + height);
                ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.closePath();
                ctx.fill();
            };

            const updateUIFromState = () => {
                // General Settings
                // document.body.style.fontFamily = fontSelect.value; // Font is a UI preference, don't save/load
                document.body.classList.toggle('dark-mode', state.isDarkMode);
                colorModeToggle.textContent = state.isDarkMode ? 'Dark Mode' : 'Light Mode';
                uiAccentColorInput.value = state.uiAccentColor;
                updateUIAccentColor(state.uiAccentColor);

                fontSelectModal.value = fontSelect.value;
                colorModeToggleModal.textContent = colorModeToggle.textContent;
                uiAccentColorInputModal.value = uiAccentColorInput.value;

                // Screen Settings
                unitSelector.value = state.unit;
                unitLabels.forEach(label => label.textContent = unitSelector.options[unitSelector.selectedIndex].textContent.match(/\(([^)]+)\)/)[1]);
                state.isPanelCountMode = !!state.isPanelCountMode; // Coerce to boolean
                sizingModeToggle.textContent = state.isPanelCountMode ? 'Use Panel Count' : 'Use Physical Dimensions';
                screenDimensionsGroup.style.display = state.isPanelCountMode ? 'none' : 'block';
                panelCountGroup.style.display = state.isPanelCountMode ? 'block' : 'none';
                panelsWidthInput.value = state.panelsInWidth;
                panelsHeightInput.value = state.panelsInHeight;
                screenWidthInput.value = state.screenWidth;
                screenHeightInput.value = state.screenHeight;
                panelWidthSelect.value = state.panelWidth;
                panelHeightSelect.value = state.panelHeight;
                panelResWidthInput.value = state.panelResWidth;
                panelResHeightInput.value = state.panelResHeight;
                
                // Color Settings
                color1Input.value = state.color1;
                color2Input.value = state.color2;
                color2BrightnessToggle.checked = state.isColor2Brighter;
                color2Input.disabled = state.isColor2Brighter;
                updateColorPreviews();

                // Effects
                outlineToggle.textContent = state.outlineEnabled ? 'On' : 'Off';
                outlineColorInput.value = state.outlineColor;
                outlineSizeInput.value = state.outlineSize;
                rasterEffectToggle.textContent = state.rasterEnabled ? 'On' : 'Off';
                rasterColorInput.value = state.rasterColor;
                rasterSizeInput.value = state.rasterSize;
                circleEffectToggle.textContent = state.circleEffectEnabled ? 'On' : 'Off';
                circleEffectColorInput.value = state.circleEffectColor;
                circleEffectSizeInput.value = state.circleEffectSize;
                circleEffectSizeValue.textContent = state.circleEffectSize;
                circleEffectThicknessInput.value = state.circleEffectThickness;
                crossLineEffectToggle.textContent = state.crossLineEffectEnabled ? 'On' : 'Off';
                crossLineColorInput.value = state.crossLineColor;
                crossLineSizeInput.value = state.crossLineSize;
                invertColorsToggle.textContent = state.invertColorsEnabled ? 'On' : 'Off';
                grayscaleToggle.textContent = state.grayscaleEnabled ? 'On' : 'Off';

                // Text & Numbering
                numberingToggle.textContent = state.numberingEnabled ? 'On' : 'Off';
                numberingFormatSelect.value = state.numberingFormat;
                numberingPositionSelect.value = state.numberingPosition;
                numberingSizeInput.value = state.numberingSize;
                numberingColorInput.value = state.numberingColor;
                customTextToggle.textContent = state.customTextEnabled ? 'On' : 'Off';
                customTextInput.value = state.customText;
                customTextSizeInput.value = state.customTextSize;
                customTextColorInput.value = state.customTextColor;
                customTextBgToggle.textContent = state.customTextBgEnabled ? 'BG On' : 'BG Off';
                customTextBgColorInput.value = state.customTextBgColor;
                customTextBgOpacityInput.value = Math.round(state.customTextBgOpacity * 100);
                customTextBgOpacityValue.textContent = Math.round(state.customTextBgOpacity * 100);
                customTextXInput.value = state.customTextX;
                customTextXValue.textContent = Math.round(state.customTextX || 0);
                customTextYInput.value = state.customTextY;
                customTextYValue.textContent = Math.round(state.customTextY || 0);
                specificationToggle.textContent = state.specificationEnabled ? 'On' : 'Off';
                specificationFormatToggle.textContent = state.specificationFormat === 'multi-line' ? 'Multi-line' : 'Single-line';
                specificationSizeInput.value = state.specificationSize;
                specificationColorInput.value = state.specificationColor;
                specificationXInput.value = state.specificationX;
                specificationXValue.textContent = state.specificationX;
                specificationYInput.value = state.specificationY;
                specificationYValue.textContent = Math.round(state.specificationY || 0);
                oneLineTextInput.value = state.oneLineText;
                specificationBgColorInput.value = state.specificationBgColor;
                specificationBgToggle.textContent = state.specificationBgEnabled ? 'BG On' : 'BG Off';

                // Manual Drawing Tools
                drawModeToggle.textContent = state.isDrawingMode ? 'On' : 'Off';
                drawingOverlayCanvas.classList.toggle('drawing-mode', state.isDrawingMode);
                drawingColorInput.value = state.drawingColor;
                drawingWidthInput.value = state.drawingWidth;
                drawingArrowStartToggle.textContent = state.drawingArrowStart ? 'On' : 'Off';
                drawingArrowEndToggle.textContent = state.drawingArrowEnd ? 'On' : 'Off';
                
                // CanvasMap Settings
                canvasWidthInput.value = state.canvasMapWidth;
                canvasHeightInput.value = state.canvasMapHeight;

                // PDF Settings
                mediaServerSelect.value = state.mediaServer;
                pdfFilenameInput.value = state.pdfFilename;
                pdfProjectNameInput.value = state.pdfProjectName;
                pdfVenueInput.value = state.pdfVenue;
                pdfDrawnByInput.value = state.pdfDrawnBy;
                pdfSalesInput.value = state.pdfSales;
                pdfClientInput.value = state.pdfClient;
                pdfUnitInput.value = state.pdfUnit;
                pdfEmailInput.value = state.pdfEmail;
                pdfIncludeCanvasSnapshotToggle.textContent = state.pdfIncludeCanvasSnapshot ? 'On' : 'Off';
                if (state.logoDataUrl && state.logoDataUrl.length > 100) { // Simple check if it's not the placeholder
                    logoPreview.src = state.logoDataUrl;
                    logoPreview.classList.remove('d-none');
                } else {
                    logoPreview.classList.add('d-none');
                }

                // View Options
                rulerToggle.textContent = state.canvasMapRulerEnabled ? 'On' : 'Off';
                rulerContainer.classList.toggle('rulers-on', state.canvasMapRulerEnabled);
                rulerPositionToggle.textContent = state.canvasMapRulerPosition === 'outside' ? 'Outside' : 'Inside';
                rulerContainer.classList.toggle('rulers-inside', state.canvasMapRulerPosition === 'inside');
                gridlineToggle.textContent = state.canvasMapGridEnabled ? 'On' : 'Off';
                gridlineColorInput.value = state.canvasMapGridColor;
                gridlineSpacingInput.value = state.canvasMapGridSpacing;
                magnetToggle.textContent = state.canvasMapMagnetEnabled ? 'On' : 'Off';
                magnetThresholdInput.value = state.canvasMapMagnetThreshold;
                gapToggle.textContent = state.canvasMapShowGap ? 'On' : 'Off';
                gapColorInput.value = state.canvasMapGapColor;
                coordinatesToggle.textContent = state.canvasMapShowCoordinates ? 'On' : 'Off';
                
                updateObjectPropertiesPanel();
            };

            /**
             * Resets all settings to their default values.
             */
            const resetAll = () => {
                state.unit = 'meter';
                state.screenWidth = 2;
                state.screenHeight = 2;
                state.isPanelCountMode = false;
                state.panelsInWidth = 4;
                state.panelsInHeight = 4;
                state.panelWidth = 0.5;
                state.panelHeight = 0.5;
                state.panelResWidth = 128;
                state.panelResHeight = 128;
                state.color1 = '#4a90e2';
                state.color2 = '#f5a623';
                state.isColor2Brighter = true;
                state.isDarkMode = true;
                state.uiAccentColor = '#0d6efd';
                state.outlineEnabled = true;
                state.outlineColor = '#000000';
                state.outlineSize = 2;
                state.rasterEnabled = false;
                state.rasterColor = '#000000';
                state.rasterSize = 1;
                state.circleEffectEnabled = true;
                state.circleEffectColor = '#ffffff';
                state.circleEffectSize = 100;
                state.circleEffectSizeManuallySet = false;
                state.circleEffectThickness = 2;
                state.crossLineEffectEnabled = true;
                state.crossLineColor = '#ffffff';
                state.crossLineSize = 2;
                state.invertColorsEnabled = false;
                state.grayscaleEnabled = false;
                state.importedPixelMap = null;
                state.zoomLevel = 1;
                state.numberingEnabled = true;
                state.numberingFormat = '1,1';
                state.numberingPosition = 'top-left';
                state.numberingSize = 30;
                state.numberingColor = '#000000';
                state.customTextEnabled = true;
                state.customText = 'Led Screen';
                state.customTextSize = 30;
                state.customTextColor = '#000000';
                state.customTextSizeManuallySet = false;
                state.customTextX = null;
                state.customTextY = null;
                state.customTextPositionManuallySet = false;
                state.customTextBgEnabled = true;
                state.customTextBgColor = '#ffffff';
                state.specificationEnabled = true;
                state.specificationColor = '#ffffff';
                state.specificationSize = 14;
                state.specificationSizeManuallySet = false;
                state.specificationX = 10;
                state.specificationY = null;
                state.specificationPositionManuallySet = false;
                state.specificationFormat = 'single-line';
                state.specificationBgEnabled = true;
                state.specificationBgColor = '#000000';
                state.oneLineText = '';
                state.isDrawingMode = false;
                state.drawingColor = '#ff0000';
                state.drawingWidth = 5;
                state.drawnLines = [];
                state.drawingArrowStart = false;
                state.drawingArrowEnd = false;
                state.canvasMapZoomLevel = 1;
                state.storedPixelMaps = [];
                state.savedCanvases = [];
                state.canvasMapObjects = [];
                state.canvasMapWidth = 3840;
                state.canvasMapHeight = 2160;
                state.canvasMapRulerEnabled = true;
                state.canvasMapRulerPosition = 'inside';
                state.canvasMapGridEnabled = true;
                state.canvasMapGridColor = '#cccccc';
                state.canvasMapGridSpacing = 50;
                state.canvasMapMagnetEnabled = true;
                state.canvasMapMagnetThreshold = 10;
                state.canvasMapShowGap = true;
                state.canvasMapGapColor = '#ff0000';
                state.canvasMapShowCoordinates = true;
                state.mediaServer = 'resolume';
                state.pdfFilename = 'canvasmap_details';
                state.pdfProjectName = '';
                state.pdfVenue = '';
                state.pdfDrawnBy = '';
                state.pdfSales = '';
                state.pdfClient = '';
                state.pdfUnit = '';
                state.pdfEmail = '';
                state.pdfIncludeCanvasSnapshot = true;
                state.logoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
                isDraggingCanvasMapObject = false;
                selectedCanvasMapObject = null;
                state.removedPanels.clear();
                state.hoveredPanelCoords = null;

                // Update UI from the reset state
                updateUIFromState();
                
                // Re-render everything
                renderImportedMapsGallery();
                renderSavedCanvases();
                updatePixelMap();
                updateCanvasMap();
            };

            /**
             * Updates the UI accent color based on the provided hex string.
             * @param {string} hex The new accent color in hex format.
             */
            const updateUIAccentColor = (hex) => {
                document.documentElement.style.setProperty('--accent-color', hex);
                // Simple darkening for hover effect
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                const darkerHex = `#${(r * 0.8).toFixed(0).toString(16).padStart(2, '0')}${(g * 0.8).toFixed(0).toString(16).padStart(2, '0')}${(b * 0.8).toFixed(0).toString(16).padStart(2, '0')}`;
                document.documentElement.style.setProperty('--accent-hover', darkerHex);
            };

            const createTopologyTools = () => {
                const topologyContainer = document.getElementById('topologyTools');
                topologyContainer.innerHTML = '';
                const topologies = [
                    { id: 's-lr', paths: ['M3 5 L21 5', 'M21 5 L21 12', 'M21 12 L3 12', 'M3 12 L3 19', 'M3 19 L21 19'], start: [3, 5], end: [21, 19] },
                    { id: 's-rl', paths: ['M21 5 L3 5', 'M3 5 L3 12', 'M3 12 L21 12', 'M21 12 L21 19', 'M21 19 L3 19'], start: [21, 5], end: [3, 19] },
                    { id: 's-td', paths: ['M5 3 L5 21', 'M5 21 L12 21', 'M12 21 L12 3', 'M12 3 L19 3', 'M19 3 L19 21'], start: [5, 3], end: [19, 21] },
                    { id: 's-dt', paths: ['M5 21 L5 3', 'M5 3 L12 3', 'M12 3 L12 21', 'M12 21 L19 21', 'M19 21 L19 3'], start: [5, 21], end: [19, 3] },
                    // Mirrored versions
                    { id: 's-lr-mirror', paths: ['M3 19 L21 19', 'M21 19 L21 12', 'M21 12 L3 12', 'M3 12 L3 5', 'M3 5 L21 5'], start: [3, 19], end: [21, 5] },
                    { id: 's-rl-mirror', paths: ['M21 19 L3 19', 'M3 19 L3 12', 'M3 12 L21 12', 'M21 12 L21 5', 'M21 5 L3 5'], start: [21, 19], end: [3, 5] },
                    { id: 's-td-mirror', paths: ['M19 3 L19 21', 'M19 21 L12 21', 'M12 21 L12 3', 'M12 3 L5 3', 'M5 3 L5 21'], start: [19, 3], end: [5, 21] },
                    { id: 's-dt-mirror', paths: ['M19 21 L19 3', 'M19 3 L12 3', 'M12 3 L12 21', 'M12 21 L5 21', 'M5 21 L5 3'], start: [19, 21], end: [5, 3] },
                ];

                topologies.forEach(topo => {
                    const btn = document.createElement('button');
                    btn.className = 'topology-btn';
                    btn.dataset.topology = topo.id;
                    
                    let svgPaths = topo.paths.map(p => `<path d="${p}" />`).join('');
                    
                    svgPaths += `<circle class="topo-dot" cx="${topo.start[0]}" cy="${topo.start[1]}" r="2.5" />`;
                    svgPaths += `<circle cx="${topo.end[0]}" cy="${topo.end[1]}" r="1.5" stroke-width="1.5" stroke="var(--accent-color)" fill="none" />`;

                    btn.innerHTML = `<svg viewBox="0 0 24 24">${svgPaths}</svg>`;
                    
                    btn.addEventListener('click', () => {
                        // Ensure an area has been selected first.
                        if (!state.selectionRect || !state.selectionRect.grid) {
                            showMessageBox("Please select an area on the canvas by clicking and dragging before applying a topology.");
                            return;
                        }

                        // Activate the button for visual feedback
                        document.querySelectorAll('.topology-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        state.activeTopology = topo.id;

                        // This is the corrected logic: immediately draw the topology.
                        drawTopology(topo.id);

                        // De-select the button after a short delay for better user experience
                        setTimeout(() => {
                            btn.classList.remove('active');
                            state.activeTopology = null;
                        }, 250);
                    });
                    
                    topologyContainer.appendChild(btn);
                });
            };

            /**
             * Calculates the snapped center coordinates of the panel at the given clientX, clientY.
             * @param {number} clientX Mouse/touch clientX.
             * @param {number} clientY Mouse/touch clientY.
             * @returns {{x: number, y: number}} Snapped x and y coordinates.
             */
            const getSnappedPanelCenter = (canvasX, canvasY) => {
                const panelCol = Math.floor(canvasX / state.panelPxWidth);
                const panelRow = Math.floor(canvasY / state.panelPxHeight);

                const snappedX = panelCol * state.panelPxWidth + state.panelPxWidth / 2;
                const snappedY = panelRow * state.panelPxHeight + state.panelPxHeight / 2;

                return { x: snappedX, y: snappedY };
            };

            /**
             * Draws an arrow head on the given context.
             * @param {CanvasRenderingContext2D} context The canvas context to draw on.
             * @param {number} x The x-coordinate of the arrow tip.
             * @param {number} y The y-coordinate of the arrow tip.
             * @param {number} angle The angle in radians the arrow is pointing.
             * @param {number} size The size of the arrow head.
             * @param {string} color The fill color of the arrow.
             */
            const drawArrowHead = (context, x, y, angle, size, color) => {
                context.save();
                context.translate(x, y);
                context.rotate(angle);
                context.beginPath();
                context.moveTo(0, 0);
                context.lineTo(-size, -size / 2);
                context.lineTo(-size, size / 2);
                context.closePath();
                context.fillStyle = color;
                context.fill();
                context.restore();
            };

            /**
             * Renders the pixel map on the canvas based on current state.
             */
            const updatePixelMap = () => {
                try {
                    let numPanelsWidth, numPanelsHeight;

                    if (state.isPanelCountMode) {
                        numPanelsWidth = state.panelsInWidth;
                        numPanelsHeight = state.panelsInHeight;
                    } else {
                        const currentUnit = state.unit;
                        const screenWidthBase = convertUnits(state.screenWidth, currentUnit, 'meter');
                        const screenHeightBase = convertUnits(state.screenHeight, currentUnit, 'meter');
                        const panelWidthBase = state.panelWidth;
                        const panelHeightBase = state.panelHeight;
                        
                        numPanelsWidth = Math.floor(screenWidthBase / panelWidthBase);
                        numPanelsHeight = Math.floor(screenHeightBase / panelHeightBase);
                    }

                    // Validate calculations; if invalid, fall back to sane defaults so something renders
                    if (numPanelsWidth <= 0 || numPanelsHeight <= 0 || isNaN(numPanelsWidth) || isNaN(numPanelsHeight)) {
                        console.warn('Invalid panel calculation. Falling back to defaults (4x4).');
                        numPanelsWidth = state.panelsInWidth || 4;
                        numPanelsHeight = state.panelsInHeight || 4;
                    }

                    // Calculate total resolution
                    state.totalResWidth = numPanelsWidth * state.panelResWidth;
                    state.totalResHeight = numPanelsHeight * state.panelResHeight;
                    
                    // Dynamically set max values for sliders
                    customTextXInput.max = state.totalResWidth;
                    customTextYInput.max = state.totalResHeight;
                    specificationXInput.max = state.totalResWidth;
                    specificationYInput.max = state.totalResHeight;
                    
                    const maxRadius = Math.max(state.totalResWidth, state.totalResHeight) / 2;
                    circleEffectSizeInput.max = maxRadius;
                    if (!state.circleEffectSizeManuallySet) {
                        const defaultRadius = Math.min(state.totalResWidth, state.totalResHeight) / 2;
                        state.circleEffectSize = defaultRadius;
                        circleEffectSizeInput.value = defaultRadius;
                        circleEffectSizeValue.textContent = Math.round(defaultRadius);
                    }

                    if (!state.customTextSizeManuallySet) {
                        const defaultFontSize = Math.max(14, Math.round(Math.min(state.totalResWidth, state.totalResHeight) / 15));
                        state.customTextSize = defaultFontSize;
                        customTextSizeInput.value = defaultFontSize;
                    }

                    // Auto-size specification text if not manually set
                    if (!state.specificationSizeManuallySet) {
                        const defaultSpecSize = Math.max(12, Math.round(state.totalResHeight / 80));
                        state.specificationSize = defaultSpecSize;
                        specificationSizeInput.value = defaultSpecSize;
                    }


                    // Center custom text initially or on resize if not manually set
                    if (state.customTextX === null || !state.customTextPositionManuallySet) {
                        state.customTextX = state.totalResWidth / 2;
                        state.customTextY = state.totalResHeight / 2;
                        customTextXInput.value = Math.round(state.customTextX);
                        customTextYInput.value = Math.round(state.customTextY);
                        customTextXValue.textContent = Math.round(state.customTextX);
                        customTextYValue.textContent = Math.round(state.customTextY);
                    }
                    // Position specification text initially or on resize if not manually set
                    if (state.specificationY === null || !state.specificationPositionManuallySet) {
                        state.specificationX = 10;
                        state.specificationY = state.totalResHeight - 10;
                        specificationXInput.value = Math.round(state.specificationX);
                        specificationYInput.value = Math.round(state.specificationY);
                        specificationXValue.textContent = Math.round(state.specificationX);
                        specificationYValue.textContent = Math.round(state.specificationY);
                    }

                    // Update UI with calculated values
                    const totalPanels = numPanelsWidth * numPanelsHeight;
                    const enabledPanels = totalPanels - state.removedPanels.size;
                    canvasInfo.textContent = `Total Resolution: ${state.totalResWidth}x${state.totalResHeight} px | Panels: ${numPanelsWidth}x${numPanelsHeight} | Total Panels: ${totalPanels} | Enabled Panels: ${enabledPanels}`;
                    
                    // Set canvas dimensions for both canvases
                    pixelMapCanvas.width = state.totalResWidth;
                    pixelMapCanvas.height = state.totalResHeight;
                    drawingOverlayCanvas.width = state.totalResWidth;
                    drawingOverlayCanvas.height = state.totalResHeight;
                    
                    // Store panel dimensions for snapping
                    state.panelPxWidth = state.panelResWidth;
                    state.panelPxHeight = state.panelResHeight;

                    // Clear and draw the base pixel map (ctx)
                    ctx.clearRect(0, 0, pixelMapCanvas.width, pixelMapCanvas.height);
                    
                    const panelPxWidth = state.panelResWidth;
                    const panelPxHeight = state.panelResHeight;
                    
                    for (let row = 0; row < numPanelsHeight; row++) {
                        for (let col = 0; col < numPanelsWidth; col++) {
                            const panelKey = `${row},${col}`;
                            
                            // Check if the panel is removed
                            if (state.removedPanels.has(panelKey)) {
                                ctx.fillStyle = 'rgba(0,0,0,0)'; // Make removed panels transparent
                                ctx.clearRect(col * panelPxWidth, row * panelPxHeight, panelPxWidth, panelPxHeight);
                            } else {
                                // Checkerboard pattern logic
                                if ((row + col) % 2 === 0) {
                                    ctx.fillStyle = state.color1;
                                } else {
                                    ctx.fillStyle = state.color2;
                                }
                                // Draw the panel
                                ctx.fillRect(col * panelPxWidth, row * panelPxHeight, panelPxWidth, panelPxHeight);
                            }
                        }
                    }

                    // Draw outlines if enabled
                    if (state.outlineEnabled) {
                        ctx.strokeStyle = state.outlineColor;
                        ctx.lineWidth = state.outlineSize;
                        for (let row = 0; row < numPanelsHeight; row++) {
                            for (let col = 0; col < numPanelsWidth; col++) {
                                const panelKey = `${row},${col}`;
                                if (!state.removedPanels.has(panelKey)) {
                                    ctx.strokeRect(col * panelPxWidth, row * panelPxHeight, panelPxWidth, panelPxHeight);
                                }
                            }
                        }
                    }

                    // Apply raster effect logic
                    if (state.rasterEnabled) {
                        ctx.fillStyle = state.rasterColor;
                        const dotSize = state.rasterSize;
                        
                        // Loop through each panel
                        for (let row = 0; row < numPanelsHeight; row++) {
                            for (let col = 0; col < numPanelsWidth; col++) {
                                const panelKey = `${row},${col}`;
                                if (state.removedPanels.has(panelKey)) continue;
                                // Loop through a grid within each panel to draw dots
                                for (let i = 0; i < panelPxWidth; i += dotSize * 2) {
                                    for (let j = 0; j < panelPxHeight; j += dotSize * 2) {
                                        ctx.fillRect(
                                            (col * panelPxWidth) + i, 
                                            (row * panelPxHeight) + j, 
                                            dotSize, 
                                            dotSize
                                        );
                                    }
                                }
                            }
                        }
                    }

                    // Apply circle effect if enabled
                    if (state.circleEffectEnabled) {
                        const centerX = pixelMapCanvas.width / 2;
                        const centerY = pixelMapCanvas.height / 2;
                        ctx.strokeStyle = state.circleEffectColor;
                        ctx.lineWidth = state.circleEffectThickness;
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, state.circleEffectSize, 0, 2 * Math.PI);
                        ctx.stroke();
                    }

                    // Apply cross line effect if enabled
                    if (state.crossLineEffectEnabled) {
                        ctx.strokeStyle = state.crossLineColor;
                        ctx.lineWidth = state.crossLineSize;
                        ctx.lineCap = 'round';
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.lineTo(pixelMapCanvas.width, pixelMapCanvas.height);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(pixelMapCanvas.width, 0);
                        ctx.lineTo(0, pixelMapCanvas.height);
                        ctx.stroke();
                    }
                    
                    // Draw panel numbering if enabled (on base canvas)
                    if (state.numberingEnabled) {
                        ctx.font = `${state.numberingSize}px Arial`;
                        ctx.fillStyle = state.numberingColor;
                        
                        let panelCounter = 1; // Initialize counter for sequential numbering

                        for (let row = 0; row < numPanelsHeight; row++) {
                            for (let col = 0; col < numPanelsWidth; col++) {
                                const panelKey = `${row},${col}`;
                                
                                if (!state.removedPanels.has(panelKey)) {
                                    let numberingText;
                                    if (state.numberingFormat === '1,1') {
                                        numberingText = `${row + 1},${col + 1}`;
                                    } else if (state.numberingFormat === '1,A') {
                                        const colLetter = String.fromCharCode(65 + col);
                                        numberingText = `${row + 1},${colLetter}`;
                                    } else if (state.numberingFormat === '1,2,3,4') {
                                        numberingText = panelCounter;
                                    }

                                    let x, y;
                                    const margin = 5; // Margin for corner positions
                                    switch(state.numberingPosition) {
                                        case 'top-left':
                                            ctx.textAlign = 'left';
                                            ctx.textBaseline = 'top';
                                            x = col * panelPxWidth + margin;
                                            y = row * panelPxHeight + margin;
                                            break;
                                        case 'top-right':
                                            ctx.textAlign = 'right';
                                            ctx.textBaseline = 'top';
                                            x = (col + 1) * panelPxWidth - margin;
                                            y = row * panelPxHeight + margin;
                                            break;
                                        case 'center':
                                        default:
                                            ctx.textAlign = 'center';
                                            ctx.textBaseline = 'middle';
                                            x = col * panelPxWidth + panelPxWidth / 2;
                                            y = row * panelPxHeight + panelPxHeight / 2;
                                            break;
                                    }
                                    
                                    ctx.fillText(numberingText, x, y);
                                    panelCounter++;
                                }
                            }
                        }
                    }

                    // Draw custom text if enabled (on base canvas)
                    if (state.customTextEnabled) {
                        ctx.font = `${state.customTextSize}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        
                        if (state.customTextBgEnabled) {
                            const textMetrics = ctx.measureText(state.customText);
                            const textHeight = state.customTextSize * 1.2;
                            const padding = 5;
                            const radius = 10; // Corner radius for rounded edges
                            ctx.fillStyle = hexToRgba(state.customTextBgColor, state.customTextBgOpacity);
                            drawRoundedRect(
                                ctx,
                                state.customTextX - (textMetrics.width / 2) - padding,
                                state.customTextY - (textHeight / 2) - padding,
                                textMetrics.width + (padding * 2),
                                textHeight + (padding * 2),
                                radius
                            );
                        }
                        
                        ctx.fillStyle = state.customTextColor;
                        ctx.fillText(state.customText, state.customTextX, state.customTextY);
                    }
                    
                    // Apply image-wide effects
                    const imageData = ctx.getImageData(0, 0, pixelMapCanvas.width, pixelMapCanvas.height);
                    const data = imageData.data;

                    for (let i = 0; i < data.length; i += 4) {
                        let r = data[i];
                        let g = data[i + 1];
                        let b = data[i + 2];

                        // Grayscale
                        if (state.grayscaleEnabled) {
                            const avg = (r + g + b) / 3;
                            r = g = b = avg;
                        }
                        
                        // Clamp values
                        data[i] = Math.max(0, Math.min(255, r));
                        data[i + 1] = Math.max(0, Math.min(255, g));
                        data[i + 2] = Math.max(0, Math.min(255, b));
                    }
                    ctx.putImageData(imageData, 0, 0);

                    // Invert Colors (applied last as a composite operation)
                    if (state.invertColorsEnabled) {
                        ctx.globalCompositeOperation = 'difference';
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, pixelMapCanvas.width, pixelMapCanvas.height);
                        ctx.globalCompositeOperation = 'source-over'; // Reset
                    }


                    // Draw specifications if enabled
                    if (state.specificationEnabled) {
                        const gcd = (a, b) => b ? gcd(b, a % b) : a;
                        const divisor = gcd(state.totalResWidth, state.totalResHeight);
                        
                        ctx.font = `${state.specificationSize}px Arial`;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'bottom';

                        const specLines = [];
                        if (state.oneLineText.trim() !== '') {
                            specLines.push(state.oneLineText.trim());
                        }
                        
                        const totalPanels = numPanelsWidth * numPanelsHeight;
                        const autoSpecLines = [
                            `Panels: ${numPanelsWidth} x ${numPanelsHeight} (${totalPanels} total)`,
                            `Resolution: ${state.totalResWidth} x ${state.totalResHeight}`,
                            `Aspect Ratio: ${state.totalResWidth / divisor}:${state.totalResHeight / divisor}`
                        ];

                        if (state.specificationFormat === 'single-line') {
                            specLines.push(autoSpecLines.join(' | '));
                        } else {
                            specLines.push(...autoSpecLines);
                        }
                        
                        if (state.specificationBgEnabled) {
                            let maxWidth = 0;
                            specLines.forEach(line => {
                                const metrics = ctx.measureText(line);
                                if (metrics.width > maxWidth) {
                                    maxWidth = metrics.width;
                                }
                            });
                            const padding = 4;
                            const bgX = state.specificationX - padding;
                            const bgWidth = maxWidth + (padding * 2);
                            const totalTextHeight = specLines.length * state.specificationSize * 1.2;
                            const bgHeight = totalTextHeight + (padding * 2) - (state.specificationSize * 0.2);
                            const bgY = state.specificationY - totalTextHeight - padding + (state.specificationSize * 0.2);
                            
                            ctx.fillStyle = state.specificationBgColor;
                            ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
                        }

                        let yPos = state.specificationY;
                        for (let i = specLines.length - 1; i >= 0; i--) {
                            ctx.fillStyle = state.specificationColor;
                            ctx.fillText(specLines[i], state.specificationX, yPos);
                            yPos -= state.specificationSize * 1.2;
                        }
                    }

                    // Apply zoom and fit to screen settings
                    applyCanvasTransform();
                    redrawDrawingOverlay(); // Redraw both manual drawing and hover effect
                } catch (error) {
                    console.error("Error in updatePixelMap:", error);
                    showMessageBox("An unexpected error occurred while updating the pixel map.");
                }
            };
            
            /**
             * Applies the current zoom level to the canvas display.
             */
            const applyCanvasTransform = () => {
                const canvasDisplayWidth = state.totalResWidth * state.zoomLevel;
                const canvasDisplayHeight = state.totalResHeight * state.zoomLevel;
                
                pixelMapCanvas.style.width = `${canvasDisplayWidth}px`;
                pixelMapCanvas.style.height = `${canvasDisplayHeight}px`;
                drawingOverlayCanvas.style.width = `${canvasDisplayWidth}px`;
                drawingOverlayCanvas.style.height = `${canvasDisplayHeight}px`;
            };
            
            /**
             * Draws the imported pixel map on the CanvasMap tab's canvas.
             */
            const updateCanvasMap = () => {
                // Any CanvasMap change can affect the PDF preview content
                state.pdfPreviewDirty = true;
                const canvasW = state.canvasMapWidth;
                const canvasH = state.canvasMapHeight;
                
                canvasMapCanvas.width = canvasW;
                canvasMapCanvas.height = canvasH;
                
                canvasMapCtx.clearRect(0, 0, canvasW, canvasH);

                applyCanvasMapTransform(); // Apply zoom
                redrawCanvasMapObjects(); // Redraw all objects on CanvasMap
                
                // Draw custom text if enabled (on CanvasMap canvas)
                if (state.customTextEnabled) {
                    canvasMapCtx.save();
                    canvasMapCtx.scale(state.canvasMapZoomLevel, state.canvasMapZoomLevel); // Apply zoom
                    canvasMapCtx.font = `${state.customTextSize}px Arial`;
                    canvasMapCtx.textAlign = 'center';
                    canvasMapCtx.textBaseline = 'middle';
                    
                    if (state.customTextBgEnabled) {
                        const textMetrics = canvasMapCtx.measureText(state.customText);
                        const textHeight = state.customTextSize * 1.2;
                        const padding = 5;
                        const radius = 10;
                        canvasMapCtx.fillStyle = hexToRgba(state.customTextBgColor, state.customTextBgOpacity);
                        drawRoundedRect(
                            canvasMapCtx,
                            (canvasW / 2) - (textMetrics.width / 2) - padding,
                            (canvasH / 2) - (textHeight / 2) - padding,
                            textMetrics.width + (padding * 2),
                            textHeight + (padding * 2),
                            radius
                        );
                    }
                    
                    canvasMapCtx.fillStyle = state.customTextColor;
                    canvasMapCtx.fillText(state.customText, canvasW / 2, canvasH / 2);
                    canvasMapCtx.restore();
                }
                
                if (state.canvasMapRulerEnabled) {
                    drawRulers();
                }
            };

            /**
             * Applies the current zoom level to the CanvasMap canvas display.
             */
            const applyCanvasMapTransform = () => {
                const canvasDisplayWidth = canvasMapCanvas.width * state.canvasMapZoomLevel;
                const canvasDisplayHeight = canvasMapCanvas.height * state.canvasMapZoomLevel;
                
                canvasMapCanvas.style.width = `${canvasDisplayWidth}px`;
                canvasMapCanvas.style.height = `${canvasDisplayHeight}px`;
            };

            const clearDrawingOverlay = () => {
                drawingCtx.clearRect(0, 0, drawingOverlayCanvas.width, drawingOverlayCanvas.height);
                state.drawnLines = []; // Also clear stored lines
                state.drawingLineCounter = 1; // Reset the line counter
            };

            /**
             * Redraws all stored manual lines and the current preview line, and the hover effect.
             */
            const redrawDrawingOverlay = () => {
                drawingCtx.clearRect(0, 0, drawingOverlayCanvas.width, drawingOverlayCanvas.height);

                // Draw all previously completed lines
                state.drawnLines.forEach(line => {
                    drawingCtx.strokeStyle = line.color;
                    drawingCtx.lineWidth = line.width;
                    drawingCtx.lineCap = 'round';
                    drawingCtx.lineJoin = 'round';
                    drawingCtx.beginPath();
                    drawingCtx.moveTo(line.x1, line.y1);
                    drawingCtx.lineTo(line.x2, line.y2);
                    drawingCtx.stroke();

                    const arrowSize = line.width * 3; // Arrow size relative to line width
                    if (line.arrowStart) { // Keep existing arrow logic for manual lines
                        const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
                        drawArrowHead(drawingCtx, line.x1, line.y1, angle + Math.PI, arrowSize, line.color);
                    }
                    if (line.arrowEnd) {
                        const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
                        drawArrowHead(drawingCtx, line.x2, line.y2, angle, arrowSize, line.color);
                    }

                    // Draw numbered circle if it's a topology line
                    if (line.startNumber) {
                        const circleRadius = Math.max(10, line.width * 2.5); // Ensure a minimum size
                        const fontSize = circleRadius * 1.1;

                        // Draw circle
                        drawingCtx.fillStyle = line.color;
                        drawingCtx.beginPath();
                        drawingCtx.arc(line.x1, line.y1, circleRadius, 0, 2 * Math.PI);
                        drawingCtx.fill();

                        // Draw number inside circle
                        drawingCtx.fillStyle = 'white'; // A contrasting color
                        drawingCtx.font = `bold ${fontSize}px Segoe UI`;
                        drawingCtx.textAlign = 'center';
                        drawingCtx.textBaseline = 'middle';
                        drawingCtx.fillText(line.startNumber.toString(), line.x1, line.y1);
                    }
                });

                // Draw the selection rectangle
                if (state.selectionRect) {
                    drawingCtx.fillStyle = 'rgba(13, 110, 253, 0.3)'; // Use accent color with alpha
                    drawingCtx.strokeStyle = 'rgba(13, 110, 253, 0.8)';
                    drawingCtx.lineWidth = 2;

                    if (state.selectionRect.grid && !state.isSelecting) {
                        // Draw snapped rectangle after selection is complete
                        const { startRow, startCol, endRow, endCol } = state.selectionRect.grid;
                        const x = startCol * state.panelPxWidth;
                        const y = startRow * state.panelPxHeight;
                        const width = (endCol - startCol + 1) * state.panelPxWidth;
                        const height = (endRow - startRow + 1) * state.panelPxHeight;
                        drawingCtx.fillRect(x, y, width, height);
                        drawingCtx.strokeRect(x, y, width, height);
                    } else if (state.isSelecting) {
                        // Draw freeform rectangle while selecting
                        const { startX, startY, endX, endY } = state.selectionRect;
                        const width = endX - startX;
                        const height = endY - startY;
                        drawingCtx.fillRect(startX, startY, width, height);
                        drawingCtx.strokeRect(startX, startY, width, height);
                    }
                }
                
                // Draw the hover effect if a panel is hovered
                if (state.hoveredPanelCoords) {
                    drawHoverEffect(state.hoveredPanelCoords.row, state.hoveredPanelCoords.col);
                }
            };
            
            /**
             * Draws the hover effect on the drawing overlay.
             * @param {number} row The row index of the hovered panel.
             * @param {number} col The column index of the hovered panel.
             */
            const drawHoverEffect = (row, col) => {
                const panelX = col * state.panelPxWidth;
                const panelY = row * state.panelPxHeight;

                drawingCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                drawingCtx.fillRect(panelX, panelY, state.panelPxWidth, state.panelPxHeight);
            };

            /**
             * Draws the gridlines on the CanvasMap.
             * @param {CanvasRenderingContext2D} ctx The context to draw on.
             */
            const drawGridlines = (ctx) => {
                if (!state.canvasMapGridEnabled) return;

                const spacing = state.canvasMapGridSpacing;
                ctx.strokeStyle = state.canvasMapGridColor;
                ctx.lineWidth = 1;
                ctx.beginPath();

                // Vertical lines
                for (let x = spacing; x < ctx.canvas.width; x += spacing) {
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, ctx.canvas.height);
                }

                // Horizontal lines
                for (let y = spacing; y < ctx.canvas.height; y += spacing) {
                    ctx.moveTo(0, y);
                    ctx.lineTo(ctx.canvas.width, y);
                }
                ctx.stroke();
            };

            /**
             * Draws the rulers for the CanvasMap.
             */
            const drawRulers = () => {
                rulerHorizontal.innerHTML = '';
                rulerVertical.innerHTML = '';

                const scrollX = canvasMapContainer.scrollLeft;
                const scrollY = canvasMapContainer.scrollTop;
                const zoom = state.canvasMapZoomLevel;

                const majorTickInterval = 100;
                const minorTickInterval = 10;
                
                // Horizontal Ruler
                for (let i = 0; i < canvasMapCanvas.width * zoom; i += minorTickInterval * zoom) {
                    const isMajor = i % (majorTickInterval * zoom) === 0;
                    const mark = document.createElement('div');
                    mark.className = 'ruler-mark';
                    mark.style.left = `${i - scrollX}px`;
                    mark.style.height = isMajor ? '10px' : '5px';
                    rulerHorizontal.appendChild(mark);

                    if (isMajor) {
                        const label = document.createElement('div');
                        label.className = 'ruler-mark-label';
                        label.textContent = i / zoom;
                        label.style.left = `${i - scrollX}px`;
                        rulerHorizontal.appendChild(label);
                    }
                }

                // Vertical Ruler
                for (let i = 0; i < canvasMapCanvas.height * zoom; i += minorTickInterval * zoom) {
                    const isMajor = i % (majorTickInterval * zoom) === 0;
                    const mark = document.createElement('div');
                    mark.className = 'ruler-mark';
                    mark.style.top = `${i - scrollY}px`;
                    mark.style.width = isMajor ? '10px' : '5px';
                    rulerVertical.appendChild(mark);

                    if (isMajor) {
                        const label = document.createElement('div');
                        label.className = 'ruler-mark-label';
                        label.textContent = i / zoom;
                        label.style.top = `${i - scrollY}px`;
                        rulerVertical.appendChild(label);
                    }
                }
            };

            /**
             * Draws the measurement gaps between objects on the canvas.
             * @param {CanvasRenderingContext2D} ctx The context to draw on.
             */
            const drawMeasurementGaps = (ctx) => {
                if (!state.canvasMapShowGap || state.canvasMapObjects.length < 2) return;

                // --- Horizontal Gaps ---
                const sortedObjectsX = [...state.canvasMapObjects].sort((a, b) => a.x - b.x);

                for (let i = 0; i < sortedObjectsX.length - 1; i++) {
                    const obj1 = sortedObjectsX[i];
                    const obj2 = sortedObjectsX[i + 1];

                    const gap = obj2.x - (obj1.x + obj1.width);

                    if (gap > 0) {
                        const obj1Right = obj1.x + obj1.width;
                        const midY = Math.min(obj1.y + obj1.height / 2, obj2.y + obj2.height / 2);
                        const textMidX = obj1Right + gap / 2;

                        ctx.save();
                        ctx.strokeStyle = state.canvasMapGapColor;
                        ctx.fillStyle = state.canvasMapGapColor;
                        ctx.lineWidth = 1;
                        ctx.font = '12px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';

                        // Draw lines
                        ctx.beginPath();
                        ctx.moveTo(obj1Right, midY - 10);
                        ctx.lineTo(obj1Right, midY + 10);
                        ctx.moveTo(obj2.x, midY - 10);
                        ctx.lineTo(obj2.x, midY + 10);
                        ctx.moveTo(obj1Right, midY);
                        ctx.lineTo(obj2.x, midY);
                        ctx.stroke();
                        
                        ctx.fillText(`${Math.round(gap)}px`, textMidX, midY - 2);
                        ctx.restore();
                    }
                }

                // --- Vertical Gaps ---
                const sortedObjectsY = [...state.canvasMapObjects].sort((a, b) => a.y - b.y);

                for (let i = 0; i < sortedObjectsY.length - 1; i++) {
                    const obj1 = sortedObjectsY[i];
                    const obj2 = sortedObjectsY[i + 1];

                    const gap = obj2.y - (obj1.y + obj1.height);

                    if (gap > 0) {
                        const obj1Bottom = obj1.y + obj1.height;
                        const midX = Math.min(obj1.x + obj1.width / 2, obj2.x + obj2.width / 2);
                        const textMidY = obj1Bottom + gap / 2;

                        ctx.save();
                        ctx.strokeStyle = state.canvasMapGapColor;
                        ctx.fillStyle = state.canvasMapGapColor;
                        ctx.lineWidth = 1;
                        ctx.font = '12px Arial';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        
                        // Draw lines
                        ctx.beginPath();
                        ctx.moveTo(midX - 10, obj1Bottom);
                        ctx.lineTo(midX + 10, obj1Bottom);
                        ctx.moveTo(midX - 10, obj2.y);
                        ctx.lineTo(midX + 10, obj2.y);
                        ctx.moveTo(midX, obj1Bottom);
                        ctx.lineTo(midX, obj2.y);
                        ctx.stroke();

                        ctx.fillText(`${Math.round(gap)}px`, midX + 12, textMidY);
                        ctx.restore();
                    }
                }
            };


            /**
             * Redraws all objects and manual drawings on the canvasMapCanvas.
             */
            const redrawCanvasMapObjects = () => {
                canvasMapCtx.clearRect(0, 0, canvasMapCanvas.width, canvasMapCanvas.height);
                
                drawGridlines(canvasMapCtx);

                // Draw PixelMap objects
                state.canvasMapObjects.forEach(obj => {
                    if (!obj.image) {
                        obj.image = new Image();
                        obj.image.onload = () => redrawCanvasMapObjects();
                        obj.image.src = obj.dataUrl;
                    }

                    if (obj.image.complete && obj.image.naturalWidth !== 0) {
                        canvasMapCtx.save();
                        canvasMapCtx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2);
                        canvasMapCtx.rotate(obj.rotation * Math.PI / 180);
                        canvasMapCtx.drawImage(obj.image, -obj.width / 2, -obj.height / 2, obj.width, obj.height);
                        
                        if (obj.selected) {
                            canvasMapCtx.strokeStyle = 'blue';
                            canvasMapCtx.lineWidth = 2;
                            canvasMapCtx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
                        }

                        // --- START: Draw position text ---
                        if (state.canvasMapShowCoordinates) {
                            const positionText = `(${Math.round(obj.x)}, ${Math.round(obj.y)})`;
                            canvasMapCtx.font = '16px Segoe UI';
                            const textMetrics = canvasMapCtx.measureText(positionText);
                            const textWidth = textMetrics.width;
                            const textHeight = 16; // font size
                            const padding = 5;

                            const rectX = -obj.width / 2;
                            const rectY = -obj.height / 2;

                            // Background for the text
                            canvasMapCtx.fillStyle = 'rgba(23, 162, 184, 0.85)'; // A nice teal color with some transparency
                            canvasMapCtx.fillRect(rectX, rectY, textWidth + padding * 2, textHeight + padding * 2);

                            // Position Text
                            canvasMapCtx.fillStyle = 'white';
                            canvasMapCtx.textBaseline = 'top';
                            canvasMapCtx.fillText(positionText, rectX + padding, rectY + padding);
                        }
                        // --- END: Draw position text ---
                        
                        canvasMapCtx.restore();
                    }
                });

                // Draw snapping guides if any
                if (isDraggingCanvasMapObject && selectedCanvasMapObject && selectedCanvasMapObject.snapIndicators && selectedCanvasMapObject.snapIndicators.length > 0) {
                    canvasMapCtx.save();
                    canvasMapCtx.strokeStyle = '#00ffff'; // A bright cyan
                    canvasMapCtx.lineWidth = 1.5;
                    canvasMapCtx.setLineDash([6, 3]);

                    selectedCanvasMapObject.snapIndicators.forEach(line => {
                        canvasMapCtx.beginPath();
                        if (line.x !== undefined) { // Vertical line
                            canvasMapCtx.moveTo(line.x, line.y1);
                            canvasMapCtx.lineTo(line.x, line.y2);
                        } else { // Horizontal line
                            canvasMapCtx.moveTo(line.x1, line.y);
                            canvasMapCtx.lineTo(line.x2, line.y);
                        }
                        canvasMapCtx.stroke();
                    });

                    canvasMapCtx.restore();
                }

                drawMeasurementGaps(canvasMapCtx);
            };

            /**
             * Updates the object properties panel with the selected object's data.
             */
            const updateObjectPropertiesPanel = () => {
                if (selectedCanvasMapObject) {
                    noObjectSelectedMessage.classList.add('d-none');
                    propertiesContent.classList.remove('d-none');
                    targetXInput.value = Math.round(selectedCanvasMapObject.x);
                    targetYInput.value = Math.round(selectedCanvasMapObject.y);
                    targetRotationInput.value = selectedCanvasMapObject.rotation;
                } else {
                    noObjectSelectedMessage.classList.remove('d-none');
                    propertiesContent.classList.add('d-none');
                }
            };

            /**
             * Converts mouse/touch client coordinates to unzoomed canvas coordinates.
             * @param {number} clientX
             * @param {number} clientY
             * @param {HTMLCanvasElement} canvasElement
             * @returns {{x: number, y: number}}
             */
            const getCanvasCoords = (clientX, clientY, canvasElement) => {
                const rect = canvasElement.getBoundingClientRect();
                const scaleX = canvasElement.width / rect.width;
                const scaleY = canvasElement.height / rect.height;
                const x = (clientX - rect.left) * scaleX;
                const y = (clientY - rect.top) * scaleY;
                return { x, y };
            };


            /**
             * Updates the circular color previews next to the color inputs.
             */
            const updateColorPreviews = () => {
                color1Preview.style.backgroundColor = color1Input.value;
                color2Preview.style.backgroundColor = color2Input.value;
            };

            /**
             * Renders the gallery of stored pixel maps in the CanvasMap tab.
             */
            const renderImportedMapsGallery = () => {
                importedMapsGallery.innerHTML = ''; // Clear existing gallery

                if (state.storedPixelMaps.length === 0) {
                    importedMapsGallery.textContent = 'No maps imported yet.';
                    return;
                }

                state.storedPixelMaps.forEach(map => {
                    const mapItem = document.createElement('div');
                    mapItem.className = 'imported-map-item';
                    mapItem.draggable = true;
                    mapItem.dataset.mapId = map.id; // Store map ID for drag-and-drop

                    const img = document.createElement('img');
                    img.src = map.dataUrl;
                    img.alt = map.filename;

                    const filenameContainer = document.createElement('div');
                    const filenameLabel = document.createElement('span');
                    filenameLabel.className = 'filename-label';
                    filenameLabel.textContent = map.filename;
                    
                    const renameInput = document.createElement('input');
                    renameInput.type = 'text';
                    renameInput.className = 'rename-input';
                    renameInput.value = map.filename;
                    renameInput.style.display = 'none';

                    filenameContainer.appendChild(filenameLabel);
                    filenameContainer.appendChild(renameInput);

                    const controls = document.createElement('div');
                    controls.className = 'map-item-controls';

                    const renameBtn = document.createElement('button');
                    renameBtn.className = 'map-control-btn';
                    renameBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'map-control-btn';
                    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`;

                    controls.appendChild(renameBtn);
                    controls.appendChild(deleteBtn);

                    mapItem.appendChild(controls);
                    mapItem.appendChild(img);
                    mapItem.appendChild(filenameContainer);
                    importedMapsGallery.appendChild(mapItem);

                    // --- Event Listeners for Rename/Delete ---
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        filenameLabel.style.display = 'none';
                        renameInput.style.display = 'block';
                        renameInput.focus();
                    });

                    const finishRename = () => {
                        const newName = renameInput.value.trim();
                        if (newName) {
                            const mapToUpdate = state.storedPixelMaps.find(m => m.id === map.id);
                            if (mapToUpdate) {
                                mapToUpdate.filename = newName;
                                // Also update any instances on the canvas
                                state.canvasMapObjects.forEach(obj => {
                                    if (obj.sourceId === map.id) {
                                        obj.filename = newName;
                                    }
                                });
                            }
                            filenameLabel.textContent = newName;
                        }
                        renameInput.style.display = 'none';
                        filenameLabel.style.display = 'block';
                    };

                    renameInput.addEventListener('blur', finishRename);
                    renameInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            finishRename();
                        }
                    });

                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Remove from stored maps
                        state.storedPixelMaps = state.storedPixelMaps.filter(m => m.id !== map.id);
                        // Remove from canvas objects
                        state.canvasMapObjects = state.canvasMapObjects.filter(obj => obj.sourceId !== map.id);
                        
                        renderImportedMapsGallery();
                        redrawCanvasMapObjects();
                    });
                });
            };
            
            // --- Saved Canvas Functions ---
            
            /**
             * Renders the gallery of saved canvas layouts.
             */
            const renderSavedCanvases = () => {
                savedCanvasesGallery.innerHTML = ''; // Clear existing gallery

                if (state.savedCanvases.length === 0) {
                    savedCanvasesGallery.textContent = 'No canvases saved yet.';
                    return;
                }

                state.savedCanvases.forEach(savedCanvas => {
                    const item = document.createElement('div');
                    item.className = 'saved-canvas-item';

                    const img = document.createElement('img');
                    img.src = savedCanvas.thumbnailUrl;
                    img.alt = savedCanvas.name;

                    const nameContainer = document.createElement('div');
                    const nameLabel = document.createElement('span');
                    nameLabel.className = 'filename-label';
                    nameLabel.textContent = savedCanvas.name;

                    const renameInput = document.createElement('input');
                    renameInput.type = 'text';
                    renameInput.className = 'rename-input';
                    renameInput.value = savedCanvas.name;
                    renameInput.style.display = 'none';

                    nameContainer.appendChild(nameLabel);
                    nameContainer.appendChild(renameInput);

                    const controls = document.createElement('div');
                    controls.className = 'saved-canvas-controls';

                    const loadBtn = document.createElement('button');
                    loadBtn.textContent = 'Load';
                    loadBtn.className = 'btn btn-secondary btn-sm';
                    loadBtn.onclick = () => loadCanvasState(savedCanvas.id);

                    const exportBtn = document.createElement('button');
                    exportBtn.textContent = 'Export';
                    exportBtn.className = 'btn btn-secondary btn-sm';
                    exportBtn.onclick = () => exportSavedCanvas(savedCanvas.id);
                    
                    const duplicateBtn = document.createElement('button');
                    duplicateBtn.textContent = 'Duplicate';
                    duplicateBtn.className = 'btn btn-secondary btn-sm';
                    duplicateBtn.onclick = () => duplicateSavedCanvas(savedCanvas.id);
                    
                    const renameBtn = document.createElement('button');
                    renameBtn.textContent = 'Rename';
                    renameBtn.className = 'btn btn-secondary btn-sm';
                    renameBtn.onclick = () => {
                        nameLabel.style.display = 'none';
                        renameInput.style.display = 'block';
                        renameInput.focus();
                    };

                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.className = 'btn btn-danger btn-sm';
                    deleteBtn.onclick = () => deleteSavedCanvas(savedCanvas.id);
                    
                    const finishRename = () => {
                        const newName = renameInput.value.trim();
                        if (newName) {
                            const canvasToUpdate = state.savedCanvases.find(c => c.id === savedCanvas.id);
                            if (canvasToUpdate) {
                                canvasToUpdate.name = newName;
                if (state.currentCanvasId === savedCanvas.id) {
                                    state.customText = newName; // Update custom text if this is the current canvas
                                    updatePixelMap(); // Redraw to show new name
                                    updateCanvasMap();
                                }
                            }
                            nameLabel.textContent = newName;
                        }
                        renameInput.style.display = 'none';
                        nameLabel.style.display = 'block';
                    };
                    
                    renameInput.addEventListener('blur', finishRename);
                    renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishRename(); });

                    controls.appendChild(loadBtn);
                    controls.appendChild(exportBtn);
                    controls.appendChild(duplicateBtn);
                    controls.appendChild(renameBtn);
                    controls.appendChild(deleteBtn);

                    item.appendChild(img);
                    item.appendChild(nameContainer);
                    item.appendChild(controls);
                    savedCanvasesGallery.appendChild(item);
                });
            };
            
            /**
             * Loads a saved canvas state into the main canvas.
             * @param {number} canvasId The ID of the canvas state to load.
             */
            const loadCanvasState = (canvasId) => {
                const savedState = state.savedCanvases.find(c => c.id === canvasId);
                if (!savedState) return;

                state.currentCanvasId = canvasId;
                state.customText = savedState.name; // Update custom text to canvas name

                // Create a deep copy of the objects to avoid mutation issues
                const objectsToLoad = JSON.parse(JSON.stringify(savedState.objects));
                
                state.canvasMapObjects = objectsToLoad;
                
                // Preload all images before drawing
                const imagePromises = state.canvasMapObjects.map(obj => {
                    return new Promise((resolve, reject) => {
                        obj.image = new Image();
                        obj.image.onload = resolve;
                        obj.image.onerror = reject;
                        obj.image.src = obj.dataUrl;
                    });
                });

                Promise.all(imagePromises).then(() => {
                    redrawCanvasMapObjects();
                    updateCanvasMap();
                    showMessageBox(`Loaded canvas: "${savedState.name}"`);
                }).catch(err => {
                    console.error("Error loading images for canvas state:", err);
                    showMessageBox("Could not load one or more images for the saved canvas.");
                });
            };

            /**
             * Deletes a saved canvas state.
             * @param {number} canvasId The ID of the canvas state to delete.
             */
            const deleteSavedCanvas = (canvasId) => {
                state.savedCanvases = state.savedCanvases.filter(c => c.id !== canvasId);
                renderSavedCanvases();
            };

            const renderPixelMapSentGallery = () => {
                const gallery = document.getElementById('pixelMapSentGallery');
                const countEl = document.getElementById('pixelMapSentCount');
                if (!gallery || !countEl) return;

                gallery.innerHTML = ''; // Clear existing

                if (state.storedPixelMaps.length === 0) {
                    gallery.innerHTML = '<div class="text-muted p-3 text-center" style="width:100%;">Screens you send to CanvasMap will appear here.</div>';
                    countEl.textContent = '0 items';
                    return;
                }

                countEl.textContent = `${state.storedPixelMaps.length} item${state.storedPixelMaps.length > 1 ? 's' : ''}`;

                state.storedPixelMaps.forEach(map => {
                    const item = document.createElement('div');
                    item.className = 'sent-item';
                    item.dataset.mapId = map.id;
                    item.title = `Click or drag to load "${map.filename}" for editing`;
                    item.draggable = true;

                    const img = document.createElement('img');
                    img.src = map.dataUrl;
                    img.alt = map.filename;

                    const title = document.createElement('div');
                    title.className = 'sent-title';
                    title.textContent = map.filename;

                    const meta = document.createElement('div');
                    meta.className = 'sent-meta';
                    meta.textContent = `${map.details.resWidth}x${map.details.resHeight}`;

                    item.appendChild(img);
                    item.appendChild(title);
                    item.appendChild(meta);
                    gallery.appendChild(item);
                });
            };

            const loadPixelMapState = (mapId) => {
                const mapData = state.storedPixelMaps.find(m => m.id === mapId);
                if (!mapData) {
                    showToast('Could not find the selected screen data.', 'danger');
                    return;
                }

                const mapDetailsToState = (details) => {
                    if (!details) return {};
                    return {
                        unit: details.unit,
                        screenWidth: details.actualWidth,
                        screenHeight: details.actualHeight,
                        panelsInWidth: details.panelsWidth,
                        panelsInHeight: details.panelsHeight,
                        panelResWidth: details.panelRes ? parseInt(details.panelRes.split('x')[0], 10) : 128,
                        panelResHeight: details.panelRes ? parseInt(details.panelRes.split('x')[1], 10) : 128,
                        totalResWidth: details.resWidth,
                        totalResHeight: details.resHeight,
                        panelWidth: details.panelSize ? parseFloat(details.panelSize.split('x')[0]) : 0.5,
                        panelHeight: details.panelSize ? parseFloat(details.panelSize.split('x')[1]) : 0.5,
                    };
                };

                const stateUpdates = {
                    ...mapData, 
                    ...mapDetailsToState(mapData.details),
                    removedPanels: new Set(mapData.removedPanels || []),
                };

                Object.keys(stateUpdates).forEach(key => {
                    if (Object.prototype.hasOwnProperty.call(state, key) && key !== 'id') {
                         state[key] = stateUpdates[key];
                    }
                });

                updateUIFromState();
                updatePixelMap();

                const gallery = document.getElementById('pixelMapSentGallery');
                if (gallery) {
                    Array.from(gallery.children).forEach(child => {
                        child.classList.toggle('active', parseInt(child.dataset.mapId, 10) === mapId);
                    });
                }
                
                showToast(`Loaded screen: "${mapData.filename}"`, 'info');
            };
            
            /**
             * Duplicates a saved canvas state.
             * @param {number} canvasId The ID of the canvas state to duplicate.
             */
            const duplicateSavedCanvas = (canvasId) => {
                const original = state.savedCanvases.find(c => c.id === canvasId);
                if (!original) return;

                const duplicated = {
                    id: Date.now(),
                    name: `Copy of ${original.name}`,
                    thumbnailUrl: original.thumbnailUrl,
                    objects: JSON.parse(JSON.stringify(original.objects))
                };

                state.savedCanvases.push(duplicated);
                state.currentCanvasId = duplicated.id;
                state.customText = duplicated.name;
                renderSavedCanvases();
                updateCanvasMap();
                showMessageBox(`Duplicated canvas: "${duplicated.name}"`);
            };
            
            /**
             * Exports a specific saved canvas state to a PNG file.
             * @param {number} canvasId The ID of the canvas state to export.
             */
            const exportSavedCanvas = async (canvasId) => {
                const savedState = state.savedCanvases.find(c => c.id === canvasId);
                if (!savedState) return;

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasMapCanvas.width;
                tempCanvas.height = canvasMapCanvas.height;
                const tempCtx = tempCanvas.getContext('2d');

                // Load all images for the saved state
                const imageLoadPromises = savedState.objects.map(objData => {
                    return new Promise((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => resolve({ img, data: objData });
                        img.onerror = reject;
                        img.src = objData.dataUrl;
                    });
                });

                try {
                    const loadedImages = await Promise.all(imageLoadPromises);
                    
                    // Draw all loaded images onto the temp canvas
                    loadedImages.forEach(({ img, data }) => {
                        tempCtx.save();
                        tempCtx.translate(data.x + data.width / 2, data.y + data.height / 2);
                        tempCtx.rotate(data.rotation * Math.PI / 180);
                        tempCtx.drawImage(img, -data.width / 2, -data.height / 2, data.width, data.height);
                        tempCtx.restore();
                    });

                    // Trigger download
                    const link = document.createElement('a');
                    link.download = `${savedState.name}.png`;
                    link.href = tempCanvas.toDataURL('image/png');
                    link.click();

                } catch (error) {
                    console.error("Error exporting saved canvas:", error);
                    showMessageBox("Failed to export saved canvas. An image may be corrupted.");
                }
            };


            // --- Event Listeners ---
            
            // Tab switching handled by Bootstrap's data-bs-toggle
            
            // Toggle icon for collapse
            collapseToggles.forEach(toggle => {
                toggle.addEventListener('click', () => {
                    const icon = toggle.querySelector('.toggle-icon');
                    if (icon) {
                        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
                        icon.textContent = isExpanded ? '+' : '-';
                    }
                });
            });


            
            loadProjectInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const loadedState = JSON.parse(event.target.result);
                        
                        // Merge the loaded state into the current state
                        Object.assign(state, loadedState);
                        
                        // JSON doesn't have a Set type, so we need to reconstruct it from the array
                        if (Array.isArray(loadedState.removedPanels)) {
                            state.removedPanels = new Set(loadedState.removedPanels);
                        } else {
                            state.removedPanels = new Set(); // fallback
                        }

                        // The image objects were not saved, so they are null.
                        // The render functions will automatically recreate them from dataUrl.
                        
                        updateUIFromState(); // Sync all UI elements with the new state
                        
                        // Re-render everything
                        renderImportedMapsGallery();
                        renderSavedCanvases();
                        updatePixelMap();
                        updateCanvasMap();
                        
                        showMessageBox(`Project "${file.name}" loaded successfully.`);
                    } catch (error) {
                        console.error("Error loading or parsing project file:", error);
                        showMessageBox("Failed to load project file. It may be corrupted or in the wrong format.");
                    }
                    // Reset file input to allow loading the same file again
                    e.target.value = null;
                };
                reader.readAsText(file);
            });

            saveProjectBtnModal.addEventListener('click', () => {
                const dataStr = JSON.stringify(state, null, 2);
                const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
                
                const exportFileDefaultName = 'led_grid_project.pixl';
                
                const linkElement = document.createElement('a');
                linkElement.setAttribute('href', dataUri);
                linkElement.setAttribute('download', exportFileDefaultName);
                linkElement.click();
                
                showMessageBox('Project saved successfully.');
            });

            loadProjectBtnModal.addEventListener('click', () => {
                loadProjectInput.click();
            });

            fontSelectModal.addEventListener('change', (e) => {
                document.body.style.fontFamily = e.target.value;
                if (fontPreviewModal) fontPreviewModal.style.fontFamily = e.target.value;
            });

            colorModeToggleModal.addEventListener('click', () => {
                state.isDarkMode = !state.isDarkMode;
                document.body.classList.toggle('dark-mode');
                colorModeToggleModal.textContent = state.isDarkMode ? 'Dark Mode' : 'Light Mode';
                updatePixelMap();
            });

            uiAccentColorInputModal.addEventListener('input', (e) => {
                state.uiAccentColor = e.target.value;
                updateUIAccentColor(state.uiAccentColor);
                // remove active state from swatches if custom chosen
                if (accentSwatches) Array.from(accentSwatches.querySelectorAll('.accent-swatch')).forEach(s => s.classList.remove('active'));
            });

            resetAllBtnModal.addEventListener('click', () => {
                resetAll();
            });

            // Initialize font preview to current body font
            if (fontPreviewModal) {
                const currentFont = getComputedStyle(document.body).fontFamily;
                fontPreviewModal.style.fontFamily = currentFont;
            }

            // Accent swatch interactions
            if (accentSwatches) {
                accentSwatches.addEventListener('click', (e) => {
                    const sw = e.target.closest('.accent-swatch');
                    if (!sw) return;
                    const clr = sw.getAttribute('data-color');
                    uiAccentColorInputModal.value = clr;
                    state.uiAccentColor = clr;
                    updateUIAccentColor(clr);
                    accentSwatches.querySelectorAll('.accent-swatch').forEach(el => el.classList.remove('active'));
                    sw.classList.add('active');
                });
            }

                // Helper to compute and show current user's name/email near profile button
                const getCurrentUserDisplay = () => {
                    try {
                        if (!window.__IS_DEMO__) {
                            const u = firebase.auth().currentUser;
                            const stored = getStoredProfile?.() || {};
                            return stored.name || u?.displayName || u?.email || '';
                        } else {
                            const stored = getStoredProfile?.() || {};
                            if (stored.name) return stored.name;
                            try { const demo = JSON.parse(localStorage.getItem('demoAuthUser') || 'null'); return demo?.email || ''; } catch { return ''; }
                        }
                    } catch { return ''; }
                };

            // Auth UI and profile integration (Firebase or local demo)
            const setUiForAuth = (isLoggedIn) => {
                if (loginMenuItem) loginMenuItem.style.display = isLoggedIn ? 'none' : '';
                if (logoutMenuItem) logoutMenuItem.style.display = isLoggedIn ? '' : 'none';
                if (profileMenuItem) {
                    if (isLoggedIn) {
                        profileMenuItem.classList.remove('disabled');
                        profileMenuItem.removeAttribute('aria-disabled');
                        profileMenuItem.title = 'Profile';
                    } else {
                        profileMenuItem.classList.add('disabled');
                        profileMenuItem.setAttribute('aria-disabled', 'true');
                        profileMenuItem.title = 'Login required';
                    }
                }
                if (logoutInProfileBtn) logoutInProfileBtn.style.display = isLoggedIn ? '' : 'none';
                if (userNameDisplay) {
                    if (isLoggedIn) {
                        const label = getCurrentUserDisplay();
                        if (label) {
                            userNameDisplay.textContent = label;
                            userNameDisplay.title = label;
                            userNameDisplay.style.display = '';
                        } else {
                            userNameDisplay.textContent = '';
                            userNameDisplay.style.display = 'none';
                        }
                    } else {
                        userNameDisplay.textContent = '';
                        userNameDisplay.style.display = 'none';
                    }
                }
            };

            if (!window.__IS_DEMO__) {
                try {
                    const auth = firebase.auth();
                    auth.onAuthStateChanged(async (user) => {
                        const isLoggedIn = !!user;
                        setUiForAuth(isLoggedIn);
                        if (isLoggedIn) {
                            applyAuthProfile({
                                displayName: user.displayName,
                                email: user.email,
                                phoneNumber: user.phoneNumber,
                            });
                            try {
                                const cloud = await loadProfileFromCloud(user.uid);
                                if (cloud) {
                                    setStoredProfile({ ...getStoredProfile(), ...cloud });
                                    populateProfileForm(cloud);
                                    // Ensure header name reflects cloud profile
                                    setUiForAuth(true);
                                } else {
                                    // First time login (no cloud profile yet)
                                    if (!hasShownProfilePrompt()) {
                                        // Show profile modal to collect details
                                        showProfileModalNow();
                                        markProfilePromptShown();
                                    }
                                }
                            } catch { }
                        }
                    });
                    logoutMenuItem?.addEventListener('click', async () => {
                        // Immediately reflect UI and prompt login again
                        setUiForAuth(false);
                        await auth.signOut();
                        showToast('Logged out.', 'info');
                        setTimeout(() => { try { showLoginModal(true); } catch { } }, 0);
                    });
                    profileMenuItem?.addEventListener('click', (e) => {
                        if (profileMenuItem.classList.contains('disabled')) { e.preventDefault(); return; }
                        const modal = new bootstrap.Modal(document.getElementById('profileModal'));
                        modal.show();
                    });
                    logoutInProfileBtn?.addEventListener('click', async () => {
                        setUiForAuth(false);
                        await auth.signOut();
                        const modalEl = document.getElementById('profileModal');
                        const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                        inst.hide();
                        showToast('Logged out.', 'info');
                        setTimeout(() => { try { showLoginModal(true); } catch { } }, 150);
                    });
                } catch { }
            } else {
                // Local demo auth: admin@gmail.com / admin
                const DEMO_KEY = 'demoAuthUser';
                const getDemoUser = () => { try { return JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { return null; } };
                const setDemoUser = (u) => { try { u ? localStorage.setItem(DEMO_KEY, JSON.stringify(u)) : localStorage.removeItem(DEMO_KEY); } catch { } };

                const existing = getDemoUser();
                setUiForAuth(!!existing);
                if (existing) applyAuthProfile({ displayName: 'Admin User', email: existing.email });

                profileMenuItem?.addEventListener('click', (e) => {
                    if (profileMenuItem.classList.contains('disabled')) { e.preventDefault(); return; }
                    const modal = new bootstrap.Modal(document.getElementById('profileModal'));
                    modal.show();
                });
                const doDemoLogout = () => {
                    setDemoUser(null);
                    setUiForAuth(false);
                    showToast('Logged out.', 'info');
                    setTimeout(() => { try { showLoginModal(true); } catch { } }, 0);
                };
                logoutMenuItem?.addEventListener('click', doDemoLogout);
                logoutInProfileBtn?.addEventListener('click', () => {
                    doDemoLogout();
                    const modalEl = document.getElementById('profileModal');
                    const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                    inst.hide();
                });
            }

            // Reset UI prefs to defaults (Poppins, Light mode, default accent)
            if (resetUiPrefsBtn) {
                resetUiPrefsBtn.addEventListener('click', () => {
                    // Font
                    const defaultFont = "Poppins, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
                    fontSelectModal.value = defaultFont;
                    document.body.style.fontFamily = defaultFont;
                    if (fontPreviewModal) fontPreviewModal.style.fontFamily = defaultFont;

                    // Color mode
                    if (document.body.classList.contains('dark-mode')) {
                        document.body.classList.remove('dark-mode');
                        state.isDarkMode = false;
                        colorModeToggleModal.textContent = 'Dark Mode';
                    }

                    // Accent color default
                    const defaultAccent = '#0d6efd';
                    state.uiAccentColor = defaultAccent;
                    uiAccentColorInputModal.value = defaultAccent;
                    updateUIAccentColor(defaultAccent);
                    if (accentSwatches) {
                        accentSwatches.querySelectorAll('.accent-swatch').forEach(el => {
                            el.classList.toggle('active', el.getAttribute('data-color') === defaultAccent);
                        });
                    }
                });
            }

            // Profile modal wiring
            if (profileModalEl) {
                profileModalEl.addEventListener('show.bs.modal', async () => {
                    // Prefer cloud data if logged in; else local
                    if (!window.__IS_DEMO__) {
                        const uid = getCurrentUserId();
                        if (uid) {
                            const cloud = await loadProfileFromCloud(uid);
                            if (cloud) {
                                setStoredProfile({ ...getStoredProfile(), ...cloud });
                                populateProfileForm(cloud);
                                return;
                            }
                        }
                    }
                    const data = getStoredProfile();
                    populateProfileForm(data);
                });
                saveProfileBtn?.addEventListener('click', async () => {
                    const data = readProfileForm();
                    setStoredProfile(data);
                    // If logged in with Firebase, also save to Firestore
                    if (!window.__IS_DEMO__) {
                        const uid = getCurrentUserId();
                        if (uid) {
                            try {
                                await saveProfileToCloud(uid, data);
                                showToast('Profile saved to cloud.', 'success');
                                // Refresh header name from latest profile
                                setUiForAuth(true);
                                return;
                            } catch (e) {
                                console.warn('Cloud save failed, kept local:', e);
                            }
                        }
                    }
                    showToast('Profile saved locally.', 'success');
                    setUiForAuth(true);
                });
                clearProfileBtn?.addEventListener('click', () => {
                    setStoredProfile({});
                    populateProfileForm({});
                });
            }

            // Login modal wiring
            const emailLoginFormModal = document.getElementById('emailLoginFormModal');
            const loginEmailInput = document.getElementById('loginEmailInput');
            const loginPasswordInput = document.getElementById('loginPasswordInput');
            const googleLoginBtnModal = document.getElementById('googleLoginBtnModal');
            const LAST_PROMPT_KEY = 'authPromptAt';
            let requireLoginUntilAuth = false; // will be set based on auth state

            const nowMs = () => Date.now();
            const hours24Ms = 24 * 60 * 60 * 1000;
            const setPromptStamp = () => { try { localStorage.setItem(LAST_PROMPT_KEY, String(nowMs())); } catch { } };
            const getPromptStamp = () => { try { return parseInt(localStorage.getItem(LAST_PROMPT_KEY) || '0', 10); } catch { return 0; } };

            const isLoggedIn = () => {
                if (!window.__IS_DEMO__) {
                    try { return !!firebase.auth().currentUser; } catch { return false; }
                } else {
                    try { return !!JSON.parse(localStorage.getItem('demoAuthUser')); } catch { return false; }
                }
            };

            const showLoginModal = (force = false) => {
                // Only prompt if not logged in
                if (isLoggedIn()) return;
                // Honor 24h prompt if not forcing
                if (!force) {
                    const last = getPromptStamp();
                    if (nowMs() - last < hours24Ms) return;
                }
                const modalEl = document.getElementById('loginModal');
                const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
                inst.show();
                setPromptStamp();
                requireLoginUntilAuth = true;
            };

            const finishLoginUi = () => {
                // Close the login modal and enable profile
                const modalEl = document.getElementById('loginModal');
                const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                inst.hide();
                // Enable UI switches are handled by auth observers; demo mode triggers below
                requireLoginUntilAuth = false;
                setPromptStamp();
            };

                // ---- One-time Profile prompt per user ----
                const userScopedKey = (id) => `profilePromptShown:${id}`;
                const getActiveUserIdForPrompt = () => {
                    if (!window.__IS_DEMO__) {
                        try { return firebase.auth().currentUser?.uid || null; } catch { return null; }
                    } else {
                        try { const demo = JSON.parse(localStorage.getItem('demoAuthUser') || 'null'); return demo?.email ? `demo:${demo.email}` : null; } catch { return null; }
                    }
                };
                const hasShownProfilePrompt = () => {
                    const id = getActiveUserIdForPrompt();
                    if (!id) return false;
                    try { return !!localStorage.getItem(userScopedKey(id)); } catch { return false; }
                };
                const markProfilePromptShown = () => {
                    const id = getActiveUserIdForPrompt();
                    if (!id) return;
                    try { localStorage.setItem(userScopedKey(id), String(Date.now())); } catch { }
                };
                const showProfileModalNow = () => {
                    const modal = new bootstrap.Modal(document.getElementById('profileModal'));
                    modal.show();
                };

            if (emailLoginFormModal) {
                emailLoginFormModal.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = (loginEmailInput?.value || '').trim();
                    const password = loginPasswordInput?.value || '';
                    if (!email || !password) return;

                    if (!window.__IS_DEMO__) {
                        try {
                            const auth = firebase.auth();
                            await auth.signInWithEmailAndPassword(email, password);
                            // Immediately reflect UI while auth observer updates asynchronously
                            setUiForAuth(true);
                            finishLoginUi();
                        } catch (err) {
                            if (err.code === 'auth/user-not-found') {
                                const auth = firebase.auth();
                                await auth.createUserWithEmailAndPassword(email, password);
                                setUiForAuth(true);
                                finishLoginUi();
                            } else {
                                alert(err.message);
                            }
                        }
                    } else {
                        if (email === 'admin@gmail.com' && password === 'admin') {
                            try { localStorage.setItem('demoAuthUser', JSON.stringify({ email })); } catch { }
                            // Reflect UI immediately in demo mode
                            setUiForAuth(true);
                            applyAuthProfile({ displayName: 'Admin User', email });
                            finishLoginUi();
                            // One-time profile prompt for demo user
                            if (!hasShownProfilePrompt()) { showProfileModalNow(); markProfilePromptShown(); }
                        } else {
                            alert('Invalid credentials for local demo. Use admin@gmail.com / admin');
                        }
                    }
                });
            }

            if (googleLoginBtnModal) {
                googleLoginBtnModal.addEventListener('click', async () => {
                    if (window.__IS_DEMO__) { alert('Google sign-in is disabled in demo mode.'); return; }
                    try {
                        const provider = new firebase.auth.GoogleAuthProvider();
                        await firebase.auth().signInWithPopup(provider);
                        setUiForAuth(true);
                        finishLoginUi();
                        // For new Google logins, Firestore may not have a profile yet
                        if (!hasShownProfilePrompt()) { showProfileModalNow(); markProfilePromptShown(); }
                    } catch (err) {
                        alert(err.message);
                    }
                });
            }

            // Toggle glass blur backdrop when Login modal shows/hides
            const loginModalEl2 = document.getElementById('loginModal');
            if (loginModalEl2) {
                loginModalEl2.addEventListener('show.bs.modal', () => {
                    // Defer to allow Bootstrap to insert the backdrop
                    setTimeout(() => {
                        const bd = document.querySelector('.modal-backdrop');
                        if (bd) bd.classList.add('login-blur');
                        const ov = document.getElementById('screenBlurOverlay');
                        if (ov) ov.style.display = 'block';
                    }, 0);
                });
                loginModalEl2.addEventListener('hidden.bs.modal', () => {
                    const bd = document.querySelector('.modal-backdrop.login-blur');
                    if (bd) bd.classList.remove('login-blur');
                    const ov = document.getElementById('screenBlurOverlay');
                    if (ov) ov.style.display = 'none';
                    // If login is required and user not authenticated, re-open
                    if (requireLoginUntilAuth && !isLoggedIn()) {
                        setTimeout(() => showLoginModal(true), 0);
                    }
                });
            }

            // Initial prompt on load if not logged in (force on first visit/after logout)
            setTimeout(() => {
                if (!isLoggedIn()) {
                    // If last prompt was over 24h ago or not set, show. Also enforce as per requirement.
                    showLoginModal(true);
                }
            }, 0);




            // Screen Settings
            sizingModeToggle.addEventListener('click', () => {
                state.isPanelCountMode = !state.isPanelCountMode;
                if (state.isPanelCountMode) {
                    sizingModeToggle.textContent = 'Use Panel Count';
                    screenDimensionsGroup.style.display = 'none';
                    panelCountGroup.style.display = 'block';
                } else {
                    sizingModeToggle.textContent = 'Use Physical Dimensions';
                    screenDimensionsGroup.style.display = 'block';
                    panelCountGroup.style.display = 'none';
                }
                updatePixelMap();
            });
            panelsWidthInput.addEventListener('input', e => { state.panelsInWidth = parseInt(e.target.value) || 1; updatePixelMap(); });
            panelsHeightInput.addEventListener('input', e => { state.panelsInHeight = parseInt(e.target.value) || 1; updatePixelMap(); });
            unitSelector.addEventListener('change', (e) => {
                const oldUnit = state.unit;
                const newUnit = e.target.value;
                state.unit = newUnit;

                // Update unit labels
                unitLabels.forEach(label => label.textContent = unitSelector.options[unitSelector.selectedIndex].textContent.match(/\(([^)]+)\)/)[1]);
                
                // Convert current values to new unit
                state.screenWidth = convertUnits(state.screenWidth, oldUnit, newUnit);
                state.screenHeight = convertUnits(state.screenHeight, oldUnit, newUnit);
                
                screenWidthInput.value = state.screenWidth.toFixed(2);
                screenHeightInput.value = state.screenHeight.toFixed(2);
                
                // Reset manual flags on dimension change
                state.circleEffectSizeManuallySet = false;
                state.customTextSizeManuallySet = false;
                state.customTextPositionManuallySet = false;
                state.specificationSizeManuallySet = false;
                state.specificationPositionManuallySet = false;
                updatePixelMap();
            });
            
            const dimensionChangeHandler = () => {
                state.circleEffectSizeManuallySet = false;
                state.customTextSizeManuallySet = false;
                state.customTextPositionManuallySet = false;
                state.specificationSizeManuallySet = false;
                state.specificationPositionManuallySet = false;
                updatePixelMap();
            };
            
            screenWidthInput.addEventListener('input', (e) => { state.screenWidth = parseFloat(e.target.value) || 0; dimensionChangeHandler(); });
            screenHeightInput.addEventListener('input', (e) => { state.screenHeight = parseFloat(e.target.value) || 0; dimensionChangeHandler(); });
            panelWidthSelect.addEventListener('change', (e) => { state.panelWidth = parseFloat(e.target.value) || 0; dimensionChangeHandler(); });
            panelHeightSelect.addEventListener('change', (e) => { state.panelHeight = parseFloat(e.target.value) || 0; dimensionChangeHandler(); });
            panelResWidthInput.addEventListener('input', (e) => { state.panelResWidth = parseInt(e.target.value, 10) || 0; dimensionChangeHandler(); });
            panelResHeightInput.addEventListener('input', (e) => { state.panelResHeight = parseInt(e.target.value, 10) || 0; dimensionChangeHandler(); });


            // Effects & Colors
            outlineToggle.addEventListener('click', () => {
                state.outlineEnabled = !state.outlineEnabled;
                outlineToggle.textContent = state.outlineEnabled ? 'On' : 'Off';
                updatePixelMap();
            });
            outlineColorInput.addEventListener('input', (e) => { state.outlineColor = e.target.value; updatePixelMap(); });
            outlineSizeInput.addEventListener('input', (e) => { state.outlineSize = parseInt(e.target.value, 10) || 0; updatePixelMap(); });

            rasterEffectToggle.addEventListener('click', () => {
                state.rasterEnabled = !state.rasterEnabled;
                rasterEffectToggle.textContent = state.rasterEnabled ? 'On' : 'Off';
                updatePixelMap();
            });
            rasterColorInput.addEventListener('input', (e) => { state.rasterColor = e.target.value; updatePixelMap(); });
            rasterSizeInput.addEventListener('input', (e) => { state.rasterSize = parseInt(e.target.value, 10) || 0; updatePixelMap(); });

            circleEffectToggle.addEventListener('click', () => {
                state.circleEffectEnabled = !state.circleEffectEnabled;
                circleEffectToggle.textContent = state.circleEffectEnabled ? 'On' : 'Off';
                updatePixelMap();
            });
            circleEffectColorInput.addEventListener('input', (e) => { state.circleEffectColor = e.target.value; updatePixelMap(); });
            circleEffectSizeInput.addEventListener('input', (e) => { 
                state.circleEffectSizeManuallySet = true;
                state.circleEffectSize = parseInt(e.target.value, 10) || 0; 
                circleEffectSizeValue.textContent = state.circleEffectSize;
                updatePixelMap(); 
            });
            circleEffectThicknessInput.addEventListener('input', (e) => { state.circleEffectThickness = parseInt(e.target.value, 10) || 0; updatePixelMap(); });

            crossLineEffectToggle.addEventListener('click', () => {
                state.crossLineEffectEnabled = !state.crossLineEffectEnabled;
                crossLineEffectToggle.textContent = state.crossLineEffectEnabled ? 'On' : 'Off';
                updatePixelMap();
            });
            crossLineColorInput.addEventListener('input', (e) => {
                state.crossLineColor = e.target.value;
                updatePixelMap();
            });
            crossLineSizeInput.addEventListener('input', (e) => {
                state.crossLineSize = parseInt(e.target.value, 10) || 1;
                updatePixelMap();
            });

            invertColorsToggle.addEventListener('click', () => {
                state.invertColorsEnabled = !state.invertColorsEnabled;
                invertColorsToggle.textContent = state.invertColorsEnabled ? 'On' : 'Off';
                updatePixelMap();
            });

            grayscaleToggle.addEventListener('click', () => {
                state.grayscaleEnabled = !state.grayscaleEnabled;
                grayscaleToggle.textContent = state.grayscaleEnabled ? 'On' : 'Off';
                updatePixelMap();
            });
            
            color1Input.addEventListener('input', (e) => {
                state.color1 = e.target.value;
                if (state.isColor2Brighter) {
                    state.color2 = adjustColorBrightness(state.color1, 50);
                    color2Input.value = state.color2;
                }
                updateColorPreviews();
                updatePixelMap();
            });
            color2Input.addEventListener('input', (e) => { 
                state.color2 = e.target.value; 
                updateColorPreviews(); 
                updatePixelMap(); 
            });
            color2BrightnessToggle.addEventListener('change', (e) => {
                state.isColor2Brighter = e.target.checked;
                color2Input.disabled = state.isColor2Brighter;
                if (state.isColor2Brighter) {
                    state.color2 = adjustColorBrightness(state.color1, 50);
                    color2Input.value = state.color2;
                }
                updateColorPreviews();
                updatePixelMap();
            });
            
            // Text & Numbering Event Listeners
            numberingToggle.addEventListener('click', () => {
                state.numberingEnabled = !state.numberingEnabled;
                numberingToggle.textContent = state.numberingEnabled ? 'On' : 'Off';
                updatePixelMap();
            });
            numberingFormatSelect.addEventListener('change', (e) => {
                state.numberingFormat = e.target.value;
                updatePixelMap();
            });
            numberingPositionSelect.addEventListener('change', (e) => {
                state.numberingPosition = e.target.value;
                updatePixelMap();
            });
            numberingSizeInput.addEventListener('input', (e) => {
                state.numberingSize = parseInt(e.target.value, 10) || 0;
                updatePixelMap();
            });
            numberingColorInput.addEventListener('input', (e) => {
                state.numberingColor = e.target.value;
                updatePixelMap();
            });
            customTextToggle.addEventListener('click', () => {
                state.customTextEnabled = !state.customTextEnabled;
                customTextToggle.textContent = state.customTextEnabled ? 'On' : 'Off';
                updatePixelMap();
                updateCanvasMap();
            });
            customTextInput.addEventListener('input', (e) => {
                state.customText = e.target.value;
                // Update the current canvas name if exists
                if (state.currentCanvasId) {
                    const currentCanvas = state.savedCanvases.find(c => c.id === state.currentCanvasId);
                    if (currentCanvas) {
                        currentCanvas.name = e.target.value;
                        renderSavedCanvases();
                    }
                }
                updatePixelMap();
                updateCanvasMap();
            });
            customTextSizeInput.addEventListener('input', (e) => {
                state.customTextSizeManuallySet = true;
                state.customTextSize = parseInt(e.target.value, 10) || 0;
                updatePixelMap();
                updateCanvasMap();
            });
            customTextColorInput.addEventListener('input', (e) => {
                state.customTextColor = e.target.value;
                updatePixelMap();
                updateCanvasMap();
            });
            customTextBgColorInput.addEventListener('input', (e) => {
                state.customTextBgColor = e.target.value;
                updatePixelMap();
                updateCanvasMap();
            });
            customTextBgOpacityInput.addEventListener('input', (e) => {
                state.customTextBgOpacity = parseInt(e.target.value, 10) / 100;
                customTextBgOpacityValue.textContent = e.target.value;
                updatePixelMap();
                updateCanvasMap();
            });
            customTextBgToggle.addEventListener('click', () => {
                state.customTextBgEnabled = !state.customTextBgEnabled;
                customTextBgToggle.textContent = state.customTextBgEnabled ? 'BG On' : 'BG Off';
                updatePixelMap();
            });
            customTextXInput.addEventListener('input', (e) => {
                state.customTextX = parseInt(e.target.value, 10) || 0;
                customTextXValue.textContent = state.customTextX;
                state.customTextPositionManuallySet = true;
                updatePixelMap();
            });
            customTextYInput.addEventListener('input', (e) => {
                state.customTextY = parseInt(e.target.value, 10) || 0;
                customTextYValue.textContent = state.customTextY;
                state.customTextPositionManuallySet = true;
                updatePixelMap();
            });
            specificationToggle.addEventListener('click', () => {
                state.specificationEnabled = !state.specificationEnabled;
                specificationToggle.textContent = state.specificationEnabled ? 'On' : 'Off';
                updatePixelMap();
            });
            specificationFormatToggle.addEventListener('click', () => {
                state.specificationFormat = state.specificationFormat === 'multi-line' ? 'single-line' : 'multi-line';
                specificationFormatToggle.textContent = state.specificationFormat === 'multi-line' ? 'Multi-line' : 'Single-line';
                updatePixelMap();
            });
            specificationSizeInput.addEventListener('input', (e) => {
                state.specificationSizeManuallySet = true;
                state.specificationSize = parseInt(e.target.value, 10) || 14;
                updatePixelMap();
            });
            specificationColorInput.addEventListener('input', (e) => {
                state.specificationColor = e.target.value;
                updatePixelMap();
            });
            specificationXInput.addEventListener('input', (e) => {
                state.specificationPositionManuallySet = true;
                state.specificationX = parseInt(e.target.value, 10) || 0;
                specificationXValue.textContent = state.specificationX;
                updatePixelMap();
            });
            specificationYInput.addEventListener('input', (e) => {
                state.specificationPositionManuallySet = true;
                state.specificationY = parseInt(e.target.value, 10) || 0;
                specificationYValue.textContent = state.specificationY;
                updatePixelMap();
            });
            oneLineTextInput.addEventListener('input', (e) => {
                state.oneLineText = e.target.value;
                updatePixelMap();
            });
            specificationBgColorInput.addEventListener('input', (e) => {
                state.specificationBgColor = e.target.value;
                updatePixelMap();
            });
            specificationBgToggle.addEventListener('click', () => {
                state.specificationBgEnabled = !state.specificationBgEnabled;
                specificationBgToggle.textContent = state.specificationBgEnabled ? 'BG On' : 'BG Off';
                updatePixelMap();
            });
            
            // Preview Controls
            zoomInBtn.addEventListener('click', () => {
                state.zoomLevel *= 1.2;
                applyCanvasTransform();
            });

            zoomOutBtn.addEventListener('click', () => {
                state.zoomLevel /= 1.2;
                applyCanvasTransform();
            });
            if (actualResolutionBtn) {
                actualResolutionBtn.addEventListener('click', () => {
                    state.zoomLevel = 1;
                    applyCanvasTransform();
                });
            }
            
            fitToScreenBtn.addEventListener('click', () => {
                const containerWidth = canvasContainer.clientWidth;
                const containerHeight = canvasContainer.clientHeight;
                
                const scaleX = state.totalResWidth > 0 ? containerWidth / state.totalResWidth : 1;
                const scaleY = state.totalResHeight > 0 ? containerHeight / state.totalResHeight : 1;
                state.zoomLevel = Math.min(scaleX, scaleY) * 0.95; // 5% margin
                
                applyCanvasTransform();
            });

            // PixelMap Export PNG/JPEG (includes drawing overlay)
            const exportCombined = (format) => {
                // Ensure we have a rendered pixel map with valid dimensions
                let srcW = pixelMapCanvas.width || state.totalResWidth || 0;
                let srcH = pixelMapCanvas.height || state.totalResHeight || 0;
                if (srcW === 0 || srcH === 0) {
                    // Force a render to populate sizes
                    try { updatePixelMap(); } catch {}
                    srcW = pixelMapCanvas.width || state.totalResWidth || 0;
                    srcH = pixelMapCanvas.height || state.totalResHeight || 0;
                }
                if (srcW === 0 || srcH === 0) {
                    showMessageBox('Nothing to export yet. Please configure your LED screen first.');
                    return;
                }

                // Temporarily hide selection rectangle
                const currentSelection = state.selectionRect;
                state.selectionRect = null;
                redrawDrawingOverlay();

                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = srcW;
                exportCanvas.height = srcH;
                const exportCtx = exportCanvas.getContext('2d', { alpha: true });

                if (format === 'jpg' || format === 'jpeg') {
                    // Fill white background for JPEG
                    exportCtx.fillStyle = '#ffffff';
                    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
                }

                // Draw base and overlay at 1:1
                try { exportCtx.drawImage(pixelMapCanvas, 0, 0); } catch {}
                try { exportCtx.drawImage(drawingOverlayCanvas, 0, 0); } catch {}

                // Restore selection rectangle after combining
                state.selectionRect = currentSelection;
                redrawDrawingOverlay();

                const filenameBase = (state.customTextEnabled && state.customText.trim() !== '')
                    ? state.customText.trim()
                    : `${srcW}x${srcH}px`;

                const link = document.createElement('a');
                link.download = `${filenameBase}.${format === 'jpeg' ? 'jpg' : format}`;
                const mime = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
                try {
                    link.href = exportCanvas.toDataURL(mime, 0.95);
                } catch (e) {
                    console.error('Export toDataURL failed:', e);
                    showMessageBox('Failed to export image.');
                    return;
                }
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };

            exportPngBtn.addEventListener('click', () => exportCombined('png'));
            exportJpgBtn.addEventListener('click', () => exportCombined('jpg'));
            sendToCanvasBtn.addEventListener('click', () => {
                // Temporarily hide selection rectangle for sending
                const currentSelection = state.selectionRect;
                state.selectionRect = null;
                redrawDrawingOverlay();

                // Combine canvases for sending to CanvasMap
                const combinedCanvas = document.createElement('canvas');
                combinedCanvas.width = state.totalResWidth;
                combinedCanvas.height = state.totalResHeight;
                const combinedCtx = combinedCanvas.getContext('2d', { alpha: true });
                combinedCtx.drawImage(pixelMapCanvas, 0, 0); // Draw base
                combinedCtx.drawImage(drawingOverlayCanvas, 0, 0); // Draw overlay

                // Restore selection rectangle after combining
                state.selectionRect = currentSelection;
                redrawDrawingOverlay();

                const dataUrl = combinedCanvas.toDataURL('image/png');
                const filename = (state.customTextEnabled && state.customText.trim() !== '') ? state.customText.trim() : `${state.totalResWidth}x${state.totalResHeight}px`;
                
                let numPanelsWidth, numPanelsHeight;

                if (state.isPanelCountMode) {
                    numPanelsWidth = state.panelsInWidth;
                    numPanelsHeight = state.panelsInHeight;
                } else {
                    const currentUnit = state.unit;
                    const screenWidthBase = convertUnits(state.screenWidth, currentUnit, 'meter');
                    const screenHeightBase = convertUnits(state.screenHeight, currentUnit, 'meter');
                    const panelWidthBase = state.panelWidth;
                    const panelHeightBase = state.panelHeight;
                    numPanelsWidth = Math.floor(screenWidthBase / panelWidthBase);
                    numPanelsHeight = Math.floor(screenHeightBase / panelHeightBase);
                }

                const mapObject = {
                    id: Date.now(), // Unique ID
                    type: 'image',
                    dataUrl: dataUrl,
                    filename: filename,
                    x: 0, // Default position
                    y: 0, // Default position
                    width: state.totalResWidth,
                    height: state.totalResHeight,
                    rotation: 0,
                    selected: false,
                    image: null, // Image object will be loaded on render
                    details: {
                        totalPanels: numPanelsWidth * numPanelsHeight,
                        panelsWidth: numPanelsWidth,
                        panelsHeight: numPanelsHeight,
                        resWidth: state.totalResWidth,
                        resHeight: state.totalResHeight,
                        actualWidth: state.isPanelCountMode ? numPanelsWidth * state.panelWidth : state.screenWidth,
                        actualHeight: state.isPanelCountMode ? numPanelsHeight * state.panelHeight : state.screenHeight,
                        unit: state.unit,
                        panelSize: `${state.panelWidth}m x ${state.panelHeight}m`,
                        panelRes: `${state.panelResWidth}px x ${state.panelResHeight}px`
                    },
                    // Store the full pixelmap state for later editing
                    ...JSON.parse(JSON.stringify(state))
                };
                state.storedPixelMaps.push(mapObject);
                renderImportedMapsGallery(); // Update gallery in CanvasMap tab
                renderPixelMapSentGallery(); // Update gallery in PixelMap tab

                // Switch to CanvasMap tab
                const canvasTabTrigger = new bootstrap.Tab(document.getElementById('canvasmap-tab'));
                // canvasTabTrigger.show(); // Removed to prevent auto-switching
                updateCanvasMap();

                // Enable CanvasMap tab once at least one LED screen has been sent
                setCanvasMapEnabled(true);
            });
            
            // PixelMap: Export Outline only
            const exportPixelMapOutline = () => {
                if (state.totalResWidth <= 0 || state.totalResHeight <= 0) {
                    showMessageBox('Nothing to export yet. Please configure your grid.');
                    return;
                }

                const outlineCanvas = document.createElement('canvas');
                outlineCanvas.width = state.totalResWidth;
                outlineCanvas.height = state.totalResHeight;
                const octx = outlineCanvas.getContext('2d', { alpha: true });

                const numPanelsWidth = Math.max(1, Math.floor(state.totalResWidth / state.panelResWidth));
                const numPanelsHeight = Math.max(1, Math.floor(state.totalResHeight / state.panelResHeight));
                const panelPxWidth = state.panelResWidth;
                const panelPxHeight = state.panelResHeight;

                octx.strokeStyle = state.outlineColor || '#000000';
                octx.lineWidth = state.outlineSize || 2;
                for (let row = 0; row < numPanelsHeight; row++) {
                    for (let col = 0; col < numPanelsWidth; col++) {
                        const panelKey = `${row},${col}`;
                        if (!state.removedPanels.has(panelKey)) {
                            octx.strokeRect(col * panelPxWidth, row * panelPxHeight, panelPxWidth, panelPxHeight);
                        }
                    }
                }

                const fileBase = (state.customTextEnabled && state.customText.trim() !== '')
                    ? state.customText.trim()
                    : `${state.totalResWidth}x${state.totalResHeight}px-outline`;

                const a = document.createElement('a');
                a.download = `${fileBase}.png`;
                a.href = outlineCanvas.toDataURL('image/png');
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };

            if (exportOutlineBtn) {
                exportOutlineBtn.addEventListener('click', exportPixelMapOutline);
            }

            // CanvasMap Settings
            canvasWidthInput.addEventListener('input', (e) => { state.canvasMapWidth = parseInt(e.target.value, 10) || 1; updateCanvasMap(); });
            canvasHeightInput.addEventListener('input', (e) => { state.canvasMapHeight = parseInt(e.target.value, 10) || 1; updateCanvasMap(); });
            
            // CanvasMap Zoom and View Listeners
            canvasMapZoomInBtn.addEventListener('click', () => {
                state.canvasMapZoomLevel *= 1.2;
                applyCanvasMapTransform();
                if(state.canvasMapRulerEnabled) drawRulers();
            });
            canvasMapZoomOutBtn.addEventListener('click', () => {
                state.canvasMapZoomLevel /= 1.2;
                applyCanvasMapTransform();
                if(state.canvasMapRulerEnabled) drawRulers();
            });
            canvasMapFitToScreenBtn.addEventListener('click', () => {
                const containerWidth = canvasMapContainer.clientWidth;
                const containerHeight = canvasMapContainer.clientHeight;
                
                const scaleX = canvasMapCanvas.width > 0 ? containerWidth / canvasMapCanvas.width : 1;
                const scaleY = canvasMapCanvas.height > 0 ? containerHeight / canvasMapCanvas.height : 1;
                state.canvasMapZoomLevel = Math.min(scaleX, scaleY) * 0.95; // 5% margin
                
                applyCanvasMapTransform();
                if(state.canvasMapRulerEnabled) drawRulers();
            });
            canvasMapActualSizeBtn.addEventListener('click', () => {
                state.canvasMapZoomLevel = 1;
                applyCanvasMapTransform();
                if(state.canvasMapRulerEnabled) drawRulers();
            });

            rulerToggle.addEventListener('click', () => {
                state.canvasMapRulerEnabled = !state.canvasMapRulerEnabled;
                rulerToggle.textContent = state.canvasMapRulerEnabled ? 'On' : 'Off';
                rulerContainer.classList.toggle('rulers-on', state.canvasMapRulerEnabled);
                if (state.canvasMapRulerEnabled) {
                    drawRulers();
                }
            });

            rulerPositionToggle.addEventListener('click', () => {
                state.canvasMapRulerPosition = state.canvasMapRulerPosition === 'outside' ? 'inside' : 'outside';
                rulerPositionToggle.textContent = state.canvasMapRulerPosition === 'outside' ? 'Outside' : 'Inside';
                rulerContainer.classList.toggle('rulers-inside', state.canvasMapRulerPosition === 'inside');
            });

            gridlineToggle.addEventListener('click', () => {
                state.canvasMapGridEnabled = !state.canvasMapGridEnabled;
                gridlineToggle.textContent = state.canvasMapGridEnabled ? 'On' : 'Off';
                updateCanvasMap();
            });
            gridlineColorInput.addEventListener('input', (e) => {
                state.canvasMapGridColor = e.target.value;
                updateCanvasMap();
            });
            gridlineSpacingInput.addEventListener('input', (e) => {
                state.canvasMapGridSpacing = parseInt(e.target.value, 10) || 50;
                updateCanvasMap();
            });
            magnetToggle.addEventListener('click', () => {
                state.canvasMapMagnetEnabled = !state.canvasMapMagnetEnabled;
                magnetToggle.textContent = state.canvasMapMagnetEnabled ? 'On' : 'Off';
            });
            magnetThresholdInput.addEventListener('input', (e) => {
                state.canvasMapMagnetThreshold = parseInt(e.target.value, 10) || 10;
            });
            gapToggle.addEventListener('click', () => {
                state.canvasMapShowGap = !state.canvasMapShowGap;
                gapToggle.textContent = state.canvasMapShowGap ? 'On' : 'Off';
                redrawCanvasMapObjects();
            });
            gapColorInput.addEventListener('input', (e) => {
                state.canvasMapGapColor = e.target.value;
                redrawCanvasMapObjects();
            });

            coordinatesToggle.addEventListener('click', () => {
                state.canvasMapShowCoordinates = !state.canvasMapShowCoordinates;
                coordinatesToggle.textContent = state.canvasMapShowCoordinates ? 'On' : 'Off';
                redrawCanvasMapObjects();
            });

            mediaServerSelect.addEventListener('change', (e) => {
                state.mediaServer = e.target.value;
                state.pdfPreviewDirty = true;
            });

            pdfFilenameInput.addEventListener('input', (e) => { state.pdfFilename = e.target.value; state.pdfPreviewDirty = true; });
            pdfProjectNameInput.addEventListener('input', (e) => { state.pdfProjectName = e.target.value; state.pdfPreviewDirty = true; });
            pdfVenueInput.addEventListener('input', (e) => { state.pdfVenue = e.target.value; state.pdfPreviewDirty = true; });
            pdfDrawnByInput.addEventListener('input', (e) => { state.pdfDrawnBy = e.target.value; state.pdfPreviewDirty = true; });
            pdfSalesInput.addEventListener('input', (e) => { state.pdfSales = e.target.value; state.pdfPreviewDirty = true; });
            pdfClientInput.addEventListener('input', (e) => { state.pdfClient = e.target.value; state.pdfPreviewDirty = true; });
            pdfUnitInput.addEventListener('input', (e) => { state.pdfUnit = e.target.value; state.pdfPreviewDirty = true; });
            pdfEmailInput.addEventListener('input', (e) => { state.pdfEmail = e.target.value; state.pdfPreviewDirty = true; });
            logoUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        state.logoDataUrl = event.target.result;
                        logoPreview.src = event.target.result;
                        logoPreview.classList.remove('d-none');
                        state.pdfPreviewDirty = true;
                    };
                    reader.readAsDataURL(file);
                }
            });
            pdfIncludeCanvasSnapshotToggle.addEventListener('click', () => {
                state.pdfIncludeCanvasSnapshot = !state.pdfIncludeCanvasSnapshot;
                pdfIncludeCanvasSnapshotToggle.textContent = state.pdfIncludeCanvasSnapshot ? 'On' : 'Off';
                state.pdfPreviewDirty = true;
            });


            canvasMapContainer.addEventListener('scroll', () => {
                if(state.canvasMapRulerEnabled) {
                    drawRulers();
                }
            });

            // CanvasMap Export Listeners
            const createExportCanvas = (withBackground = false) => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasMapCanvas.width;
                tempCanvas.height = canvasMapCanvas.height;
                const tempCtx = tempCanvas.getContext('2d', { alpha: true });

                if (withBackground) {
                    tempCtx.fillStyle = '#ffffff';
                    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                }

                // Draw objects
                state.canvasMapObjects.forEach(obj => {
                    if (obj.image && obj.image.complete) {
                        tempCtx.save();
                        tempCtx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2);
                        tempCtx.rotate(obj.rotation * Math.PI / 180);
                        tempCtx.drawImage(obj.image, -obj.width / 2, -obj.height / 2, obj.width, obj.height);

                        // --- START: Draw position text ---
                        if (state.canvasMapShowCoordinates) {
                            const positionText = `(${Math.round(obj.x)}, ${Math.round(obj.y)})`;
                            tempCtx.font = '16px Segoe UI';
                            const textMetrics = tempCtx.measureText(positionText);
                            const textWidth = textMetrics.width;
                            const textHeight = 16; // font size
                            const padding = 5;

                            const rectX = -obj.width / 2;
                            const rectY = -obj.height / 2;

                            // Background for the text
                            tempCtx.fillStyle = 'rgba(23, 162, 184, 0.85)';
                            tempCtx.fillRect(rectX, rectY, textWidth + padding * 2, textHeight + padding * 2);

                            // Position Text
                            tempCtx.fillStyle = 'white';
                            tempCtx.textBaseline = 'top';
                            tempCtx.fillText(positionText, rectX + padding, rectY + padding);
                        }
                        // --- END: Draw position text ---
                        
                        tempCtx.restore();
                    }
                });

                // Draw measurement gaps on top
                drawMeasurementGaps(tempCtx);

                return tempCanvas;
            };

            exportCanvasPngBtn.addEventListener('click', () => {
                const exportCanvas = createExportCanvas(false);
                const link = document.createElement('a');
                const filename = `canvasmap_${canvasMapCanvas.width}x${canvasMapCanvas.height}`;
                link.download = `${filename}.png`;
                link.href = exportCanvas.toDataURL('image/png');
                link.click();
            });

            exportCanvasJpgBtn.addEventListener('click', () => {
                const exportCanvas = createExportCanvas(true);
                const link = document.createElement('a');
                const filename = `canvasmap_${canvasMapCanvas.width}x${canvasMapCanvas.height}`;
                link.download = `${filename}.jpg`;
                link.href = exportCanvas.toDataURL('image/jpeg');
                link.click();
            });
            
            const drawTemplateElements = (doc, pageNum, totalPages, obj) => {
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                doc.setFont('helvetica', 'normal');

                // --- Borders ---
                doc.setLineWidth(1.5);
                doc.rect(5, 5, pageWidth - 10, pageHeight - 10); // Outer border
                doc.setLineWidth(0.5);
                doc.rect(10, 10, pageWidth - 20, pageHeight - 20); // Inner border

                // --- Define Right Column ---
                const rightColumnX = pageWidth - 138; // Made 20% smaller
                const rightColumnWidth = 128; // Made 20% smaller
                const margin = 3;

                // --- Draw Vertical Separator Line ---
                doc.setLineWidth(0.5);
                doc.line(rightColumnX, 10, rightColumnX, pageHeight - 10);

                // --- Top Right Corner (Aligned to Column) ---
                let currentY = 10; // Start at inner border top
                
                // Add A0 text, centered in its section
                const a0SectionHeight = 25;
                doc.setFontSize(25);
                doc.setFont('helvetica', 'normal');
                doc.text("A0", rightColumnX + rightColumnWidth / 2, currentY + (a0SectionHeight / 2), { align: 'center', baseline: 'middle' });
                currentY += a0SectionHeight;
                
                // Add separator line that touches the column borders
                doc.setLineWidth(0.4);
                doc.line(rightColumnX, currentY, rightColumnX + rightColumnWidth, currentY);
                
                // --- Centered Copyright Section ---
                const topLineY = currentY;
                const copyrightSectionHeight = 75; // Increased space for larger text
                const bottomLineY = topLineY + copyrightSectionHeight;

                // New font sizes (40% bigger)
                const newHeadingSize = 16 * 1.4; 
                const newParaSize = 13 * 1.4;
                
                const copyrightLines = [
                    'This drawing remains the property of',
                    'mediaPro International LLC, and as',
                    'such may not be copied, reproduced',
                    'and/or disclosed without the written',
                    'consent of mediaPro International LLC.'
                ];

                // Calculate text block height to prepare for centering
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(newHeadingSize);
                const headingDim = doc.getTextDimensions('Copyright:');

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(newParaSize);
                const paraDim = doc.getTextDimensions(copyrightLines);
                
                const textGap = 5; // Gap between heading and paragraph
                const totalContentHeight = headingDim.h + textGap + paraDim.h;

                // Calculate the starting Y for the top of the content block to center it
                const contentStartY = topLineY + (copyrightSectionHeight - totalContentHeight) / 2;
                
                // Draw Heading
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(newHeadingSize);
                doc.text("Copyright:", rightColumnX + rightColumnWidth / 2, contentStartY, { align: 'center', baseline: 'top' });
                
                // Draw Paragraph
                const paraY = contentStartY + headingDim.h + textGap;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(newParaSize);
                doc.text(copyrightLines, rightColumnX + rightColumnWidth / 2, paraY, { align: 'center', baseline: 'top' });

                // Draw the bottom line, touching the borders
                doc.setLineWidth(0.4);
                doc.line(rightColumnX, bottomLineY, rightColumnX + rightColumnWidth, bottomLineY);
                
                currentY = bottomLineY + 15; // Set Y for the next section

                // --- Notification Section (with matching larger font) ---
                doc.setFontSize(newHeadingSize);
                doc.setFont('helvetica', 'bold');
                doc.text("Notification:", rightColumnX + rightColumnWidth / 2, currentY, { align: 'center' });
                currentY += 9; // Increased gap for larger font
                
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(newParaSize);
                const notificationText = 'This drawing is supplied for reference purposes only and is subject to review and approval by the Project Designer and/or members of the Design and/or Production and/or Technical Teams. All work is to be carried out in strict accordance with local authorities requirements, national event and building regulations, and to relevant standards.';
                const notificationLines = doc.splitTextToSize(notificationText, rightColumnWidth - (margin * 2));
                doc.text(notificationLines, rightColumnX + rightColumnWidth / 2, currentY, { align: 'center' });
                
                // Calculate height of notification text to position line below it
                const notificationParaDim = doc.getTextDimensions(notificationLines);
                currentY += notificationParaDim.h + 10; // Add text height + a gap

                // --- Add new line below Notification ---
                doc.setLineWidth(0.4);
                doc.line(rightColumnX, currentY, rightColumnX + rightColumnWidth, currentY);
                
                // --- Bottom Right Corner (REBUILT TO MATCH SCREENSHOT & ENLARGED AGAIN) ---
                const brX = rightColumnX; // Use the same starting X
                const blockWidth = rightColumnWidth; // Use the same width
                
                // --- Calculate exact height based on screenshot proportions, now ~100% larger than original ---
                const scaleFactor = 2.34; // Previous was 1.8, increased by 30%
                const fieldHeight = 8 * scaleFactor;
                const largeFieldHeight = 16 * scaleFactor;
                const logoSectionHeight = (30 * scaleFactor) * 1.2; // Increased this section by 20%
                const calculatedBlockHeight = logoSectionHeight + (9 * fieldHeight) + (2 * largeFieldHeight);
                const brY = pageHeight - 10 - calculatedBlockHeight; // Align to bottom border

                doc.setFont('helvetica', 'normal');
                doc.setLineWidth(0.4);

                // --- Top section (Logo & Address) ---
                const y1 = brY + logoSectionHeight;
                doc.rect(brX, brY, blockWidth, y1 - brY); 
                
                if (state.logoDataUrl && state.logoDataUrl.startsWith('data:image')) {
                    try {
                        const logoFormat = state.logoDataUrl.substring(state.logoDataUrl.indexOf('/') + 1, state.logoDataUrl.indexOf(';'));
                        
                        // Get original image properties to maintain aspect ratio
                        const imgProps = doc.getImageProperties(state.logoDataUrl);
                        const aspectRatio = imgProps.width / imgProps.height;

                        // Define the maximum bounding box for the logo, scaled up by 40%.
                        const maxLogoBoxWidth = blockWidth * 0.98; // Make nearly full width
                        const maxLogoBoxHeight = logoSectionHeight * 0.7; // Increased height by 40% from base (0.5 * 1.4)

                        let newLogoWidth = maxLogoBoxWidth;
                        let newLogoHeight = newLogoWidth / aspectRatio;

                        // If the calculated height is too big, scale down based on height instead
                        if (newLogoHeight > maxLogoBoxHeight) {
                            newLogoHeight = maxLogoBoxHeight;
                            newLogoWidth = newLogoHeight * aspectRatio;
                        }

                        // Center the final logo within its box area
                        const logoX = brX + (blockWidth - newLogoWidth) / 2;
                        
                        // Calculate the vertical center of the logo's container and adjust
                        const containerCenterY = brY + (logoSectionHeight / 2);
                        let logoY = containerCenterY - (newLogoHeight / 2); // Center the logo vertically
                        logoY -= logoSectionHeight * 0.25; // Then move it up by 25% (5% down from 30%)

                        doc.addImage(state.logoDataUrl, logoFormat.toUpperCase(), logoX, logoY, newLogoWidth, newLogoHeight, '', 'FAST');

                    } catch(e) { console.error("Error adding logo:", e); }
                }
                // Re-center address in the new taller space, now with 7 lines
                doc.setFontSize(11); // Increased font size

                const allAddressLines = [
                    "P.O. Box 114657",
                    "Dubai Investments Park 1",
                    "Dubai, United Arab Emirates",
                    "Tel +971 4 3386835",
                    "contact@mediaproav.com | www.mediaproav.com",
                    "UAE | KSA | OMAN | QATAR | BAHRAIN | INDIA",
                    "MALAYSIA | INDONESIA | CAMBODIA | SINGAPORE | SPAIN"
                ];

                // Recalculate Y position to vertically center the new block of text
                const newLineHeightFactor = 0.9 * 1.05 * 1.05 * 1.06 * 1.10 * 1.10; // Increased by another 10%
                const lineHeight = (doc.getLineHeight() / doc.internal.scaleFactor) * newLineHeightFactor; 
                const totalAddressHeight = allAddressLines.length * lineHeight;
                const addressBlockCenterY = brY + (logoSectionHeight / 2);
                let newAddressStartY = addressBlockCenterY - (totalAddressHeight / 2) + (lineHeight / 2) + 5; // +5 to shift down slightly from logo
                newAddressStartY += logoSectionHeight * 0.20; // Move down by 20% of the container height

                doc.text(allAddressLines, brX + blockWidth / 2, newAddressStartY, { align: 'center', lineHeightFactor: newLineHeightFactor });
                
                // --- Fields (start from the calculated y1 position) ---
                let currentY_fields = y1;
                const col1ValueX = brX + 45; 
                const textYOffset = 10;      // Adjusted for new height
                const largeTextYOffset = 20; // Adjusted for new height

                // Job No
                doc.rect(brX, currentY_fields, blockWidth, fieldHeight);
                doc.setFontSize(10); doc.text("Job No:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text("##########", col1ValueX, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Project Name
                doc.rect(brX, currentY_fields, blockWidth, largeFieldHeight);
                doc.setFontSize(10); doc.text("Project Name:", brX + margin, currentY_fields + 10);
                doc.setFontSize(18); doc.setFont('helvetica', 'bold');
                doc.text(state.pdfProjectName || 'Project Name', brX + blockWidth / 2, currentY_fields + largeTextYOffset, { align: 'center' });
                doc.setFont('helvetica', 'normal');
                currentY_fields += largeFieldHeight;

                // Project Date
                doc.rect(brX, currentY_fields, blockWidth, fieldHeight);
                doc.setFontSize(10); doc.text("Project Date:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(new Date().toLocaleDateString('en-GB'), col1ValueX, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Venue
                doc.rect(brX, currentY_fields, blockWidth, fieldHeight);
                doc.setFontSize(10); doc.text("Venue:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(state.pdfVenue || 'N/A', col1ValueX, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Sales | Client
                const midX1 = brX + blockWidth / 2;
                doc.rect(brX, currentY_fields, midX1 - brX, fieldHeight); // Sales Box
                doc.rect(midX1, currentY_fields, blockWidth / 2, fieldHeight); // Client Box
                doc.setFontSize(10); doc.text("Sales:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(10); doc.text("Client:", midX1 + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(state.pdfSales || "Name", brX + 22, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(state.pdfClient || "Client Name", midX1 + 22, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Sheet Title
                doc.rect(brX, currentY_fields, blockWidth, largeFieldHeight);
                doc.setFontSize(10); doc.text("Sheet Title:", brX + margin, currentY_fields + 10);
                doc.setFontSize(18); doc.setFont('helvetica', 'bold');
                doc.text(`${obj.filename || 'PixelMap Details'}`, brX + blockWidth / 2, currentY_fields + largeTextYOffset, { align: 'center' });
                doc.setFont('helvetica', 'normal');
                currentY_fields += largeFieldHeight;

                // Issue Date
                doc.rect(brX, currentY_fields, blockWidth, fieldHeight);
                doc.setFontSize(10); doc.text("Issue Date:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(new Date().toLocaleString('en-GB'), col1ValueX, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Scale | Unit | Page #
                const col2X = brX + 38; 
                const col3X = brX + 84;
                doc.rect(brX, currentY_fields, col2X - brX, fieldHeight); // Scale
                doc.rect(col2X, currentY_fields, col3X - col2X, fieldHeight); // Unit
                doc.rect(col3X, currentY_fields, blockWidth - (col3X - brX), fieldHeight); // Page
                doc.setFontSize(10); doc.text("Scale:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(10); doc.text("Unit:", col2X + margin, currentY_fields + textYOffset);
                doc.setFontSize(10); doc.text("Page #:", col3X + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text("1:1", brX + 18, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(state.pdfUnit || "N/A", col2X + 14, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(`${pageNum} of ${totalPages}`, col3X + 15, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Drawn By
                doc.rect(brX, currentY_fields, blockWidth, fieldHeight);
                doc.setFontSize(10); doc.text("Drawn By:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(state.pdfDrawnBy || 'N/A', col1ValueX, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Designer | Version
                doc.rect(brX, currentY_fields, midX1 - brX, fieldHeight); // Designer
                doc.rect(midX1, currentY_fields, blockWidth / 2, fieldHeight); // Version
                doc.setFontSize(10); doc.text("Designer:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(10); doc.text("Version:", midX1 + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(state.pdfDrawnBy || 'N/A', brX + 24, currentY_fields + textYOffset);
                
                let version = "1.0";
                const versionMatch = state.pdfFilename.match(/_?([vV]\d+(?:\.\d+)*)/);
                if (versionMatch && versionMatch[1]) {
                    version = versionMatch[1];
                }
                doc.setFontSize(11); doc.text(version, midX1 + 24, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // File Name
                doc.rect(brX, currentY_fields, blockWidth, fieldHeight);
                doc.setFontSize(10); doc.text("File Name:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(state.pdfFilename || 'N/A', col1ValueX, currentY_fields + textYOffset);
            };

            const drawMediaServerSpecPage = (doc, totalPages) => {
                doc.addPage('a0', 'landscape');
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const pageNum = totalPages;
                const dummyObj = { filename: 'FILE DELIVERY SPECS' };
                drawTemplateElements(doc, pageNum, totalPages, dummyObj);

                const specs = {
                    resolume: {
                        title: '*RESOLUME - FILE DELIVERY SPECIFICATIONS*',
                        data: [
                            ['Media Server', ': RESOLUME'],
                            ['Format', ': QUICKTIME'],
                            ['Codec', ': DXV3'],
                            ['Download Link', ': DXV3 Codec Link\n  https://resolume.com/download/file?file=Resolume_DXV_Codec_3_0_1_Installer.exe'],
                            ['Quality', ': 100%'],
                            ['Pixel Aspect Ratio', ': Square Pixels (1:1)'],
                            ['FPS', ': 25'],
                            ['Embedded Audio Settings', ': Stereo, Uncompressed, 16 Bit'],
                            ['Sample Rate', ': 48000 Hz'],
                            ['Unembedded Audio Format', ': Wav'],
                            ['Still Frame Format', ': PNG'],
                            ['Naming Structure', ': "Bank Number"_"delivery"_"screen Name"_"resolution"_"version".Mov'],
                            ['Example', ': 001_intro-video_center-screen_1920x1080_v01.Mov'],
                            ['Comments', ': Media Servers Rely On File Names To Understand And Manage\n  Updates On The Content. Please Make Sure The File Name Is\n  Consistent And Use The Version Tag At The End Of The File.'],
                            ['Example', ': 001_intro-video_center-screen_1920x1080_v01.Mov'],
                        ]
                    },
                    watchout7: {
                        title: '*WATCHOUT 7 - FILE DELIVERY SPECIFICATIONS*',
                        data: [
                            ['Media Server', ': DATATON WATCHOUT 7'],
                            ['Format', ': QUICKTIME'],
                            ['Codec', ': HAP / NOTCH LC'],
                            ['Download Link', ': HAP CODEC: https://github.com/Vidvox/hap-qt-codec\n  NOTCH LC CODEC: https://www.notch.one/support/downloads_area/'],
                            ['Quality', ': 100%'],
                            ['Pixel Aspect Ratio', ': Square Pixels (1:1)'],
                            ['FPS', ': 25'],
                            ['Embedded Audio Settings', ': Stereo, Uncompressed, 16 Bit'],
                            ['Sample Rate', ': 48000 Hz'],
                            ['Unembedded Audio Format', ': Wav'],
                            ['Still Frame Format', ': PNG'],
                            ['Naming Structure', ': "Bank Number"_"delivery"_"screen Name"_"resolution"_"version".Mov'],
                            ['Example', ': 001_intro-video_center-screen_1920x1080_v01.Mov'],
                            ['Comments', ': Media Servers Rely On File Names To Understand And Manage\n  Updates On The Content. Please Make Sure The File Name Is\n  Consistent And Use The Version Tag At The End Of The File.'],
                            ['Example', ': 001_intro-video_center-screen_1920x1080_v01.Mov'],
                        ]
                    },
                    disguised3: {
                         title: '*DISGUISE - FILE DELIVERY SPECIFICATIONS*',
                        data: [
                            ['Media Server', ': DISGUISE - D3'],
                            ['Format', ': QUICKTIME'],
                            ['Codec', ': HAP / NOTCH LC'],
                            ['Download Link', ': HAP CODEC: https://github.com/Vidvox/hap-qt-codec\n  NOTCH LC CODEC: https://www.notch.one/support/downloads_area/'],
                            ['Quality', ': 100%'],
                            ['Pixel Aspect Ratio', ': Square Pixels (1:1)'],
                            ['FPS', ': 25'],
                            ['Embedded Audio Settings', ': Stereo, Uncompressed, 16 Bit'],
                            ['Sample Rate', ': 48000 Hz'],
                            ['Unembedded Audio Format', ': Wav'],
                            ['Still Frame Format', ': PNG'],
                            ['Naming Structure', ': "Bank Number"_"delivery"_"screen Name"_"resolution"_"version".Mov'],
                            ['Example', ': 001_intro-video_center-screen_1920x1080_v01.Mov'],
                            ['Comments', ': Media Servers Rely On File Names To Understand And Manage\n  Updates On The Content. Please Make Sure The File Name Is\n  Consistent And Use The Version Tag At The End Of The File.'],
                            ['Example', ': 001_intro-video_center-screen_1920x1080_v01.Mov'],
                        ]
                    },
                     watchout6: {
                        title: '*WATCHOUT 6 - FILE DELIVERY SPECIFICATIONS*',
                        data: [
                            ['Media Server', ': DATATON WATCHOUT 6'],
                            ['Format', ': QUICKTIME'],
                            ['Codec', ': HAP'],
                            ['Download Link', ': HAP CODEC: https://github.com/Vidvox/hap-qt-codec'],
                            ['Quality', ': 100%'],
                            ['Pixel Aspect Ratio', ': Square Pixels (1:1)'],
                            ['FPS', ': 25'],
                            ['Embedded Audio Settings', ': Stereo, Uncompressed, 16 Bit'],
                            ['Sample Rate', ': 48000 Hz'],
                            ['Unembedded Audio Format', ': Wav'],
                            ['Still Frame Format', ': PNG'],
                            ['Naming Structure', ': "Bank Number"_"delivery"_"screen Name"_"resolution"_"version".Mov'],
                            ['Example', ': 001_intro-video_center-screen_1920x1080_v01.Mov'],
                            ['Comments', ': Media Servers Rely On File Names To Understand And Manage\n  Updates On The Content. Please Make Sure The File Name Is\n  Consistent And Use The Version Tag At The End Of The File.'],
                            ['Example', ': 001_intro-video_center-screen_1920x1080_v01.Mov'],
                        ]
                    }
                };

                const selectedSpec = specs[state.mediaServer];
                if (!selectedSpec) return;

                const contentX = 20;
                const contentY = 20;
                const contentWidth = pageWidth - 138 - 30;
                
                // Sub Title Box
                const subTitleY = contentY + 10;
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.rect(contentX + 50, subTitleY, contentWidth - 100, 38);
                doc.setFontSize(40);
                doc.setFont('helvetica', 'normal');
                doc.text(selectedSpec.title, contentX + contentWidth / 2, subTitleY + 25, { align: 'center' });
                
                // Content Box
                const specBoxY = subTitleY + 48;
                const specBoxHeight = pageHeight - specBoxY - 35;
                doc.rect(contentX, specBoxY, contentWidth, specBoxHeight);

                const topMargin = 38;
                const verticalShift = specBoxHeight * 0.10;
                let currentSpecY = specBoxY + topMargin + verticalShift;
                const specLineSpacing = 15;

                // Draw Spec Data
                const labelX = contentX + 25;
                const valueX = contentX + 210;
                doc.setFontSize(38);
                selectedSpec.data.forEach(([label, value]) => {
                    doc.setFont('helvetica', 'bold');
                    doc.text(label, labelX, currentSpecY);
                    doc.setFont('helvetica', 'normal');
                    const valueLines = doc.splitTextToSize(value, contentWidth - 235); 
                    doc.text(valueLines, valueX, currentSpecY);

                    const valueHeight = doc.getTextDimensions(valueLines).h;
                    currentSpecY += valueHeight + specLineSpacing; 
                });
                
                // Validation Text
                doc.setTextColor(255, 0, 0);
                doc.setFontSize(31);
                const validationText = `For validation, please send a 30 seconds test file following the previous guidelines to the following Email Address: ${state.pdfEmail}`;
                const validationLines = doc.splitTextToSize(validationText, contentWidth - 20);
                doc.text(validationLines, contentX + contentWidth / 2, specBoxY + specBoxHeight - 38, { align: 'center' });
                doc.setTextColor(0);
            };

            const drawDetailedObjectPage = (doc, obj, pageNum, totalPages) => {
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();

                drawTemplateElements(doc, pageNum, totalPages, obj);
                
                const detailsBoxX = 15;
                const detailsBoxY = pageHeight - 135;
                const detailsBoxWidth = 120 * 2.5875;
                const detailsBoxHeight = 40 * 2.5875;
                
                doc.setDrawColor(0);
                doc.setFillColor(230,230,230);
                doc.rect(detailsBoxX, detailsBoxY, detailsBoxWidth, detailsBoxHeight, 'FD');
                
                const details = obj.details;
                if (!details) {
                    console.error("Object is missing details for PDF export", obj);
                    doc.setFontSize(16);
                    doc.setTextColor(255, 0, 0);
                    doc.text("Error: Object details are missing.", detailsBoxX + 9, detailsBoxY + 14);
                } else {
                    const content = [
                        ['SCREEN NAME', `: ${obj.filename}`],
                        ['SCREEN SIZE', `: (W) ${details.actualWidth.toFixed(2)} M x (H) ${details.actualHeight.toFixed(2)} M`],
                        ['PANEL SIZE', `: ${details.panelSize}`],
                        ['PER TILE RESOLUTION', `: ${details.panelRes}`],
                        ['TILES CONFIGURATION', `: ${details.panelsWidth} (W) x ${details.panelsHeight} (H) (${details.totalPanels} Tiles)`],
                        ['SCREEN RESOLUTION', `: ${details.resWidth} x ${details.resHeight} Pixels`],
                    ];
                    
                    doc.setFontSize(16);
                    doc.setTextColor(0);
                    let contentY = detailsBoxY + 14;
                    const lineSpacing = 14;
                    content.forEach(([label, value]) => {
                        doc.setFont('helvetica', 'bold');
                        doc.text(label, detailsBoxX + 9, contentY);
                        doc.setFont('helvetica', 'normal');
                        doc.text(value, detailsBoxX + 105, contentY);
                        contentY += lineSpacing;
                    });
                }

                const imgData = obj.dataUrl;
                 try {
                    const imgProps = doc.getImageProperties(imgData);
                    
                    const rightColumnX = pageWidth - 138;
                    const availableX = 10;
                    const availableY = 10;
                    const availableWidth = rightColumnX - 15;
                    const availableHeight = detailsBoxY - 15;

                    const aspectRatio = imgProps.width / imgProps.height;
                    
                    let imgWidth = availableWidth;
                    let imgHeight = imgWidth / aspectRatio;

                    if (imgHeight > availableHeight) {
                        imgHeight = availableHeight;
                        imgWidth = imgHeight * aspectRatio;
                    }
                    
                    imgWidth *= 0.7;
                    imgHeight *= 0.7;

                    const imgX = availableX + (availableWidth - imgWidth) / 2;
                    const imgY = availableY + (availableHeight - imgHeight) / 2;

                    doc.addImage(imgData, 'PNG', imgX, imgY, imgWidth, imgHeight);

                 } catch(e) {
                     console.error("Could not add PixelMap image to PDF", e);
                 }
            };

            const exportDetailedCanvasPdf = () => {
                if (state.canvasMapObjects.length === 0) {
                    showMessageBox("There are no PixelMaps on the canvas to export.");
                    return;
                }
                const doc = new window.jspdf.jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: 'a0' // Set page size to A0
                });
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                
                let totalPages = state.canvasMapObjects.length + 1; // +1 for spec page
                if (state.pdfIncludeCanvasSnapshot) {
                    totalPages++;
                }

                // Create a page for each object
                state.canvasMapObjects.forEach((obj, index) => {
                    const pageNum = index + 1;
                    if (index > 0) doc.addPage('a0', 'landscape');
                    drawDetailedObjectPage(doc, obj, pageNum, totalPages);
                });
                
                // Add the canvas snapshot page if enabled
                if (state.pdfIncludeCanvasSnapshot) {
                    const pageNum = state.canvasMapObjects.length + 1;
                    doc.addPage('a0', 'landscape');
                    const snapshotObj = { filename: 'Canvas Layout Snapshot' };
                    drawTemplateElements(doc, pageNum, totalPages, snapshotObj);

                    // --- Center: Canvas Snapshot Image ---
                    const canvasImage = createExportCanvas(true).toDataURL('image/png');
                    try {
                        const imgProps = doc.getImageProperties(canvasImage);

                        // Define available area
                        const rightColumnX = pageWidth - 138;
                        const availableX = 10;
                        const availableY = 10;
                        const availableWidth = rightColumnX - 15;
                        const availableHeight = pageHeight - 20; // Use full height minus borders

                        const aspectRatio = imgProps.width / imgProps.height;
                        
                        let imgWidth = availableWidth;
                        let imgHeight = imgWidth / aspectRatio;

                        if (imgHeight > availableHeight) {
                            imgHeight = availableHeight;
                            imgWidth = imgHeight * aspectRatio;
                        }
                        
                        // Center the image
                        const imgX = availableX + (availableWidth - imgWidth) / 2;
                        const imgY = availableY + (availableHeight - imgHeight) / 2;

                        doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight);

                    } catch(e) {
                         console.error("Could not add Canvas Snapshot image to PDF", e);
                    }
                }

                // Add the final media server specification page
                drawMediaServerSpecPage(doc, totalPages);

                const finalFilename = state.pdfFilename.trim() ? state.pdfFilename.trim() : 'canvasmap_details';
                doc.save(`${finalFilename}.pdf`);
            };

            const showMultiExportModal = () => {
                multiExportCanvasList.innerHTML = '';
                if (state.savedCanvases.length === 0) {
                    multiExportCanvasList.innerHTML = '<p class="text-muted text-center my-2">No saved canvases available to export.</p>';
                } else {
                    state.savedCanvases.forEach(savedCanvas => {
                        const div = document.createElement('div');
                        div.className = 'form-check';
                        div.innerHTML = `
                            <input class="form-check-input" type="checkbox" value="${savedCanvas.id}" id="export-check-${savedCanvas.id}" checked>
                            <label class="form-check-label" for="export-check-${savedCanvas.id}">
                                ${escapeXml(savedCanvas.name)}
                            </label>
                        `;
                        multiExportCanvasList.appendChild(div);
                    });
                }
                multiExportIncludeSpecPage.checked = true;
                showBackdrop();
                multiExportModal.classList.add('visible');
            };

            const exportMultiCanvasPdf = async () => {
                const selectedCheckboxes = multiExportCanvasList.querySelectorAll('input[type="checkbox"]:checked');
                const selectedCanvasIds = Array.from(selectedCheckboxes).map(cb => cb.value);

                const selectedCanvases = state.savedCanvases.filter(sc => selectedCanvasIds.includes(sc.id.toString()));

                if (selectedCanvases.length === 0) {
                    showMessageBox("No canvases selected for export.");
                    return;
                }
                
                const originalButtonText = multiExportConfirmBtn.textContent;
                multiExportConfirmBtn.disabled = true;
                multiExportConfirmBtn.textContent = 'Generating...';

                try {
                    const doc = new window.jspdf.jsPDF({
                        orientation: 'landscape',
                        unit: 'mm',
                        format: 'a0'
                    });

                    const includeSpecPage = multiExportIncludeSpecPage.checked;
                    
                    let totalPages = selectedCanvases.length + (includeSpecPage ? 1 : 0);
                    let pageCounter = 1;

                    for (const savedCanvas of selectedCanvases) {
                        if (pageCounter > 1) doc.addPage('a0', 'landscape');

                        // Draw the template border and info blocks for the page
                        drawTemplateElements(doc, pageCounter, totalPages, { filename: savedCanvas.name });

                        // Create a temporary canvas to render the full layout image
                        const tempCanvas = document.createElement('canvas');
                        tempCanvas.width = canvasMapCanvas.width;
                        tempCanvas.height = canvasMapCanvas.height;
                        const tempCtx = tempCanvas.getContext('2d');
                        tempCtx.fillStyle = 'white';
                        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

                        // Load all images for the current saved canvas layout
                        const imageLoadPromises = savedCanvas.objects.map(objData => {
                            return new Promise((resolve, reject) => {
                                const img = new Image();
                                img.onload = () => resolve({ img, data: objData });
                                img.onerror = () => reject(new Error(`Failed to load image for ${objData.filename}`));
                                img.src = objData.dataUrl;
                            });
                        });
                        
                        const loadedImages = await Promise.all(imageLoadPromises);

                        // Draw all the images onto the temporary canvas to create the layout snapshot
                        loadedImages.forEach(({ img, data }) => {
                            tempCtx.save();
                            tempCtx.translate(data.x + data.width / 2, data.y + data.height / 2);
                            tempCtx.rotate(data.rotation * Math.PI / 180);
                            tempCtx.drawImage(img, -data.width / 2, -data.height / 2, data.width, data.height);

                            // Draw coordinates on the export if enabled
                            if (state.canvasMapShowCoordinates) {
                                const positionText = `(${Math.round(data.x)}, ${Math.round(data.y)})`;
                                tempCtx.font = '16px Segoe UI';
                                const textMetrics = tempCtx.measureText(positionText);
                                const textWidth = textMetrics.width;
                                const textHeight = 16; // font size
                                const padding = 5;

                                const rectX = -data.width / 2;
                                const rectY = -data.height / 2;

                                // Background for the text
                                tempCtx.fillStyle = 'rgba(23, 162, 184, 0.85)';
                                tempCtx.fillRect(rectX, rectY, textWidth + padding * 2, textHeight + padding * 2);

                                // Position Text
                                tempCtx.fillStyle = 'white';
                                tempCtx.textBaseline = 'top';
                                tempCtx.fillText(positionText, rectX + padding, rectY + padding);
                            }
                            
                            tempCtx.restore();
                        });
                        
                        // Add the generated layout image to the PDF page, fitting it nicely
                        const canvasImage = tempCanvas.toDataURL('image/png');
                        const imgProps = doc.getImageProperties(canvasImage);
                        
                        const pageWidth = doc.internal.pageSize.getWidth();
                        const pageHeight = doc.internal.pageSize.getHeight();
                        const rightColumnX = pageWidth - 138;

                        // Define available area, reserving space at the bottom for specs
                        const specAreaHeight = 80; // Reserve 80mm at the bottom
                        const availableX = 10;
                        const availableY = 10;
                        const availableWidth = rightColumnX - 15;
                        const availableHeightForImage = pageHeight - 20 - specAreaHeight; // Reduced height for image
                        const aspectRatio = imgProps.width / imgProps.height;
                        
                        let imgWidth = availableWidth;
                        let imgHeight = imgWidth / aspectRatio;

                        if (imgHeight > availableHeightForImage) {
                            imgHeight = availableHeightForImage;
                            imgWidth = imgHeight * aspectRatio;
                        }
                        
                        const imgX = availableX + (availableWidth - imgWidth) / 2;
                        const imgY = availableY + (availableHeightForImage - imgHeight) / 2;

                        doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight);

                        // --- NEW PART: Draw Specification Details Below Image ---
                        const specStartY = availableY + availableHeightForImage + 10; // Start below the image area
                        let currentY = specStartY;

                    doc.setFontSize(20);
                    doc.setFont('helvetica', 'bold');
                    doc.text("Screen Specification Details", availableX + 5, currentY);
                    currentY += 15;

                    // Table Header
                    doc.setFontSize(12);
                    doc.setFont('helvetica', 'bold');
                    const tableHeaders = ["Screen Name", "Screen Size (M)", "Panel Size", "Panel Res", "Config (WxH)", "Total Panels", "Total Res (WxH)"];
                    const colWidths = [150, 100, 80, 90, 90, 80, 100];
                    let currentX = availableX + 5;
                    
                    doc.setLineWidth(0.5);
                    doc.line(currentX, currentY + 2, currentX + colWidths.reduce((a, b) => a + b, 0), currentY + 2); // Underline header


                    for (let i = 0; i < tableHeaders.length; i++) {
                        doc.text(tableHeaders[i], currentX, currentY);
                        currentX += colWidths[i];
                    }
                    currentY += 8;

                    // Table Body
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    savedCanvas.objects.forEach(obj => {
                        if (!obj.details) return; // Skip if no details
                        
                        currentX = availableX + 5;
                        const details = obj.details;
                        const rowData = [
                            obj.filename,
                            `${details.actualWidth.toFixed(2)} x ${details.actualHeight.toFixed(2)}`,
                            details.panelSize,
                            details.panelRes,
                            `${details.panelsWidth} x ${details.panelsHeight}`,
                            details.totalPanels.toString(),
                            `${details.resWidth} x ${details.resHeight}`
                        ];
                        
                        for (let i = 0; i < rowData.length; i++) {
                            const text = rowData[i];
                            const lines = doc.splitTextToSize(text, colWidths[i] - 5);
                            doc.text(lines, currentX, currentY);
                            currentX += colWidths[i];
                        }
                        currentY += 10; // Next row
                    });


                    pageCounter++;
                }

                if (includeSpecPage) {
                    drawMediaServerSpecPage(doc, totalPages);
                }

                const finalFilename = state.pdfFilename.trim() ? `${state.pdfFilename}_multi-report` : 'multi_canvas_report';
                doc.save(`${finalFilename}.pdf`);

            } catch (error) {
                console.error("Error during multi-canvas PDF export:", error);
                showMessageBox(`Failed to generate PDF. ${error.message || 'An unknown error occurred.'}`);
            } finally {
                multiExportModal.classList.remove('visible');
                hideBackdrop();
                multiExportConfirmBtn.disabled = false;
                multiExportConfirmBtn.textContent = 'Export Selected';
            }
        };

        exportCanvasPdfBtn.addEventListener('click', exportDetailedCanvasPdf);
        exportCanvasPdfBtnNew.addEventListener('click', showMultiExportModal);

        /**
         * Generates a PDF preview and displays it in the iframe.
         */
        const generatePdfPreview = () => {
            if (!Array.isArray(state.canvasMapObjects)) {
                state.canvasMapObjects = [];
            }
            // If there are no objects, still show a spec/cover page so users see something
            const hasObjects = state.canvasMapObjects.length > 0;

            const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
            const pdfPreviewIframe = document.getElementById('pdfPreviewFrame');
            const pdfPreviewPlaceholder = document.getElementById('pdfPreviewPlaceholder');
            const pdfPreviewContent = document.getElementById('pdfPreviewContent');

            // Show loading state
            if (pdfPreviewContainer) pdfPreviewContainer.classList.add('loading');
            pdfPreviewPlaceholder.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-2">Generating PDF preview...</p></div>';
            // Yield to the browser to render the spinner before heavy work
            setTimeout(() => {
            try {
                // Create a smaller/faster PDF for preview only (export uses A0)
                const doc = new window.jspdf.jsPDF({
                    orientation: 'landscape',
                    unit: 'mm',
                    format: 'a2'
                });
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();

                let totalPages = (hasObjects ? state.canvasMapObjects.length : 0) + 1; // +1 for spec page
                if (state.pdfIncludeCanvasSnapshot) totalPages++;

                // Create a page for each object
                if (hasObjects) {
                    state.canvasMapObjects.forEach((obj, index) => {
                        const pageNum = index + 1;
                        if (index > 0) doc.addPage();
                        drawDetailedObjectPage(doc, obj, pageNum, totalPages);
                    });
                }

                // Add the canvas snapshot page if enabled
                if (state.pdfIncludeCanvasSnapshot) {
                    const pageNum = state.canvasMapObjects.length + 1;
                    doc.addPage();
                    const snapshotObj = { filename: 'Canvas Layout Snapshot' };
                    drawTemplateElements(doc, pageNum, totalPages, snapshotObj);

                    // --- Center: Canvas Snapshot Image ---
                    // Downscale snapshot for preview to speed up encoding and embedding
                    const fullCanvas = createExportCanvas(true);
                    const scale = Math.min(1, 1200 / Math.max(fullCanvas.width, fullCanvas.height));
                    const previewCanvas = document.createElement('canvas');
                    previewCanvas.width = Math.max(1, Math.round(fullCanvas.width * scale));
                    previewCanvas.height = Math.max(1, Math.round(fullCanvas.height * scale));
                    const pctx = previewCanvas.getContext('2d', { alpha: true });
                    pctx.drawImage(fullCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
                    const canvasImage = previewCanvas.toDataURL('image/png');
                    try {
                        const imgProps = doc.getImageProperties(canvasImage);

                        // Define available area
                        const rightColumnX = pageWidth - 138;
                        const availableX = 10;
                        const availableY = 10;
                        const availableWidth = rightColumnX - 15;
                        const availableHeight = pageHeight - 20;

                        const aspectRatio = imgProps.width / imgProps.height;

                        let imgWidth = availableWidth;
                        let imgHeight = imgWidth / aspectRatio;

                        if (imgHeight > availableHeight) {
                            imgHeight = availableHeight;
                            imgWidth = imgHeight * aspectRatio;
                        }

                        // Center the image
                        const imgX = availableX + (availableWidth - imgWidth) / 2;
                        const imgY = availableY + (availableHeight - imgHeight) / 2;

                        doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight);

                    } catch(e) {
                         console.error("Could not add Canvas Snapshot image to PDF", e);
                    }
                }

                // Add the final media server specification page always
                drawMediaServerSpecPage(doc, totalPages);

                // Generate PDF blob and display via object URL for better reliability
                const pdfBlob = doc.output('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                // Revoke previous URL to avoid leaks
                if (state.lastPdfPreviewUrl) {
                    try { URL.revokeObjectURL(state.lastPdfPreviewUrl); } catch {}
                }
                state.lastPdfPreviewUrl = pdfUrl;
                pdfPreviewIframe.src = pdfUrl;
                pdfPreviewContent.classList.remove('d-none');
                pdfPreviewPlaceholder.style.display = 'none';
                state.pdfPreviewReady = true;
                state.pdfPreviewDirty = false;
                if (pdfPreviewContainer) pdfPreviewContainer.classList.remove('loading');

            } catch (error) {
                console.error("Error generating PDF preview:", error);
                pdfPreviewPlaceholder.innerHTML = '<div class="text-center text-danger"><i class="fas fa-exclamation-triangle"></i><p class="mt-2">Error generating PDF preview. Please try again.</p></div>';
                pdfPreviewContent.classList.add('d-none');
                pdfPreviewPlaceholder.style.display = 'block';
                if (pdfPreviewContainer) pdfPreviewContainer.classList.remove('loading');
            }
            }, 0);
        };

        if (generatePdfPreviewBtn) {
            generatePdfPreviewBtn.addEventListener('click', () => {
                if (!Array.isArray(state.savedCanvases) || state.savedCanvases.length === 0) {
                    showMessageBox('Please save at least one canvas in CanvasMap before generating a PDF preview.');
                    return;
                }
                generatePdfPreview();
            });
        }

        // Prevent opening CanvasMap tab until at least one LED screen is sent from PixelMap
        const canvasMapTab = document.getElementById('canvasmap-tab');
        if (canvasMapTab) {
            canvasMapTab.addEventListener('show.bs.tab', (e) => {
                if (!Array.isArray(state.storedPixelMaps) || state.storedPixelMaps.length === 0) {
                    e.preventDefault();
                    showMessageBox('Please send at least one LED screen from PixelMap to CanvasMap first.');
                }
            });
        }

        // Auto-generate preview when switching to the PDF Settings tab
        const pdfTab = document.getElementById('pdfsettings-tab');
        if (pdfTab) {
            pdfTab.addEventListener('show.bs.tab', (e) => {
                if (!Array.isArray(state.savedCanvases) || state.savedCanvases.length === 0) {
                    e.preventDefault();
                    showMessageBox('PDF Settings will be available after you save at least one canvas.');
                }
            });
            pdfTab.addEventListener('shown.bs.tab', () => {
                // Only generate if we have content and preview area exists and at least one saved canvas
                if (document.getElementById('pdfPreviewFrame') && Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0) {
                    if (!state.pdfPreviewReady || state.pdfPreviewDirty) {
                        setTimeout(generatePdfPreview, 50);
                    }
                }
            });
        }

        // Also ensure PixelMap redraws when its tab is shown, so sizing/layout is correct
        const pixelMapTab = document.getElementById('pixelmap-tab');
        if (pixelMapTab) {
            pixelMapTab.addEventListener('shown.bs.tab', () => {
                setTimeout(updatePixelMap, 0);
            });
        }


        /**
         * Generates and triggers a download for a Resolume Arena XML file.
         */
        const exportResolumeXML = () => {
            if (state.savedCanvases.length === 0) {
                showMessageBox("No saved canvases to export. Please save a canvas layout first.");
                return;
            }

            const compWidth = canvasMapCanvas.width;
            const compHeight = canvasMapCanvas.height;

            const escapeXml = (str) => {
                return str.toString().replace(/[<>&"']/g, (c) => {
                    switch (c) {
                        case '<': return '&lt;';
                        case '>': return '&gt;';
                        case '&': return '&amp;';
                        case '"': return '&quot;';
                        case "'": return '&apos;';
                    }
                });
            };

            const generateSliceXML = (obj) => {
                const x = obj.x;
                const y = obj.y;
                const w = obj.width;
                const h = obj.height;

                // BezierWarper vertices (4x4 grid)
                let bezierVertices = '';
                for (let row = 0; row < 4; row++) {
                    for (let col = 0; col < 4; col++) {
                        const vx = x + (w * col / 3);
                        const vy = y + (h * row / 3);
                        bezierVertices += `<v x="${vx}" y="${vy}"/>\n`;
                    }
                }

                return `
        <Slice uniqueId="${escapeXml(obj.id)}">
            <Params name="Common">
                <Param name="Name" T="STRING" default="Layer" value="${escapeXml(obj.filename)}"/>
                <Param name="Enabled" T="BOOL" default="1" value="1"/>
            </Params>
            <Params name="Input">
                <ParamChoice name="Input Source" default="0:1" value="0:1" storeChoices="0"/>
                <Param name="Input Opacity" T="BOOL" default="1" value="1"/>
                <Param name="Input Bypass/Solo" T="BOOL" default="1" value="1"/>
                <Param name="SoftEdgeEnable" T="BOOL" default="0" value="0"/>
            </Params>
            <Params name="Output">
                <Param name="Flip" T="UINT8" default="0" value="0"/>
                <ParamRange name="Brightness" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
                <ParamRange name="Contrast" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
                <ParamRange name="Red" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
                <ParamRange name="Green" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
                <ParamRange name="Blue" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
                <Param name="Is Key" T="BOOL" default="0" value="0"/>
                <Param name="Black BG" T="BOOL" default="0" value="0"/>
                <ParamRange name="BRed" altName="Red" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0" max="0.4"/><ValueRange name="minMax" min="0" max="0.4"/><ValueRange name="startStop" min="0" max="0.4"/></ParamRange>
                <ParamRange name="BGreen" altName="Green" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0" max="0.4"/><ValueRange name="minMax" min="0" max="0.4"/><ValueRange name="startStop" min="0" max="0.4"/></ParamRange>
                <ParamRange name="BBlue" altName="Blue" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0" max="0.4"/><ValueRange name="minMax" min="0" max="0.4"/><ValueRange name="startStop" min="0" max="0.4"/></ParamRange>
            </Params>
            <InputRect orientation="0">
                <v x="${x}" y="${y}"/>
                <v x="${x + w}" y="${y}"/>
                <v x="${x + w}" y="${y + h}"/>
                <v x="${x}" y="${y + h}"/>
            </InputRect>
            <OutputRect orientation="0">
                <v x="${x}" y="${y}"/>
                <v x="${x + w}" y="${y}"/>
                <v x="${x + w}" y="${y + h}"/>
                <v x="${x}" y="${y + h}"/>
            </OutputRect>
            <Warper>
                <Params name="Warper">
                    <ParamChoice name="Point Mode" default="PM_LINEAR" value="PM_LINEAR" storeChoices="0"/>
                    <Param name="Flip" T="UINT8" default="0" value="0"/>
                </Params>
                <BezierWarper controlWidth="4" controlHeight="4">
                    <vertices>
                        ${bezierVertices}
                    </vertices>
                </BezierWarper>
                <Homography>
                    <src>
                        <v x="${x}" y="${y}"/><v x="${x + w}" y="${y}"/><v x="${x + w}" y="${y + h}"/><v x="${x}" y="${y + h}"/>
                    </src>
                    <dst>
                        <v x="${x}" y="${y}"/><v x="${x + w}" y="${y}"/><v x="${x + w}" y="${y + h}"/><v x="${x}" y="${y + h}"/>
                    </dst>
                </Homography>
            </Warper>
        </Slice>`;
            };
            
            let screensXML = '';
            state.savedCanvases.forEach(savedCanvas => {
                let slicesXML = '';
                savedCanvas.objects.forEach(obj => {
                    slicesXML += generateSliceXML(obj);
                });

                screensXML += `
    <Screen name="${escapeXml(savedCanvas.name)}" uniqueId="${escapeXml(savedCanvas.id)}">
        <Params name="Params">
            <Param name="Name" T="STRING" default="" value="${escapeXml(savedCanvas.name)}"/>
            <Param name="Enabled" T="BOOL" default="1" value="1"/>
            <Param name="Hidden" T="BOOL" default="0" value="0"/>
        </Params>
        <Params name="Output">
            <ParamRange name="Opacity" T="DOUBLE" default="1" value="1"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0" max="1"/><ValueRange name="minMax" min="0" max="1"/><ValueRange name="startStop" min="0" max="1"/></ParamRange>
            <ParamRange name="Brightness" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
            <ParamRange name="Contrast" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
            <ParamRange name="Red" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
            <ParamRange name="Green" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
            <ParamRange name="Blue" T="DOUBLE" default="0" value="0"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="-1" max="1"/><ValueRange name="minMax" min="-1" max="1"/><ValueRange name="startStop" min="-1" max="1"/></ParamRange>
        </Params>
        <guides>
            <ScreenGuide name="ScreenGuide" type="0"><Params name="Params"><ParamPixels name="Image"/><ParamRange name="Opacity" T="DOUBLE" default="0.25" value="0.25"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0" max="1"/><ValueRange name="minMax" min="0" max="1"/><ValueRange name="startStop" min="0" max="1"/></ParamRange></Params></ScreenGuide>
            <ScreenGuide name="ScreenGuide" type="1"><Params name="Params"><ParamPixels name="Image"/><ParamRange name="Opacity" T="DOUBLE" default="0.25" value="0.25"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0" max="1"/><ValueRange name="minMax" min="0" max="1"/><ValueRange name="startStop" min="0" max="1"/></ParamRange></Params></ScreenGuide>
        </guides>
        <layers>
            ${slicesXML}
        </layers>
        <OutputDevice>
            <OutputDeviceVirtual name="${escapeXml(savedCanvas.name)}" deviceId="VirtualDisplay${escapeXml(savedCanvas.id)}" idHash="${escapeXml(Date.now() + savedCanvas.id)}" width="${compWidth}" height="${compHeight}">
                <Params name="Params">
                    <ParamRange name="Width" T="DOUBLE" default="1920" value="${compWidth}"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="1" max="32768"/><ValueRange name="minMax" min="1" max="32768"/><ValueRange name="startStop" min="1" max="32768"/></ParamRange>
                    <ParamRange name="Height" T="DOUBLE" default="1080" value="${compHeight}"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="1" max="32768"/><ValueRange name="minMax" min="1" max="32768"/><ValueRange name="startStop" min="1" max="32768"/></ParamRange>
                </Params>
            </OutputDeviceVirtual>
        </OutputDevice>
    </Screen>`;
            });
            
            const finalXML = `<?xml version="1.0" encoding="utf-8"?>
<XmlState name="LED Grid Generator Export">
<versionInfo name="Resolume Arena" majorVersion="7" minorVersion="23" microVersion="1" revision="49731"/>
<ScreenSetup name="ScreenSetup">
    <Params name="ScreenSetupParams"/>
    <CurrentCompositionTextureSize width="${compWidth}" height="${compHeight}"/>
    <screens>
        ${screensXML}
    </screens>
    <SoftEdging>
        <Params name="Soft Edge">
            <ParamRange name="Gamma Red" T="DOUBLE" default="2" value="2"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="1" max="3"/><ValueRange name="minMax" min="1" max="3"/><ValueRange name="startStop" min="1" max="3"/></ParamRange>
            <ParamRange name="Gamma Green" T="DOUBLE" default="2" value="2"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="1" max="3"/><ValueRange name="minMax" min="1" max="3"/><ValueRange name="startStop" min="1" max="3"/></ParamRange>
            <ParamRange name="Gamma Blue" T="DOUBLE" default="2" value="2"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="1" max="3"/><ValueRange name="minMax" min="1" max="3"/><ValueRange name="startStop" min="1" max="3"/></ParamRange>
            <ParamRange name="Gamma" T="DOUBLE" default="1" value="1"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0" max="1"/><ValueRange name="minMax" min="0" max="1"/><ValueRange name="startStop" min="0" max="1"/></ParamRange>
            <ParamRange name="Luminance" T="DOUBLE" default="0.5" value="0.5"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0" max="1"/><ValueRange name="minMax" min="0" max="1"/><ValueRange name="startStop" min="0" max="1"/></ParamRange>
            <ParamRange name="Power" T="DOUBLE" default="2" value="2"><PhaseSourceStatic name="PhaseSourceStatic"/><BehaviourDouble name="BehaviourDouble"/><ValueRange name="defaultRange" min="0.1" max="7"/><ValueRange name="minMax" min="0.1" max="7"/><ValueRange name="startStop" min="0.1" max="7"/></ParamRange>
        </Params>
    </SoftEdging>
</ScreenSetup>
</XmlState>`;

            // Create and download the file
            const blob = new Blob([finalXML], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'resolume_mapping.xml';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

        exportCanvasXmlBtn.addEventListener('click', exportResolumeXML);


        // Manual Drawing Logic on PixelMap Tab
        const startSelection = (e) => {
            if (!state.isDrawingMode) return;
            state.isSelecting = true;
            const { x, y } = getCanvasCoords(e.clientX, e.clientY, drawingOverlayCanvas);
            state.selectionRect = {
                startX: x,
                startY: y,
                endX: x,
                endY: y,
                grid: null // Reset grid selection
            };
            redrawDrawingOverlay();
        };

        const updateSelection = (e) => {
            if (!state.isDrawingMode || !state.isSelecting) return;
            const { x, y } = getCanvasCoords(e.clientX, e.clientY, drawingOverlayCanvas);
            state.selectionRect.endX = x;
            state.selectionRect.endY = y;
            redrawDrawingOverlay();
        };

        const stopSelection = () => {
            if (!state.isDrawingMode || !state.isSelecting) return;
            state.isSelecting = false;

            // Finalize the selection rectangle in terms of grid units
            const { startX, startY, endX, endY } = state.selectionRect;
            const x1 = Math.min(startX, endX);
            const y1 = Math.min(startY, endY);
            const x2 = Math.max(startX, endX);
            const y2 = Math.max(startY, endY);

            const startCol = Math.max(0, Math.floor(x1 / state.panelPxWidth));
            const startRow = Math.max(0, Math.floor(y1 / state.panelPxHeight));
            const endCol = Math.min(Math.round(state.totalResWidth / state.panelPxWidth) - 1, Math.floor(x2 / state.panelPxWidth));
            const endRow = Math.min(Math.round(state.totalResHeight / state.panelPxHeight) - 1, Math.floor(y2 / state.panelPxHeight));
            
            state.selectionRect.grid = { startRow, startCol, endRow, endCol };
            
            redrawDrawingOverlay(); // Draw the final, snapped rectangle
        };

        const drawTopology = (topologyId) => {
            if (!state.selectionRect || !state.selectionRect.grid) return;

            const { startRow, startCol, endRow, endCol } = state.selectionRect.grid;
            
            // --- FIX STARTS HERE ---
            const selectionX1 = startCol * state.panelPxWidth;
            const selectionY1 = startRow * state.panelPxHeight;
            // Add 1 to end row/col to get the full pixel boundary
            const selectionX2 = (endCol + 1) * state.panelPxWidth;
            const selectionY2 = (endRow + 1) * state.panelPxHeight;

            const linesToKeep = [];
            const linesToRemove = [];

            // Partition the drawnLines array into lines to keep and lines to remove
            state.drawnLines.forEach(line => {
                // A line is considered fully contained if both its start and end points are within the selection
                const isContained = line.x1 >= selectionX1 && line.x1 <= selectionX2 &&
                                  line.y1 >= selectionY1 && line.y1 <= selectionY2 &&
                                  line.x2 >= selectionX1 && line.x2 <= selectionX2 &&
                                  line.y2 >= selectionY1 && line.y2 <= selectionY2;
                if (isContained) {
                    linesToRemove.push(line);
                } else {
                    linesToKeep.push(line);
                }
            });

            // If we are about to remove lines, check if we need to reclaim a starting number
            if (linesToRemove.length > 0) {
                const numberedLinesToRemove = linesToRemove.filter(line => line.startNumber);
                if (numberedLinesToRemove.length > 0) {
                    // Find the lowest number among the lines being removed
                    const minRemovedNumber = Math.min(...numberedLinesToRemove.map(l => l.startNumber));
                    // Reset the global counter to this reclaimed number for the new topology
                    state.drawingLineCounter = minRemovedNumber;
                }
                // Update the main array with only the lines we are keeping
                state.drawnLines = linesToKeep;
            }
            // --- FIX ENDS HERE ---
            
            const panelPxWidth = state.panelPxWidth;
            const panelPxHeight = state.panelPxHeight;
            if (!panelPxWidth || !panelPxHeight) return;

            const numPanelsWidth = endCol - startCol + 1;
            const numPanelsHeight = endRow - startRow + 1;

            const getCenter = (r, c) => ({
                x: c * panelPxWidth + panelPxWidth / 2,
                y: r * panelPxHeight + panelPxHeight / 2
            });

            let gridPoints = []; // Stores [absRow, absCol]

            switch (topologyId) {
                case 's-lr':
                    for (let r = 0; r < numPanelsHeight; r++) {
                        const absR = startRow + r;
                        if (r % 2 === 0) { // L->R
                            for (let c = 0; c < numPanelsWidth; c++) gridPoints.push([absR, startCol + c]);
                        } else { // R->L
                            for (let c = numPanelsWidth - 1; c >= 0; c--) gridPoints.push([absR, startCol + c]);
                        }
                    }
                    break;
                case 's-rl':
                    for (let r = 0; r < numPanelsHeight; r++) {
                        const absR = startRow + r;
                        if (r % 2 === 0) { // R->L
                            for (let c = numPanelsWidth - 1; c >= 0; c--) gridPoints.push([absR, startCol + c]);
                        } else { // L->R
                            for (let c = 0; c < numPanelsWidth; c++) gridPoints.push([absR, startCol + c]);
                        }
                    }
                    break;
                case 's-td':
                    for (let c = 0; c < numPanelsWidth; c++) {
                        const absC = startCol + c;
                        if (c % 2 === 0) { // T->B
                            for (let r = 0; r < numPanelsHeight; r++) gridPoints.push([startRow + r, absC]);
                        } else { // B->T
                            for (let r = numPanelsHeight - 1; r >= 0; r--) gridPoints.push([startRow + r, absC]);
                        }
                    }
                    break;
                case 's-dt':
                     for (let c = 0; c < numPanelsWidth; c++) {
                        const absC = startCol + c;
                        if (c % 2 === 0) { // B->T
                            for (let r = numPanelsHeight - 1; r >= 0; r--) gridPoints.push([startRow + r, absC]);
                        } else { // T->B
                            for (let r = 0; r < numPanelsHeight; r++) gridPoints.push([startRow + r, absC]);
                        }
                    }
                    break;
                case 's-lr-mirror':
                    for (let r = numPanelsHeight - 1; r >= 0; r--) {
                        const absR = startRow + r;
                        if ((numPanelsHeight - 1 - r) % 2 === 0) { // L->R
                            for (let c = 0; c < numPanelsWidth; c++) gridPoints.push([absR, startCol + c]);
                        } else { // R->L
                            for (let c = numPanelsWidth - 1; c >= 0; c--) gridPoints.push([absR, startCol + c]);
                        }
                    }
                    break;
                case 's-rl-mirror':
                    for (let r = numPanelsHeight - 1; r >= 0; r--) {
                        const absR = startRow + r;
                        if ((numPanelsHeight - 1 - r) % 2 === 0) { // R->L
                            for (let c = numPanelsWidth - 1; c >= 0; c--) gridPoints.push([absR, startCol + c]);
                        } else { // L->R
                            for (let c = 0; c < numPanelsWidth; c++) gridPoints.push([absR, startCol + c]);
                        }
                    }
                    break;
                case 's-td-mirror':
                    for (let c = numPanelsWidth - 1; c >= 0; c--) {
                        const absC = startCol + c;
                        if ((numPanelsWidth - 1 - c) % 2 === 0) { // T->B
                            for (let r = 0; r < numPanelsHeight; r++) gridPoints.push([startRow + r, absC]);
                        } else { // B->T
                            for (let r = numPanelsHeight - 1; r >= 0; r--) gridPoints.push([startRow + r, absC]);
                        }
                    }
                    break;
                case 's-dt-mirror':
                     for (let c = numPanelsWidth - 1; c >= 0; c--) {
                        const absC = startCol + c;
                        if ((numPanelsWidth - 1 - c) % 2 === 0) { // B->T
                            for (let r = numPanelsHeight - 1; r >= 0; r--) gridPoints.push([startRow + r, absC]);
                        } else { // T->B
                            for (let r = 0; r < numPanelsHeight; r++) gridPoints.push([startRow + r, absC]);
                        }
                    }
                    break;
            }

            const path = gridPoints;
            let firstLineDrawn = false;
            
            for (let i = 0; i < path.length - 1; i++) {
                const [r1, c1] = path[i];
                const [r2, c2] = path[i+1];
                
                // Skip drawing if the panel is removed
                if (state.removedPanels.has(`${r1},${c1}`) || state.removedPanels.has(`${r2},${c2}`)) {
                    continue;
                }

                const p1 = getCenter(r1, c1);
                const p2 = getCenter(r2, c2);

                const line = {
                    x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
                    color: state.drawingColor, width: state.drawingWidth,
                    arrowStart: false,
                    arrowEnd: true, // Always add an arrow at the end for topology lines
                };

                // Add the number ONLY to the first valid line segment of the path
                if (!firstLineDrawn) {
                    line.startNumber = state.drawingLineCounter;
                    firstLineDrawn = true;
                }
                
                state.drawnLines.push(line);
            }

            // Increment the main counter only ONCE if any lines were drawn for this path
            if (firstLineDrawn) {
                state.drawingLineCounter++;
            }

            redrawDrawingOverlay();
        };

        const escapeXml = (str) => {
            if (typeof str !== 'string' && typeof str !== 'number') return str;
            return str.toString().replace(/[<>&"']/g, (c) => {
                switch (c) {
                    case '<': return '&lt;';
                    case '>': return '&gt;';
                    case '&': return '&amp;';
                    case '"': return '&quot;';
                    case "'": return '&apos;';
                }
            });
        };

        drawingOverlayCanvas.addEventListener('mousedown', startSelection);
        drawingOverlayCanvas.addEventListener('mousemove', updateSelection);
        drawingOverlayCanvas.addEventListener('mouseup', stopSelection);
        
        // Mouseout to handle clearing the hover effect when the cursor leaves the canvas
        drawingOverlayCanvas.addEventListener('mouseout', (e) => {
            if (state.isSelecting) {
                stopSelection(); // Finalize selection if mouse leaves while dragging
            }
            // Check if the user is leaving the canvas entirely, not just moving onto a child element
            const rect = drawingOverlayCanvas.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                state.hoveredPanelCoords = null;
                redrawDrawingOverlay();
            }
        });

        // Touch event listeners for drawing
        const startSelectionTouch = (e) => {
            e.preventDefault(); // Prevent scrolling
            if (!state.isDrawingMode) return;
            const touch = e.touches[0];
            state.isSelecting = true;
            const { x, y } = getCanvasCoords(touch.clientX, touch.clientY, drawingOverlayCanvas);
            state.selectionRect = {
                startX: x,
                startY: y,
                endX: x,
                endY: y,
                grid: null
            };
            redrawDrawingOverlay();
        };

        const updateSelectionTouch = (e) => {
            e.preventDefault();
            if (!state.isDrawingMode || !state.isSelecting) return;
            const touch = e.touches[0];
            const { x, y } = getCanvasCoords(touch.clientX, touch.clientY, drawingOverlayCanvas);
            state.selectionRect.endX = x;
            state.selectionRect.endY = y;
            redrawDrawingOverlay();
        };
        
        drawingOverlayCanvas.addEventListener('touchstart', startSelectionTouch, { passive: false });
        drawingOverlayCanvas.addEventListener('touchmove', updateSelectionTouch, { passive: false });
        drawingOverlayCanvas.addEventListener('touchend', stopSelection);

        // Manual Drawing UI Listeners
        drawModeToggle.addEventListener('click', () => {
            state.isDrawingMode = !state.isDrawingMode;
            drawModeToggle.textContent = state.isDrawingMode ? 'On' : 'Off';
            drawingOverlayCanvas.classList.toggle('drawing-mode', state.isDrawingMode);
            
            const arrowToggles = [drawingArrowStartToggle, drawingArrowEndToggle];
            if (state.isDrawingMode) {
                arrowToggles.forEach(toggle => toggle.parentElement.style.display = 'none');
            } else {
                // When turning off, clear any lingering selection
                state.selectionRect = null;
                redrawDrawingOverlay();
                arrowToggles.forEach(toggle => toggle.parentElement.style.display = 'block');
            }
        });
        drawingColorInput.addEventListener('input', (e) => {
            state.drawingColor = e.target.value;
        });
        drawingWidthInput.addEventListener('input', (e) => {
            state.drawingWidth = parseInt(e.target.value, 10) || 1;
        });
        
        undoBtn.addEventListener('click', () => {
            if (state.drawnLines.length > 0) {
                const lastLine = state.drawnLines[state.drawnLines.length - 1];
                // If it was a numbered line, decrement the main counter
                if(lastLine.startNumber && lastLine.startNumber === state.drawingLineCounter - 1) {
                    state.drawingLineCounter--;
                }
                state.drawnLines.pop();
                redrawDrawingOverlay();
            }
        });
        clearDrawingOverlayBtn.addEventListener('click', () => {
            clearDrawingOverlay();
            state.selectionRect = null;
            redrawDrawingOverlay();
        });
        
        // --- Double-Click Panel Toggle Logic ---
        drawingOverlayCanvas.addEventListener('dblclick', (e) => {
                const { x, y } = getCanvasCoords(e.clientX, e.clientY, drawingOverlayCanvas);
                
                const panelCol = Math.floor(x / state.panelPxWidth);
                const panelRow = Math.floor(y / state.panelPxHeight);
                const panelKey = `${panelRow},${panelCol}`;

                if (state.removedPanels.has(panelKey)) {
                    state.removedPanels.delete(panelKey);
                } else {
                    state.removedPanels.add(panelKey);
                }
                
                updatePixelMap();
            });
            
            // --- Hover effect logic ---
            drawingOverlayCanvas.addEventListener('mousemove', (e) => {
                const { x, y } = getCanvasCoords(e.clientX, e.clientY, drawingOverlayCanvas);
                
                const panelCol = Math.floor(x / state.panelPxWidth);
                const panelRow = Math.floor(y / state.panelPxHeight);
                
                // Only update and redraw if the hovered panel has changed
                if (!state.hoveredPanelCoords || state.hoveredPanelCoords.row !== panelRow || state.hoveredPanelCoords.col !== panelCol) {
                    state.hoveredPanelCoords = { row: panelRow, col: panelCol };
                    redrawDrawingOverlay();
                }
            });


            // Message box
            closeMessageBtn.addEventListener('click', hideMessageBox);

            // Color Palette
            const paletteColors = [
                '#4C7024', '#0E9512', '#A30F41', '#91596D',
                '#673AB7', '#775A7C', '#CA7C07', '#B2291F',
                '#098FCE', '#446F83', '#3F51B5', '#A29415',
                '#795548', '#212121', '#595959', '#607D8B'
            ];

            const createColorPalette = () => {
                const paletteContainer = document.getElementById('colorPalette');
                paletteContainer.innerHTML = '';
                paletteColors.forEach(color => {
                    const swatch = document.createElement('div');
                    swatch.className = 'color-swatch';
                    swatch.style.backgroundColor = color;
                    swatch.dataset.color = color;
                    paletteContainer.appendChild(swatch);
                });
            };

            document.getElementById('colorPalette').addEventListener('click', (e) => {
                if (e.target.classList.contains('color-swatch')) {
                    const color = e.target.dataset.color;
                    color1Input.value = color;
                    // Dispatch input event to trigger all updates
                    color1Input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });


            // Drag and Drop for CanvasMap
            importedMapsGallery.addEventListener('dragstart', (e) => {
                const draggableItem = e.target.closest('.imported-map-item');
                if (draggableItem) {
                    e.dataTransfer.setData('text/plain', draggableItem.dataset.mapId);
                    e.dataTransfer.effectAllowed = 'copy';
                }
            });

            canvasMapCanvas.addEventListener('dragover', (e) => {
                e.preventDefault(); // Allow drop
                e.dataTransfer.dropEffect = 'copy';
            });

            canvasMapCanvas.addEventListener('drop', (e) => {
                e.preventDefault();
                const mapId = parseInt(e.dataTransfer.getData('text/plain'));
                const mapToDraw = state.storedPixelMaps.find(map => map.id === mapId);

                if (mapToDraw) {
                    const img = new Image();
                    img.onload = () => {
                        const rect = canvasMapCanvas.getBoundingClientRect();
                        // Get drop coordinates relative to the canvas's intrinsic resolution
                        const dropX = (e.clientX - rect.left) * (canvasMapCanvas.width / rect.width);
                        const dropY = (e.clientY - rect.top) * (canvasMapCanvas.height / rect.height);

                        // Calculate image dimensions at 1:1 scale
                        const imgWidth = mapToDraw.width;
                        const imgHeight = mapToDraw.height;

                        // Calculate initial top-left if centered at drop point
                        let x = dropX - (imgWidth / 2);
                        let y = dropY - (imgHeight / 2);

                        // Clamp X to canvas bounds
                        x = Math.max(0, Math.min(x, canvasMapCanvas.width - imgWidth));
                        // Clamp Y to canvas bounds
                        y = Math.max(0, Math.min(y, canvasMapCanvas.height - imgHeight));

                        // Deselect all other objects
                        state.canvasMapObjects.forEach(obj => obj.selected = false);

                        // Add new object to canvasMapObjects, copying details
                        const newObject = {
                            type: 'image',
                            id: Date.now(), // Unique ID for this instance on CanvasMap
                            sourceId: mapToDraw.id,
                            dataUrl: mapToDraw.dataUrl,
                            x: x,
                            y: y,
                            width: imgWidth,
                            height: imgHeight,
                            rotation: 0,
                            selected: true, // Select the newly dropped object
                            image: img, // Store the loaded image object to prevent flickering
                            details: mapToDraw.details, // Copy details for PDF export
                            filename: mapToDraw.filename
                        };
                        state.canvasMapObjects.push(newObject);
                        selectedCanvasMapObject = newObject;
                        redrawCanvasMapObjects();
                        updateObjectPropertiesPanel();
                    };
                    img.src = mapToDraw.dataUrl;
                }
            });

            // CanvasMap Object Interaction (Selection and Dragging)
            canvasMapCanvas.addEventListener('mousedown', (e) => {
                const { x: mouseX, y: mouseY } = getCanvasCoords(e.clientX, e.clientY, canvasMapCanvas);
                
                // Deselect all first
                state.canvasMapObjects.forEach(obj => obj.selected = false);
                selectedCanvasMapObject = null;

                // Iterate in reverse to select top-most object
                for (let i = state.canvasMapObjects.length - 1; i >= 0; i--) {
                    const obj = state.canvasMapObjects[i];
                    // Check if mouse is within object bounds
                    if (mouseX >= obj.x && mouseX <= (obj.x + obj.width) &&
                        mouseY >= obj.y && mouseY <= (obj.y + obj.height)) {
                        
                        selectedCanvasMapObject = obj;
                        selectedCanvasMapObject.selected = true;
                        isDraggingCanvasMapObject = true;
                        
                        selectedCanvasMapObject.snapIndicators = []; // Initialize for drawing guides
                        
                        dragOffsetX = mouseX - obj.x;
                        dragOffsetY = mouseY - obj.y;
                        
                        redrawCanvasMapObjects();
                        updateObjectPropertiesPanel();
                        return; // Stop after finding the first object
                    }
                }
                redrawCanvasMapObjects(); // Redraw if nothing selected
                updateObjectPropertiesPanel();
            });

            canvasMapCanvas.addEventListener('mousemove', (e) => {
                // Handle object dragging
                if (!isDraggingCanvasMapObject || !selectedCanvasMapObject) return;

                const { x: mouseX, y: mouseY } = getCanvasCoords(e.clientX, e.clientY, canvasMapCanvas);
                
                let newX = mouseX - dragOffsetX;
                let newY = mouseY - dragOffsetY;

                selectedCanvasMapObject.snapIndicators = []; // Reset indicators each frame

                // Snapping Logic
                if (state.canvasMapMagnetEnabled) {
                    const threshold = state.canvasMapMagnetThreshold;
                    let xSnapped = false;
                    let ySnapped = false;
                    
                    for (const stationaryObj of state.canvasMapObjects) {
                        if (stationaryObj.id === selectedCanvasMapObject.id) continue;

                        const moving = selectedCanvasMapObject;
                        const stationary = stationaryObj;

                        // --- X-axis Snapping (find first match) ---
                        if (!xSnapped) {
                            // moving right to stationary left
                            if (Math.abs((newX + moving.width) - stationary.x) < threshold) {
                                newX = stationary.x - moving.width;
                                xSnapped = true;
                                selectedCanvasMapObject.snapIndicators.push({ x: stationary.x, y1: Math.max(newY, stationary.y), y2: Math.min(newY + moving.height, stationary.y + stationary.height) });
                            }
                            // moving left to stationary right
                            else if (Math.abs(newX - (stationary.x + stationary.width)) < threshold) {
                                newX = stationary.x + stationary.width;
                                xSnapped = true;
                                selectedCanvasMapObject.snapIndicators.push({ x: newX, y1: Math.max(newY, stationary.y), y2: Math.min(newY + moving.height, stationary.y + stationary.height) });
                            }
                            // moving left to stationary left
                            else if (Math.abs(newX - stationary.x) < threshold) {
                                newX = stationary.x;
                                xSnapped = true;
                                selectedCanvasMapObject.snapIndicators.push({ x: newX, y1: Math.max(newY, stationary.y), y2: Math.min(newY + moving.height, stationary.y + stationary.height) });
                            }
                            // moving right to stationary right
                            else if (Math.abs((newX + moving.width) - (stationary.x + stationary.width)) < threshold) {
                                newX = stationary.x + stationary.width - moving.width;
                                xSnapped = true;
                                selectedCanvasMapObject.snapIndicators.push({ x: stationary.x + stationary.width, y1: Math.max(newY, stationary.y), y2: Math.min(newY + moving.height, stationary.y + stationary.height) });
                            }
                        }

                        // --- Y-axis Snapping (find first match) ---
                        if (!ySnapped) {
                            // moving bottom to stationary top
                            if (Math.abs((newY + moving.height) - stationary.y) < threshold) {
                                newY = stationary.y - moving.height;
                                ySnapped = true;
                                selectedCanvasMapObject.snapIndicators.push({ y: stationary.y, x1: Math.max(newX, stationary.x), x2: Math.min(newX + moving.width, stationary.x + stationary.width) });
                            }
                            // moving top to stationary bottom
                            else if (Math.abs(newY - (stationary.y + stationary.height)) < threshold) {
                                newY = stationary.y + stationary.height;
                                ySnapped = true;
                                selectedCanvasMapObject.snapIndicators.push({ y: newY, x1: Math.max(newX, stationary.x), x2: Math.min(newX + moving.width, stationary.x + stationary.width) });
                            }
                            // moving top to stationary top
                            else if (Math.abs(newY - stationary.y) < threshold) {
                                newY = stationary.y;
                                ySnapped = true;
                                selectedCanvasMapObject.snapIndicators.push({ y: newY, x1: Math.max(newX, stationary.x), x2: Math.min(newX + moving.width, stationary.x + stationary.width) });
                            }
                            // moving bottom to stationary bottom
                            else if (Math.abs((newY + moving.height) - (stationary.y + stationary.height)) < threshold) {
                                newY = stationary.y + stationary.height - moving.height;
                                ySnapped = true;
                                selectedCanvasMapObject.snapIndicators.push({ y: stationary.y + stationary.height, x1: Math.max(newX, stationary.x), x2: Math.min(newX + moving.width, stationary.x + stationary.width) });
                            }
                        }
                        
                        if(xSnapped && ySnapped) break; // Exit loop if both axes snapped
                    }
                }
                
                // Update object position
                selectedCanvasMapObject.x = newX;
                selectedCanvasMapObject.y = newY;

                // Clamp position to canvas bounds
                selectedCanvasMapObject.x = Math.max(0, Math.min(selectedCanvasMapObject.x, canvasMapCanvas.width - selectedCanvasMapObject.width));
                selectedCanvasMapObject.y = Math.max(0, Math.min(selectedCanvasMapObject.y, canvasMapCanvas.height - selectedCanvasMapObject.height));

                redrawCanvasMapObjects();
                updateObjectPropertiesPanel();
            });

            canvasMapCanvas.addEventListener('mouseup', () => {
                if (isDraggingCanvasMapObject && selectedCanvasMapObject) {
                    selectedCanvasMapObject.snapIndicators = [];
                    redrawCanvasMapObjects(); // Redraw once more to clear guides
                }
                isDraggingCanvasMapObject = false;
            });

            canvasMapCanvas.addEventListener('mouseout', (e) => {
                // Only stop actions if mouse leaves the canvas area
                const rect = canvasMapCanvas.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                    if (isDraggingCanvasMapObject && selectedCanvasMapObject) {
                        selectedCanvasMapObject.snapIndicators = [];
                        redrawCanvasMapObjects(); // Redraw once more to clear guides
                    }
                    isDraggingCanvasMapObject = false;
                }
            });

            // Double-click to edit custom text
            canvasMapCanvas.addEventListener('dblclick', (e) => {
                if (state.customTextEnabled) {
                    customTextInput.focus();
                    customTextInput.select();
                }
            });

            // Keyboard movement and deletion
            window.addEventListener('keydown', (e) => {
                if (!selectedCanvasMapObject) return;
                
                let moved = false;
                switch(e.key) {
                    case 'ArrowUp':
                        selectedCanvasMapObject.y -= 1;
                        moved = true;
                        break;
                    case 'ArrowDown':
                        selectedCanvasMapObject.y += 1;
                        moved = true;
                        break;
                    case 'ArrowLeft':
                        selectedCanvasMapObject.x -= 1;
                        moved = true;
                        break;
                    case 'ArrowRight':
                        selectedCanvasMapObject.x += 1;
                        moved = true;
                        break;
                    case 'Delete':
                        e.preventDefault(); // Prevent browser back navigation on backspace
                        state.canvasMapObjects = state.canvasMapObjects.filter(obj => obj.id !== selectedCanvasMapObject.id);
                        selectedCanvasMapObject = null;
                        redrawCanvasMapObjects();
                        updateObjectPropertiesPanel();
                        break;
                }

                if (moved) {
                    e.preventDefault();
                    // Clamp position
                    selectedCanvasMapObject.x = Math.max(0, Math.min(selectedCanvasMapObject.x, canvasMapCanvas.width - selectedCanvasMapObject.width));
                    selectedCanvasMapObject.y = Math.max(0, Math.min(selectedCanvasMapObject.y, canvasMapCanvas.height - selectedCanvasMapObject.height));
                    redrawCanvasMapObjects();
                    updateObjectPropertiesPanel();
                }
            });

            // Apply position and rotation from input fields live
            const applyLiveObjectTransform = () => {
                if (!selectedCanvasMapObject) return;

                const newX = parseInt(targetXInput.value, 10);
                const newY = parseInt(targetYInput.value, 10);
                const newRotation = parseInt(targetRotationInput.value, 10);

                if (!isNaN(newX)) {
                    selectedCanvasMapObject.x = Math.max(0, Math.min(newX, canvasMapCanvas.width - selectedCanvasMapObject.width));
                }
                if (!isNaN(newY)) {
                    selectedCanvasMapObject.y = Math.max(0, Math.min(newY, canvasMapCanvas.height - selectedCanvasMapObject.height));
                }
                if (!isNaN(newRotation)) {
                    selectedCanvasMapObject.rotation = newRotation;
                }
                redrawCanvasMapObjects();
            };

            targetXInput.addEventListener('input', applyLiveObjectTransform);
            targetYInput.addEventListener('input', applyLiveObjectTransform);
            targetRotationInput.addEventListener('input', applyLiveObjectTransform);
            
            // Delete and Duplicate buttons
            deleteBtn.addEventListener('click', () => {
                if (!selectedCanvasMapObject) return;
                state.canvasMapObjects = state.canvasMapObjects.filter(obj => obj.id !== selectedCanvasMapObject.id);
                selectedCanvasMapObject = null;
                redrawCanvasMapObjects();
                updateObjectPropertiesPanel();
            });

            duplicateBtn.addEventListener('click', () => {
                if (!selectedCanvasMapObject) return;
                
                const originalObject = selectedCanvasMapObject;
                originalObject.selected = false;

                const newObject = {
                    ...originalObject,
                    id: Date.now(),
                    x: originalObject.x + 20,
                    y: originalObject.y + 20,
                    selected: true,
                };
                
                // Clamp position
                newObject.x = Math.max(0, Math.min(newObject.x, canvasMapCanvas.width - newObject.width));
                newObject.y = Math.max(0, Math.min(newObject.y, canvasMapCanvas.height - newObject.height));

                state.canvasMapObjects.push(newObject);
                selectedCanvasMapObject = newObject;

                redrawCanvasMapObjects();
                updateObjectPropertiesPanel();
            });
            
            // Save Canvas Button Listener
            saveCanvasBtn.addEventListener('click', () => {
                saveCanvasNameInput.value = `Layout ${state.savedCanvases.length + 1}`;
                showBackdrop();
                saveCanvasModal.classList.add('visible');
                saveCanvasNameInput.focus();
            });
            
            saveCanvasCancelBtn.addEventListener('click', () => {
                saveCanvasModal.classList.remove('visible');
                hideBackdrop();
            });

            saveCanvasConfirmBtn.addEventListener('click', () => {
                const name = saveCanvasNameInput.value.trim();
                if (!name) {
                    showMessageBox("Please enter a name for the canvas layout.");
                    return;
                }

                // Create a thumbnail of the current canvasMapCanvas content
                const thumbnailCanvas = document.createElement('canvas');
                const thumbSize = 120; // The desired width of the thumbnail
                const aspectRatio = canvasMapCanvas.width / canvasMapCanvas.height;
                thumbnailCanvas.width = thumbSize;
                thumbnailCanvas.height = thumbSize / aspectRatio;
                const thumbCtx = thumbnailCanvas.getContext('2d');
                
                // Use the existing export function to ensure all elements are drawn correctly for the thumbnail
                const exportCanvas = createExportCanvas(true); 
                thumbCtx.drawImage(exportCanvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
                const thumbnailUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.8);

                // Deep copy the objects to save their state at this moment
                const savedObjects = JSON.parse(JSON.stringify(state.canvasMapObjects));

                const newSavedCanvas = {
                    id: Date.now(),
                    name: name,
                    thumbnailUrl: thumbnailUrl,
                    objects: savedObjects
                };

                state.savedCanvases.push(newSavedCanvas);
                state.currentCanvasId = newSavedCanvas.id;
                state.customText = name; // Set custom text to the canvas name
                renderSavedCanvases(); // Update the UI to show the new saved canvas
                updateCanvasMap();

                // Hide the modal
                saveCanvasModal.classList.remove('visible');
                hideBackdrop();
            });

            // Multi-Export Modal Listeners
            multiExportCancelBtn.addEventListener('click', () => {
                multiExportModal.classList.remove('visible');
                hideBackdrop();
            });

            multiExportSelectAllBtn.addEventListener('click', () => {
                multiExportCanvasList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
            });

            multiExportDeselectAllBtn.addEventListener('click', () => {
                multiExportCanvasList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            });
            
            multiExportConfirmBtn.addEventListener('click', exportMultiCanvasPdf);

            // Initial setup
            createTopologyTools();
            if (state.isDarkMode) {
                document.body.classList.add('dark-mode');
                colorModeToggle.textContent = 'Dark Mode';
            }
            if (state.isColor2Brighter) {
                color2BrightnessToggle.checked = true;
                color2Input.disabled = true;
                state.color2 = adjustColorBrightness(state.color1, 50);
                color2Input.value = state.color2;
            }

            // Initial Sizing Mode UI
            screenDimensionsGroup.style.display = 'block';
            panelCountGroup.style.display = 'none';
            pdfEmailInput.value = state.pdfEmail;

            updateColorPreviews();
            createColorPalette();
            updatePixelMap();
            
            // Fit to screen by default
            const containerWidth = canvasContainer.clientWidth;
            const containerHeight = canvasContainer.clientHeight;
            const scaleX = state.totalResWidth > 0 ? containerWidth / state.totalResWidth : 1;
            const scaleY = state.totalResHeight > 0 ? containerHeight / state.totalResHeight : 1;
            state.zoomLevel = Math.min(scaleX, scaleY) * 0.95; // 5% margin
            applyCanvasTransform();
            // Disable CanvasMap until at least one LED screen is sent from PixelMap
            const canvasMapTabButton = document.getElementById('canvasmap-tab');
            const canvasMapPane = document.getElementById('canvasmap-pane');
            const setCanvasMapEnabled = (enabled) => {
                if (!canvasMapTabButton || !canvasMapPane) return;
                if (enabled) {
                    canvasMapTabButton.classList.remove('disabled-tab');
                    canvasMapTabButton.setAttribute('aria-disabled', 'false');
                    const controls = canvasMapPane.querySelectorAll('input, select, button, canvas');
                    controls.forEach(ctrl => ctrl.removeAttribute('disabled'));
                } else {
                    canvasMapTabButton.classList.add('disabled-tab');
                    canvasMapTabButton.setAttribute('aria-disabled', 'true');
                    const controls = canvasMapPane.querySelectorAll('input, select, button');
                    controls.forEach(ctrl => ctrl.setAttribute('disabled', 'true'));
                }
            };

            const hasSentLedScreen = () => Array.isArray(state.storedPixelMaps) && state.storedPixelMaps.length > 0;
            setCanvasMapEnabled(hasSentLedScreen());

            // Disable PDF Settings until at least one canvas is saved
            const pdfTabButton = document.getElementById('pdfsettings-tab');
            const pdfPane = document.getElementById('pdfsettings-pane');
            const setPdfSettingsEnabled = (enabled) => {
                if (!pdfTabButton || !pdfPane) return;
                // Toggle tab accessibility
                if (enabled) {
                    pdfTabButton.classList.remove('disabled-tab');
                    pdfTabButton.setAttribute('aria-disabled', 'false');
                } else {
                    pdfTabButton.classList.add('disabled-tab');
                    pdfTabButton.setAttribute('aria-disabled', 'true');
                }
                // Disable inner controls
                const controls = pdfPane.querySelectorAll('input, select, button');
                controls.forEach(ctrl => {
                    // Keep Export buttons disabled until enabled too
                    if (!enabled) {
                        ctrl.setAttribute('disabled', 'true');
                    } else {
                        ctrl.removeAttribute('disabled');
                    }
                });
            };

            const hasSavedCanvases = () => Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0;
            setPdfSettingsEnabled(hasSavedCanvases());

            // Initial renders
            updatePixelMap();
            updateCanvasMap();
            updateObjectPropertiesPanel();
            renderImportedMapsGallery(); // Render gallery on initial load
            renderSavedCanvases(); // Render saved canvases on load

            // Set default ON states for PixelMap features
            outlineToggle.textContent = 'On';
            numberingToggle.textContent = 'On';
            customTextToggle.textContent = 'On';
            circleEffectToggle.textContent = 'On';
            crossLineEffectToggle.textContent = 'On';


            // Set default ON states for CanvasMap features
            rulerToggle.textContent = 'On';
            rulerContainer.classList.add('rulers-on');
            rulerPositionToggle.textContent = 'Inside';
            rulerContainer.classList.add('rulers-inside');
            gridlineToggle.textContent = 'On';

            // When a new canvas is saved, enable PDF Settings
            const enablePdfAfterSave = () => setPdfSettingsEnabled(true);
            saveCanvasConfirmBtn.addEventListener('click', enablePdfAfterSave, { once: true });
            magnetToggle.textContent = 'On';
            gapToggle.textContent = 'On';
            coordinatesToggle.textContent = 'On';
            if (state.canvasMapRulerEnabled) {
                drawRulers();
            }

            // Initialize UI with current state
            updateUIFromState();

            // PDF preview is generated lazily when the PDF tab is opened.

            })();
        });
