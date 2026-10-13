import type { EstadoPreparacion } from "@compartido/preparacion";
import { CANALES, type OrdenLaboratorio, type PuentePoke, type VistaPokemon } from "@compartido/tipos";
import { contextBridge, ipcRenderer } from "electron";

const oir =
  <T>(canal: string) =>
  (fn: (v: T) => void) => {
    ipcRenderer.on(canal, (_e, v: T) => fn(v));
  };

const puente: PuentePoke = {
  alVista: oir<VistaPokemon[]>(CANALES.vista),
  pedirVista: () => ipcRenderer.send(CANALES.pedirVista),
  anims: (especie) => ipcRenderer.invoke(CANALES.anims, especie),
  audioEntrada: (bloque) => ipcRenderer.send(CANALES.audioEntrada, bloque),
  microfonoEstado: (disponible) => ipcRenderer.send(CANALES.microfonoEstado, disponible),
  alMicrofonoOrden: oir(CANALES.microfonoOrden),
  alReproducir: oir(CANALES.reproducir),
  alDetener: (fn) => {
    ipcRenderer.on(CANALES.detener, () => fn());
  },
  reproduccionFin: (id) => ipcRenderer.send(CANALES.reproduccionFin, id),
  alSonar: oir(CANALES.sonar),
  ignorarMouse: (ignorar) => ipcRenderer.send(CANALES.ignorarMouse, ignorar),
  clic: () => ipcRenderer.send(CANALES.clic),
  menu: (pokemonId) => ipcRenderer.send(CANALES.menu, { pokemonId }),
  permiso: (pokemonId, permisoId, permitir) =>
    ipcRenderer.send(CANALES.permiso, { permitir, pokemonId, permisoId }),
  reintentar: (pokemonId) => ipcRenderer.send(CANALES.reintentar, { pokemonId }),
  escribir: (pokemonId, texto) => ipcRenderer.send(CANALES.escribir, { pokemonId, texto }),
  enfocar: (enfocar) => ipcRenderer.send(CANALES.enfocar, enfocar),
  comandos: (pokemonId) => ipcRenderer.invoke(CANALES.comandos, { pokemonId }),
  detener: (pokemonId) => ipcRenderer.send(CANALES.detenerTarea, { pokemonId }),
  historial: (pokemonId) => ipcRenderer.invoke(CANALES.historial, { pokemonId }),
  alOido: oir(CANALES.oido),
  copiar: (texto) => ipcRenderer.send(CANALES.copiar, texto),
  recorrido: (accion) => ipcRenderer.send(CANALES.recorrido, accion),
  alLaboratorio: oir<OrdenLaboratorio>(CANALES.laboratorio),
  pedirLaboratorio: () => ipcRenderer.send(CANALES.pedirLaboratorio),
  inicial: (respuesta) => ipcRenderer.send(CANALES.inicial, respuesta),
  labListo: () => ipcRenderer.send(CANALES.labListo),
  labFallo: () => ipcRenderer.send(CANALES.labFallo),
  elegir: (pokemonId) => ipcRenderer.send(CANALES.elegir, { pokemonId }),
  saltarAlta: (pokemonId) => ipcRenderer.send(CANALES.saltarAlta, { pokemonId }),
  alPreparacion: oir<EstadoPreparacion>(CANALES.preparacion),
  pedirPreparacion: () => ipcRenderer.send(CANALES.pedirPreparacion),
  accionPreparacion: (accion) => ipcRenderer.send(CANALES.accionPreparacion, accion),
  alPrellenar: oir(CANALES.prellenar),
  alReenviarCaptura: (fn) => {
    const oyente = () => fn();
    ipcRenderer.on(CANALES.reenviarCaptura, oyente);
    return () => {
      ipcRenderer.removeListener(CANALES.reenviarCaptura, oyente);
    };
  },
};

contextBridge.exposeInMainWorld("poke", puente);
