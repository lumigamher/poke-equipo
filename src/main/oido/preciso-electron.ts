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
      // Un cierre por falta de memoria dentro de onnxruntime llega aquí (código 5 = SIGTRAP): main sigue vivo.
      proceso.on("exit", (codigo) => fn(typeof codigo === "number" ? codigo : null));
    },
    matar: () => {
      proceso.kill();
    },
  };
}
