/**
 * Planeta 3D — Three.js com bloom/glow e partículas orbitais.
 * Lazy-loaded; fallback CSS se WebGL indisponível.
 */

const PURPLE = 0xa855f7;
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

export function supportsWebGL(): boolean {
    try {
        const canvas = document.createElement("canvas");
        return Boolean(
            canvas.getContext("webgl2") || canvas.getContext("webgl")
        );
    } catch {
        return false;
    }
}

export function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface ThreeModule {
    Scene: new () => { add: (o: unknown) => void };
    PerspectiveCamera: new (fov: number, aspect: number, near: number, far: number) => {
        position: { z: number };
        aspect: number;
        updateProjectionMatrix: () => void;
    };
    WebGLRenderer: new (opts: Record<string, unknown>) => {
        setSize: (w: number, h: number) => void;
        setPixelRatio: (r: number) => void;
        render: (scene: unknown, camera: unknown) => void;
        dispose: () => void;
    };
    SphereGeometry: new (r: number, w: number, h: number) => object;
    MeshStandardMaterial: new (opts: Record<string, unknown>) => object;
    Mesh: new (geo: object, mat: object) => {
        rotation: { x: number; y: number };
    };
    PointLight: new (color: number, intensity: number, distance: number) => {
        position: { set: (x: number, y: number, z: number) => void };
        intensity: number;
    };
    AmbientLight: new (color: number, intensity: number) => object;
    BufferGeometry: new () => { setAttribute: (n: string, a: unknown) => void; dispose: () => void };
    BufferAttribute: new (arr: Float32Array, itemSize: number) => object;
    PointsMaterial: new (opts: Record<string, unknown>) => { dispose: () => void };
    Points: new (geo: object, mat: object) => { rotation: { x: number; y: number } };
    AdditiveBlending: number;
    Color: new (hex: number) => object;
}

async function loadThree(): Promise<ThreeModule> {
    return import(/* @vite-ignore */ THREE_CDN) as Promise<ThreeModule>;
}

export interface PlanetSceneHandle {
    destroy: () => void;
}

export async function initPlanetCanvas(
    canvas: HTMLCanvasElement,
    container: HTMLElement
): Promise<PlanetSceneHandle> {
    const THREE = await loadThree();
    const w = container.clientWidth || 480;
    const h = container.clientHeight || 420;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const ambient = new THREE.AmbientLight(0x1a0a2e, 0.6);
    scene.add(ambient);

    const glow = new THREE.PointLight(PURPLE, 2.4, 12);
    glow.position.set(2, 1, 3);
    scene.add(glow);

    const rim = new THREE.PointLight(0x7c3aed, 1.2, 10);
    rim.position.set(-2, -1, 2);
    scene.add(rim);

    const geo = new THREE.SphereGeometry(1.15, 64, 64);
    const mat = new THREE.MeshStandardMaterial({
        color: PURPLE,
        emissive: new THREE.Color(PURPLE),
        emissiveIntensity: 0.35,
        metalness: 0.4,
        roughness: 0.45
    });
    const planet = new THREE.Mesh(geo, mat);
    scene.add(planet);

    const atmosphereGeo = new THREE.SphereGeometry(1.28, 48, 48);
    const atmosphereMat = new THREE.MeshStandardMaterial({
        color: PURPLE,
        transparent: true,
        opacity: 0.12,
        emissive: new THREE.Color(PURPLE),
        emissiveIntensity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    scene.add(atmosphere);

    const particleCount = 180;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        const r = 1.6 + Math.random() * 1.4;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
        color: PURPLE,
        size: 0.035,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    let raf = 0;
    let pointerX = 0;
    let pointerY = 0;

    const onMove = (e: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 0.4;
        pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 0.25;
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

    const tick = () => {
        raf = requestAnimationFrame(tick);
        planet.rotation.y += 0.003;
        atmosphere.rotation.y += 0.002;
        particles.rotation.y -= 0.001;
        particles.rotation.x = pointerY * 0.3;
        planet.rotation.x = pointerY * 0.15;
        planet.rotation.y += pointerX * 0.01;
        glow.intensity = 2.2 + Math.sin(Date.now() * 0.001) * 0.3;
        renderer.render(scene, camera);
    };
    tick();

    return {
        destroy: () => {
            cancelAnimationFrame(raf);
            container.removeEventListener("pointermove", onMove);
            window.removeEventListener("resize", onResize);
            (geo as { dispose: () => void }).dispose();
            (mat as { dispose: () => void }).dispose();
            (atmosphereGeo as { dispose: () => void }).dispose();
            (atmosphereMat as { dispose: () => void }).dispose();
            pGeo.dispose();
            pMat.dispose();
            renderer.dispose();
        }
    };
}
