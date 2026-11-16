import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Moon,
  RefreshCw,
  RotateCcw,
  Share2,
  Store,
  Sun,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { resetShopDataToZero, updateShopSettings } from '../../services/shopService';
import { LanguageCode } from '../../types';
import { PWAInstallButton } from '../PWAComponents';

export function SettingsModule() {
  const {
    shop,
    currentMember,
    language,
    setLanguage,
    theme,
    setTheme,
    toggleTheme,
    products,
    customers,
    suppliers,
    sales,
    purchases,
    expenses,
    isOnline,
    pendingOfflineOps,
    isSyncingOffline,
    triggerOfflineSync,
  } = useApp();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nif, setNif] = useState('');
  const [rccm, setRccm] = useState('');
  const [tvaRate, setTvaRate] = useState(0);
  const [receiptFooter, setReceiptFooter] = useState('');
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(language);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  // Reset to zero state
  const [resetMode, setResetMode] = useState<'transactions_only' | 'full_wipe'>('full_wipe');
  const [resetStockToZero, setResetStockToZero] = useState(false);
  const [deleteNonOwnerMembers, setDeleteNonOwnerMembers] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'code' | 'link' | null>(null);

  const canReset = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const shareUrl =
    typeof window !== 'undefined' && shop?.shopCode
      ? `${window.location.origin}/?shop=${encodeURIComponent(shop.shopCode)}`
      : '';

  const copyValue = async (val: string, field: 'code' | 'link') => {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setCopiedField(null);
    }
  };

  useEffect(() => {
    if (shop) {
      setName(shop.name);
      setCity(shop.city || '');
      setAddress(shop.address || '');
      setPhone(shop.phone || '');
      setEmail(shop.email || '');
      setNif(shop.nif || '');
      setRccm(shop.rccm || '');
      setTvaRate(shop.tvaRate || 0);
      setReceiptFooter(shop.receiptFooter || '');
      setSelectedLang(shop.language || language);
    }
  }, [shop, language]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    setSavedMsg(false);
    try {
      await updateShopSettings(shop.id, {
        name,
        city,
        address,
        phone,
        email,
        nif,
        rccm,
        tvaRate,
        receiptFooter,
        language: selectedLang,
      });
      setLanguage(selectedLang);
      setSavedMsg(true);
    } finally {
      setSaving(false);
    }
  };

  const handleResetData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !currentMember) return;
    setResetError(null);
    setResetSuccess(null);
    setResetting(true);
    try {
      await resetShopDataToZero({
        shopId: shop.id,
        actorMember: currentMember,
        password: confirmPassword,
        mode: resetMode,
        resetStockToZero,
        deleteNonOwnerMembers,
      });
      setConfirmPassword('');
      setConfirmOpen(false);
      setResetSuccess(
        resetMode === 'full_wipe'
          ? 'Toutes les données de la boutique ont été réinitialisées à zéro (0 FCFA).'
          : 'Toutes les opérations et soldes ont été remis à zéro (catalogue conservé).'
      );
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Erreur lors de la réinitialisation.');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Paramètres de la boutique</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Apparence, identité commerciale, mentions légales (NIF / RCCM), TVA et préférences linguistiques
          </p>
        </div>
        {shop?.shopCode && (
          <div className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
            <span className="text-slate-500 dark:text-slate-400">Code Boutique multi-postes : </span>
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{shop.shopCode}</span>
          </div>
        )}
      </div>

      {/* Appearance & Light/Dark Theme Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-amber-400">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Apparence & Confort visuel
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Basculez entre le mode clair et le mode sombre selon la luminosité de votre boutique.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Basculer le thème sombre ou clair"
            onClick={toggleTheme}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-emerald-600 border-emerald-500'
                : 'bg-slate-200 border-slate-300'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
              theme === 'light'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-600 text-slate-900 dark:text-slate-100'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-500 shrink-0" />
            <div>
              <div className="text-xs font-bold">Thème Clair</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Contraste élevé idéal en journée
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors cursor-pointer ${
              theme === 'dark'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-600 text-slate-900 dark:text-slate-100'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <div className="text-xs font-bold">Thème Sombre</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Confort visuel réduit en fatigue le soir
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Multi-Device Firebase Sync & Sharing Card */}
      {shop?.shopCode && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Synchronisation Firebase Multi-Appareils</span>
          </div>

          <p className="text-xs text-slate-600 dark:text-slate-400">
            Connectez plusieurs téléphones, tablettes ou ordinateurs à cette boutique. Toutes les ventes, stocks, crédits, achats, dépenses et soldes de caisse sont partagés en temps réel via Firebase.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Code Boutique</div>
                <div className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 truncate">
                  {shop.shopCode}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyValue(shop.shopCode, 'code')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 rounded-lg cursor-pointer shrink-0"
              >
                {copiedField === 'code' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copié</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copier</span>
                  </>
                )}
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Lien direct autre appareil</div>
                <div className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">
                  {shareUrl}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyValue(shareUrl, 'link')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0"
              >
                {copiedField === 'link' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copié</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copier lien</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Sur un autre appareil : ouvrez le lien (ou cliquez sur « Connexion boutique »), saisissez <strong className="font-mono">{shop.shopCode}</strong> puis l&apos;identifiant et le code PIN d&apos;un compte créé dans <strong>Utilisateurs &amp; Droits</strong>.
          </div>
        </div>
      )}

      {/* Offline Service Worker + IndexedDB Auto-Sync Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Cache Local Hors Ligne (Service Worker &amp; IndexedDB)</span>
          </div>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <Wifi className="w-3.5 h-3.5" />
                Connecté à Firebase
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <WifiOff className="w-3.5 h-3.5" />
                Hors ligne (Mode autonome)
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          L&apos;application et vos données Firebase (produits, clients, factures, comptes) sont mises en cache localement via <strong>Service Worker</strong> et <strong>IndexedDB</strong>. Les ventes, dépenses et mouvements enregistrés sans connexion sont conservés en file locale et synchronisés automatiquement dès le retour d&apos;Internet.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Service Worker</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {typeof navigator !== 'undefined' && 'serviceWorker' in navigator
                ? 'Actif (Mode hors ligne prêt)'
                : 'Non supporté'}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Cache Firebase IndexedDB</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              Persistant multi-onglets
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">File d&apos;attente hors ligne</div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {pendingOfflineOps.length} opération{pendingOfflineOps.length > 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {pendingOfflineOps.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-1.5">
            <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Opérations en attente de synchronisation ({pendingOfflineOps.length}) :
            </div>
            <ul className="space-y-1 text-[11px] text-amber-800 dark:text-amber-300">
              {pendingOfflineOps.slice(0, 5).map((op) => (
                <li key={op.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{op.label}</span>
                  <span className="font-mono shrink-0">{op.amount.toLocaleString('fr-FR')} FCFA</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={!isOnline || isSyncingOffline || pendingOfflineOps.length === 0}
            onClick={() => void triggerOfflineSync()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOffline ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingOffline
                ? 'Synchronisation...'
                : pendingOfflineOps.length > 0
                  ? `Synchroniser (${pendingOfflineOps.length})`
                  : 'Tout est synchronisé'}
            </span>
          </button>

          <PWAInstallButton variant="card" />
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 pb-3 border-b border-slate-100 dark:border-slate-800">
          <Store className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Informations générales & Facturation</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Nom de la boutique *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Ville (Mali)</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Adresse complète</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email boutique</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">NIF</label>
            <input
              type="text"
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">RCCM</label>
            <input
              type="text"
              value={rccm}
              onChange={(e) => setRccm(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Taux TVA (%)</label>
            <select
              value={tvaRate}
              onChange={(e) => setTvaRate(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
            >
              <option value={0}>0% (Exonéré / Synthétique)</option>
              <option value={18}>18% (TVA Standard Mali)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Langue par défaut</label>
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value as LanguageCode)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="bm">Bamanankan (Bambara)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Message pied de ticket / facture
            </label>
            <input
              type="text"
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            {savedMsg && (
              <span className="text-xs font-medium text-emerald-700">
                Paramètres enregistrés avec succès.
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{saving ? 'Enregistrement...' : 'Enregistrer les modifications'}</span>
          </button>
        </div>
      </form>

      {canReset && (
        <div className="bg-white border border-rose-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-rose-100">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Réinitialisation des données à zéro</span>
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              {products.length} produits · {sales.length} ventes · {purchases.length} achats · {expenses.length} dépenses
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Remettez votre boutique à zéro pour démarrer sur des comptes propres (0 FCFA). Cette opération est irréversible.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setResetMode('full_wipe');
                setResetError(null);
                setResetSuccess(null);
              }}
              className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                resetMode === 'full_wipe'
                  ? 'bg-rose-50 border-rose-500'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Réinitialisation complète à zéro</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                Efface produits ({products.length}), catégories, clients ({customers.length}), fournisseurs ({suppliers.length}), ventes, achats, dépenses, historique et remet les caisses à 0 FCFA.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setResetMode('transactions_only');
                setResetError(null);
                setResetSuccess(null);
              }}
              className={`text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                resetMode === 'transactions_only'
                  ? 'bg-amber-50 border-amber-500'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                <span>Remise à zéro des opérations & soldes</span>
              </div>
              <p className="text-[11px] text-slate-600 mt-1">
                Efface ventes, factures, achats, dépenses, mouvements et historique ; remet caisses, crédits clients et dettes fournisseurs à 0 FCFA en gardant le catalogue.
              </p>
            </button>
          </div>

          {resetMode === 'transactions_only' ? (
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={resetStockToZero}
                onChange={(e) => setResetStockToZero(e.target.checked)}
                className="rounded border-slate-300 text-rose-600"
              />
              <span>Remettre également la quantité en stock de tous les produits à 0</span>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteNonOwnerMembers}
                onChange={(e) => setDeleteNonOwnerMembers(e.target.checked)}
                className="rounded border-slate-300 text-rose-600"
              />
              <span>Supprimer également les comptes employés (hors propriétaire)</span>
            </label>
          )}

          {resetSuccess && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
              {resetSuccess}
            </div>
          )}

          {!confirmOpen ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(true);
                  setResetError(null);
                  setResetSuccess(null);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Réinitialiser les données à zéro</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetData} className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
              <div className="text-xs font-semibold text-rose-900">
                Confirmation requise : saisissez votre mot de passe / code PIN ({currentMember?.displayName}) pour valider la mise à zéro.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Mot de passe / Code PIN"
                  className="flex-1 min-w-[200px] px-3 py-2 text-sm font-mono bg-white rounded-lg border border-rose-300"
                />
                <button
                  type="submit"
                  disabled={resetting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  {resetting ? 'Réinitialisation...' : 'Confirmer la remise à zéro'}
                </button>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => {
                    setConfirmOpen(false);
                    setConfirmPassword('');
                    setResetError(null);
                  }}
                  className="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
              </div>
              {resetError && (
                <div className="text-xs font-medium text-rose-700">{resetError}</div>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
