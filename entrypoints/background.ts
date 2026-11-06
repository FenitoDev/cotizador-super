import { fetchJumboGtin, searchJumbo } from '../src/connectors/jumbo';
import { LIDER_ORIGIN, searchLider, type PageRunner } from '../src/connectors/lider';
import { searchUnimarc } from '../src/connectors/unimarc';
import { storeFromUrl, type Request } from '../src/messages';
import type { CapturedCart } from '../src/carts';
import { bestMatch } from '../src/match/matcher';
import { simplifyQuery } from '../src/match/normalize';
import { quoteCart, type QuoteSettings, type Searcher } from '../src/quote';
import { recordFromQuote, summarize } from '../src/history';
import { addPurchase, deletePurchase, loadHistory, loadSettings, loadSubstituteRules, setSubstitute } from '../src/storage';
import { ENABLED_STORES, type CartItem, type Offer, type SearchQuery, type StoreId } from '../src/types';

/** Limita la concurrencia para no gatillar los anti-bots. */
function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

const limits: Record<StoreId, ReturnType<typeof limiter>> = {
  // Jumbo no tiene anti-bot en la búsqueda; Lider sí, por eso va más lento.
  jumbo: limiter(4),
  lider: limiter(1),
  unimarc: limiter(2),
};

async function waitForLoad(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  if (tab.status === 'complete') return;
  await new Promise<void>((resolve) => {
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

/** Pestaña de Lider para ejecutar las consultas en su propio origen; si no hay, abre una en segundo plano. */
async function liderTab(): Promise<number> {
  const [existing] = await browser.tabs.query({ url: [`${LIDER_ORIGIN}/*`, 'https://super.lider.cl/*'] });
  if (existing?.id !== undefined) return existing.id;
  const tab = await browser.tabs.create({ url: LIDER_ORIGIN, active: false });
  await waitForLoad(tab.id!);
  return tab.id!;
}

const runInLiderTab: PageRunner = async (fn, args) => {
  const tabId = await liderTab();
  const [res] = await browser.scripting.executeScript({ target: { tabId }, func: fn, args });
  return res?.result as Awaited<ReturnType<typeof fn>>;
};

/** GTIN por URL de producto de Jumbo; un producto no cambia de EAN, así que se guarda en storage.local. */
async function cachedJumboGtin(url: string): Promise<string | undefined> {
  const key = `gtin:${url}`;
  const hit = (await browser.storage.local.get(key))[key] as string | undefined;
  if (hit !== undefined) return hit || undefined;
  const gtin = await fetchJumboGtin(url).catch(() => undefined);
  await browser.storage.local.set({ [key]: gtin ?? '' });
  return gtin;
}

/** Variantes de búsqueda, de la más específica a la más corta. */
function queryVariants(q: SearchQuery): string[] {
  const variants = [q.name, simplifyQuery(q.name, 4), q.brand ? `${q.brand} ${simplifyQuery(q.name, 2)}` : '', simplifyQuery(q.name, 2)];
  return [...new Set(variants.map((v) => v.trim()).filter(Boolean))];
}

/**
 * Jumbo no busca por EAN: prueba variantes del nombre, junta los candidatos y confirma el EAN
 * de los primeros en su página de producto. Se detiene apenas encuentra el mismo EAN.
 */
async function searchJumboWithGtin(query: SearchQuery): Promise<Offer[]> {
  const pool = new Map<string, Offer>();
  for (const name of queryVariants(query)) {
    const offers = (await searchJumbo({ name }).catch(() => [])).filter((o) => o.available && !pool.has(o.sku));
    offers.forEach((o) => pool.set(o.sku, o));
    if (query.ean) {
      await Promise.all(offers.slice(0, 5).map(async (o) => o.url && (o.ean = await cachedJumboGtin(o.url))));
      if (offers.some((o) => o.ean && bestMatch({ ...emptyItem, ean: query.ean, name: query.name }, [o])?.kind === 'ean')) break;
    } else if (pool.size >= 10) break;
  }
  return [...pool.values()];
}

const emptyItem: CartItem = { store: 'lider', sku: '', name: '', quantity: 1, unitPrice: 0 };

/** Lider: primero por EAN (/ip), si no, por nombre y luego por el nombre simplificado. */
async function searchLiderVariants(query: SearchQuery): Promise<Offer[]> {
  const first = await searchLider(query, runInLiderTab);
  if (first.length > 0) return first;
  const short = simplifyQuery(query.name, 4);
  return short && short !== query.name.toLowerCase() ? searchLider({ name: short }, runInLiderTab) : [];
}

/** Resultados de Lider por consulta, 30 minutos en storage.session, para no gatillar su anti-bot. */
async function cachedLider(query: SearchQuery): Promise<Offer[]> {
  const key = `lider:${query.ean ?? ''}:${query.name}`;
  const hit = (await browser.storage.session.get(key))[key] as { at: number; offers: Offer[] } | undefined;
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.offers;
  const offers = await searchLiderVariants(query);
  await browser.storage.session.set({ [key]: { at: Date.now(), offers } });
  return offers;
}

const searchers: Record<StoreId, Searcher> = {
  jumbo: (q) => limits.jumbo(() => searchJumboWithGtin(q)),
  lider: (q) => limits.lider(() => cachedLider(q)),
  unimarc: (q) => limits.unimarc(() => searchUnimarc(q)),
};

/** Modo de prueba: toma el primer resultado de la tienda de origen como si estuviera en el carrito. */
async function searchOrigin(store: StoreId, name: string): Promise<CartItem | null> {
  const [offer] = (await searchers[store]({ name })).filter((o) => o.available);
  if (!offer) return null;
  const ean = offer.ean ?? (store === 'jumbo' && offer.url ? await fetchJumboGtin(offer.url) : undefined);
  return { store, sku: offer.sku, ean, name: offer.name, brand: offer.brand, sizeText: offer.sizeText, quantity: 1, unitPrice: offer.unitPrice };
}

const CART_HINT: Record<StoreId, string> = {
  jumbo: 'Recarga cualquier página de jumbo.cl con tu sesión iniciada.',
  lider: 'Abre el carro en lider.cl (lider.cl/cart).',
  unimarc: 'Unimarc no está habilitado.',
};

async function savedCart(store: StoreId): Promise<CapturedCart | undefined> {
  const key = `cart:${store}`;
  return (await browser.storage.session.get(key))[key] as CapturedCart | undefined;
}

/** Último carrito observado en cada tienda (lo envía bridge.content.ts). */
async function readCart(tabId: number): Promise<CapturedCart> {
  const tab = await browser.tabs.get(tabId);
  const store = storeFromUrl(tab.url);
  if (!store || !ENABLED_STORES.includes(store)) throw new Error('Abre Jumbo o Lider en la pestaña activa.');
  const saved = await savedCart(store);
  if (!saved) throw new Error(`Aún no veo tu carrito. ${CART_HINT[store]}`);
  if (saved.items.length === 0) throw new Error('El carrito está vacío.');
  return saved;
}

/** Ajustes + el despacho real que mostró cada tienda en su carrito (si ya hay dirección elegida). */
async function effectiveSettings(): Promise<QuoteSettings> {
  const settings = await loadSettings();
  for (const store of ENABLED_STORES) {
    const observed = (await savedCart(store))?.shipping;
    if (observed !== undefined && observed > 0) {
      settings.shipping[store] = { ...settings.shipping[store], cost: observed };
    }
  }
  return settings;
}

/** El carrito de Jumbo no trae EAN: lo busca por nombre, ubica el mismo SKU y lee el GTIN de su página. */
async function enrichJumboEan(item: CartItem): Promise<CartItem> {
  if (item.store !== 'jumbo' || item.ean) return item;
  const offers = await searchJumbo({ name: item.name }).catch(() => []);
  const same = offers.find((o) => o.sku === item.sku);
  const ean = same?.url ? await fetchJumboGtin(same.url).catch(() => undefined) : undefined;
  return { ...item, ean };
}

async function handle(msg: Request): Promise<unknown> {
  switch (msg.type) {
    case 'cartCaptured': {
      const prev = await savedCart(msg.store);
      // El despacho solo aparece en algunas respuestas: se conserva el último conocido.
      const cart: CapturedCart = { ...msg.cart, shipping: msg.cart.shipping ?? prev?.shipping };
      await browser.storage.session.set({ [`cart:${msg.store}`]: { ...cart, at: Date.now() } });
      return null;
    }
    case 'readCart':
      return readCart(msg.tabId);
    case 'searchOrigin':
      return searchOrigin(msg.store, msg.name);
    case 'quote': {
      const items = await Promise.all(msg.items.map((i) => limits.jumbo(() => enrichJumboEan(i))));
      return quoteCart(items, ENABLED_STORES, searchers, await effectiveSettings(), await loadSubstituteRules());
    }
    case 'setSubstitute': {
      return setSubstitute(msg.key, msg.sku, msg.decision);
    }
    case 'recordPurchase': {
      const record = recordFromQuote(msg.quote);
      if (!record) throw new Error('No hay con qué comparar: falta el total de la tienda de origen.');
      const records = await addPurchase(record);
      return { records, summary: summarize(records) };
    }
    case 'getHistory': {
      const records = await loadHistory();
      return { records, summary: summarize(records) };
    }
    case 'deletePurchase': {
      const records = await deletePurchase(msg.id);
      return { records, summary: summarize(records) };
    }
  }
}

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

  browser.runtime.onMessage.addListener((msg: Request, sender, sendResponse) => {
    // Modo de prueba: tabId -1 = la pestaña que envía el mensaje.
    if (msg.type === 'readCart' && msg.tabId === -1 && sender.tab?.id !== undefined) msg = { ...msg, tabId: sender.tab.id };
    handle(msg).then(
      (data) => sendResponse({ ok: true, data }),
      (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true;
  });
});
