import type {AssistantMenuAction, AssistantMenuContext} from '@qisheng/shared/assistant';
import {GadgetHUD} from './GadgetHUD';
import {WeaponLoadout} from './WeaponLoadout';
import {Crosshair} from './Crosshair';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {SettingsPanel} from "./SettingsPanel";
import { CombatBriefing, type CombatBriefingMode } from "./CombatBriefing";
import {
  DafeiIntro,
  DrivingHelp,
  DrivingHUD,
  DrivingResult,
  TouchDrive,
  TransmissionChoice,
} from "./DrivingUI";
import {
  ESCAPE_DIFFICULTIES,
  EscapeHelp,
  EscapeHUD,
  EscapeMap,
  EscapeResult,
  EscapeTouchControls,
  EscapeTouchEditor,
} from "./EscapeUI";
import FeedbackUI from "./FeedbackUI";
import {
  MainMenu,
  MenuAbout,
  MenuReadingPanel,
  type EscapeEntry,
} from "./MainMenu";
import { ModuleBoundary } from "./ModuleBoundary";
import {MenuPage, useMenuPages, type MenuPageId} from "./MenuPages";
import {SessionMenuActions} from './SessionMenuActions';
import { MenuFAQ, MenuUpdates } from "./ReadingUI";
import { TouchControls } from "./TouchControls";
import {
  hasSeenCombatBriefing,
  markCombatBriefingSeen,
} from "./combat-briefing-state";
import { useFeedbackUnread } from "./feedback-unread";
import { setGameMapDownloadContext } from "./game-map";
import { primaryTouchInput, resolveTouchControls } from "./input-layout.ts";
import "./mobile-refinement.css";
import { pausePolicy } from "./mode-policy";
import { ConnectionDetails, ConnectionHUD } from "./multiplayer/ConnectionUI";
import MultiplayerUI, {
  OnlineHelp,
  OnlineHUD,
  OnlinePause,
  OnlineResult,
  type OnlineUIAction,
} from "./multiplayer/MultiplayerUI";
import { OnlineMap } from "./multiplayer/OnlineMap";
import { OnlineClient } from "./multiplayer/client";
import "./multiplayer/online-runtime.css";
import type { LobbyView } from "./multiplayer/shared/protocol";
import "./ranking.css";
import { rankingClient } from "./ranking/client";
import {achievementIconUrls} from "./achievement-icons";
import type { RankingPlayer } from "./ranking/shared";
import { RELEASE_LABEL } from "./release";
import { PRIMARY_WEAPONS } from "./rules";
import { ResourceSlot, SessionOperations, SessionScope } from "./session-flow";
import { deviceGuidance } from "./story/guidance";
import "./styles.css";
import { gameTelemetry } from "./telemetry";
import {
  DEFAULT_SETTINGS,
  parseStoredSettings,
  type GameAPI,
  type Mode,
  type Settings,
  type Snapshot,
  type TransmissionMode,
} from "./types";
import {
  loadArchiveUI,
  loadPhotoUI,
  loadRealityUI,
  loadStoryUI,
} from "./ui-modules";
import { useUsableViewport } from "./usable-viewport";
import { gameOperations } from './game-operations';
import { entryFor, ModeUnavailableError } from './game-config-store';
import { AnnouncementBanner, AnnouncementList, useAnnouncements, useGameOperations } from './OperationsUI';
import type { ModeEntry } from '@qisheng/shared/operations';
function touchLayoutPortrait(width: number, height: number) {
  return height > width;
}
const storyComponent = () =>
    lazy(() => loadStoryUI().then((m) => ({ default: m.StoryHUD }))),
  photoComponent = () =>
    lazy(() => loadPhotoUI().then((m) => ({ default: m.PhotoUI }))),
  archiveComponent = () =>
    lazy(() => loadArchiveUI().then((m) => ({ default: m.ArchiveUI }))),
  albumComponent = () =>
    lazy(() => loadPhotoUI().then((m) => ({ default: m.PhotoAlbum }))),
  realityComponent = () =>
    lazy(() => loadRealityUI().then((m) => ({ default: m.RealityUI })));
const StoryHUD = storyComponent(),
  PhotoUI = photoComponent(),
  ArchiveUI = archiveComponent(),
  PhotoAlbum = albumComponent(),
  RealityUI = realityComponent();
const rankingComponent = () => lazy(() => import("./RankingUI"));
const RankingUI = rankingComponent();
const AssistantUI = lazy(()=>import('./AssistantUI'));
const CreditsPlayer = lazy(()=>import('./CreditsPlayer').then(m=>({default:m.CreditsPlayer})));
const CopyrightPage = lazy(()=>import('./CopyrightPage').then(m=>({default:m.CopyrightPage})));
const AccountPage = lazy(() => import("@qisheng/shared/community").then(m => ({default:m.AccountPage})));
const RankingResultStatus = lazy(() =>
  import("./RankingUI").then((m) => ({ default: m.RankingResultStatus })),
);
const DrivingQA = import.meta.env.DEV
  ? lazy(() => import("./DrivingQA"))
  : null;
const INITIAL: Snapshot = {
  phase: "menu",
  mode: "escape",
  progress: 0,
  message: "",
  health: 100,
  stamina: 100,
  ammo: 17,
  reserve: 51,
  weapon: "glock",
  hasPrimary: false,
  smokes: 2,
  remaining: 480,
  elapsed: 0,
  grace: 10,
  clues: 0,
  goalName: "",
  goalDistance: 0,
  goalAngle: 0,
  extraction: 0,
  running: false,
  crouching: false,
  aiming: false,
  reloading: false,
  hit: 0,
  hitType: null,
  hurt: 0,
  incoming: [],
  fps: 0,
  quality: "自动",
  musicError: false,
  best: null,
  resultReason: "",
  notice: "",
  buffering: false,
  mapError: false,
  mapProgress: 1,
};
type PrimaryWeapon = (typeof PRIMARY_WEAPONS)[number];
function loadPrimary(): PrimaryWeapon {
  try {
    const value = localStorage.getItem("qisheng-game-primary");
    return PRIMARY_WEAPONS.includes(value as PrimaryWeapon)
      ? (value as PrimaryWeapon)
      : "m4a1";
  } catch {
    return "m4a1";
  }
}
function loadSettings(): Settings {
  try {
    return parseStoredSettings(localStorage.getItem("qisheng-game-settings"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const path: Record<string, React.ReactNode> = {
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m9 5 11 7-11 7Z" />,
    arrow: (
      <>
        <path d="M4 12h16M14 6l6 6-6 6" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="m9 3-1 3-3 1 1 3-3 2 3 2-1 3 3 1 1 3h6l1-3 3-1-1-3 3-2-3-2 1-3-3-1-1-3Z" />
      </>
    ),
    expand: <path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />,
    run: (
      <>
        <circle cx="15" cy="4" r="2" />
        <path d="m8 9 5-2 4 5h4m-8-5-3 7 5 3v5m-5-8-3 6H3M6 8l-3 4" />
      </>
    ),
    fire: (
      <>
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 1v4m0 14v4M1 12h4m14 0h4" />
      </>
    ),
    reload: (
      <>
        <path d="M19 8a8 8 0 1 0 1 7M19 3v5h-5" />
      </>
    ),
    jump: (
      <>
        <path d="M12 21V3m-6 6 6-6 6 6M3 21h18" />
      </>
    ),
    aim: (
      <>
        <path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5M9 12h6m-3-3v6" />
      </>
    ),
    smoke: (
      <>
        <path d="M7 21h10v-9H7ZM10 12V9h4v3M10 5c-4-2 4-4 2-1s5 1 2 4" />
      </>
    ),
    switch: (
      <>
        <path d="M3 7h18m-5-4 5 4-5 4M21 17H3m5-4-5 4 5 4" />
      </>
    ),
    crouch: (
      <>
        <circle cx="14" cy="4" r="2" />
        <path d="m14 8-5 5 8 3-4 5H6m3-8-5-1m10-4 5 4" />
      </>
    ),
    hand: (
      <>
        <path d="M7 14V8a2 2 0 0 1 4 0V4a2 2 0 0 1 4 0v9l2-4 3 1-2 9-4 3H8l-5-7 2-2 3 3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path[name] || path.arrow}
    </svg>
  );
}
function DamageDirections({ incoming }: { incoming: Snapshot["incoming"] }) {
  return (
    <div className="incoming-hud" aria-hidden="true">
      {incoming.slice(0, 4).map((source) => {
        const degrees = (source.angle * 180) / Math.PI;
        const opacity =
          Math.max(0, Math.min(1, source.remaining * 3)) *
          (0.6 + 0.4 * Math.max(0, Math.min(1, source.strength)));
        return (
          <svg
            key={source.id}
            className="incoming-marker"
            viewBox="0 0 140 140"
            style={{ transform: `rotate(${degrees}deg)`, opacity }}
          >
            <path className="incoming-outline" d="M48 20 A55 55 0 0 1 92 20" />
            <path className="incoming-arc" d="M48 20 A55 55 0 0 1 92 20" />
            {source.vertical !== 0 && (
              <text
                x="70"
                y="12"
                textAnchor="middle"
                transform={`rotate(${-degrees} 70 7)`}
              >
                {source.vertical > 0 ? "上" : "下"}
              </text>
            )}
          </svg>
        );
      })}
    </div>
  );
}
function HelpContent({
  mode,
  touchLayout,
}: {
  mode: Mode;
  touchLayout: boolean;
}) {
  if (mode === "dafei") return <DrivingHelp touch={touchLayout} />;
  if (mode === "escape") return <EscapeHelp touch={touchLayout} />;
  const camera = touchLayout
    ? "点“相机”举机，按住对焦按钮确认焦点，再点快门。拖动取景画面观察，用滑杆变焦。"
    : "C 举机，按住 F 对焦，空格拍摄。移动鼠标观察，滚轮变焦；Tab 释放鼠标操作参数，点击画面恢复观察。";
  if (mode === "story")
    return (
      <div className="help-columns">
        <div>
          <h3>跟上同伴</h3>
          <p>
            你扮演许原，和林岑、周序把今天拍成一部片子。
            {touchLayout
              ? "左侧摇杆行走，右侧拖动观察，点“快走”加快步速。"
              : "WASD 行走，移动鼠标观察，按住 Shift 快走。"}
            到达地点后等同伴就位，会自然继续对白。
          </p>
          <p>
            对白点一次补全，再点下一句。拍完收起相机，继续与同伴交流。找不到路时，打开“提示”查看前进方向。
          </p>
          <h3>一起开始</h3>
          <p>
            看同伴的三个手势。第三个标记亮起后，
            {touchLayout ? "点“一起开始”" : "按 E"}
            ；错过可以等下一轮。两轮之后可以选择同步协助。
          </p>
        </div>
        <div>
          <h3>拍下这一张</h3>
          <p>{camera}简易模式没有主动对焦时，会自动对焦后拍摄。</p>
          <p>
            取景器会显示当前拍摄目标。照片没完成任务时，按提示调整构图；保存结果以“已保存”或“未保存”为准。
          </p>
          <h3>选片与保存</h3>
          <p>
            最后选择三至六张照片一起放映。还可以寻找五处“遇见现实”，从自己的照片走进校园实拍。
          </p>
          <p>
            进度和照片保存在本机。换设备或清除数据前分别导出，进度文件不包含照片。相册最多五十张；删除之前可以先导出想保留的照片。
          </p>
        </div>
      </div>
    );
  return (
    <div className="help-columns">
      <div>
        <h3>自由走一走</h3>
        <p>这里没有追逐和倒计时。道路、庭院和南楼一至四层可以探索。</p>
        <p>
          {touchLayout
            ? "左侧摇杆移动，右侧空白处拖动观察；跳跃、蹲伏和跑操使用对应按钮。"
            : "WASD 移动，鼠标观察，空格跳跃，Ctrl 蹲伏，Shift 跑操，Esc 暂停。"}
          跑操加速最多十二秒，音乐接续六十秒。
        </p>
      </div>
      <div>
        <h3>留下校园照片</h3>
        <p>{camera}</p>
        <p>
          简易拍照可以直接使用，也可在参数面板尝试专业摄影。打开实拍机位提示后，寻找蓝色标记，在相近构图中发现真实校园影像。
        </p>
      </div>
    </div>
  );
}
export default function App() {
  const operational = useGameOperations();
  const localRoundAccepted = useRef(false);
  const [modeBlocked, setModeBlocked] = useState<string|null>(null);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const guardEntry = (entry: ModeEntry) => {
    try { gameOperations.assert(entry); return true; }
    catch (e) { setModeBlocked(e instanceof Error ? e.message : '该玩法暂时不可用，请稍后再试。'); return false; }
  };
  const host = useRef<HTMLDivElement>(null),
    game = useRef<GameAPI | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL),
    [settings, setSettings] = useState<Settings>(loadSettings),
    [touchEditor, setTouchEditor] = useState(false),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false),
    [uiError, setUiError] = useState("");
  useEffect(()=>{document.documentElement.dataset.motion=settings.reducedMotion?"reduced":"system";},[settings.reducedMotion]);
  const [primary, setPrimary] = useState<PrimaryWeapon>(loadPrimary),
    [selectedMode, setSelectedMode] = useState<Mode>(() => {
      const m = new URLSearchParams(location.search).get("mode");
      return ["roam", "escape", "dafei"].includes(m ?? "")
        ? (m as Mode)
        : "story";
    });
  const [menuScreen, setMenuScreen] = useState<"home" | "modes" | "prepare">(
      () =>
        new URLSearchParams(location.search).has("mode") ? "prepare" : "home",
    ),
    [escapeEntry, setEscapeEntry] = useState<EscapeEntry>("single"),
    [pvpVariant, setPvpVariant] = useState<"tdm" | "ffa">("tdm");
  const [accountBusy,setAccountBusy] = useState(false);
  const pages = useMenuPages(new URLSearchParams(location.search).get("panel")==="leaderboard"?"ranking":null,accountBusy);
  const [requestedRankPanel,setRequestedRankPanel] = useState<"board"|"recent">("board");
  const [leaveConfirmation,setLeaveConfirmation] = useState(false);
  const [leaveDestination,setLeaveDestination] = useState<'main'|'lobby'>('main');
  const [replayGuidanceOnContinue,setReplayGuidanceOnContinue]=useState(false);
  const openMenuPage = (page:MenuPageId) => {
    if(accountBusy)return;
    game.current?.clearInput?.();
    if(snapshot.phase === "playing")game.current?.pause();
    pages.open(page);
  };
  const closeMenuPage = (page:MenuPageId) => {if(pages.active === page)pages.back();};
  const showSettings = pages.active === "settings", showHelp = pages.active === "help", feedbackOpen = pages.active === "feedback";
  const menuReading = pages.active && ["faq","updates","about","credits"].includes(pages.active) ? pages.active as "faq"|"updates"|"about"|"credits" : null;
  const rankingPanel = pages.active === "account" ? "identity" : pages.active === "ranking" ? requestedRankPanel : null;
  const setShowSettings = (open:boolean) => open ? openMenuPage("settings") : closeMenuPage("settings");
  const setShowHelp = (open:boolean) => open ? openMenuPage("help") : closeMenuPage("help");
  const setFeedbackOpen = (open:boolean) => open ? openMenuPage("feedback") : closeMenuPage("feedback");
  const setMenuReading = (page:"faq"|"updates"|"about"|"credits"|null) => page ? openMenuPage(page) : menuReading && pages.back();
  const setRankingPanel = (panel:"board"|"identity"|"recent"|null) => {
    if(!panel){if(pages.active === "ranking" || pages.active === "account")pages.back();return;}
    if(panel === "identity")openMenuPage("account");
    else {setRequestedRankPanel(panel);openMenuPage("ranking");}
  };
  const onlineClient = useRef<OnlineClient>(null);
  if (!onlineClient.current) onlineClient.current = new OnlineClient();
  const [onlineView, setOnlineView] = useState<LobbyView>(
      onlineClient.current.view,
    ),
    [onlineOpen, setOnlineOpen] = useState(
      () => new URLSearchParams(location.search).get("panel") === "online",
    ),
    [onlineRoomKey, setOnlineRoomKey] = useState<string | null>(null);
  useEffect(() => {
    const client = onlineClient.current!;
    const off = client.subscribeMenu(() => {
      setOnlineView({ ...client.view });
      if (client.view.status === "error") {
        setOnlineRoomKey(null);
        setOnlineOpen(true);
      } else if (client.view.currentRoom) {
        const room = client.view.currentRoom;
        const available = gameOperations.available(entryFor('escape', room.mode==='coop'?'coop':'pvp', room.variant==='ffa'?'ffa':'tdm'));
        setOnlineRoomKey(room.phase==='lobby' && !available ? null : room.roomId);
      }
      if (client.view.currentRoom?.phase === "playing") setOnlineOpen(false);
    });
    return off;
  }, []);
  useEffect(() => {
    const room = onlineClient.current?.view.currentRoom;
    if (!room || room.phase !== 'lobby') return;
    const available = gameOperations.available(entryFor('escape', room.mode==='coop'?'coop':'pvp', room.variant==='ffa'?'ffa':'tdm'));
    setOnlineRoomKey(available ? room.roomId : null);
  }, [operational.config.revision]);
  const [briefing, setBriefing] = useState<{
    mode: CombatBriefingMode;
    next: () => void;
    readOnly?: boolean;
  } | null>(null);
  const withBriefing = (mode: CombatBriefingMode, next: () => void) => {
    if (hasSeenCombatBriefing(mode)) next();
    else setBriefing({ mode, next });
  };
  const openOnline = () => {
    if(rankingClient.getPlayer()?.accountStatus!=="active"){openRanking("identity");return;}
    if (!guardEntry(entryFor('escape', escapeEntry, pvpVariant))) return;
    game.current?.pause();
    setOnlineOpen(true);
    onlineClient.current!.playerId = rankingClient.getPlayer()?.id || null;
    void onlineClient.current!.refresh();
  };
  const onlineAction = (a: OnlineUIAction) => {
    const client = onlineClient.current!;
    switch (a.type) {
      case "refresh":
        void client.refresh();
        break;
      case "retry":
      case "reconnect":
        if (client.hasResumeSession()) void client.reconnect();
        else void client.refresh();
        break;
      case "create":
        if (!guardEntry(entryFor('escape', a.options.mode==='coop'?'coop':'pvp', a.options.variant==='ffa'?'ffa':'tdm'))) break;
        void client.join(a.options);
        break;
      case "join":
        void client.join(undefined, a.roomId);
        break;
      case "joinCode":
        void client.join(undefined, undefined, a.code);
        break;
      case "loadout":
        client.send("loadout", {
          weapon: a.weapon,
          avatar: a.avatar,
          team: a.team,
        });
        break;
      case "ready": {
        if (a.value && client.view.currentRoom && !guardEntry(entryFor('escape',client.view.currentRoom.mode==='coop'?'coop':'pvp',client.view.currentRoom.variant==='ffa'?'ffa':'tdm'))) break;
        const roomId = client.view.currentRoom?.roomId;
        const send = () => {
          if (!roomId || client.view.currentRoom?.roomId !== roomId) return;
          game.current?.unlockAudio();
          client.send("ready", { ready: a.value });
        };
        if (a.value)
          withBriefing(
            onlineView.currentRoom
              ? onlineView.currentRoom.mode === "coop"
                ? "coop"
                : (onlineView.currentRoom.variant ?? pvpVariant)
              : escapeEntry === "coop"
                ? "coop"
                : pvpVariant,
            send,
          );
        else send();
        break;
      }
      case "consent":
        client.send("consent", { consent: a.value });
        break;
      case "start":
        if (client.view.currentRoom && !guardEntry(entryFor('escape',client.view.currentRoom.mode==='coop'?'coop':'pvp',client.view.currentRoom.variant==='ffa'?'ffa':'tdm'))) break;
        client.send("start", {});
        break;
      case "spectateNext":
        game.current?.onlineSpectateNext?.();
        break;
      case "dropTask":
        game.current?.onlineDropTask?.();
        break;
      case "map":
        game.current?.taskMap?.(true);
        break;
      case "pauseVote":
        client.send("pause", { agree: a.agree });
        break;
      case "resume":
        client.send("resume", {});
        break;
      case "leave":
        void client.leave();
        setOnlineRoomKey(null);
        setOnlineOpen(true);
        setAttempt((n) => n + 1);
        break;
      case "preset":
        client.send("preset", { id: a.id });
        resume();
        break;
      case "ping":
        if (a.position) client.send("ping", { position: a.position });
        else game.current?.onlinePing?.();
        break;
    }
  };
  const openFeedback = () => {
    game.current?.clearInput?.();
    game.current?.pause();
    setFeedbackOpen(true);
  };
  const [playerAlbumOpen, setPlayerAlbumOpen] = useState(false),
    [archiveOpen, setArchiveOpen] = useState(false),
    [savedStory, setSavedStory] = useState(false);
  const [photoPanelOpen, setPhotoPanelOpen] = useState(false),
    [photoAlbumOpen, setPhotoAlbumOpen] = useState(false);
  const [rankingPlayer, setRankingPlayer] = useState<RankingPlayer | null>(() =>
      rankingClient.getPlayer(),
    );
  useEffect(
    () =>
      rankingClient.subscribe(() => {
        const player = rankingClient.getPlayer();
        setRankingPlayer(player);
        const client = onlineClient.current;
        if (client?.room && client.playerId !== player?.id) {
          void client.leave();
          setOnlineRoomKey(null);
          setOnlineOpen(true);
        }
      }),
    [],
  );
  useEffect(() => {
    void onlineClient.current?.reconnect();
  }, []);
  const openRanking = (panel: "board" | "identity" | "recent" = "board") => {
    game.current?.clearInput?.();
    if (snapshot.phase === "playing") game.current?.pause();
    setRankingPanel(panel);
  };
  useEffect(() => {
    let alive = true;
    const token = operations.current.revision;
    void import("./story/storage")
      .then(async (m) => {
        const store = new m.StorySaveStore();
        try {
          const cp = await store.load();
          if (alive && operations.current.revision === token)
            setSavedStory(!!cp);
        } catch {
        } finally {
          await store.close();
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const historyOverlay = useCallback(
    (open: boolean) => game.current?.storyOverlay("history", open),
    [],
  );
  const realityOverlay = useCallback(
    (open: boolean) => game.current?.storyOverlay("reality", open),
    [],
  );
  const operations = useRef(new SessionOperations<GameAPI>());
  const moduleFailures = useRef(new Set<string>());
  const moduleBlocked = (id: string, blocked: boolean) => {
    if (blocked) moduleFailures.current.add(id);
    else moduleFailures.current.delete(id);
    game.current?.storyOverlay("ui-module", moduleFailures.current.size > 0);
  };
  const usableViewport = useUsableViewport();
  const [systemTouch, setSystemTouch] = useState(primaryTouchInput);
  const importInput = useRef<HTMLInputElement>(null),
    importSession = useRef<{
      api: GameAPI;
      token: number;
    } | null>(null),
    errorRetry = useRef<(() => void) | null>(null);
  const portrait = touchLayoutPortrait(
    usableViewport.width,
    usableViewport.height,
  );
  const fullscreenSupported =
    typeof document.documentElement.requestFullscreen === "function";
  const touchLayout = resolveTouchControls(settings.controls, systemTouch);
  useEffect(() => {
    const query = matchMedia("(pointer: coarse)");
    const change = () => setSystemTouch(primaryTouchInput());
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("touch-layout", touchLayout);
    document.documentElement.dataset.touchControls = String(touchLayout);
    return () => {
      document.documentElement.classList.remove("touch-layout");
      delete document.documentElement.dataset.touchControls;
    };
  }, [touchLayout]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [apiRevision, setApiRevision] = useState(0),
    [prepRevision, setPrepRevision] = useState(0),
    [preparation, setPreparation] = useState({
      state: "idle" as "idle" | "loading" | "ready" | "error",
      progress: 0,
      message: "",
    });
  useEffect(() => {
    const api = game.current;
    api?.storyOverlay("photo-album", playerAlbumOpen);
    return () => api?.storyOverlay("photo-album", false);
  }, [playerAlbumOpen, apiRevision]);
  useEffect(() => {
    const api = game.current;
    api?.storyOverlay("archive", archiveOpen);
    return () => api?.storyOverlay("archive", false);
  }, [archiveOpen, apiRevision]);
  useEffect(() => {
    game.current?.storyOverlay("ui-module", moduleFailures.current.size > 0);
  }, [apiRevision]);
  useEffect(() => {
    const api=game.current;
    api?.storyOverlay('operations',noticesOpen || !!modeBlocked);
    return ()=>api?.storyOverlay('operations',false);
  }, [noticesOpen, modeBlocked, apiRevision]);
  const saveData = !!(
    navigator as Navigator & {
      connection?: {
        saveData?: boolean;
      };
    }
  ).connection?.saveData;
  const [prepareRequested, setPrepareRequested] = useState(false);
  const selectedEntry = entryFor(selectedMode, escapeEntry, pvpVariant);
  const selectedAvailable = operational.config.modes[selectedEntry].enabled;
  const localWanted =
    !onlineRoomKey &&
    menuScreen === "prepare" &&
    !(selectedMode === "escape" && escapeEntry !== "single") &&
    (localRoundAccepted.current || operational.ready && selectedAvailable) &&
    (!saveData || prepareRequested);
  useEffect(() => {
    if (!operational.ready || selectedAvailable || localRoundAccepted.current || onlineRoomKey || menuScreen !== 'prepare') return;
    game.current?.cancelModePreparation?.();
    setPreparation({state:'idle',progress:0,message:''});
    setModeBlocked(operational.config.modes[selectedEntry].reason || '该玩法暂时不可用，请稍后再试。');
  }, [operational.ready, selectedAvailable, selectedEntry, onlineRoomKey, menuScreen]);
  const onlineLease = useRef(new ResourceSlot()),
    roomRef = useRef(onlineRoomKey);
  roomRef.current = onlineRoomKey;
  useEffect(() => {
    const scope = new SessionScope();
    const mount = host.current;
    let api: GameAPI | undefined;
    operations.current.cancel();
    setBusy(false);
    if (!onlineRoomKey && !localWanted) {
      setSnapshot({ ...INITIAL });
      return () => scope.close();
    }
    if (!mount) return () => scope.close();
    setSnapshot({ ...INITIAL, phase: "loading", message: "正在准备画面" });
    const publish = (s: Snapshot) => {
      if (scope.active) {
        if (!onlineRoomKey && ['playing','paused','won','lost'].includes(s.phase)) localRoundAccepted.current = true;
        setSnapshot({ ...s });
      }
    };
    const work = onlineRoomKey
      ? import("./multiplayer/online-game").then((m) => {
          scope.signal.throwIfAborted();
          return m.createOnlineGame(
            mount,
            publish,
            settingsRef.current,
            onlineClient.current!,
            () => {
              if (!scope.active) return;
              setOnlineRoomKey(null);
              setOnlineOpen(true);
              setAttempt((n) => n + 1);
            },
            scope.signal,
          );
        })
      : import("./engine").then((m) => {
          scope.signal.throwIfAborted();
          return m.createGame(mount, publish, settingsRef.current);
        });
    void work
      .then((result) => {
        scope.own(() => {
          result.clearInput?.();
          result.dispose();
          if (game.current === result) game.current = null;
        });
        if (!scope.active) return;
        api = result;
        game.current = result;
        if (onlineRoomKey) onlineLease.current.clear();
        setApiRevision((n) => n + 1);
      })
      .catch((e) => {
        if (!scope.active) return;
        console.warn("Campus initialization failed", e);
        setSnapshot((s) => ({
          ...s,
          phase: "error",
          message: "校园暂时未能载入，请重试。",
        }));
      });
    return () => {
      operations.current.cancel();
      scope.close();
      if (game.current === api) game.current = null;
    };
  }, [attempt, onlineRoomKey, localWanted]);
  useEffect(() => {
    if (
      onlineRoomKey ||
      operations.current.busy ||
      !["menu", "loading", "error"].includes(snapshot.phase)
    )
      return;
    if (menuScreen !== "prepare" || !operational.ready || !selectedAvailable || (saveData && !prepareRequested)) {
      setPreparation({ state: "idle", progress: 0, message: "" });
      onlineLease.current.clear();
      return;
    }
    const abort = new AbortController();
    let releasePreparation: (() => void) | undefined;
    setPreparation({ state: "loading", progress: 0, message: "正在准备资源" });
    const onProgress = (progress: number, message: string) => {
      if (!abort.signal.aborted)
        setPreparation({
          state: "loading",
          progress: Math.min(99, Math.round(progress * 100)),
          message,
        });
    };
    const onlinePrep = selectedMode === "escape" && escapeEntry !== "single";
    if (!onlinePrep) game.current?.setSettings(settingsRef.current);
    const work = onlinePrep
      ? import("./multiplayer/online-resources").then(async (m) => {
          if (abort.signal.aborted)
            throw new DOMException("Cancelled", "AbortError");
          const release = await m.prepareOnlineResources(
            escapeEntry === "coop" ? "coop" : "pvp",
            touchLayout,
            { signal: abort.signal, onProgress },
          );
          if (abort.signal.aborted) {
            release();
            throw new DOMException("Cancelled", "AbortError");
          }
          releasePreparation = onlineLease.current.replace(release);
        })
      : game.current?.prepareMode?.(
          selectedMode,
          selectedMode === "escape"
            ? {
                primary,
                difficulty: settingsRef.current.escapeDifficulty ?? "standard",
              }
            : undefined,
          { signal: abort.signal, onProgress },
        );
    if (!work) return () => abort.abort();
    void work
      .then(() => {
        if (!abort.signal.aborted)
          setPreparation({
            state: "ready",
            progress: 100,
            message: "准备就绪",
          });
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          console.warn("Mode preparation failed", e);
          setPreparation({
            state: "error",
            progress: 0,
            message: "资源暂时未能准备好，请重试。",
          });
        }
      });
    return () => {
      abort.abort();
      if (!roomRef.current) releasePreparation?.();
    };
  }, [
    menuScreen,
    selectedMode,
    escapeEntry,
    primary,
    settings.quality,
    settings.escapeDifficulty,
    touchLayout,
    saveData,
    prepareRequested,
    apiRevision,
    prepRevision,
    onlineRoomKey,
    operational.ready,
    selectedAvailable,
    pvpVariant,
  ]);
  useEffect(
    () => () => {
      onlineLease.current.clear();
    },
    [],
  );
  useEffect(() => {
    game.current?.setSettings(settings);
    try {
      localStorage.setItem("qisheng-game-settings", JSON.stringify(settings));
    } catch {}
  }, [settings]);
  useEffect(() => {
    try {
      localStorage.setItem("qisheng-game-primary", primary);
    } catch {}
  }, [primary]);
  useEffect(() => {
    if (
      touchLayout &&
      portrait &&
      snapshot.phase === "playing" &&
      !snapshot.escape?.mapOpen
    ) {
      game.current?.clearInput?.();
      game.current?.pause();
    }
  }, [snapshot.phase, snapshot.escape?.mapOpen, touchLayout, portrait]);
  const runOperation = async (
    work: (api: GameAPI, current: () => boolean) => Promise<unknown> | void,
    failure: { label: string; message: string; retry?: () => void },
  ) => {
    const api = game.current;
    if (!api) return;
    const ticket = operations.current.begin(api);
    if (!ticket) return;
    setBusy(true);
    setUiError("");
    errorRetry.current = null;
    const current = () => operations.current.current(ticket, game.current);
    try {
      // Invoke in the original gesture, before any await: audio and pointer lock need it.
      await work(api, current);
    } catch (error) {
      if (current()) {
        if (error instanceof ModeUnavailableError || (error as {code?:string})?.code === 'MODE_DISABLED') {
          setModeBlocked(error instanceof Error ? error.message : '该玩法暂时不可用，请稍后再试。');
          return;
        }
        console.warn(failure.label, error);
        errorRetry.current = failure.retry ?? null;
        setUiError(failure.message);
      }
    } finally {
      if (operations.current.finish(ticket, game.current)) setBusy(false);
    }
  };
  const start = (mode: Mode) => {
    if (!guardEntry(entryFor(mode))) return;
    localRoundAccepted.current = false;
    void runOperation(
      (api) => {
        setShowHelp(false);
        setArchiveOpen(false);
        setPlayerAlbumOpen(false);
        setRankingPanel(null);
        return api.start(
          mode,
          mode === "escape"
            ? {
                primary,
                difficulty: settingsRef.current.escapeDifficulty ?? "standard",
              }
            : undefined,
        );
      },
      {
        label: "Round start failed",
        message: "这一局暂时无法开始，请重试。",
        retry: () => start(mode),
      },
    );
  };
  const prepareIntro = () => {
    if (!guardEntry('dafei')) return;
    void runOperation(
      (api) => {
        setShowHelp(false);
        return api.prepareDafeiIntro();
      },
      {
        label: "Driving intro failed",
        message: "汽车暂时未能准备好，请重试。",
        retry: prepareIntro,
      },
    );
  };
  const chooseStart = () => {
    if (!game.current || operations.current.busy || snapshot.phase !== "menu")
      return;
    if (selectedMode === "dafei") prepareIntro();
    else if (selectedMode === "escape")
      withBriefing("solo", () => start("escape"));
    else start(selectedMode);
  };
  const resume = () => {
    void runOperation((api) => {if(replayGuidanceOnContinue){api.storyGuidance("replay");setReplayGuidanceOnContinue(false);}return api.resume();}, {
      label: "Game resume failed",
      message: "尚未恢复游戏，请再次点击继续；键鼠操作需允许鼠标观察。",
    });
  };
  const openSettings = () => {
    setUiError("");
    setShowSettings(true);
  };
  const changeSettings = (next: Settings) => {
    const canChange = snapshot.phase === "menu" || snapshot.phase === "paused";
    const transmission = canChange
      ? next.transmission === "manual"
        ? "manual"
        : "auto"
      : (settingsRef.current.transmission ?? "auto");
    const updated = { ...next, transmission };
    if (updated.controls !== settingsRef.current.controls)
      game.current?.clearInput?.();
    if (canChange) game.current?.setTransmission(transmission);
    game.current?.setSettings(updated);
    setSettings(updated);
  };
  const changeTransmission = (transmission: TransmissionMode) =>
    changeSettings({ ...settingsRef.current, transmission });
  const closeTaskMap = useCallback(() => {
    const api = game.current;
    if (!api) return;
    const token = operations.current.revision;
    void Promise.resolve(api.taskMap?.(false)).catch((e) => {
      console.warn("Task map resume failed", e);
      if (operations.current.revision === token && game.current === api)
        setUiError("地图暂时未能关闭，请点击返回游戏重试。");
    });
  }, []);
  const retryEscape = () => {
    if (!guardEntry('escape-solo')) return;
    localRoundAccepted.current = false;
    if (!game.current?.retryRound) {
      start("escape");
      return;
    }
    void runOperation((api) => api.retryRound!(), {
      label: "Round retry failed",
      message: "这一局暂时未能重新开始，请重试。",
      retry: retryEscape,
    });
  };
  const finishReturnMenu = () => {
    const leavingOnline = !!onlineRoomKey || !!onlineClient.current?.view.currentRoom;
    pages.clear();
    setLeaveConfirmation(false);
    if(onlineClient.current?.view.currentRoom||onlineOpen||['connecting','queued','reconnecting'].includes(onlineClient.current?.view.status??'')){void onlineClient.current?.leave();setOnlineRoomKey(null);setOnlineOpen(false);}
    localRoundAccepted.current = false;
    setNoticesOpen(false);
    setModeBlocked(null);
    setBriefing(null);
    setConnectionDetails(false);
    setMenuScreen("home");
    setReplayGuidanceOnContinue(false);
    setMenuReading(null);
    setFeedbackOpen(false);
    setArchiveOpen(false);
    setPlayerAlbumOpen(false);
    setRankingPanel(null);
    if (snapshot.mode === "story") setSavedStory(true);
    operations.current.cancel();
    setBusy(false);
    errorRetry.current = null;
    setUiError("");
    setShowHelp(false);
    setTouchEditor(false);
    setShowSettings(false);
    if (!leavingOnline) game.current?.menu();
  };
  const returnMenu = () => {
    setLeaveDestination('main');
    if(["playing","paused","intro"].includes(snapshot.phase) || onlineClient.current?.view.currentRoom){
      game.current?.clearInput?.();game.current?.pause();setLeaveConfirmation(true);return;
    }
    finishReturnMenu();
  };
  const returnLobby = () => {
    game.current?.clearInput?.();game.current?.pause();
    setLeaveDestination('lobby');setLeaveConfirmation(true);
  };
  const finishReturnLobby = () => {
    finishReturnMenu();
    setSelectedMode('escape');setMenuScreen('prepare');
    setOnlineOpen(true);setAttempt(n=>n+1);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement
        .requestFullscreen?.()
        .catch(() => setUiError("此浏览器不支持全屏，可继续正常游玩。"));
    }
  };
  const exportStory = () => {
    const cp = game.current?.storyCheckpoint();
    if (!cp) return;
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(cp, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "明天照常见-故事进度.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const importStory = (file: File, keepPaused = false) =>
    guardEntry('story') && runOperation(
      async (api, current) => {
        api.unlockAudio("story");
        if (file.size > 1048576) throw Error("存档文件过大");
        const text = await file.text();
        if (!current()) return;
        await api.restoreStory(JSON.parse(text));
        if (current() && keepPaused) api.pause();
      },
      {
        label: "Story import failed",
        message: "这份进度无法导入，请选择游戏导出的进度文件。",
        retry: chooseImport,
      },
    );
  const continueStory = (previous = false, keepPaused = false) =>
    guardEntry('story') && runOperation(
      async (api, current) => {
        api.unlockAudio("story");
        const m = await import("./story/storage");
        if (!current()) return;
        const store = new m.StorySaveStore();
        try {
          const cp = await store.load(previous);
          if (!current()) return;
          if (!cp) throw Error("没有可恢复的存档");
          await api.restoreStory(cp);
          if(current()&&keepPaused)api.pause();
        } finally {
          await store.close();
        }
      },
      {
        label: "Story restore failed",
        message: "故事进度暂时无法读取，请重试。",
        retry: () => void continueStory(previous,keepPaused),
      },
    );
  const chooseImport = () => {
    if (!guardEntry('story')) return;
    const api = game.current;
    if (!api || operations.current.busy) return;
    importSession.current = { api, token: operations.current.revision };
    api.pause();
    importInput.current?.click();
  };
  useEffect(() => {
    const tracker = gameTelemetry();
    tracker.begin();
    const onError = () => tracker.fault("JAVASCRIPT_RUNTIME"),
      onRejection = () => tracker.fault("ASYNC_RUNTIME");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  useEffect(() => {
    const tracker = gameTelemetry(),
      page = feedbackOpen
        ? "feedback"
        : rankingPanel
          ? "rankings"
          : showSettings
            ? "settings"
            : showHelp
              ? "help"
              : playerAlbumOpen || photoAlbumOpen
                ? "album"
                : snapshot.phase === "menu" || snapshot.phase === "loading"
                  ? "menu"
                  : "playing";
    tracker.visit(page);
    if (snapshot.phase === "playing")
      tracker.start(
        snapshot.online?.mode ?? snapshot.mode,
        snapshot.online?.roomId ?? snapshot.mode + ":" + attempt,
      );
    if (
      snapshot.phase === "menu" ||
      snapshot.phase === "won" ||
      snapshot.phase === "lost"
    )
      tracker.end();
    if (snapshot.phase === "error") tracker.fault("CAMPUS_LOAD");
  }, [
    feedbackOpen,
    rankingPanel,
    showSettings,
    showHelp,
    playerAlbumOpen,
    photoAlbumOpen,
    snapshot.phase,
    snapshot.mode,
    snapshot.online?.mode,
    snapshot.online?.roomId,
    attempt,
  ]);
  const [upgradePrompt,setUpgradePrompt]=useState(false);
  const upgradeShown=useRef(false);
  const deferUpgrade=()=>{rankingClient.deferUpgrade();setUpgradePrompt(false);};
  const online = !!onlineRoomKey,
    playing = snapshot.phase === "playing",
    isMenu =
      !online &&
      (snapshot.phase === "menu" ||
        snapshot.phase === "loading" ||
        snapshot.phase === "error"),
    result = snapshot.phase === "won" || snapshot.phase === "lost",
    driving = snapshot.mode === "dafei",
    storyMode = snapshot.mode === "story",
    photoOpen = !!snapshot.photo?.open;
  useEffect(()=>{if(!isMenu)return;let active=true;void rankingClient.me().then(player=>{if(active&&player?.accountStatus==="legacy"&&!upgradeShown.current&&!rankingClient.isUpgradeDeferred()){upgradeShown.current=true;setUpgradePrompt(true);}}).catch(()=>{});return()=>{active=false;};},[isMenu]);
  const [connectionDetails, setConnectionDetails] = useState(false);
  const onlineReadingOpen =
    !!pages.active ||
    noticesOpen || !!modeBlocked ||
    !!briefing ||
    showSettings ||
    showHelp ||
    touchEditor ||
    !!rankingPanel ||
    feedbackOpen ||
    connectionDetails;
  useEffect(() => {
    setGameMapDownloadContext({
      onlineBattle: onlineView.currentRoom?.phase === "playing",
      menu: isMenu && !onlineRoomKey,
    });
    return () =>
      setGameMapDownloadContext({ onlineBattle: false, menu: false });
  }, [onlineView.currentRoom?.phase, isMenu, onlineRoomKey]);
  const onlineTransportReady =
    onlineView.status === "playing" || onlineView.status === "lobby";
  useEffect(() => {
    setConnectionDetails(false);
  }, [onlineRoomKey, onlineTransportReady]);
  const helpMode = isMenu ? selectedMode : snapshot.mode;

  const [assistantReturnScreen,setAssistantReturnScreen]=useState<'home'|'modes'|'prepare'|null>(null);
  const assistantScope=useRef({key:'',token:crypto.randomUUID()});
  const assistantInBattle=['playing','paused','won','lost'].includes(snapshot.phase)||!!(onlineView.currentRoom&&onlineView.currentRoom.phase!=='lobby');
  const assistantKey=(rankingPlayer?.id??'guest')+':'+(pages.active==='assistant')+':'+assistantInBattle;
  if(assistantScope.current.key!==assistantKey)assistantScope.current={key:assistantKey,token:crypto.randomUUID()};
  const assistantContext:AssistantMenuContext={token:assistantScope.current.token,inBattle:assistantInBattle,page:'assistant'};
  const assistantAdmission=useRef<symbol|null>(null);
  const assistantAction=async(action:AssistantMenuAction,signal:AbortSignal):Promise<string>=>{
    if(signal.aborted||assistantInBattle||pages.active!=='assistant'||accountBusy)throw Error('当前页面不适合代办，请返回菜单后重试。');
    const contextToken=assistantScope.current.token,identity=rankingClient.getPlayer()?.id;
    const valid=()=>{if(signal.aborted||assistantScope.current.token!==contextToken||rankingClient.getPlayer()?.id!==identity)throw Error('操作已取消，请重新提出需求。');};
    const later=(next:()=>void)=>setTimeout(()=>{if(!signal.aborted&&assistantScope.current.token===contextToken&&rankingClient.getPlayer()?.id===identity)next();},0);
    const difficulty=(value:'easy'|'normal'|'hard')=>value==='normal'?'standard' as const:value;
    valid();
    switch(action.type){
      case'navigate':
        later(()=>{if(action.page==='home'||action.page==='modes'){if(onlineClient.current?.view.currentRoom){returnMenu();return;}setAssistantReturnScreen(action.page==='home'?'home':'modes');pages.clear();setOnlineOpen(false);}else openMenuPage(action.page==='help'?'faq':action.page);});
        return onlineClient.current?.view.currentRoom?'请确认是否离开房间。':'已打开对应菜单。';
      case'select_mode':{
        if(onlineClient.current?.view.currentRoom)throw Error('请先离开房间，再选择其他玩法。');
        const mode=action.mode==='drive'?'dafei':action.mode;
        if(!guardEntry(entryFor(mode,mode==='escape'?'single':undefined)))throw Error('该玩法暂时不可用。');
        setSelectedMode(mode);setEscapeEntry('single');setMenuScreen('prepare');setAssistantReturnScreen('prepare');return '玩法已选好。';
      }
      case'select_difficulty':if(onlineClient.current?.view.currentRoom)throw Error('房间难度已经确定，请在创建房间时选择。');changeSettings({...settingsRef.current,escapeDifficulty:difficulty(action.difficulty)});return '难度已选好。';
      case'select_weapon':{
        const client=onlineClient.current!,room=client.view.currentRoom;
        if(room){const me=room.players.find(p=>p.id===client.playerId);if(!me)throw Error('房间状态已变化，请重试。');client.send('loadout',{weapon:action.weapon,avatar:me.avatar,team:me.team});return '已提交房间装备选择。';}
        setPrimary(action.weapon);return '主武器已选好。';
      }
      case'setting':{
        const next={...settingsRef.current};
        if(action.setting==='music')next.music=Number(action.value);
        else if(action.setting==='quality')next.quality=action.value as Settings['quality'];
        else next.reducedMotion=Boolean(action.value);
        changeSettings(next);return '设置已生效。';
      }
      case'create_room':case'join_room':{
        if(!identity||rankingClient.getPlayer()?.accountStatus!=='active')throw Error('请先在账号页登录，再加入联机。');
        const client=onlineClient.current!;if(client.view.currentRoom||client.hasResumeSession())throw Error('请先返回原房间或明确离开，再进行此操作。');
        if(action.type==='create_room'&&!guardEntry(entryFor('escape',action.mode==='coop'?'coop':'pvp',action.mode==='ffa'?'ffa':'tdm')))throw Error('该玩法暂时不可用。');
        const token=Symbol('assistant-admission');assistantAdmission.current=token;
        const cancel=()=>{if(assistantAdmission.current===token){assistantAdmission.current=null;void client.leave();}};
        signal.addEventListener('abort',cancel,{once:true});
        try{
          client.playerId=identity;
          if(action.type==='create_room')await client.join({mode:action.mode==='coop'?'coop':'pvp',variant:action.mode==='ffa'?'ffa':'tdm',difficulty:difficulty(action.difficulty),private:action.private,maxPlayers:action.maxPlayers});
          else await client.join(undefined,undefined,action.code);
          valid();const joinedRoom=(client.view as LobbyView).currentRoom;if(!joinedRoom)throw Error(client.view.error||'暂时未能加入房间，请重试。');
          setSelectedMode('escape');setEscapeEntry(joinedRoom.mode==='coop'?'coop':'pvp');setPvpVariant(joinedRoom.variant);setMenuScreen('prepare');
          later(()=>{pages.clear();setOnlineOpen(true);});return '已进入房间，请亲自选择准备并开始。';
        }catch(error){if(assistantAdmission.current===token){assistantAdmission.current=null;await client.leave();}throw error;}finally{signal.removeEventListener('abort',cancel);if(assistantAdmission.current===token)assistantAdmission.current=null;}
      }
    }
  };

  const previousMenuPage=useRef(pages.active);
  useEffect(()=>{
    if(previousMenuPage.current&&!pages.active){
      if(onlineView.currentRoom?.phase==='lobby')setOnlineOpen(true);
      else if(isMenu&&!onlineView.currentRoom){const destination=previousMenuPage.current==='assistant'?assistantReturnScreen:null;if(destination!=='prepare'){game.current?.cancelModePreparation?.();setPrepareRequested(false);}setOnlineOpen(false);setMenuScreen(destination??'home');setAssistantReturnScreen(null);}
    }
    previousMenuPage.current=pages.active;
  },[pages.active,isMenu,onlineView.currentRoom?.phase,assistantReturnScreen]);
  const menuRootLabel=onlineView.currentRoom?.phase==='lobby'?'返回房间':pages.active==='assistant'&&assistantReturnScreen==='prepare'?'查看战前准备':isMenu?'返回主菜单':'返回对局菜单';
  const { unread: feedbackUnread } = useFeedbackUnread(isMenu || feedbackOpen);
  const announcementEntry = isMenu && menuScreen !== 'prepare' ? undefined : onlineView.currentRoom ? entryFor('escape', onlineView.currentRoom.mode==='coop'?'coop':'pvp', onlineView.currentRoom.variant==='ffa'?'ffa':'tdm') : isMenu ? selectedEntry : entryFor(snapshot.mode);
  const announcements = useAnnouncements(announcementEntry, operational.config.revision, playing);
  const openNotices = () => { if (playing) game.current?.pause(); setNoticesOpen(true); };
  const availability = operational.config.modes;
  const menuUnavailable = {story:!availability.story.enabled,roam:!availability.roam.enabled,dafei:!availability.dafei.enabled,single:!availability['escape-solo'].enabled,coop:!availability['escape-coop'].enabled,tdm:!availability['escape-tdm'].enabled,ffa:!availability['escape-ffa'].enabled,escape:['escape-solo','escape-coop','escape-tdm','escape-ffa'].every(id=>!availability[id as ModeEntry].enabled)};
  const guidance = snapshot.story
    ? deviceGuidance(snapshot.story.guidance, touchLayout)
    : undefined;
  const requestedDifficulty = new URLSearchParams(location.search).get(
    "difficulty",
  );
  const rankingDifficulty = isMenu
    ? ["easy", "standard", "hard"].includes(requestedDifficulty ?? "")
      ? (requestedDifficulty as "easy" | "standard" | "hard")
      : (settings.escapeDifficulty ?? "standard")
    : (snapshot.escape?.difficulty ?? "standard");
  const rankingResult = (
    <Suspense
      fallback={
        <button className="text-button" onClick={() => openRanking("board")}>
          查看排行榜
        </button>
      }
    >
      <RankingResultStatus
        status={snapshot.ranking?.status}
        message={snapshot.ranking?.message}
        published={snapshot.ranking?.published}
        newAchievements={snapshot.ranking?.newAchievements}
        iconUrls={achievementIconUrls}
        onPublish={snapshot.ranking?.canPublish?()=>void game.current?.rankingSubmit?.():undefined}
        canSubmit={snapshot.ranking?.canSubmit}
        onSubmit={() => void game.current?.rankingSubmit?.()}
        onBoard={() => openRanking("board")}
      />
    </Suspense>
  );
  return (
    <main
      data-reduced-motion={(!settings.headBob&&!settings.recoilShake)||matchMedia("(prefers-reduced-motion: reduce)").matches}
      className={
        "game-shell" +
        (!fullscreenSupported ? " no-fullscreen" : "") +
        " phase-" +
        snapshot.phase +
        (snapshot.buffering ? " is-buffering" : "") +
        (driving ? " driving-mode" : "") +
        (snapshot.mode === "escape" ? " escape-mode" : "")
      }
    >
      <div className="world" ref={host} />
      <input
        ref={importInput}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="选择故事进度"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0],
            session = importSession.current;
          e.currentTarget.value = "";
          importSession.current = null;
          if (
            file &&
            session?.api === game.current &&
            session.token === operations.current.revision
          )
            void importStory(file, true);
        }}
      />
      {upgradePrompt&&isMenu&&!rankingPanel&&<MenuReadingPanel title="保留记录，升级账号" onClose={deferUpgrade}><p>设置用户名和密码，保存新的恢复码，即可继续使用原来的成绩、反馈和联机身份。</p><p>升级后可以跨设备登录，查看竞技档案与成就。照片、故事进度和本机成绩仍留在当前浏览器。</p><div className="upgrade-prompt-actions"><button className="primary" onClick={()=>{setUpgradePrompt(false);openRanking("identity");}}>升级账号</button><button className="secondary" onClick={deferUpgrade}>稍后再说</button></div></MenuReadingPanel>}
      {isMenu && (
        <MainMenu
          active={!pages.active&&!onlineOpen}
          unavailable={menuUnavailable}
          announcement={<AnnouncementBanner items={announcements.list} onOpen={openNotices}/>}
          screen={menuScreen}
          mode={selectedMode}
          entry={escapeEntry}
          variant={pvpVariant}
          onMode={(mode) => {
            if (mode==='escape' && menuUnavailable.escape) { guardEntry('escape-solo'); return; }
            if (mode!=='escape' && !guardEntry(entryFor(mode))) return;
            if (mode==='escape') {
              if (availability['escape-solo'].enabled) setEscapeEntry('single');
              else if (availability['escape-coop'].enabled) setEscapeEntry('coop');
              else { setEscapeEntry('pvp'); setPvpVariant(availability['escape-tdm'].enabled?'tdm':'ffa'); }
            }
            setSelectedMode(mode);
            setMenuScreen("prepare");
          }}
          onHome={() => {
            game.current?.cancelModePreparation?.();
            setPrepareRequested(false);
            setMenuScreen("home");
          }}
          onModes={() => setMenuScreen("modes")}
          onAbout={() => setMenuReading("about")}
          onEntry={(entry)=>{const variant=entry==='pvp'&&!availability[entryFor('escape','pvp',pvpVariant)].enabled?(availability['escape-tdm'].enabled?'tdm':'ffa'):pvpVariant;if(guardEntry(entryFor('escape',entry,variant))){setEscapeEntry(entry);setPvpVariant(variant);}}}
          onVariant={(variant)=>{if(guardEntry(entryFor('escape','pvp',variant)))setPvpVariant(variant);}}
          onStart={() => {
            if (!guardEntry(selectedEntry)) return;
            if (preparation.state !== "ready") return;
            selectedMode === "escape" && escapeEntry !== "single"
              ? openOnline()
              : chooseStart();
          }}
          onContinue={() => void continueStory()}
          hasSave={savedStory}
          disabled={preparation.state !== "ready"}
          busy={busy}
          prepareState={preparation.state}
          prepareProgress={preparation.progress}
          saveDataWaiting={saveData && !prepareRequested}
          onPrepare={() => {
            if (!guardEntry(selectedEntry)) return;
            setPrepareRequested(true);
            setPrepRevision((n) => n + 1);
          }}
          version={RELEASE_LABEL}
          onSettings={openSettings}
          onRanking={() => openRanking("board")}
          onIdentity={() => openRanking("identity")}
          identity={rankingPlayer?.nickname ?? ""}
          feedbackUnread={feedbackUnread}
          onFeedback={openFeedback}
          onAssistant={()=>openMenuPage('assistant')}
          onCredits={()=>openMenuPage('credits')}
          onHelp={() => setShowHelp(true)}
          onFAQ={() => setMenuReading("faq")}
          onUpdates={() => setMenuReading("updates")}
          status={
            <>
              {preparation.state === "loading" && (
                <div className="loading-status" role="status">
                  <span>{preparation.message}</span>
                  <span>{preparation.progress}%</span>
                  <div className="loading-track">
                    <span style={{ width: preparation.progress + "%" }} />
                  </div>
                </div>
              )}
              {preparation.state === "error" && (
                <div className="load-error" role="alert">
                  <p>{preparation.message}</p>
                  <button
                    className="secondary"
                    onClick={() => setPrepRevision((n) => n + 1)}
                  >
                    重试准备
                  </button>
                </div>
              )}
              {snapshot.phase === "loading" &&
                preparation.state !== "loading" && (
                  <div className="loading-status" role="status">
                    <span>{snapshot.message}</span>
                    <span>{Math.round(snapshot.progress)}%</span>
                    <div className="loading-track">
                      <span
                        style={{
                          width: Math.min(100, snapshot.progress) + "%",
                        }}
                      />
                    </div>
                  </div>
                )}
              {snapshot.phase === "error" && (
                <div className="load-error" role="alert">
                  <p>{snapshot.message}</p>
                  <button
                    className="secondary"
                    onClick={() => setAttempt((n) => n + 1)}
                  >
                    重新载入校园
                  </button>
                </div>
              )}
            </>
          }
          controls={
            <>
              {selectedMode === "escape" ? (
                <>
                  <WeaponLoadout value={primary} onChange={id=>setPrimary(id as PrimaryWeapon)} mode="solo" disabled={busy}/>
                  <div className="menu-difficulty-choice">
                    <label htmlFor="escape-difficulty">难度</label>
                    <select id="escape-difficulty" value={settings.escapeDifficulty??"standard"} disabled={busy} onChange={event=>changeSettings({...settings,escapeDifficulty:event.target.value as Settings['escapeDifficulty']})}>{ESCAPE_DIFFICULTIES.map(d=><option key={d.id} value={d.id}>{d.label}</option>)}</select>
                    <p>{ESCAPE_DIFFICULTIES.find(d=>d.id===(settings.escapeDifficulty??"standard"))?.description}</p>
                  </div>
                </>
              ) : selectedMode === "dafei" ? (
                <>
                  <p className="mode-note">
                    五分钟争取更多积分，车况耗尽会提前结算。
                  </p>
                  <TransmissionChoice
                    mode={settings.transmission ?? "auto"}
                    onChange={changeTransmission}
                    disabled={busy}
                  />
                </>
              ) : (
                <p className="mode-note">
                  {selectedMode === "story"
                    ? "故事进度自动保存在本机，可随时停下。"
                    : "随时探索与拍照，不计时，也没有敌人。"}
                </p>
              )}
            </>
          }
        />
      )}
      {announcements.flash && playing && <div className="announcement-flash" role="status"><strong>{announcements.flash.title}</strong><span>暂停菜单可查看完整通知</span></div>}
      {modeBlocked && <MenuReadingPanel title="玩法暂时不可用" onClose={()=>setModeBlocked(null)}><p>{modeBlocked}</p></MenuReadingPanel>}
      {noticesOpen && <MenuReadingPanel title="游戏通知" onClose={()=>setNoticesOpen(false)}><AnnouncementList items={announcements.list} onRead={announcements.markRead}/></MenuReadingPanel>}
      {pages.visited.map(page => page==='credits'?<Suspense key={page} fallback={pages.active===page?<p role="status">正在打开制作名单…</p>:null}><CreditsPlayer reducedMotion={settings.reducedMotion} active={pages.active===page} volume={settings.music} onClose={()=>closeMenuPage('credits')} onCopyright={()=>openMenuPage('copyright')}/></Suspense>:<MenuPage key={page} id={page} title={{settings:'设置',help:'操作说明',faq:'帮助',about:'关于',updates:'更新记录',copyright:'版权与许可',ranking:'排行榜',feedback:'反馈与进展',account:'账号与档案',assistant:'小齐助手'}[page]} active={pages.active===page} onBack={()=>{if(!accountBusy)pages.back();}} backLabel={menuRootLabel} onRoot={returnMenu} showNavigation={isMenu&&!onlineOpen&&!onlineView.currentRoom&&menuScreen!=='prepare'} rootLabel="开始" navigationDisabled={accountBusy} feedbackUnread={feedbackUnread} onNavigate={openMenuPage} wide={page==='ranking'||page==='feedback'||page==='account'||page==='assistant'}>
        {page==='settings'?<SettingsPanel mode={helpMode} settings={settings} onChange={changeSettings} canChangeTransmission={snapshot.phase==='menu'||snapshot.phase==='paused'} onClose={()=>closeMenuPage('settings')} onEditTouch={()=>{game.current?.clearInput?.();game.current?.pause();setTouchEditor(true);}}/>:
        page==='help'?<div className="help-panel">{online?<OnlineHelp mode={onlineView.currentRoom?.mode??'coop'} variant={onlineView.currentRoom?.variant??'tdm'} touch={touchLayout}/>:<HelpContent mode={helpMode} touchLayout={touchLayout}/>}<button className="secondary" onClick={()=>openMenuPage('faq')}>查看常见问题 →</button>{(online||helpMode==='escape')&&<button className="secondary" onClick={()=>setBriefing({mode:snapshot.online?snapshot.online.mode==='coop'?'coop':(snapshot.online.variant??pvpVariant):'solo',next:()=>{},readOnly:true})}>查看玩法规则</button>}</div>:
        page==='faq'?<MenuFAQ mode={helpMode} context={menuScreen==='prepare'?'prepare':'home'}/>:
        page==='about'?<MenuAbout onUpdates={()=>setMenuReading('updates')} onCopyright={()=>openMenuPage('copyright')}/>:
        page==='updates'?<MenuUpdates/>:page==='copyright'?<Suspense fallback={<p role="status">正在打开版权与许可…</p>}><CopyrightPage active={pages.active===page} embedded/></Suspense>:
        page==='ranking'?<Suspense fallback={<p role="status">正在打开排行榜…</p>}><ModuleBoundary label="排行榜" retry={rankingComponent} onClose={()=>closeMenuPage('ranking')}><RankingUI embedded initialPanel={requestedRankPanel} mode={snapshot.online?.mode==='coop'?'coop':helpMode==='dafei'?'dafei':'escape'} difficulty={rankingDifficulty} onClose={()=>closeMenuPage('ranking')} onAccount={()=>openRanking('identity')}/></ModuleBoundary></Suspense>:
        page==='feedback'?<FeedbackUI embedded onIdentity={()=>openRanking('identity')} onAccount={()=>openRanking('identity')} connection={snapshot.onlineDiagnostics} diagnostics={{version:RELEASE_LABEL,mode:online?'online-'+onlineView.currentRoom?.mode:snapshot.mode,controls:touchLayout?'touch':'keyboard',viewport:usableViewport.width+'×'+usableViewport.height}}/>:
        page==='assistant'?<Suspense fallback={<p role="status">正在打开小齐…</p>}><AssistantUI menuContext={assistantContext} onMenuAction={assistantAction} active={pages.active===page} onHelp={()=>openMenuPage('faq')} onFeedback={openFeedback} connection={snapshot.onlineDiagnostics} diagnostics={{version:RELEASE_LABEL,mode:online?'online-'+onlineView.currentRoom?.mode:snapshot.mode,controls:touchLayout?'touch':'keyboard',viewport:usableViewport.width+'×'+usableViewport.height}}/></Suspense>:
        page==='account'?<Suspense fallback={<p role="status">正在打开账号与档案…</p>}><AccountPage client={rankingClient} embedded iconUrls={achievementIconUrls} onBusy={setAccountBusy} onRecent={()=>openRanking('recent')}/></Suspense>:null}
      </MenuPage>)}
      {leaveConfirmation&&<MenuReadingPanel title={leaveDestination==='lobby'?'离开本局并返回联机大厅？':onlineView.currentRoom?'离开房间并返回主菜单？':'结束本局并返回主菜单？'} onClose={()=>setLeaveConfirmation(false)}><p>{onlineView.currentRoom?'你将退出当前房间并释放席位，其他玩家可以继续对局。':storyMode?'故事进度会保留在本机；返回后可以继续上次的故事。':'本局尚未完成，返回会结束当前游玩。'}</p><div className="upgrade-prompt-actions"><button className="secondary" onClick={()=>setLeaveConfirmation(false)}>留在菜单</button><button className="primary" onClick={leaveDestination==='lobby'?finishReturnLobby:finishReturnMenu}>{leaveDestination==='lobby'?'确认返回联机大厅':'确认返回主菜单'}</button></div></MenuReadingPanel>}
      {briefing && (
        <CombatBriefing
          mode={briefing.mode}
          touch={touchLayout}
          continueLabel={
            briefing.readOnly
              ? "完成"
              : briefing.mode === "solo"
                ? "开始突围"
                : "准备"
          }
          onClose={() => setBriefing(null)}
          onContinue={() => {
            const next = briefing.next;
            markCombatBriefingSeen(briefing.mode);
            setBriefing(null);
            next();
          }}
        />
      )}
      {snapshot.phase === "intro" && (
        <DafeiIntro
          onStart={() => {
            if (!touchLayout || !portrait) start("dafei");
          }}
          onBack={returnMenu}
          onCue={() => game.current?.guide()}
          onHelp={() => setShowHelp(true)}
          onRetry={prepareIntro}
          busy={busy}
          error={uiError}
          progress={snapshot.progress}
          suspended={
            showHelp || snapshot.buffering || (touchLayout && portrait)
          }
          touch={touchLayout}
        />
      )}
      {playing && snapshot.mode === "roam" && !photoOpen && (
        <>
          <div className="hud">
            <div className="hud-top">
              <div className="mission">
                <span className="mission-title">自由漫游</span>
              </div>
              <div className="hud-actions">
                <button
                  className="hud-button"
                  onClick={() => void game.current?.togglePhoto()}
                >
                  相机
                </button>
                <button
                  className="hud-button"
                  onClick={() => setArchiveOpen(true)}
                >
                  校园实拍
                </button>
                <button
                  className="hud-button fullscreen-button"
                  aria-label="切换全屏"
                  onClick={fullscreen}
                >
                  <Icon name="expand" />
                </button>
                <button
                  className="hud-button"
                  aria-label="暂停游戏"
                  onClick={() => game.current?.pause()}
                >
                  <Icon name="pause" />
                </button>
              </div>
            </div>
            <div className="reticle" aria-hidden="true">
              <span />
            </div>
            <div className="hud-bottom">
              <div className="vitals">
                <div>
                  <span>生命</span>
                  <strong>{Math.ceil(snapshot.health)}</strong>
                  <div className="stat-bar">
                    <i style={{ width: snapshot.health + "%" }} />
                  </div>
                </div>
                <div>
                  <span>{snapshot.running ? "跑操" : "体力"}</span>
                  <strong>{Math.round(snapshot.stamina)}</strong>
                  <div className="stat-bar stamina">
                    <i style={{ width: snapshot.stamina + "%" }} />
                  </div>
                </div>
              </div>
            </div>
            {snapshot.notice && (
              <div className="notice" role="status">
                {snapshot.notice}
              </div>
            )}
            {snapshot.musicError && (
              <button
                className="music-error"
                onClick={() => game.current?.retryMusic()}
              >
                跑操音乐未载入，点击重试
              </button>
            )}
          </div>
          <TouchControls api={game.current} snapshot={snapshot} />
        </>
      )}
      {!online &&
        playing &&
        snapshot.mode === "escape" &&
        snapshot.escape &&
        !snapshot.escape.mapOpen && (
          <>
            <EscapeHUD
              snapshot={snapshot}
              api={game.current}
              onPause={() => game.current?.pause()}
              onFullscreen={fullscreen}
              touch={touchLayout}
            >
              <DamageDirections incoming={snapshot.incoming} />
              <Crosshair weapon={snapshot.weapon} aiming={snapshot.aiming} spread={snapshot.weaponSpread} fov={settings.fov} hit={snapshot.hit} hitType={snapshot.hitType} canvasHost={host} />
            </EscapeHUD>
            {touchLayout && (
              <EscapeTouchControls
                api={game.current}
                snapshot={snapshot}
                settings={settings}
              />
            )}
            <div
              className="damage-vignette"
              style={{ opacity: Math.min(0.8, snapshot.hurt) }}
            />
          </>
        )}
      {snapshot.mode === "escape" && snapshot.escape?.mapOpen && (
        <EscapeMap
          snapshot={snapshot}
          onClose={closeTaskMap}
          onSelect={(id) => game.current?.selectEscapeTask?.(id)}
        />
      )}
      {playing && storyMode && snapshot.story && !photoOpen && (
        <Suspense fallback={null}>
          <ModuleBoundary
            label="故事界面"
            retry={storyComponent}
            onBlocked={(open) => moduleBlocked("story", open)}
            onClose={returnMenu}
          >
            <StoryHUD
              snapshot={snapshot.story}
              onGuidance={(action) => game.current?.storyGuidance(action)}
              onInteract={() => game.current?.storyAction("interact")}
              onAdvance={() => game.current?.storyAction("advance")}
              onChoose={(i) => game.current?.storyAction("choose", i)}
              onSkipIntro={() => game.current?.storyAction("skip")}
              onSkipCredits={() => game.current?.storyAction("credits")}
              onAlbum={() => setPlayerAlbumOpen(true)}
              onPhoto={() => void game.current?.togglePhoto()}
              onArchive={() => setArchiveOpen(true)}
              onPause={() => game.current?.pause()}
              onHint={() => game.current?.storyAction("hint")}
              onPresentOnly={(v) => game.current?.storyAction("present", v)}
              onExport={exportStory}
              onImport={(file) => void importStory(file)}
              onRetryRealityHints={() => game.current?.retryRealityHints?.()}
              onChooseImport={chooseImport}
              onOverlayChange={historyOverlay}
              onReturnMenu={returnMenu}
              onContinueRoam={() => start("roam")}
              suspended={
                snapshot.buffering ||
                archiveOpen ||
                playerAlbumOpen ||
                !!snapshot.reality
              }
              touch={touchLayout}
              realityHints={!!settings.realityHints}
              realityHintState={snapshot.photoGuides?.referenceState}
              onRealityHintsChange={(enabled) =>
                setSettings((s) => ({ ...s, realityHints: enabled }))
              }
            />
          </ModuleBoundary>
          {!snapshot.story.introActive &&
            !snapshot.story.dialogue &&
            !snapshot.story.options.length &&
            !snapshot.story.finished && (
              <TouchControls api={game.current} snapshot={snapshot} />
            )}
        </Suspense>
      )}
      {playing &&
        !snapshot.onlineMap &&
        !snapshot.onlineCommunication &&
        !onlineOpen &&
        !showSettings &&
        !showHelp &&
        !rankingPanel &&
        !feedbackOpen &&
        !touchEditor &&
        !touchLayout &&
        !photoOpen &&
        !driving &&
        !snapshot.mouseLocked &&
        !snapshot.buffering &&
        !snapshot.story?.dialogue &&
        !snapshot.story?.options.length &&
        !snapshot.story?.introActive &&
        !snapshot.story?.cinematicActive &&
        !snapshot.story?.screeningActive &&
        !snapshot.story?.finished &&
        !archiveOpen &&
        !playerAlbumOpen &&
        !snapshot.reality && (
          <button
            className="desktop-observe"
            onClick={() => (online ? resume() : game.current?.observe?.())}
          >
            点击画面继续观察
          </button>
        )}
      {playing &&
        storyMode &&
        snapshot.storyMusicError &&
        settings.music > 0 && (
          <button
            className="story-system-error"
            onClick={() => game.current?.retryMusic()}
          >
            背景音乐未载入 · 重试
          </button>
        )}
      {playing &&
        !photoOpen &&
        snapshot.photo?.message ===
          "相机画面暂时无法显示，请重新打开相机。" && (
          <div className="camera-recovery" role="alert">
            <span>相机暂时无法显示</span>
            <button onClick={() => void game.current?.togglePhoto()}>
              重新打开相机
            </button>
          </div>
        )}
      {playing && storyMode && !photoOpen && snapshot.notice && (
        <div className="story-system-notice" role="status">
          {snapshot.notice}
        </div>
      )}
      {(playing || snapshot.phase === "paused") &&
        photoOpen &&
        snapshot.photo &&
        game.current?.photoSystem() && (
          <Suspense fallback={null}>
            <ModuleBoundary
              label="相机"
              retry={photoComponent}
              onBlocked={(open) => moduleBlocked("photo", open)}
              onClose={() => void game.current?.togglePhoto()}
            >
              <PhotoUI
                onPause={() => game.current?.pause()}
                onObserve={() => game.current?.observe?.()}
                onCursorRelease={() => game.current?.releaseCursor?.()}
                snapshot={snapshot.photo}
                system={game.current.photoSystem()!}
                touch={touchLayout}
                keyboardBlocked={
                  !playing ||
                  archiveOpen ||
                  playerAlbumOpen ||
                  !!snapshot.reality
                }
                temporaryPhotos={snapshot.temporaryPhotos}
                lastPhoto={snapshot.latestPhoto}
                feedback={snapshot.story?.lastCaptureResult}
                onPanelState={(open) => {
                  setPhotoPanelOpen(open);
                  game.current?.storyOverlay("photo-panel", open);
                }}
                onAlbumState={(open) => {
                  setPhotoAlbumOpen(open);
                  game.current?.storyOverlay("photo-album", open);
                }}
                onRemove={(id) => game.current?.photoRemoved(id)}
                onClose={() => void game.current?.togglePhoto()}
                onArchive={() => setArchiveOpen(true)}
                onLook={(x, y) => game.current?.look(x, y)}
                onMove={(x, y) => game.current?.move(x, y)}
                task={
                  snapshot.story
                    ? {
                        label: snapshot.story.guidance.active
                          ? guidance!.title
                          : (snapshot.story.photoTask?.title ??
                            snapshot.story.stepTitle),
                        objective: snapshot.story.guidance.active
                          ? guidance!.body
                          : snapshot.story.objective.replace(
                              /^举起相机，?/,
                              "",
                            ),
                        progress: snapshot.story.guidance.active
                          ? undefined
                          : snapshot.story.kind === "photo"
                            ? snapshot.story.photoTask &&
                              ["retry", "approach", "waiting"].includes(
                                snapshot.story.photoTask.status,
                              )
                              ? snapshot.story.photoTask.message
                              : undefined
                            : "放下相机，与同伴继续",
                      }
                    : undefined
                }
                realityNotice={
                  snapshot.notice.startsWith("遇见现实")
                    ? snapshot.notice
                    : undefined
                }
                onRealityState={realityOverlay}
                realityHints={
                  snapshot.mode === "story" || snapshot.mode === "roam"
                    ? !!settings.realityHints
                    : undefined
                }
                realityHintState={snapshot.photoGuides?.referenceState}
                onRealityHintsChange={
                  snapshot.mode === "story" || snapshot.mode === "roam"
                    ? (enabled) =>
                        setSettings((s) => ({ ...s, realityHints: enabled }))
                    : undefined
                }
                onRetryRealityHints={() => game.current?.retryRealityHints?.()}
              />
            </ModuleBoundary>
          </Suspense>
        )}
      {snapshot.reality && (
        <Suspense fallback={null}>
          <ModuleBoundary
            label="实拍影像"
            retry={realityComponent}
            onBlocked={(open) => moduleBlocked("reality", open)}
            onClose={() => game.current?.closeReality()}
          >
            <RealityUI
              match={snapshot.reality}
              photo={snapshot.reality.photo}
              onReady={() => game.current?.storyOverlay("reality", true)}
              onClose={() => game.current?.closeReality()}
              paused={
                snapshot.phase !== "playing" || archiveOpen || playerAlbumOpen
              }
              reducedMotion={
                matchMedia("(prefers-reduced-motion: reduce)").matches
              }
            />
          </ModuleBoundary>
        </Suspense>
      )}
      {playerAlbumOpen && (
        <Suspense fallback={null}>
          <ModuleBoundary
            label="相册"
            retry={albumComponent}
            onBlocked={(open) => moduleBlocked("album", open)}
            onClose={() => setPlayerAlbumOpen(false)}
          >
            <PhotoAlbum
              onClose={() => setPlayerAlbumOpen(false)}
              onRemove={(id) => game.current?.photoRemoved(id)}
              onRealityState={realityOverlay}
              extras={snapshot.temporaryPhotos}
            />
          </ModuleBoundary>
        </Suspense>
      )}
      {archiveOpen && (
        <Suspense
          fallback={<div className="streaming-shade">准备影像档案…</div>}
        >
          <ModuleBoundary
            label="影像档案"
            retry={archiveComponent}
            onBlocked={(open) => moduleBlocked("archive", open)}
            onClose={() => setArchiveOpen(false)}
          >
            <ArchiveUI
              onClose={() => setArchiveOpen(false)}
              onRealityState={realityOverlay}
            />
          </ModuleBoundary>
        </Suspense>
      )}
      {playing && driving && snapshot.driving && (
        <>
          <DrivingHUD
            disabled={snapshot.buffering}
            api={game.current}
            driving={snapshot.driving}
            remaining={snapshot.remaining}
            onPause={() => game.current?.pause()}
            onFullscreen={fullscreen}
            touch={touchLayout}
          >
            <DamageDirections incoming={snapshot.incoming} />
            {snapshot.notice && (
              <div className="notice" role="status">
                {snapshot.notice}
              </div>
            )}
            {snapshot.musicError && (
              <button
                className="music-error"
                onClick={() => game.current?.retryMusic()}
              >
                驾驶音乐未载入，点击重试
              </button>
            )}
          </DrivingHUD>
          {
            <TouchDrive
              disabled={snapshot.buffering}
              api={game.current}
              driving={snapshot.driving}
            />
          }
          <div
            className="damage-vignette"
            style={{ opacity: Math.min(0.8, snapshot.hurt) }}
          />
        </>
      )}
      {DrivingQA &&
        playing &&
        driving &&
        !snapshot.buffering &&
        new URLSearchParams(window.location.search).get("profile") ===
          "driving-qa" && (
          <Suspense fallback={null}>
            <DrivingQA api={game.current} />
          </Suspense>
        )}
      {pausePolicy(online ? "online" : "local") === "world" &&
        snapshot.phase === "paused" &&
        !snapshot.escape?.mapOpen &&
        !photoPanelOpen &&
        !photoAlbumOpen && !pages.active && (
          <MenuPage id="pause" title={snapshot.mode==='escape'?'突围菜单':'暂停菜单'} active tactical={snapshot.mode==='escape'} showNavigation={false} centered onRoot={returnMenu} rootLabel="主菜单" feedbackUnread={feedbackUnread} onNavigate={openMenuPage}>
          <AnnouncementBanner items={announcements.list} onOpen={openNotices}/>
          <div className="pause-shade">
            <section className="pause-panel">
              <div className="pause-session-heading"><h2>{snapshot.mode==='escape'?'准备好，继续行动。':'校园在等你。'}</h2><p>{driving?'驾驶与倒计时已暂停。':'当前进度已暂停。'}</p></div>
              {driving&&<div className="pause-session-controls"><TransmissionChoice mode={settings.transmission??'auto'} onChange={changeTransmission} disabled={busy}/></div>}
              <button
                className="primary wide"
                onClick={resume}
                disabled={busy || (touchLayout && portrait)}
              >
                继续游玩
                <Icon name="play" />
              </button>
              <SessionMenuActions onOpen={openMenuPage} onMain={returnMenu} busy={busy}/>
              {storyMode&&<details className="pause-progress-controls"><summary>故事进度</summary><label><input type="checkbox" checked={replayGuidanceOnContinue} onChange={event=>setReplayGuidanceOnContinue(event.target.checked)}/>继续时重看操作引导</label><div className="pause-options"><button className="secondary" onClick={exportStory}>导出进度</button><button className="secondary" onClick={chooseImport} disabled={busy}>导入进度</button><button className="text-button" onClick={()=>void continueStory(true,true)} disabled={busy}>恢复上一份存档</button></div></details>}

            </section>
          </div>
          </MenuPage>
        )}
      {result && driving && snapshot.driving && (
        <DrivingResult
          driving={snapshot.driving}
          elapsed={snapshot.elapsed}
          lost={snapshot.phase === "lost"}
          reason={snapshot.resultReason}
          onRestart={() => start("dafei")}
          onMenu={returnMenu}
          busy={busy}
        >
          {rankingResult}
          <button className="text-button" onClick={openFeedback}>
            反馈与进展
          </button>
        </DrivingResult>
      )}
      {!online &&
        result &&
        snapshot.mode === "escape" &&
        snapshot.escape?.result && (
          <EscapeResult
            snapshot={snapshot}
            onRetry={retryEscape}
            onNew={() => start("escape")}
            onMenu={returnMenu}
            busy={busy}
          >
            {rankingResult}
            <button className="text-button" onClick={openFeedback}>
              反馈与进展
            </button>
          </EscapeResult>
        )}
      {snapshot.bufferingVisible && playing && (
        <section className="streaming-shade" aria-live="polite">
          <div className="streaming-panel">
            <h2>
              {snapshot.mapError ? "校园资源暂未载入" : "前方校园正在载入"}
            </h2>
            <p>
              {snapshot.mapError
                ? "前方区域未能载入，重试后继续。"
                : "正在载入前方区域，完成后继续。"}
            </p>
            <progress max={1} value={snapshot.mapProgress} />
            {snapshot.mapError && (
              <button
                className="secondary"
                onClick={() => game.current?.retryMap()}
              >
                立即重试
              </button>
            )}
            <button
              className="text-button"
              onClick={() => game.current?.pause()}
            >
              暂停与设置
            </button>
          </div>
        </section>
      )}
      {uiError && snapshot.phase !== "intro" && (
        <div className="ui-error" role="alert">
          {uiError}
          {errorRetry.current && (
            <button onClick={() => errorRetry.current?.()}>重试</button>
          )}
          <button
            aria-label="关闭提示"
            onClick={() => {
              errorRetry.current = null;
              setUiError("");
            }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
      {connectionDetails && (
        <ConnectionDetails
          diagnostics={snapshot.onlineDiagnostics}
          onClose={() => setConnectionDetails(false)}
        />
      )}
      {((onlineOpen && !onlineRoomKey) ||
        (online &&
          snapshot.phase !== "error" &&
          (onlineView.currentRoom?.phase === "lobby" ||
            onlineView.currentRoom?.phase === "preparing" ||
            onlineView.status === "reconnecting"))) &&
        !onlineReadingOpen && (
          <MenuPage id="lobby" title={onlineView.currentRoom?(onlineView.currentRoom.mode==='coop'?'合作准备':onlineView.currentRoom.variant==='tdm'?'团队对战准备':'个人混战准备'):'联机大厅'} active tactical showNavigation={false} onBack={returnMenu} backLabel="返回主菜单" onRoot={returnMenu} rootLabel="主菜单" onNavigate={openMenuPage} feedbackUnread={feedbackUnread} wide>
          <MultiplayerUI embedded
            initialMode={escapeEntry === "pvp" ? "pvp" : "coop"}
            initialVariant={pvpVariant}
            view={onlineView}
            playerId={rankingPlayer?.id || onlineClient.current!.playerId}
            onAction={onlineAction}
            onIdentity={() => openRanking("identity")}
            onClose={()=>{if(onlineRoomKey&&onlineView.currentRoom?.phase==='playing'&&onlineTransportReady){game.current?.pause();setOnlineOpen(false);}else returnMenu();}}
          />
          </MenuPage>
        )}
      {online && snapshot.phase === "error" && !onlineReadingOpen && (
        <div className="online-shade">
          <section
            className="online-panel online-small"
            role="dialog"
            aria-label="校园加载失败"
          >
            <div className="online-body">
              <h2>校园暂时未能载入</h2>
              <p>其他队员可以继续准备。重试完成后再开始本局。</p>
              <div className="online-actions">
                <button
                  className="online-primary"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  重新载入
                </button>
                <button onClick={() => onlineAction({ type: "leave" })}>
                  离开房间
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {online &&
        snapshot.online &&
        onlineView.currentRoom?.phase === "playing" &&
        playing && (
          <>
            <ConnectionHUD
              diagnostics={snapshot.onlineDiagnostics}
              showPing={!!settings.onlinePing}
              onDetails={() => {
                game.current?.pause();
                setConnectionDetails(true);
              }}
            />
            {snapshot.gadgets&&<GadgetHUD view={snapshot.gadgets} smokes={snapshot.smokes} touch={touchLayout} api={game.current}/>}
          <OnlineHUD
              interactionScreen={snapshot.interactionScreen}
              selectedTaskId={snapshot.onlineTrackingTaskId}
              interaction={snapshot.interaction}
              onInteract={(pressed) =>
                game.current?.action("interact", pressed)
              }
              pickup={snapshot.pickup}
              onPickup={() => {
                game.current?.action("interact", true);
                game.current?.action("interact", false);
              }}
              displayStamina={snapshot.stamina}
              displayAction={snapshot.weaponAction}
              displayAmmo={snapshot.ammo}
              notice={snapshot.notice}
              spectatingId={snapshot.onlineSpectatingId}
              contacts={snapshot.onlineContacts}
              touch={touchLayout}
              room={snapshot.online}
              playerId={onlineClient.current!.playerId}
              onMenu={() => game.current?.pause()}
              onAction={onlineAction}
            />
            <Crosshair weapon={snapshot.weapon} aiming={snapshot.aiming} spread={snapshot.weaponSpread} fov={settings.fov} hit={snapshot.hit} hitType={snapshot.hitType} canvasHost={host} />
            <DamageDirections incoming={snapshot.incoming} />
            {touchLayout && (
              <EscapeTouchControls
                api={game.current}
                snapshot={snapshot}
                settings={settings}
              />
            )}
            <div
              className="damage-vignette"
              style={{ opacity: Math.min(0.8, snapshot.hurt) }}
            />
          </>
        )}
      {online &&
        snapshot.online &&
        ["playing", "paused"].includes(snapshot.online.phase) &&
        snapshot.phase === "paused" &&
        !snapshot.onlineMap &&
        !snapshot.onlineCommunication &&
        !onlineReadingOpen &&
        onlineTransportReady && (
          <MenuPage id="pause" title="对局菜单" active tactical showNavigation={false} centered onRoot={returnMenu} rootLabel="主菜单" feedbackUnread={feedbackUnread} onNavigate={openMenuPage}>
            <AnnouncementBanner items={announcements.list} onOpen={openNotices}/>
            <OnlinePause
              embedded
              onLeave={returnMenu}
              onConnection={() => setConnectionDetails(true)}
              room={snapshot.online}
              playerId={onlineClient.current!.playerId}
              onAction={onlineAction}
              onClose={resume}
              onBoard={() => openRanking("board")}
              onFeedback={openFeedback}
              onSettings={openSettings}
            />
            <SessionMenuActions onOpen={openMenuPage} onMain={returnMenu} onLobby={returnLobby}/>

          </MenuPage>
        )}
      {online &&
        snapshot.onlineMap &&
        snapshot.online &&
        !onlineReadingOpen &&
        onlineTransportReady && (
          <OnlineMap
            selectedTaskId={snapshot.onlineTrackingTaskId}
            onSelectTask={(id) => game.current?.selectEscapeTask?.(id)}
            room={snapshot.online}
            playerId={onlineClient.current!.playerId}
            onClose={closeTaskMap}
          />
        )}
      {online &&
        snapshot.onlineCommunication &&
        !onlineReadingOpen &&
        onlineTransportReady && (
          <div className="online-communication">
            <h2>短讯</h2>
            {(["help", "go", "thanks", "wait"] as const).map((id, i) => (
              <button
                key={id}
                onClick={() => onlineAction({ type: "preset", id })}
              >
                {["需要支援", "往这里走", "谢谢", "等一下"][i]}
              </button>
            ))}
            <button onClick={resume}>返回对局</button>
          </div>
        )}
      {online &&
        snapshot.online?.result &&
        !onlineReadingOpen &&
        onlineTransportReady && (
          <>
            <OnlineResult
              room={snapshot.online}
              playerId={onlineClient.current!.playerId}
              onAction={onlineAction}
              onClose={() => onlineAction({ type: "leave" })}
              onBoard={() => openRanking("board")}
              onFeedback={openFeedback}
            />
          </>
        )}
      {touchEditor && (
        <EscapeTouchEditor
          settings={settings}
          onChange={changeSettings}
          onClose={() => {
            game.current?.clearInput?.();
            setTouchEditor(false);
          }}
        />
      )}
      {touchLayout &&
        portrait &&
        ["playing", "paused", "intro"].includes(snapshot.phase) &&
        (!online ||
          (onlineView.currentRoom?.phase === "playing" &&
            onlineTransportReady)) &&
        !isMenu &&
        !onlineOpen &&
        !pages.active &&
        !feedbackOpen &&
        !rankingPanel &&
        !photoPanelOpen &&
        !photoAlbumOpen &&
        !showSettings &&
        !showHelp &&
        !touchEditor &&
        !archiveOpen &&
        !playerAlbumOpen &&
        !snapshot.reality &&
        !snapshot.escape?.mapOpen && (
          <div className="rotate-overlay">
            <div className="phone-outline" />
            <h2>横屏继续游玩</h2>
            <p>
              {online ? "已停止你的操作，对局仍在继续。" : "这一段已经暂停。"}
            </p>
            <button className="secondary" onClick={openSettings}>
              设置
            </button>
            <button className="text-button" onClick={returnMenu}>
              返回首页
            </button>
          </div>
        )}
    </main>
  );
}
