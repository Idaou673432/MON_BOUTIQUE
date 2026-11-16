import React, { Component, ErrorInfo, ReactNode, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  CreditCard,
  Truck,
  Receipt,
  Wallet,
  ArrowLeftRight,
  FileText,
  History,
  BarChart3,
  ShieldCheck,
  Settings,
  Lock,
  Menu,
  X,
  Store,
  AlertTriangle,
  Sun,
  Moon,
} from 'lucide-react';
import { AppProvider, useApp } from './contexts/AppContext';
import { LoginView } from './components/LoginView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAComponents';
import { NAV_LABELS, ROLE_LABELS, t } from './i18n/translations';
import { LanguageCode, ModuleId, PermissionKey } from './types';
import { DashboardModule } from './components/modules/DashboardModule';
import { PosModule } from './components/modules/PosModule';
import { ProductsModule } from './components/modules/ProductsModule';
import { InventoryModule } from './components/modules/InventoryModule';
import { ContactsModule } from './components/modules/ContactsModule';
import { CreditsModule } from './components/modules/CreditsModule';
import { PurchasesModule } from './components/modules/PurchasesModule';
import { ExpensesModule } from './components/modules/ExpensesModule';
import { TreasuryModule } from './components/modules/TreasuryModule';
import { PaymentsModule } from './components/modules/PaymentsModule';
import { InvoicesModule } from './components/modules/InvoicesModule';
import { HistoryModule } from './components/modules/HistoryModule';
import { ReportsModule } from './components/modules/ReportsModule';
import { UsersModule } from './components/modules/UsersModule';
import { SettingsModule } from './components/modules/SettingsModule';

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught app error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-8 space-y-4">
            <h1 className="text-lg font-bold text-slate-900">Une erreur est survenue</h1>
            <p className="text-xs text-slate-600 font-mono break-all bg-slate-50 p-3 rounded-lg border border-slate-200">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface NavItem {
  id: ModuleId;
  perm: PermissionKey;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', perm: 'dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'pos', perm: 'pos', icon: <ShoppingCart className="w-4 h-4" /> },
  { id: 'products', perm: 'products', icon: <Package className="w-4 h-4" /> },
  { id: 'inventory', perm: 'inventory', icon: <Boxes className="w-4 h-4" /> },
  { id: 'contacts', perm: 'customers', icon: <Users className="w-4 h-4" /> },
  { id: 'credits', perm: 'credits', icon: <CreditCard className="w-4 h-4" /> },
  { id: 'purchases', perm: 'purchases', icon: <Truck className="w-4 h-4" /> },
  { id: 'expenses', perm: 'expenses', icon: <Receipt className="w-4 h-4" /> },
  { id: 'treasury', perm: 'treasury', icon: <Wallet className="w-4 h-4" /> },
  { id: 'payments', perm: 'payments', icon: <ArrowLeftRight className="w-4 h-4" /> },
  { id: 'invoices', perm: 'invoices', icon: <FileText className="w-4 h-4" /> },
  { id: 'history', perm: 'history', icon: <History className="w-4 h-4" /> },
  { id: 'reports', perm: 'reports', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'users', perm: 'users', icon: <ShieldCheck className="w-4 h-4" /> },
  { id: 'settings', perm: 'settings', icon: <Settings className="w-4 h-4" /> },
];

function WorkspaceShell() {
  const {
    shopId,
    shop,
    currentMember,
    products,
    language,
    setLanguage,
    theme,
    toggleTheme,
    lockSession,
    hasPerm,
    dataLoading,
  } = useApp();

  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const stockAlertCount = useMemo(
    () => products.filter((p) => p.active && (p.stock <= 0 || p.stock < p.minStock)).length,
    [products]
  );

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => hasPerm(item.perm)),
    [currentMember]
  );

  if (shopId && dataLoading && !shop) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-600">
          Chargement des données de la boutique...
        </div>
      </div>
    );
  }

  if (!shopId || !shop || !currentMember) {
    return <LoginView />;
  }

  if (!currentMember.active) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-8 text-center space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Compte suspendu</h2>
          <p className="text-xs text-slate-600">
            Votre accès à la boutique {shop.name} a été désactivé par l'administrateur.
          </p>
          <button
            type="button"
            onClick={lockSession}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Changer d'utilisateur
          </button>
        </div>
      </div>
    );
  }

  const effectiveModule = visibleNavItems.some((i) => i.id === activeModule)
    ? activeModule
    : visibleNavItems[0]?.id || 'dashboard';

  const renderModule = () => {
    switch (effectiveModule) {
      case 'dashboard':
        return <DashboardModule onNavigate={setActiveModule} />;
      case 'pos':
        return <PosModule />;
      case 'products':
        return <ProductsModule />;
      case 'inventory':
        return <InventoryModule />;
      case 'contacts':
        return <ContactsModule />;
      case 'credits':
        return <CreditsModule />;
      case 'purchases':
        return <PurchasesModule />;
      case 'expenses':
        return <ExpensesModule />;
      case 'treasury':
        return <TreasuryModule />;
      case 'payments':
        return <PaymentsModule />;
      case 'invoices':
        return <InvoicesModule />;
      case 'history':
        return <HistoryModule />;
      case 'reports':
        return <ReportsModule />;
      case 'users':
        return <UsersModule />;
      case 'settings':
        return <SettingsModule />;
      default:
        return <DashboardModule onNavigate={setActiveModule} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* Sidebar Desktop */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:w-64 bg-slate-900 text-slate-200 shrink-0 border-r border-slate-800">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shrink-0">
            <Store className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{shop.name}</div>
            <div className="text-[11px] font-mono text-slate-400 truncate">
              {shop.shopCode} · {shop.city || 'Mali'}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleNavItems.map((item) => {
            const active = effectiveModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveModule(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {item.icon}
                <span className="truncate flex-1 text-left">{NAV_LABELS[language][item.id]}</span>
                {item.id === 'inventory' && stockAlertCount > 0 && (
                  <span className="font-mono text-[11px] font-bold text-rose-400">
                    {stockAlertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="text-xs">
            <div className="font-semibold text-white truncate">{currentMember.displayName}</div>
            <div className="text-[11px] text-slate-400 truncate">
              {ROLE_LABELS[language][currentMember.role]}
            </div>
          </div>
          <button
            type="button"
            onClick={lockSession}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Verrouiller / Changer</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-slate-200 flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white truncate">{shop.name}</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {visibleNavItems.map((item) => {
                const active = effectiveModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveModule(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded-lg ${
                      active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {item.icon}
                    <span>{NAV_LABELS[language][item.id]}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-800">
              <button
                type="button"
                onClick={lockSession}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 rounded-lg"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Verrouiller / Changer</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Menu"
              className="lg:hidden p-2 -ml-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              <span className="font-medium text-slate-900 dark:text-slate-100">{shop.name}</span>
              <span className="mx-1.5">/</span>
              <span>{NAV_LABELS[language][effectiveModule]}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />

            {hasPerm('inventory') && stockAlertCount > 0 && effectiveModule !== 'inventory' && (
              <button
                type="button"
                onClick={() => setActiveModule('inventory')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span className="tabular-nums">{stockAlertCount} alerte(s) stock</span>
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              title={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <select
              aria-label="Langue"
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
              <option value="bm">BM</option>
            </select>

            {hasPerm('pos') && effectiveModule !== 'pos' && (
              <button
                type="button"
                onClick={() => setActiveModule('pos')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t(language, 'quickSale')}</span>
                <span className="sm:hidden">POS</span>
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {renderModule()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppProvider>
        <WorkspaceShell />
        <OfflineIndicator />
      </AppProvider>
    </AppErrorBoundary>
  );
}
