import type { Offer, SearchQuery } from '../types';
import { extractBalanced } from './text';

export const JUMBO_ORIGIN = 'https://www.jumbo.cl';

interface JumboItem {
  skuId: string;
  name: string;
  price: number;
  listPrice?: number;
  stock: boolean;
  images?: string[];
}

interface JumboProduct {
  productId: string;
  slug: string;
  brand?: string;
  items: JumboItem[];
}

/** Junta los fragmentos `self.__next_f.push([1,"..."])` del HTML (payload RSC de Next.js). */
export function decodeRsc(html: string): string {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let out = '';
  for (const m of html.matchAll(re)) out += JSON.parse(m[1]!) as string;
  return out;
}

/** Extrae los productos de la página de búsqueda de Jumbo (renderizada en servidor). */
export function parseJumboSearch(html: string): Offer[] {
  const rsc = decodeRsc(html);
  const offers: Offer[] = [];
  const seen = new Set<string>();
  let pos = 0;
  for (;;) {
    const i = rsc.indexOf('{"productId":', pos);
    if (i < 0) break;
    pos = i + 1;
    const raw = extractBalanced(rsc, i);
    if (!raw) continue;
    let product: JumboProduct;
    try {
      product = JSON.parse(raw);
    } catch {
      continue;
    }
    for (const item of product.items ?? []) {
      if (seen.has(item.skuId)) continue;
      seen.add(item.skuId);
      offers.push({
        store: 'jumbo',
        sku: item.skuId,
        name: item.name,
        brand: product.brand,
        unitPrice: item.price,
        available: item.stock,
        url: `${JUMBO_ORIGIN}/${product.slug}/p`,
        imageUrl: item.images?.[0],
      });
    }
  }
  return offers;
}

/** EAN desde el JSON-LD de la página de producto de Jumbo. */
export function parseJumboProductGtin(html: string): string | undefined {
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(m[1]!);
      for (const node of Array.isArray(data) ? data : [data]) {
        if (node?.['@type'] === 'Product' && node.gtin) return String(node.gtin);
      }
    } catch {
      // JSON-LD inválido: se ignora
    }
  }
  return undefined;
}

export async function searchJumbo(query: SearchQuery): Promise<Offer[]> {
  const res = await fetch(`${JUMBO_ORIGIN}/busqueda?ft=${encodeURIComponent(query.name)}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`Jumbo search ${res.status}`);
  return parseJumboSearch(await res.text());
}

export async function fetchJumboGtin(productUrl: string): Promise<string | undefined> {
  const res = await fetch(productUrl, { credentials: 'include' });
  return res.ok ? parseJumboProductGtin(await res.text()) : undefined;
}
