import { MODELOS } from "@compartido/modelos";
import type { MenuItemConstructorOptions } from "electron";

/** Un Pokémon del equipo en la barra de menú: `activo` = vivo en pantalla; si no, se ofrece sacarlo. */
export interface EntradaBandeja {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface OpcionesBandeja {
  microfono(): boolean;
  alMicrofono(encendido: boolean): void;
  /** Todos: los activos (vivos en pantalla) y los que se pueden sacar. */
  equipo(): EntradaBandeja[];
  alGuardar(id: string): void;
  alSacar(id: string): void;
  alCambiarProyecto(id: string): void;
  alCambiarNombre(id: string): void;
  /** Con qué modelo corre ahora (null si no se sabe). */
  modeloDe(id: string): string | null;
  alCambiarModelo(id: string, modelo: string): void;
}

/**
 * El submenú «Modelo»: las tres opciones como radios, con la efectiva marcada. Lo comparten la barra de menú y el
 * clic derecho. Elegir cambia la sesión como `/model` y lo deja guardado; no toca permisos.
 */
export function submenuModelo(
  efectivo: string | null,
  alElegir: (modelo: string) => void,
): MenuItemConstructorOptions {
  return {
    label: "Modelo",
    submenu: MODELOS.map((m) => ({
      label: `${m.nombre} · ${m.linea}`,
      type: "radio" as const,
      checked: m.id === efectivo,
      click: () => alElegir(m.id),
    })),
  };
}

/**
 * Qué lista la bandeja: los vivos en pantalla (con el nombre de su vista) como activos, y el resto de la base para
 * sacar. Uno que está en pantalla pero guardándose no aparece: ni se puede guardar otra vez ni sacar todavía.
 */
export function entradasBandeja(
  base: readonly { id: string; nombre: string }[],
  enPantalla: readonly { id: string; nombre: string }[],
  vivo: (id: string) => boolean,
): EntradaBandeja[] {
  const ids = new Set(enPantalla.map((v) => v.id));
  return [
    ...enPantalla.filter((v) => vivo(v.id)).map((v) => ({ id: v.id, nombre: v.nombre, activo: true })),
    ...base.filter((p) => !ids.has(p.id)).map((p) => ({ id: p.id, nombre: p.nombre, activo: false })),
  ];
}

/**
 * Plantilla pura del menú de la barra (se prueba sin Electron). Ninguna opción toca permisos: guardar, cambiar de
 * proyecto y salir solo niegan lo pendiente.
 */
export function plantillaBandeja(o: OpcionesBandeja): MenuItemConstructorOptions[] {
  const equipo = o.equipo();
  const activos = equipo.filter((e) => e.activo);
  const guardados = equipo.filter((e) => !e.activo);
  const t: MenuItemConstructorOptions[] = [
    {
      label: "Micrófono",
      type: "checkbox",
      checked: o.microfono(),
      click: (item) => o.alMicrofono(item.checked),
    },
  ];
  if (activos.length > 0) {
    t.push({ type: "separator" });
    for (const e of activos)
      t.push({
        label: e.nombre,
        submenu: [
          { label: "Guardar en la pokébola", click: () => o.alGuardar(e.id) },
          { label: "Cambiar de proyecto…", click: () => o.alCambiarProyecto(e.id) },
          { label: "Cambiar nombre…", click: () => o.alCambiarNombre(e.id) },
          submenuModelo(o.modeloDe(e.id), (modelo) => o.alCambiarModelo(e.id, modelo)),
        ],
      });
  }
  if (guardados.length > 0) {
    t.push({ type: "separator" });
    for (const e of guardados) t.push({ label: `Sacar a ${e.nombre}`, click: () => o.alSacar(e.id) });
  }
  t.push({ type: "separator" }, { label: "Salir", role: "quit" });
  return t;
}
