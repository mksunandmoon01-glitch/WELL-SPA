import React, { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import {
  THERAPIST_AVATARS,
  formatLocalDate,
  timeToMinutes,
} from '../lib/seedStudio';
import type { StaffMember } from '../types/spa';
import { TherapistAvatar } from './TherapistAvatar';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function StaffScheduleView() {
  const {
    staff,
    appointments,
    toggleStaffDuty,
    updateStaffSchedule,
    createStaffMember,
  } = useStudio();

  const today = formatLocalDate(0);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const [workDays, setWorkDays] = useState<string[]>([]);
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');
  const [breakStart, setBreakStart] = useState('13:00');
  const [breakEnd, setBreakEnd] = useState('13:45');
  const [assignedRoom, setAssignedRoom] = useState('');
  const [onDuty, setOnDuty] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Massage Therapist');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [newRoom, setNewRoom] = useState('Suite 05 — Sanctuary');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('17:30');
  const [newAvatar, setNewAvatar] = useState(THERAPIST_AVATARS.elena);

  const staffMetrics = useMemo(() => {
    const map: Record<string, { todayMinutes: number; todayCount: number; shiftMinutes: number }> = {};
    for (const member of staff) {
      const todayAppts = appointments.filter(
        (a) =>
          a.staffId === member.id &&
          a.date === today &&
          a.status !== 'cancelled' &&
          a.status !== 'no_show',
      );
      const todayMinutes = todayAppts.reduce((sum, a) => sum + a.durationMinutes, 0);
      const breakDur =
        member.breakStart && member.breakEnd
          ? Math.max(0, timeToMinutes(member.breakEnd) - timeToMinutes(member.breakStart))
          : 0;
      const shiftMinutes = Math.max(
        60,
        timeToMinutes(member.shiftEnd) - timeToMinutes(member.shiftStart) - breakDur,
      );
      map[member.id] = {
        todayMinutes,
        todayCount: todayAppts.length,
        shiftMinutes,
      };
    }
    return map;
  }, [staff, appointments, today]);

  const openEditor = (member: StaffMember) => {
    setEditingStaff(member);
    setWorkDays(member.workDays);
    setShiftStart(member.shiftStart);
    setShiftEnd(member.shiftEnd);
    setBreakStart(member.breakStart);
    setBreakEnd(member.breakEnd);
    setAssignedRoom(member.assignedRoom);
    setOnDuty(member.onDuty);
  };

  const toggleDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;
    setSaving(true);
    try {
      await updateStaffSchedule(editingStaff.id, {
        workDays,
        shiftStart,
        shiftEnd,
        breakStart,
        breakEnd,
        assignedRoom,
        onDuty,
      });
      setEditingStaff(null);
    } finally {
      setSaving(false);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await createStaffMember({
        name: newName,
        role: newRole,
        specialty: newSpecialty || 'Integrative Massage · Relaxation',
        bio: 'Licensed wellness practitioner at SUN & MOON Hotel, WELL SPA.',
        avatarUrl: newAvatar,
        assignedRoom: newRoom,
        workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        shiftStart: newShiftStart,
        shiftEnd: newShiftEnd,
        breakStart: '13:00',
        breakEnd: '13:45',
      });
      setNewName('');
      setNewSpecialty('');
      setShowAddModal(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Therapist Roster &amp; Shift Coverage
          </h2>
          <p className="text-sm text-slate-500">
            Manage daily shift windows, break blocks, suite assignments, and active booking availability.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Therapist</span>
        </button>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {staff.map((member) => {
          const metrics = staffMetrics[member.id] ?? {
            todayMinutes: 0,
            todayCount: 0,
            shiftMinutes: 480,
          };
          const loadPct = Math.min(
            100,
            Math.round((metrics.todayMinutes / metrics.shiftMinutes) * 100),
          );

          return (
            <div
              key={member.id}
              className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <TherapistAvatar
                    name={member.name}
                    src={member.avatarUrl}
                    sizeClass="w-12 h-12"
                  />
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold text-slate-900 truncate">
                      {member.name}
                    </h3>
                    <p className="text-xs text-slate-600 truncate">
                      {member.role} · {member.assignedRoom}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-1">{member.specialty}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => toggleStaffDuty(member.id, !member.onDuty)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    member.onDuty
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {member.onDuty ? 'On Duty' : 'Off Duty'}
                </button>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500">Shift Window</p>
                    <p className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                      {member.shiftStart}–{member.shiftEnd}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Break</p>
                    <p className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                      {member.breakStart && member.breakEnd
                        ? `${member.breakStart}–${member.breakEnd}`
                        : 'None'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Today&apos;s Load</p>
                    <p className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                      {metrics.todayCount} appts · {loadPct}%
                    </p>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-700 rounded-full transition-all"
                    style={{ width: `${loadPct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono">
                    {DAYS_OF_WEEK.map((day) => {
                      const active = member.workDays.includes(day);
                      return (
                        <span
                          key={day}
                          className={`px-1.5 py-0.5 rounded ${
                            active
                              ? 'bg-slate-900 text-white font-medium'
                              : 'text-slate-400 bg-slate-50'
                          }`}
                        >
                          {day}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditor(member)}
                    className="text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Edit Shift
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Edit Shift · {editingStaff.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Updates live booking slot availability immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close shift editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Assigned Suite</label>
                <input
                  type="text"
                  value={assignedRoom}
                  onChange={(e) => setAssignedRoom(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Working Days</label>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS_OF_WEEK.map((day) => {
                    const selected = workDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                          selected
                            ? 'bg-teal-700 text-white border-teal-700'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Shift Start</label>
                  <input
                    type="time"
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Shift End</label>
                  <input
                    type="time"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Break Start</label>
                  <input
                    type="time"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Break End</label>
                  <input
                    type="time"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between pt-2 text-sm text-slate-700 cursor-pointer">
                <span>Available for online bookings</span>
                <input
                  type="checkbox"
                  checked={onDuty}
                  onChange={(e) => setOnDuty(e.target.checked)}
                  className="accent-teal-700 w-4 h-4"
                />
              </label>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">Add Therapist</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddStaff} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Maya Lin"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Role</label>
                  <input
                    type="text"
                    required
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Assigned Suite</label>
                  <input
                    type="text"
                    required
                    value={newRoom}
                    onChange={(e) => setNewRoom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Specialties</label>
                <input
                  type="text"
                  value={newSpecialty}
                  onChange={(e) => setNewSpecialty(e.target.value)}
                  placeholder="Swedish · Prenatal · Reflexology"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Shift Start</label>
                  <input
                    type="time"
                    value={newShiftStart}
                    onChange={(e) => setNewShiftStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Shift End</label>
                  <input
                    type="time"
                    value={newShiftEnd}
                    onChange={(e) => setNewShiftEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Profile Portrait</label>
                <select
                  value={newAvatar}
                  onChange={(e) => setNewAvatar(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value={THERAPIST_AVATARS.elena}>Portrait 1</option>
                  <option value={THERAPIST_AVATARS.marcus}>Portrait 2</option>
                  <option value={THERAPIST_AVATARS.sora}>Portrait 3</option>
                  <option value={THERAPIST_AVATARS.julian}>Portrait 4</option>
                </select>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Adding...' : 'Add Therapist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
