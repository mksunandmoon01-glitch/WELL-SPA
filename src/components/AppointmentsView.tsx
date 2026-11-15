import { useMemo, useState } from 'react';
import { ArrowUpRight, Bell, Calendar, Check, Clock, Search, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStudio } from '../context/StudioContext';
import {
  formatCurrency,
  formatLocalDate,
  minutesToTime,
  timeToMinutes,
} from '../lib/seedStudio';
import type { Appointment, AppointmentStatus } from '../types/spa';
import { TherapistAvatar } from './TherapistAvatar';

interface AppointmentsViewProps {
  onOpenNewBooking: (prefill?: { date?: string; staffId?: string; startTime?: string }) => void;
  onOpenReports?: () => void;
}

const STATUS_META: Record<
  AppointmentStatus,
  { label: string; textClass: string; surfaceClass: string }
> = {
  confirmed: {
    label: 'Confirmed',
    textClass: 'text-teal-800',
    surfaceClass: 'bg-teal-50/70 border-teal-200',
  },
  checked_in: {
    label: 'Checked In',
    textClass: 'text-amber-800',
    surfaceClass: 'bg-amber-50/80 border-amber-200',
  },
  in_progress: {
    label: 'In Session',
    textClass: 'text-emerald-800',
    surfaceClass: 'bg-emerald-50/80 border-emerald-200',
  },
  completed: {
    label: 'Completed',
    textClass: 'text-slate-700',
    surfaceClass: 'bg-slate-100/80 border-slate-200',
  },
  cancelled: {
    label: 'Cancelled',
    textClass: 'text-rose-700',
    surfaceClass: 'bg-rose-50/60 border-rose-200',
  },
  no_show: {
    label: 'No Show',
    textClass: 'text-rose-700',
    surfaceClass: 'bg-rose-50/60 border-rose-200',
  },
};

const START_HOUR = 9;
const END_HOUR = 19;
const PX_PER_MIN = 1.4;

export function AppointmentsView({ onOpenNewBooking, onOpenReports }: AppointmentsViewProps) {
  const {
    appointments,
    staff,
    clients,
    loadingData,
    updateAppointmentStatus,
    sendManualNotification,
  } = useStudio();

  const today = formatLocalDate(0);
  const tomorrow = formatLocalDate(1);

  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline');
  const [selectedDate, setSelectedDate] = useState(today);
  const [dateScope, setDateScope] = useState<'day' | 'all'>('day');
  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);

  const todaysAppointments = useMemo(
    () => appointments.filter((a) => a.date === today && a.status !== 'cancelled'),
    [appointments, today],
  );

  const projectedRevenue = useMemo(
    () => todaysAppointments.reduce((acc, a) => acc + a.price, 0),
    [todaysAppointments],
  );

  const utilizationPct = useMemo(() => {
    const onDutyCount = staff.filter((s) => s.onDuty).length;
    if (onDutyCount === 0) return 0;
    const totalShiftMinutes = onDutyCount * 8 * 60;
    const bookedMinutes = todaysAppointments.reduce((acc, a) => acc + a.durationMinutes, 0);
    return Math.min(100, Math.round((bookedMinutes / totalShiftMinutes) * 100));
  }, [staff, todaysAppointments]);

  const activeMemberCount = useMemo(
    () => clients.filter((c) => c.membershipStatus === 'active').length,
    [clients],
  );

  const last7DaysRevenue = useMemo(() => {
    const days: Array<{
      date: string;
      shortLabel: string;
      dayName: string;
      paidRevenue: number;
      creditValue: number;
      totalRevenue: number;
      bookings: number;
    }> = [];

    for (let offset = -6; offset <= 0; offset += 1) {
      const dateStr = formatLocalDate(offset);
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, d || 1);
      const dayName = dt.toLocaleDateString('en-US', { weekday: 'short' });
      const shortLabel = offset === 0 ? 'Today' : `${dayName} ${dt.getMonth() + 1}/${dt.getDate()}`;

      const dayAppts = appointments.filter(
        (a) => a.date === dateStr && a.status !== 'cancelled' && a.status !== 'no_show',
      );
      const paidRevenue = dayAppts
        .filter((a) => !a.usedMembershipCredit)
        .reduce((sum, a) => sum + a.price, 0);
      const creditValue = dayAppts
        .filter((a) => a.usedMembershipCredit)
        .reduce((sum, a) => sum + a.price, 0);

      days.push({
        date: dateStr,
        shortLabel,
        dayName,
        paidRevenue,
        creditValue,
        totalRevenue: paidRevenue + creditValue,
        bookings: dayAppts.length,
      });
    }
    return days;
  }, [appointments]);

  const sevenDayTotal = useMemo(
    () => last7DaysRevenue.reduce((sum, d) => sum + d.totalRevenue, 0),
    [last7DaysRevenue],
  );

  const sevenDayPaid = useMemo(
    () => last7DaysRevenue.reduce((sum, d) => sum + d.paidRevenue, 0),
    [last7DaysRevenue],
  );

  const sevenDayBookings = useMemo(
    () => last7DaysRevenue.reduce((sum, d) => sum + d.bookings, 0),
    [last7DaysRevenue],
  );

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((a) => {
      if (dateScope === 'day' && a.date !== selectedDate) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (
        q &&
        !a.clientName.toLowerCase().includes(q) &&
        !a.serviceName.toLowerCase().includes(q) &&
        !a.staffName.toLowerCase().includes(q) &&
        !a.roomName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [appointments, dateScope, selectedDate, statusFilter, searchQuery]);

  const selectedAppointmentLive = useMemo(
    () =>
      activeAppointment
        ? appointments.find((a) => a.id === activeAppointment.id) ?? activeAppointment
        : null,
    [activeAppointment, appointments],
  );

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i),
    [],
  );

  const handleQuickReminder = async (apt: Appointment) => {
    setSendingReminder(true);
    try {
      await sendManualNotification({
        clientId: apt.clientId,
        appointmentId: apt.id,
        channel: apt.clientPhone ? 'SMS' : 'Email',
        subject: `Reminder: ${apt.serviceName} on ${apt.date}`,
        messageBody: `Hi ${apt.clientName}, confirming your ${apt.serviceName} with ${apt.staffName} on ${apt.date} at ${apt.startTime} in ${apt.roomName}.`,
      });
    } finally {
      setSendingReminder(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Today&apos;s Bookings</p>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {todaysAppointments.length}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {todaysAppointments.filter((a) => a.status === 'checked_in' || a.status === 'in_progress').length} active in studio
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Today&apos;s Revenue</p>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {formatCurrency(projectedRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {todaysAppointments.filter((a) => a.usedMembershipCredit).length} credit redemptions
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Suite Utilization</p>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {utilizationPct}%
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {staff.filter((s) => s.onDuty).length} of {staff.length} therapists on duty
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Active Members</p>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {activeMemberCount}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {clients.length} total client profiles
          </p>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Daily Revenue Breakdown
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Last 7 days · {sevenDayBookings} appointments · Direct checkout {formatCurrency(sevenDayPaid)} · Total value {formatCurrency(sevenDayTotal)}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-4 text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-teal-700 inline-block" aria-hidden="true" />
                <span>Direct Checkout</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 inline-block" aria-hidden="true" />
                <span>Membership Credit</span>
              </span>
            </div>
            {onOpenReports && (
              <button
                type="button"
                onClick={onOpenReports}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-800 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Revenue Reports</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {loadingData ? (
          <div className="h-52 bg-slate-100 rounded-lg animate-pulse" />
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={last7DaysRevenue}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                onClick={(state) => {
                  const idx = Number(state?.activeTooltipIndex);
                  const clickedDate =
                    Number.isInteger(idx) && idx >= 0 ? last7DaysRevenue[idx]?.date : undefined;
                  if (clickedDate) {
                    setSelectedDate(clickedDate);
                    setDateScope('day');
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val: number) => `$${val}`}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as (typeof last7DaysRevenue)[number];
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs space-y-1.5">
                        <p className="font-semibold text-slate-900 font-mono tabular-nums">
                          {row.date} ({row.dayName})
                        </p>
                        <div className="space-y-0.5 text-slate-600 font-mono tabular-nums">
                          <p className="flex justify-between gap-4">
                            <span>Direct Checkout:</span>
                            <span className="font-medium text-teal-800">{formatCurrency(row.paidRevenue)}</span>
                          </p>
                          <p className="flex justify-between gap-4">
                            <span>Credit Value:</span>
                            <span className="font-medium text-slate-700">{formatCurrency(row.creditValue)}</span>
                          </p>
                          <p className="flex justify-between gap-4 pt-1 border-t border-slate-100 text-slate-900 font-semibold">
                            <span>Total ({row.bookings} visits):</span>
                            <span>{formatCurrency(row.totalRevenue)}</span>
                          </p>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="paidRevenue"
                  stackId="revenue"
                  fill="#0f766e"
                  radius={[0, 0, 0, 0]}
                  maxBarSize={42}
                />
                <Bar
                  dataKey="creditValue"
                  stackId="revenue"
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={42}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setViewMode('timeline');
                setDateScope('day');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'timeline'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Schedule List
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedDate(today);
                setDateScope('day');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                dateScope === 'day' && selectedDate === today
                  ? 'border-teal-700 bg-teal-50 text-teal-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedDate(tomorrow);
                setDateScope('day');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                dateScope === 'day' && selectedDate === tomorrow
                  ? 'border-teal-700 bg-teal-50 text-teal-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Tomorrow
            </button>
            {viewMode === 'list' && (
              <button
                type="button"
                onClick={() => setDateScope('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  dateScope === 'all'
                    ? 'border-teal-700 bg-teal-50 text-teal-800'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                All Dates
              </button>
            )}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setDateScope('day');
              }}
              aria-label="Filter appointments by date"
              className="px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search client, service, room..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | AppointmentStatus)}
            aria-label="Filter by appointment status"
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked In</option>
            <option value="in_progress">In Session</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </section>

      {loadingData ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="h-10 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : viewMode === 'timeline' ? (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className="flex border-b border-slate-200 bg-slate-50/70">
                <div className="w-[72px] shrink-0 p-3 text-xs font-mono text-slate-500 flex items-center justify-center border-r border-slate-200">
                  Time
                </div>
                {staff.map((member) => (
                  <div
                    key={member.id}
                    className="flex-1 min-w-[190px] p-3.5 border-r last:border-r-0 border-slate-200 flex items-center gap-3"
                  >
                    <TherapistAvatar name={member.name} src={member.avatarUrl} sizeClass="w-9 h-9" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{member.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {member.assignedRoom} ·{' '}
                        <span className={member.onDuty ? 'text-emerald-700' : 'text-slate-400'}>
                          {member.onDuty ? `${member.shiftStart}–${member.shiftEnd}` : 'Off duty'}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex relative">
                <div className="w-[72px] shrink-0 border-r border-slate-200 bg-slate-50/40">
                  {hours.slice(0, -1).map((hour) => (
                    <div
                      key={hour}
                      style={{ height: `${60 * PX_PER_MIN}px` }}
                      className="border-b border-slate-100 px-2 pt-1.5 text-right font-mono text-[11px] text-slate-400 tabular-nums"
                    >
                      {String(hour).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {staff.map((member) => {
                  const colAppts = filteredAppointments.filter(
                    (a) => a.staffId === member.id && a.date === selectedDate && a.status !== 'cancelled',
                  );
                  const breakTop = member.breakStart
                    ? (timeToMinutes(member.breakStart) - START_HOUR * 60) * PX_PER_MIN
                    : -1;
                  const breakHeight =
                    member.breakStart && member.breakEnd
                      ? (timeToMinutes(member.breakEnd) - timeToMinutes(member.breakStart)) * PX_PER_MIN
                      : 0;

                  return (
                    <div
                      key={member.id}
                      className="flex-1 min-w-[190px] relative border-r last:border-r-0 border-slate-200"
                      style={{ height: `${(END_HOUR - START_HOUR) * 60 * PX_PER_MIN}px` }}
                    >
                      {hours.slice(0, -1).map((hour) => (
                        <button
                          key={hour}
                          type="button"
                          onClick={() =>
                            onOpenNewBooking({
                              date: selectedDate,
                              staffId: member.id,
                              startTime: `${String(hour).padStart(2, '0')}:00`,
                            })
                          }
                          title={`Book ${member.name} at ${String(hour).padStart(2, '0')}:00`}
                          style={{ height: `${60 * PX_PER_MIN}px` }}
                          className="w-full block border-b border-slate-100 hover:bg-teal-50/30 transition-colors text-left cursor-pointer"
                        />
                      ))}

                      {member.onDuty && breakTop >= 0 && breakHeight > 0 && (
                        <div
                          style={{ top: `${breakTop}px`, height: `${breakHeight}px` }}
                          className="absolute left-1.5 right-1.5 rounded-md border border-dashed border-slate-300 bg-slate-100/80 px-2.5 py-1 pointer-events-none flex items-center justify-between text-[11px] text-slate-500"
                        >
                          <span>Break</span>
                          <span className="font-mono tabular-nums">
                            {member.breakStart}–{member.breakEnd}
                          </span>
                        </div>
                      )}

                      {colAppts.map((apt) => {
                        const startMin = timeToMinutes(apt.startTime);
                        const top = Math.max(0, (startMin - START_HOUR * 60) * PX_PER_MIN);
                        const height = Math.max(46, apt.durationMinutes * PX_PER_MIN);
                        const meta = STATUS_META[apt.status];

                        return (
                          <button
                            key={apt.id}
                            type="button"
                            onClick={() => setActiveAppointment(apt)}
                            style={{ top: `${top + 2}px`, height: `${height - 4}px` }}
                            className={`absolute left-1.5 right-1.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors overflow-hidden flex flex-col justify-between cursor-pointer hover:brightness-97 ${meta.surfaceClass}`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-[11px] font-medium text-slate-700 tabular-nums">
                                  {apt.startTime}–{minutesToTime(startMin + apt.durationMinutes)}
                                </span>
                                <span className={`text-[11px] font-semibold whitespace-nowrap ${meta.textClass}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                                {apt.clientName}
                              </p>
                              <p className="text-[11px] text-slate-600 truncate">
                                {apt.serviceName}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {filteredAppointments.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">No appointments match these filters</p>
                <p className="text-xs text-slate-500">
                  Adjust your date or status filter, or schedule a new massage or spa session.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenNewBooking({ date: selectedDate })}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
              >
                Schedule Appointment
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4">Date &amp; Time</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Treatment</th>
                    <th className="py-3 px-4">Therapist &amp; Suite</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {filteredAppointments.map((apt) => {
                    const meta = STATUS_META[apt.status];
                    return (
                      <tr
                        key={apt.id}
                        onClick={() => setActiveAppointment(apt)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                          {apt.date} · {apt.startTime}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900">{apt.clientName}</p>
                          <p className="text-xs text-slate-500">{apt.clientPhone || apt.clientEmail}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-slate-900">{apt.serviceName}</p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums">
                            {apt.durationMinutes} min
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-slate-900">{apt.staffName}</p>
                          <p className="text-xs text-slate-500">{apt.roomName}</p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 whitespace-nowrap">
                          {apt.usedMembershipCredit ? '1 Credit' : formatCurrency(apt.price)}
                        </td>
                        <td className={`py-3 px-4 text-xs font-semibold whitespace-nowrap ${meta.textClass}`}>
                          {meta.label}
                        </td>
                        <td
                          className="py-3 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {apt.status === 'confirmed' && (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(apt.id, 'checked_in')}
                              className="px-2.5 py-1 text-xs font-medium text-teal-800 border border-teal-200 hover:bg-teal-50 rounded-md cursor-pointer"
                            >
                              Check In
                            </button>
                          )}
                          {apt.status === 'checked_in' && (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(apt.id, 'in_progress')}
                              className="px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-200 hover:bg-emerald-50 rounded-md cursor-pointer"
                            >
                              Start
                            </button>
                          )}
                          {apt.status === 'in_progress' && (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(apt.id, 'completed')}
                              className="px-2.5 py-1 text-xs font-medium text-slate-800 border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
                            >
                              Complete
                            </button>
                          )}
                          {(apt.status === 'completed' ||
                            apt.status === 'cancelled' ||
                            apt.status === 'no_show') && (
                            <button
                              type="button"
                              onClick={() => setActiveAppointment(apt)}
                              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                            >
                              Details
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {selectedAppointmentLive && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35">
          <div className="bg-white w-full max-w-md h-full border-l border-slate-200 flex flex-col justify-between overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <p className={`text-xs font-semibold ${STATUS_META[selectedAppointmentLive.status].textClass}`}>
                    {STATUS_META[selectedAppointmentLive.status].label}
                  </p>
                  <h2 className="font-display text-lg font-semibold text-slate-900 mt-0.5">
                    {selectedAppointmentLive.serviceName}
                  </h2>
                  <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                    {selectedAppointmentLive.date} · {selectedAppointmentLive.startTime} (
                    {selectedAppointmentLive.durationMinutes} min)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveAppointment(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                  aria-label="Close appointment details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-sm">
                <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                  <span className="text-slate-500">Client</span>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">{selectedAppointmentLive.clientName}</p>
                    <p className="text-xs text-slate-500">{selectedAppointmentLive.clientEmail}</p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums">
                      {selectedAppointmentLive.clientPhone}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                  <span className="text-slate-500">Therapist</span>
                  <span className="font-medium text-slate-900">{selectedAppointmentLive.staffName}</span>
                </div>

                <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                  <span className="text-slate-500">Treatment Suite</span>
                  <span className="font-medium text-slate-900">{selectedAppointmentLive.roomName}</span>
                </div>

                <div className="flex justify-between gap-4 py-2 border-b border-slate-100">
                  <span className="text-slate-500">Billing</span>
                  <span className="font-mono font-medium text-slate-900 tabular-nums">
                    {selectedAppointmentLive.usedMembershipCredit
                      ? 'Membership Credit Redeemed ($0)'
                      : formatCurrency(selectedAppointmentLive.price)}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-500">Intake &amp; Session Notes</p>
                  <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-3">
                    {selectedAppointmentLive.notes || 'No special intake notes recorded.'}
                  </p>
                </div>

                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="text-xs text-slate-600">
                    <p className="font-medium text-slate-800">Client Notification</p>
                    <p className="mt-0.5">
                      Confirmation {selectedAppointmentLive.confirmationSent ? 'sent' : 'pending'} · Send instant alert
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={sendingReminder}
                    onClick={() => handleQuickReminder(selectedAppointmentLive)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-50"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    <span>{sendingReminder ? 'Sending...' : 'Send Alert'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50/60 space-y-2.5">
              {selectedAppointmentLive.status !== 'completed' &&
              selectedAppointmentLive.status !== 'cancelled' &&
              selectedAppointmentLive.status !== 'no_show' ? (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    {selectedAppointmentLive.status === 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(selectedAppointmentLive.id, 'checked_in')}
                        className="px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
                      >
                        Check In Client
                      </button>
                    )}
                    {(selectedAppointmentLive.status === 'confirmed' ||
                      selectedAppointmentLive.status === 'checked_in') && (
                      <button
                        type="button"
                        onClick={() => updateAppointmentStatus(selectedAppointmentLive.id, 'in_progress')}
                        className="px-3 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer"
                      >
                        Start Session
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => updateAppointmentStatus(selectedAppointmentLive.id, 'completed')}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Complete Visit</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => updateAppointmentStatus(selectedAppointmentLive.id, 'no_show')}
                      className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      Mark No-Show
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAppointmentStatus(selectedAppointmentLive.id, 'cancelled')}
                      className="px-3 py-2 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      Cancel Booking
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    This booking is finalized as {STATUS_META[selectedAppointmentLive.status].label.toLowerCase()}.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
