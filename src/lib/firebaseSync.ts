import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import {
  PRIMARY_ADMIN_EMAIL,
  SHARED_STUDIO_ID,
  SIMULATION_RECORD_IDS,
  VENUE_DEFAULTS,
  buildProductionStudioDefaults,
  emailToDocKey,
} from './seedStudio';
import type {
  Appointment,
  AuthorizedUser,
  AuthorizedUserRole,
  Client,
  CreditDeduction,
  MembershipTier,
  NotificationLog,
  NotificationRule,
  SpaRoom,
  SpaService,
  StaffMember,
  Studio,
  UserPermissions,
} from '../types/spa';

export type SyncCollectionName =
  | 'rooms'
  | 'services'
  | 'staff'
  | 'membershipTiers'
  | 'clients'
  | 'appointments'
  | 'notificationRules'
  | 'notificationLogs'
  | 'creditDeductions';

export interface SyncOps {
  upserts?: Partial<Record<SyncCollectionName, Array<Record<string, unknown> & { id: string }>>>;
  deletes?: Partial<Record<SyncCollectionName, string[]>>;
}

export interface StudioCloudState {
  studio: Studio | null;
  rooms: SpaRoom[];
  services: SpaService[];
  staff: StaffMember[];
  membershipTiers: MembershipTier[];
  clients: Client[];
  appointments: Appointment[];
  notificationRules: NotificationRule[];
  notificationLogs: NotificationLog[];
  creditDeductions: CreditDeduction[];
}

export interface CloudStaffAccessEntry {
  email: string;
  fullName: string;
  role: AuthorizedUserRole;
  isPrimaryAdmin: boolean;
  active: boolean;
  permissions: UserPermissions;
}

const ALL_SUBCOLLECTIONS: SyncCollectionName[] = [
  'rooms',
  'services',
  'staff',
  'membershipTiers',
  'clients',
  'appointments',
  'notificationRules',
  'notificationLogs',
  'creditDeductions',
];

const SIMULATION_ID_SET = new Set<string>(Object.values(SIMULATION_RECORD_IDS).flat());

function isCurrentUserPrimaryAdmin(): boolean {
  return auth.currentUser?.email?.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
}

function buildStudioCollectionQuery(colName: SyncCollectionName): Query<DocumentData> {
  const colRef = collection(db, 'studios', SHARED_STUDIO_ID, colName);
  const email = auth.currentUser?.email?.trim().toLowerCase();
  if (!isCurrentUserPrimaryAdmin() && email) {
    return query(colRef, where('memberEmails', 'array-contains', email));
  }
  return colRef;
}

function buildPublicSubcollectionQuery(
  sub: 'services' | 'rooms' | 'staff' | 'bookedSlots',
): Query<DocumentData> {
  const colRef = collection(db, 'publicCatalog', SHARED_STUDIO_ID, sub);
  if (isCurrentUserPrimaryAdmin()) {
    return colRef;
  }
  if (sub === 'services' || sub === 'rooms') {
    return query(colRef, where('active', '==', true));
  }
  if (sub === 'staff') {
    return query(colRef, where('onDuty', '==', true));
  }
  return query(colRef, where('status', 'in', ['confirmed', 'checked_in', 'in_progress']));
}

function sanitizeId(raw: unknown, fallback = 'well_spa_owner'): string {
  const str = String(raw ?? '').trim();
  const cleaned = str.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : fallback;
}

function sanitizeStr(raw: unknown, maxLen: number, fallback = ''): string {
  const str = typeof raw === 'string' ? raw : raw == null ? fallback : String(raw);
  return str.slice(0, maxLen);
}

function sanitizeNum(raw: unknown, min: number, max: number, fallback = 0): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeMemberUids(raw: unknown, ownerUid: string): string[] {
  const arr = Array.isArray(raw)
    ? raw.map((v) => sanitizeId(v, ownerUid)).filter(Boolean)
    : [];
  const merged = Array.from(new Set([ownerUid, ...arr])).slice(0, 25);
  return merged.length > 0 ? merged : [ownerUid];
}

function sanitizeMemberEmails(
  raw: unknown,
  extraEmails?: string[],
  currentEmail?: string | null,
): string[] {
  const candidates: string[] = [];
  const pushEmail = (val: unknown) => {
    if (typeof val !== 'string') return;
    const clean = val.trim().toLowerCase();
    if (clean.length >= 3 && clean.length <= 160 && clean.includes('@')) {
      candidates.push(clean);
    }
  };
  pushEmail(PRIMARY_ADMIN_EMAIL);
  pushEmail(currentEmail);
  if (Array.isArray(extraEmails)) {
    for (const e of extraEmails) pushEmail(e);
  }
  if (Array.isArray(raw)) {
    for (const e of raw) pushEmail(e);
  }
  return Array.from(new Set(candidates)).slice(0, 25);
}

function convertTimestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function docToPlain<T>(id: string, raw: Record<string, unknown>): T {
  return {
    ...raw,
    id,
    createdAt: raw.createdAt ? convertTimestampToIso(raw.createdAt) : new Date().toISOString(),
    updatedAt: raw.updatedAt ? convertTimestampToIso(raw.updatedAt) : new Date().toISOString(),
  } as T;
}

function clampFieldTimestamps(isNew: boolean, existingCreatedAt?: unknown) {
  return {
    createdAt: isNew || !existingCreatedAt ? serverTimestamp() : existingCreatedAt,
    updatedAt: serverTimestamp(),
  };
}

function sortCollectionItems(colName: SyncCollectionName, items: Array<Record<string, unknown> & { id: string }>) {
  switch (colName) {
    case 'rooms':
      return (items as unknown as SpaRoom[]).sort((a, b) => a.name.localeCompare(b.name));
    case 'services':
      return (items as unknown as SpaService[]).sort((a, b) => a.name.localeCompare(b.name));
    case 'staff':
      return (items as unknown as StaffMember[]).sort((a, b) => a.name.localeCompare(b.name));
    case 'membershipTiers':
      return (items as unknown as MembershipTier[]).sort((a, b) => a.monthlyPrice - b.monthlyPrice);
    case 'clients':
      return (items as unknown as Client[]).sort((a, b) => a.fullName.localeCompare(b.fullName));
    case 'appointments':
      return (items as unknown as Appointment[]).sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      );
    case 'notificationRules':
      return (items as unknown as NotificationRule[]).sort((a, b) => a.title.localeCompare(b.title));
    case 'notificationLogs':
      return (items as unknown as NotificationLog[]).sort((a, b) =>
        b.scheduledFor.localeCompare(a.scheduledFor),
      );
    case 'creditDeductions':
      return (items as unknown as CreditDeduction[]).sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      );
  }
}

interface PayloadOptions {
  existingData?: Record<string, unknown>;
  memberEmails?: string[];
}

function buildSanitizedFirestorePayload(
  collectionName: SyncCollectionName,
  record: Record<string, unknown>,
  firebaseUid: string,
  isNew: boolean,
  existingCreatedAt?: unknown,
  options?: PayloadOptions,
): Record<string, unknown> {
  const existingData = options?.existingData;
  const isPrimary = isCurrentUserPrimaryAdmin();

  const ownerId = existingData?.ownerId
    ? sanitizeId(existingData.ownerId, firebaseUid)
    : sanitizeId(record.ownerId ?? firebaseUid, firebaseUid);

  const memberUids =
    !isNew && !isPrimary && Array.isArray(existingData?.memberUids)
      ? (existingData.memberUids as string[])
      : sanitizeMemberUids(existingData?.memberUids ?? record.memberUids, firebaseUid);

  let memberEmailsField: { memberEmails?: string[] } = {};
  if (isNew || isPrimary) {
    memberEmailsField = {
      memberEmails: sanitizeMemberEmails(
        existingData?.memberEmails ?? record.memberEmails,
        options?.memberEmails,
        auth.currentUser?.email,
      ),
    };
  } else if (Array.isArray(existingData?.memberEmails)) {
    // Preserve exact existing array on non-primary updates so affectedKeys() passes firestore.rules
    memberEmailsField = { memberEmails: existingData.memberEmails as string[] };
  }

  const timestamps = clampFieldTimestamps(isNew, existingCreatedAt);

  switch (collectionName) {
    case 'rooms':
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        name: sanitizeStr(record.name, 120, 'Treatment Suite') || 'Treatment Suite',
        roomType: sanitizeStr(record.roomType, 80, 'Treatment Suite') || 'Treatment Suite',
        active: Boolean(record.active ?? true),
        notes: sanitizeStr(record.notes, 500, ''),
        ...timestamps,
      };
    case 'services': {
      const allowedCategories = ['Massage', 'Facial', 'Body Ritual', 'Hydrotherapy', 'Add-On'];
      const category = allowedCategories.includes(String(record.category))
        ? String(record.category)
        : 'Massage';
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        name: sanitizeStr(record.name, 120, 'Spa Treatment') || 'Spa Treatment',
        category,
        durationMinutes: sanitizeNum(record.durationMinutes, 5, 480, 60),
        bufferMinutes: sanitizeNum(record.bufferMinutes, 0, 60, 15),
        price: sanitizeNum(record.price, 0, 50000, 0),
        roomType: sanitizeStr(record.roomType, 80, 'Standard Suite') || 'Standard Suite',
        description: sanitizeStr(record.description, 500, ''),
        active: Boolean(record.active ?? true),
        ...timestamps,
      };
    }
    case 'staff': {
      const workDays = Array.isArray(record.workDays)
        ? record.workDays.map((d) => sanitizeStr(d, 10)).slice(0, 7)
        : [];
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        name: sanitizeStr(record.name, 120, 'Therapist') || 'Therapist',
        role: sanitizeStr(record.role, 80, 'Therapist') || 'Therapist',
        specialty: sanitizeStr(record.specialty, 160, ''),
        bio: sanitizeStr(record.bio, 400, ''),
        avatarUrl: sanitizeStr(record.avatarUrl, 250000, ''),
        ...(typeof record.assignedRoomId === 'string'
          ? { assignedRoomId: sanitizeStr(record.assignedRoomId, 128, '') }
          : {}),
        assignedRoom: sanitizeStr(record.assignedRoom, 80, 'Unassigned') || 'Unassigned',
        onDuty: Boolean(record.onDuty ?? true),
        workDays,
        shiftStart: sanitizeStr(record.shiftStart, 10, '09:00') || '09:00',
        shiftEnd: sanitizeStr(record.shiftEnd, 10, '18:00') || '18:00',
        breakStart: sanitizeStr(record.breakStart, 10, ''),
        breakEnd: sanitizeStr(record.breakEnd, 10, ''),
        ...timestamps,
      };
    }
    case 'membershipTiers':
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        name: sanitizeStr(record.name, 100, 'Membership Plan') || 'Membership Plan',
        targetAudience: sanitizeStr(record.targetAudience, 120, ''),
        monthlyPrice: sanitizeNum(record.monthlyPrice, 0, 50000, 0),
        creditsPerMonth: sanitizeNum(record.creditsPerMonth, 0, 50000, 0),
        retailDiscountPercent: sanitizeNum(record.retailDiscountPercent, 0, 100, 0),
        priorityWindowHours: sanitizeNum(record.priorityWindowHours, 0, 720, 24),
        perksSummary: sanitizeStr(record.perksSummary, 400, ''),
        active: Boolean(record.active ?? true),
        ...timestamps,
      };
    case 'clients': {
      const allowedMembership = ['none', 'active', 'paused', 'cancelled'];
      const membershipStatus = allowedMembership.includes(String(record.membershipStatus))
        ? String(record.membershipStatus)
        : 'none';
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        fullName: sanitizeStr(record.fullName, 120, 'Client') || 'Client',
        email: sanitizeStr(record.email, 160, ''),
        phone: sanitizeStr(record.phone, 32, ''),
        notes: sanitizeStr(record.notes, 500, ''),
        preferredTherapistId: sanitizeStr(record.preferredTherapistId, 128, ''),
        membershipTierId: sanitizeStr(record.membershipTierId, 128, ''),
        membershipTierName: sanitizeStr(record.membershipTierName, 100, 'No Membership'),
        membershipStatus,
        creditsRemaining: sanitizeNum(record.creditsRemaining, 0, 100000, 0),
        nextRenewalDate: sanitizeStr(record.nextRenewalDate, 20, ''),
        totalVisits: sanitizeNum(record.totalVisits, 0, 100000, 0),
        lifetimeSpend: sanitizeNum(record.lifetimeSpend, 0, 10000000, 0),
        smsOptIn: Boolean(record.smsOptIn ?? true),
        emailOptIn: Boolean(record.emailOptIn ?? true),
        ...timestamps,
      };
    }
    case 'appointments': {
      const allowedStatuses = [
        'confirmed',
        'checked_in',
        'in_progress',
        'completed',
        'cancelled',
        'no_show',
      ];
      const status = allowedStatuses.includes(String(record.status))
        ? String(record.status)
        : 'confirmed';
      const dateStr = sanitizeStr(record.date, 12, '2026-01-01').slice(0, 10);
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        clientId: sanitizeStr(record.clientId, 128, ''),
        clientName: sanitizeStr(record.clientName, 120, 'Guest') || 'Guest',
        clientEmail: sanitizeStr(record.clientEmail, 160, ''),
        clientPhone: sanitizeStr(record.clientPhone, 32, ''),
        serviceId: sanitizeStr(record.serviceId, 128, 'svc') || 'svc',
        serviceName: sanitizeStr(record.serviceName, 120, 'Service') || 'Service',
        staffId: sanitizeStr(record.staffId, 128, 'stf') || 'stf',
        staffName: sanitizeStr(record.staffName, 120, 'Therapist') || 'Therapist',
        roomName: sanitizeStr(record.roomName, 80, 'Unassigned') || 'Unassigned',
        date: dateStr.length === 10 ? dateStr : '2026-01-01',
        startTime: sanitizeStr(record.startTime, 8, '09:00') || '09:00',
        durationMinutes: sanitizeNum(record.durationMinutes, 5, 480, 60),
        price: sanitizeNum(record.price, 0, 50000, 0),
        usedMembershipCredit: Boolean(record.usedMembershipCredit ?? false),
        ...(typeof record.creditsUsed === 'number'
          ? { creditsUsed: sanitizeNum(record.creditsUsed, 0, 50000, 0) }
          : {}),
        ...(typeof record.amountPaid === 'number'
          ? { amountPaid: sanitizeNum(record.amountPaid, 0, 50000, 0) }
          : {}),
        status,
        notes: sanitizeStr(record.notes, 500, ''),
        confirmationSent: Boolean(record.confirmationSent ?? true),
        reminderSent: Boolean(record.reminderSent ?? false),
        ...timestamps,
      };
    }
    case 'notificationRules': {
      const allowedKeys = [
        'booking_confirmed',
        'reminder_24h',
        'checkin_2h',
        'post_visit_rebook',
        'membership_renewed',
      ];
      const eventKey = allowedKeys.includes(String(record.eventKey))
        ? String(record.eventKey)
        : 'booking_confirmed';
      const allowedChannels = ['Email + SMS', 'SMS', 'Email'];
      const channel = allowedChannels.includes(String(record.channel))
        ? String(record.channel)
        : 'Email + SMS';
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        eventKey,
        title: sanitizeStr(record.title, 120, 'Notification Rule') || 'Notification Rule',
        channel,
        timingLabel: sanitizeStr(record.timingLabel, 80, 'Immediate') || 'Immediate',
        enabled: Boolean(record.enabled ?? true),
        subjectTemplate: sanitizeStr(record.subjectTemplate, 200, ''),
        bodyTemplate: sanitizeStr(record.bodyTemplate, 800, ''),
        sentCount: sanitizeNum(record.sentCount, 0, 1000000, 0),
        ...timestamps,
      };
    }
    case 'notificationLogs': {
      const channel = record.channel === 'SMS' ? 'SMS' : 'Email';
      const status =
        record.status === 'scheduled' || record.status === 'failed' ? record.status : 'sent';
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        ruleId: sanitizeStr(record.ruleId, 128, ''),
        eventKey: sanitizeStr(record.eventKey, 64, ''),
        appointmentId: sanitizeStr(record.appointmentId, 128, ''),
        clientId: sanitizeStr(record.clientId, 128, ''),
        clientName: sanitizeStr(record.clientName, 120, 'Client') || 'Client',
        recipientContact: sanitizeStr(record.recipientContact, 160, ''),
        channel,
        subject: sanitizeStr(record.subject, 200, ''),
        messageBody: sanitizeStr(record.messageBody, 900, ''),
        status,
        scheduledFor: sanitizeStr(record.scheduledFor, 80, ''),
        sentAtLabel: sanitizeStr(record.sentAtLabel, 80, ''),
        ...timestamps,
      };
    }
    case 'creditDeductions': {
      const category =
        record.category === 'Massage' || record.category === 'Service'
          ? record.category
          : 'Order Item';
      return {
        ownerId,
        memberUids,
        ...memberEmailsField,
        clientId: sanitizeStr(record.clientId, 128, 'cli') || 'cli',
        clientName: sanitizeStr(record.clientName, 120, 'Client') || 'Client',
        category,
        description: sanitizeStr(record.description, 300, 'Deduction') || 'Deduction',
        creditsDeducted: sanitizeNum(record.creditsDeducted, 1, 50000, 1),
        recordedByEmail: sanitizeStr(record.recordedByEmail, 160, ''),
        date: sanitizeStr(record.date, 20, '2026-01-01') || '2026-01-01',
        ...timestamps,
      };
    }
  }
}

export async function connectFirebaseGoogleSync() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
    if (code === 'auth/popup-blocked') {
      throw new Error(
        'Pop-up window was blocked by your browser. Please allow pop-ups for this site and try Google Sign-In again.',
      );
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Google Sign-In pop-up was closed before finishing. Please try again.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        `This domain (${window.location.hostname}) is not authorized in Firebase Authentication. Add it under Firebase Console > Authentication > Settings > Authorized domains.`,
      );
    }
    throw err;
  }
}

export async function disconnectFirebaseGoogleSync() {
  await signOut(auth);
}

function buildPublicStudioPayload(studio: Partial<Studio> | null | undefined) {
  return {
    name: sanitizeStr(studio?.name, 120, VENUE_DEFAULTS.name) || VENUE_DEFAULTS.name,
    venueName:
      sanitizeStr(studio?.venueName, 160, VENUE_DEFAULTS.venueName) || VENUE_DEFAULTS.venueName,
    tagline: sanitizeStr(studio?.tagline, 200, VENUE_DEFAULTS.tagline),
    timezone: sanitizeStr(studio?.timezone, 64, VENUE_DEFAULTS.timezone) || VENUE_DEFAULTS.timezone,
    currency: sanitizeStr(studio?.currency, 8, VENUE_DEFAULTS.currency) || VENUE_DEFAULTS.currency,
    updatedAt: serverTimestamp(),
  };
}

function buildPublicSubdocPayload(
  subcollection: 'services' | 'rooms' | 'staff' | 'bookedSlots',
  record: Record<string, unknown>,
): Record<string, unknown> | null {
  if (subcollection === 'services') {
    if (!Boolean(record.active ?? true)) return null;
    const allowedCategories = ['Massage', 'Facial', 'Body Ritual', 'Hydrotherapy', 'Add-On'];
    const category = allowedCategories.includes(String(record.category))
      ? String(record.category)
      : 'Massage';
    return {
      name: sanitizeStr(record.name, 120, 'Spa Treatment') || 'Spa Treatment',
      category,
      durationMinutes: sanitizeNum(record.durationMinutes, 5, 480, 60),
      bufferMinutes: sanitizeNum(record.bufferMinutes, 0, 60, 15),
      price: sanitizeNum(record.price, 0, 50000, 0),
      roomType: sanitizeStr(record.roomType, 80, 'Standard Suite') || 'Standard Suite',
      description: sanitizeStr(record.description, 500, ''),
      active: true,
      updatedAt: serverTimestamp(),
    };
  }
  if (subcollection === 'rooms') {
    if (!Boolean(record.active ?? true)) return null;
    return {
      name: sanitizeStr(record.name, 120, 'Treatment Suite') || 'Treatment Suite',
      roomType: sanitizeStr(record.roomType, 80, 'Treatment Suite') || 'Treatment Suite',
      active: true,
      notes: sanitizeStr(record.notes, 500, ''),
      updatedAt: serverTimestamp(),
    };
  }
  if (subcollection === 'staff') {
    if (!Boolean(record.onDuty ?? true)) return null;
    const workDays = Array.isArray(record.workDays)
      ? record.workDays.map((d) => sanitizeStr(d, 10)).slice(0, 7)
      : [];
    return {
      name: sanitizeStr(record.name, 120, 'Therapist') || 'Therapist',
      role: sanitizeStr(record.role, 80, 'Therapist') || 'Therapist',
      specialty: sanitizeStr(record.specialty, 160, ''),
      bio: sanitizeStr(record.bio, 400, ''),
      avatarUrl: sanitizeStr(record.avatarUrl, 250000, ''),
      ...(typeof record.assignedRoomId === 'string'
        ? { assignedRoomId: sanitizeStr(record.assignedRoomId, 128, '') }
        : {}),
      assignedRoom: sanitizeStr(record.assignedRoom, 80, 'Unassigned') || 'Unassigned',
      onDuty: true,
      workDays,
      shiftStart: sanitizeStr(record.shiftStart, 10, '09:00') || '09:00',
      shiftEnd: sanitizeStr(record.shiftEnd, 10, '18:00') || '18:00',
      breakStart: sanitizeStr(record.breakStart, 10, ''),
      breakEnd: sanitizeStr(record.breakEnd, 10, ''),
      updatedAt: serverTimestamp(),
    };
  }
  const status = String(record.status ?? 'confirmed');
  if (!['confirmed', 'checked_in', 'in_progress'].includes(status)) {
    return null;
  }
  const dateStr = sanitizeStr(record.date, 12, '2026-01-01').slice(0, 10);
  return {
    staffId: sanitizeStr(record.staffId, 128, 'stf') || 'stf',
    date: dateStr.length === 10 ? dateStr : '2026-01-01',
    startTime: sanitizeStr(record.startTime, 8, '09:00') || '09:00',
    durationMinutes: sanitizeNum(record.durationMinutes, 5, 480, 60),
    status,
    updatedAt: serverTimestamp(),
  };
}

async function mirrorItemToPublicCatalog(
  colName: SyncCollectionName,
  record: Record<string, unknown> & { id: string },
): Promise<void> {
  let publicSub: 'services' | 'rooms' | 'staff' | 'bookedSlots' | null = null;
  if (colName === 'services') publicSub = 'services';
  else if (colName === 'rooms') publicSub = 'rooms';
  else if (colName === 'staff') publicSub = 'staff';
  else if (colName === 'appointments') publicSub = 'bookedSlots';
  if (!publicSub) return;

  const docPath = `publicCatalog/${SHARED_STUDIO_ID}/${publicSub}/${record.id}`;
  const docRef = doc(db, 'publicCatalog', SHARED_STUDIO_ID, publicSub, record.id);
  const payload = buildPublicSubdocPayload(publicSub, record);

  try {
    if (payload) {
      await setDoc(docRef, payload);
    } else {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await deleteDoc(docRef);
      }
    }
  } catch (error) {
    handleFirestoreError(error, payload ? OperationType.WRITE : OperationType.DELETE, docPath);
  }
}

async function deleteItemFromPublicCatalog(colName: SyncCollectionName, docId: string): Promise<void> {
  let publicSub: 'services' | 'rooms' | 'staff' | 'bookedSlots' | null = null;
  if (colName === 'services') publicSub = 'services';
  else if (colName === 'rooms') publicSub = 'rooms';
  else if (colName === 'staff') publicSub = 'staff';
  else if (colName === 'appointments') publicSub = 'bookedSlots';
  if (!publicSub) return;

  const docPath = `publicCatalog/${SHARED_STUDIO_ID}/${publicSub}/${docId}`;
  const docRef = doc(db, 'publicCatalog', SHARED_STUDIO_ID, publicSub, docId);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await deleteDoc(docRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function syncPublicCatalogToFirestore(state: StudioCloudState): Promise<void> {
  const studioPubPath = `publicCatalog/${SHARED_STUDIO_ID}`;
  const studioPubRef = doc(db, 'publicCatalog', SHARED_STUDIO_ID);
  try {
    await setDoc(studioPubRef, buildPublicStudioPayload(state.studio));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, studioPubPath);
  }

  const mappings: Array<{
    sub: 'services' | 'rooms' | 'staff' | 'bookedSlots';
    items: Array<Record<string, unknown> & { id: string }>;
  }> = [
    { sub: 'services', items: state.services as unknown as Array<Record<string, unknown> & { id: string }> },
    { sub: 'rooms', items: state.rooms as unknown as Array<Record<string, unknown> & { id: string }> },
    { sub: 'staff', items: state.staff as unknown as Array<Record<string, unknown> & { id: string }> },
    {
      sub: 'bookedSlots',
      items: state.appointments as unknown as Array<Record<string, unknown> & { id: string }>,
    },
  ];

  for (const { sub, items } of mappings) {
    const colPath = `publicCatalog/${SHARED_STUDIO_ID}/${sub}`;
    let existingSnap;
    try {
      existingSnap = await getDocs(buildPublicSubcollectionQuery(sub));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }

    const activeIds = new Set<string>();
    for (const item of items) {
      if (!item?.id) continue;
      const payload = buildPublicSubdocPayload(sub, item);
      if (!payload) continue;
      activeIds.add(item.id);
      const docPath = `${colPath}/${item.id}`;
      try {
        await setDoc(doc(db, 'publicCatalog', SHARED_STUDIO_ID, sub, item.id), payload);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, docPath);
      }
    }

    for (const existingDoc of existingSnap.docs) {
      if (!activeIds.has(existingDoc.id)) {
        const docPath = `${colPath}/${existingDoc.id}`;
        try {
          await deleteDoc(doc(db, 'publicCatalog', SHARED_STUDIO_ID, sub, existingDoc.id));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, docPath);
        }
      }
    }
  }
}

export async function ensureCleanProductionStudioInFirestore(
  firebaseUid: string,
  localState: StudioCloudState,
  memberEmails?: string[],
): Promise<{ purgedCount: number; existedInCloud: boolean }> {
  const studioPath = `studios/${SHARED_STUDIO_ID}`;
  const studioRef = doc(db, 'studios', SHARED_STUDIO_ID);
  let studioSnap;
  try {
    studioSnap = await getDoc(studioRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, studioPath);
  }

  const existedInCloud = studioSnap.exists();
  let purgedCount = 0;

  const deleteTargets: Array<{ col: SyncCollectionName; id: string }> = [];
  for (const [col, ids] of Object.entries(SIMULATION_RECORD_IDS)) {
    for (const id of ids) {
      deleteTargets.push({ col: col as SyncCollectionName, id });
    }
  }

  const batch = writeBatch(db);
  let batchOps = 0;

  if (!existedInCloud) {
    const defaults = buildProductionStudioDefaults(firebaseUid, [firebaseUid]);
    const studioData = localState.studio ?? defaults.studio;
    batch.set(studioRef, {
      ownerId: firebaseUid,
      memberUids: sanitizeMemberUids(studioData.memberUids, firebaseUid),
      memberEmails: sanitizeMemberEmails(
        studioData.memberEmails,
        memberEmails,
        auth.currentUser?.email,
      ),
      name: sanitizeStr(studioData.name, 120, VENUE_DEFAULTS.name) || VENUE_DEFAULTS.name,
      venueName:
        sanitizeStr(studioData.venueName, 160, VENUE_DEFAULTS.venueName) ||
        VENUE_DEFAULTS.venueName,
      tagline: sanitizeStr(studioData.tagline, 200, VENUE_DEFAULTS.tagline),
      timezone:
        sanitizeStr(studioData.timezone, 64, VENUE_DEFAULTS.timezone) || VENUE_DEFAULTS.timezone,
      currency:
        sanitizeStr(studioData.currency, 8, VENUE_DEFAULTS.currency) || VENUE_DEFAULTS.currency,
      address:
        !studioData.address || studioData.address === '742 Mercer Street, Suite 3B · Seattle, WA'
          ? VENUE_DEFAULTS.address
          : sanitizeStr(studioData.address, 240, VENUE_DEFAULTS.address),
      phone:
        !studioData.phone || studioData.phone === '+1 (206) 555-0184'
          ? VENUE_DEFAULTS.phone
          : sanitizeStr(studioData.phone, 64, VENUE_DEFAULTS.phone),
      contactEmail:
        sanitizeStr(studioData.contactEmail, 160, VENUE_DEFAULTS.contactEmail) ||
        VENUE_DEFAULTS.contactEmail,
      telegramContacts:
        sanitizeStr(studioData.telegramContacts, 160, VENUE_DEFAULTS.telegramContacts) ||
        VENUE_DEFAULTS.telegramContacts,
      telegramChannel:
        sanitizeStr(studioData.telegramChannel, 160, VENUE_DEFAULTS.telegramChannel) ||
        VENUE_DEFAULTS.telegramChannel,
      seeded: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batchOps += 1;
  } else {
    const existingStudio = studioSnap.data() as Record<string, unknown>;
    const existingEmails = Array.isArray(existingStudio.memberEmails)
      ? (existingStudio.memberEmails as string[])
      : [];
    const desiredEmails = sanitizeMemberEmails(
      existingEmails,
      memberEmails,
      auth.currentUser?.email,
    );
    const missingMemberEmail =
      isCurrentUserPrimaryAdmin() &&
      desiredEmails.some((e) => !existingEmails.includes(e));

    const needsVenueMigration =
      existingStudio.seeded === true ||
      existingStudio.address === '742 Mercer Street, Suite 3B · Seattle, WA' ||
      !existingStudio.address ||
      !existingStudio.venueName ||
      !existingStudio.contactEmail ||
      !existingStudio.telegramContacts ||
      !existingStudio.telegramChannel ||
      missingMemberEmail;

    if (needsVenueMigration) {
      const nextMemberUids = isCurrentUserPrimaryAdmin()
        ? sanitizeMemberUids(existingStudio.memberUids, firebaseUid)
        : (existingStudio.memberUids as string[]);
      const nextMemberEmailsField = isCurrentUserPrimaryAdmin()
        ? { memberEmails: desiredEmails }
        : Array.isArray(existingStudio.memberEmails)
          ? { memberEmails: existingStudio.memberEmails }
          : {};

      batch.set(studioRef, {
        ownerId: sanitizeId(existingStudio.ownerId, firebaseUid),
        memberUids: nextMemberUids,
        ...nextMemberEmailsField,
        name: sanitizeStr(existingStudio.name, 120, VENUE_DEFAULTS.name) || VENUE_DEFAULTS.name,
        venueName:
          sanitizeStr(existingStudio.venueName, 160, VENUE_DEFAULTS.venueName) ||
          VENUE_DEFAULTS.venueName,
        tagline: sanitizeStr(existingStudio.tagline, 200, VENUE_DEFAULTS.tagline),
        timezone:
          existingStudio.timezone === 'America/Los_Angeles' || !existingStudio.timezone
            ? VENUE_DEFAULTS.timezone
            : sanitizeStr(existingStudio.timezone, 64, VENUE_DEFAULTS.timezone),
        currency:
          sanitizeStr(existingStudio.currency, 8, VENUE_DEFAULTS.currency) ||
          VENUE_DEFAULTS.currency,
        address:
          !existingStudio.address ||
          existingStudio.address === '742 Mercer Street, Suite 3B · Seattle, WA'
            ? VENUE_DEFAULTS.address
            : sanitizeStr(existingStudio.address, 240, VENUE_DEFAULTS.address),
        phone:
          !existingStudio.phone || existingStudio.phone === '+1 (206) 555-0184'
            ? VENUE_DEFAULTS.phone
            : sanitizeStr(existingStudio.phone, 64, VENUE_DEFAULTS.phone),
        contactEmail:
          sanitizeStr(existingStudio.contactEmail, 160, VENUE_DEFAULTS.contactEmail) ||
          VENUE_DEFAULTS.contactEmail,
        telegramContacts:
          sanitizeStr(existingStudio.telegramContacts, 160, VENUE_DEFAULTS.telegramContacts) ||
          VENUE_DEFAULTS.telegramContacts,
        telegramChannel:
          sanitizeStr(existingStudio.telegramChannel, 160, VENUE_DEFAULTS.telegramChannel) ||
          VENUE_DEFAULTS.telegramChannel,
        seeded: false,
        createdAt: existingStudio.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batchOps += 1;
    }
  }

  const shouldPurgeSimulation =
    !existedInCloud || Boolean((studioSnap.data() as Record<string, unknown> | undefined)?.seeded);

  if (shouldPurgeSimulation) {
    for (const target of deleteTargets) {
      const docPath = `studios/${SHARED_STUDIO_ID}/${target.col}/${target.id}`;
      try {
        const snap = await getDoc(doc(db, 'studios', SHARED_STUDIO_ID, target.col, target.id));
        if (snap.exists()) {
          batch.delete(doc(db, 'studios', SHARED_STUDIO_ID, target.col, target.id));
          batchOps += 1;
          purgedCount += 1;
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, docPath);
      }
    }
  }

  if (batchOps > 0) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, studioPath);
    }
  }

  // Only push local initial production defaults if Firestore didn't have the studio yet
  if (!existedInCloud) {
    await pushCleanCollectionDeltaToFirestore(firebaseUid, localState, memberEmails);
    await syncPublicCatalogToFirestore(localState);
  }

  return { purgedCount, existedInCloud };
}

export async function pullStudioStateFromFirestore(): Promise<StudioCloudState> {
  const studioPath = `studios/${SHARED_STUDIO_ID}`;
  const studioPromise = getDoc(doc(db, 'studios', SHARED_STUDIO_ID)).catch((error) => {
    handleFirestoreError(error, OperationType.GET, studioPath);
  });

  const subPromises = ALL_SUBCOLLECTIONS.map((colName) => {
    const colPath = `studios/${SHARED_STUDIO_ID}/${colName}`;
    return getDocs(buildStudioCollectionQuery(colName)).catch((error) => {
      handleFirestoreError(error, OperationType.LIST, colPath);
    });
  });

  const [studioSnap, ...subSnaps] = await Promise.all([studioPromise, ...subPromises]);

  const studio = studioSnap.exists()
    ? docToPlain<Studio>(studioSnap.id, studioSnap.data() as Record<string, unknown>)
    : null;

  const state: StudioCloudState = {
    studio,
    rooms: [],
    services: [],
    staff: [],
    membershipTiers: [],
    clients: [],
    appointments: [],
    notificationRules: [],
    notificationLogs: [],
    creditDeductions: [],
  };

  ALL_SUBCOLLECTIONS.forEach((colName, idx) => {
    const snap = subSnaps[idx];
    const rawItems = snap.docs
      .filter((d) => !SIMULATION_ID_SET.has(d.id))
      .map((d) => docToPlain<Record<string, unknown> & { id: string }>(d.id, d.data() as Record<string, unknown>));
    (state as unknown as Record<SyncCollectionName, unknown>)[colName] = sortCollectionItems(
      colName,
      rawItems,
    );
  });

  return state;
}

export async function pushCleanCollectionDeltaToFirestore(
  firebaseUid: string,
  localState: StudioCloudState,
  memberEmails?: string[],
): Promise<void> {
  for (const colName of ALL_SUBCOLLECTIONS) {
    const colPath = `studios/${SHARED_STUDIO_ID}/${colName}`;
    let existingSnap;
    try {
      existingSnap = await getDocs(buildStudioCollectionQuery(colName));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }

    const existingDocs = new Map<string, Record<string, unknown>>();
    existingSnap.forEach((d) => {
      existingDocs.set(d.id, d.data() as Record<string, unknown>);
    });

    const localItems = localState[colName] as unknown as Array<
      Record<string, unknown> & { id: string }
    >;
    for (const item of localItems) {
      if (!item?.id) continue;
      if (!existingDocs.has(item.id)) {
        const docPath = `${colPath}/${item.id}`;
        try {
          await setDoc(
            doc(db, 'studios', SHARED_STUDIO_ID, colName, item.id),
            buildSanitizedFirestorePayload(colName, item, firebaseUid, true, undefined, {
              memberEmails,
            }),
          );
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, docPath);
        }
      }
    }
  }
}

export async function applySyncOpsToFirestore(
  syncOps: SyncOps | undefined,
  firebaseUid: string,
  memberEmails?: string[],
): Promise<void> {
  if (!syncOps) return;

  if (syncOps.upserts) {
    for (const [colKey, items] of Object.entries(syncOps.upserts)) {
      const colName = colKey as SyncCollectionName;
      if (!ALL_SUBCOLLECTIONS.includes(colName) || !Array.isArray(items)) continue;
      for (const item of items) {
        if (!item?.id) continue;
        const docPath = `studios/${SHARED_STUDIO_ID}/${colName}/${item.id}`;
        const docRef = doc(db, 'studios', SHARED_STUDIO_ID, colName, item.id);
        let existingSnap;
        try {
          existingSnap = await getDoc(docRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, docPath);
        }
        const existingData = existingSnap.exists()
          ? (existingSnap.data() as Record<string, unknown>)
          : undefined;
        const isNew = !existingSnap.exists();
        const payload = buildSanitizedFirestorePayload(
          colName,
          item,
          firebaseUid,
          isNew,
          existingData?.createdAt,
          { existingData, memberEmails },
        );
        try {
          await setDoc(docRef, payload);
        } catch (error) {
          handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, docPath);
        }

        await mirrorItemToPublicCatalog(colName, item);
      }
    }
  }

  if (syncOps.deletes) {
    for (const [colKey, ids] of Object.entries(syncOps.deletes)) {
      const colName = colKey as SyncCollectionName;
      if (!ALL_SUBCOLLECTIONS.includes(colName) || !Array.isArray(ids)) continue;
      for (const docId of ids) {
        if (!docId) continue;
        const docPath = `studios/${SHARED_STUDIO_ID}/${colName}/${docId}`;
        const docRef = doc(db, 'studios', SHARED_STUDIO_ID, colName, docId);
        try {
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            await deleteDoc(docRef);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, docPath);
        }

        await deleteItemFromPublicCatalog(colName, docId);
      }
    }
  }
}

export async function upsertCollectionToFirestore(
  colName: SyncCollectionName,
  items: Array<Record<string, unknown> & { id: string }>,
  firebaseUid: string,
  syncDeletions = false,
  memberEmails?: string[],
): Promise<void> {
  const colPath = `studios/${SHARED_STUDIO_ID}/${colName}`;
  let existingSnap;
  try {
    existingSnap = await getDocs(buildStudioCollectionQuery(colName));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }

  const existingDocMap = new Map<string, Record<string, unknown>>();
  existingSnap.forEach((d) => {
    existingDocMap.set(d.id, d.data() as Record<string, unknown>);
  });

  const incomingIds = new Set<string>();
  for (const item of items) {
    if (!item?.id) continue;
    incomingIds.add(item.id);
    const docPath = `${colPath}/${item.id}`;
    const existingData = existingDocMap.get(item.id);
    const isNew = !existingData;
    try {
      await setDoc(
        doc(db, 'studios', SHARED_STUDIO_ID, colName, item.id),
        buildSanitizedFirestorePayload(
          colName,
          item,
          firebaseUid,
          isNew,
          existingData?.createdAt,
          { existingData, memberEmails },
        ),
      );
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, docPath);
    }
  }

  if (syncDeletions) {
    for (const existingId of existingDocMap.keys()) {
      if (!incomingIds.has(existingId)) {
        const docPath = `${colPath}/${existingId}`;
        try {
          await deleteDoc(doc(db, 'studios', SHARED_STUDIO_ID, colName, existingId));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, docPath);
        }
      }
    }
  }
}

export async function syncStaffAccessToFirestore(
  users: AuthorizedUser[],
  firebaseUid: string,
): Promise<void> {
  if (!isCurrentUserPrimaryAdmin()) return;

  const colPath = 'staffAccess';
  let existingSnap;
  try {
    existingSnap = await getDocs(collection(db, 'staffAccess'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }

  const existingDocs = new Map<string, Record<string, unknown>>();
  existingSnap.forEach((d) => {
    existingDocs.set(d.id, d.data() as Record<string, unknown>);
  });

  const desiredKeys = new Set<string>();
  for (const u of users) {
    const cleanEmail = u.email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) continue;
    const key = emailToDocKey(cleanEmail);
    desiredKeys.add(key);
    const docPath = `staffAccess/${key}`;
    const existing = existingDocs.get(key);
    const isNew = !existing;
    try {
      await setDoc(doc(db, 'staffAccess', key), {
        ownerId: existing?.ownerId ? sanitizeId(existing.ownerId, firebaseUid) : firebaseUid,
        email: sanitizeStr(cleanEmail, 160),
        fullName: sanitizeStr(u.fullName, 120, cleanEmail) || cleanEmail,
        role: u.role === 'admin' || u.role === 'manager' ? u.role : 'staff',
        isPrimaryAdmin: Boolean(u.isPrimaryAdmin || cleanEmail === PRIMARY_ADMIN_EMAIL.toLowerCase()),
        active: Boolean(u.active),
        permissions: {
          appointments: Boolean(u.permissions?.appointments),
          staff: Boolean(u.permissions?.staff),
          memberships: Boolean(u.permissions?.memberships),
          notifications: Boolean(u.permissions?.notifications),
          services: Boolean(u.permissions?.services),
          reports: Boolean(u.permissions?.reports),
          booking_portal: Boolean(u.permissions?.booking_portal),
          users: Boolean(u.permissions?.users),
        },
        ...clampFieldTimestamps(isNew, existing?.createdAt),
      });
    } catch (error) {
      handleFirestoreError(error, isNew ? OperationType.CREATE : OperationType.UPDATE, docPath);
    }
  }

  for (const existingKey of existingDocs.keys()) {
    if (!desiredKeys.has(existingKey) && existingKey !== emailToDocKey(PRIMARY_ADMIN_EMAIL)) {
      const docPath = `staffAccess/${existingKey}`;
      try {
        await deleteDoc(doc(db, 'staffAccess', existingKey));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, docPath);
      }
    }
  }
}

export async function pullStaffAccessFromFirestore(): Promise<CloudStaffAccessEntry[]> {
  if (!isCurrentUserPrimaryAdmin()) return [];
  const colPath = 'staffAccess';
  let snap;
  try {
    snap = await getDocs(collection(db, 'staffAccess'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const role: AuthorizedUserRole =
      data.role === 'admin' || data.role === 'manager' ? data.role : 'staff';
    const perms = (data.permissions ?? {}) as Partial<UserPermissions>;
    const isPrimary = Boolean(data.isPrimaryAdmin);
    return {
      email: String(data.email ?? '').trim().toLowerCase(),
      fullName: String(data.fullName ?? '').trim() || String(data.email ?? 'Staff'),
      role,
      isPrimaryAdmin: isPrimary,
      active: Boolean(data.active),
      permissions: {
        appointments: Boolean(perms.appointments),
        staff: Boolean(perms.staff),
        memberships: Boolean(perms.memberships),
        notifications: Boolean(perms.notifications),
        services: Boolean(perms.services),
        reports: Boolean(perms.reports),
        booking_portal: Boolean(perms.booking_portal),
        users: Boolean(perms.users),
      },
    };
  });
}

export function subscribeToStaffAccessRealtime(
  onUsers: (users: CloudStaffAccessEntry[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  if (!isCurrentUserPrimaryAdmin()) {
    return () => {};
  }
  const colPath = 'staffAccess';
  return onSnapshot(
    collection(db, 'staffAccess'),
    (snap) => {
      const entries: CloudStaffAccessEntry[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const role: AuthorizedUserRole =
          data.role === 'admin' || data.role === 'manager' ? data.role : 'staff';
        const perms = (data.permissions ?? {}) as Partial<UserPermissions>;
        return {
          email: String(data.email ?? '').trim().toLowerCase(),
          fullName: String(data.fullName ?? '').trim() || String(data.email ?? 'Staff'),
          role,
          isPrimaryAdmin: Boolean(data.isPrimaryAdmin),
          active: Boolean(data.active),
          permissions: {
            appointments: Boolean(perms.appointments),
            staff: Boolean(perms.staff),
            memberships: Boolean(perms.memberships),
            notifications: Boolean(perms.notifications),
            services: Boolean(perms.services),
            reports: Boolean(perms.reports),
            booking_portal: Boolean(perms.booking_portal),
            users: Boolean(perms.users),
          },
        };
      });
      onUsers(entries);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, colPath);
      } catch (wrapped) {
        if (onError) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      }
    },
  );
}

export async function updateStudioMemberEmailsInFirestore(
  memberEmails: string[],
  firebaseUid: string,
): Promise<void> {
  if (!isCurrentUserPrimaryAdmin()) return;
  const sanitized = sanitizeMemberEmails([], memberEmails, auth.currentUser?.email);

  const studioPath = `studios/${SHARED_STUDIO_ID}`;
  const studioRef = doc(db, 'studios', SHARED_STUDIO_ID);
  try {
    const studioSnap = await getDoc(studioRef);
    if (studioSnap.exists()) {
      const existing = studioSnap.data() as Record<string, unknown>;
      await setDoc(studioRef, {
        ...existing,
        ownerId: sanitizeId(existing.ownerId, firebaseUid),
        memberUids: sanitizeMemberUids(existing.memberUids, firebaseUid),
        memberEmails: sanitized,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, studioPath);
  }

  for (const colName of ALL_SUBCOLLECTIONS) {
    const colPath = `studios/${SHARED_STUDIO_ID}/${colName}`;
    let snap;
    try {
      snap = await getDocs(collection(db, 'studios', SHARED_STUDIO_ID, colName));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const docPath = `${colPath}/${d.id}`;
      try {
        await setDoc(
          doc(db, 'studios', SHARED_STUDIO_ID, colName, d.id),
          buildSanitizedFirestorePayload(
            colName,
            data,
            firebaseUid,
            false,
            data.createdAt,
            { existingData: data, memberEmails: sanitized },
          ),
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
    }
  }
}

export async function purgeAllSimulationFromFirestore(firebaseUid: string): Promise<number> {
  let deleted = 0;
  for (const [colName, ids] of Object.entries(SIMULATION_RECORD_IDS)) {
    for (const id of ids) {
      const docPath = `studios/${SHARED_STUDIO_ID}/${colName}/${id}`;
      try {
        const ref = doc(db, 'studios', SHARED_STUDIO_ID, colName, id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await deleteDoc(ref);
          deleted += 1;
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, docPath);
      }
      await deleteItemFromPublicCatalog(colName as SyncCollectionName, id);
    }
  }

  const studioPath = `studios/${SHARED_STUDIO_ID}`;
  const studioRef = doc(db, 'studios', SHARED_STUDIO_ID);
  try {
    const snap = await getDoc(studioRef);
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      const nextMemberEmailsField = isCurrentUserPrimaryAdmin()
        ? {
            memberEmails: sanitizeMemberEmails(
              data.memberEmails,
              undefined,
              auth.currentUser?.email,
            ),
          }
        : Array.isArray(data.memberEmails)
          ? { memberEmails: data.memberEmails }
          : {};
      await setDoc(studioRef, {
        ownerId: sanitizeId(data.ownerId, firebaseUid),
        memberUids: sanitizeMemberUids(data.memberUids, firebaseUid),
        ...nextMemberEmailsField,
        name: sanitizeStr(data.name, 120, VENUE_DEFAULTS.name) || VENUE_DEFAULTS.name,
        venueName:
          sanitizeStr(data.venueName, 160, VENUE_DEFAULTS.venueName) || VENUE_DEFAULTS.venueName,
        tagline: sanitizeStr(data.tagline, 200, VENUE_DEFAULTS.tagline),
        timezone:
          data.timezone === 'America/Los_Angeles' || !data.timezone
            ? VENUE_DEFAULTS.timezone
            : sanitizeStr(data.timezone, 64, VENUE_DEFAULTS.timezone),
        currency: sanitizeStr(data.currency, 8, VENUE_DEFAULTS.currency) || VENUE_DEFAULTS.currency,
        address:
          !data.address || data.address === '742 Mercer Street, Suite 3B · Seattle, WA'
            ? VENUE_DEFAULTS.address
            : sanitizeStr(data.address, 240, VENUE_DEFAULTS.address),
        phone:
          !data.phone || data.phone === '+1 (206) 555-0184'
            ? VENUE_DEFAULTS.phone
            : sanitizeStr(data.phone, 64, VENUE_DEFAULTS.phone),
        contactEmail:
          sanitizeStr(data.contactEmail, 160, VENUE_DEFAULTS.contactEmail) ||
          VENUE_DEFAULTS.contactEmail,
        telegramContacts:
          sanitizeStr(data.telegramContacts, 160, VENUE_DEFAULTS.telegramContacts) ||
          VENUE_DEFAULTS.telegramContacts,
        telegramChannel:
          sanitizeStr(data.telegramChannel, 160, VENUE_DEFAULTS.telegramChannel) ||
          VENUE_DEFAULTS.telegramChannel,
        seeded: false,
        createdAt: data.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, studioPath);
  }

  return deleted;
}

export function subscribeToStudioRealtime(callbacks: {
  onStudio: (studio: Studio | null, hasPendingWrites: boolean) => void;
  onCollection: <T>(name: SyncCollectionName, items: T[], hasPendingWrites: boolean) => void;
  onError: (err: Error) => void;
}): Unsubscribe {
  const unsubscribers: Unsubscribe[] = [];

  const studioPath = `studios/${SHARED_STUDIO_ID}`;
  unsubscribers.push(
    onSnapshot(
      doc(db, 'studios', SHARED_STUDIO_ID),
      (snap) => {
        if (!snap.exists()) {
          callbacks.onStudio(null, snap.metadata.hasPendingWrites);
          return;
        }
        callbacks.onStudio(
          docToPlain<Studio>(snap.id, snap.data() as Record<string, unknown>),
          snap.metadata.hasPendingWrites,
        );
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, studioPath);
        } catch (wrapped) {
          callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    ),
  );

  for (const colName of ALL_SUBCOLLECTIONS) {
    const colPath = `studios/${SHARED_STUDIO_ID}/${colName}`;
    unsubscribers.push(
      onSnapshot(
        buildStudioCollectionQuery(colName),
        (snapshot) => {
          const items = snapshot.docs.map((d) =>
            docToPlain(d.id, d.data() as Record<string, unknown>),
          );
          callbacks.onCollection(colName, items, snapshot.metadata.hasPendingWrites);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, colPath);
          } catch (wrapped) {
            callbacks.onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
          }
        },
      ),
    );
  }

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}
