# Cotizador Súper

Extensión de Chrome (Manifest V3) que toma el carrito que armaste en un supermercado chileno con delivery y lo cotiza en los otros, para decirte dónde sale más barato el total con despacho incluido.

Tiendas: **Jumbo** y **Lider**. Unimarc tiene conector de búsqueda, pero está desactivado.

## Qué hace

- **Lee tu carrito** en jumbo.cl o lider.cl, escuchando las respuestas que la propia tienda ya pide. No maneja contraseñas ni tokens.
- **Empareja productos** entre tiendas: primero por EAN y, si no hay, por nombre, marca y tamaño.
- **Calcula la mejor forma de comprar**: todo en una tienda o dividido en dos carritos, según precios, despacho y montos de envío gratis.
- **Suscripciones**: muestra cuánto sale con y sin Jumbo Prime, y desde cuántos pedidos al mes vale la pena.
- **Sustitutos**: cuando no existe el mismo producto en la otra tienda, propone parecidos con su precio equivalente; tú aceptas o rechazas.
- **Historial**: registra tus compras y muestra el ahorro acumulado.

Todo corre en tu navegador, con tu propia sesión. No hay servidor.

## Instalar

```bash
pnpm install
pnpm build
```

Después, en `chrome://extensions`: activa el **Modo de desarrollador**, haz clic en **Cargar descomprimida** y elige `.output/chrome-mv3`.

## Usar

1. Inicia sesión en jumbo.cl y lider.cl.
2. Arma tu carrito en una de las dos. En Lider, abre el carro (`lider.cl/cart`) para que la extensión lo vea.
3. Abre el panel con el ícono de la extensión, presiona **Leer carrito de la pestaña** y luego **Cotizar**.

## Desarrollo

```bash
pnpm dev            # Chrome con recarga en caliente
pnpm vitest run     # tests
pnpm compile        # chequeo de tipos
```

- `src/connectors/`: búsqueda y precios por tienda.
- `src/carts.ts`: lectura de carritos.
- `src/match/`: emparejamiento y sustitutos.
- `src/optimizer/split.ts`: división óptima del carrito (programación entera).
- `docs/endpoints.md`: cómo responde cada tienda.

## Advertencias

- Los sitios no ofrecen APIs públicas: la extensión depende de respuestas internas que pueden cambiar sin aviso.
- Lider tiene anti-bot. Si pide verificación, hay que resolverla a mano en lider.cl.
- Proyecto personal, sin relación con Jumbo, Lider ni Unimarc. Revisa los términos de uso de cada sitio antes de usarlo.
