import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { toDate } from '../lib/format';
import { setCurrentActor } from '../services/shopService';
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

  return (
    <AppContext.Provider
      value={{
        shopId,
        memberId,
        shop,
        currentMember,
        members,
        categories,
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
