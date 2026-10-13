import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Authored in metres: X right, Y up, lens looks along +Z. */
export const CAMERA_DIMENSIONS = { body: [0.152, 0.1135, 0.075], lensDiameter: 0.0835, lensLength: 0.107 } as const;
export type CameraVisualSettings = { aperture?: number; shutterSeconds?: number; iso?: number; mode?: string; whiteBalance?: string };
export type CameraVisualState = { raised?: boolean; focalLength?: number; focusDistance?: number; shutterPulse?: number; settings?: CameraVisualSettings; lastPhotoUrl?: string | null };
export interface CameraVisual { group: THREE.Group; body: THREE.Group; lens: THREE.Group; screen: THREE.Mesh; update(dt: number, state: CameraVisualState): void; dispose(): void }

const labels: Record<string, [string, string]> = {
  canon: ['Canon', '#dedbd2'], model: ['EOS 5D Mark II', '#d8d8d3'], lens: ['CANON ZOOM LENS EF 24–105mm 1:4 L IS USM', '#cfcec7'],
  top: ['24    35    50    70    105', '#d9d8ce'], mode: ['M  Av  Tv  P', '#eeeeea'], back: ['MENU   INFO.       AF-ON', '#b9b9b2'],
};
function makeLabelTexture(key: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 96;
  const context = canvas.getContext('2d'); if (!context) return null;
  const [text, color] = labels[key]; context.clearRect(0, 0, 768, 96); context.fillStyle = color;
  context.font = key === 'canon' ? 'italic bold 72px Georgia' : 'bold 38px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(text, 384, 48);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createCameraModel(options: { quality?: 'high' | 'low'; canvasLabels?: boolean } = {}): CameraVisual {
  const high = options.quality !== 'low', segments = high ? 32 : 16;
  const group = new THREE.Group(); group.name = 'Canon_EOS_5D_Mark_II_EF24_105';
  const body = new THREE.Group(); body.name = 'body'; group.add(body);
  const lens = new THREE.Group(); lens.name = 'zoomBarrel'; group.add(lens);
  const focusRing = new THREE.Group(); focusRing.name = 'focusRing'; focusRing.position.set(-.004, -.001, .120); lens.add(focusRing);
  const materials = {
    shell: new THREE.MeshStandardMaterial({ color: 0x141616, roughness: .63 }), rubber: new THREE.MeshStandardMaterial({ color: 0x090b0c, roughness: .95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x626566, metalness: .85, roughness: .25 }), dark: new THREE.MeshStandardMaterial({ color: 0x25282a, roughness: .5 }),
    red: new THREE.MeshStandardMaterial({ color: 0xb92527, roughness: .5 }), ivory: new THREE.MeshStandardMaterial({ color: 0xdbd8c9, roughness: .6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x19394d, metalness: .6, roughness: .12 }), gold: new THREE.MeshStandardMaterial({ color: 0x877440, metalness: .7, roughness: .38 }),
  };
  type MaterialKey = keyof typeof materials;
  const parts: Array<{ mesh: THREE.Mesh; parent: THREE.Group; material: MaterialKey }> = [];
  function add(geo: THREE.BufferGeometry, mat: MaterialKey, xyz: number[], parent = body, name = '') {
    const mesh = new THREE.Mesh(geo, materials[mat]); mesh.position.set(xyz[0], xyz[1], xyz[2]); mesh.name = name; parent.add(mesh); parts.push({ mesh, parent, material: mat }); return mesh;
  }
  function box(w: number, h: number, d: number, mat: MaterialKey, xyz: number[], parent = body, r = .002) {
    return add(new RoundedBoxGeometry(w, h, d, high ? 2 : 1, Math.min(r, w / 4, h / 4, d / 4)), mat, xyz, parent);
  }
  function cylinder(radius: number, depth: number, mat: MaterialKey, xyz: number[], parent = lens) {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, depth, segments), mat, xyz, parent); mesh.rotation.x = Math.PI / 2; return mesh;
  }
  function label(key: string, w: number, h: number, xyz: number[], rear = false, parent = body) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: options.canvasLabels === false ? null : makeLabelTexture(key), color: 0xffffff });
    mat.userData.labelKey = key;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.position.set(xyz[0], xyz[1], xyz[2]); if (rear) mesh.rotation.y = Math.PI; parent.add(mesh); return mesh;
  }
  // Magnesium body, textured handgrip, pentaprism and top shoulder contours.
  box(.143, .083, .064, 'shell', [0, -.009, 0], body, .007);
  box(.044, .096, .075, 'rubber', [.054, -.004, .003], body, .008);
  box(.045, .093, .066, 'shell', [-.050, -.004, 0], body, .004);
  box(.068, .018, .060, 'shell', [.005, .038, 0], body, .005);
  const prismShape = new THREE.Shape(); prismShape.moveTo(-.031, .028); prismShape.lineTo(-.024, .049); prismShape.lineTo(-.012, .057); prismShape.lineTo(.012, .057); prismShape.lineTo(.026, .041); prismShape.lineTo(.031, .028); prismShape.closePath();
  add(new THREE.ExtrudeGeometry(prismShape, { depth: .041, bevelEnabled: high, bevelThickness: .0015, bevelSize: .0015, bevelSegments: 1, steps: 1 }), 'shell', [-.002, 0, -.018]);
  box(.018, .005, .021, 'metal', [-.002, .058, -.003], body, .0005);
  for (const x of [-.009, .005]) box(.002, .003, .022, 'dark', [x, .061, -.003], body, .0002);
  for (const x of [-.005, 0, .005]) add(new THREE.SphereGeometry(.0011, 8, 4), 'gold', [x, .0615, -.002]);
  label('canon', .046, .012, [-.002, .041, .0335]); label('model', .036, .006, [-.051, .017, .034]);
  box(.010, .013, .002, 'metal', [-.052, .030, .034]);
  // Lens mount, zoom and focus rings, extendable front section and recessed coated glass.
  cylinder(.043, .008, 'metal', [-.004, -.001, .037], body); cylinder(.0417, .038, 'shell', [-.004, -.001, .056], body);
  cylinder(.0415, .022, 'rubber', [-.004, -.001, .078], body); cylinder(.0395, .028, 'shell', [-.004, -.001, .104]);
  cylinder(.0405, .016, 'rubber', [0, 0, 0], focusRing); cylinder(.0412, .003, 'red', [-.004, -.001, .130]);
  cylinder(.0414, .013, 'shell', [-.004, -.001, .138]); cylinder(.037, .004, 'dark', [-.004, -.001, .146]);
  cylinder(.033, .002, 'glass', [-.004, -.001, .148]); cylinder(.021, .001, 'glass', [-.004, -.001, .149]);
  for (let i = 0; i < (high ? 64 : 24); i++) {
    const a = i * Math.PI * 2 / (high ? 64 : 24);
    const mesh = box(.0011, .001, .021, 'dark', [-.004 + Math.sin(a) * .0418, -.001 + Math.cos(a) * .0418, .078], body, .0001); mesh.rotation.z = -a;
  }
  if (high) for (let i = 0; i < 48; i++) {
    const a = i * Math.PI * 2 / 48;
    const mesh = box(.001, .001, .014, 'dark', [Math.sin(a) * .0407, Math.cos(a) * .0407, 0], focusRing, .0001); mesh.rotation.z = -a;
  }
  box(.010, .018, .005, 'dark', [-.045, -.003, .056]);
  for (const y of [-.009, -.001, .007]) box(.005, .002, .001, 'ivory', [-.045, y, .059]);
  label('top', .052, .004, [-.004, .042, .080]);
  label('lens', .044, .003, [-.004, .034, .1495], false, lens);
  // Back LCD with glass surround, optical finder, thumb rest, rear control wheel.
  box(.070, .051, .004, 'dark', [-.018, -.014, -.0345], body, .002);
  box(.066, .047, .001, 'glass', [-.018, -.014, -.037], body, .001);
  const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x182323 }); screenMaterial.userData.dynamicScreen = true;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(.063, .042), screenMaterial); screen.name = 'rearLCD'; screen.position.set(-.018, -.013, -.0377); screen.rotation.y = Math.PI; body.add(screen);
  box(.024, .018, .009, 'rubber', [-.002, .037, -.036], body, .002); box(.015, .009, .001, 'glass', [-.002, .038, -.041], body, .0005);
  box(.019, .027, .003, 'rubber', [.053, .021, -.036], body, .003);
  const rearWheel = add(new THREE.CylinderGeometry(.013, .013, .003, segments), 'rubber', [.044, -.011, -.036]); rearWheel.rotation.x = Math.PI / 2;
  cylinder(.0043, .004, 'dark', [.044, -.011, -.039], body);
  for (let i = 0; i < (high ? 28 : 12); i++) { const a = i * Math.PI * 2 / (high ? 28 : 12); box(.001, .0015, .001, 'metal', [.044 + Math.sin(a) * .012, -.011 + Math.cos(a) * .012, -.039], body, .0001); }
  for (let i = 0; i < 5; i++) cylinder(.0028, .002, 'dark', [-.061, .012 - i * .009, -.035], body);
  for (const x of [.020, .034, .048]) cylinder(.003, .002, 'dark', [x, .035, -.034], body);
  label('back', .110, .005, [-.008, .027, -.038], true);
  // Top mode wheel, shoulder LCD, shutter button and ribbed dial.
  add(new THREE.CylinderGeometry(.012, .012, .005, segments), 'dark', [-.052, .045, -.004]);
  const modeText = label('mode', .021, .006, [-.052, .048, -.004]); modeText.rotation.x = -Math.PI / 2;
  for (let i = 0; i < (high ? 24 : 12); i++) { const a = i * Math.PI * 2 / (high ? 24 : 12); box(.001, .003, .001, 'metal', [-.052 + Math.cos(a) * .012, .045, -.004 + Math.sin(a) * .012], body, .0001); }
  box(.027, .016, .002, 'glass', [.036, .043, -.006], body, .001);
  const shutter = add(new THREE.CylinderGeometry(.006, .006, .003, segments), 'metal', [.060, .044, .026]); shutter.rotation.x = .35;
  const dial = add(new THREE.CylinderGeometry(.004, .004, .015, segments), 'rubber', [.057, .045, .012]); dial.rotation.z = Math.PI / 2;
  for (const x of [-.075, .075]) box(.005, .009, .014, 'metal', [x, .024, -.004], body, .001);
  box(.018, .004, .017, 'dark', [.040, -.054, 0]); cylinder(.0035, .002, 'metal', [0, -.050, -.005], body);
  // Share static batches by material and transform, leaving zoom barrel and LCD independently animated.
  for (const parent of [body, lens, focusRing]) for (const key of Object.keys(materials) as MaterialKey[]) {
    const same = parts.filter(p => p.parent === parent && p.material === key); if (same.length < 2) continue;
    const geometries = same.map(p => { p.mesh.updateMatrix(); const g = p.mesh.geometry.index ? p.mesh.geometry.toNonIndexed() : p.mesh.geometry.clone(); g.applyMatrix4(p.mesh.matrix); return g; });
    const merged = mergeGeometries(geometries); if (merged) { const mesh = new THREE.Mesh(merged, materials[key]); mesh.name = `${parent.name}_${key}`; parent.add(mesh); for (const p of same) { parent.remove(p.mesh); p.mesh.geometry.dispose(); } }
    geometries.forEach(g => g.dispose());
  }
  let shutterTimer = 0, raised = 1, lastPhoto: string | null | undefined, photoTexture: THREE.Texture | null = null;
  let screenKey = '', screenCanvas: HTMLCanvasElement | null = typeof document === 'undefined' ? null : document.createElement('canvas');
  let screenTexture: THREE.CanvasTexture | null = null, disposed = false;
  if (screenCanvas) { screenCanvas.width = 512; screenCanvas.height = 336; screenTexture = new THREE.CanvasTexture(screenCanvas); screenTexture.colorSpace = THREE.SRGBColorSpace; screenMaterial.map = screenTexture; screenMaterial.color.set(0xffffff); }
  function update(dt: number, state: CameraVisualState) {
    const target = state.raised === false ? 0 : 1; raised = THREE.MathUtils.damp(raised, target, 12, dt); body.rotation.x = (1 - raised) * .1;
    lens.position.z = THREE.MathUtils.clamp(((state.focalLength ?? 24) - 24) / 81, 0, 1) * .025;
    focusRing.rotation.z = THREE.MathUtils.damp(focusRing.rotation.z, Math.log(Math.max(.45, state.focusDistance ?? 8) / .45) * .16, 18, dt);
    shutterTimer = Math.max(shutterTimer - dt, state.shutterPulse ?? 0); group.rotation.z = shutterTimer > 0 ? Math.sin(shutterTimer * 80) * .007 : 0;
    const settings = state.settings ?? {}; const nextKey = JSON.stringify([settings, Math.round(state.focalLength ?? 24), state.focusDistance, state.lastPhotoUrl]);
    if (state.lastPhotoUrl !== lastPhoto) { lastPhoto = state.lastPhotoUrl; photoTexture?.dispose(); photoTexture = null; if (lastPhoto && typeof document !== 'undefined') new THREE.TextureLoader().load(lastPhoto, t => { if (disposed || lastPhoto !== state.lastPhotoUrl) { t.dispose(); return; } t.colorSpace = THREE.SRGBColorSpace; photoTexture = t; screenKey = ''; }); }
    if (screenCanvas && screenTexture && (nextKey !== screenKey || shutterTimer > 0)) {
      const ctx = screenCanvas.getContext('2d')!; ctx.fillStyle = '#171f22'; ctx.fillRect(0, 0, 512, 336);
      if (photoTexture?.image) ctx.drawImage(photoTexture.image as CanvasImageSource, 0, 0, 512, 282);
      ctx.fillStyle = '#e6e4d6'; ctx.font = 'bold 33px monospace'; ctx.fillText(`${settings.mode ?? 'AUTO'}    ${Math.round(state.focalLength ?? 24)}mm`, 21, 48);
      const seconds = settings.shutterSeconds ?? 1 / 125; const shutterLabel = seconds < 1 ? `1/${Math.round(1 / seconds)}` : `${seconds}s`;
      ctx.font = '27px monospace'; ctx.fillText(`${shutterLabel}   F${settings.aperture ?? 4}   ISO ${settings.iso ?? 100}`, 21, 313);
      if (!photoTexture) { ctx.strokeStyle = '#67ce8b'; ctx.lineWidth = 3; ctx.strokeRect(219, 131, 74, 62); ctx.font = '20px monospace'; ctx.fillText(`AF ${state.focusDistance ? state.focusDistance.toFixed(1) + 'm' : 'READY'}`, 185, 236); }
      screenTexture.needsUpdate = true; screenKey = nextKey;
    }
  }
  update(0, {});
  return { group, body, lens, screen, update, dispose() { if (disposed) return; disposed = true; group.removeFromParent(); photoTexture?.dispose(); screenTexture?.dispose(); const gs = new Set<THREE.BufferGeometry>(); const ms = new Set<THREE.Material>(); const ts = new Set<THREE.Texture>(); group.traverse(o => { if (o instanceof THREE.Mesh) { gs.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { ms.add(m); const map = (m as THREE.MeshBasicMaterial).map; if (map) ts.add(map); } } }); gs.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); ts.forEach(t => t.dispose()); group.clear(); screenCanvas = null; } };
}
