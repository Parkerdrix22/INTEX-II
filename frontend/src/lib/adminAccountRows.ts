import type { AdminAccountRow, ManageableUserRow } from './api';

/** Some environments serialize DTOs with PascalCase; first/last may be empty in DB — use fallbacks for display. */
export function normalizeManageableUserRow(raw: unknown): ManageableUserRow {
  const r = raw as Record<string, unknown>;
  const str = (camel: string, pascal: string): string => {
    const v = r[camel] ?? r[pascal];
    return typeof v === 'string' ? v : '';
  };
  const nullableStr = (camel: string, pascal: string): string | null => {
    const v = r[camel] ?? r[pascal];
    if (v == null) return null;
    return typeof v === 'string' ? v : String(v);
  };
  const numOrNull = (camel: string, pascal: string): number | null => {
    const v = r[camel] ?? r[pascal];
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const id = Number(r.id ?? r.Id);
  return {
    id: Number.isFinite(id) ? id : 0,
    email: nullableStr('email', 'Email'),
    firstName: str('firstName', 'FirstName'),
    lastName: str('lastName', 'LastName'),
    loginId: nullableStr('loginId', 'LoginId'),
    role: str('role', 'Role') || 'Donor',
    residentId: numOrNull('residentId', 'ResidentId'),
    supporterId: numOrNull('supporterId', 'SupporterId'),
    staffMemberId: numOrNull('staffMemberId', 'StaffMemberId'),
  };
}

export function normalizeAdminAccountRow(raw: unknown): AdminAccountRow {
  const r = raw as Record<string, unknown>;
  const str = (camel: string, pascal: string): string => {
    const v = r[camel] ?? r[pascal];
    return typeof v === 'string' ? v : '';
  };
  const nullableStr = (camel: string, pascal: string): string | null => {
    const v = r[camel] ?? r[pascal];
    if (v == null) return null;
    return typeof v === 'string' ? v : String(v);
  };
  const numOrNull = (camel: string, pascal: string): number | null => {
    const v = r[camel] ?? r[pascal];
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const id = Number(r.id ?? r.Id);
  return {
    id: Number.isFinite(id) ? id : 0,
    email: nullableStr('email', 'Email'),
    firstName: str('firstName', 'FirstName'),
    lastName: str('lastName', 'LastName'),
    loginId: nullableStr('loginId', 'LoginId'),
    staffMemberId: numOrNull('staffMemberId', 'StaffMemberId'),
  };
}

export function formatPersonName(row: {
  firstName: string;
  lastName: string;
  email?: string | null;
  loginId?: string | null;
}): string {
  const n = `${row.firstName} ${row.lastName}`.trim();
  if (n) return n;
  const e = row.email?.trim();
  if (e) return e;
  const l = row.loginId?.trim();
  if (l) return l;
  return '—';
}
