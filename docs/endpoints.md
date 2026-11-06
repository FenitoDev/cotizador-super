# Endpoints observados (Fase 0, 2026-10-28)

Ninguno es una API pública documentada: pueden cambiar sin aviso. Cada parser tiene fixtures en `tests/fixtures/`.

## Jumbo (www.jumbo.cl)
- Frontend Next.js (App Router, RSC). Catálogo e imágenes en VTEX, pero `/api/checkout/pub/*` y `/api/catalog_system/*` devuelven **404**.
- **Búsqueda:** `GET https://www.jumbo.cl/busqueda?ft=<texto>`. Es HTML renderizado en servidor y funciona sin sesión, incluso con curl.
  - Los productos vienen en el payload RSC (`self.__next_f.push([1,"..."])`), en objetos `{"productId":…, "slug", "brand", "items":[{skuId, name, price, listPrice, stock, ppumPrice, measurementUnitUn}]}`.
  - También trae un JSON-LD `ItemList` con nombre, marca, precio y disponibilidad, pero sin sku ni EAN.
  - **No acepta buscar por EAN** (devuelve 404).
- **Producto:** `GET https://www.jumbo.cl/<slug>/p`. El JSON-LD `Product` trae `sku` y **`gtin` (EAN-13)**.
- **Carrito:** BFF `https://be-reg-groceries-bff-jumbo.ecomm.cencosud.com/cart?store=<jumboclj512>&simulationTotals=true`.
  - La página lo pide en cada carga, con los headers `apikey` (pública, por servicio, en el bundle JS), `Authorization: Bearer <localStorage.sessionDataToken>`, `x-client-platform: web`, `x-client-version` y `x-trace-id`.
  - **La extensión no lo llama: escucha la respuesta** (`entrypoints/capture.content.ts`, world MAIN).
  - Respuesta: `items[] {skuId, productId, name, brand, quantity, prices{price, listPrice, totalPrice}, isMarketplace}` y `totals {subTotal, total, shipping}`. `shipping` vale `null` si no hay dirección elegida.
  - Solo se usa el `GET /cart?…`: la respuesta de `PATCH /cart/items` puede venir parcial.
- Parser: `src/connectors/jumbo.ts`.

## Lider (super.lider.cl)
- Plataforma Walmart Glass (Next.js pages, `__NEXT_DATA__`). `www.lider.cl` es "Mundo Lider" (marketplace); el supermercado está en **super.lider.cl**.
- **Anti-bot:** una petición con curl recibe "Robot or human?". Un `fetch` **desde una pestaña de super.lider.cl** funciona (200). Por eso las consultas se ejecutan con `chrome.scripting.executeScript` en una pestaña de Lider.
- **Búsqueda:** `GET /search?q=<texto>`. El HTML trae `__NEXT_DATA__`, con los productos en `props.pageProps.initialData.searchResult.itemStacks[].items[]` (`usItemId`, `name`, `brand`, `sellerType`, `priceInfo.linePrice` como "$1.190", `isOutOfStock`).
  - `sellerType: "EXTERNAL"` indica un producto de marketplace, no del supermercado, y se ignora.
  - Buscar por EAN no devuelve resultados.
- **Producto:** `GET /ip/<usItemId>`. El precio está en `props.pageProps.initialData.data.product.priceInfo.currentPrice.price` (número) y el stock en `availabilityStatus` ("IN_STOCK").
- **`usItemId` = EAN-13 sin dígito verificador, con relleno de ceros a 14 dígitos.** Por ejemplo, EAN 7802920777542 → `00780292077754`. Así un EAN conocido permite consultar directo `/ip/…`.
- **Con sesión iniciada, super.lider.cl redirige a www.lider.cl.** La búsqueda (`/search`) y las páginas de producto (`/ip/…`) funcionan igual ahí; los resultados de marketplace se filtran con `sellerType: "EXTERNAL"`.
- **Carrito:** `POST /orchestra/cartxo/graphql` (Walmart Glass), con consultas de 20 KB y muchos headers `x-o-*`. Una consulta propia mínima devolvió 400, así que **la extensión escucha las respuestas** en vez de llamarlas.
  - El objeto Cart (con `checkoutable` y `priceDetails`) aparece en `data.cart` (al cargar /cart) y en mutaciones como `data.updateItems`.
  - **Ojo:** `getSFL` ("Guardado para después") también trae `lineItems`, pero no es el carrito.
  - `lineItems[] {quantity, product{usItemId, name, brand, sellerType, sellerDisplayName}, priceInfo{itemPrice, linePrice, wasPrice}}`.
  - Despacho: `priceDetails.fees[]`, con `key: "DELIVERY_FEE"` (label "Delivery from store", por ejemplo $990). El envío del vendedor externo viene aparte, con `key: "SHIPPING_PRICE"`.
  - IDs de pesables (prefijo GS1 2x, ej. `00200001000000`) no son EAN.
- Parser: `src/connectors/lider.ts`, `src/carts.ts`.

## Unimarc (www.unimarc.cl)
- Next.js + BFF propio; catálogo en VTEX (`unimarc.vtexassets.com`). Si se pide con curl, Akamai responde **403**.
- **Búsqueda:** `POST https://bff-unimarc-ecommerce.unimarc.cl/catalog/product/search`
  - Headers: `Content-Type: application/json`, `source: web`, `version: 1.0.0`. No requiere sesión.
  - Body: `{"from":"0","to":"19","searching":"<texto o EAN>","promotionsOnly":false,"orderBy":"","userTriggered":true}`.
  - Respuesta: `availableProducts[]` y `notAvailableProducts[]`, cada uno con `{price:{price:"$1.090", listPrice, availableQuantity}, item:{sku, ean, name, brand, netContent, slug, images}}`.
  - **Acepta buscar por EAN** y devuelve el producto exacto.
- Carrito: PENDIENTE (requiere sesión).
- Parser: `src/connectors/unimarc.ts`.

## Ejemplo de comparación (leche Colun entera 1 L, EAN 7802920777542)
| Tienda | Precio |
|---|---|
| Jumbo | $1.190 |
| Lider | $1.190 |
| Unimarc | $1.090 |
