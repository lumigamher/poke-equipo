/**
 * Silencio (s) tras la voz real para que el VAD (silero) cierre y entregue el trozo. Se suma tal cual a la espera
 * entre el fin real de la voz y el envío de la orden; junto con `BORRADOR_MS` (controlador) forma UN presupuesto:
 * SILENCIO_FIN_FRASE_S + ≈0,25 s (bloque de 100 ms y paso rápido, medido) + BORRADOR_MS ≈ 1,5 s. Más corto parte la
 * frase en cada respiración (la continuación sin nombre se pega, pero cada parte cuesta un paso rápido); más largo
 * alarga la espera de todas las órdenes.
 */
export const SILENCIO_FIN_FRASE_S = 0.5;

/** Voz mínima (s) para que el VAD la dé por empezada: así se detecta tarde, y a la vez, una voz que se reanuda. */
export const VOZ_MINIMA_S = 0.25;

/**
 * Tope (ms) del paso rápido de un trozo, contado desde que el segmentador lo entrega. Si el proceso aparte se cuelga,
 * el trozo se da por perdido (igual que si fallara) y se libera el aviso de "transcribiendo", que mantiene abierto el
 * borrador; sin tope, un colgado lo dejaría esperando RETENCION_MAX_MS. 8 s: en frío tardó 2,3 s y bajo carga más;
 * con 5 s se podían perder trozos legítimos.
 */
export const RAPIDO_MAX_MS = 8000;

/**
 * Tope (s) de audio que se le pasa de una vez a un transcriptor. El `maxSpeechDuration` del VAD es blando: con
 * conversación o tele de fondo entrega trozos de 35–40 s (medido con voz sintética). Cada trozo más largo que los
 * anteriores hace crecer la arena de onnxruntime, que no devuelve memoria y pide bloques cada vez más grandes; dentro
 * de un `utilityProcess` de Electron una reserva enorme que falla mata el proceso (SIGTRAP) en vez de devolver error.
 * Los trozos más largos se parten antes de transcribirlos. Whisper tampoco admite más de 30 s.
 */
export const TROZO_MAX_S = 20;
