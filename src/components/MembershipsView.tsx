import React, { useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, ReceiptText, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { formatCurrency, formatLocalDate } from '../lib/seedStudio';
import type { Client, MembershipStatus, MembershipTier } from '../types/spa';

const STATUS_STYLE: Record<MembershipStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'text-emerald-700' },
  paused: { label: 'Paused', className: 'text-amber-700' },
  cancelled: { label: 'Cancelled', className: 'text-rose-700' },
  none: { label: 'Pay-As-You-Go', className: 'text-slate-500' },
};

export function MembershipsView() {
  const {
    isAdmin,
    membershipTiers,
    clients,
    staff,
    appointments,
    creditDeductions,
    createMembershipTier,
    updateMembershipTier,
    deleteMembershipTier,
    createClient,
    assignClientMembership,
    updateClientMembershipStatus,
    setClientCredits,
    deductClientCredits,
    updateClientPortalPassword,
    renewClientMembership,
  } = useStudio();

  const [filterStatus, setFilterStatus] = useState<'all' | MembershipStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [managingClient, setManagingClient] = useState<Client | null>(null);
  const [selectedTierId, setSelectedTierId] = useState('');
  const [managedCredits, setManagedCredits] = useState(0);
  const [manageError, setManageError] = useState('');

  const [resetPasswordClient, setResetPasswordClient] = useState<Client | null>(null);
  const [resetEmailInput, setResetEmailInput] = useState('');
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');

  const [renewingClient, setRenewingClient] = useState<Client | null>(null);
  const [renewalDateInput, setRenewalDateInput] = useState('');
  const [renewalError, setRenewalError] = useState('');

  const [creditHistoryClient, setCreditHistoryClient] = useState<Client | null>(null);
  const [deductCategory, setDeductCategory] = useState<'Order Item' | 'Massage' | 'Service'>('Order Item');
  const [deductDescription, setDeductDescription] = useState('');
  const [deductAmount, setDeductAmount] = useState(1);
  const [deductError, setDeductError] = useState('');

  const [showAddClient, setShowAddClient] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);
  const [deletingTier, setDeletingTier] = useState<MembershipTier | null>(null);

  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientPassword, setClientPassword] = useState('');
  const [clientTierId, setClientTierId] = useState('');
  const [clientTherapistId, setClientTherapistId] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [clientError, setClientError] = useState('');

  const [tierName, setTierName] = useState('');
  const [tierAudience, setTierAudience] = useState('For regular guests');
  const [tierPrice, setTierPrice] = useState(149);
  const [tierCredits, setTierCredits] = useState(149);
  const [tierDiscount, setTierDiscount] = useState(15);
  const [tierPriority, setTierPriority] = useState(48);
  const [tierPerks, setTierPerks] = useState('');
  const [tierError, setTierError] = useState('');
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
    if (!isAdmin) return;
    setManagingClient(c);
    setSelectedTierId(c.membershipTierId || '');
    setManagedCredits(c.creditsRemaining);
    setManageError('');
  };

  const openResetPasswordModal = (c: Client) => {
    if (!isAdmin) return;
    setResetPasswordClient(c);
    setResetEmailInput(c.email || '');
    setResetPasswordInput('');
    setResetPasswordError('');
  };

  const openRenewModal = (c: Client) => {
    if (!isAdmin) return;
    setRenewingClient(c);
    setRenewalDateInput(c.nextRenewalDate || formatLocalDate(30));
    setRenewalError('');
  };

  const openCreditHistoryModal = (c: Client) => {
    setCreditHistoryClient(c);
    setDeductCategory('Order Item');
    setDeductDescription('');
    setDeductAmount(c.creditsRemaining > 0 ? Math.min(25, c.creditsRemaining) : 0);
    setDeductError('');
  };

  const openNewTierModal = () => {
    setEditingTier(null);
    setTierName('');
    setTierAudience('For regular guests');
    setTierPrice(149);
    setTierCredits(149);
    setTierDiscount(15);
    setTierPriority(48);
    setTierPerks('');
    setTierError('');
    setShowTierModal(true);
  };

  const openEditTierModal = (tier: MembershipTier) => {
    setEditingTier(tier);
    setTierName(tier.name);
    setTierAudience(tier.targetAudience);
    setTierPrice(tier.monthlyPrice);
    setTierCredits(tier.creditsPerMonth);
    setTierDiscount(tier.retailDiscountPercent);
    setTierPriority(tier.priorityWindowHours);
    setTierPerks(tier.perksSummary);
    setTierError('');
    setShowTierModal(true);
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    setTierError('');
    if (!tierName.trim()) {
      setTierError('Plan tier name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: tierName.trim(),
        targetAudience: tierAudience.trim() || 'For regular guests',
        monthlyPrice: Math.max(0, Number(tierPrice) || 0),
        creditsPerMonth: Math.max(0, Math.floor(Number(tierCredits) || 0)),
        retailDiscountPercent: Math.max(0, Math.min(100, Number(tierDiscount) || 0)),
        priorityWindowHours: Math.max(0, Number(tierPriority) || 0),
        perksSummary:
          tierPerks.trim() ||
          `${Math.max(0, Math.floor(Number(tierCredits) || 0))} credits/mo ($1/credit, never expire) and ${tierDiscount}% retail discount.`,
      };
      if (editingTier) {
        await updateMembershipTier(editingTier.id, payload);
      } else {
        await createMembershipTier(payload);
      }
      setShowTierModal(false);
      setEditingTier(null);
    } catch (err) {
      setTierError(err instanceof Error ? err.message : 'Unable to save plan tier.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteTier = async () => {
    if (!deletingTier) return;
    setSaving(true);
    try {
      await deleteMembershipTier(deletingTier.id);
      setDeletingTier(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveManagedMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingClient || !isAdmin) return;
    setManageError('');

    setSaving(true);
    try {
      if (selectedTierId !== managingClient.membershipTierId) {
        await assignClientMembership(managingClient.id, selectedTierId);
      }
      if (Number.isFinite(managedCredits) && Math.floor(managedCredits) !== managingClient.creditsRemaining) {
        await setClientCredits(managingClient.id, Math.max(0, Math.floor(managedCredits)));
      }
      setManagingClient(null);
    } catch (err) {
      setManageError(err instanceof Error ? err.message : 'Unable to update member details.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetClientPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordClient || !isAdmin) return;
    setResetPasswordError('');
    const cleanEmail = resetEmailInput.trim().toLowerCase();
    if (!cleanEmail) {
      setResetPasswordError('Login email address is required so the client can sign in.');
      return;
    }
    if (resetPasswordInput.length < 6) {
      setResetPasswordError('New password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      const emailChanged = cleanEmail !== (resetPasswordClient.email || '').trim().toLowerCase();
      await updateClientPortalPassword(
        resetPasswordClient.id,
        resetPasswordInput,
        emailChanged ? cleanEmail : undefined,
      );
      setResetPasswordClient(null);
      setResetPasswordInput('');
    } catch (err) {
      setResetPasswordError(err instanceof Error ? err.message : 'Unable to reset client password.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRenewalDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingClient || !isAdmin) return;
    setRenewalError('');
    if (!renewalDateInput || !/^\d{4}-\d{2}-\d{2}$/.test(renewalDateInput)) {
      setRenewalError('Please choose a valid next renewal date.');
      return;
    }
    setSaving(true);
    try {
      await renewClientMembership(renewingClient.id, renewalDateInput);
      setRenewingClient(null);
    } catch (err) {
      setRenewalError(err instanceof Error ? err.message : 'Unable to update next renewal date.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditHistoryClient || !isAdmin) return;
    const liveClient = clients.find((c) => c.id === creditHistoryClient.id) ?? creditHistoryClient;
    setDeductError('');
    const desc = deductDescription.trim();
    const amt = Math.floor(Number(deductAmount) || 0);
    if (!desc) {
      setDeductError('Enter what this deduction is for (e.g. Massage or ordered item).');
      return;
    }
    if (amt <= 0) {
      setDeductError('Deduction must be at least 1 credit ($1).');
      return;
    }
    if (amt > liveClient.creditsRemaining) {
      setDeductError(`Client only has ${liveClient.creditsRemaining} credits remaining.`);
      return;
    }
    setSaving(true);
    try {
      await deductClientCredits(liveClient.id, {
        creditsToDeduct: amt,
        category: deductCategory,
        description: desc,
      });
      setDeductDescription('');
      const nextRemaining = Math.max(0, liveClient.creditsRemaining - amt);
      setDeductAmount(nextRemaining > 0 ? Math.min(25, nextRemaining) : 0);
    } catch (err) {
      setDeductError(err instanceof Error ? err.message : 'Unable to deduct credits.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError('');
    if (!clientName.trim()) return;
    if (clientPassword.trim() && clientPassword.trim().length < 6) {
      setClientError('Portal password must be at least 6 characters.');
      return;
    }
    setSaving(true);
    try {
      await createClient({
        fullName: clientName.trim(),
        email: clientEmail.trim(),
        phone: clientPhone.trim(),
        notes: clientNotes.trim(),
        preferredTherapistId: clientTherapistId || staff[0]?.id || '',
        membershipTierId: clientTierId,
        smsOptIn: Boolean(clientPhone.trim()),
        emailOptIn: Boolean(clientEmail.trim()),
        password: clientPassword.trim() || undefined,
      });
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setClientPassword('');
      setClientTierId('');
      setClientNotes('');
      setShowAddClient(false);
    } catch (err) {
      setClientError(err instanceof Error ? err.message : 'Unable to create client.');
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
              · {clients.filter((c) => c.membershipStatus === 'active').length} active members ·{' '}
              <span className="text-teal-700 font-medium">1 credit = $1 · No expiration</span>
            </p>
          </div>
          <button
            type="button"
            onClick={openNewTierModal}
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
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-teal-700">{tier.targetAudience}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-slate-500 tabular-nums mr-1">
                        {memberCount} active
                      </span>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditTierModal(tier)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            title={`Edit ${tier.name}`}
                            aria-label={`Edit ${tier.name}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingTier(tier)}
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title={`Delete ${tier.name}`}
                            aria-label={`Delete ${tier.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {tier.name}
                    </h3>
                    <p className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(tier.monthlyPrice)}
                    </p>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{tier.perksSummary}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-slate-500">Credits ($1 ea)</p>
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
            onClick={() => {
              setClientError('');
              setShowAddClient(true);
            }}
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
                  <th className="py-3 px-4 text-right">Credits ($1 ea · No Expiry)</th>
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
                        <button
                          type="button"
                          onClick={() => openCreditHistoryModal(c)}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-200 hover:border-teal-600 hover:bg-teal-50/60 text-slate-900 transition-colors cursor-pointer"
                          title="View credit deduction history (Massage, order items)"
                        >
                          <ReceiptText className="w-3 h-3 text-teal-700" />
                          <span>{c.creditsRemaining}</span>
                          <span className="text-slate-500">
                            ({formatCurrency(c.creditsRemaining)})
                          </span>
                        </button>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {c.nextRenewalDate || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {c.totalVisits} · {formatCurrency(c.lifetimeSpend)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isAdmin ? (
                          <div className="inline-flex items-center gap-2">
                            {c.membershipStatus === 'active' && (
                              <button
                                type="button"
                                onClick={() => openRenewModal(c)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-teal-800 border border-teal-200 hover:bg-teal-50 rounded-md cursor-pointer"
                                title="Change next renewal date"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Renew</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openResetPasswordModal(c)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
                              title={`Reset portal password for ${c.fullName}`}
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Reset Password</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openManageModal(c)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
                            >
                              Edit Plan
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Admin Only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {isAdmin && managingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Manage Membership · {managingClient.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Current credits: {managingClient.creditsRemaining} ({formatCurrency(managingClient.creditsRemaining)} · No expiry)
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
            <form onSubmit={handleSaveManagedMember} className="p-6 space-y-4">
              {manageError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {manageError}
                </p>
              )}

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

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Credit Balance (1 credit = $1 · Never expires)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={managedCredits}
                    onChange={(e) => setManagedCredits(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                  <span className="text-xs font-mono text-slate-600 whitespace-nowrap shrink-0">
                    = {formatCurrency(managedCredits)}
                  </span>
                </div>
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
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdmin && resetPasswordClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Reset Client Password
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {resetPasswordClient.fullName} ·{' '}
                  {resetPasswordClient.membershipStatus === 'none'
                    ? 'Non-Member (Pay-As-You-Go)'
                    : `${resetPasswordClient.membershipTierName} (${STATUS_STYLE[resetPasswordClient.membershipStatus].label})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setResetPasswordClient(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close reset password dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetClientPassword} className="p-6 space-y-4">
              {resetPasswordError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {resetPasswordError}
                </p>
              )}

              <div className="space-y-1.5">
                <label htmlFor="reset-client-email" className="text-xs font-medium text-slate-700">
                  Client Sign-In Email
                </label>
                <input
                  id="reset-client-email"
                  type="email"
                  required
                  value={resetEmailInput}
                  onChange={(e) => setResetEmailInput(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reset-client-password" className="text-xs font-medium text-slate-700">
                  New Portal Password (min 6 characters)
                </label>
                <input
                  id="reset-client-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={resetPasswordInput}
                  onChange={(e) => setResetPasswordInput(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <p className="text-[11px] text-slate-500">
                  Works for both Membership and Non-Membership clients. They can sign in immediately with this email and password.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setResetPasswordClient(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdmin && renewingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Change Next Renewal Date
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {renewingClient.fullName} · {renewingClient.membershipTierName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRenewingClient(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close renewal date dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRenewalDate} className="p-6 space-y-4">
              {renewalError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {renewalError}
                </p>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs flex items-center justify-between">
                <span className="text-slate-500">Current Credits (Unchanged)</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {renewingClient.creditsRemaining} credits ({formatCurrency(renewingClient.creditsRemaining)})
                </span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="next-renewal-date" className="text-xs font-medium text-slate-700">
                  Next Renewal Date
                </label>
                <input
                  id="next-renewal-date"
                  type="date"
                  required
                  value={renewalDateInput}
                  onChange={(e) => setRenewalDateInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <p className="text-[11px] text-slate-500">
                  Updates the next membership renewal date only. Existing credit balance is not increased.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setRenewingClient(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Updating...' : 'Save Renewal Date'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {creditHistoryClient && (() => {
        const liveClient =
          clients.find((cl) => cl.id === creditHistoryClient.id) ?? creditHistoryClient;
        const appointmentDeductions = appointments
          .filter((a) => {
            if (a.clientId !== liveClient.id || a.status === 'cancelled') return false;
            const used =
              typeof a.creditsUsed === 'number'
                ? a.creditsUsed
                : a.usedMembershipCredit
                  ? a.price
                  : 0;
            return used > 0;
          })
          .map((a) => {
            const used =
              typeof a.creditsUsed === 'number'
                ? a.creditsUsed
                : a.usedMembershipCredit
                  ? a.price
                  : 0;
            return {
              id: `apt_${a.id}`,
              date: a.date,
              category: 'Massage / Treatment',
              description: `${a.serviceName} · ${a.startTime} (${a.staffName})`,
              creditsDeducted: used,
            };
          });

        const itemDeductions = creditDeductions
          .filter((d) => d.clientId === liveClient.id)
          .map((d) => ({
            id: `ded_${d.id}`,
            date: d.date,
            category: d.category,
            description: d.description,
            creditsDeducted: d.creditsDeducted,
          }));

        const allDeductions = [...itemDeductions, ...appointmentDeductions].sort((a, b) =>
          b.date.localeCompare(a.date),
        );
        const totalDeducted = allDeductions.reduce((sum, item) => sum + item.creditsDeducted, 0);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Credit Deductions · {liveClient.fullName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Remaining:{' '}
                    <span className="font-mono font-semibold text-teal-800 tabular-nums">
                      {liveClient.creditsRemaining} credits ({formatCurrency(liveClient.creditsRemaining)})
                    </span>{' '}
                    · Total Deducted:{' '}
                    <span className="font-mono font-semibold text-slate-800 tabular-nums">
                      -{totalDeducted} cr (-{formatCurrency(totalDeducted)})
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCreditHistoryClient(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                  aria-label="Close credit deductions dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-900">
                    Deduction History (Massage &amp; Ordered Items)
                  </p>
                  {allDeductions.length === 0 ? (
                    <div className="border border-dashed border-slate-200 rounded-lg p-5 text-center text-xs text-slate-500">
                      No credit deductions recorded yet for massages or ordered items.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                      {allDeductions.map((item) => (
                        <div
                          key={item.id}
                          className="px-4 py-3 flex items-center justify-between gap-4 text-xs"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-900 truncate">
                                {item.description}
                              </span>
                            </div>
                            <p className="text-slate-500">
                              <span className="font-mono tabular-nums">{item.date}</span> ·{' '}
                              {item.category}
                            </p>
                          </div>
                          <span className="font-mono font-semibold text-rose-700 tabular-nums whitespace-nowrap shrink-0">
                            -{item.creditsDeducted} cr (-{formatCurrency(item.creditsDeducted)})
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isAdmin && liveClient.creditsRemaining > 0 && (
                  <form
                    onSubmit={handleRecordDeduction}
                    className="pt-4 border-t border-slate-200 space-y-3"
                  >
                    <p className="text-xs font-semibold text-slate-900">
                      Deduct Credits for Massage or Ordered Items
                    </p>
                    {deductError && (
                      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                        {deductError}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <label htmlFor="deduct-cat" className="text-[11px] font-medium text-slate-600">
                          Type
                        </label>
                        <select
                          id="deduct-cat"
                          value={deductCategory}
                          onChange={(e) =>
                            setDeductCategory(e.target.value as 'Order Item' | 'Massage' | 'Service')
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          <option value="Order Item">Order Item</option>
                          <option value="Massage">Massage</option>
                          <option value="Service">Service</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <label htmlFor="deduct-desc" className="text-[11px] font-medium text-slate-600">
                          Item / Treatment Description
                        </label>
                        <input
                          id="deduct-desc"
                          type="text"
                          required
                          value={deductDescription}
                          onChange={(e) => setDeductDescription(e.target.value)}
                          placeholder="e.g. Aroma Body Oil, 60m Massage"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <label htmlFor="deduct-amt" className="text-[11px] font-medium text-slate-600">
                          Credits to Deduct (max {liveClient.creditsRemaining} · $1/credit)
                        </label>
                        <input
                          id="deduct-amt"
                          type="number"
                          min={1}
                          max={liveClient.creditsRemaining}
                          required
                          value={deductAmount > 0 ? deductAmount : ''}
                          onChange={(e) =>
                            setDeductAmount(
                              e.target.value === ''
                                ? 0
                                : Math.max(
                                    0,
                                    Math.min(
                                      liveClient.creditsRemaining,
                                      Math.floor(Number(e.target.value) || 0),
                                    ),
                                  ),
                            )
                          }
                          className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-lg"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        {saving ? 'Deducting...' : 'Deduct Credits'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex justify-end">
                <button
                  type="button"
                  onClick={() => setCreditHistoryClient(null)}
                  className="px-4 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
              {clientError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {clientError}
                </p>
              )}
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
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Member Portal Password (optional, min 6 chars)
                </label>
                <input
                  type="password"
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Allow client to sign in to portal"
                  value={clientPassword}
                  onChange={(e) => setClientPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
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

      {showTierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {editingTier ? `Edit Plan Tier · ${editingTier.name}` : 'New Membership Tier'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  1 credit = $1 value · Credits never expire
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTierModal(false);
                  setEditingTier(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveTier} className="p-6 space-y-4">
              {tierError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {tierError}
                </p>
              )}
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
                  <label className="text-xs font-medium text-slate-700">Price ($)</label>
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
                  <label className="text-xs font-medium text-slate-700">
                    Credits / Month ($1 ea)
                  </label>
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
                  onClick={() => {
                    setShowTierModal(false);
                    setEditingTier(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingTier ? 'Save Plan Tier' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAdmin && deletingTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Delete Plan Tier
              </h3>
              <button
                type="button"
                onClick={() => setDeletingTier(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-slate-900">{deletingTier.name}</span>? Members on this tier will move to Pay-As-You-Go, and all of their existing credits will be preserved without expiring.
              </p>
              <div className="pt-2 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeletingTier(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleConfirmDeleteTier}
                  className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Deleting...' : 'Delete Plan Tier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
