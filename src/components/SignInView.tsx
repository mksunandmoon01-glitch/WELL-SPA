import React, { useRef, useState } from 'react';
import { SPA_BANNER_IMAGE } from '../lib/seedStudio';
import { useStudio } from '../context/StudioContext';

export function SignInView() {
  const {
    signInWithCredentials,
    sendPasswordReset,
    pendingVerificationUser,
    resendVerificationEmail,
    refreshVerificationStatus,
    signOutUser,
    authReady,
    authError,
    clearAuthError,
  } = useStudio();

  const [bannerFailed, setBannerFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const emailInputRef = useRef<HTMLInputElement>(null);

  const focusLoginForm = () => {
    emailInputRef.current?.focus();
    emailInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage('');
    setSubmitting(true);
    try {
      await signInWithCredentials(email, password);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (sendingReset) return;
    setResetMessage('');
    setSendingReset(true);
    try {
      const res = await sendPasswordReset(email);
      if (res.ok) {
        setResetMessage(
          `Password reset link sent to ${email.trim()}. Open the newest email once (previous links expire immediately).`,
        );
      } else if (res.error) {
        setResetMessage(res.error);
      }
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            WELL SPA
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Scheduling
            </a>
            <a href="#features" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Staff Roster
            </a>
            <a href="#features" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Memberships
            </a>
            <a href="#features" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Notifications
            </a>
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
        {authError && (
          <div
            role="alert"
            className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-sm text-rose-800"
          >
            <span>{authError}</span>
            <button
              type="button"
              onClick={clearAuthError}
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
                SUN &amp; MOON Hotel · WELL SPA Operations
              </p>
              <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 leading-tight [text-wrap:balance]">
                Calm, coordinated operations for modern wellness studios.
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
                Sign in with an account created by your administrator to access the shared studio database. Sessions automatically expire after 8 hours.
              </p>
            </div>

            {pendingVerificationUser ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-md">
                <div className="space-y-1">
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Email verification required
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    A verification link was sent to{' '}
                    <span className="font-mono font-medium text-slate-900">
                      {pendingVerificationUser.email}
                    </span>
                    . Open the link in your inbox, then continue.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={refreshVerificationStatus}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                  >
                    I Have Verified
                  </button>
                  <button
                    type="button"
                    onClick={resendVerificationEmail}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    Resend Link
                  </button>
                  <button
                    type="button"
                    onClick={signOutUser}
                    className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-md"
              >
                <div className="space-y-1.5">
                  <label htmlFor="signin-email" className="text-xs font-medium text-slate-700">
                    Email Address
                  </label>
                  <input
                    id="signin-email"
                    ref={emailInputRef}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mk.sunandmoon01@gmail.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="signin-password" className="text-xs font-medium text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      disabled={sendingReset}
                      onClick={handlePasswordReset}
                      className="text-xs font-medium text-teal-700 hover:text-teal-900 disabled:opacity-50 cursor-pointer"
                    >
                      {sendingReset ? 'Sending...' : 'Set / Reset Password'}
                    </button>
                  </div>
                  <input
                    id="signin-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>

                {resetMessage && (
                  <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 leading-relaxed">
                    {resetMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!authReady || submitting}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Signing In...' : 'Sign In'}
                </button>
              </form>
            )}
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[300px] lg:min-h-[380px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
              {!bannerFailed ? (
                <img
                  src={SPA_BANNER_IMAGE}
                  alt="Minimalist travertine and oak massage suite at SUN & MOON Hotel, WELL SPA"
                  referrerPolicy="no-referrer"
                  onError={() => setBannerFailed(true)}
                  className="w-full h-full object-cover lg:h-full"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 via-teal-50 to-slate-100 flex items-center justify-center p-8 text-center">
                  <div className="space-y-2">
                    <p className="font-display text-lg font-semibold text-slate-800">
                      SUN &amp; MOON Hotel, WELL SPA
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
      </main>
    </div>
  );
}
