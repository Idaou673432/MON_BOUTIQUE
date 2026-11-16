import {
  Customer,
  LiquidPaymentMethod,
  PaymentMethod,
  Product,
  PurchaseLineItem,
  SaleLineItem,
  Supplier,
} from '../types';

const DB_NAME = 'sugupay_offline_db';
const DB_VERSION = 1;
const STORE_PENDING_OPS = 'pending_ops';

export type OfflineOpType =
  | 'create_sale'
  | 'record_credit_payment'
  | 'record_customer_debt'
  | 'create_purchase'
  | 'pay_supplier_debt'
  | 'record_expense'
  | 'adjust_stock'
  | 'transfer_treasury';

export interface OfflineActor {
  uid: string;
  name: string;
}

export type OfflineOpPayload =
  | {
      type: 'create_sale';
      saleId: string;
      invoiceNumber: string;
      customer?: Customer | null;
      customerNameFallback: string;
      items: SaleLineItem[];
      discount: number;
      tvaRate: number;
      paymentMethod: PaymentMethod;
      accountId?: string;
      amountPaid: number;
      notes?: string;
    }
  | {
      type: 'record_credit_payment';
      paymentId: string;
      customer: Customer;
      saleId?: string;
      invoiceNumber?: string;
      saleTotal?: number;
      amount: number;
      paymentMethod: LiquidPaymentMethod;
      accountId: string;
      accountName: string;
      notes?: string;
    }
  | {
      type: 'record_customer_debt';
      saleId: string;
      invoiceNumber: string;
      customer: Customer;
      amount: number;
      amountPaid: number;
      paymentMethod: LiquidPaymentMethod;
      accountId?: string;
      reason: string;
    }
  | {
      type: 'create_purchase';
      purchaseId: string;
      reference: string;
      supplier?: Supplier | null;
      supplierNameFallback: string;
      items: PurchaseLineItem[];
      paymentMethod: PaymentMethod;
      accountId?: string;
      amountPaid: number;
      notes?: string;
    }
  | {
      type: 'pay_supplier_debt';
      txId: string;
      supplier: Supplier;
      amount: number;
      paymentMethod: LiquidPaymentMethod;
      accountId: string;
    }
  | {
      type: 'record_expense';
      expenseId: string;
      expenseType: 'expense' | 'other_income';
      category: string;
      title: string;
      amount: number;
      paymentMethod: LiquidPaymentMethod;
      accountId: string;
      accountName: string;
      notes?: string;
    }
  | {
      type: 'adjust_stock';
      mvtId: string;
      product: Product;
      adjustmentType: 'adjustment_in' | 'adjustment_out' | 'loss' | 'return';
      quantity: number;
      reason: string;
    }
  | {
      type: 'transfer_treasury';
      refId: string;
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      description: string;
    };

export interface OfflinePendingOp {
  id: string;
  shopId: string;
  opType: OfflineOpType;
  label: string;
  amount: number;
  actor: OfflineActor;
  payload: OfflineOpPayload;
  createdAtIso: string;
  retryCount: number;
  lastError?: string;
}

type QueueListener = () => void;
const listeners = new Set<QueueListener>();

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyQueueListeners(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore subscriber errors
    }
  });
}

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponible dans ce navigateur.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PENDING_OPS)) {
        const store = db.createObjectStore(STORE_PENDING_OPS, { keyPath: 'id' });
        store.createIndex('by_shopId', 'shopId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Impossible d'ouvrir IndexedDB."));
  });
}

export function isOfflineNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('client is offline') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('failed to get document') ||
    msg.includes('could not reach cloud firestore')
  );
}

export async function enqueueOfflineOp(op: OfflinePendingOp): Promise<void> {
  const idb = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_PENDING_OPS, 'readwrite');
    tx.objectStore(STORE_PENDING_OPS).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Erreur écriture IndexedDB.'));
  });
  notifyQueueListeners();
}

export async function getPendingOpsForShop(shopId: string): Promise<OfflinePendingOp[]> {
  if (!shopId || typeof indexedDB === 'undefined') return [];
  try {
    const idb = await openOfflineDb();
    const ops = await new Promise<OfflinePendingOp[]>((resolve, reject) => {
      const tx = idb.transaction(STORE_PENDING_OPS, 'readonly');
      const idx = tx.objectStore(STORE_PENDING_OPS).index('by_shopId');
      const req = idx.getAll(shopId);
      req.onsuccess = () => resolve((req.result || []) as OfflinePendingOp[]);
      req.onerror = () => reject(req.error || new Error('Erreur lecture IndexedDB.'));
    });
    return ops.sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  } catch {
    return [];
  }
}

export async function removePendingOp(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const idb = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_PENDING_OPS, 'readwrite');
    tx.objectStore(STORE_PENDING_OPS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Erreur suppression IndexedDB.'));
  });
  notifyQueueListeners();
}

export async function updatePendingOpError(id: string, lastError: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const idb = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_PENDING_OPS, 'readwrite');
    const store = tx.objectStore(STORE_PENDING_OPS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as OfflinePendingOp | undefined;
      if (existing) {
        store.put({
          ...existing,
          retryCount: (existing.retryCount || 0) + 1,
          lastError,
        });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyQueueListeners();
}

export async function clearPendingOpsForShop(shopId: string): Promise<void> {
  const ops = await getPendingOpsForShop(shopId);
  for (const op of ops) {
    await removePendingOp(op.id);
  }
}
