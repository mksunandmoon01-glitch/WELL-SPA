import React, { useMemo, useState } from 'react';
import { DoorOpen, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import {
  THERAPIST_AVATARS,
  formatLocalDate,
  timeToMinutes,
} from '../lib/seedStudio';
import type { SpaRoom, StaffMember } from '../types/spa';
import { TherapistAvatar } from './TherapistAvatar';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const PRESET_PORTRAITS: Array<{ key: string; label: string; url: string }> = [
  { key: 'elena', label: 'Portrait 1', url: THERAPIST_AVATARS.elena },
  { key: 'marcus', label: 'Portrait 2', url: THERAPIST_AVATARS.marcus },
  { key: 'sora', label: 'Portrait 3', url: THERAPIST_AVATARS.sora },
  { key: 'julian', label: 'Portrait 4', url: THERAPIST_AVATARS.julian },
];

function resizeImageFileToDataUrl(file: File, maxSize = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Selected file is not a valid image.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Unable to process image.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function StaffScheduleView() {
  const {
    isAdmin,
    staff,
    rooms,
    appointments,
    toggleStaffDuty,
    updateStaffSchedule,
    updateStaffProfile,
    createStaffMember,
    createRoom,
    updateRoom,
    deleteRoom,
  } = useStudio();

  const today = formatLocalDate(0);

  // Shift & Room Assignment modal state
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [workDays, setWorkDays] = useState<string[]>([]);
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('18:00');
  const [breakStart, setBreakStart] = useState('13:00');
  const [breakEnd, setBreakEnd] = useState('13:45');
  const [assignedRoomId, setAssignedRoomId] = useState('');
  const [onDuty, setOnDuty] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit Therapist Profile modal state
  const [editingProfileStaff, setEditingProfileStaff] = useState<StaffMember | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileRole, setProfileRole] = useState('');
  const [profileSpecialty, setProfileSpecialty] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Add Therapist modal state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('Massage Therapist');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [newRoomId, setNewRoomId] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('09:00');
  const [newShiftEnd, setNewShiftEnd] = useState('17:30');
  const [newAvatar, setNewAvatar] = useState(THERAPIST_AVATARS.elena);

  // Room Create / Edit modal state
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<SpaRoom | null>(null);
  const [roomNameInput, setRoomNameInput] = useState('');
  const [roomTypeInput, setRoomTypeInput] = useState('Standard Suite');
  const [roomNotesInput, setRoomNotesInput] = useState('');
  const [roomError, setRoomError] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);

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

  const activeRooms = useMemo(() => rooms.filter((r) => r.active), [rooms]);

  const resolveRoomName = (roomId: string): string => {
    if (!roomId) return 'Unassigned';
    return rooms.find((r) => r.id === roomId)?.name ?? 'Unassigned';
  };

  const openEditor = (member: StaffMember) => {
    setEditingStaff(member);
    setWorkDays(member.workDays);
    setShiftStart(member.shiftStart);
    setShiftEnd(member.shiftEnd);
    setBreakStart(member.breakStart);
    setBreakEnd(member.breakEnd);
    const matchedRoom =
      rooms.find((r) => r.id === member.assignedRoomId) ??
      rooms.find((r) => r.name.toLowerCase() === (member.assignedRoom || '').toLowerCase());
    setAssignedRoomId(matchedRoom?.id ?? '');
    setOnDuty(member.onDuty);
  };

  const toggleDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const openProfileEditor = (member: StaffMember) => {
    setEditingProfileStaff(member);
    setProfileName(member.name);
    setProfileRole(member.role);
    setProfileSpecialty(member.specialty);
    setProfileBio(member.bio || '');
    setProfileAvatarUrl(member.avatarUrl || '');
    setProfileError('');
  };

  const handleProfileImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (url: string) => void,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileError('');
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setter(dataUrl);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Unable to process selected image.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfileStaff) return;
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      setProfileError('Full Name is required.');
      return;
    }
    setProfileError('');
    setSavingProfile(true);
    try {
      await updateStaffProfile(editingProfileStaff.id, {
        name: trimmedName,
        role: profileRole.trim() || editingProfileStaff.role,
        specialty: profileSpecialty.trim(),
        bio: profileBio.trim(),
        avatarUrl: profileAvatarUrl.trim(),
      });
      setEditingProfileStaff(null);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Unable to save staff profile.');
    } finally {
      setSavingProfile(false);
    }
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
        assignedRoomId,
        assignedRoom: resolveRoomName(assignedRoomId),
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
        bio: 'Licensed wellness practitioner at WELL SPA.',
        avatarUrl: newAvatar,
        assignedRoomId: newRoomId,
        assignedRoom: resolveRoomName(newRoomId),
        workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        shiftStart: newShiftStart,
        shiftEnd: newShiftEnd,
        breakStart: '13:00',
        breakEnd: '13:45',
      });
      setNewName('');
      setNewSpecialty('');
      setNewRoomId('');
      setShowAddStaffModal(false);
    } finally {
      setSaving(false);
    }
  };

  const openCreateRoom = () => {
    setEditingRoom(null);
    setRoomNameInput('');
    setRoomTypeInput('Standard Suite');
    setRoomNotesInput('');
    setRoomError('');
    setShowRoomModal(true);
  };

  const openEditRoom = (room: SpaRoom) => {
    setEditingRoom(room);
    setRoomNameInput(room.name);
    setRoomTypeInput(room.roomType);
    setRoomNotesInput(room.notes);
    setRoomError('');
    setShowRoomModal(true);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomNameInput.trim()) {
      setRoomError('Please enter a room name.');
      return;
    }
    setRoomError('');
    setSavingRoom(true);
    try {
      if (editingRoom) {
        await updateRoom(editingRoom.id, {
          name: roomNameInput.trim(),
          roomType: roomTypeInput.trim() || 'Treatment Suite',
          notes: roomNotesInput.trim(),
        });
      } else {
        await createRoom({
          name: roomNameInput.trim(),
          roomType: roomTypeInput.trim() || 'Treatment Suite',
          notes: roomNotesInput.trim(),
        });
      }
      setShowRoomModal(false);
      setEditingRoom(null);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Unable to save room.');
    } finally {
      setSavingRoom(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Separate Rooms / Suites Management */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Treatment Rooms &amp; Suites
            </h2>
            <p className="text-sm text-slate-500">
              Create and manage massage rooms independently, then assign each therapist to their room below.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateRoom}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Room</span>
          </button>
        </div>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {rooms.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-4 bg-white border border-dashed border-slate-300 rounded-xl p-6 text-center text-sm text-slate-500">
              No treatment rooms created yet. Click <strong>Create Room</strong> to add your first massage room.
            </div>
          ) : (
            rooms.map((room) => {
              const assignedTherapists = staff.filter(
                (m) =>
                  m.assignedRoomId === room.id ||
                  m.assignedRoom.trim().toLowerCase() === room.name.trim().toLowerCase(),
              );
              return (
                <div
                  key={room.id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                        <DoorOpen className="w-4 h-4 text-teal-700" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-sm font-semibold text-slate-900 truncate">
                          {room.name}
                        </h3>
                        <p className="text-xs text-slate-500 truncate">{room.roomType}</p>
                      </div>
                    </div>

                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => updateRoom(room.id, { active: !room.active })}
                        className={`px-2 py-0.5 text-[11px] font-medium rounded border whitespace-nowrap shrink-0 cursor-pointer ${
                          room.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {room.active ? 'Ready' : 'Maintenance'}
                      </button>
                    ) : (
                      <span
                        className={`px-2 py-0.5 text-[11px] font-medium rounded border whitespace-nowrap shrink-0 ${
                          room.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                      >
                        {room.active ? 'Ready' : 'Maintenance'}
                      </span>
                    )}
                  </div>

                  {room.notes && (
                    <p className="text-xs text-slate-500 line-clamp-2">{room.notes}</p>
                  )}

                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600 truncate">
                      {assignedTherapists.length > 0
                        ? `Therapist: ${assignedTherapists.map((t) => t.name).join(', ')}`
                        : 'No therapist assigned'}
                    </span>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditRoom(room)}
                          className="p-1 text-slate-400 hover:text-teal-700 rounded cursor-pointer"
                          aria-label={`Edit ${room.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRoom(room.id)}
                          className="p-1 text-slate-400 hover:text-rose-700 rounded cursor-pointer"
                          aria-label={`Delete ${room.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      {/* Section 2: Therapists & Shift Coverage */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Therapists &amp; Shift Coverage
            </h2>
            <p className="text-sm text-slate-500">
              Manage therapist schedules, daily shifts, and which treatment room each therapist works in.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNewRoomId(activeRooms[0]?.id ?? '');
              setShowAddStaffModal(true);
            }}
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
            const currentRoom =
              rooms.find((r) => r.id === member.assignedRoomId)?.name ||
              member.assignedRoom ||
              'Unassigned';

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
                      <p className="text-xs text-slate-600 truncate">{member.role}</p>
                      <p className="text-xs text-slate-500 truncate mt-1">{member.specialty}</p>
                    </div>
                  </div>

                  {isAdmin ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openProfileEditor(member)}
                        aria-label={`Edit profile for ${member.name}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <Pencil className="w-3 h-3 text-teal-700" />
                        <span>Edit Profile</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStaffDuty(member.id, !member.onDuty)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap cursor-pointer transition-colors ${
                          member.onDuty
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {member.onDuty ? 'On Duty' : 'Off Duty'}
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 ${
                        member.onDuty
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {member.onDuty ? 'On Duty' : 'Off Duty'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <DoorOpen className="w-3.5 h-3.5 text-teal-700" />
                    <span>Assigned Room</span>
                  </span>
                  <span className="font-medium text-slate-900 truncate">{currentRoom}</span>
                </div>

                <div className="space-y-3 pt-1">
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
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => openEditor(member)}
                        className="text-xs font-medium text-teal-700 hover:text-teal-900 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Assign Room &amp; Shift
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {/* Edit Therapist Profile Modal (Full Name, Role, Specialties, Bio, Profile Image) */}
      {isAdmin && editingProfileStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Edit Staff Profile
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update full name, profile image, title, and specialties.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfileStaff(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close staff profile editor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
              {profileError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {profileError}
                </p>
              )}

              <div className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <TherapistAvatar
                  name={profileName || editingProfileStaff.name}
                  src={profileAvatarUrl}
                  sizeClass="w-16 h-16"
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-xs font-medium text-slate-700">Profile Image</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleProfileImageUpload(e, setProfileAvatarUrl)}
                        className="sr-only"
                      />
                    </label>
                    {profileAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => setProfileAvatarUrl('')}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        Use Initials
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-slate-700">Preset Portraits</span>
                <div className="grid grid-cols-4 gap-2">
                  {PRESET_PORTRAITS.map((preset) => {
                    const selected = profileAvatarUrl === preset.url;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => setProfileAvatarUrl(preset.url)}
                        className={`p-1.5 rounded-lg border flex flex-col items-center gap-1 text-[11px] cursor-pointer transition-colors ${
                          selected
                            ? 'border-teal-700 bg-teal-50 text-teal-800 font-medium'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        <TherapistAvatar name={preset.label} src={preset.url} sizeClass="w-9 h-9" />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-staff-avatar-url" className="text-xs font-medium text-slate-700">
                  Or Image URL
                </label>
                <input
                  id="edit-staff-avatar-url"
                  type="text"
                  value={profileAvatarUrl.startsWith('data:') ? '' : profileAvatarUrl}
                  onChange={(e) => setProfileAvatarUrl(e.target.value)}
                  placeholder={
                    profileAvatarUrl.startsWith('data:')
                      ? 'Uploaded image ready (or paste a URL to replace)'
                      : 'https://example.com/photo.jpg'
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-staff-fullname" className="text-xs font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  id="edit-staff-fullname"
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Enter full name"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-staff-role" className="text-xs font-medium text-slate-700">
                  Role / Title
                </label>
                <input
                  id="edit-staff-role"
                  type="text"
                  required
                  value={profileRole}
                  onChange={(e) => setProfileRole(e.target.value)}
                  placeholder="e.g. Lead Massage Therapist"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-staff-specialty" className="text-xs font-medium text-slate-700">
                  Specialties
                </label>
                <input
                  id="edit-staff-specialty"
                  type="text"
                  value={profileSpecialty}
                  onChange={(e) => setProfileSpecialty(e.target.value)}
                  placeholder="Deep Tissue · Hot Stone · Sports Recovery"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-staff-bio" className="text-xs font-medium text-slate-700">
                  Bio (optional)
                </label>
                <textarea
                  id="edit-staff-bio"
                  rows={2}
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  placeholder="Short practitioner bio shown in booking portal..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingProfileStaff(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Therapist Shift & Room Assignment Modal */}
      {isAdmin && editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Assign Room &amp; Shift · {editingStaff.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose which created massage room this therapist operates in.
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
                <label className="text-xs font-medium text-slate-700">Assigned Room</label>
                <select
                  value={assignedRoomId}
                  onChange={(e) => setAssignedRoomId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="">Unassigned</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.roomType}){!room.active ? ' — Maintenance' : ''}
                    </option>
                  ))}
                </select>
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
                  {saving ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Therapist Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">Add Therapist</h3>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
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
                  <label className="text-xs font-medium text-slate-700">Assign Room</label>
                  <select
                    value={newRoomId}
                    onChange={(e) => setNewRoomId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">Unassigned</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name}
                      </option>
                    ))}
                  </select>
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
              <div className="space-y-2">
                <span className="text-xs font-medium text-slate-700">Profile Image</span>
                <div className="flex items-center gap-3">
                  <TherapistAvatar
                    name={newName || 'New Therapist'}
                    src={newAvatar}
                    sizeClass="w-12 h-12"
                  />
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleProfileImageUpload(e, setNewAvatar)}
                      className="sr-only"
                    />
                  </label>
                  <select
                    value={PRESET_PORTRAITS.some((p) => p.url === newAvatar) ? newAvatar : ''}
                    onChange={(e) => {
                      if (e.target.value) setNewAvatar(e.target.value);
                    }}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">Custom / Uploaded Image</option>
                    {PRESET_PORTRAITS.map((preset) => (
                      <option key={preset.key} value={preset.url}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
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

      {/* Create / Edit Room Modal */}
      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingRoom ? `Edit Room · ${editingRoom.name}` : 'Create Massage Room'}
              </h3>
              <button
                type="button"
                onClick={() => setShowRoomModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close room modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRoom} className="p-6 space-y-4">
              {roomError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {roomError}
                </p>
              )}
              <div className="space-y-1.5">
                <label htmlFor="room-name-input" className="text-xs font-medium text-slate-700">
                  Room Name
                </label>
                <input
                  id="room-name-input"
                  type="text"
                  required
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value)}
                  placeholder="e.g. Room 105 — Lotus Suite"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="room-type-input" className="text-xs font-medium text-slate-700">
                  Room Type
                </label>
                <input
                  id="room-type-input"
                  type="text"
                  required
                  value={roomTypeInput}
                  onChange={(e) => setRoomTypeInput(e.target.value)}
                  placeholder="e.g. Standard Suite, Couples Suite, Thermal Suite"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="room-notes-input" className="text-xs font-medium text-slate-700">
                  Equipment &amp; Notes (optional)
                </label>
                <textarea
                  id="room-notes-input"
                  rows={2}
                  value={roomNotesInput}
                  onChange={(e) => setRoomNotesInput(e.target.value)}
                  placeholder="Heated massage table, hot stone warmer, aroma diffuser..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRoomModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRoom}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {savingRoom ? 'Saving...' : editingRoom ? 'Save Room' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
