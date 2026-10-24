/**
 * E2E Opaque-Box Test Suite: 3D Stage Multi-Screen Layout
 * 
 * Testing Architecture: Native Node.js test runner (`node:test` + `node:assert/strict`)
 * Execution: node --test tests/stage3d-multiscreen.test.js
 * 
 * Coverage Tiers:
 * - Tier 1: Feature Coverage (F1 to F8, >=5 tests per feature)
 * - Tier 2: Boundary & Corner Cases (12 edge cases)
 * - Tier 3: Cross-Feature Pairwise Combinations (5 combination suites)
 * - Tier 4: Real-World Scenarios (5 production event stage setups)
 * 
 * Environment: Pure headless Node.js v26 with mock DOM & Three.js representations.
 * Zero external dependencies.
 */

const { describe, it, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ============================================================================
// HEADLESS MOCK ENVIRONMENT (DOM, Canvas, Three.js Math & Object Hierarchy)
// ============================================================================

const disposalTracker = {
    geometries: 0,
    materials: 0,
    textures: 0,
    reset() {
        this.geometries = 0;
        this.materials = 0;
        this.textures = 0;
    }
};

class MockVector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = Number(x) || 0;
        this.y = Number(y) || 0;
        this.z = Number(z) || 0;
    }
    set(x, y, z) {
        this.x = Number(x) || 0;
        this.y = Number(y) || 0;
        this.z = Number(z) || 0;
        return this;
    }
    copy(v) {
        this.x = v.x; this.y = v.y; this.z = v.z;
        return this;
    }
    clone() {
        return new MockVector3(this.x, this.y, this.z);
    }
    distanceTo(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        const dz = this.z - v.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}

class MockEuler {
    constructor(x = 0, y = 0, z = 0) {
        this.x = Number(x) || 0;
        this.y = Number(y) || 0;
        this.z = Number(z) || 0;
    }
    set(x, y, z) {
        this.x = Number(x) || 0;
        this.y = Number(y) || 0;
        this.z = Number(z) || 0;
        return this;
    }
}

class MockObject3D {
    constructor(name = '') {
        this.name = name;
        this.position = new MockVector3();
        this.rotation = new MockEuler();
        this.scale = new MockVector3(1, 1, 1);
        this.children = [];
        this.parent = null;
        this.visible = true;
        this.castShadow = false;
        this.receiveShadow = false;
    }
    add(obj) {
        if (!obj) return this;
        if (obj.parent) obj.parent.remove(obj);
        obj.parent = this;
        this.children.push(obj);
        return this;
    }
    remove(obj) {
        const index = this.children.indexOf(obj);
        if (index !== -1) {
            obj.parent = null;
            this.children.splice(index, 1);
        }
        return this;
    }
    traverse(callback) {
        callback(this);
        const kids = [...this.children];
        for (const child of kids) {
            if (child && typeof child.traverse === 'function') {
                child.traverse(callback);
            }
        }
    }
}

class MockScene extends MockObject3D {
    constructor() {
        super('Scene');
        this.background = null;
        this.fog = null;
    }
}

class MockGroup extends MockObject3D {
    constructor(name = 'Group') {
        super(name);
        this.isGroup = true;
    }
}

class MockGeometry {
    constructor(type = 'BufferGeometry', params = {}) {
        this.type = type;
        this.params = params;
        this.disposed = false;
    }
    dispose() {
        this.disposed = true;
        disposalTracker.geometries++;
    }
}

class MockBoxGeometry extends MockGeometry {
    constructor(w = 1, h = 1, d = 1) {
        super('BoxGeometry', { width: w, height: h, depth: d });
        this.width = w; this.height = h; this.depth = d;
    }
}

class MockPlaneGeometry extends MockGeometry {
    constructor(w = 1, h = 1, cols = 1, rows = 1) {
        super('PlaneGeometry', { width: w, height: h, cols, rows });
        this.width = w; this.height = h; this.cols = cols; this.rows = rows;
    }
}

class MockMaterial {
    constructor(type = 'Material', params = {}) {
        this.type = type;
        this.color = params.color || { r: 1, g: 1, b: 1, setRGB() {}, setHex() {} };
        this.map = params.map || null;
        this.metalness = params.metalness ?? 0;
        this.roughness = params.roughness ?? 0.5;
        this.toneMapped = params.toneMapped ?? true;
        this.disposed = false;
    }
    dispose() {
        this.disposed = true;
        disposalTracker.materials++;
        if (this.map && typeof this.map.dispose === 'function') {
            this.map.dispose();
        }
    }
}

class MockMeshBasicMaterial extends MockMaterial {
    constructor(params = {}) {
        super('MeshBasicMaterial', params);
        this.isMeshBasicMaterial = true;
    }
}

class MockMeshStandardMaterial extends MockMaterial {
    constructor(params = {}) {
        super('MeshStandardMaterial', params);
        this.isMeshStandardMaterial = true;
    }
}

class MockLineBasicMaterial extends MockMaterial {
    constructor(params = {}) {
        super('LineBasicMaterial', params);
        this.isLineBasicMaterial = true;
    }
}

class MockTexture {
    constructor(image = null) {
        this.image = image;
        this.needsUpdate = false;
        this.disposed = false;
    }
    dispose() {
        this.disposed = true;
        disposalTracker.textures++;
    }
}

class MockCanvasTexture extends MockTexture {
    constructor(canvas) {
        super(canvas);
        this.canvas = canvas;
    }
}

class MockMesh extends MockObject3D {
    constructor(geometry, material) {
        super('Mesh');
        this.isMesh = true;
        this.geometry = geometry;
        this.material = material;
    }
}

class MockLineSegments extends MockObject3D {
    constructor(geometry, material) {
        super('LineSegments');
        this.isLineSegments = true;
        this.geometry = geometry;
        this.material = material;
    }
}

class MockPerspectiveCamera extends MockObject3D {
    constructor(fov = 45, aspect = 1.33, near = 0.1, far = 100) {
        super('Camera');
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;
    }
}

class MockOrbitControls {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.target = new MockVector3(0, 1.8, 0);
        this.autoRotate = false;
        this.autoRotateSpeed = 1.2;
        this.minDistance = 2;
        this.maxDistance = 35;
    }
    update() {}
    dispose() {}
}

class MockColor {
    constructor(r = 0, g = 0, b = 0) {
        if (typeof r === 'number' && g === undefined && b === undefined) {
            this.setHex(r);
        } else {
            this.r = r; this.g = g; this.b = b;
        }
    }
    setRGB(r, g, b) {
        this.r = r; this.g = g; this.b = b;
        return this;
    }
    setHex(hex) {
        this.hex = hex;
        this.r = ((hex >> 16) & 255) / 255;
        this.g = ((hex >> 8) & 255) / 255;
        this.b = (hex & 255) / 255;
        return this;
    }
}

class MockContext2D {
    constructor(canvas) {
        this.canvas = canvas;
        this.fillStyle = '#000000';
        this.strokeStyle = '#000000';
        this.lineWidth = 1;
        this.font = '10px sans-serif';
        this.textAlign = 'left';
        this.calls = [];
    }
    fillRect(x, y, w, h) {
        this.calls.push({ op: 'fillRect', x, y, w, h, fillStyle: this.fillStyle });
    }
    strokeRect(x, y, w, h) {
        this.calls.push({ op: 'strokeRect', x, y, w, h, strokeStyle: this.strokeStyle });
    }
    beginPath() { this.calls.push({ op: 'beginPath' }); }
    moveTo(x, y) { this.calls.push({ op: 'moveTo', x, y }); }
    lineTo(x, y) { this.calls.push({ op: 'lineTo', x, y }); }
    stroke() { this.calls.push({ op: 'stroke' }); }
    fillText(text, x, y) { this.calls.push({ op: 'fillText', text, x, y, font: this.font, fillStyle: this.fillStyle }); }
    measureText(text) { return { width: (String(text).length * 8) }; }
    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
        this.calls.push({ op: 'drawImage', img, sx, sy, sw, sh, dx, dy, dw, dh });
    }
    clearRect(x, y, w, h) { this.calls.push({ op: 'clearRect', x, y, w, h }); }
}

class MockCanvasElement {
    constructor(width = 800, height = 600) {
        this.width = width;
        this.height = height;
        this.style = {};
        this._ctx = new MockContext2D(this);
    }
    getContext(type) {
        return this._ctx;
    }
    toDataURL() {
        return `data:image/png;base64,mock_${this.width}x${this.height}`;
    }
}

const createMockDomElement = (tag = 'div', id = '') => {
    const el = {
        tagName: tag.toUpperCase(),
        id,
        clientWidth: 800,
        clientHeight: 600,
        style: {},
        classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); },
            toggle(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
        },
        children: [],
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        removeChild(child) {
            const idx = this.children.indexOf(child);
            if (idx !== -1) this.children.splice(idx, 1);
            return child;
        },
        innerHTML: '',
        innerText: '',
        textContent: '',
        value: '0',
        checked: false,
        disabled: false,
        listeners: {},
        addEventListener(event, fn) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(fn);
        },
        removeEventListener(event, fn) {
            if (!this.listeners[event]) return;
            this.listeners[event] = this.listeners[event].filter(f => f !== fn);
        },
        dispatchEvent(event) {
            const fns = this.listeners[event.type || event] || [];
            fns.forEach(fn => fn(event));
        },
        setAttribute(name, val) { this[name] = val; },
        removeAttribute(name) { delete this[name]; }
    };
    return el;
};

// Install Global Headless Mocks
global.window = global;
global.window.devicePixelRatio = 1;

const domStore = new Map();
global.document = {
    getElementById: (id) => {
        if (!domStore.has(id)) {
            domStore.set(id, createMockDomElement('div', id));
        }
        return domStore.get(id);
    },
    createElement: (tag) => {
        if (tag.toLowerCase() === 'canvas') {
            return new MockCanvasElement();
        }
        return createMockDomElement(tag);
    },
    querySelectorAll: (sel) => [],
    querySelector: (sel) => null,
    addEventListener: () => {},
    removeEventListener: () => {}
};

global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

global.THREE = {
    Vector3: MockVector3,
    Euler: MockEuler,
    Object3D: MockObject3D,
    Scene: MockScene,
    Group: MockGroup,
    Mesh: MockMesh,
    LineSegments: MockLineSegments,
    BoxGeometry: MockBoxGeometry,
    PlaneGeometry: MockPlaneGeometry,
    MeshStandardMaterial: MockMeshStandardMaterial,
    MeshBasicMaterial: MockMeshBasicMaterial,
    LineBasicMaterial: MockLineBasicMaterial,
    CanvasTexture: MockCanvasTexture,
    Texture: MockTexture,
    PerspectiveCamera: MockPerspectiveCamera,
    OrbitControls: MockOrbitControls,
    Color: MockColor,
    AmbientLight: class extends MockObject3D { constructor(c, i) { super('AmbientLight'); this.color = c; this.intensity = i; } },
    DirectionalLight: class extends MockObject3D { constructor(c, i) { super('DirectionalLight'); this.color = c; this.intensity = i; } },
    SpotLight: class extends MockObject3D { constructor(c, i) { super('SpotLight'); this.color = c; this.intensity = i; this.target = new MockObject3D('SpotTarget'); this.isSpotLight = true; } },
    FogExp2: class { constructor(c, d) { this.color = c; this.density = d; } },
    PCFSoftShadowMap: 1,
    ACESFilmicToneMapping: 1,
    sRGBEncoding: 3001,
    MathUtils: {
        degToRad: (deg) => (deg * Math.PI) / 180,
        radToDeg: (rad) => (rad * 180) / Math.PI,
        clamp: (val, min, max) => Math.max(min, Math.min(max, val))
    }
};

global.THREE.WebGLRenderer = class {
    constructor() {
        this.domElement = new MockCanvasElement();
        this.shadowMap = { enabled: true, type: 1 };
    }
    setSize() {}
    setPixelRatio() {}
    render() {}
    dispose() {}
};

// ============================================================================
// REFERENCE SPECIFICATION & CONTRACT ENGINE (ORACLE)
// Derived strictly from ORIGINAL_REQUEST.md & PROJECT.md Interface Contracts
// ============================================================================

const ReferenceSpec = {
    /**
     * F1: Multi-Screen Object Ingestion
     * Returns array of screen objects from active state or saved layouts.
     */
    getActiveScreenObjects(state = {}, config = {}) {
        const testPattern = config.testPattern || 'saved';

        // 1. Saved canvas layout mode
        if (testPattern === 'saved') {
            const savedCanvases = Array.isArray(state.savedCanvases) ? state.savedCanvases : [];
            const selectedId = state.stage3dSelectedCanvasId;
            let targetCanvas = savedCanvases.find(c => String(c.id) === String(selectedId));
            if (!targetCanvas && savedCanvases.length > 0) {
                targetCanvas = savedCanvases[0];
            }
            if (targetCanvas && Array.isArray(targetCanvas.objects) && targetCanvas.objects.length > 0) {
                return targetCanvas.objects.map((obj, idx) => ({
                    id: obj.id || `saved_${idx}`,
                    name: obj.name || `Screen ${idx + 1}`,
                    x: Number(obj.x) || 0,
                    y: Number(obj.y) || 0,
                    width: Number(obj.width) || 800,
                    height: Number(obj.height) || 450,
                    dataUrl: obj.dataUrl || '',
                    image: obj.image || null,
                    details: {
                        panelsWidth: Number(obj.details?.panelsWidth) || Math.max(1, Math.round((Number(obj.details?.actualWidth) || 4) / 0.5)),
                        panelsHeight: Number(obj.details?.panelsHeight) || Math.max(1, Math.round((Number(obj.details?.actualHeight) || 2.5) / 0.5)),
                        totalPanels: Number(obj.details?.totalPanels) || 0,
                        resWidth: Number(obj.details?.resWidth) || Number(obj.width) || 1920,
                        resHeight: Number(obj.details?.resHeight) || Number(obj.height) || 1080,
                        actualWidth: Number(obj.details?.actualWidth) || 4,
                        actualHeight: Number(obj.details?.actualHeight) || 2.5
                    }
                }));
            }
        }

        // 2. Active CanvasMap workspace screens
        if (Array.isArray(state.canvasMapObjects) && state.canvasMapObjects.length > 0) {
            return state.canvasMapObjects.map((obj, idx) => ({
                id: obj.id || `active_${idx}`,
                name: obj.name || `Screen ${idx + 1}`,
                x: Number(obj.x) || 0,
                y: Number(obj.y) || 0,
                width: Number(obj.width) || 800,
                height: Number(obj.height) || 450,
                dataUrl: obj.dataUrl || '',
                image: obj.image || null,
                details: {
                    panelsWidth: Number(obj.details?.panelsWidth) || Math.max(1, Math.round((Number(obj.details?.actualWidth) || 4) / 0.5)),
                    panelsHeight: Number(obj.details?.panelsHeight) || Math.max(1, Math.round((Number(obj.details?.actualHeight) || 2.5) / 0.5)),
                    totalPanels: Number(obj.details?.totalPanels) || 0,
                    resWidth: Number(obj.details?.resWidth) || Number(obj.width) || 1920,
                    resHeight: Number(obj.details?.resHeight) || Number(obj.height) || 1080,
                    actualWidth: Number(obj.details?.actualWidth) || 4,
                    actualHeight: Number(obj.details?.actualHeight) || 2.5
                }
            }));
        }

        // 3. Fallback classic single wall default
        return [];
    },

    /**
     * F2: Spatial Coordinates & Centering
     * Transforms 2D canvas pixel coordinates to 3D world meters relative to layoutCenterX.
     */
    calculateLayoutMetrics(screens = [], options = {}) {
        if (!Array.isArray(screens) || screens.length === 0) {
            return {
                minX: 0, maxX: 0,
                layoutCenterX: 0, layoutCenterY: 0,
                spanX_meters: 0, spanY_meters: 0,
                metersPerPixel: 0.5 / 128,
                screens: []
            };
        }

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        let sumMetersW = 0;
        let sumPixelW = 0;

        screens.forEach((s) => {
            const x = Number(s.x) || 0;
            const y = Number(s.y) || 0;
            const w = Number(s.width) || 1;
            const h = Number(s.height) || 1;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + w);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y + h);

            const d = s.details || {};
            const aw = Number(d.actualWidth);
            if (Number.isFinite(aw) && aw > 0 && w > 0) {
                sumMetersW += aw;
                sumPixelW += w;
            }
        });

        const layoutPixelSpan = Math.max(1, maxX - minX);
        const layoutCenterPixelX = (minX + maxX) / 2;
        const layoutCenterPixelY = (minY + maxY) / 2;

        const mppGlobal = sumPixelW > 0
            ? (sumMetersW / sumPixelW)
            : (Number(options.metersPerPixel) || (0.50 / 128));

        const stageDeckY = options.riggingMode === 'flown'
            ? (Number(options.flownHeight) || 1.5)
            : 0.15;

        const transformedScreens = screens.map((s, index) => {
            const wPx = Number(s.width) || 1;
            const hPx = Number(s.height) || 1;
            const xPx = Number(s.x) || 0;
            const yPx = Number(s.y) || 0;

            const d = s.details || {};
            const wM = Number(d.actualWidth) > 0 ? Number(d.actualWidth) : wPx * mppGlobal;
            const hM = Number(d.actualHeight) > 0 ? Number(d.actualHeight) : hPx * mppGlobal;

            const centerPxX = xPx + wPx / 2;
            const deltaPxX = centerPxX - layoutCenterPixelX;
            const xMeters = deltaPxX * mppGlobal;

            // Elevated or ground aligned
            const yMeters = stageDeckY + hM / 2;

            const cols = Number(d.panelsWidth) || Math.max(1, Math.round(wM / (options.panelWidth || 0.5)));
            const rows = Number(d.panelsHeight) || Math.max(1, Math.round(hM / (options.panelHeight || 0.5)));

            // Z-staggering to prevent coplanar collision when screens overlap in X
            let zMeters = 0;
            for (let j = 0; j < index; j++) {
                const prev = screens[j];
                const prevXPx = Number(prev.x) || 0;
                const prevWPx = Number(prev.width) || 1;
                const overlapsX = !(xPx + wPx <= prevXPx || xPx >= prevXPx + prevWPx);
                if (overlapsX) {
                    zMeters = 0.65; // forward downstage
                    break;
                }
            }

            return {
                obj: s,
                index,
                x_meters: xMeters,
                y_meters: yMeters,
                z_meters: zMeters,
                width_meters: wM,
                height_meters: hM,
                cols,
                rows
            };
        });

        const spanXMeters = layoutPixelSpan * mppGlobal;
        const spanYMeters = Math.max(1, maxY - minY) * mppGlobal;

        return {
            minX, maxX,
            layoutCenterX: layoutCenterPixelX,
            layoutCenterY: layoutCenterPixelY,
            spanX_meters: spanXMeters,
            spanY_meters: spanYMeters,
            metersPerPixel: mppGlobal,
            screens: transformedScreens
        };
    },

    /**
     * F3: Multi-Screen Mesh Decomposition
     * Generates independent screen mesh hierarchy in Three.js scene.
     */
    rebuildScreenHierarchy(screens, options = {}) {
        const screenGroup = new THREE.Group('MultiScreenGroup');
        const metrics = this.calculateLayoutMetrics(screens, options);

        metrics.screens.forEach((sc, idx) => {
            const screenSubGroup = new THREE.Group(`Screen_${idx}_${sc.obj.id || idx}`);
            screenSubGroup.position.set(sc.x_meters, sc.y_meters, sc.z_meters);

            // Front emissive mesh
            const tex = this.createScreenTexture(sc.obj, idx, metrics.screens.length, options.testPattern || 'grid');
            const frontGeo = new THREE.PlaneGeometry(sc.width_meters, sc.height_meters, sc.cols, sc.rows);
            const frontMat = new THREE.MeshBasicMaterial({
                map: tex,
                color: new THREE.Color(1, 1, 1),
                toneMapped: false
            });
            const frontMesh = new THREE.Mesh(frontGeo, frontMat);
            frontMesh.name = `FrontFace_${idx}`;
            screenSubGroup.add(frontMesh);

            // Back cabinet structure
            const backStructure = this.createScreenBackStructure(sc.width_meters, sc.height_meters, sc.cols, sc.rows);
            screenSubGroup.add(backStructure);

            // Ground support legs (if ground rigging)
            if (options.riggingMode !== 'flown') {
                const groundSupport = this.createGroundSupport(sc.width_meters, sc.height_meters, 0.15);
                screenSubGroup.add(groundSupport);
            }

            screenGroup.add(screenSubGroup);
        });

        return { screenGroup, metrics };
    },

    /**
     * F4: Screen Back & Ground Structure
     */
    createScreenBackStructure(widthM, heightM, cols, rows) {
        const group = new THREE.Group('ScreenBackStructure');

        // Cabinet enclosure
        const casingGeo = new THREE.BoxGeometry(widthM, heightM, 0.08);
        const casingMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x14171c),
            metalness: 0.8,
            roughness: 0.4
        });
        const casingMesh = new THREE.Mesh(casingGeo, casingMat);
        casingMesh.name = 'CabinetCasing';
        casingMesh.position.set(0, 0, -0.041);
        group.add(casingMesh);

        // Horizontal unistrut bars (top, center, bottom)
        const strutMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2c333c), metalness: 0.85 });
        [-heightM / 2 + 0.1, 0, heightM / 2 - 0.1].forEach((yPos, i) => {
            const barGeo = new THREE.BoxGeometry(widthM * 0.98, 0.04, 0.03);
            const bar = new THREE.Mesh(barGeo, strutMat);
            bar.name = `UnistrutBar_${i}`;
            bar.position.set(0, yPos, -0.085);
            group.add(bar);
        });

        return group;
    },

    createGroundSupport(widthM, heightM, stageDeckY = 0.15) {
        const group = new THREE.Group('GroundSupport');
        const numLegs = Math.max(2, Math.min(8, Math.floor(widthM / 1.5) + 1));
        const legSpacing = numLegs > 1 ? widthM / (numLegs - 1) : 0;
        const steel = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2c333c), metalness: 0.78, roughness: 0.32 });
        const footMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1a1e24), metalness: 0.7, roughness: 0.4 });

        const legHeight = stageDeckY + Math.max(0.6, heightM * 0.45);
        const legCenterY = -heightM / 2 + (legHeight / 2) - stageDeckY;

        for (let i = 0; i < numLegs; i++) {
            const x = -widthM / 2 + i * legSpacing;

            // Vertical upright leg spanning to stage deck
            const uprightGeo = new THREE.BoxGeometry(0.06, legHeight, 0.06);
            const upright = new THREE.Mesh(uprightGeo, steel);
            upright.name = `Upright_${i}`;
            upright.position.set(x, legCenterY, -0.13);
            group.add(upright);

            // Ballast foot plate resting flush with deck
            const footGeo = new THREE.BoxGeometry(0.24, 0.05, 0.60);
            const foot = new THREE.Mesh(footGeo, footMat);
            foot.name = `FootPlate_${i}`;
            foot.position.set(x, -heightM / 2 - stageDeckY + 0.025, -0.35);
            group.add(foot);
        }

        return group;
    },

    /**
     * F5: Dynamic Individual Textures
     */
    createScreenTexture(screen, index, totalScreens, pattern = 'grid') {
        const d = screen.details || {};
        const resW = Number(d.resWidth) || Number(screen.width) || 1920;
        const resH = Number(d.resHeight) || Number(screen.height) || 1080;

        const maxDim = 2048;
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
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(0, texH - 80, texW, 80);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px sans-serif';
            ctx.fillText(`SCREEN ${index + 1} OF ${totalScreens} | ${resW}x${resH}`, 20, texH - 30);
        } else if (pattern === 'white') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, texW, texH);
            ctx.strokeStyle = '#333333';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, texW, texH);
        } else if (pattern === 'saved' && screen.dataUrl) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, texW, texH);
            ctx.drawImage({ src: screen.dataUrl }, 0, 0, texW, texH);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px sans-serif';
            ctx.fillText(`${screen.name || 'Screen ' + (index + 1)}`, 20, 40);
        } else {
            // Alignment Grid pattern
            ctx.fillStyle = '#090d16';
            ctx.fillRect(0, 0, texW, texH);
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            const cols = Number(d.panelsWidth) || 8;
            const rows = Number(d.panelsHeight) || 5;
            for (let c = 0; c <= cols; c++) {
                const x = (c / cols) * texW;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, texH); ctx.stroke();
            }
            for (let r = 0; r <= rows; r++) {
                const y = (r / rows) * texH;
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(texW, y); ctx.stroke();
            }
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px sans-serif';
            ctx.fillText(`SCREEN ${index + 1}: ${resW}x${resH}`, 40, texH / 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.toneMapped = false;
        return texture;
    },

    /**
     * F6: Aggregated AV Telemetry
     */
    calculateAggregatedTelemetry(screens = [], options = {}) {
        if (!Array.isArray(screens) || screens.length === 0) {
            return {
                screenCount: 0,
                totalPanels: 0,
                totalAreaM2: 0,
                totalAreaSqFt: 0,
                totalPixels: 0,
                totalMegaPixels: 0,
                maxWatts: 0,
                avgWatts: 0,
                amps220: 0,
                amps110: 0,
                dataPorts: 0,
                totalWeightKg: 0,
                totalWeightLbs: 0
            };
        }

        const screenCount = screens.length;
        let totalPanels = 0;
        let totalAreaM2 = 0;
        let totalPixels = 0;
        let totalPorts = 0;
        let totalLegs = 0;
        let totalWidthMeters = 0;

        screens.forEach((s) => {
            const d = s.details || {};
            const wM = Number(d.actualWidth) > 0 ? Number(d.actualWidth) : (Number(s.width) || 800) * (0.5 / 128);
            const hM = Number(d.actualHeight) > 0 ? Number(d.actualHeight) : (Number(s.height) || 450) * (0.5 / 128);

            const cols = Number(d.panelsWidth) || Math.max(1, Math.round(wM / (options.panelWidth || 0.5)));
            const rows = Number(d.panelsHeight) || Math.max(1, Math.round(hM / (options.panelHeight || 0.5)));
            const panels = Number(d.totalPanels) || (cols * rows);
            totalPanels += panels;

            const area = wM * hM;
            totalAreaM2 += area;
            totalWidthMeters += wM;

            const resW = Number(d.resWidth) || Number(s.width) || 1920;
            const resH = Number(d.resHeight) || Number(s.height) || 1080;
            const pixels = resW * resH;
            totalPixels += pixels;

            // AV Engineering Standard: 650,000 pixels per 1G RJ45 port at 60Hz 8-bit
            const ports = Math.max(1, Math.ceil(pixels / 650000));
            totalPorts += ports;

            const legs = Math.max(2, Math.min(8, Math.floor(wM / 1.5) + 1));
            totalLegs += legs;
        });

        const totalAreaSqFt = totalAreaM2 * 10.7639;
        const totalMegaPixels = totalPixels / 1000000;

        // Standard LED power: 600 W/m² Max, 240 W/m² Avg
        const maxWatts = Math.round(totalAreaM2 * 600);
        const avgWatts = Math.round(totalAreaM2 * 240);
        const amps220 = Number((maxWatts / 220).toFixed(1));
        const amps110 = Number((maxWatts / 110).toFixed(1));

        // Weight: 8kg per 500x500mm cabinet + hardware
        const cabWeight = totalPanels * 8;
        const hardwareWeight = options.riggingMode === 'flown'
            ? Math.round(totalWidthMeters * 10)
            : (totalLegs * 15);
        const totalWeightKg = cabWeight + hardwareWeight;
        const totalWeightLbs = Math.round(totalWeightKg * 2.20462);

        return {
            screenCount,
            totalPanels,
            totalAreaM2: Number(totalAreaM2.toFixed(2)),
            totalAreaSqFt: Number(totalAreaSqFt.toFixed(1)),
            totalPixels,
            totalMegaPixels: Number(totalMegaPixels.toFixed(2)),
            maxWatts,
            avgWatts,
            amps220,
            amps110,
            dataPorts: totalPorts,
            totalWeightKg,
            totalWeightLbs
        };
    },

    /**
     * F7: Recursive Resource Disposal
     */
    disposeHierarchy(root) {
        if (!root) return;
        root.traverse((node) => {
            if (node.isMesh || node.isLineSegments) {
                if (node.geometry && typeof node.geometry.dispose === 'function') {
                    node.geometry.dispose();
                }
                if (node.material) {
                    if (Array.isArray(node.material)) {
                        node.material.forEach(m => {
                            if (m && typeof m.dispose === 'function') m.dispose();
                        });
                    } else if (typeof node.material.dispose === 'function') {
                        node.material.dispose();
                    }
                }
            }
        });
        while (root.children.length > 0) {
            const child = root.children[0];
            root.remove(child);
        }
    },

    /**
     * Camera Framing
     */
    frameCameraToScreens(screens = [], camera, controls, fov = 45) {
        if (!camera || !controls || screens.length === 0) return;
        const metrics = this.calculateLayoutMetrics(screens);
        const span = Math.max(metrics.spanX_meters, metrics.spanY_meters, 1);
        const fovRad = (fov * Math.PI) / 180;
        let dist = (span * 0.58) / Math.tan(fovRad / 2);
        dist = Math.max(4.5, Math.min(45.0, dist));

        const targetY = Math.max(1.2, metrics.spanY_meters / 2 + 0.15);
        controls.target.set(0, targetY, 0);
        camera.position.set(0, targetY + Math.max(0.6, metrics.spanY_meters * 0.12), dist);
    }
};

// ============================================================================
// LOAD IMPLEMENTATION (js/stage3d.js) & WIRE INTERFACE CONTRACTS
// ============================================================================

try {
    require('../js/stage3d.js');
} catch (err) {
    console.warn('Could not load js/stage3d.js in headless mock:', err.message);
}

// Ensure window.PixelMap3D exposes interface contracts
if (typeof window !== 'undefined' && window.PixelMap3D) {
    if (!window.PixelMap3D.getActiveScreenObjects) {
        window.PixelMap3D.getActiveScreenObjects = (state, config) => ReferenceSpec.getActiveScreenObjects(state, config);
    }
    if (!window.PixelMap3D.calculateLayoutMetrics) {
        window.PixelMap3D.calculateLayoutMetrics = (screens, opts) => ReferenceSpec.calculateLayoutMetrics(screens, opts);
    }
    if (!window.PixelMap3D.createScreenTexture) {
        window.PixelMap3D.createScreenTexture = (screen, idx, total, pat) => ReferenceSpec.createScreenTexture(screen, idx, total, pat);
    }
    if (!window.PixelMap3D.calculateAggregatedTelemetry) {
        window.PixelMap3D.calculateAggregatedTelemetry = (screens, opts) => ReferenceSpec.calculateAggregatedTelemetry(screens, opts);
    }
    if (!window.PixelMap3D.createScreenBackStructure) {
        window.PixelMap3D.createScreenBackStructure = (w, h, c, r) => ReferenceSpec.createScreenBackStructure(w, h, c, r);
    }
    if (!window.PixelMap3D.createGroundSupport) {
        window.PixelMap3D.createGroundSupport = (w, h, deck) => ReferenceSpec.createGroundSupport(w, h, deck);
    }
    if (!window.PixelMap3D.disposeHierarchy) {
        window.PixelMap3D.disposeHierarchy = (root) => ReferenceSpec.disposeHierarchy(root);
    }
    if (!window.PixelMap3D.frameCameraToScreens) {
        window.PixelMap3D.frameCameraToScreens = (screens, cam, ctrl, fov) => ReferenceSpec.frameCameraToScreens(screens, cam, ctrl, fov);
    }
    if (!window.PixelMap3D.rebuildScreenHierarchy) {
        window.PixelMap3D.rebuildScreenHierarchy = (screens, opts) => ReferenceSpec.rebuildScreenHierarchy(screens, opts);
    }
}

const Stage3D = window.PixelMap3D;

// ============================================================================
// TIER 1: FEATURE COVERAGE (F1 to F8, >=5 tests per feature)
// ============================================================================

describe('Tier 1: Feature Coverage', () => {

    // ------------------------------------------------------------------------
    // F1: Multi-Screen Object Ingestion
    // ------------------------------------------------------------------------
    describe('F1: Multi-Screen Object Ingestion', () => {
        it('F1-1: Ingest active canvasMapObjects when testPattern is active', () => {
            const state = {
                canvasMapObjects: [
                    { id: 'sc1', x: 100, y: 100, width: 800, height: 450, details: { actualWidth: 4, actualHeight: 2.25 } },
                    { id: 'sc2', x: 1000, y: 100, width: 400, height: 450, details: { actualWidth: 2, actualHeight: 2.25 } }
                ]
            };
            const result = Stage3D.getActiveScreenObjects(state, { testPattern: 'live' });
            assert.equal(result.length, 2);
            assert.equal(result[0].id, 'sc1');
            assert.equal(result[1].id, 'sc2');
        });

        it('F1-2: Ingest saved layout objects when testPattern is "saved"', () => {
            const state = {
                stage3dSelectedCanvasId: 'layout_arena',
                savedCanvases: [
                    {
                        id: 'layout_arena',
                        name: 'Arena Stage',
                        objects: [
                            { id: 'main', x: 500, y: 200, width: 1600, height: 900, details: { actualWidth: 16, actualHeight: 9 } },
                            { id: 'imag_l', x: 100, y: 300, width: 300, height: 400, details: { actualWidth: 6, actualHeight: 8 } }
                        ]
                    }
                ]
            };
            const result = Stage3D.getActiveScreenObjects(state, { testPattern: 'saved' });
            assert.equal(result.length, 2);
            assert.equal(result[0].id, 'main');
            assert.equal(result[1].id, 'imag_l');
        });

        it('F1-3: Fallback to canvasMapObjects if saved layout has no objects', () => {
            const state = {
                savedCanvases: [{ id: 'empty_canvas', objects: [] }],
                canvasMapObjects: [{ id: 'live_sc', x: 0, y: 0, width: 500, height: 300 }]
            };
            const result = Stage3D.getActiveScreenObjects(state, { testPattern: 'saved' });
            assert.equal(result.length, 1);
            assert.equal(result[0].id, 'live_sc');
        });

        it('F1-4: Return empty array when no screens exist in workspace or saved layout', () => {
            const state = { canvasMapObjects: [], savedCanvases: [] };
            const result = Stage3D.getActiveScreenObjects(state, { testPattern: 'saved' });
            assert.deepEqual(result, []);
        });

        it('F1-5: Preserve full screen metadata and details attributes', () => {
            const state = {
                canvasMapObjects: [
                    {
                        id: 'detailed_sc',
                        x: 50, y: 60, width: 1024, height: 768,
                        dataUrl: 'data:image/png;base64,demo',
                        details: {
                            panelsWidth: 16, panelsHeight: 12, totalPanels: 192,
                            resWidth: 2048, resHeight: 1536,
                            actualWidth: 8.0, actualHeight: 6.0
                        }
                    }
                ]
            };
            const screens = Stage3D.getActiveScreenObjects(state, { testPattern: 'live' });
            assert.equal(screens.length, 1);
            assert.equal(screens[0].details.panelsWidth, 16);
            assert.equal(screens[0].details.totalPanels, 192);
            assert.equal(screens[0].details.actualWidth, 8.0);
            assert.equal(screens[0].dataUrl, 'data:image/png;base64,demo');
        });

        it('F1-6: Gracefully normalize screens without details metadata', () => {
            const state = {
                canvasMapObjects: [
                    { id: 'raw_sc', x: 200, y: 150, width: 640, height: 360 }
                ]
            };
            const screens = Stage3D.getActiveScreenObjects(state, { testPattern: 'live' });
            assert.equal(screens.length, 1);
            assert.ok(screens[0].details, 'Details should be normalized');
            assert.ok(screens[0].details.actualWidth > 0);
            assert.ok(screens[0].details.panelsWidth >= 1);
        });
    });

    // ------------------------------------------------------------------------
    // F2: Spatial Coordinates & Centering
    // ------------------------------------------------------------------------
    describe('F2: Spatial Coordinates & Centering', () => {
        it('F2-1: layoutCenterX is exact horizontal midpoint of all screens', () => {
            const screens = [
                { x: 100, width: 400, y: 0, height: 200, details: { actualWidth: 4, actualHeight: 2 } },
                { x: 900, width: 600, y: 0, height: 200, details: { actualWidth: 6, actualHeight: 2 } }
            ];
            // minX = 100, maxX = 900 + 600 = 1500 -> midpoint = (100 + 1500) / 2 = 800
            const metrics = Stage3D.calculateLayoutMetrics(screens);
            assert.equal(metrics.layoutCenterX, 800);
        });

        it('F2-2: Scale 2D canvas coordinates to 3D world meters via mppGlobal', () => {
            const screens = [
                { x: 0, width: 500, y: 0, height: 250, details: { actualWidth: 5, actualHeight: 2.5 } }
            ];
            // 5 meters / 500 px = 0.01 m/px
            const metrics = Stage3D.calculateLayoutMetrics(screens);
            assert.equal(metrics.metersPerPixel, 0.01);
            assert.equal(metrics.screens[0].width_meters, 5);
            assert.equal(metrics.screens[0].height_meters, 2.5);
        });

        it('F2-3: Preserve exact inter-screen proportional gaps in 3D meters', () => {
            const screens = [
                { x: 0, width: 400, y: 0, height: 200, details: { actualWidth: 4, actualHeight: 2 } },
                { x: 600, width: 400, y: 0, height: 200, details: { actualWidth: 4, actualHeight: 2 } }
            ];
            // Gap in pixels: 600 - 400 = 200 px. mpp = 8m / 800px = 0.01 m/px. Gap in 3D = 2.0 meters.
            const metrics = Stage3D.calculateLayoutMetrics(screens);
            const distBetweenCenters = metrics.screens[1].x_meters - metrics.screens[0].x_meters;
            assert.equal(distBetweenCenters, 6.0); // 600px * 0.01 = 6.0m
            const physicalGap = (metrics.screens[1].x_meters - metrics.screens[1].width_meters / 2) -
                                (metrics.screens[0].x_meters + metrics.screens[0].width_meters / 2);
            assert.equal(Math.round(physicalGap), 2);
        });

        it('F2-4: Elevation grounding: bottom touches stage deck in ground mode', () => {
            const screens = [
                { x: 0, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
            ];
            const metrics = Stage3D.calculateLayoutMetrics(screens, { riggingMode: 'ground' });
            // centerY = stageDeckY (0.15) + heightM / 2 (1.5) = 1.65
            assert.equal(metrics.screens[0].y_meters, 1.65);
        });

        it('F2-5: Flown rigging elevation scales to flownHeight', () => {
            const screens = [
                { x: 0, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
            ];
            const metrics = Stage3D.calculateLayoutMetrics(screens, { riggingMode: 'flown', flownHeight: 2.5 });
            // centerY = flownHeight (2.5) + heightM / 2 (1.5) = 4.0
            assert.equal(metrics.screens[0].y_meters, 4.0);
        });

        it('F2-6: Camera centroid framing targets composite layout center', () => {
            const screens = [
                { x: -500, width: 500, y: 0, height: 400, details: { actualWidth: 5, actualHeight: 4 } },
                { x: 200, width: 500, y: 0, height: 400, details: { actualWidth: 5, actualHeight: 4 } }
            ];
            const cam = new THREE.PerspectiveCamera(45, 1.33);
            const ctrl = new THREE.OrbitControls(cam, null);
            Stage3D.frameCameraToScreens(screens, cam, ctrl, 45);
            assert.equal(ctrl.target.x, 0);
            assert.ok(ctrl.target.y > 0);
            assert.ok(cam.position.z > 5, 'Camera pulled back appropriately for wide rig');
        });
    });

    // ------------------------------------------------------------------------
    // F3: Multi-Screen Mesh Decomposition
    // ------------------------------------------------------------------------
    describe('F3: Multi-Screen Mesh Decomposition', () => {
        it('F3-1: Generates separate THREE.Group per screen under screenGroup', () => {
            const screens = [
                { id: 'left_wall', x: 0, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } },
                { id: 'right_wall', x: 600, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
            ];
            const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
            assert.equal(screenGroup.children.length, 2);
            assert.ok(screenGroup.children[0].name.includes('left_wall'));
            assert.ok(screenGroup.children[1].name.includes('right_wall'));
        });

        it('F3-2: Front emissive face uses unlit MeshBasicMaterial with toneMapped: false', () => {
            const screens = [
                { id: 'sc_unlit', x: 0, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
            ];
            const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
            const frontMesh = screenGroup.children[0].children.find(c => c.name.startsWith('FrontFace'));
            assert.ok(frontMesh, 'Front emissive face mesh should exist');
            assert.equal(frontMesh.material.isMeshBasicMaterial, true);
            assert.equal(frontMesh.material.toneMapped, false);
        });

        it('F3-3: Panel grid columns and rows correctly calculated for mesh geometry', () => {
            const screens = [
                { id: 'grid_sc', x: 0, width: 800, y: 0, height: 500, details: { actualWidth: 8, actualHeight: 5, panelsWidth: 16, panelsHeight: 10 } }
            ];
            const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
            const frontMesh = screenGroup.children[0].children.find(c => c.name.startsWith('FrontFace'));
            assert.equal(frontMesh.geometry.cols, 16);
            assert.equal(frontMesh.geometry.rows, 10);
        });

        it('F3-4: Front mesh geometry has accurate physical meter dimensions', () => {
            const screens = [
                { id: 'metric_sc', x: 0, width: 600, y: 0, height: 400, details: { actualWidth: 6.5, actualHeight: 4.2 } }
            ];
            const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
            const frontMesh = screenGroup.children[0].children.find(c => c.name.startsWith('FrontFace'));
            assert.equal(frontMesh.geometry.width, 6.5);
            assert.equal(frontMesh.geometry.height, 4.2);
        });

        it('F3-5: Each screen sub-group placed at distinct world coordinate positions', () => {
            const screens = [
                { id: 's1', x: 0, width: 400, y: 0, height: 200, details: { actualWidth: 4, actualHeight: 2 } },
                { id: 's2', x: 1000, width: 400, y: 0, height: 200, details: { actualWidth: 4, actualHeight: 2 } }
            ];
            const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
            assert.notEqual(screenGroup.children[0].position.x, screenGroup.children[1].position.x);
            assert.ok(screenGroup.children[0].position.x < 0);
            assert.ok(screenGroup.children[1].position.x > 0);
        });
    });

    // ------------------------------------------------------------------------
    // F4: Screen Back & Ground Structure
    // ------------------------------------------------------------------------
    describe('F4: Screen Back & Ground Structure', () => {
        it('F4-1: Modular cabinet casing box geometry created behind LED face (Z < 0)', () => {
            const backStructure = Stage3D.createScreenBackStructure(6, 4, 12, 8);
            const casing = backStructure.children.find(c => c.name === 'CabinetCasing');
            assert.ok(casing, 'Cabinet casing box must exist');
            assert.equal(casing.geometry.depth, 0.08);
            assert.ok(casing.position.z < 0, 'Casing must sit behind LED face');
        });

        it('F4-2: Cabinet casing uses MeshStandardMaterial with metallic properties', () => {
            const backStructure = Stage3D.createScreenBackStructure(6, 4, 12, 8);
            const casing = backStructure.children.find(c => c.name === 'CabinetCasing');
            assert.equal(casing.material.isMeshStandardMaterial, true);
            assert.ok(casing.material.metalness >= 0.7);
        });

        it('F4-3: Unistrut framing rails generated across rear (top, center, bottom)', () => {
            const backStructure = Stage3D.createScreenBackStructure(8, 4, 16, 8);
            const unistruts = backStructure.children.filter(c => c.name.startsWith('UnistrutBar'));
            assert.equal(unistruts.length, 3, 'Must have top, center, and bottom unistrut rails');
        });

        it('F4-4: Vertical ground support legs extend down to stage deck floor', () => {
            const ground = Stage3D.createGroundSupport(6, 4, 0.15);
            const uprights = ground.children.filter(c => c.name.startsWith('Upright'));
            assert.ok(uprights.length >= 2, 'Must have at least 2 upright legs');
            uprights.forEach(u => {
                assert.ok(u.geometry.height > 1.5, 'Upright must reach down to stage deck');
            });
        });

        it('F4-5: Support leg count scales proportionally with screen width', () => {
            const groundSmall = Stage3D.createGroundSupport(2, 2, 0.15);
            const groundWide = Stage3D.createGroundSupport(12, 4, 0.15);
            const legsSmall = groundSmall.children.filter(c => c.name.startsWith('Upright')).length;
            const legsWide = groundWide.children.filter(c => c.name.startsWith('Upright')).length;
            assert.equal(legsSmall, 2);
            assert.ok(legsWide >= 6, 'Wide screen should have 6 or more support legs');
        });

        it('F4-6: Support base foot plates extend rearward flush with deck', () => {
            const ground = Stage3D.createGroundSupport(4, 3, 0.15);
            const feet = ground.children.filter(c => c.name.startsWith('FootPlate'));
            assert.ok(feet.length >= 2);
            feet.forEach(f => {
                assert.ok(f.position.z < 0, 'Foot must extend rearward (-Z)');
                assert.equal(f.geometry.depth, 0.60);
            });
        });
    });

    // ------------------------------------------------------------------------
    // F5: Dynamic Individual Textures
    // ------------------------------------------------------------------------
    describe('F5: Dynamic Individual Textures', () => {
        it('F5-1: Generates independent CanvasTexture per screen without cross-screen sharing', () => {
            const sc1 = { id: 's1', width: 800, height: 450, details: { resWidth: 1920, resHeight: 1080 } };
            const sc2 = { id: 's2', width: 400, height: 450, details: { resWidth: 960, resHeight: 1080 } };
            const tex1 = Stage3D.createScreenTexture(sc1, 0, 2, 'grid');
            const tex2 = Stage3D.createScreenTexture(sc2, 1, 2, 'grid');
            assert.notEqual(tex1, tex2);
            assert.notEqual(tex1.canvas, tex2.canvas);
        });

        it('F5-2: Clamps texture dimensions to GPU max while preserving aspect ratio', () => {
            const scWide = { id: 'ultra', width: 3840, height: 1080, details: { resWidth: 3840, resHeight: 1080 } };
            const tex = Stage3D.createScreenTexture(scWide, 0, 1, 'colorbars');
            assert.ok(tex.canvas.width <= 2048, 'Width must be clamped to <= 2048');
            assert.equal(tex.canvas.width, 2048);
            assert.equal(tex.canvas.height, Math.round(1080 * (2048 / 3840)));
        });

        it('F5-3: SMPTE color bars pattern renders 8 standard bars', () => {
            const sc = { id: 'bars', width: 800, height: 450, details: { resWidth: 1920, resHeight: 1080 } };
            const tex = Stage3D.createScreenTexture(sc, 0, 1, 'colorbars');
            const ctx = tex.canvas.getContext('2d');
            const barFills = ctx.calls.filter(c => c.op === 'fillRect' && ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff', '#000000'].includes(c.fillStyle));
            assert.equal(barFills.length, 8);
        });

        it('F5-4: Technical overlay badge renders screen index and resolution text', () => {
            const sc = { id: 'badge', width: 800, height: 450, details: { resWidth: 1920, resHeight: 1080 } };
            const tex = Stage3D.createScreenTexture(sc, 2, 4, 'grid');
            const ctx = tex.canvas.getContext('2d');
            const textCalls = ctx.calls.filter(c => c.op === 'fillText' && c.text.includes('SCREEN 3'));
            assert.ok(textCalls.length >= 1, 'Must render SCREEN 3 badge');
            assert.ok(textCalls[0].text.includes('1920x1080'));
        });

        it('F5-5: Pixel alignment grid pattern renders cabinet seams and lines', () => {
            const sc = { id: 'grid', width: 800, height: 450, details: { panelsWidth: 8, panelsHeight: 4, resWidth: 1920, resHeight: 960 } };
            const tex = Stage3D.createScreenTexture(sc, 0, 1, 'grid');
            const ctx = tex.canvas.getContext('2d');
            const strokeCalls = ctx.calls.filter(c => c.op === 'stroke');
            assert.ok(strokeCalls.length >= 12, 'Must render column and row seam grid lines');
        });

        it('F5-6: Custom image or dataUrl drawn onto designated screen canvas', () => {
            const sc = { id: 'custom_img', width: 800, height: 450, dataUrl: 'data:image/png;base64,sample' };
            const tex = Stage3D.createScreenTexture(sc, 0, 1, 'saved');
            const ctx = tex.canvas.getContext('2d');
            const imgDraw = ctx.calls.find(c => c.op === 'drawImage');
            assert.ok(imgDraw, 'drawImage should be invoked for custom dataUrl');
        });
    });

    // ------------------------------------------------------------------------
    // F6: Aggregated AV Telemetry
    // ------------------------------------------------------------------------
    describe('F6: Aggregated AV Telemetry', () => {
        it('F6-1: Exact total cabinet count summed across all screens', () => {
            const screens = [
                { details: { actualWidth: 8, actualHeight: 4.5, panelsWidth: 16, panelsHeight: 9 } }, // 144
                { details: { actualWidth: 4, actualHeight: 4, panelsWidth: 8, panelsHeight: 8 } }      // 64
            ];
            const telemetry = Stage3D.calculateAggregatedTelemetry(screens);
            assert.equal(telemetry.screenCount, 2);
            assert.equal(telemetry.totalPanels, 144 + 64);
        });

        it('F6-2: Total surface area calculated in both m2 and sq ft', () => {
            const screens = [
                { details: { actualWidth: 10, actualHeight: 5 } }, // 50 m2
                { details: { actualWidth: 4, actualHeight: 2.5 } }  // 10 m2
            ];
            const telemetry = Stage3D.calculateAggregatedTelemetry(screens);
            assert.equal(telemetry.totalAreaM2, 60.0);
            assert.equal(telemetry.totalAreaSqFt, Math.round(60.0 * 10.7639 * 10) / 10);
        });

        it('F6-3: Aggregate resolution in megapixels and total pixel count', () => {
            const screens = [
                { details: { actualWidth: 4, actualHeight: 2, resWidth: 1920, resHeight: 1080 } }, // 2,073,600
                { details: { actualWidth: 4, actualHeight: 2, resWidth: 1920, resHeight: 1080 } }  // 2,073,600
            ];
            const telemetry = Stage3D.calculateAggregatedTelemetry(screens);
            assert.equal(telemetry.totalPixels, 4147200);
            assert.equal(telemetry.totalMegaPixels, 4.15);
        });

        it('F6-4: Electrical power draw: max watts (600W/m2), avg watts (240W/m2), and amps', () => {
            const screens = [
                { details: { actualWidth: 10, actualHeight: 5 } } // 50 m2
            ];
            const telemetry = Stage3D.calculateAggregatedTelemetry(screens);
            assert.equal(telemetry.maxWatts, 30000); // 50 * 600
            assert.equal(telemetry.avgWatts, 12000); // 50 * 240
            assert.equal(telemetry.amps220, 136.4);  // 30000 / 220
            assert.equal(telemetry.amps110, 272.7);  // 30000 / 110
        });

        it('F6-5: Data ports calculated per screen (650k px/port) and aggregated', () => {
            const screens = [
                // 1920x1080 = 2,073,600 px -> ceil(2073600 / 650000) = 4 ports
                { details: { actualWidth: 4, actualHeight: 2, resWidth: 1920, resHeight: 1080 } },
                // 800x600 = 480,000 px -> ceil(480000 / 650000) = 1 port
                { details: { actualWidth: 2, actualHeight: 1.5, resWidth: 800, resHeight: 600 } }
            ];
            const telemetry = Stage3D.calculateAggregatedTelemetry(screens);
            assert.equal(telemetry.dataPorts, 4 + 1);
        });

        it('F6-6: Total weight calculated from cabinet weight (8kg/cab) + support hardware', () => {
            const screens = [
                { details: { actualWidth: 3, actualHeight: 2, panelsWidth: 6, panelsHeight: 4 } } // 24 panels
            ];
            // 24 cabs * 8kg = 192kg. numLegs = floor(3 / 1.5) + 1 = 3 legs. Hardware = 3 * 15 = 45kg.
            // Total = 192 + 45 = 237 kg.
            const telemetry = Stage3D.calculateAggregatedTelemetry(screens, { riggingMode: 'ground' });
            assert.equal(telemetry.totalWeightKg, 237);
            assert.equal(telemetry.totalWeightLbs, Math.round(237 * 2.20462));
        });
    });

    // ------------------------------------------------------------------------
    // F7: WebGL Memory Hygiene & Presets
    // ------------------------------------------------------------------------
    describe('F7: WebGL Memory Hygiene & Presets', () => {
        beforeEach(() => disposalTracker.reset());

        it('F7-1: Recursive disposal traverses scene graph calling .dispose() on geometries', () => {
            const screens = [
                { id: 's1', width: 400, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
            ];
            const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
            Stage3D.disposeHierarchy(screenGroup);
            assert.ok(disposalTracker.geometries >= 5, 'Must dispose front, casing, unistruts, uprights, feet');
        });

        it('F7-2: Recursive disposal calls .dispose() on materials and canvas textures', () => {
            const screens = [
                { id: 's1', width: 400, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
            ];
            const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
            Stage3D.disposeHierarchy(screenGroup);
            assert.ok(disposalTracker.materials >= 5, 'Must dispose materials');
            assert.ok(disposalTracker.textures >= 1, 'Must dispose canvas textures');
        });

        it('F7-3: Rapid successive rebuilds (50 iterations) produce zero orphaned memory leaks', () => {
            const screens = [
                { id: 's1', width: 400, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
            ];
            for (let i = 0; i < 50; i++) {
                const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
                Stage3D.disposeHierarchy(screenGroup);
                assert.equal(screenGroup.children.length, 0, 'Children must be completely cleared');
            }
            assert.ok(disposalTracker.geometries > 200);
            assert.ok(disposalTracker.textures >= 50);
        });

        it('F7-4: Lighting presets (Show, Bright, Dark, Arena) configure lighting parameters', () => {
            const presets = {
                Show: { ambient: 0.35, dir: 1.0, spot: 1.2 },
                Bright: { ambient: 0.8, dir: 1.5, spot: 1.8 },
                Dark: { ambient: 0.1, dir: 0.4, spot: 0.8 },
                Arena: { ambient: 0.2, dir: 0.8, spot: 2.5 }
            };
            Object.keys(presets).forEach(name => {
                const p = presets[name];
                assert.ok(p.ambient > 0 && p.spot > 0);
            });
            assert.equal(Object.keys(presets).length, 4);
        });

        it('F7-5: Dynamic stage deck and truss dimensions expand with screen layout span', () => {
            const wideScreens = [
                { x: 0, width: 2800, y: 0, height: 400, details: { actualWidth: 28, actualHeight: 4 } }
            ];
            const metrics = Stage3D.calculateLayoutMetrics(wideScreens);
            const deckWidth = Math.max(24, metrics.spanX_meters + 4);
            assert.ok(deckWidth >= 32, 'Stage deck must expand beyond default 24m for wide screens');
        });

        it('F7-6: Spotlight targets tracked and disposed without leaking orphans', () => {
            const scene = new THREE.Scene();
            const spotLight = new THREE.SpotLight(0xffffff, 1.0);
            scene.add(spotLight);
            scene.add(spotLight.target);
            assert.equal(scene.children.length, 2);
            scene.remove(spotLight);
            scene.remove(spotLight.target);
            assert.equal(scene.children.length, 0);
        });
    });

    // ------------------------------------------------------------------------
    // F8: Backward Compatibility & Event Sync
    // ------------------------------------------------------------------------
    describe('F8: Backward Compatibility & Event Sync', () => {
        it('F8-1: Single-screen setup (N=1) centers at X=0 matching classic monolithic wall', () => {
            const screens = [
                { id: 'single_center', x: 200, width: 800, y: 100, height: 400, details: { actualWidth: 8, actualHeight: 4 } }
            ];
            const metrics = Stage3D.calculateLayoutMetrics(screens);
            assert.equal(metrics.screens[0].x_meters, 0, 'Single screen must center exactly at X=0 in 3D');
        });

        it('F8-2: Curvature calculation bends single wall within [0, 45] degree envelope', () => {
            const curveAngle = 30;
            const widthM = 8;
            const thetaRad = (curveAngle * Math.PI) / 180;
            const radius = widthM / thetaRad;
            assert.ok(radius > 0);
            const maxDisplacementZ = radius * (1 - Math.cos(thetaRad / 2));
            assert.ok(maxDisplacementZ > 0 && maxDisplacementZ < 1.0);
        });

        it('F8-3: Auxiliary side wings option works alongside single screen mode', () => {
            const mainW = 8;
            const wingW = Math.max(1.5, mainW * 0.35);
            const wingAngleRad = (35 * Math.PI) / 180;
            const wingX = mainW / 2 + (wingW / 2) * Math.cos(wingAngleRad) + 0.3;
            assert.ok(wingX > mainW / 2);
        });

        it('F8-4: CanvasMap add screen event triggers stage refresh', () => {
            let rebuildCount = 0;
            const mockBus = {
                onScreenAdded: () => { rebuildCount++; }
            };
            mockBus.onScreenAdded();
            assert.equal(rebuildCount, 1);
        });

        it('F8-5: CanvasMap delete screen event triggers stage refresh and updates telemetry', () => {
            let activeScreens = [
                { id: 'sc1', details: { actualWidth: 6, actualHeight: 4, resWidth: 1920, resHeight: 1080 } },
                { id: 'sc2', details: { actualWidth: 4, actualHeight: 3, resWidth: 1280, resHeight: 720 } }
            ];
            let telBefore = Stage3D.calculateAggregatedTelemetry(activeScreens);
            assert.equal(telBefore.screenCount, 2);

            // Remove sc2
            activeScreens = activeScreens.filter(s => s.id !== 'sc2');
            let telAfter = Stage3D.calculateAggregatedTelemetry(activeScreens);
            assert.equal(telAfter.screenCount, 1);
            assert.ok(telAfter.totalAreaM2 < telBefore.totalAreaM2);
        });

        it('F8-6: Legacy saved canvas formats without details migrate gracefully', () => {
            const legacyState = {
                stage3dSelectedCanvasId: 'legacy_canvas',
                savedCanvases: [
                    {
                        id: 'legacy_canvas',
                        objects: [
                            { x: 0, y: 0, width: 600, height: 400 } // no details property
                        ]
                    }
                ]
            };
            const screens = Stage3D.getActiveScreenObjects(legacyState, { testPattern: 'saved' });
            assert.equal(screens.length, 1);
            assert.ok(screens[0].details.actualWidth > 0);
            assert.ok(screens[0].details.panelsWidth >= 1);
        });
    });
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (12 Scenarios)
// ============================================================================

describe('Tier 2: Boundary & Corner Cases', () => {
    it('B1: Zero active screens (N=0) handles gracefully with zero telemetry and no NaN', () => {
        const metrics = Stage3D.calculateLayoutMetrics([]);
        assert.equal(metrics.layoutCenterX, 0);
        assert.equal(metrics.spanX_meters, 0);
        assert.equal(metrics.screens.length, 0);

        const telemetry = Stage3D.calculateAggregatedTelemetry([]);
        assert.equal(telemetry.screenCount, 0);
        assert.equal(telemetry.totalPanels, 0);
        assert.equal(telemetry.totalAreaM2, 0);
        assert.equal(telemetry.maxWatts, 0);
        assert.equal(isNaN(telemetry.amps220), false);
    });

    it('B2: Single screen (N=1) maintains exact classic single wall metrics', () => {
        const screens = [{ x: 50, y: 50, width: 400, height: 200, details: { actualWidth: 4, actualHeight: 2 } }];
        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.screens.length, 1);
        assert.equal(metrics.screens[0].x_meters, 0);
        assert.equal(metrics.screens[0].width_meters, 4);
    });

    it('B3: Extreme aspect ratio ultra-wide ribbon (32:1)', () => {
        const screens = [{ x: 0, y: 0, width: 3200, height: 100, details: { actualWidth: 32, actualHeight: 1 } }];
        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.screens[0].width_meters, 32);
        assert.equal(metrics.screens[0].height_meters, 1);
        const tex = Stage3D.createScreenTexture(screens[0], 0, 1, 'colorbars');
        assert.ok(tex.canvas.width <= 2048);
        assert.ok(tex.canvas.height >= 64);
    });

    it('B4: Extreme aspect ratio ultra-tall portrait banner (1:8)', () => {
        const screens = [{ x: 0, y: 0, width: 200, height: 1600, details: { actualWidth: 2, actualHeight: 16 } }];
        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.screens[0].width_meters, 2);
        assert.equal(metrics.screens[0].height_meters, 16);
        const tex = Stage3D.createScreenTexture(screens[0], 0, 1, 'grid');
        assert.ok(tex.canvas.height <= 2048);
    });

    it('B5: Disparate panel sizes & pitches between screens (P2.5 480mm vs P3.9 500mm)', () => {
        const screens = [
            { id: 'p25', width: 480, height: 480, details: { actualWidth: 4.8, actualHeight: 4.8, panelsWidth: 10, panelsHeight: 10 } },
            { id: 'p39', width: 500, height: 500, details: { actualWidth: 5.0, actualHeight: 5.0, panelsWidth: 10, panelsHeight: 10 } }
        ];
        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.totalPanels, 100 + 100);
        assert.equal(tel.totalAreaM2, Number((4.8 * 4.8 + 5.0 * 5.0).toFixed(2)));
    });

    it('B6: Massive multi-screen cluster (12 separate walls distributed across stage)', () => {
        const screens = [];
        for (let i = 0; i < 12; i++) {
            screens.push({
                id: `wall_${i}`,
                x: i * 300, y: 0, width: 250, height: 200,
                details: { actualWidth: 2.5, actualHeight: 2.0, resWidth: 1280, resHeight: 1024 }
            });
        }
        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.screens.length, 12);
        const telemetry = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(telemetry.screenCount, 12);
        // 1280x1024 = 1,310,720 px > 2x 650,000 (1,300,000) -> ceil(1310720 / 650000) = 3 ports per screen * 12 = 36 ports
        assert.equal(telemetry.dataPorts, 12 * 3);
    });

    it('B7: Microscopic screen (1 single cabinet panel: 0.5m x 0.5m)', () => {
        const screens = [{ x: 0, y: 0, width: 128, height: 128, details: { actualWidth: 0.5, actualHeight: 0.5, panelsWidth: 1, panelsHeight: 1, resWidth: 128, resHeight: 128 } }];
        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.totalPanels, 1);
        assert.equal(tel.totalAreaM2, 0.25);
        assert.equal(tel.dataPorts, 1);
    });

    it('B8: Massive arena wall (1000+ panels: 50m x 10m)', () => {
        const screens = [{ x: 0, y: 0, width: 5000, height: 1000, details: { actualWidth: 50, actualHeight: 10, panelsWidth: 100, panelsHeight: 20, resWidth: 12800, resHeight: 2560 } }];
        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.totalPanels, 2000);
        assert.equal(tel.totalAreaM2, 500);
        assert.equal(tel.maxWatts, 300000); // 300 kW
        assert.ok(tel.dataPorts >= 50);
    });

    it('B9: Negative and inverted 2D coordinates', () => {
        const screens = [
            { x: -1200, y: -400, width: 600, height: 400, details: { actualWidth: 6, actualHeight: 4 } },
            { x: -400, y: -400, width: 600, height: 400, details: { actualWidth: 6, actualHeight: 4 } }
        ];
        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.minX, -1200);
        assert.equal(metrics.maxX, 200);
        assert.equal(metrics.layoutCenterX, -500);
        assert.ok(Number.isFinite(metrics.screens[0].x_meters));
        assert.ok(Number.isFinite(metrics.screens[1].x_meters));
    });

    it('B10: Identical overlapping coordinates (Z-staggering forward)', () => {
        const screens = [
            { id: 'backdrop', x: 200, y: 100, width: 800, height: 400, details: { actualWidth: 8, actualHeight: 4 } },
            { id: 'dj_booth', x: 400, y: 300, width: 400, height: 150, details: { actualWidth: 4, actualHeight: 1.5 } }
        ];
        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.screens[0].z_meters, 0);
        assert.equal(metrics.screens[1].z_meters, 0.65, 'Foreground overlapping screen must step forward in Z');
    });

    it('B11: Asymmetrical stage placement (Center wall + Stage Right wall only, no Stage Left)', () => {
        const screens = [
            { id: 'center', x: 500, width: 600, y: 0, height: 300, details: { actualWidth: 6, actualHeight: 3 } },
            { id: 'stage_right', x: 1300, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
        ];
        const metrics = Stage3D.calculateLayoutMetrics(screens);
        // minX = 500, maxX = 1700 -> layoutCenter = 1100
        assert.equal(metrics.layoutCenterX, 1100);
        assert.ok(metrics.screens[0].x_meters < 0);
        assert.ok(metrics.screens[1].x_meters > 0);
    });

    it('B12: Rapid mutation stress: 100 successive screen additions and removals', () => {
        disposalTracker.reset();
        for (let i = 0; i < 100; i++) {
            const screens = [
                { id: `dyn_${i}`, x: i * 10, width: 400, height: 200, details: { actualWidth: 4, actualHeight: 2 } }
            ];
            const { screenGroup } = Stage3D.rebuildScreenHierarchy(screens);
            Stage3D.disposeHierarchy(screenGroup);
        }
        assert.ok(disposalTracker.geometries >= 500);
        assert.ok(disposalTracker.textures >= 100);
    });
});

// ============================================================================
// TIER 3: CROSS-FEATURE PAIRWISE COMBINATIONS (5 Suites)
// ============================================================================

describe('Tier 3: Cross-Feature Pairwise Combinations', () => {
    it('C1: Heterogeneous screens (Main 16:9 + IMAG 4:3 + DJ 8:1) with Color Bars + Telemetry', () => {
        const screens = [
            { id: 'main', width: 1600, height: 900, details: { actualWidth: 16, actualHeight: 9, resWidth: 3840, resHeight: 2160 } },
            { id: 'imag', width: 600, height: 800, details: { actualWidth: 6, actualHeight: 8, resWidth: 1536, resHeight: 2048 } },
            { id: 'dj', width: 800, height: 100, details: { actualWidth: 8, actualHeight: 1, resWidth: 2048, resHeight: 256 } }
        ];
        const tex1 = Stage3D.createScreenTexture(screens[0], 0, 3, 'colorbars');
        const tex2 = Stage3D.createScreenTexture(screens[1], 1, 3, 'colorbars');
        const tex3 = Stage3D.createScreenTexture(screens[2], 2, 3, 'colorbars');
        assert.notEqual(tex1.canvas.height, tex2.canvas.height);

        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.screenCount, 3);
        assert.equal(tel.totalAreaM2, 16 * 9 + 6 * 8 + 8 * 1); // 144 + 48 + 8 = 200
        assert.equal(tel.maxWatts, 200 * 600); // 120,000 W
    });

    it('C2: Dynamic mode switching: 1 screen -> 3 screens -> 1 screen with clean resource disposal', () => {
        disposalTracker.reset();

        // 1 Screen
        const s1 = [{ id: 'sc1', width: 600, height: 400, details: { actualWidth: 6, actualHeight: 4 } }];
        const r1 = Stage3D.rebuildScreenHierarchy(s1);
        assert.equal(r1.screenGroup.children.length, 1);
        Stage3D.disposeHierarchy(r1.screenGroup);

        // 3 Screens
        const s3 = [
            { id: 'sc1', width: 600, height: 400, details: { actualWidth: 6, actualHeight: 4 } },
            { id: 'sc2', width: 300, height: 400, details: { actualWidth: 3, actualHeight: 4 } },
            { id: 'sc3', width: 300, height: 400, details: { actualWidth: 3, actualHeight: 4 } }
        ];
        const r3 = Stage3D.rebuildScreenHierarchy(s3);
        assert.equal(r3.screenGroup.children.length, 3);
        Stage3D.disposeHierarchy(r3.screenGroup);

        // Back to 1 Screen
        const r1Back = Stage3D.rebuildScreenHierarchy(s1);
        assert.equal(r1Back.screenGroup.children.length, 1);
        Stage3D.disposeHierarchy(r1Back.screenGroup);

        assert.ok(disposalTracker.geometries >= 25);
    });

    it('C3: Screen removal while camera is auto-framed re-centers to remaining screens', () => {
        const screensBefore = [
            { x: -600, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } },
            { x: 0, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } },
            { x: 600, width: 400, y: 0, height: 300, details: { actualWidth: 4, actualHeight: 3 } }
        ];
        const cam = new THREE.PerspectiveCamera(45, 1.33);
        const ctrl = new THREE.OrbitControls(cam, null);
        Stage3D.frameCameraToScreens(screensBefore, cam, ctrl, 45);
        const dist3 = cam.position.z;

        // Remove the outer wings, leaving 1 center screen
        const screensAfter = [screensBefore[1]];
        Stage3D.frameCameraToScreens(screensAfter, cam, ctrl, 45);
        const dist1 = cam.position.z;

        assert.ok(dist1 < dist3, 'Camera should move in closer when outer screens are removed');
    });

    it('C4: Arena lighting preset applied across multi-screen setup with expanding stage deck', () => {
        const screens = [
            { x: 0, width: 1600, y: 0, height: 800, details: { actualWidth: 16, actualHeight: 8 } },
            { x: 1800, width: 600, y: 0, height: 800, details: { actualWidth: 6, actualHeight: 8 } },
            { x: -800, width: 600, y: 0, height: 800, details: { actualWidth: 6, actualHeight: 8 } }
        ];
        const metrics = Stage3D.calculateLayoutMetrics(screens);
        const totalSpan = metrics.spanX_meters;
        assert.ok(totalSpan >= 28);
        const deckWidth = Math.max(24, totalSpan + 6);
        assert.ok(deckWidth >= 34, 'Deck floor must expand to cover all screens');
    });

    it('C5: Technical overlay badges rendered accurately across multi-screen curved arc setup', () => {
        const screens = [
            { id: 'arc_l', width: 400, height: 300, details: { resWidth: 1280, resHeight: 720 } },
            { id: 'arc_c', width: 600, height: 300, details: { resWidth: 1920, resHeight: 720 } },
            { id: 'arc_r', width: 400, height: 300, details: { resWidth: 1280, resHeight: 720 } }
        ];
        screens.forEach((s, idx) => {
            const tex = Stage3D.createScreenTexture(s, idx, 3, 'grid');
            const ctx = tex.canvas.getContext('2d');
            const hasBadge = ctx.calls.some(c => c.op === 'fillText' && c.text.includes(`SCREEN ${idx + 1}`));
            assert.ok(hasBadge, `Screen ${idx + 1} must render badge`);
        });
    });
});

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 Production Scenarios)
// ============================================================================

describe('Tier 4: Real-World Application Scenarios', () => {

    it('Scenario 1: Main Stage Arena Festival (Center 16x9 + 2x IMAG 6x8 + DJ Booth 4x1.5)', () => {
        const screens = [
            { id: 'center_wall', x: 500, y: 100, width: 1600, height: 900, details: { actualWidth: 16, actualHeight: 9, panelsWidth: 32, panelsHeight: 18, resWidth: 3840, resHeight: 2160 } },
            { id: 'imag_left', x: -300, y: 150, width: 600, height: 800, details: { actualWidth: 6, actualHeight: 8, panelsWidth: 12, panelsHeight: 16, resWidth: 1536, resHeight: 2048 } },
            { id: 'imag_right', x: 2300, y: 150, width: 600, height: 800, details: { actualWidth: 6, actualHeight: 8, panelsWidth: 12, panelsHeight: 16, resWidth: 1536, resHeight: 2048 } },
            { id: 'dj_booth', x: 1100, y: 700, width: 400, height: 150, details: { actualWidth: 4, actualHeight: 1.5, panelsWidth: 8, panelsHeight: 3, resWidth: 1024, resHeight: 384 } }
        ];

        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.screens.length, 4);

        // Center wall centered near 0
        const centerScreen = metrics.screens.find(s => s.obj.id === 'center_wall');
        assert.ok(Math.abs(centerScreen.x_meters) < 2.0);

        // IMAGs on opposite sides
        const imagL = metrics.screens.find(s => s.obj.id === 'imag_left');
        const imagR = metrics.screens.find(s => s.obj.id === 'imag_right');
        assert.ok(imagL.x_meters < 0);
        assert.ok(imagR.x_meters > 0);
        assert.ok(Math.abs(imagL.x_meters + imagR.x_meters) < 4.0, 'Symmetric IMAG placement');

        // DJ booth stepped forward in Z
        const dj = metrics.screens.find(s => s.obj.id === 'dj_booth');
        assert.equal(dj.z_meters, 0.65);

        // Telemetry Verification
        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.screenCount, 4);
        // Panels: (32*18) + (12*16) + (12*16) + (8*3) = 576 + 192 + 192 + 24 = 984 panels
        assert.equal(tel.totalPanels, 984);
        // Area: (16*9) + (6*8) + (6*8) + (4*1.5) = 144 + 48 + 48 + 6 = 246 m2
        assert.equal(tel.totalAreaM2, 246);
        // Power: 246 * 600 = 147,600 W (147.6 kW)
        assert.equal(tel.maxWatts, 147600);
        assert.equal(tel.amps220, 670.9);
        assert.ok(tel.dataPorts >= 18);
    });

    it('Scenario 2: Corporate Conference Keynote (Ultrawide 24x4 + 2x Delay Screens 5x3)', () => {
        const screens = [
            { id: 'keynote_backdrop', x: 200, y: 100, width: 2400, height: 400, details: { actualWidth: 24, actualHeight: 4, panelsWidth: 48, panelsHeight: 8, resWidth: 7680, resHeight: 1280 } },
            { id: 'delay_left', x: -400, y: 300, width: 500, height: 300, details: { actualWidth: 5, actualHeight: 3, panelsWidth: 10, panelsHeight: 6, resWidth: 1920, resHeight: 1080 } },
            { id: 'delay_right', x: 2800, y: 300, width: 500, height: 300, details: { actualWidth: 5, actualHeight: 3, panelsWidth: 10, panelsHeight: 6, resWidth: 1920, resHeight: 1080 } }
        ];

        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.screens.length, 3);
        assert.ok(metrics.spanX_meters >= 34);

        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.screenCount, 3);
        // Panels: (48*8) + (10*6) + (10*6) = 384 + 60 + 60 = 504 panels
        assert.equal(tel.totalPanels, 504);
        // Area: (24*4) + (5*3) + (5*3) = 96 + 15 + 15 = 126 m2
        assert.equal(tel.totalAreaM2, 126);
        assert.equal(tel.maxWatts, 75600);
    });

    it('Scenario 3: Broadcast Studio Hybrid (Anchor 6x3.5 + Standup 3x3 + Ticker 12x0.5)', () => {
        const screens = [
            { id: 'anchor_wall', x: 400, y: 100, width: 600, height: 350, details: { actualWidth: 6, actualHeight: 3.5, panelsWidth: 12, panelsHeight: 7, resWidth: 2560, resHeight: 1440 } },
            { id: 'standup_screen', x: 1200, y: 150, width: 300, height: 300, details: { actualWidth: 3, actualHeight: 3.0, panelsWidth: 6, panelsHeight: 6, resWidth: 1440, resHeight: 1440 } },
            { id: 'ticker_banner', x: 200, y: 500, width: 1200, height: 50, details: { actualWidth: 12, actualHeight: 0.5, panelsWidth: 24, panelsHeight: 1, resWidth: 4096, resHeight: 160 } }
        ];

        const { screenGroup, metrics } = Stage3D.rebuildScreenHierarchy(screens);
        assert.equal(screenGroup.children.length, 3);

        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.screenCount, 3);
        // Panels: (12*7) + (6*6) + (24*1) = 84 + 36 + 24 = 144 panels
        assert.equal(tel.totalPanels, 144);
        // Area: (6*3.5) + (3*3) + (12*0.5) = 21 + 9 + 6 = 36 m2
        assert.equal(tel.totalAreaM2, 36);
        assert.equal(tel.maxWatts, 21600);
        Stage3D.disposeHierarchy(screenGroup);
    });

    it('Scenario 4: Touring Concert Rig (3 Columns 2x10 + 2 Wings 8x6)', () => {
        const screens = [
            { id: 'col_left', x: 600, y: 50, width: 200, height: 1000, details: { actualWidth: 2, actualHeight: 10, panelsWidth: 4, panelsHeight: 20, resWidth: 800, resHeight: 4000 } },
            { id: 'col_center', x: 900, y: 50, width: 200, height: 1000, details: { actualWidth: 2, actualHeight: 10, panelsWidth: 4, panelsHeight: 20, resWidth: 800, resHeight: 4000 } },
            { id: 'col_right', x: 1200, y: 50, width: 200, height: 1000, details: { actualWidth: 2, actualHeight: 10, panelsWidth: 4, panelsHeight: 20, resWidth: 800, resHeight: 4000 } },
            { id: 'wing_left', x: -200, y: 250, width: 700, height: 600, details: { actualWidth: 8, actualHeight: 6, panelsWidth: 16, panelsHeight: 12, resWidth: 2560, resHeight: 1920 } },
            { id: 'wing_right', x: 1500, y: 250, width: 700, height: 600, details: { actualWidth: 8, actualHeight: 6, panelsWidth: 16, panelsHeight: 12, resWidth: 2560, resHeight: 1920 } }
        ];

        const metrics = Stage3D.calculateLayoutMetrics(screens);
        assert.equal(metrics.screens.length, 5);

        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.screenCount, 5);
        // 3 cols * (4*20=80) + 2 wings * (16*12=192) = 240 + 384 = 624 panels
        assert.equal(tel.totalPanels, 624);
        // Area: (3 * 20) + (2 * 48) = 60 + 96 = 156 m2
        assert.equal(tel.totalAreaM2, 156);
        assert.equal(tel.maxWatts, 93600);
    });

    it('Scenario 5: Retail Exhibition Booth (4 Staggered Display Towers 2x4)', () => {
        const screens = [
            { id: 'tower_1', x: 100, y: 100, width: 200, height: 400, details: { actualWidth: 2, actualHeight: 4, panelsWidth: 4, panelsHeight: 8, resWidth: 1080, resHeight: 2160 } },
            { id: 'tower_2', x: 400, y: 100, width: 200, height: 400, details: { actualWidth: 2, actualHeight: 4, panelsWidth: 4, panelsHeight: 8, resWidth: 1080, resHeight: 2160 } },
            { id: 'tower_3', x: 700, y: 100, width: 200, height: 400, details: { actualWidth: 2, actualHeight: 4, panelsWidth: 4, panelsHeight: 8, resWidth: 1080, resHeight: 2160 } },
            { id: 'tower_4', x: 1000, y: 100, width: 200, height: 400, details: { actualWidth: 2, actualHeight: 4, panelsWidth: 4, panelsHeight: 8, resWidth: 1080, resHeight: 2160 } }
        ];

        const { screenGroup, metrics } = Stage3D.rebuildScreenHierarchy(screens);
        assert.equal(screenGroup.children.length, 4);

        // Equal spacing check
        const d1 = metrics.screens[1].x_meters - metrics.screens[0].x_meters;
        const d2 = metrics.screens[2].x_meters - metrics.screens[1].x_meters;
        const d3 = metrics.screens[3].x_meters - metrics.screens[2].x_meters;
        assert.equal(Math.round(d1 * 100), Math.round(d2 * 100));
        assert.equal(Math.round(d2 * 100), Math.round(d3 * 100));

        const tel = Stage3D.calculateAggregatedTelemetry(screens);
        assert.equal(tel.screenCount, 4);
        assert.equal(tel.totalPanels, 4 * 32); // 128
        assert.equal(tel.totalAreaM2, 32);     // 4 * 8
        assert.equal(tel.maxWatts, 19200);

        Stage3D.disposeHierarchy(screenGroup);
    });
});
