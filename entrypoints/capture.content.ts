import { findLiderCart, isJumboCart, parseJumboCart, parseLiderCart, type CapturedCart } from '../src/carts';
import type { StoreId } from '../src/types';

/**
 * Corre en el contexto de la página (world MAIN) y escucha, sin modificarlas, las respuestas
 * de carrito que la tienda ya pide. Así no necesitamos tokens, apikeys ni consultas privadas.
 */
export default defineContentScript({
  matches: ['https://www.jumbo.cl/*', 'https://www.lider.cl/*', 'https://super.lider.cl/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const emit = (store: StoreId, cart: CapturedCart, raw: unknown) => {
      // En builds de prueba se deja la última respuesta cruda a mano para depurar desde la consola.
      if (import.meta.env.WXT_TEST_HOOK === '1') (window as unknown as Record<string, unknown>).__cotizadorRaw = raw;
      window.postMessage({ source: 'cotizador-super', store, cart }, location.origin);
    };

    const inspect = (url: string, data: unknown) => {
      // Solo el GET /cart?…: las respuestas intermedias de PATCH pueden venir parciales.
      if (/bff-jumbo\.ecomm\.cencosud\.com\/cart\?/.test(url) && isJumboCart(data)) {
        emit('jumbo', parseJumboCart(data), data);
      } else if (/\/orchestra\/.*graphql/.test(url)) {
        const cart = findLiderCart(data);
        if (cart) emit('lider', parseLiderCart(cart), data);
      }
    };
    const watched = (url: string) => /bff-jumbo\.ecomm\.cencosud\.com\/cart|\/orchestra\/.*graphql/.test(url);

    const originalFetch = window.fetch;
    window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
      const res = await originalFetch.apply(this, args);
      const input = args[0];
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (watched(url)) res.clone().json().then((d) => inspect(url, d), () => {});
      return res;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      const href = String(url);
      if (watched(href)) {
        this.addEventListener('load', () => {
          try {
            const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
            inspect(href, data);
          } catch {
            // respuesta no JSON: se ignora
          }
        });
      }
      return (originalOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof XMLHttpRequest.prototype.open;
  },
});
