import {
  type EstadoLinea,
  type EstadoPreparacion,
  formatearBytes,
  type LineaPlan,
  type LineaProgreso,
  type ProgresoVista,
  porcentaje,
} from "@compartido/preparacion";
import { useEffect, useRef, useState } from "react";

const ROTULO_ESTADO: Record<EstadoLinea, string> = {
  pendiente: "En espera",
  bajando: "Bajando",
  listo: "Listo",
  error: "Falló",
};

/** Las fuentes distintas, en el orden en que aparecen. */
const fuentesDe = (lineas: LineaPlan[]): string[] => [...new Set(lineas.map((l) => l.fuente))];

function Barra({ hechos, total, etiqueta }: { hechos: number; total: number; etiqueta: string }) {
  const valor = porcentaje(hechos, total);
  return (
    <div
      className="prep-barra"
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valor}
      aria-valuetext={`${valor} %`}
    >
      <div className="prep-barra-relleno" style={{ width: `${valor}%` }} />
    </div>
  );
}

function Archivo({ l }: { l: LineaProgreso }) {
  return (
    <li className="prep-archivo" data-estado={l.estado}>
      <div className="prep-archivo-fila">
        <span className="prep-archivo-nombre">{l.etiqueta}</span>
        <span className="prep-archivo-dato">
          {l.estado === "bajando"
            ? `${formatearBytes(l.hechos)} de ${formatearBytes(l.bytes)}`
            : `${ROTULO_ESTADO[l.estado]} · ${formatearBytes(l.bytes)}`}
        </span>
      </div>
      {l.estado === "bajando" && <Barra hechos={l.hechos} total={l.bytes} etiqueta={l.etiqueta} />}
    </li>
  );
}

function Avance({ p }: { p: ProgresoVista }) {
  const valor = porcentaje(p.hechos, p.total);
  return (
    <>
      <div className="prep-total">
        <span>
          {formatearBytes(p.hechos)} de {formatearBytes(p.total)}
        </span>
        <span>{valor} %</span>
      </div>
      <Barra hechos={p.hechos} total={p.total} etiqueta="Avance total" />
      <ul className="prep-lista">
        {p.lineas.map((l) => (
          <Archivo key={l.etiqueta} l={l} />
        ))}
      </ul>
    </>
  );
}

/** "Preparando a tu equipo": lo que va a bajar, un clic para empezar, avance real, cancelar/reanudar y errores claros. */
export function Preparacion() {
  const [estado, setEstado] = useState<EstadoPreparacion | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    document.body.classList.add("preparacion");
    window.poke.alPreparacion(setEstado);
    // El primer estado puede haber salido antes de suscribirse: se pide una vez.
    window.poke.pedirPreparacion();
  }, []);

  // Un cambio de fase lleva el foco al título: quien usa lector de pantalla oye qué pasó.
  const fase = estado?.fase;
  useEffect(() => {
    if (fase) titulo.current?.focus();
  }, [fase]);

  const accion = window.poke.accionPreparacion;
  if (!estado) {
    return (
      <main className="prep">
        <h1 className="lab-titulo" ref={titulo} tabIndex={-1}>
          Preparando a tu equipo
        </h1>
      </main>
    );
  }

  return (
    <main className="prep">
      <div className="lab-cabeza">
        <span className="lab-etiqueta">Primer arranque</span>
      </div>
      <h1 className="lab-titulo" ref={titulo} tabIndex={-1}>
        {estado.fase === "listo" ? "Todo listo" : "Preparando a tu equipo"}
      </h1>

      {estado.fase === "inicio" && (
        <>
          <p className="lab-ayuda">
            Para oír y hablar, y para ver a tus Pokémon, la app necesita bajar unos archivos una sola vez.
            Pesan <strong>{formatearBytes(estado.total)}</strong> en total.
          </p>
          <ul className="prep-lista">
            {estado.lineas.map((l) => (
              <li key={l.etiqueta} className="prep-archivo">
                <div className="prep-archivo-fila">
                  <span className="prep-archivo-nombre">{l.etiqueta}</span>
                  <span className="prep-archivo-dato">{formatearBytes(l.bytes)}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="lab-nota">De dónde sale: {fuentesDe(estado.lineas).join(" y ")}.</p>
          <p className="lab-nota">
            Los demás Pokémon de Kanto se bajan después, en segundo plano. Si cancelas o se corta la conexión,
            lo ya bajado se conserva y puedes seguir donde te quedaste.
          </p>
          <div className="lab-botones lab-botones-fin">
            <button type="button" className="mini" onClick={() => accion("salir")}>
              Salir
            </button>
            <button type="button" className="mini prep-primario" onClick={() => accion("empezar")}>
              Empezar
            </button>
          </div>
        </>
      )}

      {estado.fase === "bajando" && (
        <>
          <p className="lab-ayuda" aria-live="polite">
            Bajando y comprobando los archivos. Puedes dejar esta ventana abierta y hacer otra cosa.
          </p>
          <Avance p={estado.progreso} />
          <div className="lab-botones lab-botones-fin">
            <button type="button" className="mini" onClick={() => accion("cancelar")}>
              Cancelar
            </button>
          </div>
        </>
      )}

      {estado.fase === "pausada" && (
        <>
          <p className="lab-ayuda" role="status">
            Pausado. Lo que ya se bajó se conserva.
          </p>
          <Avance p={estado.progreso} />
          <div className="lab-botones lab-botones-fin">
            <button type="button" className="mini" onClick={() => accion("salir")}>
              Salir
            </button>
            <button type="button" className="mini prep-primario" onClick={() => accion("empezar")}>
              Reanudar
            </button>
          </div>
        </>
      )}

      {estado.fase === "error" && (
        <>
          <p className="lab-error" role="alert">
            {estado.mensaje}
          </p>
          {estado.progreso && <Avance p={estado.progreso} />}
          <div className="lab-botones lab-botones-fin">
            <button type="button" className="mini" onClick={() => accion("salir")}>
              Salir
            </button>
            <button type="button" className="mini prep-primario" onClick={() => accion("empezar")}>
              Reintentar
            </button>
          </div>
        </>
      )}

      {estado.fase === "listo" && (
        <p className="lab-ayuda" role="status">
          Ya está todo. Arrancando…
        </p>
      )}
    </main>
  );
}
