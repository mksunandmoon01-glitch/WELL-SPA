import {
  BarChart3,
  Bell,
  CalendarDays,
  Clock,
  CreditCard,
  Globe,
  LogOut,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import type { WorkspaceTab } from '../types/spa';

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'appointments', label: 'Appointments', icon: CalendarDays },
  { id: 'staff', label: 'Staff Schedule', icon: Clock },
  { id: 'memberships', label: 'Memberships', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'services', label: 'Services', icon: Sparkles },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'booking_portal', label: 'Client Booking', icon: Globe },
];

export function Sidebar({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const { studio, user, isPrimaryAdmin, signOutUser, notificationLogs, appointments } = useStudio();

  const visibleNavItems = isPrimaryAdmin
    ? [...NAV_ITEMS, { id: 'users' as const, label: 'User Access', icon: ShieldCheck }]
    : NAV_ITEMS;

  const pendingAlerts = notificationLogs.filter((l) => l.status === 'scheduled').length;
  const activeSessions = appointments.filter(
    (a) => a.status === 'checked_in' || a.status === 'in_progress',
  ).length;

  const content = (
    <div className="h-full flex flex-col justify-between bg-white border-r border-slate-200 w-64 shrink-0">
      <div className="p-5 space-y-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <span className="font-display text-sm font-bold tracking-tight text-slate-900 leading-tight block">
              {studio?.name ?? 'SUN & MOON Hotel, WELL SPA'}
            </span>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              Partner Operations
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md"
            aria-label="Close navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-1" aria-label="Workspace navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const countHint =
              item.id === 'notifications' && pendingAlerts > 0
                ? pendingAlerts
                : item.id === 'appointments' && activeSessions > 0
                  ? activeSessions
                  : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {countHint !== null && (
                  <span className="font-mono text-xs tabular-nums text-slate-500">
                    {countHint}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700 shrink-0">
            <Users className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-900 truncate">
              {user?.displayName ?? 'Studio Partner'}
            </p>
            <p className="text-xs text-slate-500 truncate">{user?.email ?? ''}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOutUser}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg border border-slate-200 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-slate-400" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block h-screen sticky top-0">{content}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
