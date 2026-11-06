import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findLiderCart, isJumboCart, liderCartLines, parseJumboCart, parseLiderCart } from '../src/carts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('carritos', () => {
  it('Jumbo', () => {
    const data = fixture('jumbo-cart.json');
    expect(isJumboCart(data)).toBe(true);
    expect(parseJumboCart(data)).toEqual({
      items: [{ store: 'jumbo', sku: '6697', name: 'Leche Colun Entera 1 L', brand: 'Colun', quantity: 2, unitPrice: 1190 }],
      shipping: undefined,
      excluded: [],
    });
  });

  it('Jumbo: despacho y promociones por cantidad', () => {
    const data = fixture('jumbo-cart.json');
    data.totals.shipping = { value: 2990 };
    data.items[0].prices.totalPrice = 2000; // "lleva 2 por $2.000"
    const cart = parseJumboCart(data);
    expect(cart.shipping).toBe(2990);
    expect(cart.items[0]!.unitPrice).toBe(1000);
  });

  it('Lider: precio con promoción, vendedor externo y despacho', () => {
    const cart = parseLiderCart(findLiderCart(fixture('lider-cart.json'))!);
    expect(cart.items.map((i) => [i.name, i.quantity, i.unitPrice])).toEqual([
      ['Leche Entera Natural Caja 1 L', 1, 1190],
      ['Camote en Trozos 400 g', 2, 2000], // linePrice 4.000 / 2, no el itemPrice de lista
    ]);
    expect(cart.items[0]!.ean).toBe('7802920777542');
    expect(cart.excluded).toEqual(['Vino Cabernet Sauvignon Botella 750 mL']);
    expect(cart.shipping).toBe(990);
  });

  it('Lider (mutación updateItems) y respuestas ajenas', () => {
    const cart = fixture('lider-cart.json').data.cart;
    expect(liderCartLines({ data: { updateItems: cart } })).toHaveLength(3);
    expect(liderCartLines({ data: { moveItemsToCart: { cart } } })).toHaveLength(3);
    expect(liderCartLines({ data: { search: {} } })).toBeUndefined();
    // "Guardado para después" no es el carrito.
    expect(liderCartLines({ data: { sfl: { id: 'S', totalQuantity: 0, lineItems: [], pageInfo: {} } } })).toBeUndefined();
  });
});
