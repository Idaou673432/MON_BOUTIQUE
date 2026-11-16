import React, { useState } from 'react';
import { Printer, X, FileText, Receipt } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { formatDateTime, formatFCFA, paymentMethodLabel } from '../lib/format';
import { Sale } from '../types';

interface ReceiptModalProps {
  sale: Sale;
  onClose: () => void;
}

export function ReceiptModal({ sale, onClose }: ReceiptModalProps) {
  const { shop, language } = useApp();
  const [formatMode, setFormatMode] = useState<'thermal' | 'a4'>('thermal');

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl overflow-hidden print-container">
        <div className="no-print px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setFormatMode('thermal')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  formatMode === 'thermal'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Ticket Caisse 80mm</span>
              </button>
              <button
                type="button"
                onClick={() => setFormatMode('a4')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  formatMode === 'a4'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Facture A4</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[80vh] bg-white print:max-h-none print:p-0">
          {formatMode === 'thermal' ? (
            <div className="print-invoice max-w-[320px] mx-auto bg-white border border-black p-5 rounded-lg font-mono text-xs font-bold text-black print-thermal print:border-none">
              <div className="text-center border-b-2 border-dashed border-black pb-3">
                <div className="text-base font-extrabold uppercase text-black">{shop?.name}</div>
                {shop?.address && <div className="mt-0.5 text-[11px] font-bold text-black">{shop.address}</div>}
                {shop?.city && <div className="text-[11px] font-bold text-black">{shop.city}, Mali</div>}
                {shop?.phone && <div className="text-[11px] font-bold text-black">Tél : {shop.phone}</div>}
                {shop?.nif && <div className="text-[10px] font-bold text-black mt-0.5">NIF : {shop.nif}</div>}
              </div>

              <div className="py-2.5 border-b-2 border-dashed border-black space-y-0.5 text-[11px] font-bold text-black">
                <div className="flex justify-between">
                  <span>Facture :</span>
                  <span className="font-extrabold">{sale.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Date :</span>
                  <span>{formatDateTime(sale.createdAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Client :</span>
                  <span className="truncate max-w-[160px]">{sale.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Caissier :</span>
                  <span className="truncate max-w-[160px]">{sale.cashierName}</span>
                </div>
              </div>

              <div className="py-2.5 border-b-2 border-dashed border-black space-y-2 text-black font-bold">
                {sale.items.map((item, idx) => (
                  <div key={idx}>
                    <div className="font-extrabold text-black">{item.productName}</div>
                    <div className="flex justify-between text-[11px] font-bold text-black tabular-nums">
                      <span>
                        {item.quantity} {item.unit} × {formatFCFA(item.unitPrice)}
                      </span>
                      <span className="font-extrabold text-black">{formatFCFA(item.lineTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="py-2.5 space-y-1 text-[11px] font-bold text-black tabular-nums border-b-2 border-dashed border-black">
                <div className="flex justify-between">
                  <span>Sous-total :</span>
                  <span>{formatFCFA(sale.subtotal)}</span>
                </div>
                {sale.discount > 0 && (
                  <div className="flex justify-between">
                    <span>Remise :</span>
                    <span>-{formatFCFA(sale.discount)}</span>
                  </div>
                )}
                {sale.tvaAmount > 0 && (
                  <div className="flex justify-between">
                    <span>TVA :</span>
                    <span>{formatFCFA(sale.tvaAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold text-black pt-1">
                  <span>TOTAL NET :</span>
                  <span>{formatFCFA(sale.total)}</span>
                </div>
                <div className="flex justify-between font-bold text-black">
                  <span>Payé ({paymentMethodLabel(sale.paymentMethod, language)}) :</span>
                  <span>{formatFCFA(sale.amountPaid)}</span>
                </div>
                {sale.amountDue > 0 && (
                  <div className="flex justify-between font-extrabold text-black">
                    <span>Reste à payer :</span>
                    <span>{formatFCFA(sale.amountDue)}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 text-center text-[11px] font-bold text-black">
                {shop?.receiptFooter || 'Merci pour votre visite !'}
              </div>
            </div>
          ) : (
            <div className="print-invoice p-6 bg-white border border-black rounded-xl text-black font-bold print:border-none">
              <div className="flex justify-between items-start pb-6 border-b-2 border-black">
                <div>
                  <h2 className="text-xl font-extrabold text-black">{shop?.name}</h2>
                  <div className="text-xs font-bold text-black mt-1 space-y-0.5">
                    {shop?.address && <div>{shop.address}</div>}
                    {shop?.city && <div>{shop.city}, République du Mali</div>}
                    {shop?.phone && <div>Tél : {shop.phone}</div>}
                    {(shop?.nif || shop?.rccm) && (
                      <div>
                        {shop?.nif ? `NIF : ${shop.nif}` : ''}
                        {shop?.nif && shop?.rccm ? ' · ' : ''}
                        {shop?.rccm ? `RCCM : ${shop.rccm}` : ''}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-black font-extrabold">
                    Facture Commerciale
                  </div>
                  <div className="font-mono text-lg font-extrabold text-black mt-0.5">
                    {sale.invoiceNumber}
                  </div>
                  <div className="text-xs font-bold text-black mt-1">{formatDateTime(sale.createdAt)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 py-5 border-b-2 border-black text-xs font-bold text-black">
                <div>
                  <div className="text-black font-bold">Facturé à</div>
                  <div className="text-sm font-extrabold text-black mt-1">{sale.customerName}</div>
                  {sale.customerPhone && <div className="text-black font-bold mt-0.5">{sale.customerPhone}</div>}
                </div>
                <div className="text-right">
                  <div className="text-black font-bold">Règlement & Caissier</div>
                  <div className="text-sm font-extrabold text-black mt-1">
                    {paymentMethodLabel(sale.paymentMethod, language)}
                  </div>
                  <div className="text-black font-bold mt-0.5">Établi par : {sale.cashierName}</div>
                </div>
              </div>

              <table className="w-full text-xs font-bold text-black mt-5">
                <thead>
                  <tr className="border-b-2 border-black text-black text-left">
                    <th className="py-2.5 font-extrabold">Désignation</th>
                    <th className="py-2.5 font-extrabold text-right">Qté</th>
                    <th className="py-2.5 font-extrabold text-right">Prix Unitaire</th>
                    <th className="py-2.5 font-extrabold text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/30 tabular-nums">
                  {sale.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-3 font-bold text-black">{item.productName}</td>
                      <td className="py-3 text-right font-bold text-black">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="py-3 text-right font-mono font-bold text-black">
                        {formatFCFA(item.unitPrice)}
                      </td>
                      <td className="py-3 text-right font-mono font-extrabold text-black">
                        {formatFCFA(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 pt-5 border-t-2 border-black flex justify-end">
                <div className="w-72 space-y-2 text-xs font-bold text-black tabular-nums">
                  <div className="flex justify-between text-black font-bold">
                    <span>Sous-total HT</span>
                    <span className="font-mono font-bold">{formatFCFA(sale.subtotal)}</span>
                  </div>
                  {sale.discount > 0 && (
                    <div className="flex justify-between text-black font-bold">
                      <span>Remise commerciale</span>
                      <span className="font-mono font-bold">-{formatFCFA(sale.discount)}</span>
                    </div>
                  )}
                  {sale.tvaAmount > 0 && (
                    <div className="flex justify-between text-black font-bold">
                      <span>TVA ({shop?.tvaRate || 18}%)</span>
                      <span className="font-mono font-bold">{formatFCFA(sale.tvaAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-extrabold text-black pt-2 border-t-2 border-black">
                    <span>Total TTC</span>
                    <span className="font-mono font-extrabold">{formatFCFA(sale.total)}</span>
                  </div>
                  <div className="flex justify-between text-black font-bold">
                    <span>Montant encaissé</span>
                    <span className="font-mono font-bold">{formatFCFA(sale.amountPaid)}</span>
                  </div>
                  {sale.amountDue > 0 && (
                    <div className="flex justify-between text-black font-extrabold">
                      <span>Reste dû (Crédit)</span>
                      <span className="font-mono font-extrabold">{formatFCFA(sale.amountDue)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-10 pt-4 border-t-2 border-black text-center text-xs font-bold text-black">
                {shop?.receiptFooter || 'Merci pour votre confiance.'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
