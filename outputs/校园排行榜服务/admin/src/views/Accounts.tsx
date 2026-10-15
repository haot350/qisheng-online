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
  type Administrator,
  type Row,
} from "../api";
import {
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
export const scopes: Record<string, string> = {
  feedback: "反馈与议题",
  publish: "版本与发布",
  ranking: "成绩审核",
  players: "玩家管理",
  'player-accounts': "玩家账号与档案",
  rooms: "房间管理",
  stats: "访问与故障",
  operations: "玩法与通知",
  assistant: "小齐助手运营",
};
export function Accounts({ administrator }: { administrator: Administrator }) {
  const r = useResource(administrator.owner ? "accounts" : null),
    [edit, setEdit] = useState<Row | null>(null),
    [password, setPassword] = useState(false),
    notify = useNotify();
  return (
    <>
      <PageTitle eyebrow="管理身份" title="账号与权限">
        <button onClick={() => setPassword(true)}>修改我的密码</button>
      </PageTitle>
      {administrator.owner && (
        <Panel
          title="管理员账号"
          actions={
            <button
              className="primary"
              onClick={() =>
                setEdit({ username: "", name: "", scopes: [], active: true })
              }
            >
              创建账号
            </button>
          }
        >
          <Load loading={r.loading} error={r.error} retry={r.reload}>
            <div className="account-grid">
              {r.data?.items.map((a: Row) => (
                <article className="account-card" key={a.id}>
                  <h2>{a.name}</h2>
                  <p>
                    {a.username} ·{" "}
                    {a.owner ? "拥有者" : a.active ? "启用" : "停用"}
                  </p>
                  <div className="tags">
                    {a.owner ? (
                      <span className="badge">全部权限</span>
                    ) : (
                      a.scopes.map((s: string) => (
                        <span className="badge" key={s}>
                          {scopes[s] ?? s}
                        </span>
                      ))
                    )}
                  </div>
                  <button onClick={() => setEdit(a)}>编辑权限</button>
                </article>
              ))}
            </div>
          </Load>
        </Panel>
      )}
      {edit && (
        <AccountEdit
          item={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            r.reload();
            notify("管理员账号已保存；该账号需重新登录。");
          }}
        />
      )}
      {password && <Password onClose={() => setPassword(false)} />}
    </>
  );
}
function AccountEdit({
  item,
  onClose,
  onSaved,
}: {
  item: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Row>({ ...item, password: "" }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const patch = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog
      title={item.id ? "编辑管理员" : "创建管理员"}
      onClose={() => !busy && onClose()}
      dirty={JSON.stringify(form) !== JSON.stringify({ ...item, password: "" })}
    >
      <div className="form-grid">
        <Field label="登录账号">
          <input
            value={form.username}
            maxLength={32}
            autoComplete="off"
            onChange={(e) => patch("username", e.target.value)}
          />
        </Field>
        <Field label="显示姓名">
          <input
            value={form.name}
            maxLength={40}
            onChange={(e) => patch("name", e.target.value)}
          />
        </Field>
      </div>
      <Field
        label={item.id ? "新密码（不修改则留空）" : "密码（至少十二字符）"}
      >
        <input
          type="password"
          value={form.password}
          minLength={12}
          autoComplete="new-password"
          onChange={(e) => patch("password", e.target.value)}
        />
      </Field>
      <label className="check">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => patch("active", e.target.checked)}
        />
        启用此账号
      </label>
      {item.owner ? (
        <p>拥有者具有全部权限。</p>
      ) : (
        <fieldset>
          <legend>可使用的工作区</legend>
          <div className="checks">
            {Object.entries(scopes).map(([k, label]) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  checked={form.scopes.includes(k)}
                  onChange={(e) =>
                    patch(
                      "scopes",
                      e.target.checked
                        ? [...form.scopes, k]
                        : form.scopes.filter((s: string) => s !== k),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FormError error={error} />
      {confirm && (
        <p className="confirm-inline">
          保存后该账号的现有管理会话将退出，请确认权限范围。
        </p>
      )}
      <div className="actions">
        <button disabled={busy} data-dialog-dismiss onClick={onClose}>取消</button>
        <button
          className="primary"
          disabled={
            busy ||
            !form.username ||
            !form.name ||
            (!item.id && form.password.length < 12)
          }
          onClick={async () => {
            if (!confirm) {
              setConfirm(true);
              return;
            }
            setBusy(true);
            try {
              await api("accounts", {
                ...form,
                password: form.password || undefined,
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
          确认保存
        </button>
      </div>
    </Dialog>
  );
}
function Password({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    notify = useNotify();
  return (
    <Dialog
      title="修改我的密码"
      onClose={() => !busy && onClose()}
      dirty={!!password || !!currentPassword}
    >
      <Field label="当前密码">
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </Field>
      <Field label="新密码（至少十二字符）">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="再次输入新密码">
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </Field>
      <FormError error={error} />
      <div className="actions">
        <button disabled={busy} data-dialog-dismiss onClick={onClose}>取消</button>
        <button
          className="primary"
          disabled={
            busy ||
            password.length < 12 ||
            password !== repeat ||
            !currentPassword
          }
          onClick={async () => {
            setBusy(true);
            try {
              await api("password", { currentPassword, password });
              notify("密码已修改，其他管理会话已退出。");
              onClose();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          更新密码
        </button>
      </div>
    </Dialog>
  );
}
const detailLabels: Record<string, string> = {
  reason: "原因",
  enabled: "是否启用",
  status: "状态",
  state: "阶段",
  published: "公开",
  restricted: "限制参榜",
  nickname: "昵称",
  playerId: "玩家",
  issueId: "议题",
  releaseId: "版本记录",
  version: "版本",
  changed: "处理数量",
  summary: "处理结果",
  kind: "处理类型",
  effective: "生效时间",
  effectiveAt: "生效时间",
  feedbackIds: "关联反馈",
  scopes: "权限",
  username: "账号",
  active: "启用",
  passwordChanged: "密码已修改",
  replied: "已回复",
  internalNoteChanged: "内部备注已修改",
  summaryChanged: "摘要已修改",
  modes: "玩法设置",
  before: "修改前",
  after: "修改后",
};
function humanValue(v: any): string {
  if (v === null || v === undefined) return "未设置";
  if (typeof v === "boolean") return v ? "是" : "否";
  if (Array.isArray(v)) return v.map(humanValue).join("、");
  if (typeof v === "object")
    return Object.entries(v)
      .map(([k, x]) => (detailLabels[k] ?? modeName[k] ?? k) + "：" + humanValue(x))
      .join("；");
  return stateName[String(v)] ?? modeName[String(v)] ?? scopes[String(v)] ?? String(v);
}
const auditActions: Record<string, string> = {
  'player-account-settings':'调整玩家账号', 'player-account-revoke-sessions':'撤销玩家会话', 'player-account-recompute':'重算竞技成就', 'account-appeal-approved':'批准找回申诉', 'account-appeal-rejected':'拒绝找回申诉',
  'admin-login': '登录后台', 'feedback-update': '更新反馈', 'feedback-resolve': '解决反馈',
  'feedback-close': '关闭反馈', 'feedback-reopen': '重新处理反馈', 'issue-update': '更新公开议题',
  'issue-resolve': '解决议题', 'issue-reply-published': '发布公开答复', 'issue-reply-revised': '修订公开答复',
  'issue-reply-withdrawn': '撤下公开答复', 'release-update': '更新版本说明', 'deployment-verified': '验证部署',
  'mode-availability-update': '调整玩法开放状态', 'announcement-published': '发布通知',
  'announcement-draft': '保存通知草稿', 'announcement-withdrawn': '撤下通知', 'room-kick': '移出玩家',
  'room-close': '关闭房间', 'room-temp-ban': '限制联机', 'room-maintenance': '调整部署维护',
  'admin-account-update': '更新管理员权限', 'admin-password': '更换管理密码', 'player-update': '更新玩家状态',
  approve: '通过成绩审核', reject: '驳回成绩', remove: '下架成绩', 'multiplayer-remove': '下架联机成绩',
  'multiplayer-restore': '恢复联机成绩', 'report-resolve': '处理举报',
};
export function Audit() {
  const [filter, setFilter] = useSavedState("audit", {
      page: 1,
      actor: "",
      action: "",
      target: "",
      from: "",
      to: "",
    }),
    r = useResource("audit?" + query(filter));
  const update = (key: string, value: string | number) =>
    setFilter((f) => ({
      ...f,
      [key]: value,
      ...(key !== "page" ? { page: 1 } : {}),
    }));
  return (
    <>
      <PageTitle eyebrow="操作追溯" title="审计记录">
        <button onClick={r.reload}>刷新</button>
      </PageTitle>
      <div className="filter-bar">
        <Field label="操作者">
          <input
            value={filter.actor}
            onChange={(e) => update("actor", e.target.value)}
            placeholder="姓名或账号"
          />
        </Field>
        <Field label="操作">
          <select
            value={filter.action}
            onChange={(e) => update("action", e.target.value)}
          >
            <option value="">全部操作</option>
            {Object.entries(auditActions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="对象">
          <input
            value={filter.target}
            onChange={(e) => update("target", e.target.value)}
            placeholder="记录编号"
          />
        </Field>
        <Field label="从">
          <input
            type="date"
            value={filter.from}
            onChange={(e) => update("from", e.target.value)}
          />
        </Field>
        <Field label="至">
          <input
            type="date"
            value={filter.to}
            onChange={(e) => update("to", e.target.value)}
          />
        </Field>
      </div>
      <Panel>
        <Load loading={r.loading} error={r.error} retry={r.reload}>
          {r.data && (
            <>
              <div className="audit-list">
                {r.data.items.map((a: Row) => (
                  <article key={a.id}>
                    <header>
                      <strong>{a.label ?? a.action}</strong>
                      <span>
                        {a.actor} · {stamp(a.created)}
                      </span>
                    </header>
                    <p className="record-id">对象：{a.target}</p>
                    <KeyValues
                      items={Object.fromEntries(
                        Object.entries(parse(a.detail)).map(([k, v]) => [
                          detailLabels[k] ?? k,
                          humanValue(v),
                        ]),
                      )}
                    />
                  </article>
                ))}
              </div>
              {!r.data.items.length && <Empty>没有符合条件的审计记录。</Empty>}
              <Pager
                page={filter.page}
                total={r.data.total}
                size={50}
                count={r.data.items.length}
                onChange={(p) => update("page", p)}
              />
            </>
          )}
        </Load>
      </Panel>
    </>
  );
}
