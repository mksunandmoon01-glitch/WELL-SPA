import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  OperationType,
  auth,
  db,
  getSecondaryAuth,
  handleFirestoreError,
} from '../lib/firebase';
import {
  PRIMARY_ADMIN_EMAIL,
  SESSION_DURATION_MS,
  SHARED_STUDIO_ID,
  buildSeedData,
  formatLocalDate,
  renderNotificationTemplate,
} from '../lib/seedStudio';
import type {
  Appointment,
  AppointmentStatus,
  AuthorizedUser,
  AuthorizedUserRole,
  Client,
  MembershipStatus,
  MembershipTier,
  NotificationChannel,
  NotificationLog,
  NotificationRule,
  ServiceCategory,
  SpaService,
  StaffMember,
  Studio,
} from '../types/spa';

export interface CreateAppointmentInput {
  clientId?: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceId: string;
  staffId: string;
  date: string;
  startTime: string;
  useMembershipCredit: boolean;
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
}

export interface CreateStaffInput {
  name: string;
  role: string;
  specialty: string;
  bio: string;
  avatarUrl: string;
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
  user: User | null;
  pendingVerificationUser: User | null;
  authReady: boolean;
  isPrimaryAdmin: boolean;
  authError: string | null;
  clearAuthError: () => void;
  sessionExpiresAt: number | null;
  authorizedUsers: AuthorizedUser[];
  loadingData: boolean;
  seeding: boolean;
  studio: Studio | null;
  services: SpaService[];
  staff: StaffMember[];
  membershipTiers: MembershipTier[];
  clients: Client[];
  appointments: Appointment[];
  notificationRules: NotificationRule[];
  notificationLogs: NotificationLog[];
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  pushToast: (title: string, detail?: string, tone?: 'success' | 'info' | 'error') => void;
  signInWithCredentials: (email: string, password: string) => Promise<{ ok: boolean; code?: string }>;
  activatePrimaryAdmin: (email: string, password: string) => Promise<{ ok: boolean; code?: string }>;
  sendPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<void>;
  signOutUser: () => Promise<void>;
  createAuthorizedUser: (input: {
    email: string;
    fullName: string;
    password: string;
    role: AuthorizedUserRole;
  }) => Promise<void>;
  toggleAuthorizedUserActive: (userUid: string, active: boolean) => Promise<void>;
  deleteAuthorizedUser: (userUid: string) => Promise<void>;
  createAppointment: (input: CreateAppointmentInput) => Promise<string>;
  updateAppointmentStatus: (appointmentId: string, status: AppointmentStatus) => Promise<void>;
  rescheduleAppointment: (
    appointmentId: string,
    updates: { staffId: string; staffName: string; roomName: string; date: string; startTime: string; notes: string },
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
      assignedRoom: string;
      onDuty: boolean;
    },
  ) => Promise<void>;
  createStaffMember: (input: CreateStaffInput) => Promise<void>;
  createMembershipTier: (input: CreateTierInput) => Promise<void>;
  updateMembershipTier: (tierId: string, updates: Partial<CreateTierInput> & { active?: boolean }) => Promise<void>;
  createClient: (input: CreateClientInput) => Promise<string>;
  assignClientMembership: (clientId: string, tierId: string) => Promise<void>;
  updateClientMembershipStatus: (clientId: string, status: MembershipStatus) => Promise<void>;
  adjustClientCredits: (clientId: string, delta: number) => Promise<void>;
  renewClientMembership: (clientId: string) => Promise<void>;
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
  toggleServiceActive: (serviceId: string, active: boolean) => Promise<void>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function nowTimeLabel(): string {
  const now = new Date();
  return `Today · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

const SESSION_STARTED_KEY = 'wellspa_session_started_at';
const SUBCOLLECTIONS = [
  'services',
  'staff',
  'membershipTiers',
  'clients',
  'appointments',
  'notificationRules',
  'notificationLogs',
] as const;

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pendingVerificationUser, setPendingVerificationUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [authorizedUsers, setAuthorizedUsers] = useState<AuthorizedUser[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const [studio, setStudio] = useState<Studio | null>(null);
  const [services, setServices] = useState<SpaService[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>([]);
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const clearAuthError = () => setAuthError(null);

  const pushToast = (
    title: string,
    detail?: string,
    tone: 'success' | 'info' | 'error' = 'success',
  ) => {
    const id = makeId('toast');
    setToasts((prev) => [...prev.slice(-3), { id, title, detail, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const evaluateFirebaseUser = async (firebaseUser: User | null) => {
    if (!firebaseUser) {
      setUser(null);
      setPendingVerificationUser(null);
      setIsPrimaryAdmin(false);
      setSessionExpiresAt(null);
      setAuthorizedUsers([]);
      setStudio(null);
      setServices([]);
      setStaff([]);
      setMembershipTiers([]);
      setClients([]);
      setAppointments([]);
      setNotificationRules([]);
      setNotificationLogs([]);
      setLoadingData(false);
      setAuthReady(true);
      return;
    }

    const rawStarted = localStorage.getItem(SESSION_STARTED_KEY);
    const parsedLastSignIn = Date.parse(firebaseUser.metadata.lastSignInTime || '');
    const startedAt = rawStarted
      ? Number(rawStarted)
      : Number.isFinite(parsedLastSignIn)
        ? parsedLastSignIn
        : Date.now();
    if (!rawStarted) {
      localStorage.setItem(SESSION_STARTED_KEY, String(startedAt));
    }

    const elapsed = Date.now() - startedAt;
    if (!Number.isFinite(startedAt) || elapsed >= SESSION_DURATION_MS) {
      localStorage.removeItem(SESSION_STARTED_KEY);
      setAuthError('Your 8-hour session has expired. Please sign in again.');
      setUser(null);
      setPendingVerificationUser(null);
      setIsPrimaryAdmin(false);
      setSessionExpiresAt(null);
      setAuthReady(true);
      await signOut(auth);
      return;
    }

    if (!firebaseUser.emailVerified) {
      setPendingVerificationUser(firebaseUser);
      setUser(null);
      setIsPrimaryAdmin(false);
      setSessionExpiresAt(null);
      setAuthReady(true);
      return;
    }

    const emailLower = (firebaseUser.email || '').trim().toLowerCase();
    const primary = emailLower === PRIMARY_ADMIN_EMAIL;
    let allowed = primary;

    if (!allowed) {
      try {
        const authSnap = await getDoc(doc(db, 'authorizedUsers', firebaseUser.uid));
        allowed = authSnap.exists() && authSnap.data()?.active === true;
      } catch {
        allowed = false;
      }
    }

    if (!allowed) {
      localStorage.removeItem(SESSION_STARTED_KEY);
      setAuthError('Access denied. Only administrator-created accounts can sign in.');
      setUser(null);
      setPendingVerificationUser(null);
      setIsPrimaryAdmin(false);
      setSessionExpiresAt(null);
      setAuthReady(true);
      await signOut(auth);
      return;
    }

    setAuthError(null);
    setPendingVerificationUser(null);
    setIsPrimaryAdmin(primary);
    setSessionExpiresAt(startedAt + SESSION_DURATION_MS);
    setUser(firebaseUser);
    setAuthReady(true);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      evaluateFirebaseUser(firebaseUser);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || !sessionExpiresAt) return;
    const remaining = sessionExpiresAt - Date.now();
    if (remaining <= 0) {
      localStorage.removeItem(SESSION_STARTED_KEY);
      setAuthError('Your 8-hour session has expired. Please sign in again.');
      signOut(auth);
      return;
    }
    const timer = window.setTimeout(() => {
      localStorage.removeItem(SESSION_STARTED_KEY);
      setAuthError('Your 8-hour session has expired. Please sign in again.');
      signOut(auth);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [user, sessionExpiresAt]);

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    setLoadingData(true);

    async function ensureSeeded() {
      const studioRef = doc(db, 'studios', SHARED_STUDIO_ID);
      try {
        const snap = await getDoc(studioRef);
        if (!snap.exists() || !snap.data()?.seeded) {
          if (!isPrimaryAdmin) {
            setLoadingData(false);
            return;
          }
          if (cancelled) return;
          setSeeding(true);

          const authSnap = await getDocs(collection(db, 'authorizedUsers'));
          const activeUids = authSnap.docs
            .filter((d) => d.data()?.active === true)
            .map((d) => d.id);
          const initialMembers = Array.from(new Set([user!.uid, ...activeUids])).slice(0, 25);

          const seed = buildSeedData(user!.uid, initialMembers);
          await setDoc(studioRef, {
            ...seed.studio,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const batch = writeBatch(db);
          const writeSeedList = (sub: string, items: Array<Record<string, unknown> & { id: string }>) => {
            for (const item of items) {
              const { id, ...payload } = item;
              batch.set(doc(db, 'studios', SHARED_STUDIO_ID, sub, id), {
                ...payload,
                memberUids: initialMembers,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          };

          writeSeedList('services', seed.services);
          writeSeedList('staff', seed.staff);
          writeSeedList('membershipTiers', seed.membershipTiers);
          writeSeedList('clients', seed.clients);
          writeSeedList('appointments', seed.appointments);
          writeSeedList('notificationRules', seed.notificationRules);
          writeSeedList('notificationLogs', seed.notificationLogs);

          await batch.commit();
          if (!cancelled) setSeeding(false);
        } else if (isPrimaryAdmin) {
          const existingMembers = Array.isArray(snap.data()?.memberUids)
            ? (snap.data()?.memberUids as string[])
            : [];
          if (!existingMembers.includes(user!.uid)) {
            const authSnap = await getDocs(collection(db, 'authorizedUsers'));
            const activeUids = authSnap.docs
              .filter((d) => d.data()?.active === true)
              .map((d) => d.id);
            const nextMembers = Array.from(new Set([user!.uid, ...activeUids])).slice(0, 25);
            await syncStudioMemberUids(nextMembers);
          }
        }
      } catch (err) {
        if (!cancelled) setSeeding(false);
        handleFirestoreError(err, OperationType.WRITE, `studios/${SHARED_STUDIO_ID}`);
      }
    }

    ensureSeeded();

    const unsubStudio = onSnapshot(
      doc(db, 'studios', SHARED_STUDIO_ID),
      (snap) => {
        if (snap.exists()) {
          setStudio({ id: snap.id, ...(snap.data() as Omit<Studio, 'id'>) });
        }
        setLoadingData(false);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `studios/${SHARED_STUDIO_ID}`),
    );

    const makeSubListener = <T extends { id: string }>(
      subName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      sortFn?: (a: T, b: T) => number,
    ) => {
      const path = `studios/${SHARED_STUDIO_ID}/${subName}`;
      const q = query(collection(db, path), where('memberUids', 'array-contains', user.uid));
      return onSnapshot(
        q,
        (snap) => {
          const rows = snap.docs.map(
            (d) =>
              ({
                id: d.id,
                ...d.data(),
              }) as T,
          );
          if (sortFn) rows.sort(sortFn);
          setter(rows);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, path),
      );
    };

    const unsubs = [
      unsubStudio,
      makeSubListener<SpaService>('services', setServices, (a, b) => a.name.localeCompare(b.name)),
      makeSubListener<StaffMember>('staff', setStaff, (a, b) => a.name.localeCompare(b.name)),
      makeSubListener<MembershipTier>('membershipTiers', setMembershipTiers, (a, b) => a.monthlyPrice - b.monthlyPrice),
      makeSubListener<Client>('clients', setClients, (a, b) => a.fullName.localeCompare(b.fullName)),
      makeSubListener<Appointment>('appointments', setAppointments, (a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      ),
      makeSubListener<NotificationRule>('notificationRules', setNotificationRules, (a, b) =>
        a.title.localeCompare(b.title),
      ),
      makeSubListener<NotificationLog>('notificationLogs', setNotificationLogs, (a, b) =>
        b.scheduledFor.localeCompare(a.scheduledFor),
      ),
    ];

    if (isPrimaryAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'authorizedUsers'),
          (snap) => {
            const rows = snap.docs.map(
              (d) =>
                ({
                  id: d.id,
                  ...d.data(),
                }) as AuthorizedUser,
            );
            rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
            setAuthorizedUsers(rows);
          },
          (error) => handleFirestoreError(error, OperationType.LIST, 'authorizedUsers'),
        ),
      );
    }

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, isPrimaryAdmin]);

  const signInWithCredentials = async (
    email: string,
    password: string,
  ): Promise<{ ok: boolean; code?: string }> => {
    setAuthError(null);
    localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return { ok: true };
    } catch (err) {
      localStorage.removeItem(SESSION_STARTED_KEY);
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        setAuthError(
          'Email/Password sign-in is not yet enabled in the Firebase Console for this project.',
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setAuthError('Invalid email or password, or account has not been created by the administrator.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'Unable to sign in.');
      }
      return { ok: false, code };
    }
  };

  const activatePrimaryAdmin = async (
    email: string,
    password: string,
  ): Promise<{ ok: boolean; code?: string }> => {
    setAuthError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== PRIMARY_ADMIN_EMAIL) {
      setAuthError(`Only the primary administrator (${PRIMARY_ADMIN_EMAIL}) can be initialized here.`);
      return { ok: false, code: 'auth/unauthorized-email' };
    }
    if (password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return { ok: false, code: 'auth/weak-password' };
    }
    localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    try {
      const cred = await createUserWithEmailAndPassword(auth, PRIMARY_ADMIN_EMAIL, password);
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
      }
      return { ok: true };
    } catch (err) {
      localStorage.removeItem(SESSION_STARTED_KEY);
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
        setAuthError(
          'Email/Password sign-in is not yet enabled in the Firebase Console for this project.',
        );
      } else if (code === 'auth/email-already-in-use') {
        setAuthError(
          `${PRIMARY_ADMIN_EMAIL} already exists in Firebase Auth. Click "Set / Reset Password" to send a password setup link, or reset it in Firebase Console → Users.`,
        );
      } else {
        setAuthError(err instanceof Error ? err.message : 'Unable to activate admin account.');
      }
      return { ok: false, code };
    }
  };

  const sendPasswordReset = async (
    email: string,
  ): Promise<{ ok: boolean; error?: string; code?: string }> => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      return { ok: false, error: 'Enter your email address first.' };
    }
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      return { ok: true };
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      return {
        ok: false,
        code,
        error: err instanceof Error ? err.message : 'Unable to send password reset email.',
      };
    }
  };

  const resendVerificationEmail = async () => {
    if (!pendingVerificationUser) return;
    try {
      await sendEmailVerification(pendingVerificationUser);
      pushToast('Verification email sent', pendingVerificationUser.email ?? undefined, 'info');
    } catch (err) {
      pushToast(
        'Could not send email',
        err instanceof Error ? err.message : 'Try again shortly',
        'error',
      );
    }
  };

  const refreshVerificationStatus = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await evaluateFirebaseUser(auth.currentUser);
  };

  const signOutUser = async () => {
    localStorage.removeItem(SESSION_STARTED_KEY);
    setAuthError(null);
    setPendingVerificationUser(null);
    await signOut(auth);
  };

  const syncStudioMemberUids = async (nextMemberUids: string[]) => {
    const bounded = nextMemberUids.slice(0, 25);
    const refsToUpdate = [doc(db, 'studios', SHARED_STUDIO_ID)];
    for (const sub of SUBCOLLECTIONS) {
      const snap = await getDocs(collection(db, 'studios', SHARED_STUDIO_ID, sub));
      snap.docs.forEach((d) => refsToUpdate.push(d.ref));
    }
    for (let i = 0; i < refsToUpdate.length; i += 400) {
      const batch = writeBatch(db);
      refsToUpdate.slice(i, i + 400).forEach((ref) => {
        batch.update(ref, {
          memberUids: bounded,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  };

  const createAuthorizedUser = async (input: {
    email: string;
    fullName: string;
    password: string;
    role: AuthorizedUserRole;
  }) => {
    if (!user || !isPrimaryAdmin) {
      throw new Error('Only the primary administrator can create users.');
    }
    const cleanEmail = input.email.trim().toLowerCase();
    const secondaryAuth = getSecondaryAuth();
    let createdUid = '';
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, input.password);
      createdUid = cred.user.uid;
      await sendEmailVerification(cred.user);
      await signOut(secondaryAuth);
    } catch (err) {
      try {
        await signOut(secondaryAuth);
      } catch {
        // ignore cleanup signOut errors
      }
      throw err;
    }

    const path = `authorizedUsers/${createdUid}`;
    try {
      await setDoc(doc(db, path), {
        uid: createdUid,
        email: cleanEmail.slice(0, 160),
        fullName: input.fullName.trim().slice(0, 120),
        role: input.role,
        active: true,
        createdByUid: user.uid,
        createdByEmail: (user.email || PRIMARY_ADMIN_EMAIL).slice(0, 160),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const baseUids = studio?.memberUids?.length ? studio.memberUids : [user.uid];
      const nextUids = Array.from(new Set([...baseUids, createdUid])).slice(0, 25);
      await syncStudioMemberUids(nextUids);
      pushToast(
        'User created & added to shared database',
        `${input.fullName} (${cleanEmail}) · Verification email sent`,
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const toggleAuthorizedUserActive = async (userUid: string, active: boolean) => {
    if (!user || !isPrimaryAdmin) return;
    const existingUser = authorizedUsers.find((u) => u.id === userUid);
    if (!existingUser) return;
    const path = `authorizedUsers/${userUid}`;
    try {
      await updateDoc(doc(db, path), {
        fullName: existingUser.fullName,
        role: existingUser.role,
        active,
        updatedAt: serverTimestamp(),
      });
      const currentUids = studio?.memberUids?.length ? studio.memberUids : [user.uid];
      const nextUids = active
        ? Array.from(new Set([...currentUids, userUid])).slice(0, 25)
        : currentUids.filter((id) => id !== userUid);
      if (nextUids.length > 0) {
        await syncStudioMemberUids(nextUids);
      }
      pushToast(active ? 'User access enabled' : 'User access revoked', existingUser.email, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const deleteAuthorizedUser = async (userUid: string) => {
    if (!user || !isPrimaryAdmin) return;
    const path = `authorizedUsers/${userUid}`;
    try {
      await deleteDoc(doc(db, path));
      const currentUids = studio?.memberUids?.length ? studio.memberUids : [user.uid];
      const nextUids = currentUids.filter((id) => id !== userUid);
      if (nextUids.length > 0) {
        await syncStudioMemberUids(nextUids);
      }
      pushToast('User removed from shared workspace', undefined, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const getSharedMeta = () => {
    if (!user) throw new Error('User must be signed in');
    return {
      studioId: SHARED_STUDIO_ID,
      ownerId: studio?.ownerId ?? user.uid,
      memberUids: studio?.memberUids?.length ? studio.memberUids : [user.uid],
    };
  };

  const createAppointment = async (input: CreateAppointmentInput): Promise<string> => {
    const { studioId, ownerId, memberUids } = getSharedMeta();
    const service = services.find((s) => s.id === input.serviceId);
    const member = staff.find((s) => s.id === input.staffId);
    if (!service || !member) {
      throw new Error('Selected treatment or therapist was not found.');
    }

    let resolvedClientId = input.clientId || '';
    const existingClient = resolvedClientId
      ? clients.find((c) => c.id === resolvedClientId)
      : clients.find((c) => c.email.toLowerCase() === input.clientEmail.trim().toLowerCase());

    if (existingClient) {
      resolvedClientId = existingClient.id;
    } else {
      resolvedClientId = makeId('cli');
      const clientPath = `studios/${studioId}/clients/${resolvedClientId}`;
      try {
        await setDoc(doc(db, clientPath), {
          ownerId,
          memberUids,
          fullName: input.clientName.trim().slice(0, 120),
          email: input.clientEmail.trim().slice(0, 160),
          phone: input.clientPhone.trim().slice(0, 32),
          notes: input.notes.trim().slice(0, 500),
          preferredTherapistId: member.id,
          membershipTierId: '',
          membershipTierName: 'No Membership',
          membershipStatus: 'none',
          creditsRemaining: 0,
          nextRenewalDate: '',
          totalVisits: 0,
          lifetimeSpend: 0,
          smsOptIn: Boolean(input.clientPhone.trim()),
          emailOptIn: Boolean(input.clientEmail.trim()),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, clientPath);
      }
    }

    const canRedeemCredit =
      input.useMembershipCredit &&
      existingClient &&
      existingClient.membershipStatus === 'active' &&
      existingClient.creditsRemaining > 0;

    if (canRedeemCredit && existingClient) {
      const clientUpdatePath = `studios/${studioId}/clients/${existingClient.id}`;
      try {
        await updateDoc(doc(db, clientUpdatePath), {
          creditsRemaining: Math.max(0, existingClient.creditsRemaining - 1),
          totalVisits: existingClient.totalVisits,
          lifetimeSpend: existingClient.lifetimeSpend,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, clientUpdatePath);
      }
    }

    const confirmRule = notificationRules.find((r) => r.eventKey === 'booking_confirmed' && r.enabled);
    const reminderRule = notificationRules.find((r) => r.eventKey === 'reminder_24h' && r.enabled);

    const aptId = makeId('apt');
    const aptPath = `studios/${studioId}/appointments/${aptId}`;
    try {
      await setDoc(doc(db, aptPath), {
        ownerId,
        memberUids,
        clientId: resolvedClientId,
        clientName: input.clientName.trim().slice(0, 120),
        clientEmail: input.clientEmail.trim().slice(0, 160),
        clientPhone: input.clientPhone.trim().slice(0, 32),
        serviceId: service.id,
        serviceName: service.name.slice(0, 120),
        staffId: member.id,
        staffName: member.name.slice(0, 120),
        roomName: member.assignedRoom.slice(0, 80),
        date: input.date.slice(0, 10),
        startTime: input.startTime.slice(0, 8),
        durationMinutes: service.durationMinutes,
        price: canRedeemCredit ? 0 : service.price,
        usedMembershipCredit: Boolean(canRedeemCredit),
        status: 'confirmed',
        notes: input.notes.trim().slice(0, 500),
        confirmationSent: Boolean(confirmRule),
        reminderSent: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, aptPath);
    }

    const vars = {
      clientName: input.clientName.trim(),
      serviceName: service.name,
      therapistName: member.name,
      dateTime: `${input.date} at ${input.startTime}`,
      roomName: member.assignedRoom,
      studioName: studio?.name ?? 'SUN & MOON Hotel, WELL SPA',
    };

    if (confirmRule) {
      const logId = makeId('log');
      const logPath = `studios/${studioId}/notificationLogs/${logId}`;
      const channel: NotificationChannel =
        confirmRule.channel === 'SMS' && input.clientPhone.trim()
          ? 'SMS'
          : input.clientEmail.trim()
            ? 'Email'
            : 'SMS';
      try {
        await setDoc(doc(db, logPath), {
          ownerId,
          memberUids,
          ruleId: confirmRule.id,
          eventKey: 'booking_confirmed',
          appointmentId: aptId,
          clientId: resolvedClientId,
          clientName: input.clientName.trim().slice(0, 120),
          recipientContact: (channel === 'SMS' ? input.clientPhone : input.clientEmail).trim().slice(0, 160),
          channel,
          subject: renderNotificationTemplate(confirmRule.subjectTemplate, vars).slice(0, 200),
          messageBody: renderNotificationTemplate(confirmRule.bodyTemplate, vars).slice(0, 900),
          status: 'sent',
          scheduledFor: `${input.date} ${input.startTime}`,
          sentAtLabel: nowTimeLabel(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, `studios/${studioId}/notificationRules/${confirmRule.id}`), {
          sentCount: confirmRule.sentCount + 1,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, logPath);
      }
    }

    if (reminderRule) {
      const logId = makeId('log');
      const logPath = `studios/${studioId}/notificationLogs/${logId}`;
      const channel: NotificationChannel = reminderRule.channel === 'Email' ? 'Email' : 'SMS';
      try {
        await setDoc(doc(db, logPath), {
          ownerId,
          memberUids,
          ruleId: reminderRule.id,
          eventKey: 'reminder_24h',
          appointmentId: aptId,
          clientId: resolvedClientId,
          clientName: input.clientName.trim().slice(0, 120),
          recipientContact: (channel === 'SMS' ? input.clientPhone : input.clientEmail).trim().slice(0, 160),
          channel,
          subject: renderNotificationTemplate(reminderRule.subjectTemplate, vars).slice(0, 200),
          messageBody: renderNotificationTemplate(reminderRule.bodyTemplate, vars).slice(0, 900),
          status: 'scheduled',
          scheduledFor: `${input.date} ${input.startTime}`,
          sentAtLabel: `Queued · ${input.date}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, logPath);
      }
    }

    pushToast(
      'Booking confirmed',
      `${input.clientName} · ${service.name} with ${member.name}${confirmRule ? ' (Confirmation sent)' : ''}`,
      'success',
    );
    return aptId;
  };

  const updateAppointmentStatus = async (appointmentId: string, status: AppointmentStatus) => {
    const { studioId, ownerId, memberUids } = getSharedMeta();
    const apt = appointments.find((a) => a.id === appointmentId);
    if (!apt) return;

    const aptPath = `studios/${studioId}/appointments/${appointmentId}`;
    try {
      await updateDoc(doc(db, aptPath), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, aptPath);
    }

    if (status === 'completed') {
      const client = clients.find((c) => c.id === apt.clientId);
      if (client) {
        const clientPath = `studios/${studioId}/clients/${client.id}`;
        try {
          await updateDoc(doc(db, clientPath), {
            creditsRemaining: client.creditsRemaining,
            totalVisits: client.totalVisits + 1,
            lifetimeSpend: client.lifetimeSpend + apt.price,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, clientPath);
        }
      }

      const rebookRule = notificationRules.find((r) => r.eventKey === 'post_visit_rebook' && r.enabled);
      if (rebookRule) {
        const vars = {
          clientName: apt.clientName,
          serviceName: apt.serviceName,
          therapistName: apt.staffName,
          dateTime: `${apt.date} at ${apt.startTime}`,
          roomName: apt.roomName,
          studioName: studio?.name ?? 'SUN & MOON Hotel, WELL SPA',
        };
        const logId = makeId('log');
        const logPath = `studios/${studioId}/notificationLogs/${logId}`;
        try {
          await setDoc(doc(db, logPath), {
            ownerId,
            memberUids,
            ruleId: rebookRule.id,
            eventKey: 'post_visit_rebook',
            appointmentId: apt.id,
            clientId: apt.clientId,
            clientName: apt.clientName,
            recipientContact: apt.clientEmail || apt.clientPhone || 'On file',
            channel: rebookRule.channel === 'SMS' ? 'SMS' : 'Email',
            subject: renderNotificationTemplate(rebookRule.subjectTemplate, vars).slice(0, 200),
            messageBody: renderNotificationTemplate(rebookRule.bodyTemplate, vars).slice(0, 900),
            status: 'scheduled',
            scheduledFor: `${apt.date} +2h`,
            sentAtLabel: 'Queued · Post-visit',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, logPath);
        }
      }
    }

    const labelMap: Record<AppointmentStatus, string> = {
      confirmed: 'Confirmed',
      checked_in: 'Checked in',
      in_progress: 'Session started',
      completed: 'Session completed',
      cancelled: 'Appointment cancelled',
      no_show: 'Marked as no-show',
    };
    pushToast(labelMap[status], `${apt.clientName} · ${apt.serviceName}`, 'info');
  };

  const rescheduleAppointment = async (
    appointmentId: string,
    updates: { staffId: string; staffName: string; roomName: string; date: string; startTime: string; notes: string },
  ) => {
    const { studioId } = getSharedMeta();
    const path = `studios/${studioId}/appointments/${appointmentId}`;
    try {
      await updateDoc(doc(db, path), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      pushToast('Appointment updated', `${updates.date} at ${updates.startTime} · ${updates.staffName}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const toggleStaffDuty = async (staffId: string, onDuty: boolean) => {
    const { studioId } = getSharedMeta();
    const path = `studios/${studioId}/staff/${staffId}`;
    try {
      await updateDoc(doc(db, path), {
        onDuty,
        updatedAt: serverTimestamp(),
      });
      pushToast(onDuty ? 'Therapist set on duty' : 'Therapist set off duty');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const updateStaffSchedule = async (
    staffId: string,
    updates: {
      workDays: string[];
      shiftStart: string;
      shiftEnd: string;
      breakStart: string;
      breakEnd: string;
      assignedRoom: string;
      onDuty: boolean;
    },
  ) => {
    const { studioId } = getSharedMeta();
    const path = `studios/${studioId}/staff/${staffId}`;
    try {
      await updateDoc(doc(db, path), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      pushToast('Shift schedule saved', `${updates.shiftStart} – ${updates.shiftEnd} · ${updates.assignedRoom}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const createStaffMember = async (input: CreateStaffInput) => {
    const { studioId, ownerId, memberUids } = getSharedMeta();
    const id = makeId('stf');
    const path = `studios/${studioId}/staff/${id}`;
    try {
      await setDoc(doc(db, path), {
        ownerId,
        memberUids,
        name: input.name.trim().slice(0, 120),
        role: input.role.trim().slice(0, 80),
        specialty: input.specialty.trim().slice(0, 160),
        bio: input.bio.trim().slice(0, 400),
        avatarUrl: input.avatarUrl.trim().slice(0, 300),
        assignedRoom: input.assignedRoom.trim().slice(0, 80),
        onDuty: true,
        workDays: input.workDays.slice(0, 7),
        shiftStart: input.shiftStart,
        shiftEnd: input.shiftEnd,
        breakStart: input.breakStart,
        breakEnd: input.breakEnd,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast('Therapist added', input.name);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const createMembershipTier = async (input: CreateTierInput) => {
    const { studioId, ownerId, memberUids } = getSharedMeta();
    const id = makeId('tier');
    const path = `studios/${studioId}/membershipTiers/${id}`;
    try {
      await setDoc(doc(db, path), {
        ownerId,
        memberUids,
        name: input.name.trim().slice(0, 100),
        targetAudience: input.targetAudience.trim().slice(0, 120),
        monthlyPrice: input.monthlyPrice,
        creditsPerMonth: input.creditsPerMonth,
        retailDiscountPercent: input.retailDiscountPercent,
        priorityWindowHours: input.priorityWindowHours,
        perksSummary: input.perksSummary.trim().slice(0, 400),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast('Membership plan created', input.name);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const updateMembershipTier = async (
    tierId: string,
    updates: Partial<CreateTierInput> & { active?: boolean },
  ) => {
    const { studioId } = getSharedMeta();
    const existingTier = membershipTiers.find((t) => t.id === tierId);
    if (!existingTier) return;
    const path = `studios/${studioId}/membershipTiers/${tierId}`;
    try {
      await updateDoc(doc(db, path), {
        name: (updates.name ?? existingTier.name).trim().slice(0, 100),
        targetAudience: (updates.targetAudience ?? existingTier.targetAudience).trim().slice(0, 120),
        monthlyPrice: updates.monthlyPrice ?? existingTier.monthlyPrice,
        creditsPerMonth: updates.creditsPerMonth ?? existingTier.creditsPerMonth,
        retailDiscountPercent: updates.retailDiscountPercent ?? existingTier.retailDiscountPercent,
        priorityWindowHours: updates.priorityWindowHours ?? existingTier.priorityWindowHours,
        perksSummary: (updates.perksSummary ?? existingTier.perksSummary).trim().slice(0, 400),
        active: updates.active ?? existingTier.active,
        updatedAt: serverTimestamp(),
      });
      pushToast('Membership tier updated', updates.name ?? existingTier.name);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const createClient = async (input: CreateClientInput): Promise<string> => {
    const { studioId, ownerId, memberUids } = getSharedMeta();
    const id = makeId('cli');
    const tier = membershipTiers.find((t) => t.id === input.membershipTierId);
    const path = `studios/${studioId}/clients/${id}`;
    try {
      await setDoc(doc(db, path), {
        ownerId,
        memberUids,
        fullName: input.fullName.trim().slice(0, 120),
        email: input.email.trim().slice(0, 160),
        phone: input.phone.trim().slice(0, 32),
        notes: input.notes.trim().slice(0, 500),
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast('Client added', tier ? `${input.fullName} enrolled in ${tier.name}` : input.fullName);
      return id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const assignClientMembership = async (clientId: string, tierId: string) => {
    const { studioId } = getSharedMeta();
    const client = clients.find((c) => c.id === clientId);
    const tier = membershipTiers.find((t) => t.id === tierId);
    if (!client) return;

    const path = `studios/${studioId}/clients/${clientId}`;
    try {
      if (!tier) {
        await updateDoc(doc(db, path), {
          membershipTierId: '',
          membershipTierName: 'No Membership',
          membershipStatus: 'none',
          creditsRemaining: 0,
          nextRenewalDate: '',
          updatedAt: serverTimestamp(),
        });
        pushToast('Membership removed', client.fullName, 'info');
      } else {
        await updateDoc(doc(db, path), {
          membershipTierId: tier.id,
          membershipTierName: tier.name,
          membershipStatus: 'active',
          creditsRemaining: tier.creditsPerMonth,
          nextRenewalDate: formatLocalDate(30),
          updatedAt: serverTimestamp(),
        });
        pushToast('Membership assigned', `${client.fullName} · ${tier.name} (${tier.creditsPerMonth} credits)`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const updateClientMembershipStatus = async (clientId: string, status: MembershipStatus) => {
    const { studioId } = getSharedMeta();
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    const path = `studios/${studioId}/clients/${clientId}`;
    try {
      await updateDoc(doc(db, path), {
        membershipTierId: client.membershipTierId,
        membershipTierName: client.membershipTierName,
        membershipStatus: status,
        creditsRemaining: status === 'cancelled' ? 0 : client.creditsRemaining,
        nextRenewalDate: client.nextRenewalDate,
        updatedAt: serverTimestamp(),
      });
      pushToast(`Membership ${status}`, client.fullName, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const adjustClientCredits = async (clientId: string, delta: number) => {
    const { studioId } = getSharedMeta();
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    const nextCredits = Math.max(0, Math.min(100, client.creditsRemaining + delta));
    const path = `studios/${studioId}/clients/${clientId}`;
    try {
      await updateDoc(doc(db, path), {
        creditsRemaining: nextCredits,
        totalVisits: client.totalVisits,
        lifetimeSpend: client.lifetimeSpend,
        updatedAt: serverTimestamp(),
      });
      pushToast('Credits updated', `${client.fullName}: ${nextCredits} remaining`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const renewClientMembership = async (clientId: string) => {
    const { studioId, ownerId, memberUids } = getSharedMeta();
    const client = clients.find((c) => c.id === clientId);
    const tier = membershipTiers.find((t) => t.id === client?.membershipTierId);
    if (!client || !tier) return;

    const newCredits = Math.min(100, client.creditsRemaining + tier.creditsPerMonth);
    const nextRenewal = formatLocalDate(30);
    const path = `studios/${studioId}/clients/${clientId}`;
    try {
      await updateDoc(doc(db, path), {
        membershipTierId: tier.id,
        membershipTierName: tier.name,
        membershipStatus: 'active',
        creditsRemaining: newCredits,
        nextRenewalDate: nextRenewal,
        updatedAt: serverTimestamp(),
      });

      const renewalRule = notificationRules.find((r) => r.eventKey === 'membership_renewed' && r.enabled);
      if (renewalRule) {
        const vars = {
          clientName: client.fullName,
          tierName: tier.name,
          creditsRemaining: String(newCredits),
          studioName: studio?.name ?? 'SUN & MOON Hotel, WELL SPA',
        };
        const logId = makeId('log');
        const logPath = `studios/${studioId}/notificationLogs/${logId}`;
        const channel: NotificationChannel = client.email ? 'Email' : 'SMS';
        await setDoc(doc(db, logPath), {
          ownerId,
          memberUids,
          ruleId: renewalRule.id,
          eventKey: 'membership_renewed',
          appointmentId: '',
          clientId: client.id,
          clientName: client.fullName,
          recipientContact: (channel === 'Email' ? client.email : client.phone) || 'On file',
          channel,
          subject: renderNotificationTemplate(renewalRule.subjectTemplate, vars).slice(0, 200),
          messageBody: renderNotificationTemplate(renewalRule.bodyTemplate, vars).slice(0, 900),
          status: 'sent',
          scheduledFor: formatLocalDate(0),
          sentAtLabel: nowTimeLabel(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, `studios/${studioId}/notificationRules/${renewalRule.id}`), {
          sentCount: renewalRule.sentCount + 1,
          updatedAt: serverTimestamp(),
        });
      }

      pushToast('Membership renewed', `${client.fullName} granted +${tier.creditsPerMonth} credit(s)`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const toggleNotificationRule = async (ruleId: string, enabled: boolean) => {
    const { studioId } = getSharedMeta();
    const path = `studios/${studioId}/notificationRules/${ruleId}`;
    try {
      await updateDoc(doc(db, path), {
        enabled,
        updatedAt: serverTimestamp(),
      });
      pushToast(enabled ? 'Automation enabled' : 'Automation paused', undefined, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
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
    const { studioId } = getSharedMeta();
    const path = `studios/${studioId}/notificationRules/${ruleId}`;
    try {
      await updateDoc(doc(db, path), {
        channel: updates.channel,
        timingLabel: updates.timingLabel.trim().slice(0, 80),
        enabled: updates.enabled,
        subjectTemplate: updates.subjectTemplate.trim().slice(0, 200),
        bodyTemplate: updates.bodyTemplate.trim().slice(0, 800),
        updatedAt: serverTimestamp(),
      });
      pushToast('Notification template saved');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const dispatchScheduledNotification = async (logId: string) => {
    const { studioId } = getSharedMeta();
    const logItem = notificationLogs.find((l) => l.id === logId);
    if (!logItem || logItem.status !== 'scheduled') return;
    const path = `studios/${studioId}/notificationLogs/${logId}`;
    try {
      await updateDoc(doc(db, path), {
        status: 'sent',
        sentAtLabel: nowTimeLabel(),
        updatedAt: serverTimestamp(),
      });
      const rule = notificationRules.find((r) => r.id === logItem.ruleId);
      if (rule) {
        await updateDoc(doc(db, `studios/${studioId}/notificationRules/${rule.id}`), {
          sentCount: rule.sentCount + 1,
          updatedAt: serverTimestamp(),
        });
      }
      pushToast('Notification dispatched', `${logItem.channel} sent to ${logItem.clientName}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const dispatchAllPendingNotifications = async (): Promise<number> => {
    const { studioId } = getSharedMeta();
    const pending = notificationLogs.filter((l) => l.status === 'scheduled');
    if (pending.length === 0) {
      pushToast('No pending notifications', 'All scheduled client alerts are up to date.', 'info');
      return 0;
    }

    const batch = writeBatch(db);
    const ruleIncrements: Record<string, number> = {};
    const label = nowTimeLabel();
    for (const item of pending) {
      batch.update(doc(db, `studios/${studioId}/notificationLogs/${item.id}`), {
        status: 'sent',
        sentAtLabel: label,
        updatedAt: serverTimestamp(),
      });
      ruleIncrements[item.ruleId] = (ruleIncrements[item.ruleId] ?? 0) + 1;
    }

    for (const [ruleId, delta] of Object.entries(ruleIncrements)) {
      const rule = notificationRules.find((r) => r.id === ruleId);
      if (rule) {
        batch.update(doc(db, `studios/${studioId}/notificationRules/${ruleId}`), {
          sentCount: rule.sentCount + delta,
          updatedAt: serverTimestamp(),
        });
      }
    }

    try {
      await batch.commit();
      pushToast(`Dispatched ${pending.length} reminder${pending.length === 1 ? '' : 's'}`, 'Delivery logs updated');
      return pending.length;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `studios/${studioId}/notificationLogs`);
    }
  };

  const sendManualNotification = async (params: {
    clientId: string;
    channel: NotificationChannel;
    subject: string;
    messageBody: string;
    appointmentId?: string;
  }) => {
    const { studioId, ownerId, memberUids } = getSharedMeta();
    const client = clients.find((c) => c.id === params.clientId);
    if (!client) return;
    const logId = makeId('log');
    const path = `studios/${studioId}/notificationLogs/${logId}`;
    try {
      await setDoc(doc(db, path), {
        ownerId,
        memberUids,
        ruleId: 'manual_dispatch',
        eventKey: 'manual_notice',
        appointmentId: params.appointmentId ?? '',
        clientId: client.id,
        clientName: client.fullName,
        recipientContact: (params.channel === 'SMS' ? client.phone : client.email) || 'On file',
        channel: params.channel,
        subject: params.subject.trim().slice(0, 200),
        messageBody: params.messageBody.trim().slice(0, 900),
        status: 'sent',
        scheduledFor: formatLocalDate(0),
        sentAtLabel: nowTimeLabel(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast('Message sent', `${params.channel} delivered to ${client.fullName}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const createService = async (input: CreateServiceInput) => {
    const { studioId, ownerId, memberUids } = getSharedMeta();
    const id = makeId('svc');
    const path = `studios/${studioId}/services/${id}`;
    try {
      await setDoc(doc(db, path), {
        ownerId,
        memberUids,
        name: input.name.trim().slice(0, 120),
        category: input.category,
        durationMinutes: input.durationMinutes,
        bufferMinutes: input.bufferMinutes,
        price: input.price,
        roomType: input.roomType.trim().slice(0, 80),
        description: input.description.trim().slice(0, 500),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      pushToast('Treatment added', `${input.name} · ${input.durationMinutes} min`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const toggleServiceActive = async (serviceId: string, active: boolean) => {
    const { studioId } = getSharedMeta();
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    const path = `studios/${studioId}/services/${serviceId}`;
    try {
      await updateDoc(doc(db, path), {
        name: svc.name,
        category: svc.category,
        durationMinutes: svc.durationMinutes,
        bufferMinutes: svc.bufferMinutes,
        price: svc.price,
        roomType: svc.roomType,
        description: svc.description,
        active,
        updatedAt: serverTimestamp(),
      });
      pushToast(active ? 'Service published' : 'Service archived', svc.name, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  return (
    <StudioContext.Provider
      value={{
        user,
        pendingVerificationUser,
        authReady,
        isPrimaryAdmin,
        authError,
        clearAuthError,
        sessionExpiresAt,
        authorizedUsers,
        loadingData,
        seeding,
        studio,
        services,
        staff,
        membershipTiers,
        clients,
        appointments,
        notificationRules,
        notificationLogs,
        toasts,
        dismissToast,
        pushToast,
        signInWithCredentials,
        activatePrimaryAdmin,
        sendPasswordReset,
        resendVerificationEmail,
        refreshVerificationStatus,
        signOutUser,
        createAuthorizedUser,
        toggleAuthorizedUserActive,
        deleteAuthorizedUser,
        createAppointment,
        updateAppointmentStatus,
        rescheduleAppointment,
        toggleStaffDuty,
        updateStaffSchedule,
        createStaffMember,
        createMembershipTier,
        updateMembershipTier,
        createClient,
        assignClientMembership,
        updateClientMembershipStatus,
        adjustClientCredits,
        renewClientMembership,
        toggleNotificationRule,
        updateNotificationRule,
        dispatchScheduledNotification,
        dispatchAllPendingNotifications,
        sendManualNotification,
        createService,
        toggleServiceActive,
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
