import type { MapChunk, Vec3 } from "./types";
import { withDeadline } from "./network.ts";
export type StreamStatus = {
  blocked: boolean;
  failed: boolean;
  loaded: number;
  resident: number;
  needed: number;
  progress: number;
  viewReady: boolean;
  viewFailed: boolean;
  viewProgress: number;
  message: string;
  revision?: number;
  combatReady?: boolean;
  combatProgress?: number;
  viewRevision?: number;
};
export type PhotoView = {
  origin: Vec3;
  direction: Vec3;
  fov: number;
  aspect: number;
  far: number;
};
export type StreamDriving = {
  isDriving?: boolean;
  outdoorOnly: boolean;
  lookAhead?: Vec3;
};
type ViewBounds = {
  x: number;
  y: number;
  z: number;
  radius: number;
  half: Vec3;
};
function viewBounds(chunk: MapChunk): ViewBounds {
  const b = chunk.bounds;
  if (!b)
    return {
      x: chunk.center[0],
      y: chunk.center[1],
      z: chunk.center[2],
      radius: chunk.radius,
      half: [chunk.radius, chunk.radius, chunk.radius],
    };
  return {
    x: (b.min[0] + b.max[0]) / 2,
    y: (b.min[1] + b.max[1]) / 2,
    z: (b.min[2] + b.max[2]) / 2,
    radius:
      Math.hypot(
        b.max[0] - b.min[0],
        b.max[1] - b.min[1],
        b.max[2] - b.min[2],
      ) / 2,
    half: [(b.max[0]-b.min[0])/2,(b.max[1]-b.min[1])/2,(b.max[2]-b.min[2])/2],
  };
}
type ViewPlane = [number,number,number,number];
function viewPlanes(view:PhotoView):ViewPlane[]{
  // Test an AABB against the six rectangular view planes. A diagonal cone admitted
  // entire floors outside the actual screen, especially at the corners of scopes.
  const size = Math.hypot(...view.direction) || 1,
    forward = view.direction.map(n=>n/size) as Vec3,
    horizontal = Math.hypot(forward[0],forward[2]),
    right: Vec3 = horizontal > 1e-6 ? [-forward[2]/horizontal,0,forward[0]/horizontal] : [1,0,0],
    up: Vec3 = [right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]],
    verticalTan = Math.tan(Math.max(1,Math.min(175,view.fov))*Math.PI/360),
    horizontalTan = verticalTan*Math.max(.1,view.aspect);
  const plane=(normal:Vec3,offset=0):ViewPlane=>[...normal,offset-normal.reduce((sum,n,i)=>sum+n*view.origin[i],0)];
  return [plane(forward),plane(forward.map(n=>-n) as Vec3,view.far),
    ...[-1,1].flatMap(sign=>[plane(forward.map((n,i)=>n*horizontalTan+right[i]*sign) as Vec3),plane(forward.map((n,i)=>n*verticalTan+up[i]*sign) as Vec3)])];
}
function boundsInPlanes(bounds:ViewBounds,planes:ViewPlane[]):boolean{
  for(const [x,y,z,d] of planes)if(x*bounds.x+y*bounds.y+z*bounds.z+d+Math.abs(x)*bounds.half[0]+Math.abs(y)*bounds.half[1]+Math.abs(z)*bounds.half[2]<0)return false;
  return true;
}
function boundsInPhotoView(bounds: ViewBounds, view: PhotoView): boolean {
  return boundsInPlanes(bounds,viewPlanes(view));
}
export const combatStructure = (chunk:MapChunk) => chunk.residency ? chunk.residency==='structure' : chunk.combatOccluder!==false;
export function chunkInPhotoView(chunk: MapChunk, view: PhotoView): boolean {
  return boundsInPhotoView(viewBounds(chunk), view);
}
export function chunkDistance(chunk: MapChunk, point: Vec3): number {
  if (chunk.bounds) {
    const { min, max } = chunk.bounds;
    return Math.hypot(
      Math.max(min[0] - point[0], 0, point[0] - max[0]),
      Math.max(min[1] - point[1], 0, point[1] - max[1]),
      Math.max(min[2] - point[2], 0, point[2] - max[2]),
    );
  }
  return Math.max(
    0,
    Math.hypot(
      point[0] - chunk.center[0],
      point[1] - chunk.center[1],
      point[2] - chunk.center[2],
    ) - chunk.radius,
  );
}
/** Nearby architecture gates simulation; distant view scenery only gates a photograph. */
export class ChunkStreamer<T> {
  private assets = new Map<string, T>();
  private pending = new Map<string, Promise<void>>();
  private requests = new Map<
    string,
    {
      controller: AbortController;
      started: number;
      cancelled: boolean;
    }
  >();
  private failures = new Map<string, number>();
  private needed: MapChunk[] = [];
  private wanted: MapChunk[] = [];
  private alive = true;
  private initialTotal = 0;
  private initialDone = 0;
  private revision = 0;
  private photoView: PhotoView | null = null;
  private viewNeeded: MapChunk[] = [];
  private leases = new Map<symbol, Set<string>>();
  private listeners = new Set<() => void>();
  private lastWanted = new Map<string, number>();
  private index: Map<string, MapChunk>;
  private bounds: Map<string, ViewBounds>;
  private distances = new Map<string, number>();
  private aheadDistances = new Map<string, number>();
  private neededUrls = new Set<string>();
  private wantedUrls = new Set<string>();
  private viewUrls = new Set<string>();
  private combatUrls = new Set<string>();
  private combatRevision = 0;
  private combatLeases = new Set<symbol>();
  private cachedStatus:StreamStatus|null=null;
  private combatCore: MapChunk[];
  private counters = {updates:0, geometryScans:0, loads:0, evictions:0, distanceEvictions:0, budgetEvictions:0, cancelled:0};
  private residencyRevision=-1;
  private residencyAt=-Infinity;
  private nextResidencyExpiry=Infinity;
  private pinnedUrls = new Set<string>();
  private pumping = false;
  private geometryDirty = true;
  private queueDirty = true;
  private queue: MapChunk[] = [];
  private geometryInput?: {
    player: Vec3;
    low: boolean;
    floors: {
      id: number;
      elevation: number;
    }[];
    isDriving: boolean;
    outdoorOnly: boolean;
    lookAhead?: Vec3;
  };
  setPhotoView(view: PhotoView | null) {
    const old = this.photoView;
    if (
      (old === null && view === null) ||
      (old &&
        view &&
        old.fov === view.fov &&
        old.aspect === view.aspect &&
        old.far === view.far &&
        old.origin.every((n, i) => n === view.origin[i]) &&
        old.direction.every((n, i) => n === view.direction[i]))
    )
      return;
    this.photoView = view
      ? { ...view, origin: [...view.origin], direction: [...view.direction] }
      : null;
    const planes=view?viewPlanes(view):[];
    this.viewNeeded = view
      ? this.chunks.filter(
          (c) =>
            c.kind !== "interior" &&
            (!this.combatLeases.size || combatStructure(c)) &&
            boundsInPlanes(this.bounds.get(c.url)!, planes),
        )
      : [];
    this.viewUrls = new Set(this.viewNeeded.map((c) => c.url));
    this.geometryDirty = this.queueDirty = true;
    this.cachedStatus=null;
  }
  /** Only opaque scene structure gates combat; decorations remain optional prefetch. */
  setCombatViews(views: PhotoView[] | null) {
    const planes=views?.map(viewPlanes);
    const next = new Set(this.chunks.filter(c => combatStructure(c) &&
      !!planes?.some(view => boundsInPlanes(this.bounds.get(c.url)!, view))).map(c => c.url));
    if(next.size === this.combatUrls.size && [...next].every(url => this.combatUrls.has(url)))return;
    this.combatUrls = next;
    this.combatRevision++;
    this.cachedStatus=null;
    if (!this.combatLeases.size) this.geometryDirty = this.queueDirty = true;
  }
  inCombatView(url:string){return this.combatUrls.has(url);}
  hasCombatLease(){return this.combatLeases.size>0;}
  constructor(
    private chunks: MapChunk[],
    private load: (
      c: MapChunk,
      signal: AbortSignal,
      priority?: number,
    ) => Promise<T>,
    private release: (asset: T) => void,
    private now = () => performance.now(),
    private changed = () => {},
  ) {
    this.index = new Map(chunks.map((c) => [c.url, c]));
    this.bounds = new Map(chunks.map((c) => [c.url, viewBounds(c)]));
    this.combatCore = chunks.filter(combatStructure);
  }
  distanceTo(url: string) {
    return this.distances.get(url) ?? Infinity;
  }
  inPhotoView(url: string) {
    return this.viewUrls.has(url);
  }
  private rebuildPins() {
    this.residencyRevision=-1;
    this.pinnedUrls.clear();
    for (const urls of this.leases.values())
      for (const url of urls) this.pinnedUrls.add(url);
    this.queueDirty = true;
  }
  private priority(url: string) {
    return this.neededUrls.has(url) || this.combatUrls.has(url)
      ? 0
      : this.pinnedUrls.has(url)
        ? 1
        : this.viewUrls.has(url)
          ? 2
          : this.wantedUrls.has(url)
            ? 3
            : Infinity;
  }
  private cancelRequest(url: string, failed = false) {
    const request = this.requests.get(url);
    if (!request) return;
    request.cancelled = true;
    this.counters.cancelled++;
    if (failed) this.failures.set(url, this.now());
    this.pending.delete(url);
    this.requests.delete(url);
    request.controller.abort();
    this.cachedStatus=null;
  }
  async initialize(
    point: Vec3,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
  ) {
    // Decoration is streamed after entry; it must never hold the initial safety
    // barrier, including when a nearby book/paper response stalls indefinitely.
    const first = this.chunks.filter((c) => c.residency !== 'detail' && chunkDistance(c, point) < 38);
    this.initialTotal = first.reduce((n, c) => n + (c.bytes ?? 1), 0) || 1;
    const cancel = () => this.dispose();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      let next = 0;
      const worker = async () => {
        while (next < first.length) {
          if (signal?.aborted)
            throw new DOMException("Cancelled", "AbortError");
          const c = first[next++];
          await this.fetch(c, 0);
          this.initialDone += c.bytes ?? 1;
          onProgress(this.initialDone / this.initialTotal);
        }
      };
      await Promise.all([worker(), worker()]);
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }
  private async fetch(
    chunk: MapChunk,
    priority = this.priority(chunk.url),
  ): Promise<void> {
    if (!this.alive || this.assets.has(chunk.url)) return;
    const existing = this.pending.get(chunk.url);
    if (existing) return existing;
    const controller = new AbortController(),
      request = { controller, started: this.now(), cancelled: false };
    this.requests.set(chunk.url, request);
    let loading: Promise<T>;
    try {
      loading = this.load(
        chunk,
        controller.signal,
        Number.isFinite(priority) ? priority : 3,
      );
    } catch (error) {
      loading = Promise.reject(error);
    }
    const work = withDeadline(loading, 30000, {
      signal: controller.signal,
      onTimeout: () => controller.abort(),
      onLate: this.release,
    })
      .then((asset) => {
        if (
          !this.alive ||
          request.cancelled ||
          this.requests.get(chunk.url) !== request
        ) {
          this.release(asset);
          return;
        }
        this.assets.set(chunk.url, asset);
        this.counters.loads++;
        this.failures.delete(chunk.url);
        if (!this.lastWanted.has(chunk.url))
          this.lastWanted.set(chunk.url, this.now());
        this.revision++;
      })
      .catch((error) => {
        if (
          this.alive &&
          !request.cancelled &&
          this.requests.get(chunk.url) === request
        )
          this.failures.set(chunk.url, this.now());
        throw error;
      })
      .finally(() => {
        this.cachedStatus=null;
        if (this.requests.get(chunk.url) === request) {
          this.pending.delete(chunk.url);
          this.requests.delete(chunk.url);
        }
        if (this.alive) {
          this.pump();
          this.changed();
        }
        for (const notify of [...this.listeners]) notify();
      });
    this.pending.set(chunk.url, work);
    return work;
  }
  update(
    player: Vec3,
    _observers: Vec3[],
    low: boolean,
    floors: {
      id: number;
      elevation: number;
    }[] = [],
    driving?: StreamDriving,
  ): StreamStatus {
    this.counters.updates++;
    this.cachedStatus=null;
    if (!this.alive)
      return {
        blocked: false,
        failed: false,
        loaded: 0,
        resident: 0,
        needed: 0,
        progress: 1,
        viewReady: true,
        viewFailed: false,
        viewProgress: 1,
        message: "",
      };
    const now = this.now();
    for (const [url, request] of this.requests)
      if (now - request.started >= 30000) this.cancelRequest(url, true);
    // Full collision and navigation remain resident. Invisible NPCs do not need
    // another visual neighbourhood; expanding their anchors filled most of the map.
    const isDriving = driving?.isDriving ?? driving?.outdoorOnly ?? false,
      outdoorOnly = !!driving?.outdoorOnly,
      lookAhead = driving?.lookAhead,
      previous = this.geometryInput;
    const sameVector = (a: Vec3 | undefined, b: Vec3 | undefined) =>
      a === undefined
        ? b === undefined
        : !!b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const changed =
      this.geometryDirty ||
      !previous ||
      !sameVector(previous.player, player) ||
      previous.low !== low ||
      previous.isDriving !== isDriving ||
      previous.outdoorOnly !== outdoorOnly ||
      !sameVector(previous.lookAhead, lookAhead) ||
      previous.floors.length !== floors.length ||
      floors.some(
        (f, i) =>
          f.id !== previous.floors[i].id ||
          f.elevation !== previous.floors[i].elevation,
      );
    if (changed) {
      this.counters.geometryScans++;
      this.distances.clear();
      this.aheadDistances.clear();
      for (const c of this.chunks) {
        this.distances.set(c.url, chunkDistance(c, player));
        this.aheadDistances.set(
          c.url,
          lookAhead ? chunkDistance(c, lookAhead) : Infinity,
        );
      }
      const distance = (c: MapChunk) => this.distances.get(c.url)!,
        ahead = (c: MapChunk) => this.aheadDistances.get(c.url)!;
      const currentFloor = floors.reduce<
        | {
            id: number;
            elevation: number;
          }
        | undefined
      >(
        (best, f) =>
          !best ||
          Math.abs(f.elevation - player[1]) <
            Math.abs(best.elevation - player[1])
            ? f
            : best,
        undefined,
      );
      // Interior floors above/below a viewer are preloaded only near stairs/the room boundary.
      const photoWanted = (c: MapChunk) => this.viewUrls.has(c.url),
        floorById = new Map(floors.map((f) => [f.id, f]));
      this.needed = this.chunks.filter((c) => {
        if(this.combatLeases.size)return combatStructure(c);
        if(c.residency==='detail')return false;
        if(this.combatUrls.has(c.url))return true;
        if (c.kind !== "interior") return distance(c) < (isDriving ? 25 : 20);
        if (outdoorOnly) return false;
        const floor = floorById.get(c.floor!);
        return (
          distance(c) < 7 &&
          (!floor || Math.abs(player[1] - floor.elevation) < 2.25)
        );
      });
      this.neededUrls = new Set(this.needed.map((c) => c.url));
      this.wanted = this.chunks.filter(
        (c) =>
          !(outdoorOnly && c.kind === "interior") &&
          (distance(c) < (c.kind === "interior" ? 18 : low ? 75 : 90) ||
            ahead(c) < (c.kind === "interior" ? 12 : 30) ||
            photoWanted(c) || this.combatUrls.has(c.url)) &&
          (this.combatUrls.has(c.url) || c.kind !== "interior" ||
            !currentFloor ||
            !c.floor ||
            Math.abs(c.floor - currentFloor.id) <= 1),
      );
      this.wantedUrls = new Set(this.wanted.map((c) => c.url));
      this.geometryInput = {
        player: [...player],
        low,
        floors: floors.map((f) => ({ id: f.id, elevation: f.elevation })),
        isDriving,
        outdoorOnly,
        lookAhead: lookAhead ? [...lookAhead] : undefined,
      };
      this.geometryDirty = false;
      this.queueDirty = true;
    }
    const distance = (c: MapChunk) => this.distances.get(c.url)!,
      ahead = (c: MapChunk) => this.aheadDistances.get(c.url)!,
      photoWanted = (c: MapChunk) => this.viewUrls.has(c.url);
    for (const c of this.wanted) this.lastWanted.set(c.url, now);
    if(this.residencyRevision!==this.revision || now>=this.nextResidencyExpiry || now-this.residencyAt>=250 || previous?.outdoorOnly!==outdoorOnly){
    this.nextResidencyExpiry=Infinity;
    for (const [url, asset] of this.assets) {
      const chunk = this.index.get(url)!;
      if(!this.pinned(url)&&!this.wantedUrls.has(url)&&!this.combatUrls.has(url)&&!photoWanted(chunk)){
        const deadline=(this.lastWanted.get(url)??now)+30000;
        if(deadline>now)this.nextResidencyExpiry=Math.min(this.nextResidencyExpiry,deadline);
      }
      if (
        !this.pinned(url) &&
        !this.combatUrls.has(url) &&
        !photoWanted(chunk) &&
        ((driving?.outdoorOnly && chunk.kind === "interior") ||
          (distance(chunk) >
            (chunk.kind === "interior" ? 30 : low ? 105 : 120) &&
            ahead(chunk) > 40 &&
            now - (this.lastWanted.get(url) ?? now) >= 30000))
      ) {
        this.assets.delete(url);
        this.lastWanted.delete(url);
        this.release(asset);
        this.counters.evictions++;this.counters.distanceEvictions++;
        this.queueDirty=true;
        this.revision++;
      }
    }
    // Idle interiors get bounded grace; the active safety neighbourhood is never evicted.
    const idle = [...this.assets.keys()]
      .filter(
        (url) =>
          this.index.get(url)!.kind === "interior" &&
          !this.wantedUrls.has(url) &&
          !this.neededUrls.has(url) &&
          !this.pinned(url),
      )
      .sort(
        (a, b) => (this.lastWanted.get(a) ?? 0) - (this.lastWanted.get(b) ?? 0),
      );
    const idleSet=new Set(idle),protectedTextures=new Set<string>(),textureRefs=new Map<string,{bytes:number;refs:number}>();
    for(const url of this.assets.keys())if(!idleSet.has(url))for(const texture of this.index.get(url)!.textureResources??[])protectedTextures.add(texture.id);
    for(const url of idle)for(const texture of this.index.get(url)!.textureResources??[]){const entry=textureRefs.get(texture.id);if(entry)entry.refs++;else textureRefs.set(texture.id,{bytes:texture.bytes,refs:1});}
    let idleBytes = idle.reduce(
        (sum, url) => sum + (this.index.get(url)!.decodedGeometryBytes ?? this.index.get(url)!.bytes ?? 0),
        0,
      )+[...textureRefs].reduce((sum,[id,value])=>sum+(protectedTextures.has(id)?0:value.bytes),0),
      idleTriangles = idle.reduce(
        (sum, url) => sum + (this.index.get(url)!.triangles ?? 0),
        0,
      );
    const byteBudget = (low ? 12 : 24) * 1024 * 1024,
      triangleBudget = low ? 450000 : 850000;
    for (const url of idle) {
      if (idleBytes <= byteBudget && idleTriangles <= triangleBudget) break;
      const chunk = this.index.get(url)!,
        asset = this.assets.get(url)!;
      idleBytes -= chunk.decodedGeometryBytes ?? chunk.bytes ?? 0;
      for(const texture of chunk.textureResources??[]){const entry=textureRefs.get(texture.id)!;entry.refs--;if(entry.refs===0&&!protectedTextures.has(texture.id))idleBytes-=entry.bytes;}
      idleTriangles -= chunk.triangles ?? 0;
      this.assets.delete(url);
      this.lastWanted.delete(url);
      this.release(asset);
      this.counters.evictions++;this.counters.budgetEvictions++;
      this.queueDirty=true;
      this.revision++;
    }
    this.residencyAt=now;this.residencyRevision=this.revision;
    }
    this.pump();
    return this.status();
  }
  private pump() {
    if (!this.alive || this.pumping) return;
    this.pumping = true;
    try {
      if (this.queueDirty) {
        const urls = new Set([
          ...this.neededUrls,
          ...this.pinnedUrls,
          ...this.viewUrls,
          ...this.wantedUrls,
        ]);
        this.queue = [...urls]
          .map((url) => this.index.get(url)!)
          .filter(c=>c&&!this.assets.has(c.url))
          .sort(
            (a, b) =>
              this.priority(a.url) - this.priority(b.url) ||
              Math.min(
                this.distanceTo(a.url),
                (this.aheadDistances.get(a.url) ?? Infinity) + 15,
              ) -
                Math.min(
                  this.distanceTo(b.url),
                  (this.aheadDistances.get(b.url) ?? Infinity) + 15,
                ),
          );
        this.queueDirty = false;
      }
      for (const c of this.queue) {
        if (
          this.assets.has(c.url) ||
          this.pending.has(c.url) ||
          this.now() - (this.failures.get(c.url) ?? -Infinity) < 5000
        )
          continue;
        if (this.pending.size >= 2) {
          // An optional slow download must never hold up the ground under the player.
          const candidate = [...this.requests]
            .filter(([url]) => this.priority(url) > this.priority(c.url))
            .sort(
              (a, b) =>
                this.priority(b[0]) - this.priority(a[0]) ||
                b[1].started - a[1].started,
            )[0];
          if (!candidate) continue;
          this.cancelRequest(candidate[0]);
        }
        void this.fetch(c).catch(() => {});
      }
    } finally {
      this.pumping = false;
    }
  }
  status(): StreamStatus {
    if(this.cachedStatus)return this.cachedStatus;
    const needed=this.combatLeases.size?this.combatCore:this.needed;
    let loaded=0,failed=false,viewLoaded=0,viewFailed=false,combatLoaded=0;
    for(const c of needed){if(this.assets.has(c.url))loaded++;if(this.failures.has(c.url))failed=true;}
    for(const c of this.viewNeeded){if(this.assets.has(c.url))viewLoaded++;if(this.failures.has(c.url))viewFailed=true;}
    if(this.combatLeases.size)combatLoaded=loaded;else for(const url of this.combatUrls)if(this.assets.has(url))combatLoaded++;
    const blocked=loaded<needed.length,combatCount=this.combatLeases.size?this.combatCore.length:this.combatUrls.size;
    return this.cachedStatus={
      blocked,
      failed,
      loaded,
      resident: this.assets.size,
      needed: needed.length,
      progress: needed.length ? loaded / needed.length : 1,
      viewReady: viewLoaded === this.viewNeeded.length,
      viewFailed,
      viewProgress: this.viewNeeded.length
        ? viewLoaded / this.viewNeeded.length
        : 1,
      combatReady:combatLoaded===combatCount,
      combatProgress:combatCount?combatLoaded/combatCount:1,
      viewRevision: this.combatRevision,
      revision: this.revision,
      message: failed
        ? "附近校园资源未能载入，游戏已暂时停下。"
        : blocked
          ? "正在载入前方校园，进度已暂停。"
          : "",
    };
  }
  retry() {
    for (const c of this.combatLeases.size?this.combatCore:this.needed) this.failures.delete(c.url);
    this.pump();
  }
  retryView() {
    for (const c of this.viewNeeded) this.failures.delete(c.url);
    this.pump();
  }
  private pinned(url: string) {
    return this.pinnedUrls.has(url);
  }
  /** Preload every selected cinematic view without changing the live view or simulation gate. */
  prepareViews(
    views: PhotoView[],
    signal: AbortSignal,
    onProgress?: (progress: number) => void,
    combat = false,
  ): Promise<() => void> {
    const planes=views.map(viewPlanes);
    const selected = this.chunks.filter(c =>
      (combat ? combatStructure(c) : c.kind !== 'interior') && views.some((view,index)=>
        chunkDistance(c,view.origin)<25 || boundsInPlanes(this.bounds.get(c.url)!,planes[index])));
    return this.prepareSelection(selected,signal,onProgress,false);
  }
  /** A finite session lease, independent of direction or render visibility. */
  prepareCombat(signal:AbortSignal,onProgress?:(progress:number)=>void):Promise<()=>void>{
    return this.prepareSelection(this.combatCore,signal,onProgress,true);
  }
  private prepareSelection(selected:MapChunk[],signal:AbortSignal,onProgress:((p:number)=>void)|undefined,combat:boolean):Promise<()=>void>{
    if (!this.alive || signal.aborted)
      return Promise.reject(new Error("镜头准备已取消。"));
    const key = Symbol(combat ? 'combat-campus' : 'prepared-views'),
      urls = new Set(selected.map((c) => c.url)),
      total = selected.reduce((n, c) => n + (c.bytes ?? 1), 0) || 1;
    this.leases.set(key, urls);
    if(combat){this.combatLeases.add(key);this.geometryDirty=true;this.cachedStatus=null;}
    this.rebuildPins();
    for (const c of selected) {
      this.lastWanted.set(c.url, this.now());
      this.failures.delete(c.url);
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.leases.delete(key);
      if(combat){this.combatLeases.delete(key);this.geometryDirty=true;this.cachedStatus=null;}
      this.rebuildPins();
      for (const url of this.requests.keys())
        if (
          !this.pinned(url) &&
          !this.neededUrls.has(url) &&
          !this.wantedUrls.has(url) &&
          !this.viewUrls.has(url)
        )
          this.cancelRequest(url);
      this.pump();
    };
    return new Promise<() => void>((resolve, reject) => {
      let settled = false,
        lastProgress = -1;
      const cleanup = () => {
        this.listeners.delete(check);
        signal.removeEventListener("abort", abort);
      };
      const abort = () => {
        if (settled) {
          release();
          return;
        }
        settled = true;
        cleanup();
        release();
        reject(new Error("镜头准备已取消。"));
      };
      const check = () => {
        if (settled) return;
        if (signal.aborted || !this.alive) {
          abort();
          return;
        }
        const progress = selected.length
          ? selected.reduce(
              (n, c) => n + (this.assets.has(c.url) ? (c.bytes ?? 1) : 0),
              0,
            ) / total
          : 1;
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress?.(progress);
        }
        if (selected.some((c) => this.failures.has(c.url))) {
          settled = true;
          cleanup();
          release();
          reject(new Error("开场镜头资源未能载入，请重试。"));
          return;
        }
        if (selected.every((c) => this.assets.has(c.url))) {
          settled = true;
          this.listeners.delete(check);
          resolve(() => {
            signal.removeEventListener("abort", abort);
            release();
          });
        }
      };
      this.listeners.add(check);
      signal.addEventListener("abort", abort, { once: true });
      this.pump();
      check();
    });
  }
  /** Physics calls this before advancing. It does not sort, evict, schedule or render. */
  checkSafety(point:Vec3,_low:boolean,floors:{id:number;elevation:number}[]=[],driving?:StreamDriving):StreamStatus{
    if(this.combatLeases.size)return this.status();
    const required=this.chunks.filter(c=>{
      if(c.residency==='detail')return false;
      if(this.combatUrls.has(c.url))return true;
      if(c.kind!=='interior')return chunkDistance(c,point)<(driving?.isDriving?25:20);
      const floor=floors.find(f=>f.id===c.floor);
      return !driving?.outdoorOnly && chunkDistance(c,point)<7 && (!floor||Math.abs(point[1]-floor.elevation)<2.25);
    });
    if(required.every(c=>this.assets.has(c.url)))return this.status();
    // Record missing safety requirements for the next once-per-frame scheduler.
    this.needed=required;this.neededUrls=new Set(required.map(c=>c.url));this.geometryDirty=this.queueDirty=true;
    this.cachedStatus=null;
    return this.status();
  }
  diagnostics(){
    let geometryBytes=0,downloadBytes=0,triangles=0,structures=0;
    const textures=new Map<string,number>();
    for(const url of this.assets.keys()){
      const c=this.index.get(url)!;downloadBytes+=c.bytes??0;geometryBytes+=c.decodedGeometryBytes??0;triangles+=c.triangles??0;
      if(combatStructure(c))structures++;for(const t of c.textureResources??[])textures.set(t.id,t.bytes);
    }
    return {...this.counters,resident:this.assets.size,structureResident:structures,structureTotal:this.combatCore.length,combatLeases:this.combatLeases.size,pending:this.pending.size,downloadBytes,decodedGeometryBytes:geometryBytes,uniqueTextureBytes:[...textures.values()].reduce((a,b)=>a+b,0),manifestTriangles:triangles};
  }
  forEach(fn: (asset: T, chunk: MapChunk, distance: number) => void) {
    for (const [url, asset] of this.assets)
      fn(asset, this.index.get(url)!, this.distanceTo(url));
  }
  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.leases.clear();
    this.combatLeases.clear();
    this.cachedStatus=null;
    this.pinnedUrls.clear();
    for (const url of this.requests.keys()) this.cancelRequest(url);
    for (const notify of [...this.listeners]) notify();
    this.listeners.clear();
    for (const asset of this.assets.values()) this.release(asset);
    this.assets.clear();
    this.lastWanted.clear();
  }
}
