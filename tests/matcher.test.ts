import { describe, expect, it } from 'vitest';
import { bestMatch } from '../src/match/matcher';
import type { CartItem, Offer } from '../src/types';

const item: CartItem = {
  store: 'jumbo',
  sku: 'j1',
  ean: '7802920000015',
  name: 'Leche Entera Colun 1 L',
  brand: 'Colun',
  quantity: 2,
  unitPrice: 1190,
};

const offer = (o: Partial<Offer>): Offer => ({
  store: 'lider',
  sku: 'x',
  name: '',
  unitPrice: 1000,
  available: true,
  ...o,
});

describe('bestMatch', () => {
  it('prefiere EAN exacto', () => {
    const m = bestMatch(item, [
      offer({ sku: 'a', name: 'Leche Entera Colun 1 L', brand: 'Colun' }),
      offer({ sku: 'b', name: 'Otra cosa', ean: '07802920000015' }),
    ]);
    expect(m?.kind).toBe('ean');
    expect(m?.offer.sku).toBe('b');
  });

  it('empareja por nombre + tamaño', () => {
    const m = bestMatch({ ...item, ean: undefined }, [
      offer({ sku: 'a', name: 'Leche Colun Entera 1 L', brand: 'Colun' }),
      offer({ sku: 'b', name: 'Leche Colun Entera 6x1 L', brand: 'Colun' }),
    ]);
    expect(m?.kind).toBe('name');
    expect(m?.offer.sku).toBe('a');
  });

  it('distinta marca queda dudosa o sin match', () => {
    const m = bestMatch({ ...item, ean: undefined }, [offer({ name: 'Leche Entera Soprole 1 L', brand: 'Soprole' })]);
    expect(m?.kind ?? 'none').not.toBe('name');
  });

  it('sin candidatos razonables no devuelve nada', () => {
    expect(bestMatch({ ...item, ean: undefined }, [offer({ name: 'Detergente líquido 3 L' })])).toBeUndefined();
  });
});

describe('marcas', () => {
  const lider = (name: string, brand: string): CartItem => ({ store: 'lider', sku: 'l', name, brand, quantity: 1, unitPrice: 1000 });

  it('marcas propias de distintas cadenas son equivalentes', () => {
    const m = bestMatch(lider('Atún Lomitos Agua Lata Drenado 104 g', 'Lider'), [
      offer({ store: 'jumbo', name: 'Atún Lomitos en Agua 104 g drenado Cuisine & Co', brand: 'Cuisine & Co' }),
    ]);
    expect(m?.kind).toBe('name');
  });

  it('"Multi Marca" (frutas y verduras) no penaliza', () => {
    const m = bestMatch(lider('Limón Malla 1 kg', 'Multi Marca'), [offer({ store: 'jumbo', name: 'Limón Malla 1 kg', brand: 'Frutas y Verduras Propias' })]);
    expect(m?.kind).toBe('name');
  });

  it('marcas comerciales distintas siguen siendo dudosas', () => {
    const m = bestMatch(lider('Vino Cabernet Sauvignon Botella 750 mL', 'Toro De Piedra'), [
      offer({ store: 'jumbo', name: 'Vino Indomita Cabernet Sauvignon 750 cc', brand: 'Indomita' }),
    ]);
    expect(m?.kind ?? 'none').not.toBe('name');
  });
});

describe('unidad vs. kilo', () => {
  const palta: CartItem = { store: 'lider', sku: 'p', name: 'Palta Hass Unidad', brand: 'Multi marca', quantity: 2, unitPrice: 1128 };
  it('por unidad no empareja con malla de 1 kg', () => {
    expect(bestMatch(palta, [offer({ store: 'jumbo', name: 'Palta Hass Malla 1 kg' })])?.kind ?? 'none').not.toBe('name');
  });
  it('por unidad no empareja con granel', () => {
    const tomate = { ...palta, name: 'Tomate Larga Vida Unidad' };
    expect(bestMatch(tomate, [offer({ store: 'jumbo', name: 'Tomate Larga Vida Granel (1 a 2 un aprox)' })])?.kind ?? 'none').not.toBe('name');
  });
  it('lechuga por unidad sí empareja', () => {
    const lechuga = { ...palta, name: 'Lechuga Española Bolsa 1 Un' };
    expect(bestMatch(lechuga, [offer({ store: 'jumbo', name: 'Lechuga Española 1 un.' })])?.kind).toBe('name');
  });
});
