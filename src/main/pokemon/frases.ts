import type { Contexto, Decision } from "../entrenador/entrenador";
import type { Frase } from "../oido/transcriptor";
import { type IdBorrador, PRECISO_MAX_MS } from "./controlador";

/** Lo que la tubería de frases necesita del Pokémon en pantalla. */
export interface ControladorFrases {
  contexto(): Contexto;
  ejecutar(d: Decision): void;
  /**
   * Identidad de la instancia del Pokémon `id`; null si ya no está en pantalla (guardado o cerrado). Otra instancia
   * del mismo Pokémon (guardado y sacado otra vez) tiene otra identidad.
   */
  instancia(id: string): object | null;
  /** Responde un permiso del Pokémon `pokemonId` solo si `permisoId` es el que tiene a la vista. */
  responderPermisoDe(permitir: boolean, pokemonId: string, permisoId: string): void;
  /** Muestra la orden ya, con el texto rápido, y arranca la ventana de envío; devuelve el asa del borrador o null. */
  abrirBorrador(id: string, texto: string): IdBorrador | null;
  /**
   * Pega al borrador vigente de ese Pokémon la continuación de la frase (sin nombre), con su texto rápido; devuelve
   * el asa de la parte nueva o null si no hay borrador vigente.
   */
  continuarBorrador(id: string, texto: string): { borrador: IdBorrador; parte: number } | null;
  /** Hay (true) o ya no hay (false) voz en curso en el micrófono. */
  voz(hablando: boolean): void;
  /** Hay (true) o ya no hay (false) trozos entregados por el segmentador esperando su texto rápido. */
  transcribiendo?(activo: boolean): void;
}

export interface DependenciasFrases {
  decidir(texto: string, ctx: Contexto): Decision;
  afinar(previa: Decision, textoPreciso: string, ctx: Contexto): Decision;
  guardia: { puedeResponder(inicioFraseMs: number | null, pokemonId: string, permisoId: string): boolean };
  controlador(): ControladorFrases | null;
  /** Programa una tarea; devuelve la función que la cancela. */
  programar(fn: () => void, ms: number): () => void;
  aviso(mensaje: string, e: unknown): void;
  /**
   * La especie disponible que el transcriptor quiso escribir ("Tarmander" → Charmander), o null. Sin ella, una
   * llamada exige que las dos transcripciones escriban la especie igual, letra por letra.
   */
  especieOida?(oido: string): { nombre: string } | null;
  /**
   * Lo mismo pero SOLO si lo oído es exactamente el nombre de la especie (o una variante oída curada, o el nombre de
   * alguien del equipo). Es lo único que actúa con la transcripción rápida sola; sin ella se usa `especieOida`.
   */
  especieExacta?(oido: string): { nombre: string } | null;
}

/**
 * Qué se hace con cada frase oída. El paso preciso corre aparte y tarda: cada continuación comprueba que sigue
 * siendo pertinente (la MISMA instancia del Pokémon sigue en pantalla, el permiso o la
 * llamada pendiente siguen siendo los mismos) y, si no, se descarta en silencio. La pertinencia se mide por Pokémon (`instancia(id)`), no
 * por controlador: con un equipo, el controlador es siempre el mismo aunque el Pokémon se haya guardado.
 *
 * LO QUE VES ES LO QUE SE ENVÍA: una orden (con nombre, o sin él porque el Pokémon estaba atento) y sus
 * continuaciones se muestran con el texto rápido y salen con ese mismo texto al cerrarse la ventana de envío; el
 * paso preciso ni siquiera se pide, y nunca reemplaza lo que se ve (reescribía "sonnet" y "opus" por otras cosas).
 * El preciso se sigue pidiendo SOLO donde aporta seguridad o rescate:
 *  - Permisos: una respuesta por voz solo se aplica si la frase empezó al menos REACCION_MS después de que ESE
 *    permiso de ESE Pokémon se mostró, y siempre con los dos ids; si no, se descarta sin más. Negar basta con la
 *    transcripción rápida; aprobar exige además que la precisa llegue a tiempo y decida lo mismo (mismo Pokémon,
 *    mismo permiso; sin caer jamás al texto rápido), que la misma instancia siga en pantalla y que la guardia,
 *    consultada otra vez con la hora original de la frase, siga dándolo por bueno. Un permiso nunca se aprueba por
 *    tiempo, error ni cola que avanza. `ejecutar` no responde permisos: solo `responderPermisoDe`.
 *  - Llamar a otro Pokémon y guardar uno esperan al preciso: se muestra que oyó y solo se ejecutan si el preciso
 *    decide lo mismo (mismo tipo, mismo Pokémon y, al llamar, una especie que no contradiga a la del rápido).
 *    Única salida: una llamada cuya especie el rápido ya reconoció sale aunque el preciso no la lea como llamada,
 *    siempre que no nombre a otro Pokémon. Llamar se deshace guardando; guardar corta un trabajo y no tiene esa salida.
 *  - Atención (solo el nombre): el preciso puede convertirla en una orden. Aprender un apodo usa las dos formas.
 */
export function crearManejadorFrases(d: DependenciasFrases): (f: Frase) => void {
  /**
   * Cuenta, por Pokémon, las frases que hicieron algo: una atención, un guardar o un llamar pendiente de su preciso
   * no pisa lo que le llegó después A ESE Pokémon; una frase a otro no lo descarta.
   */
  const epocas = new Map<string, number>();
  const exacta = (oido: string) => (d.especieExacta ?? d.especieOida)?.(oido) ?? null;
  /**
   * Qué se le pasa al Pokémon como especie de una llamada, vista por las dos transcripciones. Solo actúa una
   * coincidencia EXACTA (nombre, título o variante oída curada) de alguna de las dos, siempre que la otra no sea
   * exacta de una distinta. Una solo aproximada ("Karina" ~ Kakuna) nunca llama, aunque las dos coincidan: se pasa tal
   * cual lo oído para que el Pokémon la sugiera. Vacío = ni eso: el Pokémon avisa que no entendió a quién llamar.
   * Sin `especieOida`: las dos deben escribirla igual.
   */
  const especieLlamada = (rapida: string, precisa: string): string => {
    if (!d.especieOida) return rapida === precisa ? precisa : "";
    const a = exacta(rapida);
    const b = exacta(precisa);
    if (a && b) return a.nombre === b.nombre ? b.nombre : "";
    if (a ?? b) return (a ?? b)?.nombre ?? "";
    if (d.especieOida(rapida)) return rapida;
    return d.especieOida(precisa) ? precisa : "";
  };

  /** Pide el paso preciso con un plazo de PRECISO_MAX_MS; lo que llegue después se ignora. */
  const preciso = (f: Frase): Promise<string> =>
    new Promise<string>((resolver, rechazar) => {
      let hecho = false;
      const cancelar = d.programar(() => {
        if (hecho) return;
        hecho = true;
        rechazar(new Error("el paso preciso tardó demasiado"));
      }, PRECISO_MAX_MS);
      const terminar = (fn: () => void) => {
        if (hecho) return;
        hecho = true;
        cancelar();
        fn();
      };
      try {
        f.preciso().then(
          (texto) => terminar(() => resolver(texto)),
          (e) => terminar(() => rechazar(e)),
        );
      } catch (e) {
        terminar(() => rechazar(e));
      }
    });

  return (f) => {
    const c = d.controlador();
    if (!c) return;
    const decision = d.decidir(f.rapido, c.contexto());
    if (decision.tipo === "ignorar") return;
    const dueno = c.instancia(decision.id);
    if (!dueno) return;
    const id = decision.id;
    const mia = (epocas.get(id) ?? 0) + 1;
    epocas.set(id, mia);
    const esLaUltima = () => epocas.get(id) === mia;
    /** El controlador actual si la MISMA instancia de ese Pokémon sigue en pantalla; si no, null. */
    const vigente = (): ControladorFrases | null => {
      const ahora = d.controlador();
      return ahora && ahora.instancia(id) === dueno ? ahora : null;
    };

    if (decision.tipo === "permiso") {
      const { permisoId } = decision;
      if (!d.guardia.puedeResponder(f.inicioMs, id, permisoId)) return;
      if (!decision.permitir) {
        c.responderPermisoDe(false, id, permisoId);
        return;
      }
      // Aprobar exige que el paso preciso confirme lo mismo y que ese permiso de ese Pokémon siga a la vista.
      preciso(f).then(
        (fino) => {
          const ahora = vigente();
          if (!ahora) return;
          const segunda = d.decidir(fino, ahora.contexto());
          const confirma =
            segunda.tipo === "permiso" &&
            segunda.permitir &&
            segunda.id === id &&
            segunda.permisoId === permisoId;
          if (!confirma) return;
          if (!d.guardia.puedeResponder(f.inicioMs, id, permisoId)) return;
          ahora.responderPermisoDe(true, id, permisoId);
        },
        (e) => d.aviso("Oído: falló el paso preciso, no se aprueba por voz:", e),
      );
      return;
    }

    if (decision.tipo === "alta") {
      // Para aprender apodos sirven las dos formas de escribir el nombre.
      preciso(f)
        .catch((e) => {
          d.aviso("Oído: falló el paso preciso, se usa el rápido:", e);
          return f.rapido;
        })
        .then((fino) => {
          vigente()?.ejecutar({ ...decision, texto: `${f.rapido} ${fino || f.rapido}`, rapido: f.rapido });
        });
      return;
    }

    if (decision.tipo === "orden") {
      // Se muestra ya con el texto rápido y sale con él al cerrarse la ventana de envío; no se pide el preciso.
      c.abrirBorrador(id, decision.texto);
      return;
    }

    if (decision.tipo === "continuar") {
      // La segunda mitad de una frase que la pausa partió: se pega al borrador con su texto rápido (el definitivo).
      c.continuarBorrador(id, f.rapido);
      return;
    }

    if (decision.tipo === "llamar" && decision.encargo === "") {
      // Una llamada sin encargo cuya especie ya se reconoce sale al instante: esperar al preciso tarda segundos y
      // no aporta (no hay encargo que corregir). Llamar se deshace guardando; por eso no pide confirmación.
      const oida = exacta(decision.nombreEspecie);
      if (oida) {
        c.ejecutar({ tipo: "atencion", id });
        c.ejecutar({ ...decision, nombreEspecie: oida.nombre });
        return;
      }
    }

    if (decision.tipo === "llamar" || decision.tipo === "guardar") {
      // Guardar, y llamar con encargo o sin especie reconocida, no salen con el rápido solo: se muestra que oyó y
      // se espera al preciso.
      c.ejecutar({ tipo: "atencion", id });
      preciso(f).then(
        (fino) => {
          const ahora = vigente();
          if (!ahora || !esLaUltima()) return;
          const fina = d.afinar(decision, fino, ahora.contexto());
          if (fina.tipo === "ignorar" || fina.id !== id) return;
          if (fina.tipo !== decision.tipo) {
            // El preciso tuerce más que el rápido las frases cortas con nombres de Pokémon ("jamás corto" por
            // "llama a Squirtle"). Si el rápido ya reconoció una especie y el preciso no nombra a otro Pokémon, la
            // llamada sale con lo que oyó el rápido. Guardar no tiene esta salida: exige las dos transcripciones.
            if (decision.tipo !== "llamar") return;
            const oida = exacta(decision.nombreEspecie);
            if (oida) ahora.ejecutar({ ...decision, nombreEspecie: oida.nombre });
            return;
          }
          if (fina.tipo !== "llamar" || decision.tipo !== "llamar") {
            ahora.ejecutar(fina);
            return;
          }
          // Solo actúa una coincidencia exacta; lo aproximado o sin acuerdo llega al Pokémon, que sugiere o avisa.
          ahora.ejecutar({
            ...fina,
            nombreEspecie: especieLlamada(decision.nombreEspecie, fina.nombreEspecie),
          });
        },
        (e) => d.aviso("Oído: falló el paso preciso, no se llama ni se guarda:", e),
      );
      return;
    }

    if (decision.tipo !== "atencion") {
      c.ejecutar(decision);
      return;
    }
    // Primero se muestra que oyó; el preciso puede convertir la atención en una orden.
    c.ejecutar(decision);
    preciso(f).then(
      (fino) => {
        const ahora = vigente();
        if (!ahora || !esLaUltima()) return;
        const fina = d.afinar(decision, fino, ahora.contexto());
        if (fina.tipo !== "permiso") ahora.ejecutar(fina);
      },
      (e) => d.aviso("Oído: falló el paso preciso, se queda con el rápido:", e),
    );
  };
}
