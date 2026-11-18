import { Menu, Plus } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import type { WorkspaceTab } from '../types/spa';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onOpenMobileNav: () => void;
  onNewBooking: () => void;
}

const TAB_LABELS: Record<WorkspaceTab, string> = {
  appointments: 'Appointments',
  staff: 'Staff Schedule',
  memberships: 'Memberships & Clients',
  notifications: 'Automated Notifications',
  services: 'Services & Suites',
  reports: 'Revenue Reports',
  booking_portal: 'Client Booking Portal',
  users: 'User Access',
};

export function TopBar({ activeTab, onOpenMobileNav, onNewBooking }: TopBarProps) {
  const { studio, hasPermission } = useStudio();
  const canBook = hasPermission('appointments') || hasPermission('booking_portal');

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-8 py-3.5 flex items-center justify-between gap-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-500 truncate hidden sm:inline">
            {studio?.name ?? 'WELL SPA'}
          </span>
          <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="font-display font-semibold text-slate-900 truncate">
            {TAB_LABELS[activeTab]}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">

        {canBook && (
          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Booking</span>
          </button>
        )}
      </div>
    </header>
  );
}
