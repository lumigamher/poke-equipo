import { Menu, nativeImage, Tray } from "electron";
import { type OpcionesBandeja, plantillaBandeja } from "./bandeja-plantilla";

export type { EntradaBandeja, OpcionesBandeja } from "./bandeja-plantilla";

/** Icono de la barra de menú: solo texto, sin imagen. Salir nunca aprueba nada: cierra y niega. */
export function crearBandeja(o: OpcionesBandeja): { actualizar(): void } {
  const bandeja = new Tray(nativeImage.createEmpty());
  bandeja.setToolTip("Poke Equipo");
  const actualizar = () => {
    bandeja.setTitle(o.microfono() ? "Poke" : "Poke (mic apagado)");
    bandeja.setContextMenu(
      Menu.buildFromTemplate(
        plantillaBandeja({
          ...o,
          // Tras cambiar el micrófono el menú se rehace para mostrar el estado nuevo.
          alMicrofono: (encendido) => {
            o.alMicrofono(encendido);
            actualizar();
          },
        }),
      ),
    );
  };
  actualizar();
  return { actualizar };
}

/** Solo "Salir": la barra de menú desde el principio de la primera vez, por si el laboratorio no se puede usar. */
export function crearBandejaSalir(): { quitar(): void } {
  const bandeja = new Tray(nativeImage.createEmpty());
  bandeja.setTitle("Poke");
  bandeja.setToolTip("Poke Equipo");
  bandeja.setContextMenu(Menu.buildFromTemplate([{ label: "Salir", role: "quit" }]));
  return { quitar: () => bandeja.destroy() };
}
