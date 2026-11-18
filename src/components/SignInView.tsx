import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { PRIMARY_ADMIN_EMAIL, SPA_BANNER_IMAGE } from '../lib/seedStudio';
import { useStudio } from '../context/StudioContext';
import { ClientBookingPortal } from './ClientBookingPortal';
import { VenueLocationCard } from './VenueLocationCard';

export function SignInView() {
  const {
    needsAdminSetup,
    cloudStudioExists,
    initializeAdmin,
    signInWithCredentials,
    signInWithGoogle,
    authReady,
    authError,
    clearAuthError,
  } = useStudio();

  const [showPublicBooking, setShowPublicBooking] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [fullName, setFullName] = useState('WELL SPA Admin');
  const [email, setEmail] = useState(needsAdminSetup ? PRIMARY_ADMIN_EMAIL : '');

  useEffect(() => {
    if (needsAdminSetup && !email) {
      setEmail(PRIMARY_ADMIN_EMAIL);
    }
  }, [needsAdminSetup, email]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  if (showPublicBooking) {
    return (
      <ClientBookingPortal
        publicMode
        onBackToSignIn={() => setShowPublicBooking(false)}
      />
    );
  }

  const focusLoginForm = () => {
    emailInputRef.current?.focus();
    emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleGoogleSignIn = async () => {
    if (submitting || googleSubmitting) return;
    setLocalError('');
    clearAuthError();
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || googleSubmitting) return;
    setLocalError('');
    clearAuthError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      if (needsAdminSetup) {
        if (password.length < 8) {
          setLocalError('Admin password must be at least 8 characters.');
          return;
        }
        if (password !== confirmPassword) {
          setLocalError('Passwords do not match.');
          return;
        }
        const res = await initializeAdmin({
          email: trimmedEmail || PRIMARY_ADMIN_EMAIL,
          fullName: fullName.trim() || 'WELL SPA Admin',
          password,
        });
        if (res.ok) {
          setPassword('');
          setConfirmPassword('');
        }
      } else {
        const res = await signInWithCredentials(trimmedEmail, password);
        if (res.ok) {
          setPassword('');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            WELL SPA
          </span>
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#features" className="hidden md:inline hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Memberships
            </a>
            <a href="#features" className="hidden md:inline hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Notifications
            </a>
            <a href="#venue-location" className="hidden md:inline hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Location &amp; Map
            </a>
            <button
              type="button"
              onClick={() => setShowPublicBooking(true)}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Client Booking Portal
            </button>
          </nav>
          <button
            type="button"
            onClick={focusLoginForm}
            disabled={!authReady}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 lg:py-16 flex flex-col gap-12">
        {(authError || localError) && (
          <div
            role="alert"
            className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-sm text-rose-800"
          >
            <span>{localError || authError}</span>
            <button
              type="button"
              onClick={() => {
                setLocalError('');
                clearAuthError();
              }}
              className="text-xs font-medium text-rose-700 hover:text-rose-900 underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center gap-6 py-2">
            <div className="space-y-3">
              <p className="text-xs font-medium text-teal-700 tracking-wide">
                WELL SPA Operations
              </p>
              <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 leading-tight [text-wrap:balance]">
                Calm, coordinated operations for modern wellness studios.
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
                {needsAdminSetup
                  ? 'Continue with Google to sync existing cloud data across devices, or create a local administrator password below.'
                  : cloudStudioExists
                    ? 'A shared WELL SPA workspace already exists in Cloud Sync. Click "Continue with Google (Cloud Sync)" below to load the exact same appointments, clients, staff, and memberships on this device.'
                    : 'Sign in with Google for live multi-device cloud sync, or use your administrator, staff, or registered client credentials.'}
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-md"
            >
              {cloudStudioExists && !needsAdminSetup && (
                <div className="rounded-lg border border-teal-200 bg-teal-50/70 px-3.5 py-2.5 text-xs text-teal-900 leading-relaxed">
                  Shared cloud workspace detected. Use <span className="font-semibold">Continue with Google (Cloud Sync)</span> to sync data across devices and URLs.
                </div>
              )}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={!authReady || submitting || googleSubmitting}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>
                    {googleSubmitting ? 'Signing in with Google...' : 'Continue with Google (Cloud Sync)'}
                  </span>
                </button>
                <div className="relative flex items-center py-1">
                  <div className="flex-grow border-t border-slate-200" />
                  <span className="shrink mx-3 text-[11px] font-medium text-slate-400">
                    or use email &amp; password
                  </span>
                  <div className="flex-grow border-t border-slate-200" />
                </div>
              </div>

              {needsAdminSetup && (
                <div className="space-y-1.5">
                  <label htmlFor="admin-name" className="text-xs font-medium text-slate-700">
                    Administrator Name
                  </label>
                  <input
                    id="admin-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="WELL SPA Admin"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="signin-email" className="text-xs font-medium text-slate-700">
                  {needsAdminSetup ? 'Admin Login Email' : 'Email or Login ID'}
                </label>
                <input
                  id="signin-email"
                  ref={emailInputRef}
                  type="text"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your Emaill Address"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signin-password" className="text-xs font-medium text-slate-700">
                  {needsAdminSetup ? 'Create Admin Password (min 8 chars)' : 'Password'}
                </label>
                <div className="relative">
                  <input
                    id="signin-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={needsAdminSetup ? 8 : undefined}
                    autoComplete={needsAdminSetup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full pl-3 pr-10 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {needsAdminSetup && (
                <div className="space-y-1.5">
                  <label htmlFor="confirm-password" className="text-xs font-medium text-slate-700">
                    Confirm Admin Password
                  </label>
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter admin password"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={!authReady || submitting}
                className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting
                  ? needsAdminSetup
                    ? 'Creating Admin Access...'
                    : 'Signing In...'
                  : needsAdminSetup
                    ? 'Create Admin & Sign In'
                    : 'Sign In'}
              </button>

              <p className="text-xs text-slate-500 text-center pt-1">
                New client?{' '}
                <button
                  type="button"
                  onClick={() => setShowPublicBooking(true)}
                  className="font-medium text-teal-700 hover:text-teal-800 underline cursor-pointer"
                >
                  Sign up &amp; book in Client Booking Portal
                </button>
              </p>
            </form>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] lg:min-h-[380px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
              {!bannerFailed ? (
                <img
                  src={SPA_BANNER_IMAGE}
                  alt="Minimalist travertine and oak massage suite at WELL SPA"
                  referrerPolicy="no-referrer"
                  onError={() => setBannerFailed(true)}
                  className="w-full h-full object-cover lg:h-full"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 via-teal-50 to-slate-100 flex items-center justify-center p-8 text-center">
                  <div className="space-y-2">
                    <p className="font-display text-lg font-semibold text-slate-800">
                      WELL SPA
                    </p>
                    <p className="text-sm text-slate-600">
                      4 Treatment Suites · Real-Time Booking &amp; Roster Control
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section
          id="features"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 border border-slate-200 bg-white rounded-xl divide-y md:divide-y-0 md:divide-x divide-slate-200"
        >
          <div className="p-6 space-y-2">
            <p className="text-xs font-mono text-slate-500 tabular-nums">01 · Appointments</p>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Live Suite Timeline
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Monitor confirmed, checked-in, and in-session bookings across therapists with instant conflict checks.
            </p>
          </div>
          <div className="p-6 space-y-2">
            <p className="text-xs font-mono text-slate-500 tabular-nums">02 · Staff Roster</p>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Therapist Shift Control
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Configure working days, shift windows, break blocks, and treatment suite assignments per specialist.
            </p>
          </div>
          <div className="p-6 space-y-2">
            <p className="text-xs font-mono text-slate-500 tabular-nums">03 · Memberships</p>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Credit &amp; Tier Ledger
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Manage recurring monthly massage plans, track remaining credits, and redeem them seamlessly at booking.
            </p>
          </div>
          <div className="p-6 space-y-2">
            <p className="text-xs font-mono text-slate-500 tabular-nums">04 · Automation</p>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Client Notifications
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Trigger instant booking confirmations, 24h SMS reminders, and post-visit rebook follow-ups automatically.
            </p>
          </div>
        </section>

        <VenueLocationCard />
      </main>
    </div>
  );
}
