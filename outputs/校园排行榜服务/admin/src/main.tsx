import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { api, has, setCsrf, type Administrator } from "./api";
import { ErrorBox, NotifyContext, Field } from "./ui";
import "./style.css";
const Overview = lazy(() =>
    import("./views/Overview").then((m) => ({ default: m.Overview })),
  ),
  Stats = lazy(() =>
    import("./views/Overview").then((m) => ({ default: m.Stats })),
  ),
  Feedback = lazy(() => import("./views/Feedback")),
  Issues = lazy(() => import("./views/Issues")),
  Releases = lazy(() => import("./views/Releases")),
  Operations = lazy(() => import("./views/Operations")),
  Assistant = lazy(() => import("./views/Assistant")),
  Rankings = lazy(() =>
    import("./views/Moderation").then((m) => ({ default: m.Rankings })),
  ),
  Players = lazy(() =>
    import("./views/Moderation").then((m) => ({ default: m.Players })),
  ),
  Rooms = lazy(() =>
    import("./views/Moderation").then((m) => ({ default: m.Rooms })),
  ),
  Accounts = lazy(() =>
    import("./views/Accounts").then((m) => ({ default: m.Accounts })),
  ),
  Audit = lazy(() =>
    import("./views/Accounts").then((m) => ({ default: m.Audit })),
  ),
  PlayerAccounts = lazy(() => import("./views/PlayerAccounts")),
  Appeals = lazy(() => import("./views/PlayerAccounts").then(m=>({default:m.Appeals}))),
  Services = lazy(() => import("./views/Services"));
const workspaceGroups = [
  {label:"日常运营",ids:["overview","feedback","issues","operations"]},
  {label:"版本与AI",ids:["releases","assistant"]},
  {label:"竞技与玩家",ids:["rankings","players","player-accounts","account-appeals","rooms"]},
  {label:"系统与审计",ids:["services","stats","accounts","audit"]},
];
const sections = [
  { id: "overview", label: "工作台" },
  { id: "feedback", label: "反馈", scope: "feedback" },
  { id: "issues", label: "议题", scope: "feedback" },
  { id: "releases", label: "版本与发布", scope: "publish" },
  { id: "operations", label: "玩法与通知", scope: "operations" },
  { id: "assistant", label: "小齐助手", scope: "assistant" },
  { id: "rankings", label: "成绩审核", scope: "ranking" },
  { id: "players", label: "玩家", scope: "players" },
  { id: "player-accounts", label: "玩家账号", scope: "player-accounts" },
  { id: "account-appeals", label: "找回申诉", owner: true },
  { id: "rooms", label: "房间", scope: "rooms" },
  { id: "services", label: "服务状态", scope: "rooms" },
  { id: "stats", label: "访问与故障", scope: "stats" },
  { id: "accounts", label: "账号与权限" },
  { id: "audit", label: "审计记录", owner: true },
];
class WorkspaceBoundary extends Component<{children:ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<section className="panel"><h2>工作区暂时无法打开</h2><p>已保存的操作不会丢失。重新加载后可继续处理。</p><button className="primary" onClick={()=>location.reload()}>重新加载工作台</button></section>:this.props.children;}
}
function Login({ onLogin }: { onLogin: (a: Administrator) => void }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <section className="login-brand">
        <p className="eyebrow">齐盛 · 校园游戏</p>
        <h1>管理工作台</h1>
        <p>回复玩家，整理进展，照顾每一次游玩。</p>
        <a href="/">返回游戏 →</a>
        <p>© 2026 LIUFRAME INTERACTIVE · 齐盛Online · <a href="/copyright/">版权与许可</a></p>
      </section>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await api("login", { username, password });
            setCsrf(r.csrf);
            setPassword("");
            onLogin(r.administrator);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>管理员登录</h2>
        <Field label="账号">
          <input
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="密码">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorBox error={error} />
        <button className="primary" disabled={busy}>
          {busy ? "正在登录…" : "登录工作台"}
        </button>
      </form>
    </main>
  );
}
function App() {
  const [administrator, setAdmin] = useState<Administrator | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [route, setRoute] = useState(
      location.hash.slice(1).split("/")[0] || "overview",
    ),
    [notice, setNotice] = useState(""),
    [nav, setNav] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await api("session");
      setCsrf(r.csrf);
      setAdmin(r.administrator);
    } catch (e) {
      if ((e as any).status !== 401) setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const expired = () => {
      setAdmin(null);
      setCsrf("");
    };
    const hash = () => {
      setRoute(location.hash.slice(1).split("/")[0] || "overview");
      setNav(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("admin-session-expired", expired);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("admin-session-expired", expired);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (loading)
    return (
      <main className="boot" role="status">
        正在打开管理工作台…
      </main>
    );
  if (error)
    return (
      <main className="boot">
        <ErrorBox error={error} retry={load} />
      </main>
    );
  if (!administrator) return <Login onLogin={setAdmin} />;
  const allowed = sections.filter(
    (s) =>
      (!s.scope || has(administrator, s.scope)) &&
      (!s.owner || administrator.owner),
  );
  const current = allowed.find((s) => s.id === route);
  const components: Record<
    string,
    ComponentType<{ administrator: Administrator }>
  > = {
    overview: Overview,
    feedback: Feedback,
    issues: Issues,
    releases: Releases,
    operations: Operations,
    assistant: Assistant,
    rankings: Rankings,
    players: Players,
    'player-accounts': PlayerAccounts,
    'account-appeals': Appeals,
    rooms: Rooms,
    services: Services,
    stats: Stats,
    accounts: Accounts,
    audit: Audit,
  };
  const View = current ? components[current.id] : null;
  return (
    <NotifyContext.Provider value={setNotice}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>
          跳到工作区
        </a>
        <aside className={"sidebar " + (nav ? "expanded" : "")}>
          <a className="brand" href="#overview">
            <span>齐盛</span>
            <strong>管理工作台</strong>
          </a>
          <button
            className="nav-toggle"
            aria-expanded={nav}
            onClick={() => setNav((v) => !v)}
          >
            工作区 <span>{nav ? "收起" : "展开"}</span>
          </button>
          <nav aria-label="工作区">
            {workspaceGroups.map(group=>{const visible=group.ids.flatMap(id=>allowed.filter(s=>s.id===id));return visible.length?<section className="sidebar-group" key={group.label}><h2>{group.label}</h2>{visible.map((s) => (
              <a
                href={"#" + s.id}
                aria-current={route === s.id ? "page" : undefined}
                key={s.id}
              >

                {s.label}
              </a>
            ))}</section>:null;})}
          </nav>
          <a className="back-game" href="/" target="_blank" rel="noreferrer">
            打开游戏 ↗
          </a>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <span>{current?.label ?? "工作区"}</span>
            <div>
              <strong>{administrator.name}</strong>
              <button
                onClick={async () => {
                  try {
                    await api("logout", {});
                    setAdmin(null);
                    setCsrf("");
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                退出登录
              </button>
            </div>
          </header>
          <main id="main-content" tabIndex={-1}>
            {View ? (
              <WorkspaceBoundary key={route}><Suspense fallback={<p role="status">正在打开工作区…</p>}>
                <View administrator={administrator} />
              </Suspense></WorkspaceBoundary>
            ) : (
              <ErrorBox error="你没有查看此工作区的权限。" />
            )}
          </main>
          <footer className="workspace-footer">
            <span>© 2026 LIUFRAME INTERACTIVE · 齐盛Online · <a href="/copyright/" target="_blank" rel="noreferrer">版权与许可</a></span><span>所有时间均为北京时间</span>
          </footer>
        </div>
        {notice && (
          <div className="toast" role="status">
            {notice}
            <button aria-label="关闭提示" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
      </div>
    </NotifyContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
