import { describe, expect, it } from 'vitest';
import { quoteCart } from '../src/quote';
import { defaultSettings } from '../src/settings';
import type { CartItem, Offer } from '../src/types';

const leche: CartItem = {
  store: 'jumbo',
  sku: '6697',
  ean: '7802920777542',
  name: 'Leche Colun Entera 1 L',
  brand: 'Colun',
  quantity: 12,
  unitPrice: 1190,
};
const arroz: CartItem = {
  store: 'jumbo',
  sku: '1',
  name: 'Arroz Tucapel Grado 1 1 kg',
  brand: 'Tucapel',
  quantity: 2,
  unitPrice: 2190,
};

const liderOffers: Offer[] = [
  { store: 'lider', sku: '00780292077754', ean: '7802920777542', name: 'Leche Entera Natural Caja 1 l, 1 L', brand: 'Colun', unitPrice: 1090, available: true },
  { store: 'lider', sku: 'a', name: 'Arroz Grado 1 Tucapel Bolsa, 1 kg', brand: 'Tucapel', unitPrice: 1990, available: true },
];

describe('quoteCart', () => {
  it('cruza el carrito de Jumbo con Lider y recomienda dónde comprar', async () => {
    const quote = await quoteCart([leche, arroz], ['jumbo', 'lider'], { lider: async () => liderOffers }, defaultSettings());
    expect(quote.rows[0]!.matches.lider?.kind).toBe('ean');
    expect(quote.rows[1]!.matches.lider?.kind).toBe('name');
    // Lider: 12×1090 + 2×1990 = 17.060 + despacho 990 = 18.050
    expect(quote.singleStore.lider).toBe(18050);
    // Jumbo: 12×1190 + 2×2190 = 18.660 + 3.990 = 22.650
    expect(quote.singleStore.jumbo).toBe(22650);
    expect(quote.best!.total).toBeLessThanOrEqual(18050);
  });

  it('un error de búsqueda en una tienda no rompe la cotización', async () => {
    const quote = await quoteCart(
      [leche],
      ['jumbo', 'lider'],
      { lider: async () => { throw new Error('anti-bot'); } },
      defaultSettings(),
    );
    expect(quote.rows[0]!.errors.lider).toBe('anti-bot');
    expect(quote.best!.carts[0]!.option.store).toBe('jumbo');
  });
});
