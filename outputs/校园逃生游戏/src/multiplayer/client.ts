import { Client, type Room, type SeatReservation } from "@colyseus/sdk";
import { rankingClient, RankingError } from "../ranking/client";
import { gameMapSession } from "../game-map";
import { gameOperations } from '../game-operations';
import { entryFor, ModeUnavailableError } from '../game-config-store';
import { OnlineClock } from "./netcode";
import { WireDecoder, type RoomWireMessage } from "./shared/wire";
import {
  PROTOCOL_VERSION,
  sameMap,
  type MapIdentity,
  type LobbyView,
  type RoomOptions,
  type RoomSnapshot,
  type ClientMessageMap,
  type GameEvent,
  type InputCommand,
  type RoomListing,
} from "./shared/protocol";

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
export const REALTIME_API = (env?.VITE_REALTIME_API || "/realtime").replace(
  /\/$/,
  "",
);
const RESUME_KEY = "qisheng-online-room-v1";
type ResumeSession = {
  token: string;
  playerId: string;
  roomId?: string;
  at?: number;
};
type AdmissionHandle = {
  queueId: string;
  queueToken: string;
  cancelled?: boolean;
  cancelWork?: Promise<void>;
};
type AdmissionResult = {
  queueId: string;
  queueToken: string;
  status: string;
  position: number;
  error?: { code: string; message: string };
  reservation?: SeatReservation;
  retryAfterMs?: number;
};
const RESYNC_RETRY_MS = 500;
const JOIN_TIMEOUT_MS = 12000;
const terminalResumeError = (error: unknown) =>
  [522, 524].includes(Number((error as { code?: unknown })?.code));
export async function localMapIdentity(
  signal?: AbortSignal,
): Promise<MapIdentity> {
  const { index, manifestBytes } = await gameMapSession.initialize(signal),
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  const collision = index.resources[manifest.collisionUrl],
    navigation = index.resources[manifest.navmeshUrl],
    vision = manifest.visionUrl ? index.resources[manifest.visionUrl] : undefined;
  if (!collision || !navigation || (manifest.visionUrl && !vision))
    throw new RankingError(
      "校园资料不完整，请刷新后再加入。",
      "MAP_VERSION",
      false,
    );
  return {
    sourceVersion: manifest.sourceVersion || manifest.source,
    manifestHash: index.manifest.sha256,
    collisionHash: collision.sha256,
    navigationHash: navigation.sha256,
    ...(vision ? { visionHash: vision.sha256 } : {}),
  };
}
export class OnlineClient {
  readonly clock = new OnlineClock();
  private decoder = new WireDecoder();
  private lastResumeWrite = 0;
  private savedResumeToken = "";
  private uiAt = 0;
  private snapshotAt = 0;
  private receivedBytes = 0;
  private snapshotInterval = 50;
  private inputSent = new Map<number, number>();
  private inputAckAgeMs = 0;
  private inputAcknowledged = 0;
  private sendBacklogAt = 0;
  private socketOff: (() => void) | null = null;
  view: LobbyView = { status: "idle", rooms: [], currentRoom: null };
  room: Room | null = null;
  playerId: string | null = null;
  map: MapIdentity | null = null;
  private listeners = new Set<() => void>();
  private snapshots = new Set<(s: RoomSnapshot) => void>();
  private events = new Set<(e: GameEvent) => void>();
  private loadingRetries = new Set<(e: { epoch: number; retryAfterMs: number }) => void>();
  private operation = 0;
  private abort = new AbortController();
  private queue: AdmissionHandle | null = null;
  private disposed = false;
  private lastSerial = 0;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectStarted: number | null = null;
  private resumeWork: Promise<boolean> | null = null;
  private sdk = new Client(REALTIME_API);
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private resyncPending = false;
  private resyncLastAt = -Infinity;
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  onSnapshot(fn: (s: RoomSnapshot) => void) {
    this.snapshots.add(fn);
    return () => {
      this.snapshots.delete(fn);
    };
  }
  onEvent(fn: (e: GameEvent) => void) {
    this.events.add(fn);
    return () => {
      this.events.delete(fn);
    };
  }
  onLoadingRetry(fn: (e: { epoch: number; retryAfterMs: number }) => void) {
    this.loadingRetries.add(fn);
    return () => { this.loadingRetries.delete(fn); };
  }
  private emit() {
    if (!this.disposed) for (const fn of this.listeners) fn();
  }
  private set(p: Partial<LobbyView>) {
    this.view = { ...this.view, ...p };
    this.emit();
  }
  private async request<T>(
    path: string,
    init: RequestInit = {},
    signal = this.abort.signal,
  ): Promise<T> {
    const controller = new AbortController(),
      abort = () => controller.abort(),
      timer = setTimeout(abort, 12000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    try {
      const r = await fetch(REALTIME_API + path, {
        ...init,
        signal: controller.signal,
        credentials: "omit",
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
      const value = await r.json().catch(() => null);
      if (!r.ok)
        throw new RankingError(
          value?.error?.message ||
            value?.message ||
            "联机服务暂时无法连接，请重试。",
          value?.error?.code || "ONLINE",
          r.status >= 500,
        );
      return value;
    } catch (e) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (e instanceof RankingError) throw e;
      throw new RankingError("联机服务暂时无法连接，请重试。", "NETWORK", true);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  async refresh() {
    const serial = this.operation;
    try {
      const { rooms } = await this.request<{ rooms: LobbyView["rooms"] }>(
        "/v1/rooms",
      );
      if (serial === this.operation)
        this.set({
          rooms,
          status: this.room ? this.view.status : "lobby",
          error: undefined,
          errorCode: undefined,
        });
    } catch (e) {
      if (serial === this.operation && !this.disposed)
        this.set({
          error: (e as Error).message,
          status: this.room ? this.view.status : "error",
        });
    }
  }
  private current(serial: number) {
    return serial === this.operation && !this.disposed;
  }
  private cancelAdmission(handle: AdmissionHandle): Promise<void> {
    if (this.queue === handle) this.queue = null;
    if (handle.cancelWork) return handle.cancelWork;
    handle.cancelled = true;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 5000);
    handle.cancelWork = fetch(
      REALTIME_API + "/v1/queue/" + encodeURIComponent(handle.queueId),
      {
        method: "DELETE",
        signal: controller.signal,
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + handle.queueToken,
        },
      },
    )
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => clearTimeout(timer));
    return handle.cancelWork;
  }
  private async retireRoom(room: Room) {
    room.reconnection.enabled = false;
    if (room.connection && !room.connection.isOpen) {
      room.connection.close();
      return;
    }
    try {
      room.send("leave", {});
    } catch {}
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        room.leave().catch(() => {}),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            room.connection?.close();
            resolve();
          }, 1000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  private consumeAdmission(
    reservation: SeatReservation,
    signal: AbortSignal,
  ): Promise<Room> {
    return this.waitForRoom(
      () => this.sdk.consumeSeatReservation(reservation),
      signal,
      new RankingError("房间连接超时，请重新加入。", "JOIN_TIMEOUT", true),
    );
  }
  private waitForRoom(
    start: () => Promise<Room>,
    signal: AbortSignal,
    timeoutError: RankingError,
  ): Promise<Room> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return false;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        action();
        return true;
      };
      const cancel = () =>
        finish(() => reject(new DOMException("Cancelled", "AbortError")));
      const timer = setTimeout(
        () => finish(() => reject(timeoutError)),
        JOIN_TIMEOUT_MS,
      );
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) {
        cancel();
        return;
      }
      // The SDK exposes its Room only after joining. Retire a success that arrives
      // after cancellation/timeout rather than reviving the abandoned operation.
      try {
        start().then(
          (room) => {
            if (!finish(() => resolve(room))) void this.retireRoom(room);
          },
          (error) => finish(() => reject(error)),
        );
      } catch (error) {
        finish(() => reject(error));
      }
    });
  }
  private waitForQueueRetry(
    value: unknown,
    signal: AbortSignal,
  ): Promise<void> {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      return Promise.resolve();
    const duration = Math.max(150, Math.min(2000, value));
    return new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancel);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", cancel);
        resolve();
      }, duration);
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
    });
  }
  async join(options?: RoomOptions, roomId?: string, inviteCode?: string) {
    if (this.disposed) return;
    const saved = this.readResume();
    if (
      !this.room &&
      saved &&
      roomId === (saved.roomId || saved.token.split(":")[0])
    ) {
      const recovery = this.reconnect(),
        recoveryOperation = this.operation;
      if (
        (await recovery) ||
        recoveryOperation !== this.operation ||
        this.hasResumeSession() ||
        this.view.errorCode !== "RECONNECT_EXPIRED"
      )
        return;
    }
    const serial = ++this.operation;
    await this.releaseCurrent(serial);
    if (!this.current(serial)) return;
    const controller = new AbortController();
    this.abort = controller;
    const signal = controller.signal;
    let admission: AdmissionHandle | null = null,
      unboundRoom: Room | null = null;
    this.set({
      status: "connecting",
      error: undefined,
      errorCode: undefined,
      currentRoom: null,
      queuePosition: undefined,
    });
    try {
      if (roomId || inviteCode) {
        const info = await this.request<RoomListing>("/v1/rooms/resolve", {method:'POST',body:JSON.stringify({roomId,inviteCode})}, signal);
        if (!this.current(serial) || signal.aborted) return;
        roomId=info.roomId;
        options={mode:info.mode,variant:info.variant,difficulty:info.difficulty};
      }
      await gameOperations.check(entryFor('escape',options?.mode==='pvp'?'pvp':'coop',options?.variant==='ffa'?'ffa':'tdm'));
      if (!this.current(serial) || signal.aborted) return;
      const [profile, local, remote] = await Promise.all([
        rankingClient.me(),
        localMapIdentity(signal),
        this.request<MapIdentity>("/map-identity", {}, signal),
      ]);
      if (!this.current(serial) || signal.aborted) return;
      const playerId = profile?.id;
      if (!playerId)
        throw new RankingError(
          "先设置昵称，再加入联机对局。",
          "AUTH_REQUIRED",
          false,
        );
      if (!sameMap(local, remote))
        throw new RankingError(
          "校园版本已更新，请刷新后再加入。",
          "MAP_VERSION",
          false,
        );
      this.playerId = playerId;
      this.map = local;
      const { ticket } = await rankingClient.request<{ ticket: string }>(
        "/multiplayer/tickets",
        {
          method: "POST",
          body: { mode: options?.mode || "coop", variant: options?.variant, roomId, inviteCode },
          signal,
        },
      );
      if (!this.current(serial) || signal.aborted) return;
      // Creation has a server-side effect. Let its bounded response arrive so a cancelled
      // operation can revoke its own handle instead of orphaning the queue.
      let admitted = await this.request<AdmissionResult>(
        "/v1/queue",
        {
          method: "POST",
          body: JSON.stringify({
            ticket,
            protocolVersion: PROTOCOL_VERSION,
            map: local,
            options,
            roomId,
            inviteCode,
            create: !!options && !roomId && !inviteCode,
          }),
        },
        new AbortController().signal,
      );
      admission = {
        queueId: admitted.queueId,
        queueToken: admitted.queueToken,
      };
      if (!this.current(serial) || signal.aborted) {
        void this.cancelAdmission(admission);
        return;
      }
      this.queue = admission;
      while (admitted.status === "waiting") {
        this.set({ status: "queued", queuePosition: admitted.position });
        await this.waitForQueueRetry(admitted.retryAfterMs, signal);
        if (!this.current(serial) || signal.aborted) {
          void this.cancelAdmission(admission);
          return;
        }
        admitted = await this.request<AdmissionResult>(
          "/v1/queue/" + encodeURIComponent(admission.queueId) + "?wait=8000",
          {
            headers: { Authorization: "Bearer " + admission.queueToken },
          },
          signal,
        );
        if (!this.current(serial) || signal.aborted) {
          void this.cancelAdmission(admission);
          return;
        }
      }
      if (admitted.error)
        throw new RankingError(admitted.error.message, admitted.error.code);
      if (admitted.status !== "ready" || !admitted.reservation)
        throw new RankingError(
          "没有取得房间席位，请重新加入。",
          "QUEUE_ENDED",
          true,
        );
      // Keep the cancellation handle until the SDK handshake has actually transferred ownership.
      unboundRoom = await this.consumeAdmission(admitted.reservation, signal);
      if (!this.current(serial) || signal.aborted) {
        void this.cancelAdmission(admission);
        await this.retireRoom(unboundRoom);
        unboundRoom = null;
        return;
      }
      if (rankingClient.getPlayer()?.id !== playerId)
        throw new RankingError(
          "登录身份已改变，请重新加入。",
          "IDENTITY_CHANGED",
          false,
        );
      this.bind(unboundRoom);
      unboundRoom = null;
      if (this.queue === admission) this.queue = null;
      admission = null;
    } catch (e) {
      if (admission) void this.cancelAdmission(admission);
      if (unboundRoom) await this.retireRoom(unboundRoom);
      if (this.current(serial) && !signal.aborted)
        this.set({
          status: "error",
          error: (e as Error).message,
          errorCode: e instanceof RankingError || e instanceof ModeUnavailableError ? e.code : undefined,
          queuePosition: undefined,
        });
    }
  }
  private clearResync() {
    if (this.resyncTimer) clearTimeout(this.resyncTimer);
    this.resyncTimer = null;
    this.resyncPending = false;
    this.resyncLastAt = -Infinity;
  }
  private requestResync(room: Room) {
    if (this.room !== room || this.disposed) return;
    this.resyncPending = true;
    const now = performance.now(),
      remaining = RESYNC_RETRY_MS - (now - this.resyncLastAt),
      open = !room.connection || room.connection.isOpen;
    if (remaining <= 0 && open) {
      this.resyncLastAt = now;
      room.send("resync", { afterSeq: this.decoder.sequence });
    }
    if (!this.resyncTimer)
      this.resyncTimer = setTimeout(
        () => {
          this.resyncTimer = null;
          if (this.resyncPending && this.room === room)
            this.requestResync(room);
        },
        open && Number.isFinite(this.resyncLastAt)
          ? Math.max(
              1,
              RESYNC_RETRY_MS - (performance.now() - this.resyncLastAt),
            )
          : RESYNC_RETRY_MS,
      );
  }
  private bindSocket(room: Room) {
    this.socketOff?.();
    this.socketOff = null;
    const socket = (room.connection?.transport as unknown as { ws?: WebSocket })
      ?.ws;
    if (socket?.addEventListener) {
      const count = (event: MessageEvent) => {
        const data = event.data;
        this.receivedBytes +=
          typeof data === "string"
            ? new TextEncoder().encode(data).byteLength
            : (data?.byteLength ?? data?.size ?? 0);
      };
      socket.addEventListener("message", count);
      this.socketOff = () => socket.removeEventListener("message", count);
    }
  }
  private bind(room: Room) {
    this.receivedBytes = 0;
    this.bindSocket(room);
    this.room = room;
    room.reconnection = {
      ...room.reconnection,
      maxRetries: 60,
      minDelay: 500,
      maxDelay: 2000,
    };
    this.lastSerial = 0;
    this.decoder.reset();
    this.clearResync();
    this.uiAt = 0;
    this.snapshotAt = 0;
    this.saveResume(room, true);
    this.set({
      status: "lobby",
      error: undefined,
      errorCode: undefined,
      reconnectLeft: undefined,
    });
    room.onMessage("snapshot", (message: RoomWireMessage | RoomSnapshot) => {
      if (this.room !== room || this.disposed) return;
      const now = performance.now();
      const legacy =
          !env?.PROD &&
          !("wireVersion" in message) &&
          "players" in message &&
          Array.isArray(message.players),
        decoded = legacy
          ? { snapshot: message as RoomSnapshot, needsResync: false }
          : this.decoder.accept(message as RoomWireMessage);
      if (decoded.needsResync) {
        this.requestResync(room);
        return;
      }
      const snapshot = decoded.snapshot;
      if (!snapshot) return;
      const own=snapshot.players.find(p=>p.id===this.playerId),confirmed=own?.inputReceipt?Math.max(own.inputReceipt.appliedSeq,own.inputReceipt.cancelledThrough):own?.ack??0;
      if(confirmed>this.inputAcknowledged){const sent=this.inputSent.get(confirmed);if(sent!==undefined)this.inputAckAgeMs=now-sent;this.inputAcknowledged=confirmed;for(const seq of this.inputSent.keys())if(seq<=confirmed)this.inputSent.delete(seq);}
      if (legacy || ("kind" in message && message.kind === "full"))
        this.clearResync();
      if (this.snapshotAt)
        this.snapshotInterval +=
          (Math.min(1000, now - this.snapshotAt) - this.snapshotInterval) *
          0.15;
      this.snapshotAt = now;
      this.clock.observe(snapshot.tick, now, this.clock.rttMs);
      this.saveResume(room);
      const changedPhase = this.view.currentRoom?.phase !== snapshot.phase;
      this.view = {
        ...this.view,
        currentRoom: snapshot,
        status:
          snapshot.phase === "playing" || snapshot.phase === "paused"
            ? "playing"
            : "lobby",
        ...(changedPhase ? { error: undefined, errorCode: undefined } : {}),
      };
      for (const s of this.snapshots) s(snapshot);
      for (const e of snapshot.events)
        if (e.serial > this.lastSerial) {
          this.lastSerial = e.serial;
          for (const listener of this.events) listener(e);
        }
      // Gameplay consumes every packet; reading UI does not rerender on every 20 Hz state change.
      if (
        changedPhase ||
        snapshot.phase !== "playing" ||
        now - this.uiAt >= 150
      ) {
        this.uiAt = now;
        this.emit();
      }
    });
    room.onMessage("event", (e: GameEvent) => {
      if (this.room === room && e.serial > this.lastSerial) {
        this.lastSerial = e.serial;
        for (const listener of this.events) listener(e);
      }
    });
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.room === room && this.view.status !== "reconnecting")
        room.send("latency", { id: Date.now(), sentAt: performance.now() });
    }, 2000);
    room.onMessage("latency", (e: { nonce: string; sentAt?: number }) => {
      if (this.room === room) {
        if (typeof e.sentAt === "number")
          this.clock.setRtt(performance.now() - e.sentAt);
        room.send("latency-ack", { nonce: e.nonce });
      }
    });
    room.send("latency", { id: Date.now(), sentAt: performance.now() });
    room.onMessage("loading-retry", (e: { epoch: number; retryAfterMs: number }) => {
      if (this.room !== room || this.disposed || !Number.isSafeInteger(e?.epoch) ||
          !Number.isFinite(e?.retryAfterMs) || e.retryAfterMs < 0) return;
      for (const listener of this.loadingRetries) listener(e);
    });
    room.onMessage("error", (e: { code: string; message: string }) => {
      if (this.room === room) this.set({ error: e.message, errorCode: e.code });
    });
    room.onDrop(() => {
      if (this.room !== room || this.disposed || this.reconnectStarted !== null)
        return;
      this.reconnectStarted = Date.now();
      this.clearResync();
      this.saveResume(room, true);
      this.set({
        status: "reconnecting",
        reconnectLeft: 60,
        error: undefined,
        errorCode: undefined,
      });
      this.reconnectTimer = setInterval(() => {
        if (this.room !== room) {
          this.clearReconnectTimer();
          return;
        }
        const left = Math.max(
          0,
          60 - (Date.now() - this.reconnectStarted!) / 1000,
        );
        if (!left) {
          this.clearReconnectTimer(false);
          this.set({
            reconnectLeft: 0,
            error: "正在确认原房间是否仍可重连。",
            errorCode: "RECONNECT_CONFIRMING",
          });
          return;
        }
        this.set({ reconnectLeft: left });
      }, 500);
    });
    room.onReconnect(() => {
      if (this.room !== room) {
        room.reconnection.enabled = false;
        if (room.connection?.isOpen) void room.leave().catch(() => {});
        return;
      }
      this.clearReconnectTimer();
      this.bindSocket(room);
      this.decoder.reset();
      this.clearResync();
      this.lastSerial = 0;
      this.saveResume(room, true);
      this.requestResync(room);
      this.set({
        status:
          this.view.currentRoom?.phase === "playing" ? "playing" : "lobby",
        reconnectLeft: undefined,
        error: undefined,
        errorCode: undefined,
      });
    });
    room.onError((code: number, message?: string) => {
      if (this.room !== room) return;
      if (terminalResumeError({ code }))
        this.endConnection(
          room,
          "原房间的重连席位已结束，可以加入新一局。",
          true,
        );
      else this.set({ error: message || "连接暂时中断，请尝试重连。" });
    });
    room.onLeave((code: number) =>
      this.endConnection(
        room,
        code === 4000
          ? "你已离开这个房间。可以返回大厅加入其他对局。"
          : "暂时未能回到原房间，请重试重连。",
        code === 4000,
      ),
    );
  }
  private endConnection(room: Room, message: string, clearResume = true) {
    if (this.room !== room) return;
    this.socketOff?.();
    this.socketOff = null;
    this.room = null;
    this.decoder.reset();
    this.clearResync();
    room.reconnection.enabled = false;
    this.clearReconnectTimer();
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (clearResume) this.removeResume();
    this.set({
      currentRoom: null,
      status: "error",
      error: message,
      errorCode: clearResume ? "CONNECTION_ENDED" : "RECONNECT_RETRY",
      reconnectLeft: undefined,
    });
  }
  private saveResume(room: Room, force = false) {
    const now = Date.now(),
      token = room.reconnectionToken;
    if (
      !force &&
      token === this.savedResumeToken &&
      now - this.lastResumeWrite < 10000
    )
      return;
    this.lastResumeWrite = now;
    this.savedResumeToken = token;
    try {
      sessionStorage.setItem(
        RESUME_KEY,
        JSON.stringify({
          token,
          playerId: this.playerId,
          roomId: room.roomId,
          at: now,
        }),
      );
    } catch {}
  }
  getConnectionDiagnostics() {
    const stats = this.networkStats(),receipt=this.view.currentRoom?.players.find(p=>p.id===this.playerId)?.inputReceipt;
    return {
      rttMs: stats.rtt,
      jitterMs: stats.jitter,
      snapshotIntervalMs: this.snapshotInterval,
      receivedBytes: this.receivedBytes,
      bufferMs: stats.interpolation,
      snapshotAgeMs: stats.snapshotAge,
      bufferedBytes: stats.bufferedBytes,
      inputAckAgeMs: this.inputAckAgeMs,
      backlogAgeMs: stats.backlogAge,
      inputAgeTicks: receipt?.inputAgeTicks??0,
      inputReason: receipt?.reason??'none',
      lastInputReason: receipt?.lastReason??'none',
      lastInputReasonTick: receipt?.lastReasonTick??0,
    };
  }
  networkStats() {
    const connection = this.room?.connection as unknown as
      | { transport?: { ws?: { bufferedAmount?: number } } }
      | undefined;
    const now=performance.now(),bufferedBytes=connection?.transport?.ws?.bufferedAmount??0;
    if(bufferedBytes>0){if(!this.sendBacklogAt)this.sendBacklogAt=now;}else this.sendBacklogAt=0;
    return {
      rtt: this.clock.rttMs,
      jitter: this.clock.jitterMs,
      interpolation: this.clock.interpolationMs,
      snapshotAge: this.snapshotAt ? performance.now() - this.snapshotAt : 0,
      bufferedBytes,
      backlogAge: this.sendBacklogAt?Math.max(0,now-this.sendBacklogAt):0,
    };
  }
  private removeResume() {
    this.savedResumeToken = "";
    this.lastResumeWrite = 0;
    try {
      sessionStorage.removeItem(RESUME_KEY);
    } catch {}
  }
  private readResume(): ResumeSession | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(RESUME_KEY) || "null");
      if (!value) return null;
      if (
        typeof value.token !== "string" ||
        !value.token ||
        typeof value.playerId !== "string" ||
        !value.playerId
      ) {
        this.removeResume();
        return null;
      }
      return value;
    } catch {
      this.removeResume();
      return null;
    }
  }
  hasResumeSession() {
    return !!this.readResume();
  }
  reconnect(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.room) return Promise.resolve(this.view.status !== "reconnecting");
    if (this.resumeWork) return this.resumeWork;
    const saved = this.readResume();
    if (!saved) return Promise.resolve(false);
    const serial = ++this.operation;
    this.abort.abort();
    const controller = new AbortController();
    this.abort = controller;
    const signal = controller.signal;
    this.set({
      status: "reconnecting",
      error: undefined,
      errorCode: undefined,
    });
    // Only the server knows when the reserved seat expires. The last throttled storage write is not the drop time.
    const work = (async () => {
      try {
        const [player, map] = await Promise.all([
          rankingClient.me(),
          localMapIdentity(signal),
        ]);
        if (!this.current(serial) || signal.aborted) return false;
        if (player?.id !== saved.playerId) {
          this.removeResume();
          this.set({
            currentRoom: null,
            status: "error",
            error: "登录身份已改变，请重新加入。",
            errorCode: "IDENTITY_CHANGED",
          });
          return false;
        }
        this.playerId = player!.id;
        this.map = map;
        const room = await this.waitForRoom(
          () => this.sdk.reconnect(saved.token),
          signal,
          new RankingError(
            "连接暂时未能恢复，请重试重连。",
            "RECONNECT_RETRY",
            true,
          ),
        );
        if (!this.current(serial) || signal.aborted) {
          await this.retireRoom(room);
          return false;
        }
        this.bind(room);
        return true;
      } catch (e) {
        if (this.current(serial) && !signal.aborted) {
          const expired = terminalResumeError(e);
          if (expired) this.removeResume();
          this.set({
            currentRoom: null,
            status: "error",
            error: expired
              ? "原房间的重连席位已结束，可以加入新一局。"
              : "暂时未能回到原房间，请重试重连。",
            errorCode: expired ? "RECONNECT_EXPIRED" : "RECONNECT_RETRY",
          });
        }
        return false;
      }
    })();
    this.resumeWork = work;
    void work.finally(() => {
      if (this.resumeWork === work) this.resumeWork = null;
    });
    return work;
  }
  send<K extends keyof ClientMessageMap>(type: K, data: ClientMessageMap[K]) {
    if (
      this.room &&
      (this.view.status === "playing" || this.view.status === "lobby")
    ) {
      if (
        ["start", "ready", "loadout", "consent", "pause", "resume"].includes(
          type,
        )
      )
        this.set({ error: undefined, errorCode: undefined });
      this.room.send(type, data);
    }
  }
  sendInputs(commands: InputCommand[]) {
    if (this.room && this.view.status === "playing") {
      const now=performance.now();for(const command of commands)this.inputSent.set(command.seq,now);while(this.inputSent.size>120)this.inputSent.delete(this.inputSent.keys().next().value!);
      this.room.send("input", { commands });
    }
  }
  private clearReconnectTimer(reset = true) {
    if (this.reconnectTimer) clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
    if (reset) this.reconnectStarted = null;
  }
  private async releaseCurrent(serial: number) {
    this.inputSent.clear();this.inputAcknowledged=0;this.inputAckAgeMs=0;
    this.socketOff?.();
    this.socketOff = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.resumeWork = null;
    this.abort.abort();
    this.abort = new AbortController();
    this.clearReconnectTimer();
    this.clearResync();
    const admission = this.queue;
    this.queue = null;
    if (admission) void this.cancelAdmission(admission);
    const room = this.room;
    this.room = null;
    this.decoder.reset();
    this.removeResume();
    if (room) await this.retireRoom(room);
    if (this.current(serial))
      this.set({
        currentRoom: null,
        status: "lobby",
        error: undefined,
        errorCode: undefined,
        reconnectLeft: undefined,
        queuePosition: undefined,
      });
  }
  async leave() {
    const serial = ++this.operation;
    await this.releaseCurrent(serial);
  }
  dispose() {
    void this.leave();
    this.disposed = true;
    this.listeners.clear();
    this.snapshots.clear();
    this.events.clear();
    this.loadingRetries.clear();
  }
}
