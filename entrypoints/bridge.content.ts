import type { Request } from '../src/messages';

/** Mundo aislado: reenvía al service worker los carritos que capture.content.ts observa en la página. */
export default defineContentScript({
  matches: ['https://www.jumbo.cl/*', 'https://www.lider.cl/*', 'https://super.lider.cl/*'],
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.data?.source !== 'cotizador-super') return;
      const msg: Request = { type: 'cartCaptured', store: e.data.store, cart: e.data.cart };
      browser.runtime.sendMessage(msg).catch(() => {});
    });

    // Solo en builds de prueba (WXT_TEST_HOOK=1): permite manejar la extensión desde la consola de la página.
    if (import.meta.env.WXT_TEST_HOOK === '1') {
      window.addEventListener('message', async (e) => {
        if (e.source !== window || e.data?.source !== 'cotizador-super-test') return;
        const response = await browser.runtime.sendMessage(e.data.request as Request);
        window.postMessage({ source: 'cotizador-super-test-result', id: e.data.id, response }, location.origin);
      });
    }
  },
});
