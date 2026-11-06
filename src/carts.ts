import { liderIdToEan } from './connectors/lider';
import type { CartItem } from './types';

/**
 * Normalizadores de las respuestas de carrito que las propias tiendas piden.
 * La extensión no llama a estas APIs: las escucha pasivamente (ver entrypoints/capture.content.ts).
 */

export interface CapturedCart {
  items: CartItem[];
  /** Costo de despacho que muestra la tienda para este carrito, si ya hay dirección/horario elegidos. */
  shipping?: number;
  /** Productos de vendedores externos (marketplace), que no se comparan. */
  excluded: string[];
}

interface JumboCartResponse {
  items?: {
    skuId: string;
    name: string;
    brand?: string;
    quantity: number;
    prices?: { price?: number; totalPrice?: number };
    isMarketplace?: boolean;
  }[];
  totals?: { shipping?: unknown };
}

export function isJumboCart(data: unknown): data is JumboCartResponse {
  return !!data && typeof data === 'object' && Array.isArray((data as JumboCartResponse).items) && 'totals' in data;
}

/** Monto de un campo de despacho que puede venir como número o como objeto { value | amount | price }. */
function amountOf(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    for (const k of ['value', 'amount', 'price', 'total', 'cost']) {
      const x = (v as Record<string, unknown>)[k];
      if (typeof x === 'number') return x;
    }
  }
  return undefined;
}

export function parseJumboCart(data: JumboCartResponse): CapturedCart {
  const items = data.items ?? [];
  return {
    items: items
      .filter((i) => !i.isMarketplace && i.prices?.price !== undefined)
      .map((i) => ({
        store: 'jumbo',
        sku: i.skuId,
        name: i.name,
        brand: i.brand,
        quantity: i.quantity,
        // totalPrice incluye promociones por cantidad ("lleva 2").
        unitPrice: Math.round((i.prices!.totalPrice ?? i.prices!.price! * i.quantity) / Math.max(1, i.quantity)),
      })),
    shipping: amountOf(data.totals?.shipping),
    excluded: items.filter((i) => i.isMarketplace).map((i) => i.name),
  };
}

interface LiderLineItem {
  quantity: number;
  product?: {
    usItemId: string;
    name: string;
    brand?: string;
    sellerType?: string;
    sellerName?: string;
    seller?: { type?: string; name?: string };
  };
  priceInfo?: { itemPrice?: { value?: number }; linePrice?: { value?: number } };
}

interface LiderCart {
  lineItems: LiderLineItem[];
  priceDetails?: { fees?: unknown };
}

/**
 * Respuestas GraphQL de Lider que traen el carrito completo: la consulta `cart` y las mutaciones
 * (`updateItems`, mover desde "guardado para después", etc.) devuelven un objeto Cart en algún nivel de `data`.
 * Ojo: `getSFL` ("guardado para después") también trae `lineItems`, pero no es el carrito; se distingue
 * porque el Cart tiene `checkoutable` o `priceDetails`.
 */
export function findLiderCart(data: unknown): LiderCart | undefined {
  const find = (o: unknown, depth: number): LiderCart | undefined => {
    if (!o || typeof o !== 'object' || depth > 4) return undefined;
    if (Array.isArray((o as LiderCart).lineItems) && ('checkoutable' in o || 'priceDetails' in o)) return o as LiderCart;
    for (const v of Object.values(o)) {
      const found = find(v, depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return find((data as { data?: unknown })?.data, 0);
}

export function liderCartLines(data: unknown): LiderLineItem[] | undefined {
  return findLiderCart(data)?.lineItems;
}

function isExternalSeller(p: NonNullable<LiderLineItem['product']>): boolean {
  const type = p.sellerType ?? p.seller?.type;
  return type === 'EXTERNAL';
}

/** Despacho a domicilio dentro de priceDetails.fees (la estructura exacta varía: se busca por etiqueta). */
function liderShipping(fees: unknown): number | undefined {
  if (!Array.isArray(fees)) return undefined;
  for (const f of fees) {
    const label = String((f as Record<string, unknown>)?.label ?? (f as Record<string, unknown>)?.name ?? '');
    if (/despacho|delivery|env[ií]o/i.test(label) && !/vendedor|seller/i.test(label)) {
      return amountOf(f) ?? amountOf((f as Record<string, unknown>).value);
    }
  }
  return undefined;
}

export function parseLiderCart(cart: LiderCart | LiderLineItem[]): CapturedCart {
  const lines = Array.isArray(cart) ? cart : cart.lineItems;
  const excluded: string[] = [];
  const items = lines.flatMap((l): CartItem[] => {
    if (!l.product) return [];
    if (isExternalSeller(l.product)) {
      excluded.push(l.product.name);
      return [];
    }
    // linePrice incluye promociones por cantidad; itemPrice es el precio de lista unitario.
    const line = l.priceInfo?.linePrice?.value;
    const price = line !== undefined ? Math.round(line / Math.max(1, l.quantity)) : l.priceInfo?.itemPrice?.value;
    if (!price) return [];
    return [
      {
        store: 'lider',
        sku: l.product.usItemId,
        ean: liderIdToEan(l.product.usItemId),
        name: l.product.name,
        brand: l.product.brand,
        quantity: l.quantity,
        unitPrice: price,
      },
    ];
  });
  return { items, excluded, shipping: Array.isArray(cart) ? undefined : liderShipping(cart.priceDetails?.fees) };
}
