import type { Offer, SearchQuery } from '../types';
import { extractNextData, parseClp } from './text';

/** Con sesión iniciada, super.lider.cl redirige a www.lider.cl (búsqueda unificada). */
export const LIDER_ORIGIN = 'https://www.lider.cl';

interface LiderItem {
  usItemId: string;
  name: string;
  brand?: string;
  sellerType?: string;
  canonicalUrl?: string;
  isOutOfStock?: boolean;
  imageInfo?: { thumbnailUrl?: string };
  priceInfo?: { linePrice?: string; itemPrice?: string };
}

interface LiderNextData {
  props?: { pageProps?: { initialData?: { searchResult?: { itemStacks?: { items?: LiderItem[] }[] } } } };
}

/**
 * Lider usa como `usItemId` el EAN-13 sin dígito verificador, con ceros a la izquierda hasta 14:
 * EAN 7802920777542 → usItemId 00780292077754. Devuelve el EAN completo.
 */
export function liderIdToEan(usItemId: string): string | undefined {
  const body = usItemId.replace(/^0+/, '');
  if (!/^\d{11,12}$/.test(body)) return undefined;
  // Prefijos GS1 20-29: códigos internos de la tienda (pesables como tomate o palta), no EAN reales.
  if (body.length === 12 && body.startsWith('2')) return undefined;
  const digits = body.padStart(12, '0');
  const sum = [...digits].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return digits + ((10 - (sum % 10)) % 10);
}

export function parseLiderSearch(nextData: unknown): Offer[] {
  const stacks = (nextData as LiderNextData)?.props?.pageProps?.initialData?.searchResult?.itemStacks ?? [];
  return stacks
    .flatMap((s) => s.items ?? [])
    .filter((i) => i.usItemId && i.sellerType !== 'EXTERNAL')
    .flatMap((i): Offer[] => {
      const price = parseClp(i.priceInfo?.linePrice) ?? parseClp(i.priceInfo?.itemPrice);
      if (price === undefined) return [];
      return [
        {
          store: 'lider',
          sku: i.usItemId,
          ean: liderIdToEan(i.usItemId),
          name: i.name,
          brand: i.brand,
          unitPrice: price,
          available: !i.isOutOfStock,
          url: i.canonicalUrl ? LIDER_ORIGIN + i.canonicalUrl : undefined,
          imageUrl: i.imageInfo?.thumbnailUrl,
        },
      ];
    });
}

/** Inverso de liderIdToEan: EAN-13 → usItemId de Lider. */
export function eanToLiderId(ean: string): string {
  return ean.replace(/\D/g, '').slice(0, -1).padStart(14, '0');
}

interface LiderProductNextData {
  props?: {
    pageProps?: {
      initialData?: {
        data?: {
          product?: {
            usItemId: string;
            name: string;
            brand?: string;
            availabilityStatus?: string;
            canonicalUrl?: string;
            priceInfo?: { currentPrice?: { price?: number } };
          };
        };
      };
    };
  };
}

/** Página de producto /ip/{usItemId}: precio actual y stock. */
export function parseLiderProduct(nextData: unknown): Offer | undefined {
  const p = (nextData as LiderProductNextData)?.props?.pageProps?.initialData?.data?.product;
  const price = p?.priceInfo?.currentPrice?.price;
  if (!p || price === undefined) return undefined;
  return {
    store: 'lider',
    sku: p.usItemId,
    ean: liderIdToEan(p.usItemId),
    name: p.name,
    brand: p.brand,
    unitPrice: price,
    available: p.availabilityStatus === 'IN_STOCK',
    url: `${LIDER_ORIGIN}/ip/${p.usItemId}`,
  };
}

export function parseLiderSearchHtml(html: string): Offer[] {
  return parseLiderSearch(extractNextData(html));
}

/**
 * Se ejecuta DENTRO de una pestaña de super.lider.cl (chrome.scripting.executeScript):
 * Lider bloquea con anti-bot las peticiones que no salen de su propio origen.
 * Debe ser autocontenida: no puede usar imports.
 */
export async function liderFetchNextDataInPage(path: string): Promise<string | null> {
  const res = await fetch(path, { credentials: 'include' });
  if (res.status === 404) return null;
  const html = await res.text();
  // Anti-bot (PerimeterX): no se puede ni se debe resolver automáticamente; se avisa al usuario.
  if (/Robot o humano|Robot or human|px-captcha/i.test(html)) {
    throw new Error('Lider pidió verificación anti-bot: abre lider.cl, confírmala y vuelve a cotizar.');
  }
  const m = /<script[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error(`Lider: sin __NEXT_DATA__ (status ${res.status})`);
  return m[1]!;
}

export type PageRunner = <A extends unknown[], R>(fn: (...args: A) => Promise<R>, args: A) => Promise<R>;

export async function searchLider(query: SearchQuery, runInLiderTab: PageRunner): Promise<Offer[]> {
  if (query.ean) {
    const json = await runInLiderTab(liderFetchNextDataInPage, [`/ip/${eanToLiderId(query.ean)}`]);
    const offer = json ? parseLiderProduct(JSON.parse(json)) : undefined;
    if (offer) return [offer];
  }
  const json = await runInLiderTab(liderFetchNextDataInPage, [`/search?q=${encodeURIComponent(query.name)}`]);
  return json ? parseLiderSearch(JSON.parse(json)) : [];
}
