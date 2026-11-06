import type { QuoteSettings } from './quote';

/**
 * Valores por defecto. Jumbo Prime está verificado en jumbo.cl/prime (2026-10-28):
 * $30.000 por 6 meses, despacho gratis desde $22.000.
 * El despacho de Jumbo sin suscripción NO está verificado. Cuando la tienda muestra el despacho
 * en el carrito (con dirección elegida), la extensión usa ese valor en vez de este.
 */
export function defaultSettings(): QuoteSettings {
  return {
    shipping: {
      jumbo: { cost: 3990 },
      // Observado en un carro real (Las Condes, oct-2026): $990 aun con $139.922 en productos.
      lider: { cost: 990 },
      unimarc: { cost: 2990 },
    },
    subscriptions: [
      {
        id: 'jumbo-prime',
        store: 'jumbo',
        name: 'Jumbo Prime',
        monthlyCost: 30000 / 6,
        shipping: { cost: 3990, freeFrom: 22000 },
        // No se asume: el usuario lo marca en las opciones si ya lo tiene.
        owned: false,
      },
    ],
    maxCarts: 2,
    // Dividir en dos pedidos solo si ahorra más que esto (tiempo, dos entregas).
    extraCartPenalty: 1500,
  };
}
