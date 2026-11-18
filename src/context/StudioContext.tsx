import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '../lib/firebase';
import {
  applySyncOpsToFirestore,
  connectFirebaseGoogleSync,
  disconnectFirebaseGoogleSync,
  ensureCleanProductionStudioInFirestore,
  pullStaffAccessFromFirestore,
  pullStudioStateFromFirestore,
  purgeAllSimulationFromFirestore,
  pushCleanCollectionDeltaToFirestore,
  subscribeToStaffAccessRealtime,
  subscribeToStudioRealtime,
  syncPublicCatalogToFirestore,
  syncStaffAccessToFirestore,
  updateStudioMemberEmailsInFirestore,
  upsertCollectionToFirestore,
  type StudioCloudState,
  type SyncCollectionName,
  type SyncOps,
} from '../lib/firebaseSync';
import { PRIMARY_ADMIN_EMAIL, SIMULATION_RECORD_IDS } from '../lib/seedStudio';
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
  ServiceCategory,
  SessionUser,
  SpaRoom,
  SpaService,
  StaffMember,
  Studio,
  UserPermissions,
} from '../types/spa';

export interface CreateAppointmentInput {
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
}

export interface CreateClientInput {
  fullName: string;
  email: string;
  phone: string;
  notes: string;
  preferredTherapistId: string;
  membershipTierId: string;
  smsOptIn: boolean;
  emailOptIn: boolean;
  password?: string;
}

export interface CreateStaffInput {
  name: string;
  role: string;
  specialty: string;
  bio: string;
  avatarUrl: string;
  assignedRoomId?: string;
  assignedRoom: string;
  workDays: string[];
  shiftStart: string;
  shiftEnd: string;
  breakStart: string;
  breakEnd: string;
}

export interface CreateServiceInput {
  name: string;
  category: ServiceCategory;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  roomType: string;
  description: string;
}

export interface CreateTierInput {
  name: string;
  targetAudience: string;
  monthlyPrice: number;
  creditsPerMonth: number;
  retailDiscountPercent: number;
  priorityWindowHours: number;
  perksSummary: string;
}

interface ToastMessage {
  id: string;
  title: string;
  detail?: string;
  tone: 'success' | 'info' | 'error';
}

interface StudioContextValue {
  user: SessionUser | null;
  clientUser: ClientSessionProfile | null;
  clientAppointments: Appointment[];
  clientNotifications: NotificationLog[];
  needsAdminSetup: boolean;
  cloudStudioExists: boolean;
  authReady: boolean;
  isPrimaryAdmin: boolean;
  isAdmin: boolean;
  hasPermission: (key: PermissionKey) => boolean;
  authError: string | null;
  clearAuthError: () => void;
  sessionExpiresAt: number | null;
  authorizedUsers: AuthorizedUser[];
  loadingData: boolean;
  seeding: boolean;
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
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  pushToast: (title: string, detail?: string, tone?: 'success' | 'info' | 'error') => void;
  initializeAdmin: (input: {
    email: string;
    fullName: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  signInWithCredentials: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; accountType?: 'staff' | 'client'; error?: string }>;
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string }>;
  signOutUser: () => Promise<void>;
  signUpClientAccount: (input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string; client?: ClientSessionProfile }>;
  signOutClient: () => Promise<void>;
  refreshClientPortalData: () => Promise<void>;
  applyClientPortalPayload: (payload: {
    clientToken?: string;
    sessionExpiresAt?: number | null;
    client?: ClientSessionProfile | null;
    appointments?: Appointment[];
    notificationLogs?: NotificationLog[];
  }) => void;
  cancelClientAppointment: (appointmentId: string) => Promise<void>;
  createAuthorizedUser: (input: {
    email: string;
    fullName: string;
    password: string;
    role: AuthorizedUserRole;
    permissions: UserPermissions;
    active?: boolean;
  }) => Promise<void>;
  updateAuthorizedUser: (
    userUid: string,
    updates: {
      fullName?: string;
      role?: AuthorizedUserRole;
      permissions?: UserPermissions;
      active?: boolean;
      password?: string;
    },
  ) => Promise<void>;
  toggleAuthorizedUserActive: (userUid: string, active: boolean) => Promise<void>;
  deleteAuthorizedUser: (userUid: string) => Promise<void>;
  clearNonAdminUsers: () => Promise<number>;
  createAppointment: (input: CreateAppointmentInput) => Promise<string>;
  updateAppointmentStatus: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  rescheduleAppointment: (
    appointmentId: string,
    updates: {
      staffId: string;
      staffName: string;
      roomName: string;
      date: string;
      startTime: string;
      notes: string;
    },
  ) => Promise<void>;
  toggleStaffDuty: (staffId: string, onDuty: boolean) => Promise<void>;
  updateStaffSchedule: (
    staffId: string,
    updates: {
      workDays: string[];
      shiftStart: string;
      shiftEnd: string;
      breakStart: string;
      breakEnd: string;
      assignedRoomId?: string;
      assignedRoom: string;
      onDuty: boolean;
    },
  ) => Promise<void>;
  updateStaffProfile: (
    staffId: string,
    updates: {
      name: string;
      role: string;
      specialty: string;
      bio: string;
      avatarUrl: string;
    },
  ) => Promise<void>;
  createStaffMember: (input: CreateStaffInput) => Promise<void>;
  createRoom: (input: { name: string; roomType: string; notes: string }) => Promise<SpaRoom>;
  updateRoom: (
    roomId: string,
    updates: { name?: string; roomType?: string; active?: boolean; notes?: string },
  ) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  createMembershipTier: (input: CreateTierInput) => Promise<void>;
  updateMembershipTier: (
    tierId: string,
    updates: Partial<CreateTierInput> & { active?: boolean },
  ) => Promise<void>;
  deleteMembershipTier: (tierId: string) => Promise<void>;
  createClient: (input: CreateClientInput) => Promise<string>;
  assignClientMembership: (clientId: string, tierId: string) => Promise<void>;
  updateClientMembershipStatus: (clientId: string, status: MembershipStatus) => Promise<void>;
  adjustClientCredits: (clientId: string, delta: number) => Promise<void>;
  setClientCredits: (clientId: string, exactCredits: number) => Promise<void>;
  deductClientCredits: (
    clientId: string,
    input: {
      creditsToDeduct: number;
      category: 'Massage' | 'Order Item' | 'Service';
      description: string;
      date?: string;
    },
  ) => Promise<void>;
  updateClientPortalPassword: (clientId: string, password: string, email?: string) => Promise<void>;
  renewClientMembership: (clientId: string, nextRenewalDate: string) => Promise<void>;
  toggleNotificationRule: (ruleId: string, enabled: boolean) => Promise<void>;
  updateNotificationRule: (
    ruleId: string,
    updates: {
      channel: NotificationRule['channel'];
      timingLabel: string;
      enabled: boolean;
      subjectTemplate: string;
      bodyTemplate: string;
    },
  ) => Promise<void>;
  dispatchScheduledNotification: (logId: string) => Promise<void>;
  dispatchAllPendingNotifications: () => Promise<number>;
  sendManualNotification: (params: {
    clientId: string;
    channel: NotificationChannel;
    subject: string;
    messageBody: string;
    appointmentId?: string;
  }) => Promise<void>;
  createService: (input: CreateServiceInput) => Promise<void>;
  updateService: (
    serviceId: string,
    updates: Partial<CreateServiceInput> & { active?: boolean },
  ) => Promise<void>;
  deleteService: (serviceId: string) => Promise<void>;
  toggleServiceActive: (serviceId: string, active: boolean) => Promise<void>;
  firebaseUserEmail: string | null;
  firebaseSyncStatus: 'disconnected' | 'connecting' | 'live' | 'error';
  firebaseSyncError: string | null;
  firebaseLastSyncedAt: number | null;
  connectFirebaseSync: () => Promise<void>;
  disconnectFirebaseSync: () => Promise<void>;
  syncNowToFirebase: () => Promise<void>;
  clearSimulationData: () => Promise<void>;
}

const StudioContext = createContext<StudioContextValue | null>(null);
const TOKEN_STORAGE_KEY = 'wellspa_auth_token';
const CLIENT_TOKEN_STORAGE_KEY = 'wellspa_client_token';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [clientUser, setClientUser] = useState<ClientSessionProfile | null>(null);
  const [clientAppointments, setClientAppointments] = useState<Appointment[]>([]);
  const [clientNotifications, setClientNotifications] = useState<NotificationLog[]>([]);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [cloudStudioExists, setCloudStudioExists] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [clientSessionExpiresAt, setClientSessionExpiresAt] = useState<number | null>(null);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [seeding] = useState(false);

  const [studio, setStudio] = useState<Studio | null>(null);
  const [rooms, setRooms] = useState<SpaRoom[]>([]);
  const [services, setServices] = useState<SpaService[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([]);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [creditDeductions, setCreditDeductions] = useState<CreditDeduction[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [firebaseSyncStatus, setFirebaseSyncStatus] = useState<
    'disconnected' | 'connecting' | 'live' | 'error'
  >('disconnected');
  const [firebaseSyncError, setFirebaseSyncError] = useState<string | null>(null);
  const [firebaseLastSyncedAt, setFirebaseLastSyncedAt] = useState<number | null>(null);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  const latestStateRef = useRef<StudioCloudState>({
    studio: null,
    rooms: [],
    services: [],
    staff: [],
    membershipTiers: [],
    clients: [],
    appointments: [],
    notificationRules: [],
    notificationLogs: [],
    creditDeductions: [],
  });

  useEffect(() => {
    latestStateRef.current = {
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
    };
  }, [
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
  ]);

  const simulationIdSetRef = useRef<Set<string>>(
    new Set(Object.values(SIMULATION_RECORD_IDS).flat()),
  );
  const authorizedUsersRef = useRef<AuthorizedUser[]>([]);
  const activeMemberEmailsRef = useRef<string[]>([PRIMARY_ADMIN_EMAIL]);
  const pendingCloudSyncRef = useRef<Partial<Record<SyncCollectionName, Array<Record<string, unknown> & { id: string }>>>>({});
  const cloudSyncFlushTimerRef = useRef<number | null>(null);
  const mergeLocalOnManualConnectRef = useRef(false);
  const autoRestoredUidRef = useRef<string | null>(null);

  useEffect(() => {
    authorizedUsersRef.current = authorizedUsers;
    const activeEmails = Array.from(
      new Set([
        PRIMARY_ADMIN_EMAIL.toLowerCase(),
        ...authorizedUsers
          .filter((u) => u.active && u.email.includes('@'))
          .map((u) => u.email.trim().toLowerCase()),
      ]),
    ).slice(0, 25);
    activeMemberEmailsRef.current = activeEmails;
  }, [authorizedUsers]);

  const clearAuthError = () => setAuthError(null);

  const pushToast = useCallback(
    (title: string, detail?: string, tone: 'success' | 'info' | 'error' = 'success') => {
      const id = makeId('toast');
      setToasts((prev) => [...prev.slice(-3), { id, title, detail, tone }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    [],
  );

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const resetSessionState = useCallback((errorMsg?: string) => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    mergeLocalOnManualConnectRef.current = false;
    setInitialDataLoaded(false);
    setUser(null);
    setSessionExpiresAt(null);
    setAuthorizedUsers([]);
    setStudio(null);
    setRooms([]);
    setServices([]);
    setStaff([]);
    setMembershipTiers([]);
    setClients([]);
    setAppointments([]);
    setNotificationRules([]);
    setNotificationLogs([]);
    setCreditDeductions([]);
    setLoadingData(false);
    if (errorMsg) setAuthError(errorMsg);
  }, []);

  const apiFetch = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const headers = new Headers(init?.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (init?.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(url, { ...init, headers });
      const data = (await res.json().catch(() => ({}))) as { error?: string } & T;

      if (res.status === 401) {
        resetSessionState(data.error || 'Your 8-hour login session has ended. Please sign in again with your password.');
        throw new Error(data.error || 'Session expired');
      }
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data;
    },
    [resetSessionState],
  );

  const loadStudioData = useCallback(
    async (activeUser: SessionUser) => {
      setLoadingData(true);
      try {
        const boot = await apiFetch<{
          studio: Studio | null;
          rooms: SpaRoom[];
          services: SpaService[];
          staff: StaffMember[];
          membershipTiers: MembershipTier[];
          clients: Client[];
          appointments: Appointment[];
          notificationRules: NotificationRule[];
          notificationLogs: NotificationLog[];
          creditDeductions?: CreditDeduction[];
        }>('/api/studio/bootstrap');
        setStudio(boot.studio);
        setRooms(boot.rooms ?? []);
        setServices(boot.services);
        setStaff(boot.staff);
        setMembershipTiers(boot.membershipTiers);
        setClients(boot.clients);
        setAppointments(boot.appointments);
        setNotificationRules(boot.notificationRules);
        setNotificationLogs(boot.notificationLogs);
        setCreditDeductions(boot.creditDeductions ?? []);
        latestStateRef.current = {
          studio: boot.studio,
          rooms: boot.rooms ?? [],
          services: boot.services,
          staff: boot.staff,
          membershipTiers: boot.membershipTiers,
          clients: boot.clients,
          appointments: boot.appointments,
          notificationRules: boot.notificationRules,
          notificationLogs: boot.notificationLogs,
          creditDeductions: boot.creditDeductions ?? [],
        };
        setInitialDataLoaded(true);

        if (activeUser.isPrimaryAdmin || activeUser.permissions.users) {
          const userRes = await apiFetch<{ users: AuthorizedUser[] }>('/api/users');
          setAuthorizedUsers(userRes.users);
          authorizedUsersRef.current = userRes.users;
          activeMemberEmailsRef.current = Array.from(
            new Set([
              PRIMARY_ADMIN_EMAIL.toLowerCase(),
              ...userRes.users
                .filter((u) => u.active && u.email.includes('@'))
                .map((u) => u.email.trim().toLowerCase()),
            ]),
          ).slice(0, 25);
        } else {
          setAuthorizedUsers([]);
          authorizedUsersRef.current = [];
        }
      } catch (err) {
        pushToast(
          'Unable to load workspace',
          err instanceof Error ? err.message : 'Please try again',
          'error',
        );
      } finally {
        setLoadingData(false);
      }
    },
    [apiFetch, pushToast],
  );

  const refreshUsersList = useCallback(async (): Promise<AuthorizedUser[]> => {
    const res = await apiFetch<{ users: AuthorizedUser[] }>('/api/users');
    setAuthorizedUsers(res.users);
    authorizedUsersRef.current = res.users;
    activeMemberEmailsRef.current = Array.from(
      new Set([
        PRIMARY_ADMIN_EMAIL.toLowerCase(),
        ...res.users
          .filter((u) => u.active && u.email.includes('@'))
          .map((u) => u.email.trim().toLowerCase()),
      ]),
    ).slice(0, 25);
    return res.users;
  }, [apiFetch]);

  const refreshBootstrap = useCallback(async (): Promise<StudioCloudState> => {
    const boot = await apiFetch<{
      studio: Studio | null;
      rooms: SpaRoom[];
      services: SpaService[];
      staff: StaffMember[];
      membershipTiers: MembershipTier[];
      clients: Client[];
      appointments: Appointment[];
      notificationRules: NotificationRule[];
      notificationLogs: NotificationLog[];
      creditDeductions?: CreditDeduction[];
    }>('/api/studio/bootstrap');
    const nextState: StudioCloudState = {
      studio: boot.studio,
      rooms: boot.rooms ?? [],
      services: boot.services,
      staff: boot.staff,
      membershipTiers: boot.membershipTiers,
      clients: boot.clients,
      appointments: boot.appointments,
      notificationRules: boot.notificationRules,
      notificationLogs: boot.notificationLogs,
      creditDeductions: boot.creditDeductions ?? [],
    };
    setStudio(nextState.studio);
    setRooms(nextState.rooms);
    setServices(nextState.services);
    setStaff(nextState.staff);
    setMembershipTiers(nextState.membershipTiers);
    setClients(nextState.clients);
    setAppointments(nextState.appointments);
    setNotificationRules(nextState.notificationRules);
    setNotificationLogs(nextState.notificationLogs);
    setCreditDeductions(nextState.creditDeductions);
    latestStateRef.current = nextState;
    return nextState;
  }, [apiFetch]);

  const pushSyncOps = useCallback(async (syncOps?: SyncOps) => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified || !syncOps) return;
    try {
      await applySyncOpsToFirestore(syncOps, fbUser.uid, activeMemberEmailsRef.current);
      setFirebaseSyncStatus('live');
      setFirebaseSyncError(null);
      setFirebaseLastSyncedAt(Date.now());
    } catch (err) {
      setFirebaseSyncStatus('error');
      setFirebaseSyncError(err instanceof Error ? err.message : 'Firebase sync failed');
    }
  }, []);

  const syncCollectionsToFirebase = useCallback(
    async (colNames: SyncCollectionName[], stateOverride?: StudioCloudState) => {
      const fbUser = auth.currentUser;
      if (!fbUser || !fbUser.emailVerified) return;
      const source = stateOverride ?? latestStateRef.current;
      try {
        for (const colName of colNames) {
          const items = source[colName] as unknown as Array<Record<string, unknown> & { id: string }>;
          await upsertCollectionToFirestore(
            colName,
            items,
            fbUser.uid,
            false,
            activeMemberEmailsRef.current,
          );
        }
        await syncPublicCatalogToFirestore(source);
        setFirebaseSyncStatus('live');
        setFirebaseSyncError(null);
        setFirebaseLastSyncedAt(Date.now());
      } catch (err) {
        setFirebaseSyncStatus('error');
        setFirebaseSyncError(err instanceof Error ? err.message : 'Firebase sync failed');
      }
    },
    [],
  );

  const syncUsersDirectoryToCloud = useCallback(async (usersList: AuthorizedUser[]) => {
    const fbUser = auth.currentUser;
    if (
      !fbUser ||
      !fbUser.emailVerified ||
      fbUser.email?.trim().toLowerCase() !== PRIMARY_ADMIN_EMAIL.toLowerCase()
    ) {
      return;
    }
    try {
      await syncStaffAccessToFirestore(usersList, fbUser.uid);
      const activeEmails = usersList
        .filter((u) => u.active && u.email.includes('@'))
        .map((u) => u.email.trim().toLowerCase());
      await updateStudioMemberEmailsInFirestore(activeEmails, fbUser.uid);
    } catch (err) {
      setFirebaseSyncError(err instanceof Error ? err.message : 'Unable to sync staff access directory.');
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser);
      setFirebaseAuthReady(true);
      if (!fbUser) {
        autoRestoredUidRef.current = null;
        setFirebaseSyncStatus('disconnected');
        setFirebaseSyncError(null);
      }
    });
    return () => unsub();
  }, []);

  // Cross-tab & backend real-time SSE listener
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;

    let refreshTimer: number | null = null;
    const es = new EventSource(`/api/studio/events?token=${encodeURIComponent(token)}`);
    const onStudioUpdate = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { reason?: string };
        if (payload.reason === 'firebase-sync') return;
      } catch {
        // Ignore parse error
      }
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshBootstrap().catch(() => {});
      }, 200);
    };
    es.addEventListener('studio_update', onStudioUpdate as EventListener);
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      es.removeEventListener('studio_update', onStudioUpdate as EventListener);
      es.close();
    };
  }, [user, refreshBootstrap]);

  // Real-time Firebase Firestore onSnapshot listener when Firebase Auth is active
  useEffect(() => {
    if (!user || !firebaseAuthReady || !firebaseUser || !firebaseUser.emailVerified || !initialDataLoaded) {
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let staffUnsub: (() => void) | null = null;
    setFirebaseSyncStatus('connecting');
    setFirebaseSyncError(null);

    const scheduleSqliteSync = (
      colName: SyncCollectionName,
      items: Array<Record<string, unknown> & { id: string }>,
    ) => {
      pendingCloudSyncRef.current[colName] = items;
      if (cloudSyncFlushTimerRef.current) {
        window.clearTimeout(cloudSyncFlushTimerRef.current);
      }
      cloudSyncFlushTimerRef.current = window.setTimeout(() => {
        const batchCollections = { ...pendingCloudSyncRef.current };
        pendingCloudSyncRef.current = {};
        if (Object.keys(batchCollections).length === 0) return;
        apiFetch('/api/studio/sync-from-firebase', {
          method: 'POST',
          body: JSON.stringify({
            collections: batchCollections,
            replaceCollections: true,
          }),
        }).catch(() => {});
      }, 300);
    };

    (async () => {
      try {
        const shouldMergeLocal = mergeLocalOnManualConnectRef.current;
        mergeLocalOnManualConnectRef.current = false;

        const { existedInCloud } = await ensureCleanProductionStudioInFirestore(
          firebaseUser.uid,
          latestStateRef.current,
          activeMemberEmailsRef.current,
        );
        if (cancelled) return;

        if (existedInCloud && shouldMergeLocal) {
          const snapshot = latestStateRef.current;
          const hasLocalRecords =
            snapshot.rooms.length > 0 ||
            snapshot.services.length > 0 ||
            snapshot.staff.length > 0 ||
            snapshot.membershipTiers.length > 0 ||
            snapshot.clients.length > 0 ||
            snapshot.appointments.length > 0 ||
            snapshot.notificationRules.length > 0 ||
            snapshot.notificationLogs.length > 0 ||
            snapshot.creditDeductions.length > 0;
          if (hasLocalRecords) {
            await pushCleanCollectionDeltaToFirestore(
              firebaseUser.uid,
              snapshot,
              activeMemberEmailsRef.current,
            );
            await syncPublicCatalogToFirestore(snapshot).catch(() => {});
          }
        }
        if (cancelled) return;

        const cloudState = await pullStudioStateFromFirestore();
        if (cancelled) return;

        if (cloudState.studio) {
          setStudio(cloudState.studio);
        }
        setRooms(cloudState.rooms);
        setServices(cloudState.services);
        setStaff(cloudState.staff);
        setMembershipTiers(cloudState.membershipTiers);
        setClients(cloudState.clients);
        setAppointments(cloudState.appointments);
        setNotificationRules(cloudState.notificationRules);
        setNotificationLogs(cloudState.notificationLogs);
        setCreditDeductions(cloudState.creditDeductions);
        latestStateRef.current = {
          studio: cloudState.studio ?? latestStateRef.current.studio,
          rooms: cloudState.rooms,
          services: cloudState.services,
          staff: cloudState.staff,
          membershipTiers: cloudState.membershipTiers,
          clients: cloudState.clients,
          appointments: cloudState.appointments,
          notificationRules: cloudState.notificationRules,
          notificationLogs: cloudState.notificationLogs,
          creditDeductions: cloudState.creditDeductions,
        };

        await apiFetch('/api/studio/sync-from-firebase', {
          method: 'POST',
          body: JSON.stringify({
            studio: cloudState.studio,
            collections: {
              rooms: cloudState.rooms,
              services: cloudState.services,
              staff: cloudState.staff,
              membershipTiers: cloudState.membershipTiers,
              clients: cloudState.clients,
              appointments: cloudState.appointments,
              notificationRules: cloudState.notificationRules,
              notificationLogs: cloudState.notificationLogs,
              creditDeductions: cloudState.creditDeductions,
            },
            replaceCollections: existedInCloud,
          }),
        }).catch(() => {});
        if (cancelled) return;

        if (
          firebaseUser.email?.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()
        ) {
          const cloudStaff = await pullStaffAccessFromFirestore();
          if (cancelled) return;
          if (cloudStaff.length === 0 && authorizedUsersRef.current.length > 0) {
            await syncStaffAccessToFirestore(authorizedUsersRef.current, firebaseUser.uid);
          } else if (cloudStaff.length > 0) {
            await apiFetch('/api/users/sync-from-firebase', {
              method: 'POST',
              body: JSON.stringify({ users: cloudStaff }),
            }).catch(() => {});
            await refreshUsersList().catch(() => {});
          }
          await syncPublicCatalogToFirestore(latestStateRef.current).catch(() => {});
          staffUnsub = subscribeToStaffAccessRealtime(
            (remoteUsers) => {
              if (cancelled || remoteUsers.length === 0) return;
              apiFetch('/api/users/sync-from-firebase', {
                method: 'POST',
                body: JSON.stringify({ users: remoteUsers }),
              })
                .then(() => refreshUsersList())
                .catch(() => {});
            },
            () => {},
          );
        }
        if (cancelled) return;

        setFirebaseSyncStatus('live');
        setFirebaseLastSyncedAt(Date.now());

        unsubscribe = subscribeToStudioRealtime({
          onStudio: (remoteStudio, hasPendingWrites) => {
            if (cancelled || hasPendingWrites || !remoteStudio) return;
            setStudio(remoteStudio);
            latestStateRef.current = {
              ...latestStateRef.current,
              studio: remoteStudio,
            };
            setFirebaseLastSyncedAt(Date.now());
            apiFetch('/api/studio/sync-from-firebase', {
              method: 'POST',
              body: JSON.stringify({ studio: remoteStudio }),
            }).catch(() => {});
          },
          onCollection: (colName, rawItems, hasPendingWrites) => {
            if (cancelled || hasPendingWrites) return;
            const filtered = (rawItems as Array<Record<string, unknown> & { id: string }>).filter(
              (item) => !simulationIdSetRef.current.has(item.id),
            );
            setFirebaseLastSyncedAt(Date.now());

            switch (colName) {
              case 'rooms': {
                const sorted = (filtered as unknown as SpaRoom[]).sort((a, b) =>
                  a.name.localeCompare(b.name),
                );
                latestStateRef.current = { ...latestStateRef.current, rooms: sorted };
                setRooms(sorted);
                break;
              }
              case 'services': {
                const sorted = (filtered as unknown as SpaService[]).sort((a, b) =>
                  a.name.localeCompare(b.name),
                );
                latestStateRef.current = { ...latestStateRef.current, services: sorted };
                setServices(sorted);
                break;
              }
              case 'staff': {
                const sorted = (filtered as unknown as StaffMember[]).sort((a, b) =>
                  a.name.localeCompare(b.name),
                );
                latestStateRef.current = { ...latestStateRef.current, staff: sorted };
                setStaff(sorted);
                break;
              }
              case 'membershipTiers': {
                const sorted = (filtered as unknown as MembershipTier[]).sort(
                  (a, b) => a.monthlyPrice - b.monthlyPrice,
                );
                latestStateRef.current = { ...latestStateRef.current, membershipTiers: sorted };
                setMembershipTiers(sorted);
                break;
              }
              case 'clients': {
                const sorted = (filtered as unknown as Client[]).sort((a, b) =>
                  a.fullName.localeCompare(b.fullName),
                );
                latestStateRef.current = { ...latestStateRef.current, clients: sorted };
                setClients(sorted);
                break;
              }
              case 'appointments': {
                const sorted = (filtered as unknown as Appointment[]).sort((a, b) =>
                  `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
                );
                latestStateRef.current = { ...latestStateRef.current, appointments: sorted };
                setAppointments(sorted);
                break;
              }
              case 'notificationRules': {
                const sorted = (filtered as unknown as NotificationRule[]).sort((a, b) =>
                  a.title.localeCompare(b.title),
                );
                latestStateRef.current = { ...latestStateRef.current, notificationRules: sorted };
                setNotificationRules(sorted);
                break;
              }
              case 'notificationLogs': {
                const sorted = (filtered as unknown as NotificationLog[]).sort((a, b) =>
                  b.scheduledFor.localeCompare(a.scheduledFor),
                );
                latestStateRef.current = { ...latestStateRef.current, notificationLogs: sorted };
                setNotificationLogs(sorted);
                break;
              }
              case 'creditDeductions': {
                const sorted = (filtered as unknown as CreditDeduction[]).sort((a, b) =>
                  (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
                );
                latestStateRef.current = { ...latestStateRef.current, creditDeductions: sorted };
                setCreditDeductions(sorted);
                break;
              }
            }

            scheduleSqliteSync(colName, filtered);
          },
          onError: (err) => {
            if (cancelled) return;
            setFirebaseSyncStatus('error');
            setFirebaseSyncError(err.message);
          },
        });
      } catch (err) {
        if (!cancelled) {
          setFirebaseSyncStatus('error');
          setFirebaseSyncError(
            err instanceof Error ? err.message : 'Unable to initialize Firebase sync',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (cloudSyncFlushTimerRef.current) {
        window.clearTimeout(cloudSyncFlushTimerRef.current);
      }
      if (unsubscribe) unsubscribe();
      if (staffUnsub) staffUnsub();
    };
  }, [user, firebaseAuthReady, firebaseUser, initialDataLoaded, apiFetch, refreshUsersList]);

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/auth/session', { headers });
        const data = (await res.json()) as {
          user: SessionUser | null;
          needsAdminSetup: boolean;
          cloudStudioExists?: boolean;
          sessionExpiresAt: number | null;
          expired?: boolean;
        };
        if (cancelled) return;
        setNeedsAdminSetup(Boolean(data.needsAdminSetup));
        setCloudStudioExists(Boolean(data.cloudStudioExists));
        if (data.user) {
          localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
          setClientUser(null);
          setClientSessionExpiresAt(null);
          setClientAppointments([]);
          setClientNotifications([]);
          setUser(data.user);
          setSessionExpiresAt(data.sessionExpiresAt);
          setAuthError(null);
          await loadStudioData(data.user);
        } else {
          if (data.expired && token) {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            setAuthError('Your 8-hour login session has ended. Please sign in again with your password.');
          }
          setUser(null);
          setSessionExpiresAt(null);

          const clientToken = localStorage.getItem(CLIENT_TOKEN_STORAGE_KEY);
          const clientRes = await fetch('/api/client/session', {
            headers: clientToken ? { 'x-client-token': clientToken } : {},
          });
          if (!cancelled && clientRes.ok) {
            const clientData = (await clientRes.json()) as {
              client: ClientSessionProfile | null;
              sessionExpiresAt?: number | null;
              appointments?: Appointment[];
              notificationLogs?: NotificationLog[];
            };
            if (clientData.client) {
              setClientUser(clientData.client);
              setClientSessionExpiresAt(clientData.sessionExpiresAt ?? null);
              setClientAppointments(clientData.appointments ?? []);
              setClientNotifications(clientData.notificationLogs ?? []);
            } else {
              localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
              setClientUser(null);
              setClientSessionExpiresAt(null);
              setClientAppointments([]);
              setClientNotifications([]);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setAuthError('Unable to reach workspace server.');
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    }
    checkSession();
    return () => {
      cancelled = true;
    };
  }, [loadStudioData]);

  useEffect(() => {
    if (!user || !sessionExpiresAt) return;
    const remaining = sessionExpiresAt - Date.now();
    if (remaining <= 0) {
      resetSessionState('Your 8-hour login session has ended. Please sign in again with your password.');
      return;
    }
    const timer = window.setTimeout(() => {
      resetSessionState('Your 8-hour login session has ended. Please sign in again with your password.');
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [user, sessionExpiresAt, resetSessionState]);

  useEffect(() => {
    if (!clientUser || !clientSessionExpiresAt) return;
    const clearClient = () => {
      localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
      setClientUser(null);
      setClientSessionExpiresAt(null);
      setClientAppointments([]);
      setClientNotifications([]);
      setAuthError('Your 8-hour login session has ended. Please sign in again with your password.');
    };
    const remaining = clientSessionExpiresAt - Date.now();
    if (remaining <= 0) {
      clearClient();
      return;
    }
    const timer = window.setTimeout(clearClient, remaining);
    return () => window.clearTimeout(timer);
  }, [clientUser, clientSessionExpiresAt]);

  // Auto-restore Express session & hydrate ephemeral SQLite after container restarts when Firebase Google auth is active (<8h)
  useEffect(() => {
    if (
      !authReady ||
      !firebaseAuthReady ||
      user ||
      clientUser ||
      !firebaseUser ||
      !firebaseUser.emailVerified
    ) {
      return;
    }
    if (autoRestoredUidRef.current === firebaseUser.uid) {
      return;
    }

    const lastSignInMs = firebaseUser.metadata.lastSignInTime
      ? Date.parse(firebaseUser.metadata.lastSignInTime)
      : 0;
    if (!lastSignInMs || Date.now() - lastSignInMs > SESSION_DURATION_MS) {
      autoRestoredUidRef.current = firebaseUser.uid;
      void disconnectFirebaseGoogleSync().catch(() => {});
      setAuthError('Your 8-hour login session has ended. Please sign in again.');
      return;
    }

    autoRestoredUidRef.current = firebaseUser.uid;
    mergeLocalOnManualConnectRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        const idToken = await firebaseUser.getIdToken(true);
        const res = await fetch('/api/auth/firebase-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          token?: string;
          sessionExpiresAt?: number;
          user?: SessionUser;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.token || !data.user) {
          await disconnectFirebaseGoogleSync().catch(() => {});
          if (data.error) setAuthError(data.error);
          return;
        }
        localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        setNeedsAdminSetup(false);
        setCloudStudioExists(true);
        setUser(data.user);
        setSessionExpiresAt(data.sessionExpiresAt ?? null);
        await loadStudioData(data.user);
      } catch {
        // Ignore silent restore errors; user can still sign in manually
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, firebaseAuthReady, user, clientUser, firebaseUser, loadStudioData]);

  const initializeAdmin = async (input: {
    email: string;
    fullName: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: input.email.trim() || PRIMARY_ADMIN_EMAIL,
          fullName: input.fullName.trim(),
          password: input.password,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        sessionExpiresAt?: number;
        user?: SessionUser;
        error?: string;
      };
      if (!res.ok || !data.token || !data.user) {
        const msg = data.error || 'Unable to initialize admin account.';
        setAuthError(msg);
        return { ok: false, error: msg };
      }
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setNeedsAdminSetup(false);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ?? null);
      await loadStudioData(data.user);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to initialize admin account.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
  };

  const applyClientPortalPayload = useCallback(
    (payload: {
      clientToken?: string;
      sessionExpiresAt?: number | null;
      client?: ClientSessionProfile | null;
      appointments?: Appointment[];
      notificationLogs?: NotificationLog[];
    }) => {
      if (payload.clientToken) {
        localStorage.setItem(CLIENT_TOKEN_STORAGE_KEY, payload.clientToken);
      }
      if (payload.sessionExpiresAt !== undefined) {
        setClientSessionExpiresAt(payload.sessionExpiresAt);
      }
      if (payload.client !== undefined) {
        setClientUser(payload.client);
      }
      if (payload.appointments !== undefined) {
        setClientAppointments(payload.appointments);
      }
      if (payload.notificationLogs !== undefined) {
        setClientNotifications(payload.notificationLogs);
      }
    },
    [],
  );

  const refreshClientPortalData = useCallback(async () => {
    const clientToken = localStorage.getItem(CLIENT_TOKEN_STORAGE_KEY);
    const res = await fetch('/api/client/portal-data', {
      headers: clientToken ? { 'x-client-token': clientToken } : {},
    });
    if (res.status === 401) {
      localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
      setClientUser(null);
      setClientSessionExpiresAt(null);
      setClientAppointments([]);
      setClientNotifications([]);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as {
      client: ClientSessionProfile;
      appointments: Appointment[];
      notificationLogs: NotificationLog[];
    };
    setClientUser(data.client);
    setClientAppointments(data.appointments ?? []);
    setClientNotifications(data.notificationLogs ?? []);
  }, []);

  const signInWithCredentials = async (
    email: string,
    password: string,
  ): Promise<{ ok: boolean; accountType?: 'staff' | 'client'; error?: string }> => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        accountType?: 'staff' | 'client';
        token?: string;
        clientToken?: string;
        sessionExpiresAt?: number;
        user?: SessionUser;
        client?: ClientSessionProfile;
        error?: string;
      };
      if (!res.ok) {
        const msg = data.error || 'Invalid email or password.';
        setAuthError(msg);
        return { ok: false, error: msg };
      }

      if (data.accountType === 'client' && data.clientToken && data.client) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setUser(null);
        setSessionExpiresAt(null);
        localStorage.setItem(CLIENT_TOKEN_STORAGE_KEY, data.clientToken);
        setClientUser(data.client);
        setClientSessionExpiresAt(data.sessionExpiresAt ?? null);
        setNeedsAdminSetup(false);
        await refreshClientPortalData();
        return { ok: true, accountType: 'client' };
      }

      if (!data.token || !data.user) {
        const msg = data.error || 'Invalid email or password.';
        setAuthError(msg);
        return { ok: false, error: msg };
      }

      localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
      setClientUser(null);
      setClientSessionExpiresAt(null);
      setClientAppointments([]);
      setClientNotifications([]);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setNeedsAdminSetup(false);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ?? null);
      await loadStudioData(data.user);
      return { ok: true, accountType: 'staff' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
  };

  const signInWithGoogle = async (): Promise<{ ok: boolean; error?: string }> => {
    setAuthError(null);
    setFirebaseSyncError(null);
    mergeLocalOnManualConnectRef.current = false;
    try {
      const fbUser = await connectFirebaseGoogleSync();
      if (!fbUser.emailVerified) {
        await disconnectFirebaseGoogleSync().catch(() => {});
        const msg = 'Your Google account email must be verified before signing in.';
        setAuthError(msg);
        return { ok: false, error: msg };
      }

      const idToken = await fbUser.getIdToken(true);
      const res = await fetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        sessionExpiresAt?: number;
        user?: SessionUser;
        error?: string;
      };

      if (!res.ok || !data.token || !data.user) {
        await disconnectFirebaseGoogleSync().catch(() => {});
        const msg = data.error || 'Unable to sign in with Google.';
        setAuthError(msg);
        return { ok: false, error: msg };
      }

      localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
      setClientUser(null);
      setClientSessionExpiresAt(null);
      setClientAppointments([]);
      setClientNotifications([]);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      setNeedsAdminSetup(false);
      setFirebaseUser(fbUser);
      setUser(data.user);
      setSessionExpiresAt(data.sessionExpiresAt ?? null);
      await loadStudioData(data.user);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setAuthError(msg);
      return { ok: false, error: msg };
    }
  };

  const signOutUser = async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
    autoRestoredUidRef.current = null;
    await disconnectFirebaseGoogleSync().catch(() => {});
    resetSessionState();
    setAuthError(null);
  };

  const signUpClientAccount = async (input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string; client?: ClientSessionProfile }> => {
    try {
      const res = await fetch('/api/client/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = (await res.json().catch(() => ({}))) as {
        clientToken?: string;
        sessionExpiresAt?: number;
        client?: ClientSessionProfile;
        appointments?: Appointment[];
        notificationLogs?: NotificationLog[];
        error?: string;
      };
      if (!res.ok || !data.client) {
        return { ok: false, error: data.error || 'Unable to create client account.' };
      }
      applyClientPortalPayload(data);
      return { ok: true, client: data.client };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to create client account.',
      };
    }
  };

  const signOutClient = async () => {
    const clientToken = localStorage.getItem(CLIENT_TOKEN_STORAGE_KEY);
    await fetch('/api/client/logout', {
      method: 'POST',
      headers: clientToken ? { 'x-client-token': clientToken } : {},
    }).catch(() => {});
    localStorage.removeItem(CLIENT_TOKEN_STORAGE_KEY);
    setClientUser(null);
    setClientSessionExpiresAt(null);
    setClientAppointments([]);
    setClientNotifications([]);
    setAuthError(null);
  };

  const cancelClientAppointment = async (appointmentId: string) => {
    const clientToken = localStorage.getItem(CLIENT_TOKEN_STORAGE_KEY);
    const res = await fetch(`/api/client/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
      method: 'PATCH',
      headers: clientToken ? { 'x-client-token': clientToken } : {},
    });
    const data = (await res.json().catch(() => ({}))) as {
      client?: ClientSessionProfile;
      appointments?: Appointment[];
      notificationLogs?: NotificationLog[];
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || 'Unable to cancel booking.');
    }
    applyClientPortalPayload(data);
    pushToast('Booking cancelled', 'Your booking history has been updated.', 'info');
  };

  const hasPermission = useCallback(
    (key: PermissionKey): boolean => {
      if (!user) return false;
      if (user.isPrimaryAdmin) return true;
      return Boolean(user.permissions?.[key]);
    },
    [user],
  );

  const createAuthorizedUser = async (input: {
    email: string;
    fullName: string;
    password: string;
    role: AuthorizedUserRole;
    permissions: UserPermissions;
    active?: boolean;
  }) => {
    await apiFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const updatedUsers = await refreshUsersList();
    await syncUsersDirectoryToCloud(updatedUsers);
    pushToast('User account created', `${input.fullName} (${input.email})`, 'success');
  };

  const updateAuthorizedUser = async (
    userUid: string,
    updates: {
      fullName?: string;
      role?: AuthorizedUserRole;
      permissions?: UserPermissions;
      active?: boolean;
      password?: string;
    },
  ) => {
    const res = await apiFetch<{ user: AuthorizedUser }>(`/api/users/${encodeURIComponent(userUid)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    const updatedUsers = await refreshUsersList();
    await syncUsersDirectoryToCloud(updatedUsers);
    if (user && user.uid === userUid) {
      setUser({
        ...user,
        fullName: res.user.fullName,
        displayName: res.user.fullName,
        role: res.user.role,
        permissions: res.user.permissions,
      });
    }
    pushToast(
      updates.password ? 'Password updated' : 'Permissions updated',
      res.user.fullName,
      'success',
    );
  };

  const toggleAuthorizedUserActive = async (userUid: string, active: boolean) => {
    await updateAuthorizedUser(userUid, { active });
  };

  const deleteAuthorizedUser = async (userUid: string) => {
    await apiFetch(`/api/users/${encodeURIComponent(userUid)}`, {
      method: 'DELETE',
    });
    const updatedUsers = await refreshUsersList();
    await syncUsersDirectoryToCloud(updatedUsers);
    pushToast('User removed', 'Access revoked immediately', 'info');
  };

  const clearNonAdminUsers = async (): Promise<number> => {
    const res = await apiFetch<{ deletedCount: number }>('/api/users', {
      method: 'DELETE',
    });
    const updatedUsers = await refreshUsersList();
    await syncUsersDirectoryToCloud(updatedUsers);
    pushToast('Staff users cleared', `${res.deletedCount} non-admin account(s) removed`, 'info');
    return res.deletedCount;
  };

  const createAppointment = async (input: CreateAppointmentInput): Promise<string> => {
    const res = await apiFetch<{ appointmentId: string; syncOps?: SyncOps }>('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Appointment scheduled', `${input.clientName} · ${input.date} at ${input.startTime}`, 'success');
    return res.appointmentId;
  };

  const updateAppointmentStatus = async (appointmentId: string, status: AppointmentStatus) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/appointments/${encodeURIComponent(appointmentId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Booking status updated', status.replace('_', ' '), 'info');
  };

  const rescheduleAppointment = async (
    appointmentId: string,
    updates: {
      staffId: string;
      staffName: string;
      roomName: string;
      date: string;
      startTime: string;
      notes: string;
    },
  ) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/appointments/${encodeURIComponent(appointmentId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Appointment rescheduled', `${updates.date} at ${updates.startTime}`, 'success');
  };

  const toggleStaffDuty = async (staffId: string, onDuty: boolean) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/staff/${encodeURIComponent(staffId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ onDuty }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast(onDuty ? 'Therapist marked on duty' : 'Therapist marked off duty', undefined, 'info');
  };

  const updateStaffSchedule = async (
    staffId: string,
    updates: {
      workDays: string[];
      shiftStart: string;
      shiftEnd: string;
      breakStart: string;
      breakEnd: string;
      assignedRoomId?: string;
      assignedRoom: string;
      onDuty: boolean;
    },
  ) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/staff/${encodeURIComponent(staffId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Roster schedule saved', `${updates.shiftStart}–${updates.shiftEnd}`, 'success');
  };

  const updateStaffProfile = async (
    staffId: string,
    updates: {
      name: string;
      role: string;
      specialty: string;
      bio: string;
      avatarUrl: string;
    },
  ) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/staff/${encodeURIComponent(staffId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Staff profile updated', updates.name, 'success');
  };

  const createStaffMember = async (input: CreateStaffInput) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Therapist added', input.name, 'success');
  };

  const createRoom = async (input: { name: string; roomType: string; notes: string }): Promise<SpaRoom> => {
    const res = await apiFetch<{ room: SpaRoom; syncOps?: SyncOps }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Room created', res.room.name, 'success');
    return res.room;
  };

  const updateRoom = async (
    roomId: string,
    updates: { name?: string; roomType?: string; active?: boolean; notes?: string },
  ) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Room updated', updates.name ?? undefined, 'success');
  };

  const deleteRoom = async (roomId: string) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Room removed', undefined, 'info');
  };

  const createMembershipTier = async (input: CreateTierInput) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>('/api/membership-tiers', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Membership tier created', input.name, 'success');
  };

  const updateMembershipTier = async (
    tierId: string,
    updates: Partial<CreateTierInput> & { active?: boolean },
  ) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/membership-tiers/${encodeURIComponent(tierId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Membership tier updated', updates.name ?? undefined, 'success');
  };

  const deleteMembershipTier = async (tierId: string) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/membership-tiers/${encodeURIComponent(tierId)}`, {
      method: 'DELETE',
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Membership tier deleted', 'Existing client credits remain intact', 'info');
  };

  const createClient = async (input: CreateClientInput): Promise<string> => {
    const res = await apiFetch<{ clientId: string; syncOps?: SyncOps }>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Client added', input.fullName, 'success');
    return res.clientId;
  };

  const assignClientMembership = async (clientId: string, tierId: string) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/clients/${encodeURIComponent(clientId)}/membership`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'assign', tierId }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Membership plan updated', undefined, 'success');
  };

  const updateClientMembershipStatus = async (clientId: string, status: MembershipStatus) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/clients/${encodeURIComponent(clientId)}/membership`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'status', status }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Membership status updated', status, 'info');
  };

  const adjustClientCredits = async (clientId: string, delta: number) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/clients/${encodeURIComponent(clientId)}/membership`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'credits', delta }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Credits updated', '1 credit = $1 · No expiration', 'info');
  };

  const setClientCredits = async (clientId: string, exactCredits: number) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/clients/${encodeURIComponent(clientId)}/membership`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'credits', exactCredits }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Credit balance saved', `${Math.max(0, Math.floor(exactCredits))} credits ($${Math.max(0, Math.floor(exactCredits))})`, 'success');
  };

  const deductClientCredits = async (
    clientId: string,
    input: {
      creditsToDeduct: number;
      category: 'Massage' | 'Order Item' | 'Service';
      description: string;
      date?: string;
    },
  ) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/clients/${encodeURIComponent(clientId)}/membership`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'deduct', ...input }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast(
      'Credits deducted',
      `${input.creditsToDeduct} credits ($${input.creditsToDeduct}) · ${input.description}`,
      'info',
    );
  };

  const updateClientPortalPassword = async (clientId: string, password: string, email?: string) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/clients/${encodeURIComponent(clientId)}/membership`, {
      method: 'PATCH',
      body: JSON.stringify({
        action: 'password',
        password,
        ...(email !== undefined ? { email } : {}),
      }),
    });
    if (email !== undefined) {
      await refreshBootstrap();
      await pushSyncOps(res.syncOps);
    }
    pushToast(
      'Client password reset',
      'Client can now sign in with their email and new password',
      'success',
    );
  };

  const renewClientMembership = async (clientId: string, nextRenewalDate: string) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/clients/${encodeURIComponent(clientId)}/membership`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'renew', nextRenewalDate }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Next renewal updated', `Next renewal date set to ${nextRenewalDate}`, 'success');
  };

  const toggleNotificationRule = async (ruleId: string, enabled: boolean) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/notification-rules/${encodeURIComponent(ruleId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast(enabled ? 'Automation enabled' : 'Automation paused', undefined, 'info');
  };

  const updateNotificationRule = async (
    ruleId: string,
    updates: {
      channel: NotificationRule['channel'];
      timingLabel: string;
      enabled: boolean;
      subjectTemplate: string;
      bodyTemplate: string;
    },
  ) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/notification-rules/${encodeURIComponent(ruleId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Notification template saved', undefined, 'success');
  };

  const dispatchScheduledNotification = async (logId: string) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/notifications/dispatch/${encodeURIComponent(logId)}`, {
      method: 'POST',
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Reminder dispatched', undefined, 'success');
  };

  const dispatchAllPendingNotifications = async (): Promise<number> => {
    const res = await apiFetch<{ count: number; syncOps?: SyncOps }>('/api/notifications/dispatch-all', {
      method: 'POST',
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    if (res.count > 0) {
      pushToast('Batch reminders sent', `${res.count} queued client reminders dispatched`, 'success');
    }
    return res.count;
  };

  const sendManualNotification = async (params: {
    clientId: string;
    channel: NotificationChannel;
    subject: string;
    messageBody: string;
    appointmentId?: string;
  }) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>('/api/notifications/manual', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Client alert sent', `${params.channel} dispatched`, 'success');
  };

  const createService = async (input: CreateServiceInput) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>('/api/services', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Treatment added', input.name, 'success');
  };

  const updateService = async (
    serviceId: string,
    updates: Partial<CreateServiceInput> & { active?: boolean },
  ) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/services/${encodeURIComponent(serviceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Treatment updated', updates.name ?? undefined, 'success');
  };

  const deleteService = async (serviceId: string) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/services/${encodeURIComponent(serviceId)}`, {
      method: 'DELETE',
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast('Treatment deleted', undefined, 'info');
  };

  const toggleServiceActive = async (serviceId: string, active: boolean) => {
    const res = await apiFetch<{ syncOps?: SyncOps }>(`/api/services/${encodeURIComponent(serviceId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    await refreshBootstrap();
    await pushSyncOps(res.syncOps);
    pushToast(active ? 'Treatment activated' : 'Treatment archived', undefined, 'info');
  };

  const connectFirebaseSync = async () => {
    setFirebaseSyncError(null);
    mergeLocalOnManualConnectRef.current = true;
    try {
      const fbUser = await connectFirebaseGoogleSync();
      if (!fbUser.emailVerified) {
        mergeLocalOnManualConnectRef.current = false;
        throw new Error('Google account email must be verified for Firestore access.');
      }
      pushToast('Firebase Cloud Sync connected', fbUser.email ?? 'Real-time sync active', 'success');
    } catch (err) {
      mergeLocalOnManualConnectRef.current = false;
      const msg = err instanceof Error ? err.message : 'Unable to connect Firebase sync.';
      setFirebaseSyncStatus('error');
      setFirebaseSyncError(msg);
      pushToast('Firebase connection failed', msg, 'error');
    }
  };

  const disconnectFirebaseSync = async () => {
    await disconnectFirebaseGoogleSync();
    setFirebaseSyncStatus('disconnected');
    setFirebaseSyncError(null);
    pushToast('Firebase sync paused', 'Workspace continues saving locally.', 'info');
  };

  const syncNowToFirebase = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.emailVerified) {
      pushToast('Connect Firebase first', 'Sign in with Google to sync with Firestore.', 'info');
      return;
    }
    const next = await refreshBootstrap();
    await syncCollectionsToFirebase(
      [
        'rooms',
        'services',
        'staff',
        'membershipTiers',
        'clients',
        'appointments',
        'notificationRules',
        'notificationLogs',
        'creditDeductions',
      ],
      next,
    );
    pushToast('Cloud database synchronized', 'All production collections match Firestore', 'success');
  };

  const clearSimulationData = async () => {
    const res = await apiFetch<{ deletedCount: number }>('/api/studio/clear-simulation', {
      method: 'POST',
    });
    let cloudDeleted = 0;
    const fbUser = auth.currentUser;
    if (fbUser && fbUser.emailVerified) {
      cloudDeleted = await purgeAllSimulationFromFirestore(fbUser.uid);
    }
    await refreshBootstrap();
    pushToast(
      'Simulation data cleared',
      `${res.deletedCount} local & ${cloudDeleted} cloud demo record(s) removed.`,
      'info',
    );
  };

  const isPrimaryAdmin = Boolean(user?.isPrimaryAdmin);
  const isAdmin = Boolean(user && (user.isPrimaryAdmin || user.role === 'admin'));

  return (
    <StudioContext.Provider
      value={{
        user,
        clientUser,
        clientAppointments,
        clientNotifications,
        needsAdminSetup,
        cloudStudioExists,
        authReady,
        isPrimaryAdmin,
        isAdmin,
        hasPermission,
        authError,
        clearAuthError,
        sessionExpiresAt,
        authorizedUsers,
        loadingData,
        seeding,
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
        toasts,
        dismissToast,
        pushToast,
        initializeAdmin,
        signInWithCredentials,
        signInWithGoogle,
        signOutUser,
        signUpClientAccount,
        signOutClient,
        refreshClientPortalData,
        applyClientPortalPayload,
        cancelClientAppointment,
        createAuthorizedUser,
        updateAuthorizedUser,
        toggleAuthorizedUserActive,
        deleteAuthorizedUser,
        clearNonAdminUsers,
        createAppointment,
        updateAppointmentStatus,
        rescheduleAppointment,
        toggleStaffDuty,
        updateStaffSchedule,
        updateStaffProfile,
        createStaffMember,
        createRoom,
        updateRoom,
        deleteRoom,
        createMembershipTier,
        updateMembershipTier,
        deleteMembershipTier,
        createClient,
        assignClientMembership,
        updateClientMembershipStatus,
        adjustClientCredits,
        setClientCredits,
        deductClientCredits,
        updateClientPortalPassword,
        renewClientMembership,
        toggleNotificationRule,
        updateNotificationRule,
        dispatchScheduledNotification,
        dispatchAllPendingNotifications,
        sendManualNotification,
        createService,
        updateService,
        deleteService,
        toggleServiceActive,
        firebaseUserEmail: firebaseUser?.email ?? null,
        firebaseSyncStatus,
        firebaseSyncError,
        firebaseLastSyncedAt,
        connectFirebaseSync,
        disconnectFirebaseSync,
        syncNowToFirebase,
        clearSimulationData,
      }}
    >
      {children}
    </StudioContext.Provider>
  );
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used inside StudioProvider');
  return ctx;
}
