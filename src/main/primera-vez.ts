import { modeloValido } from "@compartido/modelos";
import type { DatosNuevos } from "./equipo/equipo";

/** Lo que el renderer le dice a main desde el laboratorio. */
/** `modelo`: el que la persona marcó en el laboratorio (opcional; si no vale o no viene, se usa el de su tipo). */
export type RespuestaLab =
  | { tipo: "elegida"; especie: number; nombre?: string; modelo?: string }
  | { tipo: "salir" };

/** Lo que main le pide al laboratorio: abrirse, volver a la elección (se canceló la carpeta) o cerrarse. */
export type OrdenLab = { tipo: "abrir" } | { tipo: "volver" } | { tipo: "cerrar" };

export interface DepsPrimeraVez {
  /** Los Pokémon que se ofrecen; solo estos se aceptan (lo que llega por IPC no se cree). */
  iniciales: { especie: number; nombre: string }[];
  mostrar(orden: OrdenLab): void;
  /** La próxima cosa que diga el laboratorio. */
  esperar(): Promise<RespuestaLab>;
  elegirCarpeta(titulo: string): Promise<string | null>;
  /** Voz y velocidad de la especie (nadie más en pantalla todavía). */
  datosDe(especie: number): { voz: string; velocidad: number };
  /**
   * El nombre propio ya validado (forma, palabras de mando, choques por sonido), o null si no vale. Lo que llega por
   * IPC no se cree: el renderer también lo comprueba, pero aquí se vuelve a comprobar.
   */
  nombreValido(especie: number, nombre: string): string | null;
}

/**
 * La primera vez (base vacía): muestra el laboratorio, espera la elección, pide la carpeta y devuelve los datos para
 * crear a ese Pokémon (con el nombre propio que le dio la persona, si vale). Si se cancela la carpeta vuelve al laboratorio; null = la persona cerró el laboratorio (la app se
 * cierra, como antes al cancelar la carpeta). Nunca toca permisos.
 */
export async function primeraVez(deps: DepsPrimeraVez): Promise<DatosNuevos | null> {
  deps.mostrar({ tipo: "abrir" });
  try {
    for (;;) {
      const r = await deps.esperar();
      if (r.tipo === "salir") return null;
      const inicial = deps.iniciales.find((i) => i.especie === r.especie);
      if (!inicial) {
        // El renderer está esperando la carpeta: se le devuelve a la elección en vez de dejarlo colgado.
        deps.mostrar({ tipo: "volver" });
        continue;
      }
      // Sin nombre, o con uno que no vale, se queda el de la especie.
      const nombre = (r.nombre ? deps.nombreValido(inicial.especie, r.nombre) : null) ?? inicial.nombre;
      const carpeta = await deps.elegirCarpeta(`¿En qué proyecto va a trabajar ${nombre}?`);
      if (!carpeta) {
        deps.mostrar({ tipo: "volver" });
        continue;
      }
      const { voz, velocidad } = deps.datosDe(inicial.especie);
      // Una elección explícita (de la lista) se guarda siempre; sin ella (nulo) manda el tipo.
      const modelo = modeloValido(r.modelo);
      const propio = modelo !== null ? { modelo } : {};
      return { nombre, especie: inicial.especie, voz, velocidad, carpeta, ...propio };
    }
  } finally {
    deps.mostrar({ tipo: "cerrar" });
  }
}

/** Lo que llega por IPC no se cree: solo se aceptan las dos formas conocidas. */
export function validarRespuestaLab(dato: unknown): RespuestaLab | null {
  if (typeof dato !== "object" || dato === null || Array.isArray(dato)) return null;
  const { tipo, especie, nombre, modelo } = dato as Record<string, unknown>;
  if (tipo === "salir") return { tipo: "salir" };
  if (tipo === "elegida" && typeof especie === "number" && Number.isInteger(especie))
    return {
      tipo: "elegida",
      especie,
      ...(typeof nombre === "string" ? { nombre } : {}),
      // Un modelo fuera de la lista se descarta: queda el de su tipo.
      ...(modeloValido(modelo) !== null ? { modelo: modelo as string } : {}),
    };
  return null;
}
