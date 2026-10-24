import { useCallback, useEffect, useRef, useState } from "react";
export {roomCommandNotice, roomSnapshotFresh} from './room-status';
export type Row = Record<string, any>;
export type Administrator = {
  id: string;
  name: string;
  username: string;
  owner: boolean;
  scopes: string[];
  active?: boolean;
};
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T = Row>(
  path: string,
  data?: unknown,
  signal?: AbortSignal,
  timeoutMs = 20000,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, {once: true});
  const timer = setTimeout(cancel, timeoutMs);
  try {
  const response = await fetch("/admin/" + path, {
    credentials: "same-origin",
    cache: "no-store",
    signal: controller.signal,
    headers: {
      Accept: "application/json",
      ...(data === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf }),
    },
    ...(data === undefined
      ? {}
      : { method: "POST", body: JSON.stringify(data) }),
  });
  const result = await response
    .json()
    .catch(() => ({ error: { message: "服务器暂时无法响应，请稍后重试。" } }));
  if (!response.ok) {
    if (response.status === 401 && path !== "login")
      window.dispatchEvent(new Event("admin-session-expired"));
    throw new APIError(
      result.error?.message ?? result.message ?? "操作未完成，请重试。",
      response.status,
      result.error?.code ?? result.code ?? "REQUEST",
    );
  }
  return result;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted)
      throw new APIError(data === undefined ? '读取超时，请重试。' : '响应超时。请先刷新处理记录，确认结果后再重试。', 0, 'TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
export function useResource<T = Row>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!!path),
    [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null),
    [lastReadFailed, setLastReadFailed] = useState(false),
    [version, bump] = useState(0);
  const generation = useRef(0);
  const previousPath = useRef<string | null>(null);
  useEffect(() => {
    const id = ++generation.current,
      controller = new AbortController();
    setError("");
    if (previousPath.current !== path) {
      setData(null);
      setLastSuccessAt(null);
      setLastReadFailed(false);
    }
    previousPath.current = path;
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    api<T>(path, undefined, controller.signal)
      .then((result) => {
        if (id === generation.current) {
          setData(result);
          setLastSuccessAt(Date.now());
          setLastReadFailed(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && id === generation.current) {
          setError(err.message);
          setLastReadFailed(true);
        }
      })
      .finally(() => {
        if (id === generation.current) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return {
    data,
    error,
    loading,
    lastSuccessAt,
    lastReadFailed,
    reload: useCallback(() => bump((n) => n + 1), []),
    setData,
  };
}
export function useLiveResource<T = Row>(path: string | null, interval = 5000) {
  const resource = useResource<T>(path);
  const busy = useRef(resource.loading);
  busy.current = resource.loading;
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const reload = () => {if (!document.hidden && !busy.current) resource.reload();};
    const visibility = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
      if (!document.hidden && path) {reload(); timer = setInterval(reload, interval);}
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => {if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', visibility);};
  }, [path, interval, resource.reload]);
  return {...resource, loading: resource.loading && !resource.data, refreshing: resource.loading};
}
export const has = (a: Administrator, scope: string) =>
  a.owner || a.scopes.includes(scope);
export function query(values: Record<string, unknown>) {
  const q = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  });
  return q.toString();
}
export const stamp = (v: unknown) =>
  v
    ? new Date(typeof v === "number" ? v : String(v)).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      })
    : "—";
export const modeName: Record<string, string> = {
  story: "明天，照常见",
  roam: "自由漫游",
  dafei: "大飞模式",
  "escape-solo": "单人突围",
  "escape-coop": "合作突围",
  "escape-tdm": "团队对战",
  "escape-ffa": "个人混战",
  escape: "校园突围",
  coop: "合作突围",
  tdm: "团队对战",
  ffa: "个人混战",
  pvp: "玩家对战",
};
export const stateName: Record<string, string> = {
  received: "已收到",
  triaged: "处理中",
  closed: "已关闭",
  resolved: "已解决",
  evaluating: "已收到",
  planned: "已计划",
  developing: "处理中",
  verification: "待验证",
  released: "已解决",
  wontfix: "暂不处理",
  draft: "草稿",
  published: "已发布",
  scheduled: "已排期",
  expired: "已到期",
  withdrawn: "已撤下",
  review: "待复核",
  ranked: "已上榜",
  removed: "已下架",
  rejected: "未通过",
  unranked: "未参榜",
  valid: "有效",
  waiting: "准备中",
  lobby: "准备中",
  preparing: "正在准备",
  paused: "全队暂停",
  ended: "已结束",
  draining: "等待结束",
  playing: "进行中",
  countdown: "倒计时",
  finished: "已结束",
  easy: "轻松",
  normal: "标准",
  standard: "标准",
  hard: "挑战",
  challenge: "挑战",
};
export function parse<T = Row>(value: any, fallback: T = {} as T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value ?? fallback;
}
export function useSavedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return (
        JSON.parse(sessionStorage.getItem("admin-ui:" + key) ?? "null") ??
        initial
      );
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("admin-ui:" + key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}
