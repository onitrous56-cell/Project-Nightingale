import React, {useEffect, useRef} from 'react';
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {LiveWallpaperType, ThemeMode} from '../types';

interface AmbientThreeBackgroundProps {
  enabled: boolean;
  lowStimulationMode: boolean;
  batterySaverActive?: boolean;
  theme: ThemeMode;
  childFriendlyMode?: boolean;
  wallpaperType?: LiveWallpaperType;
}

// Pre-allocated math helpers outside render loop (Zero-GC policy)
const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

const _targetBg = new THREE.Color();
const _targetA = new THREE.Color();
const _targetB = new THREE.Color();
const _targetC = new THREE.Color();

interface ThemeVisualSpec {
  bg: number;
  fog: number;
  primary: number;
  secondary: number;
  accent: number;
  waveA: number;
  waveB: number;
  waveC: number;
  waveContrast: number;
}

const THEME_SCENE_COLORS: Record<ThemeMode, ThemeVisualSpec> = {
  dark: {
    bg: 0x070b14,
    fog: 0x090e17,
    primary: 0x38bdf8,
    secondary: 0x475569,
    accent: 0xf59e0b,
    waveA: 0x0ea5e9,
    waveB: 0x1d4ed8,
    waveC: 0xf59e0b,
    waveContrast: 0.42,
  },
  'high-contrast': {
    bg: 0x000000,
    fog: 0x000000,
    primary: 0xffe600,
    secondary: 0x262626,
    accent: 0xffffff,
    waveA: 0xffe600,
    waveB: 0x332b00,
    waveC: 0xffffff,
    waveContrast: 0.24,
  },
  cream: {
    bg: 0xfaf5e8,
    fog: 0xfaf5e8,
    primary: 0x1d4ed8,
    secondary: 0xb09f7c,
    accent: 0x0f766e,
    waveA: 0xe6d4ae,
    waveB: 0xbbe0d4,
    waveC: 0xc5d5f8,
    waveContrast: 0.55,
  },
  neon: {
    bg: 0x03050a,
    fog: 0x050b1a,
    primary: 0x00f5d4,
    secondary: 0x081638,
    accent: 0xff4d00,
    waveA: 0x0088ff,
    waveB: 0x00e5d4,
    waveC: 0xff4500,
    waveContrast: 0.65,
  },
  'liquid-glass': {
    bg: 0x050b18,
    fog: 0x071124,
    primary: 0x38bdf8,
    secondary: 0x1e293b,
    accent: 0xa855f7,
    waveA: 0x0284c7,
    waveB: 0x6366f1,
    waveC: 0xec4899,
    waveContrast: 0.58,
  },
  'cyber-teal': {
    bg: 0x02080a,
    fog: 0x031418,
    primary: 0x00f5c4,
    secondary: 0x06282e,
    accent: 0x06b6d4,
    waveA: 0x0891b2,
    waveB: 0x059669,
    waveC: 0x00f5c4,
    waveContrast: 0.68,
  },
  'calm-lavender': {
    bg: 0x0c0819,
    fog: 0x100b21,
    primary: 0xc084fc,
    secondary: 0x24143d,
    accent: 0xe879f9,
    waveA: 0x9333ea,
    waveB: 0x6366f1,
    waveC: 0xf472b6,
    waveContrast: 0.45,
  },
  'solar-gold': {
    bg: 0x0d0903,
    fog: 0x140e05,
    primary: 0xf59e0b,
    secondary: 0x332007,
    accent: 0xfbbf24,
    waveA: 0xd97706,
    waveB: 0xb45309,
    waveC: 0xfef08a,
    waveContrast: 0.6,
  },
};

const LIVE_WALLPAPER_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LIVE_WALLPAPER_FRAGMENT = /* glsl */ `
precision mediump float;
varying vec2 vUv;

uniform float uTime;
uniform vec3 uBgColor;
uniform vec3 uWaveA;
uniform vec3 uWaveB;
uniform vec3 uWaveC;
uniform float uContrast;
uniform float uChildSoftness;
uniform float uMode; // 0 = aurora-waves/astrolabe, 1 = liquid-glass, 2 = cosmic-orbs

void main() {
  vec2 uv = vUv;
  float t = uTime * mix(0.28, 0.19, uChildSoftness);

  // Layered flowing silk / aurora wave bands
  float w1 = sin(uv.x * 4.2 + t + sin(uv.y * 2.8 - t * 0.7) * 1.15);
  float w2 = cos(uv.y * 3.6 - t * 0.8 + sin(uv.x * 3.1 + t * 0.5) * 1.1);
  float w3 = sin((uv.x * 2.4 - uv.y * 2.9) + t * 1.15);

  float band1 = smoothstep(-0.7, 0.9, w1) * 0.5 + 0.5 * sin(uv.y * 3.14159);
  float band2 = smoothstep(-0.5, 0.95, w2);
  float ribbon = smoothstep(0.68, 0.99, 0.5 + 0.5 * w3);

  vec3 col = uBgColor;

  if (uMode > 0.5 && uMode < 1.5) {
    // Liquid Glass Fluid Refraction & Chromatic Specular Caustics
    float blob1 = smoothstep(0.55, 0.05, distance(uv, vec2(0.32 + sin(t * 0.65) * 0.14, 0.45 + cos(t * 0.5) * 0.16)));
    float blob2 = smoothstep(0.5, 0.04, distance(uv, vec2(0.68 + cos(t * 0.55) * 0.15, 0.55 + sin(t * 0.72) * 0.14)));
    float caustic = pow(clamp(0.5 + 0.5 * sin(uv.x * 6.0 + w1 * 1.8 - t), 0.0, 1.0), 3.0);
    col = mix(uBgColor, uWaveA, blob1 * 0.52 * uContrast);
    col = mix(col, uWaveB, blob2 * 0.48 * uContrast);
    col = mix(col, uWaveC, caustic * 0.36 * uContrast);
  } else if (uMode >= 1.5) {
    // Cosmic Orbs Deep Nebula Atmosphere
    float radial = smoothstep(0.85, 0.1, distance(uv, vec2(0.5 + sin(t * 0.3) * 0.08, 0.48 + cos(t * 0.25) * 0.08)));
    col = mix(uBgColor, mix(uWaveB, uWaveA, band1), radial * 0.48 * uContrast);
    col = mix(col, uWaveC, smoothstep(0.75, 1.0, band2) * 0.28 * uContrast);
  } else {
    // Aurora Waves / Astrolabe Flow
    float coolMask = clamp(band1 * 0.34 + band2 * 0.28, 0.0, 0.52) * uContrast;
    vec3 coolCol = mix(uWaveA, uWaveB, clamp(band2, 0.0, 1.0));
    col = mix(uBgColor, coolCol, coolMask);
    float accentMix = smoothstep(0.45, 0.98, ribbon) * 0.38 * uContrast;
    col = mix(col, uWaveC, accentMix);
  }

  // Subtle corner vignette for crisp foreground legibility
  float dist = distance(uv, vec2(0.5, 0.5));
  float vig = smoothstep(0.92, 0.22, dist);
  col = mix(uBgColor, col, mix(0.68, 1.0, vig));

  gl_FragColor = vec4(col, 1.0);
}
`;

function createProceduralBrushedTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#d4dde8';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 2) {
      const shade = 200 + Math.floor(Math.sin(y * 0.45) * 18 + Math.random() * 14);
      ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
      ctx.fillRect(0, y, 256, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const AmbientThreeBackground: React.FC<AmbientThreeBackgroundProps> = ({
  enabled,
  lowStimulationMode,
  batterySaverActive = false,
  theme,
  childFriendlyMode = false,
  wallpaperType = 'aurora-waves',
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const themeRef = useRef<ThemeMode>(theme);
  const childRef = useRef<boolean>(childFriendlyMode);
  const wallpaperRef = useRef<LiveWallpaperType>(wallpaperType);
  const paletteActionRef = useRef<
    ((nextTheme: ThemeMode, isChild: boolean, nextWallpaper: LiveWallpaperType) => void) | null
  >(null);

  useEffect(() => {
    themeRef.current = theme;
    childRef.current = childFriendlyMode;
    wallpaperRef.current = wallpaperType;
    paletteActionRef.current?.(theme, childFriendlyMode, wallpaperType);
  }, [theme, childFriendlyMode, wallpaperType]);

  const shouldRender =
    enabled && !lowStimulationMode && !batterySaverActive && wallpaperType !== 'off';

  useEffect(() => {
    const container = mountRef.current;
    if (!shouldRender || !container) return;

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initialColors = THEME_SCENE_COLORS[themeRef.current];
    scene.background = new THREE.Color(initialColors.bg);
    scene.fog = new THREE.FogExp2(initialColors.fog, 0.032);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      90
    );
    camera.position.set(0, 1.3, 9.6);

    const disposables: Array<{dispose: () => void}> = [envTexture];

    // Live Theme-Reactive Shader Wallpaper Canvas (positioned seamlessly behind 3D sculpture)
    const wallpaperGeo = new THREE.PlaneGeometry(76, 46, 1, 1);
    const wallpaperUniforms = {
      uTime: {value: 0},
      uBgColor: {value: new THREE.Color(initialColors.bg)},
      uWaveA: {value: new THREE.Color(initialColors.waveA)},
      uWaveB: {value: new THREE.Color(initialColors.waveB)},
      uWaveC: {value: new THREE.Color(initialColors.waveC)},
      uContrast: {value: initialColors.waveContrast},
      uChildSoftness: {value: childRef.current ? 1.0 : 0.0},
      uMode: {
        value:
          wallpaperRef.current === 'liquid-glass'
            ? 1.0
            : wallpaperRef.current === 'cosmic-orbs'
              ? 2.0
              : 0.0,
      },
    };
    const wallpaperMat = new THREE.ShaderMaterial({
      vertexShader: LIVE_WALLPAPER_VERTEX,
      fragmentShader: LIVE_WALLPAPER_FRAGMENT,
      uniforms: wallpaperUniforms,
      depthWrite: false,
      depthTest: true,
    });
    const wallpaperMesh = new THREE.Mesh(wallpaperGeo, wallpaperMat);
    wallpaperMesh.position.set(0, 0, -22);
    wallpaperMesh.renderOrder = -10;
    scene.add(wallpaperMesh);
    disposables.push(wallpaperGeo, wallpaperMat);

    _targetBg.setHex(initialColors.bg);
    _targetA.setHex(initialColors.waveA);
    _targetB.setHex(initialColors.waveB);
    _targetC.setHex(initialColors.waveC);
    let targetContrast = initialColors.waveContrast;
    let targetChildSoftness = childRef.current ? 1.0 : 0.0;
    let currentWallpaper: LiveWallpaperType = wallpaperRef.current;

    // Neutral white key light preserves pure neon orange hues without yellow cast
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(6, 9, 7);
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.85);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(initialColors.primary, 1.6);
    rimLight.position.set(-7, -2, -6);
    scene.add(rimLight);

    // Procedural brushed texture
    const brushedTex = createProceduralBrushedTexture();
    brushedTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    disposables.push(brushedTex);

    // Composite 8-part procedural hero sculpture: AbleBridge Harmonic Astrolabe
    const astrolabeGroup = new THREE.Group();
    astrolabeGroup.position.set(2.4, -0.35, -1.8);
    scene.add(astrolabeGroup);

    const mattePedestalMat = new THREE.MeshStandardMaterial({
      color: initialColors.secondary,
      roughness: 0.72,
      metalness: 0.22,
    });
    const brushedMetalMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      map: brushedTex,
      roughness: 0.24,
      metalness: 0.88,
    });
    const accentRingMat = new THREE.MeshPhysicalMaterial({
      color: initialColors.primary,
      roughness: 0.18,
      metalness: 0.72,
      clearcoat: 0.85,
    });
    const innerCoreMat = new THREE.MeshStandardMaterial({
      color: initialColors.accent,
      emissive: initialColors.primary,
      emissiveIntensity: 0.55,
      roughness: 0.28,
      metalness: 0.45,
    });
    const outerGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.08,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.32 : 0.92,
      ior: 1.52,
      thickness: 0.8,
      depthWrite: false,
    });
    disposables.push(
      mattePedestalMat,
      brushedMetalMat,
      accentRingMat,
      innerCoreMat,
      outerGlassMat
    );

    const baseGeo = new THREE.CylinderGeometry(1.55, 1.85, 0.32, 32);
    const baseMesh = new THREE.Mesh(baseGeo, mattePedestalMat);
    baseMesh.position.y = -2.15;
    astrolabeGroup.add(baseMesh);
    disposables.push(baseGeo);

    const lathePts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(1.2, 0.0),
      new THREE.Vector2(1.05, 0.22),
      new THREE.Vector2(0.55, 0.45),
      new THREE.Vector2(0.35, 0.72),
      new THREE.Vector2(0.0, 0.72),
    ];
    const collarGeo = new THREE.LatheGeometry(lathePts, 32);
    const collarMesh = new THREE.Mesh(collarGeo, brushedMetalMat);
    collarMesh.position.y = -1.99;
    astrolabeGroup.add(collarMesh);
    disposables.push(collarGeo);

    const bridgeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.95, -1.75, 0),
      new THREE.Vector3(-1.55, 0.35, 0.2),
      new THREE.Vector3(0, 1.85, 0),
      new THREE.Vector3(1.55, 0.35, -0.2),
      new THREE.Vector3(1.95, -1.75, 0),
    ]);
    const archGeo = new THREE.TubeGeometry(bridgeCurve, 56, 0.11, 16, false);
    const archMesh = new THREE.Mesh(archGeo, brushedMetalMat);
    astrolabeGroup.add(archMesh);
    disposables.push(archGeo);

    const outerRingGeo = new THREE.TorusGeometry(1.55, 0.065, 20, 72);
    const outerRing = new THREE.Mesh(outerRingGeo, accentRingMat);
    outerRing.position.y = 0.15;
    astrolabeGroup.add(outerRing);

    const midRingGeo = new THREE.TorusGeometry(1.18, 0.05, 18, 64);
    const midRing = new THREE.Mesh(midRingGeo, brushedMetalMat);
    midRing.position.y = 0.15;
    midRing.rotation.x = Math.PI / 3;
    astrolabeGroup.add(midRing);

    const innerRingGeo = new THREE.TorusGeometry(0.84, 0.04, 16, 56);
    const innerRing = new THREE.Mesh(innerRingGeo, accentRingMat);
    innerRing.position.y = 0.15;
    innerRing.rotation.y = Math.PI / 4;
    astrolabeGroup.add(innerRing);
    disposables.push(outerRingGeo, midRingGeo, innerRingGeo);

    const crystalGeo = new THREE.OctahedronGeometry(0.46, 0);
    const crystalMesh = new THREE.Mesh(crystalGeo, innerCoreMat);
    crystalMesh.position.y = 0.15;
    astrolabeGroup.add(crystalMesh);

    const glassGeo = new THREE.IcosahedronGeometry(0.68, 2);
    const glassMesh = new THREE.Mesh(glassGeo, outerGlassMat);
    glassMesh.position.y = 0.15;
    glassMesh.renderOrder = 2;
    astrolabeGroup.add(glassMesh);
    disposables.push(crystalGeo, glassGeo);

    const STAR_COUNT = 56;
    const nodeGeo = new THREE.OctahedronGeometry(0.085, 0);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.5,
      emissive: initialColors.primary,
      emissiveIntensity: 0.42,
    });
    const instancedNodes = new THREE.InstancedMesh(nodeGeo, nodeMat, STAR_COUNT);
    instancedNodes.frustumCulled = false;

    const nodeMeta: Array<{
      radius: number;
      angle: number;
      speed: number;
      yBase: number;
      scale: number;
    }> = [];

    for (let i = 0; i < STAR_COUNT; i++) {
      const radius = 3.2 + (i % 7) * 0.85 + Math.random() * 0.4;
      const angle = (i / STAR_COUNT) * Math.PI * 2;
      const speed = (0.04 + (i % 5) * 0.014) * (i % 2 === 0 ? 1 : -1);
      const yBase = ((i % 9) - 4) * 0.65;
      const sc = 0.85 + Math.random() * 0.3;
      nodeMeta.push({radius, angle, speed, yBase, scale: sc});

      _color.setHex(i % 3 === 0 ? initialColors.accent : initialColors.primary);
      _color.offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.08);
      instancedNodes.setColorAt(i, _color);
    }
    if (instancedNodes.instanceColor) {
      instancedNodes.instanceColor.needsUpdate = true;
    }
    scene.add(instancedNodes);
    disposables.push(nodeGeo, nodeMat);

    const orbGroup = new THREE.Group();
    const orbGeo = new THREE.SphereGeometry(0.55, 28, 28);
    const orbGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.06,
      metalness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.85,
      transparent: true,
      opacity: isSoftwareGl ? 0.35 : 0.88,
      ior: 1.45,
      thickness: 1.1,
    });
    const orbMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(orbGeo, orbGlassMat);
      m.position.set((i - 2.5) * 2.1, Math.sin(i * 1.4) * 1.5, -2.5 - (i % 3) * 1.8);
      m.scale.setScalar(0.65 + (i % 3) * 0.45);
      orbGroup.add(m);
      orbMeshes.push(m);
    }
    scene.add(orbGroup);
    disposables.push(orbGeo, orbGlassMat);

    const applyModeVisibility = (mode: LiveWallpaperType) => {
      astrolabeGroup.visible = mode === 'astrolabe';
      orbGroup.visible = mode === 'liquid-glass' || mode === 'cosmic-orbs';
      instancedNodes.visible = mode === 'astrolabe' || mode === 'cosmic-orbs' || mode === 'aurora-waves';
      wallpaperUniforms.uMode.value =
        mode === 'liquid-glass' ? 1.0 : mode === 'cosmic-orbs' ? 2.0 : 0.0;
    };
    applyModeVisibility(currentWallpaper);

    // Live theme, child-mode & wallpaper update without context recreation
    paletteActionRef.current = (
      nextTheme: ThemeMode,
      isChild: boolean,
      nextWallpaper: LiveWallpaperType
    ) => {
      const c = THEME_SCENE_COLORS[nextTheme];
      _targetBg.setHex(c.bg);
      _targetA.setHex(c.waveA);
      _targetB.setHex(c.waveB);
      _targetC.setHex(c.waveC);
      targetContrast = c.waveContrast;
      targetChildSoftness = isChild ? 1.0 : 0.0;
      currentWallpaper = nextWallpaper;
      applyModeVisibility(nextWallpaper);

      if (scene.background instanceof THREE.Color) {
        scene.background.setHex(c.bg);
      }
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(c.fog);
      }
      mattePedestalMat.color.setHex(c.secondary);
      accentRingMat.color.setHex(c.primary);
      innerCoreMat.color.setHex(c.accent);
      innerCoreMat.emissive.setHex(nextTheme === 'neon' ? c.accent : c.primary);
      rimLight.color.setHex(c.primary);
      nodeMat.emissive.setHex(c.primary);
      orbGlassMat.color.setHex(nextWallpaper === 'cosmic-orbs' ? c.primary : 0xffffff);
      for (let i = 0; i < STAR_COUNT; i++) {
        _color.setHex(i % 3 === 0 ? c.accent : i % 2 === 0 ? c.waveA : c.primary);
        instancedNodes.setColorAt(i, _color);
      }
      if (instancedNodes.instanceColor) {
        instancedNodes.instanceColor.needsUpdate = true;
      }
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let targetX = 0;
    let targetY = 0;
    const handlePointerMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetX = nx * 0.45;
      targetY = -ny * 0.28;
    };
    window.addEventListener('pointermove', handlePointerMove, {passive: true});

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    let frameId = 0;
    let disposed = false;
    let elapsed = 0;
    let prevTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      elapsed += dt;

      // Smoothly transition Live Wallpaper shader uniforms on theme swap
      wallpaperUniforms.uTime.value = elapsed;
      const lerpAlpha = Math.min(1, dt * 4.0);
      wallpaperUniforms.uBgColor.value.lerp(_targetBg, lerpAlpha);
      wallpaperUniforms.uWaveA.value.lerp(_targetA, lerpAlpha);
      wallpaperUniforms.uWaveB.value.lerp(_targetB, lerpAlpha);
      wallpaperUniforms.uWaveC.value.lerp(_targetC, lerpAlpha);
      wallpaperUniforms.uContrast.value = THREE.MathUtils.lerp(
        wallpaperUniforms.uContrast.value,
        targetContrast,
        lerpAlpha
      );
      wallpaperUniforms.uChildSoftness.value = THREE.MathUtils.lerp(
        wallpaperUniforms.uChildSoftness.value,
        targetChildSoftness,
        lerpAlpha
      );

      // Damped gentle camera parallax
      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetX, 3.0, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 1.3 + targetY, 3.0, dt);
      camera.lookAt(0.8, -0.2, -1.6);

      // Smooth orbital kinematics
      if (astrolabeGroup.visible) {
        astrolabeGroup.rotation.y = elapsed * 0.14;
        outerRing.rotation.x = Math.sin(elapsed * 0.35) * 0.42;
        outerRing.rotation.y = elapsed * 0.24;
        midRing.rotation.z = elapsed * -0.32;
        innerRing.rotation.x = elapsed * 0.45;
        crystalMesh.rotation.y = -elapsed * 0.6;
        crystalMesh.rotation.x = Math.sin(elapsed * 0.5) * 0.3;
      }

      if (orbGroup.visible) {
        for (let i = 0; i < orbMeshes.length; i++) {
          const orb = orbMeshes[i];
          orb.position.y = Math.sin(elapsed * 0.42 + i * 1.1) * 1.65;
          orb.position.x = (i - 2.5) * 2.1 + Math.cos(elapsed * 0.28 + i) * 0.6;
          orb.rotation.y = elapsed * 0.2 + i;
        }
      }

      if (instancedNodes.visible) {
        for (let i = 0; i < STAR_COUNT; i++) {
          const m = nodeMeta[i];
          const a = m.angle + elapsed * m.speed;
          _vec3.set(
            Math.cos(a) * m.radius,
            m.yBase + Math.sin(elapsed * 0.6 + i) * 0.22,
            Math.sin(a) * m.radius - 2.0
          );
          _euler.set(elapsed * 0.5 + i, elapsed * 0.4, 0);
          _quat.setFromEuler(_euler);
          _scale.setScalar(m.scale);
          _mat4.compose(_vec3, _quat, _scale);
          instancedNodes.setMatrixAt(i, _mat4);
        }
        instancedNodes.instanceMatrix.needsUpdate = true;
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      paletteActionRef.current = null;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      container.innerHTML = '';
    };
  }, [shouldRender]);

  if (!shouldRender) return null;

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
};
