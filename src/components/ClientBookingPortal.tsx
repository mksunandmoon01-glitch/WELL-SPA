import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Sparkles,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import {
  SPA_BANNER_IMAGE,
  VENUE_DEFAULTS,
  formatCurrency,
  formatLocalDate,
  getAvailableTimeSlots,
} from '../lib/seedStudio';
import type {
  Appointment,
  AppointmentStatus,
  ClientSessionProfile,
  MembershipStatus,
  NotificationLog,
  SpaRoom,
  SpaService,
  StaffMember,
} from '../types/spa';
import { TherapistAvatar } from './TherapistAvatar';
import { VenueLocationCard } from './VenueLocationCard';

interface ClientBookingPortalProps {
  publicMode?: boolean;
  onBackToSignIn?: () => void;
}

type PortalSection = 'book' | 'bookings' | 'notifications';

const STATUS_STYLES: Record<AppointmentStatus, { label: string; classes: string }> = {
  confirmed: { label: 'Confirmed', classes: 'bg-teal-50 text-teal-800 border-teal-200' },
  checked_in: { label: 'Checked In', classes: 'bg-sky-50 text-sky-800 border-sky-200' },
  in_progress: { label: 'In Session', classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  completed: { label: 'Completed', classes: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelled', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
  no_show: { label: 'No Show', classes: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const MEMBER_STATUS_META: Record<MembershipStatus, { label: string; classes: string }> = {
  active: { label: 'Active', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  paused: { label: 'Paused', classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  cancelled: { label: 'Cancelled', classes: 'bg-rose-50 text-rose-700 border-rose-200' },
  none: { label: 'Pay-As-You-Go', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function formatAptBillingLabel(apt: Appointment): string {
  const creditsUsed =
    typeof apt.creditsUsed === 'number'
      ? apt.creditsUsed
      : apt.usedMembershipCredit
        ? apt.price
        : 0;
  const amountPaid =
    typeof apt.amountPaid === 'number' ? apt.amountPaid : Math.max(0, apt.price - creditsUsed);
  if (creditsUsed > 0 && amountPaid > 0) {
    return `${creditsUsed} credits (-${formatCurrency(creditsUsed)}) · ${formatCurrency(amountPaid)} due`;
  }
  if (creditsUsed > 0) {
    return `${creditsUsed} credit${creditsUsed === 1 ? '' : 's'} ($0 due)`;
  }
  return formatCurrency(apt.price);
}

export function ClientBookingPortal({
  publicMode = false,
  onBackToSignIn,
}: ClientBookingPortalProps) {
  const studioCtx = useStudio();
  const {
    clientUser,
    clientAppointments,
    clientNotifications,
    signUpClientAccount,
    signOutClient,
    refreshClientPortalData,
    applyClientPortalPayload,
    cancelClientAppointment,
  } = studioCtx;

  const [portalSection, setPortalSection] = useState<PortalSection>(() =>
    publicMode && clientUser ? 'bookings' : 'book',
  );

  // Public catalog state when accessed without staff login
  const [publicLoading, setPublicLoading] = useState(publicMode);
  const [publicStudio, setPublicStudio] = useState<{
    name: string;
    venueName?: string;
    tagline: string;
    address: string;
    phone: string;
    contactEmail?: string;
    telegramContacts?: string;
    telegramChannel?: string;
  } | null>(null);
  const [publicServices, setPublicServices] = useState<SpaService[]>([]);
  const [publicStaff, setPublicStaff] = useState<StaffMember[]>([]);
  const [publicRooms, setPublicRooms] = useState<SpaRoom[]>([]);
  const [publicBookedSlots, setPublicBookedSlots] = useState<Appointment[]>([]);

  const loadPublicCatalog = async () => {
    setPublicLoading(true);
    try {
      const res = await fetch('/api/public/booking-catalog');
      if (!res.ok) return;
      const data = (await res.json()) as {
        studio: {
          name: string;
          venueName?: string;
          tagline: string;
          address: string;
          phone: string;
          contactEmail?: string;
          telegramContacts?: string;
          telegramChannel?: string;
        };
        services: SpaService[];
        staff: StaffMember[];
        rooms: SpaRoom[];
        bookedSlots: Array<{
          id: string;
          staffId: string;
          date: string;
          startTime: string;
          durationMinutes: number;
          status: Appointment['status'];
        }>;
      };
      setPublicStudio(data.studio);
      setPublicServices(data.services ?? []);
      setPublicStaff(data.staff ?? []);
      setPublicRooms(data.rooms ?? []);
      setPublicBookedSlots(
        (data.bookedSlots ?? []).map((slot) => ({
          id: slot.id,
          ownerId: '',
          memberUids: [],
          clientId: '',
          clientName: '',
          clientEmail: '',
          clientPhone: '',
          serviceId: '',
          serviceName: '',
          staffId: slot.staffId,
          staffName: '',
          roomName: '',
          date: slot.date,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
          price: 0,
          usedMembershipCredit: false,
          status: slot.status,
          notes: '',
          confirmationSent: true,
          reminderSent: false,
        })),
      );
    } finally {
      setPublicLoading(false);
    }
  };

  useEffect(() => {
    if (!publicMode) return;
    loadPublicCatalog();
  }, [publicMode]);

  useEffect(() => {
    if (publicMode && clientUser) {
      refreshClientPortalData();
    }
  }, [publicMode, clientUser?.id, refreshClientPortalData]);

  const studio = publicMode ? publicStudio : studioCtx.studio;
  const activeRooms = useMemo(
    () => (publicMode ? publicRooms : studioCtx.rooms).filter((r) => r.active),
    [publicMode, publicRooms, studioCtx.rooms],
  );
  const activeServices = useMemo(
    () => (publicMode ? publicServices : studioCtx.services).filter((s) => s.active),
    [publicMode, publicServices, studioCtx.services],
  );
  const dutyStaff = useMemo(
    () => (publicMode ? publicStaff : studioCtx.staff).filter((s) => s.onDuty),
    [publicMode, publicStaff, studioCtx.staff],
  );
  const appointments = publicMode ? publicBookedSlots : studioCtx.appointments;

  const [bannerFailed, setBannerFailed] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedRoomName, setSelectedRoomName] = useState('');
  const [date, setDate] = useState(formatLocalDate(0));
  const [selectedTime, setSelectedTime] = useState('');

  // Staff-preview active client state (when publicMode = false)
  const [staffPreviewClient, setStaffPreviewClient] = useState<ClientSessionProfile | null>(null);

  // New Client Sign Up form state (Full Name, Email Address, Phone Number, Password)
  const [signupFullName, setSignupFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [accountError, setAccountError] = useState('');
  const [accountSuccessMsg, setAccountSuccessMsg] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);

  const [useCredit, setUseCredit] = useState(true);
  const [creditsToDeduct, setCreditsToDeduct] = useState(0);
  const [notes, setNotes] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const [confirmedDetails, setConfirmedDetails] = useState<{
    clientName: string;
    clientEmail: string;
    serviceName: string;
    therapistName: string;
    date: string;
    startTime: string;
    roomName: string;
    creditsUsed: number;
    amountDue: number;
    price: number;
  } | null>(null);

  const effectiveClient: ClientSessionProfile | null = publicMode ? clientUser : staffPreviewClient;

  // Strictly scope bookings and notifications to the signed-in client only
  const scopedAppointments: Appointment[] = useMemo(() => {
    if (!effectiveClient) return [];
    if (publicMode) return clientAppointments;
    return studioCtx.appointments.filter((a) => a.clientId === effectiveClient.id);
  }, [effectiveClient, publicMode, clientAppointments, studioCtx.appointments]);

  const currentBookings = useMemo(
    () =>
      scopedAppointments
        .filter(
          (a) =>
            a.status === 'confirmed' || a.status === 'checked_in' || a.status === 'in_progress',
        )
        .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)),
    [scopedAppointments],
  );

  const bookingHistory = useMemo(
    () =>
      scopedAppointments
        .filter(
          (a) => a.status === 'completed' || a.status === 'cancelled' || a.status === 'no_show',
        )
        .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)),
    [scopedAppointments],
  );

  const scopedNotifications: NotificationLog[] = useMemo(() => {
    if (!effectiveClient) return [];
    if (publicMode) return clientNotifications;
    return studioCtx.notificationLogs.filter((l) => l.clientId === effectiveClient.id);
  }, [effectiveClient, publicMode, clientNotifications, studioCtx.notificationLogs]);

  const resolvedService =
    activeServices.find((s) => s.id === selectedServiceId) ?? activeServices[0];
  const resolvedStaff =
    dutyStaff.find((m) => m.id === selectedStaffId) ?? dutyStaff[0];
  const resolvedRoomName =
    selectedRoomName || resolvedStaff?.assignedRoom || activeRooms[0]?.name || 'Unassigned';

  const availableSlots = useMemo(() => {
    if (!resolvedService || !resolvedStaff) return [];
    return getAvailableTimeSlots(
      date,
      resolvedStaff,
      resolvedService.durationMinutes,
      appointments,
    );
  }, [date, resolvedStaff, resolvedService, appointments]);

  const effectiveTime = availableSlots.includes(selectedTime)
    ? selectedTime
    : availableSlots[0] ?? '';

  const canRedeemCredit =
    Boolean(effectiveClient) && (effectiveClient?.creditsRemaining ?? 0) > 0;
  const servicePrice = resolvedService?.price ?? 0;
  const maxDeductibleCredits = canRedeemCredit
    ? Math.min(effectiveClient?.creditsRemaining ?? 0, servicePrice)
    : 0;

  useEffect(() => {
    if (canRedeemCredit && maxDeductibleCredits > 0) {
      setUseCredit(true);
      setCreditsToDeduct(maxDeductibleCredits);
    } else {
      setUseCredit(false);
      setCreditsToDeduct(0);
    }
  }, [canRedeemCredit, maxDeductibleCredits, effectiveClient?.id]);

  const appliedCredits =
    canRedeemCredit && useCredit && maxDeductibleCredits > 0
      ? Math.max(0, Math.min(Math.floor(creditsToDeduct || 0), maxDeductibleCredits))
      : 0;
  const amountDueToday = Math.max(0, servicePrice - appliedCredits);

  const handleClientSignUp = async () => {
    setAccountError('');
    setAccountSuccessMsg('');
    const fName = signupFullName.trim();
    const fEmail = signupEmail.trim();
    const fPhone = signupPhone.trim();

    if (!fName || !fEmail || !fPhone) {
      setAccountError('Full Name, Email Address, and Phone Number are required to sign up.');
      return;
    }
    if (signupPassword.length < 6) {
      setAccountError('Password must be at least 6 characters.');
      return;
    }

    setAccountBusy(true);
    try {
      if (!publicMode) {
        const existing = studioCtx.clients.find(
          (c) => c.email.trim().toLowerCase() === fEmail.toLowerCase(),
        );
        if (existing) {
          setAccountError('A client with this email already exists.');
          return;
        }
        const newId = await studioCtx.createClient({
          fullName: fName,
          email: fEmail,
          phone: fPhone,
          password: signupPassword,
          notes: 'Registered via Client Booking Portal.',
          preferredTherapistId: resolvedStaff?.id ?? '',
          membershipTierId: '',
          smsOptIn: true,
          emailOptIn: true,
        });
        setStaffPreviewClient({
          id: newId,
          fullName: fName,
          email: fEmail,
          phone: fPhone,
          membershipTierId: '',
          membershipTierName: 'No Membership',
          membershipStatus: 'none',
          creditsRemaining: 0,
          nextRenewalDate: '',
          totalVisits: 0,
          lifetimeSpend: 0,
        });
        setSignupPassword('');
        setAccountSuccessMsg(`Account created for ${fName}.`);
        return;
      }

      const result = await signUpClientAccount({
        fullName: fName,
        email: fEmail,
        phone: fPhone,
        password: signupPassword,
      });
      if (!result.ok || !result.client) {
        setAccountError(result.error || 'Unable to create client account.');
        return;
      }
      setSignupPassword('');
      setAccountSuccessMsg(`Account created for ${result.client.fullName}.`);
    } finally {
      setAccountBusy(false);
    }
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');
    if (!resolvedService || !resolvedStaff || !effectiveTime) {
      setBookingError('Please select a treatment, therapist, date, and available time slot.');
      return;
    }

    const cName = effectiveClient?.fullName ?? signupFullName.trim();
    const cEmail = effectiveClient?.email ?? signupEmail.trim();
    const cPhone = effectiveClient?.phone ?? signupPhone.trim();

    if (!effectiveClient) {
      if (!cName || !cEmail || !cPhone) {
        setBookingError(
          'Please enter your Full Name, Email Address, Phone Number, and Password to sign up and book.',
        );
        return;
      }
      if (signupPassword.length < 6) {
        setBookingError('Please enter a password of at least 6 characters for your new account.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (publicMode) {
        const clientToken = localStorage.getItem('wellspa_client_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (clientToken) {
          headers['x-client-token'] = clientToken;
        }
        const res = await fetch('/api/public/appointments', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            clientName: cName,
            clientEmail: cEmail,
            clientPhone: cPhone,
            clientPassword: effectiveClient ? undefined : signupPassword,
            serviceId: resolvedService.id,
            staffId: resolvedStaff.id,
            roomName: resolvedRoomName,
            date,
            startTime: effectiveTime,
            useMembershipCredit: appliedCredits > 0,
            creditsToDeduct: appliedCredits,
            notes,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          clientToken?: string;
          client?: ClientSessionProfile;
          appointments?: Appointment[];
          notificationLogs?: NotificationLog[];
        };
        if (!res.ok) {
          setBookingError(data.error || 'Unable to confirm booking.');
          return;
        }
        applyClientPortalPayload(data);
        setSignupPassword('');
        await loadPublicCatalog();
      } else {
        let clientId = effectiveClient?.id;
        if (!clientId) {
          const existing = studioCtx.clients.find(
            (c) => c.email.trim().toLowerCase() === cEmail.toLowerCase(),
          );
          if (existing) {
            setBookingError('A client with this email already exists.');
            return;
          }
          clientId = await studioCtx.createClient({
            fullName: cName,
            email: cEmail,
            phone: cPhone,
            password: signupPassword,
            notes: 'Registered via Client Booking Portal.',
            preferredTherapistId: resolvedStaff.id,
            membershipTierId: '',
            smsOptIn: true,
            emailOptIn: true,
          });
          setStaffPreviewClient({
            id: clientId,
            fullName: cName,
            email: cEmail,
            phone: cPhone,
            membershipTierId: '',
            membershipTierName: 'No Membership',
            membershipStatus: 'none',
            creditsRemaining: 0,
            nextRenewalDate: '',
            totalVisits: 0,
            lifetimeSpend: 0,
          });
        }
        await studioCtx.createAppointment({
          clientId,
          clientName: cName,
          clientEmail: cEmail,
          clientPhone: cPhone,
          serviceId: resolvedService.id,
          staffId: resolvedStaff.id,
          roomName: resolvedRoomName,
          date,
          startTime: effectiveTime,
          useMembershipCredit: appliedCredits > 0,
          creditsToDeduct: appliedCredits,
          notes,
        });
      }

      setConfirmedDetails({
        clientName: cName,
        clientEmail: cEmail,
        serviceName: resolvedService.name,
        therapistName: resolvedStaff.name,
        date,
        startTime: effectiveTime,
        roomName: resolvedRoomName,
        creditsUsed: appliedCredits,
        amountDue: amountDueToday,
        price: resolvedService.price,
      });
      setNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async (appointmentId: string) => {
    setCancellingId(appointmentId);
    try {
      await cancelClientAppointment(appointmentId);
      await loadPublicCatalog();
      setConfirmCancelId(null);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className={publicMode ? 'min-h-screen bg-slate-50 text-slate-900 flex flex-col' : ''}>
      {publicMode && (
        <header className="w-full border-b border-slate-200 bg-white">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              {studio?.name ?? 'WELL SPA'}
            </span>
            <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
              {effectiveClient ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPortalSection('book');
                      setConfirmedDetails(null);
                    }}
                    className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      portalSection === 'book'
                        ? 'text-slate-900 font-semibold'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    Book Treatment
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortalSection('bookings')}
                    className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      portalSection === 'bookings'
                        ? 'text-slate-900 font-semibold'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    My Bookings ({scopedAppointments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPortalSection('notifications')}
                    className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      portalSection === 'notifications'
                        ? 'text-slate-900 font-semibold'
                        : 'hover:text-slate-900'
                    }`}
                  >
                    My Notifications ({scopedNotifications.length})
                  </button>
                </>
              ) : (
                <>
                  <a
                    href="#booking-treatments"
                    className="hidden md:inline hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                  >
                    Memberships
                  </a>
                  <a
                    href="#booking-account"
                    className="hidden md:inline hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                  >
                    Notifications
                  </a>
                  <span className="text-slate-900 whitespace-nowrap shrink-0">
                    Client Booking Portal
                  </span>
                </>
              )}
            </nav>
            {clientUser ? (
              <div className="flex items-center gap-3 shrink-0">
                <span className="hidden sm:inline text-xs font-medium text-slate-700 truncate max-w-[160px]">
                  {clientUser.fullName}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await signOutClient();
                    setConfirmedDetails(null);
                    setPortalSection('book');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              onBackToSignIn && (
                <button
                  type="button"
                  onClick={onBackToSignIn}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Sign In
                </button>
              )
            )}
          </div>
        </header>
      )}

      <div
        className={`space-y-6 mx-auto w-full ${
          publicMode ? 'flex-1 max-w-7xl px-6 py-8 lg:py-10' : 'max-w-6xl'
        }`}
      >
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-7 p-6 lg:p-8 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-teal-700">
                {studio?.venueName || VENUE_DEFAULTS.venueName} · Client Online Booking Portal
              </p>
              <h2 className="font-display text-2xl font-bold text-slate-900 [text-wrap:balance]">
                {studio?.name ?? VENUE_DEFAULTS.name}
              </h2>
              <p className="text-sm text-slate-600">
                {studio?.tagline ?? VENUE_DEFAULTS.tagline}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600 pt-3 border-t border-slate-100">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                {studio?.address || VENUE_DEFAULTS.address}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                <Phone className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                {studio?.phone || VENUE_DEFAULTS.phone}
              </span>
              <a
                href={`mailto:${studio?.contactEmail || VENUE_DEFAULTS.contactEmail}`}
                className="inline-flex items-center gap-1.5 text-teal-800 hover:underline"
              >
                <Mail className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                {studio?.contactEmail || VENUE_DEFAULTS.contactEmail}
              </a>
              <span className="inline-flex items-center gap-1.5 font-mono">
                <MessageCircle className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                {(() => {
                  const raw = studio?.telegramContacts || VENUE_DEFAULTS.telegramContacts;
                  const handles = raw
                    .split(/[&,/\s]+/)
                    .map((part) => part.trim())
                    .filter((part) => part.startsWith('@') && part.length > 1);
                  if (handles.length === 0) return raw;
                  return handles.map((handle, index) => (
                    <React.Fragment key={handle}>
                      {index > 0 && <span className="text-slate-400">&amp;</span>}
                      <a
                        href={`https://t.me/${handle.slice(1)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-800 hover:underline"
                      >
                        {handle}
                      </a>
                    </React.Fragment>
                  ));
                })()}
              </span>
              <a
                href={`https://${(studio?.telegramChannel || VENUE_DEFAULTS.telegramChannel).replace(/^https?:\/\//i, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-teal-800 hover:underline"
              >
                <Send className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                {studio?.telegramChannel || VENUE_DEFAULTS.telegramChannel}
              </a>
            </div>
          </div>
          <div className="lg:col-span-5 min-h-[180px] bg-slate-100">
            {!bannerFailed ? (
              <img
                src={SPA_BANNER_IMAGE}
                alt="WELL SPA suite interior"
                referrerPolicy="no-referrer"
                onError={() => setBannerFailed(true)}
                className="w-full h-full object-cover lg:h-full"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-200 to-teal-50 flex items-center justify-center p-6 text-xs text-slate-600">
                Treatment Sanctuary
              </div>
            )}
          </div>
        </section>

        {effectiveClient && (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4 text-teal-700" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {effectiveClient.fullName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {effectiveClient.email} · <span className="font-mono">{effectiveClient.phone}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPortalSection('book');
                    setConfirmedDetails(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    portalSection === 'book'
                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Book Treatment</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPortalSection('bookings')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    portalSection === 'bookings'
                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span>My Bookings ({scopedAppointments.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPortalSection('notifications')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    portalSection === 'notifications'
                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>My Notifications ({scopedNotifications.length})</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-slate-50/50">
              <div className="px-5 py-3.5">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  Membership Plan
                </p>
                <p className="text-sm font-semibold text-slate-900 mt-1 truncate">
                  {effectiveClient.membershipTierName}
                </p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  Status
                </p>
                <div className="mt-1">
                  <span
                    className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-md border ${MEMBER_STATUS_META[effectiveClient.membershipStatus].classes}`}
                  >
                    {MEMBER_STATUS_META[effectiveClient.membershipStatus].label}
                  </span>
                </div>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  Credits ($1 ea · No Expiry)
                </p>
                <p className="font-mono text-sm font-semibold text-teal-800 tabular-nums mt-1">
                  {effectiveClient.creditsRemaining} credits ({formatCurrency(effectiveClient.creditsRemaining)})
                </p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  Next Renewal
                </p>
                <p className="font-mono text-sm font-medium text-slate-900 tabular-nums mt-1">
                  {effectiveClient.nextRenewalDate || '—'}
                </p>
              </div>
              <div className="px-5 py-3.5">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                  Visits · Spend
                </p>
                <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums mt-1">
                  {effectiveClient.totalVisits} visits · {formatCurrency(effectiveClient.lifetimeSpend)}
                </p>
              </div>
            </div>
          </section>
        )}

        {publicLoading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
            Loading treatments, therapists, and open times...
          </div>
        ) : effectiveClient && portalSection === 'bookings' ? (
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Current Bookings
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Your upcoming and active spa sessions
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPortalSection('book');
                    setConfirmedDetails(null);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                >
                  Book New Session
                </button>
              </div>
              {currentBookings.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    You have no current or upcoming bookings.
                  </p>
                  <button
                    type="button"
                    onClick={() => setPortalSection('book')}
                    className="px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
                  >
                    Schedule a Treatment
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {currentBookings.map((apt) => {
                    const badge = STATUS_STYLES[apt.status];
                    return (
                      <div
                        key={apt.id}
                        className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="font-semibold text-sm text-slate-900">
                              {apt.serviceName}
                            </span>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-md border ${badge.classes}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Therapist: <strong>{apt.staffName}</strong> · Suite:{' '}
                            <strong>{apt.roomName}</strong> ·{' '}
                            <span className="font-mono tabular-nums">{apt.durationMinutes} min</span>
                          </p>
                          {apt.notes && (
                            <p className="text-xs text-slate-500">Notes: {apt.notes}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 shrink-0">
                          <div className="text-left md:text-right">
                            <p className="text-xs font-mono font-semibold text-slate-900 tabular-nums inline-flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              {apt.date} at {apt.startTime}
                            </p>
                            <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                              {formatAptBillingLabel(apt)}
                            </p>
                          </div>
                          {publicMode && apt.status === 'confirmed' && (
                            confirmCancelId === apt.id ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={cancellingId === apt.id}
                                  onClick={() => handleCancelBooking(apt.id)}
                                  className="px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer disabled:opacity-50"
                                >
                                  {cancellingId === apt.id ? 'Cancelling...' : 'Confirm Cancel'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmCancelId(null)}
                                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                                >
                                  Keep
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmCancelId(apt.id)}
                                className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer"
                              >
                                Cancel Booking
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Booking History
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Completed and past appointments on your account
                </p>
              </div>
              {bookingHistory.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No past bookings recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {bookingHistory.map((apt) => {
                    const badge = STATUS_STYLES[apt.status];
                    return (
                      <div
                        key={apt.id}
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="font-medium text-sm text-slate-900">
                              {apt.serviceName}
                            </span>
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-md border ${badge.classes}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Therapist: {apt.staffName} · Suite: {apt.roomName} ·{' '}
                            <span className="font-mono tabular-nums">{apt.durationMinutes} min</span>
                          </p>
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                          <p className="text-xs font-mono text-slate-700 tabular-nums">
                            {apt.date} at {apt.startTime}
                          </p>
                          <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                            {formatAptBillingLabel(apt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        ) : effectiveClient && portalSection === 'notifications' ? (
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  My Notifications
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirmations, reminders, and updates sent exclusively to{' '}
                  <strong>{effectiveClient.email}</strong>
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {scopedNotifications.length} message(s)
              </span>
            </div>
            {scopedNotifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                You have no notifications yet. Booking confirmations and reminders will appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {scopedNotifications.map((log) => (
                  <div key={log.id} className="p-5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {log.subject}
                        </span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700">
                          {log.channel}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-md border ${
                            log.status === 'sent'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : log.status === 'scheduled'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {log.status === 'sent'
                            ? 'Sent'
                            : log.status === 'scheduled'
                              ? 'Scheduled'
                              : 'Failed'}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        {log.sentAtLabel} · {log.scheduledFor}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{log.messageBody}</p>
                    <p className="text-xs text-slate-400 font-mono">
                      Recipient: {log.recipientContact}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : confirmedDetails ? (
          <section className="bg-white border border-slate-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-5">
            <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto" />
            <div className="space-y-1">
              <h3 className="font-display text-xl font-semibold text-slate-900">
                Booking Confirmed
              </h3>
              <p className="text-sm text-slate-600">
                Your session has been added to our schedule and a confirmation has been queued for{' '}
                <strong>{confirmedDetails.clientEmail}</strong>.
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Client</span>
                <span className="font-medium text-slate-900">{confirmedDetails.clientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Treatment</span>
                <span className="font-medium text-slate-900">{confirmedDetails.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Therapist</span>
                <span className="font-medium text-slate-900">{confirmedDetails.therapistName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Room / Suite</span>
                <span className="font-medium text-slate-900">{confirmedDetails.roomName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date &amp; Time</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {confirmedDetails.date} at {confirmedDetails.startTime}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {confirmedDetails.creditsUsed > 0 && confirmedDetails.amountDue > 0
                    ? `${formatCurrency(confirmedDetails.amountDue)} due (${confirmedDetails.creditsUsed} credits = -${formatCurrency(confirmedDetails.creditsUsed)})`
                    : confirmedDetails.creditsUsed > 0
                      ? `${confirmedDetails.creditsUsed} credits ($0 due)`
                      : formatCurrency(confirmedDetails.price)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {effectiveClient && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedDetails(null);
                    setPortalSection('bookings');
                  }}
                  className="px-5 py-2.5 text-sm font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer"
                >
                  View My Bookings &amp; Notifications
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmedDetails(null)}
                className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
              >
                Book Another Session
              </button>
            </div>
          </section>
        ) : (
          <form onSubmit={handleBook} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-6">
              {/* Step 01: Choose Treatment */}
              <div
                id="booking-treatments"
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <h3 className="font-display text-base font-semibold text-slate-900">
                  01. Choose Treatment
                </h3>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {activeServices.map((svc) => {
                    const selected = resolvedService?.id === svc.id;
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => setSelectedServiceId(svc.id)}
                        className={`w-full text-left p-4 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                          selected ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-slate-900">{svc.name}</span>
                            <span className="text-xs text-slate-500">
                              · {svc.category} ·{' '}
                              <span className="font-mono tabular-nums">{svc.durationMinutes} min</span>
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {svc.description}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums shrink-0">
                          {formatCurrency(svc.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 02: Select Therapist */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  02. Select Therapist
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {dutyStaff.map((member) => {
                    const selected = resolvedStaff?.id === member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => {
                          setSelectedStaffId(member.id);
                          setSelectedRoomName(member.assignedRoom || '');
                        }}
                        className={`p-3.5 rounded-lg border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                          selected
                            ? 'border-teal-700 bg-teal-50/50'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <TherapistAvatar
                          name={member.name}
                          src={member.avatarUrl}
                          sizeClass="w-10 h-10"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {member.name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{member.specialty}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 03: Date & Available Time */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    03. Schedule Date &amp; Available Time
                  </h3>
                  <input
                    type="date"
                    value={date}
                    min={formatLocalDate(0)}
                    onChange={(e) => setDate(e.target.value)}
                    className="px-3 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>

                {availableSlots.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">
                    No open slots remain for {resolvedStaff?.name} on {date}. Choose another date or therapist.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {availableSlots.map((slot) => {
                      const active = effectiveTime === slot;
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedTime(slot)}
                          className={`py-2 text-xs font-mono tabular-nums rounded-lg border transition-colors cursor-pointer ${
                            active
                              ? 'bg-teal-700 text-white border-teal-700 font-semibold'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Step 04: New Client Sign Up & Checkout */}
            <div
              id="booking-account"
              className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5 sticky top-20"
            >
              <h3 className="font-display text-base font-semibold text-slate-900">
                04. Your Account &amp; Booking
              </h3>

              {effectiveClient ? (
                <div className="p-3.5 rounded-lg border border-teal-200 bg-teal-50/60 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCheck className="w-4 h-4 text-teal-700 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {effectiveClient.fullName}
                        </p>
                        <p className="text-xs text-slate-600 truncate">{effectiveClient.email}</p>
                        <p className="text-xs font-mono text-slate-600">{effectiveClient.phone}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (publicMode) {
                          await signOutClient();
                        } else {
                          setStaffPreviewClient(null);
                        }
                        setAccountSuccessMsg('');
                      }}
                      className="text-xs font-medium text-teal-800 hover:underline shrink-0 cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                  {canRedeemCredit && (
                    <div className="pt-2 border-t border-teal-200/70 space-y-2">
                      <label className="flex items-center justify-between gap-2 text-xs text-slate-800 cursor-pointer">
                        <span>
                          Deduct credits ($1/credit ·{' '}
                          <strong>{effectiveClient.creditsRemaining}</strong> available · No expiry)
                        </span>
                        <input
                          type="checkbox"
                          checked={useCredit}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUseCredit(checked);
                            if (checked) {
                              setCreditsToDeduct(maxDeductibleCredits);
                            }
                          }}
                          className="accent-teal-700 w-4 h-4"
                        />
                      </label>
                      {useCredit && maxDeductibleCredits > 0 && (
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <label htmlFor="portal-credits-deduct" className="text-slate-700">
                            Credits to apply (max {maxDeductibleCredits}):
                          </label>
                          <div className="flex items-center gap-1.5">
                            <input
                              id="portal-credits-deduct"
                              type="number"
                              min={0}
                              max={maxDeductibleCredits}
                              placeholder="0"
                              value={appliedCredits > 0 ? appliedCredits : ''}
                              onChange={(e) =>
                                setCreditsToDeduct(
                                  Math.max(
                                    0,
                                    Math.min(
                                      maxDeductibleCredits,
                                      Math.floor(Number(e.target.value) || 0),
                                    ),
                                  ),
                                )
                              }
                              className="w-20 px-2 py-1 text-right font-mono tabular-nums bg-white border border-teal-300 rounded-md"
                            />
                            <span className="font-mono font-semibold text-teal-800">
                              (-{formatCurrency(appliedCredits)})
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-slate-600">
                    New Client Sign Up
                  </p>

                  {accountError && (
                    <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {accountError}
                    </p>
                  )}
                  {accountSuccessMsg && (
                    <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      {accountSuccessMsg}
                    </p>
                  )}

                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sophia Nguyen"
                        value={signupFullName}
                        onChange={(e) => setSignupFullName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Email Address</label>
                      <input
                        type="email"
                        required
                        placeholder="you@example.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">Phone Number</label>
                      <input
                        type="tel"
                        required
                        placeholder="+855 81 888 580"
                        value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-700">New Password</label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        placeholder="Minimum 6 characters"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={accountBusy}
                      onClick={handleClientSignUp}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{accountBusy ? 'Creating Account...' : 'Sign Up Client Account'}</span>
                    </button>
                  </div>
                </div>
              )}

              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional pressure or aromatherapy preferences"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />

              <div className="border-t border-slate-200 pt-4 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Treatment</span>
                  <span className="font-medium text-slate-900">{resolvedService?.name}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Therapist</span>
                  <span className="font-medium text-slate-900">{resolvedStaff?.name}</span>
                </div>
                <div className="flex justify-between items-center gap-2 text-slate-600">
                  <span>Room / Suite</span>
                  {activeRooms.length > 0 ? (
                    <select
                      value={resolvedRoomName}
                      onChange={(e) => setSelectedRoomName(e.target.value)}
                      aria-label="Select treatment room"
                      className="px-2 py-1 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-md max-w-[180px]"
                    >
                      {activeRooms.map((room) => (
                        <option key={room.id} value={room.name}>
                          {room.name}
                        </option>
                      ))}
                      {!activeRooms.some((r) => r.name === resolvedRoomName) && (
                        <option value={resolvedRoomName}>{resolvedRoomName}</option>
                      )}
                    </select>
                  ) : (
                    <span className="font-medium text-slate-900">{resolvedRoomName}</span>
                  )}
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Time</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {date} · {effectiveTime || 'Unavailable'}
                  </span>
                </div>
                {appliedCredits > 0 && (
                  <div className="flex justify-between text-teal-800">
                    <span>Credits Applied ({appliedCredits} × $1)</span>
                    <span className="font-mono font-medium tabular-nums">
                      -{formatCurrency(appliedCredits)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-slate-900 pt-2 border-t border-slate-100">
                  <span>Due Today</span>
                  <span className="font-mono tabular-nums">
                    {appliedCredits > 0 && amountDueToday === 0
                      ? `$0 (${appliedCredits} credits)`
                      : formatCurrency(amountDueToday)}
                  </span>
                </div>
              </div>

              {bookingError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {bookingError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !effectiveTime}
                className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Confirming...' : 'Complete Booking'}
              </button>
            </div>
          </form>
        )}

        {publicMode && <VenueLocationCard studio={studio} />}
      </div>
    </div>
  );
}
