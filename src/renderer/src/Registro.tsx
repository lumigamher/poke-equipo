import type { EntradaVivo, VistaRegistro } from "@compartido/registro-vivo";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "./BurbujaPartes";
import { estaAlFondo, guardarScroll, quePasaAlLlegar, tomarScroll } from "./registro-scroll";

/** Un área con scroll debe poder tomar el foco para leerla con teclado (WCAG 2.1.1). */
const FOCO_TECLADO = { tabIndex: 0 };

/** Solo se vuelve a dibujar la entrada que cambió: las demás conservan su markdown ya procesado. */
const Entrada = memo(
  function Entrada({ e }: { e: EntradaVivo }) {
    if (e.tipo === "texto") return <Markdown texto={e.texto} />;
    if (e.tipo === "pensando")
      return (
        <p className="registro-pensando">
          <span className="solo-lector">Pensando: </span>
          {e.texto}
        </p>
      );
    if (e.tipo === "ayudante") return <p className="registro-ayudante">{e.texto}</p>;
    return (
      <p className="registro-accion">
        <span className="registro-marca" aria-hidden="true" />
        <span className="solo-lector">Acción: </span>
        {e.texto}
      </p>
    );
  },
  (a, b) => a.e.id === b.e.id && a.e.texto === b.e.texto && a.e.tipo === b.e.tipo,
);

/**
 * Lo último ya CERRADO que vale la pena anunciar: una acción, un texto completo (hay otra entrada después) o lo de un
 * ayudante. Lo que todavía se está escribiendo (texto o pensamiento en la cola) no se anuncia por trocitos.
 */
function ultimoCerrado(r: VistaRegistro): EntradaVivo | null {
  const n = r.entradas.length;
  for (let i = n - 1; i >= 0; i--) {
    const e = r.entradas[i];
    const creciendo = i === n - 1 && (e.tipo === "texto" || e.tipo === "pensando");
    if (!creciendo && e.tipo !== "pensando") return e;
  }
  return null;
}

/**
 * Lo que el Pokémon dice, piensa y hace en la tarea, completo y al ritmo en que ocurre. Se desplaza (con teclado:
 * foco y flechas) y baja solo únicamente si ya estabas leyendo lo último; si subiste a leer, no te mueve y aparece
 * «Ir a lo último». No tiene ningún botón de permiso ni responde a clics: es solo para leer. Para el lector de
 * pantalla, el área en sí no anuncia nada; una región aparte anuncia cada bloque al cerrarse.
 */
export function RegistroEnVivo({
  pokemonId,
  nombre,
  registro,
  titulo,
  alto,
}: {
  pokemonId: string;
  nombre: string;
  registro: VistaRegistro;
  /** Encabezado pequeño (p. ej. «Lo que hace · paso 3»); sin él, no se dibuja. */
  titulo?: string;
  /** `tarea`: la burbuja se reparte el alto con él; `repaso`: ya terminó, va en línea dentro de la burbuja. */
  alto: "tarea" | "repaso";
}) {
  const caja = useRef<HTMLDivElement>(null);
  const pegado = useRef(true);
  const arriba = useRef(0);
  const enfocado = useRef(false);
  const [hayNuevo, setHayNuevo] = useState(false);
  const tarea = registro.entradas[0]?.id ?? 0;
  const tareaRef = useRef(tarea);
  tareaRef.current = tarea;

  const bajar = useCallback((suave: boolean) => {
    const el = caja.current;
    if (!el) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: suave && !quieto ? "smooth" : "auto" });
  }, []);

  // Si el bloque se desmontó (un permiso pasa por delante de todo) y vuelve en la misma tarea, regresa donde
  // estaba: la misma posición, sin saltar al fondo si estabas leyendo arriba, y con el foco si lo tenía.
  useLayoutEffect(() => {
    if (alto !== "tarea") return;
    const g = tomarScroll(pokemonId, tareaRef.current);
    if (g) {
      pegado.current = g.pegado;
      const el = caja.current;
      if (el && !g.pegado) {
        el.scrollTop = g.scrollTop;
        setHayNuevo(true);
      }
      if (el && g.enfocado) el.focus({ preventScroll: true });
    }
    return () => {
      guardarScroll(pokemonId, {
        tarea: tareaRef.current,
        pegado: pegado.current,
        scrollTop: arriba.current,
        enfocado: enfocado.current,
      });
    };
  }, [pokemonId, alto]);

  // Llegó contenido: si estabas al fondo baja solo; si no, no te mueve y ofrece el botón. Cada publicación del
  // Pokémon trae el registro como objeto nuevo aunque no haya cambiado: solo cuenta si cambió su contenido.
  const ultima = registro.entradas.at(-1);
  const huella = `${registro.entradas.length}:${ultima?.id}:${ultima?.texto.length}:${registro.omitido}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `huella` es lo que cambia cuando llega contenido
  useLayoutEffect(() => {
    if (quePasaAlLlegar(pegado.current) === "bajar") bajar(false);
    else setHayNuevo(true);
  }, [huella, bajar]);

  // Lo que se anuncia: solo bloques cerrados, en una región oculta aparte (el área con scroll no es «viva»).
  const cerrado = ultimoCerrado(registro);
  const anunciado = useRef(cerrado?.id);
  const [anuncio, setAnuncio] = useState("");
  useEffect(() => {
    if (!cerrado || cerrado.id === anunciado.current) return;
    anunciado.current = cerrado.id;
    setAnuncio(cerrado.texto);
  }, [cerrado]);

  const alScroll = () => {
    const el = caja.current;
    if (!el) return;
    const alFondo = estaAlFondo(el);
    pegado.current = alFondo;
    arriba.current = el.scrollTop;
    if (alFondo) setHayNuevo(false);
  };

  return (
    <div className={`registro-caja registro-${alto}`}>
      {titulo && <p className="progreso-titulo registro-titulo">{titulo}</p>}
      <div className="registro-marco">
        <div
          ref={caja}
          className="registro"
          role="log"
          {...FOCO_TECLADO}
          aria-live="off"
          aria-label={`Lo que hace ${nombre}`}
          onScroll={alScroll}
          onFocus={() => {
            enfocado.current = true;
          }}
          onBlur={() => {
            enfocado.current = false;
          }}
        >
          {registro.omitido && <p className="registro-omitido">…lo anterior se omitió</p>}
          {registro.entradas.map((e) => (
            <Entrada key={e.id} e={e} />
          ))}
        </div>
        {hayNuevo && (
          <button
            type="button"
            className="mini registro-ir"
            onClick={() => {
              pegado.current = true;
              setHayNuevo(false);
              bajar(true);
            }}
          >
            Ir a lo último
          </button>
        )}
      </div>
      <div className="solo-lector" role="status" aria-live="polite" aria-atomic="true">
        {anuncio}
      </div>
    </div>
  );
}

/** Después de la respuesta: lo que hizo para llegar ahí, plegado hasta que lo pidas. */
export function RegistroTerminado({
  pokemonId,
  nombre,
  registro,
}: {
  pokemonId: string;
  nombre: string;
  registro: VistaRegistro;
}) {
  return (
    <details className="registro-hecho">
      <summary>Ver lo que hizo</summary>
      <RegistroEnVivo pokemonId={pokemonId} nombre={nombre} registro={registro} alto="repaso" />
    </details>
  );
}
