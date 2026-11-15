/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { Component, useState } from 'react';
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

function WorkspaceShell() {
  const { user, authReady, seeding } = useStudio();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('appointments');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<{
    date?: string;
    staffId?: string;
    startTime?: string;
  }>({});

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Connecting studio workspace...</div>
      </div>
    );
  }

  if (!user) {
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
                Preparing your SUN &amp; MOON Hotel, WELL SPA workspace
              </p>
              <p className="text-sm text-slate-500">
                Creating treatment catalog, therapist shifts, memberships, and automation templates...
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'appointments' && (
                <AppointmentsView
                  onOpenNewBooking={openNewBooking}
                  onOpenReports={() => setActiveTab('reports')}
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
  return (
    <WorkspaceErrorBoundary>
      <StudioProvider>
        <WorkspaceShell />
      </StudioProvider>
    </WorkspaceErrorBoundary>
  );
}
