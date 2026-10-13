import type { InicialVista } from "@compartido/inicial";
import {
  aplicarLlegada,
  type Llegadas,
  llegadasIniciales,
  quitarFallo,
  validarLlegada,
} from "@compartido/laboratorio";
import type { DatosAnim, NombresLab, VistaPokemon } from "@compartido/tipos";
import { useCallback, useEffect, useRef, useState } from "react";
import { Escenario } from "./Escenario";
import { guardarPrellenado, olvidarPrellenadoSiSeFue } from "./prellenado";
import { olvidarAnims, precargarHojas } from "./sprite/Sprite";

/** El montaje: escucha la vista, carga las anims de cada especie presente (una vez por especie) y dibuja la escena. */
export function App() {
  const [vistas, setVistas] = useState<VistaPokemon[]>([]);
  const [animsPorEspecie, setAnimsPorEspecie] = useState<Record<number, Record<string, DatosAnim>>>({});
  const pedidas = useRef(new Set<number>());
  // Laboratorio de la primera vez: main lo abre, lo devuelve a la elección (carpeta cancelada) y lo cierra.
  const [iniciales, setIniciales] = useState<InicialVista[] | null>(null);
  const [otras, setOtras] = useState<InicialVista[]>([]);
  const [nombres, setNombres] = useState<NombresLab>({ reservadas: [], mando: [], especies: [] });
  const [llegadas, setLlegadas] = useState<Llegadas>(() => llegadasIniciales([]));
  const [volverN, setVolverN] = useState(0);
  const [preparando, setPreparando] = useState(false);

  useEffect(() => {
    window.poke.alVista(setVistas);
    // La primera vista puede haber salido antes de suscribirse: se pide una vez.
    window.poke.pedirVista();
    window.poke.alPrellenar(guardarPrellenado);
    window.poke.alLaboratorio((orden) => {
      if (orden.tipo === "abrir") {
        setPreparando(false);
        setNombres(orden.nombres);
        setOtras(orden.otras);
        setLlegadas(llegadasIniciales(orden.listas));
        setIniciales(orden.iniciales);
      } else if (orden.tipo === "volver") setVolverN((n) => n + 1);
      else if (orden.tipo === "preparando") setPreparando(true);
      else {
        setIniciales(null);
        setPreparando(false);
      }
    });
    // Las especies de la Pokédex que van llegando de fondo (o fallan): lo que main avisa no se cree, se valida.
    window.poke.alEspecieLab((dato) => {
      const ll = validarLlegada(dato);
      if (!ll) return;
      // Antes de marcarla lista se olvida lo recordado de ella: pudo pedirse sin archivos y recordarse vacía.
      if (ll.ok) olvidarAnims(ll.especie);
      setLlegadas((l) => aplicarLlegada(l, ll));
    });
    window.poke.pedirLaboratorio();
  }, []);

  /** Pide bajar con prioridad una especie que aún no está (la marcada o la elegida en la Pokédex). */
  const pedirEspecie = useCallback(
    (especie: number, eleccion: boolean) => window.poke.pedirEspecie(especie, eleccion),
    [],
  );
  /** Reintentar tras un fallo: deja de figurar como fallida; el laboratorio la vuelve a pedir (una sola vez). */
  const reintentarEspecie = useCallback((especie: number) => {
    setLlegadas((l) => quitarFallo(l, especie));
  }, []);

  const idsAntes = useRef<string[]>([]);
  useEffect(() => {
    const ahora = vistas.map((v) => v.id);
    olvidarPrellenadoSiSeFue(idsAntes.current, ahora);
    idsAntes.current = ahora;
  }, [vistas]);

  useEffect(() => {
    // Las especies en pantalla y las de sus ayudantes.
    const especies = vistas.flatMap((v) => [v.especie, ...(v.ayudantes ?? []).map((a) => a.especie)]);
    for (const especie of especies) {
      if (pedidas.current.has(especie)) continue;
      pedidas.current.add(especie);
      window.poke.anims(especie).then(
        (a) => {
          precargarHojas(especie, a);
          setAnimsPorEspecie((m) => ({ ...m, [especie]: a }));
        },
        // Si falla, la próxima vista lo vuelve a intentar.
        () => pedidas.current.delete(especie),
      );
    }
  }, [vistas]);

  return (
    <Escenario
      vistas={vistas}
      animsPorEspecie={animsPorEspecie}
      laboratorio={
        iniciales
          ? { iniciales, otras, nombres, volverN, preparando, llegadas, pedirEspecie, reintentarEspecie }
          : null
      }
    />
  );
}
