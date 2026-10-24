/**
 * PixelMap 3D Stage Visualizer
 * Powered by Three.js & OrbitControls
 * Real-time 3D AV Staging, Curved LED Walls, Stage Lighting & Rigging
 */
(function (window) {
    'use strict';

    let scene, camera, renderer, controls;
    let stageContainer, canvasElement;
    let stageDeck, trussGroup, screenGroup, lightsGroup;
    let screenTexture, screenMaterial;
    let animationFrameId;
    let isInitialized = false;
    /** SpotLight targets are parented to the scene (not lightsGroup) — track to avoid orphans. */
    let spotlightTargets = [];
    /** Signature of last full mesh rebuild — skips redundant scene.remove spam (3D-11). */
    let lastRebuildSig = '';

    // Default 3D Stage Configuration
    const config = {
        curveAngle: 0,           // 0 = Flat, up to 45 deg
        curveDirection: 'concave', // 'concave' or 'convex'
        riggingMode: 'ground',   // 'ground' or 'flown'
        flownHeight: 1.5,        // meters off stage floor
        sideWings: 'none',       // 'none', 'wings', 'dj'
        wingAngle: 35,           // degrees
        deckStyle: 'glossy',     // 'glossy', 'matte', 'grid'
        spotlights: true,
        spotlightColor: '#00d4ff',
        ambientGlow: 1.05,
        // 'saved' = active CanvasMap saved layout (default); 'live' = PixelMap canvas fallback
        testPattern: 'saved',
        autoRotate: false,
        // true = floor, truss, fog, spotlights (product default); false = LED screen only
        showEnvironment: true
    };

    let lastFrameKey = '';
    let savedTextureCacheKey = '';

    function init3DStage() {
        if (isInitialized) {
            handleResize();
            rebuildScreens();
            updateEngineeringSpecs();
            return;
        }

        stageContainer = document.getElementById('stage3dContainer');
        if (!stageContainer || typeof THREE === 'undefined') return;

        bindDomEvents();

        const width = stageContainer.clientWidth || 800;
        const height = stageContainer.clientHeight || 550;

        // 1. Scene — cool slate blue-grey so LEDs/panels/outlines stay distinct
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x3a4a5c);

        // 2. Camera
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(0, 3.2, 11);

        // 3. Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Canvas / PixelMap pixels are sRGB — declare that so colors aren't washed out
        if ('sRGBEncoding' in THREE) {
            renderer.outputEncoding = THREE.sRGBEncoding;
        }
        // Mild tone map for the stage environment; LED face uses unlit BasicMaterial
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        canvasElement = renderer.domElement;
        canvasElement.style.width = '100%';
        canvasElement.style.height = '100%';
        canvasElement.style.display = 'block';
        stageContainer.innerHTML = '';
        stageContainer.appendChild(canvasElement);

        // 4. Controls
        if (typeof THREE.OrbitControls !== 'undefined') {
            controls = new THREE.OrbitControls(camera, canvasElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;
            controls.minDistance = 2;
            controls.maxDistance = 35;
            controls.target.set(0, 1.8, 0);
        }

        // 5. Environment (optional) + LED wall
        applyEnvironmentMode(!!config.showEnvironment);
        rebuildScreens();

        // 6. Animation Loop
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);

            // Skip rendering if page is in background or 3D Stage container is hidden/collapsed
            if (document.hidden) return;
            if (!stageContainer || stageContainer.offsetParent === null || stageContainer.clientWidth === 0 || stageContainer.clientHeight === 0) return;

            if (controls) {
                if (config.autoRotate) {
                    controls.autoRotate = true;
                    controls.autoRotateSpeed = 1.2;
                } else {
                    controls.autoRotate = false;
                }
                controls.update();
            }

            // Animate spotlights slightly
            if (lightsGroup && config.spotlights) {
                const time = Date.now() * 0.001;
                lightsGroup.children.forEach((light, i) => {
                    if (light.isSpotLight && light.target) {
                        light.target.position.x = Math.sin(time + i * 1.5) * 3;
                    }
                });
            }

            // Update live texture if live mode is active
            if (config.testPattern === 'live' && screenTexture) {
                screenTexture.needsUpdate = true;
            }

            renderer.render(scene, camera);
        };
        animate();

        isInitialized = true;
        updateEngineeringSpecs();
    }

    /**
     * LED-only vs full stage environment.
     * When off: no floor/truss/fog/spotlights/ground-support legs — only the LED wall.
     */
    function applyEnvironmentMode(show) {
        config.showEnvironment = !!show;

        if (!scene) return;

        if (config.showEnvironment) {
            scene.background = new THREE.Color(0x3a4a5c);
            scene.fog = new THREE.FogExp2(0x3a4a5c, 0.012);
            if (controls) controls.maxPolarAngle = Math.PI / 2 - 0.01;
            buildStageEnvironment();
            buildLighting();
        } else {
            scene.fog = null;
            scene.background = new THREE.Color(0x445566);
            if (controls) controls.maxPolarAngle = Math.PI; // free orbit around LED only

            if (stageDeck) {
                scene.remove(stageDeck);
                disposeObject3D(stageDeck);
                stageDeck = null;
            }
            if (trussGroup) {
                scene.remove(trussGroup);
                disposeObject3D(trussGroup);
                trussGroup = null;
            }
            if (lightsGroup) {
                scene.remove(lightsGroup);
                disposeObject3D(lightsGroup);
                lightsGroup = null;
            }
            clearSpotlightTargets();
            // Soft fill so unlit LED still reads if ambientGlow is low
            lightsGroup = new THREE.Group();
            lightsGroup.add(new THREE.AmbientLight(0xffffff, 0.35));
            scene.add(lightsGroup);
        }

        const envExtras = document.getElementById('stage3dEnvExtras');
        if (envExtras) envExtras.style.display = config.showEnvironment ? '' : 'none';
        const envToggle = document.getElementById('stage3dShowEnvironmentToggle');
        if (envToggle) envToggle.checked = config.showEnvironment;
    }

    function buildStageEnvironment() {
        if (!scene) return;
        if (stageDeck) {
            scene.remove(stageDeck);
            disposeObject3D(stageDeck);
            stageDeck = null;
        }

        const deckGroup = new THREE.Group();

        // Stage Floor Platform
        const floorGeo = new THREE.BoxGeometry(24, 0.4, 16);
        let floorMat;

        if (config.deckStyle === 'glossy') {
            floorMat = new THREE.MeshStandardMaterial({
                color: 0x111317,
                roughness: 0.18,
                metalness: 0.65
            });
        } else if (config.deckStyle === 'grid') {
            floorMat = new THREE.MeshStandardMaterial({
                color: 0x08090b,
                roughness: 0.4,
                metalness: 0.2,
                wireframe: true
            });
        } else {
            floorMat = new THREE.MeshStandardMaterial({
                color: 0x16181d,
                roughness: 0.8,
                metalness: 0.1
            });
        }

        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.position.y = -0.2;
        floorMesh.receiveShadow = true;
        deckGroup.add(floorMesh);

        // Stage Front Lip Bevel / Lighting Edge
        const lipGeo = new THREE.BoxGeometry(24.2, 0.05, 0.05);
        const lipMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
        const lipMesh = new THREE.Mesh(lipGeo, lipMat);
        lipMesh.position.set(0, 0.01, 8);
        deckGroup.add(lipMesh);

        stageDeck = deckGroup;
        scene.add(stageDeck);

        // Build Truss structure
        buildOverheadTruss();
    }

    function buildOverheadTruss() {
        if (!scene) return;
        if (trussGroup) {
            scene.remove(trussGroup);
            disposeObject3D(trussGroup);
            trussGroup = null;
        }

        trussGroup = new THREE.Group();
        const trussMat = new THREE.MeshStandardMaterial({
            color: 0x8a929b,
            metalness: 0.85,
            roughness: 0.35
        });

        const trussY = 6.8;
        const trussLength = 20;

        // 4 Main chords (tubes)
        const chordGeo = new THREE.CylinderGeometry(0.04, 0.04, trussLength, 8);
        chordGeo.rotateZ(Math.PI / 2);

        const chords = [
            [-0.2, trussY + 0.2, -0.5],
            [0.2, trussY + 0.2, -0.5],
            [-0.2, trussY - 0.2, -0.5],
            [0.2, trussY - 0.2, -0.5]
        ];

        chords.forEach(pos => {
            const chord = new THREE.Mesh(chordGeo, trussMat);
            chord.position.set(0, pos[1], pos[2]);
            trussGroup.add(chord);
        });

        // Vertical supporting legs
        const legGeo = new THREE.CylinderGeometry(0.06, 0.06, trussY, 12);
        [-9.5, 9.5].forEach(x => {
            const leg = new THREE.Mesh(legGeo, trussMat);
            leg.position.set(x, trussY / 2, -0.5);
            trussGroup.add(leg);
        });

        scene.add(trussGroup);
    }

    function buildLighting() {
        if (!scene) return;
        if (lightsGroup) {
            scene.remove(lightsGroup);
            disposeObject3D(lightsGroup);
            lightsGroup = null;
        }
        clearSpotlightTargets();

        lightsGroup = new THREE.Group();

        // Brighter fill so LED walls read clearly even when small
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        lightsGroup.add(ambient);

        // Key spot light
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
        keyLight.position.set(5, 10, 8);
        lightsGroup.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xb8d4ff, 0.35);
        fillLight.position.set(-6, 6, 4);
        lightsGroup.add(fillLight);

        // Moving Spotlights
        if (config.spotlights) {
            const spotPositions = [-6, -2, 2, 6];
            spotPositions.forEach((x) => {
                const spot = new THREE.SpotLight(new THREE.Color(config.spotlightColor), 2.2);
                spot.position.set(x, 6.7, -0.4);
                spot.angle = Math.PI / 7;
                spot.penumbra = 0.45;
                spot.decay = 1.5;
                spot.distance = 18;

                const target = new THREE.Object3D();
                target.position.set(x * 0.7, 0, 4);
                scene.add(target);
                spotlightTargets.push(target);
                spot.target = target;

                lightsGroup.add(spot);

                // Spotlight fixture head (mesh)
                const fixGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.35, 12);
                fixGeo.rotateX(Math.PI / 2);
                const fixMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8 });
                const fixMesh = new THREE.Mesh(fixGeo, fixMat);
                fixMesh.position.copy(spot.position);
                lightsGroup.add(fixMesh);
            });
        }

        scene.add(lightsGroup);
    }

    function applyTextureColorSpace(tex) {
        if (!tex) return tex;
        // r128+: canvas pixels are sRGB; without this Three treats them as linear → dark/washed LED
        if ('sRGBEncoding' in THREE) {
            tex.encoding = THREE.sRGBEncoding;
        } else if ('SRGBColorSpace' in THREE) {
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        return tex;
    }

    function disposeScreenTexture() {
        if (screenTexture && typeof screenTexture.dispose === 'function') {
            try { screenTexture.dispose(); } catch (_) { /* ignore */ }
        }
        screenTexture = null;
        savedTextureCacheKey = '';
    }

    /**
     * Dispose geometries/materials under a removed Object3D so rebuilds don't leak GPU memory.
     * Shared screenTexture is left alone (managed by disposeScreenTexture / getScreenTexture).
     */
    function disposeObject3D(root) {
        if (!root) return;
        root.traverse((obj) => {
            if (obj.geometry && typeof obj.geometry.dispose === 'function') {
                try { obj.geometry.dispose(); } catch (_) { /* ignore */ }
            }
            const mats = obj.material
                ? (Array.isArray(obj.material) ? obj.material : [obj.material])
                : [];
            mats.forEach((m) => {
                if (!m || typeof m.dispose !== 'function') return;
                // Don't dispose the global shared screenTexture here — getScreenTexture owns it
                if (m.map && screenTexture && m.map === screenTexture) {
                    try {
                        m.map = null;
                        m.dispose();
                    } catch (_) { /* ignore */ }
                    return;
                }
                // Dispose individual texture if attached
                if (m.map && typeof m.map.dispose === 'function') {
                    try { m.map.dispose(); } catch (_) { /* ignore */ }
                }
                try { m.dispose(); } catch (_) { /* ignore */ }
            });
        });
    }

    function clearSpotlightTargets() {
        spotlightTargets.forEach((t) => {
            if (t && scene) {
                try { scene.remove(t); } catch (_) { /* ignore */ }
            }
        });
        spotlightTargets = [];
    }

    function getActiveSavedCanvas() {
        const appState = window.state || {};
        const list = Array.isArray(appState.savedCanvases) ? appState.savedCanvases : [];
        if (!list.length) return null;

        // Prefer explicit 3D picker selection (does not require CanvasMap Load)
        const stageId = appState.stage3dSelectedCanvasId;
        if (stageId != null && stageId !== '') {
            const picked = list.find((c) => String(c.id) === String(stageId));
            if (picked) return picked;
        }

        // Fallback: editor-loaded canvas, then most recent saved
        const editorId = appState.currentCanvasId;
        if (editorId != null) {
            const found = list.find((c) => String(c.id) === String(editorId));
            if (found) return found;
        }
        return list[list.length - 1] || null;
    }

    /**
     * Rebuild the 3D "Saved Canvas for 3D" dropdown from window.state.savedCanvases.
     * Selection is 3D-only — does not call loadCanvasState / mutate the editor.
     */
    function refreshSavedCanvasSelect() {
        const select = document.getElementById('stage3dSavedCanvasSelect');
        const group = document.getElementById('stage3dSavedCanvasGroup');
        if (!select) return;

        const appState = window.state || {};
        const list = Array.isArray(appState.savedCanvases) ? appState.savedCanvases.slice() : [];
        // Newest first for easier picking
        list.sort((a, b) => Number(b.id) - Number(a.id));

        const prev = appState.stage3dSelectedCanvasId != null
            ? String(appState.stage3dSelectedCanvasId)
            : (appState.currentCanvasId != null ? String(appState.currentCanvasId) : '');

        select.innerHTML = '';
        if (!list.length) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No saved canvases yet — save one on CanvasMap';
            select.appendChild(opt);
            select.disabled = true;
            appState.stage3dSelectedCanvasId = null;
        } else {
            select.disabled = false;
            list.forEach((c) => {
                const opt = document.createElement('option');
                opt.value = String(c.id);
                const objCount = Array.isArray(c.objects) ? c.objects.length : 0;
                opt.textContent = `${c.name || ('Canvas ' + c.id)} (${objCount} screen${objCount === 1 ? '' : 's'})`;
                select.appendChild(opt);
            });
            const stillExists = list.some((c) => String(c.id) === prev);
            const chosen = stillExists ? prev : String(list[0].id);
            select.value = chosen;
            appState.stage3dSelectedCanvasId = chosen === '' ? null : (
                Number.isFinite(Number(chosen)) ? Number(chosen) : chosen
            );
        }

        // Always keep the picker visible at the top of the 3D sidebar
        if (group) {
            group.style.display = '';
            group.hidden = false;
            group.removeAttribute('hidden');
        }
    }

    /**
     * Physical size + pixel resolution for the 3D wall.
     * Ingests saved CanvasMap layouts or active workspace screens in CanvasMap;
     * falls back to live PixelMap state.
     */
    function resolveScreenMetrics() {
        const appState = window.state || {};
        const result = {
            widthM: 4,
            heightM: 2.5,
            resW: 0,
            resH: 0,
            cols: 8,
            rows: 5,
            source: 'default',
            isMultiScreen: false,
            screens: [],
            spanX_meters: 4,
            spanY_meters: 2.5,
            layoutCenterX: 0,
            layoutCenterY: 0,
            metersPerPixel: 0.5 / 128
        };

        let objects = [];
        if (config.testPattern === 'saved') {
            const saved = getActiveSavedCanvas();
            if (saved && Array.isArray(saved.objects) && saved.objects.length > 0) {
                objects = saved.objects;
            } else if (Array.isArray(appState.canvasMapObjects) && appState.canvasMapObjects.length > 0) {
                // Fallback: active workspace screens placed in CanvasMap
                objects = appState.canvasMapObjects;
            }
        }

        if (objects.length > 0) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            let sumMetersW = 0, sumPixelW = 0;
            let sumPanelsW = 0, sumPanelsH = 0;

            objects.forEach((obj) => {
                const x = Number(obj.x) || 0;
                const y = Number(obj.y) || 0;
                const w = Number(obj.width) || 1;
                const h = Number(obj.height) || 1;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);

                const d = obj.details || {};
                const aw = Number(d.actualWidth);
                const rw = Number(d.resWidth) || w;
                if (Number.isFinite(aw) && aw > 0 && rw > 0) {
                    sumMetersW += aw;
                    sumPixelW += w;
                }
                if (Number.isFinite(Number(d.panelsWidth))) sumPanelsW += Number(d.panelsWidth);
                if (Number.isFinite(Number(d.panelsHeight))) sumPanelsH = Math.max(sumPanelsH, Number(d.panelsHeight));
            });

            const layoutPixelSpan = Math.max(1, maxX - minX);
            const layoutPixelHeight = Math.max(1, maxY - minY);
            const layoutCenterPixelX = (minX + maxX) / 2;
            const layoutCenterPixelY = (minY + maxY) / 2;

            const pW = Number(appState.panelWidth) || 0.5;
            const pH = Number(appState.panelHeight) || 0.5;
            const defaultMpp = pW / 128;
            const mppGlobal = sumPixelW > 0 ? (sumMetersW / sumPixelW) : defaultMpp;

            const stageDeckY = config.riggingMode === 'flown' ? (Number(config.flownHeight) || 1.5) : 0.15;

            // Transform each screen
            const transformedScreens = objects.map((obj, index) => {
                const xPx = Number(obj.x) || 0;
                const yPx = Number(obj.y) || 0;
                const wPx = Number(obj.width) || 1;
                const hPx = Number(obj.height) || 1;
                const d = obj.details || {};

                const wM = Number(d.actualWidth) > 0 ? Number(d.actualWidth) : wPx * mppGlobal;
                const hM = Number(d.actualHeight) > 0 ? Number(d.actualHeight) : hPx * mppGlobal;

                const centerPxX = xPx + wPx / 2;
                const deltaPxX = centerPxX - layoutCenterPixelX;
                const xMeters = deltaPxX * mppGlobal;

                // Grounded on Stage Deck: the lowest screen sits on stage deck.
                // Relative vertical positioning from 2D CanvasMap:
                const relY = Math.max(0, (maxY - (yPx + hPx)) * mppGlobal);
                const yMeters = stageDeckY + hM / 2 + relY;

                const cols = Number(d.panelsWidth) || Math.max(1, Math.round(wM / pW));
                const rows = Number(d.panelsHeight) || Math.max(1, Math.round(hM / pH));

                // Z-staggering to prevent coplanar z-fighting if screens overlap horizontally
                let zMeters = 0;
                for (let j = 0; j < index; j++) {
                    const prev = objects[j];
                    const prevXPx = Number(prev.x) || 0;
                    const prevWPx = Number(prev.width) || 1;
                    const overlapsX = !(xPx + wPx <= prevXPx || xPx >= prevXPx + prevWPx);
                    if (overlapsX) {
                        zMeters = 0.35 * ((index % 3) + 1);
                        break;
                    }
                }

                return {
                    obj,
                    index,
                    x_meters: xMeters,
                    y_meters: yMeters,
                    z_meters: zMeters,
                    width_meters: wM,
                    height_meters: hM,
                    cols,
                    rows,
                    relY
                };
            });

            result.screens = transformedScreens;
            result.isMultiScreen = transformedScreens.length > 1;
            result.spanX_meters = layoutPixelSpan * mppGlobal;
            result.spanY_meters = layoutPixelHeight * mppGlobal;
            result.widthM = result.spanX_meters;
            result.heightM = result.spanY_meters;
            result.resW = Math.round(layoutPixelSpan);
            result.resH = Math.round(layoutPixelHeight);
            result.cols = sumPanelsW > 0 ? sumPanelsW : Math.max(1, Math.round(result.widthM / pW));
            result.rows = sumPanelsH > 0 ? sumPanelsH : Math.max(1, Math.round(result.heightM / pH));
            result.metersPerPixel = mppGlobal;
            result.layoutCenterX = layoutCenterPixelX;
            result.layoutCenterY = layoutCenterPixelY;
            result.source = 'saved';
            return result;
        }

        // Live PixelMap / fallbacks
        let screenW = Number(appState.actualWidthMeters) || 0;
        let screenH = Number(appState.actualHeightMeters) || 0;
        if (screenW <= 0) screenW = 4;
        if (screenH <= 0) screenH = 2.5;
        result.widthM = screenW;
        result.heightM = screenH;
        result.resW = Number(appState.totalResWidth) || Math.round(screenW * 256);
        result.resH = Number(appState.totalResHeight) || Math.round(screenH * 256);
        result.cols = appState.isPanelCountMode
            ? (appState.panelsInWidth || 8)
            : Math.max(1, Math.round(screenW / (appState.panelWidth || 0.5)));
        result.rows = appState.isPanelCountMode
            ? (appState.panelsInHeight || 5)
            : Math.max(1, Math.round(screenH / (appState.panelHeight || 0.5)));
        result.source = config.testPattern === 'live' ? 'live' : 'default';
        return result;
    }

    function makePlaceholderTexture(message) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 1024;
        offCanvas.height = 512;
        const ctx = offCanvas.getContext('2d');
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = 4;
        ctx.strokeRect(24, 24, offCanvas.width - 48, offCanvas.height - 48);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = String(message || 'No saved CanvasMap selected').split('\n');
        lines.forEach((line, i) => {
            ctx.fillText(line, offCanvas.width / 2, offCanvas.height / 2 + (i - (lines.length - 1) / 2) * 40);
        });
        return applyTextureColorSpace(new THREE.CanvasTexture(offCanvas));
    }

    function drawScreenPlaceholder(ctx, w, h, name, resW, resH, index, totalScreens, cols, rows) {
        ctx.fillStyle = '#080c14';
        ctx.fillRect(0, 0, w, h);

        // Technical Grid representing physical LED panels
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        const gridCols = Number(cols) || 8;
        const gridRows = Number(rows) || 5;
        for (let c = 0; c <= gridCols; c++) {
            const x = Math.round((c / gridCols) * w);
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let r = 0; r <= gridRows; r++) {
            const y = Math.round((r / gridRows) * h);
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        // Inner glowing border
        ctx.strokeStyle = '#00d4ff';
        ctx.lineWidth = Math.max(2, Math.min(6, Math.round(w / 180)));
        ctx.strokeRect(8, 8, w - 16, h - 16);

        // Professional Tech Badge in center
        const badgeW = Math.min(w * 0.85, 340);
        const badgeH = Math.min(h * 0.55, 120);
        const bx = (w - badgeW) / 2;
        const by = (h - badgeH) / 2;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(bx, by, badgeW, badgeH);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, badgeW, badgeH);

        // Title
        ctx.fillStyle = '#00f0ff';
        ctx.font = `bold ${Math.max(14, Math.round(badgeH * 0.28))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(name).toUpperCase(), w / 2, by + badgeH * 0.35);

        // Subtitle (Resolution + Panel count)
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.max(11, Math.round(badgeH * 0.18))}px sans-serif`;
        ctx.fillText(`${resW} × ${resH} px • ${gridCols}×${gridRows} panels`, w / 2, by + badgeH * 0.68);
    }

    function createIndividualScreenTexture(obj, index, totalScreens, pattern) {
        const d = obj.details || {};
        const resW = Number(d.resWidth) || Number(obj.width) || 1920;
        const resH = Number(d.resHeight) || Number(obj.height) || 1080;
        const name = obj.name || `Screen ${index + 1}`;

        const maxDim = 1024;
        const scale = Math.min(1, maxDim / resW, maxDim / resH);
        const texW = Math.max(128, Math.round(resW * scale));
        const texH = Math.max(128, Math.round(resH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = texW;
        canvas.height = texH;
        const ctx = canvas.getContext('2d');

        if (pattern === 'colorbars') {
            const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
            const barW = texW / colors.length;
            colors.forEach((col, i) => {
                ctx.fillStyle = col;
                ctx.fillRect(i * barW, 0, barW, texH);
            });
            const capH = Math.max(28, Math.round(texH * 0.12));
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.fillRect(0, texH - capH, texW, capH);
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(12, Math.round(capH * 0.55))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${name.toUpperCase()} (${index + 1}/${totalScreens}) | ${resW}×${resH}`, texW / 2, texH - capH / 2);
        } else if (pattern === 'white') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, texW, texH);
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, texW, texH);
        } else if (pattern === 'saved' && obj._stageImg && obj._stageImg.complete && obj._stageImg.naturalWidth) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, texW, texH);
            ctx.drawImage(obj._stageImg, 0, 0, texW, texH);
        } else if (pattern === 'saved' && obj.dataUrl) {
            if (!obj._stageImgLoading) {
                obj._stageImgLoading = true;
                const img = new Image();
                img.onload = () => {
                    obj._stageImg = img;
                    obj._stageImgLoading = false;
                    lastRebuildSig = '';
                    if (isInitialized) rebuildScreens();
                };
                img.onerror = () => { obj._stageImgLoading = false; };
                img.src = obj.dataUrl;
            }
            drawScreenPlaceholder(ctx, texW, texH, name, resW, resH, index, totalScreens, d.panelsWidth, d.panelsHeight);
        } else {
            drawScreenPlaceholder(ctx, texW, texH, name, resW, resH, index, totalScreens, d.panelsWidth, d.panelsHeight);
        }

        return applyTextureColorSpace(new THREE.CanvasTexture(canvas));
    }

    function compositeSavedCanvasTexture(saved) {
        const objects = Array.isArray(saved?.objects) ? saved.objects : [];
        if (!objects.length) {
            return makePlaceholderTexture('Saved canvas has no screens\nAdd screens on CanvasMap, then Save');
        }

        let maxX = 0, maxY = 0;
        objects.forEach((obj) => {
            maxX = Math.max(maxX, (Number(obj.x) || 0) + (Number(obj.width) || 0));
            maxY = Math.max(maxY, (Number(obj.y) || 0) + (Number(obj.height) || 0));
        });
        const appState = window.state || {};
        const canvasW = Math.max(64, Math.round(maxX) || appState.canvasMapWidth || 1920);
        const canvasH = Math.max(64, Math.round(maxY) || appState.canvasMapHeight || 1080);

        // Cap texture size for GPU safety while keeping aspect
        const maxDim = 2048;
        const scale = Math.min(1, maxDim / canvasW, maxDim / canvasH);
        const outW = Math.max(64, Math.round(canvasW * scale));
        const outH = Math.max(64, Math.round(canvasH * scale));

        const offCanvas = document.createElement('canvas');
        offCanvas.width = outW;
        offCanvas.height = outH;
        const ctx = offCanvas.getContext('2d');
        ctx.fillStyle = appState.canvasBgColor || '#000000';
        ctx.fillRect(0, 0, outW, outH);

        objects.forEach((obj) => {
            if (!obj || !obj.dataUrl) return;
            try {
                // Synchronous path: data URLs from in-memory saves decode via Image only async.
                // Use thumbnail-style draw when an HTMLImageElement is already attached;
                // otherwise draw a labeled rect so rebuild stays sync, then kick async upgrade.
                const x = (Number(obj.x) || 0) * scale;
                const y = (Number(obj.y) || 0) * scale;
                const w = Math.max(1, (Number(obj.width) || 1) * scale);
                const h = Math.max(1, (Number(obj.height) || 1) * scale);

                if (obj._stageImg && obj._stageImg.complete && obj._stageImg.naturalWidth) {
                    ctx.save();
                    ctx.translate(x + w / 2, y + h / 2);
                    ctx.rotate(((Number(obj.rotation) || 0) * Math.PI) / 180);
                    ctx.drawImage(obj._stageImg, -w / 2, -h / 2, w, h);
                    ctx.restore();
                } else {
                    ctx.fillStyle = '#1e293b';
                    ctx.fillRect(x, y, w, h);
                    ctx.strokeStyle = '#38bdf8';
                    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
                    // Async load then rebuild once
                    if (!obj._stageImgLoading) {
                        obj._stageImgLoading = true;
                        const img = new Image();
                        img.onload = () => {
                            obj._stageImg = img;
                            obj._stageImgLoading = false;
                            savedTextureCacheKey = ''; // bust cache
                            if (isInitialized) rebuildScreens();
                        };
                        img.onerror = () => { obj._stageImgLoading = false; };
                        img.src = obj.dataUrl;
                    }
                }
            } catch (_) { /* skip bad object */ }
        });

        return applyTextureColorSpace(new THREE.CanvasTexture(offCanvas));
    }

    function getScreenTexture() {
        const pattern = config.testPattern;

        if (pattern === 'saved') {
            const saved = getActiveSavedCanvas();
            const cacheKey = saved
                ? `saved:${saved.id}:${(saved.objects || []).length}:${(saved.objects || []).map((o) => o.id).join(',')}`
                : 'saved:none';
            if (screenTexture && savedTextureCacheKey === cacheKey) {
                return screenTexture;
            }
            disposeScreenTexture();
            screenTexture = saved
                ? compositeSavedCanvasTexture(saved)
                : makePlaceholderTexture('No saved CanvasMap selected\nSave a layout on the CanvasMap tab');
            savedTextureCacheKey = cacheKey;
            return screenTexture;
        }

        disposeScreenTexture();

        if (pattern === 'live') {
            const pixelCanvas = document.getElementById('pixelMapCanvas');
            if (pixelCanvas && pixelCanvas.width > 0 && pixelCanvas.height > 0) {
                screenTexture = applyTextureColorSpace(new THREE.CanvasTexture(pixelCanvas));
                return screenTexture;
            }
        }

        // Fallback or Test Patterns generated on an offscreen canvas
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 1024;
        offCanvas.height = 512;
        const ctx = offCanvas.getContext('2d');

        if (pattern === 'colorbars') {
            const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
            const w = offCanvas.width / colors.length;
            colors.forEach((col, i) => {
                ctx.fillStyle = col;
                ctx.fillRect(i * w, 0, w, offCanvas.height);
            });
        } else if (pattern === 'white') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
        } else {
            // Default Grid pattern
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 4;
            const step = 64;
            for (let x = 0; x <= offCanvas.width; x += step) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, offCanvas.height); ctx.stroke();
            }
            for (let y = 0; y <= offCanvas.height; y += step) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(offCanvas.width, y); ctx.stroke();
            }
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('PIXELMAP 3D STAGE', offCanvas.width / 2, offCanvas.height / 2);
        }

        screenTexture = applyTextureColorSpace(new THREE.CanvasTexture(offCanvas));
        return screenTexture;
    }

    function rebuildScreens() {
        // app.js calls PixelMap3D.rebuild() from updatePixelMap before the 3D tab
        // has initialized the Three.js scene — no-op until init3DStage() runs.
        if (!scene) return;

        const metrics = resolveScreenMetrics();
        let screenWidthMeters = metrics.widthM;
        let screenHeightMeters = metrics.heightM;
        if (screenWidthMeters <= 0 || isNaN(screenWidthMeters)) screenWidthMeters = 4;
        if (screenHeightMeters <= 0 || isNaN(screenHeightMeters)) screenHeightMeters = 2.5;

        const panelCols = Math.max(1, metrics.cols || 8);
        const panelRows = Math.max(1, metrics.rows || 5);
        const curveDeg = Number(config.curveAngle) || 0;
        const glow = Math.max(0.2, Math.min(1.5, Number(config.ambientGlow) || 1));

        // Skip identical rebuilds — updatePixelMap hammers PixelMap3D.rebuild() (3D-11)
        // Live mode always refreshes texture.needsUpdate in the animate loop; still allow
        // a cheap early-out when dimensions/config haven't changed and texture is cached.
        const rebuildSig = [
            screenWidthMeters.toFixed(3),
            screenHeightMeters.toFixed(3),
            panelCols,
            panelRows,
            curveDeg,
            config.curveDirection,
            config.riggingMode,
            String(config.flownHeight),
            config.sideWings,
            config.testPattern,
            config.showEnvironment ? '1' : '0',
            glow.toFixed(2),
            metrics.source,
            savedTextureCacheKey || '',
            (window.state && window.state.stage3dSelectedCanvasId) || '',
            (window.state && window.state.currentCanvasId) || '',
            metrics.isMultiScreen ? ('multi:' + metrics.screens.length) : 'single',
            metrics.screens.map(s => `${s.x_meters.toFixed(2)},${s.y_meters.toFixed(2)},${s.width_meters.toFixed(2)},${s.height_meters.toFixed(2)}`).join(';')
        ].join('|');

        if (rebuildSig === lastRebuildSig && screenGroup) {
            // Live PixelMap pixels refresh via screenTexture.needsUpdate in animate()
            updateEngineeringSpecs(metrics);
            return;
        }

        // Tear down previous meshes BEFORE replacing the shared CanvasTexture (3D-11)
        if (screenGroup) {
            scene.remove(screenGroup);
            disposeObject3D(screenGroup);
            screenGroup = null;
        }

        lastRebuildSig = rebuildSig;
        screenGroup = new THREE.Group();

        // Calculate Y position (Ground support vs Flown)
        const baseY = config.riggingMode === 'flown' ? config.flownHeight : 0.15;
        const centerY = baseY + screenHeightMeters / 2;

        if (metrics.isMultiScreen) {
            try {
                metrics.screens.forEach((sc, idx) => {
                    const screenSubGroup = new THREE.Group();
                    screenSubGroup.name = `Screen_${idx}_${sc.obj.id || idx}`;
                    screenSubGroup.position.set(sc.x_meters, sc.y_meters, sc.z_meters);

                    const screenTex = createIndividualScreenTexture(sc.obj, idx, metrics.screens.length, config.testPattern);
                    const screenMat = new THREE.MeshBasicMaterial({
                        map: screenTex,
                        color: new THREE.Color(glow, glow, glow),
                        toneMapped: false
                    });

                    // Each individual screen gets front panel + rear casing + ground support
                    const screenMesh = createScreenPanelMesh(
                        sc.width_meters,
                        sc.height_meters,
                        screenMat,
                        sc.cols,
                        sc.rows,
                        config.riggingMode === 'ground'
                    );
                    screenSubGroup.add(screenMesh);
                    screenGroup.add(screenSubGroup);
                });
            } catch (err) {
                console.warn('PixelMap3D multi-screen generation error:', err);
            }

            scene.add(screenGroup);
            updateEngineeringSpecs(metrics);
            frameCameraToScreen(metrics.spanX_meters, metrics.spanY_meters, baseY + metrics.spanY_meters / 2, false);
            return;
        }

        const tex = getScreenTexture();

        // Unlit LED face — matches source canvas colors (Standard + map+emissive was washing them out)
        const mat = new THREE.MeshBasicMaterial({
            map: tex,
            color: new THREE.Color(glow, glow, glow),
            toneMapped: false // keep source hues out of ACES wash
        });
        screenMaterial = mat;

        // Build Main Screen (Flat vs Curved) — catch curve math so UI never throws (3D-11)
        try {
            if (curveDeg === 0) {
                const screenMesh = createScreenPanelMesh(screenWidthMeters, screenHeightMeters, mat, panelCols, panelRows);
                screenMesh.position.set(0, centerY, 0);
                screenGroup.add(screenMesh);
            } else {
                const curvedMesh = createCurvedWallMesh(screenWidthMeters, screenHeightMeters, mat, panelCols, panelRows, curveDeg, config.curveDirection);
                curvedMesh.position.set(0, centerY, 0);
                screenGroup.add(curvedMesh);
            }

            // Build Side Wings if enabled
            if (config.sideWings === 'wings') {
                const wingW = Math.max(1.5, screenWidthMeters * 0.35);
                const wingH = screenHeightMeters * 0.85;
                const wingAngleRad = (config.wingAngle * Math.PI) / 180;
                const wingX = screenWidthMeters / 2 + (wingW / 2) * Math.cos(wingAngleRad) + 0.3;
                const wingZ = (wingW / 2) * Math.sin(wingAngleRad) + 0.2;

                // Wings / DJ booth: LED faces only — no ground stacks (main wall owns support)
                const leftWing = createScreenPanelMesh(wingW, wingH, mat, 3, panelRows, false);
                leftWing.position.set(-wingX, centerY, wingZ);
                leftWing.rotation.y = wingAngleRad;
                screenGroup.add(leftWing);

                const rightWing = createScreenPanelMesh(wingW, wingH, mat, 3, panelRows, false);
                rightWing.position.set(wingX, centerY, wingZ);
                rightWing.rotation.y = -wingAngleRad;
                screenGroup.add(rightWing);
            } else if (config.sideWings === 'dj') {
                const djW = Math.min(2.5, screenWidthMeters * 0.6);
                const djH = 1.0;
                const djScreen = createScreenPanelMesh(djW, djH, mat, 4, 2, false);
                djScreen.position.set(0, 0.6, 2.5);
                screenGroup.add(djScreen);
            }
        } catch (err) {
            console.warn('PixelMap3D rebuildScreens curve/mesh error — falling back to flat:', err);
            // Clear partial group and fall back to a simple flat panel
            while (screenGroup.children.length) {
                const child = screenGroup.children[0];
                screenGroup.remove(child);
                disposeObject3D(child);
            }
            const fallback = createScreenPanelMesh(screenWidthMeters, screenHeightMeters, mat, panelCols, panelRows);
            fallback.position.set(0, centerY, 0);
            screenGroup.add(fallback);
        }

        scene.add(screenGroup);
        updateEngineeringSpecs();
        frameCameraToScreen(screenWidthMeters, screenHeightMeters, centerY, false);
    }

    /**
     * Pull the camera in/out so the LED wall fills a useful portion of the viewport.
     * Small walls (default 2×2 m) were hard to see from the fixed z=11 FOH seat.
     */
    function frameCameraToScreen(screenW, screenH, centerY, force) {
        if (!camera || !controls) return;

        const wingsExtra = (config.sideWings === 'wings') ? screenW * 0.9 : (config.sideWings === 'dj' ? 1.5 : 0);
        const span = Math.max(screenW + wingsExtra, screenH, 1);
        const frameKey = [
            screenW.toFixed(2),
            screenH.toFixed(2),
            centerY.toFixed(2),
            config.sideWings,
            config.riggingMode,
            String(config.flownHeight)
        ].join('|');

        if (!force && frameKey === lastFrameKey) return;
        lastFrameKey = frameKey;

        const fovRad = (camera.fov * Math.PI) / 180;
        // Fit the larger span with ~35% margin so the wall isn't tiny or clipped
        let distance = (span * 0.55) / Math.tan(fovRad / 2);
        distance = Math.max(4, Math.min(28, distance));

        const targetY = Math.max(1.2, centerY);
        controls.target.set(0, targetY, 0);
        camera.position.set(0, targetY + Math.max(0.6, screenH * 0.15), distance);
        controls.minDistance = Math.max(1.5, distance * 0.25);
        controls.maxDistance = Math.max(35, distance * 3);
        controls.update();
    }

    /**
     * Ground-support stack in local screen space.
     * LED face is at z=0 facing +Z (audience). All geometry must stay at z < 0
     * so uprights/feet never poke through the LED face.
     */
    function createGroundSupportLocal(width, height) {
        const g = new THREE.Group();
        const steel = new THREE.MeshStandardMaterial({ color: 0x2c333c, metalness: 0.78, roughness: 0.32 });
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.7, roughness: 0.4 });

        const numLegs = Math.max(2, Math.min(6, Math.round(width / 1.8) + 1));
        const step = numLegs <= 1 ? 0 : width / (numLegs - 1);

        // Keep a clear gap behind the face (cabinet already occupies ~z=-0.08..0)
        const faceClearance = 0.10;
        const uprightW = 0.06;
        const uprightD = 0.06;
        const uprightH = Math.max(0.6, height * 0.5);
        const footW = 0.26;
        const footH = 0.05;
        const footL = 0.55; // extends rearward only

        for (let i = 0; i < numLegs; i++) {
            const x = -width / 2 + i * step;

            // Vertical upright fully behind the cabinet
            const upright = new THREE.Mesh(
                new THREE.BoxGeometry(uprightW, uprightH, uprightD),
                steel
            );
            const uprightZ = -(faceClearance + uprightD / 2);
            const uprightY = -height / 2 + uprightH / 2 - 0.04;
            upright.position.set(x, uprightY, uprightZ);
            upright.castShadow = true;
            g.add(upright);

            // Outrigger / ballast foot — extends further toward stage rear (−Z)
            const foot = new THREE.Mesh(
                new THREE.BoxGeometry(footW, footH, footL),
                baseMat
            );
            const footFront = uprightZ - uprightD / 2;
            const footZ = footFront - footL / 2;
            const footY = -height / 2 - 0.06;
            foot.position.set(x, footY, footZ);
            foot.castShadow = true;
            g.add(foot);

            // Short diagonal brace (upright mid → foot rear), also behind face
            const braceLen = 0.42;
            const brace = new THREE.Mesh(
                new THREE.BoxGeometry(0.03, braceLen, 0.03),
                steel
            );
            brace.position.set(
                x,
                footY + braceLen * 0.35,
                footZ + footL * 0.15
            );
            brace.rotation.x = Math.PI / 5;
            g.add(brace);
        }

        return g;
    }

    function createScreenPanelMesh(width, height, material, cols, rows, includeGroundSupport) {
        const group = new THREE.Group();
        const withSupport = includeGroundSupport !== false;

        // Front display panel
        const frontGeo = new THREE.PlaneGeometry(width, height);
        const frontMesh = new THREE.Mesh(frontGeo, material);
        frontMesh.castShadow = true;
        group.add(frontMesh);

        // Rear cabinet frame structure (depth 0.08m) — entirely behind face
        const frameGeo = new THREE.BoxGeometry(width, height, 0.08);
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x14171c,
            metalness: 0.8,
            roughness: 0.4
        });
        const frameMesh = new THREE.Mesh(frameGeo, frameMat);
        frameMesh.position.z = -0.041;
        group.add(frameMesh);

        // Ground support sits behind the LED face (never intersects z>=0)
        if (withSupport && config.showEnvironment && config.riggingMode === 'ground') {
            group.add(createGroundSupportLocal(width, height));
        }

        return group;
    }

    /**
     * Chord-correct curved LED wall (concave or convex).
     *
     * Camera looks from +Z. Arc length = width, angle = angleDeg.
     * Concave: ends toward audience (hug) — audience sees inner face.
     * Convex: center toward audience (bulge) — audience sees outer face.
     *
     * Important: do NOT multiply both angle and Z by a shared sign — that
     * double-flips convex normals and folds the wall inside-out at higher angles.
     */
    function createCurvedWallMesh(width, height, material, cols, rows, angleDeg, direction) {
        const group = new THREE.Group();
        // Defensive: NaN/negative/tiny angles must not throw or produce Inf radius (3D-11)
        const safeDeg = Math.max(0, Math.min(45, Number(angleDeg) || 0));
        if (!(safeDeg > 0.05) || !(width > 0) || !(height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
            // Degenerate → treat as flat panel (caller normally routes θ===0 here already)
            return createScreenPanelMesh(
                Number.isFinite(width) && width > 0 ? width : 4,
                Number.isFinite(height) && height > 0 ? height : 2.5,
                material,
                cols,
                rows
            );
        }
        const totalAngleRad = Math.max(0.001, (safeDeg * Math.PI) / 180);
        const isConvex = direction === 'convex';

        // Fine facets for a smooth ribbon; at least one per cabinet column
        const segs = Math.max(cols || 1, Math.ceil(safeDeg / 2.5), 20);
        const radius = width / totalAngleRad;
        if (!Number.isFinite(radius) || radius <= 0) {
            return createScreenPanelMesh(width, height, material, cols, rows);
        }
        const angleStep = totalAngleRad / segs;
        const chord = 2 * radius * Math.sin(angleStep / 2);
        if (!Number.isFinite(chord) || chord <= 0) {
            return createScreenPanelMesh(width, height, material, cols, rows);
        }

        const backMat = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.8, roughness: 0.4 });

        // Audience-facing normal & pose for a segment at mid-angle α
        const poseAt = (alpha) => {
            const s = Math.sin(alpha);
            const c = Math.cos(alpha);
            if (isConvex) {
                // Bulge toward audience: center at z=-R relative to mid chord
                return {
                    x: radius * s,
                    z: radius * (c - 1),
                    // Outer surface faces audience → normal (sin, 0, cos)
                    rotY: alpha,
                    nx: s,
                    nz: c
                };
            }
            // Concave hug: ends toward audience; center at z=+R
            return {
                x: radius * s,
                z: radius * (1 - c),
                // Inner surface faces audience → normal (−sin, 0, cos)
                rotY: -alpha,
                nx: -s,
                nz: c
            };
        };

        for (let i = 0; i < segs; i++) {
            const alpha = -totalAngleRad / 2 + (i + 0.5) * angleStep;
            const pose = poseAt(alpha);

            const uMin = i / segs;
            const uMax = (i + 1) / segs;

            const panelGeo = new THREE.PlaneGeometry(chord, height);
            const uvAttr = panelGeo.attributes.uv;
            uvAttr.setXY(0, uMin, 1);
            uvAttr.setXY(1, uMax, 1);
            uvAttr.setXY(2, uMin, 0);
            uvAttr.setXY(3, uMax, 0);
            uvAttr.needsUpdate = true;

            const panelMesh = new THREE.Mesh(panelGeo, material);
            panelMesh.position.set(pose.x, 0, pose.z);
            panelMesh.rotation.y = pose.rotY;
            group.add(panelMesh);

            // Cabinet back — always opposite the audience normal
            const backGeo = new THREE.BoxGeometry(chord * 0.98, height, 0.08);
            const backMesh = new THREE.Mesh(backGeo, backMat);
            backMesh.position.set(
                pose.x - pose.nx * 0.041,
                0,
                pose.z - pose.nz * 0.041
            );
            backMesh.rotation.y = pose.rotY;
            group.add(backMesh);
        }

        // Ground support at curve ends — only when full stage environment is on
        if (config.showEnvironment && config.riggingMode === 'ground') {
            const steel = new THREE.MeshStandardMaterial({ color: 0x2c333c, metalness: 0.78, roughness: 0.32 });
            const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, metalness: 0.7, roughness: 0.4 });
            const faceClearance = 0.10;
            const uprightW = 0.06, uprightD = 0.06;
            const uprightH = Math.max(0.6, height * 0.5);
            const footW = 0.26, footH = 0.05, footL = 0.55;

            [-totalAngleRad / 2, totalAngleRad / 2].forEach((a) => {
                const pose = poseAt(a);

                const upright = new THREE.Mesh(
                    new THREE.BoxGeometry(uprightW, uprightH, uprightD),
                    steel
                );
                const backDist = faceClearance + uprightD / 2;
                upright.position.set(
                    pose.x - pose.nx * backDist,
                    -height / 2 + uprightH / 2 - 0.04,
                    pose.z - pose.nz * backDist
                );
                upright.rotation.y = pose.rotY;
                upright.castShadow = true;
                group.add(upright);

                const foot = new THREE.Mesh(
                    new THREE.BoxGeometry(footW, footH, footL),
                    baseMat
                );
                const footDist = faceClearance + uprightD + footL / 2;
                foot.position.set(
                    pose.x - pose.nx * footDist,
                    -height / 2 - 0.06,
                    pose.z - pose.nz * footDist
                );
                foot.rotation.y = pose.rotY;
                foot.castShadow = true;
                group.add(foot);
            });
        }

        return group;
    }

    function setCameraPreset(viewName) {
        if (!controls || !camera) return;

        const metrics = resolveScreenMetrics();
        let screenW = Number(metrics.spanX_meters || metrics.widthM) || 4;
        let screenH = Number(metrics.spanY_meters || metrics.heightM) || 2.5;
        if (screenW <= 0 || isNaN(screenW)) screenW = 4;
        if (screenH <= 0 || isNaN(screenH)) screenH = 2.5;
        const baseY = config.riggingMode === 'flown' ? config.flownHeight : 0.15;
        const centerY = baseY + screenH / 2;
        const span = Math.max(screenW, screenH, 1);
        const fovRad = (camera.fov * Math.PI) / 180;
        const fitDist = Math.max(4, Math.min(28, (span * 0.55) / Math.tan(fovRad / 2)));

        controls.reset();
        switch (viewName) {
            case 'foh': // Audience Front of House — size-aware
                frameCameraToScreen(screenW, screenH, centerY, true);
                return;
            case 'top': // Overhead Rigging View
                camera.position.set(0, Math.max(10, fitDist * 1.2), 0.5);
                controls.target.set(0, 0, 0);
                break;
            case 'side': // 45 degree stage perspective
                camera.position.set(fitDist * 0.75, centerY + screenH * 0.25, fitDist * 0.65);
                controls.target.set(0, centerY, 0);
                break;
            case 'detail': // Close-up
                camera.position.set(0, centerY, Math.max(3, fitDist * 0.45));
                controls.target.set(0, centerY, 0);
                break;
            default: // Reset → auto-frame
                frameCameraToScreen(screenW, screenH, centerY, true);
                return;
        }
        controls.update();
    }

    function updateEngineeringSpecs(metricsOverride) {
        const metrics = metricsOverride || resolveScreenMetrics();
        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        if (metrics.isMultiScreen && metrics.screens.length > 0) {
            let totalPanels = 0;
            let totalAreaM2 = 0;
            let totalPixels = 0;
            let totalPorts = 0;
            let totalCabinets = 0;

            metrics.screens.forEach(sc => {
                const d = sc.obj.details || {};
                const wM = sc.width_meters;
                const hM = sc.height_meters;
                const area = wM * hM;
                totalAreaM2 += area;
                const cols = sc.cols;
                const rows = sc.rows;
                const cabs = Number(d.totalPanels) || (cols * rows);
                totalCabinets += cabs;

                const resW = Number(d.resWidth) || Math.round(wM * 256);
                const resH = Number(d.resHeight) || Math.round(hM * 256);
                const px = resW * resH;
                totalPixels += px;
                totalPorts += Math.max(1, Math.ceil(px / 650000));
            });

            const areaSqFt = totalAreaM2 * 10.7639;
            const maxWatts = Math.round(totalAreaM2 * 600);
            const avgWatts = Math.round(totalAreaM2 * 240);
            const amps220 = (maxWatts / 220).toFixed(1);
            const amps110 = (maxWatts / 110).toFixed(1);
            const totalWeightKg = Math.round(totalCabinets * 8);
            const totalWeightLbs = Math.round(totalWeightKg * 2.20462);

            setEl('spec3dResolution', `${metrics.screens.length} Screens | ${metrics.resW} × ${metrics.resH} px (${(totalPixels / 1000000).toFixed(2)} MP)`);
            setEl('spec3dArea', `${totalAreaM2.toFixed(2)} m² (${areaSqFt.toFixed(1)} sq ft)`);
            setEl('spec3dCabinets', `${totalCabinets} cabinets across ${metrics.screens.length} screens`);
            setEl('spec3dPower', `${(maxWatts / 1000).toFixed(2)} kW Max (${amps220}A @ 220V | ${amps110}A @ 110V)`);
            setEl('spec3dDataPorts', `${totalPorts} Ports (1G RJ45 @ 650k px/port)`);
            setEl('spec3dWeight', `${totalWeightKg} kg (${totalWeightLbs} lbs)`);
            return;
        }

        let screenW = metrics.widthM;
        let screenH = metrics.heightM;
        if (screenW <= 0) screenW = 4;
        if (screenH <= 0) screenH = 2.5;

        const resW = metrics.resW || Math.round(screenW * 256);
        const resH = metrics.resH || Math.round(screenH * 256);
        const totalPixels = resW * resH;

        const areaM2 = screenW * screenH;
        const areaSqFt = areaM2 * 10.7639;

        const cols = Math.max(1, metrics.cols || 8);
        const rows = Math.max(1, metrics.rows || 5);
        const totalCabinets = cols * rows;

        // AV Engineering standards
        // Typical LED wall: ~600W max per m2, ~240W avg per m2
        const maxWatts = Math.round(areaM2 * 600);
        const avgWatts = Math.round(areaM2 * 240);
        const amps220 = (maxWatts / 220).toFixed(1);
        const amps110 = (maxWatts / 110).toFixed(1);

        // Standard 1Gbps RJ45 port capacity (Novastar / Brompton ~650,000 px @ 60Hz 8-bit)
        const portsRequired = Math.max(1, Math.ceil(totalPixels / 650000));

        // Weight estimation (~32kg per m2 or ~8kg per 500x500 cabinet)
        const totalWeightKg = Math.round(totalCabinets * 8);
        const totalWeightLbs = Math.round(totalWeightKg * 2.20462);

        setEl('spec3dResolution', `${resW} × ${resH} px (${(totalPixels / 1000000).toFixed(2)} MP)`);
        setEl('spec3dArea', `${areaM2.toFixed(2)} m² (${areaSqFt.toFixed(1)} sq ft)`);
        setEl('spec3dCabinets', `${totalCabinets} cabinets (${cols}W × ${rows}H)`);
        setEl('spec3dPower', `${(maxWatts / 1000).toFixed(2)} kW Max (${amps220}A @ 220V | ${amps110}A @ 110V)`);
        setEl('spec3dDataPorts', `${portsRequired} Ports (1G RJ45 @ 650k px/port)`);
        setEl('spec3dWeight', `${totalWeightKg} kg (${totalWeightLbs} lbs)`);
    }

    function handleResize() {
        if (!stageContainer || !renderer || !camera) return;
        const width = stageContainer.clientWidth;
        const height = stageContainer.clientHeight;
        if (width > 0 && height > 0) {
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    }

    function export3DSnapshot() {
        if (!renderer || !canvasElement) return;
        try {
            renderer.render(scene, camera);
            const dataUrl = canvasElement.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `3D_STAGE_VISUALIZER_${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
            if (window.Aptabase) window.Aptabase.trackEvent('export_3d_snapshot');
        } catch (err) {
            console.error('Failed to export 3D snapshot:', err);
        }
    }

    let eventsBound = false;
    function bindDomEvents() {
        if (eventsBound) return;
        eventsBound = true;

        // Curvature Slider
        const curveSlider = document.getElementById('stage3dCurveSlider');
        const curveVal = document.getElementById('stage3dCurveVal');
        if (curveSlider) {
            curveSlider.addEventListener('input', (e) => {
                const deg = parseInt(e.target.value, 10);
                if (curveVal) curveVal.textContent = deg === 0 ? '0° (Flat)' : `${deg}°`;
                window.PixelMap3D.setConfig('curveAngle', deg);
            });
        }

        // Curve Direction Radios
        const curveDirs = document.querySelectorAll('input[name="stage3dCurveDir"]');
        curveDirs.forEach(r => {
            r.addEventListener('change', (e) => {
                if (e.target.checked) {
                    window.PixelMap3D.setConfig('curveDirection', e.target.value);
                }
            });
        });

        // Rigging Mode
        const riggingSelect = document.getElementById('stage3dRiggingSelect');
        const flownGroup = document.getElementById('stage3dFlownHeightGroup');
        if (riggingSelect) {
            riggingSelect.addEventListener('change', (e) => {
                const mode = e.target.value;
                if (flownGroup) {
                    if (mode === 'flown') flownGroup.classList.remove('d-none');
                    else flownGroup.classList.add('d-none');
                }
                window.PixelMap3D.setConfig('riggingMode', mode);
            });
        }

        // Flown Height Slider
        const flownSlider = document.getElementById('stage3dFlownHeightSlider');
        const flownVal = document.getElementById('stage3dFlownHeightVal');
        if (flownSlider) {
            flownSlider.addEventListener('input', (e) => {
                const h = parseFloat(e.target.value);
                if (flownVal) flownVal.textContent = `${h.toFixed(2)} m`;
                window.PixelMap3D.setConfig('flownHeight', h);
            });
        }

        // Side Wings
        const sideWingsSelect = document.getElementById('stage3dSideWingsSelect');
        if (sideWingsSelect) {
            sideWingsSelect.addEventListener('change', (e) => {
                window.PixelMap3D.setConfig('sideWings', e.target.value);
            });
        }

        // LED-only vs full stage environment (default: LED only)
        const envToggle = document.getElementById('stage3dShowEnvironmentToggle');
        if (envToggle) {
            envToggle.checked = !!config.showEnvironment;
            envToggle.addEventListener('change', (e) => {
                window.PixelMap3D.setConfig('showEnvironment', e.target.checked);
            });
        }
        applyEnvironmentMode(!!config.showEnvironment);

        // Texture / Test Pattern — keep select in sync with config default ('saved')
        const textureSelect = document.getElementById('stage3dTextureSelect');
        if (textureSelect) {
            try { textureSelect.value = config.testPattern || 'saved'; } catch { }
            textureSelect.addEventListener('change', (e) => {
                window.PixelMap3D.setConfig('testPattern', e.target.value);
                refreshSavedCanvasSelect();
            });
        }

        // Saved CanvasMap picker (3D-only — does not Load into CanvasMap editor)
        const savedCanvasSelect = document.getElementById('stage3dSavedCanvasSelect');
        if (savedCanvasSelect) {
            savedCanvasSelect.addEventListener('change', (e) => {
                const appState = window.state || {};
                const val = e.target.value;
                appState.stage3dSelectedCanvasId = val === '' ? null : (
                    Number.isFinite(Number(val)) ? Number(val) : val
                );
                // Selecting a canvas implies Saved CanvasMap mode
                if (val) {
                    config.testPattern = 'saved';
                    const textureSelect = document.getElementById('stage3dTextureSelect');
                    if (textureSelect) textureSelect.value = 'saved';
                }
                savedTextureCacheKey = '';
                lastRebuildSig = '';
                rebuildScreens();
            });
        }
        refreshSavedCanvasSelect();

        // Stage Deck
        const deckSelect = document.getElementById('stage3dDeckSelect');
        if (deckSelect) {
            deckSelect.addEventListener('change', (e) => {
                window.PixelMap3D.setConfig('deckStyle', e.target.value);
            });
        }

        // Ambient Screen Glow
        const ambientGlowSlider = document.getElementById('stage3dAmbientGlow');
        if (ambientGlowSlider) {
            ambientGlowSlider.addEventListener('input', (e) => {
                window.PixelMap3D.setConfig('ambientGlow', parseFloat(e.target.value));
            });
        }

        // Spotlights Toggle & Color
        const spotToggle = document.getElementById('stage3dSpotlightsToggle');
        if (spotToggle) {
            spotToggle.addEventListener('change', (e) => {
                window.PixelMap3D.setConfig('spotlights', e.target.checked);
            });
        }

        const spotColor = document.getElementById('stage3dSpotlightColor');
        if (spotColor) {
            spotColor.addEventListener('input', (e) => {
                window.PixelMap3D.setConfig('spotlightColor', e.target.value);
            });
        }

        // Camera Buttons
        document.querySelectorAll('.stage3d-camera-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cam = btn.getAttribute('data-camera');
                if (cam) window.PixelMap3D.setCamera(cam);
            });
        });

        // Auto Rotate
        const autoRotateCheckbox = document.getElementById('stage3dAutoRotate');
        if (autoRotateCheckbox) {
            autoRotateCheckbox.addEventListener('change', (e) => {
                window.PixelMap3D.setConfig('autoRotate', e.target.checked);
            });
        }

        // Snapshot Button
        const snapBtn = document.getElementById('stage3dSnapshotBtn');
        if (snapBtn) {
            snapBtn.addEventListener('click', () => {
                window.PixelMap3D.exportSnapshot();
            });
        }

        // Fullscreen Button
        const fsBtn = document.getElementById('stage3dFullscreenBtn');
        const vpWrapper = document.getElementById('stage3dViewportWrapper');
        if (fsBtn && vpWrapper) {
            fsBtn.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    vpWrapper.requestFullscreen().catch(err => console.warn('Fullscreen denied:', err));
                } else {
                    document.exitFullscreen().catch(err => console.warn('Exit fullscreen failed:', err));
                }
            });
            document.addEventListener('fullscreenchange', () => {
                setTimeout(handleResize, 100);
            });
        }

        window.addEventListener('resize', () => {
            handleResize();
        });
    }

    // Public API
    window.PixelMap3D = {
        init: init3DStage,
        rebuild: rebuildScreens,
        resize: handleResize,
        setCamera: setCameraPreset,
        exportSnapshot: export3DSnapshot,
        /** Call after CanvasMap save/load/delete so picker + texture + size refresh. */
        notifySavedCanvasChanged: () => {
            savedTextureCacheKey = '';
            lastRebuildSig = ''; // force mesh+texture refresh
            refreshSavedCanvasSelect();
            if (isInitialized) rebuildScreens();
        },
        refreshSavedCanvasSelect,
        setConfig: (key, value) => {
            config[key] = value;
            if (key === 'showEnvironment') {
                lastRebuildSig = '';
                applyEnvironmentMode(!!value);
                rebuildScreens();
                return;
            }
            if (key === 'deckStyle') {
                if (config.showEnvironment) buildStageEnvironment();
                return;
            }
            if (key === 'spotlights' || key === 'spotlightColor') {
                if (config.showEnvironment) buildLighting();
                return;
            }
            if (key === 'testPattern') {
                savedTextureCacheKey = '';
                lastRebuildSig = '';
                refreshSavedCanvasSelect();
            }
            if (key === 'ambientGlow') {
                if (screenMaterial && screenMaterial.isMeshBasicMaterial) {
                    const glow = Math.max(0.2, Math.min(1.5, Number(value) || 1));
                    screenMaterial.color.setRGB(glow, glow, glow);
                    return; // in-place — no mesh rebuild
                }
                lastRebuildSig = '';
                rebuildScreens();
                return;
            }
            if (key === 'curveAngle' || key === 'curveDirection' || key === 'riggingMode' || key === 'flownHeight' || key === 'sideWings' || key === 'testPattern') {
                lastRebuildSig = '';
                rebuildScreens();
            }
        },
        getConfig: () => config
    };

})(window);
