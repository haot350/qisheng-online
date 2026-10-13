import { useEffect, useState } from "react";
import {
  api,
  has,
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
  Confirm,
  Dialog,
  Empty,
  Field,
  FormError,
  ListSelect,
  Load,
  PageTitle,
  Pager,
  Panel,
  useNotify,
} from "../ui";
import { ResolutionEditor } from "./Feedback";
const states = [
  "evaluating",
  "planned",
  "developing",
  "verification",
  "released",
  "wontfix",
];
function linkedIssue() {
  try { return decodeURIComponent(location.hash.split("/")[1] ?? ""); }
  catch { return ""; }
}
export default function Issues({
  administrator,
}: {
  administrator: Administrator;
}) {
  const [filter, setFilter] = useSavedState("issues-filter", {
      status: "",
      search: "",
      published: "",
      page: 1,
    }),
    [selected, select] = useSavedState(
      "issues-selected",
      linkedIssue(),
    ),
    [edit, setEdit] = useState<Row | null>(null),
    [resolve, setResolve] = useState(false),
    [batch, setBatch] = useState(false);
  useEffect(() => {
    const sync = () => { const id = linkedIssue(); if (id) select(id); };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [select]);
  const list = useResource("issues?" + query(filter)),
    detail = useResource(selected ? "issues/" + selected : null),
    notify = useNotify();
  const update = (key: string, value: string | number) =>
    setFilter((f) => ({
      ...f,
      [key]: value,
      ...(key !== "page" ? { page: 1 } : {}),
    }));
  function saved(r?: Row) {
    list.reload();
    if (r) { if (r.id && r.id !== selected) select(r.id); detail.setData(r); }
    else detail.reload();
    setEdit(null);
    setResolve(false);
    notify("议题已保存");
  }
  return (
    <>
      <PageTitle eyebrow="反馈进展" title="议题">
        <button
          className="primary"
          onClick={() =>
            setEdit({
              title: "",
              description: "",
              internalNote: "",
              status: "evaluating",
              published: false,
            })
          }
        >
          新建议题
        </button>
      </PageTitle>
      <div className="filter-bar">
        <Field label="搜索">
          <input
            type="search"
            value={filter.search}
            placeholder="标题或编号"
            onChange={(e) => update("search", e.target.value)}
          />
        </Field>
        <Field label="状态">
          <select
            value={filter.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="">全部</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {stateName[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="可见范围">
          <select
            value={filter.published}
            onChange={(e) => update("published", e.target.value)}
          >
            <option value="">全部</option>
            <option value="true">公开</option>
            <option value="false">内部草稿</option>
          </select>
        </Field>
        <button onClick={list.reload}>刷新</button>
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
                        <small>{r.published ? "公开" : "草稿"}</small>
                      </div>
                      <h3>{r.title}</h3>
                      <p>{r.description}</p>
                      <small>{stamp(r.updatedAt)}</small>
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
                <Badge value={detail.data.status} />
                <div className="detail-title">
                  <h2>{detail.data.title}</h2>
                  <small>
                    {detail.data.published ? "公开议题" : "内部草稿"} ·{" "}
                    {stamp(detail.data.updatedAt)}
                  </small>
                </div>
                <h3>公开问题摘要</h3>
                <p className="prewrap">{detail.data.description}</p>
                {detail.data.resolution && (
                  <div className="resolution-box">
                    <h3>实际处理结果</h3>
                    <p>{detail.data.resolution.summary}</p>
                    <small>
                      {detail.data.resolution.version ??
                        stamp(detail.data.resolution.effectiveAt)}
                    </small>
                  </div>
                )}
                <section>
                  <h3>公开答复</h3>
                  {detail.data.replies?.length ? (
                    detail.data.replies.map((r: Row) => (
                      <article className="message" key={r.id}>
                        <div className="record-top">
                          <Badge value={r.status} />
                          <small>{stamp(r.updatedAt)}</small>
                        </div>
                        <p>{r.message}</p>
                        <button
                          onClick={() =>
                            setEdit({
                              type: "reply",
                              ...r,
                              issueId: detail.data!.id,
                            })
                          }
                        >
                          修订或撤下
                        </button>
                      </article>
                    ))
                  ) : (
                    <p className="muted">尚无公开答复。</p>
                  )}
                  <button
                    onClick={() =>
                      setEdit({
                        type: "reply",
                        issueId: detail.data!.id,
                        message: "",
                        status: "draft",
                      })
                    }
                  >
                    撰写公开答复
                  </button>
                </section>
                <section className="internal-note">
                  <h3>内部备注</h3>
                  <p>{detail.data.internalNote || "尚无备注。"}</p>
                </section>
                <div className="detail-actions">
                  <button
                    className="primary"
                    onClick={() => setEdit(detail.data)}
                  >
                    编辑议题
                  </button>
                  {has(administrator, "publish") && (
                    <button onClick={() => setResolve(true)}>标记已解决</button>
                  )}
                  <button onClick={() => setBatch(true)}>查看关联反馈</button>
                </div>
              </>
            ) : (
              !selected && <Empty>从左侧选择议题，或新建一个问题摘要。</Empty>
            )}
          </Load>
        </Panel>
      </div>
      {edit &&
        (edit.type === "reply" ? (
          <ReplyEditor
            item={edit}
            onClose={() => setEdit(null)}
            onSaved={saved}
          />
        ) : (
          <IssueEditor
            item={edit}
            onClose={() => setEdit(null)}
            onSaved={saved}
          />
        ))}
      {resolve && detail.data && (
        <ResolutionEditor
          endpoint={"issues/" + selected + "/resolve"}
          title="记录议题处理结果"
          canPublish={has(administrator, "publish")}
          expectedUpdatedAt={detail.data.updatedAt}
          onClose={() => setResolve(false)}
          onSaved={saved}
        />
      )}{" "}
      {batch && detail.data && (
        <LinkedFeedback issue={detail.data} onClose={() => setBatch(false)} />
      )}
    </>
  );
}
function IssueEditor({
  item,
  onClose,
  onSaved,
}: {
  item: Row;
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const [form, setForm] = useState({ ...item }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const patch = (key: string, value: any) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function save() {
    setBusy(true);
    setError("");
    try {
      onSaved(
        await api("issues", { ...form, expectedUpdatedAt: item.updatedAt }),
      );
    } catch (e) {
      setError((e as Error).message);
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={item.id ? "编辑议题" : "新建议题"}
      dirty={JSON.stringify(item) !== JSON.stringify(form)}
      onClose={() => !busy && onClose()}
    >
      <Field label="标题">
        <input
          value={form.title}
          maxLength={100}
          onChange={(e) => patch("title", e.target.value)}
        />
      </Field>
      <Field
        label="公开问题摘要"
        hint="只描述问题和影响，不粘贴私人原文、截图或诊断。"
      >
        <textarea
          rows={4}
          maxLength={4000}
          value={form.description}
          onChange={(e) => patch("description", e.target.value)}
        />
      </Field>
      <div className="form-grid">
        <Field label="处理阶段">
          <select
            value={form.status}
            onChange={(e) => patch("status", e.target.value)}
          >
            {states
              .filter((s) => s !== "released" || item.status === "released")
              .map((s) => (
                <option key={s} value={s}>
                  {stateName[s]}
                </option>
              ))}
          </select>
        </Field>
        <Field label="可见范围">
          <select
            value={form.published ? "true" : "false"}
            onChange={(e) => patch("published", e.target.value === "true")}
          >
            <option value="false">内部草稿</option>
            <option value="true">公开看板</option>
          </select>
        </Field>
      </div>
      <Field label="内部备注（仅管理员可见）">
        <textarea
          rows={3}
          value={form.internalNote ?? ""}
          maxLength={4000}
          onChange={(e) => patch("internalNote", e.target.value)}
        />
      </Field>
      <FormError error={error} />
      {confirm && (
        <p className="confirm-inline">
          此修改将立即展示在公开看板，请确认摘要适合公开。
        </p>
      )}
      <div className="actions">
        <button disabled={busy} data-dialog-dismiss onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          disabled={
            busy ||
            form.title.trim().length < 4 ||
            form.description.trim().length < 10
          }
          onClick={() =>
            form.published && !confirm ? setConfirm(true) : void save()
          }
        >
          {busy ? "正在保存…" : confirm ? "确认发布" : "保存议题"}
        </button>
      </div>
    </Dialog>
  );
}
function ReplyEditor({
  item,
  onClose,
  onSaved,
}: {
  item: Row;
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const [message, setMessage] = useState(item.message),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState("");
  async function save(status: string) {
    setBusy(true);
    setError("");
    try {
      onSaved(
        await api("issues/" + item.issueId + "/replies", {
          id: item.id,
          message,
          status,
          expectedUpdatedAt: item.updatedAt,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="公开答复" onClose={() => !busy && onClose()} dirty={message !== item.message}>
      <Field label="以“开发者”身份公开显示">
        <textarea
          rows={6}
          value={message}
          maxLength={2000}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      <FormError error={error} />
      {confirm ? (
        <div className="confirm-inline">
          <p>
            {confirm === "published"
              ? "确认发布这条公开答复？"
              : "确认撤下这条公开答复？审计记录仍会保留。"}
          </p>
          <div className="actions">
            <button onClick={() => setConfirm("")}>返回编辑</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save(confirm)}
            >
              确认
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button
            disabled={busy || !message.trim()}
            onClick={() => void save("draft")}
          >
            保存草稿
          </button>
          {item.id && item.status === "published" && (
            <button className="danger" onClick={() => setConfirm("withdrawn")}>
              撤下
            </button>
          )}
          <button
            className="primary"
            disabled={!message.trim()}
            onClick={() => setConfirm("published")}
          >
            发布答复
          </button>
        </div>
      )}
    </Dialog>
  );
}
function LinkedFeedback({
  issue,
  onClose,
}: {
  issue: Row;
  onClose: () => void;
}) {
  const data = useResource("issues/" + issue.id + "/linked-feedback"),
    [ids, setIds] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    notify = useNotify();
  return (
    <Dialog title="关联反馈" onClose={() => !busy && onClose()}>
      <Load loading={data.loading} error={data.error} retry={data.reload}>
        {data.data?.items.length ? (
          data.data.items.map((r: Row) => (
            <label className="select-record" key={r.id}>
              <input
                type="checkbox"
                disabled={r.status === "resolved"}
                checked={ids.includes(r.id)}
                onChange={(e) =>
                  setIds((old) =>
                    e.target.checked
                      ? [...old, r.id]
                      : old.filter((x) => x !== r.id),
                  )
                }
              />
              <div>
                <strong>{r.title}</strong>
                <div>
                  <Badge value={r.status} />
                  <small>{stamp(r.createdAt)}</small>
                </div>
              </div>
            </label>
          ))
        ) : (
          <Empty>尚未关联反馈。</Empty>
        )}
      </Load>
      {issue.resolution ? (
        <>
          <p>批量解决会将本议题的实际处理结果发送给勾选的玩家。</p>
          <FormError error={error} />
          {confirm && (
            <p className="confirm-inline">
              确认解决 {ids.length} 条反馈并发送私人通知？
            </p>
          )}
          <div className="actions">
            <button disabled={busy} data-dialog-dismiss onClick={onClose}>关闭</button>
            <button
              className="primary"
              disabled={!ids.length || busy}
              onClick={async () => {
                if (!confirm) {
                  setConfirm(true);
                  return;
                }
                setBusy(true);
                try {
                  const r = await api(
                    "issues/" + issue.id + "/resolve-feedback",
                    {
                      feedbackIds: ids,
                      confirmed: true,
                      requestId: crypto.randomUUID(),
                    },
                  );
                  notify("已处理 " + r.changed + " 条反馈");
                  setIds([]);
                  setConfirm(false);
                  data.reload();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在处理…" : confirm ? "确认批量解决" : "解决所选反馈"}
            </button>
          </div>
        </>
      ) : (
        <p className="muted">议题记录实际处理结果后，可批量解决关联反馈。</p>
      )}
    </Dialog>
  );
}
