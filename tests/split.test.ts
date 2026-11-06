import { describe, expect, it } from 'vitest';
import {
  adviseSubscriptions,
  optimize,
  shippingCost,
  singleStoreTotal,
  type Line,
  type OptimizeInput,
} from '../src/optimizer/split';
import type { StoreId } from '../src/types';

const STORES: StoreId[] = ['jumbo', 'lider', 'unimarc'];

/** Óptimo exacto por fuerza bruta (3^n asignaciones), sin suscripciones. */
function bruteForce(input: OptimizeInput): number {
  const { lines } = input;
  const maxCarts = input.maxCarts ?? 2;
  const penalty = input.extraCartPenalty ?? 0;
  let best = Infinity;
  const total = 3 ** lines.length;
  for (let code = 0; code < total; code++) {
    const subs: Record<string, number> = {};
    let c = code;
    let ok = true;
    for (const l of lines) {
      const s = STORES[c % 3]!;
      c = Math.floor(c / 3);
      const p = l.prices[s];
      if (p === undefined) {
        ok = false;
        break;
      }
      subs[s] = (subs[s] ?? 0) + p * l.quantity;
    }
    const used = Object.keys(subs) as StoreId[];
    if (!ok || used.length > maxCarts) continue;
    const t =
      used.reduce((acc, s) => acc + subs[s]! + shippingCost(input.shipping[s]!, subs[s]!), 0) +
      (used.length - 1) * penalty;
    best = Math.min(best, t);
  }
  return best;
}

describe('optimize', () => {
  it('ejemplo tipo Błażewicz: dividir supera a "más barato por producto"', () => {
    // Por producto lo más barato reparte en 3 tiendas y paga 3 despachos.
    const input: OptimizeInput = {
      lines: [
        { id: 'a', quantity: 1, prices: { jumbo: 50, lider: 52, unimarc: 60 } },
        { id: 'b', quantity: 1, prices: { jumbo: 62, lider: 60, unimarc: 61 } },
        { id: 'c', quantity: 1, prices: { jumbo: 45, lider: 44, unimarc: 40 } },
      ],
      shipping: { jumbo: { cost: 20 }, lider: { cost: 20 }, unimarc: { cost: 20 } },
      maxCarts: 3,
    };
    const naive = 50 + 60 + 40 + 3 * 20;
    const plan = optimize(input)!;
    expect(plan.total).toBeLessThan(naive);
    expect(plan.total).toBe(bruteForce(input));
  });

  it('mueve productos para alcanzar el envío gratis', () => {
    const input: OptimizeInput = {
      lines: [
        { id: 'a', quantity: 1, prices: { jumbo: 15000, lider: 15500 } },
        { id: 'b', quantity: 1, prices: { jumbo: 6500, lider: 6000 } },
      ],
      shipping: { jumbo: { cost: 3990, freeFrom: 20000 }, lider: { cost: 2990, freeFrom: 30000 } },
    };
    const plan = optimize(input)!;
    expect(plan.carts).toHaveLength(1);
    expect(plan.carts[0]!.option.store).toBe('jumbo');
    expect(plan.total).toBe(21500);
  });

  it('reporta productos que no están en ninguna tienda', () => {
    const plan = optimize({
      lines: [
        { id: 'a', quantity: 1, prices: { jumbo: 1000 } },
        { id: 'z', quantity: 1, prices: {} },
      ],
      shipping: { jumbo: { cost: 0 } },
    })!;
    expect(plan.missing).toEqual(['z']);
    expect(plan.total).toBe(1000);
  });

  it('coincide con fuerza bruta en carritos aleatorios', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 150; trial++) {
      const n = 2 + Math.floor(rnd() * 6);
      const lines: Line[] = Array.from({ length: n }, (_, i) => {
        const prices: Partial<Record<StoreId, number>> = {};
        for (const s of STORES) if (rnd() > 0.15) prices[s] = 500 + Math.round(rnd() * 9500);
        if (Object.keys(prices).length === 0) prices.jumbo = 1000;
        return { id: `l${i}`, quantity: 1 + Math.floor(rnd() * 3), prices };
      });
      const shipping = Object.fromEntries(
        STORES.map((s) => [s, { cost: 1990 + Math.round(rnd() * 3000), freeFrom: rnd() > 0.3 ? 15000 + Math.round(rnd() * 25000) : undefined }]),
      );
      const input: OptimizeInput = { lines, shipping, maxCarts: 1 + Math.floor(rnd() * 3), extraCartPenalty: Math.round(rnd() * 1000) };
      const plan = optimize(input);
      const exact = bruteForce(input);
      if (!Number.isFinite(exact)) {
        expect(plan).toBeUndefined();
        continue;
      }
      expect(plan!.total, `trial ${trial}`).toBe(exact);
    }
  });
});

describe('suscripciones', () => {
  const base: OptimizeInput = {
    lines: [{ id: 'a', quantity: 1, prices: { jumbo: 25000, lider: 25500 } }],
    shipping: { jumbo: { cost: 3990, freeFrom: 60000 }, lider: { cost: 2990, freeFrom: 60000 } },
  };
  const prime = {
    id: 'prime',
    store: 'jumbo' as const,
    name: 'Jumbo Prime',
    monthlyCost: 5000,
    shipping: { cost: 3990, freeFrom: 22000 },
    owned: false,
  };

  it('con / sin y pedidos al mes para que se pague sola', () => {
    const [advice] = adviseSubscriptions({ ...base, subscriptions: [prime] });
    // Sin Prime: lider 25.500 + 2.990 = 28.490. Con Prime: jumbo 25.000 + 0 = 25.000.
    expect(advice).toMatchObject({ totalWithout: 28490, totalWith: 25000, savingPerOrder: 3490, breakEvenOrdersPerMonth: 2 });
  });

  it('no ayuda si el carrito no llega al mínimo de envío gratis', () => {
    const small = { ...base, lines: [{ id: 'a', quantity: 1, prices: { jumbo: 9000, lider: 9500 } }] };
    const [advice] = adviseSubscriptions({ ...small, subscriptions: [prime] });
    expect(advice!.savingPerOrder).toBe(0);
    expect(advice!.breakEvenOrdersPerMonth).toBeUndefined();
  });

  it('la mejor opción no usa una suscripción que el usuario no tiene', () => {
    expect(optimize({ ...base, subscriptions: [] })!.total).toBe(28490);
    expect(optimize({ ...base, subscriptions: [{ ...prime, owned: true }] })!.total).toBe(25000);
  });

  it('singleStoreTotal', () => {
    expect(singleStoreTotal(base, 'jumbo')).toBe(28990);
    expect(singleStoreTotal({ ...base, lines: [{ id: 'x', quantity: 1, prices: {} }] }, 'jumbo')).toBeUndefined();
  });
});
