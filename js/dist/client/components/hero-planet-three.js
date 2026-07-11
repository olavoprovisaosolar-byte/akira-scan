/**
 * Globo holográfico 3D — partículas, linhas de conexão e assembly.
 */
const PURPLE = 0xc44dff;
const PURPLE_DEEP = 0x7c3aed;
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

export function supportsWebGL() {
    try {
        const canvas = document.createElement("canvas");
        return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
    } catch {
        return false;
    }
}

export function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function loadThree() {
    return import(/* @vite-ignore */ THREE_CDN);
}

function fibonacciSphere(count, radius) {
    const pts = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        const y = 1 - (i / Math.max(count - 1, 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = phi * i;
        pts.push([
            Math.cos(theta) * r * radius,
            y * radius,
            Math.sin(theta) * r * radius
        ]);
    }
    return pts;
}

function buildConnections(points, stride = 7) {
    const lines = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const a = points[i];
        const b = points[(i + 1) % n];
        const c = points[(i + stride) % n];
        lines.push(a, b);
        if (i % 3 === 0) lines.push(a, c);
    }
    return lines;
}

export async function initPlanetCanvas(canvas, container) {
    const THREE = await loadThree();
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    const particleCount = mobile ? 1800 : 3200;

    const w = container.clientWidth || 480;
    const h = container.clientHeight || 420;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.z = 4.6;

    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const globe = new THREE.Group();
    scene.add(globe);

    const ambient = new THREE.AmbientLight(0x1a0a2e, 0.5);
    scene.add(ambient);

    const coreLight = new THREE.PointLight(PURPLE, 2.8, 14);
    coreLight.position.set(0, 0, 2);
    globe.add(coreLight);

    const rimLight = new THREE.PointLight(PURPLE_DEEP, 1.6, 12);
    rimLight.position.set(-2.5, 1, 1.5);
    scene.add(rimLight);

    const targetPts = fibonacciSphere(particleCount, 1.2);
    const startPts = targetPts.map(() => [
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6
    ]);

    const positions = new Float32Array(particleCount * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const pMat = new THREE.PointsMaterial({
        color: PURPLE,
        size: mobile ? 0.018 : 0.014,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });
    const particles = new THREE.Points(pGeo, pMat);
    globe.add(particles);

    const flatLines = buildConnections(targetPts, mobile ? 11 : 7);
    const linePositions = new Float32Array(flatLines.length * 3);
    const lineStart = new Float32Array(flatLines.length * 3);
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    const lMat = new THREE.LineBasicMaterial({
        color: PURPLE,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const lines = new THREE.LineSegments(lGeo, lMat);
    globe.add(lines);

    for (let i = 0; i < flatLines.length; i++) {
        const p = flatLines[i];
        lineStart[i * 3] = (Math.random() - 0.5) * 5;
        lineStart[i * 3 + 1] = (Math.random() - 0.5) * 5;
        lineStart[i * 3 + 2] = (Math.random() - 0.5) * 5;
        linePositions[i * 3] = lineStart[i * 3];
        linePositions[i * 3 + 1] = lineStart[i * 3 + 1];
        linePositions[i * 3 + 2] = lineStart[i * 3 + 2];
    }

    const auraGeo = new THREE.SphereGeometry(1.38, 32, 32);
    const auraMat = new THREE.MeshBasicMaterial({
        color: PURPLE,
        transparent: true,
        opacity: 0.06,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    globe.add(aura);

    const ringGeo = new THREE.RingGeometry(1.55, 1.62, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: PURPLE,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.3;
    globe.add(ring);

    let raf = 0;
    let pointerX = 0;
    let pointerY = 0;
    const startTime = performance.now();
    const assembleMs = 2200;

    const onMove = (e) => {
        const rect = container.getBoundingClientRect();
        pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.6;
        pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.35;
    };
    container.addEventListener("pointermove", onMove);

    const onResize = () => {
        const nw = container.clientWidth || w;
        const nh = container.clientHeight || h;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const tick = () => {
        raf = requestAnimationFrame(tick);
        if (document.hidden) return;
        const elapsed = performance.now() - startTime;
        const buildT = easeOut(Math.min(elapsed / assembleMs, 1));

        const posAttr = pGeo.attributes.position;
        for (let i = 0; i < particleCount; i++) {
            const tx = targetPts[i][0];
            const ty = targetPts[i][1];
            const tz = targetPts[i][2];
            const sx = startPts[i][0];
            const sy = startPts[i][1];
            const sz = startPts[i][2];
            posAttr.array[i * 3] = sx + (tx - sx) * buildT;
            posAttr.array[i * 3 + 1] = sy + (ty - sy) * buildT;
            posAttr.array[i * 3 + 2] = sz + (tz - sz) * buildT;
        }
        posAttr.needsUpdate = true;

        const lineAttr = lGeo.attributes.position;
        for (let i = 0; i < flatLines.length; i++) {
            const tx = flatLines[i][0];
            const ty = flatLines[i][1];
            const tz = flatLines[i][2];
            const sx = lineStart[i * 3];
            const sy = lineStart[i * 3 + 1];
            const sz = lineStart[i * 3 + 2];
            lineAttr.array[i * 3] = sx + (tx - sx) * buildT;
            lineAttr.array[i * 3 + 1] = sy + (ty - sy) * buildT;
            lineAttr.array[i * 3 + 2] = sz + (tz - sz) * buildT;
        }
        lineAttr.needsUpdate = true;

        const pulse = 0.5 + Math.sin(elapsed * 0.002) * 0.5;
        coreLight.intensity = 2.2 + pulse * 0.9;
        auraMat.opacity = 0.04 + pulse * 0.05;
        ringMat.opacity = 0.12 + pulse * 0.12;
        pMat.opacity = 0.75 + pulse * 0.2;
        lMat.opacity = 0.12 + buildT * 0.18;

        globe.rotation.y += 0.0018;
        globe.rotation.x += (pointerY * 0.35 - globe.rotation.x) * 0.04;
        globe.rotation.y += pointerX * 0.008;
        ring.rotation.z += 0.001;

        renderer.render(scene, camera);
    };
    tick();

    return {
        destroy: () => {
            cancelAnimationFrame(raf);
            container.removeEventListener("pointermove", onMove);
            window.removeEventListener("resize", onResize);
            pGeo.dispose();
            pMat.dispose();
            lGeo.dispose();
            lMat.dispose();
            auraGeo.dispose();
            auraMat.dispose();
            ringGeo.dispose();
            ringMat.dispose();
            renderer.dispose();
        }
    };
}
