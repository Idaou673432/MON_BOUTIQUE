import React, { useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Wallet, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatFCFA } from '../../lib/format';
import {
  paySupplierDebtAtomic,
  removeCustomer,
  removeSupplier,
  saveCustomer,
  saveSupplier,
} from '../../services/shopService';
import { Customer, LiquidPaymentMethod, Supplier } from '../../types';

export function ContactsModule() {
  const { shop, customers, suppliers, treasuryAccounts, hasPerm } = useApp();
  const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');
  const [search, setSearch] = useState('');
  const [editingCust, setEditingCust] = useState<Partial<Customer> | null>(null);
  const [editingSupp, setEditingSupp] = useState<Partial<Supplier> | null>(null);
  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<LiquidPaymentMethod>('cash');
  const [payAccountId, setPayAccountId] = useState('');
  const [saving, setSaving] = useState(false);

  const isAdmin = hasPerm('users');

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
    );
  }, [customers, search]);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.nif && s.nif.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  const handleSaveCust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !editingCust?.name) return;
    setSaving(true);
    try {
      await saveCustomer(shop.id, {
        id: editingCust.id,
        name: editingCust.name,
        phone: editingCust.phone || '',
        address: editingCust.address || '',
        email: editingCust.email || '',
        notes: editingCust.notes || '',
      });
      setEditingCust(null);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSupp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !editingSupp?.name) return;
    setSaving(true);
    try {
      await saveSupplier(shop.id, {
        id: editingSupp.id,
        name: editingSupp.name,
        phone: editingSupp.phone || '',
        address: editingSupp.address || '',
        email: editingSupp.email || '',
        nif: editingSupp.nif || '',
      });
      setEditingSupp(null);
    } finally {
      setSaving(false);
    }
  };

  const handlePaySupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !payingSupplier || payAmount <= 0) return;
    const accId = payAccountId || treasuryAccounts[0]?.id;
    if (!accId) return;
    setSaving(true);
    try {
      await paySupplierDebtAtomic({
        shopId: shop.id,
        supplier: payingSupplier,
        amount: payAmount,
        paymentMethod: payMethod,
        accountId: accId,
      });
      setPayingSupplier(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('customers')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              tab === 'customers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Clients ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('suppliers')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              tab === 'suppliers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Fournisseurs ({suppliers.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            tab === 'customers'
              ? setEditingCust({ name: '', phone: '+223 ', address: '', email: '', notes: '' })
              : setEditingSupp({ name: '', phone: '+223 ', address: '', email: '', nif: '' })
          }
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{tab === 'customers' ? 'Nouveau client' : 'Nouveau fournisseur'}</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === 'customers'
                  ? 'Rechercher client par nom ou téléphone...'
                  : 'Rechercher fournisseur par nom ou NIF...'
              }
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300"
            />
          </div>
        </div>

        {tab === 'customers' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Client</th>
                  <th className="px-4 py-3 font-semibold">Téléphone</th>
                  <th className="px-4 py-3 font-semibold">Adresse</th>
                  <th className="px-4 py-3 font-semibold text-right">Total achats</th>
                  <th className="px-4 py-3 font-semibold text-right">Crédit dû</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      Aucun client enregistré.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{c.phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{c.address || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-900">
                        {formatFCFA(c.totalSpent)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          c.creditBalance > 0 ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatFCFA(c.creditBalance)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingCust(c)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && shop && (
                            <button
                              type="button"
                              onClick={() => removeCustomer(shop.id, c.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fournisseur</th>
                  <th className="px-4 py-3 font-semibold">Téléphone</th>
                  <th className="px-4 py-3 font-semibold">NIF / Adresse</th>
                  <th className="px-4 py-3 font-semibold text-right">Total appros</th>
                  <th className="px-4 py-3 font-semibold text-right">Dette à payer</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                      Aucun fournisseur enregistré.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{s.phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {s.nif ? `${s.nif} · ` : ''}
                        {s.address || '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-900">
                        {formatFCFA(s.totalPurchased)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-bold ${
                          s.debtBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatFCFA(s.debtBalance)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {s.debtBalance > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayingSupplier(s);
                                setPayAmount(s.debtBalance);
                                setPayAccountId(treasuryAccounts[0]?.id || '');
                              }}
                              title="Régler dette fournisseur"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded cursor-pointer"
                            >
                              <Wallet className="w-3 h-3" />
                              <span>Régler</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingSupp(s)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && shop && (
                            <button
                              type="button"
                              onClick={() => removeSupplier(shop.id, s.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Modal */}
      {editingCust && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingCust.id ? 'Modifier client' : 'Nouveau client'}
              </h3>
              <button type="button" onClick={() => setEditingCust(null)} className="p-1 text-slate-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveCust} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nom complet *</label>
                <input
                  type="text"
                  required
                  value={editingCust.name || ''}
                  onChange={(e) => setEditingCust({ ...editingCust, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
                <input
                  type="text"
                  value={editingCust.phone || ''}
                  onChange={(e) => setEditingCust({ ...editingCust, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Adresse / Quartier</label>
                <input
                  type="text"
                  value={editingCust.address || ''}
                  onChange={(e) => setEditingCust({ ...editingCust, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={editingCust.notes || ''}
                  onChange={(e) => setEditingCust({ ...editingCust, notes: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCust(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {editingSupp && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingSupp.id ? 'Modifier fournisseur' : 'Nouveau fournisseur'}
              </h3>
              <button type="button" onClick={() => setEditingSupp(null)} className="p-1 text-slate-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSupp} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Raison sociale *</label>
                <input
                  type="text"
                  required
                  value={editingSupp.name || ''}
                  onChange={(e) => setEditingSupp({ ...editingSupp, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
                <input
                  type="text"
                  value={editingSupp.phone || ''}
                  onChange={(e) => setEditingSupp({ ...editingSupp, phone: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Adresse</label>
                <input
                  type="text"
                  value={editingSupp.address || ''}
                  onChange={(e) => setEditingSupp({ ...editingSupp, address: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">NIF</label>
                <input
                  type="text"
                  value={editingSupp.nif || ''}
                  onChange={(e) => setEditingSupp({ ...editingSupp, nif: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingSupp(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pay Supplier Debt Modal */}
      {payingSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900">
              Régler dette · {payingSupplier.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Dette actuelle : <span className="font-mono font-bold text-slate-900">{formatFCFA(payingSupplier.debtBalance)}</span>
            </p>
            <form onSubmit={handlePaySupplier} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Montant (FCFA) *</label>
                <input
                  type="number"
                  min={1}
                  max={payingSupplier.debtBalance}
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mode de paiement</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as LiquidPaymentMethod)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  <option value="cash">Espèces</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="moov_money">Moov Money</option>
                  <option value="wave">Wave</option>
                  <option value="bank">Banque / Virement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Compte débité</label>
                <select
                  value={payAccountId}
                  onChange={(e) => setPayAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  {treasuryAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatFCFA(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayingSupplier(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  Confirmer le règlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
