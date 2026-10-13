import type { InicialVista } from "@compartido/inicial";
import type { Llegadas } from "@compartido/laboratorio";
import type { DatosAnim, EstadoOido, NombresLab, VistaPokemon } from "@compartido/tipos";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCapturaMouse } from "./captura-mouse";
import { posicionInicial } from "./disposicion";
import { Entorno } from "./Entorno";
import { LabErrorBoundary } from "./LabErrorBoundary";
import { Laboratorio } from "./Laboratorio";
import { PokemonEnEscena } from "./PokemonEnEscena";
import { Recorrido } from "./Recorrido";

/** Mientras las anims de una especie no llegan. Siempre el mismo objeto: los hooks que dependen de él no se reinician. */
const SIN_ANIMS: Record<string, DatosAnim> = Object.freeze({}) as Record<string, DatosAnim>;

/** Añade o quita `id` del conjunto; si nada cambia devuelve el mismo, y React no repinta. */
function conIdSi(conjunto: Set<string>, id: string, dentro: boolean): Set<string> {
  if (conjunto.has(id) === dentro) return conjunto;
  const nuevo = new Set(conjunto);
  if (dentro) nuevo.add(id);
  else nuevo.delete(id);
  return nuevo;
}

/**
 * La escena: dibuja a TODOS los Pokémon de la vista, cada uno con lo suyo; como mucho una burbuja abierta (la que
 * marca main) y las demás como chip. Lleva la captura del ratón (activa si
 * alguno se arrastra o el cursor está sobre algo interactivo) y decide dónde nace cada uno para que no se monten.
 */
export function Escenario({
  vistas,
  animsPorEspecie,
  laboratorio,
}: {
  vistas: VistaPokemon[];
  animsPorEspecie: Record<number, Record<string, DatosAnim>>;
  /** El laboratorio de la primera vez, mientras está abierto: recibe el ratón y el teclado. */
  laboratorio: {
    iniciales: InicialVista[];
    /** La Pokédex de Kanto del laboratorio: las 151, estén o no bajadas. */
    otras: InicialVista[];
    nombres: NombresLab;
    volverN: number;
    preparando: boolean;
    llegadas: Llegadas;
    pedirEspecie(especie: number, eleccion: boolean): void;
    reintentarEspecie(especie: number): void;
  } | null;
}) {
  const [arrastrando, setArrastrando] = useState<Set<string>>(() => new Set());
  // Captura: arrastrando, o el cursor sobre algo marcado `data-captura` (en el laboratorio, main toma el ratón por su
  // cuenta en modo "lab"; fuera de él, el propio laboratorio es un blanco más).
  const raizEncima = useCapturaMouse(arrastrando.size > 0);

  const onArrastre = useCallback((id: string, si: boolean) => setArrastrando((c) => conIdSi(c, id, si)), []);
  // Qué burbuja va abierta lo decide main (y la marca en `vista.abierta`): aquí solo se le pide.
  const onElegir = useCallback((id: string) => window.poke.elegir(id), []);

  // Dónde nació cada uno y dónde está ahora. Refs: moverse no repinta la escena.
  const iniciales = useRef(new Map<string, number>());
  const posiciones = useRef(new Map<string, number>());
  const onPosicion = useCallback((id: string, x: number) => {
    posiciones.current.set(id, x);
  }, []);

  const xDe = useCallback((id: string) => posiciones.current.get(id), []);

  // Qué hace el oído (te oigo, entendiendo, dictado). Lo muestra UNO: el de la burbuja abierta, el que escucha o
  // el primero; con seis en pantalla no parpadean todos con cada ruido.
  const [oido, setOido] = useState<EstadoOido>("atento");
  useEffect(() => window.poke.alOido(setOido), []);
  const muestraOido = (
    vistas.find((v) => v.abierta) ??
    vistas.find((v) => v.estado === "escuchando") ??
    vistas.find((v) => v.estado !== "guardandose")
  )?.id;
  // Texto grande: preferencia de la persona, igual para todos.
  const textoGrande = vistas.some((v) => v.textoGrande);
  useEffect(() => {
    document.documentElement.classList.toggle("texto-grande", textoGrande);
  }, [textoGrande]);

  // Al irse, se olvida dónde estaba: si vuelve, vuelve a buscar sitio.
  useEffect(() => {
    const presentes = new Set(vistas.map((v) => v.id));
    for (const mapa of [iniciales.current, posiciones.current])
      for (const id of mapa.keys()) if (!presentes.has(id)) mapa.delete(id);
  }, [vistas]);

  /** La x con la que nace: se calcula una sola vez, lejos de los que ya están (en su x actual). */
  const xInicialDe = (id: string): number => {
    const ya = iniciales.current.get(id);
    if (ya !== undefined) return ya;
    const ocupadas: number[] = [];
    for (const otro of vistas) {
      const x = posiciones.current.get(otro.id) ?? iniciales.current.get(otro.id);
      if (otro.id !== id && x !== undefined) ocupadas.push(x);
    }
    const x = posicionInicial(ocupadas, window.innerWidth);
    iniciales.current.set(id, x);
    return x;
  };

  return (
    <>
      <Entorno posiciones={posiciones} />
      {laboratorio && (
        <LabErrorBoundary>
          <Laboratorio
            iniciales={laboratorio.iniciales}
            otras={laboratorio.otras}
            nombres={laboratorio.nombres}
            volverN={laboratorio.volverN}
            preparando={laboratorio.preparando}
            llegadas={laboratorio.llegadas}
            pedirEspecie={laboratorio.pedirEspecie}
            reintentarEspecie={laboratorio.reintentarEspecie}
          />
        </LabErrorBoundary>
      )}
      {vistas.some((v) => v.recorrido) && <Recorrido vistas={vistas} oido={oido} />}
      {vistas.map((vista) => (
        <PokemonEnEscena
          key={vista.id}
          vista={vista}
          anims={animsPorEspecie[vista.especie] ?? SIN_ANIMS}
          animsPorEspecie={animsPorEspecie}
          xDe={xDe}
          xInicial={xInicialDe(vista.id)}
          abierta={vista.abierta === true}
          oido={vista.id === muestraOido ? oido : null}
          raizEncima={raizEncima}
          onArrastre={onArrastre}
          onElegir={onElegir}
          onPosicion={onPosicion}
        />
      ))}
    </>
  );
}
