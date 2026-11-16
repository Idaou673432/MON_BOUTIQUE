import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Download,
  PackageCheck,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { exportToCSV, formatDateTime, formatFCFA } from '../../lib/format';
import { adjustStockAtomic, clearAllProductsAndStock, updateProductMinStock } from '../../services/shopService';
import { Product } from '../../types';

type StockAlertSeverity = 'out' | 'below' | 'at_min' | 'ok' | 'inactive';

function getProductAlertSeverity(p: Product): StockAlertSeverity {
  if (!p.active) return 'inactive';
  if (p.stock <= 0) return 'out';
  if (p.stock < p.minStock) return 'below';
  if (p.minStock > 0 && p.stock === p.minStock) return 'at_min';
  return 'ok';
}

export function InventoryModule() {
  const { shop, products, stockMovements } = useApp();

  const [alertFilter, setAlertFilter] = useState<'all' | 'alerts' | 'out' | 'below' | 'ok'>('all');
  const [search, setSearch] = useState('');

  // Adjust stock modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProdId, setSelectedProdId] = useState('');
  const [adjType, setAdjType] = useState<'adjustment_in' | 'adjustment_out' | 'loss' | 'return'>('adjustment_in');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit threshold modal
  const [thresholdProduct, setThresholdProduct] = useState<Product | null>(null);
  const [minStockInput, setMinStockInput] = useState(0);
  const [savingThreshold, setSavingThreshold] = useState(false);

  // Clear all products & stock modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<'delete_products' | 'zero_stock_only'>('delete_products');
  const [clearing, setClearing] = useState(false);

  const stockStats = useMemo(() => {
    let costTotal = 0;
    let retailTotal = 0;
    const outList: Product[] = [];
    const belowList: Product[] = [];
    const atMinList: Product[] = [];
    const okList: Product[] = [];

    for (const p of products) {
      const qty = Math.max(0, p.stock);
      costTotal += qty * p.costPrice;
      retailTotal += qty * p.salePrice;

      const sev = getProductAlertSeverity(p);
      if (sev === 'out') outList.push(p);
      else if (sev === 'below') belowList.push(p);
      else if (sev === 'at_min') atMinList.push(p);
      else if (sev === 'ok') okList.push(p);
    }

    // Critical list sorted: out of stock first, then largest deficit below minStock, then atMin
    belowList.sort((a, b) => (b.minStock - b.stock) - (a.minStock - a.stock));
    const urgentAlerts = [...outList, ...belowList];
    const allAlerts = [...outList, ...belowList, ...atMinList];

    return {
      costTotal,
      retailTotal,
      potentialProfit: retailTotal - costTotal,
      outList,
      belowList,
      atMinList,
      okList,
      urgentAlerts,
      allAlerts,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => {
        const sev = getProductAlertSeverity(p);
        if (alertFilter === 'alerts' && !(sev === 'out' || sev === 'below' || sev === 'at_min')) return false;
        if (alertFilter === 'out' && sev !== 'out') return false;
        if (alertFilter === 'below' && sev !== 'below') return false;
        if (alertFilter === 'ok' && sev !== 'ok') return false;
        if (!q) return true;
        return p.name.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const order: Record<StockAlertSeverity, number> = {
          out: 0,
          below: 1,
          at_min: 2,
          ok: 3,
          inactive: 4,
        };
        const diff = order[getProductAlertSeverity(a)] - order[getProductAlertSeverity(b)];
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, 'fr');
      });
  }, [products, alertFilter, search]);

  const openRestockModal = (prod: Product) => {
    const suggested = Math.max(1, prod.minStock > 0 ? prod.minStock * 2 - Math.max(0, prod.stock) : 5);
    setSelectedProdId(prod.id);
    setAdjType('adjustment_in');
    setQuantity(suggested);
    setReason(
      prod.stock <= 0
        ? 'Réapprovisionnement rupture de stock'
        : 'Réapprovisionnement suite à alerte seuil minimal'
    );
    setShowAdjustModal(true);
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !selectedProdId) return;
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) return;
    setSubmitting(true);
    try {
      await adjustStockAtomic({
        shopId: shop.id,
        product: prod,
        type: adjType,
        quantity,
        reason: reason.trim() || 'Ajustement manuel',
      });
      setShowAdjustModal(false);
      setReason('');
      setQuantity(1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveThreshold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !thresholdProduct) return;
    setSavingThreshold(true);
    try {
      await updateProductMinStock(shop.id, thresholdProduct.id, minStockInput);
      setThresholdProduct(null);
    } finally {
      setSavingThreshold(false);
    }
  };

  const handleExportStock = () => {
    exportToCSV(
      'etat-stocks-alertes.csv',
      ['Produit', 'Unité', 'Stock actuel', 'Seuil minimal', 'Écart', 'État', 'Valeur achat (FCFA)'],
      filteredProducts.map((p) => {
        const sev = getProductAlertSeverity(p);
        const label =
          sev === 'out'
            ? 'Rupture'
            : sev === 'below'
              ? 'Sous seuil minimal'
              : sev === 'at_min'
                ? 'Seuil atteint'
                : sev === 'ok'
                  ? 'Normal'
                  : 'Inactif';
        return [
          p.name,
          p.unit,
          p.stock,
          p.minStock,
          p.stock - p.minStock,
          label,
          Math.max(0, p.stock) * p.costPrice,
        ];
      })
    );
  };

  const movementLabel = (type: string) => {
    switch (type) {
      case 'sale':
        return 'Vente';
      case 'purchase':
        return 'Approvisionnement';
      case 'adjustment_in':
        return 'Entrée inventaire';
      case 'adjustment_out':
        return 'Sortie manuelle';
      case 'loss':
        return 'Perte / Casse';
      case 'return':
        return 'Retour client';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Gestion des stocks & alertes</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Surveillance des seuils minimaux, alertes de réapprovisionnement et journal des mouvements
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {products.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Vider produits & stock</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportStock}
            disabled={filteredProducts.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter CSV</span>
          </button>
          <button
            type="button"
            disabled={products.length === 0}
            onClick={() => {
              setSelectedProdId(products[0]?.id || '');
              setAdjType('adjustment_in');
              setQuantity(1);
              setReason('');
              setShowAdjustModal(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajustement de stock</span>
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Valeur d'achat du stock</span>
            <PackageCheck className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {formatFCFA(stockStats.costTotal)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {products.length} produit(s) suivi(s)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Valeur de vente potentielle</span>
            <ArrowDownUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-emerald-700 tabular-nums">
            {formatFCFA(stockStats.retailTotal)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            Marge latente : {formatFCFA(stockStats.potentialProfit)}
          </div>
        </div>

        <div
          className={`rounded-xl p-5 border ${
            stockStats.urgentAlerts.length > 0
              ? 'bg-rose-50 border-rose-200'
              : stockStats.atMinList.length > 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-700">
            <span className="font-medium">Alertes seuil minimal</span>
            {stockStats.urgentAlerts.length > 0 ? (
              <AlertOctagon className="w-4 h-4 text-rose-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <div
            className={`mt-2 font-mono text-xl font-bold tabular-nums ${
              stockStats.urgentAlerts.length > 0
                ? 'text-rose-700'
                : stockStats.atMinList.length > 0
                  ? 'text-amber-700'
                  : 'text-emerald-700'
            }`}
          >
            {stockStats.allAlerts.length} / {products.length}
          </div>
          <div className="text-xs text-slate-600 mt-1 tabular-nums">
            {stockStats.outList.length} rupture(s) · {stockStats.belowList.length} sous seuil · {stockStats.atMinList.length} seuil atteint
          </div>
        </div>
      </div>

      {/* Visual Alert System Panel */}
      {products.length > 0 && (
        stockStats.allAlerts.length > 0 ? (
          <div
            className={`rounded-xl border p-5 space-y-4 ${
              stockStats.urgentAlerts.length > 0
                ? 'bg-rose-50/80 border-rose-200'
                : 'bg-amber-50/80 border-amber-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                {stockStats.urgentAlerts.length > 0 ? (
                  <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {stockStats.urgentAlerts.length > 0
                      ? `Alerte stock critique : ${stockStats.urgentAlerts.length} produit(s) sous le seuil minimal ou en rupture`
                      : `Vigilance stock : ${stockStats.atMinList.length} produit(s) au seuil minimal`}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {stockStats.outList.length > 0 && `${stockStats.outList.length} en rupture (0 unité) · `}
                    {stockStats.belowList.length > 0 && `${stockStats.belowList.length} inférieur(s) au seuil minimal · `}
                    {stockStats.atMinList.length > 0 && `${stockStats.atMinList.length} au seuil exact`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAlertFilter('alerts')}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-800 rounded-lg cursor-pointer"
              >
                Filtrer uniquement les alertes ({stockStats.allAlerts.length})
              </button>
            </div>

            <div className="divide-y divide-rose-200/70 bg-white rounded-lg border border-rose-200/70">
              {stockStats.allAlerts.slice(0, 6).map((p) => {
                const sev = getProductAlertSeverity(p);
                const deficit = Math.max(0, p.minStock - p.stock);
                return (
                  <div
                    key={p.id}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            sev === 'out' || sev === 'below' ? 'bg-rose-600' : 'bg-amber-500'
                          }`}
                        />
                        <span className="font-semibold text-slate-900 truncate">{p.name}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 truncate">{p.unit}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-600 font-mono tabular-nums pl-4">
                        Stock actuel :{' '}
                        <span className={sev === 'at_min' ? 'font-bold text-amber-700' : 'font-bold text-rose-700'}>
                          {p.stock} {p.unit}
                        </span>
                        {' '}· Seuil min : {p.minStock} {p.unit}
                        {deficit > 0 && (
                          <span className="text-rose-700 font-semibold"> · Manque {deficit} {p.unit}</span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openRestockModal(p)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0"
                    >
                      Réapprovisionner
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3.5 flex items-center gap-2.5 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Tous vos produits actifs ont un niveau de stock supérieur au seuil minimal défini.</span>
          </div>
        )
      )}

      {/* Product Stock Levels & Thresholds Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'all', label: `Tous (${products.length})` },
              { id: 'alerts', label: `Alertes (${stockStats.allAlerts.length})` },
              { id: 'out', label: `Ruptures (${stockStats.outList.length})` },
              { id: 'below', label: `Sous seuil (${stockStats.belowList.length})` },
              { id: 'ok', label: `Sain (${stockStats.okList.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAlertFilter(tab.id as typeof alertFilter)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  alertFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Produit</th>
                <th className="px-4 py-3 font-semibold">Niveau vs Seuil minimal</th>
                <th className="px-4 py-3 font-semibold">État d'alerte</th>
                <th className="px-4 py-3 font-semibold text-right">Valeur (Achat)</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    {products.length === 0
                      ? 'Aucun produit enregistré dans la boutique.'
                      : 'Aucun produit ne correspond à ce filtre.'}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const sev = getProductAlertSeverity(p);
                  const maxScale = Math.max(1, p.minStock * 2, p.stock);
                  const pct = Math.max(0, Math.min(100, Math.round((Math.max(0, p.stock) / maxScale) * 100)));
                  const deficit = Math.max(0, p.minStock - p.stock);

                  const rowBg =
                    sev === 'out'
                      ? 'bg-rose-50/70 hover:bg-rose-50'
                      : sev === 'below'
                        ? 'bg-rose-50/40 hover:bg-rose-50/70'
                        : sev === 'at_min'
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-slate-50/70';

                  const barColor =
                    sev === 'out' || sev === 'below'
                      ? 'bg-rose-600'
                      : sev === 'at_min'
                        ? 'bg-amber-500'
                        : sev === 'ok'
                          ? 'bg-emerald-600'
                          : 'bg-slate-400';

                  return (
                    <tr key={p.id} className={rowBg}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{p.unit}</div>
                      </td>

                      <td className="px-4 py-3 min-w-[210px]">
                        <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                          <span
                            className={`font-bold ${
                              sev === 'out' || sev === 'below'
                                ? 'text-rose-700'
                                : sev === 'at_min'
                                  ? 'text-amber-700'
                                  : 'text-slate-900'
                            }`}
                          >
                            {p.stock} {p.unit}
                          </span>
                          <span className="text-slate-500">Seuil min : {p.minStock}</span>
                        </div>
                        <div className="h-2 bg-slate-200/80 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {sev === 'out' && (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                            <span className="w-2 h-2 rounded-full bg-rose-600" />
                            <span>Rupture de stock</span>
                          </span>
                        )}
                        {sev === 'below' && (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                            <span className="w-2 h-2 rounded-full bg-rose-600" />
                            <span>Sous le seuil (-{deficit} {p.unit})</span>
                          </span>
                        )}
                        {sev === 'at_min' && (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span>Seuil limite atteint</span>
                          </span>
                        )}
                        {sev === 'ok' && (
                          <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                            <span className="w-2 h-2 rounded-full bg-emerald-600" />
                            <span>Stock normal</span>
                          </span>
                        )}
                        {sev === 'inactive' && (
                          <span className="text-slate-400">Produit archivé</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-slate-900">
                        {formatFCFA(Math.max(0, p.stock) * p.costPrice)}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openRestockModal(p)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-md cursor-pointer ${
                              sev === 'out' || sev === 'below'
                                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                            }`}
                          >
                            {sev === 'out' || sev === 'below' ? 'Réapprovisionner' : 'Ajuster'}
                          </button>
                          <button
                            type="button"
                            title="Modifier le seuil minimal"
                            onClick={() => {
                              setThresholdProduct(p);
                              setMinStockInput(p.minStock);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
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

      {/* Stock Movements History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
          Historique des mouvements de stock ({stockMovements.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Produit</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold text-right">Variation</th>
                <th className="px-4 py-3 font-semibold text-right">Avant → Après</th>
                <th className="px-4 py-3 font-semibold">Motif / Opérateur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {stockMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Aucun mouvement enregistré.
                  </td>
                </tr>
              ) : (
                stockMovements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(m.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{m.productName}</td>
                    <td className="px-4 py-3 text-slate-700">{movementLabel(m.type)}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold ${
                        m.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {m.previousStock} → {m.newStock}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {m.reason || '—'} · <span className="text-slate-400">{m.userName}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Stock Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900">Ajustement manuel du stock</h3>
            <form onSubmit={handleAdjust} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Produit *</label>
                <select
                  required
                  value={selectedProdId}
                  onChange={(e) => setSelectedProdId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  {products.map((p: Product) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Stock : {p.stock} / Seuil : {p.minStock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type d'opération</label>
                <select
                  value={adjType}
                  onChange={(e) =>
                    setAdjType(
                      e.target.value as 'adjustment_in' | 'adjustment_out' | 'loss' | 'return'
                    )
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  <option value="adjustment_in">Entrée inventaire (+)</option>
                  <option value="return">Retour client (+)</option>
                  <option value="adjustment_out">Sortie manuelle (-)</option>
                  <option value="loss">Perte / Casse / Périmé (-)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantité *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Motif *</label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex : Comptage inventaire mensuel"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  {submitting ? 'Mise à jour...' : 'Valider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Minimum Threshold Modal */}
      {thresholdProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-slate-900">Modifier le seuil minimal d'alerte</h3>
            <p className="text-xs text-slate-500 mt-1">{thresholdProduct.name}</p>
            <form onSubmit={handleSaveThreshold} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Seuil minimal ({thresholdProduct.unit}) *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={minStockInput}
                  onChange={(e) => setMinStockInput(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Une alerte visuelle s'affiche dès que le stock descend sous ce seuil.
                </p>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setThresholdProduct(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingThreshold}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  {savingThreshold ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clear All Products & Stock Modal */}
      {showClearModal && shop && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Supprimer tous les produits et vider le stock
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {products.length} produit(s) et {stockMovements.length} mouvement(s) de stock concernés.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="invClearMode"
                  checked={clearMode === 'delete_products'}
                  onChange={() => setClearMode('delete_products')}
                  className="mt-0.5 text-rose-600"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">
                    Supprimer tous les produits en stock
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Supprime toutes les fiches produits et l'historique des mouvements de stock.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="invClearMode"
                  checked={clearMode === 'zero_stock_only'}
                  onChange={() => setClearMode('zero_stock_only')}
                  className="mt-0.5 text-amber-600"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">
                    Remettre les quantités en stock à 0 uniquement
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Garde le catalogue produits mais passe toutes les quantités à 0.
                  </div>
                </div>
              </label>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                disabled={clearing}
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={async () => {
                  setClearing(true);
                  try {
                    await clearAllProductsAndStock({
                      shopId: shop.id,
                      mode: clearMode,
                      deleteCategories: false,
                    });
                    setShowClearModal(false);
                  } finally {
                    setClearing(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {clearing ? 'Suppression...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
