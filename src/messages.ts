import type { CapturedCart } from './carts';
import type { HistorySummary, PurchaseRecord } from './history';
import type { Quote } from './quote';
import type { CartItem, StoreId } from './types';

export type Request =
  | { type: 'readCart'; tabId: number }
  | { type: 'searchOrigin'; store: StoreId; name: string }
  | { type: 'quote'; items: CartItem[] }
  | { type: 'cartCaptured'; store: StoreId; cart: CapturedCart }
  /** sku null = olvidar la decisión para esa clave. */
  | { type: 'setSubstitute'; key: string; sku: string | null; decision: 'accept' | 'reject' }
  | { type: 'recordPurchase'; quote: Quote }
  | { type: 'getHistory' }
  | { type: 'deletePurchase'; id: string };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

export type ReadCartResponse = Response<CapturedCart>;
export type SearchOriginResponse = Response<CartItem | null>;
export type QuoteResponse = Response<Quote>;
export type HistoryResponse = Response<{ records: PurchaseRecord[]; summary: HistorySummary }>;

export function storeFromUrl(url: string | undefined): StoreId | undefined {
  if (!url) return undefined;
  const host = new URL(url).hostname;
  if (host.endsWith('jumbo.cl')) return 'jumbo';
  if (host === 'www.lider.cl' || host === 'super.lider.cl') return 'lider';
  if (host.endsWith('unimarc.cl')) return 'unimarc';
  return undefined;
}
