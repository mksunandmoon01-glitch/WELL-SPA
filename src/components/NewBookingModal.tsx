import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import {
  formatCurrency,
  formatLocalDate,
  getAvailableTimeSlots,
} from '../lib/seedStudio';

interface NewBookingModalProps {
  open: boolean;
  onClose: () => void;
  initialDate?: string;
  initialStaffId?: string;
  initialStartTime?: string;
}

export function NewBookingModal({
  open,
  onClose,
  initialDate,
  initialStaffId,
  initialStartTime,
}: NewBookingModalProps) {
  const { services, staff, rooms, clients, appointments, createAppointment } = useStudio();

  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const activeStaff = useMemo(() => staff.filter((s) => s.onDuty), [staff]);
  const activeRooms = useMemo(() => rooms.filter((r) => r.active), [rooms]);

  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [roomName, setRoomName] = useState('');
  const [date, setDate] = useState(formatLocalDate(0));
  const [startTime, setStartTime] = useState('');
  const [useCredit, setUseCredit] = useState(false);
  const [creditsToDeduct, setCreditsToDeduct] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    setErrorMsg('');
    setDate(initialDate || formatLocalDate(0));
    const defaultSvc = activeServices[0]?.id ?? '';
    setServiceId((prev) => prev || defaultSvc);
    const defaultStaff = initialStaffId || activeStaff[0]?.id || staff[0]?.id || '';
    setStaffId(defaultStaff);
    const defaultMember = staff.find((m) => m.id === defaultStaff);
    setRoomName(defaultMember?.assignedRoom || activeRooms[0]?.name || '');
    if (clients.length === 0) {
      setClientMode('new');
      setSelectedClientId('');
    } else {
      setClientMode('existing');
      if (!selectedClientId) {
        setSelectedClientId(clients[0].id);
      }
    }
    if (initialStartTime) {
      setStartTime(initialStartTime);
    }
  }, [open, initialDate, initialStaffId, initialStartTime, activeServices, activeStaff, activeRooms, staff, clients, selectedClientId]);

  const selectedService = services.find((s) => s.id === serviceId);
  const selectedStaff = staff.find((s) => s.id === staffId);
  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const availableSlots = useMemo(() => {
    if (!selectedService || !selectedStaff) return [];
    return getAvailableTimeSlots(
      date,
      selectedStaff,
      selectedService.durationMinutes,
      appointments,
    );
  }, [date, selectedStaff, selectedService, appointments]);

  useEffect(() => {
    if (!open) return;
    if (initialStartTime && availableSlots.includes(initialStartTime)) {
      setStartTime(initialStartTime);
    } else if (availableSlots.length > 0 && !availableSlots.includes(startTime)) {
      setStartTime(availableSlots[0]);
    } else if (availableSlots.length === 0) {
      setStartTime('');
    }
  }, [availableSlots, initialStartTime, open, startTime]);

  const servicePrice = selectedService?.price ?? 0;
  const availableCredits = clientMode === 'existing' ? selectedClient?.creditsRemaining ?? 0 : 0;
  const maxDeductible = Math.min(availableCredits, servicePrice);

  useEffect(() => {
    if (clientMode === 'existing' && selectedClient && selectedClient.creditsRemaining > 0) {
      setUseCredit(true);
      setCreditsToDeduct(Math.min(selectedClient.creditsRemaining, servicePrice));
    } else {
      setUseCredit(false);
      setCreditsToDeduct(0);
    }
  }, [clientMode, selectedClient, servicePrice]);

  const appliedCredits =
    useCredit && maxDeductible > 0
      ? Math.max(0, Math.min(Math.floor(creditsToDeduct || 0), maxDeductible))
      : 0;
  const balanceDue = Math.max(0, servicePrice - appliedCredits);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cName = clientMode === 'existing' ? selectedClient?.fullName ?? '' : guestName.trim();
    const cEmail = clientMode === 'existing' ? selectedClient?.email ?? '' : guestEmail.trim();
    const cPhone = clientMode === 'existing' ? selectedClient?.phone ?? '' : guestPhone.trim();

    if (!cName) {
      setErrorMsg('Please select or enter a client name.');
      return;
    }
    if (!serviceId || !staffId || !startTime) {
      setErrorMsg('Please select a treatment, therapist, and open time slot.');
      return;
    }

    setSubmitting(true);
    try {
      await createAppointment({
        clientId: clientMode === 'existing' ? selectedClientId : undefined,
        clientName: cName,
        clientEmail: cEmail,
        clientPhone: cPhone,
        serviceId,
        staffId,
        roomName,
        date,
        startTime,
        useMembershipCredit: appliedCredits > 0,
        creditsToDeduct: appliedCredits,
        notes,
      });
      setGuestName('');
      setGuestEmail('');
      setGuestPhone('');
      setNotes('');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
      <div
        className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-booking-title"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="new-booking-title" className="font-display text-lg font-semibold text-slate-900">
              Schedule Appointment
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Availability checks therapist shifts and automatically triggers confirmation alerts.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="px-3.5 py-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-700">
              {errorMsg}
            </div>
          )}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">Client</label>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setClientMode('existing')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    clientMode === 'existing'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Existing Client
                </button>
                <button
                  type="button"
                  onClick={() => setClientMode('new')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    clientMode === 'new'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  New Guest
                </button>
              </div>
            </div>

            {clientMode === 'existing' ? (
              <div className="space-y-2">
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                      {c.creditsRemaining > 0
                        ? ` · ${c.membershipTierName} (${c.creditsRemaining} credits = ${formatCurrency(c.creditsRemaining)})`
                        : c.membershipStatus === 'active'
                          ? ` · ${c.membershipTierName}`
                          : ''}
                    </option>
                  ))}
                </select>
                {selectedClient && selectedClient.creditsRemaining > 0 && (
                  <div className="p-3 rounded-lg border border-teal-200 bg-teal-50/60 space-y-2.5 text-xs text-slate-800">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span>
                        Deduct credits (1 credit = $1 ·{' '}
                        <strong>{selectedClient.creditsRemaining}</strong> available · No expiry)
                      </span>
                      <input
                        type="checkbox"
                        checked={useCredit}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setUseCredit(checked);
                          if (checked) {
                            setCreditsToDeduct(maxDeductible);
                          }
                        }}
                        className="accent-teal-700 w-4 h-4"
                      />
                    </label>
                    {useCredit && maxDeductible > 0 && (
                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-teal-200/70">
                        <label htmlFor="modal-credits-deduct" className="text-slate-700">
                          Credits to apply (max {maxDeductible}):
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id="modal-credits-deduct"
                            type="number"
                            min={0}
                            max={maxDeductible}
                            placeholder="0"
                            value={appliedCredits > 0 ? appliedCredits : ''}
                            onChange={(e) =>
                              setCreditsToDeduct(
                                Math.max(0, Math.min(maxDeductible, Math.floor(Number(e.target.value) || 0))),
                              )
                            }
                            className="w-24 px-2.5 py-1 text-right font-mono tabular-nums bg-white border border-teal-300 rounded-md"
                          />
                          <span className="font-mono text-teal-800 font-semibold">
                            (-{formatCurrency(appliedCredits)})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Full name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  required
                  className="sm:col-span-2 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <input
                  type="email"
                  placeholder="Email for confirmation"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <input
                  type="tel"
                  placeholder="Phone for SMS reminders"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Treatment</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMinutes}m · {formatCurrency(s.price)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Therapist</label>
              <select
                value={staffId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setStaffId(nextId);
                  const nextMember = staff.find((m) => m.id === nextId);
                  if (nextMember?.assignedRoom) {
                    setRoomName(nextMember.assignedRoom);
                  }
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {staff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!m.onDuty ? '(Off Duty)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Room / Suite</label>
            <select
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              {activeRooms.length === 0 ? (
                <option value={selectedStaff?.assignedRoom || 'Unassigned'}>
                  {selectedStaff?.assignedRoom || 'Unassigned'}
                </option>
              ) : (
                <>
                  {activeRooms.map((r) => (
                    <option key={r.id} value={r.name}>
                      {r.name} ({r.roomType})
                    </option>
                  ))}
                  {roomName &&
                    !activeRooms.some((r) => r.name === roomName) && (
                      <option value={roomName}>{roomName}</option>
                    )}
                </>
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">
                Available Time Slot ({availableSlots.length} open)
              </label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={availableSlots.length === 0}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-slate-100"
              >
                {availableSlots.length === 0 ? (
                  <option value="">No open slots on this date</option>
                ) : (
                  availableSlots.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Session Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Oil preferences, pressure notes, or intake requests..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-4">
            <div className="text-xs text-slate-600">
              Total due:{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {appliedCredits > 0
                  ? `${formatCurrency(balanceDue)} (${appliedCredits} credit${appliedCredits === 1 ? '' : 's'} = -${formatCurrency(appliedCredits)})`
                  : formatCurrency(servicePrice)}
              </span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !startTime}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Confirming...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
