import React, { useMemo, useState } from 'react';
import { Search, Download } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { exportToCSV, formatDateTime, formatFCFA } from '../../lib/format';

export function HistoryModule() {
  const { activityLogs } = useApp();
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activityLogs.filter((log) => {
      if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;
      if (!q) return true;
      return (
        log.description.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.userName.toLowerCase().includes(q)
      );
    });
  }, [activityLogs, search, moduleFilter]);

  const handleExport = () => {
    exportToCSV(
      'historique-operations.csv',
      ['Date', 'Module', 'Action', 'Description', 'Montant (FCFA)', 'Utilisateur'],
      filtered.map((l) => [
        formatDateTime(l.createdAt),
        l.module,
        l.action,
        l.description,
        l.amount,
        l.userName,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Historique complet des opérations</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Journal chronologique d'audit de toutes les actions effectuées dans la boutique
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

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une opération ou un utilisateur..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300"
            />
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
          >
            <option value="all">Tous les modules</option>
            <option value="pos">Caisse (POS)</option>
            <option value="products">Produits</option>
            <option value="inventory">Stocks</option>
            <option value="credits">Crédits</option>
            <option value="purchases">Achats</option>
            <option value="expenses">Dépenses</option>
            <option value="treasury">Trésorerie</option>
            <option value="invoices">Factures</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date & Heure</th>
                <th className="px-4 py-3 font-semibold">Module · Action</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold">Opérateur</th>
                <th className="px-4 py-3 font-semibold text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Aucune opération enregistrée.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-700">
                      {log.module.toUpperCase()} · {log.action}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{log.description}</td>
                    <td className="px-4 py-3 text-slate-600">{log.userName}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                      {log.amount > 0 ? formatFCFA(log.amount) : '—'}
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
