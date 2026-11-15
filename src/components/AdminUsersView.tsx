import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { PRIMARY_ADMIN_EMAIL } from '../lib/seedStudio';
import type { AuthorizedUserRole } from '../types/spa';

export function AdminUsersView() {
  const {
    authorizedUsers,
    isPrimaryAdmin,
    createAuthorizedUser,
    toggleAuthorizedUserActive,
    deleteAuthorizedUser,
  } = useStudio();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AuthorizedUserRole>('staff');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isPrimaryAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <p className="text-sm font-medium text-slate-700">
          User access management is restricted to the primary administrator.
        </p>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
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
      });
      setFullName('');
      setEmail('');
      setPassword('');
      setRole('staff');
      setShowCreateModal(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Authorized Users &amp; Shared Database Access
          </h2>
          <p className="text-sm text-slate-500">
            Only accounts created here can sign in and access the shared SUN &amp; MOON Hotel, WELL SPA database. Sessions expire after 8 hours.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setErrorMsg('');
            setShowCreateModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Create User</span>
        </button>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Shared DB Access</th>
                <th className="py-3 px-4 text-right">Manage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              <tr className="bg-slate-50/40">
                <td className="py-3 px-4 font-medium text-slate-900">Primary Administrator</td>
                <td className="py-3 px-4 font-mono text-xs text-slate-700">{PRIMARY_ADMIN_EMAIL}</td>
                <td className="py-3 px-4 text-xs font-medium text-slate-700">Admin</td>
                <td className="py-3 px-4 text-xs font-semibold text-emerald-700">Active</td>
                <td className="py-3 px-4 text-right text-xs text-slate-400">System Owner</td>
              </tr>

              {authorizedUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-900">{u.fullName}</td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700">{u.email}</td>
                  <td className="py-3 px-4 text-xs font-medium text-slate-700 capitalize">
                    {u.role}
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold">
                    {u.active ? (
                      <span className="text-emerald-700">Active</span>
                    ) : (
                      <span className="text-rose-700">Disabled</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleAuthorizedUserActive(u.id, !u.active)}
                        className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAuthorizedUser(u.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-700 rounded-md cursor-pointer"
                        aria-label={`Remove ${u.fullName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Create Team User
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Creates login credentials and grants shared WELL SPA database access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {errorMsg && (
                <div className="px-3 py-2 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-700">
                  {errorMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Front Desk Manager"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@sunandmoonhotel.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AuthorizedUserRole)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="staff">Staff / Reception</option>
                  <option value="admin">Co-Admin</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
