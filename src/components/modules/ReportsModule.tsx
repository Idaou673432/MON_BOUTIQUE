import React, { useMemo, useState } from 'react';
import { Download, BarChart3 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { exportToCSV, formatFCFA, toDate } from '../../lib/format';

export function ReportsModule() {
  const { sales, expenses, products, purchases, customers, suppliers } = useApp();
  const [range, setRange] = useState<'today' | '7d' | 'month' | 'year' | 'all'>('month');

  const bounds = useMemo(() => {
    const now = new Date();
    if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === '7d') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (range === 'year') return new Date(now.getFullYear(), 0, 1);
    return new Date(2000, 0, 1);
  }, [range]);

  const report = useMemo(() => {
    const periodSales = sales.filter(
      (s) => s.status !== 'cancelled' && toDate(s.createdAt) >= bounds
    );
    const periodExpenses = expenses.filter((e) => toDate(e.createdAt) >= bounds);
    const periodPurchases = purchases.filter((p) => toDate(p.createdAt) >= bounds);

    const grossSales = periodSales.reduce((a, s) => a + s.subtotal, 0);
    const discounts = periodSales.reduce((a, s) => a + s.discount, 0);
    const tvaCollected = periodSales.reduce((a, s) => a + s.tvaAmount, 0);
    const netRevenue = periodSales.reduce((a, s) => a + s.total, 0);
    const cogs = periodSales.reduce((a, s) => a + (s.totalCost || 0), 0);
    const grossMargin = netRevenue - tvaCollected - cogs;

    const totalExpenses = periodExpenses
      .filter((e) => e.type === 'expense')
      .reduce((a, e) => a + e.amount, 0);
    const otherIncome = periodExpenses
      .filter((e) => e.type === 'other_income')
      .reduce((a, e) => a + e.amount, 0);

    const netProfit = grossMargin - totalExpenses + otherIncome;
    const marginRate = netRevenue > 0 ? Math.round((netProfit / netRevenue) * 1000) / 10 : 0;

    // Product profitability
    const prodMap = new Map<
      string,
      { name: string; qty: number; revenue: number; cost: number; profit: number }
    >();
    for (const s of periodSales) {
      for (const item of s.items) {
        if (item.productId === 'dette_directe') continue;
        const cur = prodMap.get(item.productId) || {
          name: item.productName,
          qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };
        const itemCost = (item.costPrice || 0) * item.quantity;
        cur.qty += item.quantity;
        cur.revenue += item.lineTotal;
        cur.cost += itemCost;
        cur.profit += item.lineTotal - itemCost;
        prodMap.set(item.productId, cur);
      }
    }

    // Cashier breakdown
    const cashierMap = new Map<string, { name: string; count: number; total: number }>();
    for (const s of periodSales) {
      const cur = cashierMap.get(s.cashierId) || { name: s.cashierName, count: 0, total: 0 };
      cur.count += 1;
      cur.total += s.total;
      cashierMap.set(s.cashierId, cur);
    }

    // Expense breakdown by category
    const expCatMap = new Map<string, number>();
    for (const e of periodExpenses.filter((x) => x.type === 'expense')) {
      expCatMap.set(e.category, (expCatMap.get(e.category) || 0) + e.amount);
    }

    const totalPurchases = periodPurchases.reduce((a, p) => a + p.total, 0);
    const totalReceivables = customers.reduce((a, c) => a + c.creditBalance, 0);
    const totalPayables = suppliers.reduce((a, s) => a + s.debtBalance, 0);
    const stockValuation = products.reduce(
      (a, p) => a + Math.max(0, p.stock) * p.costPrice,
      0
    );

    return {
      salesCount: periodSales.length,
      grossSales,
      discounts,
      tvaCollected,
      netRevenue,
      cogs,
      grossMargin,
      totalExpenses,
      otherIncome,
      netProfit,
      marginRate,
      totalPurchases,
      totalReceivables,
      totalPayables,
      stockValuation,
      productPerf: Array.from(prodMap.values()).sort((a, b) => b.profit - a.profit),
      cashierPerf: Array.from(cashierMap.values()).sort((a, b) => b.total - a.total),
      expenseByCategory: Array.from(expCatMap.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [sales, expenses, purchases, customers, suppliers, products, bounds]);

  const handleExportIncomeStatement = () => {
    exportToCSV(
      `rapport-financier-${range}.csv`,
      ['Poste comptable', 'Montant (FCFA)'],
      [
        ['Nombre de ventes', report.salesCount],
        ['Ventes brutes HT', report.grossSales],
        ['Remises accordées', -report.discounts],
        ['TVA collectée', report.tvaCollected],
        ["Chiffre d'affaires TTC", report.netRevenue],
        ['Coût des marchandises vendues (CMV)', -report.cogs],
        ['Marge brute commerciale', report.grossMargin],
        ["Charges d'exploitation (Dépenses)", -report.totalExpenses],
        ['Autres recettes', report.otherIncome],
        ['Bénéfice net réel', report.netProfit],
        ['Total approvisionnements période', report.totalPurchases],
        ['Créances clients totales', report.totalReceivables],
        ['Dettes fournisseurs totales', report.totalPayables],
        ['Valorisation stock actuel (coût)', report.stockValuation],
      ]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Rapports financiers & analytiques</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Compte de résultat, rentabilité par produit et performance commerciale
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(
              [
                ['today', "Aujourd'hui"],
                ['7d', '7 jours'],
                ['month', 'Ce mois'],
                ['year', 'Cette année'],
                ['all', 'Tout'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRange(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  range === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportIncomeStatement}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter bilan CSV</span>
          </button>
        </div>
      </div>

      {/* Income Statement & Balance Sheet Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Compte de résultat de la période</h2>
            <BarChart3 className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="divide-y divide-slate-100 text-xs tabular-nums">
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Ventes brutes ({report.salesCount} tickets)</span>
              <span className="font-mono font-medium text-slate-900">{formatFCFA(report.grossSales)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Remises commerciales accordées</span>
              <span className="font-mono text-rose-700">-{formatFCFA(report.discounts)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">TVA collectée</span>
              <span className="font-mono text-slate-700">{formatFCFA(report.tvaCollected)}</span>
            </div>
            <div className="py-2.5 flex justify-between font-semibold">
              <span className="text-slate-900">Chiffre d'affaires encaissé / facturé</span>
              <span className="font-mono text-slate-900">{formatFCFA(report.netRevenue)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Coût d'achat des marchandises vendues (CMV)</span>
              <span className="font-mono text-rose-700">-{formatFCFA(report.cogs)}</span>
            </div>
            <div className="py-2.5 flex justify-between font-semibold bg-slate-50 px-2 rounded">
              <span className="text-slate-900">Marge brute commerciale</span>
              <span className="font-mono text-emerald-700">{formatFCFA(report.grossMargin)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Charges d'exploitation (Dépenses)</span>
              <span className="font-mono text-rose-700">-{formatFCFA(report.totalExpenses)}</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Autres recettes hors ventes</span>
              <span className="font-mono text-emerald-700">+{formatFCFA(report.otherIncome)}</span>
            </div>
            <div className="py-3.5 flex justify-between text-sm font-bold">
              <span className="text-slate-900">Bénéfice Net Réel ({report.marginRate}%)</span>
              <span
                className={`font-mono ${
                  report.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatFCFA(report.netProfit)}
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-4">Situation patrimoniale</h2>
            <div className="space-y-3 text-xs tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600">Valorisation du stock (Coût)</span>
                <span className="font-mono font-bold text-slate-900">
                  {formatFCFA(report.stockValuation)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Créances clients à recevoir</span>
                <span className="font-mono font-bold text-amber-700">
                  {formatFCFA(report.totalReceivables)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Dettes fournisseurs à payer</span>
                <span className="font-mono font-bold text-rose-700">
                  {formatFCFA(report.totalPayables)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100">
                <span className="text-slate-600">Achats / Appros de la période</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formatFCFA(report.totalPurchases)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Répartition des charges</h2>
            {report.expenseByCategory.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">Aucune dépense sur la période.</p>
            ) : (
              <div className="space-y-2.5 text-xs tabular-nums">
                {report.expenseByCategory.map(([cat, amt]) => (
                  <div key={cat} className="flex justify-between">
                    <span className="text-slate-700">{cat}</span>
                    <span className="font-mono font-semibold text-rose-700">
                      {formatFCFA(amt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Profitability & Cashier Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-bold text-slate-900">
            Rentabilité par produit (Top 10)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Produit</th>
                  <th className="px-4 py-3 font-semibold text-right">Qté vendue</th>
                  <th className="px-4 py-3 font-semibold text-right">Chiffre d'affaires</th>
                  <th className="px-4 py-3 font-semibold text-right">Marge générée</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {report.productPerf.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Aucune donnée de vente sur cette période.
                    </td>
                  </tr>
                ) : (
                  report.productPerf.slice(0, 10).map((p, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                      <td className="px-4 py-3 text-right font-mono">{p.qty}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatFCFA(p.revenue)}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        {formatFCFA(p.profit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-bold text-slate-900">
            Ventes par caissier
          </div>
          <div className="divide-y divide-slate-100 p-4 tabular-nums text-xs">
            {report.cashierPerf.length === 0 ? (
              <p className="text-slate-400 py-6 text-center">Aucune vente.</p>
            ) : (
              report.cashierPerf.map((c, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-slate-500">{c.count} factures</div>
                  </div>
                  <div className="font-mono font-bold text-slate-900">{formatFCFA(c.total)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
