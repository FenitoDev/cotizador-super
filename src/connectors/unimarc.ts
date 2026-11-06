import type { Offer, SearchQuery } from '../types';
import { parseClp } from './text';

export const UNIMARC_BFF = 'https://bff-unimarc-ecommerce.unimarc.cl';

interface UnimarcProduct {
  price?: { price?: string; listPrice?: string; availableQuantity?: number };
  item?: {
    sku: string;
    ean?: string;
    name: string;
    brand?: string;
    netContent?: string;
    images?: string[];
    /** Ruta de la página de producto, ej. "/leche-entera-natural-colun-sin-tapa-1-l-2/p". */
    slug?: string;
  };
}

interface UnimarcSearchResponse {
  availableProducts?: UnimarcProduct[];
  notAvailableProducts?: UnimarcProduct[];
}

export function parseUnimarcSearch(data: UnimarcSearchResponse): Offer[] {
  const toOffer = (p: UnimarcProduct, available: boolean): Offer[] => {
    const price = parseClp(p.price?.price);
    if (!p.item || price === undefined) return [];
    return [
      {
        store: 'unimarc',
        sku: p.item.sku,
        ean: p.item.ean || undefined,
        name: p.item.name,
        brand: p.item.brand,
        sizeText: p.item.netContent,
        unitPrice: price,
        available: available && (p.price?.availableQuantity ?? 1) > 0,
        url: p.item.slug ? `https://www.unimarc.cl${p.item.slug}` : undefined,
        imageUrl: p.item.images?.[0],
      },
    ];
  };
  return [
    ...(data.availableProducts ?? []).flatMap((p) => toOffer(p, true)),
    ...(data.notAvailableProducts ?? []).flatMap((p) => toOffer(p, false)),
  ];
}

export async function searchUnimarc(query: SearchQuery, size = 20): Promise<Offer[]> {
  const res = await fetch(`${UNIMARC_BFF}/catalog/product/search`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', source: 'web', version: '1.0.0' },
    body: JSON.stringify({
      from: '0',
      to: String(size - 1),
      searching: query.ean ?? query.name,
      promotionsOnly: false,
      orderBy: '',
      userTriggered: true,
    }),
  });
  if (!res.ok) throw new Error(`Unimarc search ${res.status}`);
  return parseUnimarcSearch(await res.json());
}
