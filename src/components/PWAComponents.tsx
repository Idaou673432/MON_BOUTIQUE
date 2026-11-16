import React, { useState } from 'react';
import { Download, RefreshCw, Smartphone, WifiOff } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ variant?: 'header' | 'card' }> = ({
  variant = 'header',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={
          variant === 'card'
            ? 'flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap'
            : 'flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition-colors cursor-pointer whitespace-nowrap'
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span>Installer l&apos;app</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Installer sur iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Installer SuguPay sur iPhone / iPad
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Touchez le bouton <strong>Partager</strong> dans la barre Safari.<br />
                2. Faites défiler et touchez <strong>Sur l&apos;écran d&apos;accueil</strong>.<br />
                3. SuguPay fonctionnera ensuite même sans connexion Internet.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-lg bg-slate-100 dark:bg-slate-800 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const { isOnline, pendingOfflineOps, isSyncingOffline, triggerOfflineSync } = useApp();

  if (isOnline && pendingOfflineOps.length === 0 && !isSyncingOffline) {
    return null;
  }

  if (!isOnline) {
    return (
      <div className="no-print fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg border border-amber-500">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>
          Mode hors ligne · Cache local actif
          {pendingOfflineOps.length > 0
            ? ` (${pendingOfflineOps.length} opération${pendingOfflineOps.length > 1 ? 's' : ''} en attente)`
            : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="no-print fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white shadow-lg border border-slate-700">
      <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 shrink-0 ${isSyncingOffline ? 'animate-spin' : ''}`} />
      <span>
        {isSyncingOffline
          ? `Synchronisation Firebase en cours (${pendingOfflineOps.length})...`
          : `${pendingOfflineOps.length} opération(s) locale(s) à synchroniser`}
      </span>
      {!isSyncingOffline && pendingOfflineOps.length > 0 && (
        <button
          type="button"
          onClick={() => void triggerOfflineSync()}
          className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
        >
          Synchroniser
        </button>
      )}
    </div>
  );
};
