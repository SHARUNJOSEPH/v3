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
        ambientGlow: 0.85,
        testPattern: 'live',     // 'live', 'colorbars', 'grid', 'white'
        autoRotate: false
    };

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

        // 1. Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0c10);
        scene.fog = new THREE.FogExp2(0x0a0c10, 0.025);

        // 2. Camera
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(0, 3.2, 11);

        // 3. Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.1;
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
            controls.maxPolarAngle = Math.PI / 2 - 0.01; // don't go below floor
            controls.minDistance = 2;
            controls.maxDistance = 35;
            controls.target.set(0, 1.8, 0);
        }

        // 5. Build Environment
        buildStageEnvironment();
        buildLighting();
        rebuildScreens();

        // 6. Animation Loop
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);

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

    function buildStageEnvironment() {
        if (!scene) return;
        if (stageDeck) scene.remove(stageDeck);

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
        if (trussGroup) scene.remove(trussGroup);

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
        if (lightsGroup) scene.remove(lightsGroup);

        lightsGroup = new THREE.Group();

        // Ambient dim stage light
        const ambient = new THREE.AmbientLight(0xffffff, 0.35);
        lightsGroup.add(ambient);

        // Key spot light
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.5);
        keyLight.position.set(5, 10, 8);
        lightsGroup.add(keyLight);

        // Moving Spotlights
        if (config.spotlights) {
            const spotPositions = [-6, -2, 2, 6];
            spotPositions.forEach((x, i) => {
                const spot = new THREE.SpotLight(new THREE.Color(config.spotlightColor), 2.2);
                spot.position.set(x, 6.7, -0.4);
                spot.angle = Math.PI / 7;
                spot.penumbra = 0.45;
                spot.decay = 1.5;
                spot.distance = 18;

                const target = new THREE.Object3D();
                target.position.set(x * 0.7, 0, 4);
                scene.add(target);
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

    function getScreenTexture() {
        if (config.testPattern === 'live') {
            const pixelCanvas = document.getElementById('pixelMapCanvas');
            if (pixelCanvas && pixelCanvas.width > 0 && pixelCanvas.height > 0) {
                screenTexture = new THREE.CanvasTexture(pixelCanvas);
                screenTexture.minFilter = THREE.LinearFilter;
                screenTexture.magFilter = THREE.LinearFilter;
                return screenTexture;
            }
        }

        // Fallback or Test Patterns generated on an offscreen canvas
        const offCanvas = document.createElement('canvas');
        offCanvas.width = 1024;
        offCanvas.height = 512;
        const ctx = offCanvas.getContext('2d');

        if (config.testPattern === 'colorbars') {
            const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'];
            const w = offCanvas.width / colors.length;
            colors.forEach((col, i) => {
                ctx.fillStyle = col;
                ctx.fillRect(i * w, 0, w, offCanvas.height);
            });
        } else if (config.testPattern === 'white') {
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

        screenTexture = new THREE.CanvasTexture(offCanvas);
        return screenTexture;
    }

    function rebuildScreens() {
        // app.js calls PixelMap3D.rebuild() from updatePixelMap before the 3D tab
        // has initialized the Three.js scene — no-op until init3DStage() runs.
        if (!scene) return;

        if (screenGroup) scene.remove(screenGroup);

        screenGroup = new THREE.Group();

        // Get dimensions from global app state
        const appState = window.state || {};
        let screenWidthMeters = appState.actualWidthMeters || 4;
        let screenHeightMeters = appState.actualHeightMeters || 2.5;

        if (screenWidthMeters <= 0 || isNaN(screenWidthMeters)) screenWidthMeters = 4;
        if (screenHeightMeters <= 0 || isNaN(screenHeightMeters)) screenHeightMeters = 2.5;

        const panelCols = appState.isPanelCountMode ? (appState.panelsInWidth || 8) : Math.max(1, Math.round(screenWidthMeters / (appState.panelWidth || 0.5)));
        const panelRows = appState.isPanelCountMode ? (appState.panelsInHeight || 5) : Math.max(1, Math.round(screenHeightMeters / (appState.panelHeight || 0.5)));

        const tex = getScreenTexture();
        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            emissive: new THREE.Color(0xffffff),
            emissiveMap: tex,
            emissiveIntensity: config.ambientGlow,
            roughness: 0.25,
            metalness: 0.1
        });

        // Calculate Y position (Ground support vs Flown)
        const baseY = config.riggingMode === 'flown' ? config.flownHeight : 0.15;
        const centerY = baseY + screenHeightMeters / 2;

        // Build Main Screen (Flat vs Curved)
        const curveDeg = Number(config.curveAngle) || 0;

        if (curveDeg === 0) {
            // Flat Main Wall
            const screenMesh = createScreenPanelMesh(screenWidthMeters, screenHeightMeters, mat, panelCols, panelRows);
            screenMesh.position.set(0, centerY, 0);
            screenGroup.add(screenMesh);
        } else {
            // Curved Concert Wall (Segmented along circular arc)
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

            // Left Wing
            const leftWing = createScreenPanelMesh(wingW, wingH, mat, 3, panelRows);
            leftWing.position.set(-wingX, centerY, wingZ);
            leftWing.rotation.y = wingAngleRad;
            screenGroup.add(leftWing);

            // Right Wing
            const rightWing = createScreenPanelMesh(wingW, wingH, mat, 3, panelRows);
            rightWing.position.set(wingX, centerY, wingZ);
            rightWing.rotation.y = -wingAngleRad;
            screenGroup.add(rightWing);
        } else if (config.sideWings === 'dj') {
            // DJ Booth Screen (in front of center wall)
            const djW = Math.min(2.5, screenWidthMeters * 0.6);
            const djH = 1.0;
            const djScreen = createScreenPanelMesh(djW, djH, mat, 4, 2);
            djScreen.position.set(0, 0.6, 2.5);
            screenGroup.add(djScreen);
        }

        scene.add(screenGroup);
        updateEngineeringSpecs();
    }

    function createScreenPanelMesh(width, height, material, cols, rows) {
        const group = new THREE.Group();

        // Front display panel
        const frontGeo = new THREE.PlaneGeometry(width, height);
        const frontMesh = new THREE.Mesh(frontGeo, material);
        frontMesh.castShadow = true;
        group.add(frontMesh);

        // Rear cabinet frame structure (depth 0.08m)
        const frameGeo = new THREE.BoxGeometry(width, height, 0.08);
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x14171c,
            metalness: 0.8,
            roughness: 0.4
        });
        const frameMesh = new THREE.Mesh(frameGeo, frameMat);
        frameMesh.position.z = -0.041;
        group.add(frameMesh);

        // Ground Support Base Legs if ground supported
        if (config.riggingMode === 'ground') {
            const legMat = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.7 });
            const legGeo = new THREE.BoxGeometry(0.08, height + 0.3, 0.8);
            const numLegs = Math.max(2, Math.round(width / 1.5));
            const step = width / (numLegs - 1);

            for (let i = 0; i < numLegs; i++) {
                const leg = new THREE.Mesh(legGeo, legMat);
                leg.position.set(-width / 2 + i * step, 0, -0.3);
                group.add(leg);
            }
        }

        return group;
    }

    function createCurvedWallMesh(width, height, material, cols, rows, angleDeg, direction) {
        const group = new THREE.Group();
        const totalAngleRad = (angleDeg * Math.PI) / 180;
        const isConcave = direction === 'concave';
        const sign = isConcave ? 1 : -1;

        const panelWidth = width / cols;
        const radius = width / totalAngleRad;
        const angleStep = totalAngleRad / cols;

        for (let i = 0; i < cols; i++) {
            const panelAngle = (i - (cols - 1) / 2) * angleStep * sign;

            // UV mapping segment for this panel column
            const uMin = i / cols;
            const uMax = (i + 1) / cols;

            const panelGeo = new THREE.PlaneGeometry(panelWidth, height);
            const uvAttr = panelGeo.attributes.uv;
            // Map UVs correctly to panel segment
            uvAttr.setXY(0, uMin, 1);
            uvAttr.setXY(1, uMax, 1);
            uvAttr.setXY(2, uMin, 0);
            uvAttr.setXY(3, uMax, 0);
            uvAttr.needsUpdate = true;

            const panelMesh = new THREE.Mesh(panelGeo, material);

            const x = Math.sin(panelAngle) * radius;
            const z = (Math.cos(panelAngle) * radius - radius) * sign;

            panelMesh.position.set(x, 0, z);
            panelMesh.rotation.y = panelAngle;

            // Cabinet back
            const backGeo = new THREE.BoxGeometry(panelWidth, height, 0.08);
            const backMat = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.8 });
            const backMesh = new THREE.Mesh(backGeo, backMat);
            backMesh.position.set(x, 0, z - 0.041 * Math.cos(panelAngle));
            backMesh.rotation.y = panelAngle;

            group.add(panelMesh);
            group.add(backMesh);
        }

        return group;
    }

    function setCameraPreset(viewName) {
        if (!controls || !camera) return;

        controls.reset();
        switch (viewName) {
            case 'foh': // Audience Front of House
                camera.position.set(0, 2.5, 12);
                controls.target.set(0, 1.8, 0);
                break;
            case 'top': // Overhead Rigging View
                camera.position.set(0, 16, 0.5);
                controls.target.set(0, 0, 0);
                break;
            case 'side': // 45 degree stage perspective
                camera.position.set(9, 4, 8);
                controls.target.set(0, 1.5, 0);
                break;
            case 'detail': // Close-up
                camera.position.set(0, 1.8, 4.5);
                controls.target.set(0, 1.8, 0);
                break;
            default:
                camera.position.set(0, 3.2, 11);
                controls.target.set(0, 1.8, 0);
                break;
        }
        controls.update();
    }

    function updateEngineeringSpecs() {
        const appState = window.state || {};
        let screenW = appState.actualWidthMeters || 4;
        let screenH = appState.actualHeightMeters || 2.5;
        if (screenW <= 0) screenW = 4;
        if (screenH <= 0) screenH = 2.5;

        const resW = appState.totalResWidth || Math.round(screenW * 256);
        const resH = appState.totalResHeight || Math.round(screenH * 256);
        const totalPixels = resW * resH;

        const areaM2 = screenW * screenH;
        const areaSqFt = areaM2 * 10.7639;

        const pWidth = appState.panelWidth || 0.5;
        const pHeight = appState.panelHeight || 0.5;
        const cols = appState.isPanelCountMode ? (appState.panelsInWidth || 8) : Math.max(1, Math.round(screenW / pWidth));
        const rows = appState.isPanelCountMode ? (appState.panelsInHeight || 5) : Math.max(1, Math.round(screenH / pHeight));
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

        // Populate spec DOM elements
        const setEl = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

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

        // Texture / Test Pattern
        const textureSelect = document.getElementById('stage3dTextureSelect');
        if (textureSelect) {
            textureSelect.addEventListener('change', (e) => {
                window.PixelMap3D.setConfig('testPattern', e.target.value);
            });
        }

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
        setConfig: (key, value) => {
            config[key] = value;
            if (key === 'deckStyle') buildStageEnvironment();
            if (key === 'spotlights' || key === 'spotlightColor') buildLighting();
            if (key === 'curveAngle' || key === 'curveDirection' || key === 'riggingMode' || key === 'flownHeight' || key === 'sideWings' || key === 'testPattern' || key === 'ambientGlow') {
                rebuildScreens();
            }
        },
        getConfig: () => config
    };

})(window);
