import React, { useMemo, useState } from 'react';
import { CreditCard, CheckCircle2, Printer } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatDateTime, formatFCFA, paymentMethodLabel } from '../../lib/format';
import { recordCreditPaymentAtomic } from '../../services/shopService';
import { Customer, LiquidPaymentMethod, Sale } from '../../types';
import { ReceiptModal } from '../ReceiptModal';

export function CreditsModule() {
  const { shop, customers, sales, creditPayments, treasuryAccounts, language } = useApp();

  const [payingTarget, setPayingTarget] = useState<{
    customer: Customer;
    sale?: Sale | null;
    maxAmount: number;
  } | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<LiquidPaymentMethod>('cash');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);

  const unpaidSales = useMemo(
    () => sales.filter((s) => s.status !== 'cancelled' && s.amountDue > 0),
    [sales]
  );

  const indebtedCustomers = useMemo(
    () => customers.filter((c) => c.creditBalance > 0),
    [customers]
  );

  const totals = useMemo(() => {
    const totalReceivables = indebtedCustomers.reduce((a, b) => a + b.creditBalance, 0);
    const totalCollected = creditPayments.reduce((a, b) => a + b.amount, 0);
    return { totalReceivables, totalCollected, count: indebtedCustomers.length };
  }, [indebtedCustomers, creditPayments]);

  const openPaymentModal = (customer: Customer, sale?: Sale | null) => {
    const maxAmt = sale ? sale.amountDue : customer.creditBalance;
    setPayingTarget({ customer, sale: sale || null, maxAmount: maxAmt });
    setAmount(maxAmt);
    setAccountId(
      treasuryAccounts.find((a) => a.type === method)?.id || treasuryAccounts[0]?.id || ''
    );
    setNotes('');
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !payingTarget || amount <= 0) return;
    const accId = accountId || treasuryAccounts[0]?.id;
    if (!accId) return;
    setSubmitting(true);
    try {
      await recordCreditPaymentAtomic({
        shopId: shop.id,
        customer: payingTarget.customer,
        sale: payingTarget.sale,
        amount,
        paymentMethod: method,
        accountId: accId,
        notes,
      });
      setPayingTarget(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Crédits clients & recouvrement</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Suivi des créances par facture et encaissement des remboursements en trésorerie
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total créances clients à recouvrer</div>
          <div className="mt-2 font-mono text-2xl font-bold text-rose-700 tabular-nums">
            {formatFCFA(totals.totalReceivables)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Clients avec solde débiteur</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {totals.count}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total remboursements encaissés</div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {formatFCFA(totals.totalCollected)}
          </div>
        </div>
      </div>

      {/* Unpaid Invoices */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">
            Factures impayées / paiements partiels ({unpaidSales.length})
          </span>
          <CreditCard className="w-4 h-4 text-amber-600" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Facture</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-right">Déjà payé</th>
                <th className="px-4 py-3 font-semibold text-right">Reste dû</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {unpaidSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Aucune facture à crédit en attente.
                  </td>
                </tr>
              ) : (
                unpaidSales.map((s) => {
                  const cust = customers.find((c) => c.id === s.customerId);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {s.invoiceNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDateTime(s.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.customerName}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatFCFA(s.total)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700">
                        {formatFCFA(s.amountPaid)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">
                        {formatFCFA(s.amountDue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewSale(s)}
                            title="Voir facture"
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {cust && (
                            <button
                              type="button"
                              onClick={() => openPaymentModal(cust, s)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Encaisser</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit Payments History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
          Historique des remboursements encaissés
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Facture liée</th>
                <th className="px-4 py-3 font-semibold">Canal / Compte</th>
                <th className="px-4 py-3 font-semibold text-right">Montant encaissé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {creditPayments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Aucun remboursement enregistré pour le moment.
                  </td>
                </tr>
              ) : (
                creditPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(p.createdAt)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.customerName}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">
                      {p.invoiceNumber || 'Solde global'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {paymentMethodLabel(p.paymentMethod, language)} · {p.accountName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      +{formatFCFA(p.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collect Payment Modal */}
      {payingTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900">
              Encaisser un remboursement
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Client : <span className="font-semibold text-slate-800">{payingTarget.customer.name}</span>
              {payingTarget.sale ? ` · Facture ${payingTarget.sale.invoiceNumber}` : ''}
            </p>
            <form onSubmit={handleRecordPayment} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Montant encaissé (FCFA) * (Max : {formatFCFA(payingTarget.maxAmount)})
                </label>
                <input
                  type="number"
                  min={1}
                  max={payingTarget.maxAmount}
                  required
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Mode de règlement</label>
                <select
                  value={method}
                  onChange={(e) => {
                    const m = e.target.value as LiquidPaymentMethod;
                    setMethod(m);
                    const match = treasuryAccounts.find((a) => a.type === m);
                    if (match) setAccountId(match.id);
                  }}
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Compte crédité</label>
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
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Note</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex : Versement partiel Orange Money"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayingTarget(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Enregistrement...' : 'Valider encaissement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewSale && <ReceiptModal sale={previewSale} onClose={() => setPreviewSale(null)} />}
    </div>
  );
}
