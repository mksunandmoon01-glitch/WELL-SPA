import React, { useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { formatCurrency } from '../lib/seedStudio';
import type { Client, MembershipStatus } from '../types/spa';

const STATUS_STYLE: Record<MembershipStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'text-emerald-700' },
  paused: { label: 'Paused', className: 'text-amber-700' },
  cancelled: { label: 'Cancelled', className: 'text-rose-700' },
  none: { label: 'Pay-As-You-Go', className: 'text-slate-500' },
};

export function MembershipsView() {
  const {
    membershipTiers,
    clients,
    staff,
    createMembershipTier,
    createClient,
    assignClientMembership,
    updateClientMembershipStatus,
    adjustClientCredits,
    renewClientMembership,
  } = useStudio();

  const [filterStatus, setFilterStatus] = useState<'all' | MembershipStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [managingClient, setManagingClient] = useState<Client | null>(null);
  const [selectedTierId, setSelectedTierId] = useState('');
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddTier, setShowAddTier] = useState(false);

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientTierId, setClientTierId] = useState('');
  const [clientTherapistId, setClientTherapistId] = useState('');
  const [clientNotes, setClientNotes] = useState('');

  const [tierName, setTierName] = useState('');
  const [tierAudience, setTierAudience] = useState('For regular guests');
  const [tierPrice, setTierPrice] = useState(149);
  const [tierCredits, setTierCredits] = useState(1);
  const [tierDiscount, setTierDiscount] = useState(15);
  const [tierPriority, setTierPriority] = useState(48);
  const [tierPerks, setTierPerks] = useState('');
  const [saving, setSaving] = useState(false);

  const mrr = useMemo(() => {
    return clients
      .filter((c) => c.membershipStatus === 'active')
      .reduce((sum, c) => {
        const tier = membershipTiers.find((t) => t.id === c.membershipTierId);
        return sum + (tier?.monthlyPrice ?? 0);
      }, 0);
  }, [clients, membershipTiers]);

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return clients.filter((c) => {
      if (filterStatus !== 'all' && c.membershipStatus !== filterStatus) return false;
      if (
        q &&
        !c.fullName.toLowerCase().includes(q) &&
        !c.email.toLowerCase().includes(q) &&
        !c.membershipTierName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [clients, filterStatus, searchQuery]);

  const openManageModal = (c: Client) => {
    setManagingClient(c);
    setSelectedTierId(c.membershipTierId || membershipTiers[0]?.id || '');
  };

  const handleAssignTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingClient) return;
    setSaving(true);
    try {
      await assignClientMembership(managingClient.id, selectedTierId);
      setManagingClient(null);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;
    setSaving(true);
    try {
      await createClient({
        fullName: clientName,
        email: clientEmail,
        phone: clientPhone,
        notes: clientNotes,
        preferredTherapistId: clientTherapistId || staff[0]?.id || '',
        membershipTierId: clientTierId,
        smsOptIn: Boolean(clientPhone.trim()),
        emailOptIn: Boolean(clientEmail.trim()),
      });
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setClientTierId('');
      setClientNotes('');
      setShowAddClient(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierName.trim()) return;
    setSaving(true);
    try {
      await createMembershipTier({
        name: tierName,
        targetAudience: tierAudience,
        monthlyPrice: Number(tierPrice),
        creditsPerMonth: Number(tierCredits),
        retailDiscountPercent: Number(tierDiscount),
        priorityWindowHours: Number(tierPriority),
        perksSummary: tierPerks || `${tierCredits} monthly treatment credit(s) and ${tierDiscount}% retail discount.`,
      });
      setTierName('');
      setTierPerks('');
      setShowAddTier(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Membership Plans
            </h2>
            <p className="text-sm text-slate-500">
              Recurring monthly MRR:{' '}
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatCurrency(mrr)}/mo
              </span>{' '}
              · {clients.filter((c) => c.membershipStatus === 'active').length} active members
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddTier(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Plan Tier</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {membershipTiers.map((tier) => {
            const memberCount = clients.filter(
              (c) => c.membershipTierId === tier.id && c.membershipStatus === 'active',
            ).length;
            return (
              <div
                key={tier.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-medium text-teal-700">{tier.targetAudience}</p>
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      {memberCount} active
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {tier.name}
                    </h3>
                    <p className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(tier.monthlyPrice)}
                      <span className="text-xs font-normal text-slate-500">/mo</span>
                    </p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{tier.perksSummary}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">Credits</p>
                    <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      {tier.creditsPerMonth} / mo
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Retail</p>
                    <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      {tier.retailDiscountPercent}% off
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Priority</p>
                    <p className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      {tier.priorityWindowHours}h early
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'active', 'paused', 'none'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilterStatus(status)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    filterStatus === status
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status === 'all'
                    ? 'All Clients'
                    : status === 'active'
                      ? 'Active Members'
                      : status === 'paused'
                        ? 'Paused'
                        : 'Non-Members'}
                </button>
              ))}
            </div>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search client or plan..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddClient(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Client</span>
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Membership Plan</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Credits</th>
                  <th className="py-3 px-4">Next Renewal</th>
                  <th className="py-3 px-4 text-right">Visits · Spend</th>
                  <th className="py-3 px-4 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredClients.map((c) => {
                  const st = STATUS_STYLE[c.membershipStatus];
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">{c.fullName}</p>
                        <p className="text-xs text-slate-500">
                          {c.email || 'No email'} · {c.phone || 'No SMS'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-slate-800">{c.membershipTierName}</td>
                      <td className={`py-3 px-4 text-xs font-semibold whitespace-nowrap ${st.className}`}>
                        {st.label}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900 whitespace-nowrap">
                        {c.creditsRemaining}
                        {c.membershipStatus === 'active' && (
                          <button
                            type="button"
                            onClick={() => adjustClientCredits(c.id, 1)}
                            className="ml-2 px-1.5 py-0.5 text-[11px] border border-slate-200 rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                            title="Grant +1 credit"
                          >
                            +1
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {c.nextRenewalDate || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {c.totalVisits} · {formatCurrency(c.lifetimeSpend)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {c.membershipStatus === 'active' && (
                            <button
                              type="button"
                              onClick={() => renewClientMembership(c.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 border border-teal-200 hover:bg-teal-50 rounded-md cursor-pointer"
                              title="Grant renewal credits and dispatch notice"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Renew</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openManageModal(c)}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            Edit Plan
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {managingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Manage Membership · {managingClient.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Current credits: {managingClient.creditsRemaining}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagingClient(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAssignTier} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Membership Tier</label>
                <select
                  value={selectedTierId}
                  onChange={(e) => setSelectedTierId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="">No Membership (Pay-As-You-Go)</option>
                  {membershipTiers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({formatCurrency(t.monthlyPrice)}/mo · {t.creditsPerMonth} credits)
                    </option>
                  ))}
                </select>
              </div>

              {managingClient.membershipStatus !== 'none' && (
                <div className="flex items-center gap-2 pt-1">
                  {managingClient.membershipStatus === 'active' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await updateClientMembershipStatus(managingClient.id, 'paused');
                        setManagingClient(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-amber-800 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg cursor-pointer"
                    >
                      Pause Membership
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await updateClientMembershipStatus(managingClient.id, 'active');
                        setManagingClient(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-emerald-800 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-lg cursor-pointer"
                    >
                      Resume Membership
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await updateClientMembershipStatus(managingClient.id, 'cancelled');
                      setManagingClient(null);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-rose-700 border border-rose-200 hover:bg-rose-50 rounded-lg cursor-pointer"
                  >
                    Cancel Plan
                  </button>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setManagingClient(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Assign Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">Add Client Profile</h3>
              <button
                type="button"
                onClick={() => setShowAddClient(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateClient} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Phone (SMS)</label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Membership Tier</label>
                  <select
                    value={clientTierId}
                    onChange={(e) => setClientTierId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">None</option>
                    {membershipTiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Preferred Therapist</label>
                  <select
                    value={clientTherapistId}
                    onChange={(e) => setClientTherapistId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {staff.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Intake Notes</label>
                <textarea
                  rows={2}
                  value={clientNotes}
                  onChange={(e) => setClientNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddClient(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">New Membership Tier</h3>
              <button
                type="button"
                onClick={() => setShowAddTier(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTier} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Plan Name</label>
                  <input
                    type="text"
                    required
                    value={tierName}
                    onChange={(e) => setTierName(e.target.value)}
                    placeholder="e.g. Thermal Club"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Target Audience</label>
                  <input
                    type="text"
                    required
                    value={tierAudience}
                    onChange={(e) => setTierAudience(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Monthly Price ($)</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={tierPrice}
                    onChange={(e) => setTierPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Credits / Month</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={tierCredits}
                    onChange={(e) => setTierCredits(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Retail Discount (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={tierDiscount}
                    onChange={(e) => setTierDiscount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Priority Window (hrs)</label>
                  <input
                    type="number"
                    min={0}
                    value={tierPriority}
                    onChange={(e) => setTierPriority(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Perks Summary</label>
                <textarea
                  rows={2}
                  value={tierPerks}
                  onChange={(e) => setTierPerks(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddTier(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
