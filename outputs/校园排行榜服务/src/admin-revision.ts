import {createHash} from 'node:crypto';
import {AppError} from './validation.js';

// A revision covers the persisted fields that an editor can replace. Only the
// opaque digest leaves this module; account credential hashes stay private.
export function editRevision(row: Record<string, unknown>, fields: readonly string[]) {
  return createHash('sha256').update(JSON.stringify(fields.map(key => [key, row[key] ?? null]))).digest('hex');
}
export const RELEASE_FIELDS = ['id', 'version', 'date', 'summary', 'changes', 'published'] as const;
export const ACCOUNT_FIELDS = ['id', 'username', 'name', 'password_hash', 'owner', 'scopes', 'active'] as const;
export const PLAYER_FIELDS = ['id', 'nickname', 'restricted'] as const;
export function checkEditRevision(expected: unknown, row: Record<string, unknown>, fields: readonly string[]) {
  // Existing API integrations remain compatible. Every new workbench editor
  // supplies the revision returned with its own record.
  if (expected !== undefined && expected !== editRevision(row, fields))
    throw new AppError('CONFLICT', '这条记录已被其他管理员修改。请保留当前内容，重新读取后再处理。', 409);
}
