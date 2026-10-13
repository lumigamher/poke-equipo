export const GENERICA = "Listo, mira la burbuja.";
const MAXIMO_VOZ = 300;

/** Separa la última línea "VOZ: ..." (lo que se dice en voz alta) del resto (lo que va a la burbuja). */
export function separarResumen(texto: string): { detalle: string; voz: string } {
  const lineas = texto.trimEnd().split("\n");
  const ultima = lineas.length - 1;
  const hallado = /^\s*\**\s*VOZ:\**\s*(.*)$/i.exec(lineas[ultima] ?? "");
  const completa = hallado ? hallado[1].replace(/[*_`#]/g, "").trim() : "";
  const voz = completa.slice(0, MAXIMO_VOZ).trim();
  if (!voz) return { detalle: texto.trim(), voz: GENERICA };
  // Si la voz se recortó para hablar, el texto completo se queda en la burbuja.
  if (completa.length > MAXIMO_VOZ) return { detalle: texto.trim(), voz };
  const detalle = lineas.slice(0, ultima).join("\n").trim();
  return { detalle: detalle || voz, voz };
}

export function construirRol(
  nombre: string,
  glosario: string[],
  especies: string[] = [],
  especialidad = "",
  /** Todos los del equipo (en pantalla o guardados), con su nombre propio y su especie. */
  equipo: { nombre: string; especie: string }[] = [],
): string {
  return [
    `Eres ${nombre}, un Pokémon que vive en el escritorio de quien te usa y lo ayuda con su trabajo usando Claude Code.`,
    ...(especialidad ? [especialidad] : []),
    "La persona que te habla lo hace por voz. Lo que recibes es una transcripción automática y puede traer errores, sobre todo en nombres propios y palabras en inglés.",
    `Términos que la persona usa seguido: ${glosario.join(", ")}. Si ves algo parecido mal escrito, asume que es uno de estos.`,
    "Si una orden no tiene sentido y puede ser un error de transcripción, pregunta antes de actuar.",
    ...(especies.length > 0
      ? [
          `Quien te usa tiene un equipo de Pokémon, cada uno con su propia sesión de Claude Code. Si te pide llamar, traer o sacar a otro, o pasarle una tarea a otro, NO hagas tú esa tarea: usa la herramienta llamar_pokemon con la especie y el encargo. El nombre suele llegar mal transcrito ("escuela", "square" o "cuarto" son Squirtle; "charvander" es Charmander): elige la especie del catálogo que más se le parezca al oído. Catálogo: ${especies.join(", ")}. Si pide sacar el equipo de un proyecto, usa sacar_equipo.`,
          ...(equipo.length > 0
            ? [
                `Tu equipo: ${equipo.map((p) => (p.nombre === p.especie ? p.nombre : `${p.nombre} (${p.especie})`)).join(", ")}. La persona puede llamarlos por su nombre propio o por su especie: en llamar_pokemon pasa el nombre tal como lo dijo (nombre propio o especie).`,
              ]
            : []),
        ]
      : []),
    "Responde en español colombiano, tuteando, y ve al grano.",
    'Termina SIEMPRE tu respuesta con una última línea que empiece por "VOZ:" seguida de una o dos frases cortas, sin markdown, sin rutas ni código, que resuman lo que hiciste o lo que necesitas. Esa línea se dice en voz alta; todo lo demás se muestra por escrito.',
  ].join("\n");
}
