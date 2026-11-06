import solver from 'javascript-lp-solver';
import type { ShippingRule, StoreId, Subscription } from '../types';

/** Una línea del carrito con el precio unitario en cada tienda (undefined = no disponible). */
export interface Line {
  id: string;
  quantity: number;
  prices: Partial<Record<StoreId, number>>;
}

/** Forma de comprar en una tienda: sin suscripción o con una. */
export interface StoreOption {
  store: StoreId;
  subscription?: Subscription;
  shipping: ShippingRule;
  /** Costo fijo de usar esta opción (suscripción prorrateada). */
  fixedCost: number;
}

export interface Cart {
  option: StoreOption;
  lineIds: string[];
  subtotal: number;
  shipping: number;
}

export interface Plan {
  carts: Cart[];
  /** Productos + despachos + suscripciones + penalización por carrito extra. */
  total: number;
  /** Líneas que no están disponibles en ninguna tienda del plan. */
  missing: string[];
}

export interface OptimizeInput {
  lines: Line[];
  shipping: Partial<Record<StoreId, ShippingRule>>;
  subscriptions?: Subscription[];
  /** Máximo de carritos simultáneos (por defecto 2). */
  maxCarts?: number;
  /** Costo de hacer un carrito adicional (tiempo, molestia), en CLP. */
  extraCartPenalty?: number;
}

export function shippingCost(rule: ShippingRule, subtotal: number): number {
  if (subtotal <= 0) return 0;
  return rule.freeFrom !== undefined && subtotal >= rule.freeFrom ? 0 : rule.cost;
}

function lineCost(line: Line, store: StoreId): number {
  const p = line.prices[store];
  return p === undefined ? Infinity : p * line.quantity;
}

/** Costo total de una asignación línea → índice de opción. */
function evaluate(lines: Line[], options: StoreOption[], assign: number[], penalty: number): number {
  let total = 0;
  let used = 0;
  options.forEach((option, k) => {
    const sub = lines.reduce((s, l, i) => s + (assign[i] === k ? lineCost(l, option.store) : 0), 0);
    if (sub > 0) {
      used++;
      total += sub + shippingCost(option.shipping, sub) + option.fixedCost;
    }
  });
  return total + Math.max(0, used - 1) * penalty;
}

/** Todas las formas de comprar en cada tienda: sin suscripción, o con cada suscripción de esa tienda. */
export function storeOptions(input: OptimizeInput, withSubscriptions = true): StoreOption[][] {
  return (Object.keys(input.shipping) as StoreId[]).map((store) => [
    { store, shipping: input.shipping[store]!, fixedCost: 0 },
    ...(withSubscriptions ? input.subscriptions ?? [] : [])
      .filter((s) => s.store === store)
      // El costo es mensual, no por pedido: se evalúa aparte (adviseSubscriptions).
      .map((s) => ({ store, subscription: s, shipping: s.shipping, fixedCost: 0 })),
  ]);
}

/** Construye el plan a partir de una asignación. */
function toPlan(lines: Line[], options: StoreOption[], assign: number[], total: number, missing: string[]): Plan {
  const carts = options
    .map((option, k) => {
      const lineIds = lines.filter((_, i) => assign[i] === k).map((l) => l.id);
      const subtotal = lines.reduce((s, l, i) => s + (assign[i] === k ? lineCost(l, option.store) : 0), 0);
      return { option, lineIds, subtotal, shipping: shippingCost(option.shipping, subtotal) };
    })
    .filter((c) => c.lineIds.length > 0);
  return { carts, total, missing };
}

/**
 * Mejor plan de compra, exacto, como programa entero:
 *   x[i,k] = la línea i va a la opción k, u[k] = se usa la opción k, z[k] = la opción k alcanza envío gratis.
 *   min Σ c[i,k]·x + Σ (despacho + suscripción + penalización)·u − Σ despacho·z
 *   s.a. Σ_k x[i,k] = 1;  x[i,k] ≤ u[k];  z[k] ≤ u[k];  Σ_i c[i,k]·x[i,k] ≥ umbral[k]·z[k];
 *        a lo más una opción por tienda;  Σ u ≤ maxCarts.
 * Las líneas sin precio en ninguna tienda se reportan como faltantes y no se cuentan.
 */
export function optimize(input: OptimizeInput, withSubscriptions = true): Plan | undefined {
  const maxCarts = input.maxCarts ?? 2;
  const penalty = input.extraCartPenalty ?? 0;
  const options = storeOptions(input, withSubscriptions).flat();
  const stores = [...new Set(options.map((o) => o.store))];
  const missing = input.lines.filter((l) => !stores.some((s) => l.prices[s] !== undefined)).map((l) => l.id);
  const lines = input.lines.filter((l) => !missing.includes(l.id));
  if (lines.length === 0) return { carts: [], total: 0, missing };

  const constraints: Record<string, { min?: number; max?: number; equal?: number }> = { carts: { max: maxCarts } };
  const variables: Record<string, Record<string, number>> = {};
  const binaries: Record<string, 1> = {};
  stores.forEach((s) => (constraints[`store_${s}`] = { max: 1 }));

  options.forEach((o, k) => {
    const u: Record<string, number> = { cost: o.shipping.cost + o.fixedCost + penalty, carts: 1, [`store_${o.store}`]: 1 };
    lines.forEach((line, i) => {
      const c = lineCost(line, o.store);
      if (!Number.isFinite(c)) return;
      variables[`x_${i}_${k}`] = { cost: c, [`line_${i}`]: 1, [`link_${i}_${k}`]: 1, [`sub_${k}`]: c };
      binaries[`x_${i}_${k}`] = 1;
      constraints[`link_${i}_${k}`] = { max: 0 };
      u[`link_${i}_${k}`] = -1;
    });
    if (o.shipping.freeFrom !== undefined && o.shipping.cost > 0) {
      variables[`z_${k}`] = { cost: -o.shipping.cost, [`sub_${k}`]: -o.shipping.freeFrom, [`zlink_${k}`]: 1 };
      binaries[`z_${k}`] = 1;
      constraints[`sub_${k}`] = { min: 0 };
      constraints[`zlink_${k}`] = { max: 0 };
      u[`zlink_${k}`] = -1;
    }
    variables[`u_${k}`] = u;
    binaries[`u_${k}`] = 1;
  });
  lines.forEach((_, i) => (constraints[`line_${i}`] = { equal: 1 }));

  const result = solver.Solve({ optimize: 'cost', opType: 'min', constraints, variables, binaries });
  if (!result.feasible) return undefined;

  const assign = lines.map((_, i) => options.findIndex((_, k) => Number(result[`x_${i}_${k}`] ?? 0) > 0.5));
  return toPlan(lines, options, assign, evaluate(lines, options, assign, penalty), missing);
}

/** Total de comprar todo en una sola tienda (sin suscripción); undefined si falta algún producto. */
export function singleStoreTotal(input: OptimizeInput, store: StoreId): number | undefined {
  let subtotal = 0;
  for (const l of input.lines) {
    const c = lineCost(l, store);
    if (!Number.isFinite(c)) return undefined;
    subtotal += c;
  }
  return subtotal + shippingCost(input.shipping[store]!, subtotal);
}

export interface SubscriptionAdvice {
  subscription: Subscription;
  /** Mejor total de este carrito con y sin la suscripción (sin contar su costo mensual). */
  totalWith: number;
  totalWithout: number;
  /** Ahorro por pedido gracias a la suscripción (0 = no ayuda con este carrito). */
  savingPerOrder: number;
  /** Pedidos al mes desde los que la suscripción se paga sola; undefined si no ahorra nada. */
  breakEvenOrdersPerMonth?: number;
}

/**
 * Para cada suscripción: el mejor total con y sin ella, y cuántos pedidos al mes hacen falta para
 * que se pague sola. Las demás suscripciones se consideran según si el usuario ya las tiene.
 */
export function adviseSubscriptions(input: OptimizeInput): SubscriptionAdvice[] {
  const all = input.subscriptions ?? [];
  return all.flatMap((subscription) => {
    const others = all.filter((s) => s.id !== subscription.id && s.owned);
    const without = optimize({ ...input, subscriptions: others });
    const withIt = optimize({ ...input, subscriptions: [...others, subscription] });
    if (!without || !withIt) return [];
    const savingPerOrder = Math.max(0, without.total - withIt.total);
    return [
      {
        subscription,
        totalWith: withIt.total,
        totalWithout: without.total,
        savingPerOrder,
        breakEvenOrdersPerMonth: savingPerOrder > 0 ? Math.ceil(subscription.monthlyCost / savingPerOrder) : undefined,
      },
    ];
  });
}
