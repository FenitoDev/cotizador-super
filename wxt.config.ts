import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Cotizador Súper',
    description: 'Compara tu carrito de supermercado entre tiendas, con despacho y suscripciones.',
    permissions: ['storage', 'sidePanel', 'scripting', 'tabs'],
    host_permissions: [
      'https://www.jumbo.cl/*',
      'https://be-reg-groceries-bff-jumbo.ecomm.cencosud.com/*',
      'https://www.lider.cl/*',
      'https://super.lider.cl/*',
      'https://www.unimarc.cl/*',
      'https://bff-unimarc-ecommerce.unimarc.cl/*',
    ],
    action: { default_title: 'Cotizador Súper' },
  },
});
