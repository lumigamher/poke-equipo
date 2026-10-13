import type { AyudanteVista, DatosAnim } from "@compartido/tipos";
import { useGolpes } from "./PokemonEnEscena";
import { miradaHacia, POSES_ACTIVIDAD } from "./sprite/actividades";
import { Sprite } from "./sprite/Sprite";

/** Separación entre ayudantes, y del primero al Pokémon. */
const PASO_PX = 62;
export const ESPACIO_AYUDANTE = 70;

/**
 * De qué lado se forman: el contrario al objeto, salvo que ahí no quepan y del otro sí (entonces van más allá del
 * objeto).
 */
export function ladoDeAyudantes(
  xPokemon: number,
  anchoVentana: number,
  ladoObjeto: "derecha" | "izquierda",
  cuantos: number,
): "derecha" | "izquierda" {
  const contrario = ladoObjeto === "derecha" ? "izquierda" : "derecha";
  const largo = ESPACIO_AYUDANTE + cuantos * PASO_PX;
  const cabe = contrario === "izquierda" ? xPokemon - largo >= 0 : xPokemon + largo <= anchoVentana;
  return cabe ? contrario : ladoObjeto;
}

/**
 * Un subagente del Pokémon, dibujado como un Pokémon pequeño a su lado: sale cuando el subagente empieza, muestra
 * lo que hace (su rótulo y sus golpes) y se va cuando termina. No lleva objeto ni poder: el escritorio es de su
 * Pokémon. Decorativo: no recibe el mouse ni se anuncia.
 */
export function Ayudante({
  ayudante,
  numero,
  anims,
  puesto,
  lado,
  desde,
}: {
  ayudante: AyudanteVista;
  /** El número con el que aparece en el cuadro de la tarea de su Pokémon. */
  numero: number;
  anims: Record<string, DatosAnim> | undefined;
  /** 0 = el más cercano al Pokémon. */
  puesto: number;
  lado: "derecha" | "izquierda";
  /** Distancia del primero al Pokémon. */
  desde: number;
}) {
  const tipo = ayudante.actividad?.tipo ?? "pensando";
  const golpe = useGolpes(POSES_ACTIVIDAD[tipo].golpes, anims ?? SIN_ANIMS, tipo);
  if (!anims) return null;
  const distancia = desde + puesto * PASO_PX;
  // Mira hacia su Pokémon, que está del otro lado.
  const mirada = miradaHacia(lado === "derecha" ? "izquierda" : "derecha");
  return (
    <div
      className="ayudante"
      aria-hidden="true"
      style={
        lado === "derecha" ? { left: "50%", marginLeft: distancia } : { right: "50%", marginRight: distancia }
      }
    >
      {/* Su número es el del cuadro de la tarea, donde está qué hace; aquí, solo quién es. */}
      <div className="ayudante-rotulo">
        <span className="ayudante-numero">{numero}</span>
        {ayudante.actividad?.verbo ?? "Ayudando"}
      </div>
      <Sprite
        especie={ayudante.especie}
        estado="trabajando"
        direccion={mirada}
        anims={anims}
        actividad={tipo}
        unaVez={golpe ? { anim: golpe.anim, frente: false } : null}
      />
    </div>
  );
}

const SIN_ANIMS: Record<string, DatosAnim> = {};
