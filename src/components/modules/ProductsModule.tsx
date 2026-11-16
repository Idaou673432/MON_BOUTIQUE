import React, { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Search, Pencil, Trash2, Download, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { exportToCSV, formatFCFA } from '../../lib/format';
import { clearAllProductsAndStock, removeProduct, saveProduct } from '../../services/shopService';
import { Product } from '../../types';

export function ProductsModule() {
  const { shop, products, hasPerm } = useApp();
  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');

  // Product modal
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [saving, setSaving] = useState(false);

  // Bulk clear modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearMode, setClearMode] = useState<'delete_products' | 'zero_stock_only'>('delete_products');
  const [clearing, setClearing] = useState(false);

  const isAdmin = hasPerm('users');
  const canClearStock = isAdmin || hasPerm('products');

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (stockFilter === 'low' && !(p.stock > 0 && p.stock <= p.minStock)) return false;
      if (stockFilter === 'out' && p.stock > 0) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, search, stockFilter]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !editingProduct?.name) return;
    setSaving(true);
    try {
      await saveProduct(shop.id, {
        id: editingProduct.id,
        name: editingProduct.name,
        sku: '',
        barcode: '',
        categoryId: '',
        categoryName: '',
        unit: editingProduct.unit || 'Unité',
        costPrice: Number(editingProduct.costPrice) || 0,
        salePrice: Number(editingProduct.salePrice) || 0,
        stock: Number(editingProduct.stock) || 0,
        minStock: Number(editingProduct.minStock) || 0,
        active: editingProduct.active ?? true,
      });
      setEditingProduct(null);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    exportToCSV(
      'catalogue-produits.csv',
      ['Nom', 'Unité', "Prix d'achat (FCFA)", 'Prix de vente (FCFA)', 'Stock', 'Seuil min'],
      filteredProducts.map((p) => [
        p.name,
        p.unit,
        p.costPrice,
        p.salePrice,
        p.stock,
        p.minStock,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Produits ({products.length})</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestion du catalogue, prix d'achat, prix de vente et seuils d'alerte
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canClearStock && products.length > 0 && (
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Supprimer tout ({products.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter CSV</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setEditingProduct({
                name: '',
                unit: 'Unité',
                costPrice: 0,
                salePrice: 0,
                stock: 0,
                minStock: 5,
                active: true,
              })
            }
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nouveau produit</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par nom de produit..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300"
            />
          </div>

          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as 'all' | 'low' | 'out')}
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
          >
            <option value="all">Tous niveaux de stock</option>
            <option value="low">Stock faible</option>
            <option value="out">En rupture</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Produit</th>
                <th className="px-4 py-3 font-semibold text-right">Prix d'achat</th>
                <th className="px-4 py-3 font-semibold text-right">Prix de vente</th>
                <th className="px-4 py-3 font-semibold text-right">Marge</th>
                <th className="px-4 py-3 font-semibold text-right">Stock</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Aucun produit enregistré.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const margin = p.salePrice - p.costPrice;
                  const marginPct = p.salePrice > 0 ? Math.round((margin / p.salePrice) * 100) : 0;
                  const isOut = p.stock <= 0;
                  const isLow = p.stock > 0 && p.stock <= p.minStock;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{p.unit}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {formatFCFA(p.costPrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                        {formatFCFA(p.salePrice)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700">
                        {formatFCFA(margin)} ({marginPct}%)
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-mono font-semibold ${
                            isOut ? 'text-rose-700' : isLow ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          {p.stock} {p.unit}
                        </span>
                        <div className="text-[10px] text-slate-500">
                          {isOut ? 'Rupture' : isLow ? 'Stock faible' : 'En stock'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingProduct(p)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && shop && (
                            <button
                              type="button"
                              onClick={() => removeProduct(shop.id, p.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

      {/* Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                {editingProduct.id ? 'Modifier le produit' : 'Ajouter un produit'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Désignation du produit *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingProduct.name || ''}
                    onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Unité *</label>
                  <input
                    type="text"
                    required
                    value={editingProduct.unit || 'Unité'}
                    onChange={(e) => setEditingProduct({ ...editingProduct, unit: e.target.value })}
                    placeholder="Sac 50kg, Carton, Unité..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Prix d'achat (FCFA) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editingProduct.costPrice ?? 0}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, costPrice: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Prix de vente (FCFA) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editingProduct.salePrice ?? 0}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, salePrice: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Stock actuel *</label>
                  <input
                    type="number"
                    required
                    value={editingProduct.stock ?? 0}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Seuil d'alerte min *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={editingProduct.minStock ?? 5}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, minStock: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                  />
                </div>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
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
                  Supprimer tous les produits et le stock
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {products.length} produit(s) actuellement enregistré(s) dans {shop.name}.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="clearMode"
                  checked={clearMode === 'delete_products'}
                  onChange={() => setClearMode('delete_products')}
                  className="mt-0.5 text-rose-600"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">
                    Supprimer définitivement tous les produits et mouvements de stock
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Vide complètement le catalogue et remet le stock à 0 FCFA.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="clearMode"
                  checked={clearMode === 'zero_stock_only'}
                  onChange={() => setClearMode('zero_stock_only')}
                  className="mt-0.5 text-amber-600"
                />
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">
                    Mettre uniquement les quantités en stock à 0
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Conserve les fiches produits, remet toutes les quantités et mouvements à 0.
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
                {clearing ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
