import type { InicialVista } from "@compartido/inicial";
import type { DatosAnim, NombresLab, VistaPokemon } from "@compartido/tipos";
import { useEffect, useRef, useState } from "react";
import { Escenario } from "./Escenario";
import { guardarPrellenado, olvidarPrellenadoSiSeFue } from "./prellenado";
import { precargarHojas } from "./sprite/Sprite";

/** El montaje: escucha la vista, carga las anims de cada especie presente (una vez por especie) y dibuja la escena. */
export function App() {
  const [vistas, setVistas] = useState<VistaPokemon[]>([]);
  const [animsPorEspecie, setAnimsPorEspecie] = useState<Record<number, Record<string, DatosAnim>>>({});
  const pedidas = useRef(new Set<number>());
  // Laboratorio de la primera vez: main lo abre, lo devuelve a la elección (carpeta cancelada) y lo cierra.
  const [iniciales, setIniciales] = useState<InicialVista[] | null>(null);
  const [otras, setOtras] = useState<InicialVista[]>([]);
  const [nombres, setNombres] = useState<NombresLab>({ reservadas: [], mando: [], especies: [] });
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
        setIniciales(orden.iniciales);
      } else if (orden.tipo === "volver") setVolverN((n) => n + 1);
      else if (orden.tipo === "preparando") setPreparando(true);
      else {
        setIniciales(null);
        setPreparando(false);
      }
    });
    window.poke.pedirLaboratorio();
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
      laboratorio={iniciales ? { iniciales, otras, nombres, volverN, preparando } : null}
    />
  );
}
