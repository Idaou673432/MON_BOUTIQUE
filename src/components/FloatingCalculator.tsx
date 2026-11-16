import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calculator,
  Check,
  Copy,
  Delete,
  GripHorizontal,
  Minus,
  RotateCcw,
  X,
} from 'lucide-react';
import { formatFCFA } from '../lib/format';

interface FloatingCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyReceived?: (value: number) => void;
  onApplyDiscount?: (value: number) => void;
  onApplyDebtAmount?: (value: number) => void;
}

interface HistoryEntry {
  expr: string;
  result: number;
}

/**
 * Safe recursive-descent arithmetic evaluator (+, -, *, /, %) without eval().
 */
function evaluateArithmetic(rawExpr: string): number | null {
  const cleaned = rawExpr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\s+/g, '');

  if (!cleaned || !/^[0-9+\-*/.%()]+$/.test(cleaned)) {
    return null;
  }

  let pos = 0;

  const peek = () => cleaned[pos];
  const consume = () => cleaned[pos++];

  const parseNumber = (): number | null => {
    const start = pos;
    let hasDot = false;
    while (pos < cleaned.length) {
      const ch = cleaned[pos];
      if (ch >= '0' && ch <= '9') {
        pos++;
      } else if (ch === '.' && !hasDot) {
        hasDot = true;
        pos++;
      } else {
        break;
      }
    }
    if (pos === start) return null;
    const val = Number(cleaned.slice(start, pos));
    if (!Number.isFinite(val)) return null;
    if (peek() === '%') {
      consume();
      return val / 100;
    }
    return val;
  };

  const parseFactor = (): number | null => {
    if (peek() === '+') {
      consume();
      return parseFactor();
    }
    if (peek() === '-') {
      consume();
      const val = parseFactor();
      return val === null ? null : -val;
    }
    if (peek() === '(') {
      consume();
      const inner = parseExpr();
      if (inner === null || peek() !== ')') return null;
      consume();
      if (peek() === '%') {
        consume();
        return inner / 100;
      }
      return inner;
    }
    return parseNumber();
  };

  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parseFactor();
      if (right === null) return null;
      if (op === '*') {
        left = left * right;
      } else {
        if (right === 0) return null;
        left = left / right;
      }
    }
    return left;
  };

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const res = parseExpr();
  if (res === null || pos !== cleaned.length || !Number.isFinite(res)) {
    return null;
  }
  return Math.round(res * 100) / 100;
}

export const FloatingCalculator: React.FC<FloatingCalculatorProps> = ({
  isOpen,
  onClose,
  onApplyReceived,
  onApplyDiscount,
  onApplyDebtAmount,
}) => {
  const [expression, setExpression] = useState('0');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Floating coordinates anchored bottom-right initially
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window !== 'undefined') {
      return {
        x: Math.max(16, window.innerWidth - 344),
        y: Math.max(76, window.innerHeight - 500),
      };
    }
    return { x: 24, y: 80 };
  });

  const dragRef = useRef<{
    dragging: boolean;
    offsetX: number;
    offsetY: number;
  }>({ dragging: false, offsetX: 0, offsetY: 0 });

  const liveValue = evaluateArithmetic(expression);

  const appendToken = useCallback((token: string) => {
    setErrorMsg(null);
    setExpression((prev) => {
      const operators = ['+', '-', '×', '÷'];
      const isOp = operators.includes(token);

      if (prev === '0') {
        if (token === '.' ) return '0.';
        if (token === '00' || token === '000') return '0';
        if (isOp) return token === '-' ? '-' : `0${token}`;
        return token;
      }

      const lastChar = prev[prev.length - 1];
      if (isOp && operators.includes(lastChar)) {
        return prev.slice(0, -1) + token;
      }

      if (token === '.') {
        const parts = prev.split(/[+\-×÷]/);
        const lastPart = parts[parts.length - 1] || '';
        if (lastPart.includes('.')) return prev;
        if (!lastPart) return `${prev}0.`;
      }

      return prev + token;
    });
  }, []);

  const handleClear = useCallback(() => {
    setExpression('0');
    setErrorMsg(null);
  }, []);

  const handleBackspace = useCallback(() => {
    setErrorMsg(null);
    setExpression((prev) => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  }, []);

  const handleEvaluate = useCallback(() => {
    const val = evaluateArithmetic(expression);
    if (val === null) {
      setErrorMsg('Calcul invalide');
      return;
    }
    setErrorMsg(null);
    setHistory((prev) => [{ expr: expression, result: val }, ...prev].slice(0, 5));
    setExpression(String(val));
  }, [expression]);

  // Keyboard support when open and focus is NOT inside a form field
  useEffect(() => {
    if (!isOpen || minimized) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        appendToken(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        appendToken('.');
      } else if (e.key === '+') {
        e.preventDefault();
        appendToken('+');
      } else if (e.key === '-') {
        e.preventDefault();
        appendToken('-');
      } else if (e.key === '*') {
        e.preventDefault();
        appendToken('×');
      } else if (e.key === '/') {
        e.preventDefault();
        appendToken('÷');
      } else if (e.key === '%') {
        e.preventDefault();
        appendToken('%');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEvaluate();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, minimized, appendToken, handleEvaluate, handleBackspace, handleClear, onClose]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      dragging: true,
      offsetX: e.clientX - position.x,
      offsetY: e.clientY - position.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const maxX = Math.max(8, window.innerWidth - 320);
    const maxY = Math.max(8, window.innerHeight - 64);
    const nextX = Math.max(8, Math.min(maxX, e.clientX - dragRef.current.offsetX));
    const nextY = Math.max(8, Math.min(maxY, e.clientY - dragRef.current.offsetY));
    setPosition({ x: nextX, y: nextY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.dragging) {
      dragRef.current.dragging = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer already released
      }
    }
  };

  const usableNumericResult = Math.max(0, Math.round(liveValue ?? 0));

  const copyResult = async () => {
    if (liveValue === null) return;
    try {
      await navigator.clipboard.writeText(String(liveValue));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
      className="no-print fixed top-0 left-0 z-50 w-[312px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden select-none"
    >
      {/* Draggable Title Bar */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 dark:bg-slate-950 text-white cursor-grab active:cursor-grabbing touch-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <Calculator className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold truncate">Calculatrice POS</span>
        </div>
        <div
          className="flex items-center gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            aria-label={minimized ? 'Agrandir' : 'Réduire'}
            className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la calculatrice"
            className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="p-3.5 space-y-3">
          {/* Display Screen */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 text-right space-y-1">
            <div className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate min-h-[16px]">
              {expression}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={copyResult}
                title="Copier le résultat"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <div className="font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums truncate">
                {errorMsg
                  ? errorMsg
                  : liveValue !== null
                    ? formatFCFA(liveValue)
                    : '—'}
              </div>
            </div>
          </div>

          {/* Mini History */}
          {history.length > 0 && (
            <div className="max-h-16 overflow-y-auto space-y-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 px-1">
              {history.slice(0, 3).map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setExpression(String(item.result))}
                  className="w-full flex items-center justify-between hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer text-left"
                >
                  <span className="truncate pr-2">{item.expr}</span>
                  <span className="font-semibold tabular-nums shrink-0">
                    = {item.result.toLocaleString('fr-FR')}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-1.5 font-mono text-sm font-semibold">
            <button
              type="button"
              onClick={handleClear}
              className="py-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 cursor-pointer flex items-center justify-center"
              title="Effacer (C)"
            >
              C
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-center"
              title="Retour arrière"
            >
              <Delete className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => appendToken('%')}
              className="py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => appendToken('÷')}
              className="py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
            >
              ÷
            </button>

            {['7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => appendToken(d)}
                className="py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => appendToken('×')}
              className="py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
            >
              ×
            </button>

            {['4', '5', '6'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => appendToken(d)}
                className="py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => appendToken('-')}
              className="py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
            >
              −
            </button>

            {['1', '2', '3'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => appendToken(d)}
                className="py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => appendToken('+')}
              className="py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
            >
              +
            </button>

            <button
              type="button"
              onClick={() => appendToken('0')}
              className="py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => appendToken('000')}
              className="py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-xs"
            >
              000
            </button>
            <button
              type="button"
              onClick={() => appendToken('.')}
              className="py-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              .
            </button>
            <button
              type="button"
              onClick={handleEvaluate}
              className="py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              =
            </button>
          </div>

          {/* Direct POS Injection Actions */}
          {(onApplyReceived || onApplyDiscount || onApplyDebtAmount) && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>Appliquer au POS :</span>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHistory([])}
                    className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Vider hist.</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {onApplyReceived && (
                  <button
                    type="button"
                    disabled={liveValue === null}
                    onClick={() => onApplyReceived(usableNumericResult)}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-[11px] font-semibold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer truncate"
                    title="Transférer vers Montant reçu"
                  >
                    → Reçu
                  </button>
                )}
                {onApplyDiscount && (
                  <button
                    type="button"
                    disabled={liveValue === null}
                    onClick={() => onApplyDiscount(usableNumericResult)}
                    className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 text-[11px] font-semibold text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer truncate"
                    title="Transférer vers Remise"
                  >
                    → Remise
                  </button>
                )}
                {onApplyDebtAmount && (
                  <button
                    type="button"
                    disabled={liveValue === null || usableNumericResult <= 0}
                    onClick={() => onApplyDebtAmount(usableNumericResult)}
                    className="px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 text-[11px] font-semibold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 disabled:opacity-40 cursor-pointer truncate"
                    title="Enregistrer comme dette client"
                  >
                    → Dette
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
