/** Devuelve el objeto JSON `{...}` que empieza en `start`, respetando strings y escapes. */
export function extractBalanced(s: string, start: number): string | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let j = start; j < s.length; j++) {
    const c = s[j];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, j + 1);
  }
  return undefined;
}

/** "$1.190" → 1190 */
export function parseClp(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : undefined;
}

/** Contenido de `<script id="__NEXT_DATA__">` (sin DOMParser: el service worker no lo tiene). */
export function extractNextData(html: string): unknown {
  const m = /<script[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  return m ? JSON.parse(m[1]!) : undefined;
}
