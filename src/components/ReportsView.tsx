import { useMemo, useState } from 'react';
import { BarChart3, Download, RotateCcw } from 'lucide-react';
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
import { formatCurrency, formatLocalDate } from '../lib/seedStudio';

type ReportMode = 'daily' | 'monthly';
type StatusScope = 'non_cancelled' | 'completed_only';

interface RevenueChartBucket {
  periodKey: string;
  label: string;
  paidRevenue: number;
  creditValue: number;
  totalRevenue: number;
  bookings: number;
  completedCount: number;
}

function enumerateDays(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) return [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const cur = new Date(sy, (sm || 1) - 1, sd || 1);
  const end = new Date(ey, (em || 1) - 1, ed || 1);
  const list: string[] = [];
  let safety = 0;
  while (cur <= end && safety < 366) {
    const year = cur.getFullYear();
    const month = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    list.push(`${year}-${month}-${day}`);
    cur.setDate(cur.getDate() + 1);
    safety += 1;
  }
  return list;
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, 1);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function ReportsView() {
  const { appointments, staff, clients, loadingData } = useStudio();

  const today = formatLocalDate(0);
  const defaultStart = formatLocalDate(-30);

  const [reportMode, setReportMode] = useState<ReportMode>('daily');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(today);
  const [therapistId, setTherapistId] = useState<string>('all');
  const [customerId, setCustomerId] = useState<string>('all');
  const [statusScope, setStatusScope] = useState<StatusScope>('non_cancelled');

  const customerOptions = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.fullName));
    appointments.forEach((a) => {
      if (a.clientId && !map.has(a.clientId)) {
        map.set(a.clientId, a.clientName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, appointments]);

  const applyDatePreset = (preset: '7d' | '30d' | 'this_month' | 'all') => {
    if (preset === '7d') {
      setStartDate(formatLocalDate(-6));
      setEndDate(today);
    } else if (preset === '30d') {
      setStartDate(formatLocalDate(-29));
      setEndDate(today);
    } else if (preset === 'this_month') {
      const now = new Date();
      const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      setStartDate(first);
      setEndDate(formatLocalDate(30));
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const resetFilters = () => {
    setStartDate(defaultStart);
    setEndDate(today);
    setTherapistId('all');
    setCustomerId('all');
    setStatusScope('non_cancelled');
  };

  const filteredAppointments = useMemo(() => {
    return appointments
      .filter((a) => {
        if (statusScope === 'completed_only') {
          if (a.status !== 'completed') return false;
        } else if (a.status === 'cancelled' || a.status === 'no_show') {
          return false;
        }
        if (startDate && a.date < startDate) return false;
        if (endDate && a.date > endDate) return false;
        if (therapistId !== 'all' && a.staffId !== therapistId) return false;
        if (customerId !== 'all' && a.clientId !== customerId) return false;
        return true;
      })
      .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  }, [appointments, statusScope, startDate, endDate, therapistId, customerId]);

  const summary = useMemo(() => {
    let paidRevenue = 0;
    let creditValue = 0;
    let creditCount = 0;
    for (const apt of filteredAppointments) {
      if (apt.usedMembershipCredit) {
        creditValue += apt.price;
        creditCount += 1;
      } else {
        paidRevenue += apt.price;
      }
    }
    const totalRevenue = paidRevenue + creditValue;
    const count = filteredAppointments.length;
    const avgTicket = count > 0 ? Math.round(totalRevenue / count) : 0;
    return { paidRevenue, creditValue, creditCount, totalRevenue, count, avgTicket };
  }, [filteredAppointments]);

  const dailySeries = useMemo<RevenueChartBucket[]>(() => {
    const bucket = new Map<string, RevenueChartBucket>();

    const allDates =
      startDate && endDate && enumerateDays(startDate, endDate).length <= 90
        ? enumerateDays(startDate, endDate)
        : Array.from(new Set(filteredAppointments.map((a) => a.date))).sort();

    for (const d of allDates) {
      const [y, m, day] = d.split('-').map(Number);
      const dt = new Date(y, (m || 1) - 1, day || 1);
      bucket.set(d, {
        periodKey: d,
        label: `${dt.getMonth() + 1}/${dt.getDate()}`,
        paidRevenue: 0,
        creditValue: 0,
        totalRevenue: 0,
        bookings: 0,
        completedCount: 0,
      });
    }

    for (const apt of filteredAppointments) {
      let entry = bucket.get(apt.date);
      if (!entry) {
        const [y, m, day] = apt.date.split('-').map(Number);
        const dt = new Date(y, (m || 1) - 1, day || 1);
        entry = {
          periodKey: apt.date,
          label: `${dt.getMonth() + 1}/${dt.getDate()}`,
          paidRevenue: 0,
          creditValue: 0,
          totalRevenue: 0,
          bookings: 0,
          completedCount: 0,
        };
        bucket.set(apt.date, entry);
      }
      if (apt.usedMembershipCredit) {
        entry.creditValue += apt.price;
      } else {
        entry.paidRevenue += apt.price;
      }
      entry.totalRevenue += apt.price;
      entry.bookings += 1;
      if (apt.status === 'completed') {
        entry.completedCount += 1;
      }
    }

    return Array.from(bucket.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  }, [filteredAppointments, startDate, endDate]);

  const monthlySeries = useMemo<RevenueChartBucket[]>(() => {
    const bucket = new Map<string, RevenueChartBucket>();

    for (const apt of filteredAppointments) {
      const monthKey = apt.date.slice(0, 7);
      let entry = bucket.get(monthKey);
      if (!entry) {
        entry = {
          periodKey: monthKey,
          label: formatMonthLabel(monthKey),
          paidRevenue: 0,
          creditValue: 0,
          totalRevenue: 0,
          bookings: 0,
          completedCount: 0,
        };
        bucket.set(monthKey, entry);
      }
      if (apt.usedMembershipCredit) {
        entry.creditValue += apt.price;
      } else {
        entry.paidRevenue += apt.price;
      }
      entry.totalRevenue += apt.price;
      entry.bookings += 1;
      if (apt.status === 'completed') {
        entry.completedCount += 1;
      }
    }

    return Array.from(bucket.values()).sort((a, b) => a.periodKey.localeCompare(b.periodKey));
  }, [filteredAppointments]);

  const activeChartSeries = reportMode === 'daily' ? dailySeries : monthlySeries;

  const therapistBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; role: string; bookings: number; paidRevenue: number; creditValue: number; totalRevenue: number }
    >();
    staff.forEach((s) => {
      map.set(s.id, {
        id: s.id,
        name: s.name,
        role: s.role,
        bookings: 0,
        paidRevenue: 0,
        creditValue: 0,
        totalRevenue: 0,
      });
    });

    for (const apt of filteredAppointments) {
      const existing = map.get(apt.staffId) ?? {
        id: apt.staffId,
        name: apt.staffName,
        role: 'Therapist',
        bookings: 0,
        paidRevenue: 0,
        creditValue: 0,
        totalRevenue: 0,
      };
      existing.bookings += 1;
      if (apt.usedMembershipCredit) {
        existing.creditValue += apt.price;
      } else {
        existing.paidRevenue += apt.price;
      }
      existing.totalRevenue += apt.price;
      map.set(apt.staffId, existing);
    }

    return Array.from(map.values())
      .filter((row) => row.bookings > 0 || therapistId === row.id)
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredAppointments, staff, therapistId]);

  const customerBreakdown = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; bookings: number; paidRevenue: number; creditValue: number; totalRevenue: number; lastVisit: string }
    >();

    for (const apt of filteredAppointments) {
      const existing = map.get(apt.clientId) ?? {
        id: apt.clientId,
        name: apt.clientName,
        bookings: 0,
        paidRevenue: 0,
        creditValue: 0,
        totalRevenue: 0,
        lastVisit: apt.date,
      };
      existing.bookings += 1;
      if (apt.usedMembershipCredit) {
        existing.creditValue += apt.price;
      } else {
        existing.paidRevenue += apt.price;
      }
      existing.totalRevenue += apt.price;
      if (apt.date > existing.lastVisit) existing.lastVisit = apt.date;
      map.set(apt.clientId, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [filteredAppointments]);

  const handleExportCsv = () => {
    const header = ['Date', 'Start Time', 'Client', 'Therapist', 'Service', 'Status', 'Payment Type', 'Amount (USD)'];
    const rows = filteredAppointments.map((apt) => [
      apt.date,
      apt.startTime,
      `"${apt.clientName.replace(/"/g, '""')}"`,
      `"${apt.staffName.replace(/"/g, '""')}"`,
      `"${apt.serviceName.replace(/"/g, '""')}"`,
      apt.status,
      apt.usedMembershipCredit ? 'Membership Credit' : 'Direct Checkout',
      String(apt.price),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `well-spa-revenue-${reportMode}-${startDate || 'all'}-to-${endDate || 'all'}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setReportMode('daily')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                reportMode === 'daily'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily Revenue
            </button>
            <button
              type="button"
              onClick={() => setReportMode('monthly')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                reportMode === 'monthly'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly Revenue
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyDatePreset('7d')}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('30d')}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('this_month')}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyDatePreset('all')}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredAppointments.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
          <div className="space-y-1">
            <label htmlFor="report-start-date" className="text-xs font-medium text-slate-500">
              From Date
            </label>
            <input
              id="report-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="report-end-date" className="text-xs font-medium text-slate-500">
              To Date
            </label>
            <input
              id="report-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="report-therapist" className="text-xs font-medium text-slate-500">
              Filter by Therapist
            </label>
            <select
              id="report-therapist"
              value={therapistId}
              onChange={(e) => setTherapistId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="all">All Therapists</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="report-customer" className="text-xs font-medium text-slate-500">
              Filter by Customer
            </label>
            <select
              id="report-customer"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
            >
              <option value="all">All Customers</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="report-status" className="text-xs font-medium text-slate-500">
              Booking Scope
            </label>
            <div className="flex items-center gap-2">
              <select
                id="report-status"
                value={statusScope}
                onChange={(e) => setStatusScope(e.target.value as StatusScope)}
                className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="non_cancelled">All Active &amp; Completed</option>
                <option value="completed_only">Completed Only</option>
              </select>
              <button
                type="button"
                onClick={resetFilters}
                title="Reset filters"
                aria-label="Reset report filters"
                className="p-1.5 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Filtered Value</p>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {formatCurrency(summary.totalRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {summary.count} matching appointments
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Direct Checkout</p>
          <p className="font-display text-2xl font-semibold text-teal-800 tabular-nums mt-1">
            {formatCurrency(summary.paidRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {summary.count - summary.creditCount} paid visits
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Membership Redemptions</p>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {formatCurrency(summary.creditValue)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {summary.creditCount} credit redemptions
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Average Ticket</p>
          <p className="font-display text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {formatCurrency(summary.avgTicket)}
          </p>
          <p className="text-xs text-slate-500 mt-1 truncate">
            {therapistId === 'all'
              ? 'All therapists'
              : staff.find((s) => s.id === therapistId)?.name ?? 'Selected therapist'}
          </p>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              {reportMode === 'daily' ? 'Daily Revenue Trend' : 'Monthly Revenue Trend'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
              {startDate || 'Beginning'} to {endDate || 'Latest'} ·{' '}
              {reportMode === 'daily'
                ? `${dailySeries.length} day buckets`
                : `${monthlySeries.length} month buckets`}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-teal-700 inline-block" aria-hidden="true" />
              <span>Direct Checkout</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 inline-block" aria-hidden="true" />
              <span>Membership Credit</span>
            </span>
          </div>
        </div>

        {loadingData ? (
          <div className="h-64 bg-slate-100 rounded-lg animate-pulse" />
        ) : activeChartSeries.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-slate-200 rounded-lg">
            <BarChart3 className="w-7 h-7 text-slate-300" />
            <p className="text-sm font-medium text-slate-900">No revenue data for these filters</p>
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-1.5 text-xs font-medium text-teal-800 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={activeChartSeries}
                margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="label"
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
                    const row = payload[0].payload as RevenueChartBucket;
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm text-xs space-y-1.5">
                        <p className="font-semibold text-slate-900 font-mono tabular-nums">
                          {reportMode === 'daily' ? row.periodKey : row.label}
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
                <Bar dataKey="paidRevenue" stackId="rev" fill="#0f766e" maxBarSize={44} />
                <Bar
                  dataKey="creditValue"
                  stackId="rev"
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={44}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Revenue by Therapist
              </h2>
              <p className="text-xs text-slate-500">Click a therapist to filter report</p>
            </div>
            {therapistId !== 'all' && (
              <button
                type="button"
                onClick={() => setTherapistId('all')}
                className="text-xs font-medium text-teal-700 hover:text-teal-900 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Therapist</th>
                  <th className="py-2.5 px-4 text-right">Visits</th>
                  <th className="py-2.5 px-4 text-right">Direct</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {therapistBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 px-4 text-center text-xs text-slate-500">
                      No therapist revenue in selected range.
                    </td>
                  </tr>
                ) : (
                  therapistBreakdown.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setTherapistId(therapistId === row.id ? 'all' : row.id)}
                      className={`cursor-pointer transition-colors ${
                        therapistId === row.id ? 'bg-teal-50/60' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-slate-900">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.role}</p>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {row.bookings}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {formatCurrency(row.paidRevenue)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                        {formatCurrency(row.totalRevenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Revenue by Customer
              </h2>
              <p className="text-xs text-slate-500">Click a customer to filter report</p>
            </div>
            {customerId !== 'all' && (
              <button
                type="button"
                onClick={() => setCustomerId('all')}
                className="text-xs font-medium text-teal-700 hover:text-teal-900 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4 text-right">Visits</th>
                  <th className="py-2.5 px-4 text-right">Last Visit</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {customerBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 px-4 text-center text-xs text-slate-500">
                      No customer revenue in selected range.
                    </td>
                  </tr>
                ) : (
                  customerBreakdown.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setCustomerId(customerId === row.id ? 'all' : row.id)}
                      className={`cursor-pointer transition-colors ${
                        customerId === row.id ? 'bg-teal-50/60' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-medium text-slate-900">{row.name}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                        {row.bookings}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-500">
                        {row.lastVisit}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                        {formatCurrency(row.totalRevenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            {reportMode === 'monthly' ? 'Monthly Breakdown & Appointment Ledger' : 'Appointment Revenue Ledger'}
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {filteredAppointments.length} records
          </span>
        </div>

        {reportMode === 'monthly' && monthlySeries.length > 0 && (
          <div className="overflow-x-auto border-b border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Month</th>
                  <th className="py-2.5 px-4 text-right">Appointments</th>
                  <th className="py-2.5 px-4 text-right">Completed</th>
                  <th className="py-2.5 px-4 text-right">Direct Checkout</th>
                  <th className="py-2.5 px-4 text-right">Credit Value</th>
                  <th className="py-2.5 px-4 text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {monthlySeries.map((m) => (
                  <tr key={m.periodKey} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-medium text-slate-900">{m.label}</td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      {m.bookings}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                      {m.completedCount}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-teal-800">
                      {formatCurrency(m.paidRevenue)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-600">
                      {formatCurrency(m.creditValue)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                      {formatCurrency(m.totalRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4">Date &amp; Time</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4">Therapist</th>
                <th className="py-2.5 px-4">Treatment</th>
                <th className="py-2.5 px-4">Settlement</th>
                <th className="py-2.5 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 px-4 text-center text-xs text-slate-500">
                    No appointments match the active report filters.
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                      {apt.date} · {apt.startTime}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{apt.clientName}</td>
                    <td className="py-2.5 px-4 text-slate-700">{apt.staffName}</td>
                    <td className="py-2.5 px-4 text-slate-700">{apt.serviceName}</td>
                    <td className="py-2.5 px-4 text-xs text-slate-600">
                      {apt.usedMembershipCredit ? 'Membership Credit' : 'Direct Checkout'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                      {formatCurrency(apt.price)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
