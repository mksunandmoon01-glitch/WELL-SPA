import { X } from 'lucide-react';
import { useStudio } from '../context/StudioContext';

export function ToastStack() {
  const { toasts, dismissToast } = useStudio();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const toneText =
          t.tone === 'error'
            ? 'text-rose-700'
            : t.tone === 'info'
              ? 'text-slate-700'
              : 'text-teal-700';

        return (
          <div
            key={t.id}
            className="pointer-events-auto bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm flex items-start justify-between gap-3"
          >
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${toneText}`}>{t.title}</p>
              {t.detail && <p className="text-xs text-slate-600 mt-0.5">{t.detail}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-slate-400 hover:text-slate-700 p-0.5 shrink-0 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
