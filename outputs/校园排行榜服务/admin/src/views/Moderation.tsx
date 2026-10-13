import { useState } from "react";
import {
  api,
  modeName,
  parse,
  query,
  stamp,
  stateName,
  useResource,
  useSavedState,
  type Row,
} from "../api";
import {
  Badge,
  Confirm,
  Dialog,
  Empty,
  Field,
  FormError,
  KeyValues,
  Load,
  PageTitle,
  Pager,
  Panel,
  useNotify,
} from "../ui";
export function Rankings() {
  const [tab, setTab] = useSavedState("ranking-tab", "runs"),
    [status, setStatus] = useSavedState("ranking-status", "review"),
    [page, setPage] = useState(1),
    [action, setAction] = useState<Row | null>(null);
  const resource = useResource(
      tab === "runs"
        ? "runs?" + query({ page, status })
        : tab === "reports"
          ? "reports?" + query({ page })
          : "multiplayer-results?" + query({ page, mode: tab }),
    ),
    notify = useNotify();
  return (
    <>
      <PageTitle eyebrow="公平游玩" title="成绩审核">
        <button onClick={resource.reload}>刷新</button>
      </PageTitle>
      <div className="tabs" role="tablist">
        {[
          ["runs", "单人成绩"],
          ["coop", "合作成绩"],
          ["pvp", "对战战绩"],
          ["reports", "玩家举报"],
        ].map(([id, name]) => (
          <button
            role="tab"
            aria-selected={tab === id}
            key={id}
            onClick={() => {
              setTab(id);
              setPage(1);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "runs" && (
        <div className="filter-bar">
          <Field label="状态">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {["review", "ranked", "removed", "rejected", "unranked"].map(
                (s) => (
                  <option value={s} key={s}>
                    {stateName[s]}
                  </option>
                ),
              )}
            </select>
          </Field>
        </div>
      )}
      <Panel>
        <Load
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {resource.data && (
            <>
              {resource.data.items.length ? (
                <div className="review-list">
                  {resource.data.items.map((r: Row) => {
                    const s = parse(r.summary),
                      flags = parse<any[]>(r.flags, []);
                    return (
                      <article key={r.id}>
                        <header>
                          <h2>
                            {r.nickname
                              ? r.nickname + " #" + r.short_id
                              : tab === "reports"
                                ? "玩家举报"
                                : (modeName[r.mode] ?? "联机成绩")}
                          </h2>
                          {r.status && <Badge value={r.status} />}
                        </header>
                        {tab === "reports" ? (
                          <KeyValues
                            items={{
                              原因: r.reason,
                              对象: r.run_id ?? r.target_id ?? r.nickname,
                              时间: stamp(r.created),
                            }}
                          />
                        ) : (
                          <KeyValues
                            items={{
                              玩法: modeName[r.mode] ?? r.mode,
                              难度: stateName[r.difficulty] ?? r.difficulty,
                              得分: s.score ?? s.points ?? r.score,
                              用时: s.elapsed ?? r.elapsed,
                              提交: stamp(r.submitted),
                            }}
                          />
                        )}
                        {flags.length > 0 && (
                          <details>
                            <summary>复核线索（{flags.length}）</summary>
                            <ul>
                              {flags.map((f, i) => (
                                <li key={i}>
                                  {typeof f === "string"
                                    ? f
                                    : (f.reason ??
                                      f.message ??
                                      f.code ??
                                      "过程需要核对")}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                        <small className="record-id">记录编号 {r.id}</small>
                        <div className="actions">
                          {tab === "reports" ? (
                            <button
                              onClick={() =>
                                setAction({ row: r, action: "report" })
                              }
                            >
                              标记已处理
                            </button>
                          ) : tab === "runs" ? (
                            <>
                              {r.status !== "ranked" && (
                                <button
                                  className="primary"
                                  onClick={() =>
                                    setAction({ row: r, action: "approve" })
                                  }
                                >
                                  通过复核
                                </button>
                              )}
                              {r.status !== "rejected" && (
                                <button
                                  onClick={() =>
                                    setAction({ row: r, action: "reject" })
                                  }
                                >
                                  不予通过
                                </button>
                              )}
                              {r.status === "ranked" && (
                                <button
                                  className="danger"
                                  onClick={() =>
                                    setAction({ row: r, action: "remove" })
                                  }
                                >
                                  下架成绩
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() =>
                                setAction({
                                  row: r,
                                  action:
                                    r.status === "removed"
                                      ? "restore"
                                      : "remove",
                                })
                              }
                            >
                              {r.status === "removed"
                                ? "恢复有效成绩"
                                : "下架成绩"}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <Empty>此筛选下没有记录。</Empty>
              )}
              <Pager
                page={page}
                total={resource.data.total}
                size={50}
                count={resource.data.items.length}
                onChange={setPage}
              />
            </>
          )}
        </Load>
      </Panel>
      {action && (
        <Confirm
          title={
            (
              {
                approve: "通过成绩复核",
                reject: "不予通过",
                remove: "下架成绩",
                restore: "恢复成绩",
                report: "处理举报",
              } as Row
            )[action.action]
          }
          description={
            <>
              对象：{action.row.nickname ?? action.row.id}
              。处理后将按仍有效的成绩重新计算排名，不直接修改分数。
            </>
          }
          reason={action.action !== "report"}
          danger={action.action === "remove"}
          onClose={() => setAction(null)}
          onConfirm={async (reason) => {
            await api(
              action.action === "report"
                ? "reports/" + action.row.id
                : (tab === "runs" ? "runs/" : "multiplayer-results/") +
                    action.row.id,
              { action: action.action, reason },
            );
            resource.reload();
            notify("处理已保存");
          }}
        />
      )}
    </>
  );
}
export function Players() {
  const [filter, setFilter] = useSavedState("players", { search: "", page: 1 }),
    [item, setItem] = useState<Row | null>(null),
    resource = useResource("players?" + query(filter)),
    notify = useNotify();
  return (
    <>
      <PageTitle eyebrow="身份与权限" title="玩家">
        <button onClick={resource.reload}>刷新</button>
      </PageTitle>
      <div className="filter-bar">
        <Field label="搜索玩家">
          <input
            type="search"
            placeholder="昵称或短编号"
            value={filter.search}
            onChange={(e) => setFilter({ search: e.target.value, page: 1 })}
          />
        </Field>
      </div>
      <Panel>
        <Load
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {resource.data && (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>玩家</th>
                      <th>参榜状态</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.items.map((r: Row) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.nickname}</strong>
                          <small>#{r.short_id}</small>
                        </td>
                        <td>{r.restricted ? "限制参榜" : "正常"}</td>
                        <td>{stamp(r.created)}</td>
                        <td>
                          <button onClick={() => setItem(r)}>管理玩家</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!resource.data.items.length && <Empty>没有找到玩家。</Empty>}
              <Pager
                page={filter.page}
                size={50}
                total={resource.data.total}
                onChange={(page) => setFilter((f) => ({ ...f, page }))}
              />
            </>
          )}
        </Load>
      </Panel>
      {item && (
        <PlayerEdit
          item={item}
          onClose={() => setItem(null)}
          onSaved={() => {
            setItem(null);
            resource.reload();
            notify("玩家设置已保存");
          }}
        />
      )}
    </>
  );
}
function PlayerEdit({
  item,
  onClose,
  onSaved,
}: {
  item: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nickname, setName] = useState(item.nickname),
    [restricted, setRestricted] = useState(!!item.restricted),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  return (
    <Dialog
      title={"管理 " + item.nickname + " #" + item.short_id}
      onClose={() => !busy && onClose()}
      dirty={
        nickname !== item.nickname ||
        restricted !== !!item.restricted ||
        !!reason
      }
    >
      <Field label="公开昵称">
        <input
          value={nickname}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={restricted}
          onChange={(e) => setRestricted(e.target.checked)}
        />
        限制参与在线排行榜
      </label>
      <p className="muted">
        参榜限制不阻止本机游玩；联机限制在房间管理中处理。
      </p>
      <Field label="处理原因">
        <textarea
          rows={3}
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <FormError error={error} />
      {confirm && (
        <p className="confirm-inline">确认更新此玩家的昵称和参榜权限？</p>
      )}
      <div className="actions">
        <button disabled={busy} data-dialog-dismiss onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          disabled={busy || reason.trim().length < 4}
          onClick={async () => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            setBusy(true);
            try {
              await api("players/" + item.id, { nickname, restricted, reason, expectedRevision: item.revision });
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          确认保存
        </button>
      </div>
    </Dialog>
  );
}
export function Rooms() {
  const [commandRevision,refreshCommands]=useState(0);
  const [filter, setFilter] = useSavedState("rooms-filter", {
      page: 1,
      state: "",
      search: "",
    }),
    resource = useResource("rooms?" + query(filter)),
    [action, setAction] = useState<Row | null>(null),
    notify = useNotify();
  return (
    <>
      <PageTitle eyebrow="实时服务" title="房间">
        <button onClick={resource.reload}>刷新</button>
      </PageTitle>
      <div className="filter-bar">
        <Field label="房间">
          <input
            type="search"
            value={filter.search}
            onChange={(e) =>
              setFilter((f) => ({ ...f, search: e.target.value, page: 1 }))
            }
            placeholder="房间编号或玩家昵称"
          />
        </Field>
        <Field label="状态">
          <select
            value={filter.state}
            onChange={(e) =>
              setFilter((f) => ({ ...f, state: e.target.value, page: 1 }))
            }
          >
            <option value="">全部</option>
            {["lobby", "preparing", "countdown", "playing", "paused", "ended", "draining", "closed"].map((s) => (
              <option value={s} key={s}>
                {stateName[s] ?? s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Panel>
        <Load
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          {resource.data && (
            <>
              <div className="maintenance-row">
                <div>
                  <strong>
                    {resource.data.maintenance
                      ? "部署维护：新开局已停止"
                      : "部署维护：正常接受开局"}
                  </strong>
                  <p className="muted">
                    部署维护独立于玩法开关，不会覆盖管理员关闭的玩法。
                  </p>
                </div>
                <button
                  onClick={() =>
                    setAction({
                      type: "maintenance",
                      enabled: !resource.data!.maintenance,
                    })
                  }
                >
                  {resource.data.maintenance ? "恢复新开局" : "停止新开局"}
                </button>
              </div>
              <div className="room-grid">
                {resource.data.items.map((r: Row) => (
                  <article className="room-card" key={r.id}>
                    <header>
                      <h2>{r.name ?? r.id}</h2>
                      <Badge value={r.state} />
                    </header>
                    <p>
                      {modeName[r.mode === "pvp" ? r.variant : r.mode] ?? r.mode} · {r.players.length} 人
                      {r.stale ? " · 状态待刷新" : ""}
                    </p>
                    <ul className="room-players">
                      {r.players.map((p: Row | string, i: number) => {
                        const v =
                          typeof p === "string" ? { id: p, nickname: p } : p;
                        return (
                          <li key={v.id ?? i}>
                            <span>{v.nickname ?? v.name ?? v.id}</span>
                            <button
                              onClick={() =>
                                setAction({
                                  type: "player",
                                  room: r,
                                  player: v,
                                })
                              }
                            >
                              管理
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    <small>最近更新 {stamp(r.updated)}</small>
                    <button
                      className="danger"
                      onClick={() => setAction({ type: "close", room: r })}
                    >
                      结束房间
                    </button>
                  </article>
                ))}
              </div>
              {!resource.data.items.length && (
                <Empty>没有符合条件的房间。</Empty>
              )}
              <Pager
                page={filter.page}
                size={30}
                total={resource.data.total}
                count={resource.data.items.length}
                onChange={(page) => setFilter((f) => ({ ...f, page }))}
              />
            </>
          )}
        </Load>
      </Panel>
      <RoomCommands key={commandRevision}/>
      {action &&
        (action.type === "player" ? (
          <RoomPlayer
            item={action}
            onClose={() => setAction(null)}
            onSaved={() => {
              setAction(null);
              resource.reload();
              notify("房间指令已发送");
              refreshCommands(v=>v+1);
            }}
          />
        ) : (
          <Confirm
            title={
              action.type === "maintenance"
                ? action.enabled
                  ? "停止新开局"
                  : "恢复新开局"
                : "结束房间"
            }
            description={
              action.type === "maintenance"
                ? "已开始的比赛继续进行，玩家无需离开。"
                : "此操作会中断房间内的比赛，不授予胜利。"
            }
            reason={action.type === "close"}
            danger={action.type === "close"}
            onClose={() => setAction(null)}
            onConfirm={async (reason) => {
              await api(
                action.type === "maintenance"
                  ? "rooms/maintenance"
                  : "rooms/" + action.room.id,
                action.type === "maintenance"
                  ? { enabled: action.enabled }
                  : { action: "close", reason },
              );
              resource.reload();
              notify("设置已提交");
              refreshCommands(v=>v+1);
            }}
          />
        ))}
    </>
  );
}
function RoomPlayer({
  item,
  onClose,
  onSaved,
}: {
  item: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [action, setAction] = useState("kick"),
    [minutes, setMinutes] = useState(60),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  return (
    <Dialog
      title={"管理 " + (item.player.nickname ?? item.player.id)}
      onClose={() => !busy && onClose()}
      dirty={!!reason || action !== "kick" || minutes !== 60}
    >
      <Field label="处理方式">
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="kick">移出当前房间</option>
          <option value="temp-ban">移出并临时限制联机</option>
        </select>
      </Field>
      {action === "temp-ban" && (
        <Field label="限制分钟数（5—1440）">
          <input
            type="number"
            min={5}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </Field>
      )}
      <Field label="原因">
        <textarea
          rows={3}
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <FormError error={error} />
      {confirm && (
        <p className="confirm-inline">该玩家将被移出房间；本机游玩不受影响。</p>
      )}
      <div className="actions">
        <button disabled={busy} data-dialog-dismiss onClick={onClose}>取消</button>
        <button
          className="danger"
          disabled={busy || reason.trim().length < 4}
          onClick={async () => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            setBusy(true);
            try {
              await api("rooms/" + item.room.id, {
                action,
                minutes,
                reason,
                playerId: item.player.id,
              });
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          确认处理
        </button>
      </div>
    </Dialog>
  );
}
function RoomCommands(){
  const r=useResource('room-commands');
  const actions:Record<string,string>={kick:'移出玩家',close:'结束房间'};
  const states:Record<string,string>={queued:'等待工作进程',acknowledged:'已接收处理',timeout:'等待超时'};
  return <Panel title="最近房间操作回执" actions={<button onClick={r.reload}>刷新回执</button>}><p className="muted">提交成功表示指令已排队。超过60秒未确认标记等待超时，指令仍可能执行；已接收处理表示工作进程完成接收流程。</p><Load loading={r.loading} error={r.error} retry={r.reload}>{r.data?.items.length?<div className="table-scroll"><table><thead><tr><th>房间</th><th>操作</th><th>状态</th><th>时间</th></tr></thead><tbody>{r.data.items.map((v:Row)=><tr key={v.id}><td>{v.roomId}</td><td>{actions[v.action]??v.action}<small>{v.playerId??''}</small></td><td className="command-state">{states[v.state]??v.state}</td><td>{stamp(v.created)}</td></tr>)}</tbody></table></div>:<Empty>暂无房间操作。</Empty>}</Load></Panel>;
}
