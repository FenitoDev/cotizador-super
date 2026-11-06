import { describe, expect, it } from 'vitest';
import { substituteCandidates, substituteKey } from '../src/match/substitutes';
import { quoteCart } from '../src/quote';
import { defaultSettings } from '../src/settings';
import type { CartItem, Offer } from '../src/types';

const lider = (name: string, brand: string, unitPrice: number, quantity = 1): CartItem => ({
  store: 'lider',
  sku: name,
  name,
  brand,
  quantity,
  unitPrice,
});
const jumbo = (name: string, brand: string, unitPrice: number): Offer => ({
  store: 'jumbo',
  sku: name,
  name,
  brand,
  unitPrice,
  available: true,
});

// Casos reales del carrito de prueba (oct-2026).
describe('substituteCandidates', () => {
  it('salmón de otra marca, mismo tamaño: precio equivalente directo', () => {
    const [s] = substituteCandidates(lider('Salmón en Trozos Importado 500 g', 'Aquapuro', 8290), [
      jumbo('Salmón Trozos Congelados 500 g', 'Cuisine & Co', 10910),
      jumbo('Detergente Líquido 3 L', 'Omo', 9990),
    ]);
    expect(s?.offer.name).toBe('Salmón Trozos Congelados 500 g');
    expect(s?.equivalentPrice).toBe(10910);
  });

  it('tamaño distinto: lleva el precio al tamaño del original', () => {
    const [s] = substituteCandidates(lider('Espinaca Picada Bolsa 400 g', 'Agrosano', 1050), [
      jumbo('Espinaca Agrosano 200 g', 'Agrosano', 1790),
    ]);
    expect(s?.equivalentPrice).toBe(3580);
  });

  it('descarta tamaños muy distintos (más del doble)', () => {
    expect(substituteCandidates(lider('Atún Lomitos Agua 104 g', 'Lider', 1350), [jumbo('Atún Lomitos Agua 3 x 160 g', 'Angelmo', 4990)])).toEqual([]);
  });

  it('palta por unidad vs. malla de 1 kg: se sugiere, pero sin precio equivalente', () => {
    const [s] = substituteCandidates(lider('Palta Hass Unidad', 'Multi marca', 1128), [jumbo('Palta Hass Malla 1 kg', 'Frutas y Verduras Propias', 3690)]);
    expect(s?.offer.name).toBe('Palta Hass Malla 1 kg');
    expect(s?.equivalentPrice).toBeUndefined();
  });

  it('descarta precios absurdos (palta rellena vs. palta)', () => {
    const subs = substituteCandidates(lider('Palta Hass Unidad', 'Multi marca', 1128), [jumbo('Palta Atún 1 un.', 'Jumbo', 5490)]);
    expect(subs).toEqual([]);
  });

  it('granel: sin precio equivalente', () => {
    const [s] = substituteCandidates(lider('Tomate Larga Vida Unidad', 'Multi Marca', 583), [jumbo('Tomate Larga Vida Granel (1 a 2 un. Aprox)', 'Frutas', 1045)]);
    expect(s?.equivalentPrice).toBeUndefined();
  });

  it('gramos y mililitros se comparan (aceite en spray)', () => {
    const [s] = substituteCandidates(lider('Aceite Oliva Extra Virgen Spray Botella 198 g', 'Great Value', 6990), [
      jumbo('Aceite de Oliva Olitalia Extra Virgen Spray 200 ml', 'Olitalia', 6890),
    ]);
    expect(s?.equivalentPrice).toBe(6821);
  });

  it('singular y plural', () => {
    const [s] = substituteCandidates(lider('Mix de Frutas Bolsa 1 kg', 'Multi Marca', 2190), [jumbo('Mix Fruta Mango Frutilla Kiwi 1 kg', 'Frutos del Maipo', 4990)]);
    expect(s).toBeDefined();
  });

  it('no sugiere productos de otro tipo', () => {
    expect(substituteCandidates(lider('Filete de pangasius sin Piel 500 g', 'Lider', 4290), [jumbo('Filete de Pollo Natural 700 g', 'Super Pollo', 7060)])).toEqual([]);
  });

  it('respeta los rechazados', () => {
    const offers = [jumbo('Salmón Trozos Congelados 500 g', 'Cuisine & Co', 10910)];
    expect(substituteCandidates(lider('Salmón en Trozos 500 g', 'Aquapuro', 8290), offers, ['Salmón Trozos Congelados 500 g'])).toEqual([]);
  });
});

describe('quoteCart con sustitutos', () => {
  const salmon = lider('Salmón en Trozos Importado 500 g', 'Aquapuro', 8290);
  // Jumbo $4.000 + despacho $3.990 = $7.990 < Lider $8.290 + $990.
  const offers = [jumbo('Salmón Trozos Congelados 500 g', 'Cuisine & Co', 4000)];
  const searchers = { jumbo: async () => offers };

  it('sugiere sin aceptar: el optimizador no lo usa, pero calcula el escenario sugerido', async () => {
    const q = await quoteCart([salmon], ['jumbo', 'lider'], searchers, { ...defaultSettings(), extraCartPenalty: 0 });
    expect(q.rows[0]!.matches.jumbo?.kind).toBe('doubtful');
    expect(q.rows[0]!.substitutes.jumbo).toHaveLength(1);
    expect(q.best!.carts[0]!.option.store).toBe('lider');
    expect(q.withSuggestions!.carts[0]!.option.store).toBe('jumbo');
  });

  it('aceptado: cuenta como precio en Jumbo', async () => {
    const rules = { accepted: { [substituteKey(salmon, 'jumbo')]: offers[0]!.sku }, rejected: {} };
    const q = await quoteCart([salmon], ['jumbo', 'lider'], searchers, defaultSettings(), rules);
    expect(q.rows[0]!.matches.jumbo?.kind).toBe('substitute');
    expect(q.singleStore.jumbo).toBe(4000 + 3990);
  });
});
