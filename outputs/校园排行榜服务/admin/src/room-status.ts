export function roomSnapshotFresh(updated: number, checkedAt: number, receivedAt: number | null, localNow: number, readFailed = false) {
  if (readFailed || receivedAt === null || ![updated, checkedAt, receivedAt, localNow].every(Number.isFinite)) return false;
  return Math.max(0, checkedAt - updated) + Math.max(0, localNow - receivedAt) < 30000;
}

export function roomCommandNotice(result: {state?: string; commandId?: string}) {
  const labels: Record<string, string> = {queued: '等待执行', executing: '执行中', executed: '已执行', noop: '无需执行', failed: '执行失败', expired: '已过期'};
  return (result.commandId ? '操作 ' + result.commandId + ' · ' : '操作状态：') + (labels[result.state ?? ''] ?? '等待确认') + '，可在下方查看实际结果。';
}
