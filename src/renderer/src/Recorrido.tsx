import { otroInicial } from "@compartido/inicial";
import {
  clicDerecho,
  enAlta,
  iniciar,
  moverA,
  nivelesDe,
  observar,
  PASOS,
  cumplido as pasoHecho,
} from "@compartido/recorrido";
import type { EstadoOido, VistaPokemon } from "@compartido/tipos";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * El recorrido de la primera vez: una tarjeta arriba de la pantalla en la que el primer Pokémon explica, paso a paso,
 * cómo usarlo. Avanza sola cuando la persona hace lo que pide el paso estando en él; "Atrás", "Siguiente" y "Saltar" están
 * siempre, para que nadie se quede atascado. Captura el ratón solo mientras el cursor está sobre ella. Qué cuenta como
 * hecho lo decide la lógica pura de `@compartido/recorrido`, no el orden de los efectos.
 *
 * Y el alta de voz del nombre: si el Pokémon está aprendiendo cómo suena su nombre, el recorrido se esconde y espera
 * (sus avisos y sus frases no son lo que pide un paso); al terminar sigue donde iba. Ningún paso se cumple durante el
 * alta ni por lo que el alta dejó a la vista.
 */
export function Recorrido({ vistas, oido }: { vistas: VistaPokemon[]; oido: EstadoOido }) {
  const [estado, setEstado] = useState(() => iniciar(nivelesDe(vistas, oido)));
  // El nombre propio (si le cambió el nombre a mitad del recorrido, los textos lo siguen).
  const nombre = vistas[0]?.nombre ?? "tu Pokémon";
  // Para sugerir a OTRO en el último paso se mira la especie, no el nombre propio.
  const otro = otroInicial(vistas[0]?.especieNombre ?? nombre);
  const esperando = enAlta(vistas);
  const siguienteRef = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);
  const paso = estado.paso;
  const actual = PASOS[paso];

  // Anota lo que se ve (trabajo, dictado) y suelta lo "de antes" cuando se apaga.
  useEffect(() => {
    setEstado((e) => observar(e, vistas, oido));
  }, [vistas, oido]);
  // El clic derecho solo cuenta en el paso del menú, y no mientras el Pokémon aprende su nombre.
  useEffect(() => {
    if (esperando) return;
    const alMenu = () => setEstado(clicDerecho);
    document.addEventListener("contextmenu", alMenu);
    return () => document.removeEventListener("contextmenu", alMenu);
  }, [esperando]);
  // Si "Atrás" desaparece (primer paso) estando enfocado, el foco pasa a "Siguiente" en vez de perderse.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar de paso
  useEffect(() => {
    if (devolverFoco.current) siguienteRef.current?.focus();
    devolverFoco.current = false;
  }, [paso]);

  const cumplido = pasoHecho(estado, vistas, oido);
  // Lo último que se ve, para el temporizador de 900 ms (su cierre se quedaría con datos viejos).
  const ahora = useRef({ vistas, oido });
  useLayoutEffect(() => {
    ahora.current = { vistas, oido };
  });
  const ir = (n: number, via: "avance" | "atras") =>
    setEstado((e) => moverA(e, n, ahora.current.vistas, ahora.current.oido, via));
  const volver = () => {
    devolverFoco.current = paso === 1;
    ir(paso - 1, "atras");
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo avanza cuando el paso pasa a cumplido
  useEffect(() => {
    if (!cumplido) return;
    // Un respiro para que se vea que lo que hizo sirvió, y pasa al siguiente.
    const t = setTimeout(() => ir(Math.min(paso + 1, PASOS.length - 1), "avance"), 900);
    return () => clearTimeout(t);
  }, [cumplido, paso]);

  const ultimo = paso === PASOS.length - 1;
  if (esperando) return null;
  return (
    <aside className="recorrido" aria-label="Recorrido de la primera vez" data-captura="">
      <div className="recorrido-cabeza">
        <span className="recorrido-paso">
          Paso {paso + 1} de {PASOS.length}
        </span>
        <span className="recorrido-puntos" aria-hidden="true">
          {PASOS.map((p, i) => (
            <span
              key={p.id}
              className={i < paso ? "punto punto-hecho" : i === paso ? "punto punto-actual" : "punto"}
            />
          ))}
        </span>
      </div>
      <p className="recorrido-titulo">{actual.titulo}</p>
      <p className="recorrido-texto" aria-live="polite">
        {actual.texto(nombre, otro)}
      </p>
      {actual.haz && (
        <p className={cumplido ? "recorrido-haz recorrido-hecho" : "recorrido-haz"}>
          {cumplido
            ? "Hecho."
            : actual.id === "abrir" && estado.entrada.abierta
              ? "Cierra mi burbuja y ábrela otra vez, o pulsa Siguiente."
              : actual.haz}
        </p>
      )}
      <div className="recorrido-botones">
        {paso > 0 && (
          <button type="button" className="boton recorrido-atras" onClick={volver}>
            Atrás
          </button>
        )}
        {ultimo ? (
          <button
            ref={siguienteRef}
            type="button"
            className="boton boton-si"
            onClick={() => window.poke.recorrido("fin")}
          >
            Terminar
          </button>
        ) : (
          <button ref={siguienteRef} type="button" className="boton" onClick={() => ir(paso + 1, "avance")}>
            Siguiente
          </button>
        )}
        {!ultimo && (
          <button
            type="button"
            className="mini recorrido-saltar"
            onClick={() => window.poke.recorrido("fin")}
          >
            Saltar el recorrido
          </button>
        )}
      </div>
    </aside>
  );
}
