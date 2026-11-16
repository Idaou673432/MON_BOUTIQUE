import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { toDate } from '../lib/format';
import { setCurrentActor, syncPendingOfflineOperations } from '../services/shopService';
import {
  getPendingOpsForShop,
  OfflinePendingOp,
  subscribeOfflineQueue,
} from '../services/offlineSyncService';
import {
  ActivityLog,
  Category,
  CreditPayment,
  Customer,
  Expense,
  LanguageCode,
  PermissionKey,
  Product,
  Purchase,
  Sale,
  Shop,
  ShopMember,
  StockMovement,
  Supplier,
  TreasuryAccount,
  TreasuryTransaction,
} from '../types';

const LS_SHOP_ID = 'sugupay_shop_id';
const LS_MEMBER_ID = 'sugupay_member_id';
const LS_MEMBER_NAME = 'sugupay_member_name';
const LS_LANG = 'sugupay_lang';
const LS_THEME = 'sugupay_theme';

export type ThemeMode = 'light' | 'dark';

interface AppContextValue {
  shopId: string;
  memberId: string;
  shop: Shop | null;
  currentMember: ShopMember | null;
  members: ShopMember[];
  categories: Category[];
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  treasuryAccounts: TreasuryAccount[];
  sales: Sale[];
  creditPayments: CreditPayment[];
  purchases: Purchase[];
  expenses: Expense[];
  stockMovements: StockMovement[];
  treasuryTransactions: TreasuryTransaction[];
  activityLogs: ActivityLog[];
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSession: (shopId: string, memberId: string, memberName: string) => void;
  lockSession: () => void;
  disconnectShop: () => void;
  hasPerm: (perm: PermissionKey) => boolean;
  dataLoading: boolean;
  isOnline: boolean;
  pendingOfflineOps: OfflinePendingOp[];
  isSyncingOffline: boolean;
  lastOfflineSyncCount: number;
  triggerOfflineSync: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [shopId, setShopId] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(LS_SHOP_ID) || '' : ''
  );
  const [memberId, setMemberId] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(LS_MEMBER_ID) || '' : ''
  );
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LS_LANG);
      if (saved === 'fr' || saved === 'en' || saved === 'bm') return saved;
    }
    return 'fr';
  });
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LS_THEME);
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  const [shop, setShop] = useState<Shop | null>(null);
  const [members, setMembers] = useState<ShopMember[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccount[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [creditPayments, setCreditPayments] = useState<CreditPayment[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [treasuryTransactions, setTreasuryTransactions] = useState<TreasuryTransaction[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingOfflineOps, setPendingOfflineOps] = useState<OfflinePendingOp[]>([]);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);
  const [lastOfflineSyncCount, setLastOfflineSyncCount] = useState(0);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_LANG, lang);
    }
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_THEME, nextTheme);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const setSession = (nextShopId: string, nextMemberId: string, memberName: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LS_SHOP_ID, nextShopId);
      localStorage.setItem(LS_MEMBER_ID, nextMemberId);
      localStorage.setItem(LS_MEMBER_NAME, memberName);
    }
    setCurrentActor({ uid: nextMemberId, name: memberName });
    setShopId(nextShopId);
    setMemberId(nextMemberId);
  };

  const lockSession = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LS_MEMBER_ID);
      localStorage.removeItem(LS_MEMBER_NAME);
    }
    setCurrentActor(null);
    setMemberId('');
  };

  const disconnectShop = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LS_SHOP_ID);
      localStorage.removeItem(LS_MEMBER_ID);
      localStorage.removeItem(LS_MEMBER_NAME);
    }
    setCurrentActor(null);
    setShopId('');
    setMemberId('');
    setShop(null);
  };

  useEffect(() => {
    if (!shopId) {
      setShop(null);
      setMembers([]);
      setCategories([]);
      setProducts([]);
      setCustomers([]);
      setSuppliers([]);
      setTreasuryAccounts([]);
      setSales([]);
      setCreditPayments([]);
      setPurchases([]);
      setExpenses([]);
      setStockMovements([]);
      setTreasuryTransactions([]);
      setActivityLogs([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);
    const unsubs: (() => void)[] = [];

    const shopPath = `shops/${shopId}`;
    unsubs.push(
      onSnapshot(
        doc(db, 'shops', shopId),
        (snap) => {
          if (snap.exists()) {
            const s = { id: snap.id, ...snap.data() } as Shop;
            setShop(s);
          } else {
            disconnectShop();
          }
          setDataLoading(false);
        },
        (err) => handleFirestoreError(err, OperationType.GET, shopPath)
      )
    );

    const subByDateDesc = <T extends { createdAt?: unknown }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      maxLimit?: number
    ) => {
      const p = `shops/${shopId}/${colName}`;
      const q = query(collection(db, 'shops', shopId, colName), where('shopId', '==', shopId));
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as T));
            items.sort(
              (a, b) =>
                toDate(b.createdAt as never).getTime() - toDate(a.createdAt as never).getTime()
            );
            setter(maxLimit ? items.slice(0, maxLimit) : items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, p)
        )
      );
    };

    const subByNameAsc = <T extends { name?: string; displayName?: string }>(
      colName: string,
      setter: React.Dispatch<React.SetStateAction<T[]>>
    ) => {
      const p = `shops/${shopId}/${colName}`;
      const q = query(collection(db, 'shops', shopId, colName), where('shopId', '==', shopId));
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as T));
            items.sort((a, b) =>
              (a.name || a.displayName || '').localeCompare(b.name || b.displayName || '', 'fr')
            );
            setter(items);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, p)
        )
      );
    };

    subByNameAsc<ShopMember>('members', setMembers);
    subByNameAsc<Category>('categories', setCategories);
    subByNameAsc<Product>('products', setProducts);
    subByNameAsc<Customer>('customers', setCustomers);
    subByNameAsc<Supplier>('suppliers', setSuppliers);
    subByDateDesc<TreasuryAccount>('treasury_accounts', (itemsOrFn) => {
      setTreasuryAccounts(itemsOrFn);
    });
    subByDateDesc<Sale>('sales', setSales, 500);
    subByDateDesc<CreditPayment>('credit_payments', setCreditPayments, 300);
    subByDateDesc<Purchase>('purchases', setPurchases, 300);
    subByDateDesc<Expense>('expenses', setExpenses, 300);
    subByDateDesc<StockMovement>('stock_movements', setStockMovements, 250);
    subByDateDesc<TreasuryTransaction>('treasury_transactions', setTreasuryTransactions, 300);
    subByDateDesc<ActivityLog>('activity_logs', setActivityLogs, 250);

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [shopId]);

  const refreshPendingOps = useCallback(async (targetShopId: string) => {
    if (!targetShopId) {
      setPendingOfflineOps([]);
      return;
    }
    const ops = await getPendingOpsForShop(targetShopId);
    setPendingOfflineOps(ops);
  }, []);

  const triggerOfflineSync = useCallback(async () => {
    if (!shopId || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    setIsSyncingOffline(true);
    try {
      const res = await syncPendingOfflineOperations(shopId);
      if (res.synced > 0) {
        setLastOfflineSyncCount(res.synced);
      }
      await refreshPendingOps(shopId);
    } finally {
      setIsSyncingOffline(false);
    }
  }, [shopId, refreshPendingOps]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void triggerOfflineSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerOfflineSync]);

  useEffect(() => {
    void refreshPendingOps(shopId);
    const unsub = subscribeOfflineQueue(() => {
      void refreshPendingOps(shopId);
    });
    if (shopId && isOnline) {
      void triggerOfflineSync();
    }
    return unsub;
  }, [shopId, isOnline, refreshPendingOps, triggerOfflineSync]);

  useEffect(() => {
    if (!shopId || !isOnline || pendingOfflineOps.length === 0) return;
    const timer = window.setInterval(() => {
      void triggerOfflineSync();
    }, 25000);
    return () => window.clearInterval(timer);
  }, [shopId, isOnline, pendingOfflineOps.length, triggerOfflineSync]);

  const currentMember = useMemo(
    () => members.find((m) => m.id === memberId || m.uid === memberId) || null,
    [members, memberId]
  );

  useEffect(() => {
    if (currentMember) {
      setCurrentActor({ uid: currentMember.uid, name: currentMember.displayName });
    }
  }, [currentMember]);

  const hasPerm = (perm: PermissionKey): boolean => {
    if (!currentMember || !currentMember.active) return false;
    if (currentMember.role === 'owner' || currentMember.role === 'admin') return true;
    return currentMember.permissions.includes(perm);
  };

  // Optimistic projection of queued IndexedDB offline operations on top of Firestore cache
  const projected = useMemo(() => {
    if (pendingOfflineOps.length === 0) {
      return {
        products,
        customers,
        suppliers,
        treasuryAccounts,
        sales,
        creditPayments,
        purchases,
        expenses,
        stockMovements,
        treasuryTransactions,
      };
    }

    const nextProducts = products.map((p) => ({ ...p }));
    const nextCustomers = customers.map((c) => ({ ...c }));
    const nextSuppliers = suppliers.map((s) => ({ ...s }));
    const nextAccounts = treasuryAccounts.map((a) => ({ ...a }));
    const extraSales: Sale[] = [];
    const extraCreditPayments: CreditPayment[] = [];
    const extraPurchases: Purchase[] = [];
    const extraExpenses: Expense[] = [];
    const extraStockMovements: StockMovement[] = [];
    const extraTreasuryTx: TreasuryTransaction[] = [];

    const existingSaleIds = new Set(sales.map((s) => s.id));
    const existingPayIds = new Set(creditPayments.map((c) => c.id));
    const existingPurchaseIds = new Set(purchases.map((p) => p.id));
    const existingExpenseIds = new Set(expenses.map((e) => e.id));

    for (const op of pendingOfflineOps) {
      const ts = Timestamp.fromDate(new Date(op.createdAtIso));
      const p = op.payload;

      if (p.type === 'create_sale' && !existingSaleIds.has(p.saleId)) {
        const subtotal = p.items.reduce((acc, i) => acc + i.lineTotal, 0);
        const netBeforeTax = Math.max(0, subtotal - p.discount);
        const tvaAmount = Math.round(netBeforeTax * ((Number(p.tvaRate) || 0) / 100));
        const total = Math.round(netBeforeTax + tvaAmount);
        const amountDue = Math.max(0, total - p.amountPaid);
        const status: Sale['status'] =
          amountDue === 0 ? 'paid' : p.amountPaid > 0 ? 'partial' : 'credit';

        let totalCost = 0;
        for (const item of p.items) {
          const prod = nextProducts.find((pr) => pr.id === item.productId);
          const cost = prod ? Number(prod.costPrice) || 0 : Number(item.costPrice) || 0;
          totalCost += cost * item.quantity;
          if (prod) {
            const prevStock = prod.stock;
            prod.stock = prod.stock - item.quantity;
            extraStockMovements.unshift({
              id: `off_mvt_${p.saleId}_${item.productId}`,
              shopId: op.shopId,
              productId: item.productId,
              productName: item.productName,
              type: 'sale',
              quantity: -item.quantity,
              previousStock: prevStock,
              newStock: prod.stock,
              referenceId: p.saleId,
              reason: `Vente ${p.invoiceNumber} (Hors ligne)`,
              userId: op.actor.uid,
              userName: op.actor.name,
              createdAt: ts,
            });
          }
        }

        if (p.customer) {
          const cust = nextCustomers.find((c) => c.id === p.customer?.id);
          if (cust) {
            cust.creditBalance = (cust.creditBalance || 0) + amountDue;
            cust.totalSpent = (cust.totalSpent || 0) + total;
          }
        }

        if (p.amountPaid > 0 && p.accountId) {
          const acc = nextAccounts.find((a) => a.id === p.accountId);
          if (acc) {
            acc.balance = (acc.balance || 0) + p.amountPaid;
            extraTreasuryTx.unshift({
              id: `off_tx_${p.saleId}`,
              shopId: op.shopId,
              accountId: acc.id,
              accountName: acc.name,
              direction: 'in',
              category: 'sale',
              amount: p.amountPaid,
              balanceAfter: acc.balance,
              referenceId: p.saleId,
              description: `Encaissement vente ${p.invoiceNumber} (Hors ligne)`,
              paymentMethod: p.paymentMethod,
              userId: op.actor.uid,
              userName: op.actor.name,
              createdAt: ts,
            });
          }
        }

        extraSales.unshift({
          id: p.saleId,
          shopId: op.shopId,
          invoiceNumber: p.invoiceNumber,
          customerId: p.customer?.id || '',
          customerName: p.customer ? p.customer.name : p.customerNameFallback,
          customerPhone: p.customer?.phone || '',
          items: p.items,
          subtotal,
          discount: p.discount,
          tvaAmount,
          total,
          totalCost,
          amountPaid: p.amountPaid,
          amountDue,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId || '',
          status,
          cashierId: op.actor.uid,
          cashierName: op.actor.name,
          notes: p.notes || '',
          createdAt: ts,
          updatedAt: ts,
        });
      } else if (p.type === 'record_credit_payment' && !existingPayIds.has(p.paymentId)) {
        const cust = nextCustomers.find((c) => c.id === p.customer.id);
        if (cust) {
          cust.creditBalance = Math.max(0, (cust.creditBalance || 0) - p.amount);
        }
        const acc = nextAccounts.find((a) => a.id === p.accountId);
        if (acc) {
          acc.balance = (acc.balance || 0) + p.amount;
          extraTreasuryTx.unshift({
            id: `off_tx_${p.paymentId}`,
            shopId: op.shopId,
            accountId: acc.id,
            accountName: acc.name,
            direction: 'in',
            category: 'credit_payment',
            amount: p.amount,
            balanceAfter: acc.balance,
            referenceId: p.paymentId,
            description: `Remboursement crédit · ${p.customer.name} (Hors ligne)`,
            paymentMethod: p.paymentMethod,
            userId: op.actor.uid,
            userName: op.actor.name,
            createdAt: ts,
          });
        }
        extraCreditPayments.unshift({
          id: p.paymentId,
          shopId: op.shopId,
          saleId: p.saleId || '',
          invoiceNumber: p.invoiceNumber || '',
          customerId: p.customer.id,
          customerName: p.customer.name,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId,
          accountName: acc?.name || p.accountName,
          recordedBy: op.actor.uid,
          recordedByName: op.actor.name,
          notes: p.notes || '',
          createdAt: ts,
        });
      } else if (p.type === 'record_customer_debt' && !existingSaleIds.has(p.saleId)) {
        const amountDue = Math.max(0, p.amount - p.amountPaid);
        const cust = nextCustomers.find((c) => c.id === p.customer.id);
        if (cust) {
          cust.creditBalance = (cust.creditBalance || 0) + amountDue;
          cust.totalSpent = (cust.totalSpent || 0) + p.amount;
        }
        if (p.amountPaid > 0 && p.accountId) {
          const acc = nextAccounts.find((a) => a.id === p.accountId);
          if (acc) {
            acc.balance = (acc.balance || 0) + p.amountPaid;
            extraTreasuryTx.unshift({
              id: `off_tx_${p.saleId}`,
              shopId: op.shopId,
              accountId: acc.id,
              accountName: acc.name,
              direction: 'in',
              category: 'sale',
              amount: p.amountPaid,
              balanceAfter: acc.balance,
              referenceId: p.saleId,
              description: `Avance sur dette ${p.invoiceNumber} · ${p.customer.name} (Hors ligne)`,
              paymentMethod: p.paymentMethod,
              userId: op.actor.uid,
              userName: op.actor.name,
              createdAt: ts,
            });
          }
        }
        extraSales.unshift({
          id: p.saleId,
          shopId: op.shopId,
          invoiceNumber: p.invoiceNumber,
          customerId: p.customer.id,
          customerName: p.customer.name,
          customerPhone: p.customer.phone || '',
          items: [
            {
              productId: 'dette_directe',
              productName: p.reason,
              unit: 'Dossier',
              quantity: 1,
              unitPrice: p.amount,
              costPrice: p.amount,
              lineTotal: p.amount,
            },
          ],
          subtotal: p.amount,
          discount: 0,
          tvaAmount: 0,
          total: p.amount,
          totalCost: p.amount,
          amountPaid: p.amountPaid,
          amountDue,
          paymentMethod: 'credit',
          accountId: p.amountPaid > 0 ? p.accountId || '' : '',
          status: p.amountPaid > 0 ? 'partial' : 'credit',
          cashierId: op.actor.uid,
          cashierName: op.actor.name,
          notes: p.reason,
          createdAt: ts,
          updatedAt: ts,
        });
      } else if (p.type === 'create_purchase' && !existingPurchaseIds.has(p.purchaseId)) {
        const total = Math.round(p.items.reduce((acc, i) => acc + i.lineTotal, 0));
        const amountDue = Math.max(0, total - p.amountPaid);
        for (const item of p.items) {
          const prod = nextProducts.find((pr) => pr.id === item.productId);
          if (prod) {
            const prevStock = prod.stock;
            prod.stock = prod.stock + item.quantity;
            prod.costPrice = item.unitCost;
            extraStockMovements.unshift({
              id: `off_mvt_${p.purchaseId}_${item.productId}`,
              shopId: op.shopId,
              productId: item.productId,
              productName: item.productName,
              type: 'purchase',
              quantity: item.quantity,
              previousStock: prevStock,
              newStock: prod.stock,
              referenceId: p.purchaseId,
              reason: `Approvisionnement ${p.reference} (Hors ligne)`,
              userId: op.actor.uid,
              userName: op.actor.name,
              createdAt: ts,
            });
          }
        }
        if (p.supplier) {
          const supp = nextSuppliers.find((s) => s.id === p.supplier?.id);
          if (supp) {
            supp.debtBalance = (supp.debtBalance || 0) + amountDue;
            supp.totalPurchased = (supp.totalPurchased || 0) + total;
          }
        }
        if (p.amountPaid > 0 && p.accountId) {
          const acc = nextAccounts.find((a) => a.id === p.accountId);
          if (acc) {
            acc.balance = (acc.balance || 0) - p.amountPaid;
          }
        }
        extraPurchases.unshift({
          id: p.purchaseId,
          shopId: op.shopId,
          reference: p.reference,
          supplierId: p.supplier?.id || '',
          supplierName: p.supplier ? p.supplier.name : p.supplierNameFallback,
          items: p.items,
          total,
          amountPaid: p.amountPaid,
          amountDue,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId || '',
          status: amountDue === 0 ? 'paid' : p.amountPaid > 0 ? 'partial' : 'credit',
          recordedBy: op.actor.uid,
          recordedByName: op.actor.name,
          notes: p.notes || '',
          createdAt: ts,
          updatedAt: ts,
        });
      } else if (p.type === 'pay_supplier_debt') {
        const supp = nextSuppliers.find((s) => s.id === p.supplier.id);
        if (supp) {
          supp.debtBalance = Math.max(0, (supp.debtBalance || 0) - p.amount);
        }
        const acc = nextAccounts.find((a) => a.id === p.accountId);
        if (acc) {
          acc.balance = (acc.balance || 0) - p.amount;
        }
      } else if (p.type === 'record_expense' && !existingExpenseIds.has(p.expenseId)) {
        const acc = nextAccounts.find((a) => a.id === p.accountId);
        const dir = p.expenseType === 'expense' ? 'out' : 'in';
        if (acc) {
          acc.balance = dir === 'in' ? (acc.balance || 0) + p.amount : (acc.balance || 0) - p.amount;
          extraTreasuryTx.unshift({
            id: `off_tx_${p.expenseId}`,
            shopId: op.shopId,
            accountId: acc.id,
            accountName: acc.name,
            direction: dir,
            category: p.expenseType === 'expense' ? 'expense' : 'other_income',
            amount: p.amount,
            balanceAfter: acc.balance,
            referenceId: p.expenseId,
            description: `${p.category} · ${p.title} (Hors ligne)`,
            paymentMethod: p.paymentMethod,
            userId: op.actor.uid,
            userName: op.actor.name,
            createdAt: ts,
          });
        }
        extraExpenses.unshift({
          id: p.expenseId,
          shopId: op.shopId,
          type: p.expenseType,
          category: p.category,
          title: p.title,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          accountId: p.accountId,
          accountName: acc?.name || p.accountName,
          recordedBy: op.actor.uid,
          recordedByName: op.actor.name,
          notes: p.notes || '',
          createdAt: ts,
        });
      } else if (p.type === 'adjust_stock') {
        const prod = nextProducts.find((pr) => pr.id === p.product.id);
        if (prod) {
          const isPositive = p.adjustmentType === 'adjustment_in' || p.adjustmentType === 'return';
          const signedQty = isPositive ? p.quantity : -p.quantity;
          const prevStock = prod.stock;
          prod.stock = prevStock + signedQty;
          extraStockMovements.unshift({
            id: p.mvtId,
            shopId: op.shopId,
            productId: prod.id,
            productName: prod.name,
            type: p.adjustmentType,
            quantity: signedQty,
            previousStock: prevStock,
            newStock: prod.stock,
            referenceId: p.mvtId,
            reason: `${p.reason} (Hors ligne)`,
            userId: op.actor.uid,
            userName: op.actor.name,
            createdAt: ts,
          });
        }
      } else if (p.type === 'transfer_treasury') {
        const fromAcc = nextAccounts.find((a) => a.id === p.fromAccountId);
        const toAcc = nextAccounts.find((a) => a.id === p.toAccountId);
        if (fromAcc) fromAcc.balance = (fromAcc.balance || 0) - p.amount;
        if (toAcc) toAcc.balance = (toAcc.balance || 0) + p.amount;
      }
    }

    return {
      products: nextProducts,
      customers: nextCustomers,
      suppliers: nextSuppliers,
      treasuryAccounts: nextAccounts,
      sales: [...extraSales, ...sales],
      creditPayments: [...extraCreditPayments, ...creditPayments],
      purchases: [...extraPurchases, ...purchases],
      expenses: [...extraExpenses, ...expenses],
      stockMovements: [...extraStockMovements, ...stockMovements],
      treasuryTransactions: [...extraTreasuryTx, ...treasuryTransactions],
    };
  }, [
    pendingOfflineOps,
    products,
    customers,
    suppliers,
    treasuryAccounts,
    sales,
    creditPayments,
    purchases,
    expenses,
    stockMovements,
    treasuryTransactions,
  ]);

  return (
    <AppContext.Provider
      value={{
        shopId,
        memberId,
        shop,
        currentMember,
        members,
        categories,
        products: projected.products,
        customers: projected.customers,
        suppliers: projected.suppliers,
        treasuryAccounts: projected.treasuryAccounts,
        sales: projected.sales,
        creditPayments: projected.creditPayments,
        purchases: projected.purchases,
        expenses: projected.expenses,
        stockMovements: projected.stockMovements,
        treasuryTransactions: projected.treasuryTransactions,
        activityLogs,
        language,
        setLanguage,
        theme,
        setTheme,
        toggleTheme,
        setSession,
        lockSession,
        disconnectShop,
        hasPerm,
        dataLoading,
        isOnline,
        pendingOfflineOps,
        isSyncingOffline,
        lastOfflineSyncCount,
        triggerOfflineSync,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
