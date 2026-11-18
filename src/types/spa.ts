export type ServiceCategory = 'Massage' | 'Facial' | 'Body Ritual' | 'Hydrotherapy' | 'Add-On';

export type AppointmentStatus =
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type MembershipStatus = 'none' | 'active' | 'paused' | 'cancelled';

export type NotificationEventKey =
  | 'booking_confirmed'
  | 'reminder_24h'
  | 'checkin_2h'
  | 'post_visit_rebook'
  | 'membership_renewed';

export type NotificationChannelCombo = 'Email + SMS' | 'SMS' | 'Email';
export type NotificationChannel = 'SMS' | 'Email';
export type NotificationLogStatus = 'sent' | 'scheduled' | 'failed';

export type WorkspaceTab =
  | 'appointments'
  | 'staff'
  | 'memberships'
  | 'notifications'
  | 'services'
  | 'reports'
  | 'booking_portal'
  | 'users';

export type PermissionKey = WorkspaceTab;

export interface UserPermissions {
  appointments: boolean;
  staff: boolean;
  memberships: boolean;
  notifications: boolean;
  services: boolean;
  reports: boolean;
  booking_portal: boolean;
  users: boolean;
}

export interface Studio {
  id: string;
  ownerId: string;
  memberUids: string[];
  memberEmails?: string[];
  name: string;
  venueName?: string;
  tagline: string;
  timezone: string;
  currency: string;
  address: string;
  phone: string;
  contactEmail?: string;
  telegramContacts?: string;
  telegramChannel?: string;
  seeded: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SpaService {
  id: string;
  ownerId: string;
  memberUids: string[];
  name: string;
  category: ServiceCategory;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  roomType: string;
  description: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SpaRoom {
  id: string;
  ownerId: string;
  memberUids: string[];
  name: string;
  roomType: string;
  active: boolean;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffMember {
  id: string;
  ownerId: string;
  memberUids: string[];
  name: string;
  role: string;
  specialty: string;
  bio: string;
  avatarUrl: string;
  assignedRoomId?: string;
  assignedRoom: string;
  onDuty: boolean;
  workDays: string[];
  shiftStart: string;
  shiftEnd: string;
  breakStart: string;
  breakEnd: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MembershipTier {
  id: string;
  ownerId: string;
  memberUids: string[];
  name: string;
  targetAudience: string;
  monthlyPrice: number;
  creditsPerMonth: number;
  retailDiscountPercent: number;
  priorityWindowHours: number;
  perksSummary: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Client {
  id: string;
  ownerId: string;
  memberUids: string[];
  fullName: string;
  email: string;
  phone: string;
  notes: string;
  preferredTherapistId: string;
  membershipTierId: string;
  membershipTierName: string;
  membershipStatus: MembershipStatus;
  creditsRemaining: number;
  nextRenewalDate: string;
  totalVisits: number;
  lifetimeSpend: number;
  smsOptIn: boolean;
  emailOptIn: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Appointment {
  id: string;
  ownerId: string;
  memberUids: string[];
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  roomName: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  price: number;
  usedMembershipCredit: boolean;
  creditsUsed?: number;
  amountPaid?: number;
  status: AppointmentStatus;
  notes: string;
  confirmationSent: boolean;
  reminderSent: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationRule {
  id: string;
  ownerId: string;
  memberUids: string[];
  eventKey: NotificationEventKey;
  title: string;
  channel: NotificationChannelCombo;
  timingLabel: string;
  enabled: boolean;
  subjectTemplate: string;
  bodyTemplate: string;
  sentCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationLog {
  id: string;
  ownerId: string;
  memberUids: string[];
  ruleId: string;
  eventKey: string;
  appointmentId: string;
  clientId: string;
  clientName: string;
  recipientContact: string;
  channel: NotificationChannel;
  subject: string;
  messageBody: string;
  status: NotificationLogStatus;
  scheduledFor: string;
  sentAtLabel: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AuthorizedUserRole = 'admin' | 'manager' | 'staff';

export interface AuthorizedUser {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  role: AuthorizedUserRole;
  isPrimaryAdmin: boolean;
  active: boolean;
  permissions: UserPermissions;
  createdByUid: string;
  createdByEmail: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SessionUser {
  uid: string;
  email: string;
  fullName: string;
  displayName: string;
  role: AuthorizedUserRole;
  isPrimaryAdmin: boolean;
  active: boolean;
  permissions: UserPermissions;
}

export interface ClientSessionProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  membershipTierId: string;
  membershipTierName: string;
  membershipStatus: MembershipStatus;
  creditsRemaining: number;
  nextRenewalDate: string;
  totalVisits: number;
  lifetimeSpend: number;
}

export interface CreditDeduction {
  id: string;
  ownerId: string;
  memberUids: string[];
  clientId: string;
  clientName: string;
  category: 'Massage' | 'Order Item' | 'Service';
  description: string;
  creditsDeducted: number;
  recordedByEmail: string;
  date: string;
  createdAt: string;
  updatedAt?: string;
}
