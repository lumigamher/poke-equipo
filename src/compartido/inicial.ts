import { type Tipo, tipoDe } from "./tipo-especie";

/** Un Pokémon que se ofrece en el laboratorio, tal como lo dibuja el renderer. */
export interface InicialVista {
  especie: number;
  nombre: string;
  /** Cómo se ve escrito en el juego, si no es el nombre («Mr. Mime», «Nidoran♀»). */
  titulo?: string;
  tipo: Tipo;
  /** El tipo escrito para leerlo ("Planta"). */
  tipoNombre: string;
  /** El modelo de Claude que le toca por su tipo (config/tipos.json): "sonnet", "opus"... */
  modelo: string;
  /** En una línea, en tercera persona, para qué es bueno. */
  resumen: string;
}

export const TIPO_NOMBRE: Record<Tipo, string> = {
  electrico: "Eléctrico",
  fuego: "Fuego",
  agua: "Agua",
  planta: "Planta",
  hada: "Hada",
  fantasma: "Fantasma",
  psiquico: "Psíquico",
  lucha: "Lucha",
  normal: "Normal",
  bicho: "Bicho",
  veneno: "Veneno",
  tierra: "Tierra",
  roca: "Roca",
  hielo: "Hielo",
  dragon: "Dragón",
};

/** Los cuatro del laboratorio, en el orden del juego. Su tipo decide el modelo y la especialidad (config/tipos.json). */
const INICIALES: { especie: number; nombre: string; tipo: Tipo; resumen: string }[] = [
  {
    especie: 1,
    nombre: "Bulbasaur",
    tipo: "planta",
    resumen: "Escribe las pruebas primero y deja todo en verde.",
  },
  {
    especie: 4,
    nombre: "Charmander",
    tipo: "fuego",
    resumen: "Cuida los despliegues: todo limpio y en verde antes de publicar.",
  },
  {
    especie: 7,
    nombre: "Squirtle",
    tipo: "agua",
    resumen: "Deja el código limpio: quita lo muerto y lo duplicado.",
  },
  {
    especie: 25,
    nombre: "Pikachu",
    tipo: "electrico",
    resumen: "Es rápido: búsquedas, lecturas y tareas cortas.",
  },
];

/** Las especies de los iniciales, en el mismo orden que la lista. */
export const INICIALES_ESPECIES = INICIALES.map((i) => i.especie);

/** Los iniciales con el modelo que su tipo tiene en la configuración. */
export function inicialesVista(tipos: Record<Tipo, { modelo: string }>): InicialVista[] {
  return INICIALES.map((i) => ({ ...i, tipoNombre: TIPO_NOMBRE[i.tipo], modelo: tipos[i.tipo].modelo }));
}

/** Para el recorrido: un inicial para "llama a…" que no sea el Pokémon que ya está hablando. */
export function otroInicial(nombre: string): string {
  const sugerido = ["Squirtle", "Charmander"].find((n) => n !== nombre);
  return sugerido ?? "Squirtle";
}

/** Lo que hace cada tipo, en una línea y en tercera persona, para los de la Pokédex de Kanto (los cuatro iniciales traen la suya). */
export const RESUMEN_TIPO: Record<Tipo, string> = {
  electrico: "Es rápido: búsquedas, lecturas y tareas cortas.",
  fuego: "Cuida los despliegues: todo limpio y en verde antes de publicar.",
  agua: "Deja el código limpio: quita lo muerto y lo duplicado.",
  planta: "Escribe las pruebas primero y deja todo en verde.",
  hada: "Cuida la interfaz: el detalle visual y la accesibilidad.",
  fantasma: "Caza bugs: los reproduce antes de arreglarlos y busca la causa de raíz.",
  psiquico: "Piensa la arquitectura: plantea el diseño y un plan corto antes de tocar código.",
  lucha: "Revisa el código: busca errores reales, no estilo.",
  normal: "Hace de todo un poco.",
  bicho: "Mantiene la documentación al día: README, comentarios y notas de cambios.",
  veneno: "Vigila la seguridad: secretos expuestos, entradas sin validar y dependencias riesgosas.",
  tierra: "Cuida los datos: esquemas, migraciones y consultas.",
  roca: "Mide el rendimiento antes de optimizar.",
  hielo: "Investiga con calma: lee mucho antes de opinar y no toca nada.",
  dragon: "Se encarga de las tareas grandes: las parte en pasos pequeños y las termina.",
};

/** Último número de la Pokédex de Kanto. */
export const ULTIMO_KANTO = 151;

/**
 * Las especies de Kanto que se ofrecen en la Pokédex del laboratorio: las `disponibles` (main ya comprobó que tienen
 * sus sprites) que son de Kanto, en orden de Pokédex, con su tipo y el modelo que ese tipo tiene en la configuración.
 */
export function otrasVista(
  tipos: Record<Tipo, { modelo: string }>,
  disponibles: readonly { especie: number; nombre: string; titulo?: string }[],
): InicialVista[] {
  return disponibles
    .filter((e) => Number.isInteger(e.especie) && e.especie >= 1 && e.especie <= ULTIMO_KANTO)
    .sort((a, b) => a.especie - b.especie)
    .map((e) => {
      const tipo = tipoDe(e.especie);
      return {
        especie: e.especie,
        nombre: e.nombre,
        ...(e.titulo ? { titulo: e.titulo } : {}),
        tipo,
        tipoNombre: TIPO_NOMBRE[tipo],
        modelo: tipos[tipo].modelo,
        // Los cuatro iniciales conservan su propia ficha aunque se elijan desde la Pokédex.
        resumen: INICIALES.find((i) => i.especie === e.especie)?.resumen ?? RESUMEN_TIPO[tipo],
      };
    });
}
