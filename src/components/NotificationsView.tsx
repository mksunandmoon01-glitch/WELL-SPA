import React, { useMemo, useState } from 'react';
import { Send, X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { renderNotificationTemplate } from '../lib/seedStudio';
import type { NotificationChannel, NotificationLogStatus, NotificationRule } from '../types/spa';

export function NotificationsView() {
  const {
    studio,
    clients,
    notificationRules,
    notificationLogs,
    toggleNotificationRule,
    updateNotificationRule,
    dispatchScheduledNotification,
    dispatchAllPendingNotifications,
    sendManualNotification,
  } = useStudio();

  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
  const [ruleChannel, setRuleChannel] = useState<NotificationRule['channel']>('Email + SMS');
  const [ruleTiming, setRuleTiming] = useState('');
  const [ruleSubject, setRuleSubject] = useState('');
  const [ruleBody, setRuleBody] = useState('');
  const [ruleEnabled, setRuleEnabled] = useState(true);

  const [logChannelFilter, setLogChannelFilter] = useState<'all' | NotificationChannel>('all');
  const [logStatusFilter, setLogStatusFilter] = useState<'all' | NotificationLogStatus>('all');
  const [showComposeModal, setShowComposeModal] = useState(false);

  const [composeClientId, setComposeClientId] = useState('');
  const [composeChannel, setComposeChannel] = useState<NotificationChannel>('SMS');
  const [composeSubject, setComposeSubject] = useState('Studio Update from SUN & MOON Hotel, WELL SPA');
  const [composeBody, setComposeBody] = useState('');
  const [saving, setSaving] = useState(false);

  const pendingCount = useMemo(
    () => notificationLogs.filter((l) => l.status === 'scheduled').length,
    [notificationLogs],
  );

  const totalSentCount = useMemo(
    () => notificationRules.reduce((sum, r) => sum + r.sentCount, 0),
    [notificationRules],
  );

  const filteredLogs = useMemo(() => {
    return notificationLogs.filter((l) => {
      if (logChannelFilter !== 'all' && l.channel !== logChannelFilter) return false;
      if (logStatusFilter !== 'all' && l.status !== logStatusFilter) return false;
      return true;
    });
  }, [notificationLogs, logChannelFilter, logStatusFilter]);

  const openRuleEditor = (rule: NotificationRule) => {
    setEditingRule(rule);
    setRuleChannel(rule.channel);
    setRuleTiming(rule.timingLabel);
    setRuleSubject(rule.subjectTemplate);
    setRuleBody(rule.bodyTemplate);
    setRuleEnabled(rule.enabled);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    setSaving(true);
    try {
      await updateNotificationRule(editingRule.id, {
        channel: ruleChannel,
        timingLabel: ruleTiming,
        enabled: ruleEnabled,
        subjectTemplate: ruleSubject,
        bodyTemplate: ruleBody,
      });
      setEditingRule(null);
    } finally {
      setSaving(false);
    }
  };

  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId = composeClientId || clients[0]?.id;
    if (!targetId || !composeBody.trim()) return;
    setSaving(true);
    try {
      await sendManualNotification({
        clientId: targetId,
        channel: composeChannel,
        subject: composeSubject,
        messageBody: composeBody,
      });
      setComposeBody('');
      setShowComposeModal(false);
    } finally {
      setSaving(false);
    }
  };

  const previewSampleVars = {
    clientName: 'Claire Bennett',
    serviceName: 'Deep Tissue Myofascial Release',
    therapistName: 'Marcus Thorne',
    dateTime: 'Tomorrow at 14:00',
    roomName: 'Suite 02 — Travertine',
    studioName: studio?.name ?? 'SUN & MOON Hotel, WELL SPA',
    tierName: 'Restorative Plus',
    creditsRemaining: '2',
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Automated Client Workflows
          </h2>
          <p className="text-sm text-slate-500">
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {totalSentCount}
            </span>{' '}
            notifications delivered ·{' '}
            <span className="font-mono font-semibold text-amber-700 tabular-nums">
              {pendingCount}
            </span>{' '}
            queued reminders ready
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setComposeClientId(clients[0]?.id ?? '');
              setShowComposeModal(true);
            }}
            className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Send Custom Notice
          </button>
          <button
            type="button"
            onClick={dispatchAllPendingNotifications}
            disabled={pendingCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Dispatch Queued ({pendingCount})</span>
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {notificationRules.map((rule) => (
          <div
            key={rule.id}
            className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{rule.channel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{rule.timingLabel}</span>
                </div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {rule.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => toggleNotificationRule(rule.id, !rule.enabled)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  rule.enabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {rule.enabled ? 'Active' : 'Paused'}
              </button>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 leading-relaxed">
              {rule.bodyTemplate}
            </p>

            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="font-mono text-slate-500 tabular-nums">
                {rule.sentCount} sent
              </span>
              <button
                type="button"
                onClick={() => openRuleEditor(rule)}
                className="font-medium text-teal-700 hover:text-teal-900 cursor-pointer"
              >
                Edit Template
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="font-display text-base font-semibold text-slate-900">
            Delivery &amp; Schedule Log
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'SMS', 'Email'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setLogChannelFilter(ch)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    logChannelFilter === ch
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {ch === 'all' ? 'All Channels' : ch}
                </button>
              ))}
            </div>
            <select
              value={logStatusFilter}
              onChange={(e) => setLogStatusFilter(e.target.value as 'all' | NotificationLogStatus)}
              aria-label="Filter notification logs by status"
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
            >
              <option value="all">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="scheduled">Queued / Scheduled</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">Client &amp; Recipient</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Message</th>
                  <th className="py-3 px-4">Timing</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredLogs.map((logItem) => (
                  <tr key={logItem.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="font-medium text-slate-900">{logItem.clientName}</p>
                      <p className="text-xs text-slate-500 font-mono">{logItem.recipientContact}</p>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                      {logItem.channel}
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <p className="text-xs font-medium text-slate-900 truncate">{logItem.subject}</p>
                      <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                        {logItem.messageBody}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      {logItem.sentAtLabel}
                    </td>
                    <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                      {logItem.status === 'sent' && (
                        <span className="text-emerald-700">Sent</span>
                      )}
                      {logItem.status === 'scheduled' && (
                        <span className="text-amber-700">Queued</span>
                      )}
                      {logItem.status === 'failed' && (
                        <span className="text-rose-700">Failed</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {logItem.status === 'scheduled' ? (
                        <button
                          type="button"
                          onClick={() => dispatchScheduledNotification(logItem.id)}
                          className="px-2.5 py-1 text-xs font-medium text-teal-800 border border-teal-200 hover:bg-teal-50 rounded-md cursor-pointer"
                        >
                          Send Now
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Delivered</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Edit Automation · {editingRule.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Merge tokens: {'{{clientName}}'}, {'{{serviceName}}'}, {'{{therapistName}}'}, {'{{dateTime}}'}, {'{{roomName}}'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveRule} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Delivery Channel</label>
                  <select
                    value={ruleChannel}
                    onChange={(e) => setRuleChannel(e.target.value as NotificationRule['channel'])}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Email + SMS">Email + SMS</option>
                    <option value="SMS">SMS only</option>
                    <option value="Email">Email only</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Trigger Timing</label>
                  <input
                    type="text"
                    value={ruleTiming}
                    onChange={(e) => setRuleTiming(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Subject Template</label>
                <input
                  type="text"
                  value={ruleSubject}
                  onChange={(e) => setRuleSubject(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Message Body Template</label>
                <textarea
                  rows={3}
                  value={ruleBody}
                  onChange={(e) => setRuleBody(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <p className="text-[11px] font-medium text-slate-500">Live Rendered Preview</p>
                <p className="text-xs font-semibold text-slate-900">
                  {renderNotificationTemplate(ruleSubject, previewSampleVars)}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {renderNotificationTemplate(ruleBody, previewSampleVars)}
                </p>
              </div>

              <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
                <span>Automation active</span>
                <input
                  type="checkbox"
                  checked={ruleEnabled}
                  onChange={(e) => setRuleEnabled(e.target.checked)}
                  className="accent-teal-700 w-4 h-4"
                />
              </label>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showComposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Send Client Notification
              </h3>
              <button
                type="button"
                onClick={() => setShowComposeModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleComposeSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Client</label>
                  <select
                    value={composeClientId}
                    onChange={(e) => setComposeClientId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700">Channel</label>
                  <select
                    value={composeChannel}
                    onChange={(e) => setComposeChannel(e.target.value as NotificationChannel)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="SMS">SMS</option>
                    <option value="Email">Email</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Subject</label>
                <input
                  type="text"
                  required
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">Message</label>
                <textarea
                  rows={3}
                  required
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your studio reminder or membership update..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowComposeModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Sending...' : 'Send Notification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
