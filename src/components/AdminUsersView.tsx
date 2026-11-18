import React, { useState } from 'react';
import { Cloud, CloudOff, KeyRound, Plus, RefreshCw, Shield, Trash2, X } from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { useStudio } from '../context/StudioContext';
import type {
  AuthorizedUser,
  AuthorizedUserRole,
  PermissionKey,
  UserPermissions,
} from '../types/spa';

const PERMISSION_META: { key: PermissionKey; label: string; summary: string }[] = [
  { key: 'appointments', label: 'Appointments', summary: 'View & update bookings' },
  { key: 'staff', label: 'Staff Schedule', summary: 'Manage shifts & rooms' },
  { key: 'memberships', label: 'Memberships', summary: 'Tiers, credits & clients' },
  { key: 'notifications', label: 'Notifications', summary: 'Rules & alert dispatch' },
  { key: 'services', label: 'Services', summary: 'Treatments & pricing' },
  { key: 'reports', label: 'Reports', summary: 'Daily & monthly revenue' },
  { key: 'booking_portal', label: 'Client Booking', summary: 'Front-desk portal' },
  { key: 'users', label: 'User Access', summary: 'Create & edit permissions' },
];

function presetPermissions(role: AuthorizedUserRole): UserPermissions {
  if (role === 'admin') {
    return {
      appointments: true,
      staff: true,
      memberships: true,
      notifications: true,
      services: true,
      reports: true,
      booking_portal: true,
      users: true,
    };
  }
  if (role === 'manager') {
    return {
      appointments: true,
      staff: true,
      memberships: true,
      notifications: true,
      services: true,
      reports: true,
      booking_portal: true,
      users: false,
    };
  }
  return {
    appointments: true,
    staff: true,
    memberships: false,
    notifications: false,
    services: false,
    reports: false,
    booking_portal: true,
    users: false,
  };
}

function formatPermissionsSummary(perms: UserPermissions): string {
  const activeLabels = PERMISSION_META.filter((m) => perms[m.key]).map((m) => m.label);
  if (activeLabels.length === PERMISSION_META.length) return 'Full workspace access';
  if (activeLabels.length === 0) return 'No modules assigned';
  return activeLabels.join(' · ');
}

export function AdminUsersView() {
  const {
    isAdmin,
    authorizedUsers,
    hasPermission,
    createAuthorizedUser,
    updateAuthorizedUser,
    toggleAuthorizedUserActive,
    deleteAuthorizedUser,
    clearNonAdminUsers,
    firebaseUserEmail,
    firebaseSyncStatus,
    firebaseSyncError,
    firebaseLastSyncedAt,
    connectFirebaseSync,
    disconnectFirebaseSync,
    syncNowToFirebase,
    clearSimulationData,
  } = useStudio();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AuthorizedUserRole>('staff');
  const [permissions, setPermissions] = useState<UserPermissions>(() => presetPermissions('staff'));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [editingUser, setEditingUser] = useState<AuthorizedUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<AuthorizedUserRole>('staff');
  const [editPermissions, setEditPermissions] = useState<UserPermissions>(() =>
    presetPermissions('staff'),
  );
  const [editError, setEditError] = useState('');

  const [passwordUser, setPasswordUser] = useState<AuthorizedUser | null>(null);
  const [newUserPassword, setNewUserPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmPurgeSimOpen, setConfirmPurgeSimOpen] = useState(false);
  const [purgingSim, setPurgingSim] = useState(false);

  if (!hasPermission('users')) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-slate-700">
          User access and permission control is restricted to authorized administrators.
        </p>
      </div>
    );
  }

  const handleRolePreset = (nextRole: AuthorizedUserRole) => {
    setRole(nextRole);
    setPermissions(presetPermissions(nextRole));
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail.length < 3) {
      setErrorMsg('Please enter a valid email or login ID.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await createAuthorizedUser({
        email: cleanEmail,
        fullName: fullName.trim(),
        password,
        role,
        permissions,
      });
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('staff');
      setPermissions(presetPermissions('staff'));
      setShowCreateModal(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (entry: AuthorizedUser) => {
    setEditingUser(entry);
    setEditName(entry.fullName);
    setEditRole(entry.role);
    setEditPermissions({ ...entry.permissions });
    setEditError('');
  };

  const handleSavePermissions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError('');
    setSaving(true);
    try {
      await updateAuthorizedUser(editingUser.uid, {
        fullName: editName.trim(),
        role: editRole,
        permissions: editPermissions,
      });
      setEditingUser(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Unable to update permissions.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUser) return;
    setPasswordError('');
    if (newUserPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await updateAuthorizedUser(passwordUser.uid, { password: newUserPassword });
      setPasswordUser(null);
      setNewUserPassword('');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Unable to update password.');
    } finally {
      setSaving(false);
    }
  };

  const nonPrimaryCount = authorizedUsers.filter((u) => !u.isPrimaryAdmin).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Admin User Control &amp; Permissions
          </h2>
          <p className="text-sm text-slate-500">
            Create studio accounts, assign module permissions, and set passwords directly—no external email verification required. Sessions expire after 8 hours.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {isAdmin && nonPrimaryCount > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Staff Users</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setErrorMsg('');
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Assigned Permissions</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {authorizedUsers.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-900">
                      {entry.fullName}
                      {entry.isPrimaryAdmin && (
                        <span className="ml-2 text-xs font-normal text-teal-700">
                          · Primary Admin
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-slate-500">{entry.email}</p>
                  </td>
                  <td className="py-3 px-4 capitalize text-slate-700">{entry.role}</td>
                  <td className="py-3 px-4 text-xs text-slate-600 max-w-md">
                    {formatPermissionsSummary(entry.permissions)}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium">
                    <span className={entry.active ? 'text-emerald-700' : 'text-rose-700'}>
                      {entry.active ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {isAdmin ? (
                      <div className="inline-flex items-center gap-2">
                        {!entry.isPrimaryAdmin && (
                          <button
                            type="button"
                            onClick={() => openEditModal(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                          >
                            <Shield className="w-3 h-3" />
                            <span>Permissions</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPasswordUser(entry);
                            setNewUserPassword('');
                            setPasswordError('');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Password</span>
                        </button>
                        {!entry.isPrimaryAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleAuthorizedUserActive(entry.uid, !entry.active)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md cursor-pointer"
                            >
                              {entry.active ? 'Suspend' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAuthorizedUser(entry.uid)}
                              className="p-1.5 text-slate-400 hover:text-rose-700 rounded-md cursor-pointer"
                              aria-label={`Remove ${entry.email}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Admin Only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Production &amp; Firebase Real-Time Sync
              </h3>
              <span
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md border ${
                  firebaseSyncStatus === 'live'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : firebaseSyncStatus === 'connecting'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : firebaseSyncStatus === 'error'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                {firebaseSyncStatus === 'live'
                  ? 'Live'
                  : firebaseSyncStatus === 'connecting'
                    ? 'Connecting...'
                    : firebaseSyncStatus === 'error'
                      ? 'Sync Error'
                      : 'Disconnected'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Project <span className="font-mono text-slate-700">{firebaseConfig.projectId}</span> · Firestore{' '}
              <span className="font-mono text-slate-700">
                {firebaseConfig.firestoreDatabaseId}
              </span>
              {firebaseUserEmail ? (
                <>
                  {' '}
                  · Connected as{' '}
                  <span className="font-mono text-slate-700">{firebaseUserEmail}</span>
                </>
              ) : null}
              {firebaseLastSyncedAt ? (
                <> · Last synced {new Date(firebaseLastSyncedAt).toLocaleTimeString()}</>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {firebaseSyncStatus === 'live' ? (
              <>
                <button
                  type="button"
                  onClick={() => void syncNowToFirebase()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => void disconnectFirebaseSync()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                >
                  <CloudOff className="w-3.5 h-3.5" />
                  <span>Pause Sync</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={firebaseSyncStatus === 'connecting'}
                onClick={() => void connectFirebaseSync()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>
                  {firebaseSyncStatus === 'connecting'
                    ? 'Connecting...'
                    : 'Connect Firebase Sync'}
                </span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmPurgeSimOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Simulation Data</span>
              </button>
            )}
          </div>
        </div>

        {firebaseSyncStatus === 'error' && firebaseSyncError && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {firebaseSyncError}
          </p>
        )}
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCreateUser}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Create Studio User
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close create user dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {errorMsg}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="user-name" className="text-xs font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  id="user-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Elena Vance"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user-email" className="text-xs font-medium text-slate-700">
                  Email or Login ID
                </label>
                <input
                  id="user-email"
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="elena@wellspa.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user-password" className="text-xs font-medium text-slate-700">
                  Password (min 8 chars)
                </label>
                <input
                  id="user-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Assign password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="user-role" className="text-xs font-medium text-slate-700">
                  Role Preset
                </label>
                <select
                  id="user-role"
                  value={role}
                  onChange={(e) => handleRolePreset(e.target.value as AuthorizedUserRole)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="staff">Staff (Front Desk / Therapist)</option>
                  <option value="manager">Manager (Operations &amp; Reports)</option>
                  <option value="admin">Administrator (Full Control)</option>
                </select>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">Module Permissions</p>
                <span className="text-[11px] text-slate-500">
                  Edit, Reset Password &amp; Delete are Admin-only
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PERMISSION_META.map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={permissions[perm.key]}
                      onChange={(e) =>
                        setPermissions((prev) => ({
                          ...prev,
                          [perm.key]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span className="text-xs leading-tight">
                      <span className="font-medium text-slate-900 block">{perm.label}</span>
                      <span className="text-slate-500">{perm.summary}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSavePermissions}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Edit User Permissions
                </h3>
                <p className="text-xs font-mono text-slate-500">{editingUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close permissions dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {editError}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="edit-user-name" className="text-xs font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  id="edit-user-name"
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-user-role" className="text-xs font-medium text-slate-700">
                  Role Preset
                </label>
                <select
                  id="edit-user-role"
                  value={editRole}
                  onChange={(e) => {
                    const next = e.target.value as AuthorizedUserRole;
                    setEditRole(next);
                    setEditPermissions(presetPermissions(next));
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-900">Assigned Permissions</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {PERMISSION_META.map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-start gap-2.5 p-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={editPermissions[perm.key]}
                      onChange={(e) =>
                        setEditPermissions((prev) => ({
                          ...prev,
                          [perm.key]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                    />
                    <span className="text-xs leading-tight">
                      <span className="font-medium text-slate-900 block">{perm.label}</span>
                      <span className="text-slate-500">{perm.summary}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </form>
        </div>
      )}

      {passwordUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleResetUserPassword}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Set New Password
                </h3>
                <p className="text-xs font-mono text-slate-500">{passwordUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordUser(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Close password dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordError && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {passwordError}
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="reset-user-pw" className="text-xs font-medium text-slate-700">
                New Password (min 8 chars)
              </label>
              <input
                id="reset-user-pw"
                type="password"
                required
                minLength={8}
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPasswordUser(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmClearOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Clear All Staff Users?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This removes all {nonPrimaryCount} non-primary user account(s) immediately while keeping the primary administrator account and all spa data intact.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await clearNonAdminUsers();
                  setConfirmClearOpen(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg cursor-pointer"
              >
                Clear Staff Users
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmPurgeSimOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-display text-base font-semibold text-slate-900">
              Clear All Simulation Data?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This removes any legacy demo/sample spa records from both local SQLite and connected Firebase Firestore while preserving your production accounts and real studio entries.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmPurgeSimOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purgingSim}
                onClick={async () => {
                  setPurgingSim(true);
                  try {
                    await clearSimulationData();
                    setConfirmPurgeSimOpen(false);
                  } finally {
                    setPurgingSim(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {purgingSim ? 'Clearing...' : 'Clear Simulation Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
