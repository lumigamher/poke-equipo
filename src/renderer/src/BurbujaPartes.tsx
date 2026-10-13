import type { Intercambio, VistaPokemon } from "@compartido/tipos";
import { memo, useEffect, useMemo, useState } from "react";
import { datosFicha } from "./burbuja-logica";
import { type BloqueMd, bloquesMarkdown, type Trozo } from "./markdown-simple";

export type Panel = "historial" | "ayuda" | null;

function Trozos({ trozos }: { trozos: Trozo[] }) {
  return (
    <>
      {trozos.map((t, i) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: los trozos de una línea no se reordenan
        if (t.tipo === "negrita") return <strong key={i}>{t.texto}</strong>;
        // biome-ignore lint/suspicious/noArrayIndexKey: los trozos de una línea no se reordenan
        if (t.tipo === "codigo") return <code key={i}>{t.texto}</code>;
        return t.texto;
      })}
    </>
  );
}

function Bloque({ b }: { b: BloqueMd }) {
  if (b.tipo === "codigo") return <pre className="md-codigo">{b.texto}</pre>;
  if (b.tipo === "titulo")
    return (
      <p className="md-titulo">
        <Trozos trozos={b.trozos} />
      </p>
    );
  if (b.tipo === "lista") {
    const items = b.items.map((it, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: los renglones de una lista no se reordenan
      <li key={i}>
        <Trozos trozos={it} />
      </li>
    ));
    return b.ordenada ? <ol className="md-lista">{items}</ol> : <ul className="md-lista">{items}</ul>;
  }
  return (
    <p>
      <Trozos trozos={b.trozos} />
    </p>
  );
}

/** Texto de Claude Code con el formato básico: listas, código y negrita en vez de asteriscos sueltos. */
export const Markdown = memo(function Markdown({ texto }: { texto: string }) {
  const bloques = useMemo(() => bloquesMarkdown(texto), [texto]);
  return (
    <div className="md">
      {bloques.map((b, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: los bloques de un texto no se reordenan
        <Bloque key={i} b={b} />
      ))}
    </div>
  );
});

/** Una respuesta: su texto con formato y un botón para copiarla entera. */
export function Respuesta({ nombre, texto }: { nombre: string; texto: string }) {
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 1500);
    return () => clearTimeout(t);
  }, [copiado]);
  return (
    <div className="respuesta">
      <span className="solo-lector">{nombre}: </span>
      <Markdown texto={texto} />
      <button
        type="button"
        className="mini respuesta-copiar"
        onClick={() => {
          window.poke.copiar(texto);
          setCopiado(true);
        }}
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

/**
 * La ficha de la sesión, siempre arriba de la burbuja abierta: en qué proyecto y con qué modelo trabaja, cuánto
 * contexto le queda, y lo que se puede hacer con ella: detener la tarea, ver el historial y la ayuda.
 */
export function Ficha({
  vista,
  panel,
  onPanel,
}: {
  vista: VistaPokemon;
  panel: Panel;
  onPanel(p: Panel): void;
}) {
  const ocupado = vista.estado === "trabajando";
  // Lo que cabe se lee de un vistazo; los números del contexto y del límite están en las barras y aquí al pasar el cursor.
  const datos = datosFicha(vista);
  const detalle = [
    ...datos,
    `${Math.round(vista.ps)} % de contexto libre`,
    vista.limite ? `${Math.round(vista.limite.usado)} % del límite de la sesión usado` : null,
  ].filter(Boolean);
  return (
    <div className="ficha">
      <span className="ficha-datos" title={detalle.join(" · ")}>
        {datos.join(" · ")}
      </span>
      <span className="ficha-acciones">
        {ocupado && (
          <button type="button" className="mini mini-detener" onClick={() => window.poke.detener(vista.id)}>
            Detener
          </button>
        )}
        <button
          type="button"
          className="mini"
          aria-pressed={panel === "historial"}
          onClick={() => onPanel(panel === "historial" ? null : "historial")}
        >
          Historial
        </button>
        <button
          type="button"
          className="mini mini-ayuda"
          aria-pressed={panel === "ayuda"}
          aria-label={`Cómo usar a ${vista.nombre}`}
          onClick={() => onPanel(panel === "ayuda" ? null : "ayuda")}
        >
          ?
        </button>
      </span>
    </div>
  );
}

const hora = (ms: number) =>
  new Date(ms).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** Los últimos intercambios con ese Pokémon: cada orden se abre para leer lo que respondió. */
export function Historial({ vista }: { vista: VistaPokemon }) {
  const [lista, setLista] = useState<Intercambio[] | null>(null);
  useEffect(() => {
    let vivo = true;
    window.poke.historial(vista.id).then(
      (l) => vivo && setLista(l),
      () => vivo && setLista([]),
    );
    return () => {
      vivo = false;
    };
  }, [vista.id]);
  if (lista === null) return <p className="panel-vacio">Buscando…</p>;
  if (lista.length === 0) return <p className="panel-vacio">Todavía no ha terminado ninguna tarea.</p>;
  return (
    <div className="historial">
      {lista.map((x) => (
        <details key={`${x.fin}-${x.orden}`} className="historial-item">
          <summary>
            <span className="historial-orden">{x.orden}</span>
            <span className="historial-hora">{hora(x.fin)}</span>
          </summary>
          {x.respuesta ? (
            <Markdown texto={x.respuesta} />
          ) : (
            <p className="panel-vacio">Sin respuesta guardada.</p>
          )}
        </details>
      ))}
    </div>
  );
}

/** Lo esencial para manejarlo, a un clic: cómo hablarle, dictar, detenerlo y los comandos. */
export function Ayuda({ vista }: { vista: VistaPokemon }) {
  const n = vista.nombre;
  return (
    <dl className="ayuda">
      <dt>Hablarle</dt>
      <dd>
        Di «{n}, …» y tu orden. Después de nombrarlo te sigue oyendo unos segundos sin repetir el nombre.
      </dd>
      <dt>Dictar sin nombre</dt>
      <dd>
        <kbd>Control</kbd> + <kbd>Opción</kbd> + <kbd>D</kbd> para empezar; otra vez para enviar.
      </dd>
      <dt>Pausar la escucha</dt>
      <dd>
        <kbd>Control</kbd> + <kbd>Opción</kbd> + <kbd>Espacio</kbd>.
      </dd>
      <dt>Detenerlo</dt>
      <dd>
        Botón Detener, o <kbd>Esc</kbd> con el cursor en el campo de escribir.
      </dd>
      <dt>Permisos</dt>
      <dd>Solo con clic en Sí, o diciendo «sí» con su burbuja abierta. Nunca se aprueban solos.</dd>
      <dt>Llamar a otro</dt>
      <dd>«{n}, llama a Squirtle para que…» o escribe /llamar squirtle.</dd>
      <dt>Comandos</dt>
      <dd>
        Escribe / para ver la lista. Los de la app: /pokedex, /movimientos, /combate, /medalla, /equipo,
        /nombre, /model.
      </dd>
      <dt>Clic derecho sobre él</dt>
      <dd>
        Guardarlo, cambiar de proyecto, cambiar su nombre, dejarlo quieto, texto grande, silenciar su voz.
      </dd>
      <dt>Recorrido</dt>
      <dd>
        <button type="button" className="mini" onClick={() => window.poke.recorrido("repetir")}>
          Repetir el recorrido de la primera vez
        </button>
      </dd>
    </dl>
  );
}
