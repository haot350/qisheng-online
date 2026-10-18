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
export {default as Rooms} from './Rooms';
