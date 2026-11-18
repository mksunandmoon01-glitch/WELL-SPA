import type {
  Appointment,
  Client,
  CreditDeduction,
  MembershipTier,
  NotificationLog,
  NotificationRule,
  SpaRoom,
  SpaService,
  StaffMember,
  Studio,
} from '../types/spa';

export const PRIMARY_ADMIN_EMAIL = 'mk.sunandmoon01@gmail.com';
export const SHARED_STUDIO_ID = 'well_spa_main';
export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export function emailToDocKey(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/\./g, '_dot_')
    .replace(/\+/g, '_plus_');
}

export function formatLocalDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDayAbbrev(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()] ?? 'Mon';
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function renderNotificationTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

export function getAvailableTimeSlots(
  date: string,
  staff: StaffMember | undefined,
  durationMinutes: number,
  appointments: Appointment[],
): string[] {
  if (!staff || !staff.onDuty) return [];
  const dayAbbr = getDayAbbrev(date);
  if (!staff.workDays.includes(dayAbbr)) return [];

  const shiftStart = timeToMinutes(staff.shiftStart);
  const shiftEnd = timeToMinutes(staff.shiftEnd);
  const breakStart = staff.breakStart ? timeToMinutes(staff.breakStart) : -1;
  const breakEnd = staff.breakEnd ? timeToMinutes(staff.breakEnd) : -1;

  const busy = appointments
    .filter(
      (a) =>
        a.date === date &&
        a.staffId === staff.id &&
        a.status !== 'cancelled' &&
        a.status !== 'no_show',
    )
    .map((a) => ({
      start: timeToMinutes(a.startTime),
      end: timeToMinutes(a.startTime) + a.durationMinutes + 15,
    }));

  const slots: string[] = [];
  for (let t = shiftStart; t + durationMinutes <= shiftEnd; t += 30) {
    const slotEnd = t + durationMinutes;
    const overlapsBreak =
      breakStart >= 0 && breakEnd > breakStart && t < breakEnd && slotEnd > breakStart;
    const overlapsAppt = busy.some((b) => t < b.end && slotEnd > b.start);
    if (!overlapsBreak && !overlapsAppt) {
      slots.push(minutesToTime(t));
    }
  }
  return slots;
}

export const THERAPIST_AVATARS = {
  elena: '/src/assets/images/therapist_elena_1794564619448.jpg',
  marcus: '/src/assets/images/therapist_marcus_1794564620532.jpg',
  sora: '/src/assets/images/therapist_sora_1794564619952.jpg',
  julian: '/src/assets/images/therapist_julian_1794564620600.jpg',
};

export const SPA_BANNER_IMAGE = '/src/assets/images/spa_sanctuary_banner_1794564620734.jpg';

export const SIMULATION_RECORD_IDS: Record<string, string[]> = {
  services: [
    'svc_swedish_60',
    'svc_deep_75',
    'svc_hotstone_90',
    'svc_facial_60',
    'svc_scrub_60',
    'svc_thermal_45',
  ],
  rooms: ['room_cedar', 'room_travertine', 'room_botanical', 'room_thermal'],
  staff: ['stf_elena', 'stf_marcus', 'stf_sora', 'stf_julian'],
  membershipTiers: ['tier_essential', 'tier_restorative', 'tier_unlimited'],
  clients: ['cli_claire', 'cli_devon', 'cli_naomi', 'cli_lucas', 'cli_hannah', 'cli_omar'],
  appointments: [
    'apt_101',
    'apt_102',
    'apt_103',
    'apt_104',
    'apt_105',
    'apt_106',
    'apt_107',
    'apt_108',
    'apt_hist_1',
    'apt_hist_2',
    'apt_hist_3',
    'apt_hist_4',
    'apt_hist_5',
    'apt_hist_6',
    'apt_hist_7',
    'apt_hist_8',
    'apt_hist_9',
    'apt_hist_10',
    'apt_hist_11',
  ],
  notificationLogs: ['log_01', 'log_02', 'log_03', 'log_04', 'log_05', 'log_06'],
};

export const VENUE_DEFAULTS = {
  name: 'WELL SPA',
  venueName: 'SUN & MOON, Riverside Hotel',
  tagline: 'Restorative bodywork, botanical facials, and thermal recovery',
  timezone: 'Asia/Phnom_Penh',
  currency: 'USD',
  address:
    'Waterfront, Norodom Blvd. (Near Phreak Monivong Bridge), Village 10 Sangkat Tonle Bassac.',
  phone: '+85581888580 / +85581888920',
  contactEmail: 'smr-askme@sunandmoonhotelgroup.com',
  telegramContacts: '@SMR_GR1 & @SMR_GENERAL',
  telegramChannel: 't.me/sunmoon_24',
};

export function buildProductionStudioDefaults(
  ownerId: string,
  memberUids: string[] = [ownerId],
): {
  studio: Studio;
  rooms: SpaRoom[];
  services: SpaService[];
  staff: StaffMember[];
  membershipTiers: MembershipTier[];
  clients: Client[];
  appointments: Appointment[];
  notificationRules: NotificationRule[];
  notificationLogs: NotificationLog[];
  creditDeductions: CreditDeduction[];
} {
  const studio: Studio = {
    id: SHARED_STUDIO_ID,
    ownerId,
    memberUids,
    name: VENUE_DEFAULTS.name,
    venueName: VENUE_DEFAULTS.venueName,
    tagline: VENUE_DEFAULTS.tagline,
    timezone: VENUE_DEFAULTS.timezone,
    currency: VENUE_DEFAULTS.currency,
    address: VENUE_DEFAULTS.address,
    phone: VENUE_DEFAULTS.phone,
    contactEmail: VENUE_DEFAULTS.contactEmail,
    telegramContacts: VENUE_DEFAULTS.telegramContacts,
    telegramChannel: VENUE_DEFAULTS.telegramChannel,
    seeded: false,
  };

  const notificationRules: NotificationRule[] = [
    {
      id: 'rule_confirm',
      ownerId,
      memberUids,
      eventKey: 'booking_confirmed',
      title: 'Instant Booking Confirmation',
      channel: 'Email + SMS',
      timingLabel: 'Immediate on booking',
      enabled: true,
      subjectTemplate: 'Confirmed: {{serviceName}} at {{studioName}}',
      bodyTemplate:
        'Hi {{clientName}}, your {{serviceName}} with {{therapistName}} is confirmed for {{dateTime}} in {{roomName}}. Reply RESCHEDULE if plans change.',
      sentCount: 0,
    },
    {
      id: 'rule_24h',
      ownerId,
      memberUids,
      eventKey: 'reminder_24h',
      title: '24-Hour Appointment Reminder',
      channel: 'SMS',
      timingLabel: '24 hours before start',
      enabled: true,
      subjectTemplate: 'Reminder: Tomorrow at {{studioName}}',
      bodyTemplate:
        'Reminder: {{clientName}}, we look forward to seeing you tomorrow at {{dateTime}} for {{serviceName}} with {{therapistName}}. Arrive 10 min early for herbal tea.',
      sentCount: 0,
    },
    {
      id: 'rule_2h',
      ownerId,
      memberUids,
      eventKey: 'checkin_2h',
      title: '2-Hour Arrival & Suite Ready Alert',
      channel: 'SMS',
      timingLabel: '2 hours before start',
      enabled: true,
      subjectTemplate: 'Your suite is preparing — {{studioName}}',
      bodyTemplate:
        'Hi {{clientName}}, {{roomName}} is being prepared for your {{serviceName}} at {{dateTime}}. Text HERE when you arrive.',
      sentCount: 0,
    },
    {
      id: 'rule_rebook',
      ownerId,
      memberUids,
      eventKey: 'post_visit_rebook',
      title: 'Post-Session Thank You & Rebook',
      channel: 'Email',
      timingLabel: '2 hours after completion',
      enabled: true,
      subjectTemplate: 'Thank you for visiting {{studioName}}',
      bodyTemplate:
        'Thank you for resting with us today, {{clientName}}. Drink plenty of water after your {{serviceName}} with {{therapistName}}. Ready for your next visit?',
      sentCount: 0,
    },
    {
      id: 'rule_membership',
      ownerId,
      memberUids,
      eventKey: 'membership_renewed',
      title: 'Membership Credit Renewal Notice',
      channel: 'Email + SMS',
      timingLabel: 'On monthly credit grant',
      enabled: true,
      subjectTemplate: 'Monthly {{tierName}} credits refreshed',
      bodyTemplate:
        'Hi {{clientName}}, your {{tierName}} membership has renewed with {{creditsRemaining}} treatment credit(s) ready to book at {{studioName}}.',
      sentCount: 0,
    },
  ];

  return {
    studio,
    rooms: [],
    services: [],
    staff: [],
    membershipTiers: [],
    clients: [],
    appointments: [],
    notificationRules,
    notificationLogs: [],
    creditDeductions: [],
  };
}
