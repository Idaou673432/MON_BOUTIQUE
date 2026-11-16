import React, { useState } from 'react';
import { Check, Copy, Share2, Shield, Trash2, UserPlus } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { ROLE_DEFAULT_PERMISSIONS, ROLE_LABELS } from '../../i18n/translations';
import {
  createShopMember,
  deleteShopMember,
  updateShopMember,
} from '../../services/shopService';
import { PermissionKey, RoleId, ShopMember } from '../../types';

const ALL_PERMISSIONS: { key: PermissionKey; label: string }[] = [
  { key: 'dashboard', label: 'Tableau de bord' },
  { key: 'pos', label: 'Caisse (POS)' },
  { key: 'products', label: 'Produits' },
  { key: 'inventory', label: 'Stocks & Ajustements' },
  { key: 'customers', label: 'Clients & Fournisseurs' },
  { key: 'credits', label: 'Crédits Clients' },
  { key: 'purchases', label: 'Achats & Appros' },
  { key: 'expenses', label: 'Dépenses & Recettes' },
  { key: 'treasury', label: 'Trésorerie' },
  { key: 'payments', label: 'Paiements' },
  { key: 'invoices', label: 'Factures & Reçus' },
  { key: 'history', label: 'Historique complet' },
  { key: 'reports', label: 'Rapports financiers' },
  { key: 'users', label: 'Utilisateurs & Droits' },
  { key: 'settings', label: 'Paramètres boutique' },
];

export function UsersModule() {
  const { shop, members, language } = useApp();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMember, setEditingMember] = useState<(ShopMember & { newPassword?: string }) | null>(
    null
  );

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('1234');
  const [phone, setPhone] = useState('+223 ');
  const [role, setRole] = useState<Exclude<RoleId, 'owner'>>('cashier');
  const [perms, setPerms] = useState<PermissionKey[]>(ROLE_DEFAULT_PERMISSIONS.cashier);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const shareUrl =
    typeof window !== 'undefined' && shop?.shopCode
      ? `${window.location.origin}/?shop=${encodeURIComponent(shop.shopCode)}`
      : '';

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(false);
    }
  };

  const togglePerm = (
    key: PermissionKey,
    list: PermissionKey[],
    setter: (v: PermissionKey[]) => void
  ) => {
    if (list.includes(key)) setter(list.filter((k) => k !== key));
    else setter([...list, key]);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !displayName.trim() || !username.trim() || !password.trim()) return;
    const exists = members.some(
      (m) => m.username.toLowerCase() === username.trim().toLowerCase()
    );
    if (exists) {
      setError('Cet identifiant existe déjà dans la boutique.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await createShopMember({
        shopId: shop.id,
        displayName: displayName.trim(),
        username: username.trim(),
        password: password.trim(),
        phone: phone.trim(),
        role,
        permissions: perms,
      });
      setShowCreateModal(false);
      setDisplayName('');
      setUsername('');
      setPassword('1234');
      setPhone('+223 ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !editingMember) return;
    setSubmitting(true);
    try {
      await updateShopMember({
        shopId: shop.id,
        memberId: editingMember.id,
        displayName: editingMember.displayName,
        phone: editingMember.phone,
        role: editingMember.role === 'owner' ? undefined : (editingMember.role as Exclude<RoleId, 'owner'>),
        permissions: editingMember.permissions,
        active: editingMember.active,
        newPassword: editingMember.newPassword,
        isOwner: editingMember.role === 'owner',
      });
      setEditingMember(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Utilisateurs & Permissions</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Code Boutique : <span className="font-mono font-bold text-slate-900">{shop?.shopCode}</span> · Créez des accès caissiers, stock ou comptables avec identifiant & code PIN
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setRole('cashier');
            setPerms(ROLE_DEFAULT_PERMISSIONS.cashier);
            setError(null);
            setShowCreateModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Nouvel utilisateur</span>
        </button>
      </div>

      {shop?.shopCode && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Share2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="text-xs min-w-0">
              <div className="font-semibold text-slate-900">
                Partager cette boutique avec un autre téléphone ou PC (Firebase temps réel)
              </div>
              <div className="text-slate-500 mt-0.5 truncate">
                Code Boutique : <span className="font-mono font-bold text-slate-900">{shop.shopCode}</span> · Chaque utilisateur ci-dessous peut se connecter depuis son appareil.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg cursor-pointer shrink-0"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Lien copié</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copier lien appareil</span>
              </>
            )}
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">
            Comptes utilisateurs de la boutique ({members.length})
          </span>
          <Shield className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Nom & Identifiant</th>
                <th className="px-4 py-3 font-semibold">Rôle</th>
                <th className="px-4 py-3 font-semibold">Modules autorisés</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{m.displayName}</div>
                    <div className="text-[11px] font-mono text-slate-500">
                      @{m.username} {m.phone ? `· ${m.phone}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {ROLE_LABELS[language][m.role]}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {m.role === 'owner' || m.role === 'admin'
                      ? 'Accès complet (Tous modules)'
                      : `${m.permissions.length} modules`}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    <span className={m.active ? 'text-emerald-700' : 'text-rose-700'}>
                      {m.active ? 'Actif' : 'Suspendu'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingMember({ ...m, newPassword: '' })}
                        className="px-3 py-1.5 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded cursor-pointer"
                      >
                        Modifier
                      </button>
                      {m.role !== 'owner' && shop && (
                        <button
                          type="button"
                          onClick={() => deleteShopMember(shop.id, m.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Member Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6">
            <h3 className="text-base font-bold text-slate-900">Créer un utilisateur boutique</h3>
            <form onSubmit={handleCreateUser} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nom complet *</label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ex : Moussa Koné"
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">Identifiant *</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex : moussa"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Mot de passe / Code PIN *
                  </label>
                  <input
                    type="text"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Rôle</label>
                <select
                  value={role}
                  onChange={(e) => {
                    const r = e.target.value as Exclude<RoleId, 'owner'>;
                    setRole(r);
                    setPerms(ROLE_DEFAULT_PERMISSIONS[r]);
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  <option value="cashier">Caissier(ère)</option>
                  <option value="stock_manager">Gestionnaire Stock</option>
                  <option value="accountant">Comptable</option>
                  <option value="admin">Gérant / Admin</option>
                </select>
              </div>

              <div>
                <div className="text-xs font-medium text-slate-700 mb-2">Permissions par module</div>
                <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto p-3 rounded-lg bg-slate-50 border border-slate-200">
                  {ALL_PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={perms.includes(p.key)}
                        onChange={() => togglePerm(p.key, perms, setPerms)}
                        className="rounded border-slate-300 text-emerald-600"
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Création...' : 'Créer le compte'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {editingMember && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6">
            <h3 className="text-base font-bold text-slate-900">
              Modifier {editingMember.displayName} (@{editingMember.username})
            </h3>
            <form onSubmit={handleSaveMember} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nom complet</label>
                  <input
                    type="text"
                    required
                    value={editingMember.displayName}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, displayName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Nouveau mot de passe / PIN (optionnel)
                  </label>
                  <input
                    type="text"
                    value={editingMember.newPassword || ''}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, newPassword: e.target.value })
                    }
                    placeholder="Laisser vide pour conserver"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              {editingMember.role !== 'owner' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Rôle</label>
                      <select
                        value={editingMember.role}
                        onChange={(e) => {
                          const r = e.target.value as Exclude<RoleId, 'owner'>;
                          setEditingMember({
                            ...editingMember,
                            role: r,
                            permissions: ROLE_DEFAULT_PERMISSIONS[r],
                          });
                        }}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="cashier">Caissier(ère)</option>
                        <option value="stock_manager">Gestionnaire Stock</option>
                        <option value="accountant">Comptable</option>
                        <option value="admin">Gérant / Admin</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Statut</label>
                      <select
                        value={editingMember.active ? 'true' : 'false'}
                        onChange={(e) =>
                          setEditingMember({ ...editingMember, active: e.target.value === 'true' })
                        }
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="true">Actif</option>
                        <option value="false">Suspendu</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto p-3 rounded-lg bg-slate-50 border border-slate-200">
                    {ALL_PERMISSIONS.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingMember.permissions.includes(p.key)}
                          onChange={() =>
                            togglePerm(p.key, editingMember.permissions, (next) =>
                              setEditingMember({ ...editingMember, permissions: next })
                            )
                          }
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        <span>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  Mettre à jour
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
