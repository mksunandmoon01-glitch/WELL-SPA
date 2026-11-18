/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { Component, useEffect, useState } from 'react';
import { AdminUsersView } from './components/AdminUsersView';
import { AppointmentsView } from './components/AppointmentsView';
import { ClientBookingPortal } from './components/ClientBookingPortal';
import { MembershipsView } from './components/MembershipsView';
import { NewBookingModal } from './components/NewBookingModal';
import { NotificationsView } from './components/NotificationsView';
import { ReportsView } from './components/ReportsView';
import { ServicesView } from './components/ServicesView';
import { Sidebar } from './components/Sidebar';
import { SignInView } from './components/SignInView';
import { StaffScheduleView } from './components/StaffScheduleView';
import { ToastStack } from './components/ToastStack';
import { TopBar } from './components/TopBar';
import { StudioProvider, useStudio } from './context/StudioContext';
import type { WorkspaceTab } from './types/spa';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class WorkspaceErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected workspace error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full space-y-4">
            <h1 className="font-display text-lg font-semibold text-slate-900">
              Studio Workspace Error
            </h1>
            <p className="text-xs text-slate-600 font-mono break-all bg-slate-50 border border-slate-200 rounded-lg p-3">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
            >
              Reload Workspace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TAB_ORDER: WorkspaceTab[] = [
  'appointments',
  'staff',
  'memberships',
  'notifications',
  'services',
  'reports',
  'booking_portal',
  'users',
];

function WorkspaceShell() {
  const { user, clientUser, authReady, seeding, hasPermission } = useStudio();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('appointments');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<{
    date?: string;
    staffId?: string;
    startTime?: string;
  }>({});

  useEffect(() => {
    if (!user) return;
    if (!hasPermission(activeTab)) {
      const firstAllowed = TAB_ORDER.find((tab) => hasPermission(tab));
      if (firstAllowed) {
        setActiveTab(firstAllowed);
      }
    }
  }, [user, activeTab, hasPermission]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Connecting studio workspace...</div>
      </div>
    );
  }

  if (!user) {
    if (clientUser) {
      return (
        <>
          <ClientBookingPortal publicMode />
          <ToastStack />
        </>
      );
    }
    return <SignInView />;
  }

  const openNewBooking = (prefill?: { date?: string; staffId?: string; startTime?: string }) => {
    setBookingPrefill(prefill ?? {});
    setBookingModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeTab={activeTab}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onNewBooking={() => openNewBooking()}
        />

        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">
          {seeding ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
              <p className="font-display text-base font-semibold text-slate-900">
                Preparing your WELL SPA workspace
              </p>
              <p className="text-sm text-slate-500">
                Creating treatment catalog, therapist shifts, memberships, and automation templates...
              </p>
            </div>
          ) : !hasPermission(activeTab) ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <p className="text-sm font-medium text-slate-700">
                No workspace modules are currently assigned to your account. Contact the administrator.
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'appointments' && (
                <AppointmentsView
                  onOpenNewBooking={openNewBooking}
                  onOpenReports={
                    hasPermission('reports') ? () => setActiveTab('reports') : undefined
                  }
                />
              )}
              {activeTab === 'staff' && <StaffScheduleView />}
              {activeTab === 'memberships' && <MembershipsView />}
              {activeTab === 'notifications' && <NotificationsView />}
              {activeTab === 'services' && <ServicesView />}
              {activeTab === 'reports' && <ReportsView />}
              {activeTab === 'booking_portal' && <ClientBookingPortal />}
              {activeTab === 'users' && <AdminUsersView />}
            </>
          )}
        </main>
      </div>

      <NewBookingModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        initialDate={bookingPrefill.date}
        initialStaffId={bookingPrefill.staffId}
        initialStartTime={bookingPrefill.startTime}
      />

      <ToastStack />
    </div>
  );
}

export default function App() {
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  return (
    <WorkspaceErrorBoundary>
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <StudioProvider>
        <WorkspaceShell />
      </StudioProvider>
    </WorkspaceErrorBoundary>
  );
}
