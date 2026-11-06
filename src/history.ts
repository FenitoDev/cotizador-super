import type { Quote } from './quote';
import type { StoreId } from './types';

/** Una compra registrada por el usuario ("compré así"). */
export interface PurchaseRecord {
  id: string;
  at: number;
  /** Tienda donde se armó el carrito: la referencia contra la que se mide el ahorro. */
  origin: StoreId;
  products: number;
  units: number;
  /** Comprar todo en la tienda de origen, con despacho. */
  originTotal: number;
  /** Lo que costó la opción elegida (mejor plan), con despacho. */
  paidTotal: number;
  saving: number;
  carts: { store: StoreId; subscription?: string; products: number; subtotal: number; shipping: number }[];
}

export interface HistorySummary {
  count: number;
  totalSaving: number;
  averageSaving: number;
  /** Más reciente primero. month = "2026-10". */
  byMonth: { month: string; saving: number; count: number }[];
}

/** Registro a partir de la mejor opción de una cotización; undefined si no hay con qué comparar. */
export function recordFromQuote(quote: Quote, now = Date.now(), id: string = crypto.randomUUID()): PurchaseRecord | undefined {
  const originTotal = quote.singleStore[quote.origin];
  const best = quote.best;
  if (originTotal === undefined || !best) return undefined;
  return {
    id,
    at: now,
    origin: quote.origin,
    products: quote.rows.length,
    units: quote.rows.reduce((s, r) => s + r.item.quantity, 0),
    originTotal,
    paidTotal: best.total,
    saving: Math.max(0, originTotal - best.total),
    carts: best.carts.map((c) => ({
      store: c.option.store,
      subscription: c.option.subscription?.name,
      products: c.lineIds.length,
      subtotal: c.subtotal,
      shipping: c.shipping,
    })),
  };
}

function monthOf(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function summarize(records: PurchaseRecord[]): HistorySummary {
  const totalSaving = records.reduce((s, r) => s + r.saving, 0);
  const months = new Map<string, { saving: number; count: number }>();
  for (const r of records) {
    const m = months.get(monthOf(r.at)) ?? { saving: 0, count: 0 };
    m.saving += r.saving;
    m.count++;
    months.set(monthOf(r.at), m);
  }
  return {
    count: records.length,
    totalSaving,
    averageSaving: records.length ? Math.round(totalSaving / records.length) : 0,
    byMonth: [...months.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, v]) => ({ month, ...v })),
  };
}
