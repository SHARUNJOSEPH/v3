// Minimal scripting to toggle password UI and update password
        document.addEventListener('DOMContentLoaded', () => {
            const profileModal = document.getElementById('profileModal');
            const passwordSection = document.getElementById('passwordChangeSection');
            const updateBtn = document.getElementById('updatePasswordBtn');
            const newInput = document.getElementById('newPasswordInput');
            const confirmInput = document.getElementById('confirmPasswordInput');
            const rulesEl = document.getElementById('passwordRules');

            const isFirebaseAvailable = () => {
                try { return !!window.firebase && !!firebase.auth; } catch { return false; }
            };
            const getUser = () => {
                if (isFirebaseAvailable()) {
                    try { return firebase.auth().currentUser; } catch { return null; }
                }
                return null;
            };
            const isPasswordProvider = (user) => {
                try { return user?.providerData?.some(p => (p.providerId === 'password' || p.providerId === 'firebase')); } catch { return false; }
            };

            if (profileModal) {
                profileModal.addEventListener('show.bs.modal', () => {
                    const user = getUser();
                    if (user && isPasswordProvider(user)) {
                        passwordSection && (passwordSection.style.display = '');
                    } else {
                        passwordSection && (passwordSection.style.display = 'none');
                    }
                    // Clear fields on open
                    [newInput, confirmInput].forEach(el => { if (el) el.value = ''; });
                    // Reset rules state
                    if (rulesEl) {
                        rulesEl.querySelectorAll('li').forEach(li => li.classList.remove('ok'));
                        rulesEl.querySelectorAll('li').forEach(li => li.classList.add('bad'));
                    }
                });
            }

            if (updateBtn) {
                updateBtn.addEventListener('click', async () => {
                    const user = getUser();
                    if (!user) { alert('Please login with Email/Password to change your password.'); return; }
                    if (!isPasswordProvider(user)) { alert('Password change is not available for Google sign-ins.'); return; }

                    const nxt = newInput?.value || '';
                    const cnf = confirmInput?.value || '';
                    if (!nxt || !cnf) { alert('Please fill all password fields.'); return; }
                    // Enforce strong password requirements
                    const rules = {
                        length: nxt.length >= 8,
                        upper: /[A-Z]/.test(nxt),
                        lower: /[a-z]/.test(nxt),
                        digit: /\d/.test(nxt),
                        special: /[!@#$%^&*]/.test(nxt)
                    };
                    if (rulesEl) {
                        Object.entries(rules).forEach(([k, ok]) => {
                            const li = rulesEl.querySelector(`li[data-rule="${k}"]`);
                            if (li) li.className = ok ? 'ok' : 'bad';
                        });
                    }
                    const allOk = Object.values(rules).every(Boolean);
                    if (!allOk) { alert('Password does not meet the requirements.'); return; }
                    if (nxt !== cnf) { alert('New passwords do not match.'); return; }

                    if (!isFirebaseAvailable()) { alert('Password update requires Firebase Auth.'); return; }

                    try {
                        // Try to update; if Firebase requires recent login, prompt re-auth flow
                        await user.updatePassword(nxt);
                        alert('Password updated successfully.');
                        [newInput, confirmInput].forEach(el => { if (el) el.value = ''; });
                    } catch (e) {
                        // If requires-recent-login, advise logout/login or add a reauth path
                        if (e && (e.code === 'auth/requires-recent-login' || e.code === 'auth/weak-password')) {
                            alert('Please sign out and sign back in to change your password.');
                        } else {
                            alert(e?.message || 'Failed to update password.');
                        }
                    }
                });

                // Visibility toggles that persist: delegate clicks so toggles exist even after rerenders
                document.addEventListener('click', (e) => {
                    const btn = e.target.closest('.password-toggle');
                    if (!btn) return;
                    const targetId = btn.getAttribute('data-target');
                    const input = document.getElementById(targetId);
                    if (!input) return;
                    const nowType = input.getAttribute('type') === 'password' ? 'text' : 'password';
                    input.setAttribute('type', nowType);
                    // Optionally swap icon (same icon used for simplicity)
                });

                // Live validation on typing new password
                const refreshRules = () => {
                    if (!rulesEl || !newInput) return;
                    const val = newInput.value || '';
                    const rules = {
                        length: val.length >= 8,
                        upper: /[A-Z]/.test(val),
                        lower: /[a-z]/.test(val),
                        digit: /\d/.test(val),
                        special: /[!@#$%^&*]/.test(val)
                    };
                    Object.entries(rules).forEach(([k, ok]) => {
                        const li = rulesEl.querySelector(`li[data-rule="${k}"]`);
                        if (li) li.className = ok ? 'ok' : 'bad';
                    });
                };
                if (newInput) newInput.addEventListener('input', refreshRules);
            } // end if (updateBtn)

        }); // end DOMContentLoaded

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
                let storage = null;
                try { if (!isDemoMode) { db = firebase.firestore(); } } catch { }
                try { if (!isDemoMode) { storage = firebase.storage(); } } catch { }

                // ---- Simple auth redirect + header for local/dev ----
                const authBar = document.getElementById('authBar');
                const authUserLabel = document.getElementById('authUserLabel');
                const authLogoutBtn = document.getElementById('authLogoutBtn');
                const redirectToLogin = () => { try { window.location.href = 'login.html'; } catch { } };
                // 24h session window helpers
                const AUTH_EXPIRY_KEY = 'authExpiryAt';
                const nowMs = () => Date.now();
                const getAuthExpiry = () => { try { return parseInt(localStorage.getItem(AUTH_EXPIRY_KEY) || '0', 10); } catch { return 0; } };
                const isAuthExpired = () => nowMs() > getAuthExpiry();
                const clearAuthExpiry = () => { try { localStorage.removeItem(AUTH_EXPIRY_KEY); } catch { } };
                const setAuthExpiry = () => { try { localStorage.setItem(AUTH_EXPIRY_KEY, String(nowMs() + 24 * 60 * 60 * 1000)); } catch { } };
                const showAuthBar = (label) => {
                    if (!authBar) return;
                    if (label) {
                        authUserLabel.textContent = label;
                        authUserLabel.title = label;
                        authBar.style.display = '';
                    } else {
                        authBar.style.display = 'none';
                    }
                };
                const getDemoUser = () => { try { return JSON.parse(localStorage.getItem('demoAuthUser') || 'null'); } catch { return null; } };
                if (!isDemoMode) {
                    try {
                        const auth = firebase.auth();
                        auth.onAuthStateChanged((user) => {
                            if (user) {
                                // If no expiry set yet (first login), set it; else enforce expiry
                                const exp = getAuthExpiry();
                                if (!exp || Number.isNaN(exp) || exp <= 0) {
                                    setAuthExpiry();
                                } else if (nowMs() > exp) {
                                    clearAuthExpiry();
                                    auth.signOut().finally(() => { setTimeout(() => { try { showLoginModal(true); } catch { } }, 0); });
                                    return;
                                }
                                showAuthBar(user.displayName || user.email || 'Signed in');
                            } else {
                                // Not signed in â†’ show in-app login modal
                                setTimeout(() => { try { showLoginModal(true); } catch { } }, 0);
                            }
                        });
                        authLogoutBtn?.addEventListener('click', async () => {
                            try { await auth.signOut(); } catch { }
                            clearAuthExpiry();
                            setTimeout(() => { try { showLoginModal(true); } catch { } }, 0);
                        });
                    } catch {
                        // If auth API not available, fall back to in-app login modal
                        setTimeout(() => { try { showLoginModal(true); } catch { } }, 0);
                    }
                } else {
                    const demo = getDemoUser();
                    if (demo?.email) {
                        const exp = getAuthExpiry();
                        if (!exp || Number.isNaN(exp) || exp <= 0) {
                            setAuthExpiry();
                        } else if (nowMs() > exp) {
                            try { localStorage.removeItem('demoAuthUser'); } catch { }
                            clearAuthExpiry();
                            setTimeout(() => { try { showLoginModal(true); } catch { } }, 0);
                            return;
                        }
                        showAuthBar(demo.email);
                        authLogoutBtn?.addEventListener('click', () => { try { localStorage.removeItem('demoAuthUser'); } catch { } clearAuthExpiry(); redirectToLogin(); });
                    } else {
                        // No demo session â†’ show in-app login modal
                        setTimeout(() => { try { showLoginModal(true); } catch { } }, 0);
                    }
                }
            // Enable Bootstrap tooltips globally
            const tooltipTriggerList = Array.from(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            tooltipTriggerList.forEach(el => {
                if (!bootstrap.Tooltip.getInstance(el)) {
                    bootstrap.Tooltip.getOrCreateInstance(el);
                }
            });
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
                // Bottom gallery selection
                sentActiveId: null,
                sentScreens: [],
                
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
                // Canvas background color for exports and previews
                canvasBgColor: '#000000',
                mediaServer: 'resolume',
                pdfFilename: 'canvasmap_details',
                pdfProjectName: '',
                pdfJobNo: '',
                pdfVenue: '',
                pdfCompany: '',
                pdfDrawnBy: '',
                pdfSales: '',
                pdfClient: '',
                pdfUnit: '',
                pdfEmail: '',
                pdfIncludeCanvasSnapshot: false,
                logoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', // Default placeholder
                // Optional user-provided logo sources
                logoUrl: '',
                logoBase64: '',
                // PDF preview performance flags
                pdfPreviewDirty: true,
                pdfPreviewReady: false,
                lastPdfPreviewUrl: null,
                pdfPreviewLite: false, // Lite preview mode: faster rendering (default Off)
                pdfPreviewEngine: 'image', // 'image' | 'iframe'
                // PDF selection behavior
                pdfSelectionMode: 'all', // 'all' (auto-include all canvases) | 'custom' (manual checks)
                // Image preview zoom settings
                pdfImagePreviewZoomMode: 'scale', // 'fit' | 'scale' (default Fixed scale)
                pdfImagePreviewScale: 1.0, // used when zoom mode is 'scale'
                // Pages tab per-canvas screen order
                pdfScreenOrder: {}, // { [canvasIdOrKey: string]: number[] } indices into canvas.objects
                
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
                const panelWidthInput = document.getElementById('panelWidthInput');
                const panelHeightInput = document.getElementById('panelHeightInput');
                const panelPresetCombo = document.getElementById('panelPresetCombo');
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

                // --- Enable drag-and-drop onto PixelMap preview to re-edit a saved screen ---
                if (canvasContainer) {
                    const addDropHighlight = () => canvasContainer.classList.add('drop-target');
                    const removeDropHighlight = () => canvasContainer.classList.remove('drop-target');
                    let dragCounter = 0;

                    const allowDropIfScreen = (e) => {
                        const types = e.dataTransfer?.types || [];
                        if (Array.from(types).includes('text/plain')) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'copy';
                            return true;
                        }
                        return false;
                    };

                    const handleDrop = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dragCounter = 0;
                        removeDropHighlight();
                        const idStr = e.dataTransfer.getData('text/plain');
                        const mapId = parseInt(idStr, 10);
                        if (!isNaN(mapId) && Array.isArray(state.storedPixelMaps)) {
                            const found = state.storedPixelMaps.find(m => m.id === mapId);
                            if (found) {
                                try {
                                    // Apply immediately without needing tab switches
                                    loadSentMapForEdit(found);
                                    // Ensure transform/overlay are in sync
                                    applyCanvasTransform();
                                    redrawDrawingOverlay();
                                } catch (err) {
                                    console.warn('Drop-to-edit failed:', err);
                                }
                            }
                        }
                    };

                    // Attach to the container
                    canvasContainer.addEventListener('dragover', (e) => { if (allowDropIfScreen(e)) addDropHighlight(); });
                    canvasContainer.addEventListener('dragenter', () => { dragCounter++; addDropHighlight(); });
                    canvasContainer.addEventListener('dragleave', () => { dragCounter = Math.max(0, dragCounter - 1); if (dragCounter === 0) removeDropHighlight(); });
                    canvasContainer.addEventListener('drop', handleDrop);

                    // Also attach to the canvases to catch drops on the top-most elements
                    [pixelMapCanvas, drawingOverlayCanvas].forEach((el) => {
                        if (!el) return;
                        el.addEventListener('dragover', (e) => { if (allowDropIfScreen(e)) addDropHighlight(); });
                        el.addEventListener('dragenter', () => { dragCounter++; addDropHighlight(); });
                        el.addEventListener('dragleave', () => { dragCounter = Math.max(0, dragCounter - 1); if (dragCounter === 0) removeDropHighlight(); });
                        el.addEventListener('drop', handleDrop);
                    });
                }

                const isCompanyEmail = (email) => /@mediaproav\.com$/i.test(String(email || ''));
                const getAuthedEmailSafe = () => {
                    try { return (!window.__IS_DEMO__ && firebase?.auth?.() ? firebase.auth().currentUser?.email : null) || null; } catch { return null; }
                };
                const enforceEmailReadonly = () => {
                    if (!profileEmailInput) return;
                    profileEmailInput.setAttribute('readonly', 'true');
                    profileEmailInput.classList.add('readonly');
                    // If we have an authed email, reflect it
                    const authed = getAuthedEmailSafe();
                    if (authed) profileEmailInput.value = authed;
                    try {
                        const hint = document.getElementById('profileEmailHint');
                        if (hint) hint.style.display = '';
                    } catch { }
                };

                const enforceCompanyField = () => {
                    if (!profileCompanyInput) return;
                    const email = getAuthedEmailSafe() || (profileEmailInput?.value || '').trim();
                    const lock = isCompanyEmail(email);
                    if (lock) {
                        profileCompanyInput.value = 'MediaPro';
                        profileCompanyInput.setAttribute('readonly', 'true');
                        profileCompanyInput.classList.add('readonly');
                        try { const hint = document.getElementById('profileCompanyHint'); if (hint) hint.style.display = ''; } catch { }
                    } else {
                        profileCompanyInput.removeAttribute('readonly');
                        profileCompanyInput.classList.remove('readonly');
                        try { const hint = document.getElementById('profileCompanyHint'); if (hint) hint.style.display = 'none'; } catch { }
                    }
                };

            const populateProfileForm = (data = {}) => {
                if (!profileNameInput) return; // if modal not present, skip
                profileNameInput.value = data.name || '';
                // Email is managed by auth; prefer authed email if present
                profileEmailInput.value = getAuthedEmailSafe() || data.email || '';
                profileCompanyInput.value = data.company || '';
                profileTitleInput.value = data.title || '';
                profilePhoneInput.value = data.phone || '';
                profileNotesInput.value = data.notes || '';
                enforceEmailReadonly();
                enforceCompanyField();
            };

                const readProfileForm = () => {
                    const email = getAuthedEmailSafe() || (profileEmailInput?.value || '').trim();
                    const companyLocked = isCompanyEmail(getAuthedEmailSafe() || email);
                    return {
                        name: (profileNameInput?.value || '').trim(),
                        email,
                        company: companyLocked ? 'MediaPro' : (profileCompanyInput?.value || '').trim(),
                        title: (profileTitleInput?.value || '').trim(),
                        phone: (profilePhoneInput?.value || '').trim(),
                        notes: (profileNotesInput?.value || '').trim(),
                    };
                };

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
                enforceEmailReadonly();
                enforceCompanyField();
                if (typeof enforcePdfCompanyLock === 'function') enforcePdfCompanyLock();
                try {
                    // Show account managed hint when we have an authenticated user
                    const emailHint = document.getElementById('profileEmailHint');
                    if (emailHint) emailHint.style.display = '';
                } catch { }
                // If Drawn By not set, default from profile name
                try {
                    if (!state.pdfDrawnBy && merged.name) {
                        state.pdfDrawnBy = String(merged.name).toUpperCase();
                        if (typeof pdfDrawnByInput !== 'undefined' && pdfDrawnByInput) {
                            pdfDrawnByInput.value = (state.pdfDrawnBy || '').toUpperCase();
                        }
                        state.pdfPreviewDirty = true; schedulePdfPreview();
                    }
                    // Sync Validation Email to auth email (uppercase for consistency) and lock Drawn By/Email when MediaPro
                    state.pdfEmail = (merged.email || state.pdfEmail || '').toUpperCase();
                    if (typeof pdfEmailInput !== 'undefined' && pdfEmailInput) pdfEmailInput.value = state.pdfEmail;
                    const profCompany = merged.company || (getStoredProfile() && getStoredProfile().company) || '';
                    const isMP = isMediaPro(profCompany);
                    if (isMP) {
                        if (pdfDrawnByInput) { pdfDrawnByInput.setAttribute('readonly', 'true'); pdfDrawnByInput.classList.add('readonly'); pdfDrawnByInput.title = 'Managed by your company'; }
                        if (pdfEmailInput) { pdfEmailInput.setAttribute('readonly', 'true'); pdfEmailInput.classList.add('readonly'); pdfEmailInput.title = 'Managed by your company'; }
                        try { const h1 = document.getElementById('pdfDrawnByHint'); if (h1) h1.style.display = ''; } catch { }
                        try { const h2 = document.getElementById('pdfEmailHint'); if (h2) h2.style.display = ''; } catch { }
                    } else {
                        if (pdfDrawnByInput) { pdfDrawnByInput.removeAttribute('readonly'); pdfDrawnByInput.classList.remove('readonly'); pdfDrawnByInput.removeAttribute('title'); }
                        if (pdfEmailInput) { pdfEmailInput.removeAttribute('readonly'); pdfEmailInput.classList.remove('readonly'); pdfEmailInput.removeAttribute('title'); }
                        try { const h1 = document.getElementById('pdfDrawnByHint'); if (h1) h1.style.display = 'none'; } catch { }
                        try { const h2 = document.getElementById('pdfEmailHint'); if (h2) h2.style.display = 'none'; } catch { }
                    }
                } catch { }
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
                const enforcePdfCompanyLock = () => {
                    try {
                        const prof = getStoredProfile();
                        const isMP = isMediaPro((prof?.company || state.pdfCompany || ''));
                        if (pdfCompanyInput) {
                            if (isMP) {
                                pdfCompanyInput.value = 'MEDIAPRO';
                                pdfCompanyInput.setAttribute('readonly', 'true');
                                pdfCompanyInput.classList.add('readonly');
                                pdfCompanyInput.title = 'Managed by your company';
                                try { const hint = document.getElementById('pdfCompanyHint'); if (hint) hint.style.display = ''; } catch { }
                            } else {
                                pdfCompanyInput.removeAttribute('readonly');
                                pdfCompanyInput.classList.remove('readonly');
                                pdfCompanyInput.removeAttribute('title');
                                try { const hint = document.getElementById('pdfCompanyHint'); if (hint) hint.style.display = 'none'; } catch { }
                            }
                        }
                        // Reorder fields to make read-write inputs come first for MediaPro
                        reorderPdfFieldsForMediaPro();
                    } catch { }
                };
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
                const canvasBgColorInput = document.getElementById('canvasBgColorInput');
            const exportCanvasPngBtn = document.getElementById('exportCanvasPngBtn');
            const exportCanvasJpgBtn = document.getElementById('exportCanvasJpgBtn');
            const exportCanvasPdfBtn = document.getElementById('exportCanvasPdfBtn');
            const exportCanvasPdfBtnNew = document.getElementById('exportCanvasPdfBtnNew');
            const exportCanvasXmlBtn = document.getElementById('exportCanvasXmlBtn');
            // PDF Preview
            const generatePdfPreviewBtn = document.getElementById('generatePdfPreviewBtn');
                const pdfLitePreviewToggle = document.getElementById('pdfLitePreviewToggle');
                const pdfPreviewEngineToggle = document.getElementById('pdfPreviewEngineToggle');

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
                const pdfProjectDateInput = document.getElementById('pdfProjectDateInput');
                const pdfJobNoInput = document.getElementById('pdfJobNoInput');
            const pdfVenueInput = document.getElementById('pdfVenueInput');
                const pdfCompanyInput = document.getElementById('pdfCompanyInput');
            const pdfDrawnByInput = document.getElementById('pdfDrawnByInput');
            const pdfSalesInput = document.getElementById('pdfSalesInput');
            const pdfClientInput = document.getElementById('pdfClientInput');
            const pdfUnitInput = document.getElementById('pdfUnitInput');
            const pdfEmailInput = document.getElementById('pdfEmailInput');
            const pdfIncludeCanvasSnapshotToggle = document.getElementById('pdfIncludeCanvasSnapshotToggle');
            const logoUpload = document.getElementById('logoUpload');
            const logoPreview = document.getElementById('logoPreview');
                const logoUrlInput = document.getElementById('logoUrlInput');
                const logoBase64Input = document.getElementById('logoBase64Input');
                const logoInputsGroup = document.getElementById('logoInputsGroup');
            
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

                // Promise-based confirm dialog with nicer UX than window.confirm
                const confirmBox = document.getElementById('confirmBox');
                const confirmTitle = document.getElementById('confirmTitle');
                const confirmText = document.getElementById('confirmText');
                const confirmOkBtn = document.getElementById('confirmOkBtn');
                const confirmCancelBtn = document.getElementById('confirmCancelBtn');
                let confirmResolve = null;

                const showConfirm = (opts = {}) => {
                    const { title = 'Are you sure?', text = 'This action cannot be undone.', okText = 'Confirm', cancelText = 'Cancel', okVariant = 'danger' } = opts;
                    confirmTitle.textContent = title;
                    confirmText.textContent = text;
                    confirmOkBtn.textContent = okText;
                    confirmCancelBtn.textContent = cancelText;
                    // Style primary action
                    confirmOkBtn.classList.remove('btn-primary', 'btn-danger', 'btn-secondary');
                    confirmOkBtn.classList.add(okVariant === 'danger' ? 'btn-danger' : 'btn-primary');
                    showBackdrop();
                    confirmBox.style.display = 'block';
                    setTimeout(() => confirmBox.classList.add('visible'), 0);
                    return new Promise((resolve) => {
                        confirmResolve = resolve;
                    });
                };

                const hideConfirm = () => {
                    confirmBox.classList.remove('visible');
                    setTimeout(() => { confirmBox.style.display = 'none'; hideBackdrop(); }, 150);
                    if (confirmResolve) { confirmResolve = null; }
                };

                confirmOkBtn.addEventListener('click', () => { if (confirmResolve) confirmResolve(true); hideConfirm(); });
                confirmCancelBtn.addEventListener('click', () => { if (confirmResolve) confirmResolve(false); hideConfirm(); });

            // Non-blocking global toast notifications (always on top)
            const showToast = (message, variant = 'primary', delayMs = 2200) => {
                try {
                    const container = document.getElementById('toastContainer');
                    if (!container) return;
                    const bgClass = ({
                        success: 'bg-success text-white',
                        danger: 'bg-danger text-white',
                        warning: 'bg-warning text-dark',
                        info: 'bg-info text-dark',
                        primary: 'bg-primary text-white',
                    }[variant]) || 'bg-primary text-white';
                    const closeBtnClass = bgClass.includes('text-dark') ? 'btn-close me-2 m-auto' : 'btn-close btn-close-white me-2 m-auto';

                    const toastEl = document.createElement('div');
                    toastEl.className = `toast align-items-center ${bgClass} border-0 shadow`;
                    toastEl.setAttribute('role', 'status');
                    toastEl.setAttribute('aria-live', 'polite');
                    toastEl.setAttribute('aria-atomic', 'true');

                    const wrapper = document.createElement('div');
                    wrapper.className = 'd-flex';

                    const body = document.createElement('div');
                    body.className = 'toast-body';
                    body.textContent = message;

                    const closeBtn = document.createElement('button');
                    closeBtn.type = 'button';
                    closeBtn.className = closeBtnClass;
                    closeBtn.setAttribute('data-bs-dismiss', 'toast');
                    closeBtn.setAttribute('aria-label', 'Close');

                    wrapper.appendChild(body);
                    wrapper.appendChild(closeBtn);
                    toastEl.appendChild(wrapper);

                    container.appendChild(toastEl);
                    const toast = new bootstrap.Toast(toastEl, { delay: delayMs, autohide: true });
                    toast.show();
                    toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
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

                // --- Company utilities ---
                const isMediaPro = (name) => {
                    try { return String(name || '').trim().toLowerCase() === 'mediapro'; } catch { return false; }
                };

                // Optional embedded base64 for MediaPro logo (PNG). If empty, we'll try mediapro-logo.png file next to index.html
                const MEDIAPRO_LOGO_BASE64 = '';

                // App's built-in 1x1 placeholder used by defaults
                const DEFAULT_LOGO_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

                // Helper: convert Blob to data URL
                const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
                    try {
                        const fr = new FileReader();
                        fr.onload = () => resolve(fr.result);
                        fr.onerror = () => reject(fr.error || new Error('Failed to read image blob'));
                        fr.readAsDataURL(blob);
                    } catch (e) { reject(e); }
                });

                // Helper: add a timeout to a promise to avoid long hangs
                const withTimeout = (promise, ms, label = 'operation') => {
                    let timer;
                    return Promise.race([
                        promise,
                        new Promise((_, reject) => {
                            timer = setTimeout(() => reject(new Error(label + ' timeout')), ms);
                        })
                    ]).finally(() => clearTimeout(timer));
                };

                // Helper: fetch an image URL and return a PNG data URL via canvas (fallback to original data URL)
                const fetchToPngDataUrl = async (url) => {
                    const res = await fetch(url, { mode: 'cors' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    try {
                        const bmp = await createImageBitmap(blob);
                        const c = document.createElement('canvas');
                        c.width = bmp.width; c.height = bmp.height;
                        const ictx = c.getContext('2d', { alpha: true });
                        ictx.drawImage(bmp, 0, 0);
                        return c.toDataURL('image/png');
                    } catch {
                        return await blobToDataUrl(blob);
                    }
                };

                // Helper: normalize a pasted value to a data URL (assumes PNG if raw)
                const normalizeBase64ToDataUrl = (val) => {
                    if (!val) return '';
                    const s = String(val).trim();
                    if (s.toLowerCase().startsWith('data:image/')) return s;
                    // If user pasted raw base64, prefix as PNG
                    return `data:image/png;base64,${s}`;
                };

                const setLogoFromDataUrl = (dataUrl) => {
                    if (!dataUrl || !dataUrl.startsWith('data:image')) return;
                    state.logoDataUrl = dataUrl;
                    if (logoPreview) {
                        logoPreview.src = dataUrl;
                        logoPreview.classList.remove('d-none');
                    }
                    state.pdfPreviewDirty = true; schedulePdfPreview();
                };
                const loadMediaProLogoAsPngDataUrl = () => new Promise((resolve, reject) => {
                    try {
                        // 0) User-saved default in localStorage (persisted via UI button)
                        try {
                            const saved = localStorage.getItem('mediaproDefaultLogoDataUrl');
                            if (saved && saved.startsWith('data:image/')) {
                                resolve(saved);
                                return;
                            }
                        } catch { }

                        // 1) Embedded base64 constant (if provided)
                        if (MEDIAPRO_LOGO_BASE64 && MEDIAPRO_LOGO_BASE64.length > 100) {
                            resolve(`data:image/png;base64,${MEDIAPRO_LOGO_BASE64}`);
                            return;
                        }

                        const fallbackLocal = () => {
                            const tryLocal = (src, onFail) => {
                                try {
                                    const img = new Image();
                                    img.onload = () => {
                                        try {
                                            const c = document.createElement('canvas');
                                            c.width = img.naturalWidth || img.width;
                                            c.height = img.naturalHeight || img.height;
                                            const ictx = c.getContext('2d', { alpha: true });
                                            ictx.drawImage(img, 0, 0);
                                            resolve(c.toDataURL('image/png'));
                                        } catch (e) { onFail(e); }
                                    };
                                    img.onerror = () => onFail(new Error('Local image failed to load: ' + src));
                                    img.src = src;
                                } catch (e) { onFail(e); }
                            };
                            // Prefer PNG, then WEBP
                            tryLocal('./mediapro-logo.png', () => tryLocal('./mediapro-logo.webp', () => reject(new Error('Could not load MediaPro logo'))));
                        };

                        // 2) Try fast local files first to avoid network delays
                        // If these fail, then try cloud with a short timeout
                        const tryLocalFirstThenCloud = () => {
                            const onLocalFail = () => {
                                // 3) Try cloud asset with a short timeout, then give up
                                if (!window.__IS_DEMO__ && window.firebase?.storage) {
                                    const tryStorage = (path, onFail) => {
                                        try {
                                            const ref = firebase.storage().ref(path);
                                            withTimeout(ref.getDownloadURL(), 2000, 'storage URL')
                                                .then((url) => withTimeout(fetchToPngDataUrl(url), 2500, 'logo fetch')
                                                    .then(resolve)
                                                    .catch(onFail))
                                                .catch(() => onFail());
                                        } catch (e) { onFail(e); }
                                    };
                                    tryStorage('branding/mediapro/logo.png', () => tryStorage('branding/mediapro/logo.webp', () => reject(new Error('Could not load MediaPro logo'))));
                                } else {
                                    reject(new Error('Could not load MediaPro logo'));
                                }
                            };
                            // Local PNG then WEBP
                            const tryLocal = (src, onFail) => {
                                try {
                                    const img = new Image();
                                    img.onload = () => {
                                        try {
                                            const c = document.createElement('canvas');
                                            c.width = img.naturalWidth || img.width;
                                            c.height = img.naturalHeight || img.height;
                                            const ictx = c.getContext('2d', { alpha: true });
                                            ictx.drawImage(img, 0, 0);
                                            resolve(c.toDataURL('image/png'));
                                        } catch (e) { onFail(e); }
                                    };
                                    img.onerror = () => onFail(new Error('Local image failed to load: ' + src));
                                    img.src = src;
                                } catch (e) { onFail(e); }
                            };
                            tryLocal('./mediapro-logo.png', () => tryLocal('./mediapro-logo.webp', onLocalFail));
                        };

                        tryLocalFirstThenCloud();
                    } catch (e) { reject(e); }
                });

                const isPlaceholderLogo = (dataUrl) => {
                    if (!dataUrl) return true;
                    const s = String(dataUrl);
                    if (s === DEFAULT_LOGO_PLACEHOLDER) return true;
                    // Heuristic for extremely tiny data URLs
                    return s.length < 200;
                };

                const ensureDefaultLogoForCompany = async () => {
                    try {
                        const company = state.pdfCompany || (getStoredProfile()?.company) || '';
                        if (!isMediaPro(company)) return;
                        if (!isPlaceholderLogo(state.logoDataUrl)) return; // custom logo already set
                        const dataUrl = await loadMediaProLogoAsPngDataUrl();
                        if (dataUrl && dataUrl.startsWith('data:image/')) {
                            state.logoDataUrl = dataUrl;
                            if (logoPreview) {
                                logoPreview.src = dataUrl;
                                logoPreview.classList.remove('d-none');
                            }
                            state.pdfPreviewDirty = true; schedulePdfPreview();
                        }
                    } catch (e) {
                        try {
                            // If we failed to auto-load the default logo, make the upload UI available even for MediaPro
                            const group = document.getElementById('logoInputsGroup');
                            if (group) group.style.display = '';
                            const hint = (location?.protocol === 'file:')
                                ? ' Open this page via a local server (http://localhost) or use the upload button.'
                                : '';
                            showToast('Default MediaPro logo not found. Place mediapro-logo.png next to index.html or upload a logo.' + hint, 'warning');
                            console.warn('MediaPro logo auto-load failed:', e);
                        } catch { }
                    }
                };

                const enforceCompanyLogoPolicy = () => {
                    try {
                        const company = state.pdfCompany || (getStoredProfile()?.company) || '';
                        const isMP = isMediaPro(company);
                        const group = document.getElementById('logoInputsGroup');
                        if (group) group.style.display = isMP ? 'none' : '';
                    } catch { }
                };

                // Reorder PDF fields so MediaPro-managed read-only fields are pushed to the bottom for easier data entry
                const reorderPdfFieldsForMediaPro = () => {
                    try {
                        const container = document.getElementById('pdfFieldsContainer');
                        if (!container) return;
                        const company = state.pdfCompany || (getStoredProfile()?.company) || '';
                        const isMP = isMediaPro(company);

                        // Identify field blocks (the wrapping div for each input)
                        const blockFor = (inputEl) => inputEl ? inputEl.closest('div') : null;
                        const blocks = {
                            company: blockFor(document.getElementById('pdfCompanyInput')),
                            drawnBy: blockFor(document.getElementById('pdfDrawnByInput')),
                            email: blockFor(document.getElementById('pdfEmailInput')),
                        };

                        // Capture initial order once for possible restoration
                        if (!container.__initialChildren) {
                            container.__initialChildren = Array.from(container.children);
                        }

                        if (isMP) {
                            // Move managed fields to the end, preserving their relative order
                            ['company', 'drawnBy', 'email'].forEach(key => {
                                const node = blocks[key];
                                if (node && container.contains(node)) {
                                    container.appendChild(node);
                                }
                            });
                        } else if (Array.isArray(container.__initialChildren) && container.__initialChildren.length) {
                            // Restore original order when not MediaPro
                            container.__initialChildren.forEach(child => {
                                if (container.contains(child)) {
                                    container.appendChild(child);
                                }
                            });
                        }
                    } catch { }
                };

                // Track whether the PDF Settings tab is currently active
                let __pdfTabActive = false;

                // Early default logo set to avoid any visible delay on first load
                try {
                    const profEarly = getStoredProfile();
                    if (!state.pdfCompany && profEarly?.company) state.pdfCompany = String(profEarly.company);
                    if (isMediaPro(state.pdfCompany) || isMediaPro(profEarly?.company)) {
                        const saved = localStorage.getItem('mediaproDefaultLogoDataUrl');
                        if (saved && saved.startsWith('data:image/')) {
                            state.logoDataUrl = saved;
                        } else if (MEDIAPRO_LOGO_BASE64 && MEDIAPRO_LOGO_BASE64.length > 100) {
                            state.logoDataUrl = `data:image/png;base64,${MEDIAPRO_LOGO_BASE64}`;
                        }
                    }
                } catch { }

                // Debounced scheduler to regenerate the PDF preview when appropriate
                const schedulePdfPreview = debounce(() => {
                    try {
                        if (!__pdfTabActive) return; // Only refresh while PDF tab is visible
                        const frame = document.getElementById('pdfPreviewFrame');
                        if (!frame) return;
                        if (!Array.isArray(state.savedCanvases) || state.savedCanvases.length === 0) return;
                        // If a generation is already in progress, allow it to finish; otherwise trigger
                        const container = document.getElementById('pdfPreviewContainer');
                        const isLoading = !!(container && container.classList.contains('loading'));
                        if (isLoading) return;
                        generatePdfPreview();
                    } catch { }
                }, 600);

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
                // Evaluate simple arithmetic expressions entered in numeric inputs without relying on eval/new Function (CSP safe).
                // Supports: + - * /, parentheses, decimals, and relative forms like "+2", "*2", "/2".
                const parseNumericExpression = (raw, baseValue) => {
                    if (raw == null) return NaN;
                    let expr = String(raw).trim();
                    if (!expr) return NaN;
                    expr = expr.replace(/x/gi, '*');
                    if (/^[+\-*/]/.test(expr)) {
                        const base = Number(baseValue);
                        if (!Number.isFinite(base)) return NaN;
                        expr = `${base}${expr}`;
                    }

                    const tokens = [];
                    const pushToken = (type, value) => { tokens.push({ type, value }); };
                    let i = 0;
                    while (i < expr.length) {
                        const ch = expr[i];
                        if (/\s/.test(ch)) { i += 1; continue; }
                        if (ch === '.' || /\d/.test(ch)) {
                            let start = i;
                            let dotCount = (ch === '.') ? 1 : 0;
                            i += 1;
                            while (i < expr.length) {
                                const c = expr[i];
                                if (c === '.') {
                                    dotCount += 1;
                                    if (dotCount > 1) return NaN;
                                    i += 1;
                                    continue;
                                }
                                if (/\d/.test(c)) {
                                    i += 1;
                                    continue;
                                }
                                break;
                            }
                            const numStr = expr.slice(start, i);
                            if (!numStr || numStr === '.') return NaN;
                            const num = Number(numStr);
                            if (!Number.isFinite(num)) return NaN;
                            pushToken('number', num);
                            continue;
                        }
                        if ('+-*/()'.includes(ch)) {
                            pushToken((ch === '(' || ch === ')') ? 'paren' : 'operator', ch);
                            i += 1;
                            continue;
                        }
                        return NaN;
                    }
                    if (!tokens.length) return NaN;

                    let pos = 0;
                    const peek = () => tokens[pos];
                    const consume = () => tokens[pos++];

                    const parseFactor = () => {
                        const token = peek();
                        if (!token) throw new Error('Unexpected end of expression');
                        if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
                            consume();
                            const factor = parseFactor();
                            return token.value === '+' ? factor : -factor;
                        }
                        if (token.type === 'paren' && token.value === '(') {
                            consume();
                            const value = parseExpression();
                            const next = peek();
                            if (!next || next.type !== 'paren' || next.value !== ')') {
                                throw new Error('Missing closing parenthesis');
                            }
                            consume();
                            return value;
                        }
                        if (token.type === 'number') {
                            consume();
                            return token.value;
                        }
                        throw new Error('Unexpected token');
                    };

                    const parseTerm = () => {
                        let value = parseFactor();
                        while (true) {
                            const token = peek();
                            if (!token || token.type !== 'operator' || (token.value !== '*' && token.value !== '/')) break;
                            consume();
                            const rhs = parseFactor();
                            if (token.value === '*') {
                                value *= rhs;
                            } else {
                                if (rhs === 0) throw new Error('Division by zero');
                                value /= rhs;
                            }
                        }
                        return value;
                    };

                    const parseExpression = () => {
                        let value = parseTerm();
                        while (true) {
                            const token = peek();
                            if (!token || token.type !== 'operator' || (token.value !== '+' && token.value !== '-')) break;
                            consume();
                            const rhs = parseTerm();
                            value = token.value === '+' ? value + rhs : value - rhs;
                        }
                        return value;
                    };

                    try {
                        const result = parseExpression();
                        if (pos !== tokens.length) return NaN;
                        return Number.isFinite(result) ? result : NaN;
                    } catch {
                        return NaN;
                    }
                };

                const shouldDeferNumericInput = (raw) => {
                    if (raw == null) return false;
                    const trimmed = String(raw).trim();
                    if (!trimmed) return false;
                    return !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed);
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

                // Adapt canvas text colors for current theme without overriding custom colors.
                // Only flip pure black/white to maintain contrast in dark/light modes.
                const asHex = (c) => (typeof c === 'string' ? c.trim().toLowerCase() : '');
                const ensureThemeContrast = () => {
                    const isDark = !!state.isDarkMode;
                    const toLight = '#ffffff';
                    const toDark = '#000000';
                    if (isDark) {
                        // Keep user's custom text color unchanged; do not auto-flip.
                        if (asHex(state.specificationColor) === '#000000') state.specificationColor = toLight;
                    } else {
                        // Keep user's custom text color unchanged; do not auto-flip.
                        // Specification text is often overlayed; switch back only if it was pure white
                        if (asHex(state.specificationColor) === '#ffffff') state.specificationColor = toDark;
                    }
                };
                try { ensureThemeContrast(); } catch { }

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
                // Initialize panel size inputs
                panelWidthInput.value = String(state.panelWidth);
                panelHeightInput.value = String(state.panelHeight);
                panelPresetCombo.value = '';
                panelResWidthInput.value = state.panelResWidth;
                panelResHeightInput.value = state.panelResHeight;
                
                // Color Settings
                color1Input.value = state.color1;
                color2Input.value = state.color2;
                color2BrightnessToggle.checked = state.isColor2Brighter;
                color2Input.disabled = state.isColor2Brighter;
                // Default Company from profile; lock if MediaPro
                try {
                    const prof = getStoredProfile();
                    if (!state.pdfCompany && prof?.company) state.pdfCompany = String(prof.company);
                    if (pdfCompanyInput) {
                        pdfCompanyInput.value = state.pdfCompany || '';
                        const isMP = isMediaPro((prof?.company || state.pdfCompany || '').trim());
                        if (isMP) {
                            pdfCompanyInput.setAttribute('readonly', 'true');
                            pdfCompanyInput.classList.add('readonly');
                            pdfCompanyInput.title = 'Managed by your company';
                            try { const hint = document.getElementById('pdfCompanyHint'); if (hint) hint.style.display = ''; } catch { }
                        } else {
                            pdfCompanyInput.removeAttribute('readonly');
                            pdfCompanyInput.classList.remove('readonly');
                            pdfCompanyInput.removeAttribute('title');
                            try { const hint = document.getElementById('pdfCompanyHint'); if (hint) hint.style.display = 'none'; } catch { }
                        }
                    }
                    // Reorder after initial lock evaluation
                    reorderPdfFieldsForMediaPro();
                } catch { }
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
                if (pdfCompanyInput) pdfCompanyInput.value = (state.pdfCompany || '').toUpperCase();

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
                pdfFilenameInput.value = (state.pdfFilename || '').toUpperCase();
                pdfProjectNameInput.value = (state.pdfProjectName || '').toUpperCase();
                pdfVenueInput.value = (state.pdfVenue || '').toUpperCase();
                if (pdfProjectDateInput) pdfProjectDateInput.value = state.pdfProjectDate || '';
                if (pdfJobNoInput) pdfJobNoInput.value = (state.pdfJobNo || '').toUpperCase();
                // If Drawn By is empty, default to profile name (local/cloud)
                try {
                    if (!state.pdfDrawnBy) {
                        const prof = getStoredProfile();
                        if (prof && prof.name) state.pdfDrawnBy = String(prof.name).toUpperCase();
                    }
                } catch { }
                pdfDrawnByInput.value = (state.pdfDrawnBy || '').toUpperCase();
                pdfSalesInput.value = (state.pdfSales || '').toUpperCase();
                pdfClientInput.value = (state.pdfClient || '').toUpperCase();
                pdfUnitInput.value = (state.pdfUnit || '').toUpperCase();
                pdfEmailInput.value = (state.pdfEmail || '').toUpperCase();
                pdfIncludeCanvasSnapshotToggle.textContent = state.pdfIncludeCanvasSnapshot ? 'On' : 'Off';
                if (state.logoDataUrl && state.logoDataUrl.length > 100) { // Simple check if it's not the placeholder
                    logoPreview.src = state.logoDataUrl;
                    logoPreview.classList.remove('d-none');
                } else {
                    logoPreview.classList.add('d-none');
                }
                if (logoUrlInput) logoUrlInput.value = state.logoUrl || '';
                if (logoBase64Input) logoBase64Input.value = state.logoBase64 || '';

                // Auto-apply default logo for MediaPro if needed
                ensureDefaultLogoForCompany();
                enforceCompanyLogoPolicy();

                // View Options
                // Default Validation Email from Profile email
                try {
                    const profLocal = getStoredProfile();
                    if (!state.pdfEmail && profLocal?.email) state.pdfEmail = String(profLocal.email);
                } catch { }
                if (pdfEmailInput) pdfEmailInput.value = state.pdfEmail || '';
                // Lock Drawn By and Validation Email when company is MediaPro
                let lockPdfPersonal = false;
                try {
                    const profLocal = getStoredProfile();
                    lockPdfPersonal = isMediaPro((profLocal?.company || state.pdfCompany || '').trim());
                } catch {
                    lockPdfPersonal = isMediaPro((state.pdfCompany || '').trim());
                }
                if (lockPdfPersonal) {
                    if (pdfDrawnByInput) {
                        pdfDrawnByInput.setAttribute('readonly', 'true');
                        pdfDrawnByInput.classList.add('readonly');
                        pdfDrawnByInput.title = 'Managed by your company';
                        try { const hint = document.getElementById('pdfDrawnByHint'); if (hint) hint.style.display = ''; } catch { }
                    }
                    if (pdfEmailInput) {
                        pdfEmailInput.setAttribute('readonly', 'true');
                        pdfEmailInput.classList.add('readonly');
                        pdfEmailInput.title = 'Managed by your company';
                        try { const hint = document.getElementById('pdfEmailHint'); if (hint) hint.style.display = ''; } catch { }
                    }
                } else {
                    if (pdfDrawnByInput) {
                        pdfDrawnByInput.removeAttribute('readonly');
                        pdfDrawnByInput.classList.remove('readonly');
                        pdfDrawnByInput.removeAttribute('title');
                        try { const hint = document.getElementById('pdfDrawnByHint'); if (hint) hint.style.display = 'none'; } catch { }
                    }
                    if (pdfEmailInput) {
                        pdfEmailInput.removeAttribute('readonly');
                        pdfEmailInput.classList.remove('readonly');
                        pdfEmailInput.removeAttribute('title');
                        try { const hint = document.getElementById('pdfEmailHint'); if (hint) hint.style.display = 'none'; } catch { }
                    }
                }
                // Ensure ordering reflects current policy
                reorderPdfFieldsForMediaPro();
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
                // Reflect canvas background color control if present
                try { const el = document.getElementById('canvasBgColorInput'); if (el) el.value = state.canvasBgColor || '#000000'; } catch { }
                // pdfEmailInput.value set above
                updateObjectPropertiesPanel();
                // Keep the PixelMap bottom gallery in sync with state
                if (typeof renderPixelMapSentGallery === 'function') renderPixelMapSentGallery();
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
                state.pdfFilename = 'CANVASMAP_DETAILS';
                state.pdfProjectName = '';
                state.pdfJobNo = '';
                state.pdfVenue = '';
                state.pdfDrawnBy = '';
                state.pdfSales = '';
                state.pdfClient = '';
                state.pdfUnit = '';
                state.pdfEmail = '';
                state.pdfCompany = '';
                state.pdfIncludeCanvasSnapshot = false;
                state.logoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
                isDraggingCanvasMapObject = false;
                selectedCanvasMapObject = null;
                state.removedPanels.clear();
                state.hoveredPanelCoords = null;

                // Update UI from the reset state (sentScreens stay persisted)
                updateUIFromState();
                
                // Re-render everything
                renderImportedMapsGallery();
                if (typeof renderPixelMapSentGallery === 'function') renderPixelMapSentGallery();
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
                state.pdfPreviewDirty = true; schedulePdfPreview();
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
                // Persistence for Stored/Sent maps (single source of truth)
                const STORED_MAPS_KEY = 'pixelMap.storedMaps.v1';
                const saveStoredMaps = () => { try { localStorage.setItem(STORED_MAPS_KEY, JSON.stringify(state.storedPixelMaps || [])); } catch { } };
                const loadStoredMaps = () => { try { const raw = localStorage.getItem(STORED_MAPS_KEY); state.storedPixelMaps = raw ? JSON.parse(raw) : []; } catch { state.storedPixelMaps = []; } };
                // Persistence for Saved Canvases
                const SAVED_CANVASES_KEY = 'canvasMap.savedCanvases.v1';
                const saveSavedCanvases = () => {
                    try {
                        localStorage.setItem(SAVED_CANVASES_KEY, JSON.stringify(state.savedCanvases || []));
                    } catch (e) {
                        console.warn('Saving savedCanvases failed:', e);
                        try { showToast('Could not persist saved canvases (storage full?).', 'danger'); } catch { }
                    }
                };
                const loadSavedCanvases = () => {
                    try {
                        const raw = localStorage.getItem(SAVED_CANVASES_KEY);
                        const parsed = raw ? JSON.parse(raw) : [];
                        state.savedCanvases = Array.isArray(parsed) ? parsed : [];
                    } catch (e) {
                        console.warn('Loading savedCanvases failed:', e);
                        state.savedCanvases = [];
                    }
                };
                // UX: list filter/sort state
                if (state.sentSearchQuery === undefined) state.sentSearchQuery = '';
                if (state.sentSortBy === undefined) state.sentSortBy = 'recent';

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
                    if (!map.dataUrl) { return; }
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
                                // Persist and sync bottom list
                                try { if (typeof saveStoredMaps === 'function') saveStoredMaps(); } catch { }
                                try { if (typeof renderPixelMapSentGallery === 'function') renderPixelMapSentGallery(); } catch { }
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
                        
                        // Persist and sync both lists
                        try { if (typeof saveStoredMaps === 'function') saveStoredMaps(); } catch { }
                        renderImportedMapsGallery();
                        try { if (typeof renderPixelMapSentGallery === 'function') renderPixelMapSentGallery(); } catch { }
                        redrawCanvasMapObjects();
                        try { setCanvasMapEnabled?.((state.storedPixelMaps || []).length > 0); } catch { }
                        // Keep PDF Settings aligned with CanvasMap enablement and saved canvases count
                        try { setPdfSettingsEnabled?.(((state.savedCanvases || []).length > 0) && ((state.storedPixelMaps || []).length > 0)); } catch { }
                        // If list became empty while on CanvasMap, send user to PixelMap
                        try { redirectToPixelMapIfNoSentScreens?.(); } catch { }
                    });
                });
                };

                // --- PixelMap Sent Bottom Gallery ---
                const disposeTooltip = (el) => {
                    if (!el || !window.bootstrap || typeof bootstrap.Tooltip !== 'function') return;
                    try {
                        const instance = bootstrap.Tooltip.getInstance(el);
                        if (!instance) return;
                        if (!instance._activeTrigger || typeof instance._activeTrigger !== 'object') {
                            instance._activeTrigger = { click: false, focus: false, hover: false, manual: false };
                        }
                        instance.dispose();
                    } catch { }
                };

                const renderPixelMapSentGallery = () => {
                    const gallery = document.getElementById('pixelMapSentGallery');
                    const countEl = document.getElementById('pixelMapSentCount');
                    if (!gallery) return;
                    // Dispose any existing tooltips attached to current items before clearing
                    try {
                        const tipEls = gallery.querySelectorAll('[data-bs-toggle="tooltip"]');
                        tipEls.forEach(disposeTooltip);
                    } catch { }
                    gallery.innerHTML = '';

                    const items = state.storedPixelMaps || [];
                    const searchQ = (state.sentSearchQuery || '').trim().toLowerCase();
                    let shown = items.filter(m => {
                        if (!searchQ) return true;
                        const name = (m.filename || '').toLowerCase();
                        const res = m?.details ? `${m.details.resWidth}x${m.details.resHeight}` : '';
                        const panels = m?.details ? `${m.details.panelsWidth}x${m.details.panelsHeight}` : '';
                        return name.includes(searchQ) || res.includes(searchQ) || panels.includes(searchQ);
                    });
                    switch (state.sentSortBy) {
                        case 'name':
                            shown.sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
                            break;
                        case 'res':
                            shown.sort((a, b) => ((b?.details?.resWidth || 0) * (b?.details?.resHeight || 0)) - ((a?.details?.resWidth || 0) * (a?.details?.resHeight || 0)));
                            break;
                        default:
                            // recent by id (timestamp)
                            shown.sort((a, b) => (b.id || 0) - (a.id || 0));
                    }

                    if (countEl) {
                        const total = items.length;
                        const text = searchQ ? `${shown.length} shown Â· ${total} total` : `${total} ${total === 1 ? 'item' : 'items'}`;
                        countEl.textContent = text;
                        countEl.classList.add('badge');
                    }
                    if (items.length === 0) {
                        const empty = document.createElement('div');
                        empty.className = 'text-muted small px-1';
                        empty.textContent = 'No screens sent yet. Click "Send to CanvasMap" to add.';
                        gallery.appendChild(empty);
                        return;
                    }

                    shown.forEach(map => {
                        const item = document.createElement('div');
                        item.className = 'sent-item' + (state.sentActiveId === map.id ? ' active' : '');
                        item.draggable = true;
                        item.dataset.mapId = map.id;
                        item.title = 'Double-click to edit';
                        item.setAttribute('data-bs-toggle', 'tooltip');
                        item.setAttribute('data-bs-placement', 'top');

                        // Thumbnail + badges
                        const thumbWrap = document.createElement('div');
                        thumbWrap.className = 'sent-thumb';
                        const img = document.createElement('img');
                        img.src = map.thumbnailUrl || '';
                        img.alt = map.filename || 'LED screen';
                        thumbWrap.appendChild(img);
                        const badgeWrap = document.createElement('div');
                        badgeWrap.className = 'sent-badges';
                        const resBadge = document.createElement('span');
                        const resTxt = (map?.details?.resWidth && map?.details?.resHeight) ? `${map.details.resWidth}Ã—${map.details.resHeight}` : '';
                        resBadge.className = 'badge-chip';
                        if (resTxt) resBadge.textContent = resTxt;
                        const pnlBadge = document.createElement('span');
                        const pnlTxt = (map?.details?.panelsWidth && map?.details?.panelsHeight) ? `${map.details.panelsWidth}Ã—${map.details.panelsHeight}` : '';
                        pnlBadge.className = 'badge-chip';
                        if (pnlTxt) pnlBadge.textContent = pnlTxt;
                        if (resTxt) badgeWrap.appendChild(resBadge);
                        if (pnlTxt) badgeWrap.appendChild(pnlBadge);
                        thumbWrap.appendChild(badgeWrap);
                        item.appendChild(thumbWrap);

                        const title = document.createElement('div');
                        title.className = 'sent-title';
                        title.textContent = map.filename || 'Untitled';
                        item.appendChild(title);

                        const meta = document.createElement('div');
                        meta.className = 'sent-meta';
                        const res = map?.details?.resWidth && map?.details?.resHeight
                            ? `${map.details.resWidth}Ã—${map.details.resHeight}px`
                            : '';
                        const panels = map?.details?.panelsWidth && map?.details?.panelsHeight
                            ? `${map.details.panelsWidth}Ã—${map.details.panelsHeight} panels`
                            : '';
                        meta.textContent = [res, panels].filter(Boolean).join(' Â· ');
                        item.appendChild(meta);

                        // Actions row: Load / Save / Rename / Delete
                        const actions = document.createElement('div');
                        actions.className = 'sent-actions mt-1';
                        const loadBtn = document.createElement('button');
                        loadBtn.className = 'btn btn-primary btn-sm';
                        loadBtn.textContent = 'Load';
                        loadBtn.title = 'Load this screen into PixelMap for editing';
                        loadBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            // Hide tooltip if visible
                            disposeTooltip(item);
                            loadSentMapForEdit(map);
                            // Set active highlight
                            state.sentActiveId = map.id;
                            gallery.querySelectorAll('.sent-item').forEach(el => el.classList.remove('active'));
                            item.classList.add('active');
                        });
                        // Save current PixelMap into this stored item
                        const saveBtn = document.createElement('button');
                        saveBtn.className = 'btn btn-success btn-sm';
                        saveBtn.textContent = 'Save';
                        saveBtn.title = 'Save current PixelMap changes to this item';
                        saveBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            disposeTooltip(item);

                            // Temporarily hide selection rectangle for saving
                            const currentSelection = state.selectionRect;
                            state.selectionRect = null;
                            redrawDrawingOverlay();

                            // Combine PixelMap base and overlay
                            const combinedCanvas = document.createElement('canvas');
                            combinedCanvas.width = state.totalResWidth;
                            combinedCanvas.height = state.totalResHeight;
                            const combinedCtx = combinedCanvas.getContext('2d', { alpha: true });
                            combinedCtx.drawImage(pixelMapCanvas, 0, 0);
                            combinedCtx.drawImage(drawingOverlayCanvas, 0, 0);

                            // Restore selection rectangle
                            state.selectionRect = currentSelection;
                            redrawDrawingOverlay();

                            // Build full image and thumbnail
                            const dataUrl = combinedCanvas.toDataURL('image/png');
                            const thumbCanvas = document.createElement('canvas');
                            const maxThumbW = 200;
                            const scaleThumb = Math.min(1, maxThumbW / combinedCanvas.width);
                            thumbCanvas.width = Math.max(1, Math.round(combinedCanvas.width * scaleThumb));
                            thumbCanvas.height = Math.max(1, Math.round(combinedCanvas.height * scaleThumb));
                            thumbCanvas.getContext('2d', { alpha: true }).drawImage(combinedCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
                            const thumbUrl = thumbCanvas.toDataURL('image/png');

                            // Compute details
                            let numPanelsWidth, numPanelsHeight;
                            if (state.isPanelCountMode) {
                                numPanelsWidth = state.panelsInWidth;
                                numPanelsHeight = state.panelsInHeight;
                            } else {
                                const screenWidthBase = convertUnits(state.screenWidth, state.unit, 'meter');
                                const screenHeightBase = convertUnits(state.screenHeight, state.unit, 'meter');
                                const panelWidthBase = state.panelWidth;
                                const panelHeightBase = state.panelHeight;
                                numPanelsWidth = Math.floor(screenWidthBase / panelWidthBase);
                                numPanelsHeight = Math.floor(screenHeightBase / panelHeightBase);
                            }

                            // Update map object in-place
                            map.dataUrl = dataUrl;
                            map.thumbnailUrl = thumbUrl;
                            map.width = state.totalResWidth;
                            map.height = state.totalResHeight;
                            map.details = {
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
                            };
                            map.pixelMapState = {
                                unit: state.unit,
                                screenWidth: state.screenWidth,
                                screenHeight: state.screenHeight,
                                isPanelCountMode: state.isPanelCountMode,
                                panelsInWidth: state.panelsInWidth,
                                panelsInHeight: state.panelsInHeight,
                                panelWidth: state.panelWidth,
                                panelHeight: state.panelHeight,
                                panelResWidth: state.panelResWidth,
                                panelResHeight: state.panelResHeight,
                                color1: state.color1,
                                color2: state.color2,
                                isColor2Brighter: state.isColor2Brighter,
                                outlineEnabled: state.outlineEnabled,
                                outlineColor: state.outlineColor,
                                outlineSize: state.outlineSize,
                                rasterEnabled: state.rasterEnabled,
                                rasterColor: state.rasterColor,
                                rasterSize: state.rasterSize,
                                circleEffectEnabled: state.circleEffectEnabled,
                                circleEffectColor: state.circleEffectColor,
                                circleEffectSize: state.circleEffectSize,
                                circleEffectThickness: state.circleEffectThickness,
                                crossLineEffectEnabled: state.crossLineEffectEnabled,
                                crossLineColor: state.crossLineColor,
                                crossLineSize: state.crossLineSize,
                                numberingEnabled: state.numberingEnabled,
                                numberingFormat: state.numberingFormat,
                                numberingPosition: state.numberingPosition,
                                numberingSize: state.numberingSize,
                                numberingColor: state.numberingColor,
                                customTextEnabled: state.customTextEnabled,
                                customText: state.customText,
                                customTextSize: state.customTextSize,
                                customTextColor: state.customTextColor,
                                customTextX: state.customTextX,
                                customTextY: state.customTextY,
                                customTextPositionManuallySet: state.customTextPositionManuallySet,
                                customTextBgEnabled: state.customTextBgEnabled,
                                customTextBgColor: state.customTextBgColor,
                                customTextBgOpacity: state.customTextBgOpacity,
                                specificationEnabled: state.specificationEnabled,
                                specificationColor: state.specificationColor,
                                specificationSize: state.specificationSize,
                                specificationX: state.specificationX,
                                specificationY: state.specificationY,
                                specificationFormat: state.specificationFormat,
                                specificationBgEnabled: state.specificationBgEnabled,
                                specificationBgColor: state.specificationBgColor,
                                oneLineText: state.oneLineText,
                                removedPanels: Array.from(state.removedPanels || []),
                            };

                            // Propagate updates to any CanvasMap instances referencing this source
                            try {
                                (state.canvasMapObjects || []).forEach(obj => {
                                    if (obj.sourceId === map.id) {
                                        obj.dataUrl = dataUrl;
                                        obj.width = map.width;
                                        obj.height = map.height;
                                        obj.details = map.details;
                                        obj.filename = map.filename;
                                        const img = new Image();
                                        img.onload = () => { obj.image = img; redrawCanvasMapObjects(); };
                                        img.src = dataUrl;
                                    }
                                });
                            } catch { }

                            saveStoredMaps();
                            renderPixelMapSentGallery();
                            renderImportedMapsGallery();
                            redrawCanvasMapObjects();
                            showToast('Saved changes to this item.', 'success');
                        });
                        const renameBtn = document.createElement('button');
                        renameBtn.className = 'btn btn-secondary btn-sm';
                        renameBtn.textContent = 'Rename';
                        renameBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                                disposeTooltip(item);
                            const current = map.filename || '';
                            const newName = prompt('Rename screen', current);
                            if (newName && newName.trim()) {
                                map.filename = newName.trim();
                                try { state.canvasMapObjects.forEach(obj => { if (obj.sourceId === map.id) obj.filename = map.filename; }); } catch { }
                                saveStoredMaps();
                                renderPixelMapSentGallery();
                                renderImportedMapsGallery();
                            }
                        });
                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'btn btn-danger btn-sm';
                        deleteBtn.textContent = 'Delete';
                        deleteBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const ok = await showConfirm({
                                title: 'Delete saved screen?',
                                text: 'This removes it from the list only. Your CanvasMap items stay intact.',
                                okText: 'Delete',
                                cancelText: 'Cancel',
                                okVariant: 'danger'
                            });
                            if (ok) {
                                // Dispose tooltip for this item to avoid lingering hover bubble
                                try { const t = bootstrap.Tooltip.getInstance(item); if (t) t.dispose(); } catch { }
                                state.storedPixelMaps = (state.storedPixelMaps || []).filter(s => s.id !== map.id);
                                state.canvasMapObjects = (state.canvasMapObjects || []).filter(obj => obj.sourceId !== map.id);
                                saveStoredMaps();
                                renderPixelMapSentGallery();
                                renderImportedMapsGallery();
                                redrawCanvasMapObjects();
                                try { setCanvasMapEnabled?.((state.storedPixelMaps || []).length > 0); } catch { }
                                try { setPdfSettingsEnabled?.(((state.savedCanvases || []).length > 0) && ((state.storedPixelMaps || []).length > 0)); } catch { }
                                try { redirectToPixelMapIfNoSentScreens?.(); } catch { }
                            }
                        });
                        actions.appendChild(loadBtn);
                        actions.appendChild(saveBtn);
                        actions.appendChild(renameBtn);
                        actions.appendChild(deleteBtn);
                        item.appendChild(actions);

                        item.addEventListener('click', () => {
                            state.sentActiveId = map.id;
                            // Toggle active state visually
                            gallery.querySelectorAll('.sent-item').forEach(el => el.classList.remove('active'));
                            item.classList.add('active');
                        });
                        item.addEventListener('dblclick', () => {
                            loadSentMapForEdit(map);
                        });

                        // Drag support: allow dragging item to PixelMap canvas to re-edit on drop
                        item.addEventListener('dragstart', (e) => {
                            e.dataTransfer.setData('text/plain', String(map.id));
                            e.dataTransfer.effectAllowed = 'copy';
                        });

                        gallery.appendChild(item);
                        try { bootstrap.Tooltip.getOrCreateInstance(item, { container: 'body' }); } catch { }
                    });
                };

                // Save/Load list actions (bottom gallery)
                const saveSentListBtn = document.getElementById('saveSentListBtn');
                const loadSentListBtn = document.getElementById('loadSentListBtn');
                const loadSentListInput = document.getElementById('loadSentListInput');
                if (saveSentListBtn) {
                    saveSentListBtn.addEventListener('click', () => {
                        try {
                            const data = JSON.stringify(state.storedPixelMaps || [], null, 2);
                            const blob = new Blob([data], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'screens_list.json';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        } catch (e) { console.warn('Save list failed:', e); }
                    });
                }
                if (loadSentListBtn && loadSentListInput) {
                    loadSentListBtn.addEventListener('click', () => loadSentListInput.click());
                    loadSentListInput.addEventListener('change', (e) => {
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => {
                            try {
                                const parsed = JSON.parse(reader.result);
                                if (!Array.isArray(parsed)) throw new Error('Invalid list format');
                                // Basic shape clean-up: ensure required keys
                                state.storedPixelMaps = parsed.filter(x => x && typeof x === 'object' && x.id && (x.dataUrl || x.thumbnailUrl));
                                saveStoredMaps?.();
                                renderImportedMapsGallery();
                                renderPixelMapSentGallery();
                                redrawCanvasMapObjects();
                                try { setCanvasMapEnabled?.((state.storedPixelMaps || []).length > 0); } catch { }
                                try { setPdfSettingsEnabled?.(((state.savedCanvases || []).length > 0) && ((state.storedPixelMaps || []).length > 0)); } catch { }
                                showToast('Loaded screens list.', 'success');
                            } catch (err) {
                                console.error('Load list failed:', err);
                                showMessageBox('Failed to load list. Ensure it is a JSON array exported from this app.');
                                try { setCanvasMapEnabled?.((state.storedPixelMaps || []).length > 0); } catch { }
                                try { setPdfSettingsEnabled?.(((state.savedCanvases || []).length > 0) && ((state.storedPixelMaps || []).length > 0)); } catch { }
                            }
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                    });
                }

                // --- UX controls for Sent gallery ---
                const sentSearchInput = document.getElementById('sentSearchInput');
                const sentSortSelect = document.getElementById('sentSortSelect');
                const clearSentListBtn = document.getElementById('clearSentListBtn');
                if (sentSearchInput) {
                    sentSearchInput.value = state.sentSearchQuery || '';
                    sentSearchInput.addEventListener('input', (e) => {
                        state.sentSearchQuery = e.target.value;
                        renderPixelMapSentGallery();
                    });
                }
                if (sentSortSelect) {
                    sentSortSelect.value = state.sentSortBy || 'recent';
                    sentSortSelect.addEventListener('change', (e) => {
                        state.sentSortBy = e.target.value;
                        renderPixelMapSentGallery();
                    });
                }
                if (clearSentListBtn) {
                    clearSentListBtn.addEventListener('click', async () => {
                        const ok = await showConfirm({
                            title: 'Clear all saved screens?',
                            text: 'This removes all items from the list. CanvasMap objects already placed are not affected.',
                            okText: 'Clear all',
                            cancelText: 'Cancel',
                            okVariant: 'danger'
                        });
                        if (!ok) return;
                        state.storedPixelMaps = [];
                        saveStoredMaps?.();
                        renderImportedMapsGallery();
                        renderPixelMapSentGallery();
                        redrawCanvasMapObjects();
                        try { setCanvasMapEnabled?.(false); } catch { }
                        // If CanvasMap is disabled, PDF Settings must also be disabled regardless of saved canvases
                        try { setPdfSettingsEnabled?.(false); } catch { }
                        // If user is on CanvasMap, redirect them to PixelMap to create a new screen
                        try { redirectToPixelMapIfNoSentScreens?.(); } catch { }
                    });
                }

                // Scroll shadows on the horizontal gallery
                const attachScrollShadows = () => {
                    const g = document.getElementById('pixelMapSentGallery');
                    if (!g) return;
                    const updateShadows = () => {
                        const left = g.scrollLeft > 0;
                        const right = Math.ceil(g.scrollLeft + g.clientWidth) < g.scrollWidth;
                        g.classList.toggle('has-left-shadow', left);
                        g.classList.toggle('has-right-shadow', right);
                    };
                    g.addEventListener('scroll', updateShadows);
                    const ro = new ResizeObserver(updateShadows);
                    try { ro.observe(g); } catch { }
                    updateShadows();
                };
                attachScrollShadows();

                // --- Saved Canvases controls wiring ---
                if (state.savedSearchQuery === undefined) state.savedSearchQuery = '';
                if (state.savedSortBy === undefined) state.savedSortBy = 'recent';
                const savedSearchInput = document.getElementById('savedSearchInput');
                const savedSortSelect = document.getElementById('savedSortSelect');
                const clearSavedListBtn = document.getElementById('clearSavedListBtn');
                if (savedSearchInput) {
                    savedSearchInput.value = state.savedSearchQuery;
                    savedSearchInput.addEventListener('input', (e) => { state.savedSearchQuery = e.target.value; renderSavedCanvases(); });
                }
                if (savedSortSelect) {
                    savedSortSelect.value = state.savedSortBy;
                    savedSortSelect.addEventListener('change', (e) => { state.savedSortBy = e.target.value; renderSavedCanvases(); });
                }
                if (clearSavedListBtn) {
                    clearSavedListBtn.addEventListener('click', async () => {
                        const ok = await showConfirm({ title: 'Clear all saved canvases?', text: 'This removes all saved layouts from this list. This does not change the current canvas.', okText: 'Clear all', cancelText: 'Cancel', okVariant: 'danger' });
                        if (!ok) return;
                        state.savedCanvases = [];
                        try { saveSavedCanvases?.(); } catch { }
                        renderSavedCanvases();
                        // Disable PDF Settings when no saved canvases remain
                        try { setPdfSettingsEnabled?.(false); } catch { }
                    });
                }

                const loadSentMapForEdit = (map) => {
                    let snap = map?.pixelMapState;
                    if (!snap) {
                        // Fallback reconstruction for older items without snapshot
                        const d = map?.details || {};
                        const pw = Math.max(1, parseInt(d.panelsWidth || 0, 10) || 0);
                        const ph = Math.max(1, parseInt(d.panelsHeight || 0, 10) || 0);
                        const rw = parseInt(d.resWidth || 0, 10) || 0;
                        const rh = parseInt(d.resHeight || 0, 10) || 0;
                        const prw = (pw > 0 && rw > 0) ? Math.max(1, Math.round(rw / pw)) : state.panelResWidth;
                        const prh = (ph > 0 && rh > 0) ? Math.max(1, Math.round(rh / ph)) : state.panelResHeight;
                        if (!pw || !ph) {
                            showMessageBox('This item has no editable snapshot. Please resend it once from PixelMap to enable editing.');
                            return;
                        }
                        snap = {
                            unit: state.unit,
                            isPanelCountMode: true,
                            panelsInWidth: pw,
                            panelsInHeight: ph,
                            panelResWidth: prw,
                            panelResHeight: prh,
                            // Keep current visual settings as defaults
                            panelWidth: state.panelWidth,
                            panelHeight: state.panelHeight,
                            screenWidth: state.screenWidth,
                            screenHeight: state.screenHeight,
                            color1: state.color1,
                            color2: state.color2,
                            isColor2Brighter: state.isColor2Brighter,
                            outlineEnabled: state.outlineEnabled,
                            outlineColor: state.outlineColor,
                            outlineSize: state.outlineSize,
                            rasterEnabled: state.rasterEnabled,
                            rasterColor: state.rasterColor,
                            rasterSize: state.rasterSize,
                            circleEffectEnabled: state.circleEffectEnabled,
                            circleEffectColor: state.circleEffectColor,
                            circleEffectSize: state.circleEffectSize,
                            circleEffectThickness: state.circleEffectThickness,
                            crossLineEffectEnabled: state.crossLineEffectEnabled,
                            crossLineColor: state.crossLineColor,
                            crossLineSize: state.crossLineSize,
                            numberingEnabled: state.numberingEnabled,
                            numberingFormat: state.numberingFormat,
                            numberingPosition: state.numberingPosition,
                            numberingSize: state.numberingSize,
                            numberingColor: state.numberingColor,
                            customTextEnabled: state.customTextEnabled,
                            customText: state.customText,
                            customTextSize: state.customTextSize,
                            customTextColor: state.customTextColor,
                            customTextBgEnabled: state.customTextBgEnabled,
                            customTextBgColor: state.customTextBgColor,
                            customTextBgOpacity: state.customTextBgOpacity,
                            specificationEnabled: state.specificationEnabled,
                            specificationColor: state.specificationColor,
                            specificationSize: state.specificationSize,
                            specificationX: state.specificationX,
                            specificationY: state.specificationY,
                            specificationFormat: state.specificationFormat,
                            specificationBgEnabled: state.specificationBgEnabled,
                            specificationBgColor: state.specificationBgColor,
                            oneLineText: state.oneLineText,
                            removedPanels: []
                        };
                    }
                    // Apply snapshot to current state
                    const assignIfDefined = (k) => { if (snap[k] !== undefined) state[k] = snap[k]; };
                    [
                        'unit', 'screenWidth', 'screenHeight', 'isPanelCountMode', 'panelsInWidth', 'panelsInHeight',
                        'panelWidth', 'panelHeight', 'panelResWidth', 'panelResHeight',
                        'color1', 'color2', 'isColor2Brighter',
                        'outlineEnabled', 'outlineColor', 'outlineSize',
                        'rasterEnabled', 'rasterColor', 'rasterSize',
                        'circleEffectEnabled', 'circleEffectColor', 'circleEffectSize', 'circleEffectThickness',
                        'crossLineEffectEnabled', 'crossLineColor', 'crossLineSize',
                        'numberingEnabled', 'numberingFormat', 'numberingPosition', 'numberingSize', 'numberingColor',
                        'customTextEnabled', 'customText', 'customTextSize', 'customTextColor', 'customTextX', 'customTextY',
                        'customTextBgEnabled', 'customTextBgColor', 'customTextBgOpacity',
                        'specificationEnabled', 'specificationColor', 'specificationSize', 'specificationX', 'specificationY', 'specificationFormat',
                        'specificationBgEnabled', 'specificationBgColor', 'oneLineText'
                    ].forEach(assignIfDefined);
                    // Restore removed panels set
                    try { state.removedPanels = new Set(Array.isArray(snap.removedPanels) ? snap.removedPanels : []); } catch { state.removedPanels = new Set(); }

                    // Reset some derived/manual flags sensibly
                    state.circleEffectSizeManuallySet = true;
                    state.customTextSizeManuallySet = true;
                    state.specificationSizeManuallySet = true;
                    state.specificationPositionManuallySet = true;

                    const hasSavedCustomTextPosition = (snap.customTextX !== undefined && snap.customTextY !== undefined);
                    if (hasSavedCustomTextPosition) {
                        state.customTextX = snap.customTextX;
                        state.customTextY = snap.customTextY;
                        state.customTextPositionManuallySet = snap.customTextPositionManuallySet !== undefined
                            ? !!snap.customTextPositionManuallySet
                            : true;
                    } else {
                        state.customTextX = null;
                        state.customTextY = null;
                        state.customTextPositionManuallySet = false;
                    }

                    // Sync UI and redraw
                    updateUIFromState();
                    updatePixelMap();
                    showToast(`Loaded "${map.filename || 'screen'}" for editing.`, 'success');
                };
                
            // --- Saved Canvas Functions ---
            
            /**
             * Renders the gallery of saved canvas layouts.
             */
            const renderSavedCanvases = () => {
                const gallery = document.getElementById('savedCanvasesGallery');
                if (!gallery) return;
                gallery.innerHTML = '';

                const searchQ = (state.savedSearchQuery || '').trim().toLowerCase();
                let items = Array.isArray(state.savedCanvases) ? [...state.savedCanvases] : [];
                if (searchQ) items = items.filter(c => (c.name || '').toLowerCase().includes(searchQ));
                switch (state.savedSortBy || 'recent') {
                    case 'name': items.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
                    case 'count': items.sort((a, b) => (b.objects?.length || 0) - (a.objects?.length || 0)); break;
                    default: items.sort((a, b) => (b.id || 0) - (a.id || 0));
                }

                const countEl = document.getElementById('savedCanvasesCount');
                if (countEl) countEl.textContent = (state.savedCanvases?.length || 0) + (searchQ ? ` shown ${items.length}/${state.savedCanvases.length}` : ' items');

                if (items.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'text-muted small px-1';
                    empty.textContent = 'No canvases saved yet.';
                    gallery.appendChild(empty);
                    return;
                }

                items.forEach(savedCanvas => {
                    const card = document.createElement('div');
                    card.className = 'saved-card';

                    const thumb = document.createElement('div');
                    thumb.className = 'saved-thumb';
                    const img = document.createElement('img');
                    img.src = savedCanvas.thumbnailUrl;
                    img.alt = savedCanvas.name;
                    thumb.appendChild(img);
                    card.appendChild(thumb);

                    const nameRow = document.createElement('div');
                    const nameLabel = document.createElement('div');
                    nameLabel.className = 'saved-title';
                    nameLabel.textContent = savedCanvas.name;
                    const renameInput = document.createElement('input');
                    renameInput.type = 'text';
                    renameInput.className = 'form-control form-control-sm';
                    renameInput.value = savedCanvas.name;
                    renameInput.style.display = 'none';
                    nameRow.appendChild(nameLabel);
                    nameRow.appendChild(renameInput);
                    card.appendChild(nameRow);

                    const actions = document.createElement('div');
                    actions.className = 'saved-actions';
                    const loadBtn = document.createElement('button'); loadBtn.className = 'btn btn-primary btn-sm'; loadBtn.textContent = 'Load'; loadBtn.onclick = () => loadCanvasState(savedCanvas.id);
                    const updateBtn = document.createElement('button'); updateBtn.className = 'btn btn-success btn-sm'; updateBtn.textContent = 'Update'; updateBtn.title = 'Update this saved canvas with the current CanvasMap'; updateBtn.onclick = () => updateSavedCanvas(savedCanvas.id);
                    const exportBtn = document.createElement('button'); exportBtn.className = 'btn btn-secondary btn-sm'; exportBtn.textContent = 'Export'; exportBtn.onclick = () => exportSavedCanvas(savedCanvas.id);
                    const dupBtn = document.createElement('button'); dupBtn.className = 'btn btn-secondary btn-sm'; dupBtn.textContent = 'Duplicate'; dupBtn.onclick = () => duplicateSavedCanvas(savedCanvas.id);
                    const renBtn = document.createElement('button'); renBtn.className = 'btn btn-secondary btn-sm'; renBtn.textContent = 'Rename'; renBtn.onclick = () => { nameLabel.style.display = 'none'; renameInput.style.display = 'block'; renameInput.focus(); };
                    const delBtn = document.createElement('button'); delBtn.className = 'btn btn-danger btn-sm'; delBtn.textContent = 'Delete'; delBtn.onclick = async () => {
                        const ok = await showConfirm({ title: 'Delete saved canvas?', text: 'This only removes it from the list.', okText: 'Delete', cancelText: 'Cancel', okVariant: 'danger' });
                        if (!ok) return; deleteSavedCanvas(savedCanvas.id);
                    };
                    actions.appendChild(loadBtn);
                    actions.appendChild(updateBtn);
                    actions.appendChild(exportBtn);
                    actions.appendChild(dupBtn);
                    actions.appendChild(renBtn);
                    actions.appendChild(delBtn);
                    card.appendChild(actions);

                    const finishRename = () => {
                        const newName = renameInput.value.trim();
                        if (newName && newName !== savedCanvas.name) {
                            const c = state.savedCanvases.find(x => x.id === savedCanvas.id);
                            if (c) c.name = newName;
                            nameLabel.textContent = newName;
                            if (state.currentCanvasId === savedCanvas.id) { state.customText = newName; updatePixelMap(); updateCanvasMap(); }
                            try { saveSavedCanvases?.(); } catch { }
                        }
                        renameInput.style.display = 'none';
                        nameLabel.style.display = 'block';
                    };
                    renameInput.addEventListener('blur', finishRename);
                    renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') finishRename(); });

                    gallery.appendChild(card);
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
                    try { state.pdfPageOrder = Array.from({ length: state.canvasMapObjects.length }, (_, i) => i); } catch { }
                    try { buildPdfPageSidebar?.(); } catch { }
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
                try { saveSavedCanvases?.(); } catch { }
                renderSavedCanvases();
                // Re-evaluate PDF Settings availability after deletion
                try { setPdfSettingsEnabled?.(Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0); } catch { }
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
                try { saveSavedCanvases?.(); } catch { }
                try { state.pdfPageOrder = Array.from({ length: state.canvasMapObjects.length }, (_, i) => i); } catch { }
                try { buildPdfPageSidebar?.(); } catch { }
                // Ensure PDF Settings is enabled since we now have at least one saved canvas
                try { setPdfSettingsEnabled?.(true); } catch { }
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

                /**
                 * Updates a saved canvas with the current CanvasMap state (objects + thumbnail).
                 */
                const updateSavedCanvas = (canvasId) => {
                    const entry = state.savedCanvases.find(c => c.id === canvasId);
                    if (!entry) return;
                    // Snapshot current CanvasMap objects
                    const updatedObjects = JSON.parse(JSON.stringify(state.canvasMapObjects || []));
                    // Build fresh thumbnail from current export canvas
                    const thumbnailCanvas = document.createElement('canvas');
                    const thumbSize = 120;
                    const aspectRatio = (canvasMapCanvas.width || 1) / (canvasMapCanvas.height || 1);
                    thumbnailCanvas.width = thumbSize;
                    thumbnailCanvas.height = Math.max(1, Math.round(thumbSize / aspectRatio));
                    const thumbCtx = thumbnailCanvas.getContext('2d');
                    const exportCanvasEl = createExportCanvas(true);
                    thumbCtx.drawImage(exportCanvasEl, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
                    const newThumbUrl = thumbnailCanvas.toDataURL('image/jpeg', 0.8);

                    entry.objects = updatedObjects;
                    entry.thumbnailUrl = newThumbUrl;
                    try { saveSavedCanvases?.(); } catch { }
                    renderSavedCanvases();
                    try { showToast('Saved canvas updated with current layout.', 'success'); } catch { }
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
                    // If Drawn By is empty or previously matched the old profile name, sync it from profile name
                    try {
                        const prevName = state.pdfDrawnBy;
                        if (!prevName || prevName === (getStoredProfile().name || '')) {
                            state.pdfDrawnBy = (data.name || '').toUpperCase();
                            if (pdfDrawnByInput) pdfDrawnByInput.value = state.pdfDrawnBy;
                            state.pdfPreviewDirty = true; schedulePdfPreview();
                        }
                        // Sync Company default and lock (only if empty or matched previous)
                        const prevCompany = state.pdfCompany;
                        if (!prevCompany || prevCompany === (getStoredProfile().company || '')) {
                            state.pdfCompany = (data.company || '').toUpperCase();
                            if (pdfCompanyInput) pdfCompanyInput.value = state.pdfCompany;
                            if (typeof enforcePdfCompanyLock === 'function') enforcePdfCompanyLock();
                            state.pdfPreviewDirty = true; schedulePdfPreview();
                        } else {
                            if (typeof enforcePdfCompanyLock === 'function') enforcePdfCompanyLock();
                        }
                        // Enforce default logo if MediaPro and no custom logo
                        ensureDefaultLogoForCompany();
                        // Always sync Validation Email from Profile email when saved (uppercase for consistency)
                        state.pdfEmail = (data.email || '').toUpperCase();
                        if (pdfEmailInput) pdfEmailInput.value = state.pdfEmail;
                        // When company is MediaPro in Profile, lock Drawn By and Validation Email
                        const isMP = /^(?i:mediapro)$/i.test((data.company || '').trim());
                        if (isMP) {
                            if (pdfDrawnByInput) { pdfDrawnByInput.setAttribute('readonly', 'true'); pdfDrawnByInput.classList.add('readonly'); }
                            if (pdfEmailInput) { pdfEmailInput.setAttribute('readonly', 'true'); pdfEmailInput.classList.add('readonly'); }
                        } else {
                            if (pdfDrawnByInput) { pdfDrawnByInput.removeAttribute('readonly'); pdfDrawnByInput.classList.remove('readonly'); }
                            if (pdfEmailInput) { pdfEmailInput.removeAttribute('readonly'); pdfEmailInput.classList.remove('readonly'); }
                        }
                    } catch { }
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
                    enforceEmailReadonly();
                    enforceCompanyField();
                    if (pdfCompanyInput) { pdfCompanyInput.value = ''; pdfCompanyInput.removeAttribute('readonly'); pdfCompanyInput.classList.remove('readonly'); }
                });
            }

            // Login modal wiring
            const emailLoginFormModal = document.getElementById('emailLoginFormModal');
            const loginEmailInput = document.getElementById('loginEmailInput');
            const loginPasswordInput = document.getElementById('loginPasswordInput');
            const googleLoginBtnModal = document.getElementById('googleLoginBtnModal');
            const LAST_PROMPT_KEY = 'authPromptAt';
            let requireLoginUntilAuth = false; // will be set based on auth state

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
                // Mark that login is complete before hiding to avoid any re-open logic
                requireLoginUntilAuth = false;
                // Close the login modal and enable profile
                const modalEl = document.getElementById('loginModal');
                if (modalEl) {
                    const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                    inst.hide();
                }
                setPromptStamp();
            };

                // ---- Friendly auth error mapping and UI helpers ----
                const mapAuthError = (err) => {
                    const code = err?.code || '';
                    switch (code) {
                        case 'auth/invalid-credential':
                        case 'auth/wrong-password':
                            return 'Incorrect email or password. Please try again.';
                        case 'auth/user-disabled':
                            return 'This account has been disabled. Please contact support.';
                        case 'auth/too-many-requests':
                            return 'Too many attempts. Please wait a moment and try again.';
                        case 'auth/network-request-failed':
                            return 'Network error. Check your connection and try again.';
                        case 'auth/invalid-email':
                            return 'Please enter a valid email address.';
                        case 'auth/popup-closed-by-user':
                            return 'Sign-in was canceled.';
                        case 'auth/popup-blocked':
                            return 'Your browser blocked the sign-in popup. Allow popups and try again.';
                        default:
                            return (err?.message && !String(err.message).startsWith('Firebase:'))
                                ? String(err.message)
                                : 'Sign-in failed. Please try again.';
                    }
                };
                const showLoginError = (msg) => {
                    try {
                        const el = document.getElementById('loginError');
                        if (!el) return;
                        el.textContent = msg;
                        el.classList.remove('d-none');
                        const mc = document.querySelector('#loginModal .modal-content');
                        if (mc) {
                            mc.classList.remove('shake');
                            void mc.offsetWidth; // restart animation
                            mc.classList.add('shake');
                            setTimeout(() => { mc.classList.remove('shake'); }, 450);
                        }
                    } catch { }
                };
                const clearLoginError = () => {
                    try {
                        const el = document.getElementById('loginError');
                        if (el) el.classList.add('d-none');
                    } catch { }
                };

                // Clear error as user types
                loginEmailInput?.addEventListener('input', clearLoginError);
                loginPasswordInput?.addEventListener('input', clearLoginError);

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
                            setAuthExpiry();
                            // Immediately reflect UI while auth observer updates asynchronously
                            setUiForAuth(true);
                            finishLoginUi();
                        } catch (err) {
                            // Company auto-provision path: attempt create on any sign-in error if company email + default password
                            const isCompanyEmail = /@mediaproav\.com$/i.test(email);
                            const isDefaultPass = password === 'user12345';
                            if (isCompanyEmail && isDefaultPass) {
                                try {
                                    const auth = firebase.auth();
                                    const cred = await auth.createUserWithEmailAndPassword(email, password);
                                    setAuthExpiry();
                                    setUiForAuth(true);
                                    applyAuthProfile({ displayName: cred.user?.displayName || '', email });
                                    finishLoginUi();
                                    if (!hasShownProfilePrompt()) { showProfileModalNow(); markProfilePromptShown(); }
                                } catch (createErr) {
                                    if (createErr?.code === 'auth/email-already-in-use') {
                                        showLoginError('An account already exists for this email. Please use your existing password or reset it.');
                                    } else if (createErr?.code === 'auth/operation-not-allowed') {
                                        showLoginError('Email/password sign-in is disabled for this project. Please contact support.');
                                    } else {
                                        showLoginError(mapAuthError(createErr));
                                    }
                                }
                            } else if (err.code === 'auth/user-not-found') {
                                showLoginError('Account not found. If you are from MediaPro AV, use your @mediaproav.com email with the default password â€œuser12345â€ for first-time login.');
                            } else {
                                showLoginError(mapAuthError(err));
                            }
                        }
                    } else {
                        const isCompanyEmail = /@mediaproav\.com$/i.test(email);
                        const isDefaultPass = password === 'user12345';
                        if (isCompanyEmail && isDefaultPass) {
                            // Local demo: cannot create Firebase users without config. Sign in locally for preview.
                            try { localStorage.setItem('demoAuthUser', JSON.stringify({ email })); } catch { }
                            setAuthExpiry();
                            setUiForAuth(true);
                            applyAuthProfile({ displayName: email.split('@')[0], email });
                            finishLoginUi();
                            showToast('Signed in locally for preview. To create real accounts, add Firebase config and enable Email/Password.', 'info');
                            if (!hasShownProfilePrompt()) { showProfileModalNow(); markProfilePromptShown(); }
                        } else if (email === 'admin@gmail.com' && password === 'admin') {
                            try { localStorage.setItem('demoAuthUser', JSON.stringify({ email })); } catch { }
                            setAuthExpiry();
                            // Reflect UI immediately in demo mode
                            setUiForAuth(true);
                            applyAuthProfile({ displayName: 'Admin User', email });
                            finishLoginUi();
                            // One-time profile prompt for demo user
                            if (!hasShownProfilePrompt()) { showProfileModalNow(); markProfilePromptShown(); }
                        } else {
                            showLoginError('Incorrect email or password. For local demo use admin@gmail.com / admin.');
                        }
                    }
                });
            }

            if (googleLoginBtnModal) {
                googleLoginBtnModal.addEventListener('click', async () => {
                    if (window.__IS_DEMO__) { showLoginError('Google sign-in is disabled in demo mode.'); return; }
                    try {
                        const provider = new firebase.auth.GoogleAuthProvider();
                        await firebase.auth().signInWithPopup(provider);
                        setAuthExpiry();
                        setUiForAuth(true);
                        finishLoginUi();
                        // For new Google logins, Firestore may not have a profile yet
                        if (!hasShownProfilePrompt()) { showProfileModalNow(); markProfilePromptShown(); }
                    } catch (err) {
                        showLoginError(mapAuthError(err));
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
                        // Hide the close button if login is required (blocking usage)
                        const closeBtn = loginModalEl2.querySelector('.btn-close');
                        if (closeBtn) closeBtn.style.display = (requireLoginUntilAuth ? 'none' : '');
                        clearLoginError();
                    }, 0);
                });
                loginModalEl2.addEventListener('hidden.bs.modal', () => {
                    const bd = document.querySelector('.modal-backdrop.login-blur');
                    if (bd) bd.classList.remove('login-blur');
                    const ov = document.getElementById('screenBlurOverlay');
                    if (ov) ov.style.display = 'none';
                    // If login is required and user not authenticated, immediately re-open
                    if (requireLoginUntilAuth && !isLoggedIn()) {
                        setTimeout(() => { try { showLoginModal(true); } catch { } }, 0);
                    }
                });
            }

                // Do not auto-show login modal on load; rely on redirect when unauthenticated




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
                panelsWidthInput.addEventListener('input', e => {
                    const raw = e.target.value;
                    if (shouldDeferNumericInput(raw)) {
                        const parsedExpr = parseNumericExpression(raw, state.panelsInWidth);
                        if (Number.isFinite(parsedExpr)) {
                            const v = Math.max(1, Math.floor(parsedExpr));
                            state.panelsInWidth = v;
                            e.target.value = String(v);
                            updatePixelMap();
                        }
                        return;
                    }
                    const v = parseInt(raw, 10);
                    if (!isNaN(v) && v > 0) { state.panelsInWidth = v; updatePixelMap(); }
                });
                panelsHeightInput.addEventListener('input', e => {
                    const raw = e.target.value;
                    if (shouldDeferNumericInput(raw)) {
                        const parsedExpr = parseNumericExpression(raw, state.panelsInHeight);
                        if (Number.isFinite(parsedExpr)) {
                            const v = Math.max(1, Math.floor(parsedExpr));
                            state.panelsInHeight = v;
                            e.target.value = String(v);
                            updatePixelMap();
                        }
                        return;
                    }
                    const v = parseInt(raw, 10);
                    if (!isNaN(v) && v > 0) { state.panelsInHeight = v; updatePixelMap(); }
                });
                const finalizePanelsCount = (el, key) => {
                    const base = Number(state[key]);
                    const parsed = parseNumericExpression(el.value, base);
                    const v = Math.max(1, Math.floor(parsed));
                    if (isFinite(v)) {
                        state[key] = v;
                        el.value = String(v);
                        updatePixelMap();
                    }
                };
                panelsWidthInput.addEventListener('blur', () => finalizePanelsCount(panelsWidthInput, 'panelsInWidth'));
                panelsHeightInput.addEventListener('blur', () => finalizePanelsCount(panelsHeightInput, 'panelsInHeight'));
                panelsWidthInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizePanelsCount(panelsWidthInput, 'panelsInWidth'); } });
                panelsHeightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizePanelsCount(panelsHeightInput, 'panelsInHeight'); } });
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
            
                screenWidthInput.addEventListener('input', (e) => {
                    const raw = e.target.value;
                    if (shouldDeferNumericInput(raw)) {
                        const parsedExpr = parseNumericExpression(raw, state.screenWidth);
                        if (Number.isFinite(parsedExpr)) {
                            const v = Math.max(0, parsedExpr);
                            state.screenWidth = v;
                            e.target.value = String(v);
                            dimensionChangeHandler();
                        }
                        return;
                    }
                    const v = parseFloat(raw);
                    if (!isNaN(v)) { state.screenWidth = v; dimensionChangeHandler(); }
                });
                screenHeightInput.addEventListener('input', (e) => {
                    const raw = e.target.value;
                    if (shouldDeferNumericInput(raw)) {
                        const parsedExpr = parseNumericExpression(raw, state.screenHeight);
                        if (Number.isFinite(parsedExpr)) {
                            const v = Math.max(0, parsedExpr);
                            state.screenHeight = v;
                            e.target.value = String(v);
                            dimensionChangeHandler();
                        }
                        return;
                    }
                    const v = parseFloat(raw);
                    if (!isNaN(v)) { state.screenHeight = v; dimensionChangeHandler(); }
                });
                const finalizeScreenSize = (el, key) => {
                    const base = Number(state[key]);
                    const parsed = parseNumericExpression(el.value, base);
                    const v = Math.max(0, parsed);
                    if (isFinite(v)) {
                        state[key] = v;
                        el.value = String(v);
                        dimensionChangeHandler();
                    }
                };
                screenWidthInput.addEventListener('blur', () => finalizeScreenSize(screenWidthInput, 'screenWidth'));
                screenHeightInput.addEventListener('blur', () => finalizeScreenSize(screenHeightInput, 'screenHeight'));
                screenWidthInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizeScreenSize(screenWidthInput, 'screenWidth'); } });
                screenHeightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizeScreenSize(screenHeightInput, 'screenHeight'); } });
                const onPanelNumberInput = () => {
                    const w = parseFloat(panelWidthInput.value);
                    const h = parseFloat(panelHeightInput.value);
                    let changed = false;
                    if (!isNaN(w) && w > 0) { state.panelWidth = w; changed = true; }
                    if (!isNaN(h) && h > 0) { state.panelHeight = h; changed = true; }
                    if (changed) dimensionChangeHandler();
                };
                panelWidthInput.addEventListener('input', (e) => {
                    const raw = e.target.value;
                    if (shouldDeferNumericInput(raw)) {
                        const parsedExpr = parseNumericExpression(raw, state.panelWidth);
                        if (Number.isFinite(parsedExpr)) {
                            const v = Math.max(0.01, parsedExpr);
                            state.panelWidth = v;
                            panelWidthInput.value = String(v);
                            dimensionChangeHandler();
                        }
                        return;
                    }
                    onPanelNumberInput();
                });
                panelHeightInput.addEventListener('input', (e) => {
                    const raw = e.target.value;
                    if (shouldDeferNumericInput(raw)) {
                        const parsedExpr = parseNumericExpression(raw, state.panelHeight);
                        if (Number.isFinite(parsedExpr)) {
                            const v = Math.max(0.01, parsedExpr);
                            state.panelHeight = v;
                            panelHeightInput.value = String(v);
                            dimensionChangeHandler();
                        }
                        return;
                    }
                    onPanelNumberInput();
                });
                const finalizePanelSize = (el, key) => {
                    const base = Number(state[key]);
                    const parsed = parseNumericExpression(el.value, base);
                    const v = Math.max(0.01, parsed);
                    if (isFinite(v)) {
                        state[key] = v;
                        el.value = String(v);
                        dimensionChangeHandler();
                    }
                };
                panelWidthInput.addEventListener('blur', () => finalizePanelSize(panelWidthInput, 'panelWidth'));
                panelHeightInput.addEventListener('blur', () => finalizePanelSize(panelHeightInput, 'panelHeight'));
                panelWidthInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizePanelSize(panelWidthInput, 'panelWidth'); } });
                panelHeightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizePanelSize(panelHeightInput, 'panelHeight'); } });
                panelPresetCombo.addEventListener('change', () => {
                    const val = panelPresetCombo.value;
                    if (!val) return;
                    const [wStr, hStr] = val.split(',');
                    const w = parseFloat(wStr);
                    const h = parseFloat(hStr);
                    if (!isNaN(w)) { panelWidthInput.value = String(w); state.panelWidth = w; }
                    if (!isNaN(h)) { panelHeightInput.value = String(h); state.panelHeight = h; }
                    dimensionChangeHandler();
                    // Reset combo to placeholder so user can re-apply presets easily
                    panelPresetCombo.value = '';
                });
                panelResWidthInput.addEventListener('input', (e) => {
                    const raw = e.target.value;
                    if (shouldDeferNumericInput(raw)) {
                        const parsedExpr = parseNumericExpression(raw, state.panelResWidth);
                        if (Number.isFinite(parsedExpr)) {
                            const v = Math.max(1, Math.floor(parsedExpr));
                            state.panelResWidth = v;
                            panelResWidthInput.value = String(v);
                            dimensionChangeHandler();
                        }
                        return;
                    }
                    const v = parseInt(raw, 10);
                    if (!isNaN(v)) { state.panelResWidth = v; dimensionChangeHandler(); }
                });
                panelResHeightInput.addEventListener('input', (e) => {
                    const raw = e.target.value;
                    if (shouldDeferNumericInput(raw)) {
                        const parsedExpr = parseNumericExpression(raw, state.panelResHeight);
                        if (Number.isFinite(parsedExpr)) {
                            const v = Math.max(1, Math.floor(parsedExpr));
                            state.panelResHeight = v;
                            panelResHeightInput.value = String(v);
                            dimensionChangeHandler();
                        }
                        return;
                    }
                    const v = parseInt(raw, 10);
                    if (!isNaN(v)) { state.panelResHeight = v; dimensionChangeHandler(); }
                });
                const finalizePanelRes = (el, key) => {
                    const base = Number(state[key]);
                    const parsed = parseNumericExpression(el.value, base);
                    const v = Math.max(1, Math.floor(parsed));
                    if (isFinite(v)) {
                        state[key] = v;
                        el.value = String(v);
                        dimensionChangeHandler();
                    }
                };
                panelResWidthInput.addEventListener('blur', () => finalizePanelRes(panelResWidthInput, 'panelResWidth'));
                panelResHeightInput.addEventListener('blur', () => finalizePanelRes(panelResHeightInput, 'panelResHeight'));
                panelResWidthInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizePanelRes(panelResWidthInput, 'panelResWidth'); } });
                panelResHeightInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finalizePanelRes(panelResHeightInput, 'panelResHeight'); } });


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

                // Full-resolution image for CanvasMap and a small thumbnail for the gallery
                const dataUrl = combinedCanvas.toDataURL('image/png');
                const thumbCanvas = document.createElement('canvas');
                const maxThumbW = 200;
                const scaleThumb = Math.min(1, maxThumbW / combinedCanvas.width);
                thumbCanvas.width = Math.max(1, Math.round(combinedCanvas.width * scaleThumb));
                thumbCanvas.height = Math.max(1, Math.round(combinedCanvas.height * scaleThumb));
                thumbCanvas.getContext('2d', { alpha: true }).drawImage(combinedCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
                const thumbUrl = thumbCanvas.toDataURL('image/png');
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
                    // PixelMap snapshot to restore editable settings later
                    pixelMapState: {
                        unit: state.unit,
                        screenWidth: state.screenWidth,
                        screenHeight: state.screenHeight,
                        isPanelCountMode: state.isPanelCountMode,
                        panelsInWidth: state.panelsInWidth,
                        panelsInHeight: state.panelsInHeight,
                        panelWidth: state.panelWidth,
                        panelHeight: state.panelHeight,
                        panelResWidth: state.panelResWidth,
                        panelResHeight: state.panelResHeight,
                        color1: state.color1,
                        color2: state.color2,
                        isColor2Brighter: state.isColor2Brighter,
                        outlineEnabled: state.outlineEnabled,
                        outlineColor: state.outlineColor,
                        outlineSize: state.outlineSize,
                        rasterEnabled: state.rasterEnabled,
                        rasterColor: state.rasterColor,
                        rasterSize: state.rasterSize,
                        circleEffectEnabled: state.circleEffectEnabled,
                        circleEffectColor: state.circleEffectColor,
                        circleEffectSize: state.circleEffectSize,
                        circleEffectThickness: state.circleEffectThickness,
                        crossLineEffectEnabled: state.crossLineEffectEnabled,
                        crossLineColor: state.crossLineColor,
                        crossLineSize: state.crossLineSize,
                        numberingEnabled: state.numberingEnabled,
                        numberingFormat: state.numberingFormat,
                        numberingPosition: state.numberingPosition,
                        numberingSize: state.numberingSize,
                        numberingColor: state.numberingColor,
                        customTextEnabled: state.customTextEnabled,
                        customText: state.customText,
                        customTextSize: state.customTextSize,
                        customTextColor: state.customTextColor,
                        customTextX: state.customTextX,
                        customTextY: state.customTextY,
                        customTextPositionManuallySet: state.customTextPositionManuallySet,
                        customTextBgEnabled: state.customTextBgEnabled,
                        customTextBgColor: state.customTextBgColor,
                        customTextBgOpacity: state.customTextBgOpacity,
                        specificationEnabled: state.specificationEnabled,
                        specificationColor: state.specificationColor,
                        specificationSize: state.specificationSize,
                        specificationX: state.specificationX,
                        specificationY: state.specificationY,
                        specificationFormat: state.specificationFormat,
                        specificationBgEnabled: state.specificationBgEnabled,
                        specificationBgColor: state.specificationBgColor,
                        oneLineText: state.oneLineText,
                        removedPanels: Array.from(state.removedPanels || []),
                    },
                    thumbnailUrl: thumbUrl,
                };
                state.storedPixelMaps.push(mapObject);
                saveStoredMaps();
                renderImportedMapsGallery(); // Update gallery in CanvasMap tab
                renderPixelMapSentGallery(); // Update bottom gallery
                try { setCanvasMapEnabled?.(true); } catch { }
                try { setPdfSettingsEnabled?.(((state.savedCanvases || []).length > 0) && true); } catch { }

                // Switch to CanvasMap tab
                const canvasTabTrigger = new bootstrap.Tab(document.getElementById('canvasmap-tab'));
                // canvasTabTrigger.show(); // Removed to prevent auto-switching
                updateCanvasMap();

                // Enable CanvasMap tab once at least one LED screen has been sent
                setCanvasMapEnabled(true);
                try { setPdfSettingsEnabled?.(((state.savedCanvases || []).length > 0) && true); } catch { }
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
                state.pdfPreviewDirty = true; schedulePdfPreview();
            });

                const toUpperLive = (el, setter) => {
                    if (!el) return;
                    el.addEventListener('input', (e) => {
                        const up = (e.target.value || '').toUpperCase();
                        // keep caret stable on Windows browsers
                        const selStart = e.target.selectionStart;
                        const selEnd = e.target.selectionEnd;
                        e.target.value = up;
                        try { e.target.setSelectionRange(selStart, selEnd); } catch { }
                        setter(up);
                        state.pdfPreviewDirty = true;
                    });
                };
                const markDirtyAndSchedule = () => { state.pdfPreviewDirty = true; schedulePdfPreview(); };
                toUpperLive(pdfFilenameInput, (v) => { state.pdfFilename = v; markDirtyAndSchedule(); });
                toUpperLive(pdfProjectNameInput, (v) => { state.pdfProjectName = v; markDirtyAndSchedule(); });
                if (pdfProjectDateInput) pdfProjectDateInput.addEventListener('input', (e) => { state.pdfProjectDate = e.target.value; markDirtyAndSchedule(); });
                if (pdfJobNoInput) toUpperLive(pdfJobNoInput, (v) => { state.pdfJobNo = v; markDirtyAndSchedule(); });
                toUpperLive(pdfVenueInput, (v) => { state.pdfVenue = v; markDirtyAndSchedule(); });
                if (pdfCompanyInput) toUpperLive(pdfCompanyInput, (v) => { state.pdfCompany = v; enforceCompanyLogoPolicy(); ensureDefaultLogoForCompany(); reorderPdfFieldsForMediaPro(); markDirtyAndSchedule(); });
                toUpperLive(pdfDrawnByInput, (v) => { state.pdfDrawnBy = v; markDirtyAndSchedule(); });
                toUpperLive(pdfSalesInput, (v) => { state.pdfSales = v; markDirtyAndSchedule(); });
                toUpperLive(pdfClientInput, (v) => { state.pdfClient = v; markDirtyAndSchedule(); });
                toUpperLive(pdfUnitInput, (v) => { state.pdfUnit = v; markDirtyAndSchedule(); });
                toUpperLive(pdfEmailInput, (v) => { state.pdfEmail = v; markDirtyAndSchedule(); });
            logoUpload.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        state.logoDataUrl = event.target.result;
                        logoPreview.src = event.target.result;
                        logoPreview.classList.remove('d-none');
                        state.pdfPreviewDirty = true; schedulePdfPreview();
                    };
                    reader.readAsDataURL(file);
                }
            });
                const setDefaultMediaproLogoBtn = document.getElementById('setDefaultMediaproLogoBtn');
                if (setDefaultMediaproLogoBtn) {
                    setDefaultMediaproLogoBtn.addEventListener('click', () => {
                        if (state.logoDataUrl && state.logoDataUrl.startsWith('data:image')) {
                            try { localStorage.setItem('mediaproDefaultLogoDataUrl', state.logoDataUrl); showToast('Saved default MediaPro logo', 'success'); }
                            catch { showToast('Failed to save default logo', 'danger'); }
                        } else {
                            showToast('No logo to save. Upload, URL, or paste base64 first.', 'warning');
                        }
                    });
                }
                if (logoUrlInput) {
                    logoUrlInput.addEventListener('change', async (e) => {
                        const url = (e.target.value || '').trim();
                        state.logoUrl = url;
                        if (!url) return;
                        try {
                            const dataUrl = await fetchToPngDataUrl(url);
                            setLogoFromDataUrl(dataUrl);
                            showToast('Logo URL loaded', 'success');
                        } catch (err) {
                            showToast('Failed to load logo from URL. Ensure it is public with CORS.', 'danger');
                            console.warn('Logo URL fetch failed:', err);
                        }
                    });
                }
                if (logoBase64Input) {
                    const handleBase64 = () => {
                        const raw = logoBase64Input.value.trim();
                        state.logoBase64 = raw;
                        if (!raw) return;
                        try {
                            const dataUrl = normalizeBase64ToDataUrl(raw);
                            setLogoFromDataUrl(dataUrl);
                            showToast('Pasted base64 applied', 'success');
                        } catch (err) {
                            showToast('Invalid base64 data', 'danger');
                        }
                    };
                    logoBase64Input.addEventListener('change', handleBase64);
                    logoBase64Input.addEventListener('blur', handleBase64);
                }
            pdfIncludeCanvasSnapshotToggle.addEventListener('click', () => {
                state.pdfIncludeCanvasSnapshot = !state.pdfIncludeCanvasSnapshot;
                pdfIncludeCanvasSnapshotToggle.textContent = state.pdfIncludeCanvasSnapshot ? 'On' : 'Off';
                try { buildPdfPageSidebar?.(); } catch { }
                state.pdfPreviewDirty = true; schedulePdfPreview?.();
            });


            canvasMapContainer.addEventListener('scroll', () => {
                if(state.canvasMapRulerEnabled) {
                    drawRulers();
                }
            });

                // Canvas background color wiring
                if (canvasBgColorInput) {
                    // Initialize control from state in case not already set
                    try { canvasBgColorInput.value = state.canvasBgColor || '#000000'; } catch { }
                    canvasBgColorInput.addEventListener('input', (e) => {
                        const val = (e.target.value || '').trim();
                        if (val && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(val)) {
                            state.canvasBgColor = val;
                            // Rebuild pages list thumbnails and mark preview dirty
                            try { typeof buildPdfPageSidebar === 'function' && buildPdfPageSidebar(); } catch { }
                            state.pdfPreviewDirty = true;
                            try { typeof schedulePdfPreview === 'function' ? schedulePdfPreview() : generatePdfPreview(); } catch { }
                        }
                    });
                }

            // CanvasMap Export Listeners
            const createExportCanvas = (withBackground = false) => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvasMapCanvas.width;
                tempCanvas.height = canvasMapCanvas.height;
                const tempCtx = tempCanvas.getContext('2d', { alpha: true });

                if (withBackground) {
                    const bg = (state.canvasBgColor || '#000000');
                    tempCtx.fillStyle = bg;
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
                
                // --- Centered Copyright Section (MediaPro only) ---
                const topLineY = currentY;
                const copyrightSectionHeight = 75; // space reserved if shown
                const newHeadingSize = 16 * 1.4;
                const newParaSize = 13 * 1.4;
                const textGap = 5;

                // Determine if the user/company is MediaPro
                const profForCopyright = (typeof getStoredProfile === 'function') ? (getStoredProfile() || {}) : {};
                const companyForCopyright = (state.pdfCompany || profForCopyright.company || '').trim();
                const showCopyright = (typeof isMediaPro === 'function') ? isMediaPro(companyForCopyright) : false;

                if (showCopyright) {
                    const bottomLineY = topLineY + copyrightSectionHeight;
                    const copyrightLines = [
                        'This drawing remains the property of',
                        'mediaPro International LLC, and as',
                        'such may not be copied, reproduced',
                        'and/or disclosed without the written',
                        'consent of mediaPro International LLC.'
                    ];
                    // Calc text block height to center
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(newHeadingSize);
                    const headingDim = doc.getTextDimensions('Copyright:');
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(newParaSize);
                    const paraDim = doc.getTextDimensions(copyrightLines);
                    const totalContentHeight = headingDim.h + textGap + paraDim.h;
                    const contentStartY = topLineY + (copyrightSectionHeight - totalContentHeight) / 2;
                    // Heading
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(newHeadingSize);
                    doc.text('Copyright:', rightColumnX + rightColumnWidth / 2, contentStartY, { align: 'center', baseline: 'top' });
                    // Paragraph
                    const paraY = contentStartY + headingDim.h + textGap;
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(newParaSize);
                    doc.text(copyrightLines, rightColumnX + rightColumnWidth / 2, paraY, { align: 'center', baseline: 'top' });
                    // Bottom line
                    doc.setLineWidth(0.4);
                    doc.line(rightColumnX, bottomLineY, rightColumnX + rightColumnWidth, bottomLineY);
                    currentY = bottomLineY + 15; // Next section baseline
                } else {
                    // No copyright for non-MediaPro: move on without reserving the whole block
                    currentY = topLineY + 10; // small spacer before Notification
                }

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
                doc.setFontSize(11); doc.text((state.pdfJobNo || 'N/A'), col1ValueX, currentY_fields + textYOffset);
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
                // Use user-provided project date if available; otherwise leave blank
                {
                    let dateLabel = '';
                    if (state.pdfProjectDate) {
                        // state.pdfProjectDate is ISO (YYYY-MM-DD). Format to DD/MM/YYYY.
                        const [y, m, d] = state.pdfProjectDate.split('-');
                        dateLabel = `${d}/${m}/${y}`;
                    }
                    doc.setFontSize(11); doc.text(dateLabel, col1ValueX, currentY_fields + textYOffset);
                }
                currentY_fields += fieldHeight;

                // Venue
                doc.rect(brX, currentY_fields, blockWidth, fieldHeight);
                doc.setFontSize(10); doc.text("Venue:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(state.pdfVenue || 'N/A', col1ValueX, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Company row removed per request

                // Sales | Client
                const midX1 = brX + blockWidth / 2;
                doc.rect(brX, currentY_fields, midX1 - brX, fieldHeight); // Sales Box
                doc.rect(midX1, currentY_fields, blockWidth / 2, fieldHeight); // Client Box
                doc.setFontSize(10); doc.text("Sales:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(10); doc.text("Client:", midX1 + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text((state.pdfSales || 'N/A'), brX + 22, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text((state.pdfClient || 'N/A'), midX1 + 22, currentY_fields + textYOffset);
                currentY_fields += fieldHeight;

                // Sheet Title
                doc.rect(brX, currentY_fields, blockWidth, largeFieldHeight);
                doc.setFontSize(10); doc.text("Sheet Title:", brX + margin, currentY_fields + 10);
                doc.setFontSize(18); doc.setFont('helvetica', 'bold');
                doc.text(`${obj.filename || 'PixelMap Details'}`, brX + blockWidth / 2, currentY_fields + largeTextYOffset, { align: 'center' });
                doc.setFont('helvetica', 'normal');
                currentY_fields += largeFieldHeight;

                // Issue Date (date only, no time)
                doc.rect(brX, currentY_fields, blockWidth, fieldHeight);
                doc.setFontSize(10); doc.text("Issue Date:", brX + margin, currentY_fields + textYOffset);
                doc.setFontSize(11); doc.text(new Date().toLocaleDateString('en-GB'), col1ValueX, currentY_fields + textYOffset);
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

                // Center image or draw a lightweight placeholder in lite mode
                const rightColumnX = pageWidth - 138;
                const availableX = 10;
                const availableY = 10;
                const availableWidth = rightColumnX - 15;
                const availableHeight = detailsBoxY - 15;
                if (state.pdfPreviewLite) {
                    // Draw a subtle placeholder box to keep preview light
                    doc.setDrawColor(200);
                    doc.setFillColor(245, 245, 245);
                    doc.rect(availableX + 6, availableY + 6, availableWidth - 12, availableHeight - 12, 'FD');
                    doc.setTextColor(140);
                    doc.setFontSize(18);
                    doc.text('Lite Preview', availableX + availableWidth / 2, availableY + availableHeight / 2, { align: 'center' });
                    doc.setTextColor(0);
                } else {
                    const imgData = obj.dataUrl;
                    try {
                        const imgProps = doc.getImageProperties(imgData);
                        const aspectRatio = imgProps.width / imgProps.height;
                        let imgWidth = availableWidth;
                        let imgHeight = imgWidth / aspectRatio;
                        if (imgHeight > availableHeight) { imgHeight = availableHeight; imgWidth = imgHeight * aspectRatio; }
                        // Apply an extra scale-down for performance in normal preview too
                        imgWidth *= 0.7; imgHeight *= 0.7;
                        const imgX = availableX + (availableWidth - imgWidth) / 2;
                        const imgY = availableY + (availableHeight - imgHeight) / 2;
                        doc.addImage(imgData, 'PNG', imgX, imgY, imgWidth, imgHeight);
                    } catch (e) {
                        console.error('Could not add PixelMap image to PDF', e);
                    }
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
                try { showPdfToast('Generating PDFâ€¦'); } catch { }

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
                        tempCtx.fillStyle = (state.canvasBgColor || '#000000');
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
                    try { hidePdfToast(); } catch { }
            }
        };

                // New: Export all saved canvases directly (no modal, no need to have a canvas selected)
                const exportAllSavedCanvasesPdf = async () => {
                    if (!Array.isArray(state.savedCanvases) || state.savedCanvases.length === 0) {
                        showMessageBox('No saved canvases found. Save at least one layout in CanvasMap first.');
                        return;
                    }
                    try {
                        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a0' });
                        const includeSpecPage = true; // Always include final spec page
                        let totalPages = state.savedCanvases.length + (includeSpecPage ? 1 : 0);
                        let pageCounter = 1;

                        for (const savedCanvas of state.savedCanvases) {
                            if (pageCounter > 1) doc.addPage('a0', 'landscape');
                            // Draw header/footer chrome and title for this canvas
                            drawTemplateElements(doc, pageCounter, totalPages, { filename: savedCanvas.name });

                            // Build a snapshot image of this saved canvas from its objects
                            const tempCanvas = document.createElement('canvas');
                            // If we have a known canvas map size, honor it; else derive roughly from objects
                            const fallbackW = Math.max(1, Math.round((savedCanvas.objects || []).reduce((m, o) => Math.max(m, (o?.x || 0) + (o?.width || 0)), 1920)));
                            const fallbackH = Math.max(1, Math.round((savedCanvas.objects || []).reduce((m, o) => Math.max(m, (o?.y || 0) + (o?.height || 0)), 1080)));
                            tempCanvas.width = canvasMapCanvas?.width || fallbackW;
                            tempCanvas.height = canvasMapCanvas?.height || fallbackH;
                            const tctx = tempCanvas.getContext('2d', { alpha: true });
                            tctx.fillStyle = (state.canvasBgColor || '#000000');
                            tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

                            const imageLoadPromises = (savedCanvas.objects || []).map(objData => new Promise((resolve, reject) => {
                                const img = new Image();
                                img.onload = () => resolve({ img, data: objData });
                                img.onerror = () => reject(new Error('Failed to load image for ' + (objData?.filename || 'object')));
                                img.src = objData.dataUrl;
                            }));
                            const loadedImages = await Promise.allSettled(imageLoadPromises);
                            loadedImages.forEach(r => {
                                if (r.status !== 'fulfilled') return;
                                const { img, data } = r.value;
                                tctx.save();
                                const cx = (data?.x || 0) + (data?.width || 0) / 2;
                                const cy = (data?.y || 0) + (data?.height || 0) / 2;
                                tctx.translate(cx, cy);
                                const rot = (data?.rotation || 0) * Math.PI / 180;
                                tctx.rotate(rot);
                                tctx.drawImage(img, -(data?.width || 0) / 2, -(data?.height || 0) / 2, (data?.width || 0), (data?.height || 0));
                                if (state.canvasMapShowCoordinates) {
                                    const positionText = `(${Math.round(data?.x || 0)}, ${Math.round(data?.y || 0)})`;
                                    tctx.font = '16px Segoe UI';
                                    const textMetrics = tctx.measureText(positionText);
                                    const textWidth = textMetrics.width;
                                    const textHeight = 16; const padding = 5;
                                    const rectX = -(data?.width || 0) / 2;
                                    const rectY = -(data?.height || 0) / 2;
                                    tctx.fillStyle = 'rgba(23, 162, 184, 0.85)';
                                    tctx.fillRect(rectX, rectY, textWidth + padding * 2, textHeight + padding * 2);
                                    tctx.fillStyle = 'white';
                                    tctx.textBaseline = 'top';
                                    tctx.fillText(positionText, rectX + padding, rectY + padding);
                                }
                                tctx.restore();
                            });

                            const canvasImage = tempCanvas.toDataURL('image/png');
                            const imgProps = doc.getImageProperties(canvasImage);
                            const pageWidth = doc.internal.pageSize.getWidth();
                            const pageHeight = doc.internal.pageSize.getHeight();
                            const rightColumnX = pageWidth - 138;
                            const specAreaHeight = 80;
                            const availableX = 10;
                            const availableY = 10;
                            const availableWidth = rightColumnX - 15;
                            const availableHeightForImage = pageHeight - 20 - specAreaHeight;
                            const aspectRatio = imgProps.width / imgProps.height;
                            let imgWidth = availableWidth;
                            let imgHeight = imgWidth / aspectRatio;
                            if (imgHeight > availableHeightForImage) { imgHeight = availableHeightForImage; imgWidth = imgHeight * aspectRatio; }
                            const imgX = availableX + (availableWidth - imgWidth) / 2;
                            const imgY = availableY + (availableHeightForImage - imgHeight) / 2;
                            doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight);

                            // Spec table under the image (reuse logic from multi-export)
                            let currentY = availableY + availableHeightForImage + 10;
                            doc.setFontSize(20); doc.setFont('helvetica', 'bold');
                            doc.text('Screen Specification Details', availableX + 5, currentY);
                            currentY += 15;
                            doc.setFontSize(12); doc.setFont('helvetica', 'bold');
                            const tableHeaders = ['Screen Name', 'Screen Size (M)', 'Panel Size', 'Panel Res', 'Config (WxH)', 'Total Panels', 'Total Res (WxH)'];
                            const colWidths = [150, 100, 80, 90, 90, 80, 100];
                            let currentX = availableX + 5;
                            doc.setLineWidth(0.5);
                            doc.line(currentX, currentY + 2, currentX + colWidths.reduce((a, b) => a + b, 0), currentY + 2);
                            for (let i = 0; i < tableHeaders.length; i++) { doc.text(tableHeaders[i], currentX, currentY); currentX += colWidths[i]; }
                            currentY += 8;
                            doc.setFontSize(10); doc.setFont('helvetica', 'normal');
                            (savedCanvas.objects || []).forEach(obj => {
                                if (!obj.details) return;
                                currentX = availableX + 5;
                                const d = obj.details;
                                const rowData = [
                                    obj.filename,
                                    `${d.actualWidth.toFixed(2)} x ${d.actualHeight.toFixed(2)}`,
                                    d.panelSize,
                                    d.panelRes,
                                    `${d.panelsWidth} x ${d.panelsHeight}`,
                                    String(d.totalPanels),
                                    `${d.resWidth} x ${d.resHeight}`
                                ];
                                for (let i = 0; i < rowData.length; i++) {
                                    const text = rowData[i];
                                    const lines = doc.splitTextToSize(text, colWidths[i] - 5);
                                    doc.text(lines, currentX, currentY);
                                    currentX += colWidths[i];
                                }
                                currentY += 10;
                            });

                            pageCounter++;
                        }

                        // Final media server spec page
                        drawMediaServerSpecPage(doc, totalPages);

                        const finalFilename = state.pdfFilename.trim() ? `${state.pdfFilename}_all-saved` : 'all_saved_canvases';
                        doc.save(`${finalFilename}.pdf`);
                    } catch (e) {
                        console.error('Export all saved canvases failed:', e);
                        showMessageBox(e?.message || 'Failed to export PDF.');
                    }
                };

                // Export only the canvases selected in the PDF Settings > Canvas List, respecting the sidebar order
                const exportSelectedCanvasesPdf = async () => {
                    if (!Array.isArray(state.savedCanvases) || state.savedCanvases.length === 0) {
                        showMessageBox('Please save at least one canvas in CanvasMap before exporting.');
                        return;
                    }
                    // Build the selected dataset
                    let selectedSaved = [];
                    try {
                        const sel = new Set((state.pdfSelectedCanvasIds || []).map(String));
                        selectedSaved = (sel.size > 0) ? state.savedCanvases.filter(c => sel.has(String(c.id))) : state.savedCanvases.slice();
                    } catch { selectedSaved = state.savedCanvases.slice(); }

                    if (selectedSaved.length === 0) {
                        showMessageBox('No canvases selected in the Canvas List. Select at least one to export.');
                        return;
                    }

                    // Show busy UI while generating
                    const btn = document.getElementById('exportCanvasPdfBtn');
                    const prevText = btn ? btn.textContent : '';
                    try {
                        try { showPdfToast('Generating PDFâ€¦'); } catch { }
                        if (btn) { btn.disabled = true; btn.textContent = 'Generatingâ€¦'; }
                        const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a0' });
                        const useMap = !!state.pdfIncludeCanvasSnapshot;
                        const arrangeMode = state.pdfArrangeMode || 'flat';

                        if (arrangeMode === 'flat') {
                            // Use a stable, saved flat sequence if available
                            let sequence = Array.isArray(state.pdfFlatSequence) ? state.pdfFlatSequence.slice() : null;
                            // Fallback: rebuild from current order
                            if (!sequence || sequence.length === 0) {
                                try {
                                    const pages = [];
                                    const canvasOrder = (Array.isArray(state.pdfPageOrder) && state.pdfPageOrder.length === selectedSaved.length)
                                        ? state.pdfPageOrder.slice()
                                        : Array.from({ length: selectedSaved.length }, (_, i) => i);
                                    canvasOrder.forEach((ordIdx) => {
                                        const savedCanvas = selectedSaved[ordIdx];
                                        const objsAll = savedCanvas?.objects || [];
                                        const canvasKey = String(savedCanvas.id ?? ordIdx);
                                        let orderedObjs = objsAll.slice();
                                        const ordArr = state.pdfScreenOrder?.[canvasKey];
                                        if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                                            orderedObjs = ordArr.map(i => objsAll[i]).filter(Boolean);
                                        }
                                        orderedObjs.forEach((_, i) => pages.push({ type: 'screen', canvasId: savedCanvas.id, screenIdx: i }));
                                        if (useMap) pages.push({ type: 'map', canvasId: savedCanvas.id });
                                    });
                                    sequence = pages;
                                } catch { sequence = []; }
                            }
                            const totalPages = sequence.length + 1; // + spec
                            let pageCounter = 1;
                            for (const step of sequence) {
                                if (pageCounter > 1) doc.addPage('a0', 'landscape');
                                const canvas = selectedSaved.find(c => String(c.id) === String(step.canvasId));
                                if (!canvas) { continue; }
                                if (step.type === 'screen') {
                                    const objsAll = canvas.objects || [];
                                    const canvasKey = String(canvas.id);
                                    let orderedObjs = objsAll.slice();
                                    const ordArr = state.pdfScreenOrder?.[canvasKey];
                                    if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                                        orderedObjs = ordArr.map(i => objsAll[i]).filter(Boolean);
                                    }
                                    const obj = orderedObjs[step.screenIdx] || objsAll[step.screenIdx];
                                    if (obj) drawDetailedObjectPage(doc, obj, pageCounter, totalPages);
                                } else if (step.type === 'map') {
                                    const objs = canvas.objects || [];
                                    const pageTitleObj = { filename: (canvas?.name || `Canvas ${canvas?.id}`) + ' - Output Map' };
                                    drawTemplateElements(doc, pageCounter, totalPages, pageTitleObj);
                                    const tempCanvas = document.createElement('canvas');
                                    const fallbackW = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.x || 0) + (o?.width || 0)), 1920)));
                                    const fallbackH = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.y || 0) + (o?.height || 0)), 1080)));
                                    tempCanvas.width = (typeof canvasMapCanvas?.width === 'number' && canvasMapCanvas.width > 0) ? canvasMapCanvas.width : fallbackW;
                                    tempCanvas.height = (typeof canvasMapCanvas?.height === 'number' && canvasMapCanvas.height > 0) ? canvasMapCanvas.height : fallbackH;
                                    const tctx = tempCanvas.getContext('2d', { alpha: true });
                                    tctx.fillStyle = (state.canvasBgColor || '#000000'); tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                                    const imageLoadPromises = objs.map(objData => new Promise((resolve, reject) => {
                                        try { const img = new Image(); img.onload = () => resolve({ img, data: objData }); img.onerror = () => reject(new Error('Failed to load image for ' + (objData?.filename || 'object'))); img.src = objData.dataUrl; } catch (e) { reject(e); }
                                    }));
                                    const results = await Promise.allSettled(imageLoadPromises);
                                    results.forEach(r => { if (r.status !== 'fulfilled') return; const { img, data } = r.value; tctx.save(); const cx = (data?.x || 0) + (data?.width || 0) / 2; const cy = (data?.y || 0) + (data?.height || 0) / 2; tctx.translate(cx, cy); const rot = (data?.rotation || 0) * Math.PI / 180; tctx.rotate(rot); tctx.drawImage(img, -(data?.width || 0) / 2, -(data?.height || 0) / 2, (data?.width || 0), (data?.height || 0)); if (state.canvasMapShowCoordinates) { const positionText = `(${Math.round(data?.x || 0)}, ${Math.round(data?.y || 0)})`; tctx.font = '16px Segoe UI'; const textMetrics = tctx.measureText(positionText); const textWidth = textMetrics.width; const textHeight = 16; const padding = 5; const rectX = -(data?.width || 0) / 2; const rectY = -(data?.height || 0) / 2; tctx.fillStyle = 'rgba(23, 162, 184, 0.85)'; tctx.fillRect(rectX, rectY, textWidth + padding * 2, textHeight + padding * 2); tctx.fillStyle = 'white'; tctx.textBaseline = 'top'; tctx.fillText(positionText, rectX + padding, rectY + padding); } tctx.restore(); });
                                    const canvasImage = tempCanvas.toDataURL('image/png');
                                    try { const imgProps = doc.getImageProperties(canvasImage); const pageWidth = doc.internal.pageSize.getWidth(); const pageHeight = doc.internal.pageSize.getHeight(); const rightColumnX = pageWidth - 138; const availableX = 10; const availableY = 10; const availableWidth = rightColumnX - 15; const availableHeight = pageHeight - 20; const aspectRatio = imgProps.width / imgProps.height; let imgWidth = availableWidth; let imgHeight = imgWidth / aspectRatio; if (imgHeight > availableHeight) { imgHeight = availableHeight; imgWidth = imgHeight * aspectRatio; } const imgX = availableX + (availableWidth - imgWidth) / 2; const imgY = availableY + (availableHeight - imgHeight) / 2; doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight); } catch { }
                                }
                                pageCounter++;
                            }
                            // Final spec page
                            drawMediaServerSpecPage(doc, totalPages);
                        } else {
                            // Grouped mode (existing behavior)
                            let totalPages = 1; // spec page
                            const order = (Array.isArray(state.pdfPageOrder) && state.pdfPageOrder.length === selectedSaved.length)
                                ? state.pdfPageOrder.slice()
                                : Array.from({ length: selectedSaved.length }, (_, i) => i);
                            order.forEach((ordIdx) => {
                                const sc = selectedSaved[ordIdx];
                                totalPages += (sc?.objects?.length || 0);
                                if (useMap) totalPages += 1;
                            });
                            let pageCounter = 1;
                            for (const ordIdx of order) {
                                const savedCanvas = selectedSaved[ordIdx];
                                const objsAll = savedCanvas?.objects || [];
                                const canvasKey = String(savedCanvas.id ?? ordIdx);
                                let objs = objsAll.slice();
                                const ordArr = state.pdfScreenOrder?.[canvasKey];
                                if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                                    objs = ordArr.map(i => objsAll[i]).filter(Boolean);
                                }
                                for (let i = 0; i < objs.length; i++) {
                                    const obj = objs[i];
                                    if (pageCounter > 1) doc.addPage('a0', 'landscape');
                                    drawDetailedObjectPage(doc, obj, pageCounter, totalPages);
                                    pageCounter++;
                                }
                                if (useMap) {
                                    if (pageCounter > 1) doc.addPage('a0', 'landscape');
                                    const pageTitleObj = { filename: (savedCanvas?.name || `Canvas ${savedCanvas?.id}`) + ' - Output Map' };
                                    drawTemplateElements(doc, pageCounter, totalPages, pageTitleObj);
                                    const tempCanvas = document.createElement('canvas');
                                    const fallbackW = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.x || 0) + (o?.width || 0)), 1920)));
                                    const fallbackH = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.y || 0) + (o?.height || 0)), 1080)));
                                    tempCanvas.width = (typeof canvasMapCanvas?.width === 'number' && canvasMapCanvas.width > 0) ? canvasMapCanvas.width : fallbackW;
                                    tempCanvas.height = (typeof canvasMapCanvas?.height === 'number' && canvasMapCanvas.height > 0) ? canvasMapCanvas.height : fallbackH;
                                    const tctx = tempCanvas.getContext('2d', { alpha: true });
                                    tctx.fillStyle = (state.canvasBgColor || '#000000'); tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                                    const imageLoadPromises = objs.map(objData => new Promise((resolve, reject) => {
                                        try { const img = new Image(); img.onload = () => resolve({ img, data: objData }); img.onerror = () => reject(new Error('Failed to load image for ' + (objData?.filename || 'object'))); img.src = objData.dataUrl; } catch (e) { reject(e); }
                                    }));
                                    const results = await Promise.allSettled(imageLoadPromises);
                                    results.forEach(r => { if (r.status !== 'fulfilled') return; const { img, data } = r.value; tctx.save(); const cx = (data?.x || 0) + (data?.width || 0) / 2; const cy = (data?.y || 0) + (data?.height || 0) / 2; tctx.translate(cx, cy); const rot = (data?.rotation || 0) * Math.PI / 180; tctx.rotate(rot); tctx.drawImage(img, -(data?.width || 0) / 2, -(data?.height || 0) / 2, (data?.width || 0), (data?.height || 0)); if (state.canvasMapShowCoordinates) { const positionText = `(${Math.round(data?.x || 0)}, ${Math.round(data?.y || 0)})`; tctx.font = '16px Segoe UI'; const textMetrics = tctx.measureText(positionText); const textWidth = textMetrics.width; const textHeight = 16; const padding = 5; const rectX = -(data?.width || 0) / 2; const rectY = -(data?.height || 0) / 2; tctx.fillStyle = 'rgba(23, 162, 184, 0.85)'; tctx.fillRect(rectX, rectY, textWidth + padding * 2, textHeight + padding * 2); tctx.fillStyle = 'white'; tctx.textBaseline = 'top'; tctx.fillText(positionText, rectX + padding, rectY + padding); } tctx.restore(); });
                                    const canvasImage = tempCanvas.toDataURL('image/png');
                                    try { const imgProps = doc.getImageProperties(canvasImage); const pageWidth = doc.internal.pageSize.getWidth(); const pageHeight = doc.internal.pageSize.getHeight(); const rightColumnX = pageWidth - 138; const availableX = 10; const availableY = 10; const availableWidth = rightColumnX - 15; const availableHeight = pageHeight - 20; const aspectRatio = imgProps.width / imgProps.height; let imgWidth = availableWidth; let imgHeight = imgWidth / aspectRatio; if (imgHeight > availableHeight) { imgHeight = availableHeight; imgWidth = imgHeight * aspectRatio; } const imgX = availableX + (availableWidth - imgWidth) / 2; const imgY = availableY + (availableHeight - imgHeight) / 2; doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight); } catch { }
                                    pageCounter++;
                                }
                            }
                            drawMediaServerSpecPage(doc, totalPages);
                        }

                        const finalFilename = state.pdfFilename.trim() ? `${state.pdfFilename}_selected` : 'selected_canvases';
                        doc.save(`${finalFilename}.pdf`);
                    } catch (e) {
                        console.error('Export selected canvases failed:', e);
                        showMessageBox(e?.message || 'Failed to export selected canvases.');
                    } finally {
                        try { hidePdfToast(); } catch { }
                        if (btn) { btn.disabled = false; btn.textContent = prevText; }
                    }
                };

                // Wire main Export PDF button to export the selection from Canvas List
                exportCanvasPdfBtn.addEventListener('click', exportSelectedCanvasesPdf);
        exportCanvasPdfBtnNew.addEventListener('click', showMultiExportModal);

                // Simple floating toast for PDF generation status
                const showPdfToast = (text) => {
                    try {
                        const container = document.getElementById('pdfToastContainer');
                        if (!container) return;
                        container.innerHTML = '';
                        const el = document.createElement('div');
                        el.className = 'pdf-toast';
                        el.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${text}`;
                        container.appendChild(el);
                        container.classList.remove('d-none');
                    } catch { }
                };
                const hidePdfToast = () => {
                    try {
                        const container = document.getElementById('pdfToastContainer');
                        if (!container) return;
                        container.classList.add('d-none');
                        container.innerHTML = '';
                    } catch { }
                };

                // PDF page sidebar state: maintain an order of object indices for preview/export
                if (!Array.isArray(state.pdfPageOrder)) state.pdfPageOrder = [];
                // Arrange mode: 'flat' (free order) or 'grouped' (by canvas)
                if (!state.pdfArrangeMode) state.pdfArrangeMode = 'flat';

                const pdfRefreshPreviewBtn = document.getElementById('pdfRefreshPreviewBtn');
                if (pdfRefreshPreviewBtn) {
                    pdfRefreshPreviewBtn.addEventListener('click', () => {
                        state.pdfPreviewDirty = true;
                        generatePdfPreview();
                    });
                }

                const pdfResetOrderBtn = document.getElementById('pdfResetOrderBtn');
                const pdfPageList = document.getElementById('pdfPageList');
                const pdfSidebarTabCanvas = document.getElementById('pdfSidebarTabCanvas');
                const pdfSidebarTabPages = document.getElementById('pdfSidebarTabPages');
                const pdfCanvasList = document.getElementById('pdfCanvasList');
                const pdfPageListContainer = document.getElementById('pdfPageListContainer');
                const pdfArrangeModeSelect = document.getElementById('pdfArrangeModeSelect');
                const pdfCanvasListBody = document.getElementById('pdfCanvasListBody');
                const pdfCanvasListEmpty = document.getElementById('pdfCanvasListEmpty');
                const pdfCanvasSelectAll = document.getElementById('pdfCanvasSelectAll');
                const pdfCanvasClearAll = document.getElementById('pdfCanvasClearAll');
                const pdfCanvasSelectionCount = document.getElementById('pdfCanvasSelectionCount');
                const pdfCanvasFilterInput = document.getElementById('pdfCanvasFilter');
                const pdfImageZoomModeSelect = document.getElementById('pdfImageZoomMode');
                const pdfImageZoomScaleGroup = document.getElementById('pdfImageZoomScaleGroup');
                const pdfImageZoomInBtn = document.getElementById('pdfImageZoomIn');
                const pdfImageZoomOutBtn = document.getElementById('pdfImageZoomOut');
                const pdfImageZoomValueInput = document.getElementById('pdfImageZoomValue');

                // Lite preview toggle wiring
                if (pdfLitePreviewToggle) {
                    const reflectLite = () => {
                        pdfLitePreviewToggle.textContent = `Lite Preview: ${state.pdfPreviewLite ? 'On' : 'Off'}`;
                    };
                    reflectLite();
                    pdfLitePreviewToggle.addEventListener('click', () => {
                        state.pdfPreviewLite = !state.pdfPreviewLite;
                        reflectLite();
                        state.pdfPreviewDirty = true; schedulePdfPreview?.();
                    });
                }

                // Preview engine toggle wiring
                if (pdfPreviewEngineToggle) {
                    const reflectEngine = () => {
                        const name = state.pdfPreviewEngine === 'image' ? 'Image' : 'Iframe';
                        pdfPreviewEngineToggle.textContent = `Preview Mode: ${name}`;
                        // Show zoom controls only in image preview mode
                        try {
                            const zc = document.getElementById('pdfImageZoomControls');
                            if (zc) zc.style.display = (state.pdfPreviewEngine === 'image') ? 'flex' : 'none';
                        } catch { }
                    };
                    reflectEngine();
                    pdfPreviewEngineToggle.addEventListener('click', () => {
                        state.pdfPreviewEngine = state.pdfPreviewEngine === 'image' ? 'iframe' : 'image';
                        reflectEngine();
                        state.pdfPreviewDirty = true; schedulePdfPreview?.();
                    });
                }

                // Image preview zoom wiring
                const applyImageZoomStyles = () => {
                    const container = document.getElementById('pdfPreviewImageContent');
                    if (!container) return;
                    const imgs = container.querySelectorAll('.pdf-image-page img');
                    const mode = state.pdfImagePreviewZoomMode || 'fit';
                    const scale = Math.max(0.25, Math.min(4, Number(state.pdfImagePreviewScale || 1)));
                    imgs.forEach(img => {
                        if (mode === 'fit') {
                            img.style.width = '100%';
                            img.style.maxWidth = '100%';
                            img.style.transform = '';
                            img.style.transformOrigin = '';
                        } else {
                            img.style.width = '';
                            img.style.maxWidth = '';
                            img.style.transformOrigin = 'top left';
                            img.style.transform = `scale(${scale})`;
                        }
                    });
                    // Reflect UI controls
                    if (pdfImageZoomModeSelect) pdfImageZoomModeSelect.value = mode;
                    if (pdfImageZoomScaleGroup) pdfImageZoomScaleGroup.style.display = (mode === 'scale') ? 'flex' : 'none';
                    if (pdfImageZoomValueInput) pdfImageZoomValueInput.value = `${Math.round(scale * 100)}%`;
                };
                const reflectZoomControlsOnly = () => {
                    if (pdfImageZoomModeSelect) pdfImageZoomModeSelect.value = state.pdfImagePreviewZoomMode || 'fit';
                    if (pdfImageZoomScaleGroup) pdfImageZoomScaleGroup.style.display = (state.pdfImagePreviewZoomMode === 'scale') ? 'flex' : 'none';
                    if (pdfImageZoomValueInput) pdfImageZoomValueInput.value = `${Math.round((state.pdfImagePreviewScale || 1) * 100)}%`;
                };
                if (pdfImageZoomModeSelect) {
                    reflectZoomControlsOnly();
                    pdfImageZoomModeSelect.addEventListener('change', () => {
                        state.pdfImagePreviewZoomMode = pdfImageZoomModeSelect.value === 'scale' ? 'scale' : 'fit';
                        // No need to regenerate preview; just restyle
                        applyImageZoomStyles();
                    });
                }
                if (pdfImageZoomInBtn) {
                    pdfImageZoomInBtn.addEventListener('click', () => {
                        if (state.pdfImagePreviewZoomMode !== 'scale') return;
                        state.pdfImagePreviewScale = Math.min(4, (state.pdfImagePreviewScale || 1) + 0.25);
                        applyImageZoomStyles();
                    });
                }
                if (pdfImageZoomOutBtn) {
                    pdfImageZoomOutBtn.addEventListener('click', () => {
                        if (state.pdfImagePreviewZoomMode !== 'scale') return;
                        state.pdfImagePreviewScale = Math.max(0.25, (state.pdfImagePreviewScale || 1) - 0.25);
                        applyImageZoomStyles();
                    });
                }
                if (pdfImageZoomValueInput) {
                    pdfImageZoomValueInput.addEventListener('change', () => {
                        if (state.pdfImagePreviewZoomMode !== 'scale') return;
                        const val = String(pdfImageZoomValueInput.value || '').trim().replace('%', '');
                        const num = parseFloat(val);
                        if (!isNaN(num)) {
                            state.pdfImagePreviewScale = Math.max(0.25, Math.min(4, num / 100));
                            applyImageZoomStyles();
                        } else {
                            reflectZoomControlsOnly();
                        }
                    });
                }

                // Track selected canvases for PDF (default: all saved)
                if (!Array.isArray(state.pdfSelectedCanvasIds)) state.pdfSelectedCanvasIds = [];
                const ensureSelectedDefaults = () => {
                    if (!Array.isArray(state.savedCanvases)) state.savedCanvases = [];
                    const mode = state.pdfSelectionMode || 'all';
                    if (mode === 'all') {
                        // Always include all saved canvases so new ones are auto-selected
                        state.pdfSelectedCanvasIds = state.savedCanvases.map(c => String(c.id));
                    } else {
                    // Custom mode: don't override user's manual selection
                        if (state.pdfSelectedCanvasIds.length === 0 && state.savedCanvases.length > 0) {
                            // First-time safety: preselect all once
                            state.pdfSelectedCanvasIds = state.savedCanvases.map(c => String(c.id));
                        }
                    }
                };

                const setSidebarMode = (mode) => {
                    // mode: 'canvas' | 'pages'
                    const isCanvas = mode === 'canvas';
                    pdfSidebarTabCanvas?.classList.toggle('active', isCanvas);
                    pdfSidebarTabPages?.classList.toggle('active', !isCanvas);
                    pdfCanvasList?.classList.toggle('d-none', !isCanvas);
                    pdfCanvasList?.classList.toggle('d-block', isCanvas);
                    pdfPageListContainer?.classList.toggle('d-none', isCanvas);
                    if (!isCanvas) buildPdfPageSidebar();
                };

                pdfSidebarTabCanvas?.addEventListener('click', () => setSidebarMode('canvas'));
                pdfSidebarTabPages?.addEventListener('click', () => setSidebarMode('pages'));

                const renderPdfCanvasList = () => {
                    if (!pdfCanvasListBody || !pdfCanvasListEmpty) return;
                    ensureSelectedDefaults();
                    pdfCanvasListBody.innerHTML = '';
                    let canvases = Array.isArray(state.savedCanvases) ? state.savedCanvases.slice() : [];
                    // Apply filter if present
                    const q = (pdfCanvasFilterInput?.value || '').trim().toLowerCase();
                    if (q) {
                        canvases = canvases.filter(c => (c.name || ('Canvas ' + c.id)).toLowerCase().includes(q));
                    }
                    if (canvases.length === 0) {
                        pdfCanvasListEmpty.classList.remove('d-none');
                        if (pdfCanvasSelectionCount) pdfCanvasSelectionCount.textContent = '0 selected';
                        return;
                    }
                    pdfCanvasListEmpty.classList.add('d-none');
                    let selectedCount = 0;
                    canvases.forEach(c => {
                        const row = document.createElement('label');
                        row.className = 'd-flex align-items-center gap-2 small pdf-canvas-row';
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.className = 'form-check-input';
                        cb.value = String(c.id);
                        cb.checked = state.pdfSelectedCanvasIds.includes(String(c.id));
                        if (cb.checked) selectedCount++;
                        cb.addEventListener('change', () => {
                            // Any manual checkbox change switches to custom selection mode
                            state.pdfSelectionMode = 'custom';
                            const id = String(c.id);
                            if (cb.checked) {
                                if (!state.pdfSelectedCanvasIds.includes(id)) state.pdfSelectedCanvasIds.push(id);
                            } else {
                                state.pdfSelectedCanvasIds = state.pdfSelectedCanvasIds.filter(x => x !== id);
                            }
                            if (pdfCanvasSelectionCount) {
                                const selSet = new Set(state.pdfSelectedCanvasIds.map(String));
                                pdfCanvasSelectionCount.textContent = `${selSet.size} selected`;
                            }
                            // When selection changes, rebuild order to only include selected
                            buildPdfPageSidebar();
                            state.pdfPreviewDirty = true;
                            schedulePdfPreview?.();
                        });
                        const name = document.createElement('span');
                        name.textContent = c.name || `Canvas ${c.id}`;
                        row.appendChild(cb);
                        row.appendChild(name);
                        pdfCanvasListBody.appendChild(row);
                    });
                    if (pdfCanvasSelectionCount) pdfCanvasSelectionCount.textContent = `${selectedCount} selected`;
                };

                pdfCanvasSelectAll?.addEventListener('click', () => {
                    if (!Array.isArray(state.savedCanvases)) return;
                    state.pdfSelectionMode = 'all';
                    state.pdfSelectedCanvasIds = state.savedCanvases.map(c => String(c.id));
                    renderPdfCanvasList();
                    buildPdfPageSidebar();
                    state.pdfPreviewDirty = true; schedulePdfPreview?.();
                });
                pdfCanvasClearAll?.addEventListener('click', () => {
                    state.pdfSelectionMode = 'custom';
                    state.pdfSelectedCanvasIds = [];
                    renderPdfCanvasList();
                    buildPdfPageSidebar();
                    state.pdfPreviewDirty = true; schedulePdfPreview?.();
                });
                pdfCanvasFilterInput?.addEventListener('input', () => {
                    renderPdfCanvasList();
                });
                const buildPdfPageSidebar = () => {
                    // Helper: create a small live preview for a canvas (Output Map) into an <img>
                    const renderMapThumb = (objs, imgEl) => {
                        try {
                            const TW = 56, TH = 40; // match .thumb for header; sub thumb is 40x28 but we can reuse
                            const c = document.createElement('canvas'); c.width = TW; c.height = TH;
                            const ctx = c.getContext('2d', { alpha: true });
                            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, TW, TH);
                            // Compute bounding box to fit all objects
                            let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
                            (objs || []).forEach(o => {
                                const x = (o?.x || 0), y = (o?.y || 0), w = (o?.width || 0), h = (o?.height || 0);
                                minX = Math.min(minX, x); minY = Math.min(minY, y);
                                maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
                            });
                            if (!isFinite(minX) || !isFinite(minY) || maxX <= minX || maxY <= minY) {
                                imgEl.src = c.toDataURL('image/png');
                                return;
                            }
                            const bw = maxX - minX, bh = maxY - minY;
                            const scale = Math.min(TW / (bw || 1), TH / (bh || 1));
                            const offX = (TW - bw * scale) / 2;
                            const offY = (TH - bh * scale) / 2;
                            // Draw quickly using existing screen images
                            let pending = 0; let drewAny = false;
                            const tryFinish = () => { if (pending === 0 && drewAny) { imgEl.src = c.toDataURL('image/png'); } };
                            (objs || []).slice(0, 8).forEach(o => { // cap to 8 for speed
                                if (!o?.dataUrl) return;
                                const img = new Image();
                                pending++;
                                img.onload = () => {
                                    try {
                                        const dx = (o.x - minX) * scale + offX;
                                        const dy = (o.y - minY) * scale + offY;
                                        const dw = (o.width || 0) * scale;
                                        const dh = (o.height || 0) * scale;
                                        ctx.save();
                                        if (o.rotation) {
                                            const cx = dx + dw / 2, cy = dy + dh / 2;
                                            ctx.translate(cx, cy);
                                            ctx.rotate((o.rotation || 0) * Math.PI / 180);
                                            ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
                                            ctx.restore();
                                        } else {
                                            ctx.drawImage(img, dx, dy, dw, dh);
                                        }
                                        drewAny = true;
                                    } catch { }
                                    pending--; tryFinish();
                                };
                                img.onerror = () => { pending--; tryFinish(); };
                                img.src = o.dataUrl;
                            });
                            // If nothing loaded (e.g., no objs), set placeholder immediately
                            setTimeout(() => { tryFinish(); }, 50);
                        } catch { }
                    };

                    // Lightweight context menu
                    let ctxMenuEl = document.getElementById('pdfContextMenu');
                    const ensureCtxMenu = () => {
                        if (ctxMenuEl) return ctxMenuEl;
                        ctxMenuEl = document.createElement('div');
                        ctxMenuEl.id = 'pdfContextMenu';
                        ctxMenuEl.style.position = 'fixed';
                        ctxMenuEl.style.zIndex = '1061';
                        ctxMenuEl.style.background = 'var(--card-bg, #fff)';
                        ctxMenuEl.style.border = '1px solid var(--border-color, #dee2e6)';
                        ctxMenuEl.style.borderRadius = '8px';
                        ctxMenuEl.style.boxShadow = '0 10px 24px rgba(0,0,0,.18)';
                        ctxMenuEl.style.padding = '6px';
                        ctxMenuEl.style.minWidth = '160px';
                        ctxMenuEl.style.display = 'none';
                        document.body.appendChild(ctxMenuEl);
                        document.addEventListener('click', () => { ctxMenuEl.style.display = 'none'; });
                        return ctxMenuEl;
                    };
                    const showContextMenu = (e, actions) => {
                        const menu = ensureCtxMenu();
                        menu.innerHTML = '';
                        actions.forEach(({ label, onClick }) => {
                            const btn = document.createElement('button');
                            btn.className = 'btn btn-sm w-100 text-start';
                            btn.style.background = 'transparent';
                            btn.style.border = 'none';
                            btn.style.padding = '6px 8px';
                            btn.textContent = label;
                            btn.addEventListener('click', (ev) => { ev.stopPropagation(); menu.style.display = 'none'; onClick?.(); });
                            menu.appendChild(btn);
                        });
                        menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
                        menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
                        menu.style.display = 'block';
                    };
                    const moveArrayItem = (arr, from, to) => { if (!arr) return arr; const a = arr.slice(); const [m] = a.splice(from, 1); a.splice(Math.max(0, Math.min(a.length, to)), 0, m); return a; };
                    const promptRename = (initial) => {
                        const name = window.prompt('Rename page', String(initial || ''));
                        if (name == null) return null; // cancel
                        const trimmed = name.trim();
                        return trimmed.length ? trimmed : null;
                    };
                    if (!pdfPageList) return;
                    pdfPageList.innerHTML = '';
                    // Build a full visual outline of the resulting PDF: per selected canvas â†’ its screens â†’ optional map
                    const usingSaved = Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0;
                    // Ensure all canvases are selected by default if none chosen yet
                    try { if (usingSaved && typeof ensureSelectedDefaults === 'function') ensureSelectedDefaults(); } catch { }
                    let dataset = [];
                    if (usingSaved) {
                        ensureSelectedDefaults();
                        const sel = new Set(state.pdfSelectedCanvasIds.map(String));
                        dataset = state.savedCanvases.filter(c => sel.has(String(c.id)));
                    } else {
                        // Single block representing current PixelMap objects
                        dataset = [{ name: 'Current Canvas', id: 'current', objects: (state.canvasMapObjects || []) }];
                    }
                    const mode = state.pdfArrangeMode || 'flat';

                    // Helper: build flat pages [{type:'screen'|'map', canvasIdx, canvasId, screenIdx, title, data}]
                    const buildFlat = () => {
                        const pages = [];
                        // Determine canvas order
                        const n = dataset.length;
                        const canvasOrder = (Array.isArray(state.pdfPageOrder) && state.pdfPageOrder.length === n)
                            ? state.pdfPageOrder.slice()
                            : Array.from({ length: n }, (_, i) => i);
                        canvasOrder.forEach((idxInDataset) => {
                            const block = dataset[idxInDataset] || { objects: [] };
                            const objsAll = Array.isArray(block.objects) ? block.objects : [];
                            const canvasKey = usingSaved ? String(block.id ?? block._id ?? idxInDataset) : String(block.id || 'current');
                            // Per-canvas screen order
                            if (!state.pdfScreenOrder) state.pdfScreenOrder = {};
                            if (!Array.isArray(state.pdfScreenOrder[canvasKey]) || state.pdfScreenOrder[canvasKey].length !== objsAll.length) {
                                state.pdfScreenOrder[canvasKey] = Array.from({ length: objsAll.length }, (_, i) => i);
                            }
                            const ord = state.pdfScreenOrder[canvasKey].slice();
                            ord.forEach((objIdx) => {
                                const obj = objsAll[objIdx];
                                pages.push({ type: 'screen', canvasIdx: idxInDataset, canvasId: block.id, screenIdx: objIdx, title: obj?.filename || 'Screen', data: obj });
                            });
                            if (state.pdfIncludeCanvasSnapshot) {
                                pages.push({ type: 'map', canvasIdx: idxInDataset, canvasId: block.id, screenIdx: null, title: (block.name || block.filename || 'Canvas') + ' - Output Map', data: { objects: objsAll, block } });
                            }
                        });
                        // Spec page is logical; not draggable
                        return pages;
                    };

                    if (mode === 'flat') {
                        // Build flat array and persist order in state.pdfFlatOrder as indices into the generated pages
                        const pages = buildFlat();
                        const total = pages.length + 1; // +1 spec
                        if (!Array.isArray(state.pdfFlatOrder) || state.pdfFlatOrder.length !== pages.length) {
                            state.pdfFlatOrder = Array.from({ length: pages.length }, (_, i) => i);
                        }
                        let pageNumberCounter = 1;
                        state.pdfFlatOrder.forEach((idx, displayPos) => {
                            const p = pages[idx];
                            const item = document.createElement('div');
                            item.className = 'pdf-page-sub';
                            item.dataset.kind = (p.type === 'map') ? 'map' : 'screen';
                            item.setAttribute('draggable', 'true');
                            item.dataset.pos = String(displayPos);
                            item.dataset.kind = p.type;
                            if (typeof p.canvasIdx === 'number') item.dataset.canvasIdx = String(p.canvasIdx);
                            if (typeof p.screenIdx === 'number') item.dataset.screenIdx = String(p.screenIdx);
                            if (p.canvasId != null) item.dataset.canvasId = String(p.canvasId);
                            const t = document.createElement('span'); t.className = 'thumb';
                            const tImg = document.createElement('img');
                            t.appendChild(tImg);
                            const m = document.createElement('div'); m.className = 'meta';
                            const ti = document.createElement('div'); ti.className = 'title'; ti.textContent = (p.type === 'map') ? p.title : (p.data?.filename || p.title);
                            const sb = document.createElement('div'); sb.className = 'sub'; sb.textContent = `Page ${pageNumberCounter}`;
                            m.appendChild(ti); m.appendChild(sb); item.appendChild(t); item.appendChild(m);
                            // Thumbnail
                            if (p.type === 'screen' && p.data?.dataUrl) { tImg.src = p.data.dataUrl; }
                            else if (p.type === 'map') { const objs = (p.data?.objects || []); renderMapThumb(objs, tImg); }
                            item.addEventListener('dragstart', (e) => { item.classList.add('dragging'); e.dataTransfer.setData('text/plain', item.dataset.pos || '0'); e.dataTransfer.effectAllowed = 'move'; });
                            item.addEventListener('dragend', () => item.classList.remove('dragging'));
                            item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drop-target'); });
                            item.addEventListener('dragleave', () => item.classList.remove('drop-target'));
                            item.addEventListener('drop', (e) => {
                                e.preventDefault(); item.classList.remove('drop-target');
                                const from = parseInt(e.dataTransfer.getData('text/plain') || '-1', 10);
                                const to = parseInt(item.dataset.pos || '-1', 10);
                                if (isNaN(from) || isNaN(to) || from === to) return;
                                const order = state.pdfFlatOrder.slice();
                                const [moved] = order.splice(from, 1);
                                order.splice(to, 0, moved);
                                state.pdfFlatOrder = order;
                                buildPdfPageSidebar();
                                state.pdfPreviewDirty = true; schedulePdfPreview?.();
                            });
                            // Context menu
                            item.addEventListener('contextmenu', (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const pos = parseInt(item.dataset.pos || '0', 10);
                                const actions = [
                                    {
                                        label: 'Rename', onClick: () => {
                                            if (item.dataset.kind === 'screen') {
                                                const newName = promptRename(ti.textContent);
                                                if (!newName) return;
                                                const canvasId = item.dataset.canvasId;
                                                const sIdx = parseInt(item.dataset.screenIdx || '-1', 10);
                                                if (canvasId && !isNaN(sIdx)) {
                                                    const sc = (state.savedCanvases || []).find(c => String(c.id) === String(canvasId));
                                                    if (sc && sc.objects[sIdx]) { sc.objects[sIdx].filename = newName; }
                                                } else if (!isNaN(sIdx)) {
                                                    if (state.canvasMapObjects?.[sIdx]) state.canvasMapObjects[sIdx].filename = newName;
                                                }
                                                buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                            }
                                        }
                                    },
                                    { label: 'Move to Top', onClick: () => { state.pdfFlatOrder = moveArrayItem(state.pdfFlatOrder, pos, 0); buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.(); } },
                                    { label: 'Move to Bottom', onClick: () => { state.pdfFlatOrder = moveArrayItem(state.pdfFlatOrder, pos, state.pdfFlatOrder.length - 1); buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.(); } },
                                ];
                                showContextMenu(e, actions);
                            });
                            // Keyboard reordering: Alt+Up/Down to move; Enter to rename
                            item.tabIndex = 0;
                            item.addEventListener('keydown', (e) => {
                                if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                    e.preventDefault();
                                    const pos = parseInt(item.dataset.pos || '0', 10);
                                    const to = e.key === 'ArrowUp' ? Math.max(0, pos - 1) : Math.min(state.pdfFlatOrder.length - 1, pos + 1);
                                    state.pdfFlatOrder = moveArrayItem(state.pdfFlatOrder, pos, to);
                                    buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (item.dataset.kind === 'screen') {
                                        const newName = promptRename(ti.textContent);
                                        if (!newName) return;
                                        const canvasId = item.dataset.canvasId;
                                        const sIdx = parseInt(item.dataset.screenIdx || '-1', 10);
                                        if (canvasId && !isNaN(sIdx)) {
                                            const sc = (state.savedCanvases || []).find(c => String(c.id) === String(canvasId));
                                            if (sc && sc.objects[sIdx]) { sc.objects[sIdx].filename = newName; }
                                        } else if (!isNaN(sIdx)) {
                                            if (state.canvasMapObjects?.[sIdx]) state.canvasMapObjects[sIdx].filename = newName;
                                        }
                                        buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                    }
                                }
                            });
                            pdfPageList.appendChild(item);
                            pageNumberCounter++;
                        });
                        // Persist a stable sequence describing the current order for robust export
                        try {
                            state.pdfFlatSequence = (state.pdfFlatOrder || []).map(i => {
                                const p = pages[i];
                                const canvasId = (p && p.canvasId != null) ? p.canvasId : (typeof p?.canvasIdx === 'number' ? dataset[p.canvasIdx]?.id : undefined);
                                return { type: p?.type, canvasId: canvasId, screenIdx: (typeof p?.screenIdx === 'number' ? p.screenIdx : null) };
                            }).filter(x => x && x.type && x.canvasId != null);
                        } catch { state.pdfFlatSequence = null; }
                        // Spec page indicator
                        const spec = document.createElement('div');
                        spec.className = 'pdf-page-sub';
                        const spThumb = document.createElement('span'); spThumb.className = 'thumb';
                        const spMeta = document.createElement('div'); spMeta.className = 'meta';
                        const spTitle = document.createElement('div'); spTitle.className = 'title'; spTitle.textContent = 'Media Server Specification';
                        const spSub = document.createElement('div'); spSub.className = 'sub'; spSub.textContent = `Page ${pageNumberCounter}`;
                        spMeta.appendChild(spTitle); spMeta.appendChild(spSub);
                        spec.appendChild(spThumb); spec.appendChild(spMeta);
                        pdfPageList.appendChild(spec);
                    } else {
                    // Grouped mode (existing behavior)
                        const n = dataset.length;
                        if (!Array.isArray(state.pdfPageOrder) || state.pdfPageOrder.length !== n) {
                            state.pdfPageOrder = Array.from({ length: n }, (_, i) => i);
                        }
                        let pageNumberCounter = 1;
                        state.pdfPageOrder.forEach((idxInDataset, displayIdx) => {
                            const block = dataset[idxInDataset] || { objects: [] };
                            const objs = Array.isArray(block.objects) ? block.objects : [];
                            // Key to track per-canvas screen order
                            const canvasKey = usingSaved ? String(block.id ?? block._id ?? idxInDataset) : String(block.id || 'current');
                            if (!state.pdfScreenOrder) state.pdfScreenOrder = {};
                            if (!Array.isArray(state.pdfScreenOrder[canvasKey]) || state.pdfScreenOrder[canvasKey].length !== objs.length) {
                                state.pdfScreenOrder[canvasKey] = Array.from({ length: objs.length }, (_, i) => i);
                            }
                            const screenOrder = state.pdfScreenOrder[canvasKey].slice();
                            // Draggable canvas header
                            const header = document.createElement('div');
                            header.className = 'pdf-page-thumb';
                            header.dataset.kind = 'canvas';
                            header.setAttribute('draggable', 'true');
                            header.dataset.idx = String(displayIdx);
                            const hThumb = document.createElement('span'); hThumb.className = 'thumb';
                            const hImg = document.createElement('img'); hThumb.appendChild(hImg);
                            const hMeta = document.createElement('div'); hMeta.className = 'meta';
                            const hTitle = document.createElement('div'); hTitle.className = 'title';
                            hTitle.textContent = (block.name || block.filename || `Canvas ${displayIdx + 1}`);
                            const hSub = document.createElement('div'); hSub.className = 'sub'; hSub.textContent = `Starts at page ${pageNumberCounter}`;
                            hMeta.appendChild(hTitle); hMeta.appendChild(hSub);
                            header.appendChild(hThumb); header.appendChild(hMeta);
                            // Canvas thumbnail: render map of its objects
                            renderMapThumb(objs, hImg);
                            header.addEventListener('dragstart', (e) => { header.classList.add('dragging'); e.dataTransfer.setData('text/plain', header.dataset.idx || '0'); e.dataTransfer.effectAllowed = 'move'; });
                            header.addEventListener('dragend', () => header.classList.remove('dragging'));
                            header.addEventListener('dragover', (e) => { e.preventDefault(); header.classList.add('drop-target'); });
                            header.addEventListener('dragleave', () => header.classList.remove('drop-target'));
                            header.addEventListener('drop', (e) => {
                                e.preventDefault(); header.classList.remove('drop-target');
                                const fromStr = e.dataTransfer.getData('text/plain');
                                const from = parseInt(fromStr, 10);
                                const to = parseInt(header.dataset.idx || '0', 10);
                                if (isNaN(from) || isNaN(to) || from === to) return;
                                const order = state.pdfPageOrder.slice();
                                const [moved] = order.splice(from, 1);
                                order.splice(to, 0, moved);
                                state.pdfPageOrder = order;
                                buildPdfPageSidebar();
                                state.pdfPreviewDirty = true; schedulePdfPreview?.();
                            });
                            // Context menu for canvas header
                            header.addEventListener('contextmenu', (e) => {
                                e.preventDefault(); e.stopPropagation();
                                const idx = parseInt(header.dataset.idx || '0', 10);
                                const actions = [
                                    {
                                        label: 'Rename Canvas', onClick: () => {
                                            const newName = promptRename(hTitle.textContent);
                                            if (!newName) return;
                                            if (block && block.name != null) { block.name = newName; }
                                            else if (usingSaved) {
                                                const sc = (state.savedCanvases || [])[idxInDataset];
                                                if (sc) sc.name = newName;
                                            }
                                            buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                        }
                                    },
                                    { label: 'Move to Top', onClick: () => { state.pdfPageOrder = moveArrayItem(state.pdfPageOrder, idx, 0); buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.(); } },
                                    { label: 'Move to Bottom', onClick: () => { state.pdfPageOrder = moveArrayItem(state.pdfPageOrder, idx, state.pdfPageOrder.length - 1); buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.(); } },
                                ];
                                showContextMenu(e, actions);
                            });
                            // Keyboard for header
                            header.tabIndex = 0;
                            header.addEventListener('keydown', (e) => {
                                if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                    e.preventDefault();
                                    const idx = parseInt(header.dataset.idx || '0', 10);
                                    const to = e.key === 'ArrowUp' ? Math.max(0, idx - 1) : Math.min(state.pdfPageOrder.length - 1, idx + 1);
                                    state.pdfPageOrder = moveArrayItem(state.pdfPageOrder, idx, to);
                                    buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const newName = promptRename(hTitle.textContent);
                                    if (!newName) return;
                                    if (block && block.name != null) { block.name = newName; }
                                    else if (usingSaved) {
                                        const sc = (state.savedCanvases || [])[idxInDataset];
                                        if (sc) sc.name = newName;
                                    }
                                    buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                }
                            });
                            pdfPageList.appendChild(header);
                            // Screens within this canvas
                            screenOrder.forEach((objIdx, pos) => {
                                const obj = objs[objIdx];
                                const sub = document.createElement('div');
                                sub.className = 'pdf-page-sub';
                                sub.dataset.kind = 'screen';
                                sub.dataset.canvasId = String(block.id ?? '');
                                sub.setAttribute('draggable', 'true');
                                sub.dataset.canvasKey = canvasKey;
                                sub.dataset.pos = String(pos);
                                const sThumb = document.createElement('span'); sThumb.className = 'thumb';
                                const sImg = document.createElement('img'); sThumb.appendChild(sImg);
                                const sMeta = document.createElement('div'); sMeta.className = 'meta';
                                const sTitle = document.createElement('div'); sTitle.className = 'title'; sTitle.textContent = (obj?.filename || `Screen ${objIdx + 1}`);
                                const sSub = document.createElement('div'); sSub.className = 'sub'; sSub.textContent = `Page ${pageNumberCounter}`;
                                sMeta.appendChild(sTitle); sMeta.appendChild(sSub);
                                sub.appendChild(sThumb); sub.appendChild(sMeta);
                                if (obj?.dataUrl) sImg.src = obj.dataUrl;
                                sub.addEventListener('dragstart', (e) => {
                                    sub.classList.add('dragging');
                                    e.dataTransfer.setData('text/plain', JSON.stringify({ canvasKey, from: pos }));
                                    e.dataTransfer.effectAllowed = 'move';
                                });
                                sub.addEventListener('dragend', () => sub.classList.remove('dragging'));
                                sub.addEventListener('dragover', (e) => { e.preventDefault(); sub.classList.add('drop-target'); });
                                sub.addEventListener('dragleave', () => sub.classList.remove('drop-target'));
                                sub.addEventListener('drop', (e) => {
                                    e.preventDefault(); sub.classList.remove('drop-target');
                                    try {
                                        const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
                                        if (!payload || payload.canvasKey !== canvasKey) return;
                                        const from = parseInt(payload.from, 10);
                                        const to = parseInt(sub.dataset.pos || '0', 10);
                                        if (isNaN(from) || isNaN(to) || from === to) return;
                                        const ord = (state.pdfScreenOrder[canvasKey] || []).slice();
                                        const [moved] = ord.splice(from, 1);
                                        ord.splice(to, 0, moved);
                                        state.pdfScreenOrder[canvasKey] = ord;
                                        buildPdfPageSidebar();
                                        state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                    } catch { }
                                });
                                // Context menu for screen
                                sub.addEventListener('contextmenu', (e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    const actions = [
                                        {
                                            label: 'Rename', onClick: () => {
                                                const newName = promptRename(sTitle.textContent);
                                                if (!newName) return;
                                                if (usingSaved) {
                                                    const sc = (state.savedCanvases || [])[idxInDataset];
                                                    const realIdx = screenOrder[pos];
                                                    if (sc && sc.objects[realIdx]) sc.objects[realIdx].filename = newName;
                                                } else {
                                                    const realIdx = screenOrder[pos];
                                                    if (state.canvasMapObjects?.[realIdx]) state.canvasMapObjects[realIdx].filename = newName;
                                                }
                                                buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                            }
                                        },
                                        { label: 'Move to Top', onClick: () => { const ord = (state.pdfScreenOrder[canvasKey] || []).slice(); const [m] = ord.splice(pos, 1); ord.splice(0, 0, m); state.pdfScreenOrder[canvasKey] = ord; buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.(); } },
                                        { label: 'Move to Bottom', onClick: () => { const ord = (state.pdfScreenOrder[canvasKey] || []).slice(); const [m] = ord.splice(pos, 1); ord.splice(ord.length, 0, m); state.pdfScreenOrder[canvasKey] = ord; buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.(); } },
                                    ];
                                    showContextMenu(e, actions);
                                });
                                // Keyboard for screen
                                sub.tabIndex = 0;
                                sub.addEventListener('keydown', (e) => {
                                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                        e.preventDefault();
                                        const ord = (state.pdfScreenOrder[canvasKey] || []).slice();
                                        const to = e.key === 'ArrowUp' ? Math.max(0, pos - 1) : Math.min(ord.length - 1, pos + 1);
                                        const [m] = ord.splice(pos, 1); ord.splice(to, 0, m); state.pdfScreenOrder[canvasKey] = ord;
                                        buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                    } else if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const newName = promptRename(sTitle.textContent);
                                        if (!newName) return;
                                        if (usingSaved) {
                                            const sc = (state.savedCanvases || [])[idxInDataset]; const realIdx = screenOrder[pos];
                                            if (sc && sc.objects[realIdx]) sc.objects[realIdx].filename = newName;
                                        } else {
                                            const realIdx = screenOrder[pos]; if (state.canvasMapObjects?.[realIdx]) state.canvasMapObjects[realIdx].filename = newName;
                                        }
                                        buildPdfPageSidebar(); state.pdfPreviewDirty = true; schedulePdfPreview?.();
                                    }
                                });
                                pdfPageList.appendChild(sub);
                                pageNumberCounter++;
                            });
                            if (state.pdfIncludeCanvasSnapshot) {
                                const mapSub = document.createElement('div');
                                mapSub.className = 'pdf-page-sub';
                                mapSub.dataset.kind = 'map';
                                const mThumb = document.createElement('span'); mThumb.className = 'thumb';
                                const mImg = document.createElement('img'); mThumb.appendChild(mImg);
                                const mMeta = document.createElement('div'); mMeta.className = 'meta';
                                const mTitle = document.createElement('div'); mTitle.className = 'title'; mTitle.textContent = (block.name || `Canvas ${displayIdx + 1}`) + ' - Output Map';
                                const mSub = document.createElement('div'); mSub.className = 'sub'; mSub.textContent = `Page ${pageNumberCounter}`;
                                mMeta.appendChild(mTitle); mMeta.appendChild(mSub);
                                mapSub.appendChild(mThumb); mapSub.appendChild(mMeta);
                                renderMapThumb(objs, mImg);
                                pdfPageList.appendChild(mapSub);
                                pageNumberCounter++;
                            }
                        });

                        // Spec page indicator
                        const spec = document.createElement('div');
                        spec.className = 'pdf-page-sub';
                        spec.dataset.kind = 'spec';
                        const spThumb = document.createElement('span'); spThumb.className = 'thumb';
                        const spMeta = document.createElement('div'); spMeta.className = 'meta';
                        const spTitle = document.createElement('div'); spTitle.className = 'title'; spTitle.textContent = 'Media Server Specification';
                        const spSub = document.createElement('div'); spSub.className = 'sub'; spSub.textContent = `Page ${pageNumberCounter}`;
                        spMeta.appendChild(spTitle); spMeta.appendChild(spSub);
                        spec.appendChild(spThumb); spec.appendChild(spMeta);
                        pdfPageList.appendChild(spec);
                    }
                };
                // Arrange mode selector wiring
                if (pdfArrangeModeSelect) {
                    // Default to flat for user request of free swap
                    pdfArrangeModeSelect.value = state.pdfArrangeMode;
                    pdfArrangeModeSelect.addEventListener('change', () => {
                        state.pdfArrangeMode = pdfArrangeModeSelect.value === 'flat' ? 'flat' : 'grouped';
                        buildPdfPageSidebar();
                        state.pdfPreviewDirty = true; schedulePdfPreview?.();
                    });
                }
                if (pdfResetOrderBtn) {
                    pdfResetOrderBtn.addEventListener('click', () => {
                        if ((state.pdfArrangeMode || 'flat') === 'flat') {
                            // Rebuild flat and reset flat order
                            try {
                                const sel = new Set((state.pdfSelectedCanvasIds || []).map(String));
                                const dataset = (Array.isArray(state.savedCanvases) ? state.savedCanvases : []).filter(c => sel.size === 0 || sel.has(String(c.id)));
                                const pages = [];
                                dataset.forEach((c, ci) => {
                                    const objs = c.objects || [];
                                    for (let i = 0; i < objs.length; i++) pages.push({});
                                    if (state.pdfIncludeCanvasSnapshot) pages.push({});
                                });
                                state.pdfFlatOrder = Array.from({ length: pages.length }, (_, i) => i);
                            } catch { state.pdfFlatOrder = []; }
                        } else {
                            const datasetLen = (Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0)
                                ? state.savedCanvases.length
                                : (state.canvasMapObjects || []).length;
                            state.pdfPageOrder = Array.from({ length: datasetLen }, (_, i) => i);
                            // Reset per-canvas screen order map
                            state.pdfScreenOrder = {};
                        }
                        buildPdfPageSidebar();
                        state.pdfPreviewDirty = true; schedulePdfPreview?.();
                    });
                }

                // Initialize sidebar with Canvas tab and render once for better UX
                try {
                    setSidebarMode('canvas');
                    renderPdfCanvasList();
                } catch { }

        /**
         * Generates a PDF preview and displays it in the iframe.
         */
        const generatePdfPreview = () => {
            if (!Array.isArray(state.canvasMapObjects)) state.canvasMapObjects = [];
            if (!Array.isArray(state.savedCanvases)) state.savedCanvases = [];
            const useSaved = state.savedCanvases.length > 0; // prefer saved canvases for preview
            const lite = !!state.pdfPreviewLite;
            // Filter saved by selection if available
            let selectedSaved = [];
            if (useSaved) {
                try {
                    const sel = new Set((state.pdfSelectedCanvasIds || []).map(String));
                    selectedSaved = (sel.size > 0) ? state.savedCanvases.filter(c => sel.has(String(c.id))) : state.savedCanvases.slice();
                } catch { selectedSaved = state.savedCanvases.slice(); }
            }
            // In lite preview, cap number of canvases to speed generation
            const MAX_LITE_CANVASES = 3;
            const MAX_LITE_SCREENS_PER_CANVAS = 2;
            if (lite && useSaved) {
                selectedSaved = selectedSaved.slice(0, MAX_LITE_CANVASES);
            }
            const hasObjects = useSaved ? selectedSaved.length > 0 : state.canvasMapObjects.length > 0;

            const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
            const pdfPreviewIframe = document.getElementById('pdfPreviewFrame');
            const pdfPreviewPlaceholder = document.getElementById('pdfPreviewPlaceholder');
            const pdfPreviewContent = document.getElementById('pdfPreviewContent');
            const pdfPreviewImageContent = document.getElementById('pdfPreviewImageContent');

            // Show loading state
            if (pdfPreviewContainer) pdfPreviewContainer.classList.add('loading');
            try { document.getElementById('pdfPreviewStatus')?.classList.remove('d-none'); } catch { }
            try { showPdfToast('Generating PDF previewâ€¦'); } catch { }
            pdfPreviewPlaceholder.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-2">Generating PDF preview...</p></div>';
            // Yield to the browser to render the spinner before heavy work
            setTimeout(() => {
            try {
                const engine = (state.pdfPreviewEngine === 'iframe') ? 'iframe' : 'image';
                const arrangeMode = state.pdfArrangeMode || 'flat';

                // Lightweight image-based preview: render per-page images instead of an embedded PDF
                if (engine === 'image') {
                    if (!pdfPreviewImageContent) throw new Error('Missing image preview container');
                    // Prepare container
                    pdfPreviewImageContent.innerHTML = '';

                    if (hasObjects) {
                        if (useSaved) {
                            const order = (Array.isArray(state.pdfPageOrder) && state.pdfPageOrder.length === selectedSaved.length)
                                ? state.pdfPageOrder.slice()
                                : Array.from({ length: selectedSaved.length }, (_, i) => i);
                            if (arrangeMode === 'flat') {
                                // Build flat pages array according to selectedSaved and orders
                                const flatPages = [];
                                order.forEach((ordIdx) => {
                                    const savedCanvas = selectedSaved[ordIdx];
                                    const objsAll = savedCanvas.objects || [];
                                    const canvasKey = String(savedCanvas.id ?? ordIdx);
                                    let orderedObjs = objsAll.slice();
                                    const ordArr = state.pdfScreenOrder?.[canvasKey];
                                    if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                                        orderedObjs = ordArr.map(i => objsAll[i]).filter(Boolean);
                                    }
                                    const screens = lite ? orderedObjs.slice(0, MAX_LITE_SCREENS_PER_CANVAS) : orderedObjs;
                                    screens.forEach(obj => flatPages.push({ type: 'screen', obj }));
                                    if (state.pdfIncludeCanvasSnapshot) flatPages.push({ type: 'map', canvas: savedCanvas, objsAll });
                                });
                                const orderFlat = (Array.isArray(state.pdfFlatOrder) && state.pdfFlatOrder.length === flatPages.length)
                                    ? state.pdfFlatOrder.slice()
                                    : Array.from({ length: flatPages.length }, (_, i) => i);
                                orderFlat.forEach(idx => {
                                    const p = flatPages[idx];
                                    if (p.type === 'screen') {
                                        const pageDiv = document.createElement('div'); pageDiv.className = 'pdf-image-page';
                                        const img = new Image(); img.loading = 'eager'; img.alt = p.obj.filename || 'Screen'; img.src = p.obj.dataUrl; pageDiv.appendChild(img);
                                        pdfPreviewImageContent.appendChild(pageDiv);
                                    } else if (p.type === 'map') {
                                        try {
                                            const objs = p.objsAll || [];
                                            const tempCanvas = document.createElement('canvas');
                                            const fallbackW = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.x || 0) + (o?.width || 0)), 1920)));
                                            const fallbackH = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.y || 0) + (o?.height || 0)), 1080)));
                                            tempCanvas.width = canvasMapCanvas?.width || fallbackW;
                                            tempCanvas.height = canvasMapCanvas?.height || fallbackH;
                                            const tctx = tempCanvas.getContext('2d', { alpha: true });
                                            tctx.fillStyle = (state.canvasBgColor || '#000000'); tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                                            objs.forEach(objData => {
                                                try {
                                                    const img = new Image();
                                                    img.onload = () => { tctx.save(); const cx = (objData?.x || 0) + (objData?.width || 0) / 2; const cy = (objData?.y || 0) + (objData?.height || 0) / 2; tctx.translate(cx, cy); tctx.rotate((objData?.rotation || 0) * Math.PI / 180); tctx.drawImage(img, -(objData?.width || 0) / 2, -(objData?.height || 0) / 2, (objData?.width || 0), (objData?.height || 0)); tctx.restore(); };
                                                    img.src = objData.dataUrl;
                                                } catch { }
                                            });
                                            const scale = Math.min(1, (lite ? 600 : 800) / Math.max(tempCanvas.width, tempCanvas.height));
                                            const previewCanvas = document.createElement('canvas');
                                            previewCanvas.width = Math.max(1, Math.round(tempCanvas.width * scale));
                                            previewCanvas.height = Math.max(1, Math.round(tempCanvas.height * scale));
                                            previewCanvas.getContext('2d').drawImage(tempCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
                                            const dataUrl = previewCanvas.toDataURL('image/png');
                                            const pageDiv = document.createElement('div'); pageDiv.className = 'pdf-image-page';
                                            const imgEl = new Image(); imgEl.loading = 'eager'; imgEl.alt = (p.canvas?.name || p.canvas?.filename || 'Canvas') + ' - Output Map'; imgEl.src = dataUrl;
                                            pageDiv.appendChild(imgEl); pdfPreviewImageContent.appendChild(pageDiv);
                                        } catch { }
                                    }
                                });
                            } else {
                                // Grouped (original) behavior
                                order.forEach((ordIdx) => {
                                    const savedCanvas = selectedSaved[ordIdx];
                                    const objsAll = savedCanvas.objects || [];
                                    const canvasKey = String(savedCanvas.id ?? ordIdx);
                                    let orderedObjs = objsAll.slice();
                                    const ordArr = state.pdfScreenOrder?.[canvasKey];
                                    if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                                        orderedObjs = ordArr.map(i => objsAll[i]).filter(Boolean);
                                    }
                                    const objs = lite ? orderedObjs.slice(0, MAX_LITE_SCREENS_PER_CANVAS) : orderedObjs;
                                    objs.forEach((obj) => {
                                        const pageDiv = document.createElement('div'); pageDiv.className = 'pdf-image-page';
                                        const img = new Image(); img.loading = 'eager'; img.alt = obj.filename || 'Screen'; img.src = obj.dataUrl; pageDiv.appendChild(img);
                                        pdfPreviewImageContent.appendChild(pageDiv);
                                    });
                                    if (state.pdfIncludeCanvasSnapshot) {
                                        try {
                                            const objs = objsAll;
                                            const tempCanvas = document.createElement('canvas');
                                            const fallbackW = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.x || 0) + (o?.width || 0)), 1920)));
                                            const fallbackH = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.y || 0) + (o?.height || 0)), 1080)));
                                            tempCanvas.width = canvasMapCanvas?.width || fallbackW;
                                            tempCanvas.height = canvasMapCanvas?.height || fallbackH;
                                            const tctx = tempCanvas.getContext('2d', { alpha: true });
                                            tctx.fillStyle = (state.canvasBgColor || '#000000'); tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                                            objs.forEach(objData => {
                                                try {
                                                    const img = new Image();
                                                    img.onload = () => { tctx.save(); const cx = (objData?.x || 0) + (objData?.width || 0) / 2; const cy = (objData?.y || 0) + (objData?.height || 0) / 2; tctx.translate(cx, cy); tctx.rotate((objData?.rotation || 0) * Math.PI / 180); tctx.drawImage(img, -(objData?.width || 0) / 2, -(objData?.height || 0) / 2, (objData?.width || 0), (objData?.height || 0)); tctx.restore(); };
                                                    img.src = objData.dataUrl;
                                                } catch { }
                                            });
                                            const scale = Math.min(1, (lite ? 600 : 800) / Math.max(tempCanvas.width, tempCanvas.height));
                                            const previewCanvas = document.createElement('canvas');
                                            previewCanvas.width = Math.max(1, Math.round(tempCanvas.width * scale));
                                            previewCanvas.height = Math.max(1, Math.round(tempCanvas.height * scale));
                                            previewCanvas.getContext('2d').drawImage(tempCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
                                            const dataUrl = previewCanvas.toDataURL('image/png');
                                            const pageDiv = document.createElement('div'); pageDiv.className = 'pdf-image-page';
                                            const imgEl = new Image(); imgEl.loading = 'eager'; imgEl.alt = (savedCanvas.name || savedCanvas.filename || 'Canvas') + ' - Output Map'; imgEl.src = dataUrl; pageDiv.appendChild(imgEl);
                                            pdfPreviewImageContent.appendChild(pageDiv);
                                        } catch { }
                                    }
                                });
                            }
                        } else {
                            // Fallback: current canvas objects only
                            const objsAll = state.canvasMapObjects || [];
                            const objs = lite ? objsAll.slice(0, MAX_LITE_SCREENS_PER_CANVAS) : objsAll;
                            objs.forEach((obj) => {
                                const pageDiv = document.createElement('div');
                                pageDiv.className = 'pdf-image-page';
                                const img = new Image();
                                img.loading = 'eager';
                                img.alt = obj.filename || 'Screen';
                                img.src = obj.dataUrl;
                                pageDiv.appendChild(img);
                                pdfPreviewImageContent.appendChild(pageDiv);
                            });
                            if (state.pdfIncludeCanvasSnapshot) {
                                try {
                                    const dataUrl = createExportCanvas(true).toDataURL('image/png');
                                    const pageDiv = document.createElement('div');
                                    pageDiv.className = 'pdf-image-page';
                                    const img = new Image();
                                    img.loading = 'eager';
                                    img.alt = 'Canvas Layout Snapshot';
                                    img.src = dataUrl;
                                    pageDiv.appendChild(img);
                                    pdfPreviewImageContent.appendChild(pageDiv);
                                } catch { }
                            }
                        }
                    }
                    // Final spec page placeholder (lightweight)
                    const specDiv = document.createElement('div');
                    specDiv.className = 'pdf-image-page';
                    const specLabel = document.createElement('div');
                    specLabel.style.display = 'flex';
                    specLabel.style.alignItems = 'center';
                    specLabel.style.justifyContent = 'center';
                    specLabel.style.width = '100%';
                    specLabel.style.minHeight = '240px';
                    specLabel.style.color = '#6c757d';
                    specLabel.style.fontSize = '16px';
                    specLabel.textContent = 'Media Server Specification (preview)';
                    specDiv.appendChild(specLabel);
                    pdfPreviewImageContent.appendChild(specDiv);

                    // Apply current zoom styling to newly created images
                    try { (typeof applyImageZoomStyles === 'function') ? applyImageZoomStyles() : null; } catch { }

                    // Show image content, hide iframe
                    pdfPreviewContent.classList.remove('d-none');
                    pdfPreviewImageContent.classList.remove('d-none');
                    if (pdfPreviewIframe) pdfPreviewIframe.classList.add('d-none');
                    if (pdfPreviewIframe) pdfPreviewIframe.src = 'about:blank';
                    pdfPreviewPlaceholder.style.display = 'none';
                    state.pdfPreviewReady = true;
                    state.pdfPreviewDirty = false;
                    if (pdfPreviewContainer) pdfPreviewContainer.classList.remove('loading');
                    try { document.getElementById('pdfPreviewStatus')?.classList.add('d-none'); } catch { }
                    try { hidePdfToast(); } catch { }
                    return; // done for image engine
                }

                // Use A0 in iframe preview to match template layout exactly across all pages
                // (image engine remains lightweight; export also uses A0)
                const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a0' });
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();

                // Build pages honoring arrange mode. Finally spec page.
                let totalPages = 1; // spec page at end
                if (hasObjects) {
                    if (useSaved) {
                        const order = (Array.isArray(state.pdfPageOrder) && state.pdfPageOrder.length === selectedSaved.length)
                            ? state.pdfPageOrder.slice()
                            : Array.from({ length: selectedSaved.length }, (_, i) => i);
                        if (arrangeMode === 'flat') {
                            // Build flat array once to count
                            let flatPages = [];
                            order.forEach((ordIdx) => {
                                const savedCanvas = selectedSaved[ordIdx];
                                const objsAll = savedCanvas.objects || [];
                                const canvasKey = String(savedCanvas.id ?? ordIdx);
                                let orderedObjs = objsAll.slice();
                                const ordArr = state.pdfScreenOrder?.[canvasKey];
                                if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                                    orderedObjs = ordArr.map(i => objsAll[i]).filter(Boolean);
                                }
                                const screens = lite ? orderedObjs.slice(0, MAX_LITE_SCREENS_PER_CANVAS) : orderedObjs;
                                screens.forEach(obj => flatPages.push({ type: 'screen', obj }));
                                if (state.pdfIncludeCanvasSnapshot) flatPages.push({ type: 'map', canvas: savedCanvas, objsAll });
                            });
                            const orderFlat = (Array.isArray(state.pdfFlatOrder) && state.pdfFlatOrder.length === flatPages.length)
                                ? state.pdfFlatOrder.slice()
                                : Array.from({ length: flatPages.length }, (_, i) => i);
                            totalPages += orderFlat.length;
                        } else {
                        // Grouped count
                            order.forEach((ordIdx) => {
                                const savedCanvas = selectedSaved[ordIdx];
                                const objs = savedCanvas.objects || [];
                                const countObjs = lite ? Math.min(objs.length, MAX_LITE_SCREENS_PER_CANVAS) : objs.length;
                                totalPages += countObjs;
                                if (state.pdfIncludeCanvasSnapshot) totalPages += 1;
                            });
                        }
                    } else {
                        totalPages += lite ? Math.min(state.canvasMapObjects.length, MAX_LITE_SCREENS_PER_CANVAS) : state.canvasMapObjects.length;
                        if (state.pdfIncludeCanvasSnapshot) totalPages += 1;
                    }

                    let pageCounter = 1;
                    if (useSaved) {
                        const order = (Array.isArray(state.pdfPageOrder) && state.pdfPageOrder.length === selectedSaved.length)
                            ? state.pdfPageOrder.slice()
                            : Array.from({ length: selectedSaved.length }, (_, i) => i);
                        if (arrangeMode === 'flat') {
                            // Build flat ordered pages and render in order
                            let flatPages = [];
                            order.forEach((ordIdx) => {
                                const savedCanvas = selectedSaved[ordIdx];
                                const objsAll = savedCanvas.objects || [];
                                const canvasKey = String(savedCanvas.id ?? ordIdx);
                                let orderedObjs = objsAll.slice();
                                const ordArr = state.pdfScreenOrder?.[canvasKey];
                                if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                                    orderedObjs = ordArr.map(i => objsAll[i]).filter(Boolean);
                                }
                                const screens = lite ? orderedObjs.slice(0, MAX_LITE_SCREENS_PER_CANVAS) : orderedObjs;
                                screens.forEach(obj => flatPages.push({ type: 'screen', obj }));
                                if (state.pdfIncludeCanvasSnapshot) flatPages.push({ type: 'map', canvas: savedCanvas, objsAll });
                            });
                            const orderFlat = (Array.isArray(state.pdfFlatOrder) && state.pdfFlatOrder.length === flatPages.length)
                                ? state.pdfFlatOrder.slice()
                                : Array.from({ length: flatPages.length }, (_, i) => i);
                            orderFlat.forEach(idx => {
                                const p = flatPages[idx];
                                if (pageCounter > 1) doc.addPage();
                                if (p.type === 'screen') {
                                    drawDetailedObjectPage(doc, p.obj, pageCounter, totalPages);
                                } else if (p.type === 'map') {
                                    const pageTitleObj = { filename: (p.canvas?.name || p.canvas?.filename || 'Canvas') + ' - Output Map' };
                                    drawTemplateElements(doc, pageCounter, totalPages, pageTitleObj);
                                    const tempCanvas = document.createElement('canvas');
                                    const objs = p.objsAll || [];
                                    const fallbackW = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.x || 0) + (o?.width || 0)), 1920)));
                                    const fallbackH = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.y || 0) + (o?.height || 0)), 1080)));
                                    tempCanvas.width = canvasMapCanvas?.width || fallbackW;
                                    tempCanvas.height = canvasMapCanvas?.height || fallbackH;
                                    const tctx = tempCanvas.getContext('2d', { alpha: true });
                                    tctx.fillStyle = (state.canvasBgColor || '#000000'); tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                                    objs.forEach(objData => {
                                        try {
                                            const img = new Image();
                                            img.onload = () => { tctx.save(); const cx = (objData?.x || 0) + (objData?.width || 0) / 2; const cy = (objData?.y || 0) + (objData?.height || 0) / 2; tctx.translate(cx, cy); tctx.rotate((objData?.rotation || 0) * Math.PI / 180); tctx.drawImage(img, -(objData?.width || 0) / 2, -(objData?.height || 0) / 2, (objData?.width || 0), (objData?.height || 0)); tctx.restore(); };
                                            img.src = objData.dataUrl;
                                        } catch { }
                                    });
                                    const scale = Math.min(1, (lite ? 600 : 800) / Math.max(tempCanvas.width, tempCanvas.height));
                                    const previewCanvas = document.createElement('canvas');
                                    previewCanvas.width = Math.max(1, Math.round(tempCanvas.width * scale));
                                    previewCanvas.height = Math.max(1, Math.round(tempCanvas.height * scale));
                                    previewCanvas.getContext('2d').drawImage(tempCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
                                    const canvasImage = previewCanvas.toDataURL('image/png');
                                    try {
                                        const imgProps = doc.getImageProperties(canvasImage);
                                        const rightColumnX = pageWidth - 138;
                                        const availableX = 10; const availableY = 10;
                                        const availableWidth = rightColumnX - 15; const availableHeight = pageHeight - 20;
                                        const aspectRatio = imgProps.width / imgProps.height;
                                        let imgWidth = availableWidth; let imgHeight = imgWidth / aspectRatio;
                                        if (imgHeight > availableHeight) { imgHeight = availableHeight; imgWidth = imgHeight * aspectRatio; }
                                        const imgX = availableX + (availableWidth - imgWidth) / 2;
                                        const imgY = availableY + (availableHeight - imgHeight) / 2;
                                        doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight);
                                    } catch { }
                                }
                                pageCounter++;
                            });
                        } else {
                        // Grouped (original) behavior
                            order.forEach((ordIdx, blockIdx) => {
                                const savedCanvas = selectedSaved[ordIdx];
                                const objsAll = savedCanvas.objects || [];
                                const canvasKey = String(savedCanvas.id ?? ordIdx);
                                let orderedObjs = objsAll.slice();
                                const ordArr = state.pdfScreenOrder?.[canvasKey];
                                if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                                    orderedObjs = ordArr.map(i => objsAll[i]).filter(Boolean);
                                }
                                const objs = lite ? orderedObjs.slice(0, MAX_LITE_SCREENS_PER_CANVAS) : orderedObjs;
                                objs.forEach((obj, i) => {
                                    if (pageCounter > 1) doc.addPage();
                                    drawDetailedObjectPage(doc, obj, pageCounter, totalPages);
                                    pageCounter++;
                                });
                                if (state.pdfIncludeCanvasSnapshot) {
                                    if (pageCounter > 1) doc.addPage();
                                    const pageTitleObj = { filename: savedCanvas.name + ' - Output Map' };
                                    drawTemplateElements(doc, pageCounter, totalPages, pageTitleObj);
                                    const tempCanvas = document.createElement('canvas');
                                    const fallbackW = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.x || 0) + (o?.width || 0)), 1920)));
                                    const fallbackH = Math.max(1, Math.round(objs.reduce((m, o) => Math.max(m, (o?.y || 0) + (o?.height || 0)), 1080)));
                                    tempCanvas.width = canvasMapCanvas?.width || fallbackW;
                                    tempCanvas.height = canvasMapCanvas?.height || fallbackH;
                                    const tctx = tempCanvas.getContext('2d', { alpha: true });
                                    tctx.fillStyle = (state.canvasBgColor || '#000000'); tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                                    objs.forEach(objData => {
                                        try {
                                            const img = new Image();
                                            img.onload = () => { tctx.save(); const cx = (objData?.x || 0) + (objData?.width || 0) / 2; const cy = (objData?.y || 0) + (objData?.height || 0) / 2; tctx.translate(cx, cy); tctx.rotate((objData?.rotation || 0) * Math.PI / 180); tctx.drawImage(img, -(objData?.width || 0) / 2, -(objData?.height || 0) / 2, (objData?.width || 0), (objData?.height || 0)); tctx.restore(); };
                                            img.src = objData.dataUrl;
                                        } catch { }
                                    });
                                    const scale = Math.min(1, (lite ? 600 : 800) / Math.max(tempCanvas.width, tempCanvas.height));
                                    const previewCanvas = document.createElement('canvas');
                                    previewCanvas.width = Math.max(1, Math.round(tempCanvas.width * scale));
                                    previewCanvas.height = Math.max(1, Math.round(tempCanvas.height * scale));
                                    previewCanvas.getContext('2d').drawImage(tempCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
                                    const canvasImage = previewCanvas.toDataURL('image/png');
                                    try {
                                        const imgProps = doc.getImageProperties(canvasImage);
                                        const rightColumnX = pageWidth - 138;
                                        const availableX = 10; const availableY = 10;
                                        const availableWidth = rightColumnX - 15; const availableHeight = pageHeight - 20;
                                        const aspectRatio = imgProps.width / imgProps.height;
                                        let imgWidth = availableWidth; let imgHeight = imgWidth / aspectRatio;
                                        if (imgHeight > availableHeight) { imgHeight = availableHeight; imgWidth = imgHeight * aspectRatio; }
                                        const imgX = availableX + (availableWidth - imgWidth) / 2;
                                        const imgY = availableY + (availableHeight - imgHeight) / 2;
                                        doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight);
                                    } catch { }
                                    pageCounter++;
                                }
                            });
                        }
                    } else {
                        // Fallback: current canvas objects
                        const objsAll = state.canvasMapObjects || [];
                        // Apply order using 'current' key if exists
                        const currKey = 'current';
                        let orderedObjs = objsAll.slice();
                        const ordArr = state.pdfScreenOrder?.[currKey];
                        if (Array.isArray(ordArr) && ordArr.length === objsAll.length) {
                            orderedObjs = ordArr.map(i => objsAll[i]).filter(Boolean);
                        }
                        const objs = lite ? orderedObjs.slice(0, MAX_LITE_SCREENS_PER_CANVAS) : orderedObjs;
                        objs.forEach((obj, index) => {
                            if (pageCounter > 1) doc.addPage();
                            drawDetailedObjectPage(doc, obj, pageCounter, totalPages);
                            pageCounter++;
                        });
                        if (state.pdfIncludeCanvasSnapshot) {
                            if (pageCounter > 1) doc.addPage();
                            const snapshotObj = { filename: 'Canvas Layout Snapshot' };
                            drawTemplateElements(doc, pageCounter, totalPages, snapshotObj);
                            const canvasImage = createExportCanvas(true).toDataURL('image/png');
                            try {
                                const imgProps = doc.getImageProperties(canvasImage);
                                const rightColumnX = pageWidth - 138;
                                const availableX = 10; const availableY = 10;
                                const availableWidth = rightColumnX - 15; const availableHeight = pageHeight - 20;
                                const aspectRatio = imgProps.width / imgProps.height;
                                let imgWidth = availableWidth; let imgHeight = imgWidth / aspectRatio;
                                if (imgHeight > availableHeight) { imgHeight = availableHeight; imgWidth = imgHeight * aspectRatio; }
                                const imgX = availableX + (availableWidth - imgWidth) / 2;
                                const imgY = availableY + (availableHeight - imgHeight) / 2;
                                doc.addImage(canvasImage, 'PNG', imgX, imgY, imgWidth, imgHeight);
                            } catch { }
                            pageCounter++;
                        }
                    }
                }

                // Final spec page
                drawMediaServerSpecPage(doc, totalPages);

                // In lite mode, hint what is being shown
                try {
                    if (lite) {
                        const hint = 'Lite preview: reduced pages and placeholder images for speed';
                        showPdfToast?.(hint);
                    }
                } catch { }
                // Generate PDF blob and display via object URL for better reliability
                const pdfBlob = doc.output('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                // Revoke previous URL to avoid leaks
                if (state.lastPdfPreviewUrl) {
                    try { URL.revokeObjectURL(state.lastPdfPreviewUrl); } catch {}
                }
                state.lastPdfPreviewUrl = pdfUrl;
                pdfPreviewIframe.src = pdfUrl;
                // Ensure iframe content is visible and image list hidden in iframe mode
                if (pdfPreviewImageContent) pdfPreviewImageContent.classList.add('d-none');
                if (pdfPreviewIframe) pdfPreviewIframe.classList.remove('d-none');
                pdfPreviewContent.classList.remove('d-none');
                pdfPreviewPlaceholder.style.display = 'none';
                state.pdfPreviewReady = true;
                state.pdfPreviewDirty = false;
                if (pdfPreviewContainer) pdfPreviewContainer.classList.remove('loading');
                try { document.getElementById('pdfPreviewStatus')?.classList.add('d-none'); } catch { }
                try { hidePdfToast(); } catch { }

            } catch (error) {
                console.error("Error generating PDF preview:", error);
                pdfPreviewPlaceholder.innerHTML = '<div class="text-center text-danger"><i class="fas fa-exclamation-triangle"></i><p class="mt-2">Error generating PDF preview. Please try again.</p></div>';
                pdfPreviewContent.classList.add('d-none');
                pdfPreviewPlaceholder.style.display = 'block';
                if (pdfPreviewContainer) pdfPreviewContainer.classList.remove('loading');
                try { document.getElementById('pdfPreviewStatus')?.classList.add('d-none'); } catch { }
                try { hidePdfToast(); } catch { }
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
            // Track any scheduled kickoff so we can cancel when leaving the tab
            let __pdfPreviewIdleHandle = null;
            let __pdfPreviewIdleIsTimeout = false;
            pdfTab.addEventListener('show.bs.tab', (e) => {
                if (!Array.isArray(state.savedCanvases) || state.savedCanvases.length === 0) {
                    e.preventDefault();
                    showMessageBox('PDF Settings will be available after you save at least one canvas.');
                }
            });
            pdfTab.addEventListener('shown.bs.tab', () => {
                __pdfTabActive = true;
                // Rebuild the thumbnails sidebar on activation immediately for instant UI
                try { ensureSelectedDefaults?.(); } catch { }
                try { renderPdfCanvasList?.(); } catch { }
                buildPdfPageSidebar?.();
                try { setSidebarMode?.('canvas'); } catch { }
                const ph = document.getElementById('pdfPreviewPlaceholder');
                const ct = document.getElementById('pdfPreviewContent');
                const container = document.getElementById('pdfPreviewContainer');
                const canPreview = !!document.getElementById('pdfPreviewFrame') && Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0;
                // If we already have a ready, not-dirty preview, show it immediately and bail
                if (canPreview && state.pdfPreviewReady && !state.pdfPreviewDirty) {
                    try {
                        if (ct) ct.classList.remove('d-none');
                        if (ph) ph.style.display = 'none';
                        container?.classList.remove('loading');
                        document.getElementById('pdfPreviewStatus')?.classList.add('d-none');
                        hidePdfToast?.();
                    } catch { }
                    return;
                }
                // Otherwise, show placeholder quickly and schedule generation
                try {
                    if (ph) ph.style.display = 'block';
                    if (ct) ct.classList.add('d-none');
                } catch { }
                const kickoff = () => { __pdfPreviewIdleHandle = null; __pdfPreviewIdleIsTimeout = false; if (!state.pdfPreviewReady || state.pdfPreviewDirty) generatePdfPreview(); };
                if (canPreview) {
                    try { showPdfToast?.('Generating PDF previewâ€¦'); } catch { }
                    try {
                        if (typeof window.requestIdleCallback === 'function') {
                            __pdfPreviewIdleIsTimeout = false;
                            __pdfPreviewIdleHandle = window.requestIdleCallback(kickoff, { timeout: 700 });
                        } else {
                            __pdfPreviewIdleIsTimeout = true;
                            __pdfPreviewIdleHandle = setTimeout(kickoff, 250);
                        }
                    } catch {
                        __pdfPreviewIdleIsTimeout = true;
                        __pdfPreviewIdleHandle = setTimeout(kickoff, 250);
                    }
                }
            });
            pdfTab.addEventListener('hidden.bs.tab', () => {
                __pdfTabActive = false;
                // Cancel any pending kickoff when leaving the tab
                try {
                    if (__pdfPreviewIdleHandle != null) {
                        if (__pdfPreviewIdleIsTimeout) {
                            clearTimeout(__pdfPreviewIdleHandle);
                        } else if (typeof window.cancelIdleCallback === 'function') {
                            window.cancelIdleCallback(__pdfPreviewIdleHandle);
                        }
                        __pdfPreviewIdleHandle = null;
                        __pdfPreviewIdleIsTimeout = false;
                    }
                } catch { }
            });
        }

        // Also ensure PixelMap redraws when its tab is shown, so sizing/layout is correct
        const pixelMapTab = document.getElementById('pixelmap-tab');
        if (pixelMapTab) {
            pixelMapTab.addEventListener('shown.bs.tab', () => {
                setTimeout(updatePixelMap, 0);
            });
        }

                // If the PDF tab is already active on load (e.g., deep link), set active flag
                try {
                    const activeTab = document.querySelector('.nav-link.active');
                    if (activeTab && activeTab.id === 'pdfsettings-tab') {
                        __pdfTabActive = true;
                        // Build sidebar immediately so UI is complete on first paint
                        try { renderPdfCanvasList?.(); } catch { }
                        try { buildPdfPageSidebar?.(); } catch { }
                        try { setSidebarMode?.('canvas'); } catch { }
                        const ph = document.getElementById('pdfPreviewPlaceholder');
                        const ct = document.getElementById('pdfPreviewContent');
                        const container = document.getElementById('pdfPreviewContainer');
                        const canPreview = !!document.getElementById('pdfPreviewFrame') && Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0;
                        if (canPreview && state.pdfPreviewReady && !state.pdfPreviewDirty) {
                            // Show existing preview immediately
                            try {
                                if (ct) ct.classList.remove('d-none');
                                if (ph) ph.style.display = 'none';
                                container?.classList.remove('loading');
                                document.getElementById('pdfPreviewStatus')?.classList.add('d-none');
                                hidePdfToast?.();
                            } catch { }
                        } else {
                            // Show placeholder and schedule preview
                            try { if (ph) ph.style.display = 'block'; if (ct) ct.classList.add('d-none'); } catch { }
                            schedulePdfPreview();
                        }
                    }
                } catch { }


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
                try { saveSavedCanvases?.(); } catch { }

                // Clear the current CanvasMap workspace for the next design
                state.canvasMapObjects = [];
                selectedCanvasMapObject = null;
                updateObjectPropertiesPanel();
                updateCanvasMap();
                try { showToast('Canvas saved. Workspace cleared for a new design.', 'success'); } catch { }

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
                // PDF Settings requires both: at least one saved canvas and CanvasMap enabled (at least one sent screen)
                setPdfSettingsEnabled(hasSavedCanvases() && hasSentLedScreen());

                // If CanvasMap is active and there are no sent LED screens, redirect to PixelMap to create one
                const redirectToPixelMapIfNoSentScreens = () => {
                    try {
                        const hasAny = Array.isArray(state.storedPixelMaps) && state.storedPixelMaps.length > 0;
                        if (hasAny) return;
                        const canvasBtn = document.getElementById('canvasmap-tab');
                        const canvasPane = document.getElementById('canvasmap-pane');
                        const isActive = !!(canvasBtn?.classList.contains('active') || canvasPane?.classList.contains('active'));
                        if (!isActive) return;
                        const pxBtn = document.getElementById('pixelmap-tab');
                        if (pxBtn) {
                            try { showToast?.('No screens in CanvasMap. Switching to PixelMap to create one.', 'info'); } catch { }
                            try { bootstrap?.Tab?.getOrCreateInstance(pxBtn)?.show(); } catch { try { pxBtn.click?.(); } catch { } }
                        }
                    } catch { }
                };

                // Load persisted data
                try { if (typeof loadSavedCanvases === 'function') loadSavedCanvases(); } catch { }
                try { if (typeof loadStoredMaps === 'function') loadStoredMaps(); } catch { }
                // After loading, update CanvasMap availability and galleries
                try { setCanvasMapEnabled?.(Array.isArray(state.storedPixelMaps) && state.storedPixelMaps.length > 0); } catch { }
                // After loading, update PDF Settings availability based on both conditions
                try { setPdfSettingsEnabled?.((Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0) && (Array.isArray(state.storedPixelMaps) && state.storedPixelMaps.length > 0)); } catch { }
                try { renderImportedMapsGallery?.(); } catch { }
                try { renderPixelMapSentGallery?.(); } catch { }

                // Persist and restore the last active top-level tab (PixelMap / CanvasMap / PDF Settings)
                const ACTIVE_TAB_KEY = 'ui.activeTabId.v1';
                // Save active tab on change
                try {
                    document.querySelectorAll('#myTab .nav-link').forEach(btn => {
                        btn.addEventListener('shown.bs.tab', (e) => {
                            try { localStorage.setItem(ACTIVE_TAB_KEY, e.target.id); } catch { }
                        });
                    });
                } catch { }
                // Determine if a tab is allowed based on current gating
                const isTabAllowed = (tabId) => {
                    switch (tabId) {
                        case 'pdfsettings-tab':
                            return (Array.isArray(state.savedCanvases) && state.savedCanvases.length > 0) && (Array.isArray(state.storedPixelMaps) && state.storedPixelMaps.length > 0);
                        case 'canvasmap-tab':
                            return Array.isArray(state.storedPixelMaps) && state.storedPixelMaps.length > 0;
                        case 'pixelmap-tab':
                        default:
                            return true;
                    }
                };
                // Restore saved tab after gating is evaluated
                const restoreActiveTab = () => {
                    let desired = null;
                    try { desired = localStorage.getItem(ACTIVE_TAB_KEY); } catch { desired = null; }
                    const currentActive = document.querySelector('#myTab .nav-link.active')?.id;
                    // If current is already a valid choice and equals desired, nothing to do
                    if (desired && currentActive === desired && isTabAllowed(desired)) return;
                    // Choose the best tab to show
                    let toShow = 'pixelmap-tab';
                    if (desired && isTabAllowed(desired)) {
                        toShow = desired;
                    } else if (isTabAllowed('canvasmap-tab')) {
                        toShow = 'canvasmap-tab';
                    } else {
                        toShow = 'pixelmap-tab';
                    }
                    // If already active, skip
                    if (currentActive === toShow) return;
                    const btn = document.getElementById(toShow);
                    if (btn) {
                        try { bootstrap?.Tab?.getOrCreateInstance(btn)?.show(); } catch { try { btn.click?.(); } catch { } }
                    }
                };
                // Attempt restore once on load
                try { restoreActiveTab(); } catch { }

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
                try { if (typeof loadSentScreens === 'function') loadSentScreens(); } catch { }

            // PDF preview is generated lazily when the PDF tab is opened.

            })();
        });
