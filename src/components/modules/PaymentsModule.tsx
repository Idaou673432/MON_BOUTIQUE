import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { exportToCSV, formatDateTime, formatFCFA, paymentMethodLabel } from '../../lib/format';

export function PaymentsModule() {
  const { treasuryTransactions, language } = useApp();
  const [channelFilter, setChannelFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'in' | 'out'>('all');

  const filtered = useMemo(() => {
    return treasuryTransactions.filter((tx) => {
      if (tx.category === 'initial') return false;
      if (channelFilter !== 'all' && tx.paymentMethod !== channelFilter) return false;
      if (directionFilter !== 'all' && tx.direction !== directionFilter) return false;
      return true;
    });
  }, [treasuryTransactions, channelFilter, directionFilter]);

  const totals = useMemo(() => {
    const inflows = filtered.filter((t) => t.direction === 'in').reduce((a, b) => a + b.amount, 0);
    const outflows = filtered.filter((t) => t.direction === 'out').reduce((a, b) => a + b.amount, 0);
    return { inflows, outflows, net: inflows - outflows };
  }, [filtered]);

  const handleExport = () => {
    exportToCSV(
      'journal-paiements.csv',
      ['Date', 'Direction', 'Canal', 'Compte', 'Description', 'Montant (FCFA)'],
      filtered.map((t) => [
        formatDateTime(t.createdAt),
        t.direction === 'in' ? 'Encaissement' : 'Décaissement',
        paymentMethodLabel(t.paymentMethod, language),
        t.accountName,
        t.description,
        t.direction === 'in' ? t.amount : -t.amount,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Suivi des paiements</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tous les encaissements et décaissements (Espèces, Orange Money, Moov Money, Wave, Banque)
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Exporter CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total encaissements</div>
          <div className="mt-1.5 font-mono text-xl font-bold text-emerald-700 tabular-nums">
            +{formatFCFA(totals.inflows)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Total décaissements</div>
          <div className="mt-1.5 font-mono text-xl font-bold text-rose-700 tabular-nums">
            -{formatFCFA(totals.outflows)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Flux net de la sélection</div>
          <div className="mt-1.5 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatFCFA(totals.net)}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'in', 'out'] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => setDirectionFilter(dir)}
                className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                  directionFilter === dir ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {dir === 'all' ? 'Tous' : dir === 'in' ? 'Encaissements' : 'Décaissements'}
              </button>
            ))}
          </div>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
          >
            <option value="all">Tous les canaux</option>
            <option value="cash">Espèces</option>
            <option value="orange_money">Orange Money</option>
            <option value="moov_money">Moov Money</option>
            <option value="wave">Wave</option>
            <option value="bank">Banque / Virement</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Canal</th>
                <th className="px-4 py-3 font-semibold">Compte</th>
                <th className="px-4 py-3 font-semibold">Libellé</th>
                <th className="px-4 py-3 font-semibold text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Aucun paiement trouvé.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(p.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {paymentMethodLabel(p.paymentMethod, language)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p.accountName}</td>
                    <td className="px-4 py-3 text-slate-700">{p.description}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold ${
                        p.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {p.direction === 'in' ? '+' : '-'}
                      {formatFCFA(p.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
