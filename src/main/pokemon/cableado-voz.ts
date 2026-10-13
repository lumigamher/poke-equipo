import type { EstadoOido } from "@compartido/tipos";
import { afinar, decidir } from "../entrenador/entrenador";
import type { Candidato } from "../oido/nombres";
import { Oido } from "../oido/oido";
import type { Frase, Segmentador, Transcriptor, TranscriptorPreciso } from "../oido/transcriptor";
import { buscarMiembro, resolverEspecie, resolverExacta } from "./especie-oida";
import type { Especie } from "./especies";
import { type ControladorFrases, crearManejadorFrases } from "./frases";
import { crearGuardiaPermiso } from "./guardia-permiso";

export interface DependenciasCableadoVoz {
  segmentador: Segmentador;
  /** En la app corre fuera del hilo principal, como el preciso: transcribir no congela los menús. */
  rapido: Transcriptor | TranscriptorPreciso;
  /** Corre fuera del hilo principal. */
  preciso: TranscriptorPreciso;
  /** Quien recibe las frases: el equipo en pantalla (EquipoActivo), que las enruta por id. */
  controlador(): ControladorFrases | null;
  /** Reloj de pared (ms); el mismo que sella las horas del audio. */
  ahora(): number;
  /** Programa una tarea con plazo; devuelve la función que la cancela. */
  programar(fn: () => void, ms: number): () => void;
  aviso(mensaje: string, e: unknown): void;
  /** Una línea con los tiempos de cada frase (sin texto). */
  registrar?(linea: string): void;
  /** Las especies que se pueden llamar: con ellas, "llama a Tarmander" se entiende como Charmander. */
  especies?(): Especie[];
  /** Todos los del equipo (en pantalla o guardados): "llama a Rayo" se entiende por su nombre propio o un apodo. */
  miembros?(): Candidato[];
  /**
   * Solo para depurar (apagado por defecto): recibe el texto que oyó cada transcripción y lo que se decidió con él.
   * El registro normal no guarda texto.
   */
  depurar?(linea: string): void;
  /**
   * Dictado con tecla: lo que se va oyendo para el Pokémon `id` (`final` false) y, al cerrar, el texto completo
   * (`final` true; vacío si no se oyó nada). Quien lo recibe lo trata como texto ESCRITO: nunca responde un permiso.
   */
  alDictado?(id: string, texto: string, final: boolean): void;
  /** Qué hace el oído ahora mismo, cada vez que cambia: para que la persona vea cuándo lo están oyendo. */
  alOido?(estado: EstadoOido): void;
}

/** Un dictado que nadie cierra se envía solo a los dos minutos: el oído no se queda tragándose todo. */
export const DICTADO_MAX_MS = 120_000;

/**
 * Une el oído, la tubería de frases y la guardia de permisos tal como los usa la app. Vive aparte de
 * `index.ts` para poder probar el cableado completo sin Electron.
 */
export function crearCableadoVoz(d: DependenciasCableadoVoz) {
  const guardia = crearGuardiaPermiso();
  const alFrase = crearManejadorFrases({
    decidir: (texto, ctx) => {
      const r = decidir(texto, ctx);
      d.depurar?.(`Oído (rápido): "${texto}" → ${r.tipo}`);
      return r;
    },
    afinar: (previa, texto, ctx) => {
      const r = afinar(previa, texto, ctx);
      d.depurar?.(`Oído (preciso): "${texto}" → ${r.tipo}`);
      return r;
    },
    guardia,
    controlador: d.controlador,
    programar: d.programar,
    aviso: d.aviso,
    especieOida:
      d.especies || d.miembros
        ? (oido) => {
            const miembro = d.miembros ? buscarMiembro(oido, d.miembros()) : null;
            if (miembro) return { nombre: miembro.nombre };
            return d.especies ? resolverEspecie(oido, d.especies()) : null;
          }
        : undefined,
    especieExacta:
      d.especies || d.miembros
        ? (oido) => {
            const miembro = d.miembros ? buscarMiembro(oido, d.miembros()) : null;
            if (miembro) return { nombre: miembro.nombre };
            return d.especies ? resolverExacta(oido, d.especies()) : null;
          }
        : undefined,
  });
  // Lo que se le muestra a la persona del oído: dictado, transcribiendo, oyendo voz o atento a que lo nombren.
  let hayVoz = false;
  let transcribiendo = false;
  let ultimoOido: EstadoOido = "atento";
  const avisarOido = () => {
    const estado: EstadoOido = dictado
      ? "dictando"
      : transcribiendo
        ? "transcribiendo"
        : hayVoz
          ? "oyendo"
          : "atento";
    if (estado === ultimoOido) return;
    ultimoOido = estado;
    d.alOido?.(estado);
  };
  // Dictado en curso: todo lo que se oye es para ese Pokémon, sin nombre y sin pasar por el entrenador.
  let dictado: { id: string; partes: string[]; cancelar: () => void; cerrando: boolean } | null = null;
  const alOir = (f: Frase) => {
    if (!dictado) {
      alFrase(f);
      return;
    }
    dictado.partes.push(f.rapido);
    d.depurar?.(`Oído (dictado): "${f.rapido}"`);
    d.alDictado?.(dictado.id, dictado.partes.join(" "), false);
  };
  const terminarDictado = (): void => {
    if (!dictado || dictado.cerrando) return;
    const este = dictado;
    este.cerrando = true;
    este.cancelar();
    const cerrar = () => {
      if (dictado !== este) return;
      dictado = null;
      avisarOido();
      d.alDictado?.(este.id, este.partes.join(" ").trim(), true);
    };
    // Lo que venía diciendo sale ya, sin esperar al silencio; entra por `alOir` antes de cerrar. Si alguna frase
    // sigue transcribiéndose, se espera a que llegue.
    const espera = oido.vaciar();
    if (espera) void espera.then(cerrar);
    else cerrar();
  };
  const oido = new Oido(d.segmentador, d.rapido, d.preciso, alOir, {
    registrar: d.registrar,
    // La voz en curso retiene el borrador: la segunda mitad de una frase partida por una pausa se le pega.
    alVoz: (h) => {
      hayVoz = h;
      avisarOido();
      d.controlador()?.voz(h);
    },
    alTranscribir: (activo) => {
      transcribiendo = activo;
      avisarOido();
      d.controlador()?.transcribiendo?.(activo);
    },
    aviso: d.aviso,
  });
  return {
    oido,
    /** El Pokémon al que se le está dictando, o null. */
    dictandoA: (): string | null => dictado?.id ?? null,
    /** Empieza un dictado para `id`: tira lo que se venía oyendo y todo lo que siga es suyo hasta `terminarDictado`. */
    dictar(id: string): void {
      if (dictado) return;
      oido.descartar();
      dictado = { id, partes: [], cancelar: d.programar(terminarDictado, DICTADO_MAX_MS), cerrando: false };
      avisarOido();
      d.alDictado?.(id, "", false);
    },
    terminarDictado,
    /**
     * La voz de la app es UNA y la comparten todos los Pokémon: avisa aquí cuando empieza y termina de sonar. Mientras
     * suena cualquiera, el oído queda cerrado: no se oye a sí mismo ni toma su propia voz por un "sí".
     */
    alSonarVoz(hablando: boolean): void {
      oido.silenciar("voz", hablando);
    },
    /**
     * Cada vez que cambia lo que hay en pantalla pasan por aquí TODAS las vistas, ya marcadas por EquipoActivo, pero
     * la guardia solo recibe la de la burbuja ABIERTA (`abierta === true`; sin marcar cuenta como cerrada: falla
     * cerrado). Un permiso cuenta desde que su burbuja se abre; en chip no se responde por voz (con clic, tampoco: hay
     * que abrirlo). Al cambiar la abierta, el permiso de la anterior deja de contar y, si vuelve, cuenta de cero. Un
     * permiso que aparece en la abierta descarta lo que se venía oyendo (empezó antes y no puede responderlo).
     */
    alVista(vistas: { id: string; permiso: { id: string } | null; abierta?: boolean }[]): void {
      const abierta = vistas.filter((v) => v.abierta === true);
      if (guardia.alVista(abierta, d.ahora())) oido.descartar();
    },
  };
}
