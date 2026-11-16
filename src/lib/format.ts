import { Timestamp } from 'firebase/firestore';
import { LanguageCode, PaymentMethod } from '../types';
import { t } from '../i18n/translations';

export function formatFCFA(value: number | undefined | null): string {
  const num = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return `${num.toLocaleString('fr-FR')} FCFA`;
}

export function formatNumber(value: number | undefined | null): string {
  const num = Number.isFinite(Number(value)) ? Number(value) : 0;
  return num.toLocaleString('fr-FR');
}

export function toDate(ts: Timestamp | Date | number | undefined | null): Date {
  if (!ts) return new Date();
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  return new Date();
}

export function formatDate(ts: Timestamp | Date | number | undefined | null): string {
  if (!ts) return '—';
  return toDate(ts).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(ts: Timestamp | Date | number | undefined | null): string {
  if (!ts) return '—';
  return toDate(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateDocId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function generateInvoiceCode(prefix: string): string {
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${y}${m}${day}-${rand}`;
}

export function paymentMethodLabel(method: PaymentMethod | string, lang: LanguageCode = 'fr'): string {
  return t(lang, method);
}

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '\uFEFF' +
    [headers.map(escapeCell).join(';'), ...rows.map((r) => r.map(escapeCell).join(';'))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
