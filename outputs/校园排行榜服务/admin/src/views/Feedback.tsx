import { useState } from "react";
import {
  api,
  has,
  modeName,
  query,
  stamp,
  stateName,
  useResource,
  useSavedState,
  type Administrator,
  type Row,
} from "../api";
import {
  Badge,
  BeijingInput,
  Confirm,
  Dialog,
  Empty,
  ErrorBox,
  Field,
  FormError,
  KeyValues,
  ListSelect,
  Load,
  PageTitle,
  Pager,
  Panel,
  useNotify,
} from "../ui";
export default function Feedback({
  administrator,
}: {
  administrator: Administrator;
}) {
  const [filter, setFilter] = useSavedState("feedback-filter", {
      status: "received",
      search: "",
      mode: "",
      version: "",
      from: "",
      to: "",
      page: 1,
    }),
    [selected, select] = useSavedState("feedback-selected", "");
  const list = useResource("feedback?" + query(filter)),
    detail = useResource(
      selected ? "feedback/" + encodeURIComponent(selected) : null,
    ),
    [action, setAction] = useState(""),
    notify = useNotify();
  const update = (key: string, value: string | number) =>
    setFilter((f) => ({
      ...f,
      [key]: value,
      ...(key !== "page" ? { page: 1 } : {}),
    }));
  function saved(r?: Row) {
    if (r) detail.setData(r);
    else detail.reload();
    list.reload();
    setAction("");
    notify("处理结果已保存");
  }
  return (
    <>
      <PageTitle eyebrow="玩家支持" title="反馈">
        <button
          onClick={() => {
            list.reload();
            detail.reload();
          }}
        >
          刷新
        </button>
      </PageTitle>
      <div className="filter-bar">
        <Field label="状态">
          <select
            value={filter.status}
            onChange={(e) => update("status", e.target.value)}
          >
            {["all", "received", "triaged", "resolved", "closed"].map((v) => (
              <option key={v} value={v}>
                {v === "all" ? "全部状态" : stateName[v]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="搜索">
          <input
            type="search"
            value={filter.search}
            placeholder="标题、内容或编号"
            onChange={(e) => update("search", e.target.value)}
          />
        </Field>
        <details className="filter-more">
          <summary>更多筛选</summary>
          <div className="filter-pop">
            <Field label="版本">
              <input
                value={filter.version}
                onChange={(e) => update("version", e.target.value)}
                placeholder="0.6.9"
              />
            </Field>
            <Field label="玩法">
              <select
                value={filter.mode}
                onChange={(e) => update("mode", e.target.value)}
              >
                <option value="">全部</option>
                {["story", "roam", "dafei", "escape", "coop", "tdm", "ffa"].map(
                  (v) => (
                    <option key={v} value={v}>
                      {modeName[v]}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="起始日期">
              <input
                type="date"
                value={filter.from}
                onChange={(e) => update("from", e.target.value)}
              />
            </Field>
            <Field label="截止日期">
              <input
                type="date"
                value={filter.to}
                onChange={(e) => update("to", e.target.value)}
              />
            </Field>
          </div>
        </details>
      </div>
      <div className={"split-view " + (selected ? "has-selection" : "")}>
        <Panel>
          <Load loading={list.loading} error={list.error} retry={list.reload}>
            {list.data && (
              <>
                <ListSelect
                  items={list.data.items}
                  selected={selected}
                  onSelect={select}
                  render={(r) => (
                    <>
                      <div className="record-top">
                        <Badge value={r.status} />
                        <small>{stamp(r.updatedAt)}</small>
                      </div>
                      <h3>{r.title}</h3>
                      <p>{r.latestReply?.message ?? r.message ?? "尚未回复"}</p>
                    </>
                  )}
                />
                <Pager
                  page={filter.page}
                  total={list.data.total}
                  onChange={(p) => update("page", p)}
                />
              </>
            )}
          </Load>
        </Panel>
        <Panel>
          <button className="mobile-back" onClick={() => select("")}>
            ← 返回列表
          </button>
          <Load
            loading={detail.loading}
            error={detail.error}
            retry={detail.reload}
          >
            {detail.data ? (
              <>
                <div className="detail-title">
                  <Badge value={detail.data.status} />
                  <h2>{detail.data.title}</h2>
                  <small>收到于 {stamp(detail.data.createdAt)}</small>
                </div>
                <section className="original-message">
                  <h3>玩家原文</h3>
                  <p>{detail.data.message}</p>
                  {detail.data.images?.length > 0 && (
                    <div className="screenshots">
                      {detail.data.images.map((im: Row) => (
                        <a
                          href={"/admin/images/" + im.id}
                          target="_blank"
                          rel="noreferrer"
                          key={im.id}
                        >
                          <img
                            src={"/admin/images/" + im.id}
                            alt="玩家附图"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </section>
                {detail.data.followups?.map((f: Row) => (
                  <article className="message" key={f.id}>
                    <strong>玩家补充 · {stamp(f.createdAt)}</strong>
                    <p>{f.message}</p>
                  </article>
                ))}
                {detail.data.resolution && (
                  <section className="resolution-box">
                    <h3>处理结果</h3>
                    <p>{detail.data.resolution.summary}</p>
                    <small>
                      {detail.data.resolution.version ??
                        stamp(detail.data.resolution.effectiveAt)}
                    </small>
                  </section>
                )}
                <section>
                  <h3>私人回复</h3>
                  {detail.data.replies?.length ? (
                    detail.data.replies.map((r: Row) => (
                      <article className="message" key={r.id}>
                        <small>{stamp(r.createdAt)}</small>
                        <p>{r.message}</p>
                      </article>
                    ))
                  ) : (
                    <p className="muted">尚未回复。</p>
                  )}
                </section>
                <section className="association">
                  <h3>关联议题</h3>
                  {detail.data.issueId ? (
                    <a
                      href={
                        "#issues/" + encodeURIComponent(detail.data.issueId)
                      }
                    >
                      {detail.data.issue?.title ?? "查看关联议题"} →
                    </a>
                  ) : (
                    <p className="muted">尚未关联。</p>
                  )}
                </section>
                {detail.data.diagnostics && (
                  <details>
                    <summary>设备与诊断</summary>
                    <KeyValues
                      items={Object.fromEntries(
                        Object.entries(detail.data.diagnostics).map(
                          ([k, v]) => [
                            (
                              {
                                version: "游戏版本",
                                mode: "玩法",
                                controls: "操作方式",
                                browser: "浏览器",
                                os: "系统",
                                viewport: "画面尺寸",
                                errorCode: "错误摘要",
                              } as Row
                            )[k] ?? k,
                            String(v),
                          ],
                        ),
                      )}
                    />
                  </details>
                )}
                <div className="detail-actions">
                  <button
                    className="primary"
                    onClick={() => setAction("reply")}
                  >
                    回复玩家
                  </button>
                  <button onClick={() => setAction("associate")}>
                    关联议题
                  </button>
                  {!["resolved", "closed"].includes(detail.data.status) ? (
                    <>
                      <button onClick={() => setAction("resolve")}>
                        标记已解决
                      </button>
                      <button onClick={() => setAction("close")}>
                        关闭反馈
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setAction("reopen")}>
                      重新处理
                    </button>
                  )}
                </div>
              </>
            ) : (
              !selected && <Empty>从左侧选择一条反馈。</Empty>
            )}
          </Load>
        </Panel>
      </div>
      {action &&
        detail.data &&
        (action === "reply" || action === "associate" ? (
          <FeedbackEdit
            action={action}
            item={detail.data}
            onClose={() => setAction("")}
            onSaved={saved}
          />
        ) : action === "resolve" ? (
          <ResolutionEditor
            endpoint={"feedback/" + detail.data.id + "/resolve"}
            title="标记已解决"
            canPublish={true}
            expectedUpdatedAt={detail.data.updatedAt}
            onClose={() => setAction("")}
            onSaved={saved}
          />
        ) : (
          <Confirm
            title={action === "close" ? "关闭反馈" : "重新处理"}
            action={action === "close" ? "关闭反馈" : "重新处理"}
            reason
            description={
              action === "close"
                ? "适用于未采纳、重复或暂时无法复现的反馈。关闭不会显示为已解决，说明将发给玩家。"
                : "向玩家说明继续处理的原因。"
            }
            onClose={() => setAction("")}
            onConfirm={async (reason) => {
              const r = await api("feedback/" + detail.data!.id + "/process", {
                action,
                reason,
                requestId: crypto.randomUUID(),
                expectedUpdatedAt: detail.data!.updatedAt,
              });
              saved(r);
            }}
          />
        ))}
    </>
  );
}
function FeedbackEdit({
  action,
  item,
  onClose,
  onSaved,
}: {
  action: string;
  item: Row;
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [id, setId] = useState(item.issueId ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const issues = useResource(
    action === "associate" ? "issues?" + query({ search }) : null,
  );
  return (
    <Dialog
      title={action === "reply" ? "回复玩家" : "关联议题"}
      onClose={() => !busy && onClose()}
      dirty={!!text || id !== (item.issueId ?? "")}
    >
      {action === "reply" ? (
        <Field label="仅此玩家可见">
          <textarea
            rows={5}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </Field>
      ) : (
        <>
          <Field label="搜索议题">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Load
            loading={issues.loading}
            error={issues.error}
            retry={issues.reload}
          >
            <Field label="关联至">
              <select value={id} onChange={(e) => setId(e.target.value)}>
                <option value="">不关联</option>
                {issues.data?.items.map((r: Row) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </Field>
          </Load>
          <p className="muted">关联不会公开玩家的原文或截图。</p>
        </>
      )}
      <FormError error={error} />
      <div className="actions">
        <button disabled={busy} data-dialog-dismiss onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          disabled={busy || (action === "reply" && !text.trim())}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              onSaved(
                await api("feedback/" + item.id, {
                  expectedUpdatedAt: item.updatedAt,
                  ...(action === "reply"
                    ? {
                        reply: text,
                        ...(item.status === "received" ? { status: "triaged" } : {}),
                      }
                    : { issueId: id || null }),
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在保存…" : action === "reply" ? "发送回复" : "保存关联"}
        </button>
      </div>
    </Dialog>
  );
}
export function ResolutionEditor({
  endpoint,
  title,
  canPublish,
  expectedUpdatedAt,
  onClose,
  onSaved,
}: {
  endpoint: string;
  title: string;
  canPublish: boolean;
  expectedUpdatedAt?: number;
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const [kind, setKind] = useState("server"),
    [summary, setSummary] = useState(""),
    [releaseId, setRelease] = useState(""),
    [effectiveAt, setEffective] = useState(new Date().toISOString()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const releases = useResource(canPublish ? "releases" : null);
  return (
    <Dialog title={title} onClose={() => !busy && onClose()} dirty={!!summary}>
      <Field label="处理类型">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {canPublish && <option value="client">客户端修复</option>}
          <option value="server">服务器修复</option>
          <option value="answer">答疑完成</option>
        </select>
      </Field>
      {kind === "client" ? (
        <>
          <Load
            loading={releases.loading}
            error={releases.error}
            retry={releases.reload}
          >
            <Field label="实际上线的版本">
              <select
                value={releaseId}
                onChange={(e) => setRelease(e.target.value)}
              >
                <option value="">请选择</option>
                {releases.data?.items
                  .filter(
                    (r: Row) =>
                      r.published &&
                      (r.deployed || r.deployedAt || r.deployment),
                  )
                  .map((r: Row) => (
                    <option key={r.id} value={r.id}>
                      {r.version} · {r.date}
                    </option>
                  ))}
              </select>
            </Field>
          </Load>
          <p className="muted">只有完成部署复检的版本可用于客户端修复。</p>
        </>
      ) : (
        <Field label="生效时间（北京时间）">
          <BeijingInput value={effectiveAt} onChange={setEffective} />
        </Field>
      )}
      <Field label="给玩家的处理结果">
        <textarea
          rows={4}
          minLength={4}
          maxLength={2000}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
        />
      </Field>
      <FormError error={error} />
      <div className="actions">
        <button disabled={busy} data-dialog-dismiss onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          disabled={
            busy ||
            summary.trim().length < 4 ||
            (kind === "client" && !releaseId)
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              onSaved(
                await api(endpoint, {
                  kind,
                  summary,
                  releaseId: releaseId || undefined,
                  effectiveAt: Date.parse(effectiveAt),
                  requestId: crypto.randomUUID(),
                  expectedUpdatedAt,
                }),
              );
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在保存…" : "确认解决并通知玩家"}
        </button>
      </div>
    </Dialog>
  );
}
