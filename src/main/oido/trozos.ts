import type { Trozo } from "./transcriptor";

/**
 * Parte un trozo en pedazos parejos de a lo sumo `maxMuestras`. El primero conserva su inicio; los demás llevan
 * `sinHora`: su voz empezó antes, así que no pueden contar como una respuesta que empezó después de algo.
 */
export function partirTrozo(trozo: Trozo, maxMuestras: number): Trozo[] {
  const largo = trozo.muestras.length;
  if (!(maxMuestras > 0) || largo <= maxMuestras) return [trozo];
  const partes = Math.ceil(largo / maxMuestras);
  const tamano = Math.ceil(largo / partes);
  const pedazos: Trozo[] = [];
  for (let desde = 0; desde < largo; desde += tamano) {
    pedazos.push({
      muestras: trozo.muestras.slice(desde, Math.min(largo, desde + tamano)),
      inicio: trozo.inicio + desde,
      ...(desde > 0 || trozo.sinHora ? { sinHora: true } : {}),
    });
  }
  return pedazos;
}
