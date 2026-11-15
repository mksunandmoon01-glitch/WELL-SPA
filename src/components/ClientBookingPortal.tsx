import React, { useMemo, useState } from 'react';
import { CheckCircle2, MapPin, Phone } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import {
  SPA_BANNER_IMAGE,
  formatCurrency,
  formatLocalDate,
  getAvailableTimeSlots,
} from '../lib/seedStudio';
import { TherapistAvatar } from './TherapistAvatar';

export function ClientBookingPortal() {
  const {
    studio,
    services,
    staff,
    clients,
    appointments,
    createAppointment,
  } = useStudio();

  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const dutyStaff = useMemo(() => staff.filter((s) => s.onDuty), [staff]);

  const [bannerFailed, setBannerFailed] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [date, setDate] = useState(formatLocalDate(0));
  const [selectedTime, setSelectedTime] = useState('');

  const [bookingAs, setBookingAs] = useState<'member' | 'guest'>('member');
  const [memberClientId, setMemberClientId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [useCredit, setUseCredit] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedDetails, setConfirmedDetails] = useState<{
    serviceName: string;
    therapistName: string;
    date: string;
    startTime: string;
    roomName: string;
    usedCredit: boolean;
    price: number;
  } | null>(null);

  const resolvedService =
    activeServices.find((s) => s.id === selectedServiceId) ?? activeServices[0];
  const resolvedStaff =
    dutyStaff.find((m) => m.id === selectedStaffId) ?? dutyStaff[0];
  const resolvedClient =
    clients.find((c) => c.id === memberClientId) ?? clients[0];

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
    bookingAs === 'member' &&
    Boolean(resolvedClient) &&
    resolvedClient.membershipStatus === 'active' &&
    resolvedClient.creditsRemaining > 0;

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedService || !resolvedStaff || !effectiveTime) return;
    const cName = bookingAs === 'member' ? resolvedClient?.fullName ?? '' : guestName.trim();
    const cEmail = bookingAs === 'member' ? resolvedClient?.email ?? '' : guestEmail.trim();
    const cPhone = bookingAs === 'member' ? resolvedClient?.phone ?? '' : guestPhone.trim();
    if (!cName) return;

    setSubmitting(true);
    try {
      await createAppointment({
        clientId: bookingAs === 'member' ? resolvedClient?.id : undefined,
        clientName: cName,
        clientEmail: cEmail,
        clientPhone: cPhone,
        serviceId: resolvedService.id,
        staffId: resolvedStaff.id,
        date,
        startTime: effectiveTime,
        useMembershipCredit: canRedeemCredit && useCredit,
        notes,
      });
      setConfirmedDetails({
        serviceName: resolvedService.name,
        therapistName: resolvedStaff.name,
        date,
        startTime: effectiveTime,
        roomName: resolvedStaff.assignedRoom,
        usedCredit: canRedeemCredit && useCredit,
        price: canRedeemCredit && useCredit ? 0 : resolvedService.price,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-7 p-6 lg:p-8 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-teal-700">Client Online Booking Storefront</p>
            <h2 className="font-display text-2xl font-bold text-slate-900 [text-wrap:balance]">
              {studio?.name ?? 'SUN & MOON Hotel, WELL SPA'}
            </h2>
            <p className="text-sm text-slate-600">{studio?.tagline}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-100">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              {studio?.address}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              {studio?.phone}
            </span>
          </div>
        </div>
        <div className="lg:col-span-5 min-h-[180px] bg-slate-100">
          {!bannerFailed ? (
            <img
              src={SPA_BANNER_IMAGE}
              alt="SUN & MOON Hotel, WELL SPA suite interior"
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

      {confirmedDetails ? (
        <section className="bg-white border border-slate-200 rounded-xl p-8 max-w-xl mx-auto text-center space-y-5">
          <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto" />
          <div className="space-y-1">
            <h3 className="font-display text-xl font-semibold text-slate-900">
              Booking Confirmed
            </h3>
            <p className="text-sm text-slate-600">
              Added to the live studio timeline and queued automated confirmation &amp; 24h reminder alerts.
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Treatment</span>
              <span className="font-medium text-slate-900">{confirmedDetails.serviceName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Therapist &amp; Suite</span>
              <span className="font-medium text-slate-900">
                {confirmedDetails.therapistName} · {confirmedDetails.roomName}
              </span>
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
                {confirmedDetails.usedCredit
                  ? '1 Membership Credit ($0)'
                  : formatCurrency(confirmedDetails.price)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmedDetails(null)}
            className="px-5 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
          >
            Book Another Session
          </button>
        </section>
      ) : (
        <form onSubmit={handleBook} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
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
                      onClick={() => setSelectedStaffId(member.id)}
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

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-display text-base font-semibold text-slate-900">
                  03. Pick Date &amp; Available Time
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

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5 sticky top-20">
            <h3 className="font-display text-base font-semibold text-slate-900">
              04. Client &amp; Checkout
            </h3>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setBookingAs('member')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  bookingAs === 'member'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                Member / Returning
              </button>
              <button
                type="button"
                onClick={() => setBookingAs('guest')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                  bookingAs === 'guest'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                New Guest
              </button>
            </div>

            {bookingAs === 'member' ? (
              <div className="space-y-3">
                <select
                  value={resolvedClient?.id ?? ''}
                  onChange={(e) => setMemberClientId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.creditsRemaining} credits)
                    </option>
                  ))}
                </select>
                {canRedeemCredit && resolvedClient && (
                  <label className="flex items-center justify-between p-3 rounded-lg border border-teal-200 bg-teal-50/60 text-xs text-slate-800 cursor-pointer">
                    <span>
                      Apply 1 {resolvedClient.membershipTierName} credit ({resolvedClient.creditsRemaining} left)
                    </span>
                    <input
                      type="checkbox"
                      checked={useCredit}
                      onChange={(e) => setUseCredit(e.target.checked)}
                      className="accent-teal-700 w-4 h-4"
                    />
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                <input
                  type="text"
                  required
                  placeholder="Your full name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="email"
                  required
                  placeholder="Email for confirmation"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="tel"
                  placeholder="Mobile number for SMS reminder"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
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
              <div className="flex justify-between text-slate-600">
                <span>Time</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {date} · {effectiveTime || 'Unavailable'}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-slate-900 pt-2 border-t border-slate-100">
                <span>Due Today</span>
                <span className="font-mono tabular-nums">
                  {canRedeemCredit && useCredit
                    ? '$0 (1 Credit)'
                    : formatCurrency(resolvedService?.price ?? 0)}
                </span>
              </div>
            </div>

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
    </div>
  );
}
