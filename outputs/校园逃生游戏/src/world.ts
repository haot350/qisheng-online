import { MapDecodeQueue } from "./map-decode.ts";
import { MapScenePreparer, type MapRenderContext } from './map-scene-preparer.ts';
import { VisionGeometry } from "./vision-geometry.ts";
import { WalkingPrefetch } from "./walking-prefetch.ts";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  init as initNavigation,
  importNavMesh,
  NavMeshQuery,
} from "recast-navigation";
import type { MapManifest } from "./types";
import {
  ChunkStreamer,
  combatStructure,
  type PhotoView,
  type StreamStatus,
} from "./streaming.ts";
import { SceneResources } from "./resources.ts";
import { withDeadline } from "./network.ts";
import { loadGameMapBundle, gameMapSession } from "./game-map.ts";
import {
  createDrivingPhysics,
  drivePointAllowed,
  validateDrivingSpawn,
  type DriveMap,
  type DrivingPhysics,
  type PhysicsActor,
} from "./vehicle-physics.ts";
import { storyCurbLift, storyDirectRoute } from "./story-curb.ts";
import { storyCorridorPath } from "./story-corridor.ts";
import {
  NavigationAvoidance,
  normalizeCampusRoute,
  type ActorNavigationStatus,
} from "./navigation/avoidance.ts";
import { crowdMotion } from "./navigation/crowd.ts";
import { StairFlow } from "./navigation/stair-flow.ts";
import { pathMotion } from "./path-following.ts";
export interface GameWorld {
  manifest: MapManifest;
  setCrouch(position: THREE.Vector3, requested: boolean): boolean;
  move(
    position: THREE.Vector3,
    _desired: THREE.Vector3,
    dt: number,
    crouch: boolean,
  ): {
    position: THREE.Vector3;
    grounded: boolean;
    crouching: boolean;
  };
  rayDistance(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    max: number,
  ): number;
  visionRayDistance(origin:THREE.Vector3,direction:THREE.Vector3,max:number):number;
  visionVisible(from:THREE.Vector3,to:THREE.Vector3):boolean;
  rayImpact(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    max: number,
  ): {
    distance: number;
    normal: {
      x: number;
      y: number;
      z: number;
    };
  } | null;
  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[];
  storyPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[];
  actorPath(
    id: number,
    from: THREE.Vector3,
    to: THREE.Vector3,
    commitGoal?: boolean,
  ): THREE.Vector3[];
  actorNavigationStatus(id: number): ActorNavigationStatus | null;
  nearest(point: THREE.Vector3): THREE.Vector3;
  supportAt(
    position: THREE.Vector3,
    clearanceHeight?: number,
  ): {
    height: number;
    normalY: number;
    clear: boolean;
  } | null;
  npcRouteSafe(points: THREE.Vector3[], distance?: number): boolean;
  restorePlayer(position: THREE.Vector3, crouch: boolean): void;
  step(dt: number): number;
  startDriving(map: DriveMap): DrivingPhysics;
  validateDrivingSpawn(
    map: DriveMap,
    point: DriveMap["spawn"],
    yaw: number,
  ): DriveMap["spawn"] | null;
  actorPosition(id: number): THREE.Vector3 | null;
  pathOutdoor(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[];
  update(
    position: THREE.Vector3,
    low: boolean,
    observers?: THREE.Vector3[],
    drivingPreview?: THREE.Vector3,
    outdoorOnly?: boolean,
  ): StreamStatus;
  retry(): void;
  checkSafety(position:THREE.Vector3,low:boolean,outdoorOnly?:boolean):StreamStatus;
  diagnostics():ReturnType<ChunkStreamer<THREE.Group>['diagnostics']> & {gpu:ReturnType<MapScenePreparer['diagnostics']>;resources:ReturnType<SceneResources['diagnostics']>;decode:ReturnType<MapDecodeQueue['diagnostics']>};
  prepareCombat(signal:AbortSignal,onProgress?:(progress:number)=>void):Promise<()=>void>;
  retryView(): void;
  prepareViews(
    views: PhotoView[],
    signal: AbortSignal,
    onProgress?: (progress: number) => void,
  ): Promise<() => void>;
  setPhotoView(camera: THREE.PerspectiveCamera | null, far?: number): void;
  setCombatView(camera:THREE.PerspectiveCamera|null,far?:number,nextOrigin?:THREE.Vector3):void;
  moveActor(
    id: number,
    position: THREE.Vector3,
    desired: THREE.Vector3,
    dt: number,
    crouch?: boolean,
  ): THREE.Vector3;
  resetActors(): void;
  removeActor(id: number): void;
  dispose(): void;
}
const request = async <T>(
  url: string,
  decode: (response: Response) => Promise<T>,
) => {
  const controller = new AbortController();
  return withDeadline(
    fetch(url, { signal: controller.signal }).then((r) => {
      if (!r.ok) throw new Error(`地图资源加载失败 ${r.status}：${url}`);
      return decode(r);
    }),
    30000,
    { onTimeout: () => controller.abort() },
  );
};
let initPromise: Promise<unknown> | undefined;
export async function loadWorld(
  scene: THREE.Scene,
  onProgress: (p: number, msg: string) => void,
  signal?: AbortSignal,
  renderContext?:MapRenderContext,
): Promise<GameWorld> {
  let photoView: PhotoView | null = null;
  onProgress(0.04, "读取校园地图");
  const legacy =
    typeof location === "undefined" ||
    (import.meta.env?.DEV &&
      new URLSearchParams(location.search).get("visual") === "candidate");
  const bundle = legacy ? undefined : await loadGameMapBundle(signal);
  const manifest: MapManifest =
    bundle?.manifest ??
    (await request(
      import.meta.env?.DEV &&
        typeof location !== "undefined" &&
        new URLSearchParams(location.search).get("visual") === "candidate"
        ? "/map-candidate-v122/manifest.json"
        : "/map/manifest.json",
      (r) => r.json(),
    ));
  initPromise ??= Promise.all([RAPIER.init(), initNavigation()]);
  const [collisionData, navData, visionData] = await Promise.all([
    bundle?.collision ?? request(manifest.collisionUrl, (r) => r.arrayBuffer()),
    bundle?.navigation ?? request(manifest.navmeshUrl, (r) => r.arrayBuffer()),
    bundle?.vision ?? (manifest.visionUrl ? request(manifest.visionUrl,r=>r.arrayBuffer()) : undefined),
    initPromise,
  ]);
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const header = new Uint32Array(collisionData, 0, 2);
  const positions = new Float32Array(collisionData, 8, header[0]);
  const indices = new Uint32Array(collisionData, 8 + header[0] * 4, header[1]);
  const physics = new RAPIER.World({ x: 0, y: -18, z: 0 });
  const vision = new VisionGeometry(visionData);
  physics.createCollider(
    RAPIER.ColliderDesc.trimesh(
      positions,
      indices,
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
    ),
  );
  const body = physics.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased(),
  );
  let height = 1.75;
  let capsule = physics.createCollider(
    RAPIER.ColliderDesc.capsule((height - 0.6) / 2, 0.3),
    body,
  );
  const playerController = () => {
    const value = physics.createCharacterController(0.015);
    value.enableAutostep(0.42, 0.2, false);
    value.enableSnapToGround(0.3);
    value.setMaxSlopeClimbAngle(Math.PI * 0.27);
    value.setMinSlopeSlideAngle(Math.PI * 0.3);
    return value;
  };
  let controller = playerController();
  physics.step();
  let navMesh: ReturnType<typeof importNavMesh>["navMesh"];
  try {
    navMesh = importNavMesh(new Uint8Array(navData)).navMesh;
  } catch (error) {
    physics.free();
    throw new Error("校园导航资源未能解码，请重新载入。", { cause: error });
  }
  const query = new NavMeshQuery(navMesh);
  const root = new THREE.Group();
  root.name = `${manifest.sourceVersion ?? "campus"}-game-campus`;
  scene.add(root);
  let disposed = false;
  // The exported texture names were audited: each name identifies one exact image.
  const resources = new SceneResources(true),
    decodeQueue = new MapDecodeQueue(),
    scenePreparer = new MapScenePreparer(scene,renderContext),
    walkingPrefetch = new WalkingPrefetch();
  let visibilityRevision = 0;
  const loadChunk = async (
    chunk: MapManifest["chunks"][number],
    signal: AbortSignal,
    priority?: number,
  ) => {
    const manager = new THREE.LoadingManager(),
      loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder),
      abort = () => manager.abort();
    signal.addEventListener("abort", abort, { once: true });
    let gltf;
    try {
      gltf = bundle
        ? await withDeadline(
            gameMapSession
              .read(chunk.url, { signal, priority })
              .then((bytes) =>
                decodeQueue.run(
                  () =>
                    loader.parseAsync(
                      bytes,
                      new URL(".", new URL(chunk.url, location.href)).href,
                    ),
                  signal,
                  priority,
                ),
              ),
            30000,
            {
              signal,
              onLate: (g) => {
                resources.retain(g.scene);
                resources.release(g.scene);
              },
            },
          )
        : await loader.loadAsync(chunk.url);
    } finally {
      signal.removeEventListener("abort", abort);
    }
    resources.retain(gltf.scene);
    try{
      await scenePreparer.prepare(gltf.scene,signal,priority);
      if(disposed||signal.aborted)throw new DOMException('Cancelled','AbortError');
      root.add(gltf.scene);
    }catch(error){resources.release(gltf.scene);throw error;}
    return gltf.scene;
  };
  const streamer = new ChunkStreamer(manifest.chunks, loadChunk, (asset) =>
    resources.release(asset),
  );
  try {
    await streamer.initialize(
      manifest.spawn,
      (p) =>
        onProgress(0.25 + 0.75 * p, `载入出生区域 ${Math.round(p * 100)}%`),
      signal,
    );
  } catch (error) {
    disposed = true;
    streamer.dispose();
    scenePreparer.dispose();
    root.removeFromParent();
    query.destroy();
    navMesh.destroy();
    vision.dispose();
    physics.free();
    throw error;
  }
  onProgress(1, "校园已准备好");
  const actors = new Map<number, PhysicsActor>();
  const navigationAvoidance = new NavigationAvoidance();
  const crowdDirections = new Map<number, THREE.Vector3>();
  const navigationGoals = new Map<number, THREE.Vector3>(),
    stairFlow = new StairFlow();
  const stairLines = (manifest.stairRoutes ?? []).map((r) => ({
    key: r.core + ":" + r.from_floor,
    points: r.points.map((p) => new THREE.Vector3(...p)),
  }));
  let navigationFrame = 0,
    trafficFrame = -1;
  let playerStairMotion:
    | {
        position: THREE.Vector3;
        direction: THREE.Vector3;
      }
    | undefined;
  const stairHolding = new Map<
    number,
    {
      key: string;
      target: THREE.Vector3;
      path: THREE.Vector3[];
      repath: number;
    }
  >();
  let driving: DrivingPhysics | undefined, driveMap: DriveMap | undefined;
  let outdoorGraph: THREE.Vector3[][][] | undefined;
  const ignoreCharacters = (c: RAPIER.Collider) =>
    c.handle !== capsule.handle &&
    ![...actors.values()].some((a) => a.capsule.handle === c.handle);
  function groundHeight(point: THREE.Vector3) {
    const hit = physics.castRay(
      new RAPIER.Ray(
        { x: point.x, y: point.y + 0.65, z: point.z },
        { x: 0, y: -1, z: 0 },
      ),
      1.5,
      true,
      RAPIER.QueryFilterFlags.ONLY_FIXED,
    );
    return hit ? point.y + 0.65 - hit.timeOfImpact : point.y;
  }
  function supportAt(point: THREE.Vector3, clearanceHeight = height) {
    if (disposed || ![point.x, point.y, point.z].every(Number.isFinite))
      return null;
    const above = 0.14,
      hit = physics.castRayAndGetNormal(
        new RAPIER.Ray(
          { x: point.x, y: point.y + above, z: point.z },
          { x: 0, y: -1, z: 0 },
        ),
        0.34,
        true,
        RAPIER.QueryFilterFlags.ONLY_FIXED,
      );
    if (!hit || hit.normal.y < Math.cos(Math.PI * 0.27)) return null;
    const ground = point.y + above - hit.timeOfImpact;
    // A nearby lower floor is not a landing. Ignore all characters and leave the
    // controller's contact skin outside the slightly inset clearance capsule.
    if (Math.abs(ground - point.y) > 0.18) return null;
    const shape = new RAPIER.Capsule((clearanceHeight - 0.6) / 2, 0.285);
    const clear =
      physics.intersectionWithShape(
        { x: point.x, y: point.y + clearanceHeight / 2 + 0.025, z: point.z },
        { x: 0, y: 0, z: 0, w: 1 },
        shape,
        RAPIER.QueryFilterFlags.ONLY_FIXED,
      ) === null;
    return { height: ground, normalY: hit.normal.y, clear };
  }
  function npcRouteSafe(points: THREE.Vector3[], distance = 6.48) {
    if (points.length < 2 || disposed) return false;
    let left = distance,
      travel = 0,
      previous = points[0].clone();
    const startY = previous.y;
    // Sprint needs almost a metre of lateral clearance, beyond the walking capsule.
    // This deliberately rejects narrow doorways while retaining the NPC's height.
    const radius = 0.48,
      shape = new RAPIER.Capsule((1.75 - radius * 2) / 2, radius),
      rotation = { x: 0, y: 0, z: 0, w: 1 };
    for (let i = 1; i < points.length && left > 1e-5; i++) {
      const end = points[i],
        length = previous.distanceTo(end);
      if (length < 1e-5) continue;
      const used = Math.min(left, length),
        part = previous.clone().lerp(end, used / length),
        steps = Math.max(1, Math.ceil(used / 0.35));
      for (let j = 0; j <= steps; j++) {
        const point = previous.clone().lerp(part, j / steps),
          support = supportAt(point, 1.75);
        if (
          !support?.clear ||
          support.normalY < 0.94 ||
          Math.abs(support.height - startY) > 0.18
        )
          return false;
      }
      const direction = part.clone().sub(previous).divideScalar(used);
      const hit = physics.castShape(
        { x: previous.x, y: previous.y + 0.9, z: previous.z },
        rotation,
        direction,
        shape,
        0,
        used,
        true,
        RAPIER.QueryFilterFlags.ONLY_FIXED,
      );
      if (hit && hit.time_of_impact < used - 0.02) return false;
      previous.copy(part);
      left -= used;
      travel += used;
    }
    return travel >= Math.min(distance, 2) - 0.02;
  }
  function restorePlayer(point: THREE.Vector3, crouch: boolean) {
    if (disposed || ![point.x, point.y, point.z].every(Number.isFinite)) return;
    playerStairMotion = undefined;
    trafficFrame = -1;
    // Reset the movement controller too: a recovered capsule must not retain a
    // contact normal from the hole or the previous round's crouched capsule.
    physics.removeCharacterController(controller);
    physics.removeCollider(capsule, true);
    height = crouch ? 1.15 : 1.75;
    capsule = physics.createCollider(
      RAPIER.ColliderDesc.capsule((height - 0.6) / 2, 0.3),
      body,
    );
    controller = playerController();
    capsule.setEnabled(!driving);
    body.setTranslation(
      { x: point.x, y: point.y + height / 2, z: point.z },
      true,
    );
    body.setNextKinematicTranslation({
      x: point.x,
      y: point.y + height / 2,
      z: point.z,
    });
    physics.propagateModifiedBodyPositionsToColliders();
  }
  const resetActors = () => {
    driving?.dispose();
    for (const a of actors.values()) {
      if (!a.thrown) physics.removeCharacterController(a.controller);
      physics.removeRigidBody(a.body);
    }
    actors.clear();
    navigationAvoidance.reset();
    crowdDirections.clear();
    navigationGoals.clear();
    stairFlow.reset();
    stairHolding.clear();
    playerStairMotion = undefined;
    trafficFrame = -1;
  };
  function setCrouch(position: THREE.Vector3, requested: boolean) {
    if (disposed) return height < 1.5;
    const nextHeight = requested ? 1.15 : 1.75;
    if (nextHeight === height) return height < 1.5;
    const blockedStand =
      nextHeight > height &&
      physics.intersectionWithShape(
        { x: position.x, y: position.y + nextHeight / 2, z: position.z },
        { x: 0, y: 0, z: 0, w: 1 },
        new RAPIER.Capsule((nextHeight - 0.6) / 2, 0.3),
        undefined,
        undefined,
        undefined,
        undefined,
        ignoreCharacters,
      ) !== null;
    if (!blockedStand) {
      physics.removeCollider(capsule, true);
      height = nextHeight;
      capsule = physics.createCollider(
        RAPIER.ColliderDesc.capsule((height - 0.6) / 2, 0.3),
        body,
      );
      capsule.setEnabled(!driving);
      body.setTranslation(
        { x: position.x, y: position.y + height / 2, z: position.z },
        true,
      );
    }
    return height < 1.5;
  }
  function pathOutdoor(from: THREE.Vector3, to: THREE.Vector3) {
    if (disposed) return [];
    if (!driveMap)
      return campusPath(query, from, to)
        .filter((p) => p.y > -0.35 && p.y < 0.8)
        .map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const valid = (points: THREE.Vector3[], target: THREE.Vector3) =>
      points.length > 1 &&
      points.at(-1)!.distanceTo(target) < 1.5 &&
      points.every((p, i) => {
        if (!drivePointAllowed(driveMap!, p)) return false;
        if (!i) return true;
        const count = Math.max(1, Math.ceil(p.distanceTo(points[i - 1]) / 0.7));
        for (let j = 1; j <= count; j++)
          if (
            !drivePointAllowed(
              driveMap!,
              points[i - 1].clone().lerp(p, j / count),
            )
          )
            return false;
        return true;
      });
    const edge = (a: THREE.Vector3, b: THREE.Vector3) => {
      const p = campusPath(query, a, b).map(
        (x) => new THREE.Vector3(x.x, x.y, x.z),
      );
      return valid(p, b) ? p : [];
    };
    const direct = edge(from, to);
    if (direct.length) return direct;
    const anchors = (driveMap.outdoorWaypoints ?? []).map(
      (p) => new THREE.Vector3(...p),
    );
    if (!anchors.length) return [];
    if (!outdoorGraph) {
      outdoorGraph = anchors.map((a, i) =>
        anchors.map((b, j) =>
          driveMap!.outdoorEdges ? [] : i === j ? [] : edge(a, b),
        ),
      );
      for (const e of driveMap.outdoorEdges ?? [])
        if (outdoorGraph[e.from]?.[e.to])
          outdoorGraph[e.from][e.to] = e.points.map(
            (p) => new THREE.Vector3(...p),
          );
    }
    const nodes = [from, ...anchors, to],
      end = nodes.length - 1,
      dist = nodes.map(() => Infinity),
      visited = new Set<number>(),
      previous = nodes.map(() => -1),
      routes: THREE.Vector3[][] = nodes.map(() => []);
    dist[0] = 0;
    for (let k = 0; k < nodes.length; k++) {
      let at = -1;
      for (let i = 0; i < nodes.length; i++)
        if (!visited.has(i) && (at < 0 || dist[i] < dist[at])) at = i;
      if (at < 0 || !Number.isFinite(dist[at])) break;
      if (at === end) break;
      visited.add(at);
      for (let next = 1; next < nodes.length; next++) {
        if (visited.has(next) || next === at) continue;
        const p =
          at > 0 && at < end && next < end
            ? outdoorGraph[at - 1][next - 1]
            : edge(nodes[at], nodes[next]);
        if (!p.length) continue;
        const length = p
          .slice(1)
          .reduce((sum, v, i) => sum + v.distanceTo(p[i]), 0);
        if (dist[at] + length < dist[next]) {
          dist[next] = dist[at] + length;
          previous[next] = at;
          routes[next] = p;
        }
      }
    }
    if (previous[end] < 0) return [];
    let at = end,
      result: THREE.Vector3[] = [];
    while (at > 0) {
      result = [...routes[at], ...result];
      at = previous[at];
    }
    return result;
  }
  function prepareStairTraffic() {
    if (trafficFrame === navigationFrame) return;
    trafficFrame = navigationFrame;
    const participants: {
      id: number;
      key: string;
      direction: 1 | -1;
    }[] = [];
    for (const [id, actor] of actors) {
      const goal = navigationGoals.get(id);
      if (!goal || actor.thrown) continue;
      const raw = actor.body.translation(),
        p = new THREE.Vector3(raw.x, raw.y - actor.height / 2, raw.z);
      let best:
        | {
            key: string;
            distance: number;
          }
        | undefined;
      for (const line of stairLines) {
        const lower = line.points[0].y,
          upper = line.points.at(-1)!.y;
        if (p.y < lower + 0.12 || p.y > upper - 0.12) continue;
        let distance = Infinity;
        for (let i = 1; i < line.points.length; i++) {
          const a = line.points[i - 1],
            delta = line.points[i].clone().sub(a),
            t = THREE.MathUtils.clamp(
              p.clone().sub(a).dot(delta) / delta.lengthSq(),
              0,
              1,
            );
          distance = Math.min(
            distance,
            p.distanceTo(a.clone().addScaledVector(delta, t)),
          );
        }
        if (distance < 1 && (!best || distance < best.distance))
          best = { key: line.key, distance };
      }
      if (best && Math.abs(goal.y - p.y) > 0.35)
        participants.push({
          id,
          key: best.key,
          direction: goal.y > p.y ? 1 : -1,
        });
    }
    if (playerStairMotion && !driving) {
      const { position: p, direction } = playerStairMotion;
      let best:
        | {
            key: string;
            distance: number;
            direction: 1 | -1;
          }
        | undefined;
      for (const line of stairLines) {
        const lower = line.points[0].y,
          upper = line.points.at(-1)!.y;
        if (p.y < lower + 0.12 || p.y > upper - 0.12) continue;
        for (let i = 1; i < line.points.length; i++) {
          const a = line.points[i - 1],
            delta = line.points[i].clone().sub(a),
            t = THREE.MathUtils.clamp(
              p.clone().sub(a).dot(delta) / delta.lengthSq(),
              0,
              1,
            ),
            distance = p.distanceTo(a.clone().addScaledVector(delta, t)),
            flat = delta.clone().setY(0);
          if (flat.lengthSq() < 0.001) continue;
          const dot = direction.dot(flat.normalize());
          if (
            distance < 1 &&
            Math.abs(dot) > 0.001 &&
            (!best || distance < best.distance)
          )
            best = { key: line.key, distance, direction: dot > 0 ? 1 : -1 };
        }
      }
      if (best)
        participants.push({ id: -1, key: best.key, direction: best.direction });
    }
    stairFlow.update(participants);
  }
  function stairYieldMotion(
    id: number,
    position: THREE.Vector3,
    _desired: THREE.Vector3,
    dt: number,
  ) {
    prepareStairTraffic();
    const yieldFor = stairFlow.yieldFor(id);
    if (!yieldFor) {
      stairHolding.delete(id);
      return null;
    }
    navigationAvoidance.yield(id);
    const line = stairLines.find((l) => l.key === yieldFor.key);
    if (!line) return null;
    let holding = stairHolding.get(id);
    if (!holding || holding.key !== line.key) {
      const landing =
          yieldFor.direction > 0 ? line.points[0] : line.points.at(-1)!,
        towards = new THREE.Vector3(-51, landing.y, -77.4)
          .sub(landing)
          .setY(0)
          .normalize();
      let target: THREE.Vector3 | undefined;
      for (const radius of [1.8, 2.6, 3.4]) {
        for (const angle of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4]) {
          const candidate = landing
              .clone()
              .addScaledVector(
                towards
                  .clone()
                  .applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
                radius,
              ),
            nearest = query.findClosestPoint(candidate, {
              halfExtents: { x: 0.45, y: 0.35, z: 0.45 },
            });
          if (!nearest.success) continue;
          const point = new THREE.Vector3(
            nearest.point.x,
            nearest.point.y,
            nearest.point.z,
          );
          point.y = groundHeight(point);
          if (
            Math.abs(point.y - landing.y) > 0.25 ||
            !supportAt(point, 1.75)?.clear ||
            [...stairHolding.values()].some(
              (h) => h.target.distanceTo(point) < 0.8,
            )
          )
            continue;
          const route = safePath(landing, point);
          if (route.length < 2) continue;
          target = point;
          break;
        }
        if (target) break;
      }
      if (!target) return new THREE.Vector3();
      holding = { key: line.key, target, path: [], repath: 0 };
      stairHolding.set(id, holding);
    }
    navigationAvoidance.yield(id);
    holding.repath -= dt;
    if (holding.repath <= 0 || !holding.path.length) {
      holding.repath = 0.5;
      holding.path = safePath(position, holding.target);
    }
    if (position.distanceTo(holding.target) < 0.3) return new THREE.Vector3();
    return pathMotion(position, holding.path, 1.8, dt);
  }
  function safePath(from: THREE.Vector3, to: THREE.Vector3) {
    if (disposed) return [];
    const corridor = storyCorridorPath(physics, from, to);
    if (corridor) return normalizeCampusRoute(from, to, corridor);
    if (storyDirectRoute(physics, from, to)) return [from.clone(), to.clone()];
    return normalizeCampusRoute(
      from,
      to,
      continuousCampusPath(query, manifest, from, to).map((p) => {
        const v = new THREE.Vector3(p.x, p.y, p.z);
        v.y = groundHeight(v);
        return v;
      }),
    );
  }
  function actorPath(
    id: number,
    from: THREE.Vector3,
    to: THREE.Vector3,
    commitGoal = true,
  ) {
    if (commitGoal) navigationGoals.set(id, to.clone());
    const direct = safePath(from, to);
    if (!direct.length) return [];
    const next = direct.find(
      (p) => Math.hypot(p.x - from.x, p.z - from.z) > 0.1,
    );
    if (!next || !navigationAvoidance.excludes(id, from, next)) return direct;
    // Reuse the actual navmesh for both legs. A local alternative must have
    // standing support and swept clearance; failure waits for the 8s retry.
    const direction = next.clone().sub(from).setY(0).normalize();
    for (const radius of [1.2, 2.4, 3.6])
      for (const angle of [
        Math.PI / 2,
        -Math.PI / 2,
        Math.PI * 0.75,
        -Math.PI * 0.75,
        Math.PI,
      ]) {
        const candidate = from
          .clone()
          .addScaledVector(
            direction.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle),
            radius,
          );
        const nearest = query.findClosestPoint(candidate, {
          halfExtents: { x: 0.6, y: 0.35, z: 0.6 },
        });
        if (!nearest.success) continue;
        const point = new THREE.Vector3(
          nearest.point.x,
          nearest.point.y,
          nearest.point.z,
        );
        point.y = groundHeight(point);
        if (Math.abs(point.y - from.y) > 0.3 || !supportAt(point, 1.75)?.clear)
          continue;
        const first = safePath(from, point),
          second = safePath(point, to);
        if (
          first.length < 2 ||
          second.length < 2 ||
          !npcRouteSafe(
            [from, ...first],
            first
              .slice(1)
              .reduce((sum, p, i) => sum + p.distanceTo(first[i]), 0),
          )
        )
          continue;
        const initial = first.find(
          (p) => Math.hypot(p.x - from.x, p.z - from.z) > 0.1,
        );
        if (!initial || navigationAvoidance.excludes(id, from, initial))
          continue;
        return [...first, ...second.slice(1)];
      }
    return [];
  }
  return {
    manifest,
    setCrouch,
    supportAt,
    npcRouteSafe,
    restorePlayer,
    pathOutdoor,
    actorPosition(id) {
      const a = actors.get(id);
      return a
        ? new THREE.Vector3(
            a.body.translation().x,
            a.body.translation().y - a.height / 2,
            a.body.translation().z,
          )
        : null;
    },
    step(dt) {
      if (disposed) return 0;
      const started = performance.now();
      physics.timestep = Math.min(0.05, Math.max(1 / 120, dt));
      physics.propagateModifiedBodyPositionsToColliders();
      driving?.prepareContacts(dt);
      physics.step(driving?.eventQueue, driving?.physicsHooks);
      navigationAvoidance.tick(dt);
      stairFlow.tick(dt);
      navigationFrame++;
      return performance.now() - started;
    },
    validateDrivingSpawn(map, point, yaw) {
      return validateDrivingSpawn(physics, map, point, yaw);
    },
    startDriving(map) {
      driving?.dispose();
      driveMap = map;
      outdoorGraph = undefined;
      capsule.setEnabled(false);
      driving = createDrivingPhysics(
        physics,
        map,
        actors,
        playerController,
        () => {
          capsule.setEnabled(true);
          driving = undefined;
          driveMap = undefined;
          outdoorGraph = undefined;
        },
      );
      physics.propagateModifiedBodyPositionsToColliders();
      return driving;
    },
    move(position, desired, _dt, crouch) {
      if (disposed)
        return {
          position: position.clone(),
          grounded: false,
          crouching: height < 1.5,
        };
      playerStairMotion = {
        position: position.clone(),
        direction: new THREE.Vector3(desired.x, 0, desired.z),
      };
      const crouching = setCrouch(position, crouch);
      body.setTranslation(
        { x: position.x, y: position.y + height / 2, z: position.z },
        true,
      );
      // Rapier's broadphase must see the kinematic capsule's current transform before querying.
      physics.propagateModifiedBodyPositionsToColliders();
      controller.computeColliderMovement(
        capsule,
        desired,
        undefined,
        undefined,
        (c) => c.handle !== capsule.handle,
      );
      let moved = controller.computedMovement();
      if (
        desired.y <= 0 &&
        Math.hypot(moved.x, moved.z) < Math.hypot(desired.x, desired.z) * 0.75
      ) {
        const lift = storyCurbLift(physics, position, desired);
        if (lift > 0) {
          controller.computeColliderMovement(
            capsule,
            desired.clone().setY(Math.max(0, desired.y) + lift),
            undefined,
            undefined,
            (c) => c.handle !== capsule.handle,
          );
          moved = controller.computedMovement();
        }
      }
      const next = position
        .clone()
        .add(new THREE.Vector3(moved.x, moved.y, moved.z));
      body.setNextKinematicTranslation({
        x: next.x,
        y: next.y + height / 2,
        z: next.z,
      });
      return {
        position: next,
        grounded: controller.computedGrounded(),
        crouching,
      };
    },
    // Visibility and gun wall tests query static architecture. The vehicle shell
    // is a distinct combat target (DrivingPhysics.hitDistance), never its own cover.
    rayDistance(origin, direction, max) {
      const hit = physics.castRay(
        new RAPIER.Ray(origin, direction),
        max,
        true,
        RAPIER.QueryFilterFlags.ONLY_FIXED,
      );
      return hit ? hit.timeOfImpact : max;
    },
    visionRayDistance(origin,direction,max){
      const hit=physics.castRay(new RAPIER.Ray(origin,direction),max,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
      return Math.min(hit?.timeOfImpact??max,vision.rayDistance(origin,direction,max));
    },
    visionVisible(from,to){
      const direction=to.clone().sub(from),length=direction.length();
      if(length<.005)return true;
      direction.divideScalar(length);
      const hit=physics.castRay(new RAPIER.Ray(from,direction),length,true,RAPIER.QueryFilterFlags.ONLY_FIXED);
      return Math.min(hit?.timeOfImpact??length,vision.rayDistance(from,direction,length))>=length-.005;
    },
    rayImpact(origin, direction, max) {
      const hit = physics.castRayAndGetNormal(
        new RAPIER.Ray(origin, direction),
        max,
        true,
        RAPIER.QueryFilterFlags.ONLY_FIXED,
      );
      return hit
        ? {
            distance: hit.timeOfImpact,
            normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
          }
        : null;
    },
    path(from, to) {
      return safePath(from, to);
    },
    storyPath(from, to) {
      return safePath(from, to);
    },
    actorPath,
    actorNavigationStatus(id) {
      const status = navigationAvoidance.status(id);
      return stairFlow.yieldFor(id)
        ? {
            blocked: status?.blocked ?? false,
            avoidanceLeft: status?.avoidanceLeft ?? 0,
            yielding: true,
          }
        : status;
    },
    nearest(point) {
      if (disposed) return point.clone();
      const r = query.findClosestPoint(point, {
        halfExtents: { x: 2, y: 1.2, z: 2 },
      });
      if (!r.success) return point.clone();
      const p = new THREE.Vector3(r.point.x, r.point.y, r.point.z);
      p.y = groundHeight(p);
      return p;
    },
    update(
      position,
      low,
      observers = [],
      drivingPreview,
      outdoorOnly = !!driving,
    ) {
      const point = position.toArray(),
        status = streamer.update(
          point,
          observers.map((p) => p.toArray()),
          low,
          manifest.floors ?? [],
          {
            isDriving: outdoorOnly || !!driving,
            outdoorOnly,
            lookAhead:
              drivingPreview?.toArray() ??
              (!driving && !outdoorOnly
                ? walkingPrefetch.update(point, performance.now())
                : undefined),
          },
        );
      const floor = manifest.floors?.reduce((best, f) =>
          Math.abs(position.y - f.elevation) <
          Math.abs(position.y - best.elevation)
            ? f
            : best,
        ),
        bounds = floor?.bounds;
      const inside =
        bounds &&
        position.x >= bounds.min[0] - 1 &&
        position.x <= bounds.max[0] + 1 &&
        position.z >= bounds.min[2] - 1 &&
        position.z <= bounds.max[2] + 1;
      streamer.forEach((asset, chunk, distance) => {
        const allowed =
            chunk.kind !== "interior" ||
            (!outdoorOnly &&
              (!floor ||
                !chunk.floor ||
                (inside
                  ? Math.abs(chunk.floor - floor.id) <= 1
                  : chunk.floor === 1))),
          visible = streamer.hasCombatLease() && combatStructure(chunk) ? streamer.inCombatView(chunk.url) :
            streamer.inCombatView(chunk.url) ||
            !!allowed &&
            (distance < (chunk.kind === "interior" ? 19 : low ? 60 : 75) ||
              (!!photoView &&
                chunk.kind !== "interior" &&
                streamer.inPhotoView(chunk.url))),
          shadowNear = visible && distance < 45;
        if (asset.visible !== visible) {
          asset.visible = visible;
          visibilityRevision++;
        }
        if (asset.userData.shadowNear !== shadowNear) {
          asset.userData.shadowNear = shadowNear;
          visibilityRevision++;
          asset.traverse((o) => {
            if (o instanceof THREE.Mesh)
              o.castShadow = shadowNear && !!o.userData.campusShadowCaster;
          });
        }
      });
      return {
        ...status,
        revision: (status.revision ?? 0) + visibilityRevision,
      };
    },
    // Director cameras may opt into a bounded view budget; ordinary photography
    // still requests its actual lens range. Neither expands the simulation gate.
    setPhotoView(camera, far) {
      photoView = camera
        ? {
            origin: camera.position.toArray(),
            direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
            fov: camera.fov,
            aspect: camera.aspect,
            far:
              far === undefined
                ? camera.far
                : Math.max(camera.near, Math.min(camera.far, far)),
          }
        : null;
      streamer.setPhotoView(photoView);
    },
    setCombatView(camera,far=420,nextOrigin){
      if(!camera){streamer.setCombatViews(null);return;}
      const view:PhotoView={origin:camera.position.toArray(),direction:camera.getWorldDirection(new THREE.Vector3()).toArray(),fov:camera.fov,aspect:camera.aspect,far:Math.min(camera.far,far)};
      streamer.setCombatViews(nextOrigin?[view,{...view,origin:nextOrigin.toArray()}]:[view]);
    },
    retry() {
      streamer.retry();
    },
    checkSafety(position,low,outdoorOnly=false){return streamer.checkSafety(position.toArray(),low,manifest.floors??[],{isDriving:outdoorOnly||!!driving,outdoorOnly});},
    prepareCombat(signal,onProgress){return streamer.prepareCombat(signal,onProgress);},
    diagnostics(){return {...streamer.diagnostics(),gpu:scenePreparer.diagnostics(),resources:resources.diagnostics(),decode:decodeQueue.diagnostics()};},
    retryView() {
      streamer.retryView();
    },
    prepareViews(views, signal, onProgress) {
      return streamer.prepareViews(views, signal, onProgress);
    },
    resetActors,
    removeActor(id) {
      const actor = actors.get(id);
      if (!actor) return;
      physics.removeCharacterController(actor.controller);
      physics.removeRigidBody(actor.body);
      actors.delete(id);
      navigationAvoidance.remove(id);
      crowdDirections.delete(id);
      navigationGoals.delete(id);
      stairFlow.remove(id);
      stairHolding.delete(id);
    },
    moveActor(id, position, desired, dt, crouch = false) {
      if (disposed) return position.clone();
      let actor = actors.get(id);
      if (actor?.thrown)
        return new THREE.Vector3(
          actor.body.translation().x,
          actor.body.translation().y - actor.height / 2,
          actor.body.translation().z,
        );
      const nextHeight = crouch ? 1.15 : 1.75;
      if (!actor) {
        const b = physics.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased(),
        );
        const c = physics.createCollider(
            RAPIER.ColliderDesc.capsule((nextHeight - 0.6) / 2, 0.3),
            b,
          ),
          ctl = physics.createCharacterController(0.015);
        ctl.enableAutostep(0.42, 0.2, false);
        ctl.enableSnapToGround(0.3);
        ctl.setMaxSlopeClimbAngle(Math.PI * 0.27);
        ctl.setMinSlopeSlideAngle(Math.PI * 0.3);
        actor = {
          body: b,
          capsule: c,
          controller: ctl,
          height: nextHeight,
          vertical: 0,
          grounded: false,
        };
        actors.set(id, actor);
      }
      const standBlocked =
        nextHeight > actor.height &&
        physics.intersectionWithShape(
          { x: position.x, y: position.y + nextHeight / 2, z: position.z },
          { x: 0, y: 0, z: 0, w: 1 },
          new RAPIER.Capsule((nextHeight - 0.6) / 2, 0.3),
          undefined,
          undefined,
          undefined,
          undefined,
          ignoreCharacters,
        ) !== null;
      if (actor.height !== nextHeight && !standBlocked) {
        physics.removeCollider(actor.capsule, true);
        actor.height = nextHeight;
        actor.capsule = physics.createCollider(
          RAPIER.ColliderDesc.capsule((nextHeight - 0.6) / 2, 0.3),
          actor.body,
        );
      }
      actor.body.setTranslation(
        { x: position.x, y: position.y + actor.height / 2, z: position.z },
        true,
      );
      actor.vertical = actor.grounded
        ? -0.25
        : Math.max(-20, actor.vertical - 14 * dt);
      physics.propagateModifiedBodyPositionsToColliders();
      const neighbours = [...actors]
        .filter(([otherId, a]) => otherId !== id && !a.thrown)
        .map(([otherId, a]) => {
          const p = a.body.translation();
          return {
            id: otherId,
            position: new THREE.Vector3(p.x, p.y - a.height / 2, p.z),
            direction: crowdDirections.get(otherId) ?? new THREE.Vector3(),
          };
        });
      const yielded = stairYieldMotion(id, position, desired, dt),
        requested = yielded ?? desired;
      const crowd = crowdMotion(id, position, requested, neighbours, dt);
      crowdDirections.set(id, requested.clone());
      if (crowd.yielding) navigationAvoidance.yield(id);
      const motion = {
        x: crowd.motion.x,
        y: desired.y + actor.vertical * dt,
        z: crowd.motion.z,
      };
      actor.controller.computeColliderMovement(
        actor.capsule,
        motion,
        undefined,
        undefined,
        (c) => c.handle !== actor!.capsule.handle,
      );
      let movement = actor.controller.computedMovement();
      if (
        desired.y <= 0 &&
        Math.hypot(movement.x, movement.z) <
          Math.hypot(crowd.motion.x, crowd.motion.z) * 0.75
      ) {
        const lift = storyCurbLift(physics, position, crowd.motion);
        if (lift > 0) {
          actor.vertical = 0;
          actor.controller.computeColliderMovement(
            actor.capsule,
            { ...motion, y: Math.max(0, desired.y) + lift },
            undefined,
            undefined,
            (c) => c.handle !== actor!.capsule.handle,
          );
          movement = actor.controller.computedMovement();
        }
      }
      const next = position
        .clone()
        .add(new THREE.Vector3(movement.x, movement.y, movement.z));
      actor.grounded = actor.controller.computedGrounded();
      let staticBlocked = false;
      for (let i = 0; i < actor.controller.numComputedCollisions(); i++) {
        const hit = actor.controller.computedCollision(i);
        if (
          hit?.collider &&
          (hit.collider.parent() === null ||
            hit.collider.parent()!.isFixed()) &&
          hit.normal1.y < 0.98
        )
          staticBlocked = true;
      }
      if (!yielded)
        navigationAvoidance.observe(
          id,
          position,
          desired,
          new THREE.Vector3(movement.x, movement.y, movement.z),
          staticBlocked,
          dt,
        );
      actor.body.setNextKinematicTranslation({
        x: next.x,
        y: next.y + actor.height / 2,
        z: next.z,
      });
      return next;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      streamer.dispose();
      scenePreparer.dispose();
      root.removeFromParent();
      resetActors();
      query.destroy();
      navMesh.destroy();
      vision.dispose();
      physics.free();
    },
  };
}
export function continuousCampusPath(
  query: NavMeshQuery,
  manifest: MapManifest,
  from: THREE.Vector3,
  to: THREE.Vector3,
) {
  // Recast's nearest polygon may alternate between adjacent treads during frequent replans.
  // Continue along the surveyed stair centreline until the landing, with physical movement
  // still handled by the same capsule controller. Never reposition an actor onto this path.
  const closest = (points: THREE.Vector3[], point: THREE.Vector3) => {
    let result:
      | {
          segment: number;
          projection: THREE.Vector3;
          distance: number;
          progress: number;
        }
      | undefined;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        ab = points[i + 1].clone().sub(a),
        length = ab.lengthSq();
      const t = length
          ? THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / length, 0, 1)
          : 0,
        projection = a.clone().addScaledVector(ab, t),
        distance = point.distanceTo(projection);
      if (!result || distance < result.distance)
        result = { segment: i, projection, distance, progress: i + t };
    }
    return result!;
  };
  let match:
    | (ReturnType<typeof closest> & {
        points: THREE.Vector3[];
      })
    | undefined;
  for (const route of manifest.stairRoutes ?? []) {
    const points = route.points.map((p) => new THREE.Vector3(...p)),
      lower = points[0].y,
      upper = points.at(-1)!.y;
    if (from.y < lower + 0.28 || from.y > upper - 0.28) continue;
    const candidate = closest(points, from);
    if (
      candidate.distance < 0.9 &&
      (!match || candidate.distance < match.distance)
    )
      match = { points, ...candidate };
  }
  if (!match) return campusPath(query, from, to);
  const { points, segment, projection } = match,
    target = closest(points, to);
  if (target.distance < 0.9) {
    const between =
      target.progress >= match.progress
        ? points.slice(segment + 1, target.segment + 1)
        : points.slice(target.segment + 1, segment + 1).reverse();
    return [projection, ...between, target.projection, to.clone()];
  }
  const ascending = to.y >= from.y;
  const prefix = ascending
    ? [projection, ...points.slice(segment + 1)]
    : [projection, ...points.slice(0, segment + 1).reverse()];
  const landing = prefix.at(-1)!;
  return [...prefix, ...campusPath(query, landing, to)];
}
export function campusPath(
  query: NavMeshQuery,
  from: THREE.Vector3,
  to: THREE.Vector3,
) {
  type Point = {
    x: number;
    y: number;
    z: number;
  };
  const plain = (a: Point, b: Point) => {
    const r = query.computePath(a, b, {
      halfExtents: { x: 3, y: 1.2, z: 3 },
      maxPathPolys: 512,
      maxStraightPathPoints: 256,
    });
    return r.success ? r.path : [];
  };
  const radius = (p: Point) => Math.hypot(p.x - 44, p.z + 124);
  const inside = (p: Point) => p.y < -0.4 && radius(p) < 19;
  const heightAt = (r: number) =>
    -2.36 + Math.min(1, Math.max(0, (r - 8.75) / (18.55 - 8.75))) * 2.54;
  const point = (angle: number, r: number): Point => ({
    x: 44 + r * Math.cos(angle),
    y: heightAt(r),
    z: -124 - r * Math.sin(angle),
  });
  const ramp = (angle: number, start: number, end: number) => {
    const count = Math.max(1, Math.ceil(Math.abs(end - start) / 0.4));
    return Array.from({ length: count + 1 }, (_, i) =>
      point(angle, start + ((end - start) * i) / count),
    );
  };
  // Preserve the aisle occupied now, even after the target crosses the courtyard centre.
  // Rebuilding from this radius trims completed ramp points on every NPC replan.
  const aisleAt = (p: Point) => {
    const r = radius(p);
    if (r < 8.1 || r > 19.21 || Math.abs(p.y - heightAt(r)) > 0.5) return null;
    const options = [-131, -55, 55, 131]
      .map((degrees) => {
        const angle = (degrees * Math.PI) / 180,
          q = point(angle, r);
        return { angle, r, distance: Math.hypot(p.x - q.x, p.z - q.z) };
      })
      .sort((a, b) => a.distance - b.distance);
    return options[0].distance <= Math.max(0.48, r * 0.047 + 0.16)
      ? options[0]
      : null;
  };
  const sourceAisle = aisleAt(from),
    targetAisle = aisleAt(to);
  if (sourceAisle) {
    const { angle, r } = sourceAisle;
    if (targetAisle) {
      if (angle === targetAisle.angle) return ramp(angle, r, targetAisle.r);
      return [
        ...ramp(angle, r, 8.1),
        ...plain(point(angle, 8.1), point(targetAisle.angle, 8.1)),
        ...ramp(targetAisle.angle, 8.1, targetAisle.r),
      ];
    }
    if (inside(to))
      return [...ramp(angle, r, 8.1), ...plain(point(angle, 8.1), to)];
    if (r >= 19.15) return plain(from, to);
    return [...ramp(angle, r, 19.2), ...plain(point(angle, 19.2), to)];
  }
  if (targetAisle) {
    const { angle, r } = targetAisle,
      entry = inside(from) ? 8.1 : 19.2;
    return [...plain(from, point(angle, entry)), ...ramp(angle, entry, r)];
  }
  if (inside(from) === inside(to)) return plain(from, to);
  const outside = inside(from) ? to : from,
    angle = ((outside.z > -124 ? -55 : 55) * Math.PI) / 180;
  const inner = point(angle, 8.1),
    outer = point(angle, 19.2);
  return inside(from)
    ? [...plain(from, inner), ...ramp(angle, 8.1, 19.2), ...plain(outer, to)]
    : [...plain(from, outer), ...ramp(angle, 19.2, 8.1), ...plain(inner, to)];
}
