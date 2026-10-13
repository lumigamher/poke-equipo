/** Qué es una entrada del registro en vivo: lo que dice, lo que piensa o una acción en palabras. */
export type TipoEntrada = "texto" | "pensando" | "accion" | "ayudante";

export interface EntradaVivo {
  id: number;
  tipo: TipoEntrada;
  texto: string;
}

/** Lo que viaja a la burbuja: las entradas que se conservan y si se descartaron otras más viejas. */
export interface VistaRegistro {
  entradas: EntradaVivo[];
  omitido: boolean;
}

/** Topes que mantienen acotados la memoria y lo que cruza el IPC: por cantidad, por entrada y en total (caracteres). */
export const MAX_ENTRADAS = 150;
export const MAX_BYTES_ENTRADA = 8000;
export const MAX_BYTES_REGISTRO = 30000;

/**
 * Lo que el Pokémon hace en la tarea en curso, completo y en orden. Un texto que se va escribiendo llega muchas veces
 * con el mismo `clave` y el texto acumulado: se reemplaza, no se duplica. Al pasar los topes se descartan las
 * entradas más viejas (nunca la última) y queda la marca `omitido`.
 */
export class RegistroVivo {
  private entradas: EntradaVivo[] = [];
  private porClave = new Map<string, EntradaVivo>();
  private siguiente = 1;
  private omitido = false;
  /** La última vista entregada: se reusa mientras nada cambie, porque se pide con cada publicación del Pokémon. */
  private cache: VistaRegistro | null = null;

  /** Pone (o reemplaza) el texto acumulado de la entrada `clave`. Un texto vacío no crea nada. */
  poner(clave: string, tipo: Exclude<TipoEntrada, "accion">, texto: string): void {
    if (texto.trim() === "") return;
    this.cache = null;
    const recortado = recortarPorElPrincipio(texto);
    const previa = this.porClave.get(clave);
    if (previa) {
      previa.texto = recortado;
    } else {
      const nueva = { id: this.siguiente++, tipo, texto: recortado };
      this.entradas.push(nueva);
      this.porClave.set(clave, nueva);
    }
    this.acotar();
  }

  /** Una acción ya dicha en palabras: siempre entrada nueva. */
  accion(texto: string): void {
    if (texto.trim() === "") return;
    this.cache = null;
    this.entradas.push({ id: this.siguiente++, tipo: "accion", texto: recortarPorElPrincipio(texto) });
    this.acotar();
  }

  /** Quita el último texto si es la respuesta final (que ya se muestra aparte), para no repetirla. */
  quitarUltimoTexto(respuesta: string): void {
    const ultima = this.entradas.at(-1);
    if (ultima?.tipo !== "texto" || !coincide(ultima.texto, respuesta.trim())) return;
    this.cache = null;
    this.entradas.pop();
    for (const [k, e] of this.porClave) if (e === ultima) this.porClave.delete(k);
  }

  limpiar(): void {
    this.cache = null;
    this.entradas = [];
    this.porClave.clear();
    this.omitido = false;
  }

  get vacio(): boolean {
    return this.entradas.length === 0;
  }

  /** Una instantánea: lo que siga entrando al registro no la cambia; no se debe modificar. */
  vista(): VistaRegistro {
    this.cache ??= { entradas: this.entradas.map((e) => ({ ...e })), omitido: this.omitido };
    return this.cache;
  }

  private acotar(): void {
    let total = this.entradas.reduce((n, e) => n + e.texto.length, 0);
    while (this.entradas.length > 1 && (this.entradas.length > MAX_ENTRADAS || total > MAX_BYTES_REGISTRO)) {
      const vieja = this.entradas.shift() as EntradaVivo;
      total -= vieja.texto.length;
      this.omitido = true;
      for (const [k, e] of this.porClave) if (e === vieja) this.porClave.delete(k);
    }
  }
}

function recortarPorElPrincipio(texto: string): string {
  if (texto.length <= MAX_BYTES_ENTRADA) return texto;
  let desde = texto.length - MAX_BYTES_ENTRADA + 1;
  // No empezar a media pareja de sustitución (emoji): quedaría un «�».
  const c = texto.charCodeAt(desde);
  if (c >= 0xdc00 && c <= 0xdfff) desde += 1;
  return `…${texto.slice(desde)}`;
}

/** ¿La entrada es esta respuesta? Una entrada recortada por el principio («…») es la cola de la respuesta. */
function coincide(entrada: string, respuesta: string): boolean {
  const e = entrada.trim();
  return e === respuesta || (e.startsWith("…") && respuesta.endsWith(e.slice(1)));
}
