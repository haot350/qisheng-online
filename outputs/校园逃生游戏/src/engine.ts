import {CombatTraining,trainingPlan} from './training';
import {WeatherScene} from './weather-scene';
import {stairGuideForRoute,type StairGuide} from './escape-stair-guidance';
import {CardsPursuit,GADGET_RULES,newGadgetInventory,canCollectGadget,collectGadget,cycleGadget,helmetDamage,grenadeDamage,useCards,confiscatedHealth,type GadgetId,type GadgetLoot,type GrenadeState} from '@qisheng/shared/gadgets';
import {GadgetScene} from './gadget-scene';
import {selectEscapeRoster as orderedEscapeRoster} from './npc-roster';
import * as THREE from "three";
import {AdaptiveRenderQuality,resolveRenderProfile} from '@qisheng/shared/render-profile';
import {applyRendererProfile} from './render-quality';
import { FrameDiagnostics } from './frame-diagnostics.ts';
import { gameOperations } from './game-operations';
import { entryFor, ModeUnavailableError } from './game-config-store';
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { touchAimFriction } from "./aim-friction.ts";
import { GameAudio } from "./audio";
import {
  billboardResourceDiagnostics,
  createBillboardCharacter as createCharacter,
  prepareBillboards,
} from "./billboards";
import type { CameraVisual } from "./camera-model";
import { createViewWeapon, type ViewWeapon } from "./characters";
import { CombatEffects } from "./combat-effects.ts";
import {
  AttackCycle,
  DamageDirections,
  RecoilSpring,
  hitDamage,
  type BodyHit,
} from "./combat.ts";
import {
  DRIVE_AI,
  DrivingAttack,
  DrivingFireCoordinator,
  DrivingPatrol,
} from "./driving-ai.ts";
import { DrivingChallenge } from "./driving-challenge.ts";
import { configureDrivingStart, drivingAreaHints } from "./driving-guidance.ts";
import {
  canSelectTransmission,
  drivingCameraGain,
  drivingPrefetch,
} from "./driving-presentation.ts";
import { RESPAWN_RULES, chooseDrivingRespawn } from "./driving-respawn.ts";
import { DRIVE_RULES } from "./driving-rules.ts";
import { escapeFloorAt } from "./escape-floor";
import { EscapeContacts } from "./escape/contacts.ts";
import { ExtractionDefense } from "./escape/extraction-defense.ts";
import {
  ESCAPE_DIFFICULTIES,
  ESCAPE_RULES,
  EscapeAttack,
  EscapeFireCoordinator,
  EscapeHealthRecovery,
  EscapeMovement,
  EscapeRound,
  VALIDATED_ESCAPE_EXTRACTION,
  VALIDATED_ESCAPE_RESPAWN_SITES,
  VALIDATED_ESCAPE_SITES,
  VALIDATED_ESCAPE_SPAWN,
  calibratedEscapeRoute,
  escapeDifficulty,
  generateEscapePlan,
  selectEscapeRespawn,
  type EscapeMovementOutput,
  type EscapePlan,
  type EscapeSite,
  type EscapeTask,
} from "./escape/index.ts";
import { nearbyEscapeInteraction } from "./escape/nearby";
import {
  EscapeTactics,
  physicalCoverAt,
  type TacticalAgent,
  type TacticalDecision,
} from "./escape/tactics.ts";
import { gameMapSession } from "./game-map";
import { classifyImpactSurface } from "./impact-surfaces.ts";
import { createInput } from "./input";
import { primaryTouchInput, resolveTouchControls } from "./input-layout.ts";
import { projectNearbyInteraction } from "./interaction-placement";
import { pickupReachable } from "./interactions";
import { modeCapabilities, prepareModeAudio } from "./mode-policy";
import { nearbyInteractionSummary } from "./nearby-interaction";
import { withDeadline } from "./network.ts";
import {
  NpcMovingAccuracy,
  npcAimDirection,
  npcPelletDirection,
  NPC_COMBAT_PROFILES,
  NPC_SENSE_RULES,
  npcReaction,
  npcSightEligible,
  playerWeaponSpread,
} from "./npc-combat-motion.ts";
import {
  NPC_IDENTITY,
  NPC_IDS,
  selectRoundRoster,
  type NpcIdentityId,
} from "./npc-roster.ts";
import {
  NPC_SKILLS,
  NpcSkill,
  TeamInvestigation,
  calloutPathInRegion,
} from "./npc-skills.ts";
import { pathMotion } from "./path-following.ts";
import { PhotographyMarkers } from "./photography-markers";
import type { PhotoSystem } from "./photography/PhotoSystem";
import type { PhotoCaptureEvidence, PhotoRecord } from "./photography/types";
import { rankingClient } from "./ranking/client.ts";
import { RankingRecorder, retryAutomaticRanking } from "./ranking/recorder.ts";
import { rankingRuleVersion, type RankingEvent } from "./ranking/shared.ts";
import { RealityMatcher } from "./reality/RealityMatcher";
import { attachReality } from "./reality/persistence";
import type { RealityMatch } from "./reality/types";
import {
  Magazine,
  PRIMARY_WEAPONS,
  RULES,
  Stamina,
  WEAPONS,
  adsFieldOfView,
  seeded,
  smokeBlocks,
  wrapAngle,
} from "./rules";
import type { StoryCheckpoint, StorySaveStore, StorySession } from "./story";
import { StoryAudio } from "./story-audio";
import { storyNavigation } from "./story-navigation";
import type { createStoryWorld } from "./story-world";
import { STORY_START } from "./story/content";
import type { StoryGuidanceAction } from "./story/types";
import type { PhotoView } from "./streaming";
import {
  DEFAULT_SETTINGS,
  type GameAPI,
  type HitType,
  type Loadout,
  type Mode,
  type Phase,
  type Point,
  type PreparationOptions,
  type PrimaryWeaponId,
  type Settings,
  type Snapshot,
  type Vec3,
  type WeaponId,
} from "./types";
import { loadPhotoUI, preloadModeUI } from "./ui-modules";
import {vehicleDefinition,drivingVehicleId,type DrivingVehicleId} from "./vehicles.ts";
import {DrivingCannon,CANNON} from "./driving-cannon.ts";
import type { DriveMap, DrivingPhysics } from "./vehicle-physics.ts";
import type { createVehicleVisual } from "./vehicle-visual.ts";
import {
  WeaponDrops,
  collectSameWeapon,
  type WeaponDrop,
} from "./weapon-pickups.ts";
import { roundWeaponResources } from "./weapon-resources";
import {CombatGpuPreparer} from './multiplayer/combat-gpu-preparer';
import {
  createWorldWeapon,
  prepareWeapons,
  weaponResourceDiagnostics,
  type WorldWeapon,
} from "./weapons";
import { loadWorld } from "./world";
const UP = new THREE.Vector3(0, 1, 0);
const v = (a: Vec3) => new THREE.Vector3(...a);
const profileNavigationOff =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("profile") === "npc-navigation-off";
const profileNpcsHidden =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("profile") === "npc-hidden";
const qaSpawn = import.meta.env.DEV
  ? new URLSearchParams(location.search).get("qaSpawn")
  : null;
const QA_SPAWNS: Record<string, Vec3> = {
  gate: [25, 0.043, -24],
  teaching: [25, 0.043, -98],
  sports: [-126, 0.173, -100],
};
const qaSeedText = import.meta.env.DEV
  ? new URLSearchParams(location.search).get("qaSeed")
  : null;
const qaSeed =
  qaSeedText !== null && /^\d+$/.test(qaSeedText)
    ? Number(qaSeedText) >>> 0
    : undefined;
const qaRoster = import.meta.env.DEV
  ? new URLSearchParams(location.search)
      .get("qaRoster")
      ?.split(",")
      .filter((id): id is NpcIdentityId =>
        NPC_IDS.includes(id as NpcIdentityId),
      )
      .slice(0, 6)
  : undefined;
const profileCombatPreview =
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("profile") === "combat-preview";
type World = Awaited<ReturnType<typeof loadWorld>>;
type NPC = {
  id: number;
  identity: NpcIdentityId;
  skill?: NpcSkill;
  skillProbe: number;
  team: TeamInvestigation;
  rig: ReturnType<typeof createCharacter>;
  position: THREE.Vector3;
  gun: Magazine;
  role: number;
  path: THREE.Vector3[];
  destination: THREE.Vector3;
  lastKnown: THREE.Vector3 | null;
  memory: number;
  sense: number;
  repath: number;
  reaction: number;
  sees: boolean;
  alert: boolean;
  patrol: number;
  suppression: number;
  disabled: number;
  fire: number;
  hit: number;
  step: number;
  stuck: number;
  previous: THREE.Vector3;
  attack: AttackCycle;
  driveAI?: DrivingPatrol;
  driveAttack?: DrivingAttack;
  shotSerial: number;
  reloadSerial: number;
  reloadStage: number;
  escapeActive?: boolean;
  escapeAttack?: EscapeAttack;
  reenterAt?: number;
  respawnProbe?: number;
  lastEntry?: string;
  heardStep?: number;
  tacticalSeen?: boolean;
  tacticalDecision?: TacticalDecision;
  actualSpeed: number;
  movingAccuracy: NpcMovingAccuracy;
};
type Cloud = {
  position: THREE.Vector3;
  left: number;
  age: number;
  mesh: THREE.Group;
};
type Pickup = {
  point: Point;
  mesh: THREE.Group;
  collected: boolean;
};
type Spark = {
  mesh: THREE.Mesh;
  left: number;
  life: number;
};
export async function createGame(
  host: HTMLElement,
  publish: (s: Snapshot) => void,
  initial: Settings = DEFAULT_SETTINGS,
): Promise<GameAPI> {
  let ranked: RankingRecorder | null = null;
  const rankGeneration = new Map<number, number>();
  let rankingRetryStarted = false;
  let settings = { ...initial },
    phase: Phase = "loading",
    mode: Mode = "escape",
    progress = 0,
    message = "准备校园",
    dead = false;
  const touch = primaryTouchInput();
  const qualityDevice={mobile:touch,pixelRatio:devicePixelRatio};
  const qualityGovernor=new AdaptiveRenderQuality();
  const renderProfile=()=>resolveRenderProfile(settings.quality,qualityDevice,qualityGovernor.scale);
  const touchControls = () =>
    resolveTouchControls(settings.controls, primaryTouchInput());
  const renderer = new THREE.WebGLRenderer({
    antialias: !touch,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0xccdce3);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "第一人称校园游戏画面");
  host.appendChild(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xccdce3);
  scene.fog = new THREE.Fog(0xccdce3, 180, 390);
  const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.075, 420);
  camera.rotation.order = "YXZ";
  const ambientLight=new THREE.HemisphereLight(0xf2f3eb, 0x858e78, 2.6);
  scene.add(ambientLight);
  const sun = new THREE.DirectionalLight(0xffefcf, 2.7);
  sun.position.set(-110, 160, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -48,
    right: 48,
    top: 48,
    bottom: -48,
    near: 0.5,
    far: 320,
  });
  sun.shadow.normalBias = 0.1;
  sun.shadow.bias = -0.00015;
  scene.add(sun, sun.target);
  const weatherScene=new WeatherScene(scene,sun,ambientLight);
  const viewScene = new THREE.Scene(),
    viewCamera = new THREE.PerspectiveCamera(52, 1, 0.02, 10);
  viewScene.add(new THREE.HemisphereLight(0xfff5e3, 0x777c80, 2.9));
  const handSun = new THREE.DirectionalLight(0xffedd5, 2);
  handSun.position.set(-1, 3, 2);
  viewScene.add(handSun);
  let gunEnvironment: THREE.WebGLRenderTarget | undefined;
  if (renderer.capabilities) {
    const pmrem = new THREE.PMREMGenerator(renderer),
      room = new RoomEnvironment();
    gunEnvironment = pmrem.fromScene(room, 0.04);
    viewScene.environment = gunEnvironment.texture;
    viewScene.environmentIntensity = 0.9;
    scene.environment = gunEnvironment.texture;
    scene.environmentIntensity = 0.18;
    room.dispose();
    pmrem.dispose();
  }
  let viewWeapon: ViewWeapon | null = null;
  const effects = new CombatEffects(scene),
    directions = new DamageDirections(),
    kick = new RecoilSpring();
  effects.enabled = !(
    import.meta.env.DEV &&
    new URLSearchParams(location.search).get("effects") === "off"
  );
  const transient = new THREE.Group();
  scene.add(transient);
  const storyAudio = new StoryAudio();
  storyAudio.setVolumes(settings.music, settings.sfx);
  let story: StorySession | null = null,
    storyStore: StorySaveStore | null = null,
    storyWorld: Awaited<ReturnType<typeof createStoryWorld>> | null = null,
    photo: PhotoSystem | null = null,
    heldCamera: CameraVisual | null = null,
    storyOverlayOpen = false,
    photoSerial = 0,
    storyResume: StoryCheckpoint | null = null;
  let photographyMarkers: PhotographyMarkers | null = null;
  const shotUrls = new Set<string>(),
    shotUrlById = new Map<string, string>();
  const audio = new GameAudio(),
    input = createInput(canvas, () => pause());
  input.setEscapeAimMode(settings.escapeAimMode ?? "toggle");
  audio.setVolumes(settings.music, settings.sfx);
  const storyOverlays = new Set<
    | "history"
    | "archive"
    | "reality"
    | "photo-panel"
    | "photo-album"
    | "restore"
    | "ui-module"
    | "operations"
  >();
  let latestPhoto: PhotoRecord | undefined,
    temporaryPhotos: PhotoRecord[] = [],
    storyGesturePrimed = false;
  let realityMatch: RealityMatch | undefined,
    realityMatcher: RealityMatcher | undefined,
    realityRequest = 0,
    storyFastWalk = false;
  let routeClock = 0,
    guidePath: THREE.Vector3[] = [],
    guideStep = "";
  const guidanceTarget = (s: import("./story/types").StorySnapshot) => {
    const waiting = s.actors.find((a) => a.holding);
    return waiting
      ? {
          position: waiting.position,
          radius: 5.7,
          label: `走近${waiting.name}，继续同行`,
        }
      : s.target;
  };
  const narrativeSnapshot = () => {
    const s = story?.snapshot;
    if (!s) return;
    const target = guidanceTarget(s);
    return {
      ...s,
      navigation: storyNavigation(
        {
          ...s,
          target,
          distance: target ? position.distanceTo(v(target.position)) : null,
        },
        position,
        yaw,
        guidePath,
      ),
    };
  };
  let releaseOpening: (() => void) | undefined,
    openingLanding: {
      position: Vec3;
      yaw: number;
      pitch: number;
    } | null = null,
    bufferingVisible = false,
    bufferingSince = 0,
    loadingPanels = 0,
    bufferEvents = 0;
  let world!: World;
  let worldLoad: Promise<void> | null = null;
  let raf = 0,
    last = 0,
    accumulator = 0,
    emitClock = 0,
    perfClock = 0,
    perfFrames = 0,
    fps = 0,
    low = touch,
    quality = "自动",
    adaptiveRatio = renderProfile().pixelRatio;
  let releaseBillboards: (() => void) | undefined,
    releaseWeapons: (() => void) | undefined,
    enterToken = 0,
    buffering = false,
    mapError = false,
    mapProgress = 1,
    graphicsLost = false,
    loadedChunks = 0,
    performanceStamp = 0,
    lastReportedPhase: Phase | "" = "",
    sceneRevision = 0,
    shadowRevision = -1,
    shadowOrigin = new THREE.Vector3(Infinity, Infinity, Infinity);
  let qualityTextureLoad:AbortController|undefined;
  let renderTimes: number[] = [];
  const frameDiagnostics = new FrameDiagnostics();
  let gadgetInventory=newGadgetInventory(),gadgetLoot:GadgetLoot[]=[],grenades:GrenadeState[]=[],gadgetSerial=0;
  const cardsPursuit=new CardsPursuit(),gadgetScene=new GadgetScene(scene);
  const selectGadget=(id:GadgetId)=>{if(mode==='escape'&&['smoke','grenade','cards'].includes(id)){gadgetInventory.selectedGadget=id;emit();}};

  let releaseCombat: (() => void) | undefined;
  let cpuUpdate = 0,
    cpuNpcs = 0,
    cpuRender = 0,
    profile = { updateMs: 0, npcMs: 0, renderMs: 0 };
  let activeVehicleId:DrivingVehicleId="bao5",cannon:DrivingCannon|null=null,cannonShots=0;
  let driving: DrivingPhysics | null = null,
    driveMap: DriveMap | null = null,
    driveChallenge: DrivingChallenge | null = null,
    car: Awaited<ReturnType<typeof createVehicleVisual>> | null = null;
  const driveFire = new DrivingFireCoordinator(),
    respawnWait = new Map<number, number>(),
    lastSpawn = new Map<number, Vec3>();
  let preparation: AbortController | null = null,
    introCarReady = false;
  type PreparedMode = {
    vehicleId?:DrivingVehicleId;
    key: string;
    mode: Mode;
    roster: {
      mode: Mode;
      ids: NpcIdentityId[];
      seed: number;
    };
    mobile: boolean;
    weapons?: () => void;
    billboards?: () => void;
    views?: () => void;
    car?: Awaited<ReturnType<typeof createVehicleVisual>>;
    camera?: CameraVisual;
    storyWorld?: Awaited<ReturnType<typeof createStoryWorld>>;
  };
  let modePreparation: {
      key: string;
      controller: AbortController;
      work: Promise<void>;
    } | null = null,
    preparedMode: PreparedMode | null = null;
  let climaxTime = 0,
    previousStoryStep = "";
  let orbit = 0,
    orbitPitch = 0.28,
    physicsMs = 0,
    guidePlayed = "",
    impactShake = 0;
  let position = new THREE.Vector3(),
    yaw = 0,
    pitch = 0,
    velocityY = 0,
    grounded = false,
    crouched = false,
    aiming = false;
  let elapsed = 0,
    health = 100,
    smokes = 2,
    extraction = 0,
    hurt = 0,
    hit = 0,
    recoil = 0,
    stepClock = 0,
    notice = "",
    noticeLeft = 0,
    resultReason = "",
    goalAngle = 0,
    goalDistance = 0;
  let stamina = new Stamina(),
    selectedPrimary: PrimaryWeaponId = "m4a1",
    inventory: {
      pistol: Magazine;
      primary: Magazine | null;
    } = { pistol: new Magazine("glock"), primary: null },
    weapon: WeaponId = "glock",
    hitType: HitType | null = null,
    shotSerial = 0,
    playerReloadSerial = 0,
    playerReloadStage = 0;
  let npcs: NPC[] = [],
    clues: Pickup[] = [],
    supplies: Pickup[] = [],
    clouds: Cloud[] = [],
    sparks: Spark[] = [],
    gate: THREE.Group | null = null;
  let random = seeded(Date.now()),
    recoilRandom = seeded(17),
    adsBlend = 0,
    equipLeft = 0,
    nearWall = 0,
    scopeReady = true,
    bobTime = 0,
    smokeReady = 0,
    frameMoving = 0,
    lastSafe = new THREE.Vector3();
  let roundSeed = 0,
    roundRoster: NpcIdentityId[] = [],
    roundMobile = touch,
    pendingRoster: {
      mode: Mode;
      ids: NpcIdentityId[];
      seed: number;
    } | null = null,
    bossNoticed = false;
  const drops = new WeaponDrops(),
    dropVisuals = new Map<string, WorldWeapon>(),
    pickupLeases = new Map<WeaponId, () => void>();
  let pickupRequest = 0,
    pickupController: AbortController | null = null;
  const callouts: NPC[] = [];
  const escapeTactics = new EscapeTactics(),
    extractionDefense = new ExtractionDefense(),
    escapeContacts = new EscapeContacts();
  let escapeTacticalAgents: TacticalAgent[] = [],
    contactProbe = 0;
  let training:CombatTraining|null=null;
  let escapeRound: EscapeRound | null = null,
    escapePlan: EscapePlan | null = null,
    escapeMapOpen = false,
    escapeMapClosing = false,
    escapeSelectedDifficulty = escapeDifficulty(settings.escapeDifficulty),
    escapeFire = new EscapeFireCoordinator(escapeSelectedDifficulty);
  const escapeMovement = new EscapeMovement(),
    escapeRecovery = new EscapeHealthRecovery();
  let escapeMotion: EscapeMovementOutput | null = null,
    actualSpeed = 0,
    actualVelocity = new THREE.Vector3(),
    footstepSerial = 0,
    footstepPoint = new THREE.Vector3(),
    escapeRouteClock = 0,
    escapeRoute: THREE.Vector3[] = [],
    escapeCombatMusicLeft = 0;
  let lastEscapeSession: {
      seed: number;
      ids: NpcIdentityId[];
      difficulty: typeof escapeSelectedDifficulty;
      primary: PrimaryWeaponId;
      plan: EscapePlan;
    } | null = null,
    retryEscapePlan: EscapePlan | null = null,
    escapeBest: number | null = null,
    escapeBestBeforeResult: number | null = null;
  let escapeStairGuide: StairGuide | null = null;
  let best: number | null = null;
  try {
    const b = Number(localStorage.getItem("qisheng-game-best"));
    if (b > 0 && Number.isFinite(b)) best = b;
  } catch {
    /* Storage may be disabled in private browsers. */
  }
  const magazine = () =>
    weapon === "glock"
      ? inventory.pistol
      : (inventory.primary ?? inventory.pistol);
  const phaseActive = () => phase === "playing";
  let cursorBlocked: boolean | undefined;
  function syncObservationCursor(active = phaseActive(), force = false) {
    const snap = story?.snapshot;
    const blocked =
      !active ||
      (escapeMapOpen && !escapeMapClosing) ||
      storyOverlayOpen ||
      (mode === "story" &&
        !photo?.snapshot().open &&
        !!(
          snap?.introActive ||
          snap?.cinematicActive ||
          snap?.screeningActive ||
          snap?.dialogue ||
          snap?.options.length ||
          snap?.finished
        ));
    if (force || cursorBlocked !== blocked) {
      cursorBlocked = blocked;
      input.setCursorFree?.(blocked);
    }
  }
  function observe() {
    syncObservationCursor();
    if (
      !phaseActive() ||
      storyOverlayOpen ||
      cursorBlocked ||
      touchControls() ||
      mode === "dafei"
    )
      return;
    input.setCursorFree?.(false);
    canvas.focus({ preventScroll: true });
    const token = enterToken;
    void input
      .lock()
      .then(() => {
        if (!dead && token === enterToken && phaseActive()) emit();
      })
      .catch(() => {
        if (!dead && token === enterToken && phaseActive()) {
          info("点击画面继续观察，或在设置选择触屏操作。", 4);
          emit();
        }
      });
  }
  const clickToObserve = (e: MouseEvent) => {
    if (
      e.button === 0 &&
      e.target === canvas &&
      !photo?.snapshot().open &&
      document.pointerLockElement !== canvas
    )
      observe();
  };
  canvas.addEventListener("click", clickToObserve);
  const info = (text: string, duration = 3) => {
    notice = text;
    noticeLeft = duration;
  };
  const drivingSnapshot = () => {
    const state = driving?.read(),
      snap = driveChallenge?.snapshot(
        position.toArray(),
        yaw,
        state?.horizontalSpeed ?? 0,
        state,
      );
    return snap
      ? {
          ...snap,cannonAmmo:cannon?.ammo,cannonCooldown:cannon?.cooldown,
          areas: drivingAreaHints(
            driveMap?.npcRegions ?? [],
            position.toArray() as Vec3,
            yaw,
          ),
        }
      : undefined;
  };
  const snapshot = (): Snapshot => {
    const nearInteraction = escapeInteraction();
    return {
      gadgets:mode==='escape'?{...gadgetInventory,cardsLeft:Math.max(0,gadgetInventory.cardsUntil-elapsed),confiscating:cardsPursuit.windup>0,canUseCards:true,loot:gadgetLoot,projectiles:grenades}:undefined,
      ranking: ranked?.snapshot(),
      training:training?.read(),
      phase,
      mode,
      mouseLocked: document.pointerLockElement === canvas,
      progress,
      message,
      health,
      stamina:
        mode === "escape" ? (escapeMotion?.stamina ?? 100) : stamina.value,
      ammo: magazine().ammo,
      reserve: magazine().reserve,
      weapon,
      hasPrimary: !!inventory.primary,
      interaction: nearbyInteractionSummary(nearInteraction),
      interactionScreen: escapeInteractionScreen(nearInteraction),
      pickup: pickupSnapshot(nearInteraction),
      weaponAction: magazine().action,
      smokes,
      remaining: Math.max(
        0,
        (mode === "dafei"
          ? DRIVE_RULES.round
          : mode === "escape"
            ? ESCAPE_DIFFICULTIES[escapeSelectedDifficulty].round
            : RULES.round) - elapsed,
      ),
      elapsed,
      grace: mode !== "roam" ? Math.max(0, RULES.grace - elapsed) : 0,
      clues:
        mode === "escape"
          ? (escapeRound?.completed ?? 0)
          : clues.filter((c) => c.collected).length,
      goalName:
        goal()?.point.label ??
        (mode === "roam"
          ? "自由探索"
          : mode === "dafei"
            ? "驾驶挑战"
            : "返回校门撤离"),
      goalDistance,
      goalAngle,
      extraction,
      running: mode === "escape" ? !!escapeMotion?.sprinting : stamina.running,
      sprintIntent: input.getSprintIntent(),
      weaponSpread: playerWeaponSpread(weapon,{aim:aiming,actualSpeed,sliding:!!escapeMotion?.sliding}),
      crouching: crouched,
      aiming,
      reloading: magazine().reloadLeft > 0,
      hit,
      hitType: hit > 0 ? hitType : null,
      incoming: directions.read(camera.position, yaw + kick.yaw),
      hurt,
      fps,
      quality,
      musicError: audio.error,
      best,
      resultReason,
      notice,
      buffering,
      bufferingVisible,
      mapError,
      mapProgress,
      story: narrativeSnapshot(),
      fastWalking: storyFastWalk,
      reality: realityMatch,
      photo: photo?.snapshot(),
      latestPhoto,
      temporaryPhotos,
      storyMusicError: storyAudio.error,
      realityHints: !!settings.realityHints,
      photoGuides: photographyMarkers?.read(),
      driving: drivingSnapshot(),
      escape: escapeSnapshot(nearInteraction),
    };
  };
  const emit = () => {
    syncObservationCursor();
    if (!dead) publish(snapshot());
  };
  function rankEvent(
    type: RankingEvent["type"],
    data: Record<string, unknown>,
    time = elapsed,
  ) {
    training?.record(type,data);
    ranked?.append(time, type, data);
  }
  function rankSpawn(n: NPC, initial = false) {
    const generation = initial ? 0 : (rankGeneration.get(n.id) ?? -1) + 1;
    rankGeneration.set(n.id, generation);
    rankEvent("npc-spawn", {
      npcId: n.id,
      generation,
      identity: n.identity,
      position: n.position.toArray(),
    });
  }
  async function prepareRankedRound(token: number, signal: AbortSignal) {
    if(training)return;
    if (mode !== "escape" && mode !== "dafei") return;
    input.resetControlMethod?.();
    const recorder = new RankingRecorder(() => {
      if (!dead && token === enterToken && ranked === recorder) emit();
    });
    ranked = recorder;
    await recorder.begin(
      {
        mode,
        ...(mode==="dafei"?{vehicleId:activeVehicleId}:{}),
        difficulty: mode === "escape" ? escapeSelectedDifficulty : undefined,
        ruleVersion: rankingRuleVersion(mode),
        seed: roundSeed,
        weapon: mode === "escape" ? selectedPrimary : "vehicle",
        roster: [...roundRoster],
        tasks:
          mode === "escape" && escapePlan
            ? structuredClone(escapePlan.tasks)
            : [],
        controls: touchControls() ? "touch" : "keyboard",
        transmission:
          mode === "dafei" ? (activeVehicleId==="bao5"?(settings.transmission ?? "auto"):"auto") : undefined,
      },
      signal,
    );
    if (dead || token !== enterToken || signal.aborted || ranked !== recorder) {
      recorder.cancel();
      return;
    }
    for (const n of npcs)
      if (mode === "dafei" || n.escapeActive) rankSpawn(n, true);
    if (recorder.snapshot().eligible) info("本局参与排行。", 2);
    else if (rankingClient.getPlayer()) info(recorder.snapshot().message, 3);
  }
  function applyQuality() {
    const profile=renderProfile();
    low=profile.low;adaptiveRatio=profile.pixelRatio;
    applyRendererProfile(renderer,sun.shadow,profile);
    renderer.shadowMap.needsUpdate = true;
    shadowRevision = -1;
    const narrative = mode === "story" && !!story;
    camera.far = narrative ? 360 : low ? 85 : 110;
    camera.updateProjectionMatrix();
    scene.fog = narrative
      ? new THREE.Fog(scene.background as THREE.Color, 100, 330)
      : new THREE.Fog(0xccdce3, low ? 35 : 50, low ? 72 : 98);
    weatherScene.set({preset:settings.weather??'clear',seed:roundSeed>>>0,startedAtTick:0},low,mode!=='story');
    photo?.setPreviewQuality(settings.quality, adaptiveRatio);
    photo?.setPreviewMobile(profile.previewMobile);
    quality = profile.label;
  }
  async function refreshQualityTextures(){
    qualityTextureLoad?.abort();
    const mobile=renderProfile().mobileTextures;
    if(!npcs.length||mobile===roundMobile)return;
    const controller=new AbortController(),token=enterToken;qualityTextureLoad=controller;
    let release:(()=>void)|undefined;
    try{
      release=await prepareBillboards(roundRoster,()=>{},mobile,controller.signal);
      if(dead||controller.signal.aborted||token!==enterToken){release();return;}
      const replacements:ReturnType<typeof createCharacter>[]=[];
      try{for(const n of npcs){const rig=createCharacter(n.identity,mobile);replacements.push(rig);rig.setWeapon(n.gun.id);rig.root.position.copy(n.rig.root.position);rig.root.quaternion.copy(n.rig.root.quaternion);rig.root.scale.copy(n.rig.root.scale);rig.root.visible=n.rig.root.visible;}}catch(error){replacements.forEach(rig=>rig.dispose());throw error;}
      npcs.forEach((n,index)=>{n.rig.root.removeFromParent();n.rig.dispose();n.rig=replacements[index];scene.add(n.rig.root);});
      releaseBillboards?.();releaseBillboards=release;release=undefined;roundMobile=mobile;
    }catch{release?.();if(!dead&&!controller.signal.aborted&&token===enterToken)info('高清人物暂未载入，当前画面仍可继续游玩。',4);}
    finally{if(qualityTextureLoad===controller)qualityTextureLoad=undefined;}
  }
  const resize = () => {
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    viewCamera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewCamera.updateProjectionMatrix();
    if (phase !== "playing") render(0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  applyQuality();
  function visibility() {
    if (document.hidden) pause();
    else if (phase === "intro") {
      last = performance.now();
      schedule();
    }
  }
  function contextLost(e: Event) {
    e.preventDefault();
    graphicsLost = true;
    enterToken++;
    cancelPreparation();
    pause();
    message = "图形资源被浏览器回收，可以重新载入校园。";
    phase = "error";
    emit();
  }
  function contextRestored() {
    graphicsLost = false;
    applyQuality();
    message = "图形资源已恢复，请重新载入校园后继续。";
    emit();
  }
  function orientation() {
    if (touchControls() && innerHeight > innerWidth && !escapeMapOpen) pause();
  }
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  window.addEventListener("orientationchange", orientation);
  // The menu is usable before any map bytes are requested.
  phase = "menu";
  progress = 100;
  message = "";
  resize();
  emit();
  async function ensureWorld(
    token: number,
    signal: AbortSignal,
    onProgress?: (p: number, message: string) => void,
  ) {
    if (world) return;
    // A cancelled load must release physics and scene before the next one begins.
    if (worldLoad) await worldLoad.catch(() => {});
    if (dead || token !== enterToken || signal.aborted)
      throw new DOMException("Cancelled", "AbortError");
    if (world) return;
    const pending = loadWorld(
      scene,
      (p, msg) => {
        if (!dead && token === enterToken && !signal.aborted) {
          if (onProgress) onProgress(p, msg);
          else {
            progress = Math.round(p * 75);
            message = msg;
            emit();
          }
        }
      },
      signal,
      {renderer,camera},
    ).then((loaded) => {
      if (dead || token !== enterToken || signal.aborted || graphicsLost) {
        loaded.dispose();
        throw new DOMException("Cancelled", "AbortError");
      }
      world = loaded;
      position.fromArray(world.manifest.spawn);
      lastSafe.copy(position);
      yaw = world.manifest.spawnYaw;
      camera.position.copy(position).add(new THREE.Vector3(0, RULES.eye, 0));
      camera.rotation.set(0, yaw, 0);
      photographyMarkers = new PhotographyMarkers(
        scene,
        (p, h) => world.supportAt(p, h),
        emit,
      );
    });
    worldLoad = pending;
    try {
      await pending;
    } finally {
      if (worldLoad === pending) worldLoad = null;
    }
  }
  function escapeInteraction() {
    if (mode !== "escape" || !escapeRound || !world || !phaseActive())
      return null;
    const snap = escapeRound.snapshot();
    return nearbyEscapeInteraction({
      position: position.toArray() as Vec3,
      tasks: snap.tasks,
      extraction: snap.extractionPosition
        ? {
            available: snap.extractionAvailable,
            started: snap.phase !== "active",
            position: snap.extractionPosition,
          }
        : undefined,
      drops: drops.all().map((d) => ({
        id: d.id,
        weapon: d.weapon,
        position: d.position,
        ammo: d.gun.ammo,
        reserve: d.gun.reserve,
      })),
      supplies: supplies.map((s) => ({
        id: s.point.id,
        position: s.point.position,
        used: s.collected,
      })),
      guns: [inventory.pistol, inventory.primary]
        .filter((g): g is Magazine => !!g)
        .map((g) => ({
          id: g.id,
          ammo: g.ammo,
          ready: g.action.ready,
          reserve: g.reserve,
          maxReserve: WEAPONS[g.id].reserve * 2,
        })),
      health,
      smokes,
      gadgets:gadgetLoot.filter(g=>!g.usedBy.includes("local")).map(g=>({...g,available:canCollectGadget(gadgetInventory,g.kind)})),
      canReach: (point, range) =>
        pickupReachable(
          position,
          camera.position,
          v(point),
          range,
          world.rayDistance,
        ),
      taskRange: ESCAPE_RULES.interactionRadius,
      extractionRange: ESCAPE_RULES.extractRadius,
    });
  }
  function escapeInteractionScreen(interaction = escapeInteraction()) {
    return interaction
      ? projectNearbyInteraction(interaction.position, camera)
      : null;
  }
  function escapeSnapshot(interaction = escapeInteraction()) {
    if (mode !== "escape" || !escapeRound) return;
    const snap = escapeRound.snapshot(),
      interactionAvailable =
        interaction?.kind === "task" && interaction.available;
    return {
      ...snap,
      interactionAvailable,
      mapOpen: escapeMapOpen,
      playerPosition: position.toArray() as Vec3,
      playerYaw: yaw,
      playerFloor: escapeFloor(position),
      mapFloor: escapeFloor(position),
      mapFloors: [0, ...(world.manifest.floors ?? []).map((f) => f.id)],
      enemyContacts: escapeContacts
        .read(elapsed)
        .map((c) => ({ ...c, floor: escapeFloor(v(c.position)) })),
      supplies: supplies.map((p) => ({
        id: p.point.id,
        name: p.point.label,
        position: p.point.position,
        floor: escapeFloor(v(p.point.position)),
        used: p.collected,
      })),
      best: escapeBest,
      bestBeforeResult: escapeBestBeforeResult,
      stairGuide: escapeStairGuide,
    };
  }
  function escapeFloor(point: THREE.Vector3): number {
    return escapeFloorAt(point.toArray() as Vec3, world.manifest.floors);
  }
  function escapeTarget() {
    const snap = escapeRound?.snapshot(),
      task =
        snap?.tasks.find((t) => t.selected && t.state !== "complete") ??
        snap?.tasks.find((t) => t.state !== "complete");
    if (!task) return escapePlan?.extraction ?? null;
    return task.kind === "deliver"
      ? task.task.sites[task.carrying ? 1 : 0]
      : task.kind === "activate"
        ? (task.task.sites.find((p) => !task.visited.includes(p.id)) ??
          task.task.sites[0])
        : task.task.sites[0];
  }
  function goal() {
    if (mode !== "escape") return null;
    const target = escapeTarget();
    return target
      ? {
          point: {
            id: target.id,
            label: target.label,
            position: target.position,
          },
          mesh: { position: v(target.position) },
        }
      : null;
  }
  function updateGoal() {
    const pending = goal(),
      target = pending ? pending.mesh.position : v(world.manifest.extraction);
    if (mode === "escape" && escapeRound) {
      escapeRouteClock -= 1 / 60;
      if (escapeRouteClock <= 0) {
        escapeRouteClock = 0.5;
        escapeRoute = world.path(position, target);
        escapeStairGuide = stairGuideForRoute(position.toArray() as Vec3,escapeRoute.map(p=>p.toArray() as Vec3),world.manifest.stairRoutes,escapeFloor(position),escapeFloor(target));
      }
      while (escapeRoute.length && escapeRoute[0].distanceTo(position) < 0.28)
        escapeRoute.shift();
      const next = escapeRoute[0] ?? target,
        delta = next.clone().sub(position);
      goalDistance = escapeRoute.length
        ? position.distanceTo(next) +
          escapeRoute
            .slice(1)
            .reduce((sum, p, i) => sum + p.distanceTo(escapeRoute[i]), 0)
        : position.distanceTo(target);
      goalAngle = wrapAngle(Math.atan2(delta.x, -delta.z) + yaw);
    } else {
      const delta = target.clone().sub(position);
      goalDistance = delta.length();
      goalAngle = wrapAngle(Math.atan2(delta.x, -delta.z) + yaw);
    }
    return pending;
  }
  function escapeSiteSafe(site: EscapeSite) {
    const p = v(site.position),
      support = world.supportAt(p, ESCAPE_RULES.npcHeight);
    return (
      !!support?.clear &&
      support.normalY > 0.7 &&
      Math.abs(support.height - p.y) < 0.18
    );
  }
  function escapeRouteValid(from: Vec3, to: Vec3) {
    const a = v(from),
      b = v(to),
      points = world.storyPath(a, b);
    return {
      complete:
        points.length > 0 &&
        points.at(-1)!.distanceTo(b) < 0.85 &&
        Math.abs(points.at(-1)!.y - b.y) < 0.35,
      length: points.length
        ? a.distanceTo(points[0]) +
          points
            .slice(1)
            .reduce((sum, p, i) => sum + p.distanceTo(points[i]), 0)
        : Infinity,
      points: points.map((p) => p.toArray() as Vec3),
    };
  }
  async function taskMap(open: boolean) {
    if (
      mode !== "escape" ||
      !escapeRound ||
      !phaseActive() ||
      escapeMapClosing ||
      open === escapeMapOpen
    )
      return;
    input.reset();
    aiming = false;
    escapeFire.reset();
    for (const n of npcs) n.escapeAttack?.cancel();
    accumulator = 0;
    if (open) {
      escapeMapOpen = true;
      training?.map(true);
      input.setEnabled(false);
      audio.update(0, true);
      input.freePointerLock?.();
      emit();
      render(0);
    } else {
      const token = enterToken;
      escapeMapClosing = true;
      if (touchControls() && innerHeight > innerWidth) {
        escapeMapOpen = false;
        escapeMapClosing = false;
        pause();
        return;
      }
      syncObservationCursor(true, true);
      try {
        await input.lock();
      } catch {
        if (
          !dead &&
          token === enterToken &&
          mode === "escape" &&
          phaseActive() &&
          escapeMapOpen
        ) {
          escapeMapClosing = false;
          syncObservationCursor(true, true);
          info("点击关闭地图继续观察。");
          emit();
        }
        return;
      }
      if (
        dead ||
        token !== enterToken ||
        mode !== "escape" ||
        !phaseActive() ||
        !escapeMapOpen
      )
        return;
      escapeMapClosing = false;
      escapeMapOpen = false;
      training?.map(false);
      escapeMapClosing = false;
      input.setEnabled(true);
      last = performance.now();
      emit();
      schedule();
    }
  }
  function selectEscapeTask(id: string) {
    escapeRound?.selectTask(id);
    escapeRouteClock = 0;
    updateGoal();
    emit();
  }
  function nextEscapeTask() {
    const tasks =
      escapeRound?.snapshot().tasks.filter((t) => t.state !== "complete") ?? [];
    if (!tasks.length) return;
    const at = tasks.findIndex((t) => t.selected);
    selectEscapeTask(tasks[(at + 1) % tasks.length].id);
  }
  function resetTransient(preserveAudioGesture = false) {
    qualityTextureLoad?.abort();qualityTextureLoad=undefined;
    ranked?.cancel();
    ranked = null;
    rankGeneration.clear();
    clearDrops();
    escapeTactics.reset();
    extractionDefense.reset();
    escapeContacts.reset();
    escapeTacticalAgents = [];
    contactProbe = 0;
    escapeRound = null;
    training = null;
    escapePlan = null;
    escapeMapOpen = false;
    escapeMapClosing = false;
    escapeFire.reset();
    escapeMovement.reset();
    escapeRecovery.reset();
    escapeMotion = null;
    escapeRoute = [];
    actualSpeed = 0;
    escapeCombatMusicLeft = 0;
    storyGesturePrimed = false;
    latestPhoto = undefined;
    temporaryPhotos = [];
    photographyMarkers?.reset();
    releaseOpening?.();
    releaseOpening = undefined;
    releaseCombat?.();
    releaseCombat=undefined;
    frameDiagnostics.reset();
    openingLanding = null;
    storyOverlays.clear();
    realityRequest++;
    realityMatch = undefined;
    input.setSuspended(false);
    storyFastWalk = false;
    guidePath = [];
    guideStep = "";
    routeClock = 0;
    bufferingVisible = false;
    photoSerial++;
    photo?.close();
    world?.setPhotoView(null);
    input.setPhotography(false);
    storyWorld?.dispose();
    storyWorld = null;
    story = null;
    storyOverlayOpen = false;
    climaxTime = 0;
    previousStoryStep = "";
    storyAudio.reset(preserveAudioGesture);
    heldCamera?.dispose();
    heldCamera = null;
    for (const url of shotUrls) URL.revokeObjectURL(url);
    shotUrls.clear();
    shotUrlById.clear();
    scene.background = new THREE.Color(0xccdce3);
    sun.color.set(0xffefcf);
    sun.intensity = 2.7;
    applyQuality();
    cannon?.dispose();cannon=null;cannonShots=0;
    driving?.dispose();
    driving = null;
    car?.dispose();
    car = null;
    introCarReady = false;
    driveFire.reset();
    respawnWait.clear();
    lastSpawn.clear();
    driveChallenge = null;
    guidePlayed = "";
    effects.reset();
    gadgetScene.clear();gadgetLoot=[];grenades=[];cardsPursuit.clear();
    directions.reset();
    for (const p of [...clues, ...supplies]) {
      p.mesh.userData.labelTexture?.dispose();
      disposeObject(p.mesh);
    }
    if (gate) disposeObject(gate);
    for (const c of clouds) disposeObject(c.mesh);
    for (const s of sparks) disposeObject(s.mesh);
    for (const n of npcs) {
      n.rig.root.removeFromParent();
      n.rig.dispose();
    }
    world?.resetActors();
    releaseBillboards?.();
    releaseBillboards = undefined;
    viewWeapon?.root.removeFromParent();
    viewWeapon?.dispose();
    viewWeapon = null;
    releaseWeapons?.();
    releaseWeapons = undefined;
    callouts.length = 0;
    bossNoticed = false;
    clues = [];
    supplies = [];
    npcs = [];
    clouds = [];
    sparks = [];
    gate = null;
  }
  function marker(point: Point, kind: "clue" | "supply" | "exit") {
    const g = new THREE.Group();
    g.position.fromArray(point.position);
    const color =
      kind === "clue" ? 0xc3a778 : kind === "supply" ? 0x557d73 : 0x8b4540;
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.64,
      metalness: 0.15,
    });
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(kind === "exit" ? 3.7 : 0.75, 0.04, 6, 48),
      mat,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    g.add(ring);
    if (kind !== "exit") {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, kind === "clue" ? 0.08 : 0.28, 0.35),
        mat,
      );
      box.position.y = 0.7;
      box.rotation.z = 0.1;
      g.add(box);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.09, 0.36),
        new THREE.MeshStandardMaterial({ color: 0xece7d9 }),
      );
      stripe.position.set(0, 0.7, 0);
      g.add(stripe);
    }
    scene.add(g);
    return g;
  }
  function shuffleEscapeRoster(seed: number) {
    const ids = orderedEscapeRoster(seeded(seed ^ 0x51a743));
    return ids;
  }
  let escapeEntries: EscapeSite[] = [];
  function initialEscapeEntry(slot: number) {
    if (slot === 0) {
      escapeEntries = [];
      const candidates = VALIDATED_ESCAPE_RESPAWN_SITES.filter(
        (site) =>
          v(site.position).distanceTo(position) >= 35 && escapeSiteSafe(site),
      );
      for (let i = 0; i < NPC_IDS.length; i++) {
        const chosen = candidates
          .filter((p) => !escapeEntries.includes(p))
          .sort((a, b) => {
            const score = (s: EscapeSite) =>
              Math.min(
                ...escapeEntries.map((e) =>
                  v(e.position).distanceTo(v(s.position)),
                ),
                85,
              ) +
              seeded(roundSeed ^ (i + 1) ^ s.id.length)() * 0.1;
            return score(b) - score(a);
          })[0];
        if (!chosen) throw Error("敌人入场位置尚未准备好。");
        escapeEntries.push(chosen);
      }
    }
    return v(escapeEntries[slot].position);
  }
  function escapeMarker(task: EscapeTask, site: EscapeSite) {
    const g = new THREE.Group();
    g.position.fromArray(site.position);
    const colors = {
        take: 0xd0ad69,
        activate: 0x679bb6,
        hold: 0xb75d53,
        deliver: 0x82996a,
      },
      color = colors[task.kind],
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.25,
      });
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, task.kind === "activate" ? 1 : 0.5, 0.5),
      mat,
    );
    box.position.y = task.kind === "activate" ? 0.5 : 0.25;
    g.add(box);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffefd0 }),
    );
    lamp.position.y = task.kind === "activate" ? 1.08 : 0.65;
    g.add(lamp);
    if (task.kind === "activate" || task.kind === "hold") {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.024, 1.1, 6),
        mat,
      );
      mast.position.set(-0.25, 0.65, 0);
      g.add(mast);
    }
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(
        task.kind === "hold" ? task.radius : 1.1,
        0.028,
        5,
        40,
      ),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.65 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.055;
    g.add(ring);
    const label = document.createElement("canvas");
    label.width = 384;
    label.height = 88;
    const ctx = label.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "rgba(25,35,38,.82)";
      ctx.fillRect(0, 0, 384, 88);
      ctx.font = "28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff9e9";
      ctx.fillText(
        { take: "夺取", activate: "启动", hold: "守点", deliver: "送达" }[
          task.kind
        ] +
          " · " +
          site.label,
        192,
        53,
      );
      const texture = new THREE.CanvasTexture(label),
        sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: texture,
            depthTest: true,
            transparent: true,
          }),
        );
      sprite.position.y = 1.65;
      sprite.scale.set(2.9, 0.665, 1);
      g.add(sprite);
      g.userData.labelTexture = texture;
    }
    g.userData.taskId = task.id;
    g.userData.siteId = site.id;
    scene.add(g);
    return g;
  }
  function investigateEscape(
    point: THREE.Vector3,
    radius: number,
    memory: number,
  ) {
    for (const n of npcs) {
      if (
        !n.escapeActive ||
        n.disabled > 0 ||
        n.sees ||
        n.position.distanceTo(point) > radius ||
        Math.abs(n.position.y - point.y) > 2.2
      )
        continue;
      const ear = n.position.clone().add(new THREE.Vector3(0, 1.1, 0)),
        source = point.clone().add(new THREE.Vector3(0, 0.6, 0));
      if (!visible(ear, source)) continue;
      n.lastKnown = point.clone();
      n.memory = memory;
      n.alert = true;
      n.repath = 0;
    }
  }
  function downEscape(n: NPC, headshot: boolean, grenade=false) {
    if (!n.escapeActive) return;
    escapeTactics.release(n.id);
    escapeContacts.remove(n.id);
    n.tacticalDecision = undefined;
    n.tacticalSeen = false;
    dropGun(n.gun, n.position);
    rankEvent("down", {
      npcId: n.id,
      generation: rankGeneration.get(n.id) ?? 0,
      identity: n.identity,
      headshot,
      ...(grenade?{source:"grenade"}:{}),
    });
    escapeRound?.recordDown(n.identity, headshot);
    n.escapeActive = false;
    n.disabled = 0.8;
    n.reenterAt =
      elapsed + ESCAPE_DIFFICULTIES[escapeSelectedDifficulty].respawn;
    n.respawnProbe = 0;
    n.sees = false;
    n.alert = false;
    n.path = [];
    n.escapeAttack?.reset();
    escapeFire.release(n.id);
    world.removeActor(n.id);
    n.skill?.interrupt();
    n.team.clear();
  }
  function entryEscape(n: NPC, site: EscapeSite) {
    escapeTactics.release(n.id);
    escapeContacts.remove(n.id);
    n.tacticalDecision = undefined;
    n.tacticalSeen = false;
    n.position.fromArray(site.position);
    n.previous.copy(n.position);
    n.lastEntry = site.id;
    n.escapeActive = true;
    n.reenterAt = Infinity;
    n.disabled = 0;
    n.actualSpeed = 0;
    n.movingAccuracy.reset();
    n.suppression = 0;
    n.fire = 0;
    n.hit = 0;
    n.step = 0;
    n.stuck = 0;
    n.sense = 0;
    n.heardStep = footstepSerial;
    n.memory = 0;
    n.lastKnown = null;
    n.sees = false;
    n.alert = false;
    n.path = [];
    n.reaction = 0.8;
    n.repath = 0;
    n.skill?.recover();
    n.team.clear();
    n.escapeAttack?.reset();
    n.gun = new Magazine(NPC_IDENTITY[n.identity].weapon);
    n.reloadSerial = n.reloadStage = 0;
    n.rig.root.quaternion.identity();
    n.rig.root.position.copy(n.position);
    n.rig.root.visible = true;
    rankSpawn(n);
  }
  function attemptEscapeEntry(n: NPC, dt: number) {
    if (elapsed < (n.reenterAt ?? Infinity)) return;
    n.respawnProbe = Math.max(0, (n.respawnProbe ?? 0) - dt);
    if (n.respawnProbe > 0) return;
    n.respawnProbe = 0.5;
    const points =
        escapePlan?.tasks.flatMap((t) => t.sites.map((s) => s.position)) ?? [],
      protectedPoints = [
        ...points,
        ...world.manifest.supplies.map((s) => s.position),
        world.manifest.extraction,
      ];
    const site = selectEscapeRespawn({
      candidates: VALIDATED_ESCAPE_RESPAWN_SITES,
      player: position.toArray() as Vec3,
      lastSiteId: n.lastEntry,
      protectedPoints,
      isVisible: (p) => {
        const q = v(p)
          .add(new THREE.Vector3(0, 1, 0))
          .project(camera);
        return (
          q.z > -1 && q.z < 1 && Math.abs(q.x) < 1.1 && Math.abs(q.y) < 1.1
        );
      },
      validateSite: (p) =>
        escapeSiteSafe(p) &&
        !npcs.some(
          (other) =>
            other !== n &&
            other.escapeActive &&
            other.position.distanceTo(v(p.position)) < 1,
        ),
      validateRoute: escapeRouteValid,
      random,
    });
    if (site) entryEscape(n, site);
  }
  function escapeThreat(site: EscapeSite, radius: number) {
    const p = v(site.position);
    return npcs.some((n) => {
      if (
        !n.escapeActive ||
        n.disabled > 0 ||
        Math.abs(n.position.y - p.y) > 0.65 ||
        n.position.distanceTo(p) > radius
      )
        return false;
      const path = world.path(n.position, p);
      return (
        path.length > 0 &&
        path.at(-1)!.distanceTo(p) < 0.9 &&
        n.position.distanceTo(path[0]) +
          path.slice(1).reduce((sum, q, i) => sum + q.distanceTo(path[i]), 0) <=
          radius + 1.5
      );
    });
  }
  function updateEscapeTasks(dt: number, interactPressed: boolean) {
    if (!escapeRound || !escapePlan) return;
    const interaction = escapeInteraction();
    if (interactPressed && interaction) {
      if (!interaction.available)
        info(
          interaction.kind === 'gadget'?'已携带上限。':interaction.kind === "supply" ? "补给已满。" : "备用弹药已满。",
          1.8,
        );
      else if (interaction.kind === "weapon") {
        const drop = drops.get(interaction.id);
        if (drop) void takeWeapon(drop);
      } else if (interaction.kind==='gadget') {
        const item=gadgetLoot.find(g=>g.id===interaction.id);if(item&&collectGadget(gadgetInventory,item.kind)){item.usedBy.push('local');rankEvent('gadget',{action:'pickup',kind:item.kind,id:item.id});audio.cue('pickup');info(({helmet:'已装备头盔。',grenade:'手榴弹已拾取。',cards:'扑克牌已拾取。'})[item.kind],2);}
      } else if (interaction.kind === "supply") interact(interaction.id);
    }
    const events = escapeRound.update(training ? 0 : dt, {
      position: position.toArray() as Vec3,
      interactPressed:
        interactPressed &&
        interaction?.kind === "task" &&
        interaction.available,
      canInteract: (site) =>
        (!interactPressed ||
          (interaction?.action === "extract"
            ? site === escapePlan!.extraction
            : site.id === interaction?.siteId)) &&
        pickupReachable(
          position,
          camera.position,
          v(site.position),
          ESCAPE_RULES.interactionRadius +
            (site === escapePlan!.extraction ? 2.1 : 0),
          world.rayDistance,
        ),
      contested: (task) => escapeThreat(task.sites[0], task.radius),
      extractionClear: !escapeThreat(escapePlan.extraction, 6),
    });
    if(!training)elapsed = escapeRound.elapsed;
    extraction = escapeRound.extractionProgress;
    for (const event of events) {
      if (event.type === "ammo-reward") {
        for (const gun of [inventory.pistol, inventory.primary])
          if (gun)
            gun.reserve +=
              gun.id === "r870"
                ? event.shotgunShells
                : WEAPONS[gun.id].capacity;
        audio.cue("pickup");
        info("任务完成，备用弹药已补充。", 2);
      } else if (event.type === "investigation") {
        investigateEscape(v(event.position), 28, 4);
        audio.cue("pickup");
      } else if (event.type === "reinforcements") {
        for (const n of npcs.slice(6)) {
          n.reenterAt = elapsed;
          n.respawnProbe = 0;
        }
        info("三名增援加入追逐。", 2.5);
      } else if (event.type === "extraction-available") {
        if (gate) gate.visible = true;
        info("校门已开放，返回撤离点。", 3);
      } else if (event.type === "won") finish(true, "行动完成，成功撤离。");
      else if (event.type === "failed")
        finish(
          false,
          event.reason === "time" ? "行动时间已结束。" : "生命耗尽，行动失败。",
        );
    }
    const states = escapeRound.snapshot().tasks;
    for (const c of clues) {
      const task = states.find((t) => t.id === c.mesh.userData.taskId);
      c.collected =
        task?.state === "complete" ||
        !!task?.visited.includes(c.mesh.userData.siteId) ||
        (task?.kind === "deliver" &&
          task.carrying &&
          task.task.sites[0].id === c.mesh.userData.siteId);
      c.mesh.visible =
        !c.collected && c.mesh.position.distanceTo(position) < 85;
    }
    updateGoal();
    escapeCombatMusicLeft = Math.max(0, escapeCombatMusicLeft - dt);
    if (
      npcs.some(
        (n) => n.escapeActive && n.sees && n.escapeAttack?.phase === "fire",
      )
    )
      escapeCombatMusicLeft = 5;
    audio.setEscapeMusic(
      settings.escapeMusic ?? "battle",
      escapeRound.extractionAvailable
        ? "extraction"
        : escapeCombatMusicLeft > 0
          ? "combat"
          : "search",
    );
    health = escapeRecovery.update(dt, health);
  }
  function tacticalGeometryVisible(a: Vec3, b: Vec3) {
    const origin = v(a),
      direction = v(b).sub(origin),
      length = direction.length();
    return (
      length < 0.01 ||
      world.rayDistance(origin, direction.divideScalar(length), length) >
        length - 0.12
    );
  }
  function escapeAtPhysicalCover(n: NPC) {
    const known = n.team.target && !n.sees ? v(n.team.target) : n.lastKnown;
    return (
      !!known &&
      physicalCoverAt(
        n.position.toArray() as Vec3,
        known.toArray() as Vec3,
        tacticalGeometryVisible,
      )
    );
  }
  function escapeRigState(n: NPC, speed = 0) {
    const attack = n.escapeAttack!,
      posePhase =
        n.gun.ammo === 0 && n.gun.reloadLeft === 0 && n.fire <= 0
          ? "search"
          : n.gun.reloadLeft > 0 && n.tacticalDecision?.moving
            ? "search"
            : attack.phase;
    return {
      skill: n.identity === "meng" && cardsPursuit.windup > 0 ? "callout" : n.skill?.busy ? n.skill.kind : undefined,
      speed,
      aim:
        !(n.identity === "meng" && cardsPursuit.windup > 0) &&
        !n.skill?.busy &&
        n.gun.ammo > 0 &&
        n.gun.reloadLeft === 0 &&
        (attack.phase === "aim" || attack.phase === "fire"),
      firing: n.fire > 0,
      reloading: n.gun.reloadLeft > 0,
      suppressed: 0,
      hit: n.hit,
      attackPhase: posePhase,
      aimTarget: n.sees ? npcTarget() : undefined,
      reloadProgress: n.gun.reloadProgress,
      shotSerial: n.shotSerial,
      action: n.gun.action,
    };
  }
  function updateEscapeNPC(n: NPC, dt: number) {
    if (!n.escapeActive) {
      if (n.disabled > 0) {
        n.disabled = Math.max(0, n.disabled - dt);
        n.rig.update(
          dt,
          {
            speed: 0,
            aim: false,
            firing: false,
            reloading: false,
            suppressed: 1,
            hit: n.hit,
            attackPhase: "suppressed",
          },
          n.position.distanceTo(position),
          camera,
        );
        n.rig.root.visible = n.disabled > 0;
      } else n.rig.root.visible = false;
      attemptEscapeEntry(n, dt);
      return;
    }
    n.gun.update(dt);
    n.fire = Math.max(0, n.fire - dt);
    n.hit = Math.max(0, n.hit - dt);
    n.reaction = Math.max(0, n.reaction - dt);
    if (elapsed < ESCAPE_RULES.grace) {
      n.position.copy(
        world.moveActor(n.id, n.position, new THREE.Vector3(), dt),
      );
      n.rig.root.position.copy(n.position);
      n.rig.update(
        dt,
        escapeRigState(n),
        n.position.distanceTo(position),
        camera,
      );
      return;
    }
    const dist = n.position.distanceTo(position),
      frame = escapeTacticalAgents.find((a) => a.id === n.id);
    if (frame && !n.skill?.busy && !profileNavigationOff) {
      const decision = escapeTactics.decide(
        {
          ...frame,
          position: n.position.toArray() as Vec3,
          reloading: n.gun.reloadLeft > 0,
          needsReload: n.gun.ammo === 0 && n.gun.reserve > 0,
        },
        {
          project: (p) => {
            const q = world.nearest(v(p)),
              support = world.supportAt(q, ESCAPE_RULES.npcHeight);
            if (
              !support?.clear ||
              support.normalY < 0.94 ||
              Math.abs(support.height - q.y) > 0.18
            )
              return null;
            q.y = support.height;
            return q.toArray() as Vec3;
          },
          route: (a, b) =>
            world
              .actorPath(n.id, v(a), v(b), false)
              .map((p) => p.toArray() as Vec3),
          safe: (points) =>
            world.npcRouteSafe(
              points.map(v),
              points
                .slice(1)
                .reduce(
                  (length, p, i) => length + v(p).distanceTo(v(points[i])),
                  0,
                ) + 0.05,
            ),
          visible: (a, b) => npcVisible(v(a), v(b)),
          geometryVisible: tacticalGeometryVisible,
          obstacle: (a,b) => {const origin=v(a),delta=v(b).sub(origin),length=delta.length();if(length<.01)return null;delta.divideScalar(length);const hit=world.rayDistance(origin,delta,length);return hit<length-.12?origin.addScaledVector(delta,hit).toArray() as Vec3:null;},
        },
        escapeTacticalAgents,
      );
      const target = v(decision.goal),
        changed =
          !n.tacticalDecision ||
          n.tacticalDecision.state !== decision.state ||
          n.tacticalDecision.moving !== decision.moving ||
          n.destination.distanceToSquared(target) > 0.8;
      n.tacticalDecision = decision;
      if (changed || n.repath <= 0) {
        n.repath = 0.65 + n.id * 0.08;
        n.destination.copy(target);
        n.path = decision.moving
          ? world.actorPath(n.id, n.position, target)
          : [];
      }
    }
    let speed = n.identity==='meng'&&cardsPursuit.windup>0?0:n.skill?.busy
      ? n.skill.kind === "sprint" && n.skill.phase === "active"
        ? 7.2
        : 0
      : n.tacticalDecision?.moving === false
        ? 0
        : n.alert
          ? NPC_COMBAT_PROFILES[escapeSelectedDifficulty].runSpeed
          : 2.1;
    if (!n.path.length) speed = 0;
    const moved =
        speed > 0
          ? pathMotion(n.position, n.path, speed, dt)
          : new THREE.Vector3(),
      before = n.position.clone();
    for (const other of npcs) {
      if (
        other === n ||
        !other.escapeActive ||
        Math.abs(other.position.y - n.position.y) > 0.6
      )
        continue;
      const away = n.position.clone().sub(other.position).setY(0),
        length = away.length();
      if (length > 0 && length < 0.95)
        moved.addScaledVector(away, ((0.95 - length) / length) * dt * 1.5);
    }
    n.position.copy(world.moveActor(n.id, n.position, moved, dt));
    const actual =
        Math.hypot(before.x - n.position.x, before.z - n.position.z) / dt,
      yielding = world.actorNavigationStatus(n.id)?.yielding;
    if (!yielding && speed > 0 && actual < 0.05) n.stuck += dt;
    else n.stuck = 0;
    if (n.stuck > 1.2) {
      escapeTactics.blocked(n.id);
      extractionDefense.blocked(n.id);
      n.path = [];
      n.repath = 0;
      n.stuck = 0;
    }
    n.actualSpeed = actual;
    n.movingAccuracy.update(dt, actual);
    n.previous.copy(n.position);
    const facing = n.sees ? n.lastKnown : n.path[0];
    if (facing)
      n.rig.root.rotation.y +=
        wrapAngle(
          Math.atan2(facing.x - n.position.x, facing.z - n.position.z) -
            n.rig.root.rotation.y,
        ) * Math.min(1, dt * 7);
    n.rig.root.position.copy(n.position);
    n.rig.root.visible = !profileNpcsHidden && dist < npcDrawRange();
    n.rig.update(dt, escapeRigState(n, actual), dist, camera);
    if (actual > 0.2 && dist < 28) {
      n.step += actual * dt;
      if (n.step > 0.95) {
        n.step = 0;
        audio.step("road", n.alert, dist, n.position);
      }
    }
  }
  function updateEscapeCombat(dt: number) {
    const target = npcTarget(),
      agents = npcs.map((n) => {
        const eye = n.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
          muzzle = n.rig.getMuzzleWorld(),
          seekingCover =
            !!n.tacticalDecision?.moving &&
            ["cover", "reload"].includes(n.tacticalDecision.state),
          eligible =
            !(n.identity==='meng'&&cardsPursuit.windup>0)&&
            !seekingCover &&
            !!n.escapeActive &&
            elapsed >= 10 &&
            !n.skill?.busy &&
            n.sees &&
            n.reaction <= 0 &&
            n.position.distanceTo(position) < WEAPONS[n.gun.id].range * 0.75 &&
            npcVisible(eye, target) &&
            npcVisible(muzzle, target);
        if (
          n.escapeActive &&
          elapsed >= 10 &&
          !n.skill?.busy &&
          n.tacticalDecision?.canReload !== false &&
          n.gun.ammo === 0 &&
          n.gun.reloadLeft === 0 &&
          (!escapeTactics.read(n.id)?.coverGoal || escapeAtPhysicalCover(n))
        )
          n.gun.reload();
        reloadSounds(n.gun, 0, 0, muzzle, () => {});
        return {
          id: n.id,
          eligible: eligible && n.gun.ammo > 0,
          reloading: n.gun.reloadLeft > 0,
          automatic: WEAPONS[n.gun.id].automatic,
          attack: n.escapeAttack!,
        };
      });
    escapeFire.update(dt, agents, { grace: elapsed < 10 });
    for (const n of npcs) {
      if (!phaseActive()) break;
      if (!n.escapeActive) continue;
      const muzzle = n.rig.getMuzzleWorld(),
        eye = n.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
        dist = n.position.distanceTo(position);
      if (
        escapeFire.canFire(n.id) &&
        n.sees &&
        !n.skill?.busy &&
        n.rig.isAimReady(target) &&
        npcVisible(eye, target) &&
        npcVisible(muzzle, target) &&
        n.gun.fire()
      ) {
        n.fire = 0.05;
        n.shotSerial++;
        rankEvent("shot", {
          actor: "npc",
          npcId: n.id,
          generation: rankGeneration.get(n.id) ?? 0,
          weapon: n.gun.id,
          shotId: n.shotSerial,
          position: muzzle.toArray(),
        });
        escapeFire.fired(n.id, random);
        escapeContacts.heard(
          n.id,
          muzzle.toArray() as Vec3,
          camera.position.toArray() as Vec3,
          elapsed,
          visible(camera.position, muzzle),
        );
        escapeCombatMusicLeft = 5;
        const spec = WEAPONS[n.gun.id],
          mult = n.movingAccuracy.read(),
          base = npcAimDirection(
            n.rig.getMuzzleDirectionWorld().toArray() as Vec3,
            mult,
            { crouched, sprinting: !!escapeMotion?.sprinting },
            random,
          );
        let damage = 0;
        const ends: THREE.Vector3[] = [];
        for (let i = 0; i < spec.pellets; i++) {
          const dir = v(npcPelletDirection(base, spec.spread, mult, random)),
            fixedHit = world.rayImpact(muzzle, dir, spec.range),
            wall = fixedHit?.distance ?? spec.range,
            hit = characterHit(muzzle, dir, position, crouched);
          const hitPlayer = hit !== null && hit < wall,
            end = muzzle
              .clone()
              .addScaledVector(
                dir,
                hitPlayer ? hit! : Math.min(wall, spec.range),
              );
          if (hitPlayer){const base=spec.damage*ESCAPE_DIFFICULTIES[escapeSelectedDifficulty].damageScale,armor=helmetDamage(base,end.y-position.y>(crouched ? .92 : 1.25),gadgetInventory.helmetDurability);damage+=armor.damage;gadgetInventory.helmetDurability=armor.durability;}
          else if (wall < spec.range - 0.1) {
            const surface = classifyImpactSurface({ normal: fixedHit?.normal });
            effects.hit(end, false, surface);
            audio.impact(surface, end);
          }
          ends.push(end);
        }
        shotPresentation(
          n.gun.id,
          muzzle,
          ends,
          n.rig.getEjectionWorld(),
          n.rig.getMuzzleDirectionWorld(),
          dist,
        );
        if (damage > 0) {
          const applied = Math.min(health, damage);
          health = Math.max(0, health - damage);
          rankEvent("damage", {
            amount: applied,
            npcId: n.id,
            weapon: n.gun.id,
            health,
          });
          escapeRound?.recordDamage(applied);
          escapeRecovery.noteDamage();
          hurt = 0.5;
          directions.add(n.id, muzzle, damage);
          audio.cue("hurt");
          if (health <= 0) {
            escapeRound?.fail("health");
            finish(false, "生命耗尽，行动失败。");
          }
        }
      }
      n.rig.update(0, escapeRigState(n, n.actualSpeed), dist, camera);
    }
  }
  function validatedEscapeFallback() {
    const site = (id: string) =>
      VALIDATED_ESCAPE_SITES.find((s) => s.id === id)!;
    return [
      {
        id: "take-sports-road",
        kind: "take" as const,
        label: "夺取道路物资",
        sites: [site("sports-road")],
        duration: 0,
        radius: 2.4,
      },
      {
        id: "activate-yard-library",
        kind: "activate" as const,
        label: "启动庭院设备",
        sites: [site("yard"), site("library-west")],
        duration: 0,
        radius: 2.4,
      },
      {
        id: "hold-sports-north",
        kind: "hold" as const,
        label: "守住运动场信标",
        sites: [site("sports-north")],
        duration: ESCAPE_DIFFICULTIES[escapeSelectedDifficulty].hold,
        radius: 6,
      },
    ];
  }
  function setupRound() {
    buffering = false;
    bufferingSince = 0;
    loadingPanels = 0;
    bufferEvents = 0;
    mapError = false;
    mapProgress = 1;
    random = seeded(roundSeed);
    recoilRandom = seeded(roundSeed ^ 0xb52f893);
    adsBlend = nearWall = equipLeft = 0;
    scopeReady = true;
    elapsed = 0;
    health = 100;
    smokes = 2;
    gadgetInventory=newGadgetInventory();cardsPursuit.clear();grenades=[];gadgetLoot=[];gadgetSerial=0;gadgetScene.clear();
    extraction = 0;
    hurt = 0;
    hit = 0;
    recoil = 0;
    stepClock = 0;
    smokeReady = 0;
    velocityY = 0;
    crouched = false;
    aiming = false;
    grounded = false;
    resultReason = "";
    notice = "";
    noticeLeft = 0;
    frameMoving = 0;
    bobTime = 0;
    stamina = new Stamina();
    inventory = {
      pistol: new Magazine("glock"),
      primary: mode === "escape" ? new Magazine(selectedPrimary) : null,
    };
    weapon = mode === "escape" ? selectedPrimary : "glock";
    hitType = null;
    shotSerial = 0;
    playerReloadStage = 0;
    playerReloadSerial = 0;
    kick.reset();
    input.reset();
    perfClock = 0;
    perfFrames = 0;
    fps = 0;
    cpuUpdate = cpuNpcs = cpuRender = 0;
    profile = { updateMs: 0, npcMs: 0, renderMs: 0 };
    position.copy(v(world.manifest.spawn));
    lastSafe.copy(position);
    world.restorePlayer(position, false);
    yaw = world.manifest.spawnYaw;
    pitch = 0;
    if (mode === "dafei" && driveMap) {
      driving = world.startDriving(driveMap,activeVehicleId);
      driving.setTransmission(settings.transmission ?? "auto");
      driveChallenge = new DrivingChallenge(driveMap.repairs,activeVehicleId);
      if(activeVehicleId==="tank"){cannon=new DrivingCannon();scene.add(cannon.root);cannonShots=0;}
      position.copy(driving.read().position);
      lastSafe.copy(position);
      orbit = 0;
      orbitPitch = 0.28;
      impactShake = 0;
      audio.setMusicMode("driving");
      supplies = driveMap.repairs.map((point) => ({
        point,
        mesh: repairMarker(point),
        collected: false,
      }));
    }
    if (mode === "escape") {
      escapeTactics.reset();
      extractionDefense.reset();
      escapeContacts.reset();
      escapeTacticalAgents = [];
      contactProbe = 0;
      escapeSelectedDifficulty = escapeDifficulty(settings.escapeDifficulty);
      escapeFire = new EscapeFireCoordinator(escapeSelectedDifficulty);
      escapePlan =
        retryEscapePlan ??
        generateEscapePlan({
          seed: roundSeed ^ 0xa17c900d,
          difficulty: escapeSelectedDifficulty,
          sites: VALIDATED_ESCAPE_SITES,
          spawn: VALIDATED_ESCAPE_SPAWN,
          extraction: VALIDATED_ESCAPE_EXTRACTION,
          validateSite: escapeSiteSafe,
          validateRoute: (a, b) => {
            const gate = calibratedEscapeRoute(a, b);
            if (!gate.complete) return gate;
            const route = escapeRouteValid(a, b);
            return { ...route, length: Math.max(route.length, gate.length) };
          },
          fallbackTasks: validatedEscapeFallback(),
        });
      retryEscapePlan = null;
      if(training){
        const site=VALIDATED_ESCAPE_SITES.find(s=>s.id==='sports-road')!;
        const target=v(site.position),offsets:Vec3[]=[[0,0,6],[6,0,0],[0,0,-6],[-6,0,0]];
        const spawn=offsets.map(offset=>target.clone().add(v(offset))).find(candidate=>{
          const support=world.supportAt(candidate,1.75);if(!support?.clear||Math.abs(support.height-candidate.y)>1)return false;
          candidate.y=support.height;const route=escapeRouteValid(candidate.toArray() as Vec3,site.position);return route.complete&&route.length<16;
        });
        if(!spawn)throw new Error('练习区域暂时未能准备好，请重试。');
        escapePlan=trainingPlan(site,spawn.toArray() as Vec3,roundSeed);
        position.copy(spawn);lastSafe.copy(position);world.restorePlayer(position,false);
        yaw=Math.atan2(-(target.x-position.x),-(target.z-position.z));pitch=0;
      }
      escapeRound = new EscapeRound({
        difficulty: escapeSelectedDifficulty,
        plan: escapePlan,
        onRecord: (type, data, time) =>
          rankEvent(type, { ...data, position: position.toArray() }, time),
      });
      escapeMovement.reset();
      escapeRecovery.reset();
      escapeRouteClock = 0;
      footstepSerial = 0;
      if(!training)lastEscapeSession = {
        seed: roundSeed,
        ids: [...roundRoster],
        difficulty: escapeSelectedDifficulty,
        primary: selectedPrimary,
        plan: escapePlan,
      };
      escapeBest = null;
      escapeBestBeforeResult = null;
      escapeStairGuide = null;
      try {
        const stored = Number(
          localStorage.getItem(
            "qisheng-escape-0.3.0-" + escapeSelectedDifficulty,
          ),
        );
        if (stored > 0 && Number.isFinite(stored)) escapeBest = stored;
      } catch {}
      clues = escapePlan.tasks.flatMap((task) =>
        task.sites.map((site) => ({
          point: {
            id: task.id + "::" + site.id,
            label: site.label,
            position: site.position,
          },
          mesh: escapeMarker(task, site),
          collected: false,
        })),
      );
      audio.setEscapeMusic(settings.escapeMusic ?? "battle", "search");
      supplies = world.manifest.supplies.map((point) => ({
        point,
        mesh: marker(point, "supply"),
        collected: false,
      }));
      gate = marker(
        {
          id: "exit",
          label: "校门撤离点",
          position: world.manifest.extraction,
        },
        "exit",
      );
      gate.visible = false;
      if(!training)info("三项行动已公布。", 2);
      try {
        if (!training && !localStorage.getItem("qisheng-escape-controls-v031")) {
          info(
            touchControls()
              ? settings.escapeAimMode === "hold"
                ? "左手移动，右手观察；按住瞄准开镜。"
                : "左手移动，右手观察；点击瞄准切换开镜。"
              : "WASD 移动 · Shift 冲刺 · Ctrl 滑铲 · M 地图",
            5,
          );
          localStorage.setItem("qisheng-escape-controls-v031", "1");
        }
      } catch {}
    } else if (mode === "roam")
      info(
        touchControls()
          ? "自由漫游已开启。点“相机”开始拍摄。"
          : "自由漫游已开启。按 C 举起相机。",
        5,
      );
    else if (mode === "story") notice = "";
    else info("大课间到了：五分钟驾驶挑战，留意车况与维修点。", 5);
    if (mode === "escape" || mode === "dafei") {
      if(mode==='escape')for(const supply of world.manifest.supplies)for(const [index,kind] of (['helmet','grenade','cards'] as const).entries()){
        const point=v(supply.position).add(new THREE.Vector3((index-1)*1.15,0,1.2)),support=world.supportAt(point,1.75);
        if(support?.clear&&Math.abs(support.height-point.y)<1&&visible(v(supply.position).add(new THREE.Vector3(0,1,0)),point.clone().add(new THREE.Vector3(0,1,0)))){point.y=support.height;gadgetLoot.push({id:'item-'+supply.id+'-'+kind,kind,position:point.toArray() as Vec3,usedBy:[],availableAt:0});}
      }
      const offset = Math.floor(random() * 4);
      npcs = [];
      for (const [i, identity] of roundRoster.entries()) {
        const region = driveMap?.npcRegions?.find((r) => r.npcId === i),
          driveAI =
            mode === "dafei" && region
              ? new DrivingPatrol(region, random)
              : undefined,
          p = driveAI
            ? v(driveAI.spawn)
            : profileCombatPreview
              ? position.clone().add(new THREE.Vector3((i - 1.5) * 2.1, 0, -7))
              : mode === "escape"
                ? initialEscapeEntry(i)
                : v(world.manifest.npcSpawns[i]),
          rig = createCharacter(identity, roundMobile);
        rig.root.position.copy(p);
        scene.add(rig.root);
        const def = NPC_IDENTITY[identity],
          id = def.weapon;
        try {
          rig.setWeapon(id);
        } catch (error) {
          rig.root.removeFromParent();
          rig.dispose();
          throw error;
        }
        npcs.push({
          id: i,
          identity,
          skill: def.skill ? new NpcSkill(def.skill) : undefined,
          skillProbe: 0,
          team: new TeamInvestigation(),
          rig,
          position: p,
          gun: new Magazine(id, WEAPONS[id].reserve),
          role: (i + offset) % 4,
          path: [],
          destination: p.clone(),
          lastKnown: null,
          memory: 0,
          sense: i * 0.12,
          repath: i * 0.3,
          reaction: 0,
          sees: false,
          alert: false,
          patrol: i,
          suppression: 0,
          disabled: 0,
          fire: 0,
          hit: 0,
          step: 0,
          stuck: 0,
          previous: p.clone(),
          attack: new AttackCycle(),
          driveAI,
          driveAttack: mode === "dafei" ? new DrivingAttack() : undefined,
          shotSerial: 0,
          reloadSerial: 0,
          reloadStage: 0,
          escapeActive: mode === "escape" ? i < 6 : undefined,
          escapeAttack: mode === "escape" ? new EscapeAttack() : undefined,
          reenterAt: Infinity,
          respawnProbe: 0,
          heardStep: 0,
          tacticalSeen: false,
          actualSpeed: 0,
          movingAccuracy: new NpcMovingAccuracy(),
        });
        if (mode === "escape" && i >= 6) rig.root.visible = false;
      }
    }
    for (const n of npcs)
      if (n.driveAI) lastSpawn.set(n.id, n.position.toArray() as Vec3);
    camera.position.copy(position).add(new THREE.Vector3(0, RULES.eye, 0));
    camera.rotation.set(0, yaw, 0);
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    updateGoal();
    if (driving) {
      car?.update(driving.read(), 0);
      updateDriveCamera(0, true);
    }
  }
  function unlockAudio(next: Mode = mode) {
    if (next === "story") {
      storyGesturePrimed = true;
      void storyAudio
        .primeGesture(story?.snapshot.chapter ?? 0)
        .catch(() => {});
      void audio.unlockEffects().catch(() => {});
    } else if (next === "roam") void audio.unlockEffects().catch(() => {});
    else void audio.unlock().catch(() => {});
  }
  async function enter(unlock = true) {
    const token = ++enterToken;
    input.reset();
    input.setMode(mode);
    input.setEnabled(false);
    audio.update(0, true);
    emit();
    if (unlock) unlockAudio();
    syncObservationCursor(true, true);
    const result = await Promise.allSettled([input.lock()]);
    if (dead || token !== enterToken) return;
    if (result[0].status === "rejected") {
      phase = "paused";
      input.reset();
      audio.update(0, true);
      emit();
      throw Error(
        "鼠标尚未进入游戏，请点击继续游戏重试，或在设置选择触屏操作。",
      );
    }
    if (document.hidden || (touchControls() && innerHeight > innerWidth)) {
      phase = "paused";
      emit();
      return;
    }
    phase = "playing";
    input.setEnabled(storyOverlays.size === 0);
    input.setSuspended(storyOverlays.has("reality"));
    if (!storyOverlayOpen) photo?.resume();
    last = performance.now();
    accumulator = 0;
    refreshStreaming();
    emit();
    schedule();
  }
  function cancelPreparation() {
    preparation?.abort();
    preparation = null;
  }
  function preparationKey(next: Mode, loadout?: Loadout) {
    return [
      next,
      next === "dafei"?drivingVehicleId(settings.drivingVehicle):"",
      next === "escape" ? (loadout?.primary ?? selectedPrimary) : "",
      next === "escape"
        ? (loadout?.difficulty ?? settings.escapeDifficulty ?? "standard")
        : "",
      renderProfile().mobileTextures ? "mobile-textures" : "full-textures",
      settings.quality,
      next === "escape" && loadout?.training ? "practice" : "round",
    ].join(":");
  }
  function releasePrepared(value: PreparedMode | null) {
    if (!value) return;
    value.weapons?.();
    value.billboards?.();
    value.views?.();
    value.car?.dispose();
    value.camera?.dispose();
    value.storyWorld?.dispose();
  }
  function cancelModePreparation() {
    const job = modePreparation;
    modePreparation = null;
    job?.controller.abort();
    releasePrepared(preparedMode);
    preparedMode = null;
    if (phase !== "playing" && phase !== "paused") input.freePointerLock();
  }
  function modePrepared(next: Mode, loadout?: Loadout) {
    return preparedMode?.key === preparationKey(next, loadout);
  }
  async function prepareMode(
    next: Mode,
    loadout?: Loadout,
    options: PreparationOptions = {},
  ) {
    if (dead || options.signal?.aborted)
      throw new DOMException("Cancelled", "AbortError");
    const key = preparationKey(next, loadout);
    if (modePrepared(next, loadout)) return;
    if (
      modePreparation?.key === key &&
      !modePreparation.controller.signal.aborted
    ) {
      return withDeadline(modePreparation.work, 90000, {
        signal: options.signal,
      });
    }
    cancelModePreparation();
    cancelPreparation();
    const token = ++enterToken,
      controller = new AbortController(),
      signal = controller.signal;
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    input.setEnabled(false);
    input.setMode(next);
    input.reset();
    audio.update(0, true);
    resetTransient(next === "story" && storyGesturePrimed);
    phase = "menu";
    const report = (ratio: number, text: string) => {
      if (!dead && token === enterToken && !signal.aborted) {
        progress = Math.round(ratio * 100);
        message = text;
        options.onProgress?.(ratio, text);
        emit();
      }
    };
    if (!pendingRoster || pendingRoster.mode !== next) {
      const seed = qaSeed ?? Date.now() >>> 0;
      pendingRoster = {
        mode: next,
        seed,
        ids: !modeCapabilities(next).enemies
          ? []
          : next === "escape"
            ? qaRoster?.length
              ? qaRoster
              : shuffleEscapeRoster(seed)
            : selectRoundRoster(seeded(seed ^ 0x9e3779b9), next),
      };
    }
    const value: PreparedMode = {
      key,
      mode: next,
      vehicleId:next==="dafei"?drivingVehicleId(settings.drivingVehicle):undefined,
      roster: { ...pendingRoster, ids: next === "escape" && loadout?.training ? [] : [...pendingRoster.ids] },
      mobile: renderProfile().mobileTextures,
    };
    let committed = false;
    const work = (async () => {
      try {
        report(0, "准备校园");
        const ratios = [0, 0, 0, 0],
          update = (index: number, ratio: number, text: string) => {
            ratios[index] = ratio;
            report(ratios.reduce((n, v) => n + v, 0) * 0.2, text);
          };
        const worldReady = Promise.all([
          ensureWorld(token, signal, (p, msg) => update(3, p, msg)),
          preloadModeUI(next),
        ]);
        const weapons = roundWeaponResources(
          next,
          loadout?.primary ?? selectedPrimary,
          value.roster.ids.map((id) => NPC_IDENTITY[id].weapon),
        );
        const hold =
          <T>(set: (v: T) => void, drop: (v: T) => void) =>
          (result: T) => {
            if (signal.aborted || dead || token !== enterToken) {
              drop(result);
              throw new DOMException("Cancelled", "AbortError");
            }
            set(result);
          };
        await Promise.all([
          worldReady.then(() => update(3, 1, "准备校园")),
          weapons.length
            ? prepareWeapons(
                (r) => update(0, r, "准备装备"),
                weapons,
                signal,
              ).then(
                hold<() => void>(
                  (v) => (value.weapons = v),
                  (v) => v(),
                ),
              )
            : Promise.resolve(update(0, 1, "准备画面")),
          value.roster.ids.length
            ? prepareBillboards(
                value.roster.ids,
                (r) => update(1, r, "准备本局人物"),
                value.mobile,
                signal,
              ).then(
                hold<() => void>(
                  (v) => (value.billboards = v),
                  (v) => v(),
                ),
              )
            : Promise.resolve(update(1, 1, "准备画面")),
          (async () => {
            if (next === "dafei") {
              const car = await prepareCar(token, signal, value.vehicleId);
              if (car) {
                if (signal.aborted || token !== enterToken) {
                  car.dispose();
                  throw new DOMException("Cancelled", "AbortError");
                }
                value.car = car;
                car.root.visible = false;
              }
            } else if (modeCapabilities(next).photography) {
              const cm = await import("./camera-model");
              if (signal.aborted || token !== enterToken)
                throw new DOMException("Cancelled", "AbortError");
              value.camera = cm.createCameraModel({
                quality: low ? "low" : "high",
              });
              if (next === "story") {
                const wm = await import("./story-world");
                await worldReady;
                if (signal.aborted || token !== enterToken)
                  throw new DOMException("Cancelled", "AbortError");
                const storyScene = await wm.createStoryWorld(
                  scene,
                  world,
                  signal,
                );
                if (signal.aborted || token !== enterToken) {
                  storyScene.dispose();
                  throw new DOMException("Cancelled", "AbortError");
                }
                storyScene.root.visible = false;
                value.storyWorld = storyScene;
              }
            }
            update(2, 1, "准备画面");
          })(),
        ]);
        if (signal.aborted || token !== enterToken)
          throw new DOMException("Cancelled", "AbortError");
        if (next === "dafei" && driveMap && !qaSpawn)
          driveMap = configureDrivingStart(driveMap, (point, viewYaw) =>
            world.validateDrivingSpawn(driveMap!, point, viewYaw, value.vehicleId),
          );
        const views: PhotoView[] = [];
        if (next === "story") {
          const sm = await import("./story");
          for (let i = 0; i <= 900; i++) {
            const shot = sm.introCameraAt(i / 10),
              direction = v(shot.lookAt).sub(v(shot.position)).normalize();
            views.push({
              origin: shot.position,
              direction: direction.toArray() as Vec3,
              fov: shot.fov,
              aspect: camera.aspect,
              far: 360,
            });
          }
        } else {
          const spawn =
              next === "dafei" && driveMap
                ? driveMap.spawn
                : world.manifest.spawn,
            viewYaw =
              next === "dafei" && driveMap
                ? driveMap.spawnYaw
                : world.manifest.spawnYaw;
          views.push({
            origin: [spawn[0], spawn[1] + 1.62, spawn[2]],
            direction: [-Math.sin(viewYaw), 0, -Math.cos(viewYaw)],
            fov: settings.fov,
            aspect: camera.aspect,
            far: low ? 85 : 110,
          });
        }
        const dropViews = next==='escape'
          ? await world.prepareCombat(signal,r=>report(.8+r*.2,'准备校园画面'))
          : await world.prepareViews(views, signal, (r) => report(0.8 + r * 0.2, "准备出发位置"));
        if (signal.aborted || token !== enterToken) {
          dropViews();
          throw new DOMException("Cancelled", "AbortError");
        }
        value.views = dropViews;
        preparedMode = value;
        committed = true;
        report(1, "");
      } catch (error) {
        controller.abort();
        if (!committed) releasePrepared(value);
        throw error;
      } finally {
        options.signal?.removeEventListener("abort", abort);
        if (modePreparation?.controller === controller) modePreparation = null;
      }
    })();
    modePreparation = { key, controller, work };
    return work;
  }
  async function prepareCar(token: number, signal: AbortSignal,vehicleId:DrivingVehicleId="bao5") {
    if (!driveMap) {
      const map: DriveMap = await withDeadline(
        gameMapSession
          .read("/map/drive-v122.json", { signal, priority: 0 })
          .then(
            (bytes) => JSON.parse(new TextDecoder().decode(bytes)) as DriveMap,
          ),
        30000,
        { signal },
      );
      if (dead || token !== enterToken || signal.aborted) return null;
      if (
        !map.npcRegions ||
        map.npcRegions.length !== 4 ||
        [0, 1, 2, 3].some(
          (id) =>
            !map.npcRegions!.some(
              (r) =>
                r.npcId === id &&
                r.spawnPoints.length &&
                r.patrolPoints.length &&
                r.respawnPoints?.length,
            ),
        )
      )
        throw Error("驾驶道路缺少敌人分区。");
      driveMap =
        qaSpawn && QA_SPAWNS[qaSpawn]
          ? { ...map, spawn: QA_SPAWNS[qaSpawn] }
          : map;
    }
    const module = await import("./vehicle-visual.ts");
    if (dead || token !== enterToken || signal.aborted) return null;
    const value = await withDeadline(
      module.createVehicleVisual(scene, signal,vehicleId),
      30000,
      { signal, onLate: (car) => car.dispose() },
    );
    if (dead || token !== enterToken || signal.aborted) {
      value.dispose();
      return null;
    }
    return value;
  }
  function staticDriveCamera() {
    if (!driveMap || !car) return;
    position.fromArray(driveMap.spawn);
    lastSafe.copy(position);
    car.root.position.copy(position);
    car.root.quaternion.setFromAxisAngle(UP, driveMap.spawnYaw);
    car.root.updateMatrixWorld(true);
    const target = position
        .clone()
        .add(new THREE.Vector3(0, vehicleDefinition(activeVehicleId).camera.targetHeight, 0)),
      offset = new THREE.Vector3(
        0,
        vehicleDefinition(activeVehicleId).camera.height + Math.sin(0.28) * 3,
        vehicleDefinition(activeVehicleId).camera.distance,
      ).applyAxisAngle(UP, driveMap.spawnYaw),
      distance = offset.length(),
      direction = offset.divideScalar(distance),
      safe = world.rayDistance(target, direction, distance);
    camera.position
      .copy(target)
      .addScaledVector(direction, Math.max(0.3, safe - 0.2));
    camera.lookAt(target);
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    yaw = camera.rotation.y;
    orbit = 0;
    orbitPitch = 0.28;
  }
  async function prepareDafeiIntro() {
    if (dead) return;
    await gameOperations.check('dafei');
    if (dead) return;
    await prepareMode("dafei");
    if (dead || !modePrepared("dafei")) return;
    const value = preparedMode!;
    mode = "dafei";
    activeVehicleId=value.vehicleId??"bao5";
    phase = "intro";
    input.setEnabled(false);
    input.setMode("dafei");
    input.reset();
    audio.reset();
    audio.update(0, true);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    if (value.car) {
      car = value.car;
      value.car = undefined;
    }
    if (!car) throw Error("汽车尚未准备好。");
    car.root.visible = true;
    staticDriveCamera();
    introCarReady = true;
    elapsed = 0;
    health = 100;
    resultReason = "";
    notice = "";
    noticeLeft = 0;
    progress = 100;
    message = "";
    mapError = false;
    buffering = false;
    last = performance.now();
    accumulator = 0;
    emit();
    render(0);
    schedule();
  }
  async function retryRound() {
    if (!lastEscapeSession) return start("escape");
    const saved = lastEscapeSession;
    pendingRoster = { mode: "escape", seed: saved.seed, ids: [...saved.ids] };
    retryEscapePlan = saved.plan;
    return start("escape", {
      primary: saved.primary,
      difficulty: saved.difficulty,
    });
  }
  async function start(next: Mode, loadout?: Loadout) {
    if (import.meta.env.DEV) (window as any).__gameStartError = null;
    if (dead) return;
    gameOperations.assert(entryFor(next));
    const permission = gameOperations.check(entryFor(next));
    void permission.catch(() => {});
    const ready = prepareMode(next, loadout),
      token = enterToken,
      controller = new AbortController();
    preparation = controller;
    input.setEnabled(false);
    input.setMode(next);
    input.setCursorFree(false);
    input.reset();
    audio.update(0, true);
    if (next === "escape" && loadout?.difficulty)
      settings = {
        ...settings,
        escapeDifficulty: escapeDifficulty(loadout.difficulty),
      };
    if (loadout && PRIMARY_WEAPONS.includes(loadout.primary))
      selectedPrimary = loadout.primary;
    prepareModeAudio(audio, next, settings.escapeMusic ?? "battle");
    unlockAudio(next);
    // Preserve the original user gesture while resources finish. No delayed auto-lock.
    const pointer = input.lock();
    void pointer.catch(() => {});
    phase = "loading";
    emit();
    let value: PreparedMode | null = null;
    try {
      await permission;
      await ready;
      if (dead || token !== enterToken || controller.signal.aborted) return;
      await pointer;
      if (dead || token !== enterToken || controller.signal.aborted) return;
      if (!modePrepared(next, loadout)) throw Error("本局准备已更改。");
      if (!loadout?.training && !rankingRetryStarted) {
        rankingRetryStarted = true;
        void rankingClient
          .me()
          .then(() => retryAutomaticRanking())
          .catch(() => {});
      }
      value = preparedMode;
      preparedMode = null;
      const selected = value!.roster;
      mode = next;
      activeVehicleId=value!.vehicleId??"bao5";
      training = next === "escape" && loadout?.training ? new CombatTraining() : null;
      roundRoster = [...selected.ids];
      roundSeed = selected.seed;
      roundMobile = value!.mobile;
      releaseWeapons = value!.weapons;
      value!.weapons = undefined;
      releaseBillboards = value!.billboards;
      value!.billboards = undefined;
      if (next === "escape") {
        viewWeapon = createViewWeapon(["glock", selectedPrimary]);
        viewScene.add(viewWeapon.root);
      }
      if (value!.car) {
        car = value!.car;
        value!.car = undefined;
      }
      if (car) car.root.visible = true;
      setupRound();
      if(next==='dafei'&&car){const gpu=new CombatGpuPreparer(renderer,scene,camera);try{await gpu.prepare(car.root,controller.signal);if(cannon)await gpu.prepare(cannon.root,controller.signal);}finally{gpu.dispose();}}
      if(next==='escape'){
        const gpu=new CombatGpuPreparer(renderer,scene,camera);
        try{await gpu.prepare(effects.root,controller.signal);const restoreShell=effects.prepareGeometryVariants();try{await gpu.prepare(effects.root,controller.signal);}finally{restoreShell();}for(const root of gadgetScene.prepareRoots)await gpu.prepare(root,controller.signal);for(const npc of npcs){await gpu.prepareTextures(npc.rig.preparationTextures,controller.signal);await gpu.prepare(npc.rig.root,controller.signal);}}
        finally{gpu.dispose();}
        if(viewWeapon){const firstPerson=new CombatGpuPreparer(renderer,viewScene,viewCamera);try{await firstPerson.prepare(viewWeapon.root,controller.signal);}finally{firstPerson.dispose();}}
        if(dead||token!==enterToken||controller.signal.aborted)return;
      }
      pendingRoster = null;
      if (driving) {
        car?.update(driving.read(), 0);
        updateDriveCamera(0, true);
      }
      if (value!.camera) {
        heldCamera = value!.camera;
        value!.camera = undefined;
        heldCamera.group.rotation.y = Math.PI;
        heldCamera.group.position.set(0.22, -0.3, -0.7);
        heldCamera.group.userData.excludePhotography = true;
        viewScene.add(heldCamera.group);
      }
      if (next === "story") {
        const sm = await import("./story");
        if (dead || token !== enterToken || controller.signal.aborted) return;
        storyStore ??= new sm.StorySaveStore();
        storyWorld = value!.storyWorld ?? null;
        value!.storyWorld = undefined;
        if (!storyWorld) throw Error("故事画面尚未准备好。");
        storyWorld.root.visible = true;
        story = new sm.StorySession({ onCheckpoint: () => saveStory() });
        position.fromArray(sm.STORY_START);
        const support = world.supportAt(position);
        if (support?.clear) position.y = support.height;
        lastSafe.copy(position);
        world.restorePlayer(position, false);
        yaw = Math.PI;
        pitch = 0;
        camera.position.copy(position).add(new THREE.Vector3(0, RULES.eye, 0));
        scene.background = new THREE.Color(0x7f8eac);
        sun.color.set(0xffc08a);
        sun.intensity = 1.65;
        scene.fog = new THREE.Fog(0x7f8eac, 100, 330);
        camera.far = 360;
        camera.updateProjectionMatrix();
        storyAudio.prepare(story.snapshot.chapter);
        if (storyResume) {
          await restoreStoryState(storyResume);
          if (dead || token !== enterToken || controller.signal.aborted) return;
          storyResume = null;
        }
        saveStory();
      }
      if (story?.snapshot.introActive) {
        releaseOpening = value!.views;
        value!.views = undefined;
        await prepareOpening(token, controller.signal);
      } else if(next==='escape'){
        releaseCombat=value!.views;
        value!.views=undefined;
      } else {
        value!.views?.();
        value!.views = undefined;
      }
      if (next === "escape" || next === "dafei")
        await prepareRankedRound(token, controller.signal);
      if (dead || token !== enterToken || controller.signal.aborted) return;
      preparation = null;
      progress = 100;
      message = "";
      storyGesturePrimed = false;
      return enter(false);
    } catch (error) {
      if (dead || token !== enterToken) return;
      if (import.meta.env.DEV)
        (window as any).__gameStartError = {
          next,
          ids: value?.roster.ids,
          message: error instanceof Error ? error.message : String(error),
        };
      cancelPreparation();
      cancelModePreparation();
      resetTransient();
      phase = "menu";
      progress = 100;
      message = "";
      emit();
      if (error instanceof ModeUnavailableError) throw error;
      throw new Error("本局暂时无法开始，请重试。", { cause: error });
    } finally {
      releasePrepared(value);
    }
  }
  async function prepareOpening(token: number, signal: AbortSignal) {
    const sm = await import("./story");
    if (dead || token !== enterToken || signal.aborted) return;
    const end = sm.introCameraAt(90),
      endCamera = camera.clone();
    endCamera.position.fromArray(end.position);
    endCamera.lookAt(v(end.lookAt));
    openingLanding = {
      position: [...sm.STORY_START],
      yaw: endCamera.rotation.y,
      pitch: endCamera.rotation.x,
    };
    const views: PhotoView[] = [];
    for (let i = 0; i <= 900; i++) {
      const shot = sm.introCameraAt(i / 10),
        direction = v(shot.lookAt).sub(v(shot.position)).normalize();
      views.push({
        origin: shot.position,
        direction: direction.toArray() as Vec3,
        fov: shot.fov,
        aspect: camera.aspect,
        far: 360,
      });
    }
    message = "准备完整开场";
    progress = 0;
    emit();
    const release =
      releaseOpening ??
      (await world.prepareViews(views, signal, (p) => {
        if (!dead && token === enterToken && !signal.aborted) {
          progress = Math.round(p * 100);
          emit();
        }
      }));
    if (dead || token !== enterToken || signal.aborted) {
      release();
      return;
    }
    releaseOpening = release;
    previousStoryStep = "opening";
    const first = story?.snapshot.introCamera;
    if (first) {
      camera.position.fromArray(first.position);
      camera.lookAt(v(first.lookAt));
      camera.fov = first.fov;
      camera.updateProjectionMatrix();
    }
  }
  function finishOpening() {
    if (openingLanding) {
      position.fromArray(openingLanding.position);
      world.restorePlayer(position, false);
      lastSafe.copy(position);
      yaw = openingLanding.yaw;
      pitch = openingLanding.pitch;
      camera.position.copy(position).add(new THREE.Vector3(0, RULES.eye, 0));
      camera.rotation.set(pitch, yaw, 0);
      velocityY = 0;
    }
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    releaseOpening?.();
    releaseOpening = undefined;
  }
  function setStoryOverlay(
    source:
      | "history"
      | "archive"
      | "reality"
      | "photo-panel"
      | "photo-album"
      | "restore"
      | "ui-module"
      | "operations",
    open: boolean,
  ) {
    if (storyOverlays.has(source) === open) return;
    if (open) storyOverlays.add(source);
    else storyOverlays.delete(source);
    const blocked = storyOverlays.size > 0,
      hard = [...storyOverlays].some((s) => s !== "reality");
    storyOverlayOpen = blocked;
    input.setEnabled(phaseActive() && !hard);
    input.setSuspended(!hard && storyOverlays.has("reality"));
    accumulator = 0;
    if (blocked) {
      photo?.pause(hard ? "面板已打开" : "遇见现实");
    } else if (phaseActive()) {
      if (!buffering) photo?.resume();
      canvas.focus({ preventScroll: true });
    }
    emit();
  }
  function pause() {
    if (!phaseActive()) return;
    phase = "paused";
    photo?.pause();
    storyAudio.pause();
    if (mode === "story") saveStory();
    driveFire.reset();
    escapeFire.reset();
    escapeMapOpen = false;
    escapeMapClosing = false;
    for (const n of npcs) {
      n.escapeAttack?.cancel();
      n.attack.cancel();
      n.driveAttack?.cancel();
    }
    stamina.stop();
    aiming = false;
    input.setEnabled(false);
    input.reset();
    audio.update(0, true);
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    emit();
    render(0);
  }
  async function resume() {
    if (dead || phase !== "paused") return;
    input.reset();
    return enter();
  }
  function menu() {
    enterToken++;
    cancelPreparation();
    cancelModePreparation();
    pendingRoster = null;
    storyResume = null;
    phase = "menu";
    buffering = false;
    mapError = false;
    progress = 100;
    message = "";
    audio.reset();
    input.setEnabled(false);
    input.reset();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    resetTransient();
    if (world) {
      position.fromArray(world.manifest.spawn);
      camera.position.copy(position).add(new THREE.Vector3(0, RULES.eye, 0));
      camera.rotation.set(0, world.manifest.spawnYaw, 0);
    }
    render(0);
    emit();
  }
  let storySaveQueue: Promise<void> = Promise.resolve();
  function saveStory() {
    if (!story || !storyStore) return;
    const cp = storyCheckpoint(),
      session = story,
      store = storyStore,
      token = enterToken;
    if (!cp) return;
    storySaveQueue = storySaveQueue
      .catch(() => {})
      .then(async () => {
        if (dead || story !== session || storyStore !== store) return;
        await store.save(cp);
      })
      .catch(() => {
        if (
          !dead &&
          story === session &&
          storyStore === store &&
          token === enterToken
        )
          info("本机存档无法写入，可以在暂停菜单导出进度。", 6);
      });
  }
  function storyCheckpoint(): StoryCheckpoint | null {
    return story
      ? ({
          ...story.checkpoint(),
          playerPosition: position.toArray(),
          playerYaw: yaw,
          playerPitch: pitch,
        } as StoryCheckpoint)
      : null;
  }
  async function restoreStoryState(cp: StoryCheckpoint) {
    if (!story) return false;
    const session = story,
      token = enterToken,
      saved = cp as StoryCheckpoint & {
        playerPosition?: Vec3;
        playerYaw?: number;
        playerPitch?: number;
      };
    // Do not resume screening until the saved photographs have real image sources.
    // Read first: a failed album request must leave the current chapter untouched.
    const rows = await withDeadline(
      import("./photography/album").then((m) => m.listPhotos()),
      12000,
    );
    if (dead || story !== session || token !== enterToken) return false;
    const openingSave = cp.step === "opening" || cp.step === "borrow-camera";
    session.restore(
      cp,
      openingSave
        ? STORY_START
        : (saved.playerPosition ?? cp.actors[0].position),
    );
    climaxTime = 0;
    previousStoryStep = "";
    for (const row of rows) {
      if (!cp.photos.some((p) => p.id === row.id)) continue;
      let url = shotUrlById.get(row.id);
      if (!url) {
        url = URL.createObjectURL(row.blob);
        shotUrls.add(url);
        shotUrlById.set(row.id, url);
      }
      session.resolvePhoto(row.id, url);
    }
    session.reconcileAvailablePhotos([
      ...rows.map((row) => ({ id: row.id, url: shotUrlById.get(row.id) })),
      ...cp.photos
        .filter((p) => p.persisted === false && shotUrlById.has(p.id))
        .map((p) => ({ id: p.id, url: shotUrlById.get(p.id) })),
    ]);
    const p = openingSave
      ? STORY_START
      : (saved.playerPosition ?? cp.actors[0].position);
    if (
      p?.length === 3 &&
      p.every((n) => Number.isFinite(n) && Math.abs(n) < 10000)
    ) {
      const point = v(p),
        support = world.supportAt(point);
      position.copy(support?.clear ? point : world.nearest(point));
      if (support?.clear) position.y = support.height;
      world.restorePlayer(position, false);
      lastSafe.copy(position);
    }
    yaw = Number.isFinite(saved.playerYaw)
      ? THREE.MathUtils.euclideanModulo(
          saved.playerYaw! + Math.PI,
          Math.PI * 2,
        ) - Math.PI
      : yaw;
    pitch = Number.isFinite(saved.playerPitch)
      ? THREE.MathUtils.clamp(saved.playerPitch!, -1.2, 1.2)
      : 0;
    if (openingSave) {
      yaw = Math.PI;
      pitch = 0;
    }
    storyAudio.prepare(session.snapshot.chapter);
    return true;
  }
  async function restoreStory(cp: StoryCheckpoint) {
    const requestToken = ++enterToken;
    await gameOperations.check('story');
    if (dead || requestToken !== enterToken) return;
    const sm = await import("./story");
    if (dead || requestToken !== enterToken) return;
    const validated = sm.validateStoryCheckpoint(cp);
    if (mode !== "story" || !story || validated.step === "opening") {
      storyResume = validated;
      await start("story");
    } else {
      setStoryOverlay("restore", true);
      try {
        photo?.close();
        world.setPhotoView(null);
        input.setPhotography(false);
        if (await restoreStoryState(validated)) {
          saveStory();
          emit();
        }
      } finally {
        if (!dead && requestToken === enterToken)
          setStoryOverlay("restore", false);
      }
    }
  }
  function photoEvidence(
    shotCamera: THREE.PerspectiveCamera,
  ): PhotoCaptureEvidence {
    const inFrame = (p: THREE.Vector3) => {
      const q = p.clone().project(shotCamera);
      return (
        q.z >= -1 && q.z <= 1 && Math.abs(q.x) < 0.95 && Math.abs(q.y) < 0.95
      );
    };
    const subjects = (story?.snapshot.actors ?? [])
      .filter(
        (a) =>
          a.visible &&
          [0.35, 0.95, 1.55].filter((y) => {
            const p = v(a.position).add(new THREE.Vector3(0, y, 0)),
              d = p.clone().sub(shotCamera.position),
              length = d.length();
            return (
              inFrame(p) &&
              world.rayDistance(shotCamera.position, d.normalize(), length) >=
                length - 0.22
            );
          }).length >= 2,
      )
      .map((a) => a.id);
    const aim = story?.snapshot.target?.lookAt;
    // A target inside the facade is allowed; reject occluders substantially in
    // front of it, rather than treating the intended building as an obstruction.
    const d = aim ? v(aim).sub(shotCamera.position) : undefined,
      length = d?.length() ?? 0;
    const obstruction = aim
      ? world.rayDistance(shotCamera.position, d!.normalize(), length)
      : length;
    // Authored lookAt marks the subject's centre, which can be several metres
    // behind its facade. A visible facade belongs to the photograph; a nearer
    // tree or another building does not. Character evidence remains stricter.
    const frameClear =
      !aim ||
      (inFrame(v(aim)) && length - obstruction <= Math.max(8, length * 0.35));
    return {
      subjects,
      subjectsVerified: true,
      frameClear,
      exposureStepId: story?.snapshot.captureEligibility.stepId,
      actorsReady: story?.snapshot.captureEligibility.actorsReady,
      rhythmReady: story?.snapshot.captureEligibility.rhythmReady,
    };
  }
  async function captured(record: PhotoRecord) {
    if (dead || !photo?.snapshot().open) return;
    const token = enterToken,
      request = ++realityRequest,
      session = story,
      capturedMode = mode;
    latestPhoto = record;
    if (record.storageStatus === "temporary")
      temporaryPhotos = [record, ...temporaryPhotos];
    emit();
    let url = shotUrlById.get(record.id);
    if (!url) {
      url = URL.createObjectURL(record.blob);
      shotUrls.add(url);
      shotUrlById.set(record.id, url);
    }
    if (session) {
      const look = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(new THREE.Quaternion(...record.quaternion))
        .multiplyScalar(15)
        .add(v(record.position));
      session.photographed({
        id: record.id,
        url,
        position: record.position,
        lookAt: look.toArray(),
        focalLength: record.settings.focalLength,
        ...record.captureEvidence,
        persisted: record.storageStatus !== "temporary",
      });
      saveStory();
    }
    // Capture finishes its exposure promise before any overlay freezes the view.
    await Promise.resolve();
    if (
      dead ||
      request !== realityRequest ||
      token !== enterToken ||
      !phaseActive()
    )
      return;
    const accepted = session?.snapshot.photos.find((p) => p.id === record.id);
    if (accepted?.taskId) {
      const album = await import("./photography/album");
      if ("associateTask" in album)
        await (
          album.associateTask as (
            id: string,
            taskId: string,
            label: string,
          ) => Promise<void>
        )(record.id, accepted.taskId, accepted.label ?? "任务照片").catch(
          () => {},
        );
    }
    try {
      const matcher = realityMatcher ?? (await RealityMatcher.load());
      if (
        dead ||
        request !== realityRequest ||
        token !== enterToken ||
        capturedMode !== mode ||
        !phaseActive()
      )
        return;
      realityMatcher = matcher;
      const match = matcher.evaluate(record, {
        mode: capturedMode,
        isLandmarkVisible: (point, r) => {
          const d = v(point).sub(v(r.position)),
            length = d.length();
          return (
            world.rayDistance(v(r.position), d.normalize(), length) >=
            length - 0.45
          );
        },
      });
      if (!match) return;
      await attachReality(record, match);
      if (
        dead ||
        request !== realityRequest ||
        token !== enterToken ||
        !phaseActive()
      )
        return;
      if (match.first) {
        realityMatch = match;
        setStoryOverlay("reality", true);
        emit();
      } else {
        info(`遇见现实 · ${match.association.title}，可在相册重看。`, 4);
        emit();
      }
    } catch {
      /* Optional discovery assets cannot stop an otherwise saved photograph. */
    }
  }
  function closeReality() {
    realityRequest++;
    realityMatch = undefined;
    setStoryOverlay("reality", false);
    emit();
  }
  function storyGuidance(action: StoryGuidanceAction) {
    if (!story || buffering || storyOverlayOpen) return;
    if (action === "replay" || phaseActive()) {
      story.guidance(action);
      saveStory();
      emit();
      if (phaseActive()) canvas.focus({ preventScroll: true });
    }
  }
  async function togglePhoto() {
    if (storyOverlayOpen) return;
    if (photo?.snapshot().open) {
      photo.close();
      world.setPhotoView(null);
      input.setPhotography(false);
      story?.guidance("closed");
      if (modeCapabilities(mode).photography && phaseActive() && !buffering) {
        syncObservationCursor();
        observe();
      }
      emit();
      return;
    }
    if (
      !phaseActive() ||
      buffering ||
      !modeCapabilities(mode).photography ||
      story?.snapshot.introActive ||
      story?.snapshot.cinematicActive ||
      (mode === "story" && !story?.snapshot.cameraReceived)
    )
      return;
    const serial = ++photoSerial,
      token = enterToken;
    try {
      await loadPhotoUI();
    } catch (error) {
      if (!dead && serial === photoSerial && token === enterToken)
        info("摄影界面未能载入，请再次举起相机重试。", 5);
      return;
    }
    if (
      dead ||
      serial !== photoSerial ||
      token !== enterToken ||
      !phaseActive()
    )
      return;
    if (!photo) {
      const m = await import("./photography/PhotoSystem");
      if (dead || serial !== photoSerial || token !== enterToken) return;
      photo = new m.PhotoSystem(renderer, scene, {
        mobile: touch,
        temporaryCount: () => temporaryPhotos.length,
        onChange: () => emit(),
        captureEvidence: (c) => photoEvidence(c),
        onFocusAcquired: () => {
          story?.guidance("focused");
          if (mode === "story") storyAudio.cue("focus");
          else audio.cameraCue("focus");
          emit();
        },
        onExposureStarted: () => {
          if (mode === "story") storyAudio.cue("shutter");
          else audio.cameraCue("shutter");
        },
        onRetryView: () => world.retryView(),
        onCapture: (r) => void captured(r),
      });
    }
    if (
      dead ||
      serial !== photoSerial ||
      token !== enterToken ||
      !phaseActive()
    )
      return;
    photo.setQuality(low);
    photo.setPreviewQuality(settings.quality, adaptiveRatio);
    photo.setPreviewMobile(renderProfile().previewMobile);
    photo.open(camera);
    story?.guidance("raised");
    input.setPhotography(true);
    syncObservationCursor();
    emit();
  }
  function storyAction(
    action:
      | "interact"
      | "advance"
      | "hint"
      | "skip"
      | "present"
      | "choose"
      | "credits",
    value?: number | boolean,
  ) {
    if (
      !story ||
      !phaseActive() ||
      buffering ||
      storyOverlayOpen ||
      photo?.snapshot().open
    )
      return;
    if (action === "credits") story.skipToCredits();
    else if (action === "present") story.setPresentOnly(Boolean(value));
    else if (action === "choose") story.choose(Number(value));
    else if (action === "skip") {
      if (story.snapshot.cinematicActive) {
        story.skipCinematic();
        pitch = 0;
      } else {
        story.skipIntro();
        finishOpening();
      }
      camera.fov = settings.fov;
      camera.updateProjectionMatrix();
    } else story[action]();
    saveStory();
    canvas.focus({ preventScroll: true });
    syncObservationCursor();
    observe();
    emit();
  }
  function photographyKeys(e: KeyboardEvent) {
    if (e.altKey || e.metaKey || e.ctrlKey || e.code === "Tab") {
      photo?.setFocusHeld("keyboard:F", false);
      return;
    }
    const target = e.target as HTMLElement | null;
    if (
      !phaseActive() ||
      buffering ||
      storyOverlayOpen ||
      /^(INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY|A)$/.test(
        target?.tagName || "",
      ) ||
      target?.isContentEditable ||
      target?.closest?.('[role="button"]') ||
      e.ctrlKey ||
      e.metaKey
    )
      return;
    if (e.code === "KeyF" && photo?.snapshot().open) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) photo.setFocusHeld("keyboard:F", true);
      return;
    }
    if (e.code === "KeyC" && modeCapabilities(mode).photography) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) void togglePhoto();
      return;
    }
    if (photo?.snapshot().open && e.code === "Space") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) void photo.capture().catch((e) => info(e.message));
    }
  }
  function photographyFocusIn(e: FocusEvent) {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || ""))
      photo?.setFocusHeld("keyboard:F", false);
  }
  function photographyKeyUp(e: KeyboardEvent) {
    if (e.code === "KeyF") photo?.setFocusHeld("keyboard:F", false);
  }
  function photographyWheel(e: WheelEvent) {
    if (!photo?.snapshot().open || !phaseActive() || storyOverlayOpen) return;
    e.preventDefault();
    photo.configure({
      focalLength: THREE.MathUtils.clamp(
        photo.snapshot().settings.focalLength + (e.deltaY > 0 ? -3 : 3),
        24,
        105,
      ),
    });
  }
  window.addEventListener("keydown", photographyKeys, true);
  window.addEventListener("keyup", photographyKeyUp, true);
  window.addEventListener("focusin", photographyFocusIn, true);
  canvas.addEventListener("wheel", photographyWheel, { passive: false });
  function finish(won: boolean, reason: string) {
    if (!phaseActive()) return;
    phase = won ? "won" : "lost";
    resultReason = reason;
    stamina.stop();
    input.setEnabled(false);
    input.reset();
    driving?.stop();
    driveChallenge?.finish();
    audio.finish(won);
    if (!training && mode === "escape" && escapeRound) {
      if (!won && escapeRound.phase !== "failed") escapeRound.fail("health");
      const result = escapeRound.snapshot().result;
      escapeBestBeforeResult = escapeBest;
      if (won && result && (escapeBest === null || result.score > escapeBest)) {
        escapeBest = result.score;
        try {
          localStorage.setItem(
            "qisheng-escape-0.3.0-" + escapeSelectedDifficulty,
            String(escapeBest),
          );
        } catch {}
      }
    }
    if (mode === "escape" && escapeRound?.result) {
      const r = escapeRound.result;
      ranked?.seal({
        won: r.won,
        elapsed: r.stats.elapsed,
        score: r.score,
        damage: r.stats.damage,
        headshots: r.stats.headshots,
        downs: r.stats.downs,
        uniqueDowns: r.stats.uniqueDowns,
        completed: r.stats.completed,
        controls: touchControls() ? "touch" : "keyboard",
        reason,
      });
    } else if (mode === "dafei" && driveChallenge) {
      ranked?.seal({
        won,
        elapsed: driveChallenge.elapsed,
        score: driveChallenge.score.score,
        hits: driveChallenge.score.hits,
        vehicleId:activeVehicleId,cannonShots,cannonHits:driveChallenge.score.cannonHits,totalHits:driveChallenge.score.totalHits,
        bestCombo: driveChallenge.score.bestCombo,
        controls: touchControls() ? "touch" : "keyboard",
        transmission: activeVehicleId==="bao5"?(settings.transmission ?? "auto"):"auto",
        reason,
      });
    }
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    emit();
  }
  function removeDropVisual(id: string) {
    dropVisuals.get(id)?.dispose();
    dropVisuals.delete(id);
  }
  function clearDrops() {
    pickupRequest++;
    pickupController?.abort();
    pickupController = null;
    for (const row of drops.reset()) removeDropVisual(row.id);
    for (const release of pickupLeases.values()) release();
    pickupLeases.clear();
  }
  function cleanupPickupLeases() {
    for (const [id, release] of pickupLeases) {
      if (
        inventory.primary?.id === id ||
        drops.all().some((d) => d.weapon === id)
      )
        continue;
      viewWeapon?.removeWeapon(id);
      release();
      pickupLeases.delete(id);
    }
  }
  function dropGun(gun: Magazine, p: THREE.Vector3) {
    if (mode !== "escape") return;
    gun.consumeEvents();
    const point = p.clone(),
      support = world.supportAt(point, ESCAPE_RULES.npcHeight);
    if (!support?.clear) return;
    point.y = support.height + 0.1;
    const { drop, removed } = drops.add(gun, point.toArray() as Vec3);
    if (removed) removeDropVisual(removed.id);
    try {
      const visual = createWorldWeapon(gun.id);
      visual.root.position.copy(point);
      visual.root.rotation.set(
        Math.PI / 2,
        (drops.all().length * 2.399963) % 6.283185,
        0,
      );
      scene.add(visual.root);
      dropVisuals.set(drop.id, visual);
    } catch {
      /* A drop remains interactable if its low-detail mesh is unavailable. */
    }
    cleanupPickupLeases();
  }
  function updateDrops(dt: number) {
    for (const row of drops.update(dt)) removeDropVisual(row.id);
    cleanupPickupLeases();
  }
  function pickupSnapshot(interaction = escapeInteraction()) {
    const d =
      interaction?.kind === "weapon" ? drops.get(interaction.id) : undefined;
    return d
      ? {
          id: d.id,
          label: WEAPONS[d.weapon].label,
          weapon: d.weapon,
          loading: d.pending,
          error: d.error,
        }
      : undefined;
  }
  async function takeWeapon(drop: WeaponDrop) {
    if (drop.pending || pickupController || mode !== "escape" || !phaseActive())
      return;
    const target =
      drop.weapon === "glock" ? inventory.pistol : inventory.primary;
    if (target?.id === drop.weapon) {
      const count = collectSameWeapon(target, drop.gun);
      if (!count) {
        info("备用弹药已满。", 2);
        return;
      }
      if (drop.gun.ammo + drop.gun.reserve === 0) {
        drops.remove(drop.id);
        removeDropVisual(drop.id);
      }
      audio.cue("pickup");
      info("弹药已补充。", 1.8);
      return;
    }
    const token = enterToken,
      request = ++pickupRequest,
      controller = new AbortController();
    pickupController = controller;
    drop.pending = true;
    drop.error = false;
    let acquired: (() => void) | undefined;
    emit();
    try {
      acquired = await prepareWeapons(
        () => {},
        [
          { id: drop.weapon, lod: "near" },
          { id: drop.weapon, lod: "far" },
        ],
        controller.signal,
      );
      if (
        dead ||
        token !== enterToken ||
        request !== pickupRequest ||
        controller.signal.aborted ||
        !phaseActive() ||
        drops.get(drop.id) !== drop
      )
        return;
      if (
        !pickupReachable(
          position,
          camera.position,
          v(drop.position),
          2,
          world.rayDistance,
        )
      )
        return;
      viewWeapon?.addWeapon(drop.weapon);
      const old = inventory.primary;
      magazine().cancelReload();
      drops.remove(drop.id);
      removeDropVisual(drop.id);
      pickupLeases.get(drop.weapon)?.();
      pickupLeases.set(drop.weapon, acquired);
      acquired = undefined;
      inventory.primary = drop.gun;
      weapon = drop.weapon;
      inventory.primary.resumeReload();
      if (old) {
        dropGun(old, position);
        if (old.id !== weapon) viewWeapon?.removeWeapon(old.id);
      }
      adsBlend = 0;
      equipLeft = 0.25;
      syncHeldWeapon();
      kick.reset();
      recoil = 0;
      audio.cue("pickup");
      info(WEAPONS[weapon].label + " 已装备。", 2);
    } catch {
      if (!dead && token === enterToken && request === pickupRequest) {
        drop.error = true;
        info("枪械未能载入，互动可重试。", 3);
      }
    } finally {
      acquired?.();
      if (drops.get(drop.id) === drop) drop.pending = false;
      if (request === pickupRequest) {
        pickupController = null;
        emit();
      }
    }
  }
  function syncHeldWeapon() {
    viewWeapon?.update(0, {
      weapon,
      moving: frameMoving,
      aim: false,
      reloading: magazine().reloadProgress,
      shotSerial,
      action: magazine().action,
      nearWall,
      empty: magazine().ammo === 0,
      recoil: 0,
      running: false,
      crouch: crouched,
    });
  }
  function updateNearWall() {
    if (mode !== "escape" || !viewWeapon) {
      nearWall = 0;
      return;
    }
    const muzzle = viewWeapon.getMuzzle(camera),
      delta = muzzle.clone().sub(camera.position),
      length = delta.length(),
      direction = camera.getWorldDirection(new THREE.Vector3()),
      front = world.rayDistance(camera.position, direction, 0.85),
      blocked =
        length > 0.001 &&
        world.rayDistance(camera.position, delta.divideScalar(length), length) <
          length - 0.03;
    nearWall = blocked ? 1 : THREE.MathUtils.clamp((0.65 - front) / 0.4, 0, 1);
  }
  function shotPresentation(
    id: WeaponId,
    origin: THREE.Vector3,
    endpoints: THREE.Vector3[],
    ejection: THREE.Vector3,
    barrel: THREE.Vector3,
    distance = 0,
  ) {
    const clear =
      distance < 0.1 ||
      tacticalGeometryVisible(
        camera.position.toArray() as Vec3,
        origin.toArray() as Vec3,
      );
    audio.shot(id, distance, origin, clear ? 0 : 0.7);
    for (const end of endpoints)
      effects.shot(origin, end, undefined, { eject: false, weapon: id });
    if (id !== "r870" && id !== "awm") effects.eject(ejection, barrel, id);
  }
  function switchWeapon() {
    if (!inventory.primary || equipLeft > 0) return;
    magazine().cancelReload();
    weapon = weapon === "glock" ? inventory.primary.id : "glock";
    magazine().resumeReload();
    equipLeft = 0.22;
    syncHeldWeapon();
    stamina.stop();
    recoil = 0;
    kick.reset();
    adsBlend = 0;
    playerReloadStage = 0;
  }
  function interact(id?: string) {
    const selected = escapeInteraction();
    const p = id
      ? supplies.find((s) => s.point.id === id && !s.collected)
      : supplies
          .filter(
            (s) =>
              !s.collected &&
              pickupReachable(
                position,
                camera.position,
                s.mesh.position,
                2.7,
                world.rayDistance,
              ),
          )
          .sort(
            (a, b) =>
              a.mesh.position.distanceToSquared(position) -
              b.mesh.position.distanceToSquared(position),
          )[0];
    if (!p) return;
    if (
      mode === "escape" &&
      selected?.kind === "supply" &&
      !selected.available
    ) {
      info("补给已满。", 1.8);
      return;
    }
    if (
      health >= 100 &&
      smokes >= 2 &&
      [inventory.pistol, inventory.primary].every(
        (g) => !g || g.reserve >= WEAPONS[g.id].reserve * 2,
      )
    ) {
      info("补给已满。", 1.8);
      return;
    }
    p.collected = true;
    p.mesh.visible = false;
    for (const gun of [inventory.pistol, inventory.primary]) {
      if (gun)
        gun.reserve = Math.min(
          WEAPONS[gun.id].reserve * 2,
          gun.reserve + WEAPONS[gun.id].capacity * 2,
        );
    }
    smokes = Math.min(2, smokes + 1);
    health =
      mode === "escape" ? escapeRecovery.refill() : Math.min(100, health + 20);
    audio.cue("pickup");
    info("补给已领取。", 2);
  }
  function beginReload() {
    const gun = magazine();
    if (!gun.reload()) return;
    playerReloadStage = 0;
    playerReloadSerial = gun.insertSerial;
  }
  function shoot() {
    if (
      equipLeft > 0 ||
      nearWall > 0.35 ||
      (weapon === "awm" && aiming && !scopeReady)
    )
      return;
    const gun = magazine();
    if (!gun.fire()) {
      if (gun.ammo === 0 && gun.reloadLeft === 0 && !gun.hasPendingReload) {
        audio.cue("empty");
        beginReload();
      }
      return;
    }
    stamina.stop();
    shotSerial++;
    rankEvent("shot", {
      shotId: shotSerial,
      weapon,
      position: position.toArray(),
      pellets: WEAPONS[weapon].pellets,
    });
    recoil = Math.min(1.5, recoil + 0.65);
    const def = WEAPONS[weapon];
    kick.kickWeapon(weapon, recoilRandom);
    const eye = camera.position.clone(),
      direction = camera.getWorldDirection(new THREE.Vector3()),
      muzzle = viewWeapon!.getMuzzle(camera),
      spread = playerWeaponSpread(weapon,{aim:aiming,actualSpeed,sliding:!!escapeMotion?.sliding}),
      ends: THREE.Vector3[] = [];
    let connected = false,
      priority: HitType = "body";
    for (let pellet = 0; pellet < def.pellets; pellet++) {
      const aim = direction
        .clone()
        .add(
          new THREE.Vector3(
            (random() - 0.5) * spread * 2,
            (random() - 0.5) * spread * 2,
            (random() - 0.5) * spread * 2,
          ),
        )
        .normalize();
      let cameraDistance = Math.min(
        def.range,
        world.rayDistance(eye, aim, def.range),
      );
      for (const n of npcs) {
        if (n.disabled > 0 || (mode === "escape" && !n.escapeActive)) continue;
        const h = n.rig.hitTest(eye, aim);
        if (h && h.distance < cameraDistance) cameraDistance = h.distance;
      }
      const aimPoint = eye.clone().addScaledVector(aim, cameraDistance),
        path = { direction: aimPoint.sub(muzzle).normalize() },
        fixedHit = world.rayImpact(muzzle, path.direction, def.range);
      let closest = fixedHit?.distance ?? def.range,
        victim: NPC | null = null,
        regionHit: BodyHit | null = null;
      for (const n of npcs) {
        if (n.disabled > 0 || (mode === "escape" && !n.escapeActive)) continue;
        const h = n.rig.hitTest(muzzle, path.direction);
        if (h && h.distance < closest) {
          closest = h.distance;
          victim = n;
          regionHit = h;
        }
      }
      const end = muzzle.clone().addScaledVector(path.direction, closest);
      ends.push(end);
      if (victim && regionHit) {
        if (mode === "escape") {
          escapeTactics.release(victim.id);
          victim.tacticalDecision = undefined;
          victim.repath = 0;
          victim.path = [];
        }
        victim.suppression += hitDamage(def.damage, regionHit.region);
        victim.hit = 0.3;
        if(victim.identity==='meng')cardsPursuit.interrupt();
        victim.lastKnown = position.clone();
        victim.memory = 7;
        victim.alert = true;
        victim.reaction = Math.max(victim.reaction, 0.35);
        connected = true;
        rankEvent("shot", {
          shotId: shotSerial,
          weapon,
          npcId: victim.id,
          generation: rankGeneration.get(victim.id) ?? 0,
          pellet,
          region: regionHit.region,
          hit: true,
        });
        if (regionHit.region === "head") priority = "head";
        if (victim.suppression >= 100) {
          if (mode === "escape")
            downEscape(victim, regionHit.region === "head");
          else victim.disabled = RULES.suppression;
          victim.path = [];
          victim.sees = false;
          cancelNpcFire(victim);
          victim.skill?.interrupt();
          victim.team.clear();
          priority = regionHit.region === "head" ? "head" : "suppressed";
          info(
            NPC_IDENTITY[victim.identity].name +
              (mode === "escape" ? "已击倒。" : "暂时被压制。"),
            2,
          );
        }
      }
      if (victim) effects.hit(end, true);
      else if (fixedHit && fixedHit.distance <= closest + 0.002) {
        const surface = classifyImpactSurface({ normal: fixedHit.normal });
        effects.hit(end, false, surface);
        audio.impact(surface, end);
      }
    }
    shotPresentation(
      weapon,
      muzzle,
      ends,
      viewWeapon!.getEjection(camera),
      viewWeapon!.getBarrelDirection(camera),
    );
    if (connected) {
      hit = 0.22;
      hitType = priority;
      audio.cue(
        priority === "head"
          ? "headshot"
          : priority === "suppressed"
            ? "suppressed"
            : "hit",
      );
    }
    if (mode === "escape") {
      escapeCombatMusicLeft = 5;
      investigateEscape(position, 38, 4);
    } else
      for (const n of npcs)
        if (n.disabled <= 0 && n.position.distanceTo(position) < 38) {
          n.lastKnown = position.clone();
          n.memory = 6;
          n.alert = true;
        }
  }

  function useGadget(){
    if(gadgetInventory.selectedGadget==='smoke'){throwSmoke();return;}
    if(gadgetInventory.selectedGadget==='cards'){
      if(!useCards(gadgetInventory,elapsed)){info(gadgetInventory.cardsUntil>elapsed?'扑克牌仍在生效。':'没有可用扑克牌。',2);return;}
      cardsPursuit.begin('local',gadgetInventory.cardsUse,0,position.toArray() as Vec3,gadgetInventory.cardsUntil);
      const meng=npcs.find(n=>n.identity==='meng');if(meng?.escapeActive){meng.lastKnown=position.clone();meng.memory=GADGET_RULES.cardsDuration;meng.repath=0;}
      rankEvent('gadget',{action:'use',kind:'cards',use:gadgetInventory.cardsUse});info('30秒内体力不消耗，孟庆升开始追缴。',3);audio.cue('pickup');return;
    }
    if(gadgetInventory.grenades<1){info('没有可用手榴弹。',2);return;}
    gadgetInventory.grenades--;const dir=camera.getWorldDirection(new THREE.Vector3()),length=Math.min(.6,world.rayDistance(camera.position,dir,.6)),point=camera.position.clone().addScaledVector(dir,Math.max(0,length-.08));
    const id='grenade-'+(++gadgetSerial);grenades.push({id,ownerId:'local',position:point.toArray() as Vec3,velocity:dir.multiplyScalar(11).add(new THREE.Vector3(0,3,0)).toArray() as Vec3,left:GADGET_RULES.grenadeFuse});
    rankEvent('gadget',{action:'use',kind:'grenade',id});audio.cue('smoke');
  }
  function updateGadgets(dt:number){
    for(let i=grenades.length-1;i>=0;i--){const grenade=grenades[i];grenade.left-=dt;grenade.velocity[1]-=9.8*dt;const point=v(grenade.position),delta=v(grenade.velocity).multiplyScalar(dt),length=delta.length();
      if(length>.00001){const dir=delta.divideScalar(length),wall=world.rayDistance(point,dir,length+.08);if(wall<length+.06){point.addScaledVector(dir,Math.max(0,wall-.08));grenade.velocity=grenade.velocity.map(value=>value*-.28) as Vec3;}else point.addScaledVector(dir,length);}
      const support=world.supportAt(point,.16);if(support?.clear&&point.y<support.height+.12){point.y=support.height+.12;grenade.velocity=[grenade.velocity[0]*.6,Math.abs(grenade.velocity[1])*.3,grenade.velocity[2]*.6];}grenade.position=point.toArray() as Vec3;
      if(grenade.left>0)continue;grenades.splice(i,1);gadgetScene.explosion(grenade.position);rankEvent('gadget',{action:'explode',kind:'grenade',id:grenade.id});audio.impact('ground',point);
      const chest=position.clone().add(new THREE.Vector3(0,.8,0)),selfDamage=grenadeDamage(chest.distanceTo(point),tacticalGeometryVisible(grenade.position,chest.toArray() as Vec3));
      if(selfDamage>0){const applied=Math.min(health,selfDamage);health=Math.max(0,health-selfDamage);escapeRound?.recordDamage(applied);escapeRecovery.noteDamage();rankEvent('damage',{amount:applied,source:'grenade',id:grenade.id,health});hurt=.5;if(health<=0){escapeRound?.fail('health');finish(false,'生命耗尽，行动失败。');return;}}
      for(const n of npcs){if(!n.escapeActive||n.disabled>0)continue;const center=n.position.clone().add(new THREE.Vector3(0,.85,0)),amount=grenadeDamage(center.distanceTo(point),tacticalGeometryVisible(grenade.position,center.toArray() as Vec3));if(amount<=0)continue;n.suppression+=amount;n.hit=.3;if(n.identity==='meng')cardsPursuit.interrupt();rankEvent('gadget',{action:'hit',kind:'grenade',id:grenade.id,npcId:n.id,generation:rankGeneration.get(n.id)??0,damage:amount});if(n.suppression>=100){rankEvent('gadget',{action:'down',kind:'grenade',id:grenade.id,npcId:n.id,generation:rankGeneration.get(n.id)??0});downEscape(n,false,true);}}
    }
    if(!cardsPursuit.targetId){gadgetScene.update(gadgetLoot,grenades,'local',true,elapsed,dt);return;}
    const meng=npcs.find(n=>n.identity==='meng'),distance=meng?.position.distanceTo(position)??Infinity;
    const path=meng?.escapeActive&&distance<=2?world.actorPath(meng.id,meng.position,position):[];
    const reachable=!!meng&&visible(meng.position.clone().add(new THREE.Vector3(0,1.3,0)),camera.position)&&path.length>0&&path.reduce((sum,p,index)=>sum+(index?p.distanceTo(path[index-1]):p.distanceTo(meng.position)),0)<=2.8;
    if(cardsPursuit.update(dt,{now:elapsed,targetId:'local',use:gadgetInventory.cardsUse,generation:0,alive:health>0,npcActive:!!meng?.escapeActive,distance,reachable})){
      const after=confiscatedHealth(health),amount=health-after;health=after;gadgetInventory.cardsUntil=0;escapeRound?.recordDamage(amount);escapeRecovery.noteDamage();rankEvent('gadget',{action:'confiscated',kind:'cards',use:gadgetInventory.cardsUse});if(amount>0)rankEvent('damage',{amount,source:'cards',health});hurt=.5;info('扑克牌被没收，损失一半当前生命。',3);
    }
    if(meng?.escapeActive&&cardsPursuit.targetId){if(!meng.sees&&cardsPursuit.clue){meng.lastKnown=v(cardsPursuit.clue);meng.memory=Math.max(meng.memory,.5);}if(cardsPursuit.windup>0){meng.path=[];meng.repath=0;cancelNpcFire(meng);}}
    gadgetScene.update(gadgetLoot,grenades,'local',true,elapsed,dt);
  }
  function throwSmoke() {
    if (smokes <= 0 || smokeReady > 0) {
      info("没有可用烟雾球。");
      return;
    }
    smokes--;
    smokeReady = 0.65;
    const origin = camera.position.clone(),
      direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = Math.max(-0.1, direction.y);
    direction.normalize();
    const distance = Math.min(
      8,
      Math.max(1, world.rayDistance(origin, direction, 8) - 0.6),
    );
    const point = world.nearest(origin.addScaledVector(direction, distance));
    point.y += 1.3;
    const mesh = new THREE.Group();
    mesh.position.copy(point);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xb9c1c2,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      roughness: 1,
    });
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.Mesh(
        new THREE.IcosahedronGeometry(i === 0 ? 3.4 : 2.35, 1),
        mat,
      );
      if (i > 0) {
        const a = (i * Math.PI) / 3;
        puff.position.set(Math.cos(a) * 2.1, (i % 2) * 0.5, Math.sin(a) * 2.1);
      }
      mesh.add(puff);
    }
    scene.add(mesh);
    clouds.push({ position: point, left: RULES.smokeDuration, age: 0, mesh });
    audio.cue("smoke");
    info("烟雾遮挡双方视线，持续 6 秒。", 2);
  }
  function visible(a: THREE.Vector3, b: THREE.Vector3) {
    const d = b.clone().sub(a),
      length = d.length();
    if (smokeBlocks(a, b, clouds)) return false;
    return (
      length < 0.01 ||
      world.rayDistance(a, d.divideScalar(length), length) > length - 0.12
    );
  }
  function npcTarget() {
    return position
      .clone()
      .add(
        new THREE.Vector3(0, mode === "dafei" ? 0.95 : crouched ? 0.8 : 1.2, 0),
      );
  }
  function npcVisible(a:THREE.Vector3,b:THREE.Vector3){return !smokeBlocks(a,b,clouds)&&world.visionVisible(a,b);}
  function trueSight(n: NPC) {
    return (
      n.sees &&
      (mode==='escape'?npcVisible:visible)(n.position.clone().add(new THREE.Vector3(0, 1.5, 0)), npcTarget())
    );
  }
  function senseNPCs(dt: number) {
    for (const n of npcs) {
      if (
        n.disabled > 0 ||
        (mode === "escape" && !n.escapeActive) ||
        driving?.npc(n.id) ||
        (mode === "escape" && elapsed < RULES.grace) ||
        (driveChallenge?.countdown ?? 0) > 0
      )
        continue;
      n.sense -= dt;
      n.repath -= dt;
      const dist = n.position.distanceTo(position),
        eye = n.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
        target = npcTarget();
      if (n.driveAI) {
        const brain = n.driveAI,
          old = brain.state,
          seen = brain.sees;
        let sense:
          | {
              sees: boolean;
              hears: boolean;
            }
          | undefined;
        if (n.sense <= 0) {
          n.sense = 0.16 + n.id * 0.015;
          const delta = target.clone().sub(eye),
            facing = Math.abs(
              wrapAngle(Math.atan2(delta.x, delta.z) - n.rig.root.rotation.y),
            ),
            clear = visible(eye, target),
            allowed = brain.canSense(position.toArray());
          sense = {
            sees:
              allowed &&
              dist < DRIVE_AI.sight &&
              (facing < 1.28 || dist < 5 || brain.state === "chase") &&
              clear,
            hears:
              allowed &&
              Math.abs(driving!.read().speed) > DRIVE_AI.hearingSpeed &&
              dist <
                (driveChallenge!.boost.left > 0
                  ? DRIVE_AI.boostHearing
                  : DRIVE_AI.hearing) &&
              clear,
          };
          if (visible(camera.position, eye) && dist < 60)
            driveChallenge?.hint(
              n.id,
              NPC_IDENTITY[n.identity].name,
              n.position.toArray(),
            );
        }
        brain.update(dt, n.position.toArray(), position.toArray(), sense);
        n.sees = brain.sees && brain.state === "chase";
        n.alert = brain.state === "chase" || brain.state === "investigate";
        n.memory = brain.memory;
        n.lastKnown = brain.target ? v(brain.target) : null;
        if (n.sees && !seen) n.reaction = 0.35;
        if (old !== brain.state) n.repath = 0;
      } else {
        n.memory = Math.max(0, n.memory - dt);
        if (n.sense <= 0) {
          n.sense = 0.16 + n.id * 0.015;
          const delta = target.clone().sub(eye),
            facing = Math.abs(
              wrapAngle(Math.atan2(delta.x, delta.z) - n.rig.root.rotation.y),
            ),
            sees = mode==='escape'
              ? npcSightEligible(eye.toArray() as Vec3,target.toArray() as Vec3,n.rig.root.rotation.y+Math.PI,crouched,true) && npcVisible(eye,target)
              : dist < (crouched ? 24 : 40) && (facing < 1.28 || dist < 5 || n.alert) && visible(eye, target);
          if (sees) {
            if (!n.sees) n.reaction = mode==='escape'?npcReaction(escapeSelectedDifficulty,random):0.7+random()*.45;
            n.lastKnown = position.clone();
            n.memory = mode==='escape'?NPC_COMBAT_PROFILES[escapeSelectedDifficulty].memory:7;
            n.alert = true;
            if (mode === "escape") n.tacticalSeen = true;
          } else if (
            actualSpeed > 0.25 &&
            n.heardStep !== footstepSerial &&
            dist <
              ((mode === "escape" ? escapeMotion?.sprinting : stamina.running)
                ? NPC_SENSE_RULES.hearingSprint
                : crouched
                  ? 3
                  : 9) &&
            Math.abs(n.position.y - footstepPoint.y) < 2 &&
            (mode==='escape'?npcVisible:visible)(
              eye,
              footstepPoint.clone().add(new THREE.Vector3(0, 0.5, 0)),
            )
          ) {
            n.heardStep = footstepSerial;
            n.lastKnown = footstepPoint.clone();
            n.memory = NPC_SENSE_RULES.footstepMemory;
            n.alert = true;
          }
          n.sees = sees;
          if (n.memory === 0) {
            n.lastKnown = null;
            n.alert = false;
            n.tacticalSeen = false;
          }
        }
      }
      const oldTeam = n.team.target;
      n.team.tick(dt, n.position.toArray(), n.sees);
      if (n.team.target && !n.sees) n.alert = true;
      if (oldTeam && !n.team.target) {
        n.repath = 0;
        if (!n.lastKnown) n.alert = false;
      }
    }
    if (mode === "escape") {
      extractionDefense.update(dt, !!escapeRound?.extractionAvailable, escapePlan?.extraction.position ?? world.manifest.extraction, escapeSelectedDifficulty,
        npcs.map(n => ({ id: n.id, position: n.position.toArray() as Vec3, active: !!n.escapeActive && n.disabled === 0 && elapsed >= ESCAPE_RULES.grace,
          sees: n.sees, known: n.lastKnown ? n.lastKnown.toArray() as Vec3 : n.team.target, busy: !!n.skill?.busy || n.gun.reloadLeft > 0 })), {
          project: point => { const q = world.nearest(v(point)), support = world.supportAt(q, ESCAPE_RULES.npcHeight);
            if (!support?.clear || support.normalY < .94 || Math.abs(support.height - q.y) > .18) return null;
            q.y = support.height; return q.toArray() as Vec3; },
          route: (id, from, to) => world.actorPath(id, v(from), v(to), false).map(p => p.toArray() as Vec3),
          safe: points => world.npcRouteSafe(points.map(v), points.slice(1).reduce((length, p, i) => length + v(p).distanceTo(v(points[i])), 0) + .05),
        });
      escapeTacticalAgents = npcs.map((n) => {
        const sites = escapePlan?.tasks.flatMap((t) => t.sites) ?? [],
          patrol = extractionDefense.goal(n.id) ?? (sites.length
              ? sites[(n.patrol + n.role) % sites.length].position
              : (n.position.toArray() as Vec3));
        if (
          !n.lastKnown &&
          !n.team.target &&
          v(patrol).distanceTo(n.position) < 2.5
        )
          n.patrol++;
        return {
          id: n.id,
          weapon: n.gun.id,
          position: n.position.toArray() as Vec3,
          known:
            n.team.target && !n.sees
              ? ([...n.team.target] as Vec3)
              : ((n.lastKnown?.toArray() as Vec3) ?? null),
          sees: n.sees,
          hasSeen: !!n.tacticalSeen,
          memory: Math.max(n.memory, n.team.left),
          active:
            !!n.escapeActive &&
            n.disabled === 0 &&
            elapsed >= ESCAPE_RULES.grace,
          busy: !!n.skill?.busy,
          reloading: n.gun.reloadLeft > 0,
          needsReload: n.gun.ammo === 0 && n.gun.reserve > 0,
          attackPhase: n.escapeAttack?.phase ?? "search",
          patrolTarget: [...patrol] as Vec3,
        };
      });
      escapeTactics.update(dt, escapeTacticalAgents, escapeSelectedDifficulty);
      contactProbe -= dt;
      if (contactProbe <= 0) {
        contactProbe = 0.12;
        updateEscapeContacts();
      }
    }
  }
  function updateEscapeContacts() {
    for (const n of npcs) {
      if (!n.escapeActive || n.disabled > 0) continue;
      const body = n.position.clone().add(new THREE.Vector3(0, 1, 0)),
        frame = body.clone().project(camera);
      if (
        n.position.distanceTo(camera.position) < 60 &&
        frame.z > -1 &&
        frame.z < 1 &&
        Math.abs(frame.x) < 1 &&
        Math.abs(frame.y) < 1 &&
        visible(camera.position, body)
      )
        escapeContacts.seen(n.id, n.position.toArray() as Vec3, elapsed);
    }
  }
  function calloutRecipient(source: NPC, target: THREE.Vector3) {
    let chosen: {
      npc: NPC;
      path: THREE.Vector3[];
      length: number;
    } | null = null;
    for (const candidate of npcs) {
      if (
        candidate === source ||
        (mode === "escape" && !candidate.escapeActive) ||
        candidate.disabled > 0 ||
        driving?.npc(candidate.id) ||
        candidate.sees ||
        candidate.skill?.busy ||
        candidate.gun.reloadLeft > 0 ||
        candidate.team.target ||
        candidate.driveAI?.state === "return" ||
        (candidate.driveAI?.reacquire ?? 0) > 0 ||
        source.position.distanceTo(candidate.position) >
          NPC_SKILLS.callout.allyDistance
      )
        continue;
      const path =
        mode === "dafei"
          ? world.pathOutdoor(candidate.position, target)
          : world.actorPath(candidate.id, candidate.position, target, false);
      if (path.length < 2 || path.at(-1)!.distanceTo(target) > 1.5) continue;
      if (
        candidate.driveAI &&
        !calloutPathInRegion(
          candidate.driveAI.region,
          path.map((p) => p.toArray()),
          target.toArray(),
        )
      )
        continue;
      const length = path
        .slice(1)
        .reduce((sum, p, i) => sum + p.distanceTo(path[i]), 0);
      if (mode === "escape" && !world.npcRouteSafe(path, length + 0.05))
        continue;
      if (
        !chosen ||
        length < chosen.length ||
        (length === chosen.length && candidate.id < chosen.npc.id)
      )
        chosen = { npc: candidate, path, length };
    }
    return chosen;
  }
  function cancelNpcFire(n: NPC) {
    n.escapeAttack?.cancel();
    escapeFire.release(n.id);
    n.attack.cancel();
    n.driveAttack?.cancel();
    driveFire.release(n.id);
    n.fire = 0;
  }
  function updateNpcSkills(dt: number) {
    callouts.length = 0;
    for (const n of npcs) {
      if (mode === "escape" && !n.escapeActive) continue;
      const skill = n.skill;
      n.skillProbe = Math.max(0, n.skillProbe - dt);
      if (
        n.identity === "chengguotao" &&
        !bossNoticed &&
        n.disabled === 0 &&
        n.position.distanceTo(camera.position) < 60
      ) {
        const eye = n.position.clone().add(new THREE.Vector3(0, 1, 0)),
          projected = eye.clone().project(camera);
        if (
          projected.z > -1 &&
          projected.z < 1 &&
          Math.abs(projected.x) < 0.95 &&
          Math.abs(projected.y) < 0.95 &&
          visible(camera.position, eye)
        ) {
          bossNoticed = true;
          info("程国涛 · 校长", 2.5);
          audio.npcCue("principal", n.position);
        }
      }
      if (!skill) continue;
      if (n.disabled > 0 || driving?.npc(n.id)) {
        skill.interrupt();
        n.team.clear();
        continue;
      }
      skill.tick(dt);
      if (skill.busy) {
        if (
          !trueSight(n) ||
          n.driveAI?.state === "return" ||
          (skill.kind === "sprint" &&
            !world.npcRouteSafe(
              [n.position, ...n.path],
              Math.min(
                mode === "escape" ? 8.64 : 6.48,
                Math.max(
                  0.4,
                  skill.left *
                    (mode === "escape" ? 7.2 : NPC_SKILLS.sprint.speed),
                ),
              ),
            ))
        ) {
          skill.interrupt();
          n.repath = 0;
          continue;
        }
        cancelNpcFire(n);
        if (skill.kind === "callout" && skill.phase === "active")
          callouts.push(n);
        continue;
      }
      if (
        skill.phase !== "ready" ||
        elapsed < NPC_SKILLS.grace ||
        n.skillProbe > 0 ||
        !trueSight(n) ||
        n.gun.reloadLeft > 0 ||
        n.reaction > dt
      )
        continue;
      n.skillProbe = 0.25;
      const distance = n.position.distanceTo(position),
        def = NPC_SKILLS[skill.kind],
        attack =
          mode === "escape"
            ? n.escapeAttack?.phase
            : (n.driveAttack?.phase ?? n.attack.phase);
      if (
        distance < def.minDistance ||
        distance > def.maxDistance ||
        attack === "aim" ||
        attack === "fire"
      )
        continue;
      if (skill.kind === "sprint") {
        if (n.driveAI && n.driveAI.state !== "chase") continue;
        const path =
          mode === "dafei"
            ? world.pathOutdoor(n.position, position)
            : world.actorPath(n.id, n.position, position);
        if (!world.npcRouteSafe([n.position, ...path])) continue;
        n.path = path;
        n.destination.copy(position);
        n.repath = 0.5;
      } else if (!calloutRecipient(n, position.clone())) continue;
      if (skill.begin()) {
        cancelNpcFire(n);
        if (skill.kind === "callout") info("校长点名：那边的，过去看看。", 1.4);
        audio.npcCue(skill.kind, n.position);
      }
    }
  }
  function deliverCallouts() {
    for (const source of callouts) {
      if (!source.skill?.busy || source.disabled > 0 || !trueSight(source)) {
        source.skill?.interrupt();
        continue;
      }
      const target = position.clone(),
        chosen = calloutRecipient(source, target);
      if (chosen) {
        const n = chosen.npc,
          path =
            mode === "dafei"
              ? chosen.path
              : world.actorPath(n.id, n.position, target);
        if (
          path.length >= 2 &&
          (!n.driveAI ||
            n.driveAI.receiveCallout(
              target.toArray(),
              NPC_SKILLS.callout.memory,
            ))
        ) {
          n.team.receive(target.toArray());
          n.path = path;
          n.destination.copy(target);
          n.repath = 0.5;
          n.sees = false;
          n.alert = true;
          cancelNpcFire(n);
        }
      }
      source.skill.complete();
    }
    callouts.length = 0;
  }
  function driveRigState(n: NPC, speed = 0) {
    const attack = n.driveAttack!,
      target = position.clone().add(new THREE.Vector3(0, 0.95, 0));
    return {
      skill: n.skill?.busy ? n.skill.kind : undefined,
      speed,
      aim:
        !n.skill?.busy && (attack.phase === "aim" || attack.phase === "fire"),
      firing: n.fire > 0,
      reloading: n.gun.reloadLeft > 0,
      suppressed: 0,
      hit: n.hit,
      attackPhase: attack.phase,
      aimTarget: n.sees ? target : undefined,
      reloadProgress: n.gun.reloadProgress,
      shotSerial: n.shotSerial,
    };
  }
  function updateDrivingNPC(n: NPC, dt: number) {
    const brain = n.driveAI!,
      attack = n.driveAttack!,
      thrown = driving!.npc(n.id);
    if (thrown) {
      driveFire.release(n.id);
      attack.cancel("suppressed");
      n.position.copy(thrown.position);
      n.disabled = Math.max(0.001, thrown.remaining);
      n.sees = false;
      n.path = [];
      return;
    }
    n.gun.update(dt);
    n.fire = Math.max(0, n.fire - dt);
    n.hit = Math.max(0, n.hit - dt);
    n.reaction = Math.max(0, n.reaction - dt);
    if (driveChallenge!.countdown > 0) {
      n.position.copy(
        world.moveActor(n.id, n.position, new THREE.Vector3(), dt),
      );
      n.rig.root.position.copy(n.position);
      n.rig.update(
        dt,
        driveRigState(n),
        n.position.distanceTo(position),
        camera,
      );
      return;
    }
    const dist = n.position.distanceTo(position);
    const dest = v(brain.destination);
    if (
      !n.skill?.busy &&
      !profileNavigationOff &&
      (n.repath <= 0 || n.destination.distanceToSquared(dest) > 4)
    ) {
      n.repath = 0.6 + n.id * 0.09;
      n.destination.copy(dest);
      n.path = world.pathOutdoor(n.position, dest);
    }
    const stopToFire =
      n.sees && dist < 22 && dist > 7 && (n.gun.ammo > 0 || n.gun.reserve > 0);
    let speed = brain.speed;
    if (n.skill?.busy)
      speed =
        n.skill.phase === "active" && n.skill.kind === "sprint"
          ? NPC_SKILLS.sprint.speed
          : 0;
    else if (stopToFire) speed = 0;
    if (!n.path.length) speed = 0;
    const move =
      speed > 0
        ? pathMotion(n.position, n.path, speed, dt)
        : new THREE.Vector3();
    for (const other of npcs) {
      if (other === n || other.disabled > 0) continue;
      const away = n.position.clone().sub(other.position).setY(0),
        d = away.length();
      if (d > 0 && d < 0.85)
        move.addScaledVector(away, ((0.85 - d) / d) * dt * 2);
    }
    n.position.copy(world.moveActor(n.id, n.position, move, dt));
    if (speed > 0 && n.previous.distanceToSquared(n.position) < 0.00001)
      n.stuck += dt;
    else n.stuck = 0;
    if (n.stuck > 1.25) {
      n.repath = 0;
      n.path = [];
      n.stuck = 0;
    }
    n.previous.copy(n.position);
    const facing = n.sees ? position : n.path[0];
    if (facing) {
      const angle = Math.atan2(
        facing.x - n.position.x,
        facing.z - n.position.z,
      );
      n.rig.root.rotation.y +=
        wrapAngle(angle - n.rig.root.rotation.y) * Math.min(1, dt * 7);
    }
    n.rig.root.position.copy(n.position);
    n.rig.update(dt, driveRigState(n, speed), dist, camera);
    if (speed > 0 && dist < 28) {
      n.step += dt * speed;
      if (n.step > 0.95) {
        n.step = 0;
        audio.step("road", n.alert, dist);
      }
    }
  }
  function updateDrivingCombat(dt: number) {
    const target = position.clone().add(new THREE.Vector3(0, 0.95, 0)),
      candidates = npcs.map((n) => {
        const eye = n.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
          muzzle = n.rig.getMuzzleWorld(),
          eligible =
            elapsed >= DRIVE_RULES.grace &&
            !n.skill?.busy &&
            n.disabled === 0 &&
            n.driveAI!.state === "chase" &&
            n.sees &&
            n.reaction <= 0 &&
            n.position.distanceTo(position) < WEAPONS[n.gun.id].range * 0.75 &&
            visible(eye, target) &&
            visible(muzzle, target);
        if (
          eligible &&
          n.gun.ammo === 0 &&
          n.gun.reloadLeft === 0 &&
          n.gun.reload()
        ) {
          n.reloadStage = 0;
          n.reloadSerial = n.gun.insertSerial;
        }
        reloadSounds(
          n.gun,
          n.reloadStage,
          n.reloadSerial,
          muzzle,
          (stage, serial) => {
            n.reloadStage = stage;
            n.reloadSerial = serial;
          },
        );
        return {
          id: n.id,
          eligible: eligible && n.gun.ammo > 0,
          reloading: n.gun.reloadLeft > 0,
          automatic: WEAPONS[n.gun.id].automatic,
          attack: n.driveAttack!,
        };
      });
    driveFire.update(dt, candidates);
    for (const n of npcs) {
      if (!phaseActive()) break;
      const attack = n.driveAttack!,
        dist = n.position.distanceTo(position),
        muzzle = n.rig.getMuzzleWorld(),
        eye = n.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      if (
        !n.skill?.busy &&
        driveFire.canFire(n.id, attack) &&
        n.sees &&
        n.driveAI!.state === "chase" &&
        n.rig.isAimReady(target) &&
        visible(eye, target) &&
        visible(muzzle, target) &&
        n.gun.fire()
      ) {
        n.fire = 0.05;
        n.shotSerial++;
        rankEvent("shot", {
          actor: "npc",
          npcId: n.id,
          generation: rankGeneration.get(n.id) ?? 0,
          weapon: n.gun.id,
          shotId: n.shotSerial,
          position: muzzle.toArray(),
        });
        driveFire.shot(n.id, attack, random);
        if (dist < 45)
          driveChallenge!.hint(
            n.id,
            NPC_IDENTITY[n.identity].name,
            n.position.toArray(),
          );
        const spec = WEAPONS[n.gun.id],
          base = n.rig.getMuzzleDirectionWorld(),
          aimError = 0.062;
        base
          .add(
            new THREE.Vector3(
              (random() - 0.5) * aimError * 2,
              (random() - 0.5) * aimError * 2,
              (random() - 0.5) * aimError * 2,
            ),
          )
          .normalize();
        let damage = 0,
          end = muzzle.clone().addScaledVector(base, spec.range);
        const endpoints: THREE.Vector3[] = [];
        for (let pellet = 0; pellet < spec.pellets; pellet++) {
          const dir = base
              .clone()
              .add(
                new THREE.Vector3(
                  (random() - 0.5) * spec.spread * 2,
                  (random() - 0.5) * spec.spread * 2,
                  (random() - 0.5) * spec.spread * 2,
                ),
              )
              .normalize(),
            fixedHit = world.rayImpact(muzzle, dir, spec.range),
            wall = fixedHit?.distance ?? spec.range,
            vehicleHit = driving!.hitDistance(muzzle, dir, spec.range);
          if (vehicleHit !== null && vehicleHit < wall) {
            damage += spec.damage * DRIVE_RULES.damageScale;
            end = muzzle.clone().addScaledVector(dir, vehicleHit);
          } else {
            end = muzzle
              .clone()
              .addScaledVector(dir, Math.min(wall, spec.range));
            if (wall < spec.range - 0.1) {
              const surface = classifyImpactSurface({
                normal: fixedHit?.normal,
              });
              effects.hit(end, false, surface);
              audio.impact(surface, end);
            }
          }
          endpoints.push(end);
        }
        shotPresentation(
          n.gun.id,
          muzzle,
          endpoints,
          n.rig.getEjectionWorld(),
          n.rig.getMuzzleDirectionWorld(),
          dist,
        );
        if (damage > 0) {
          const applied = Math.min(driveChallenge!.durability, damage);
          driveChallenge!.damage(damage);
          rankEvent("damage", {
            amount: applied,
            npcId: n.id,
            weapon: n.gun.id,
            durability: driveChallenge!.durability,
          });
          health = (driveChallenge!.durability / driveChallenge!.vehicle.durability) * 100;
          hurt = 0.5;
          directions.add(n.id, muzzle, damage);
          audio.cue("hurt");
          if (driveChallenge!.durability <= 0) {
            showCarSmoke();
            finish(false, "车辆耐久耗尽。");
            return;
          }
        }
      }
      if (!driving!.npc(n.id)) n.rig.update(0, driveRigState(n), dist, camera);
    }
  }
  function updateNPC(n: NPC, dt: number) {
    const thrown = driving?.npc(n.id);
    if (thrown) {
      n.position.copy(thrown.position);
      n.disabled = Math.max(0.001, thrown.remaining);
      n.sees = false;
      n.path = [];
      n.attack.cancel("suppressed");
      n.rig.root.position.copy(n.position);
      n.rig.root.quaternion.copy(thrown.rotation);
      n.rig.update(
        dt,
        {
          speed: 0,
          aim: false,
          firing: false,
          reloading: false,
          suppressed: 0.001,
          hit: 0,
          attackPhase: "suppressed",
        },
        n.position.distanceTo(position),
        camera,
      );
      return;
    }
    n.gun.update(dt);
    n.fire = Math.max(0, n.fire - dt);
    n.hit = Math.max(0, n.hit - dt);
    n.reaction = Math.max(0, n.reaction - dt);
    if (n.disabled > 0) {
      n.disabled = Math.max(0, n.disabled - dt);
      n.position.copy(
        world.moveActor(n.id, n.position, new THREE.Vector3(), dt, true),
      );
      n.rig.root.position.copy(n.position);
      n.rig.update(
        dt,
        {
          speed: 0,
          aim: false,
          firing: false,
          reloading: false,
          suppressed: n.disabled || 0.001,
          hit: n.hit,
          attackPhase: "suppressed",
          shotSerial: n.shotSerial,
        },
        n.position.distanceTo(position),
        camera,
      );
      if (n.disabled === 0) {
        n.attack.cancel();
        n.suppression = 0;
        n.lastKnown = null;
        n.memory = 0;
        n.alert = false;
        n.repath = 0;
        n.reaction = 1.2;
        n.skill?.recover();
        n.team.clear();
      }
      return;
    }
    if (elapsed < RULES.grace) {
      n.position.copy(
        world.moveActor(n.id, n.position, new THREE.Vector3(), dt),
      );
      n.rig.root.position.copy(n.position);
      n.rig.update(
        dt,
        {
          speed: 0,
          aim: false,
          firing: false,
          reloading: false,
          suppressed: 0,
          hit: 0,
          attackPhase: "search",
          shotSerial: n.shotSerial,
        },
        n.position.distanceTo(position),
        camera,
      );
      return;
    }
    const dist = n.position.distanceTo(position),
      eye = n.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
      target = npcTarget();
    if (!n.skill?.busy && !profileNavigationOff && n.repath <= 0) {
      n.repath = 0.9 + n.id * 0.23;
      let dest: THREE.Vector3;
      if (n.team.target && !n.sees) {
        dest = v(n.team.target);
      } else if (n.lastKnown) {
        dest = n.lastKnown.clone();
        if (n.role === 1 && dist > 12) {
          const dir = dest.clone().sub(n.position).normalize();
          dest.add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(8));
          dest = world.nearest(dest);
        } else if (n.role === 2 && !n.sees && n.position.distanceTo(dest) < 3) {
          dest = world.nearest(
            dest.add(
              new THREE.Vector3(
                (random() - 0.5) * 12,
                0,
                (random() - 0.5) * 12,
              ),
            ),
          );
        }
      } else {
        const sites =
          mode === "dafei"
            ? driveMap!.npcSpawns.map((p, i) => ({
                id: String(i),
                label: "室外道路",
                position: p,
              }))
            : world.manifest.clues;
        dest = v(sites[(n.patrol + n.role) % sites.length].position);
        if (n.position.distanceTo(dest) < 3)
          n.patrol = (n.patrol + 1) % sites.length;
      }
      n.destination.copy(dest);
      n.path =
        mode === "dafei"
          ? world.pathOutdoor(n.position, dest)
          : world.path(n.position, dest);
    }
    let speed = 0;
    const stopToFire =
      n.sees && dist < 22 && dist > 7 && (n.gun.ammo > 0 || n.gun.reserve > 0);
    if (
      n.path.length &&
      (!stopToFire || n.skill?.phase === "active") &&
      (!n.skill?.busy ||
        (n.skill.kind === "sprint" && n.skill.phase === "active"))
    ) {
      speed =
        n.skill?.phase === "active" && n.skill.kind === "sprint"
          ? NPC_SKILLS.sprint.speed
          : mode === "dafei"
            ? n.alert
              ? 4.2
              : 2.3
            : n.alert
              ? n.role === 0
                ? 3.1
                : 2.9
              : 1.75;
      const move = pathMotion(n.position, n.path, speed, dt);
      for (const other of npcs) {
        if (other === n || other.disabled > 0) continue;
        const away = n.position.clone().sub(other.position);
        away.y = 0;
        const d = away.length();
        if (d > 0 && d < 0.85)
          move.addScaledVector(away, ((0.85 - d) / d) * dt * 2);
      }
      n.position.copy(world.moveActor(n.id, n.position, move, dt));
      if (n.previous.distanceToSquared(n.position) < 0.00001) n.stuck += dt;
      else n.stuck = 0;
      if (n.stuck > 1.25) {
        n.repath = 0;
        n.path = [];
        n.stuck = 0;
      }
      n.previous.copy(n.position);
    }
    let facing: THREE.Vector3 | undefined;
    if (n.sees) facing = position;
    else if (n.path.length) facing = n.path[0];
    if (facing) {
      const angle = Math.atan2(
        facing.x - n.position.x,
        facing.z - n.position.z,
      );
      n.rig.root.rotation.y +=
        wrapAngle(angle - n.rig.root.rotation.y) * Math.min(1, dt * 7);
    }
    n.rig.root.position.copy(n.position);
    const rigState = () => ({
      skill: n.skill?.busy ? n.skill.kind : undefined,
      speed,
      aim: !n.skill?.busy && n.attack.phase !== "search",
      firing: n.fire > 0,
      reloading: n.gun.reloadLeft > 0,
      suppressed: 0,
      hit: n.hit,
      attackPhase: n.attack.phase,
      aimTarget: n.sees ? target : undefined,
      reloadProgress: n.gun.reloadProgress,
      shotSerial: n.shotSerial,
    });
    n.rig.update(dt, rigState(), dist, camera);
    const muzzle = n.rig.getMuzzleWorld(),
      eligible =
        !n.skill?.busy &&
        n.sees &&
        n.reaction <= 0 &&
        dist < WEAPONS[n.gun.id].range * 0.75 &&
        visible(eye, target) &&
        visible(muzzle, target);
    if (
      eligible &&
      n.gun.ammo === 0 &&
      n.gun.reloadLeft === 0 &&
      n.gun.reload()
    ) {
      n.reloadStage = 0;
      n.reloadSerial = n.gun.insertSerial;
    }
    reloadSounds(
      n.gun,
      n.reloadStage,
      n.reloadSerial,
      muzzle,
      (stage, serial) => {
        n.reloadStage = stage;
        n.reloadSerial = serial;
      },
    );
    const fireReady = n.attack.update(
      dt,
      eligible,
      n.gun.reloadLeft > 0,
      WEAPONS[n.gun.id].automatic,
    );
    if (fireReady && n.rig.isAimReady(target) && n.gun.fire()) {
      n.fire = 0.05;
      n.shotSerial++;
      n.attack.shot(random);
      if (mode === "dafei" && dist < 45)
        driveChallenge?.hint(
          n.id,
          NPC_IDENTITY[n.identity].name,
          n.position.toArray(),
        );
      const spec = WEAPONS[n.gun.id],
        base = n.rig.getMuzzleDirectionWorld(),
        aimError =
          (crouched ? 0.055 : 0.042) +
          (stamina.running ? 0.025 : 0) +
          (mode === "dafei" ? 0.02 : 0);
      base
        .add(
          new THREE.Vector3(
            (random() - 0.5) * aimError * 2,
            (random() - 0.5) * aimError * 2,
            (random() - 0.5) * aimError * 2,
          ),
        )
        .normalize();
      let damage = 0,
        end = muzzle.clone().addScaledVector(base, spec.range);
      const endpoints: THREE.Vector3[] = [];
      for (let pellet = 0; pellet < spec.pellets; pellet++) {
        const dir = base
            .clone()
            .add(
              new THREE.Vector3(
                (random() - 0.5) * spec.spread * 2,
                (random() - 0.5) * spec.spread * 2,
                (random() - 0.5) * spec.spread * 2,
              ),
            )
            .normalize(),
          fixedHit = world.rayImpact(muzzle, dir, spec.range),
          wall = fixedHit?.distance ?? spec.range,
          playerHit =
            mode === "dafei"
              ? driving!.hitDistance(muzzle, dir, spec.range)
              : characterHit(muzzle, dir, position, crouched);
        if (playerHit !== null && playerHit < wall) {
          damage +=
            spec.damage * (mode === "dafei" ? DRIVE_RULES.damageScale : 0.4);
          end = muzzle.clone().addScaledVector(dir, playerHit);
        } else {
          end = muzzle.clone().addScaledVector(dir, Math.min(wall, spec.range));
          if (wall < spec.range - 0.1) {
            const surface = classifyImpactSurface({ normal: fixedHit?.normal });
            effects.hit(end, false, surface);
            audio.impact(surface, end);
          }
        }
        endpoints.push(end);
      }
      shotPresentation(
        n.gun.id,
        muzzle,
        endpoints,
        n.rig.getEjectionWorld(),
        n.rig.getMuzzleDirectionWorld(),
        dist,
      );
      n.rig.update(0, rigState(), dist, camera);
      if (damage > 0) {
        if (mode === "dafei") {
          driveChallenge!.damage(damage);
          health = (driveChallenge!.durability / driveChallenge!.vehicle.durability) * 100;
        } else health = Math.max(0, health - damage);
        hurt = 0.5;
        directions.add(n.id, muzzle, damage);
        audio.cue("hurt");
        if (health <= 0)
          finish(
            false,
            mode === "dafei"
              ? "车辆耐久耗尽，本次驾驶挑战结束。"
              : "追逐者拦住了你。换一条路线，再试一次。",
          );
      }
    }
    if (speed === 0)
      n.position.copy(
        world.moveActor(n.id, n.position, new THREE.Vector3(), dt),
      );
    n.rig.root.position.copy(n.position);
    n.rig.update(0, rigState(), dist, camera);
    if (speed > 0 && dist < 28) {
      n.step += dt * speed;
      if (n.step > 0.95) {
        n.step = 0;
        audio.step("road", n.alert, dist);
      }
    }
  }
  function reloadSounds(
    gun: Magazine,
    _stage: number,
    _serial: number,
    source: THREE.Vector3 | undefined,
    set: (stage: number, serial: number) => void,
  ) {
    for (const event of gun.consumeEvents())
      if (event.kind !== "shot") {
        audio.mechanical(gun.id, event.kind, source);
        if ((event.kind === "pump" || event.kind === "bolt") && event.eject) {
          if (source) {
            const n = npcs.find((n) => n.gun === gun);
            if (n)
              effects.eject(
                n.rig.getEjectionWorld(),
                n.rig.getMuzzleDirectionWorld(),
                gun.id,
              );
          } else if (viewWeapon)
            effects.eject(
              viewWeapon.getEjection(camera),
              viewWeapon.getBarrelDirection(camera),
              gun.id,
            );
        }
      }
    set(0, gun.insertSerial);
  }
  function repairMarker(point: Point) {
    const root = new THREE.Group();
    root.name = point.label;
    root.position.fromArray(point.position);
    const mat = new THREE.MeshBasicMaterial({ color: 0xa05b47 });
    for (const [x, z] of [
      [-2.6, -2.6],
      [2.6, -2.6],
      [-2.6, 2.6],
      [2.6, 2.6],
    ]) {
      for (const axis of [0, 1]) {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(axis ? 0.12 : 1, 0.025, axis ? 1 : 0.12),
          mat,
        );
        strip.position.set(x, 0.055, z);
        root.add(strip);
      }
    }
    scene.add(root);
    return root;
  }
  function updateDriveCamera(dt: number, instant = false) {
    if (!driving) return;
    const state = driving.read(),
      speedGain = drivingCameraGain(
        state.horizontalSpeed,
        matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
      target = state.position
        .clone()
        .add(new THREE.Vector3(0, vehicleDefinition(activeVehicleId).camera.targetHeight, 0)),
      angle = state.yaw + orbit;
    const desired = target
        .clone()
        .add(
          new THREE.Vector3(
            Math.sin(angle) * (vehicleDefinition(activeVehicleId).camera.distance + speedGain),
            vehicleDefinition(activeVehicleId).camera.height + Math.sin(orbitPitch) * 3,
            Math.cos(angle) * (vehicleDefinition(activeVehicleId).camera.distance + speedGain),
          ),
        ),
      direction = desired.clone().sub(target),
      distance = direction.length();
    direction.normalize();
    const safe = driving.cameraDistance(target, direction, distance);
    desired.copy(target).addScaledVector(direction, Math.max(0.3, safe - 0.12));
    if (instant) camera.position.copy(desired);
    else camera.position.lerp(desired, 1 - Math.exp(-dt * 9));
    const check = camera.position.clone().sub(target),
      length = check.length();
    if (length > 0.001) {
      check.divideScalar(length);
      const allowed = driving.cameraDistance(target, check, length);
      if (allowed < length)
        camera.position
          .copy(target)
          .addScaledVector(check, Math.max(0.25, allowed - 0.12));
    }
    const viewTarget=activeVehicleId==='tank'?target.clone().add(new THREE.Vector3(0,0,-25).applyAxisAngle(UP,angle)):target;
    camera.lookAt(viewTarget);
    if (settings.recoilShake && impactShake > 0)
      camera.rotation.z = Math.sin(elapsed * 45) * impactShake * 0.018;
    else camera.rotation.z = 0;
    yaw = camera.rotation.y;
    const wanted = settings.fov + speedGain * 4;
    camera.fov = THREE.MathUtils.damp(camera.fov, wanted, 8, dt || 1);
    camera.updateProjectionMatrix();
  }
  function registerDrivingKnockdown(n:NPC,source:'collision'|'cannon',speed=0,shotId?:number) {
    if(!driveChallenge)return;
    n.disabled=.001;n.path=[];n.sees=false;n.attack.cancel("suppressed");n.driveAttack?.cancel("suppressed");n.skill?.interrupt();n.team.clear();driveFire.release(n.id);
    const data={npcId:n.id,generation:rankGeneration.get(n.id)??0,identity:n.identity,speed};
    if(source==='collision')rankEvent('hit',data);else rankEvent('cannon',{...data,action:'hit',shotId});
    const gained=driveChallenge.hit(n.id,source);impactShake=source==='collision'?.6:.2;audio.vehicleCue('impact');info(`${NPC_IDENTITY[n.identity].name}${source==='collision'?'被撞飞':'被击倒'}　+${gained}`,1.8);
  }
  function drivingProjectileHit(origin:THREE.Vector3,direction:THREE.Vector3,length:number){
    const fixed=world.rayImpact(origin,direction,length);let best=fixed&&fixed.distance<=length?{distance:fixed.distance,normal:new THREE.Vector3(fixed.normal.x,fixed.normal.y,fixed.normal.z)}:null;
    for(const n of npcs){if(n.disabled>0||driving?.npc(n.id))continue;const hit=characterHit(origin,direction,n.position,false);if(hit!==null&&hit<=length&&(!best||hit<best.distance))best={distance:hit,normal:direction.clone().negate()};}
    return best;
  }
  function fireDrivingCannon(){
    if(!cannon||!car?.muzzle||!driving)return;
    if(cannon.ammo===0){info('炮弹已用尽。',1.5);return;}
    if(cannon.cooldown>0)return;
    const muzzle=car.muzzle(),pivot=driving.read().position.clone().add(new THREE.Vector3(0,1.55,0)),delta=muzzle.position.clone().sub(pivot),length=delta.length(),dir=delta.clone().normalize(),wall=world.rayDistance(pivot,dir,length+.04);
    if(wall<length){info('炮口受阻，调整位置后再开火。',1.5);return;}
    const id=cannon.fire(muzzle.position,muzzle.direction);if(id===null)return;cannonShots++;
    rankEvent('cannon',{action:'fire',shotId:id,position:muzzle.position.toArray(),direction:muzzle.direction.toArray()});audio.shot('awm',0,muzzle.position);impactShake=.35;
  }
  function explodeDrivingCannon(id:number,point:THREE.Vector3){
    if(!driving||!driveChallenge)return;rankEvent('cannon',{action:'explode',shotId:id,position:point.toArray()});
    for(const npcId of driving.blast(point,CANNON.radius)){const n=npcs.find(n=>n.id===npcId);if(n)registerDrivingKnockdown(n,'cannon',0,id);}
    const target=driving.read().position.clone().add(new THREE.Vector3(0,.8,0)),distance=point.distanceTo(target);
    if(distance<CANNON.radius&&world.rayDistance(point,target.clone().sub(point).normalize(),distance)>=distance-.1){const amount=Math.min(driveChallenge.durability,100*(1-distance/CANNON.radius));if(amount>0){driveChallenge.damage(amount);rankEvent('damage',{amount,source:'cannon',shotId:id,health:driveChallenge.durability});hurt=.4;}}
  }
  function updateDriving(dt: number, frame: import("./types.ts").InputFrame) {
    if (!driving || !driveChallenge) return;
    const controls = frame.drive ?? {
        steer: 0,
        throttle: 0,
        brake: 0,
        handbrake: false,
        reverse: false,
        boost: false,
        reset: false,
      },
      before = driving.read();
    const events = driveChallenge.tick(
      dt,
      controls,
      before.horizontalSpeed,
      before.position.toArray(),
    );
    elapsed = driveChallenge.elapsed;
    health = (driveChallenge.durability / driveChallenge.vehicle.durability) * 100;
    emitClock += dt;
    noticeLeft = Math.max(0, noticeLeft - dt);
    if (!noticeLeft) notice = "";
    hurt = Math.max(0, hurt - dt);
    impactShake = Math.max(0, impactShake - dt * 3);
    if (events.reset && driving.reset()) {
      rankEvent("reset", { reason: "manual" });
      driveChallenge.resetCar();
      info("已脱困，扣除 50 分，连击已清空。");
    } else if (events.reset) {
      driveChallenge.resetProgress = 0;
      info("附近没有适合整车的安全路面，请稍后重试。");
    }
    if (events.repair) {
      if (events.repairEvent) rankEvent("repair", events.repairEvent);
      audio.cue("pickup");
      info(`车辆已维修：恢复 ${Math.round(events.repairEvent?.amount??0)} 耐久。`);
    }
    for (const supply of supplies) {
      supply.mesh.visible = !driveChallenge.isRepairUsed(supply.point.id);
    }
    if (frame.lookX || frame.lookY) {
      orbit -= frame.lookX * settings.sensitivity * 0.004;
      orbitPitch = THREE.MathUtils.clamp(
        orbitPitch + frame.lookY * 0.003,
        -0.2,
        0.85,
      );
    } else if (!frame.lookHeld && activeVehicleId!=="tank") {
      orbit = THREE.MathUtils.damp(orbit, 0, 1.4, dt);
      orbitPitch = THREE.MathUtils.damp(orbitPitch, 0.28, 1.4, dt);
    }
    if(activeVehicleId==='tank'&&car?.aim){
      const look=camera.getWorldDirection(new THREE.Vector3()),range=Math.min(180,world.rayDistance(camera.position,look,180)),aimPoint=camera.position.clone().addScaledVector(look,range),pivot=before.position.clone().add(new THREE.Vector3(0,1.55,0)),localAim=aimPoint.sub(pivot).normalize().applyQuaternion(before.rotation.clone().invert());
      car.aim(Math.atan2(-localAim.x,-localAim.z),THREE.MathUtils.clamp(Math.asin(localAim.y),-.13,.55));
    }
    const ready = driveChallenge.countdown <= 0;
    if(ready&&cannon&&frame.actions.has("fire"))fireDrivingCannon();
    cannon?.tick(dt,drivingProjectileHit,(id,point)=>explodeDrivingCannon(id,point));
    if (ready) {
      if (activeVehicleId==="bao5"&&frame.actions.has("shiftUp")) driving.shift(1);
      else if (activeVehicleId==="bao5"&&frame.actions.has("shiftDown")) driving.shift(-1);
    }
    driving.beforeStep(
      ready
        ? controls
        : {
            steer: 0,
            throttle: 0,
            brake: 1,
            handbrake: false,
            reverse: false,
            boost: false,
            reset: false,
          },
      ready && driveChallenge.boost.left > 0,
      dt,
    );
    frameMoving = before.horizontalSpeed;
    senseNPCs(dt);
    updateNpcSkills(dt);
    for (const n of npcs) {
      if (!phaseActive()) break;
      const began = import.meta.env.DEV ? performance.now() : 0;
      updateDrivingNPC(n, dt);
      if (import.meta.env.DEV) cpuNpcs += performance.now() - began;
    }
    deliverCallouts();
    updateDrivingCombat(dt);
    if (!phaseActive()) return;
    if (driveChallenge.durability <= 0) {
      showCarSmoke();
      finish(false, "车辆耐久耗尽，本次驾驶挑战结束。");
      return;
    }
    physicsMs = world.step(dt);
    const changes = driving.afterStep(dt),
      state = driving.read();
    position.copy(state.position);
    car?.update(state, dt);
    for (const impact of changes.impacts) {
      const n = npcs.find((n) => n.id === impact.id);
      if (!n) continue;
      registerDrivingKnockdown(n,'collision',impact.speed);
    }
    updateDriveCamera(dt);
    camera.updateMatrixWorld(true);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      ),
    );
    for (const n of npcs) {
      const thrown = driving.npc(n.id);
      if (thrown?.phase !== "respawning") continue;
      const wait = (respawnWait.get(n.id) ?? 0) - dt;
      if (wait > 0) {
        respawnWait.set(n.id, wait);
        continue;
      }
      respawnWait.set(n.id, RESPAWN_RULES.retry);
      const region = n.driveAI!.region,
        candidate = chooseDrivingRespawn(
          region.respawnPoints ?? region.spawnPoints,
          lastSpawn.get(n.id) ?? n.driveAI!.spawn,
          position.toArray() as Vec3,
          (p) =>
            !frustum.intersectsSphere(
              new THREE.Sphere(v(p).add(new THREE.Vector3(0, 0.9, 0)), 1.3),
            ),
          (p) => {
            const support = world.supportAt(v(p), 1.75);
            if (!support?.clear) return false;
            return (
              world.pathOutdoor(v(p), v(region.home)).length > 1 ||
              v(p).distanceTo(v(region.home)) < 1
            );
          },
          random,
        );
      if (!candidate || !driving.reenter(n.id, v(candidate))) continue;
      rankEvent("recover", {
        npcId: n.id,
        generation: rankGeneration.get(n.id) ?? 0,
      });
      const restored = world.actorPosition(n.id);
      if (restored) n.position.copy(restored);
      lastSpawn.set(n.id, [...candidate]);
      respawnWait.delete(n.id);
      n.disabled = 0;
      n.suppression = 0;
      n.path = [];
      n.lastKnown = null;
      n.memory = 0;
      n.alert = false;
      n.sees = false;
      n.repath = 0;
      n.sense = 0;
      n.reaction = 1.2;
      n.fire = 0;
      n.stuck = 0;
      n.previous.copy(n.position);
      n.destination.copy(n.position);
      n.attack.cancel();
      n.driveAttack!.cancel();
      n.driveAI!.reenter(candidate);
      driveFire.release(n.id);
      n.gun = new Magazine(n.gun.id, WEAPONS[n.gun.id].reserve);
      n.reloadStage = 0;
      n.reloadSerial = 0;
      n.skill?.recover();
      n.team.clear();
      n.rig.root.position.copy(n.position);
      n.rig.root.quaternion.identity();
      rankSpawn(n);
    }
    for (const n of npcs) {
      const thrown = driving.npc(n.id);
      if (thrown && thrown.phase !== "respawning") {
        n.position.copy(thrown.position);
        n.rig.root.position.copy(thrown.position);
        n.rig.root.quaternion.copy(thrown.rotation);
        n.rig.update(
          0,
          {
            speed: 0,
            aim: false,
            firing: false,
            reloading: false,
            suppressed: 0.001,
            hit: 0,
            attackPhase: "suppressed",
          },
          n.position.distanceTo(position),
          camera,
        );
      }
      n.rig.root.visible =
        thrown?.phase !== "respawning" &&
        n.position.distanceTo(position) < (low ? 65 : 80);
    }
    if (state.resetRequired && driving.reset()) {
      rankEvent("reset", { reason: "safety" });
      driveChallenge.resetCar();
      info("已从异常位置恢复到安全路面，扣除 50 分。");
    }
    audio.setListener(
      camera.position,
      camera.getWorldDirection(new THREE.Vector3()),
    );
    if (phaseActive()) {
      audio.update(dt, false);
      if(activeVehicleId!=="scooter")audio.engine(
        state.horizontalSpeed,
        ready ? controls.throttle : 0,
        dt,
        state,
      );
      if (state.shiftSerial > before.shiftSerial) audio.vehicleCue("shift");
      if (state.rejectedShiftSerial > before.rejectedShiftSerial)
        audio.vehicleCue("shiftRejected");
      if(activeVehicleId==="bao5")audio.tires(state.lateralSpeed ?? 0, state.slipAngle ?? 0, dt);
    }
    if (controls.brake > 0 && state.horizontalSpeed > 5 && stepClock <= 0) {
      audio.vehicleCue("brake");
      stepClock = 0.7;
    }
    stepClock = Math.max(0, stepClock - dt);
    if (driveChallenge.guide && driveChallenge.guide !== guidePlayed) {
      guidePlayed = driveChallenge.guide;
      audio.vehicleCue("guide");
    }
    if (driveChallenge.durability <= 0) {
      showCarSmoke();
      finish(false, "车辆耐久耗尽，本次驾驶挑战结束。");
    } else if (elapsed >= DRIVE_RULES.round - 1e-8) {
      elapsed = DRIVE_RULES.round;
      finish(true, "五分钟挑战完成！看看这次的积分。");
    }
    if (emitClock > 0.1) {
      emitClock = 0;
      emit();
    }
  }
  function showCarSmoke() {
    if (!driving) return;
    const point = driving.read().position.clone();
    point.y += 1.25;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x60666b,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.28 + i * 0.1, 1),
        mat,
      );
      mesh.position
        .copy(point)
        .add(new THREE.Vector3((i - 1) * 0.2, i * 0.35, -1.2));
      scene.add(mesh);
      sparks.push({ mesh, left: 3, life: 3 });
    }
  }
  function update(dt: number) {
    refreshStreaming(false);
    if (!phaseActive() || buffering) return;
    ranked?.observeControls(
      elapsed,
      input.getControlMethod?.() ?? (touchControls() ? "touch" : "keyboard"),
    );
    equipLeft = Math.max(0, equipLeft - dt);
    directions.update(dt);
    kick.update(dt, WEAPONS[weapon].recover);
    effects.update(dt);
    const frame = input.sample();
    if (escapeMapOpen) {
      audio.update(0, true);
      return;
    }
    if (frame.actions.has("taskMap")) {
      void taskMap(true);
      return;
    }
    if (frame.actions.has("nextTask")) nextEscapeTask();
    if (frame.actions.has("pause")) {
      pause();
      return;
    }
    if (storyOverlayOpen) {
      if (mode === "story" && story)
        storyAudio.update(dt, story.snapshot, false, true);
      else audio.update(dt, false);
      return;
    }
    if (mode === "dafei") {
      updateDriving(dt, frame);
      return;
    }
    elapsed += dt;
    emitClock += dt;
    updateDrops(dt);
    const photoState = photo?.snapshot(),
      tripod =
        photoState?.open &&
        photoState.state === "exposing" &&
        photoState.exposure.shutter > 0.25,
      cinematic =
        mode === "story" &&
        (!!story?.snapshot.introCamera || !!story?.snapshot.cinematicActive);
    if (tripod || cinematic || (mode === "story" && storyOverlayOpen)) {
      frame.moveX = frame.moveY = frame.lookX = frame.lookY = 0;
      frame.actions.clear();
    }
    noticeLeft = Math.max(0, noticeLeft - dt);
    if (!noticeLeft) notice = "";
    hurt = Math.max(0, hurt - dt);
    hit = Math.max(0, hit - dt);
    recoil = Math.max(0, recoil - dt * 7);
    smokeReady = Math.max(0, smokeReady - dt);
    let lookScale = settings.sensitivity * 0.0021;
    if (mode === "escape" && touchControls() && settings.aimAssist) {
      const direction = camera.getWorldDirection(new THREE.Vector3());
      let gain = 1;
      for (const n of npcs) {
        if (!n.escapeActive || n.disabled > 0) continue;
        const body = n.position.clone().add(new THREE.Vector3(0, 1.05, 0)),
          distance = body.distanceTo(camera.position),
          clear = visible(camera.position, body),
          angle = direction.angleTo(body.clone().sub(camera.position));
        gain = Math.min(
          gain,
          touchAimFriction({
            touch: true,
            enabled: true,
            mode,
            visible: clear,
            distance,
            angularDistance: angle,
            angularRadius: Math.atan2(0.55, distance) * 1.8 + 0.02,
          }),
        );
      }
      lookScale *= gain;
    }
    if (mode === "escape" && aiming)
      lookScale *=
        Math.tan((camera.fov * Math.PI) / 360) /
        Math.tan((settings.fov * Math.PI) / 360);
    yaw -= frame.lookX * lookScale;
    pitch = THREE.MathUtils.clamp(pitch - frame.lookY * lookScale, -1.35, 1.35);
    if (mode !== "escape") crouched = world.setCrouch(position, frame.crouch);
    aiming = frame.aim;
    if (aiming || crouched) stamina.stop();
    storyFastWalk =
      mode === "story" && !!frame.fastWalk && !crouched && !aiming;
    if (mode === "story") stamina.stop();
    else if (
      mode !== "escape" &&
      frame.actions.has("run") &&
      !crouched &&
      !aiming
    ) {
      stamina.toggle();
      if (stamina.running) {
        audio.run();
        info("跑操开启：加速最多 12 秒，音乐继续播放 60 秒。", 3.5);
      }
    }
    if (mode === "escape") {
      if (frame.actions.has("switch")) switchWeapon();
      if (frame.actions.has("reload") && equipLeft === 0) beginReload();
      if (frame.actions.has("cycleGadget")) {gadgetInventory.selectedGadget=cycleGadget(gadgetInventory.selectedGadget,true);info("已选择"+({smoke:"烟雾",grenade:"手榴弹",cards:"扑克牌"})[gadgetInventory.selectedGadget],1.5);}
      if(frame.actions.has("useGadget"))useGadget();else if (frame.actions.has("smoke")) throwSmoke();
      updateGadgets(dt);
    }
    const motion = new THREE.Vector3(frame.moveX, 0, -frame.moveY);
    if (motion.lengthSq() > 1) motion.normalize();
    frameMoving = motion.length();
    motion.applyAxisAngle(UP, yaw);
    let speed: number;
    if (mode === "escape") {
      const forward =
          motion.lengthSq() > 0.01
            ? motion.clone().normalize()
            : new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, yaw),
        probe = [
          position.clone(),
          position.clone().addScaledVector(forward, 4.6),
        ];
      escapeMotion = escapeMovement.update(dt, {
        sprintHeld:
          !!frame.sprintHeld &&
          !aiming &&
          (!frame.crouch || frame.actions.has("slide")),
        slidePressed: frame.actions.has("slide"),
        moving: frameMoving > 0.05,
        speed: actualSpeed,
        grounded,
        routeSafe:
          !(frame.actions.has("slide") || escapeMotion?.sliding) ||
          world.npcRouteSafe(probe, 4.6),
        onStairs:
          frame.actions.has("slide") || escapeMotion?.sliding
            ? Math.abs(
                probe[0].y - (world.supportAt(probe[1], 1.75)?.height ?? -100),
              ) > 0.18
            : false,
        aiming,
        staminaFree:gadgetInventory.cardsUntil>elapsed,
        direction: [forward.x, forward.z],
      });
      stamina.running = escapeMotion.sprinting;
      stamina.value = escapeMotion.stamina;
      crouched = world.setCrouch(
        position,
        frame.crouch || escapeMotion.forcedLow,
      );
      aiming = frame.aim && escapeMotion.canAim;
      speed = escapeMotion.sliding
        ? escapeMotion.speed
        : crouched
          ? RULES.crouchSpeed
          : escapeMotion.speed;
      if (escapeMotion.slideDirection) {
        motion.set(
          escapeMotion.slideDirection[0],
          0,
          escapeMotion.slideDirection[1],
        );
        frameMoving = 1;
      }
    } else {
      stamina.update(dt, frameMoving > 0.05);
      speed = crouched
        ? RULES.crouchSpeed
        : mode === "story"
          ? storyFastWalk
            ? 4.2
            : 2.8
          : stamina.running
            ? RULES.runSpeed
            : RULES.walkSpeed;
    }
    if (
      frame.actions.has("jump") &&
      grounded &&
      !crouched &&
      !escapeMotion?.sliding
    ) {
      velocityY = 4.1;
      grounded = false;
    }
    velocityY = Math.max(-20, velocityY - 14 * dt);
    motion.multiplyScalar(speed * dt);
    motion.y = velocityY * dt;
    const beforeMove = position.clone();
    const moved = world.move(position, motion, dt, crouched);
    position.copy(moved.position);
    actualSpeed =
      Math.hypot(position.x - beforeMove.x, position.z - beforeMove.z) / dt;
    actualVelocity.copy(position).sub(beforeMove).multiplyScalar(1 / dt);
    actualVelocity.y = 0;
    grounded = moved.grounded;
    crouched = moved.crouching;
    if (grounded && velocityY < 0) velocityY = -0.25;
    const floorLimit = (world.manifest.lowestOpenElevation ?? -4) - 1;
    if (
      ![position.x, position.y, position.z].every(Number.isFinite) ||
      position.y < floorLimit
    ) {
      position.copy(lastSafe);
      world.restorePlayer(position, crouched);
      velocityY = 0;
      grounded = false;
      info("已恢复到最近的安全位置。");
    } else if (grounded && velocityY <= 0) {
      const support = world.supportAt(position);
      if (
        support &&
        support.clear &&
        support.normalY > 0.7 &&
        Math.abs(support.height - position.y) < 0.15
      )
        lastSafe.copy(position);
    }
    camera.position.copy(position);
    bobTime += dt * speed * (frameMoving > 0.1 ? 1 : 0);
    const bob =
      settings.headBob && grounded && frameMoving > 0.1
        ? Math.sin(bobTime * 4.5) * (crouched ? 0.008 : 0.019)
        : 0;
    camera.position.y += (crouched ? RULES.crouchEye : RULES.eye) + bob;
    camera.rotation.set(
      pitch + kick.pitch + (settings.recoilShake ? recoil * 0.004 : 0),
      yaw + kick.yaw,
      0,
    );
    adsBlend = THREE.MathUtils.clamp(
      adsBlend + ((aiming ? 1 : -1) * dt) / WEAPONS[weapon].adsTime,
      0,
      1,
    );
    const wantedFov =
      mode === "escape"
        ? adsFieldOfView(weapon, settings.fov, adsBlend) *
          (stamina.running ? 1.045 : 1)
        : settings.fov;
    if (Math.abs(camera.fov - wantedFov) > 0.01) {
      camera.fov = wantedFov;
      camera.updateProjectionMatrix();
    }
    updateNearWall();
    syncScopedView();
    if (buffering) {
      physicsMs = world.step(dt);
      return;
    }
    magazine().update(dt);
    reloadSounds(
      magazine(),
      playerReloadStage,
      playerReloadSerial,
      undefined,
      (stage, serial) => {
        playerReloadStage = stage;
        playerReloadSerial = serial;
      },
    );
    audio.setListener(
      camera.position,
      camera.getWorldDirection(new THREE.Vector3()),
    );
    if (
      mode === "escape" &&
      (frame.actions.has("fire") || (WEAPONS[weapon].automatic && frame.fire))
    )
      shoot();
    if (grounded && actualSpeed > 0.25) {
      stepClock += dt * actualSpeed;
      if (stepClock > 0.92) {
        stepClock = 0;
        const grass = position.x < -88 && position.z < -22 && position.z > -157;
        audio.step(
          grass ? "grass" : position.y < -0.3 ? "stone" : "road",
          stamina.running,
        );
        footstepSerial++;
        footstepPoint.copy(position);
      }
    }
    if(training){
      training.observe({position:position.toArray() as Vec3,yaw,pitch,aiming,ammo:magazine().ammo,weapon,reloading:magazine().reloadLeft>0,active:phaseActive()&&!buffering});
      if(training.read().complete){pause();return;}
    }
    if (mode !== "escape") updateGoal();
    if (story && storyWorld) {
      if (!storyOverlayOpen)
        story.update(dt, {
          position: position.toArray(),
          photoOpen: !!photoState?.open,
          viewForward: camera.getWorldDirection(new THREE.Vector3()).toArray(),
        });
      const snap = story.snapshot;
      routeClock -= dt;
      if (guideStep !== snap.step || routeClock <= 0) {
        guideStep = snap.step;
        routeClock = 0.5;
        const guideTarget = guidanceTarget(snap);
        guidePath =
          snap.guidance.routeHelpRequested && guideTarget
            ? world.storyPath(position, v(guideTarget.position))
            : [];
      }
      storyWorld.update(snap, dt, position);
      for (const a of storyWorld.actorPositions())
        story.setActorPosition(a.id, a.position);
      story.setCompanionBlocking(storyWorld.blockedCompanions());
      if (frame.actions.has("interact")) storyAction("interact");
      if (snap.introCamera) {
        camera.position.fromArray(snap.introCamera.position);
        camera.lookAt(v(snap.introCamera.lookAt));
        camera.fov = snap.introCamera.fov;
        camera.updateProjectionMatrix();
      } else if (previousStoryStep === "opening") {
        finishOpening();
      }
      if (snap.step === "longshot-end" && !photoState?.open) {
        climaxTime = snap.cinematicTime;
        const t = Math.min(1, climaxTime / snap.cinematicDuration);
        camera.position.set(
          position.x,
          position.y + RULES.eye + Math.sin(t * Math.PI) * 15,
          position.z + Math.sin(t * Math.PI) * 3,
        );
        camera.lookAt(-46, 1.4, -98);
      } else if (previousStoryStep === "longshot-end") {
        climaxTime = 0;
      }
      previousStoryStep = snap.step;
      const tone =
        snap.presentOnly || snap.echo === "none"
          ? 0x7f8eac
          : snap.echo === "night"
            ? 0x33415e
            : snap.echo === "noon"
              ? 0xa5c6dc
              : 0xae9ba6;
      scene.background = (scene.background as THREE.Color).lerp(
        new THREE.Color(tone),
        dt * 0.8,
      );
      if (scene.fog instanceof THREE.Fog)
        scene.fog.color.copy(scene.background as THREE.Color);
      storyAudio.update(dt, snap, storyOverlayOpen);
    }
    senseNPCs(dt);
    updateNpcSkills(dt);
    for (const n of npcs) {
      if (!phaseActive()) break;
      const began = import.meta.env.DEV ? performance.now() : 0;
      if (mode === "escape") updateEscapeNPC(n, dt);
      else {
        updateNPC(n, dt);
        n.rig.root.visible =
          !profileNpcsHidden &&
          n.position.distanceTo(position) < (low ? 60 : 75);
      }
      if (import.meta.env.DEV) cpuNpcs += performance.now() - began;
    }
    deliverCallouts();
    if (mode === "escape") {
      updateEscapeCombat(dt);
      if (phaseActive()) updateEscapeTasks(dt, frame.actions.has("interact"));
    }
    physicsMs = world.step(dt);
    for (const c of clouds) {
      c.age += dt;
      c.left -= dt;
      const t = Math.min(1, c.age / 0.7) * Math.min(1, Math.max(0, c.left));
      c.mesh.scale.setScalar(0.35 + t * 0.65);
      c.mesh.children.forEach((o) => {
        const m = o as THREE.Mesh;
        (m.material as THREE.MeshStandardMaterial).opacity = 0.19 * t;
      });
    }
    for (const c of clouds.filter((c) => c.left <= 0)) disposeObject(c.mesh);
    clouds = clouds.filter((c) => c.left > 0);
    for (const s of sparks) {
      s.left -= dt;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        s.left / s.life,
      );
    }
    for (const s of sparks.filter((s) => s.left <= 0)) disposeObject(s.mesh);
    sparks = sparks.filter((s) => s.left > 0);
    if (phaseActive() && mode !== "story") audio.update(dt, false);
    if (emitClock > 0.1) {
      emitClock = 0;
      emit();
    }
  }
  function npcDrawRange() {
    return mode === "escape" && aiming && weapon === "awm"
      ? WEAPONS.awm.range + 5
      : low
        ? 60
        : 75;
  }
  function syncScopedView(check = true) {
    if (mode !== "escape") return;
    const scoped = aiming && weapon === "awm",
      far = scoped ? WEAPONS.awm.range + 15 : low ? 85 : 110;
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.near = scoped ? 95 : low ? 35 : 50;
      scene.fog.far = scoped ? 175 : low ? 72 : 98;
    }
    world?.setPhotoView(scoped ? camera : null, far);
    if (check && scoped) refreshStreaming(false);
  }
  function refreshStreaming(full=true) {
    if (!world || phase === "menu" || phase === "loading" || phase === "error")
      return;
    const began=performance.now();
    const vehicle = full ? driving?.read() : undefined,
      ahead = vehicle
        ? v(
            drivingPrefetch(
              vehicle.position.toArray(),
              vehicle.velocity.toArray(),
              new THREE.Vector3(0, 0, -1)
                .applyAxisAngle(UP, vehicle.yaw)
                .toArray(),
            ),
          )
        : undefined;
    const nextOrigin = mode === "escape" && actualSpeed > 0.05
      ? camera.position.clone().addScaledVector(actualVelocity, 0.15)
      : undefined;
    if(full)world.setCombatView(mode==='escape'?camera:null,mode==='escape'?camera.far:160,nextOrigin);
    const status = full ? world.update(
      position,
      low,
      [],
      ahead,
      mode === "dafei",
    ) : world.checkSafety(position,low,mode==='dafei');
    frameDiagnostics.phase(full?'streaming':'safety',performance.now()-began);
    if (!status) return;
    loadedChunks = status.resident;
    sceneRevision = status.revision ?? 0;
    photo?.setViewStatus({
      ready: status.viewReady,
      failed: status.viewFailed,
      progress: status.viewProgress,
    });
    scopeReady = status.viewReady;
    if (
      mode === "escape" &&
      aiming &&
      weapon === "awm" &&
      buffering &&
      !input.getAimIntent()
    )
      aiming = false;
    const scopeBlocked =
      mode === "escape" && aiming && weapon === "awm" && !scopeReady;
    const next = phaseActive() && (status.blocked || scopeBlocked),
      changed = mapProgress !== status.progress || mapError !== status.failed;
    mapProgress = scopeBlocked ? status.viewProgress : status.progress;
    mapError = status.failed || (scopeBlocked && status.viewFailed);
    if (next) message = scopeBlocked ? "正在载入瞄准区域" : status.message;
    if (next !== buffering) {
      buffering = next;
      bufferingSince = next ? performance.now() : 0;
      bufferingVisible = false;
      input.flushTransient();
      accumulator = 0;
      if (buffering) {
        bufferEvents++;
        audio.update(0, true);
        photo?.pause("附近校园正在载入，暂时保留取景画面。");
        storyAudio.pause();
      } else if (!storyOverlayOpen && phaseActive()) photo?.resume();
      emit();
    } else if (buffering && changed) emit();
    if (
      buffering &&
      !bufferingVisible &&
      performance.now() - bufferingSince >= 500
    ) {
      bufferingVisible = true;
      loadingPanels++;
      emit();
    }
  }
  // Optional visibility experiment remains off in release builds until its paired performance gate passes.
  const cinemaViewEnabled =
    import.meta.env.DEV &&
    new URLSearchParams(location.search).has("cinema-view-on");
  function render(dt: number) {
    if (dead || graphicsLost) return;
    const began = performance.now();
    syncScopedView(false);
    if (mode === "escape")
      for (const n of npcs)
        if (n.escapeActive)
          n.rig.root.visible =
            !profileNpcsHidden &&
            n.position.distanceTo(position) < npcDrawRange();
    if (photo?.snapshot().open) {
      photo.prepareView(camera);
      world?.setPhotoView(photo.camera);
    } else if (mode === "escape" && aiming && weapon === "awm")
      world?.setPhotoView(camera, WEAPONS.awm.range + 15);
    else if (story?.snapshot.introCamera) world?.setPhotoView(camera);
    else if (story?.snapshot.cinematicActive && cinemaViewEnabled)
      world?.setPhotoView(camera, 120);
    else world?.setPhotoView(null);
    refreshStreaming();
    if (buffering || escapeMapOpen) dt = 0;
    if (viewWeapon) {
      viewWeapon.root.visible =
        mode === "escape" &&
        phase !== "menu" &&
        !(weapon === "awm" && aiming && adsBlend > 0.9);
      viewWeapon.update(dt, {
        weapon,
        moving: frameMoving,
        aim: aiming,
        reloading: magazine().reloadLeft > 0 ? magazine().reloadProgress : 0,
        shotSerial,
        action: magazine().action,
        nearWall,
        empty: magazine().ammo === 0,
        recoil: settings.recoilShake ? recoil : 0,
        running: stamina.running,
        crouch: crouched,
      });
    }
    if (
      world &&
      !low &&
      (shadowRevision !== sceneRevision ||
        shadowOrigin.distanceToSquared(position) > 1)
    ) {
      sun.position.set(position.x - 65, 120 + position.y, position.z + 50);
      sun.target.position.set(position.x, position.y, position.z);
      shadowOrigin.copy(position);
      shadowRevision = sceneRevision;
      renderer.shadowMap.needsUpdate = true;
    }
    photographyMarkers?.update(
      mode,
      phaseActive(),
      story?.snapshot,
      !!settings.realityHints,
      photo?.snapshot().open ? photo.camera : camera,
      position,
      storyOverlayOpen || buffering,
    );
    if (story && storyWorld)
      storyWorld.orient(
        photo?.snapshot().open ? photo.camera : camera,
        story.snapshot,
      );
    if(mode!=='story')weatherScene.update(elapsed,camera.position.toArray() as Vec3,world?(origin,direction,max)=>world!.rayDistance(new THREE.Vector3(...origin),new THREE.Vector3(...direction),max):undefined,world);
    const photographed =
      photo?.snapshot().open &&
      (buffering || phase === "paused" || storyOverlayOpen
        ? phaseActive() &&
          !buffering &&
          storyOverlays.size === 1 &&
          storyOverlays.has("photo-panel")
          ? photo.renderPausedPreview(camera)
          : photo.renderFrozen()
        : phaseActive() && photo.render(camera, dt));
    if (!photographed) {
      renderer.clear();
      renderer.render(scene, camera);
    }
    const stats = photographed ? photo!.statistics() : null;
    let calls = stats?.drawCalls ?? renderer.info.render.calls,
      triangles = stats?.triangles ?? renderer.info.render.triangles;
    if (viewWeapon?.root.visible) {
      renderer.clearDepth();
      renderer.render(viewScene, viewCamera);
      calls += renderer.info.render.calls;
      triangles += renderer.info.render.triangles;
    }
    if (heldCamera) {
      heldCamera.group.visible =
        (mode === "story"
          ? !!story?.snapshot.cameraReceived
          : mode === "roam") &&
        phaseActive() &&
        !photo?.snapshot().open &&
        !story?.snapshot.introActive;
      heldCamera.update(dt, {
        raised: false,
        focalLength: photo?.snapshot().settings.focalLength ?? 24,
        focusDistance: photo?.snapshot().focusDistance ?? 20,
        settings: photo
          ? {
              aperture: photo.snapshot().exposure.aperture,
              shutterSeconds: photo.snapshot().exposure.shutter,
              iso: photo.snapshot().exposure.iso,
              mode: photo.snapshot().settings.mode,
            }
          : undefined,
      });
      if (heldCamera.group.visible) {
        renderer.clearDepth();
        renderer.render(viewScene, viewCamera);
        calls += renderer.info.render.calls;
        triangles += renderer.info.render.triangles;
      }
    }
    const performanceNow = performance.now();
    renderTimes.push(performanceNow - began);
    if (renderTimes.length > 180) renderTimes.shift();
    if (
      performanceNow - performanceStamp >= 1000 ||
      phase !== lastReportedPhase
    ) {
      performanceStamp = performanceNow;
      lastReportedPhase = phase;
      const memory = renderer.info.memory,
        heap = (
          performance as Performance & {
            memory?: {
              usedJSHeapSize: number;
            };
          }
        ).memory;
      canvas.dataset.performance = JSON.stringify({
        phase,
        mode,
        fps,
        buffering,
        loadingPanels,
        bufferEvents,
        mapProgress,
        storyAudio: storyAudio.diagnostics(),
        physicsMs,
        triangles,
        drawCalls: calls,
        renderMs: renderTimes.length
          ? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length
          : 0,
        renderP95Ms: renderTimes.length
          ? [...renderTimes].sort((a, b) => a - b)[
              Math.floor((renderTimes.length - 1) * 0.95)
            ]
          : 0,
        geometries: memory?.geometries ?? 0,
        textures: memory?.textures ?? 0,
        loadedChunks,
        jsHeapBytes: heap?.usedJSHeapSize ?? null,
        frame:frameDiagnostics.snapshot(),
        streaming:world?.diagnostics(),
      });
    }
    if (import.meta.env.DEV) {
      if (phaseActive()) cpuRender += performance.now() - began;
      const diagnostics = {
        phase,
        mode,
        weapon,
        ammo: magazine().ammo,
        reserve: magazine().reserve,
        weaponAction: magazine().action,
        nearWall,
        scopeReady,
        equipLeft,
        aiming,
        viewYaw: camera.rotation.y,
        viewPitch: camera.rotation.x,
        fov: camera.fov,
        lookScale:
          settings.sensitivity *
          0.0021 *
          (aiming
            ? Math.tan((camera.fov * Math.PI) / 360) /
              Math.tan((settings.fov * Math.PI) / 360)
            : 1),
        drops: drops.all().map((d) => ({
          id: d.id,
          weapon: d.weapon,
          ammo: d.gun.ammo,
          reserve: d.gun.reserve,
          position: d.position,
          left: d.left,
          pending: d.pending,
          error: d.error,
        })),
        escape: escapeSnapshot(),
        escapeRoute: escapeRoute.map((p) => p.toArray()),
        escapeMotion,
        actualSpeed,
        drivingAudio: audio.diagnostics(),
        storyAudio: storyAudio.diagnostics(),
        weaponResources: weaponResourceDiagnostics(),
        billboardResources: billboardResourceDiagnostics(),
        photoGuides: photographyMarkers?.read(),
        realityHints: !!settings.realityHints,
        story: narrativeSnapshot(),
        fastWalking: storyFastWalk,
        reality: realityMatch?.association,
        guidePath: guidePath.map((p) => p.toArray()),
        photo: photo?.snapshot(),
        introPrepared: introCarReady,
        activeFireSlots:
          mode === "escape" ? escapeFire.active : driveFire.active,
        firePriority:
          mode === "escape" ? escapeFire.priority : driveFire.priority,
        musicPlaying: audio.isMusicPlaying,
        musicPolicy:
          phase === "intro"
            ? "silent"
            : mode === "dafei" && phaseActive() && !buffering
              ? "driving"
              : "paused",
        driving: drivingSnapshot(),
        carPose: driving
          ? {
              position: driving.read().position.toArray(),
              yaw: driving.read().yaw,
              resetRequired: driving.read().resetRequired,
              speed: driving.read().speed,
              horizontalSpeed: driving.read().horizontalSpeed,
              velocity: driving.read().velocity.toArray(),
              lateralSpeed: driving.read().lateralSpeed,
              slipAngle: driving.read().slipAngle,
              handbrake: driving.read().handbrake,
              handbrakeAssist: driving.read().handbrakeAssist,
              wheelContacts: driving.read().wheelContacts,
              gear: driving.read().gear,
              rpm: driving.read().rpm,
              transmission: driving.read().transmission,
              shiftLeft: driving.read().shiftLeft,
            }
          : undefined,
        physicsMs,
        position: position.toArray(),
        yaw,
        pitch,
        fps,
        quality,
        buffering,
        mapError,
        mapProgress,
        mapSource: world?.manifest.sourceVersion,
        triangles,
        drawCalls: calls,
        cpuMs: profile,
        profileNavigationOff,
        profileNpcsHidden,
        npcs: npcs.map((n) => ({
          slot: n.id,
          active: n.escapeActive,
          reenterAt: n.reenterAt,
          identity: n.identity,
          skill: n.skill?.kind,
          skillPhase: n.skill?.phase,
          skillLeft: n.skill?.left,
          teamTarget: n.team.target,
          teamLeft: n.team.left,
          name: NPC_IDENTITY[n.identity].name,
          position: n.position.toArray(),
          sees: n.sees,
          alert: n.alert,
          path: n.path.length,
          disabled: n.disabled,
          driveState: n.driveAI?.state,
          regionId: n.driveAI?.region.id,
          regionHome: n.driveAI?.region.home,
          patrolIndex: n.driveAI?.index,
          flight: driving?.npc(n.id)?.phase,
          stunLeft: driving?.npc(n.id)?.remaining,
          ammo: n.gun.ammo,
          reserve: n.gun.reserve,
          weapon: n.gun.id,
          actualSpeed: n.actualSpeed,
          movingSpread: n.movingAccuracy.read(),
          spritePose: n.rig.root.getObjectByName(n.identity + "-portrait")
            ?.userData.pose,
          gunReady: n.rig.isAimReady(npcTarget()),
          barrel: n.rig.getMuzzleDirectionWorld().toArray(),
          tactic: mode === "escape" ? escapeTactics.read(n.id) : undefined,
          tacticalDecision: n.tacticalDecision,
          navigation: world.actorNavigationStatus(n.id),
          eyeClear:
            n.sees &&
            visible(
              n.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
              npcTarget(),
            ),
          muzzleClear: n.sees && visible(n.rig.getMuzzleWorld(), npcTarget()),
          fireSeat: mode === "escape" ? escapeFire.owns(n.id) : undefined,
          attackPhase:
            n.escapeAttack?.phase ?? n.driveAttack?.phase ?? n.attack.phase,
          shotSerial: n.shotSerial,
        })),
        clues: clues.map((c) => ({
          id: c.point.id,
          position: c.point.position,
          collected: c.collected,
        })),
        grounded,
        health,
        elapsed,
      };
      (window as any).__gameDiagnostics = diagnostics;
      if (emitClock < 0.02)
        canvas.dataset.diagnostics = JSON.stringify(diagnostics);
    }
  }
  function schedule() {
    if (!raf && !dead) raf = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    raf = 0;
    if (dead) return;
    frameDiagnostics.begin(now);
    const realDt = Math.max(0, (now - last) / 1000),
      dt = Math.min(0.1, realDt);
    last = now;
    refreshStreaming(false);
    if (phaseActive()) {
      const began = import.meta.env.DEV ? performance.now() : 0;
      if (buffering) input.flushTransient();
      accumulator = buffering ? 0 : Math.min(0.1, accumulator + dt);
      while (accumulator >= 1 / 60 && phaseActive() && !buffering) {
        update(1 / 60);
        accumulator -= 1 / 60;
      }
      if (import.meta.env.DEV) cpuUpdate += performance.now() - began;
      perfClock += realDt;
      perfFrames++;
      if(!buffering){const decision=qualityGovernor.observe(realDt,settings.quality);if(decision.changed)applyQuality();if(decision.warn)info('当前画质下帧率较低，可在设置中选择“自动调整”或“优先流畅”。',5);}
      if (perfClock > 3) {
        fps = Math.round(perfFrames / perfClock);
        if (import.meta.env.DEV) {
          profile = {
            updateMs: cpuUpdate / perfFrames,
            npcMs: cpuNpcs / perfFrames,
            renderMs: cpuRender / perfFrames,
          };
          cpuUpdate = cpuNpcs = cpuRender = 0;
        }
        perfClock = 0;
        perfFrames = 0;
      }
    }
    render(dt);
    frameDiagnostics.end();
    if (phaseActive() || (phase === "intro" && !document.hidden)) schedule();
  }
  function dispose() {
    qualityTextureLoad?.abort();
    canvas.removeEventListener("click", clickToObserve);
    dead = true;
    enterToken++;
    cancelPreparation();
    cancelModePreparation();
    cancelAnimationFrame(raf);
    observer.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("orientationchange", orientation);
    canvas.removeEventListener("webglcontextlost", contextLost);
    canvas.removeEventListener("webglcontextrestored", contextRestored);
    window.removeEventListener("keydown", photographyKeys, true);
    window.removeEventListener("keyup", photographyKeyUp, true);
    window.removeEventListener("focusin", photographyFocusIn, true);
    canvas.removeEventListener("wheel", photographyWheel);
    input.dispose();
    audio.dispose();
    resetTransient();
    photo?.dispose();
    storyAudio.dispose();
    void storyStore?.close();
    releaseBillboards?.();
    viewWeapon?.dispose();
    releaseWeapons?.();
    effects.dispose();
    gadgetScene.dispose();
    weatherScene.dispose();
    gunEnvironment?.dispose();
    photographyMarkers?.dispose();
    world?.dispose();
    sun.shadow.dispose();
    renderer.dispose();
    canvas.remove();
  }
  const api: GameAPI = {
    prepareMode,
    cancelModePreparation,
    modePrepared,
    rankingSubmit: async () => {
      await ranked?.submit();
    },
    unlockAudio,
    observe,
    releaseCursor: () => {
      input.freePointerLock?.();
      emit();
    },
    photoRemoved: (id) => {
      story?.removePhotos([id]);
      temporaryPhotos = temporaryPhotos.filter((p) => p.id !== id);
      if (latestPhoto?.id === id) latestPhoto = undefined;
      const url = shotUrlById.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        shotUrls.delete(url);
        shotUrlById.delete(id);
      }
      saveStory();
      emit();
    },
    photoSystem: () => photo,
    togglePhoto,
    storyAction,
    storyGuidance,
    closeReality,
    storyOverlay: setStoryOverlay,
    storyCheckpoint,
    restoreStory,
    prepareDafeiIntro,
    start,
    retryRound,
    taskMap,
    selectEscapeTask,
    resume,
    pause,
    menu,
    clearInput: () => input.reset(),
    cancelAction: (a) => input.cancelAction(a),
    action: (a, pressed) => {
      input.action(a, pressed);
      if (buffering) input.flushTransient();
    },
    move: (x, y) => {
      input.move(x, y);
      if (phaseActive() && (x !== 0 || y !== 0))
        canvas.focus({ preventScroll: true });
    },
    look: (x, y) => {
      if (!buffering) {
        input.look(x, y);
        if (
          phaseActive() &&
          (x !== 0 || y !== 0) &&
          (mode === "story" || mode === "dafei" || photo?.snapshot().open)
        )
          canvas.focus({ preventScroll: true });
      }
    },
    drive: (controls) => {
      if (phaseActive()) input.drive(controls);
      if (buffering) input.flushTransient();
    },
    holdLook: (held) => {
      if (phaseActive()) input.holdLook(held);
    },
    guide: () => {
      const token = enterToken;
      void audio
        .unlockEffects()
        .then(() => {
          if (
            !dead &&
            token === enterToken &&
            (phase === "menu" || phase === "intro")
          )
            audio.guide();
        })
        .catch(() => {});
    },
    retryRealityHints: () => {
      photographyMarkers?.retry();
      emit();
    },
    setRealityHints: (enabled) => {
      settings = { ...settings, realityHints: !!enabled };
      emit();
    },
    setTransmission: (transmission) => {
      if (
        !canSelectTransmission(phase) ||
        (transmission !== "auto" && transmission !== "manual")
      )
        return;
      if(mode==='dafei'&&activeVehicleId==='bao5')ranked?.observeTransmission(elapsed, transmission);
      settings = { ...settings, transmission };
      input.flushTransient();
      driving?.setTransmission(transmission);
      render(0);
      emit();
    },
    setSettings: (s) => {
      if(s.quality!==settings.quality)qualityGovernor.reset();
      input.setEscapeAimMode(s.escapeAimMode ?? "toggle");
      const transmission = s.transmission === "manual" ? "manual" : "auto";
      if (
        canSelectTransmission(phase) &&
        transmission !== (settings.transmission ?? "auto")
      ) {
        if(mode==='dafei'&&activeVehicleId==='bao5')ranked?.observeTransmission(elapsed, transmission);
        input.flushTransient();
        driving?.setTransmission(transmission);
      }
      settings = {
        ...s,
        transmission: canSelectTransmission(phase)
          ? transmission
          : (settings.transmission ?? "auto"),
      };
      audio.setVolumes(s.music, s.sfx);
      if (mode === "escape")
        audio.setEscapeMusic(
          s.escapeMusic ?? "battle",
          escapeRound?.extractionAvailable
            ? "extraction"
            : escapeCombatMusicLeft > 0
              ? "combat"
              : "search",
        );
      storyAudio.setVolumes(s.music, s.sfx);
      applyQuality();
      void refreshQualityTextures();
      photo?.setQuality(low);
      if (mode === "story") {
        camera.far = 360;
        camera.updateProjectionMatrix();
        scene.fog = new THREE.Fog(scene.background as THREE.Color, 100, 330);
      }
      if (phase !== "playing") {
        camera.fov = s.fov;
        camera.updateProjectionMatrix();
        render(0);
      }
      emit();
    },
    retryMusic: () => {
      if (mode === "story") storyAudio.retry();
      else audio.retry();
    },
    retryMap: () => {
      world?.retry();
      if (mode === "escape" && weapon === "awm") world?.retryView();
    },
    selectGadget,
    dispose,
  };
  if (import.meta.env.DEV) (window as any).__gameAPI = api;
  return api;
}
function characterHit(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  feet: THREE.Vector3,
  crouch = false,
) {
  const ray = new THREE.Ray(origin, direction),
    out = new THREE.Vector3();
  let d = Infinity;
  for (const [y, r] of crouch
    ? [
        [0.55, 0.38],
        [0.94, 0.24],
      ]
    : [
        [0.86, 0.39],
        [1.48, 0.24],
      ]) {
    const sphere = new THREE.Sphere(
      feet.clone().add(new THREE.Vector3(0, y, 0)),
      r,
    );
    if (ray.intersectSphere(sphere, out))
      d = Math.min(d, out.distanceTo(origin));
  }
  return Number.isFinite(d) ? d : null;
}
function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(
      (m) => materials.add(m),
    );
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  root.removeFromParent();
}
