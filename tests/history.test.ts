import { describe, expect, it } from 'vitest';
import { recordFromQuote, summarize, type PurchaseRecord } from '../src/history';
import { quoteCart } from '../src/quote';
import { defaultSettings } from '../src/settings';
import type { CartItem, Offer } from '../src/types';

const item: CartItem = { store: 'jumbo', sku: '1', ean: '7802920777542', name: 'Leche Colun Entera 1 L', quantity: 10, unitPrice: 1190 };
const liderOffer: Offer = { store: 'lider', sku: 'x', ean: '7802920777542', name: 'Leche Entera 1 L', unitPrice: 990, available: true };

describe('recordFromQuote', () => {
  it('ahorro = todo en la tienda de origen − mejor opción', async () => {
    const quote = await quoteCart([item], ['jumbo', 'lider'], { lider: async () => [liderOffer] }, defaultSettings());
    const r = recordFromQuote(quote, Date.UTC(2026, 9, 28), 'id1')!;
    // Jumbo: 11.900 + 3.990 = 15.890. Lider: 9.900 + 990 = 10.890.
    expect(r).toMatchObject({ id: 'id1', origin: 'jumbo', products: 1, units: 10, originTotal: 15890, paidTotal: 10890, saving: 5000 });
    expect(r.carts).toEqual([{ store: 'lider', subscription: undefined, products: 1, subtotal: 9900, shipping: 990 }]);
  });
});

describe('summarize', () => {
  const rec = (at: string, saving: number): PurchaseRecord => ({
    id: at,
    at: new Date(at).getTime(),
    origin: 'jumbo',
    products: 1,
    units: 1,
    originTotal: 0,
    paidTotal: 0,
    saving,
    carts: [],
  });

  it('acumulado, promedio y por mes (más reciente primero)', () => {
    const s = summarize([rec('2026-09-10T12:00:00', 1000), rec('2026-10-02T12:00:00', 3000), rec('2026-10-20T12:00:00', 2000)]);
    expect(s).toEqual({
      count: 3,
      totalSaving: 6000,
      averageSaving: 2000,
      byMonth: [
        { month: '2026-10', saving: 5000, count: 2 },
        { month: '2026-09', saving: 1000, count: 1 },
      ],
    });
  });

  it('sin registros', () => {
    expect(summarize([])).toEqual({ count: 0, totalSaving: 0, averageSaving: 0, byMonth: [] });
  });
});
