import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, Wallet } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { formatDateTime, formatFCFA } from '../../lib/format';
import { createTreasuryAccount, transferTreasuryAtomic } from '../../services/shopService';
import { TreasuryAccountType } from '../../types';

export function TreasuryModule() {
  const { shop, treasuryAccounts, treasuryTransactions, hasPerm } = useApp();
  const [accountFilter, setAccountFilter] = useState('all');
  const [showNewAcc, setShowNewAcc] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  // New account state
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<TreasuryAccountType>('cash');
  const [accNum, setAccNum] = useState('');
  const [accBal, setAccBal] = useState(0);

  // Transfer state
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [trfAmount, setTrfAmount] = useState(0);
  const [trfDesc, setTrfDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = hasPerm('users');

  const totalBalance = useMemo(
    () => treasuryAccounts.reduce((a, b) => a + (b.balance || 0), 0),
    [treasuryAccounts]
  );

  const filteredTx = useMemo(
    () =>
      accountFilter === 'all'
        ? treasuryTransactions
        : treasuryTransactions.filter((tx) => tx.accountId === accountFilter),
    [treasuryTransactions, accountFilter]
  );

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !accName.trim()) return;
    setSubmitting(true);
    try {
      await createTreasuryAccount({
        shopId: shop.id,
        name: accName.trim(),
        type: accType,
        accountNumber: accNum.trim(),
        initialBalance: accBal,
      });
      setShowNewAcc(false);
      setAccName('');
      setAccNum('');
      setAccBal(0);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || trfAmount <= 0) return;
    setError(null);
    setSubmitting(true);
    try {
      await transferTreasuryAtomic({
        shopId: shop.id,
        fromAccountId: fromId,
        toAccountId: toId,
        amount: trfAmount,
        description: trfDesc.trim(),
      });
      setShowTransfer(false);
      setTrfAmount(0);
      setTrfDesc('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du transfert.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Gestion de la trésorerie</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Solde consolidé : <span className="font-mono font-bold text-slate-900">{formatFCFA(totalBalance)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {treasuryAccounts.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setFromId(treasuryAccounts[0]?.id || '');
                setToId(treasuryAccounts[1]?.id || '');
                setError(null);
                setShowTransfer(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Transfert interne</span>
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowNewAcc(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouveau compte</span>
            </button>
          )}
        </div>
      </div>

      {/* Accounts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {treasuryAccounts.map((acc) => (
          <button
            key={acc.id}
            type="button"
            onClick={() => setAccountFilter(accountFilter === acc.id ? 'all' : acc.id)}
            className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
              accountFilter === acc.id
                ? 'bg-emerald-50/70 border-emerald-500'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="uppercase tracking-wider text-[10px] font-semibold">
                {acc.type.replace('_', ' ')}
              </span>
              <Wallet className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="mt-1.5 text-xs font-semibold text-slate-900 truncate">{acc.name}</div>
            <div className="mt-2 font-mono text-base font-bold text-slate-900 tabular-nums">
              {formatFCFA(acc.balance)}
            </div>
            {acc.accountNumber && (
              <div className="text-[11px] font-mono text-slate-400 mt-1 truncate">
                {acc.accountNumber}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-semibold text-slate-900">
            Journal des flux de trésorerie
          </span>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
          >
            <option value="all">Tous les comptes</option>
            {treasuryAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Compte</th>
                <th className="px-4 py-3 font-semibold">Description</th>
                <th className="px-4 py-3 font-semibold text-right">Montant</th>
                <th className="px-4 py-3 font-semibold text-right">Solde après</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {filteredTx.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Aucune transaction de trésorerie.
                  </td>
                </tr>
              ) : (
                filteredTx.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{tx.accountName}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {tx.description} · <span className="text-slate-400">{tx.userName}</span>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono font-bold ${
                        tx.direction === 'in' ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {tx.direction === 'in' ? '+' : '-'}
                      {formatFCFA(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">
                      {formatFCFA(tx.balanceAfter)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Account Modal */}
      {showNewAcc && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900">Nouveau compte de trésorerie</h3>
            <form onSubmit={handleCreateAccount} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nom du compte *</label>
                <input
                  type="text"
                  required
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Ex : Orange Money Boutique 2"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value as TreasuryAccountType)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  <option value="cash">Caisse Espèces</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="moov_money">Moov Money</option>
                  <option value="wave">Wave</option>
                  <option value="bank">Compte Bancaire</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">N° Compte / Téléphone</label>
                <input
                  type="text"
                  value={accNum}
                  onChange={(e) => setAccNum(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Solde initial (FCFA)</label>
                <input
                  type="number"
                  min={0}
                  value={accBal}
                  onChange={(e) => setAccBal(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewAcc(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-slate-900">Transfert entre comptes</h3>
            <form onSubmit={handleTransfer} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Compte source</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  {treasuryAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatFCFA(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Compte destination</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
                >
                  {treasuryAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatFCFA(a.balance)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Montant (FCFA) *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={trfAmount || ''}
                  onChange={(e) => setTrfAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Motif</label>
                <input
                  type="text"
                  value={trfDesc}
                  onChange={(e) => setTrfDesc(e.target.value)}
                  placeholder="Ex : Versement recette caisse vers banque"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              {error && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {error}
                </div>
              )}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTransfer(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg cursor-pointer"
                >
                  Valider transfert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
