import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  ShoppingCart,
  Package,
  CreditCard,
  Receipt,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatDateTime, formatFCFA, paymentMethodLabel, toDate } from '../../lib/format';
import { t } from '../../i18n/translations';
import { ModuleId } from '../../types';

interface DashboardModuleProps {
  onNavigate: (module: ModuleId) => void;
}

export function DashboardModule({ onNavigate }: DashboardModuleProps) {
  const {
    sales,
    expenses,
    products,
    customers,
    treasuryAccounts,
    activityLogs,
    language,
    hasPerm,
  } = useApp();

  const [period, setPeriod] = useState<'7d' | '30d' | '12m'>('7d');

  const activeSales = useMemo(
    () => sales.filter((s) => s.status !== 'cancelled'),
    [sales]
  );

  const metrics = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let todayRevenue = 0;
    let monthRevenue = 0;
    let monthCogs = 0;

    for (const s of activeSales) {
      const d = toDate(s.createdAt);
      if (d >= startToday) todayRevenue += s.total;
      if (d >= startMonth) {
        monthRevenue += s.total;
        monthCogs += s.totalCost || 0;
      }
    }

    let monthExpenses = 0;
    let monthOtherIncome = 0;
    for (const e of expenses) {
      const d = toDate(e.createdAt);
      if (d >= startMonth) {
        if (e.type === 'expense') monthExpenses += e.amount;
        else monthOtherIncome += e.amount;
      }
    }

    const netProfit = monthRevenue - monthCogs - monthExpenses + monthOtherIncome;
    const totalReceivables = customers.reduce((sum, c) => sum + (c.creditBalance || 0), 0);
    const stockCostValue = products.reduce(
      (sum, p) => sum + Math.max(0, p.stock) * (p.costPrice || 0),
      0
    );
    const totalTreasury = treasuryAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
    const lowStockList = products.filter((p) => p.active && p.stock <= p.minStock);

    return {
      todayRevenue,
      monthRevenue,
      netProfit,
      monthExpenses,
      totalReceivables,
      stockCostValue,
      totalTreasury,
      lowStockList,
    };
  }, [activeSales, expenses, customers, products, treasuryAccounts]);

  const chartSeries = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; sales: number; expenses: number }[] = [];

    if (period === '12m') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString('fr-FR', { month: 'short' });
        const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const sSum = activeSales
          .filter((s) => {
            const sd = toDate(s.createdAt);
            return sd >= mStart && sd < mEnd;
          })
          .reduce((a, b) => a + b.total, 0);
        const eSum = expenses
          .filter((e) => {
            const ed = toDate(e.createdAt);
            return e.type === 'expense' && ed >= mStart && ed < mEnd;
          })
          .reduce((a, b) => a + b.amount, 0);
        buckets.push({ label, sales: sSum, expenses: eSum });
      }
    } else {
      const days = period === '7d' ? 7 : 14;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);
        const label = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
        const sSum = activeSales
          .filter((s) => {
            const sd = toDate(s.createdAt);
            return sd >= d && sd < next;
          })
          .reduce((a, b) => a + b.total, 0);
        const eSum = expenses
          .filter((e) => {
            const ed = toDate(e.createdAt);
            return e.type === 'expense' && ed >= d && ed < next;
          })
          .reduce((a, b) => a + b.amount, 0);
        buckets.push({ label, sales: sSum, expenses: eSum });
      }
    }

    const maxVal = Math.max(1000, ...buckets.map((b) => Math.max(b.sales, b.expenses)));
    return { buckets, maxVal };
  }, [activeSales, expenses, period]);

  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of activeSales) {
      map.set(s.paymentMethod, (map.get(s.paymentMethod) || 0) + s.total);
    }
    const total = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(map.entries())
      .map(([method, amount]) => ({
        method,
        label: paymentMethodLabel(method, language),
        amount,
        pct: Math.round((amount / total) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeSales, language]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const s of activeSales) {
      for (const item of s.items) {
        const prev = map.get(item.productId) || { name: item.productName, qty: 0, revenue: 0 };
        prev.qty += item.quantity;
        prev.revenue += item.lineTotal;
        map.set(item.productId, prev);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [activeSales]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tableau de bord</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Vue consolidée en temps réel · Devise FCFA (XOF)
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasPerm('pos') && (
            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{t(language, 'quickSale')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ventes du jour · Mois</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatFCFA(metrics.todayRevenue)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            Ce mois : <span className="font-mono font-semibold text-slate-700">{formatFCFA(metrics.monthRevenue)}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{t(language, 'netProfit')} (Mois)</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div
            className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
              metrics.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatFCFA(metrics.netProfit)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            Dépenses mois : <span className="font-mono font-semibold text-slate-700">{formatFCFA(metrics.monthExpenses)}</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{t(language, 'treasuryTotal')}</span>
            <Wallet className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatFCFA(metrics.totalTreasury)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            {treasuryAccounts.length} comptes actifs
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{t(language, 'customerCredits')}</span>
            <CreditCard className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-amber-700 tabular-nums">
            {formatFCFA(metrics.totalReceivables)}
          </div>
          <div className="mt-2 text-xs text-slate-500 tabular-nums">
            Valeur stock : <span className="font-mono font-semibold text-slate-700">{formatFCFA(metrics.stockCostValue)}</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Évolution Ventes vs Dépenses
              </h2>
              <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-emerald-600 inline-block rounded-xs" />
                  Ventes
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-rose-400 inline-block rounded-xs" />
                  Dépenses
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['7d', '30d', '12m'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    period === p
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p === '7d' ? '7 jours' : p === '30d' ? '14 jours' : '12 mois'}
                </button>
              ))}
            </div>
          </div>

          <div className="h-56 flex items-end gap-2 pt-4 border-b border-slate-200">
            {chartSeries.buckets.map((b, idx) => {
              const sHeight = Math.max(2, Math.round((b.sales / chartSeries.maxVal) * 180));
              const eHeight = Math.max(b.expenses > 0 ? 4 : 0, Math.round((b.expenses / chartSeries.maxVal) * 180));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group">
                  <div className="w-full flex items-end justify-center gap-1 h-48">
                    <div
                      title={`Ventes ${b.label}: ${formatFCFA(b.sales)}`}
                      style={{ height: `${sHeight}px` }}
                      className="w-full max-w-[18px] bg-emerald-600 rounded-t transition-all group-hover:bg-emerald-700"
                    />
                    {eHeight > 0 && (
                      <div
                        title={`Dépenses ${b.label}: ${formatFCFA(b.expenses)}`}
                        style={{ height: `${eHeight}px` }}
                        className="w-full max-w-[10px] bg-rose-400 rounded-t"
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono truncate max-w-full">
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Canaux de paiement</h2>
            <p className="text-xs text-slate-500 mt-0.5">Répartition du chiffre d'affaires</p>

            <div className="mt-5 space-y-4">
              {paymentBreakdown.length === 0 ? (
                <div className="text-xs text-slate-400 py-8 text-center">
                  Aucune vente enregistrée pour le moment.
                </div>
              ) : (
                paymentBreakdown.map((row) => (
                  <div key={row.method}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium text-slate-700">{row.label}</span>
                      <span className="font-mono text-slate-900 tabular-nums">
                        {formatFCFA(row.amount)} · {row.pct}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-600 rounded-full"
                        style={{ width: `${row.pct}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="text-xs font-semibold text-slate-700 mb-2">Soldes Trésorerie</div>
            <div className="space-y-1.5">
              {treasuryAccounts.slice(0, 4).map((acc) => (
                <div key={acc.id} className="flex justify-between text-xs tabular-nums">
                  <span className="text-slate-600 truncate pr-2">{acc.name}</span>
                  <span className="font-mono font-medium text-slate-900 shrink-0">
                    {formatFCFA(acc.balance)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Products, Stock Alerts & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Top produits vendus</h2>
            <Package className="w-4 h-4 text-slate-400" />
          </div>
          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Les statistiques apparaîtront après votre première vente.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {topProducts.map((p, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-slate-500 tabular-nums">{p.qty} vendus</div>
                  </div>
                  <div className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                    {formatFCFA(p.revenue)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              {t(language, 'lowStockAlerts')} ({metrics.lowStockList.length})
            </h2>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          {metrics.lowStockList.length === 0 ? (
            <p className="text-xs text-emerald-700 py-6 text-center">
              Tous vos produits ont un niveau de stock suffisant.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {metrics.lowStockList.slice(0, 5).map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-slate-500">Seuil min : {p.minStock} {p.unit}</div>
                  </div>
                  <div className="font-mono font-bold text-rose-700 tabular-nums shrink-0">
                    {p.stock} {p.unit}
                  </div>
                </div>
              ))}
              {hasPerm('purchases') && (
                <button
                  type="button"
                  onClick={() => onNavigate('purchases')}
                  className="mt-3 w-full py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                >
                  Réapprovisionner le stock →
                </button>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">{t(language, 'recentOperations')}</h2>
            <Receipt className="w-4 h-4 text-slate-400" />
          </div>
          {activityLogs.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">{t(language, 'noData')}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {activityLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{log.description}</div>
                    <div className="text-slate-500 mt-0.5">
                      {log.userName} · {formatDateTime(log.createdAt)}
                    </div>
                  </div>
                  {log.amount > 0 && (
                    <span className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                      {formatFCFA(log.amount)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
