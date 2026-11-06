import { bestMatch, type Match } from './match/matcher';
import { substituteCandidates, substituteKey, type Substitute, type SubstituteRules } from './match/substitutes';
import {
  adviseSubscriptions,
  optimize,
  singleStoreTotal,
  type Line,
  type OptimizeInput,
  type Plan,
  type SubscriptionAdvice,
} from './optimizer/split';
import type { CartItem, Offer, SearchQuery, ShippingRule, StoreId, Subscription } from './types';

export type Searcher = (query: SearchQuery) => Promise<Offer[]>;

export interface QuoteRow {
  item: CartItem;
  /** Equivalente encontrado en cada tienda (la tienda de origen es el propio ítem). */
  matches: Partial<Record<StoreId, Match>>;
  /** Sustitutos sugeridos donde no hay el mismo producto (o el aceptado ya no está disponible). */
  substitutes: Partial<Record<StoreId, Substitute[]>>;
  errors: Partial<Record<StoreId, string>>;
}

export interface Quote {
  origin: StoreId;
  rows: QuoteRow[];
  /** Total de comprar todo en una sola tienda (productos + despacho), si la tienda tiene todo. */
  singleStore: Partial<Record<StoreId, number>>;
  best?: Plan;
  /** Mejor plan si se aceptaran todos los primeros sustitutos sugeridos (con precio equivalente). */
  withSuggestions?: Plan;
  subscriptions: SubscriptionAdvice[];
}

export interface QuoteSettings {
  shipping: Partial<Record<StoreId, ShippingRule>>;
  subscriptions: Subscription[];
  maxCarts: number;
  extraCartPenalty: number;
}

/** Busca cada producto del carrito en las otras tiendas y arma la cotización. */
export async function quoteCart(
  items: CartItem[],
  stores: StoreId[],
  searchers: Partial<Record<StoreId, Searcher>>,
  settings: QuoteSettings,
  rules: SubstituteRules = { accepted: {}, rejected: {} },
): Promise<Quote> {
  const origin = items[0]?.store ?? stores[0]!;
  const rows: QuoteRow[] = await Promise.all(
    items.map(async (item) => {
      const row: QuoteRow = { item, matches: {}, substitutes: {}, errors: {} };
      row.matches[item.store] = {
        kind: 'ean',
        score: 1,
        offer: { ...item, available: true },
      };
      for (const store of stores) {
        if (store === item.store) continue;
        const search = searchers[store];
        if (!search) continue;
        try {
          const offers = await search({ ean: item.ean, name: item.name, brand: item.brand, sizeText: item.sizeText });
          const available = offers.filter((o) => o.available);
          const match = bestMatch(item, available);
          if (match) row.matches[store] = match;
          if (!match || match.kind === 'doubtful') {
            const key = substituteKey(item, store);
            const accepted = available.find((o) => o.sku === rules.accepted[key]);
            if (accepted) row.matches[store] = { offer: accepted, kind: 'substitute', score: 1 };
            else row.substitutes[store] = substituteCandidates(item, available, rules.rejected[key]);
          }
        } catch (e) {
          row.errors[store] = e instanceof Error ? e.message : String(e);
        }
      }
      return row;
    }),
  );

  // Solo cuentan para el optimizador los equivalentes confiables (EAN o nombre); los dudosos se muestran aparte.
  const lines: Line[] = rows.map((row, i) => ({
    id: String(i),
    quantity: row.item.quantity,
    prices: Object.fromEntries(
      Object.entries(row.matches)
        .filter(([, m]) => m.kind !== 'doubtful')
        .map(([store, m]) => [store, m.offer.unitPrice]),
    ),
  }));
  const input: OptimizeInput = {
    lines,
    shipping: Object.fromEntries(stores.map((s) => [s, settings.shipping[s] ?? { cost: 0 }])),
    // La mejor opción solo usa las suscripciones que el usuario ya tiene; las demás se evalúan aparte.
    subscriptions: settings.subscriptions.filter((s) => stores.includes(s.store) && s.owned),
    maxCarts: settings.maxCarts,
    extraCartPenalty: settings.extraCartPenalty,
  };
  const singleStore: Partial<Record<StoreId, number>> = {};
  for (const s of stores) {
    const t = singleStoreTotal(input, s);
    if (t !== undefined) singleStore[s] = t;
  }
  // Escenario "si aceptas los sugeridos": el primer sustituto con precio equivalente llena los huecos.
  const suggestedLines: Line[] = lines.map((line, i) => {
    const prices = { ...line.prices };
    for (const [store, subs] of Object.entries(rows[i]!.substitutes)) {
      const top = subs?.find((s) => s.equivalentPrice !== undefined);
      if (prices[store as StoreId] === undefined && top) prices[store as StoreId] = top.equivalentPrice!;
    }
    return { ...line, prices };
  });
  const anySuggestion = rows.some((r) => Object.values(r.substitutes).some((s) => s && s.length > 0));

  return {
    origin,
    rows,
    singleStore,
    best: optimize(input),
    withSuggestions: anySuggestion ? optimize({ ...input, lines: suggestedLines }) : undefined,
    subscriptions: adviseSubscriptions({ ...input, subscriptions: settings.subscriptions.filter((s) => stores.includes(s.store)) }),
  };
}
