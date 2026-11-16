import React, { useEffect, useMemo, useState } from 'react';
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
  Calculator,
  WalletCards,
  X,
  ArrowDownLeft,
  FilePlus2,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatFCFA } from '../../lib/format';
import {
  createSaleAtomic,
  recordCreditPaymentAtomic,
  recordCustomerDebtAtomic,
  saveCustomer,
} from '../../services/shopService';
import { LiquidPaymentMethod, PaymentMethod, Product, Sale, SaleLineItem } from '../../types';
import { ReceiptModal } from '../ReceiptModal';
import { FloatingCalculator } from '../FloatingCalculator';

const DEBT_REASON_PRESETS = [
  'Crédit marchandises',
  'Solde carnet',
  'Avance / Prêt',
  'Reste commande',
];

export function PosModule() {
  const { shop, currentMember, products, customers, treasuryAccounts, sales } = useApp();

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

  // Floating Calculator state
  const [showCalculator, setShowCalculator] = useState(false);

  // Quick new customer modal state
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('+223 ');
  const [newCustAddress, setNewCustAddress] = useState('');

  // POS Client Debt Modal state
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [debtTab, setDebtTab] = useState<'new_debt' | 'repay_debt'>('new_debt');
  const [debtCustomerId, setDebtCustomerId] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtAdvance, setDebtAdvance] = useState('');
  const [debtReason, setDebtReason] = useState('Crédit marchandises');
  const [debtPayMethod, setDebtPayMethod] = useState<LiquidPaymentMethod>('cash');
  const [debtAccountId, setDebtAccountId] = useState('');

  const [repayCustomerId, setRepayCustomerId] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<LiquidPaymentMethod>('cash');
  const [repayAccountId, setRepayAccountId] = useState('');
  const [repayNotes, setRepayNotes] = useState('');

  const [debtSubmitting, setDebtSubmitting] = useState(false);
  const [debtError, setDebtError] = useState<string | null>(null);
  const [debtSuccess, setDebtSuccess] = useState<string | null>(null);

  // F9 shortcut toggles floating calculator
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9') {
        e.preventDefault();
        setShowCalculator((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const indebtedCustomers = useMemo(
    () =>
      customers
        .filter((c) => (Number(c.creditBalance) || 0) > 0)
        .sort((a, b) => (Number(b.creditBalance) || 0) - (Number(a.creditBalance) || 0)),
    [customers]
  );

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

  const resolveAccountForMethod = (method: LiquidPaymentMethod, preferredId: string) => {
    if (preferredId) {
      const explicit = treasuryAccounts.find((a) => a.id === preferredId);
      if (explicit) return explicit;
    }
    return (
      treasuryAccounts.find((a) => a.type === method) ||
      treasuryAccounts.find((a) => a.isDefault) ||
      treasuryAccounts[0] ||
      null
    );
  };

  const resolvedDebtAccount = useMemo(
    () => resolveAccountForMethod(debtPayMethod, debtAccountId),
    [treasuryAccounts, debtPayMethod, debtAccountId]
  );

  const resolvedRepayAccount = useMemo(
    () => resolveAccountForMethod(repayMethod, repayAccountId),
    [treasuryAccounts, repayMethod, repayAccountId]
  );

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const selectedDebtCustomer = useMemo(
    () => customers.find((c) => c.id === debtCustomerId) || null,
    [customers, debtCustomerId]
  );

  const selectedRepayCustomer = useMemo(
    () => customers.find((c) => c.id === repayCustomerId) || null,
    [customers, repayCustomerId]
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

      const cartSnapshot = [...cart];
      const discSnapshot = validDiscount;
      const tvaSnapshot = tvaAmount;
      const totalSnapshot = total;
      const paidSnapshot = effectiveAmountPaid;

      // Reset cart and show printable receipt immediately
      setCart([]);
      setDiscount(0);
      setAmountReceived('');
      setNotes('');

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
          items: cartSnapshot,
          subtotal,
          discount: discSnapshot,
          tvaAmount: tvaSnapshot,
          total: totalSnapshot,
          totalCost: cartSnapshot.reduce((a, b) => a + b.costPrice * b.quantity, 0),
          amountPaid: paidSnapshot,
          amountDue: Math.max(0, totalSnapshot - paidSnapshot),
          paymentMethod,
          accountId: matchingAccount?.id || '',
          status:
            Math.max(0, totalSnapshot - paidSnapshot) === 0
              ? 'paid'
              : paidSnapshot > 0
                ? 'partial'
                : 'credit',
          cashierId: currentMember?.uid || '',
          cashierName: currentMember?.displayName || 'Caissier',
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
      if (showDebtModal) {
        setDebtCustomerId(cid);
      }
      setShowNewCustomer(false);
      setNewCustName('');
      setNewCustPhone('+223 ');
      setNewCustAddress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer le client.');
    }
  };

  const openDebtModal = (
    tab: 'new_debt' | 'repay_debt' = 'new_debt',
    prefillAmount?: number
  ) => {
    setDebtTab(tab);
    setDebtError(null);
    setDebtSuccess(null);

    if (tab === 'new_debt') {
      setDebtCustomerId(selectedCustomerId || customers[0]?.id || '');
      if (prefillAmount !== undefined && prefillAmount > 0) {
        setDebtAmount(String(prefillAmount));
      }
    } else {
      const defaultIndebted =
        (selectedCustomer && selectedCustomer.creditBalance > 0
          ? selectedCustomer
          : indebtedCustomers[0]) || null;
      setRepayCustomerId(defaultIndebted?.id || '');
      setRepayAmount(defaultIndebted ? String(defaultIndebted.creditBalance) : '');
    }

    setShowDebtModal(true);
  };

  const parsedDebtAmount = Math.max(0, Math.round(Number(debtAmount) || 0));
  const parsedDebtAdvance = Math.max(
    0,
    Math.min(parsedDebtAmount, Math.round(Number(debtAdvance) || 0))
  );
  const netDebtDue = Math.max(0, parsedDebtAmount - parsedDebtAdvance);

  const handleRecordCustomerDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    if (!selectedDebtCustomer) {
      setDebtError('Veuillez sélectionner ou créer un client.');
      return;
    }
    if (parsedDebtAmount <= 0) {
      setDebtError('Saisissez un montant de dette supérieur à 0 FCFA.');
      return;
    }
    if (parsedDebtAdvance > 0 && !resolvedDebtAccount) {
      setDebtError("Aucun compte de trésorerie disponible pour encaisser l'avance.");
      return;
    }

    setDebtError(null);
    setDebtSuccess(null);
    setDebtSubmitting(true);
    try {
      const reasonText = debtReason.trim() || 'Dette client enregistrée en caisse';
      const { saleId, invoiceNumber } = await recordCustomerDebtAtomic({
        shopId: shop.id,
        customer: selectedDebtCustomer,
        amount: parsedDebtAmount,
        amountPaid: parsedDebtAdvance,
        paymentMethod: debtPayMethod,
        accountId: parsedDebtAdvance > 0 ? resolvedDebtAccount?.id : undefined,
        reason: reasonText,
      });

      const debtPreviewSale: Sale = {
        id: saleId,
        shopId: shop.id,
        invoiceNumber,
        customerId: selectedDebtCustomer.id,
        customerName: selectedDebtCustomer.name,
        customerPhone: selectedDebtCustomer.phone || '',
        items: [
          {
            productId: 'dette_directe',
            productName: reasonText,
            unit: 'Dossier',
            quantity: 1,
            unitPrice: parsedDebtAmount,
            costPrice: parsedDebtAmount,
            lineTotal: parsedDebtAmount,
          },
        ],
        subtotal: parsedDebtAmount,
        discount: 0,
        tvaAmount: 0,
        total: parsedDebtAmount,
        totalCost: parsedDebtAmount,
        amountPaid: parsedDebtAdvance,
        amountDue: netDebtDue,
        paymentMethod: 'credit',
        accountId: parsedDebtAdvance > 0 ? resolvedDebtAccount?.id || '' : '',
        status: parsedDebtAdvance > 0 ? 'partial' : 'credit',
        cashierId: currentMember?.uid || '',
        cashierName: currentMember?.displayName || 'Caissier',
        notes: reasonText,
        createdAt: new Date() as never,
        updatedAt: new Date() as never,
      };

      setDebtAmount('');
      setDebtAdvance('');
      setShowDebtModal(false);
      setReceiptSale(debtPreviewSale);
    } catch (err) {
      setDebtError(
        err instanceof Error ? err.message : "Impossible d'enregistrer la dette client."
      );
    } finally {
      setDebtSubmitting(false);
    }
  };

  const parsedRepayAmount = Math.max(0, Math.round(Number(repayAmount) || 0));

  const handleRecordDebtRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    if (!selectedRepayCustomer) {
      setDebtError('Sélectionnez le client qui effectue le remboursement.');
      return;
    }
    if (parsedRepayAmount <= 0) {
      setDebtError('Saisissez un montant encaissé supérieur à 0 FCFA.');
      return;
    }
    if (parsedRepayAmount > selectedRepayCustomer.creditBalance) {
      setDebtError(
        `Le montant dépasse la dette du client (${formatFCFA(selectedRepayCustomer.creditBalance)}).`
      );
      return;
    }
    if (!resolvedRepayAccount) {
      setDebtError('Aucun compte de trésorerie configuré.');
      return;
    }

    setDebtError(null);
    setDebtSuccess(null);
    setDebtSubmitting(true);
    try {
      await recordCreditPaymentAtomic({
        shopId: shop.id,
        customer: selectedRepayCustomer,
        sale: null,
        amount: parsedRepayAmount,
        paymentMethod: repayMethod,
        accountId: resolvedRepayAccount.id,
        notes: repayNotes.trim() || 'Remboursement encaissé en caisse',
      });

      const remainingAfter = Math.max(
        0,
        selectedRepayCustomer.creditBalance - parsedRepayAmount
      );
      setDebtSuccess(
        `Encaissement de ${formatFCFA(parsedRepayAmount)} enregistré pour ${selectedRepayCustomer.name}. Nouveau solde : ${formatFCFA(remainingAfter)}.`
      );
      setRepayAmount(remainingAfter > 0 ? String(remainingAfter) : '');
      setRepayNotes('');
    } catch (err) {
      setDebtError(
        err instanceof Error ? err.message : "Erreur lors de l'encaissement du remboursement."
      );
    } finally {
      setDebtSubmitting(false);
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

  const liquidOptions: { id: LiquidPaymentMethod; label: string }[] = [
    { id: 'cash', label: 'Espèces' },
    { id: 'orange_money', label: 'Orange Money' },
    { id: 'moov_money', label: 'Moov Money' },
    { id: 'wave', label: 'Wave' },
    { id: 'bank', label: 'Banque' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 cols: Search Bar, Quick POS Tools & Product Catalog */}
      <div className="lg:col-span-7 space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit..."
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openDebtModal('new_debt')}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 text-amber-900 dark:text-amber-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Enregistrer ou encaisser une dette client depuis la caisse"
            >
              <WalletCards className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              <span>
                Dettes clients{indebtedCustomers.length > 0 ? ` (${indebtedCustomers.length})` : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowCalculator((prev) => !prev)}
              aria-pressed={showCalculator}
              className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showCalculator
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Calculatrice flottante (F9)"
            >
              <Calculator className="w-4 h-4 shrink-0" />
              <span>Calculatrice</span>
            </button>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center text-sm text-slate-500 dark:text-slate-400">
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
                      ? 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 cursor-pointer'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-2">
                      {product.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {product.unit}
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-end justify-between gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatFCFA(product.salePrice)}
                    </span>
                    <span
                      className={`text-[11px] font-mono tabular-nums ${
                        out
                          ? 'text-rose-700 dark:text-rose-400 font-semibold'
                          : low
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-slate-500 dark:text-slate-400'
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
      <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sticky top-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Ticket de caisse</h2>
          </div>
          {cart.length > 0 && (
            <button
              type="button"
              onClick={() => setCart([])}
              className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 font-medium cursor-pointer"
            >
              Vider le panier
            </button>
          )}
        </div>

        {/* Customer Selector + Current Balance */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">Client comptant (Anonyme)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}{' '}
                  {c.creditBalance > 0 ? `· Dû: ${formatFCFA(c.creditBalance)}` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewCustomer(true)}
              title="Nouveau client"
              className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>

          {selectedCustomer && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px]">
              <span className="text-slate-600 dark:text-slate-400">
                Solde dette actuel :{' '}
                <strong
                  className={`font-mono tabular-nums ${
                    selectedCustomer.creditBalance > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formatFCFA(selectedCustomer.creditBalance)}
                </strong>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openDebtModal('new_debt')}
                  className="font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  + Dette
                </button>
                {selectedCustomer.creditBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => openDebtModal('repay_debt')}
                    className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    Encaisser
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {cart.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
              Cliquez sur un produit à gauche pour l&apos;ajouter au ticket.
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.productId} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {item.productName}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatFCFA(item.unitPrice)} / {item.unit}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateQty(item.productId, -1)}
                    className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-7 text-center font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQty(item.productId, 1)}
                    className="w-7 h-7 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="w-24 text-right font-mono text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                  {formatFCFA(item.lineTotal)}
                </div>

                <button
                  type="button"
                  onClick={() => updateQty(item.productId, -item.quantity)}
                  aria-label="Retirer"
                  className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals & Discount */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs tabular-nums">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Sous-total</span>
            <span className="font-mono">{formatFCFA(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-slate-600 dark:text-slate-400">
            <span>Remise (FCFA)</span>
            <input
              type="number"
              min={0}
              max={subtotal}
              value={discount || ''}
              onChange={(e) => setDiscount(Number(e.target.value))}
              placeholder="0"
              className="w-28 px-2.5 py-1 text-right font-mono text-xs border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-600"
            />
          </div>
          {tvaRate > 0 && (
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>TVA ({tvaRate}%)</span>
              <span className="font-mono">{formatFCFA(tvaAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-800">
            <span>Total à payer</span>
            <span className="font-mono text-emerald-700 dark:text-emerald-400">{formatFCFA(total)}</span>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Mode de paiement</div>
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
                    : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
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
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Compte d&apos;encaissement
              </label>
              <select
                value={matchingAccount?.id || ''}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {treasuryAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Montant reçu (FCFA)
              </label>
              <input
                type="number"
                min={0}
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
                placeholder={String(total)}
                className="w-full px-2.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        {paymentMethod === 'credit' && (
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Avance payée maintenant (FCFA, 0 si crédit total)
            </label>
            <input
              type="number"
              min={0}
              max={total}
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>
        )}

        {changeDue > 0 && (
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex justify-between text-xs font-semibold text-emerald-800 dark:text-emerald-300 tabular-nums">
            <span>Monnaie à rendre au client :</span>
            <span className="font-mono">{formatFCFA(changeDue)}</span>
          </div>
        )}

        {total - effectiveAmountPaid > 0 && (
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-1 text-xs font-semibold text-amber-800 dark:text-amber-300 tabular-nums">
            <div className="flex justify-between">
              <span>Reste en crédit client :</span>
              <span className="font-mono">{formatFCFA(total - effectiveAmountPaid)}</span>
            </div>
            {selectedCustomer && (
              <div className="flex justify-between text-[11px] font-normal text-amber-700 dark:text-amber-400">
                <span>Solde total après vente :</span>
                <span className="font-mono font-semibold">
                  {formatFCFA(selectedCustomer.creditBalance + (total - effectiveAmountPaid))}
                </span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
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

      {/* POS Client Debt Modal (Register new debt / Collect repayment) */}
      {showDebtModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <WalletCards className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Dettes clients en caisse
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Enregistrer une nouvelle créance ou encaisser un règlement
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDebtModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 pt-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDebtTab('new_debt');
                  setDebtError(null);
                  setDebtSuccess(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  debtTab === 'new_debt'
                    ? 'border-amber-600 text-amber-700 dark:text-amber-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>Enregistrer une dette</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDebtTab('repay_debt');
                  setDebtError(null);
                  setDebtSuccess(null);
                  if (!repayCustomerId && indebtedCustomers[0]) {
                    setRepayCustomerId(indebtedCustomers[0].id);
                    setRepayAmount(String(indebtedCustomers[0].creditBalance));
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  debtTab === 'repay_debt'
                    ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Encaisser un remboursement ({indebtedCustomers.length})</span>
              </button>
            </div>

            <div className="p-6">
              {debtError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                  {debtError}
                </div>
              )}

              {debtSuccess && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300">
                  {debtSuccess}
                </div>
              )}

              {debtTab === 'new_debt' ? (
                <form onSubmit={handleRecordCustomerDebt} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Client concerné *
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        required
                        value={debtCustomerId}
                        onChange={(e) => setDebtCustomerId(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        <option value="">— Choisir un client —</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : ''}{' '}
                            {c.creditBalance > 0 ? `· Dette: ${formatFCFA(c.creditBalance)}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewCustomer(true)}
                        className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Nouveau</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Montant de la dette (FCFA) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={debtAmount}
                        onChange={(e) => setDebtAmount(e.target.value)}
                        placeholder="Ex: 25000"
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Avance versée maintenant (FCFA)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={parsedDebtAmount || undefined}
                        value={debtAdvance}
                        onChange={(e) => setDebtAdvance(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Motif / Libellé de la dette *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={140}
                      value={debtReason}
                      onChange={(e) => setDebtReason(e.target.value)}
                      placeholder="Ex: Crédit marchandises, solde carnet..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {DEBT_REASON_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDebtReason(preset)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium border cursor-pointer transition-colors ${
                            debtReason === preset
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  {parsedDebtAdvance > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Mode d&apos;encaissement avance
                        </label>
                        <select
                          value={debtPayMethod}
                          onChange={(e) => {
                            setDebtPayMethod(e.target.value as LiquidPaymentMethod);
                            setDebtAccountId('');
                          }}
                          className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        >
                          {liquidOptions.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Compte crédité
                        </label>
                        <select
                          value={resolvedDebtAccount?.id || ''}
                          onChange={(e) => setDebtAccountId(e.target.value)}
                          className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        >
                          {treasuryAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {selectedDebtCustomer && parsedDebtAmount > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1 text-xs tabular-nums">
                      <div className="flex justify-between text-amber-900 dark:text-amber-200">
                        <span>Reste ajouté à la dette client :</span>
                        <span className="font-mono font-bold">{formatFCFA(netDebtDue)}</span>
                      </div>
                      <div className="flex justify-between text-amber-800 dark:text-amber-300">
                        <span>Nouveau solde total ({selectedDebtCustomer.name}) :</span>
                        <span className="font-mono font-bold">
                          {formatFCFA((selectedDebtCustomer.creditBalance || 0) + netDebtDue)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDebtModal(false)}
                      className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      Fermer
                    </button>
                    <button
                      type="submit"
                      disabled={debtSubmitting}
                      className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      {debtSubmitting ? 'Enregistrement...' : 'Enregistrer & Imprimer reçu'}
                    </button>
                  </div>
                </form>
              ) : indebtedCustomers.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  Aucun client n&apos;a de dette en cours pour le moment.
                </div>
              ) : (
                <form onSubmit={handleRecordDebtRepayment} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Client débiteur *
                    </label>
                    <select
                      required
                      value={repayCustomerId}
                      onChange={(e) => {
                        const cid = e.target.value;
                        setRepayCustomerId(cid);
                        const c = customers.find((x) => x.id === cid);
                        setRepayAmount(c ? String(c.creditBalance) : '');
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">— Sélectionner un client —</option>
                      {indebtedCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · Solde dû : {formatFCFA(c.creditBalance)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Montant encaissé (FCFA) *
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={selectedRepayCustomer?.creditBalance || undefined}
                        required
                        value={repayAmount}
                        onChange={(e) => setRepayAmount(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Mode de paiement
                      </label>
                      <select
                        value={repayMethod}
                        onChange={(e) => {
                          setRepayMethod(e.target.value as LiquidPaymentMethod);
                          setRepayAccountId('');
                        }}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        {liquidOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Compte de trésorerie *
                      </label>
                      <select
                        required
                        value={resolvedRepayAccount?.id || ''}
                        onChange={(e) => setRepayAccountId(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      >
                        {treasuryAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Note (optionnel)
                      </label>
                      <input
                        type="text"
                        value={repayNotes}
                        onChange={(e) => setRepayNotes(e.target.value)}
                        placeholder="Ex: Reçu caisse"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  {selectedRepayCustomer && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-1 text-xs tabular-nums">
                      <div className="flex justify-between text-emerald-900 dark:text-emerald-200">
                        <span>Dette actuelle :</span>
                        <span className="font-mono font-semibold">
                          {formatFCFA(selectedRepayCustomer.creditBalance)}
                        </span>
                      </div>
                      <div className="flex justify-between text-emerald-800 dark:text-emerald-300">
                        <span>Reste après encaissement :</span>
                        <span className="font-mono font-bold">
                          {formatFCFA(
                            Math.max(0, selectedRepayCustomer.creditBalance - parsedRepayAmount)
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDebtModal(false)}
                      className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                    >
                      Fermer
                    </button>
                    <button
                      type="submit"
                      disabled={debtSubmitting || !selectedRepayCustomer}
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      {debtSubmitting ? 'Encaissement...' : 'Encaisser le remboursement'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Nouveau client</h3>
            <form onSubmit={handleQuickCreateCustomer} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nom complet *
                </label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Téléphone
                </label>
                <input
                  type="text"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Adresse / Quartier
                </label>
                <input
                  type="text"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Draggable Floating POS Calculator */}
      <FloatingCalculator
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        onApplyReceived={(value) => {
          if (paymentMethod === 'credit') {
            setPaymentMethod('cash');
          }
          setAmountReceived(String(value));
        }}
        onApplyDiscount={(value) => {
          setDiscount(Math.max(0, Math.min(subtotal, value)));
        }}
        onApplyDebtAmount={(value) => {
          openDebtModal('new_debt', value);
        }}
      />

      {receiptSale && (
        <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />
      )}
    </div>
  );
}
