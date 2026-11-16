import React, { useMemo, useState } from 'react';
import { Printer, Search, Ban } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatDateTime, formatFCFA, paymentMethodLabel } from '../../lib/format';
import { cancelSaleAtomic } from '../../services/shopService';
import { Sale } from '../../types';
import { ReceiptModal } from '../ReceiptModal';

export function InvoicesModule() {
  const { shop, sales, language, hasPerm } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'credit' | 'cancelled'>('all');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const isAdmin = hasPerm('users');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.invoiceNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.cashierName.toLowerCase().includes(q)
      );
    });
  }, [sales, search, statusFilter]);

  const handleCancelSale = async (sale: Sale) => {
    if (!shop || sale.status === 'cancelled') return;
    setCancellingId(sale.id);
    try {
      await cancelSaleAtomic(shop.id, sale);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Factures & Reçus imprimables</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Consultez, imprimez en format Ticket 80mm ou Facture A4, et gérez les retours
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° Facture, client ou caissier..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'paid', 'partial', 'credit', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                  statusFilter === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {st === 'all'
                  ? 'Toutes'
                  : st === 'paid'
                  ? 'Payées'
                  : st === 'partial'
                  ? 'Partielles'
                  : st === 'credit'
                  ? 'À crédit'
                  : 'Annulées'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">N° Facture</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Client</th>
                <th className="px-4 py-3 font-semibold">Canal</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold text-right">Payé</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    Aucune facture enregistrée.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                      {s.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(s.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{s.customerName}</div>
                      <div className="text-[11px] text-slate-400">Par {s.cashierName}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {paymentMethodLabel(s.paymentMethod, language)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {formatFCFA(s.total)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700">
                      {formatFCFA(s.amountPaid)}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      <span
                        className={
                          s.status === 'paid'
                            ? 'text-emerald-700'
                            : s.status === 'partial'
                            ? 'text-amber-700'
                            : s.status === 'credit'
                            ? 'text-rose-700'
                            : 'text-slate-400 line-through'
                        }
                      >
                        {s.status === 'paid'
                          ? 'Payée'
                          : s.status === 'partial'
                          ? 'Partielle'
                          : s.status === 'credit'
                          ? 'À crédit'
                          : 'Annulée'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedSale(s)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Imprimer</span>
                        </button>
                        {isAdmin && s.status !== 'cancelled' && (
                          <button
                            type="button"
                            disabled={cancellingId === s.id}
                            onClick={() => handleCancelSale(s)}
                            title="Annuler cette facture et restituer le stock"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
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
      </div>

      {selectedSale && (
        <ReceiptModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}
    </div>
  );
}
