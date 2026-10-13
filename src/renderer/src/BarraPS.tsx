import type { Alterado, EstadoOido } from "@compartido/tipos";
import { colorLimite, colorPS, ETIQUETAS, textoLimite } from "./burbuja-logica";

const NOMBRES: Record<Alterado, string> = {
  confundido: "Confundido: la sesión falló",
  paralizado: "Paralizado: espera tu permiso",
  envenenado: "Envenenado: hay tests fallando",
  dormido: "Dormido",
};

/** Cómo se le dice a la persona que lo están oyendo. Atento (esperando un nombre) no muestra nada. */
const OIDO: Record<Exclude<EstadoOido, "atento">, { rotulo: string; titulo: string }> = {
  oyendo: { rotulo: "TE OIGO", titulo: "Estoy oyendo voz" },
  transcribiendo: { rotulo: "ENTENDIENDO", titulo: "Pasando a texto lo que oí" },
  dictando: { rotulo: "DICTADO", titulo: "Dictado abierto: Control + Opción + D para enviar" },
};

export function BarraPS({
  nombre,
  ps: bruto,
  alterados,
  pausado = false,
  shiny = false,
  medallas = 0,
  oido = null,
  sinLeer = false,
  limite = null,
}: {
  /** De quién es la barra: con varios Pokémon en pantalla, el lector de pantalla los distingue. */
  nombre: string;
  ps: number;
  alterados: Alterado[];
  /** La persona pausó la escucha. */
  pausado?: boolean;
  /** Brillante: una estrella junto a la barra. */
  shiny?: boolean;
  /** Medallas que le ha dado la persona. */
  medallas?: number;
  /** Qué hace el oído ahora mismo; solo lo lleva el Pokémon que lo muestra. */
  oido?: EstadoOido | null;
  /** Respondió algo que la persona aún no ha abierto. */
  sinLeer?: boolean;
  /** Cuánto va usado del límite de la sesión del plan (0 a 100); null si no se sabe. */
  limite?: { usado: number; reinicia?: string } | null;
}) {
  const ps = Number.isFinite(bruto) ? Math.min(100, Math.max(0, bruto)) : 0;
  return (
    <div className="ps">
      <span className="ps-rotulo">PS</span>
      <div className="ps-barras">
        {/* biome-ignore lint/a11y/useSemanticElements: barra con estilo propio; <meter> no se estiliza igual */}
        <div
          className="ps-riel"
          role="meter"
          aria-label={`Puntos de salud de ${nombre}: contexto disponible`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={ps}
          aria-valuetext={`${Math.round(ps)} de 100 puntos de salud`}
        >
          <div className={`ps-nivel ps-${colorPS(ps)}`} style={{ transform: `scaleX(${ps / 100})` }} />
        </div>
        {limite && (
          // biome-ignore lint/a11y/useSemanticElements: barra con estilo propio; <meter> no se estiliza igual
          <div
            className="ps-limite"
            role="meter"
            aria-label="Límite de la sesión del plan"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(limite.usado)}
            aria-valuetext={textoLimite(limite)}
            title={textoLimite(limite)}
          >
            <div
              className={`ps-limite-nivel ps-limite-${colorLimite(limite.usado)}`}
              style={{ transform: `scaleX(${limite.usado / 100})` }}
            />
          </div>
        )}
      </div>
      {shiny && (
        <span className="ps-shiny" title="Shiny: terminó una tarea con las pruebas en verde a la primera">
          <span aria-hidden="true">✦</span>
          <span className="solo-lector">Shiny</span>
        </span>
      )}
      {medallas > 0 && (
        <span className="ps-medallas" title={`${medallas} ${medallas === 1 ? "medalla" : "medallas"}`}>
          <span className="ps-medalla" aria-hidden="true" />
          <span aria-hidden="true">{medallas}</span>
          <span className="solo-lector">{`${medallas} ${medallas === 1 ? "medalla" : "medallas"}`}</span>
        </span>
      )}
      {sinLeer && (
        <span className="ps-sin-leer" title="Tiene una respuesta sin leer: clic sobre él para abrirla">
          <span className="solo-lector">Respuesta sin leer</span>
        </span>
      )}
      {!pausado && oido && oido !== "atento" && (
        <span className={`alterado oido-${oido}`} title={OIDO[oido].titulo}>
          {OIDO[oido].rotulo}
        </span>
      )}
      {pausado && (
        <span
          className="alterado alterado-sordo"
          title="No te escucha: Control + Opción + Espacio para volver"
        >
          NO OYE
        </span>
      )}
      {alterados.map((a) => (
        <span key={a} className={`alterado alterado-${a}`} title={NOMBRES[a]}>
          {ETIQUETAS[a]}
        </span>
      ))}
    </div>
  );
}
