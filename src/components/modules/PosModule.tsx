import React, { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  UserPlus,
  CheckCircle2,
  Smartphone,
  Banknote,
  Landmark,
  CreditCard,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatFCFA } from '../../lib/format';
import { createSaleAtomic, saveCustomer } from '../../services/shopService';
import { PaymentMethod, Product, Sale, SaleLineItem } from '../../types';
import { ReceiptModal } from '../ReceiptModal';

export function PosModule() {
  const { shop, products, customers, treasuryAccounts, sales } = useApp();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<SaleLineItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null);

  // Quick new customer modal state
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('+223 ');
  const [newCustAddress, setNewCustAddress] = useState('');

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!p.active) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q);
    });
  }, [products, search]);

  // Match default treasury account to payment method
  const matchingAccount = useMemo(() => {
    if (paymentMethod === 'credit') return null;
    if (selectedAccountId) {
      const explicit = treasuryAccounts.find((a) => a.id === selectedAccountId);
      if (explicit) return explicit;
    }
    return (
      treasuryAccounts.find((a) => a.type === paymentMethod) ||
      treasuryAccounts.find((a) => a.isDefault) ||
      treasuryAccounts[0] ||
      null
    );
  }, [treasuryAccounts, paymentMethod, selectedAccountId]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const subtotal = useMemo(() => cart.reduce((s, item) => s + item.lineTotal, 0), [cart]);
  const validDiscount = Math.max(0, Math.min(subtotal, Number(discount) || 0));
  const netBeforeTax = Math.max(0, subtotal - validDiscount);
  const tvaRate = shop?.tvaRate || 0;
  const tvaAmount = Math.round(netBeforeTax * (tvaRate / 100));
  const total = Math.round(netBeforeTax + tvaAmount);

  const effectiveAmountPaid = useMemo(() => {
    if (paymentMethod === 'credit') {
      return Math.max(0, Math.min(total, Number(amountReceived) || 0));
    }
    if (amountReceived.trim() === '') return total;
    return Math.max(0, Math.min(total, Number(amountReceived) || 0));
  }, [paymentMethod, amountReceived, total]);

  const changeDue = useMemo(() => {
    if (paymentMethod !== 'cash' || amountReceived.trim() === '') return 0;
    const rec = Number(amountReceived) || 0;
    return rec > total ? rec - total : 0;
  }, [paymentMethod, amountReceived, total]);

  const addToCart = (product: Product) => {
    setError(null);
    if (product.stock <= 0) {
      setError(`Stock épuisé pour "${product.name}".`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.stock) {
          setError(`Quantité maximale atteinte pour "${product.name}" (${product.stock} en stock).`);
          return prev;
        }
        return prev.map((i) =>
          i.productId === product.id
            ? {
                ...i,
                quantity: i.quantity + 1,
                lineTotal: (i.quantity + 1) * i.unitPrice,
              }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          quantity: 1,
          unitPrice: product.salePrice,
          costPrice: product.costPrice,
          lineTotal: product.salePrice,
        },
      ];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setError(null);
    const prod = products.find((p) => p.id === productId);
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          if (prod && nextQty > prod.stock) {
            setError(`Stock insuffisant pour "${prod.name}" (Disponible : ${prod.stock}).`);
            return item;
          }
          return {
            ...item,
            quantity: nextQty,
            lineTotal: nextQty * item.unitPrice,
          };
        })
        .filter(Boolean) as SaleLineItem[]
    );
  };

  const handleCheckout = async () => {
    if (!shop) return;
    if (cart.length === 0) {
      setError('Ajoutez au moins un article au panier.');
      return;
    }
    const amountDue = Math.max(0, total - effectiveAmountPaid);
    if (amountDue > 0 && !selectedCustomer) {
      setError('Sélectionnez un client enregistré pour enregistrer un crédit ou paiement partiel.');
      return;
    }
    if (effectiveAmountPaid > 0 && !matchingAccount) {
      setError('Aucun compte de trésorerie configuré pour recevoir ce paiement.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { saleId, invoiceNumber } = await createSaleAtomic({
        shopId: shop.id,
        customer: selectedCustomer,
        customerNameFallback: 'Client comptant',
        items: cart,
        discount: validDiscount,
        tvaRate,
        paymentMethod,
        accountId: matchingAccount?.id,
        amountPaid: effectiveAmountPaid,
        notes,
      });

      // Reset cart and show printable receipt immediately
      setCart([]);
      setDiscount(0);
      setAmountReceived('');
      setNotes('');

      // Find newly synced sale or build preview object while snapshot arrives
      const created = sales.find((s) => s.id === saleId);
      if (created) {
        setReceiptSale(created);
      } else {
        setReceiptSale({
          id: saleId,
          shopId: shop.id,
          invoiceNumber,
          customerId: selectedCustomer?.id || '',
          customerName: selectedCustomer?.name || 'Client comptant',
          customerPhone: selectedCustomer?.phone || '',
          items: cart,
          subtotal,
          discount: validDiscount,
          tvaAmount,
          total,
          totalCost: cart.reduce((a, b) => a + b.costPrice * b.quantity, 0),
          amountPaid: effectiveAmountPaid,
          amountDue: Math.max(0, total - effectiveAmountPaid),
          paymentMethod,
          accountId: matchingAccount?.id || '',
          status: Math.max(0, total - effectiveAmountPaid) === 0 ? 'paid' : effectiveAmountPaid > 0 ? 'partial' : 'credit',
          cashierId: '',
          cashierName: 'Caissier',
          createdAt: new Date() as never,
          updatedAt: new Date() as never,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la validation de la vente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !newCustName.trim()) return;
    try {
      const cid = await saveCustomer(shop.id, {
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        address: newCustAddress.trim(),
      });
      setSelectedCustomerId(cid);
      setShowNewCustomer(false);
      setNewCustName('');
      setNewCustPhone('+223 ');
      setNewCustAddress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer le client.');
    }
  };

  const paymentOptions: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { id: 'cash', label: 'Espèces', icon: <Banknote className="w-3.5 h-3.5" /> },
    { id: 'orange_money', label: 'Orange Money', icon: <Smartphone className="w-3.5 h-3.5" /> },
    { id: 'moov_money', label: 'Moov Money', icon: <Smartphone className="w-3.5 h-3.5" /> },
    { id: 'wave', label: 'Wave', icon: <Smartphone className="w-3.5 h-3.5" /> },
    { id: 'bank', label: 'Banque', icon: <Landmark className="w-3.5 h-3.5" /> },
    { id: 'credit', label: 'Crédit client', icon: <CreditCard className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 cols: Product Catalog Selector */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
            Aucun produit trouvé pour cette recherche.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredProducts.map((product) => {
              const out = product.stock <= 0;
              const low = product.stock > 0 && product.stock <= product.minStock;
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={out}
                  onClick={() => addToCart(product)}
                  className={`text-left p-4 rounded-xl border transition-colors flex flex-col justify-between min-h-[120px] ${
                    out
                      ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                      : 'bg-white border-slate-200 hover:border-emerald-500 cursor-pointer'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900 line-clamp-2">
                      {product.name}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 truncate">
                      {product.unit}
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-end justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                      {formatFCFA(product.salePrice)}
                    </span>
                    <span
                      className={`text-[11px] font-mono tabular-nums ${
                        out ? 'text-rose-700 font-semibold' : low ? 'text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      {product.stock} {product.unit}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right 5 cols: Active Ticket / Cart & Checkout */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sticky top-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">Ticket de caisse</h2>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
            >
              Vider le panier
            </button>
          )}
        </div>

        {/* Customer Selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="">Client comptant (Anonyme)</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''} {c.creditBalance > 0 ? `· Dû: ${formatFCFA(c.creditBalance)}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewCustomer(true)}
            title="Nouveau client"
            className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
          {cart.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Cliquez sur un produit à gauche pour l'ajouter au ticket.
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {item.productName}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                    {formatFCFA(item.unitPrice)} / {item.unit}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateQty(item.productId, -1)}
                    className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-7 text-center font-mono text-xs font-semibold tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQty(item.productId, 1)}
                    className="w-7 h-7 rounded-md border border-slate-200 flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="w-24 text-right font-mono text-xs font-bold text-slate-900 tabular-nums shrink-0">
                  {formatFCFA(item.lineTotal)}
                </div>

                <button
                  type="button"
                  onClick={() => updateQty(item.productId, -item.quantity)}
                  aria-label="Retirer"
                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals & Discount */}
        <div className="pt-3 border-t border-slate-200 space-y-2 text-xs tabular-nums">
          <div className="flex justify-between text-slate-600">
            <span>Sous-total</span>
            <span className="font-mono">{formatFCFA(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-slate-600">
            <span>Remise (FCFA)</span>
            <input
              type="number"
              min={0}
              max={subtotal}
              value={discount || ''}
              onChange={(e) => setDiscount(Number(e.target.value))}
              placeholder="0"
              className="w-28 px-2.5 py-1 text-right font-mono text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>
          {tvaRate > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>TVA ({tvaRate}%)</span>
              <span className="font-mono">{formatFCFA(tvaAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>Total à payer</span>
            <span className="font-mono text-emerald-700">{formatFCFA(total)}</span>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700">Mode de paiement</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {paymentOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setPaymentMethod(opt.id);
                  setSelectedAccountId('');
                  if (opt.id === 'credit') setAmountReceived('0');
                  else setAmountReceived('');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  paymentMethod === opt.id
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt.icon}
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {paymentMethod !== 'credit' && treasuryAccounts.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Compte d'encaissement
              </label>
              <select
                value={matchingAccount?.id || ''}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 bg-white"
              >
                {treasuryAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Montant reçu (FCFA)
              </label>
              <input
                type="number"
                min={0}
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder={String(total)}
                className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300"
              />
            </div>
          </div>
        )}

        {paymentMethod === 'credit' && (
          <div>
            <label className="block text-[11px] font-medium text-slate-600 mb-1">
              Avance payée maintenant (FCFA, 0 si crédit total)
            </label>
            <input
              type="number"
              min={0}
              max={total}
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300"
            />
          </div>
        )}

        {changeDue > 0 && (
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex justify-between text-xs font-semibold text-emerald-800 tabular-nums">
            <span>Monnaie à rendre au client :</span>
            <span className="font-mono">{formatFCFA(changeDue)}</span>
          </div>
        )}

        {total - effectiveAmountPaid > 0 && (
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex justify-between text-xs font-semibold text-amber-800 tabular-nums">
            <span>Reste en crédit client :</span>
            <span className="font-mono">{formatFCFA(total - effectiveAmountPaid)}</span>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={submitting || cart.length === 0}
          onClick={handleCheckout}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{submitting ? 'Validation...' : `Encaisser ${formatFCFA(total)}`}</span>
        </button>
      </div>

      {/* Quick Add Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900">Nouveau client</h3>
            <form onSubmit={handleQuickCreateCustomer} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nom complet *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Téléphone</label>
                <input
                  type="text"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Adresse / Quartier</label>
                <input
                  type="text"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {receiptSale && (
        <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />
      )}
    </div>
  );
}
