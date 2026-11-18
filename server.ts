import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  PRIMARY_ADMIN_EMAIL,
  SESSION_DURATION_MS,
  SHARED_STUDIO_ID,
  SIMULATION_RECORD_IDS,
  VENUE_DEFAULTS,
  buildProductionStudioDefaults,
  emailToDocKey,
  formatLocalDate,
  renderNotificationTemplate,
  timeToMinutes,
} from './src/lib/seedStudio.ts';
import type {
  Appointment,
  AppointmentStatus,
  AuthorizedUser,
  AuthorizedUserRole,
  Client,
  ClientSessionProfile,
  CreditDeduction,
  MembershipStatus,
  MembershipTier,
  NotificationChannel,
  NotificationLog,
  NotificationRule,
  PermissionKey,
  SessionUser,
  SpaRoom,
  SpaService,
  StaffMember,
  Studio,
  UserPermissions,
} from './src/types/spa.ts';

interface StoredClient extends Client {
  passwordHash?: string;
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'wellspa.db');
const SECRET_PATH = path.join(DATA_DIR, '.session_secret');

function loadSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (fs.existsSync(SECRET_PATH)) {
    return fs.readFileSync(SECRET_PATH, 'utf8').trim();
  }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_PATH, generated, { mode: 0o600 });
  return generated;
}

const SESSION_SECRET = loadSessionSecret();
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS app_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    permissions_json TEXT NOT NULL,
    created_by_uid TEXT NOT NULL,
    created_by_email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS studios (
    id TEXT PRIMARY KEY,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS studio_records (
    collection TEXT NOT NULL,
    id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (collection, id)
  );
`);

function migrateLegacyStudioBranding(): void {
  const row = db
    .prepare('SELECT data_json FROM studios WHERE id = ?')
    .get(SHARED_STUDIO_ID) as { data_json: string } | undefined;
  if (row) {
    try {
      const studioData = JSON.parse(row.data_json) as Studio;
      const nextName =
        studioData.name === 'SUN & MOON Hotel, WELL SPA' || /solace spa/i.test(studioData.name ?? '')
          ? VENUE_DEFAULTS.name
          : studioData.name || VENUE_DEFAULTS.name;
      const nextVenue = studioData.venueName || VENUE_DEFAULTS.venueName;
      const nextAddress =
        !studioData.address || studioData.address === '742 Mercer Street, Suite 3B · Seattle, WA'
          ? VENUE_DEFAULTS.address
          : studioData.address;
      const nextPhone =
        !studioData.phone || studioData.phone === '+1 (206) 555-0184'
          ? VENUE_DEFAULTS.phone
          : studioData.phone;
      const nextEmail = studioData.contactEmail || VENUE_DEFAULTS.contactEmail;
      const nextTgContacts = studioData.telegramContacts || VENUE_DEFAULTS.telegramContacts;
      const nextTgChannel = studioData.telegramChannel || VENUE_DEFAULTS.telegramChannel;
      const nextTimezone =
        !studioData.timezone || studioData.timezone === 'America/Los_Angeles'
          ? VENUE_DEFAULTS.timezone
          : studioData.timezone;
      if (
        nextName !== studioData.name ||
        nextVenue !== studioData.venueName ||
        nextAddress !== studioData.address ||
        nextPhone !== studioData.phone ||
        nextEmail !== studioData.contactEmail ||
        nextTgContacts !== studioData.telegramContacts ||
        nextTgChannel !== studioData.telegramChannel ||
        nextTimezone !== studioData.timezone
      ) {
        const now = new Date().toISOString();
        db.prepare('UPDATE studios SET data_json = ?, updated_at = ? WHERE id = ?').run(
          JSON.stringify({
            ...studioData,
            name: nextName,
            venueName: nextVenue,
            address: nextAddress,
            phone: nextPhone,
            contactEmail: nextEmail,
            telegramContacts: nextTgContacts,
            telegramChannel: nextTgChannel,
            timezone: nextTimezone,
            updatedAt: now,
          }),
          now,
          SHARED_STUDIO_ID,
        );
      }
    } catch {
      // Ignore malformed legacy payload
    }
  }

  const logRows = db
    .prepare("SELECT id, data_json FROM studio_records WHERE collection = 'notificationLogs'")
    .all() as Array<{ id: string; data_json: string }>;
  for (const logRow of logRows) {
    if (
      logRow.data_json.includes('SUN & MOON Hotel, WELL SPA') ||
      /solace spa/i.test(logRow.data_json)
    ) {
      const updatedJson = logRow.data_json
        .replaceAll('SUN & MOON Hotel, WELL SPA', 'WELL SPA')
        .replace(/Solace Spa(?:\s*&\s*Booking)?/gi, 'WELL SPA');
      db.prepare('UPDATE studio_records SET data_json = ? WHERE collection = ? AND id = ?').run(
        updatedJson,
        'notificationLogs',
        logRow.id,
      );
    }
  }
}

migrateLegacyStudioBranding();

const ALL_PERMISSIONS: UserPermissions = {
  appointments: true,
  staff: true,
  memberships: true,
  notifications: true,
  services: true,
  reports: true,
  booking_portal: true,
  users: true,
};

function defaultPermissionsForRole(role: AuthorizedUserRole): UserPermissions {
  if (role === 'admin') {
    return { ...ALL_PERMISSIONS };
  }
  if (role === 'manager') {
    return {
      appointments: true,
      staff: true,
      memberships: true,
      notifications: true,
      services: true,
      reports: true,
      booking_portal: true,
      users: false,
    };
  }
  return {
    appointments: true,
    staff: true,
    memberships: false,
    notifications: false,
    services: false,
    reports: false,
    booking_portal: true,
    users: false,
  };
}

function normalizePermissions(raw: unknown, role: AuthorizedUserRole, isPrimary: boolean): UserPermissions {
  if (isPrimary) return { ...ALL_PERMISSIONS };
  const base = defaultPermissionsForRole(role);
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  return {
    appointments: typeof obj.appointments === 'boolean' ? obj.appointments : base.appointments,
    staff: typeof obj.staff === 'boolean' ? obj.staff : base.staff,
    memberships: typeof obj.memberships === 'boolean' ? obj.memberships : base.memberships,
    notifications: typeof obj.notifications === 'boolean' ? obj.notifications : base.notifications,
    services: typeof obj.services === 'boolean' ? obj.services : base.services,
    reports: typeof obj.reports === 'boolean' ? obj.reports : base.reports,
    booking_portal: typeof obj.booking_portal === 'boolean' ? obj.booking_portal : base.booking_portal,
    users: typeof obj.users === 'boolean' ? obj.users : base.users,
  };
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(32).toString('hex'));

function passwordTag(storedHash?: string): string {
  if (!storedHash) return '';
  return crypto.createHash('sha256').update(storedHash).digest('hex').slice(0, 12);
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex || keyHex.length !== 128) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(keyHex, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_ACCOUNT_FAILURES = 8;
const MAX_IP_FAILURES = 25;
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const revokedTokens = new Map<string, number>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkLoginRateLimit(ip: string, email: string): number {
  const now = Date.now();
  for (const [k, entry] of loginFailures.entries()) {
    if (entry.resetAt <= now) loginFailures.delete(k);
  }
  const acctEntry = loginFailures.get(`acct:${ip}:${email}`);
  if (acctEntry && acctEntry.resetAt > now && acctEntry.count >= MAX_ACCOUNT_FAILURES) {
    return Math.ceil((acctEntry.resetAt - now) / 1000);
  }
  const ipEntry = loginFailures.get(`ip:${ip}`);
  if (ipEntry && ipEntry.resetAt > now && ipEntry.count >= MAX_IP_FAILURES) {
    return Math.ceil((ipEntry.resetAt - now) / 1000);
  }
  return 0;
}

function recordLoginFailure(ip: string, email: string): void {
  const now = Date.now();
  const acctKey = `acct:${ip}:${email}`;
  const acct = loginFailures.get(acctKey);
  if (!acct || acct.resetAt <= now) {
    loginFailures.set(acctKey, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    acct.count += 1;
  }
  const ipKey = `ip:${ip}`;
  const ipRec = loginFailures.get(ipKey);
  if (!ipRec || ipRec.resetAt <= now) {
    loginFailures.set(ipKey, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    ipRec.count += 1;
  }
}

function clearLoginFailures(ip: string, email: string): void {
  loginFailures.delete(`acct:${ip}:${email}`);
}

function revokeSessionToken(token: string | null, exp?: number): void {
  if (!token) return;
  const now = Date.now();
  for (const [t, expiry] of revokedTokens.entries()) {
    if (expiry <= now) revokedTokens.delete(t);
  }
  revokedTokens.set(token, exp && exp > now ? exp : now + SESSION_DURATION_MS);
}

function isTokenRevoked(token: string): boolean {
  const exp = revokedTokens.get(token);
  if (!exp) return false;
  if (Date.now() >= exp) {
    revokedTokens.delete(token);
    return false;
  }
  return true;
}

function isHttpsRequest(req: Request): boolean {
  return Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https');
}

function setSessionCookie(req: Request, res: Response, name: string, token: string): void {
  res.cookie(name, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    maxAge: SESSION_DURATION_MS,
    path: '/',
  });
}

function clearSessionCookie(req: Request, res: Response, name: string): void {
  res.clearCookie(name, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(req),
    path: '/',
  });
}

interface TokenPayload {
  uid: string;
  scope?: 'staff';
  ptag?: string;
  iat: number;
  exp: number;
}

interface ClientTokenPayload {
  cid: string;
  scope: 'client';
  ptag?: string;
  iat: number;
  exp: number;
}

function signSessionToken(uid: string, ptag = ''): { token: string; expiresAt: number } {
  const iat = Date.now();
  const exp = iat + SESSION_DURATION_MS;
  const payload: TokenPayload = { uid, scope: 'staff', ptag, iat, exp };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return { token: `${encoded}.${sig}`, expiresAt: exp };
}

function verifySessionToken(token: string): TokenPayload | null {
  if (isTokenRevoked(token)) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      uid?: string;
      scope?: string;
      ptag?: string;
      iat?: number;
      exp?: number;
    };
    if (
      payload.scope === 'client' ||
      !payload.uid ||
      typeof payload.exp !== 'number' ||
      Date.now() >= payload.exp
    ) {
      return null;
    }
    return {
      uid: payload.uid,
      scope: 'staff',
      ptag: typeof payload.ptag === 'string' ? payload.ptag : '',
      iat: typeof payload.iat === 'number' ? payload.iat : 0,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

function signClientSessionToken(cid: string, ptag = ''): { token: string; expiresAt: number } {
  const iat = Date.now();
  const exp = iat + SESSION_DURATION_MS;
  const payload: ClientTokenPayload = { cid, scope: 'client', ptag, iat, exp };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return { token: `${encoded}.${sig}`, expiresAt: exp };
}

function verifyClientSessionToken(token: string): ClientTokenPayload | null {
  if (isTokenRevoked(token)) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expected, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ClientTokenPayload;
    if (
      payload.scope !== 'client' ||
      !payload.cid ||
      typeof payload.exp !== 'number' ||
      Date.now() >= payload.exp
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function sanitizeClientProfile(client: StoredClient): ClientSessionProfile {
  return {
    id: client.id,
    fullName: client.fullName,
    email: client.email,
    phone: client.phone,
    membershipTierId: client.membershipTierId,
    membershipTierName: client.membershipTierName,
    membershipStatus: client.membershipStatus,
    creditsRemaining: client.creditsRemaining,
    nextRenewalDate: client.nextRenewalDate,
    totalVisits: client.totalVisits,
    lifetimeSpend: client.lifetimeSpend,
  };
}

function computeCreditDeduction(
  servicePrice: number,
  availableCredits: number,
  requestedCredits?: number,
  legacyUseFlag?: boolean,
): { creditsUsed: number; amountPaid: number; usedMembershipCredit: boolean } {
  const safePrice = Math.max(0, Number(servicePrice) || 0);
  const safeAvailable = Math.max(0, Math.floor(Number(availableCredits) || 0));
  let creditsUsed = 0;

  if (typeof requestedCredits === 'number' && Number.isFinite(requestedCredits)) {
    creditsUsed = Math.max(0, Math.min(Math.floor(requestedCredits), safeAvailable, safePrice));
  } else if (legacyUseFlag && safeAvailable > 0) {
    creditsUsed = Math.max(0, Math.min(safeAvailable, safePrice));
  }

  const amountPaid = Math.max(0, safePrice - creditsUsed);
  return {
    creditsUsed,
    amountPaid,
    usedMembershipCredit: creditsUsed > 0,
  };
}

function stripClientPassword(client: StoredClient): Client {
  const { passwordHash: _ignored, ...safeClient } = client;
  return safeClient;
}

interface DbUserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: string;
  is_primary: number;
  active: number;
  permissions_json: string;
  created_by_uid: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

function rowToAuthorizedUser(row: DbUserRow): AuthorizedUser {
  const role = (row.role === 'admin' || row.role === 'manager' ? row.role : 'staff') as AuthorizedUserRole;
  const isPrimary = row.is_primary === 1;
  let parsedPerms: unknown = null;
  try {
    parsedPerms = JSON.parse(row.permissions_json);
  } catch {
    parsedPerms = null;
  }
  return {
    id: row.id,
    uid: row.id,
    email: row.email,
    fullName: row.full_name,
    role,
    isPrimaryAdmin: isPrimary,
    active: row.active === 1,
    permissions: normalizePermissions(parsedPerms, role, isPrimary),
    createdByUid: row.created_by_uid,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSessionUser(row: DbUserRow): SessionUser {
  const full = rowToAuthorizedUser(row);
  return {
    uid: full.uid,
    email: full.email,
    fullName: full.fullName,
    displayName: full.fullName,
    role: full.role,
    isPrimaryAdmin: full.isPrimaryAdmin,
    active: full.active,
    permissions: full.permissions,
  };
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function nowTimeLabel(): string {
  const now = new Date();
  return `Today · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

const sseClients = new Set<Response>();
let lastStudioMutationSource = '';

function emitStudioEvent(reason: string): void {
  const payload = JSON.stringify({ reason, at: Date.now() });
  for (const clientRes of sseClients) {
    try {
      clientRes.write(`event: studio_update\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(clientRes);
    }
  }
}

function ensureProductionStudioInitialized(ownerId: string): void {
  const existing = db.prepare('SELECT id FROM studios WHERE id = ?').get(SHARED_STUDIO_ID) as
    | { id: string }
    | undefined;
  if (existing) return;

  const now = new Date().toISOString();
  const defaults = buildProductionStudioDefaults(ownerId, [ownerId]);
  db.prepare('INSERT INTO studios (id, data_json, updated_at) VALUES (?, ?, ?)').run(
    SHARED_STUDIO_ID,
    JSON.stringify({ ...defaults.studio, id: SHARED_STUDIO_ID, createdAt: now, updatedAt: now }),
    now,
  );

  const insertRec = db.prepare(
    'INSERT OR REPLACE INTO studio_records (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?)',
  );

  for (const rule of defaults.notificationRules) {
    insertRec.run(
      'notificationRules',
      rule.id,
      JSON.stringify({ ...rule, memberUids: [ownerId], createdAt: now, updatedAt: now }),
      now,
    );
  }
}

function purgeSimulationRecordsFromSqlite(): number {
  let deletedCount = 0;
  const delStmt = db.prepare('DELETE FROM studio_records WHERE collection = ? AND id = ?');
  for (const [collectionName, ids] of Object.entries(SIMULATION_RECORD_IDS)) {
    for (const id of ids) {
      const result = delStmt.run(collectionName, id);
      deletedCount += Number(result.changes);
    }
  }

  const studioRow = db.prepare('SELECT data_json FROM studios WHERE id = ?').get(SHARED_STUDIO_ID) as
    | { data_json: string }
    | undefined;
  let wasSeeded = false;
  if (studioRow) {
    try {
      const studioData = JSON.parse(studioRow.data_json) as Studio;
      wasSeeded = Boolean(studioData.seeded);
      const nextAddress =
        !studioData.address || studioData.address === '742 Mercer Street, Suite 3B · Seattle, WA'
          ? VENUE_DEFAULTS.address
          : studioData.address;
      const nextPhone =
        !studioData.phone || studioData.phone === '+1 (206) 555-0184'
          ? VENUE_DEFAULTS.phone
          : studioData.phone;
      if (wasSeeded || nextAddress !== studioData.address || nextPhone !== studioData.phone) {
        const now = new Date().toISOString();
        db.prepare('UPDATE studios SET data_json = ?, updated_at = ? WHERE id = ?').run(
          JSON.stringify({
            ...studioData,
            venueName: studioData.venueName || VENUE_DEFAULTS.venueName,
            address: nextAddress,
            phone: nextPhone,
            contactEmail: studioData.contactEmail || VENUE_DEFAULTS.contactEmail,
            telegramContacts: studioData.telegramContacts || VENUE_DEFAULTS.telegramContacts,
            telegramChannel: studioData.telegramChannel || VENUE_DEFAULTS.telegramChannel,
            seeded: false,
            updatedAt: now,
          }),
          now,
          SHARED_STUDIO_ID,
        );
      }
    } catch {
      // Ignore malformed studio JSON
    }
  }

  if (wasSeeded) {
    const rules = getCollection<NotificationRule>('notificationRules');
    for (const rule of rules) {
      const cleanedBody = rule.bodyTemplate.replace(' when you arrive at Mercer St.', ' when you arrive.');
      const nextSent =
        (rule.id === 'rule_confirm' && rule.sentCount === 142) ||
        (rule.id === 'rule_24h' && rule.sentCount === 128) ||
        (rule.id === 'rule_2h' && rule.sentCount === 94) ||
        (rule.id === 'rule_rebook' && rule.sentCount === 118) ||
        (rule.id === 'rule_membership' && rule.sentCount === 64)
          ? 0
          : rule.sentCount;
      if (cleanedBody !== rule.bodyTemplate || nextSent !== rule.sentCount) {
        const now = new Date().toISOString();
        db.prepare(
          'INSERT OR REPLACE INTO studio_records (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?)',
        ).run(
          'notificationRules',
          rule.id,
          JSON.stringify({ ...rule, bodyTemplate: cleanedBody, sentCount: nextSent, updatedAt: now }),
          now,
        );
      }
    }
  }

  return deletedCount;
}

interface SyncTracker {
  upserts: Map<string, Set<string>>;
  deletes: Map<string, Set<string>>;
}

const syncTrackerStorage = new AsyncLocalStorage<SyncTracker>();

function trackSyncUpsert(collectionName: string, id: string): void {
  const tracker = syncTrackerStorage.getStore();
  if (!tracker) return;
  let u = tracker.upserts.get(collectionName);
  if (!u) {
    u = new Set<string>();
    tracker.upserts.set(collectionName, u);
  }
  u.add(id);
  tracker.deletes.get(collectionName)?.delete(id);
}

function trackSyncDelete(collectionName: string, id: string): void {
  const tracker = syncTrackerStorage.getStore();
  if (!tracker) return;
  let d = tracker.deletes.get(collectionName);
  if (!d) {
    d = new Set<string>();
    tracker.deletes.set(collectionName, d);
  }
  d.add(id);
  tracker.upserts.get(collectionName)?.delete(id);
}

function collectSyncOps(): {
  upserts: Record<string, Array<Record<string, unknown> & { id: string }>>;
  deletes: Record<string, string[]>;
} | null {
  const tracker = syncTrackerStorage.getStore();
  if (!tracker) return null;
  const upserts: Record<string, Array<Record<string, unknown> & { id: string }>> = {};
  const deletes: Record<string, string[]> = {};
  let hasAny = false;

  for (const [colName, ids] of tracker.upserts.entries()) {
    const records: Array<Record<string, unknown> & { id: string }> = [];
    for (const id of ids) {
      const rec = getRecord<Record<string, unknown> & { id: string }>(colName, id);
      if (!rec) continue;
      if (colName === 'clients') {
        records.push(stripClientPassword(rec as unknown as StoredClient) as unknown as Record<string, unknown> & { id: string });
      } else {
        records.push(rec);
      }
    }
    if (records.length > 0) {
      upserts[colName] = records;
      hasAny = true;
    }
  }

  for (const [colName, ids] of tracker.deletes.entries()) {
    if (ids.size > 0) {
      deletes[colName] = Array.from(ids);
      hasAny = true;
    }
  }

  return hasAny ? { upserts, deletes } : null;
}

function getCollection<T extends { id: string }>(collectionName: string): T[] {
  const rows = db
    .prepare('SELECT data_json FROM studio_records WHERE collection = ?')
    .all(collectionName) as Array<{ data_json: string }>;
  return rows.map((r) => JSON.parse(r.data_json) as T);
}

function getRecord<T extends { id: string }>(collectionName: string, id: string): T | null {
  const row = db
    .prepare('SELECT data_json FROM studio_records WHERE collection = ? AND id = ?')
    .get(collectionName, id) as { data_json: string } | undefined;
  return row ? (JSON.parse(row.data_json) as T) : null;
}

function saveRecord(collectionName: string, id: string, data: Record<string, unknown>): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR REPLACE INTO studio_records (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?)',
  ).run(collectionName, id, JSON.stringify({ ...data, id, updatedAt: now }), now);
  trackSyncUpsert(collectionName, id);
  emitStudioEvent(`${collectionName}:save:${id}`);
}

function deleteRecord(collectionName: string, id: string): void {
  db.prepare('DELETE FROM studio_records WHERE collection = ? AND id = ?').run(collectionName, id);
  trackSyncDelete(collectionName, id);
  emitStudioEvent(`${collectionName}:delete:${id}`);
}

purgeSimulationRecordsFromSqlite();

interface AuthedRequest extends Request {
  sessionUser?: SessionUser;
  sessionExpiresAt?: number;
  clientRecord?: StoredClient;
}

function extractCookieValue(req: Request, cookieName: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === cookieName) {
      return decodeURIComponent(v.join('='));
    }
  }
  return null;
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return extractCookieValue(req, 'wellspa_session');
}

function extractClientToken(req: Request): string | null {
  const headerToken = req.headers['x-client-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const candidate = authHeader.slice(7).trim();
    if (verifyClientSessionToken(candidate)) {
      return candidate;
    }
  }
  return extractCookieValue(req, 'wellspa_client_session');
}

function resolveClientSessionFromRequest(
  req: Request,
): { client: StoredClient; expiresAt: number } | null {
  const token = extractClientToken(req);
  if (!token) return null;
  const payload = verifyClientSessionToken(token);
  if (!payload) return null;
  const client = getRecord<StoredClient>('clients', payload.cid);
  if (!client) return null;
  if (payload.ptag && payload.ptag !== passwordTag(client.passwordHash)) {
    return null;
  }
  return { client, expiresAt: payload.exp };
}

function resolveClientFromRequest(req: Request): StoredClient | null {
  return resolveClientSessionFromRequest(req)?.client ?? null;
}

function requireClientAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const resolved = resolveClientSessionFromRequest(req);
  if (!resolved) {
    res.status(401).json({ error: 'Your login session has ended. Please sign in with your password.' });
    return;
  }
  req.clientRecord = resolved.client;
  req.sessionExpiresAt = resolved.expiresAt;
  next();
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Your 8-hour login session has ended. Please sign in again with your password.' });
    return;
  }
  const userRow = db.prepare('SELECT * FROM app_users WHERE id = ?').get(payload.uid) as
    | DbUserRow
    | undefined;
  if (!userRow || userRow.active !== 1) {
    res.status(403).json({ error: 'Your account is inactive or no longer authorized.' });
    return;
  }
  if (payload.ptag && payload.ptag !== passwordTag(userRow.password_hash)) {
    res.status(401).json({ error: 'Your password was updated. Please sign in again with your password.' });
    return;
  }
  req.sessionUser = rowToSessionUser(userRow);
  req.sessionExpiresAt = payload.exp;
  next();
}

function requireAnyPermission(...keys: PermissionKey[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const user = req.sessionUser;
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (user.isPrimaryAdmin || keys.some((k) => user.permissions[k])) {
      next();
      return;
    }
    res.status(403).json({ error: 'You do not have permission to perform this action.' });
  };
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const user = req.sessionUser;
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (user.isPrimaryAdmin || user.role === 'admin') {
    next();
    return;
  }
  res.status(403).json({
    error: 'Only Administrator accounts can edit records, reset passwords, or delete items.',
  });
}

function hasTherapistTimeConflict(
  staffId: string,
  date: string,
  startTime: string,
  durationMinutes: number,
  excludeAppointmentId?: string,
): boolean {
  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + Math.max(15, durationMinutes) + 15;
  const existing = getCollection<Appointment>('appointments');
  return existing.some((a) => {
    if (excludeAppointmentId && a.id === excludeAppointmentId) return false;
    if (a.staffId !== staffId || a.date !== date) return false;
    if (a.status === 'cancelled' || a.status === 'no_show') return false;
    const bStart = timeToMinutes(a.startTime);
    const bEnd = bStart + a.durationMinutes + 15;
    return newStart < bEnd && newEnd > bStart;
  });
}

function resolveNotificationChannels(
  ruleChannel: NotificationRule['channel'],
  email: string,
  phone: string,
  emailOptIn = true,
  smsOptIn = true,
): NotificationChannel[] {
  const hasEmail = Boolean(email.trim()) && emailOptIn;
  const hasPhone = Boolean(phone.trim()) && smsOptIn;

  if (ruleChannel === 'Email + SMS') {
    const list: NotificationChannel[] = [];
    if (hasEmail) list.push('Email');
    if (hasPhone) list.push('SMS');
    if (list.length === 0) {
      if (email.trim()) list.push('Email');
      else if (phone.trim()) list.push('SMS');
    }
    return list;
  }
  if (ruleChannel === 'Email') {
    if (hasEmail || email.trim()) return ['Email'];
    return phone.trim() ? ['SMS'] : [];
  }
  if (hasPhone || phone.trim()) return ['SMS'];
  return email.trim() ? ['Email'] : [];
}

function triggerNotificationForEvent(params: {
  ownerId: string;
  eventKey: NotificationRule['eventKey'];
  appointment: Appointment;
  studioName: string;
}) {
  const rules = getCollection<NotificationRule>('notificationRules');
  const matchingRule = rules.find((r) => r.eventKey === params.eventKey && r.enabled);
  if (!matchingRule) return;

  const client = getRecord<Client>('clients', params.appointment.clientId);
  if (client && !client.smsOptIn && !client.emailOptIn) return;

  const vars: Record<string, string> = {
    clientName: params.appointment.clientName,
    serviceName: params.appointment.serviceName,
    therapistName: params.appointment.staffName,
    roomName: params.appointment.roomName,
    dateTime: `${params.appointment.date} at ${params.appointment.startTime}`,
    studioName: params.studioName,
    creditsRemaining: String(client?.creditsRemaining ?? 0),
    tierName: client?.membershipTierName ?? 'Membership',
  };

  const channels = resolveNotificationChannels(
    matchingRule.channel,
    params.appointment.clientEmail,
    params.appointment.clientPhone,
    client ? client.emailOptIn : true,
    client ? client.smsOptIn : true,
  );
  if (channels.length === 0) return;

  const isImmediate =
    params.eventKey === 'booking_confirmed' || params.eventKey === 'post_visit_rebook';
  const now = new Date().toISOString();

  for (const channel of channels) {
    const recipientContact =
      channel === 'SMS'
        ? params.appointment.clientPhone || params.appointment.clientEmail
        : params.appointment.clientEmail || params.appointment.clientPhone;
    const logId = makeId('log');
    const logPayload: NotificationLog = {
      id: logId,
      ownerId: params.ownerId,
      memberUids: [params.ownerId],
      ruleId: matchingRule.id,
      eventKey: params.eventKey,
      appointmentId: params.appointment.id,
      clientId: params.appointment.clientId,
      clientName: params.appointment.clientName,
      recipientContact,
      channel,
      subject: renderNotificationTemplate(matchingRule.subjectTemplate, vars),
      messageBody: renderNotificationTemplate(matchingRule.bodyTemplate, vars),
      status: isImmediate ? 'sent' : 'scheduled',
      scheduledFor:
        params.eventKey === 'reminder_24h'
          ? `${params.appointment.date} · 24h prior`
          : `${params.appointment.date} · ${params.appointment.startTime}`,
      sentAtLabel: isImmediate ? nowTimeLabel() : 'Queued',
      createdAt: now,
      updatedAt: now,
    };
    saveRecord('notificationLogs', logId, logPayload as unknown as Record<string, unknown>);
  }

  if (isImmediate) {
    saveRecord('notificationRules', matchingRule.id, {
      ...matchingRule,
      sentCount: matchingRule.sentCount + channels.length,
    });
  }
}

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId: string;
  apiKey: string;
}

function loadFirebaseAppletConfig(): FirebaseAppletConfig {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as Partial<FirebaseAppletConfig>;
      return {
        projectId: parsed.projectId ?? '',
        firestoreDatabaseId: parsed.firestoreDatabaseId ?? '(default)',
        apiKey: parsed.apiKey ?? '',
      };
    }
  } catch {
    // Ignore missing or unreadable firebase-applet-config.json
  }
  return { projectId: '', firestoreDatabaseId: '', apiKey: '' };
}

let cachedGoogleCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebasePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && cachedGoogleCerts && cachedGoogleCerts.expiresAt > now) {
    return cachedGoogleCerts.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  );
  if (!resp.ok) {
    throw new Error('Unable to fetch Firebase verification certificates.');
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cacheControl = resp.headers.get('cache-control') ?? '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 3600;
  cachedGoogleCerts = { certs, expiresAt: now + maxAgeSec * 1000 };
  return certs;
}

interface VerifiedFirebaseToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseToken> {
  const { projectId } = loadFirebaseAppletConfig();
  if (!projectId) {
    throw new Error('Firebase project is not configured.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid Firebase ID token.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: string; kid?: string };
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as typeof header;
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as typeof payload;
  } catch {
    throw new Error('Malformed Firebase ID token.');
  }

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported Firebase token signature algorithm.');
  }

  let certs = await getFirebasePublicCerts(false);
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await getFirebasePublicCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Unable to verify Firebase token signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signatureValid = verifier.verify(certPem, Buffer.from(sigB64, 'base64url'));
  if (!signatureValid) {
    throw new Error('Firebase ID token signature verification failed.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw new Error('Firebase token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Firebase token issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.length > 128) {
    throw new Error('Firebase token missing subject.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase token has expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Firebase token issued-at timestamp is invalid.');
  }
  if (payload.email_verified !== true || !payload.email) {
    throw new Error('Verified Google email address is required.');
  }

  return {
    uid: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : payload.email.split('@')[0],
  };
}

interface FirestoreRestValue {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  nullValue?: unknown;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

function decodeFirestoreValue(val: FirestoreRestValue | undefined): unknown {
  if (!val) return undefined;
  if ('stringValue' in val && typeof val.stringValue === 'string') return val.stringValue;
  if ('booleanValue' in val && typeof val.booleanValue === 'boolean') return val.booleanValue;
  if ('integerValue' in val && val.integerValue !== undefined) return Number(val.integerValue);
  if ('doubleValue' in val && typeof val.doubleValue === 'number') return val.doubleValue;
  if ('timestampValue' in val && typeof val.timestampValue === 'string') return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue?.values ?? []).map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    return decodeFirestoreFields(val.mapValue?.fields);
  }
  return undefined;
}

function decodeFirestoreFields(fields: Record<string, FirestoreRestValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeFirestoreValue(v);
  }
  return out;
}

function extractFirestoreDocId(docName: string | undefined): string {
  if (!docName) return '';
  const idx = docName.lastIndexOf('/');
  return idx >= 0 ? docName.slice(idx + 1) : docName;
}

async function fetchFirestoreStaffAccess(
  idToken: string,
  email: string,
): Promise<{
  email: string;
  fullName: string;
  role: AuthorizedUserRole;
  isPrimaryAdmin: boolean;
  active: boolean;
  permissions: UserPermissions;
} | null> {
  const { projectId, firestoreDatabaseId, apiKey } = loadFirebaseAppletConfig();
  if (!projectId || !firestoreDatabaseId || !apiKey) return null;

  const docId = emailToDocKey(email);
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents/staffAccess/${encodeURIComponent(docId)}?key=${encodeURIComponent(apiKey)}`;
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) return null;
    const docJson = (await resp.json()) as { fields?: Record<string, FirestoreRestValue> };
    const data = decodeFirestoreFields(docJson.fields);
    const role: AuthorizedUserRole =
      data.role === 'admin' || data.role === 'manager' ? data.role : 'staff';
    const isPrimary = Boolean(data.isPrimaryAdmin);
    return {
      email: String(data.email ?? email).trim().toLowerCase(),
      fullName: String(data.fullName ?? email).trim() || email,
      role,
      isPrimaryAdmin: isPrimary,
      active: Boolean(data.active),
      permissions: normalizePermissions(data.permissions, role, isPrimary),
    };
  } catch {
    return null;
  }
}

async function fetchPublicCatalogCollection(
  subcollection: 'services' | 'rooms' | 'staff' | 'bookedSlots',
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const { projectId, firestoreDatabaseId, apiKey } = loadFirebaseAppletConfig();
  if (!projectId || !firestoreDatabaseId || !apiKey) return [];
  const runQueryUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents/publicCatalog/${encodeURIComponent(SHARED_STUDIO_ID)}:runQuery?key=${encodeURIComponent(apiKey)}`;

  let whereFilter: Record<string, unknown>;
  let limit = 200;
  if (subcollection === 'services' || subcollection === 'rooms') {
    whereFilter = {
      fieldFilter: {
        field: { fieldPath: 'active' },
        op: 'EQUAL',
        value: { booleanValue: true },
      },
    };
  } else if (subcollection === 'staff') {
    whereFilter = {
      fieldFilter: {
        field: { fieldPath: 'onDuty' },
        op: 'EQUAL',
        value: { booleanValue: true },
      },
    };
  } else {
    limit = 500;
    whereFilter = {
      fieldFilter: {
        field: { fieldPath: 'status' },
        op: 'IN',
        value: {
          arrayValue: {
            values: [
              { stringValue: 'confirmed' },
              { stringValue: 'checked_in' },
              { stringValue: 'in_progress' },
            ],
          },
        },
      },
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(runQueryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: subcollection }],
          where: whereFilter,
          limit,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return [];
    const rows = (await resp.json()) as Array<{
      document?: { name?: string; fields?: Record<string, FirestoreRestValue> };
    }>;
    return rows
      .filter((r) => Boolean(r.document?.name && r.document?.fields))
      .map((r) => ({
        id: extractFirestoreDocId(r.document!.name),
        ...decodeFirestoreFields(r.document!.fields),
      }));
  } catch {
    return [];
  }
}

async function fetchPublicCatalogStudioProfile(): Promise<Record<string, unknown> | null> {
  const { projectId, firestoreDatabaseId, apiKey } = loadFirebaseAppletConfig();
  if (!projectId || !firestoreDatabaseId || !apiKey) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents/publicCatalog/${encodeURIComponent(SHARED_STUDIO_ID)}?key=${encodeURIComponent(apiKey)}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const json = (await resp.json()) as { fields?: Record<string, FirestoreRestValue> };
    if (!json.fields) return null;
    return decodeFirestoreFields(json.fields);
  } catch {
    return null;
  }
}

let lastFirebaseSyncAt: string | null = null;

async function getBackendDatabaseStatus() {
  let sqliteConnected = false;
  let usersCount = 0;
  let studiosCount = 0;
  let recordsCount = 0;

  try {
    const ping = db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    sqliteConnected = ping?.ok === 1;
    usersCount = (db.prepare('SELECT COUNT(*) AS c FROM app_users').get() as { c: number }).c;
    studiosCount = (db.prepare('SELECT COUNT(*) AS c FROM studios').get() as { c: number }).c;
    recordsCount = (db.prepare('SELECT COUNT(*) AS c FROM studio_records').get() as { c: number }).c;
  } catch {
    sqliteConnected = false;
  }

  const { projectId, firestoreDatabaseId: databaseId, apiKey: firestoreApiKey } = loadFirebaseAppletConfig();

  let firestoreConnected = false;
  let firestoreHttpStatus: number | null = null;
  if (projectId && databaseId && firestoreApiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/test/connection?key=${encodeURIComponent(firestoreApiKey)}`;
      const resp = await fetch(url, { method: 'GET', signal: controller.signal });
      clearTimeout(timer);
      firestoreHttpStatus = resp.status;
      firestoreConnected = resp.status === 200 || resp.status === 403 || resp.status === 404;
    } catch {
      firestoreConnected = false;
    }
  }

  return {
    ok: sqliteConnected,
    checkedAt: new Date().toISOString(),
    sqlite: {
      connected: sqliteConnected,
      engine: 'node:sqlite (WAL)',
      usersCount,
      studiosCount,
      recordsCount,
    },
    firestore: {
      configured: Boolean(projectId && databaseId),
      connected: firestoreConnected,
      projectId,
      databaseId,
      httpStatus: firestoreHttpStatus,
      lastClientSyncAt: lastFirebaseSyncAt,
    },
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const shouldAttachSyncOps =
      req.method !== 'GET' &&
      !req.path.startsWith('/public/') &&
      !req.path.startsWith('/client/') &&
      !req.path.startsWith('/studio/sync-from-firebase') &&
      !req.path.startsWith('/studio/clear-simulation');
    syncTrackerStorage.run({ upserts: new Map(), deletes: new Map() }, () => {
      if (shouldAttachSyncOps) {
        const origJson = res.json.bind(res);
        res.json = ((body: unknown) => {
          const ops = collectSyncOps();
          if (
            ops &&
            body &&
            typeof body === 'object' &&
            !Array.isArray(body) &&
            !('syncOps' in (body as Record<string, unknown>))
          ) {
            return origJson({ ...(body as Record<string, unknown>), syncOps: ops });
          }
          return origJson(body);
        }) as Response['json'];
      }
      next();
    });
  });

  app.get('/api/health', async (_req: Request, res: Response) => {
    const status = await getBackendDatabaseStatus();
    res.status(status.ok ? 200 : 503).json(status);
  });

  app.get('/api/database/status', async (_req: Request, res: Response) => {
    const status = await getBackendDatabaseStatus();
    res.status(status.ok ? 200 : 503).json(status);
  });

  app.get('/api/auth/session', async (req: AuthedRequest, res: Response) => {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM app_users').get() as { cnt: number };
    const localUsersCount = countRow.cnt;
    const token = extractToken(req);

    const resolveNeedsSetup = async () => {
      if (localUsersCount > 0) {
        return { needsAdminSetup: false, cloudStudioExists: false };
      }
      const cloudStudio = await fetchPublicCatalogStudioProfile();
      const cloudExists = Boolean(cloudStudio);
      return { needsAdminSetup: !cloudExists, cloudStudioExists: cloudExists };
    };

    if (!token) {
      const setupState = await resolveNeedsSetup();
      res.json({
        user: null,
        needsAdminSetup: setupState.needsAdminSetup,
        cloudStudioExists: setupState.cloudStudioExists,
        primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
        sessionExpiresAt: null,
      });
      return;
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      const setupState = await resolveNeedsSetup();
      res.json({
        user: null,
        needsAdminSetup: setupState.needsAdminSetup,
        cloudStudioExists: setupState.cloudStudioExists,
        primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
        sessionExpiresAt: null,
        expired: true,
      });
      return;
    }

    const userRow = db.prepare('SELECT * FROM app_users WHERE id = ?').get(payload.uid) as
      | DbUserRow
      | undefined;

    if (
      !userRow ||
      userRow.active !== 1 ||
      (payload.ptag && payload.ptag !== passwordTag(userRow.password_hash))
    ) {
      const setupState = await resolveNeedsSetup();
      res.json({
        user: null,
        needsAdminSetup: setupState.needsAdminSetup,
        cloudStudioExists: setupState.cloudStudioExists,
        primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
        sessionExpiresAt: null,
      });
      return;
    }

    res.json({
      user: rowToSessionUser(userRow),
      needsAdminSetup: false,
      cloudStudioExists: false,
      primaryAdminEmail: PRIMARY_ADMIN_EMAIL,
      sessionExpiresAt: payload.exp,
    });
  });

  app.post('/api/auth/setup-admin', (req: Request, res: Response) => {
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM app_users').get() as { cnt: number };
    if (countRow.cnt > 0) {
      res.status(403).json({
        error: 'Administrator account is already initialized. Sign in with your admin credentials.',
      });
      return;
    }

    const body = req.body as { email?: string; fullName?: string; password?: string };
    const email = (body.email ?? PRIMARY_ADMIN_EMAIL).trim().toLowerCase();
    const fullName = (body.fullName ?? 'WELL SPA Administrator').trim();
    const password = body.password ?? '';

    if (!email || email.length < 3 || email.length > 120) {
      res.status(400).json({ error: 'Enter a valid admin email or login ID.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const uid = makeId('usr');
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);
    const permissions = { ...ALL_PERMISSIONS };

    db.prepare(
      `INSERT INTO app_users (
        id, email, full_name, password_hash, role, is_primary, active,
        permissions_json, created_by_uid, created_by_email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'admin', 1, 1, ?, ?, ?, ?, ?)`,
    ).run(uid, email, fullName, passwordHash, JSON.stringify(permissions), uid, email, now, now);

    ensureProductionStudioInitialized(uid);
    const { token, expiresAt } = signSessionToken(uid, passwordTag(passwordHash));

    const createdRow = db
      .prepare('SELECT * FROM app_users WHERE id = ?')
      .get(uid) as unknown as DbUserRow;
    setSessionCookie(req, res, 'wellspa_session', token);
    res.status(201).json({
      token,
      sessionExpiresAt: expiresAt,
      user: rowToSessionUser(createdRow),
    });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const body = req.body as { email?: string; password?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const ip = getClientIp(req);
    const retryAfterSec = checkLoginRateLimit(ip, email);
    if (retryAfterSec > 0) {
      const waitMins = Math.max(1, Math.ceil(retryAfterSec / 60));
      res.status(429).json({
        error: `Too many failed sign-in attempts. Please wait ${waitMins} minute${waitMins === 1 ? '' : 's'} before trying again.`,
      });
      return;
    }

    const userRow = db
      .prepare('SELECT * FROM app_users WHERE lower(email) = ?')
      .get(email) as DbUserRow | undefined;

    if (userRow) {
      if (!verifyPassword(password, userRow.password_hash)) {
        recordLoginFailure(ip, email);
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      if (userRow.active !== 1) {
        recordLoginFailure(ip, email);
        res.status(403).json({ error: 'This account has been deactivated by the administrator.' });
        return;
      }

      clearLoginFailures(ip, email);
      ensureProductionStudioInitialized(userRow.id);
      const { token, expiresAt } = signSessionToken(userRow.id, passwordTag(userRow.password_hash));

      clearSessionCookie(req, res, 'wellspa_client_session');
      setSessionCookie(req, res, 'wellspa_session', token);
      res.json({
        accountType: 'staff',
        token,
        sessionExpiresAt: expiresAt,
        user: rowToSessionUser(userRow),
      });
      return;
    }

    // Check registered client accounts if no staff/admin user matched
    const allClients = getCollection<StoredClient>('clients');
    const matchedClient = allClients.find(
      (c) =>
        c.email.trim().toLowerCase() === email &&
        typeof c.passwordHash === 'string' &&
        c.passwordHash.length > 0,
    );

    if (!matchedClient || !matchedClient.passwordHash) {
      verifyPassword(password, DUMMY_PASSWORD_HASH);
      recordLoginFailure(ip, email);
      const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM app_users').get() as { cnt: number }).cnt;
      if (userCount === 0) {
        const cloudStudio = await fetchPublicCatalogStudioProfile();
        if (cloudStudio) {
          res.status(401).json({
            error:
              'This workspace syncs via Google Cloud. Click "Continue with Google (Cloud Sync)" above to sign in on this device and load your shared studio data.',
          });
          return;
        }
      }
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!verifyPassword(password, matchedClient.passwordHash)) {
      recordLoginFailure(ip, email);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    clearLoginFailures(ip, email);
    const { token: clientToken, expiresAt } = signClientSessionToken(
      matchedClient.id,
      passwordTag(matchedClient.passwordHash),
    );
    clearSessionCookie(req, res, 'wellspa_session');
    setSessionCookie(req, res, 'wellspa_client_session', clientToken);
    res.json({
      accountType: 'client',
      clientToken,
      sessionExpiresAt: expiresAt,
      client: sanitizeClientProfile(matchedClient),
    });
  });

  app.post('/api/auth/firebase-login', async (req: Request, res: Response) => {
    const body = req.body as { idToken?: string };
    const idToken = typeof body.idToken === 'string' ? body.idToken.trim() : '';
    if (!idToken) {
      res.status(400).json({ error: 'Firebase ID token is required.' });
      return;
    }

    let verified: VerifiedFirebaseToken;
    try {
      verified = await verifyFirebaseIdToken(idToken);
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Unable to verify Google Sign-In token.',
      });
      return;
    }

    const email = verified.email;
    const isPrimary = email === PRIMARY_ADMIN_EMAIL.toLowerCase();
    const now = new Date().toISOString();

    let userRow = db
      .prepare('SELECT * FROM app_users WHERE lower(email) = ?')
      .get(email) as DbUserRow | undefined;

    if (isPrimary) {
      if (!userRow) {
        const uid = makeId('usr');
        const placeholderHash = hashPassword(crypto.randomBytes(24).toString('hex'));
        const perms = { ...ALL_PERMISSIONS };
        db.prepare(
          `INSERT INTO app_users (
            id, email, full_name, password_hash, role, is_primary, active,
            permissions_json, created_by_uid, created_by_email, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'admin', 1, 1, ?, ?, ?, ?, ?)`,
        ).run(
          uid,
          email,
          verified.name || 'WELL SPA Admin',
          placeholderHash,
          JSON.stringify(perms),
          uid,
          email,
          now,
          now,
        );
        userRow = db.prepare('SELECT * FROM app_users WHERE id = ?').get(uid) as unknown as DbUserRow;
      } else if (userRow.is_primary !== 1 || userRow.active !== 1 || userRow.role !== 'admin') {
        db.prepare(
          `UPDATE app_users
           SET role = 'admin', is_primary = 1, active = 1, permissions_json = ?, updated_at = ?
           WHERE id = ?`,
        ).run(JSON.stringify(ALL_PERMISSIONS), now, userRow.id);
        userRow = db.prepare('SELECT * FROM app_users WHERE id = ?').get(userRow.id) as unknown as DbUserRow;
      }
    } else {
      const cloudAccess = await fetchFirestoreStaffAccess(idToken, email);
      if (cloudAccess) {
        if (!userRow) {
          const uid = makeId('usr');
          const placeholderHash = hashPassword(crypto.randomBytes(24).toString('hex'));
          db.prepare(
            `INSERT INTO app_users (
              id, email, full_name, password_hash, role, is_primary, active,
              permissions_json, created_by_uid, created_by_email, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
          ).run(
            uid,
            email,
            cloudAccess.fullName,
            placeholderHash,
            cloudAccess.role,
            cloudAccess.active ? 1 : 0,
            JSON.stringify(cloudAccess.permissions),
            'firebase_sync',
            PRIMARY_ADMIN_EMAIL,
            now,
            now,
          );
          userRow = db.prepare('SELECT * FROM app_users WHERE id = ?').get(uid) as unknown as DbUserRow;
        } else if (userRow.is_primary !== 1) {
          db.prepare(
            `UPDATE app_users
             SET full_name = ?, role = ?, active = ?, permissions_json = ?, updated_at = ?
             WHERE id = ?`,
          ).run(
            cloudAccess.fullName,
            cloudAccess.role,
            cloudAccess.active ? 1 : 0,
            JSON.stringify(cloudAccess.permissions),
            now,
            userRow.id,
          );
          userRow = db.prepare('SELECT * FROM app_users WHERE id = ?').get(userRow.id) as unknown as DbUserRow;
        }
      }

      if (!userRow) {
        res.status(403).json({
          error: `Google account "${email}" is not authorized for WELL SPA. Ask the administrator (${PRIMARY_ADMIN_EMAIL}) to add your email in User Access.`,
        });
        return;
      }
      if (userRow.active !== 1) {
        res.status(403).json({ error: 'This account has been deactivated by the administrator.' });
        return;
      }
    }

    ensureProductionStudioInitialized(userRow.id);
    const { token, expiresAt } = signSessionToken(userRow.id, passwordTag(userRow.password_hash));

    clearSessionCookie(req, res, 'wellspa_client_session');
    setSessionCookie(req, res, 'wellspa_session', token);
    res.json({
      accountType: 'staff',
      token,
      sessionExpiresAt: expiresAt,
      user: rowToSessionUser(userRow),
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const token = extractToken(req);
    if (token) {
      const payload = verifySessionToken(token);
      revokeSessionToken(token, payload?.exp);
    }
    clearSessionCookie(req, res, 'wellspa_session');
    res.json({ ok: true });
  });

  // User Access & Permission Management
  app.get(
    '/api/users',
    requireAuth,
    requireAnyPermission('users'),
    (_req: AuthedRequest, res: Response) => {
      const rows = db
        .prepare('SELECT * FROM app_users ORDER BY is_primary DESC, full_name ASC')
        .all() as unknown as DbUserRow[];
      res.json({ users: rows.map(rowToAuthorizedUser) });
    },
  );

  app.post(
    '/api/users',
    requireAuth,
    requireAnyPermission('users'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.sessionUser!;
      const body = req.body as {
        email?: string;
        fullName?: string;
        password?: string;
        role?: AuthorizedUserRole;
        permissions?: Partial<UserPermissions>;
        active?: boolean;
      };

      const email = (body.email ?? '').trim().toLowerCase();
      const fullName = (body.fullName ?? '').trim();
      const password = body.password ?? '';
      const role: AuthorizedUserRole =
        body.role === 'admin' || body.role === 'manager' ? body.role : 'staff';

      if (!email || email.length < 3 || email.length > 120) {
        res.status(400).json({ error: 'Enter a valid email or login ID.' });
        return;
      }
      if (!fullName) {
        res.status(400).json({ error: 'Full name is required.' });
        return;
      }
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters.' });
        return;
      }

      const duplicate = db
        .prepare('SELECT id FROM app_users WHERE lower(email) = ?')
        .get(email) as { id: string } | undefined;
      if (duplicate) {
        res.status(409).json({ error: `A user with email "${email}" already exists.` });
        return;
      }

      const uid = makeId('usr');
      const now = new Date().toISOString();
      const permissions = normalizePermissions(body.permissions, role, false);
      const active = body.active === false ? 0 : 1;

      db.prepare(
        `INSERT INTO app_users (
          id, email, full_name, password_hash, role, is_primary, active,
          permissions_json, created_by_uid, created_by_email, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      ).run(
        uid,
        email,
        fullName,
        hashPassword(password),
        role,
        active,
        JSON.stringify(permissions),
        actor.uid,
        actor.email,
        now,
        now,
      );

      const created = db
        .prepare('SELECT * FROM app_users WHERE id = ?')
        .get(uid) as unknown as DbUserRow;
      res.status(201).json({ user: rowToAuthorizedUser(created) });
    },
  );

  app.patch(
    '/api/users/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('users'),
    (req: AuthedRequest, res: Response) => {
      const targetId = String(req.params.id);
      const existing = db.prepare('SELECT * FROM app_users WHERE id = ?').get(targetId) as
        | DbUserRow
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      const body = req.body as {
        fullName?: string;
        role?: AuthorizedUserRole;
        permissions?: Partial<UserPermissions>;
        active?: boolean;
        password?: string;
      };

      const isPrimary = existing.is_primary === 1;
      const nextName = body.fullName !== undefined ? body.fullName.trim() : existing.full_name;
      if (!nextName) {
        res.status(400).json({ error: 'Full name cannot be empty.' });
        return;
      }

      const nextRole: AuthorizedUserRole = isPrimary
        ? 'admin'
        : body.role === 'admin' || body.role === 'manager' || body.role === 'staff'
          ? body.role
          : ((existing.role as AuthorizedUserRole) ?? 'staff');

      let currentPerms: unknown = null;
      try {
        currentPerms = JSON.parse(existing.permissions_json);
      } catch {
        currentPerms = null;
      }

      const nextPermissions = isPrimary
        ? { ...ALL_PERMISSIONS }
        : normalizePermissions(body.permissions ?? currentPerms, nextRole, false);

      const nextActive = isPrimary
        ? 1
        : typeof body.active === 'boolean'
          ? body.active
            ? 1
            : 0
          : existing.active;

      let nextPasswordHash = existing.password_hash;
      if (body.password !== undefined && body.password !== '') {
        if (body.password.length < 8) {
          res.status(400).json({ error: 'New password must be at least 8 characters.' });
          return;
        }
        nextPasswordHash = hashPassword(body.password);
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE app_users
         SET full_name = ?, password_hash = ?, role = ?, active = ?, permissions_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        nextName,
        nextPasswordHash,
        nextRole,
        nextActive,
        JSON.stringify(nextPermissions),
        now,
        targetId,
      );

      const updated = db
        .prepare('SELECT * FROM app_users WHERE id = ?')
        .get(targetId) as unknown as DbUserRow;
      res.json({ user: rowToAuthorizedUser(updated) });
    },
  );

  app.delete(
    '/api/users/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('users'),
    (req: AuthedRequest, res: Response) => {
      const targetId = String(req.params.id);
      const existing = db.prepare('SELECT * FROM app_users WHERE id = ?').get(targetId) as
        | DbUserRow
        | undefined;
      if (!existing) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (existing.is_primary === 1) {
        res.status(400).json({ error: 'The primary administrator account cannot be deleted.' });
        return;
      }
      db.prepare('DELETE FROM app_users WHERE id = ?').run(targetId);
      res.json({ ok: true });
    },
  );

  app.delete(
    '/api/users',
    requireAuth,
    requireAdmin,
    requireAnyPermission('users'),
    (_req: AuthedRequest, res: Response) => {
      const result = db.prepare('DELETE FROM app_users WHERE is_primary = 0').run();
      res.json({ ok: true, deletedCount: Number(result.changes) });
    },
  );

  app.post(
    '/api/users/sync-from-firebase',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const actor = req.sessionUser!;
      const body = req.body as {
        users?: Array<{
          email: string;
          fullName: string;
          role: AuthorizedUserRole;
          isPrimaryAdmin?: boolean;
          active: boolean;
          permissions?: Partial<UserPermissions>;
        }>;
      };
      if (!Array.isArray(body.users)) {
        res.status(400).json({ error: 'users array is required.' });
        return;
      }

      const now = new Date().toISOString();
      const cloudEmails = new Set<string>();
      for (const remote of body.users) {
        const cleanEmail = (remote.email ?? '').trim().toLowerCase();
        if (!cleanEmail || remote.isPrimaryAdmin || cleanEmail === PRIMARY_ADMIN_EMAIL.toLowerCase()) {
          continue;
        }
        cloudEmails.add(cleanEmail);
        const role: AuthorizedUserRole =
          remote.role === 'admin' || remote.role === 'manager' ? remote.role : 'staff';
        const perms = normalizePermissions(remote.permissions, role, false);
        const existing = db
          .prepare('SELECT * FROM app_users WHERE lower(email) = ?')
          .get(cleanEmail) as DbUserRow | undefined;

        if (!existing) {
          const uid = makeId('usr');
          const placeholderHash = hashPassword(crypto.randomBytes(24).toString('hex'));
          db.prepare(
            `INSERT INTO app_users (
              id, email, full_name, password_hash, role, is_primary, active,
              permissions_json, created_by_uid, created_by_email, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
          ).run(
            uid,
            cleanEmail,
            (remote.fullName ?? cleanEmail).trim() || cleanEmail,
            placeholderHash,
            role,
            remote.active ? 1 : 0,
            JSON.stringify(perms),
            actor.uid,
            actor.email,
            now,
            now,
          );
        } else if (existing.is_primary !== 1) {
          db.prepare(
            `UPDATE app_users
             SET full_name = ?, role = ?, active = ?, permissions_json = ?, updated_at = ?
             WHERE id = ?`,
          ).run(
            (remote.fullName ?? existing.full_name).trim() || existing.full_name,
            role,
            remote.active ? 1 : 0,
            JSON.stringify(perms),
            now,
            existing.id,
          );
        }
      }

      if (cloudEmails.size > 0) {
        const localNonPrimary = db
          .prepare('SELECT id, email FROM app_users WHERE is_primary = 0')
          .all() as Array<{ id: string; email: string }>;
        for (const row of localNonPrimary) {
          if (!cloudEmails.has(row.email.trim().toLowerCase())) {
            db.prepare('DELETE FROM app_users WHERE id = ?').run(row.id);
          }
        }
      }

      const rows = db
        .prepare('SELECT * FROM app_users ORDER BY is_primary DESC, full_name ASC')
        .all() as unknown as DbUserRow[];
      res.json({ users: rows.map(rowToAuthorizedUser) });
    },
  );

  // Studio Data Bootstrap & Real-Time Stream
  app.get('/api/studio/bootstrap', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = req.sessionUser!;
    ensureProductionStudioInitialized(user.uid);

    const studioRow = db.prepare('SELECT data_json FROM studios WHERE id = ?').get(SHARED_STUDIO_ID) as
      | { data_json: string }
      | undefined;
    const studio = studioRow ? (JSON.parse(studioRow.data_json) as Studio) : null;

    const rooms = getCollection<SpaRoom>('rooms').sort((a, b) => a.name.localeCompare(b.name));
    const services = getCollection<SpaService>('services').sort((a, b) => a.name.localeCompare(b.name));
    const staff = getCollection<StaffMember>('staff').sort((a, b) => a.name.localeCompare(b.name));
    const membershipTiers = getCollection<MembershipTier>('membershipTiers').sort(
      (a, b) => a.monthlyPrice - b.monthlyPrice,
    );
    const clients = getCollection<StoredClient>('clients')
      .map(stripClientPassword)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    const appointments = getCollection<Appointment>('appointments').sort((a, b) =>
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
    );
    const notificationRules = getCollection<NotificationRule>('notificationRules').sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    const notificationLogs = getCollection<NotificationLog>('notificationLogs').sort((a, b) =>
      b.scheduledFor.localeCompare(a.scheduledFor),
    );
    const creditDeductions = getCollection<CreditDeduction>('creditDeductions').sort((a, b) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    );

    res.json({
      studio,
      rooms,
      services,
      staff,
      membershipTiers,
      clients,
      appointments,
      notificationRules,
      notificationLogs,
      creditDeductions,
    });
  });

  app.get('/api/studio/events', (req: AuthedRequest, res: Response) => {
    const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const token = queryToken || extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Session expired.' });
      return;
    }
    const userRow = db.prepare('SELECT id, active, password_hash FROM app_users WHERE id = ?').get(payload.uid) as
      | { id: string; active: number; password_hash: string }
      | undefined;
    if (!userRow || userRow.active !== 1 || (payload.ptag && payload.ptag !== passwordTag(userRow.password_hash))) {
      res.status(401).json({ error: 'Session invalid.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, at: Date.now() })}\n\n`);

    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  app.post(
    '/api/studio/clear-simulation',
    requireAuth,
    requireAdmin,
    (_req: AuthedRequest, res: Response) => {
      const deletedCount = purgeSimulationRecordsFromSqlite();
      emitStudioEvent('clear-simulation');
      res.json({ ok: true, deletedCount });
    },
  );

  app.post('/api/studio/sync-from-firebase', requireAuth, (req: AuthedRequest, res: Response) => {
    const body = req.body as {
      studio?: Studio | null;
      collections?: Partial<Record<string, Array<Record<string, unknown> & { id: string }>>>;
      replaceCollections?: boolean;
    };
    const now = new Date().toISOString();

    if (body.studio && typeof body.studio === 'object') {
      const studioData: Studio = {
        ...body.studio,
        id: SHARED_STUDIO_ID,
        seeded: false,
        updatedAt: body.studio.updatedAt ?? now,
      };
      db.prepare('INSERT OR REPLACE INTO studios (id, data_json, updated_at) VALUES (?, ?, ?)').run(
        SHARED_STUDIO_ID,
        JSON.stringify(studioData),
        now,
      );
    }

    const allowedCollections = new Set([
      'rooms',
      'services',
      'staff',
      'membershipTiers',
      'clients',
      'appointments',
      'notificationRules',
      'notificationLogs',
      'creditDeductions',
    ]);

    const upsertStmt = db.prepare(
      'INSERT OR REPLACE INTO studio_records (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?)',
    );

    if (body.collections && typeof body.collections === 'object') {
      for (const [collectionName, items] of Object.entries(body.collections)) {
        if (!allowedCollections.has(collectionName) || !Array.isArray(items)) continue;
        const incomingIds = new Set<string>();
        for (const item of items) {
          if (!item || typeof item.id !== 'string' || !item.id.trim()) continue;
          const id = item.id.trim();
          incomingIds.add(id);

          if (collectionName === 'clients') {
            const existingClient = getRecord<StoredClient>('clients', id);
            const merged = existingClient?.passwordHash
              ? { ...item, id, passwordHash: existingClient.passwordHash }
              : { ...item, id };
            upsertStmt.run(collectionName, id, JSON.stringify(merged), now);
          } else {
            upsertStmt.run(collectionName, id, JSON.stringify({ ...item, id }), now);
          }
        }

        if (body.replaceCollections) {
          const existingRows = getCollection<{ id: string }>(collectionName);
          for (const existingRow of existingRows) {
            if (!incomingIds.has(existingRow.id)) {
              db.prepare('DELETE FROM studio_records WHERE collection = ? AND id = ?').run(
                collectionName,
                existingRow.id,
              );
            }
          }
        }
      }
    }

    lastStudioMutationSource = 'firebase';
    void lastStudioMutationSource;
    lastFirebaseSyncAt = now;
    emitStudioEvent('firebase-sync');
    res.json({ ok: true });
  });

  // Appointments
  app.post(
    '/api/appointments',
    requireAuth,
    requireAnyPermission('appointments', 'booking_portal'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const input = req.body as {
        clientId?: string;
        clientName: string;
        clientEmail: string;
        clientPhone: string;
        serviceId: string;
        staffId: string;
        roomName?: string;
        date: string;
        startTime: string;
        useMembershipCredit: boolean;
        creditsToDeduct?: number;
        notes: string;
      };

      const service = getRecord<SpaService>('services', input.serviceId);
      const member = getRecord<StaffMember>('staff', input.staffId);
      if (!service || !member) {
        res.status(400).json({ error: 'Selected service or therapist was not found.' });
        return;
      }
      if (!input.date || !input.startTime) {
        res.status(400).json({ error: 'Date and time slot are required.' });
        return;
      }
      if (hasTherapistTimeConflict(member.id, input.date, input.startTime, service.durationMinutes)) {
        res.status(409).json({
          error: 'This time slot conflicts with an existing booking for this therapist.',
        });
        return;
      }

      let clientId = input.clientId ?? '';
      let clientRecord = clientId ? getRecord<StoredClient>('clients', clientId) : null;
      if (!clientRecord) {
        const allClients = getCollection<StoredClient>('clients');
        clientRecord =
          allClients.find(
            (c) =>
              input.clientEmail &&
              c.email.toLowerCase() === input.clientEmail.trim().toLowerCase(),
          ) ?? null;
      }

      if (!clientRecord) {
        clientId = makeId('cli');
        const newClient: StoredClient = {
          id: clientId,
          ownerId: user.uid,
          memberUids: [user.uid],
          fullName: input.clientName.trim(),
          email: input.clientEmail.trim(),
          phone: input.clientPhone.trim(),
          notes: '',
          preferredTherapistId: member.id,
          membershipTierId: '',
          membershipTierName: 'No Membership',
          membershipStatus: 'none',
          creditsRemaining: 0,
          nextRenewalDate: '',
          totalVisits: 0,
          lifetimeSpend: 0,
          smsOptIn: true,
          emailOptIn: true,
          createdAt: new Date().toISOString(),
        };
        saveRecord('clients', clientId, newClient as unknown as Record<string, unknown>);
        clientRecord = newClient;
      } else {
        clientId = clientRecord.id;
      }

      const deduction = computeCreditDeduction(
        service.price,
        clientRecord.creditsRemaining,
        input.creditsToDeduct,
        input.useMembershipCredit,
      );
      const appointmentId = makeId('apt');
      const now = new Date().toISOString();
      const newAppointment: Appointment = {
        id: appointmentId,
        ownerId: user.uid,
        memberUids: [user.uid],
        clientId,
        clientName: input.clientName.trim(),
        clientEmail: input.clientEmail.trim(),
        clientPhone: input.clientPhone.trim(),
        serviceId: service.id,
        serviceName: service.name,
        staffId: member.id,
        staffName: member.name,
        roomName: input.roomName?.trim() || member.assignedRoom || 'Unassigned',
        date: input.date,
        startTime: input.startTime,
        durationMinutes: service.durationMinutes,
        price: service.price,
        usedMembershipCredit: deduction.usedMembershipCredit,
        creditsUsed: deduction.creditsUsed,
        amountPaid: deduction.amountPaid,
        status: 'confirmed',
        notes: input.notes.trim(),
        confirmationSent: true,
        reminderSent: false,
        createdAt: now,
        updatedAt: now,
      };

      saveRecord('appointments', appointmentId, newAppointment as unknown as Record<string, unknown>);

      if (deduction.creditsUsed > 0) {
        saveRecord('clients', clientId, {
          ...clientRecord,
          creditsRemaining: Math.max(0, clientRecord.creditsRemaining - deduction.creditsUsed),
        });
      }

      const studioRow = db.prepare('SELECT data_json FROM studios WHERE id = ?').get(SHARED_STUDIO_ID) as
        | { data_json: string }
        | undefined;
      const studioName = studioRow
        ? ((JSON.parse(studioRow.data_json) as Studio).name ?? 'WELL SPA')
        : 'WELL SPA';

      triggerNotificationForEvent({
        ownerId: user.uid,
        eventKey: 'booking_confirmed',
        appointment: newAppointment,
        studioName,
      });
      triggerNotificationForEvent({
        ownerId: user.uid,
        eventKey: 'reminder_24h',
        appointment: newAppointment,
        studioName,
      });

      res.status(201).json({ appointmentId });
    },
  );

  app.patch(
    '/api/appointments/:id/status',
    requireAuth,
    requireAnyPermission('appointments'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const aptId = String(req.params.id);
      const existing = getRecord<Appointment>('appointments', aptId);
      if (!existing) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }

      const body = req.body as { status?: AppointmentStatus };
      const status = body.status;
      const VALID_STATUSES: AppointmentStatus[] = [
        'confirmed',
        'checked_in',
        'in_progress',
        'completed',
        'cancelled',
        'no_show',
      ];
      if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: 'A valid appointment status is required.' });
        return;
      }
      if (existing.status === 'cancelled' || existing.status === 'completed') {
        res.status(400).json({
          error: `Cannot change status of an appointment that is already ${existing.status}.`,
        });
        return;
      }

      saveRecord('appointments', aptId, { ...existing, status });

      if (status === 'completed') {
        const client = getRecord<StoredClient>('clients', existing.clientId);
        if (client) {
          const paidAmount =
            typeof existing.amountPaid === 'number'
              ? existing.amountPaid
              : existing.usedMembershipCredit
                ? 0
                : existing.price;
          saveRecord('clients', client.id, {
            ...client,
            totalVisits: client.totalVisits + 1,
            lifetimeSpend: client.lifetimeSpend + paidAmount,
          });
        }
        const studioRow = db.prepare('SELECT data_json FROM studios WHERE id = ?').get(SHARED_STUDIO_ID) as
          | { data_json: string }
          | undefined;
        const studioName = studioRow
          ? ((JSON.parse(studioRow.data_json) as Studio).name ?? 'WELL SPA')
          : 'WELL SPA';
        triggerNotificationForEvent({
          ownerId: user.uid,
          eventKey: 'post_visit_rebook',
          appointment: { ...existing, status },
          studioName,
        });
      }

      if (status === 'cancelled') {
        const refundCredits =
          typeof existing.creditsUsed === 'number'
            ? existing.creditsUsed
            : existing.usedMembershipCredit
              ? 1
              : 0;
        if (refundCredits > 0) {
          const client = getRecord<StoredClient>('clients', existing.clientId);
          if (client) {
            saveRecord('clients', client.id, {
              ...client,
              creditsRemaining: client.creditsRemaining + refundCredits,
            });
          }
        }
      }

      res.json({ ok: true });
    },
  );

  app.patch(
    '/api/appointments/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('appointments'),
    (req: AuthedRequest, res: Response) => {
      const aptId = String(req.params.id);
      const existing = getRecord<Appointment>('appointments', aptId);
      if (!existing) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }
      const updates = req.body as Partial<Appointment>;
      const nextStaffId = updates.staffId ?? existing.staffId;
      const nextDate = updates.date ?? existing.date;
      const nextStartTime = updates.startTime ?? existing.startTime;
      const nextDuration = updates.durationMinutes ?? existing.durationMinutes;
      if (
        existing.status !== 'cancelled' &&
        existing.status !== 'no_show' &&
        hasTherapistTimeConflict(nextStaffId, nextDate, nextStartTime, nextDuration, aptId)
      ) {
        res.status(409).json({
          error: 'This time slot conflicts with an existing booking for the selected therapist.',
        });
        return;
      }
      saveRecord('appointments', aptId, { ...existing, ...updates });
      res.json({ ok: true });
    },
  );

  // Rooms / Suites
  app.post(
    '/api/rooms',
    requireAuth,
    requireAnyPermission('staff'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const body = req.body as { name?: string; roomType?: string; notes?: string };
      const name = (body.name ?? '').trim();
      if (!name) {
        res.status(400).json({ error: 'Room name is required.' });
        return;
      }
      const existingRooms = getCollection<SpaRoom>('rooms');
      if (existingRooms.some((r) => r.name.trim().toLowerCase() === name.toLowerCase())) {
        res.status(409).json({ error: 'A room with this name already exists.' });
        return;
      }
      const id = makeId('room');
      const now = new Date().toISOString();
      const room: SpaRoom = {
        id,
        ownerId: user.uid,
        memberUids: [user.uid],
        name,
        roomType: (body.roomType ?? 'Treatment Suite').trim() || 'Treatment Suite',
        active: true,
        notes: (body.notes ?? '').trim(),
        createdAt: now,
        updatedAt: now,
      };
      saveRecord('rooms', id, room as unknown as Record<string, unknown>);
      res.status(201).json({ room });
    },
  );

  app.patch(
    '/api/rooms/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('staff'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<SpaRoom>('rooms', id);
      if (!existing) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      const body = req.body as { name?: string; roomType?: string; active?: boolean; notes?: string };
      const nextName = body.name !== undefined ? body.name.trim() : existing.name;
      if (!nextName) {
        res.status(400).json({ error: 'Room name cannot be empty.' });
        return;
      }
      const allRooms = getCollection<SpaRoom>('rooms');
      if (
        allRooms.some(
          (r) => r.id !== id && r.name.trim().toLowerCase() === nextName.toLowerCase(),
        )
      ) {
        res.status(409).json({ error: 'Another room with this name already exists.' });
        return;
      }

      const updated: SpaRoom = {
        ...existing,
        name: nextName,
        roomType: body.roomType !== undefined ? body.roomType.trim() || 'Treatment Suite' : existing.roomType,
        active: typeof body.active === 'boolean' ? body.active : existing.active,
        notes: body.notes !== undefined ? body.notes.trim() : existing.notes,
      };
      saveRecord('rooms', id, updated as unknown as Record<string, unknown>);

      if (nextName !== existing.name) {
        const allStaff = getCollection<StaffMember>('staff');
        for (const member of allStaff) {
          if (member.assignedRoomId === id || member.assignedRoom === existing.name) {
            saveRecord('staff', member.id, {
              ...member,
              assignedRoomId: id,
              assignedRoom: nextName,
            });
          }
        }
      }

      res.json({ room: updated });
    },
  );

  app.delete(
    '/api/rooms/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('staff'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<SpaRoom>('rooms', id);
      if (!existing) {
        res.status(404).json({ error: 'Room not found.' });
        return;
      }
      deleteRecord('rooms', id);
      const allStaff = getCollection<StaffMember>('staff');
      for (const member of allStaff) {
        if (member.assignedRoomId === id || member.assignedRoom === existing.name) {
          saveRecord('staff', member.id, {
            ...member,
            assignedRoomId: '',
            assignedRoom: 'Unassigned',
          });
        }
      }
      res.json({ ok: true });
    },
  );

  // Staff
  app.post(
    '/api/staff',
    requireAuth,
    requireAnyPermission('staff'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const input = req.body as Omit<StaffMember, 'id' | 'ownerId' | 'memberUids' | 'onDuty'>;
      const rooms = getCollection<SpaRoom>('rooms');
      let resolvedRoomId = input.assignedRoomId ?? '';
      let resolvedRoomName = (input.assignedRoom ?? '').trim();
      if (resolvedRoomId) {
        const room = rooms.find((r) => r.id === resolvedRoomId);
        if (room) resolvedRoomName = room.name;
      } else if (resolvedRoomName && resolvedRoomName !== 'Unassigned') {
        const matched = rooms.find((r) => r.name.toLowerCase() === resolvedRoomName.toLowerCase());
        if (matched) resolvedRoomId = matched.id;
      }
      if (!resolvedRoomName) {
        resolvedRoomName = 'Unassigned';
      }

      const id = makeId('stf');
      const now = new Date().toISOString();
      const record: StaffMember = {
        id,
        ownerId: user.uid,
        memberUids: [user.uid],
        ...input,
        assignedRoomId: resolvedRoomId,
        assignedRoom: resolvedRoomName,
        onDuty: true,
        createdAt: now,
        updatedAt: now,
      };
      saveRecord('staff', id, record as unknown as Record<string, unknown>);
      res.status(201).json({ staff: record });
    },
  );

  app.patch(
    '/api/staff/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('staff'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<StaffMember>('staff', id);
      if (!existing) {
        res.status(404).json({ error: 'Therapist not found.' });
        return;
      }
      const patch = req.body as Partial<StaffMember>;
      const nextPatch: Partial<StaffMember> = { ...patch };
      if (patch.name !== undefined) {
        const trimmedName = patch.name.trim();
        if (!trimmedName) {
          res.status(400).json({ error: 'Therapist full name cannot be empty.' });
          return;
        }
        nextPatch.name = trimmedName;
      }
      if (patch.role !== undefined) {
        nextPatch.role = patch.role.trim() || existing.role;
      }
      if (patch.specialty !== undefined) {
        nextPatch.specialty = patch.specialty.trim();
      }
      if (patch.bio !== undefined) {
        nextPatch.bio = patch.bio.trim();
      }
      if (patch.avatarUrl !== undefined) {
        nextPatch.avatarUrl = patch.avatarUrl.trim();
      }

      const rooms = getCollection<SpaRoom>('rooms');
      if (patch.assignedRoomId !== undefined) {
        if (patch.assignedRoomId === '') {
          nextPatch.assignedRoomId = '';
          nextPatch.assignedRoom = 'Unassigned';
        } else {
          const room = rooms.find((r) => r.id === patch.assignedRoomId);
          if (room) {
            nextPatch.assignedRoomId = room.id;
            nextPatch.assignedRoom = room.name;
          }
        }
      } else if (patch.assignedRoom !== undefined) {
        const room = rooms.find((r) => r.name.toLowerCase() === patch.assignedRoom!.trim().toLowerCase());
        if (room) {
          nextPatch.assignedRoomId = room.id;
          nextPatch.assignedRoom = room.name;
        }
      }

      const updated: StaffMember = { ...existing, ...nextPatch };
      saveRecord('staff', id, updated as unknown as Record<string, unknown>);

      if (updated.name !== existing.name) {
        const allAppointments = getCollection<Appointment>('appointments');
        for (const apt of allAppointments) {
          if (apt.staffId === id) {
            saveRecord('appointments', apt.id, {
              ...apt,
              staffName: updated.name,
            });
          }
        }
      }

      res.json({ staff: updated });
    },
  );

  // Memberships & Clients
  app.post(
    '/api/membership-tiers',
    requireAuth,
    requireAnyPermission('memberships'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const input = req.body as Omit<MembershipTier, 'id' | 'ownerId' | 'memberUids' | 'active'>;
      const id = makeId('tier');
      const now = new Date().toISOString();
      const tier: MembershipTier = {
        id,
        ownerId: user.uid,
        memberUids: [user.uid],
        ...input,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      saveRecord('membershipTiers', id, tier as unknown as Record<string, unknown>);
      res.status(201).json({ tier });
    },
  );

  app.patch(
    '/api/membership-tiers/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('memberships'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<MembershipTier>('membershipTiers', id);
      if (!existing) {
        res.status(404).json({ error: 'Membership tier not found.' });
        return;
      }
      const patch = req.body as Partial<MembershipTier>;
      if (patch.name !== undefined && !patch.name.trim()) {
        res.status(400).json({ error: 'Plan tier name cannot be empty.' });
        return;
      }
      const updated: MembershipTier = {
        ...existing,
        ...patch,
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        targetAudience:
          patch.targetAudience !== undefined ? patch.targetAudience.trim() : existing.targetAudience,
        perksSummary:
          patch.perksSummary !== undefined ? patch.perksSummary.trim() : existing.perksSummary,
      };
      saveRecord('membershipTiers', id, updated as unknown as Record<string, unknown>);

      if (updated.name !== existing.name) {
        const allClients = getCollection<StoredClient>('clients');
        for (const client of allClients) {
          if (client.membershipTierId === id) {
            saveRecord('clients', client.id, {
              ...client,
              membershipTierName: updated.name,
            });
          }
        }
      }

      res.json({ tier: updated });
    },
  );

  app.delete(
    '/api/membership-tiers/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('memberships'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<MembershipTier>('membershipTiers', id);
      if (!existing) {
        res.status(404).json({ error: 'Membership tier not found.' });
        return;
      }
      deleteRecord('membershipTiers', id);

      // Preserve existing client credits (no expiration) while detaching deleted tier reference
      const allClients = getCollection<StoredClient>('clients');
      for (const client of allClients) {
        if (client.membershipTierId === id) {
          saveRecord('clients', client.id, {
            ...client,
            membershipTierId: '',
            membershipTierName: 'No Membership',
            membershipStatus: 'none',
            nextRenewalDate: '',
          });
        }
      }

      res.json({ ok: true });
    },
  );

  app.post(
    '/api/clients',
    requireAuth,
    requireAnyPermission('memberships', 'appointments', 'booking_portal'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const input = req.body as {
        fullName: string;
        email: string;
        phone: string;
        notes: string;
        preferredTherapistId: string;
        membershipTierId: string;
        smsOptIn: boolean;
        emailOptIn: boolean;
        password?: string;
      };
      if (input.password && input.password.length > 0 && input.password.length < 6) {
        res.status(400).json({ error: 'Client portal password must be at least 6 characters.' });
        return;
      }
      const normalizedEmail = (input.email ?? '').trim().toLowerCase();
      if (normalizedEmail) {
        const existingClients = getCollection<StoredClient>('clients');
        if (existingClients.some((c) => c.email.trim().toLowerCase() === normalizedEmail)) {
          res.status(409).json({ error: `A client profile with email "${normalizedEmail}" already exists.` });
          return;
        }
      }
      const tier = input.membershipTierId
        ? getRecord<MembershipTier>('membershipTiers', input.membershipTierId)
        : null;
      const id = makeId('cli');
      const now = new Date().toISOString();
      const client: StoredClient = {
        id,
        ownerId: user.uid,
        memberUids: [user.uid],
        fullName: input.fullName.trim(),
        email: input.email.trim(),
        phone: input.phone.trim(),
        notes: input.notes.trim(),
        preferredTherapistId: input.preferredTherapistId,
        membershipTierId: tier ? tier.id : '',
        membershipTierName: tier ? tier.name : 'No Membership',
        membershipStatus: tier ? 'active' : 'none',
        creditsRemaining: tier ? tier.creditsPerMonth : 0,
        nextRenewalDate: tier ? formatLocalDate(30) : '',
        totalVisits: 0,
        lifetimeSpend: 0,
        smsOptIn: input.smsOptIn,
        emailOptIn: input.emailOptIn,
        ...(input.password && input.password.length >= 6
          ? { passwordHash: hashPassword(input.password) }
          : {}),
        createdAt: now,
        updatedAt: now,
      };
      saveRecord('clients', id, client as unknown as Record<string, unknown>);
      res.status(201).json({ clientId: id });
    },
  );

  app.patch(
    '/api/clients/:id/membership',
    requireAuth,
    requireAdmin,
    requireAnyPermission('memberships'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const id = String(req.params.id);
      const client = getRecord<StoredClient>('clients', id);
      if (!client) {
        res.status(404).json({ error: 'Client not found.' });
        return;
      }

      const body = req.body as {
        action: 'assign' | 'status' | 'credits' | 'renew' | 'password' | 'deduct';
        tierId?: string;
        status?: MembershipStatus;
        delta?: number;
        exactCredits?: number;
        password?: string;
        email?: string;
        nextRenewalDate?: string;
        creditsToDeduct?: number;
        category?: 'Massage' | 'Order Item' | 'Service';
        description?: string;
        date?: string;
      };

      if (body.action === 'assign') {
        const tier = body.tierId ? getRecord<MembershipTier>('membershipTiers', body.tierId) : null;
        if (!tier) {
          saveRecord('clients', id, {
            ...client,
            membershipTierId: '',
            membershipTierName: 'No Membership',
            membershipStatus: 'none',
            nextRenewalDate: '',
          });
        } else {
          // Credits never expire: keep existing credits and add the new tier's credits when switching plans
          const nextCredits =
            client.membershipTierId === tier.id
              ? client.creditsRemaining
              : client.creditsRemaining + tier.creditsPerMonth;
          saveRecord('clients', id, {
            ...client,
            membershipTierId: tier.id,
            membershipTierName: tier.name,
            membershipStatus: 'active',
            creditsRemaining: nextCredits,
            nextRenewalDate: formatLocalDate(30),
          });
        }
      } else if (body.action === 'status' && body.status) {
        saveRecord('clients', id, { ...client, membershipStatus: body.status });
      } else if (body.action === 'credits') {
        if (typeof body.exactCredits === 'number' && Number.isFinite(body.exactCredits)) {
          saveRecord('clients', id, {
            ...client,
            creditsRemaining: Math.max(0, Math.floor(body.exactCredits)),
          });
        } else if (typeof body.delta === 'number' && Number.isFinite(body.delta)) {
          saveRecord('clients', id, {
            ...client,
            creditsRemaining: Math.max(0, client.creditsRemaining + Math.floor(body.delta)),
          });
        }
      } else if (body.action === 'deduct') {
        const deductAmt = Math.floor(Number(body.creditsToDeduct) || 0);
        const description = (body.description ?? '').trim();
        const category: CreditDeduction['category'] =
          body.category === 'Massage' || body.category === 'Service'
            ? body.category
            : 'Order Item';
        if (!description) {
          res.status(400).json({ error: 'Enter what the deduction is for (e.g. Massage or ordered item).' });
          return;
        }
        if (deductAmt <= 0) {
          res.status(400).json({ error: 'Deduction amount must be at least 1 credit ($1).' });
          return;
        }
        if (deductAmt > client.creditsRemaining) {
          res.status(400).json({
            error: `Cannot deduct ${deductAmt} credits; client only has ${client.creditsRemaining} credits available.`,
          });
          return;
        }
        const nextCredits = client.creditsRemaining - deductAmt;
        saveRecord('clients', id, {
          ...client,
          creditsRemaining: nextCredits,
        });
        const deductionId = makeId('ded');
        const now = new Date().toISOString();
        const deductionRecord: CreditDeduction = {
          id: deductionId,
          ownerId: user.uid,
          memberUids: [user.uid],
          clientId: client.id,
          clientName: client.fullName,
          category,
          description,
          creditsDeducted: deductAmt,
          recordedByEmail: user.email,
          date:
            body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim())
              ? body.date.trim()
              : formatLocalDate(0),
          createdAt: now,
          updatedAt: now,
        };
        saveRecord(
          'creditDeductions',
          deductionId,
          deductionRecord as unknown as Record<string, unknown>,
        );
      } else if (body.action === 'password') {
        const pwd = body.password ?? '';
        if (pwd.length < 6) {
          res.status(400).json({ error: 'Client portal password must be at least 6 characters.' });
          return;
        }
        const nextEmail = body.email !== undefined ? body.email.trim().toLowerCase() : client.email.trim().toLowerCase();
        if (!nextEmail) {
          res.status(400).json({ error: 'An email address is required so the client can sign in.' });
          return;
        }
        if (nextEmail !== client.email.trim().toLowerCase()) {
          const allClients = getCollection<StoredClient>('clients');
          if (allClients.some((c) => c.id !== id && c.email.trim().toLowerCase() === nextEmail)) {
            res.status(409).json({ error: `Another client already uses "${nextEmail}".` });
            return;
          }
        }
        saveRecord('clients', id, {
          ...client,
          email: nextEmail,
          emailOptIn: true,
          passwordHash: hashPassword(pwd),
        });
      } else if (body.action === 'renew') {
        const requestedDate = (body.nextRenewalDate ?? '').trim();
        if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
          res.status(400).json({ error: 'Enter a valid next renewal date (YYYY-MM-DD).' });
          return;
        }
        const nextRenewalDate = requestedDate || formatLocalDate(30);
        // Renew updates the next renewal date ONLY; credits do not increase
        saveRecord('clients', id, {
          ...client,
          membershipStatus: 'active',
          nextRenewalDate,
        });

        const rules = getCollection<NotificationRule>('notificationRules');
        const renewRule = rules.find((r) => r.eventKey === 'membership_renewed' && r.enabled);
        if (renewRule) {
          const studioRow = db
            .prepare('SELECT data_json FROM studios WHERE id = ?')
            .get(SHARED_STUDIO_ID) as { data_json: string } | undefined;
          const studioName = studioRow
            ? ((JSON.parse(studioRow.data_json) as Studio).name ?? 'WELL SPA')
            : 'WELL SPA';
          const vars = {
            clientName: client.fullName,
            tierName: client.membershipTierName || 'Membership',
            creditsRemaining: String(client.creditsRemaining),
            nextRenewalDate,
            studioName,
          };
          const channels = resolveNotificationChannels(
            renewRule.channel,
            client.email,
            client.phone,
            client.emailOptIn,
            client.smsOptIn,
          );
          const now = new Date().toISOString();
          for (const channel of channels) {
            const logId = makeId('log');
            const logEntry: NotificationLog = {
              id: logId,
              ownerId: user.uid,
              memberUids: [user.uid],
              ruleId: renewRule.id,
              eventKey: 'membership_renewed',
              appointmentId: '',
              clientId: client.id,
              clientName: client.fullName,
              recipientContact:
                channel === 'SMS' ? client.phone || client.email : client.email || client.phone,
              channel,
              subject: renderNotificationTemplate(renewRule.subjectTemplate, vars),
              messageBody: renderNotificationTemplate(renewRule.bodyTemplate, vars),
              status: 'sent',
              scheduledFor: `Next Renewal: ${nextRenewalDate}`,
              sentAtLabel: nowTimeLabel(),
              createdAt: now,
              updatedAt: now,
            };
            saveRecord('notificationLogs', logId, logEntry as unknown as Record<string, unknown>);
          }
          if (channels.length > 0) {
            saveRecord('notificationRules', renewRule.id, {
              ...renewRule,
              sentCount: renewRule.sentCount + channels.length,
            });
          }
        }
      }

      res.json({ ok: true });
    },
  );

  // Notifications
  app.patch(
    '/api/notification-rules/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('notifications'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<NotificationRule>('notificationRules', id);
      if (!existing) {
        res.status(404).json({ error: 'Notification rule not found.' });
        return;
      }
      saveRecord('notificationRules', id, {
        ...existing,
        ...(req.body as Partial<NotificationRule>),
      });
      res.json({ ok: true });
    },
  );

  app.post(
    '/api/notifications/dispatch/:id',
    requireAuth,
    requireAnyPermission('notifications'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<NotificationLog>('notificationLogs', id);
      if (!existing) {
        res.status(404).json({ error: 'Notification log not found.' });
        return;
      }
      if (existing.status === 'sent') {
        res.json({ ok: true });
        return;
      }
      saveRecord('notificationLogs', id, {
        ...existing,
        status: 'sent',
        sentAtLabel: nowTimeLabel(),
      });
      if (existing.ruleId) {
        const rule = getRecord<NotificationRule>('notificationRules', existing.ruleId);
        if (rule) {
          saveRecord('notificationRules', rule.id, { ...rule, sentCount: rule.sentCount + 1 });
        }
      }
      res.json({ ok: true });
    },
  );

  app.post(
    '/api/notifications/dispatch-all',
    requireAuth,
    requireAnyPermission('notifications'),
    (_req: AuthedRequest, res: Response) => {
      const logs = getCollection<NotificationLog>('notificationLogs');
      const pending = logs.filter((l) => l.status === 'scheduled');
      const ruleIncrement = new Map<string, number>();
      for (const item of pending) {
        saveRecord('notificationLogs', item.id, {
          ...item,
          status: 'sent',
          sentAtLabel: nowTimeLabel(),
        });
        if (item.ruleId) {
          ruleIncrement.set(item.ruleId, (ruleIncrement.get(item.ruleId) ?? 0) + 1);
        }
      }
      for (const [ruleId, inc] of ruleIncrement.entries()) {
        const rule = getRecord<NotificationRule>('notificationRules', ruleId);
        if (rule) {
          saveRecord('notificationRules', rule.id, { ...rule, sentCount: rule.sentCount + inc });
        }
      }
      res.json({ count: pending.length });
    },
  );

  app.post(
    '/api/notifications/manual',
    requireAuth,
    requireAnyPermission('notifications', 'appointments'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const body = req.body as {
        clientId: string;
        channel: NotificationChannel;
        subject: string;
        messageBody: string;
        appointmentId?: string;
      };
      const client = getRecord<Client>('clients', body.clientId);
      if (!client) {
        res.status(404).json({ error: 'Client not found.' });
        return;
      }
      const logId = makeId('log');
      const entry: NotificationLog = {
        id: logId,
        ownerId: user.uid,
        memberUids: [user.uid],
        ruleId: 'manual_dispatch',
        eventKey: 'manual_alert',
        appointmentId: body.appointmentId ?? '',
        clientId: client.id,
        clientName: client.fullName,
        recipientContact: body.channel === 'SMS' ? client.phone || client.email : client.email || client.phone,
        channel: body.channel,
        subject: body.subject.trim(),
        messageBody: body.messageBody.trim(),
        status: 'sent',
        scheduledFor: 'Manual Dispatch',
        sentAtLabel: nowTimeLabel(),
      };
      saveRecord('notificationLogs', logId, entry as unknown as Record<string, unknown>);
      res.status(201).json({ ok: true });
    },
  );

  // Services
  app.post(
    '/api/services',
    requireAuth,
    requireAnyPermission('services'),
    (req: AuthedRequest, res: Response) => {
      const user = req.sessionUser!;
      const input = req.body as Omit<SpaService, 'id' | 'ownerId' | 'memberUids' | 'active'>;
      const id = makeId('svc');
      const service: SpaService = {
        id,
        ownerId: user.uid,
        memberUids: [user.uid],
        ...input,
        active: true,
      };
      saveRecord('services', id, service as unknown as Record<string, unknown>);
      res.status(201).json({ service });
    },
  );

  app.patch(
    '/api/services/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('services'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<SpaService>('services', id);
      if (!existing) {
        res.status(404).json({ error: 'Service not found.' });
        return;
      }
      const patch = req.body as Partial<SpaService>;
      if (patch.name !== undefined && !patch.name.trim()) {
        res.status(400).json({ error: 'Service name cannot be empty.' });
        return;
      }
      const updated: SpaService = {
        ...existing,
        ...patch,
        name: patch.name !== undefined ? patch.name.trim() : existing.name,
        roomType: patch.roomType !== undefined ? patch.roomType.trim() : existing.roomType,
        description: patch.description !== undefined ? patch.description.trim() : existing.description,
      };
      saveRecord('services', id, updated as unknown as Record<string, unknown>);
      res.json({ service: updated });
    },
  );

  app.delete(
    '/api/services/:id',
    requireAuth,
    requireAdmin,
    requireAnyPermission('services'),
    (req: AuthedRequest, res: Response) => {
      const id = String(req.params.id);
      const existing = getRecord<SpaService>('services', id);
      if (!existing) {
        res.status(404).json({ error: 'Service not found.' });
        return;
      }
      deleteRecord('services', id);
      res.json({ ok: true });
    },
  );

  // Public & Client Account Portal Routes (client accounts only; strictly scoped to own records)
  function resolveStudioOwnerUid(): string {
    const primary = db
      .prepare('SELECT id FROM app_users WHERE is_primary = 1 LIMIT 1')
      .get() as { id: string } | undefined;
    return primary?.id ?? 'primary_admin';
  }

  function buildClientPortalPayload(client: StoredClient) {
    const appointments = getCollection<Appointment>('appointments')
      .filter((a) => a.clientId === client.id)
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
    const notificationLogs = getCollection<NotificationLog>('notificationLogs')
      .filter((l) => l.clientId === client.id)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

    return {
      client: sanitizeClientProfile(client),
      appointments,
      notificationLogs,
    };
  }

  app.get('/api/client/session', (req: Request, res: Response) => {
    const resolved = resolveClientSessionFromRequest(req);
    if (!resolved) {
      res.json({ client: null, sessionExpiresAt: null, appointments: [], notificationLogs: [] });
      return;
    }
    res.json({
      sessionExpiresAt: resolved.expiresAt,
      ...buildClientPortalPayload(resolved.client),
    });
  });

  app.post('/api/client/signup', (req: Request, res: Response) => {
    const body = req.body as {
      fullName?: string;
      email?: string;
      phone?: string;
      password?: string;
    };
    const fullName = (body.fullName ?? '').trim();
    const email = (body.email ?? '').trim().toLowerCase();
    const phone = (body.phone ?? '').trim();
    const password = body.password ?? '';

    if (!fullName || !email || !phone) {
      res.status(400).json({
        error: 'Full Name, Email Address, and Phone Number are required to sign up.',
      });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({
        error: 'Password must be at least 6 characters.',
      });
      return;
    }

    const staffCollision = db
      .prepare('SELECT id FROM app_users WHERE lower(email) = ?')
      .get(email) as { id: string } | undefined;
    if (staffCollision) {
      res.status(409).json({
        error: 'This email is already registered as a studio account. Please sign in on the Sign In screen.',
      });
      return;
    }

    const allClients = getCollection<StoredClient>('clients');
    const duplicateEmail = allClients.find((c) => c.email.trim().toLowerCase() === email);
    if (duplicateEmail) {
      res.status(409).json({
        error: 'An account with this email already exists. Please use Sign In to access your bookings.',
      });
      return;
    }

    const ownerUid = resolveStudioOwnerUid();
    ensureProductionStudioInitialized(ownerUid);
    const clientId = makeId('cli');
    const now = new Date().toISOString();
    const pwdHash = hashPassword(password);
    const newClient: StoredClient = {
      id: clientId,
      ownerId: ownerUid,
      memberUids: [ownerUid],
      fullName,
      email,
      phone,
      notes: 'Signed up via Client Booking Portal.',
      preferredTherapistId: '',
      membershipTierId: '',
      membershipTierName: 'No Membership',
      membershipStatus: 'none',
      creditsRemaining: 0,
      nextRenewalDate: '',
      totalVisits: 0,
      lifetimeSpend: 0,
      smsOptIn: true,
      emailOptIn: true,
      passwordHash: pwdHash,
      createdAt: now,
      updatedAt: now,
    };

    saveRecord('clients', clientId, newClient as unknown as Record<string, unknown>);

    const { token: clientToken, expiresAt } = signClientSessionToken(clientId, passwordTag(pwdHash));
    clearSessionCookie(req, res, 'wellspa_session');
    setSessionCookie(req, res, 'wellspa_client_session', clientToken);
    res.status(201).json({
      clientToken,
      sessionExpiresAt: expiresAt,
      ...buildClientPortalPayload(newClient),
    });
  });

  app.post('/api/client/login', (req: Request, res: Response) => {
    const body = req.body as { email?: string; password?: string };
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const ip = getClientIp(req);
    const retryAfterSec = checkLoginRateLimit(ip, email);
    if (retryAfterSec > 0) {
      const waitMins = Math.max(1, Math.ceil(retryAfterSec / 60));
      res.status(429).json({
        error: `Too many failed sign-in attempts. Please wait ${waitMins} minute${waitMins === 1 ? '' : 's'} before trying again.`,
      });
      return;
    }

    const allClients = getCollection<StoredClient>('clients');
    const client = allClients.find(
      (c) =>
        c.email.trim().toLowerCase() === email &&
        typeof c.passwordHash === 'string' &&
        c.passwordHash.length > 0,
    );

    if (!client || !client.passwordHash) {
      verifyPassword(password, DUMMY_PASSWORD_HASH);
      recordLoginFailure(ip, email);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!verifyPassword(password, client.passwordHash)) {
      recordLoginFailure(ip, email);
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    clearLoginFailures(ip, email);
    const { token: clientToken, expiresAt } = signClientSessionToken(
      client.id,
      passwordTag(client.passwordHash),
    );
    clearSessionCookie(req, res, 'wellspa_session');
    setSessionCookie(req, res, 'wellspa_client_session', clientToken);
    res.json({
      clientToken,
      sessionExpiresAt: expiresAt,
      ...buildClientPortalPayload(client),
    });
  });

  app.post('/api/client/logout', (req: Request, res: Response) => {
    const token = extractClientToken(req);
    if (token) {
      const payload = verifyClientSessionToken(token);
      revokeSessionToken(token, payload?.exp);
    }
    clearSessionCookie(req, res, 'wellspa_client_session');
    res.json({ ok: true });
  });

  app.get('/api/client/portal-data', requireClientAuth, (req: AuthedRequest, res: Response) => {
    res.json(buildClientPortalPayload(req.clientRecord!));
  });

  app.patch(
    '/api/client/appointments/:id/cancel',
    requireClientAuth,
    (req: AuthedRequest, res: Response) => {
      const client = req.clientRecord!;
      const aptId = String(req.params.id);
      const existing = getRecord<Appointment>('appointments', aptId);
      if (!existing) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }
      if (existing.clientId !== client.id) {
        res.status(403).json({ error: 'You can only cancel your own bookings.' });
        return;
      }
      if (existing.status !== 'confirmed') {
        res.status(400).json({ error: 'Only confirmed upcoming bookings can be cancelled.' });
        return;
      }

      saveRecord('appointments', aptId, { ...existing, status: 'cancelled' });
      const refundCredits =
        typeof existing.creditsUsed === 'number'
          ? existing.creditsUsed
          : existing.usedMembershipCredit
            ? 1
            : 0;
      if (refundCredits > 0) {
        const freshClient = getRecord<StoredClient>('clients', client.id);
        if (freshClient) {
          saveRecord('clients', client.id, {
            ...freshClient,
            creditsRemaining: freshClient.creditsRemaining + refundCredits,
          });
        }
      }

      const updatedClient = getRecord<StoredClient>('clients', client.id) ?? client;
      res.json(buildClientPortalPayload(updatedClient));
    },
  );

  app.get('/api/public/booking-catalog', async (_req: Request, res: Response) => {
    const ownerUid = resolveStudioOwnerUid();

    const studioRow = db.prepare('SELECT data_json FROM studios WHERE id = ?').get(SHARED_STUDIO_ID) as
      | { data_json: string }
      | undefined;
    const studioData = studioRow ? (JSON.parse(studioRow.data_json) as Studio) : null;

    const localServices = getCollection<SpaService>('services')
      .filter((s) => s.active)
      .sort((a, b) => a.name.localeCompare(b.name));
    const localStaff = getCollection<StaffMember>('staff')
      .filter((s) => s.onDuty)
      .sort((a, b) => a.name.localeCompare(b.name));
    const localRooms = getCollection<SpaRoom>('rooms')
      .filter((r) => r.active)
      .sort((a, b) => a.name.localeCompare(b.name));
    const localBookedSlots = getCollection<Appointment>('appointments')
      .filter((a) => a.status !== 'cancelled' && a.status !== 'no_show')
      .map((a) => ({
        id: a.id,
        staffId: a.staffId,
        date: a.date,
        startTime: a.startTime,
        durationMinutes: a.durationMinutes,
        status: a.status,
      }));

    const [cloudStudio, fetchedServices, fetchedStaff, fetchedRooms, fetchedSlots] =
      await Promise.all([
        fetchPublicCatalogStudioProfile(),
        fetchPublicCatalogCollection('services'),
        fetchPublicCatalogCollection('staff'),
        fetchPublicCatalogCollection('rooms'),
        fetchPublicCatalogCollection('bookedSlots'),
      ]);

    const hasCloudCatalog =
      cloudStudio !== null ||
      fetchedServices.length > 0 ||
      fetchedStaff.length > 0 ||
      fetchedRooms.length > 0 ||
      fetchedSlots.length > 0;

    const services: SpaService[] = hasCloudCatalog
      ? fetchedServices
          .map((d) => ({
            id: d.id,
            ownerId: ownerUid,
            memberUids: [ownerUid],
            name: String(d.name ?? 'Treatment'),
            category: (d.category as SpaService['category']) ?? 'Massage',
            durationMinutes: Number(d.durationMinutes ?? 60),
            bufferMinutes: Number(d.bufferMinutes ?? 15),
            price: Number(d.price ?? 0),
            roomType: String(d.roomType ?? 'Standard Suite'),
            description: String(d.description ?? ''),
            active: Boolean(d.active ?? true),
          }))
          .filter((s) => s.active)
          .sort((a, b) => a.name.localeCompare(b.name))
      : localServices;

    const staff: StaffMember[] = hasCloudCatalog
      ? fetchedStaff
          .map((d) => ({
            id: d.id,
            ownerId: ownerUid,
            memberUids: [ownerUid],
            name: String(d.name ?? 'Therapist'),
            role: String(d.role ?? 'Therapist'),
            specialty: String(d.specialty ?? ''),
            bio: String(d.bio ?? ''),
            avatarUrl: String(d.avatarUrl ?? ''),
            assignedRoomId: typeof d.assignedRoomId === 'string' ? d.assignedRoomId : '',
            assignedRoom: String(d.assignedRoom ?? 'Unassigned'),
            onDuty: Boolean(d.onDuty ?? true),
            workDays: Array.isArray(d.workDays) ? d.workDays.map(String) : [],
            shiftStart: String(d.shiftStart ?? '09:00'),
            shiftEnd: String(d.shiftEnd ?? '18:00'),
            breakStart: String(d.breakStart ?? ''),
            breakEnd: String(d.breakEnd ?? ''),
          }))
          .filter((s) => s.onDuty)
          .sort((a, b) => a.name.localeCompare(b.name))
      : localStaff;

    const rooms: SpaRoom[] = hasCloudCatalog
      ? fetchedRooms
          .map((d) => ({
            id: d.id,
            ownerId: ownerUid,
            memberUids: [ownerUid],
            name: String(d.name ?? 'Suite'),
            roomType: String(d.roomType ?? 'Treatment Suite'),
            active: Boolean(d.active ?? true),
            notes: String(d.notes ?? ''),
          }))
          .filter((r) => r.active)
          .sort((a, b) => a.name.localeCompare(b.name))
      : localRooms;

    const slotMap = new Map<
      string,
      {
        id: string;
        staffId: string;
        date: string;
        startTime: string;
        durationMinutes: number;
        status: Appointment['status'];
      }
    >();
    for (const s of fetchedSlots) {
      if (s.status === 'cancelled' || s.status === 'no_show') continue;
      slotMap.set(s.id, {
        id: s.id,
        staffId: String(s.staffId ?? ''),
        date: String(s.date ?? ''),
        startTime: String(s.startTime ?? ''),
        durationMinutes: Number(s.durationMinutes ?? 60),
        status: (s.status as Appointment['status']) ?? 'confirmed',
      });
    }
    for (const localSlot of localBookedSlots) {
      if (!slotMap.has(localSlot.id)) {
        slotMap.set(localSlot.id, localSlot);
      }
    }
    const bookedSlots = Array.from(slotMap.values());

    const effectiveStudioName = String(cloudStudio?.name ?? studioData?.name ?? VENUE_DEFAULTS.name);
    const effectiveVenueName = String(
      cloudStudio?.venueName ?? studioData?.venueName ?? VENUE_DEFAULTS.venueName,
    );
    const effectiveTagline = String(
      cloudStudio?.tagline ?? studioData?.tagline ?? VENUE_DEFAULTS.tagline,
    );

    res.json({
      studio: studioData
        ? {
            name: effectiveStudioName,
            venueName: effectiveVenueName,
            tagline: effectiveTagline,
            address: studioData.address || VENUE_DEFAULTS.address,
            phone: studioData.phone || VENUE_DEFAULTS.phone,
            contactEmail: studioData.contactEmail || VENUE_DEFAULTS.contactEmail,
            telegramContacts: studioData.telegramContacts || VENUE_DEFAULTS.telegramContacts,
            telegramChannel: studioData.telegramChannel || VENUE_DEFAULTS.telegramChannel,
          }
        : {
            name: effectiveStudioName,
            venueName: effectiveVenueName,
            tagline: effectiveTagline,
            address: VENUE_DEFAULTS.address,
            phone: VENUE_DEFAULTS.phone,
            contactEmail: VENUE_DEFAULTS.contactEmail,
            telegramContacts: VENUE_DEFAULTS.telegramContacts,
            telegramChannel: VENUE_DEFAULTS.telegramChannel,
          },
      services,
      staff,
      rooms,
      bookedSlots,
    });
  });

  app.get('/api/public/maps-config', (_req: Request, res: Response) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({ apiKey });
  });

  app.post('/api/public/venue-place', async (req: Request, res: Response) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) {
      res.status(503).json({ error: 'Google Maps API key is not configured on the server.' });
      return;
    }
    const { textQuery } = req.body as { textQuery?: string };
    const query = (
      textQuery?.trim() || `${VENUE_DEFAULTS.venueName}, ${VENUE_DEFAULTS.address}`
    ).slice(0, 240);

    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.googleMapsLinks',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        body: JSON.stringify({
          textQuery: query,
          regionCode: 'KH',
          languageCode: 'en',
          pageSize: 1,
        }),
      });
      const payload = (await response.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          googleMapsUri?: string;
          googleMapsLinks?: { directionsUri?: string; placeUri?: string };
        }>;
        error?: { status?: string; message?: string };
      };
      if (
        response.status === 429 ||
        payload?.error?.status === 'RESOURCE_EXHAUSTED'
      ) {
        res.status(429).json({ error: 'RESOURCE_EXHAUSTED', quotaExceeded: true });
        return;
      }
      if (!response.ok) {
        res.status(response.status).json({
          error: payload?.error?.message || 'Unable to resolve venue location.',
        });
        return;
      }
      const firstPlace = payload?.places?.[0] ?? null;
      res.json({ place: firstPlace });
    } catch {
      res.status(502).json({ error: 'Failed to contact Google Places service.' });
    }
  });

  app.post('/api/public/appointments', async (req: Request, res: Response) => {
    const input = req.body as {
      clientName?: string;
      clientEmail?: string;
      clientPhone?: string;
      clientPassword?: string;
      serviceId?: string;
      staffId?: string;
      roomName?: string;
      date?: string;
      startTime?: string;
      useMembershipCredit?: boolean;
      creditsToDeduct?: number;
      notes?: string;
    };

    const ownerUid = resolveStudioOwnerUid();
    let service = input.serviceId ? getRecord<SpaService>('services', input.serviceId) : null;
    let member = input.staffId ? getRecord<StaffMember>('staff', input.staffId) : null;

    if ((!service && input.serviceId) || (!member && input.staffId)) {
      const [cloudServices, cloudStaff] = await Promise.all([
        !service && input.serviceId ? fetchPublicCatalogCollection('services') : Promise.resolve([]),
        !member && input.staffId ? fetchPublicCatalogCollection('staff') : Promise.resolve([]),
      ]);
      if (!service && input.serviceId) {
        const matched = cloudServices.find((s) => s.id === input.serviceId);
        if (matched) {
          service = {
            id: matched.id,
            ownerId: ownerUid,
            memberUids: [ownerUid],
            name: String(matched.name ?? 'Treatment'),
            category: (matched.category as SpaService['category']) ?? 'Massage',
            durationMinutes: Number(matched.durationMinutes ?? 60),
            bufferMinutes: Number(matched.bufferMinutes ?? 15),
            price: Number(matched.price ?? 0),
            roomType: String(matched.roomType ?? 'Standard Suite'),
            description: String(matched.description ?? ''),
            active: Boolean(matched.active ?? true),
          };
          saveRecord('services', service.id, service as unknown as Record<string, unknown>);
        }
      }
      if (!member && input.staffId) {
        const matched = cloudStaff.find((s) => s.id === input.staffId);
        if (matched) {
          member = {
            id: matched.id,
            ownerId: ownerUid,
            memberUids: [ownerUid],
            name: String(matched.name ?? 'Therapist'),
            role: String(matched.role ?? 'Therapist'),
            specialty: String(matched.specialty ?? ''),
            bio: String(matched.bio ?? ''),
            avatarUrl: String(matched.avatarUrl ?? ''),
            assignedRoomId: typeof matched.assignedRoomId === 'string' ? matched.assignedRoomId : '',
            assignedRoom: String(matched.assignedRoom ?? 'Unassigned'),
            onDuty: Boolean(matched.onDuty ?? true),
            workDays: Array.isArray(matched.workDays) ? matched.workDays.map(String) : [],
            shiftStart: String(matched.shiftStart ?? '09:00'),
            shiftEnd: String(matched.shiftEnd ?? '18:00'),
            breakStart: String(matched.breakStart ?? ''),
            breakEnd: String(matched.breakEnd ?? ''),
          };
          saveRecord('staff', member.id, member as unknown as Record<string, unknown>);
        }
      }
    }

    if (!service || !member) {
      res.status(400).json({ error: 'Selected treatment or therapist was not found.' });
      return;
    }
    if (!input.date || !input.startTime) {
      res.status(400).json({ error: 'Date and time slot are required.' });
      return;
    }

    let cloudSlotConflict = false;
    const cloudSlots = await fetchPublicCatalogCollection('bookedSlots');
    if (cloudSlots.length > 0) {
      const reqStart = timeToMinutes(input.startTime);
      const reqEnd = reqStart + Math.max(15, service.durationMinutes) + 15;
      cloudSlotConflict = cloudSlots.some((s) => {
        if (String(s.staffId ?? '') !== member!.id || String(s.date ?? '') !== input.date) {
          return false;
        }
        const status = String(s.status ?? '');
        if (status === 'cancelled' || status === 'no_show') return false;
        const bStart = timeToMinutes(String(s.startTime ?? '00:00'));
        const bEnd = bStart + Number(s.durationMinutes ?? 60) + 15;
        return reqStart < bEnd && reqEnd > bStart;
      });
    }

    if (
      cloudSlotConflict ||
      hasTherapistTimeConflict(member.id, input.date, input.startTime, service.durationMinutes)
    ) {
      res.status(409).json({
        error: 'This time slot was just booked for this therapist. Please choose another available time.',
      });
      return;
    }
    ensureProductionStudioInitialized(ownerUid);

    let clientRecord = resolveClientFromRequest(req);
    let issuedClientToken: string | undefined;

    if (!clientRecord) {
      const clientName = (input.clientName ?? '').trim();
      const clientEmail = (input.clientEmail ?? '').trim().toLowerCase();
      const clientPhone = (input.clientPhone ?? '').trim();
      const clientPassword = input.clientPassword ?? '';

      if (!clientName || !clientEmail || !clientPhone) {
        res.status(400).json({
          error: 'Full Name, Email Address, and Phone Number are required for new client sign up.',
        });
        return;
      }
      if (clientPassword.length < 6) {
        res.status(400).json({
          error: 'Please enter a password of at least 6 characters for your new client account.',
        });
        return;
      }

      const staffCollision = db
        .prepare('SELECT id FROM app_users WHERE lower(email) = ?')
        .get(clientEmail) as { id: string } | undefined;
      if (staffCollision) {
        res.status(409).json({
          error: 'This email is already registered as a studio account. Please sign in on the Sign In screen.',
        });
        return;
      }

      const allClients = getCollection<StoredClient>('clients');
      const existingByEmail = allClients.find(
        (c) => c.email.trim().toLowerCase() === clientEmail,
      );
      if (existingByEmail) {
        res.status(409).json({
          error: 'An account with this email already exists. Please use Sign In to book with your account.',
        });
        return;
      }

      const clientId = makeId('cli');
      const now = new Date().toISOString();
      const pwdHash = hashPassword(clientPassword);
      clientRecord = {
        id: clientId,
        ownerId: ownerUid,
        memberUids: [ownerUid],
        fullName: clientName,
        email: clientEmail,
        phone: clientPhone,
        notes: 'Signed up via Client Booking Portal.',
        preferredTherapistId: member.id,
        membershipTierId: '',
        membershipTierName: 'No Membership',
        membershipStatus: 'none',
        creditsRemaining: 0,
        nextRenewalDate: '',
        totalVisits: 0,
        lifetimeSpend: 0,
        smsOptIn: true,
        emailOptIn: true,
        passwordHash: pwdHash,
        createdAt: now,
        updatedAt: now,
      };
      saveRecord('clients', clientId, clientRecord as unknown as Record<string, unknown>);
      const signed = signClientSessionToken(clientId, passwordTag(pwdHash));
      issuedClientToken = signed.token;
      clearSessionCookie(req, res, 'wellspa_session');
      setSessionCookie(req, res, 'wellspa_client_session', signed.token);
    }

    const deduction = computeCreditDeduction(
      service.price,
      clientRecord.creditsRemaining,
      input.creditsToDeduct,
      input.useMembershipCredit,
    );
    const appointmentId = makeId('apt');
    const now = new Date().toISOString();
    const newAppointment: Appointment = {
      id: appointmentId,
      ownerId: ownerUid,
      memberUids: [ownerUid],
      clientId: clientRecord.id,
      clientName: clientRecord.fullName,
      clientEmail: clientRecord.email,
      clientPhone: clientRecord.phone,
      serviceId: service.id,
      serviceName: service.name,
      staffId: member.id,
      staffName: member.name,
      roomName: input.roomName?.trim() || member.assignedRoom || 'Unassigned',
      date: input.date,
      startTime: input.startTime,
      durationMinutes: service.durationMinutes,
      price: service.price,
      usedMembershipCredit: deduction.usedMembershipCredit,
      creditsUsed: deduction.creditsUsed,
      amountPaid: deduction.amountPaid,
      status: 'confirmed',
      notes: (input.notes ?? '').trim(),
      confirmationSent: true,
      reminderSent: false,
      createdAt: now,
      updatedAt: now,
    };

    saveRecord('appointments', appointmentId, newAppointment as unknown as Record<string, unknown>);

    if (deduction.creditsUsed > 0) {
      const nextCredits = Math.max(0, clientRecord.creditsRemaining - deduction.creditsUsed);
      clientRecord = { ...clientRecord, creditsRemaining: nextCredits };
      saveRecord('clients', clientRecord.id, clientRecord as unknown as Record<string, unknown>);
    }

    const studioRow = db.prepare('SELECT data_json FROM studios WHERE id = ?').get(SHARED_STUDIO_ID) as
      | { data_json: string }
      | undefined;
    const studioName = studioRow
      ? ((JSON.parse(studioRow.data_json) as Studio).name ?? 'WELL SPA')
      : 'WELL SPA';

    triggerNotificationForEvent({
      ownerId: ownerUid,
      eventKey: 'booking_confirmed',
      appointment: newAppointment,
      studioName,
    });
    triggerNotificationForEvent({
      ownerId: ownerUid,
      eventKey: 'reminder_24h',
      appointment: newAppointment,
      studioName,
    });

    res.status(201).json({
      appointmentId,
      appointment: newAppointment,
      clientToken: issuedClientToken,
      ...buildClientPortalPayload(clientRecord),
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WELL SPA server listening on http://0.0.0.0:${PORT}`);
    void getBackendDatabaseStatus().then((status) => {
      console.log(
        `[database] sqlite=${status.sqlite.connected ? 'connected' : 'error'} (users=${status.sqlite.usersCount}, studios=${status.sqlite.studiosCount}, records=${status.sqlite.recordsCount}) | firestore=${status.firestore.connected ? 'connected' : 'unreachable'} (project=${status.firestore.projectId}, db=${status.firestore.databaseId})`,
      );
    });
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
