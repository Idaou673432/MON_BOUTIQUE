import React, { useState } from 'react';
import { Plus, Trash2, Truck } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatDateTime, formatFCFA, paymentMethodLabel } from '../../lib/format';
import { createPurchaseAtomic } from '../../services/shopService';
import { PaymentMethod, PurchaseLineItem } from '../../types';

export function PurchasesModule() {
  const { shop, suppliers, products, purchases, treasuryAccounts, language } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<PurchaseLineItem[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [accountId, setAccountId] = useState('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openNewPurchase = () => {
    const firstProd = products[0];
    setSelectedProdId(firstProd?.id || '');
    setUnitCost(firstProd?.costPrice || 0);
    setQty(1);
    setItems([]);
    setSupplierId(suppliers[0]?.id || '');
    setAccountId(treasuryAccounts[0]?.id || '');
    setAmountPaid('');
    setError(null);
    setShowForm(true);
  };

  const addItemLine = () => {
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod || qty <= 0) return;
    setItems((prev) => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        unit: prod.unit,
        quantity: qty,
        unitCost: Math.max(0, unitCost),
        lineTotal: qty * Math.max(0, unitCost),
      },
    ]);
  };

  const totalPurchase = items.reduce((a, b) => a + b.lineTotal, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || items.length === 0) {
      setError('Ajoutez au moins un produit à réapprovisionner.');
      return;
    }
    const supplier = suppliers.find((s) => s.id === supplierId) || null;
    const paid =
      paymentMethod === 'credit'
        ? Math.max(0, Number(amountPaid) || 0)
        : amountPaid.trim() === ''
        ? totalPurchase
        : Math.max(0, Number(amountPaid) || 0);

    if (totalPurchase - paid > 0 && !supplier) {
      setError('Sélectionnez un fournisseur enregistré pour un achat à crédit.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await createPurchaseAtomic({
        shopId: shop.id,
        supplier,
        supplierNameFallback: 'Fournisseur divers',
        items,
        paymentMethod,
        accountId: accountId || treasuryAccounts[0]?.id,
        amountPaid: paid,
        notes,
      });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement de l'achat.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Achats & Approvisionnements</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Met à jour automatiquement le stock, le prix d'achat, la trésorerie et les dettes fournisseurs
          </p>
        </div>
        <button
          type="button"
          onClick={openNewPurchase}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nouvel approvisionnement</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">
            Bons d'achat enregistrés ({purchases.length})
          </span>
          <Truck className="w-4 h-4 text-slate-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Référence</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Fournisseur</th>
                <th className="px-4 py-3 font-semibold">Articles</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-right">Payé</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {purchases.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Aucun approvisionnement enregistré.
                  </td>
                </tr>
              ) : (
                purchases.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                      {p.reference}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{p.supplierName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {formatFCFA(p.total)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {formatFCFA(p.amountPaid)} · {paymentMethodLabel(p.paymentMethod, language)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          p.status === 'paid'
                            ? 'text-emerald-700'
                            : p.status === 'partial'
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {p.status === 'paid' ? 'Soldé' : p.status === 'partial' ? 'Partiel' : 'À crédit'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Nouvel achat / Entrée de stock</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fournisseur</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  <option value="">Fournisseur divers (Comptant)</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mode de règlement</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  <option value="cash">Espèces</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="moov_money">Moov Money</option>
                  <option value="wave">Wave</option>
                  <option value="bank">Banque / Virement</option>
                  <option value="credit">À crédit fournisseur</option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="text-xs font-semibold text-slate-700">Ajouter un produit au bon</div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] text-slate-600 mb-1">Produit</label>
                  <select
                    value={selectedProdId}
                    onChange={(e) => {
                      setSelectedProdId(e.target.value);
                      const p = products.find((x) => x.id === e.target.value);
                      if (p) setUnitCost(p.costPrice);
                    }}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-slate-600 mb-1">Qté</label>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] text-slate-600 mb-1">Coût unitaire (FCFA)</label>
                  <input
                    type="number"
                    min={0}
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={addItemLine}
                    className="w-full py-2 px-3 bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Ajouter
                  </button>
                </div>
              </div>

              {items.length > 0 && (
                <div className="mt-3 divide-y divide-slate-200 border-t border-slate-200">
                  {items.map((item, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between text-xs tabular-nums">
                      <div>
                        <span className="font-semibold text-slate-900">{item.productName}</span>
                        <span className="text-slate-500 ml-2">
                          {item.quantity} × {formatFCFA(item.unitCost)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold">{formatFCFA(item.lineTotal)}</span>
                        <button
                          type="button"
                          onClick={() => setItems(items.filter((_, i) => i !== idx))}
                          className="text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {paymentMethod !== 'credit' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Compte débité</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                  >
                    {treasuryAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatFCFA(a.balance)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Montant payé (FCFA)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={totalPurchase}
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder={String(totalPurchase)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex : Facture fournisseur N° 441"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {error}
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-slate-200">
              <div className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                Total : {formatFCFA(totalPurchase)}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Enregistrement...' : 'Valider approvisionnement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
