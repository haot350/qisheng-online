import { activeTouchControls } from "./input-layout.ts";
import { INPUT_RESET_EVENT } from "./pointer-owner.ts";
import type {
  Action,
  DriveInput,
  InputFrame,
  InputSource,
  Mode,
} from "./types";
export function createInput(
  canvas: HTMLCanvasElement,
  onPause: () => void,
): InputSource & {
  action: (a: Action, pressed?: boolean) => void;
  cancelAction: (a: Action) => void;
  setEscapeAimMode: (mode: "toggle" | "hold") => void;
  getSprintIntent: () => boolean;
  getAimIntent: () => boolean;
  resetControlMethod: () => void;
  getControlMethod: () => "keyboard" | "touch" | "mixed" | null;
  move: (x: number, y: number) => void;
  look: (x: number, y: number) => void;
  lock: () => Promise<void>;
  setMode: (mode: Mode) => void;
  setEnabled: (enabled: boolean) => void;
  setPhotography: (enabled: boolean) => void;
  setCursorFree: (free: boolean) => void;
  isCursorFree: () => boolean;
  isLocked: () => boolean;
  freePointerLock: () => void;
  setSuspended: (suspended: boolean) => void;
  sampleLook: () => {lookX:number;lookY:number};
  drive: (input: Partial<DriveInput>) => void;
  holdLook: (held: boolean) => void;
  flushTransient: () => void;
} {
  let controlMethod: "keyboard" | "touch" | "mixed" | null = null,
    lastTouchControl = -Infinity;
  const noteControl = (method: "keyboard" | "touch") => {
    controlMethod =
      controlMethod && controlMethod !== method ? "mixed" : method;
  };
  let escapeAimMode: "toggle" | "hold" = "toggle",
    // Pointer ownership only deduplicates a press; it is never an ADS intent.
    touchAimPointerHeld = false;
  const keys = new Set<string>();
  const actions = new Set<Action>();
  const toggleBefore = new Map<Action, boolean>();
  let tx = 0,
    ty = 0,
    lx = 0,
    ly = 0,
    fire = false,
    touchAimActive = false,
    mouseFireHeld = false,
    mouseAimHeld = false,
    crouched = false,
    wasLocked = false;
  let disposed = false;
  let photographing = false,
    cursorFree = false,
    intentionalUnlock = false,
    lockRevoked = false;
  const freeCursor = () => mode === "dafei" || cursorFree;
  let mode: Mode = "escape",
    enabled = true,
    suspended = false,
    fastWalk = false,
    escapeSprint = false,
    dragging = false,
    touchLook = false,
    boostEdge = false;
  let driving: DriveInput = {
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    reverse: false,
    boost: false,
    reset: false,
  };
  let pendingLock: Promise<void> | null = null;
  let cancelLock: ((message?: string) => void) | null = null;
  const touchDevice = () => activeTouchControls();
  const reset = () => {
    touchAimPointerHeld = false;
    keys.clear();
    actions.clear();
    toggleBefore.clear();
    tx = ty = lx = ly = 0;
    fire =
      touchAimActive =
      mouseFireHeld =
      mouseAimHeld =
      crouched =
      dragging =
      touchLook =
      boostEdge =
      fastWalk =
      escapeSprint =
        false;
    driving = {
      steer: 0,
      throttle: 0,
      brake: 0,
      handbrake: false,
      reverse: false,
      boost: false,
      reset: false,
    };
    document.dispatchEvent(new Event(INPUT_RESET_EVENT));
  };
  // Loading can freeze simulation without losing held keys or pointer capture.
  const flushTransient = () => {
    actions.clear();
    lx = ly = 0;
    boostEdge = false;
  };
  const focused = () =>
    document.activeElement === canvas || document.pointerLockElement === canvas;
  const focus = () => {
    canvas.tabIndex = 0;
    canvas.focus?.({ preventScroll: true });
  };
  const releaseKeyboard = () => {
    keys.clear();
    flushTransient();
  };
  const lockedCombatMouse = () =>
    enabled && !freeCursor() && mode !== "story" && !photographing &&
    document.pointerLockElement === canvas;
  const releaseMouse = (preservePhysical = false) => {
    dragging = touchLook = fire = touchAimActive = touchAimPointerHeld = false;
    toggleBefore.delete("aim");
    if (!preservePhysical) mouseFireHeld = mouseAimHeld = false;
    flushTransient();
  };
  const releaseLock = () => {
    releaseMouse();
    if (document.pointerLockElement !== canvas) return;
    intentionalUnlock = true;
    document.exitPointerLock();
  };
  const cancelRequest = (message: string) => {
    if (!cancelLock) return;
    lockRevoked = true;
    cancelLock(message);
    pendingLock = null;
  };
  const setCursorFree = (next: boolean) => {
    if (disposed || cursorFree === next) return;
    cursorFree = next;
    releaseMouse();
    if (next) {
      cancelRequest("鼠标锁定请求已取消。");
      releaseLock();
    }
  };
  const editable = (target: EventTarget | null) =>
    /INPUT|SELECT|TEXTAREA/.test((target as HTMLElement)?.tagName || "") ||
    Boolean((target as HTMLElement)?.isContentEditable);
  const action = (a: Action, pressed = true) => {
    if (disposed || ((!enabled || suspended) && pressed)) return;
    if (a === "shiftUp" || a === "shiftDown") {
      if (mode === "dafei" && pressed) actions.add(a);
      return;
    }
    if (mode === "dafei") {if(a === "fire" && pressed) actions.add(a);return;}
    if (mode === "story" && a === "run") {
      if (pressed) {
        toggleBefore.set(a, fastWalk);
        fastWalk = !fastWalk;
      } else toggleBefore.delete(a);
      return;
    }
    if (mode === "escape" && a === "run") {
      if (pressed) {
        toggleBefore.set(a, escapeSprint);
        escapeSprint = !escapeSprint;
      } else toggleBefore.delete(a);
      return;
    }
    if (a === "slide" || a === "nextTask" || a === "taskMap") {
      if (mode === "escape" && pressed) actions.add(a);
      return;
    }
    if (a === "fire") {
      // Keep a quick press until the next sample even if it has already ended.
      if (pressed && !fire) actions.add("fire");
      fire = pressed;
    } else if (a === "aim") {
      if (mode === "escape" && escapeAimMode === "toggle") {
        if (pressed && !touchAimPointerHeld) {
          toggleBefore.set(a, touchAimActive);
          touchAimActive = !touchAimActive;
        }
        if (!pressed) toggleBefore.delete(a);
        touchAimPointerHeld = pressed;
      } else {
        touchAimActive = pressed;
        touchAimPointerHeld = pressed;
      }
    } else if (a === "crouch") {
      if (pressed) {
        toggleBefore.set(a, crouched);
        crouched = !crouched;
      } else toggleBefore.delete(a);
    } else if (pressed) actions.add(a);
  };
  const keydown = (e: KeyboardEvent) => {
    if (disposed || !enabled) return;
    // Browser shortcuts can consume the later keyup. Do not retain movement
    // through a tab/focus change or allow an orphan auto-repeat to re-arm it.
    if (e.code === "Tab" && (mode === "story" || photographing)) {
      releaseKeyboard();
      // Tab leaves a locked viewfinder once; subsequent Tab presses belong to
      // ordinary controls and modal focus traps rather than gameplay.
      if (
        !editable(e.target) &&
        !suspended &&
        !cursorFree &&
        document.pointerLockElement === canvas
      ) {
        e.preventDefault();
        setCursorFree(true);
      }
      return;
    }
    if (
      e.metaKey ||
      e.altKey ||
      e.code === "MetaLeft" ||
      e.code === "MetaRight" ||
      e.code === "AltLeft" ||
      e.code === "AltRight" ||
      (e.code === "Tab" && freeCursor())
    ) {
      releaseKeyboard();
      return;
    }
    if (editable(e.target)) return;
    const bound = [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ControlLeft",
      "ControlRight",
      "ShiftLeft",
      "ShiftRight",
      "Space",
      "KeyR",
      "KeyG",
      "KeyQ",
      "KeyE",
      "Digit1",
      "Digit2",
      "Escape",
    ];
    if (
      !bound.includes(e.code) &&
      !(mode === "escape" && (e.code === "KeyM" || e.code === "Tab"))
    )
      return;
    if (
      freeCursor() || touchDevice()
        ? !focused()
        : document.pointerLockElement !== canvas
    )
      return;
    e.preventDefault();
    const first = !keys.has(e.code);
    if (e.repeat && first) return;
    noteControl("keyboard");
    keys.add(e.code);
    if (suspended) {
      if (first && e.code === "Escape") onPause();
      return;
    }
    if (mode === "dafei") {
      if (first && !e.repeat && (e.code === "KeyE" || e.code === "KeyQ"))
        actions.add(e.code === "KeyE" ? "shiftUp" : "shiftDown");
      if (
        first &&
        !e.repeat &&
        (e.code === "ShiftLeft" || e.code === "ShiftRight")
      )
        boostEdge = true;
      if (first && e.code === "Escape") {
        reset();
        onPause();
      }
      return;
    }
    if (e.repeat) return;
    if (mode === "escape") {
      if (e.code === "KeyM") {
        actions.add("taskMap");
        return;
      }
      if (e.code === "Tab") {
        actions.add("nextTask");
        return;
      }
      if (
        (e.code === "ControlLeft" || e.code === "ControlRight") &&
        (escapeSprint || keys.has("ShiftLeft") || keys.has("ShiftRight"))
      )
        actions.add("slide");
    }
    const mapped: Record<string, Action> = {
      ShiftLeft: "run",
      ShiftRight: "run",
      Space: "jump",
      KeyR: "reload",
      KeyG: "useGadget",
      KeyQ: "switch",
      KeyE: "interact",
      Digit1: "switch",
      Digit2: "switch",
    };
    if (
      mapped[e.code] &&
      !(
        (mode === "story" || mode === "escape") &&
        (e.code === "ShiftLeft" || e.code === "ShiftRight")
      )
    )
      actions.add(mapped[e.code]);
    if (e.code === "Escape") {
      reset();
      onPause();
    }
  };
  const keyup = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const focusin = (e: FocusEvent) => {
    if (editable(e.target)) releaseKeyboard();
  };
  const mousemove = (e: MouseEvent) => {
    if (
      !disposed &&
      enabled &&
      !suspended &&
      (mode === "dafei"
        ? dragging
        : !cursorFree && document.pointerLockElement === canvas)
    ) {
      lx += e.movementX || 0;
      ly += e.movementY || 0;
    }
  };
  const mousedown = (e: MouseEvent) => {
    if (disposed || !enabled) return;
    if (suspended) {
      if (lockedCombatMouse()) {
        if (e.button === 0) mouseFireHeld = true;
        if (e.button === 2) mouseAimHeld = true;
      }
      return;
    }
    if (
      e.target === canvas &&
      !(
        e as MouseEvent & {
          sourceCapabilities?: {
            firesTouchEvents?: boolean;
          };
        }
      ).sourceCapabilities?.firesTouchEvents &&
      performance.now() - lastTouchControl > 750
    )
      noteControl("keyboard");
    if (freeCursor()) {
      if (e.target === canvas) {
        focus();
        if (mode === "dafei" && e.button === 2) dragging = true;
        if (mode === "dafei" && e.button === 0) actions.add("fire");
      }
      return;
    }
    if (
      document.pointerLockElement !== canvas ||
      mode === "story" ||
      photographing
    )
      return;
    if (e.button === 0) {
      if (!mouseFireHeld && !fire) actions.add("fire");
      mouseFireHeld = true;
    }
    if (e.button === 2) mouseAimHeld = true;
  };
  const mouseup = (e: MouseEvent) => {
    if (e.button === 2) dragging = false;
    if (e.button === 0) mouseFireHeld = false;
    if (e.button === 2) mouseAimHeld = false;
  };
  const contextmenu = (e: Event) => e.preventDefault();
  const lockchange = () => {
    const locked = document.pointerLockElement === canvas;
    if (locked && (disposed || lockRevoked || freeCursor())) {
      releaseLock();
      return;
    }
    if (wasLocked && !locked && !disposed) {
      if (intentionalUnlock || mode === "dafei") releaseMouse();
      else {
        reset();
        if (enabled) onPause();
      }
    }
    if (!locked) intentionalUnlock = false;
    wasLocked = locked;
  };
  const background = () => {
    if (document.hidden) {
      reset();
      if (enabled && !disposed) onPause();
    }
  };
  const blur = () => {
    reset();
    if (enabled && !disposed) onPause();
  };
  const pointerdown = (e: PointerEvent) => {
    if (disposed || !enabled || suspended) return;
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      lastTouchControl = performance.now();
      noteControl("touch");
    }
  };
  window.addEventListener("pointerdown", pointerdown, { capture: true });
  window.addEventListener("keydown", keydown);
  // Capture releases before a dialog, slider or focused control can stop them.
  window.addEventListener("keyup", keyup, { capture: true });
  window.addEventListener("focusin", focusin, { capture: true });
  window.addEventListener("mousemove", mousemove);
  window.addEventListener("mousedown", mousedown);
  window.addEventListener("mouseup", mouseup);
  window.addEventListener("blur", blur);
  canvas.addEventListener("contextmenu", contextmenu);
  document.addEventListener("pointerlockchange", lockchange);
  document.addEventListener("visibilitychange", background);
  return {
    action,
    cancelAction(a) {
      actions.delete(a);
      const previous = toggleBefore.get(a);
      toggleBefore.delete(a);
      if (a === "run" && previous !== undefined) {
        if (mode === "story") fastWalk = previous;
        if (mode === "escape") escapeSprint = previous;
      }
      if (a === "crouch" && previous !== undefined) crouched = previous;
      if (a === "aim") {
        touchAimActive = previous ?? false;
        touchAimPointerHeld = false;
      }
      if (a === "fire") fire = false;
    },
    setEscapeAimMode(next) {
      if (next === escapeAimMode) return;
      escapeAimMode = next;
      touchAimActive = false;
      touchAimPointerHeld = false;
      toggleBefore.delete("aim");
    },
    resetControlMethod: () => {
      controlMethod = null;
      lastTouchControl = -Infinity;
    },
    getControlMethod: () => controlMethod,
    getAimIntent: () => touchAimActive || mouseAimHeld,
    getSprintIntent: () =>
      mode === "escape" &&
      (escapeSprint || keys.has("ShiftLeft") || keys.has("ShiftRight")),
    setMode(next) {
      if (next !== mode) {
        cancelRequest("游戏模式已切换。");
        releaseLock();
        reset();
        cursorFree = false;
        mode = next;
      }
    },
    setPhotography(next) {
      if (next === photographing) return;
      photographing = next;
      if (next) releaseMouse();
      else flushTransient();
      if (next) focus();
    },
    setEnabled(next) {
      if (enabled === next) return;
      enabled = next;
      if (!next) {
        cancelRequest("游戏已暂停。");
        releaseLock();
        reset();
      }
    },
    setCursorFree,
    isCursorFree: () => cursorFree,
    isLocked: () => !disposed && document.pointerLockElement === canvas,
    freePointerLock: () => setCursorFree(true),
    setSuspended(next) {
      if (suspended === next) return;
      suspended = next;
      if (next) {
        tx = ty = 0;
        driving = {
          steer: 0,
          throttle: 0,
          brake: 0,
          handbrake: false,
          reverse: false,
          boost: false,
          reset: false,
        };
        releaseMouse(lockedCombatMouse());
        document.dispatchEvent(new Event(INPUT_RESET_EVENT));
      }
      flushTransient();
    },
    holdLook(held) {
      if (disposed || !enabled || mode !== "dafei" || (suspended && held))
        return;
      touchLook = held;
    },
    drive(value) {
      if (disposed || !enabled || suspended || mode !== "dafei") return;
      const finite = (n: number, min: number, max: number) =>
        Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;
      if (value.steer !== undefined) driving.steer = finite(value.steer, -1, 1);
      if (value.throttle !== undefined)
        driving.throttle = finite(value.throttle, 0, 1);
      if (value.brake !== undefined) driving.brake = finite(value.brake, 0, 1);
      if (value.handbrake !== undefined)
        driving.handbrake = Boolean(value.handbrake);
      if (value.reverse !== undefined) driving.reverse = value.reverse;
      if (value.reset !== undefined) driving.reset = value.reset;
      if (value.boost !== undefined) {
        if (value.boost && !driving.boost) boostEdge = true;
        driving.boost = value.boost;
      }
    },
    move(x, y) {
      if (disposed || !enabled || mode === "dafei") return;
      if (suspended && (x !== 0 || y !== 0)) return;
      tx = Math.max(-1, Math.min(1, x));
      ty = Math.max(-1, Math.min(1, y));
    },
    look(x, y) {
      if (!disposed && enabled && !suspended) {
        lx += x;
        ly += y;
      }
    },
    async lock() {
      if (disposed) throw new Error("游戏已关闭。");
      focus();
      if (freeCursor()) return;
      if (touchDevice() || document.pointerLockElement === canvas) return;
      if (!canvas.requestPointerLock)
        throw new Error("浏览器未提供鼠标锁定，请使用支持该功能的浏览器。");
      if (pendingLock) return pendingLock;
      lockRevoked = false;
      // Older browsers return void: wait for the actual lock event rather than
      // letting a denied request silently start a game without mouse controls.
      const request = new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          document.removeEventListener("pointerlockchange", changed);
          document.removeEventListener("pointerlockerror", failed);
          cancelLock = null;
          if (error) reject(error);
          else resolve();
        };
        const changed = () => {
          if (document.pointerLockElement === canvas) finish();
        };
        const failed = () =>
          finish(new Error("浏览器未允许鼠标锁定，请点击继续游戏重试。"));
        const timer = setTimeout(failed, 3000);
        cancelLock = (message = "游戏已关闭。") => finish(new Error(message));
        document.addEventListener("pointerlockchange", changed);
        document.addEventListener("pointerlockerror", failed);
        try {
          const result = canvas.requestPointerLock();
          Promise.resolve(result).then(changed, failed);
          changed();
        } catch {
          failed();
        }
      });
      pendingLock = request;
      try {
        await request;
      } finally {
        if (pendingLock === request) pendingLock = null;
      }
    },
    sampleLook() {
      const result = {lookX: enabled && !suspended ? lx : 0, lookY: enabled && !suspended ? ly : 0};
      lx = ly = 0;
      return result;
    },
    sample(): InputFrame {
      if (suspended) {
        flushTransient();
        return {
          moveX: 0,
          moveY: 0,
          lookX: 0,
          lookY: 0,
          fire: false,
          aim: false,
          crouch: false,
          fastWalk: false,
          actions: new Set(),
        };
      }
      if (mode === "dafei") {
        const backward = keys.has("KeyS") || keys.has("ArrowDown"),
          forward = keys.has("KeyW") || keys.has("ArrowUp");
        const steer = Math.max(
          -1,
          Math.min(
            1,
            driving.steer +
              (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
              (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
          ),
        );
        const drive: DriveInput = {
          steer,
          throttle: forward !== backward ? 1 : driving.throttle,
          brake: driving.brake,
          handbrake: keys.has("Space") || driving.handbrake,
          reverse: (backward && !forward) || driving.reverse,
          boost: boostEdge,
          reset: keys.has("KeyR") || driving.reset,
        };
        const frame: InputFrame = {
          moveX: 0,
          moveY: 0,
          lookX: lx,
          lookY: ly,
          lookHeld: dragging || touchLook,
          fire: false,
          aim: false,
          crouch: false,
          actions: new Set(actions),
          drive,
        };
        lx = ly = 0;
        boostEdge = false;
        actions.clear();
        return frame;
      }
      const x =
        tx +
        (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
        (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
      const y =
        ty +
        (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
        (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
      const d = Math.max(1, Math.hypot(x, y));
      const result: InputFrame = {
        moveX: x / d,
        moveY: y / d,
        lookX: lx,
        lookY: ly,
        fire: fire || mouseFireHeld,
        aim: touchAimActive || mouseAimHeld,
        crouch: crouched || keys.has("ControlLeft") || keys.has("ControlRight"),
        ...(mode === "story"
          ? {
              fastWalk:
                fastWalk || keys.has("ShiftLeft") || keys.has("ShiftRight"),
            }
          : {}),
        ...(mode === "escape"
          ? {
              sprintHeld:
                escapeSprint || keys.has("ShiftLeft") || keys.has("ShiftRight"),
            }
          : {}),
        actions: new Set(actions),
      };
      lx = ly = 0;
      actions.clear();
      return result;
    },
    reset,
    flushTransient,
    dispose() {
      if (disposed) return;
      const pending = !!cancelLock || lockRevoked;
      disposed = true;
      cancelRequest("游戏已关闭。");
      releaseLock();
      reset();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup, { capture: true });
      window.removeEventListener("focusin", focusin, { capture: true });
      window.removeEventListener("pointerdown", pointerdown, { capture: true });
      window.removeEventListener("mousemove", mousemove);
      window.removeEventListener("mousedown", mousedown);
      window.removeEventListener("mouseup", mouseup);
      window.removeEventListener("blur", blur);
      canvas.removeEventListener("contextmenu", contextmenu);
      document.removeEventListener("pointerlockchange", lockchange);
      document.removeEventListener("visibilitychange", background);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      // A legacy void request can complete after disposal. Retain only a short
      // ownership guard; no old controls or callbacks survive with it.
      if (pending) {
        const ownerDocument = document;
        const cleanup = () => {
          clearTimeout(timer);
          ownerDocument.removeEventListener("pointerlockchange", late);
          ownerDocument.removeEventListener("pointerlockerror", cleanup);
        };
        const late = () => {
          if (ownerDocument.pointerLockElement !== canvas) return;
          ownerDocument.exitPointerLock();
          cleanup();
        };
        const timer = setTimeout(cleanup, 3000);
        (
          timer as unknown as {
            unref?: () => void;
          }
        ).unref?.();
        ownerDocument.addEventListener("pointerlockchange", late);
        ownerDocument.addEventListener("pointerlockerror", cleanup);
      }
    },
  };
}
