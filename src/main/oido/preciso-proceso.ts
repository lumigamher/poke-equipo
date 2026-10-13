/**
 * Proceso aparte (`utilityProcess`) que carga el modelo preciso una sola vez y transcribe lo que le llega,
 * de una petición a la vez y en orden. Recibe `{ id, muestras }` y contesta `{ id, texto, computoMs }` o
 * `{ id, error }`. Así el paso lento (Whisper) no bloquea el hilo principal de la app.
 */
import { crearTranscriptor } from "./sherpa";
import { TROZO_MAX_S } from "./tiempos-voz";
import type { ModeloTranscriptor } from "./transcriptor";

const argumento = (nombre: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);

const puerto = process.parentPort;
const modelo = argumento("modelo") as ModeloTranscriptor | undefined;
const dirModelos = argumento("modelos");
if (!puerto || !modelo || !dirModelos)
  throw new Error("preciso-proceso: faltan el puerto, el modelo o la carpeta");

const transcriptor = crearTranscriptor(modelo, dirModelos);
// Se calienta con un segundo de silencio para que la primera frase real no pague la puesta en marcha.
transcriptor.transcribir(new Float32Array(16000));

puerto.on("message", (evento) => {
  const { id, muestras } = (evento.data ?? {}) as { id?: unknown; muestras?: unknown };
  if (typeof id !== "number") return;
  try {
    if (!(muestras instanceof Float32Array)) throw new Error("muestras inválidas");
    // Main ya parte los trozos largos; si alguno se cuela, se rechaza antes de que la arena de onnxruntime lo pague.
    if (muestras.length > TROZO_MAX_S * 16000) throw new Error("trozo demasiado largo");
    // Copia propia: no se depende de que el buffer recibido siga siendo válido.
    const copia = Float32Array.from(muestras);
    const t0 = performance.now();
    const texto = transcriptor.transcribir(copia);
    puerto.postMessage({ id, texto, computoMs: Math.round(performance.now() - t0) });
  } catch (e) {
    puerto.postMessage({ id, error: e instanceof Error ? e.message : String(e) });
  }
});
