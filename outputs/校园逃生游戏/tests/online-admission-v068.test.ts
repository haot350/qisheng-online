import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import { defaultGameConfig } from "@qisheng/shared/operations";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/")) {
      const url = new URL(specifier, context.parentURL);
      if (
        !/\.[a-z]+$/i.test(url.pathname) &&
        existsSync(fileURLToPath(url) + ".ts")
      )
        return next(specifier + ".ts", context);
    }
    return next(specifier, context);
  },
});
const { OnlineClient } = await import("../src/multiplayer/client.ts");
function reconnectSdk(t:TestContext,client:any){const sdk=client.createReconnectClient();t.mock.method(client,'createReconnectClient',()=>sdk);return sdk;}
const { rankingClient } = await import("../src/ranking/client.ts");
const { gameMapSession } = await import("../src/game-map.ts");

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function until(check: () => boolean) {
  for (let i = 0; i < 30 && !check(); i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.ok(check(), "expected lifecycle stage was not reached");
}
function fakeRoom(id = "room", autoSnapshot = true) {
  const callbacks = new Map<string, Function>(),
    sent: { type: string; data: unknown }[] = [];
  let left = 0;
  const connection = {
    isOpen: true,
    close() {
      connection.isOpen = false;
    },
  };
  return {
    roomId: id,
    reconnectionToken: id + ":test-token",
    reconnection: { enabled: true },
    connection,
    onMessage: (name: string, fn: Function) => {callbacks.set(name, fn);if(name === "snapshot" && autoSnapshot)queueMicrotask(()=>fn({roomId:id,phase:"lobby",tick:0,players:[{id:"p0"}],events:[]}));},
    onDrop: (fn: Function) => callbacks.set("drop", fn),
    onReconnect: (fn: Function) => callbacks.set("reconnect", fn),
    onError: (fn: Function) => callbacks.set("error", fn),
    onLeave: (fn: Function) => callbacks.set("leave", fn),
    send: (type: string, data: unknown) => sent.push({ type, data }),
    leave: async () => {
      left++;
      connection.close();
      return 0;
    },
    callbacks,
    sent,
    get left() {
      return left;
    },
  };
}
const identity = {
  sourceVersion: "fixture",
  manifestHash: "m",
  collisionHash: "c",
  navigationHash: "n",
};
const admission = (id = "q1", status = "ready") => ({
  queueId: id,
  queueToken: id + "-token",
  status,
  position: 1,
  ...(status === "ready"
    ? { reservation: { room: { roomId: "room" }, sessionId: "test" } }
    : {}),
});
function setup(
  t: TestContext,
  reply?: (url: string, init: RequestInit) => Promise<Response> | Response,
) {
  const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "sessionStorage",
    ),
    data = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
      removeItem: (k: string) => data.delete(k),
    },
  });
  t.after(() => {
    if (descriptor)
      Object.defineProperty(globalThis, "sessionStorage", descriptor);
    else delete (globalThis as any).sessionStorage;
  });
  const manifestBytes = new TextEncoder().encode(
    JSON.stringify({
      sourceVersion: "fixture",
      collisionUrl: "/collision.glb",
      navmeshUrl: "/nav.bin",
    }),
  ).buffer;
  t.mock.method(
    gameMapSession,
    "initialize",
    async () =>
      ({
        manifestBytes,
        index: {
          manifest: { sha256: "m" },
          resources: {
            "/collision.glb": { sha256: "c" },
            "/nav.bin": { sha256: "n" },
          },
        },
      }) as any,
  );
  t.mock.method(rankingClient, "me", async () => ({ id: "p0" }) as any);
  t.mock.method(rankingClient, "getPlayer", () => ({ id: "p0" }) as any);
  t.mock.method(
    rankingClient,
    "request",
    async () => ({ ticket: "test-ticket" }) as any,
  );
  const requests: { url: string; init: RequestInit }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (raw: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(raw);
      // Operational policy is independent of queue admission and must not consume its counters or deferred responses.
      if (url.endsWith("/v1/game-config"))
        return Response.json(defaultGameConfig());
      requests.push({ url, init });
      if (url.endsWith("/map-identity")) return Response.json(identity);
      if (url.endsWith("/v1/admission/reconcile")) return Response.json({cleared:true});
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      return reply ? reply(url, init) : Response.json(admission());
    },
  );
  const client = new OnlineClient();
  t.after(() => client.dispose());
  return { client, requests, data };
}

test("ready queue ownership is retained until the actual SDK handshake binds", async (t) => {
  const { client, requests } = setup(t),
    room = fakeRoom(),
    seat = deferred<any>();
  let consumed = false;
  t.mock.method((client as any).sdk, "consumeSeatReservation", () => {
    consumed = true;
    return seat.promise;
  });
  const joining = client.join({ mode: "pvp" });
  await until(() => consumed);
  assert.equal((client as any).queue.queueId, "q1");
  assert.equal(client.room, null);
  seat.resolve(room);
  await joining;
  assert.equal(client.room, room);
  assert.equal((client as any).queue, null);
  assert.equal(requests.filter((r) => r.init.method === "DELETE").length, 0);
});

test("leaving during a ready handshake revokes only its handle and closes a late room once", async (t) => {
  const { client, requests } = setup(t),
    room = fakeRoom(),
    seat = deferred<any>();
  let consumed = false;
  t.mock.method((client as any).sdk, "consumeSeatReservation", () => {
    consumed = true;
    return seat.promise;
  });
  const joining = client.join({ mode: "pvp" });
  await until(() => consumed);
  await client.leave();
  const cancelled = requests.filter((r) => r.init.method === "DELETE");
  assert.equal(cancelled.length, 1);
  assert.equal(cancelled[0].url, "/realtime/v1/queue/q1");
  assert.equal(
    (cancelled[0].init.headers as Record<string, string>).Authorization,
    "Bearer q1-token",
  );
  await joining;
  assert.equal(client.room, null);
  assert.equal(client.view.status, "lobby");
  seat.resolve(room);
  await until(() => room.left === 1);
  assert.equal(room.reconnection.enabled, false);
  assert.equal(requests.filter((r) => r.init.method === "DELETE").length, 1);
});

test("a late queue creation response is cancelled without taking a newer join handle", async (t) => {
  const firstPost = deferred<Response>();
  let posts = 0;
  const { client, requests } = setup(t, (_url, init) =>
    init.method === "POST" && ++posts === 1
      ? firstPost.promise
      : Response.json(admission("q2")),
  );
  const seat = deferred<any>();
  let consumed = false;
  t.mock.method((client as any).sdk, "consumeSeatReservation", () => {
    consumed = true;
    return seat.promise;
  });
  const first = client.join({ mode: "pvp" });
  await until(() => posts === 1);
  const oldSignal = requests.find((r) => r.url.endsWith("/queue"))!.init
    .signal!;
  await client.leave();
  assert.equal(
    oldSignal.aborted,
    false,
    "the bounded queue creation response must remain available for cleanup",
  );
  const second = client.join({ mode: "pvp" });
  await until(() => consumed);
  assert.equal((client as any).queue.queueId, "q2");
  firstPost.resolve(Response.json(admission("q1")));
  await first;
  assert.equal((client as any).queue.queueId, "q2");
  assert.deepEqual(
    requests.filter((r) => r.init.method === "DELETE").map((r) => r.url),
    ["/realtime/v1/queue/q1"],
  );
  seat.resolve(fakeRoom("second"));
  await second;
  assert.equal(client.room?.roomId, "second");
});

test("a known waiting queue is cancelled after polling fails, with a retryable error intact", async (t) => {
  const { client, requests } = setup(t, (url, init) =>
    init.method === "POST"
      ? Response.json(admission("waiting", "waiting"))
      : new Response(
          JSON.stringify({
            error: { message: "Temporary service problem", code: "TEMPORARY" },
          }),
          { status: 503 },
        ),
  );
  await client.join({ mode: "pvp" });
  assert.equal(client.view.status, "error");
  assert.equal(client.view.errorCode, "TEMPORARY");
  assert.equal(client.view.error, "Temporary service problem");
  assert.equal((client as any).queue, null);
  assert.deepEqual(
    requests.filter((r) => r.init.method === "DELETE").map((r) => r.url),
    ["/realtime/v1/queue/waiting"],
  );
});

test("a failed SDK handshake cancels its ready grant and never binds a room", async (t) => {
  const { client, requests } = setup(t);
  t.mock.method((client as any).sdk, "consumeSeatReservation", async () => {
    throw Error("Handshake interrupted");
  });
  await client.join({ mode: "pvp" });
  assert.equal(client.room, null);
  assert.equal(client.view.error, "Handshake interrupted");
  assert.equal(requests.filter((r) => r.init.method === "DELETE").length, 1);
});

test("identity changes during the handshake retire the unbound room and revoke admission", async (t) => {
  const { client, requests } = setup(t),
    room = fakeRoom(),
    seat = deferred<any>();
  let consumed = false;
  t.mock.method((client as any).sdk, "consumeSeatReservation", () => {
    consumed = true;
    return seat.promise;
  });
  const joining = client.join({ mode: "pvp" });
  await until(() => consumed);
  t.mock.method(
    rankingClient,
    "getPlayer",
    () => ({ id: "new-player" }) as any,
  );
  seat.resolve(room);
  await joining;
  assert.equal(room.left, 1);
  assert.equal(room.reconnection.enabled, false);
  assert.equal(client.room, null);
  assert.equal(client.view.errorCode, "IDENTITY_CHANGED");
  assert.equal(requests.filter((r) => r.init.method === "DELETE").length, 1);
});

test("a stale failed handshake cannot replace the new join status or cancellation handle", async (t) => {
  let posts = 0;
  const { client, requests } = setup(t, () =>
    Response.json(admission("q" + ++posts)),
  );
  const old = deferred<any>(),
    next = deferred<any>();
  let consumes = 0;
  t.mock.method((client as any).sdk, "consumeSeatReservation", () =>
    ++consumes === 1 ? old.promise : next.promise,
  );
  const first = client.join({ mode: "pvp" });
  await until(() => consumes === 1);
  const second = client.join({ mode: "pvp" });
  await until(() => consumes === 2);
  old.reject(Error("old handshake failed"));
  await first;
  assert.equal(client.view.status, "connecting");
  assert.equal(client.view.error, undefined);
  assert.equal((client as any).queue.queueId, "q2");
  assert.equal(requests.filter((r) => r.init.method === "DELETE").length, 1);
  next.resolve(fakeRoom("new-room"));
  await second;
  assert.equal(client.room?.roomId, "new-room");
});

test("new admission waits until the old active room has finished leaving", async (t) => {
  const { client } = setup(t),
    room = fakeRoom("old-room"),
    release = deferred<number>();
  t.mock.method(room, "leave", () => release.promise);
  (client as any).bind(room);
  const leaving = client.leave();
  const newRoom = fakeRoom("new-room");
  t.mock.method(
    (client as any).sdk,
    "consumeSeatReservation",
    async () => newRoom,
  );
  await client.join({ mode: "pvp" });
  assert.equal(client.room,null);
  assert.equal(client.view.errorCode,'LEAVING');
  release.resolve(0);
  await leaving;
  await client.join({ mode: "pvp" });
  assert.equal(client.room, newRoom);
  assert.equal(client.view.currentRoom?.roomId, "new-room");
  assert.equal(client.view.status, "lobby");
});

function full(seq: number, tick = 0) {
  return {
    wireVersion: 1,
    kind: "full",
    seq,
    roomId: "room",
    viewerId: "p0",
    room: { roomId: "room", tick, phase: "playing" },
    roster: [],
    self: { id: "p0" },
    players: [],
    npcs: [],
    spectatingId: null,
    events: [],
    eventSerial: 0,
  };
}
function gap(seq: number) {
  return {
    wireVersion: 1,
    kind: "delta",
    seq,
    baseSeq: seq - 1,
    roomId: "room",
    viewerId: "p0",
  };
}

test("actual decoder gaps coalesce into one request and a bounded retry until a full baseline arrives", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const { client } = setup(t),
    room = fakeRoom();
  client.playerId = "p0";
  (client as any).bind(room);
  const snapshot = room.callbacks.get("snapshot")!;
  snapshot(full(1));
  for (let i = 3; i < 23; i++) snapshot(gap(i));
  assert.equal(room.sent.filter((r) => r.type === "resync").length, 1);
  now = 499;
  t.mock.timers.tick(499);
  assert.equal(room.sent.filter((r) => r.type === "resync").length, 1);
  now = 500;
  t.mock.timers.tick(1);
  assert.equal(room.sent.filter((r) => r.type === "resync").length, 2);
  snapshot(full(23, 30));
  now = 1500;
  t.mock.timers.tick(1000);
  assert.equal(room.sent.filter((r) => r.type === "resync").length, 2);
  snapshot(gap(25));
  assert.equal(room.sent.filter((r) => r.type === "resync").length, 3);
});

test("leave and reconnect isolate pending baseline requests from the obsolete room", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const { client } = setup(t),
    old = fakeRoom();
  client.playerId = "p0";
  (client as any).bind(old);
  old.callbacks.get("snapshot")!(gap(2));
  assert.equal(old.sent.filter((r) => r.type === "resync").length, 1);
  await client.leave();
  now = 1000;
  t.mock.timers.tick(1000);
  assert.equal(old.sent.filter((r) => r.type === "resync").length, 1);
  const next = fakeRoom();
  (client as any).bind(next);
  next.callbacks.get("reconnect")!();
  assert.equal(next.sent.filter((r) => r.type === "resync").length, 1);
  next.callbacks.get("snapshot")!(full(5, 60));
  now = 2000;
  t.mock.timers.tick(1000);
  assert.equal(next.sent.filter((r) => r.type === "resync").length, 1);
});

test("a closed socket does not turn a pending baseline request into a busy timer loop", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const { client } = setup(t),
    room = fakeRoom();
  (client as any).bind(room);
  room.connection.close();
  room.callbacks.get("snapshot")!(gap(2));
  now = 1000;
  t.mock.timers.tick(1000);
  assert.equal(room.sent.filter((r) => r.type === "resync").length, 0);
  room.connection.isOpen = true;
  room.callbacks.get("reconnect")!();
  assert.equal(room.sent.filter((r) => r.type === "resync").length, 1);
  room.callbacks.get("snapshot")!(full(3));
});

test("a blackholed SDK handshake times out and a later successful room is retired", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { client, requests } = setup(t),
    seat = deferred<any>(),
    room = fakeRoom();
  let consumed = false;
  t.mock.method((client as any).sdk, "consumeSeatReservation", () => {
    consumed = true;
    return seat.promise;
  });
  const joining = client.join({ mode: "pvp" });
  await until(() => consumed);
  t.mock.timers.tick(12000);
  await joining;
  assert.equal(client.view.errorCode, "JOIN_TIMEOUT");
  assert.equal(client.room, null);
  assert.equal(requests.filter((r) => r.init.method === "DELETE").length, 1);
  seat.resolve(room);
  await until(() => room.left === 1);
  assert.equal(room.reconnection.enabled, false);
  assert.equal(client.room, null);
  assert.equal(client.view.errorCode, "JOIN_TIMEOUT");
});

test("a socket closing after the first baseline request never schedules one-millisecond retries", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let now = 0;
  t.mock.method(performance, "now", () => now);
  const { client } = setup(t),
    room = fakeRoom();
  (client as any).bind(room);
  const calls = t.mock.method(client as any, "requestResync");
  room.callbacks.get("snapshot")!(gap(2));
  assert.equal(calls.mock.callCount(), 1);
  room.connection.close();
  now = 500;
  t.mock.timers.tick(500);
  assert.equal(calls.mock.callCount(), 2);
  now = 501;
  t.mock.timers.tick(1);
  assert.equal(calls.mock.callCount(), 2);
  assert.equal(room.sent.filter((r) => r.type === "resync").length, 1);
  await client.leave();
});

test("manual recovery timeout retains its token, permits retry and retires its late SDK room", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { client } = setup(t);
  sessionStorage.setItem(
    "qisheng-online-room-v1",
    JSON.stringify({
      token: "reserved:old-token",
      playerId: "p0",
      roomId: "reserved",
      at: 1,
    }),
  );
  const old = deferred<any>(),
    room = fakeRoom("reserved");
  let calls = 0;
  t.mock.method(reconnectSdk(t,client), "reconnect", () =>
    ++calls === 1 ? old.promise : Promise.resolve(room),
  );
  const first = client.reconnect();
  await until(() => calls === 1);
  t.mock.timers.tick(12000);
  assert.equal(await first, false);
  assert.equal(client.hasResumeSession(), true);
  assert.equal(client.view.errorCode, "RECONNECT_RETRY");
  assert.equal(await client.reconnect(), true);
  assert.equal(client.room, room);
  assert.equal(calls, 2);
  const late = fakeRoom("late-reserved");
  old.resolve(late);
  await until(() => late.left === 1);
  assert.equal(late.reconnection.enabled, false);
  assert.equal(client.room, room);
});

test("leaving cancels a blackholed manual recovery immediately without reviving its late success", async (t) => {
  const { client } = setup(t);
  sessionStorage.setItem(
    "qisheng-online-room-v1",
    JSON.stringify({ token: "reserved:old-token", playerId: "p0" }),
  );
  const pending = deferred<any>(),
    room = fakeRoom("reserved");
  let requested = false;
  t.mock.method(reconnectSdk(t,client), "reconnect", () => {
    requested = true;
    return pending.promise;
  });
  const recovery = client.reconnect();
  await until(() => requested);
  await client.leave();
  assert.equal(await recovery, false);
  assert.equal(client.hasResumeSession(), false);
  pending.resolve(room);
  await until(() => room.left === 1);
  assert.equal(room.reconnection.enabled, false);
  assert.equal(client.room, null);
  assert.equal(client.view.status, "lobby");
});

test("an unresponsive room leave is bounded and closes the old socket before accepting another join", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const { client } = setup(t),
    old = fakeRoom("old");
  t.mock.method(old, "leave", () => new Promise<number>(() => {}));
  (client as any).bind(old);
  const room = fakeRoom("new");
  t.mock.method(
    (client as any).sdk,
    "consumeSeatReservation",
    async () => room,
  );
  const joining = client.join({ mode: "pvp" });
  assert.equal(client.room, null);
  t.mock.timers.tick(1000);
  await joining;
  assert.equal(old.connection.isOpen, false);
  assert.equal(old.reconnection.enabled, false);
  assert.equal(client.room, room);
});

test("an overloaded long-poll hint delays only the next queue request and keeps ready admission responsive", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let polls = 0;
  const { client } = setup(t, (_url, init) => {
    if (init.method === "POST")
      return Response.json({
        ...admission("waiting", "waiting"),
        retryAfterMs: 1000,
      });
    polls++;
    return Response.json(admission("waiting"));
  });
  const room = fakeRoom();
  t.mock.method(
    (client as any).sdk,
    "consumeSeatReservation",
    async () => room,
  );
  const joining = client.join({ mode: "pvp" });
  await until(() => client.view.status === "queued");
  assert.equal(polls, 0);
  t.mock.timers.tick(999);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(polls, 0);
  t.mock.timers.tick(1);
  await joining;
  assert.equal(polls, 1);
  assert.equal(client.room, room);
});

test("cancelling an overloaded queue wait never sends a later poll or consumes a seat", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let polls = 0,
    consumes = 0;
  const { client, requests } = setup(t, (_url, init) => {
    if (init.method === "POST")
      return Response.json({
        ...admission("waiting", "waiting"),
        retryAfterMs: 1000,
      });
    polls++;
    return Response.json(admission("waiting"));
  });
  t.mock.method((client as any).sdk, "consumeSeatReservation", async () => {
    consumes++;
    return fakeRoom();
  });
  const joining = client.join({ mode: "pvp" });
  await until(() => client.view.status === "queued");
  await client.leave();
  await joining;
  t.mock.timers.tick(2000);
  assert.equal(polls, 0);
  assert.equal(consumes, 0);
  assert.equal(requests.filter((r) => r.init.method === "DELETE").length, 1);
});

test('loading retry listeners only receive valid reports from the current room',t=>{
 const{client}=setup(t),first=fakeRoom('first'),second=fakeRoom('second'),seen:unknown[]=[];const off=client.onLoadingRetry(message=>seen.push(message));(client as any).bind(first);
 first.callbacks.get('loading-retry')!({epoch:4,retryAfterMs:100});assert.deepEqual(seen,[{epoch:4,retryAfterMs:100}]);
 for(const bad of [{epoch:NaN,retryAfterMs:100},{epoch:4.5,retryAfterMs:100},{epoch:4,retryAfterMs:-1},{epoch:4,retryAfterMs:Infinity}])first.callbacks.get('loading-retry')!(bad);assert.equal(seen.length,1);
 (client as any).bind(second);first.callbacks.get('loading-retry')!({epoch:4,retryAfterMs:100});assert.equal(seen.length,1);second.callbacks.get('loading-retry')!({epoch:5,retryAfterMs:100});assert.equal(seen.length,2);off();second.callbacks.get('loading-retry')!({epoch:5,retryAfterMs:100});assert.equal(seen.length,2);
});


test('pending SDK room socket is retired immediately at admission timeout, before its promise resolves', async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const {client}=setup(t),sdk=(client as any).sdk,seat=deferred<any>();let pending:any,leaves=0;
 t.mock.method(sdk,'consumeSeatReservation',()=>{pending=sdk.createRoom('campus');pending.connection={isOpen:true,close(){this.isOpen=false;}};t.mock.method(pending,'leave',async()=>{leaves++;pending.connection.close();return 0;});return seat.promise;});
 const joining=client.join({mode:'pvp'});await until(()=>!!pending);
 t.mock.timers.tick(12000);await joining;assert.equal(client.view.errorCode,'JOIN_TIMEOUT');assert.equal(leaves,1);assert.equal(pending.connection.isOpen,false);
 seat.resolve(pending);await new Promise(resolve=>setImmediate(resolve));assert.equal(leaves,1,'late SDK success cannot retire the same captured room twice');assert.equal(client.room,null);
});

test('SDK duplicate identity rejection displays a player action instead of an internal error code',async t=>{
 const {client}=setup(t);t.mock.method((client as any).sdk,'consumeSeatReservation',async()=>{throw Error('DUPLICATE_IDENTITY');});await client.join({mode:'pvp'});assert.equal(client.view.errorCode,'DUPLICATE_IDENTITY');assert.match(client.view.error!,/原游戏页面重连/);assert.doesNotMatch(client.view.error!,/DUPLICATE_IDENTITY/);assert.equal(client.room,null);
});


test('admission waits for its own authoritative first snapshot, not just the SDK handshake',async t=>{
 const {client}=setup(t),room=fakeRoom('first-snapshot',false);t.mock.method((client as any).sdk,'consumeSeatReservation',async()=>room);
 let settled=false;const work=client.join({mode:'pvp'}).then(value=>{settled=true;return value;});await until(()=>client.room===room);assert.equal(settled,false);
 room.callbacks.get('snapshot')!({roomId:room.roomId,phase:'lobby',tick:0,players:[{id:'other'}],events:[]});await Promise.resolve();assert.equal(settled,false);
 room.callbacks.get('snapshot')!({roomId:room.roomId,phase:'lobby',tick:1,players:[{id:'p0'}],events:[]});assert.equal((await work)?.roomId,room.roomId);assert.equal(room.left,0);
});
test('first snapshot timeout preserves the admitted seat for a retry instead of opening a second room',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {client,requests}=setup(t),room=fakeRoom('pending',false);t.mock.method((client as any).sdk,'consumeSeatReservation',async()=>room);
 const work=client.join({mode:'pvp'});await until(()=>client.room===room);t.mock.timers.tick(12000);await work;
 assert.equal(client.view.errorCode,'JOIN_PENDING');assert.equal(client.room,room);assert.equal(client.hasResumeSession(),true);assert.equal(room.left,0);
 const retry=client.waitForOwnSnapshot();room.callbacks.get('snapshot')!({roomId:room.roomId,phase:'lobby',tick:2,players:[{id:'p0'}],events:[]});assert.equal((await retry).roomId,room.roomId);assert.equal(requests.filter(r=>r.url.endsWith('/queue')&&r.init.method==='POST').length,1);
});
test('cancelling before the first snapshot prevents late success and explicit leave releases that seat',async t=>{
 const {client}=setup(t),room=fakeRoom('cancelled',false),abort=new AbortController();t.mock.method((client as any).sdk,'consumeSeatReservation',async()=>room);
 const work=client.join({mode:'pvp'},undefined,undefined,abort.signal);await until(()=>client.room===room);abort.abort();await client.leave();await work;
 room.callbacks.get('snapshot')!({roomId:room.roomId,phase:'lobby',tick:2,players:[{id:'p0'}],events:[]});assert.equal(client.room,null);assert.equal(client.view.currentRoom,null);assert.equal(room.left,1);assert.equal(client.hasResumeSession(),false);
});
test('equipment success waits for the requested server loadout rather than the send call',async t=>{
 const {client}=setup(t),room=fakeRoom('equipment',false);client.playerId='p0';(client as any).bind(room);
 room.callbacks.get('snapshot')!({roomId:room.roomId,phase:'lobby',tick:1,players:[{id:'p0',weapon:'mp5',avatar:'campus-a',team:'blue'}],events:[]});
 let confirmed=false;const work=client.selectLoadout({weapon:'m4a1',avatar:'campus-a',team:'blue'},new AbortController().signal).then(()=>confirmed=true);assert.equal(confirmed,false);assert.equal(room.sent.at(-1)?.type,'loadout');
 room.callbacks.get('snapshot')!({roomId:room.roomId,phase:'lobby',tick:2,players:[{id:'p0',weapon:'m4a1',avatar:'campus-a',team:'blue'}],events:[]});await work;assert.equal(confirmed,true);
});
test('unknown queue delivery survives reload and blocks every new create until authenticated reconciliation clears it',async t=>{
 let posts=0,blocked=true;const {client,requests,data}=setup(t,()=>{if(++posts===1)throw Error('response lost after server accepted');return Response.json(admission('retry'));}),room=fakeRoom('retry-room');
 const transport=globalThis.fetch;t.mock.method(globalThis,'fetch',async(raw,init)=>String(raw).endsWith('/v1/admission/reconcile')?Response.json({cleared:!blocked,active:blocked}):transport(raw,init));t.mock.method((client as any).sdk,'consumeSeatReservation',async()=>room);
 await client.join({mode:'pvp'});assert.equal(client.hasUncertainAdmission(),true);assert.equal(client.view.errorCode,'ADMISSION_UNCERTAIN');assert.equal(data.has('qisheng-pending-admission-v1'),true);
 const restored=new OnlineClient();assert.equal(restored.hasUncertainAdmission(),true);restored.dispose();
 await client.join({mode:'pvp'});assert.equal(posts,1);assert.equal(client.hasUncertainAdmission(),true);assert.equal(requests.filter(r=>r.url.endsWith('/queue')&&r.init.method==='POST').length,1);
 blocked=false;assert.equal((await client.join({mode:'pvp'}))?.roomId,room.roomId);assert.equal(posts,2);assert.equal(client.hasUncertainAdmission(),false);assert.equal(data.has('qisheng-pending-admission-v1'),false);
});
