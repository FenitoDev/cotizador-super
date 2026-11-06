import { describe, expect, it } from 'vitest';
import { jaccard, nameTokens, parseSize, pricePerUnit, simplifyQuery } from '../src/match/normalize';

describe('parseSize', () => {
  it.each([
    ['Leche Entera Colun 1 L', { amount: 1000, unit: 'ml' }],
    ['Leche Soprole 6x1 L', { amount: 6000, unit: 'ml' }],
    ['Yogurt pack 4 x 120 g', { amount: 480, unit: 'g' }],
    ['Arroz Grado 2 1,5 kg', { amount: 1500, unit: 'g' }],
    ['Bebida 591cc', { amount: 591, unit: 'ml' }],
    ['Huevos 12 unidades', { amount: 12, unit: 'un' }],
  ])('%s', (text, expected) => {
    expect(parseSize(text)).toEqual(expected);
  });

  it('sin tamaño', () => expect(parseSize('Pan amasado')).toBeUndefined());
});

describe('pricePerUnit', () => {
  it('precio por litro', () => expect(pricePerUnit(1190, parseSize('1 L'))).toBe(1190));
  it('precio por kg', () => expect(pricePerUnit(990, parseSize('500 g'))).toBe(1980));
});

describe('nameTokens / jaccard', () => {
  it('ignora tildes, tamaños y stopwords', () => {
    expect([...nameTokens('Leche Entera Colún 1 L')]).toEqual(['leche', 'entera', 'colun']);
  });
  it('nombres equivalentes puntúan alto', () => {
    expect(jaccard(nameTokens('Leche Entera Colun 1L'), nameTokens('Leche Colun Entera 1 L'))).toBe(1);
  });
});

describe('simplifyQuery', () => {
  it.each([
    ['Tomate Larga Vida Unidad', 'tomate larga vida'],
    ['Champiñones Blanco Bandeja', 'champinones blanco'],
    ['Atún Lomitos Agua Lata Drenado 104 g - Neto 1', 'atun lomitos agua'],
    ['Papa Baby Bolsa 1 kg', 'papa baby'],
  ])('%s', (text, expected) => expect(simplifyQuery(text)).toBe(expected));
});
