import React, { useMemo, useState } from 'react';
import { Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatDateTime, formatFCFA, paymentMethodLabel } from '../../lib/format';
import { recordExpenseOrIncomeAtomic } from '../../services/shopService';
import { LiquidPaymentMethod } from '../../types';

const EXPENSE_CATEGORIES = [
  'Loyer boutique',
  'Électricité (EDM)',
  'Eau (SOMAGEP)',
  'Salaires & Primes',
  'Transport & Livraison',
  'Téléphone & Internet',
  'Impôts & Patente',
  'Fournitures & Emballages',
  'Autres charges',
];

const INCOME_CATEGORIES = [
  'Commission Mobile Money',
  'Location / Sous-location',
  'Remboursement fournisseur',
  'Autre recette',
];

export function ExpensesModule() {
  const { shop, expenses, treasuryAccounts, language } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [opType, setOpType] = useState<'expense' | 'other_income'>('expense');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<LiquidPaymentMethod>('cash');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const summary = useMemo(() => {
    const totalExpenses = expenses
      .filter((e) => e.type === 'expense')
      .reduce((a, b) => a + b.amount, 0);
    const totalOtherIncome = expenses
      .filter((e) => e.type === 'other_income')
      .reduce((a, b) => a + b.amount, 0);
    return { totalExpenses, totalOtherIncome };
  }, [expenses]);

  const openModal = (type: 'expense' | 'other_income') => {
    setOpType(type);
    setCategory(type === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
    setTitle('');
    setAmount(0);
    setAccountId(treasuryAccounts[0]?.id || '');
    setNotes('');
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !title.trim() || amount <= 0) return;
    const accId = accountId || treasuryAccounts[0]?.id;
    if (!accId) return;
    setSubmitting(true);
    try {
      await recordExpenseOrIncomeAtomic({
        shopId: shop.id,
        type: opType,
        category,
        title: title.trim(),
        amount,
        paymentMethod: method,
        accountId: accId,
        notes,
      });
      setShowModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dépenses & Autres Recettes</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Impacte directement vos soldes de trésorerie et le calcul du bénéfice net
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openModal('other_income')}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Autre recette</span>
          </button>
          <button
            type="button"
            onClick={() => openModal('expense')}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouvelle dépense</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Total dépenses enregistrées</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-rose-700 tabular-nums">
              {formatFCFA(summary.totalExpenses)}
            </div>
          </div>
          <TrendingDown className="w-6 h-6 text-rose-500" />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">Autres recettes hors ventes</div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
              {formatFCFA(summary.totalOtherIncome)}
            </div>
          </div>
          <TrendingUp className="w-6 h-6 text-emerald-500" />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Libellé & Catégorie</th>
                <th className="px-4 py-3 font-semibold">Compte</th>
                <th className="px-4 py-3 font-semibold text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Aucune dépense ou recette enregistrée.
                  </td>
                </tr>
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(e.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold">
                      <span className={e.type === 'expense' ? 'text-rose-700' : 'text-emerald-700'}>
                        {e.type === 'expense' ? 'Dépense' : 'Recette'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{e.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {e.category} · {e.recordedByName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {paymentMethodLabel(e.paymentMethod, language)} · {e.accountName}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold ${
                        e.type === 'expense' ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {e.type === 'expense' ? '-' : '+'}
                      {formatFCFA(e.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900">
              {opType === 'expense' ? 'Enregistrer une dépense' : 'Enregistrer une autre recette'}
            </h3>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catégorie</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  {(opType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Libellé *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Facture EDM Novembre"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Montant (FCFA) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Canal</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as LiquidPaymentMethod)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="cash">Espèces</option>
                    <option value="orange_money">Orange Money</option>
                    <option value="moov_money">Moov Money</option>
                    <option value="wave">Wave</option>
                    <option value="bank">Banque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Compte</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                  >
                    {treasuryAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
