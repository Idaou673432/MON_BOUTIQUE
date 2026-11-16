import React, { useState } from 'react';
import { Store, ShieldCheck, ArrowRight, Globe, KeyRound, Lock, LogIn } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { ROLE_LABELS, t } from '../i18n/translations';
import {
  createShopWithOwner,
  loginWithShopCredentials,
  verifyMemberPassword,
} from '../services/shopService';
import { LanguageCode, ShopMember } from '../types';

export function LoginView() {
  const { shop, members, language, setLanguage, setSession, disconnectShop } = useApp();

  // If shop is already linked on this device, show fast Staff Unlock screen
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [pinOrPass, setPinOrPass] = useState('');

  const urlShopCode =
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('shop') || '').trim().toUpperCase()
      : '';

  // If no shop linked yet: Create Shop vs Connect Existing Shop
  const [mode, setMode] = useState<'create' | 'join'>(urlShopCode ? 'join' : 'create');

  // Create shop fields
  const [shopName, setShopName] = useState('Boutique Bamako Prestige');
  const [city, setCity] = useState('Bamako');
  const [address, setAddress] = useState('Quartier du Fleuve, Rue 312');
  const [phone, setPhone] = useState('+223 70 00 00 00');
  const [ownerName, setOwnerName] = useState('Oumar Diarra');
  const [username, setUsername] = useState('gerant');
  const [password, setPassword] = useState('1234');
  const [tvaRate, setTvaRate] = useState(0);
  const [seedCatalog, setSeedCatalog] = useState(false);

  // Join existing shop fields
  const [joinShopCode, setJoinShopCode] = useState(urlShopCode);
  const [joinUsername, setJoinUsername] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const activeMembers = members.filter((m) => m.active);
  const activeMemberTarget: ShopMember | undefined =
    activeMembers.find((m) => m.id === selectedMemberId) || activeMembers[0];

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !activeMemberTarget) return;
    setError(null);
    setLoading(true);
    try {
      const ok = await verifyMemberPassword(activeMemberTarget, pinOrPass);
      if (!ok) {
        setError('Mot de passe ou code PIN incorrect.');
      } else {
        setSession(shop.id, activeMemberTarget.uid, activeMemberTarget.displayName);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim() || !username.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { shopId, memberId } = await createShopWithOwner({
        name: shopName.trim(),
        city,
        address: address.trim(),
        phone: phone.trim(),
        nif: '',
        rccm: '',
        tvaRate,
        language,
        ownerName: ownerName.trim() || 'Gérant',
        username: username.trim(),
        password: password.trim(),
        seedStarterCatalog: seedCatalog,
      });
      setSession(shopId, memberId, ownerName.trim() || 'Gérant');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création de la boutique.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoStart = async () => {
    setError(null);
    setLoading(true);
    try {
      const { shopId, memberId } = await createShopWithOwner({
        name: 'Boutique Bamako Prestige',
        city: 'Bamako',
        address: 'ACI 2000, Bamako',
        phone: '+223 76 00 00 00',
        nif: 'NIF-ML-2026-01',
        rccm: 'MA.BKO.2026.A.104',
        tvaRate: 0,
        language,
        ownerName: 'Oumar Diarra',
        username: 'gerant',
        password: '1234',
        seedStarterCatalog: false,
      });
      setSession(shopId, memberId, 'Oumar Diarra');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'ouvrir la boutique.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinShopCode.trim() || !joinUsername.trim() || !joinPassword.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const { shop: foundShop, member } = await loginWithShopCredentials({
        shopCode: joinShopCode,
        username: joinUsername,
        password: joinPassword,
      });
      setSession(foundShop.id, member.uid, member.displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Identifiants invalides.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-8">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
            <Store className="w-4 h-4" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">SuguPay</span>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
          {(['fr', 'en', 'bm'] as LanguageCode[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                language === code
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {code === 'fr' ? 'Français' : code === 'en' ? 'English' : 'Bamanankan'}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-center">
          {shop ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Session verrouillée · {shop.shopCode}</span>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 mt-1">{shop.name}</h1>
                </div>
                <button
                  type="button"
                  onClick={disconnectShop}
                  className="text-xs text-slate-500 hover:text-slate-900 underline cursor-pointer"
                >
                  Changer de boutique
                </button>
              </div>

              {urlShopCode && urlShopCode !== shop.shopCode && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs">
                  <span className="text-emerald-900">
                    Lien multi-appareils détecté pour <strong className="font-mono">{urlShopCode}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      disconnectShop();
                      setMode('join');
                      setJoinShopCode(urlShopCode);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer shrink-0"
                  >
                    Rejoindre {urlShopCode}
                  </button>
                </div>
              )}

              <form onSubmit={handleUnlock} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Sélectionner votre profil
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeMembers.map((m) => {
                      const isSelected = activeMemberTarget?.id === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedMemberId(m.id)}
                          className={`text-left p-3 rounded-xl border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-600'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {m.displayName}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {ROLE_LABELS[language][m.role]} · @{m.username}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Mot de passe / Code PIN
                  </label>
                  <input
                    type="password"
                    required
                    value={pinOrPass}
                    onChange={(e) => setPinOrPass(e.target.value)}
                    placeholder="Entrez votre mot de passe ou PIN (ex: 1234)"
                    className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{loading ? 'Vérification...' : 'Ouvrir la session'}</span>
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-7 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  <span>Mali · FCFA (XOF) · Accès direct sans compte Google</span>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('create');
                      setError(null);
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                      mode === 'create' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Créer ma boutique
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('join');
                      setError(null);
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                      mode === 'join' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Connexion boutique
                  </button>
                </div>
              </div>

              {mode === 'create' ? (
                <form onSubmit={handleCreateShop} className="space-y-4">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 text-balance">
                      Démarrez votre caisse & gestion commerciale
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                      {t(language, 'appTagline')}. Créez votre espace boutique et votre accès gérant en 30 secondes.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nom de la boutique *
                      </label>
                      <input
                        type="text"
                        required
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Ville (Mali)
                      </label>
                      <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="Bamako">Bamako</option>
                        <option value="Sikasso">Sikasso</option>
                        <option value="Ségou">Ségou</option>
                        <option value="Mopti">Mopti</option>
                        <option value="Kayes">Kayes</option>
                        <option value="Koutiala">Koutiala</option>
                        <option value="Gao">Gao</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Téléphone (+223)
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        TVA appliquée
                      </label>
                      <select
                        value={tvaRate}
                        onChange={(e) => setTvaRate(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                      >
                        <option value={0}>0% (Exonéré)</option>
                        <option value={18}>18% (TVA Mali)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Nom du gérant / responsable *
                      </label>
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Identifiant de connexion *
                      </label>
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Mot de passe / Code PIN *
                      </label>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={seedCatalog}
                      onChange={(e) => setSeedCatalog(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-emerald-600"
                    />
                    <span className="text-slate-700">
                      Pré-remplir avec le catalogue malien (11 produits, 4 catégories, 3 clients, 2 fournisseurs & caisses Espèces / Orange Money / Moov Money / Wave).
                    </span>
                  </label>

                  {error && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                      {error}
                    </div>
                  )}

                  <div className="space-y-2.5 pt-1">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                    >
                      <span>{loading ? 'Création en cours...' : 'Créer ma boutique et entrer'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={handleQuickDemoStart}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      Ou ouvrir immédiatement une boutique vierge (0 produit · PIN : 1234)
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleJoinShop} className="space-y-4">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                      Connexion à une boutique existante
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                      Saisissez le code de votre boutique (ex : SUGU-4821) et vos identifiants.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Code Boutique *
                    </label>
                    <input
                      type="text"
                      required
                      value={joinShopCode}
                      onChange={(e) => setJoinShopCode(e.target.value.toUpperCase())}
                      placeholder="Ex : SUGU-4821"
                      className="w-full px-3.5 py-2.5 text-sm font-mono uppercase rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Identifiant utilisateur *
                    </label>
                    <input
                      type="text"
                      required
                      value={joinUsername}
                      onChange={(e) => setJoinUsername(e.target.value)}
                      placeholder="Ex : gerant ou caisse1"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mot de passe / Code PIN *
                    </label>
                    <input
                      type="password"
                      required
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{loading ? 'Connexion...' : 'Se connecter à la boutique'}</span>
                  </button>
                </form>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Base de données cloud temps réel avec mots de passe chiffrés (SHA-256) et contrôle d'accès par rôle.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-6 flex">
          <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 min-h-[420px]">
            {!imgFailed ? (
              <img
                src="/src/assets/images/login_boutique_showcase_1794760351629.jpg"
                alt="Boutique commerciale moderne équipée de SuguPay à Bamako"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900 p-10 text-white">
                <Store className="w-16 h-16 opacity-60" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent flex flex-col justify-end p-8">
              <p className="text-xs font-medium text-emerald-300">
                Bamako · Sikasso · Ségou · Mopti · Kayes
              </p>
              <h2 className="text-xl font-semibold text-white mt-1">
                Ventes, crédits clients, approvisionnements et trésorerie reliés automatiquement.
              </h2>
              <p className="text-sm text-slate-200 mt-2 max-w-xl">
                Chaque passage en caisse déduit vos stocks, alimente Orange Money / Moov Money / Wave ou la caisse espèces, et met à jour votre bénéfice net instantanément.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
