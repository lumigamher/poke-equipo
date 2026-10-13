import { utilityProcess } from "electron";
import type { HijoPreciso } from "./preciso";
import rutaProceso from "./preciso-proceso?modulePath";
import type { ModeloTranscriptor } from "./transcriptor";

/** Lanza el proceso aparte que carga el modelo preciso. */
export function lanzarProcesoPreciso(
  modelo: ModeloTranscriptor,
  dirModelos: string,
  nombre = "poke-preciso",
): HijoPreciso {
  const proceso = utilityProcess.fork(rutaProceso, [`--modelo=${modelo}`, `--modelos=${dirModelos}`], {
    serviceName: nombre,
  });
  return {
    enviar: (m) => proceso.postMessage(m),
    alMensaje: (fn) => {
      proceso.on("message", fn);
    },
    alSalir: (fn) => {
      proceso.on("exit", () => fn());
    },
    matar: () => {
      proceso.kill();
    },
  };
}
