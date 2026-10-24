import { useState } from "react";
import {UE_WINDOWS_PREVIEW} from '@qisheng/shared/player-content';
import { api, stamp, useResource, type Row } from "../api";
import {
  Dialog,
  Empty,
  Field,
  FormError,
  Load,
  PageTitle,
  Panel,
  useNotify,
} from "../ui";
export default function Releases() {
  const resource = useResource("releases"),
    [edit, setEdit] = useState<Row | null>(null),
    notify = useNotify();
  return (
    <>
      <PageTitle eyebrow="发行记录" title="版本与发布">
        <button
          className="primary"
          onClick={() =>
            setEdit({
              version: "",
              date: new Date(Date.now() + 8 * 3600000)
                .toISOString()
                .slice(0, 10),
              summary: "",
              changes: [],
              published: false,
            })
          }
        >
          添加更新说明
        </button>
      </PageTitle>
      <Panel>
        <p className="muted">
          部署记录由发布复检登记。编辑说明不会把版本标记为已上线。
        </p>
        <Load
          loading={resource.loading}
          error={resource.error}
          retry={resource.reload}
        >
          <div className="release-list">
            {resource.data?.items.length ? (
              resource.data.items.map((r: Row) => (
                <article key={r.id}>
                  <header>
                    <h2>{r.version}</h2>
                    <span>{r.date}</span>
                    <span
                      className={
                        "badge " +
                        (r.deployed || r.deployedAt || r.deployment
                          ? "badge-resolved"
                          : "")
                      }
                    >
                      {r.deployed || r.deployedAt || r.deployment
                        ? "已验证部署"
                        : "尚无部署记录"}
                    </span>
                  </header>
                  <p>{r.summary}</p>
                  <ul>
                    {r.changes.map((x: string, i: number) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                  <div className="record-top">
                    <small>
                      {r.published ? "公开说明" : "内部草稿"}
                      {r.deployedAt ? " · 部署于 " + stamp(r.deployedAt) : ""}
                    </small>
                    <button onClick={() => setEdit(r)}>编辑说明</button>
                  </div>
                </article>
              ))
            ) : (
              <Empty />
            )}
          </div>
        </Load>
      </Panel>
      <Panel title="客户端下载档案">
        <p className="muted">网页与客户端分别编号。独立下载记录不表示网页或实时服务已经更新。</p>
        <div className="release-list">
          <article>
            <header><h2>{UE_WINDOWS_PREVIEW.productName} · {UE_WINDOWS_PREVIEW.title}</h2><span>Preview {UE_WINDOWS_PREVIEW.version}</span><span className="badge">独立实验版</span></header>
            <p>{UE_WINDOWS_PREVIEW.description}</p>
            <p className="muted">{(UE_WINDOWS_PREVIEW.bytes/1_000_000).toFixed(1)} MB · {UE_WINDOWS_PREVIEW.installation}</p>
            <a className="text-link" href={'https://game.tianhw.top'+UE_WINDOWS_PREVIEW.downloadPath} download>下载现有 Windows UE 实验版 →</a>
          </article>
          <article><header><h2>Godot 客户端（历史）</h2><span className="badge">停止更新</span></header><p>Windows 历史发行保留下载；安卓内部包未公开。旧客户端更新通道与 UE 下载相互独立。</p></article>
        </div>
      </Panel>
      {edit && (
        <ReleaseEditor
          item={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            resource.reload();
            notify("版本说明已保存");
          }}
        />
      )}
    </>
  );
}
function ReleaseEditor({
  item,
  onClose,
  onSaved,
}: {
  item: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Row>({
      ...item,
      changes: item.changes.join("\n"),
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const patch = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog
      title="编辑更新说明"
      onClose={() => !busy && onClose()}
      dirty={
        JSON.stringify(form) !==
        JSON.stringify({ ...item, changes: item.changes.join("\n") })
      }
    >
      <div className="form-grid">
        <Field label="版本">
          <input
            placeholder="Preview x.y.z"
            value={form.version}
            onChange={(e) => patch("version", e.target.value)}
          />
        </Field>
        <Field label="实际日期">
          <input
            type="date"
            value={form.date}
            onChange={(e) => patch("date", e.target.value)}
          />
        </Field>
      </div>
      <Field label="一句话摘要">
        <textarea
          value={form.summary}
          rows={2}
          maxLength={400}
          onChange={(e) => patch("summary", e.target.value)}
        />
      </Field>
      <Field label="变化条目，每行一项">
        <textarea
          value={form.changes}
          rows={6}
          onChange={(e) => patch("changes", e.target.value)}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={form.published}
          onChange={(e) => patch("published", e.target.checked)}
        />
        公开此更新说明
      </label>
      <FormError error={error} />
      {confirm && (
        <p className="confirm-inline">
          确认将这些说明公开？是否上线仍以部署记录为准。
        </p>
      )}
      <div className="actions">
        <button disabled={busy} data-dialog-dismiss onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          disabled={
            busy || !form.version || !form.summary || !form.changes.trim()
          }
          onClick={async () => {
            if (form.published && !confirm) {
              setConfirm(true);
              return;
            }
            setBusy(true);
            try {
              await api("releases", {
                ...form,
                changes: form.changes
                  .split("\n")
                  .map((s: string) => s.trim())
                  .filter(Boolean),
                expectedRevision: item.revision,
              });
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "正在保存…" : confirm ? "确认公开" : "保存说明"}
        </button>
      </div>
    </Dialog>
  );
}
