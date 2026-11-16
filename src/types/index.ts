import { Timestamp } from 'firebase/firestore';

export type LanguageCode = 'fr' | 'en' | 'bm';

export type ModuleId =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'inventory'
  | 'contacts'
  | 'credits'
  | 'purchases'
  | 'expenses'
  | 'treasury'
  | 'payments'
  | 'invoices'
  | 'history'
  | 'reports'
  | 'users'
  | 'settings';

export type RoleId = 'owner' | 'admin' | 'cashier' | 'stock_manager' | 'accountant';

export type PermissionKey =
  | 'dashboard'
  | 'pos'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'credits'
  | 'purchases'
  | 'expenses'
  | 'treasury'
  | 'payments'
  | 'invoices'
  | 'history'
  | 'reports'
  | 'users'
  | 'settings';

export type PaymentMethod = 'cash' | 'orange_money' | 'moov_money' | 'wave' | 'bank' | 'credit';
export type LiquidPaymentMethod = Exclude<PaymentMethod, 'credit'>;

export interface Shop {
  id: string;
  shopCode: string;
  name: string;
  ownerId: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  nif?: string;
  rccm?: string;
  currency: 'XOF';
  tvaRate: number;
  receiptFooter?: string;
  language: LanguageCode;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ShopMember {
  id: string;
  shopId: string;
  uid: string;
  username: string;
  passwordHash: string;
  displayName: string;
  phone?: string;
  role: RoleId;
  permissions: PermissionKey[];
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Category {
  id: string;
  shopId: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Product {
  id: string;
  shopId: string;
  name: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  categoryName?: string;
  unit: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  notes?: string;
  creditBalance: number;
  totalSpent: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Supplier {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
  nif?: string;
  debtBalance: number;
  totalPurchased: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type TreasuryAccountType = 'cash' | 'orange_money' | 'moov_money' | 'wave' | 'bank';

export interface TreasuryAccount {
  id: string;
  shopId: string;
  name: string;
  type: TreasuryAccountType;
  accountNumber?: string;
  balance: number;
  isDefault: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SaleLineItem {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  shopId: string;
  invoiceNumber: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  items: SaleLineItem[];
  subtotal: number;
  discount: number;
  tvaAmount: number;
  total: number;
  totalCost: number;
  amountPaid: number;
  amountDue: number;
  paymentMethod: PaymentMethod;
  accountId?: string;
  status: 'paid' | 'partial' | 'credit' | 'cancelled';
  cashierId: string;
  cashierName: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreditPayment {
  id: string;
  shopId: string;
  saleId?: string;
  invoiceNumber?: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: LiquidPaymentMethod;
  accountId: string;
  accountName: string;
  recordedBy: string;
  recordedByName: string;
  notes?: string;
  createdAt: Timestamp;
}

export interface PurchaseLineItem {
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface Purchase {
  id: string;
  shopId: string;
  reference: string;
  supplierId?: string;
  supplierName: string;
  items: PurchaseLineItem[];
  total: number;
  amountPaid: number;
  amountDue: number;
  paymentMethod: PaymentMethod;
  accountId?: string;
  status: 'paid' | 'partial' | 'credit';
  recordedBy: string;
  recordedByName: string;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Expense {
  id: string;
  shopId: string;
  type: 'expense' | 'other_income';
  category: string;
  title: string;
  amount: number;
  paymentMethod: LiquidPaymentMethod;
  accountId: string;
  accountName: string;
  recordedBy: string;
  recordedByName: string;
  notes?: string;
  createdAt: Timestamp;
}

export interface StockMovement {
  id: string;
  shopId: string;
  productId: string;
  productName: string;
  type: 'sale' | 'purchase' | 'adjustment_in' | 'adjustment_out' | 'loss' | 'return';
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  reason?: string;
  userId: string;
  userName: string;
  createdAt: Timestamp;
}

export interface TreasuryTransaction {
  id: string;
  shopId: string;
  accountId: string;
  accountName: string;
  direction: 'in' | 'out';
  category:
    | 'sale'
    | 'credit_payment'
    | 'purchase'
    | 'supplier_payment'
    | 'expense'
    | 'other_income'
    | 'transfer_in'
    | 'transfer_out'
    | 'initial';
  amount: number;
  balanceAfter: number;
  referenceId?: string;
  description: string;
  paymentMethod: string;
  userId: string;
  userName: string;
  createdAt: Timestamp;
}

export interface ActivityLog {
  id: string;
  shopId: string;
  action: string;
  module: string;
  description: string;
  amount: number;
  referenceId?: string;
  userId: string;
  userName: string;
  createdAt: Timestamp;
}
