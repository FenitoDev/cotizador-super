import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseJumboProductGtin, parseJumboSearch } from '../src/connectors/jumbo';
import { eanToLiderId, liderIdToEan, parseLiderProduct, parseLiderSearch } from '../src/connectors/lider';
import { extractBalanced, extractNextData, parseClp } from '../src/connectors/text';
import { parseUnimarcSearch } from '../src/connectors/unimarc';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('text helpers', () => {
  it('parseClp', () => {
    expect(parseClp('$1.190')).toBe(1190);
    expect(parseClp('')).toBeUndefined();
  });
  it('extractBalanced respeta llaves dentro de strings', () => {
    const s = 'x{"a":"}{","b":{"c":1}}y';
    expect(extractBalanced(s, 1)).toBe('{"a":"}{","b":{"c":1}}');
  });
  it('extractNextData tolera atributos en cualquier orden', () => {
    expect(extractNextData('<script type="application/json" id="__NEXT_DATA__" nonce="x">{"a":1}</script>')).toEqual({ a: 1 });
  });
});

describe('Jumbo', () => {
  it('parsea la búsqueda desde el payload RSC', () => {
    const offers = parseJumboSearch(fixture('jumbo-search.html'));
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({
      store: 'jumbo',
      sku: '6697',
      name: 'Leche Colun Entera 1 L',
      brand: 'Colun',
      unitPrice: 1190,
      available: true,
      url: 'https://www.jumbo.cl/leche-entera-colun-caja-1-l-natural/p',
    });
  });
  it('lee el GTIN de la página de producto', () => {
    expect(parseJumboProductGtin(fixture('jumbo-product.html'))).toBe('7802920777542');
  });
});

describe('Lider', () => {
  it('usItemId ↔ EAN', () => {
    expect(liderIdToEan('00780292077754')).toBe('7802920777542');
    expect(eanToLiderId('7802920777542')).toBe('00780292077754');
    // Pesables (prefijo GS1 2x): código interno, no EAN.
    expect(liderIdToEan('00200001000000')).toBeUndefined();
  });
  it('parsea la búsqueda e ignora vendedores externos (marketplace)', () => {
    const offers = parseLiderSearch(JSON.parse(fixture('lider-search.json')));
    expect(offers.map((o) => o.sku)).toEqual(['00780292077754', '00780292001064']);
    expect(offers[0]).toMatchObject({ ean: '7802920777542', unitPrice: 1190, available: true });
    expect(offers[1]!.available).toBe(false);
  });
  it('parsea la página de producto', () => {
    expect(parseLiderProduct(JSON.parse(fixture('lider-product.json')))).toMatchObject({
      sku: '00780292077754',
      ean: '7802920777542',
      unitPrice: 1190,
      available: true,
    });
  });
});

describe('Unimarc', () => {
  it('parsea disponibles y no disponibles', () => {
    const offers = parseUnimarcSearch(JSON.parse(fixture('unimarc-search.json')));
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({
      store: 'unimarc',
      ean: '7802920777542',
      unitPrice: 1090,
      sizeText: '1 litro',
      available: true,
      url: 'https://www.unimarc.cl/leche-entera-natural-colun-sin-tapa-1-l-2/p',
    });
    expect(offers[1]!.available).toBe(false);
  });
});
