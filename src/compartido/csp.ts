/**
 * Política de seguridad de contenido (CSP) del renderer. La inserta `electron.vite.config.ts` en el HTML.
 *
 * Qué usa de verdad el renderer (revisado en el código):
 * - Scripts: solo su propio bundle y el worklet de captura de audio (`captura-worklet.js`), ambos del mismo origen.
 * - Estilos: su hoja CSS y los atributos `style={{…}}` de React (posiciones, transformaciones), que exigen 'unsafe-inline'.
 * - Imágenes y fondos: hojas de sprites y efectos por el esquema `poke://assets/…` (ver src/main/recursos.ts).
 * - Audio: los gritos, `new Audio("poke://assets/…/grito.ogg")`. El resto del sonido llega ya decodificado por IPC.
 * - Red: ninguna (todo pasa por IPC con main). Sin data:, blob:, fuentes web, iframes, eval ni formularios.
 *
 * En desarrollo (servidor de Vite) hace falta además: un script en línea (el preámbulo de react-refresh), y la
 * conexión http/ws con el servidor de desarrollo para la recarga en caliente.
 */
export function politicaCsp(opciones: { dev: boolean }): string {
  const { dev } = opciones;
  const directivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "poke:"],
    "media-src": ["'self'", "poke:"],
    "connect-src": dev
      ? ["'self'", "http://localhost:*", "ws://localhost:*", "http://127.0.0.1:*", "ws://127.0.0.1:*"]
      : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'none'"],
    "frame-src": ["'none'"],
  };
  return Object.entries(directivas)
    .map(([nombre, valores]) => `${nombre} ${valores.join(" ")}`)
    .join("; ");
}
