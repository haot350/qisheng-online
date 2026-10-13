import { useState } from "react";
import { api, modeName, stamp, useResource, type Row } from "../api";
import {
  Badge,
  BeijingInput,
  Dialog,
  Empty,
  Field,
  FormError,
  Load,
  PageTitle,
  Panel,
  useNotify,
} from "../ui";
const MODES = [
  "story",
  "roam",
  "dafei",
  "escape-solo",
  "escape-coop",
  "escape-tdm",
  "escape-ffa",
];
export default function Operations() {
  const resource = useResource("game-config"),
    [edit, setEdit] = useState<Row | null>(null),
    notify = useNotify();
  const config = resource.data;
  return (
    <>
      <PageTitle eyebrow="运营" title="玩法与通知">
        <button onClick={resource.reload}>刷新</button>
      </PageTitle>
      <Load
        loading={resource.loading}
        error={resource.error}
        retry={resource.reload}
      >
        {config && (
          <>
            <Panel title="玩法开关">
              <p className="muted">
                关闭后不再接受新开局；正在进行的对局与有效席位重连继续开放。
              </p>
              <div className="mode-grid">
                {MODES.map((id) => (
                  <article className="mode-card" key={id}>
                    <div>
                      <h3>{modeName[id]}</h3>
                      <span
                        className={
                          "availability " +
                          (config.modes[id].enabled ? "open" : "")
                        }
                      >
                        {config.modes[id].enabled ? "开放中" : "暂时关闭"}
                      </span>
                    </div>
                    {config.modes[id].reason && (
                      <p>{config.modes[id].reason}</p>
                    )}
                    <button
                      onClick={() =>
                        setEdit({ type: "mode", id, ...config.modes[id] })
                      }
                    >
                      管理
                    </button>
                  </article>
                ))}
              </div>
            </Panel>
            <Panel
              title="通知"
              actions={
                <button
                  className="primary"
                  onClick={() =>
                    setEdit({
                      type: "notice",
                      title: "",
                      body: "",
                      priority: "normal",
                      audiences: [],
                      startsAt: "",
                      endsAt: null,
                      status: "draft",
                      link: "",
                    })
                  }
                >
                  新建通知
                </button>
              }
            >
              <div className="notice-list">
                {config.announcements.length ? (
                  config.announcements.map((r: Row) => (
                    <article key={r.id}>
                      <div>
                        <Badge value={r.status === "published" ? (Date.parse(r.startsAt) > Date.now() ? "scheduled" : r.endsAt && Date.parse(r.endsAt) <= Date.now() ? "expired" : "published") : r.status} />
                        <h3>{r.title}</h3>
                        <p>{r.body}</p>
                        <small>
                          {r.priority === "important" ? "重要 · " : ""}
                          {r.audiences.length
                            ? r.audiences
                                .map((m: string) => modeName[m])
                                .join("、")
                            : "全部玩法"}{" "}
                          · {r.startsAt ? stamp(r.startsAt) : "发布时生效"}
                          {r.endsAt ? " 至 " + stamp(r.endsAt) : ""}
                        </small>
                      </div>
                      <button onClick={() => setEdit({ type: "notice", ...r })}>
                        编辑
                      </button>
                    </article>
                  ))
                ) : (
                  <Empty>还没有通知。发布后会出现在游戏顶部。</Empty>
                )}
              </div>
            </Panel>
          </>
        )}
      </Load>
      {edit && config && (
        <OperationEditor
          key={edit.id ?? "new"}
          item={edit}
          revision={config.revision}
          onClose={() => setEdit(null)}
          onSaved={(result) => {
            resource.setData(result);
            notify(edit.type === "mode" ? "玩法设置已保存" : "通知已保存");
            setEdit(null);
          }}
        />
      )}
    </>
  );
}
function OperationEditor({
  item,
  revision,
  onClose,
  onSaved,
}: {
  item: Row;
  revision: number;
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const [draft, setDraft] = useState(item),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState("");
  const dirty = JSON.stringify(draft) !== JSON.stringify(item),
    patch = (key: string, value: any) =>
      setDraft((d) => ({ ...d, [key]: value }));
  async function save(status?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api(
        item.type === "mode" ? "game-config/modes" : "announcements",
        item.type === "mode"
          ? {
              expectedRevision: revision,
              modes: {
                [item.id]: {
                  enabled: draft.enabled,
                  reason: draft.reason ?? "",
                },
              },
            }
          : {
              id: item.id,
              expectedRevision: revision,
              title: draft.title,
              body: draft.body,
              priority: draft.priority,
              audiences: draft.audiences,
              status: status ?? draft.status,
              startsAt: draft.startsAt || null,
              endsAt: draft.endsAt || null,
              link: draft.link || null,
            },
      );
      onSaved(result);
    } catch (e) {
      setError((e as Error).message);
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        item.type === "mode"
          ? modeName[item.id]
          : item.id
            ? "编辑通知"
            : "新建通知"
      }
      dirty={dirty}
      onClose={() => !busy && onClose()}
    >
      {item.type === "mode" ? (
        <>
          <Field label="是否允许进入">
            <select
              value={draft.enabled ? "open" : "closed"}
              onChange={(e) => patch("enabled", e.target.value === "open")}
            >
              <option value="open">开放</option>
              <option value="closed">关闭</option>
            </select>
          </Field>
          <Field
            label="给玩家的说明（选填）"
            hint="留空时显示“该玩法暂时不可用，请稍后再试”。"
          >
            <textarea
              rows={3}
              maxLength={300}
              value={draft.reason ?? ""}
              onChange={(e) => patch("reason", e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="标题">
            <input
              required
              maxLength={80}
              value={draft.title}
              onChange={(e) => patch("title", e.target.value)}
            />
          </Field>
          <Field label="正文">
            <textarea
              rows={4}
              maxLength={2000}
              value={draft.body}
              onChange={(e) => patch("body", e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="级别">
              <select
                value={draft.priority}
                onChange={(e) => patch("priority", e.target.value)}
              >
                <option value="normal">普通</option>
                <option value="important">重要</option>
              </select>
            </Field>
            <Field label="站内链接（选填）">
              <input
                value={draft.link ?? ""}
                placeholder="/"
                onChange={(e) => patch("link", e.target.value)}
              />
            </Field>
            <Field label="开始时间（北京时间）" hint="留空为发布时立即生效。">
              <BeijingInput
                value={draft.startsAt ?? ""}
                onChange={(v) => patch("startsAt", v)}
              />
            </Field>
            <Field label="结束时间（北京时间，选填）">
              <BeijingInput
                value={draft.endsAt ?? ""}
                onChange={(v) => patch("endsAt", v)}
              />
            </Field>
          </div>
          <fieldset>
            <legend>显示范围</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={!draft.audiences.length}
                onChange={() => patch("audiences", [])}
              />
              全部玩法
            </label>
            <div className="checks">
              {MODES.map((m) => (
                <label className="check" key={m}>
                  <input
                    type="checkbox"
                    checked={draft.audiences.includes(m)}
                    onChange={(e) =>
                      patch(
                        "audiences",
                        e.target.checked
                          ? [...draft.audiences, m]
                          : draft.audiences.filter((x: string) => x !== m),
                      )
                    }
                  />
                  {modeName[m]}
                </label>
              ))}
            </div>
          </fieldset>
          <section className="notice-preview" aria-label="通知预览">
            <span>
              {draft.priority === "important" ? "重要通知" : "游戏通知"}
            </span>
            <h3>{draft.title || "通知标题"}</h3>
            <p>{draft.body || "这里预览玩家看到的内容。"}</p>
            {draft.link && <small>查看详情 →</small>}
          </section>
        </>
      )}
      <FormError error={error} />
      {confirm ? (
        <div className="confirm-inline">
          <strong>
            {confirm === "mode"
              ? draft.enabled
                ? "确认重新开放？"
                : "确认关闭此玩法？"
              : confirm === "withdrawn"
                ? "确认撤下通知？"
                : "确认向玩家发布这条通知？"}
          </strong>
          <p>
            {confirm === "mode"
              ? "已开始的比赛不受影响。"
              : "请核对正文、显示范围和生效时间。"}
          </p>
          <div className="actions">
            <button disabled={busy} onClick={() => setConfirm("")}>
              返回编辑
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => save(confirm === "mode" ? undefined : confirm)}
            >
              {busy ? "正在保存…" : "确认"}
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button disabled={busy} data-dialog-dismiss onClick={onClose}>
            取消
          </button>
          {item.type === "mode" ? (
            <button
              className="primary"
              disabled={busy}
              onClick={() => setConfirm("mode")}
            >
              保存设置
            </button>
          ) : (
            <>
              <button
                disabled={busy || !draft.title.trim() || !draft.body.trim()}
                onClick={() => save("draft")}
              >
                保存草稿
              </button>
              {item.id && item.status === "published" && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => setConfirm("withdrawn")}
                >
                  撤下
                </button>
              )}
              <button
                className="primary"
                disabled={busy || !draft.title.trim() || !draft.body.trim()}
                onClick={() => setConfirm("published")}
              >
                {draft.startsAt && Date.parse(draft.startsAt) > Date.now()
                  ? "定时发布"
                  : "发布通知"}
              </button>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
