import { esNoche, PASO_DE_NOCHE } from "@compartido/dia-noche";
import { debeEntrar, ENTRADA_MS } from "@compartido/entrada";
import type { DatosAnim, Estado, EstadoOido, VistaPokemon } from "@compartido/tipos";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Ayudante, ESPACIO_AYUDANTE, ladoDeAyudantes } from "./Ayudante";
import { BarraPS } from "./BarraPS";
import { Burbuja } from "./Burbuja";
import { BurbujaChip } from "./BurbujaChip";
import { debeMostrarse, posicionBurbuja } from "./burbuja-logica";
import { REDUCIDO, useReducido } from "./ceremonia-hooks";
import { MARGEN } from "./disposicion";
import { ALTO_RESERVADO, ladoBurbuja, limitarLugar, soltar } from "./lugar";
import { Pokebola } from "./Pokebola";
import { Progreso } from "./Progreso";
import {
  ESPACIO_OBJETO,
  type Golpes,
  ladoObjeto,
  miradaHacia,
  POSES_ACTIVIDAD,
  vaiven,
} from "./sprite/actividades";
import type { Direccion } from "./sprite/animaciones";
import {
  ATERRIZAJE,
  animColgado,
  avanzar,
  elegirSinRepetir,
  poseDe,
  REACCIONES,
  TRAVESURAS,
} from "./sprite/animaciones";
import { Objeto } from "./sprite/Objeto";
import { Poder, VUELO_MS } from "./sprite/Poder";
import { golpeNumero, planGolpe, primerGolpe, tipoDe } from "./sprite/poderes";
import { ESCALA, Sprite } from "./sprite/Sprite";
import {
  ANCHO_MAX,
  ANCHO_MIN,
  limitarTamano,
  TAMANO_INICIAL,
  type Tamano,
  tamanoTrasArrastre,
} from "./tamano-burbuja";

const MARGEN_BURBUJA = 8;
/** Lo mínimo que debe caber arriba para abrir la burbuja hacia arriba; si no, se abre hacia donde haya más espacio. */
const MIN_BURBUJA = 260;
/** Cuánto cambia el tamaño de la burbuja con cada flecha del teclado sobre el agarre. */
const PASO_TECLADO = 24;
const RADIO_COLA = 14;

/**
 * Posición horizontal del Pokémon. Camina solo si `paso` es mayor que cero.
 * La posición y el sentido viven en refs: son la única fuente de verdad, también al arrastrar.
 * `xInicial` solo cuenta al montarse: después la x es del paseo y del arrastre.
 */
export function usePaseo(paso: number, xInicial: number) {
  const xRef = useRef(xInicial);
  const sentido = useRef<1 | -1>(1);
  const [x, setXEstado] = useState(() => Math.round(xRef.current));
  const [direccion, setDireccion] = useState<Direccion>("derecha");

  // Se dibuja en píxeles enteros: con decimales el pixel art cambia de ancho al moverse y tiembla.
  // De paso, React solo repinta cuando la x visible cambia.
  const setX = useCallback((nuevo: number) => {
    xRef.current = nuevo;
    setXEstado(Math.round(nuevo));
  }, []);

  useEffect(() => {
    if (paso === 0) return;
    let cuadro = 0;
    let anterior = performance.now();
    const tick = (ahora: number) => {
      const ancho = window.innerWidth - 2 * MARGEN;
      const r = avanzar(xRef.current - MARGEN, sentido.current, paso, ahora - anterior, ancho);
      anterior = ahora;
      sentido.current = r.sentido;
      setX(r.x + MARGEN);
      setDireccion(r.sentido === 1 ? "derecha" : "izquierda");
      cuadro = requestAnimationFrame(tick);
    };
    cuadro = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(cuadro);
  }, [paso, setX]);

  return { x, setX, direccion };
}

/** Cada cuánto, mientras pasea, se detiene a hacer algo; y cuánto le dura. */
const TRAVESURA_CADA_MS: [number, number] = [7000, 14000];
const TRAVESURA_DURA_MS = 1800;

/** De vez en cuando, mientras pasea, se para y hace algo distinto a lo último que hizo. */
export function useTravesura(activo: boolean, anims: Record<string, DatosAnim>): string | null {
  const [actual, setActual] = useState<string | null>(null);
  const ultima = useRef<string | null>(null);
  useEffect(() => {
    if (!activo) {
      setActual(null);
      return;
    }
    let reloj = 0;
    const programar = () => {
      const [min, max] = TRAVESURA_CADA_MS;
      reloj = window.setTimeout(
        () => {
          const nueva = elegirSinRepetir(TRAVESURAS, anims, ultima.current, Math.random);
          ultima.current = nueva;
          setActual(nueva);
          reloj = window.setTimeout(() => {
            setActual(null);
            programar();
          }, TRAVESURA_DURA_MS);
        },
        min + Math.random() * (max - min),
      );
    };
    programar();
    return () => clearTimeout(reloj);
  }, [activo, anims]);
  return actual;
}

/**
 * Paseo corto de ida y vuelta frente al objeto. Un solo requestAnimationFrame, que se cancela
 * al desmontar y al cambiar de actividad (`clave`). Sin movimiento si el usuario lo prefiere,
 * y el cambio de esa preferencia se atiende al momento.
 */
export function useVaiven(activo: boolean, clave: string | null) {
  const [paso, setPaso] = useState<{ dx: number; direccion: Direccion } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `clave` solo reinicia el reloj del vaivén
  useEffect(() => {
    if (!activo) {
      setPaso(null);
      return;
    }
    const consulta = window.matchMedia(REDUCIDO);
    let cuadro = 0;
    const parar = () => {
      cancelAnimationFrame(cuadro);
      cuadro = 0;
    };
    const arrancar = () => {
      parar();
      if (consulta.matches) {
        setPaso(null);
        return;
      }
      const inicio = performance.now();
      const tick = (ahora: number) => {
        setPaso(vaiven(ahora - inicio));
        cuadro = requestAnimationFrame(tick);
      };
      cuadro = requestAnimationFrame(tick);
    };
    arrancar();
    consulta.addEventListener("change", arrancar);
    return () => {
      consulta.removeEventListener("change", arrancar);
      parar();
    };
  }, [activo, clave]);
  return paso;
}

/** True de noche; se revisa cada minuto. */
export function useNoche(): boolean {
  const [noche, setNoche] = useState(() => esNoche(new Date().getHours()));
  useEffect(() => {
    const reloj = window.setInterval(() => setNoche(esNoche(new Date().getHours())), 60_000);
    return () => clearInterval(reloj);
  }, []);
  return noche;
}

/** En combate alternan lo que lanzan con lo que pegan; el poder de su tipo vuela hasta el rival. */
const GOLPES_COMBATE: Golpes = {
  anims: ["Shoot", "Attack", "Swing"],
  rotar: true,
  cadaMs: 1500,
  poder: "proyectil",
};
/** Lo que tarda el defensor en contestar al primer golpe del retador. */
const CONTRAGOLPE_MS = 1000;

/** Lo que tarda en soltar el primer golpe al empezar una actividad: que primero se vea el objeto. */
const PRIMER_GOLPE_MS = 900;

export interface GolpeEnCurso {
  anim: string;
  /** Cuenta los golpes de esta actividad: cada uno monta su propio poder. */
  n: number;
  /** Milisegundos desde que empieza el golpe hasta que conecta. */
  conectaMs: number;
}

/**
 * Mientras trabaja en algo con `golpes`, cada tanto suelta un ataque de una sola pasada y vuelve a la calma. El
 * reloj se reinicia al cambiar de actividad (`clave`). Sin golpes si el usuario prefiere menos movimiento.
 */
export function useGolpes(
  golpes: Golpes | undefined,
  anims: Record<string, DatosAnim>,
  clave: string | null,
  primeroMs = PRIMER_GOLPE_MS,
): GolpeEnCurso | null {
  const [actual, setActual] = useState<GolpeEnCurso | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `clave` solo reinicia el reloj de los golpes
  useEffect(() => {
    setActual(null);
    if (!golpes) return;
    const consulta = window.matchMedia(REDUCIDO);
    let reloj = 0;
    let n = 0;
    const programar = (espera: number) => {
      reloj = window.setTimeout(() => {
        const anim = golpes.rotar ? golpeNumero(golpes.anims, anims, n) : primerGolpe(golpes.anims, anims);
        if (anim === null) return;
        const plan = planGolpe(anims[anim]);
        setActual({ anim, n, conectaMs: plan.conectaMs });
        n += 1;
        reloj = window.setTimeout(() => {
          setActual(null);
          programar(golpes.cadaMs);
        }, plan.duracionMs);
      }, espera);
    };
    const arrancar = () => {
      clearTimeout(reloj);
      setActual(null);
      if (!consulta.matches) programar(primeroMs);
    };
    arrancar();
    consulta.addEventListener("change", arrancar);
    return () => {
      consulta.removeEventListener("change", arrancar);
      clearTimeout(reloj);
    };
  }, [golpes, anims, clave, primeroMs]);
  return actual;
}

/** Una animación de una sola pasada que se lanza a mano (despertar, caer al suelo) y se quita sola al terminar. */
export function useUnaVez(anims: Record<string, DatosAnim>): [string | null, (lista: string[]) => void] {
  const [actual, setActual] = useState<string | null>(null);
  const reloj = useRef(0);
  useEffect(() => () => clearTimeout(reloj.current), []);
  const lanzar = useCallback(
    (lista: string[]) => {
      const anim = primerGolpe(lista, anims);
      if (anim === null || window.matchMedia(REDUCIDO).matches) return;
      clearTimeout(reloj.current);
      setActual(anim);
      reloj.current = window.setTimeout(() => setActual(null), planGolpe(anims[anim]).duracionMs);
    },
    [anims],
  );
  return [actual, lanzar];
}

function rotuloCombate(c: NonNullable<VistaPokemon["combate"]>): string {
  if (c.resultado === "gana") return "¡Ganó!";
  if (c.resultado === "pierde") return "Cayó";
  return c.papel === "retador" ? "Revisando en combate" : "Defendiendo su trabajo";
}

/** UN Pokémon en la escena: su paseo, sus travesuras, su arrastre, sus reacciones, su pokébola y su burbuja. */
export function PokemonEnEscena({
  vista,
  anims,
  animsPorEspecie,
  xDe,
  xInicial,
  altoInicial = 0,
  asomado = false,
  abierta,
  oido = null,
  raizEncima,
  onArrastre,
  onElegir,
  onPosicion,
}: {
  vista: VistaPokemon;
  anims: Record<string, DatosAnim>;
  /** Las anims de todas las especies cargadas: las de sus ayudantes salen de aquí. */
  animsPorEspecie?: Record<number, Record<string, DatosAnim>>;
  /** La x actual de otro Pokémon de la escena: en un combate se miran y se lanzan los poderes. */
  xDe?: (id: string) => number | undefined;
  /** Dónde empieza (px). Solo cuenta al montarse. */
  xInicial: number;
  /** A qué altura sobre el suelo empieza (px; 0 = en el suelo). Solo cuenta al montarse. */
  altoInicial?: number;
  /** Está en la incubadora y asoma porque te necesita: se queda junto a su pokébola, sin pasear. */
  asomado?: boolean;
  /**
   * Si su burbuja es LA abierta (`vista.abierta`, marcada por main). Abierta: se dibuja entera (con el permiso, si lo
   * hay). Cerrada: como mucho un chip; el bloque del permiso nunca se dibuja en un chip.
   */
  abierta: boolean;
  /** Qué hace el oído ahora mismo; null si no es este Pokémon quien lo muestra. */
  oido?: EstadoOido | null;
  /** La raíz `[data-captura]` que hay bajo el cursor (la mide `useCapturaMouse`); de ahí sale su "encima". */
  raizEncima: Element | null;
  /** Para la captura del ratón: se está arrastrando (y no se está guardando). */
  onArrastre(id: string, arrastrando: boolean): void;
  /** Clic sobre él o sobre su chip: pide a main que su burbuja sea la abierta (o la suelta si ya lo era). */
  onElegir(id: string): void;
  /** Su x actual, para que el que nazca después no le caiga encima. Se guarda en un ref: no repinta la escena. */
  onPosicion(id: string, x: number): void;
}) {
  const { id, estado } = vista;
  const reducido = useReducido();
  const raiz = useRef<HTMLDivElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  /** En el aire: se está arrastrando de verdad (no es un clic). */
  const [alzado, setAlzado] = useState(false);
  const arrastre = useRef<{
    inicio: number;
    inicioY: number;
    desfase: number;
    altoInicio: number;
    movido: boolean;
  } | null>(null);
  /** Px sobre el suelo: 0 = en el suelo (pasea); más = posado donde lo dejaron (reposa). */
  const [alto, setAlto] = useState(altoInicial);
  // Tamaño de la burbuja: el que viene de main, o el que se está ajustando ahora con el agarre.
  const [tamLocal, setTamLocal] = useState<Tamano | null>(null);
  const ajuste = useRef<{ x: number; y: number; inicio: Tamano } | null>(null);
  const [ajustando, setAjustando] = useState(false);

  // La abierta se dibuja aunque no tenga nada nuevo (la persona la eligió: su última respuesta o el campo para escribirle);
  // cerrada, solo un chip si tiene algo que decir.
  const mostrar = abierta && debeMostrarse(vista, true);
  const chip = !abierta && debeMostrarse(vista, false);

  // La captura del ratón es de la escena entera: este Pokémon solo avisa de lo suyo.
  const guardando = estado === "guardandose";
  // El cursor está sobre él: lo dice la medición con elementFromPoint, que sigue valiendo aunque cambie su estado,
  // se abra o cierre su burbuja o se mueva él bajo un cursor quieto (nada lo borra a ciegas).
  const encima = raizEncima !== null && raizEncima === raiz.current;
  // La pokébola de entrada dura ENTRADA_MS desde que aparece o vuelve a salir, aunque su estado cambie enseguida
  // (p. ej. sale ya con un encargo y pasa a `trabajando`): no se corta a medias.
  const [entrando, setEntrando] = useState(() => debeEntrar(null, estado));
  const estadoPrevio = useRef<Estado | null>(null);
  useEffect(() => {
    const antes = estadoPrevio.current;
    estadoPrevio.current = estado;
    if (estado === "guardandose") setEntrando(false);
    else if (antes !== null && debeEntrar(antes, estado)) setEntrando(true);
  }, [estado]);
  useEffect(() => {
    if (!entrando) return;
    const t = setTimeout(() => setEntrando(false), ENTRADA_MS);
    return () => clearTimeout(t);
  }, [entrando]);
  const capturaArrastre = !guardando && (arrastrando || ajustando);
  useEffect(() => onArrastre(id, capturaArrastre), [id, capturaArrastre, onArrastre]);
  // Al irse de la escena deja de contar, aunque se fuera con el cursor encima.
  useEffect(
    () => () => {
      onArrastre(id, false);
    },
    [id, onArrastre],
  );

  // Cada vez que el cursor llega, una reacción distinta de la anterior.
  const [reaccion, setReaccion] = useState<string | null>(null);
  const ultimaReaccion = useRef<string | null>(null);
  useEffect(() => {
    if (!encima || arrastrando) return;
    const nueva = elegirSinRepetir(REACCIONES, anims, ultimaReaccion.current, Math.random);
    ultimaReaccion.current = nueva;
    setReaccion(nueva);
  }, [encima, arrastrando, anims]);
  const travesura = useTravesura(estado === "paseando" && !encima && !arrastrando, anims);

  // Pasadas sueltas: se despereza al despertar, se queja al fallar y cae de costado cuando lo sueltan.
  const [pasada, lanzarPasada] = useUnaVez(anims);
  const estadoAnterior = useRef(estado);
  useEffect(() => {
    const antes = estadoAnterior.current;
    estadoAnterior.current = estado;
    if (antes === estado) return;
    if (antes === "dormido" && estado !== "guardandose") lanzarPasada(["Wake"]);
    else if (estado === "error") lanzarPasada(["Hurt"]);
  }, [estado, lanzarPasada]);

  // Combate de revisión: los dos se plantan, se miran y se lanzan ataques hasta que haya veredicto.
  const combate = vista.combate ?? null;
  const peleando = combate !== null && combate.resultado === undefined;
  const quieto =
    encima ||
    arrastrando ||
    travesura !== null ||
    pasada !== null ||
    combate !== null ||
    // La persona le pidió quedarse donde está: no pasea, pero se puede arrastrar a otro sitio.
    vista.quieto === true ||
    // Posado lejos del suelo, o asomado junto a su pokébola: reposa ahí.
    alto > 0 ||
    asomado;
  const noche = useNoche();
  const {
    x,
    setX,
    direccion: direccionPaseo,
  } = usePaseo(poseDe(estado, quieto).paso * (noche ? PASO_DE_NOCHE : 1), xInicial);
  useEffect(() => onPosicion(id, x), [id, x, onPosicion]);
  const actividad = estado === "trabajando" ? (vista.actividad ?? null) : null;
  // En combate no hay escritorio: el objeto y los golpes de la actividad ceden a los del combate.
  const poseActividad = actividad && !combate ? POSES_ACTIVIDAD[actividad.tipo] : null;
  const paso = useVaiven(poseActividad?.vaiven ?? false, actividad?.tipo ?? null);
  const xRival = combate ? xDe?.(combate.rivalId) : undefined;
  const ladoRival = xRival !== undefined && xRival < x ? "izquierda" : "derecha";
  const golpe = useGolpes(
    peleando ? GOLPES_COMBATE : poseActividad?.golpes,
    anims,
    peleando ? "combate" : (actividad?.tipo ?? null),
    // El defensor contesta a destiempo: no pegan los dos a la vez.
    peleando && combate?.papel === "defensor" ? PRIMER_GOLPE_MS + CONTRAGOLPE_MS : PRIMER_GOLPE_MS,
  );
  const finCombate = combate?.resultado
    ? primerGolpe(combate.resultado === "gana" ? ["Pose", "Hop"] : ["Faint", "Hurt", "Pain"], anims)
    : null;
  const objetoRef = useRef<HTMLDivElement>(null);
  const modoPoder = poseActividad?.golpes?.poder ?? null;
  const golpeN = golpe?.n ?? null;
  const conectaMs = golpe?.conectaMs ?? 0;
  // El objeto se sacude cuando el golpe le llega.
  useEffect(() => {
    if (golpeN === null) return;
    const animacion = objetoRef.current?.animate?.(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(3px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(0)" },
      ],
      {
        duration: 180,
        delay: conectaMs + (modoPoder === "proyectil" ? VUELO_MS : 0),
        easing: "steps(3, end)",
      },
    );
    return () => animacion?.cancel();
  }, [golpeN, conectaMs, modoPoder]);
  const lado = ladoObjeto(x, window.innerWidth, ESPACIO_OBJETO);
  // Los ayudantes se forman del lado contrario al objeto, salvo que ahí se salgan de la ventana.
  const cuantos = vista.ayudantes?.length ?? 0;
  const ladoAyudantes = ladoDeAyudantes(x, window.innerWidth, lado, cuantos);
  const direccion =
    (combate ? miradaHacia(ladoRival) : undefined) ??
    paso?.direccion ??
    (poseActividad?.mirarObjeto && poseActividad.objeto ? miradaHacia(lado) : direccionPaseo);

  const terminarArrastre = (esClic: boolean) => {
    const a = arrastre.current;
    arrastre.current = null;
    setArrastrando(false);
    setAlzado(false);
    if (a?.movido) {
      // Cerca del suelo vuelve a pasear; más arriba queda posado. Main lo recuerda para la próxima vez.
      const final = soltar(alto);
      setAlto(final);
      window.poke.lugar(id, Math.round(x), Math.round(final));
      // Si asomaba de la incubadora y lo arrastraron fuera, sale de ella.
      if (asomado) window.poke.sacar(id);
      if (final === 0 && estado !== "trabajando" && estado !== "guardandose") lanzarPasada(ATERRIZAJE);
    }
    if (!a || a.movido || !esClic) return;
    // Un clic sin arrastre: calla a la escena y pide a main su burbuja (la abre o la suelta).
    window.poke.clic();
    onElegir(id);
  };
  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    // En macOS ctrl+clic abre el menú contextual: nunca llega el pointerup.
    if (e.button !== 0 || e.ctrlKey) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = {
      inicio: e.clientX,
      inicioY: e.clientY,
      desfase: x - e.clientX,
      altoInicio: alto,
      movido: false,
    };
    setArrastrando(true);
  };
  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (e.buttons === 0) {
      terminarArrastre(false);
      return;
    }
    if (!a.movido && Math.hypot(e.clientX - a.inicio, e.clientY - a.inicioY) > 4) {
      a.movido = true;
      setAlzado(true);
    }
    if (a.movido) {
      // Se mueve en los dos ejes: a lo ancho y hacia arriba (subir el cursor lo sube sobre el suelo).
      const l = limitarLugar(
        e.clientX + a.desfase,
        a.altoInicio + (a.inicioY - e.clientY),
        window.innerWidth,
        window.innerHeight,
      );
      setX(l.x);
      setAlto(l.alto);
    }
  };

  // El agarre de la burbuja: se arrastra (o se usan las flechas) para cambiarle el tamaño; al soltar, main lo recuerda.
  const tamano = tamLocal ?? vista.tamBurbuja ?? TAMANO_INICIAL;
  const ajustado = tamLocal !== null || vista.tamBurbuja !== undefined;
  // Cuando main confirma el tamaño nuevo, manda el suyo (salvo que se esté ajustando ahora mismo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo cuando cambia el que viene de main
  useEffect(() => {
    if (!ajuste.current) setTamLocal(null);
  }, [vista.tamBurbuja?.ancho, vista.tamBurbuja?.alto]);
  const ladoGlobo = ladoBurbuja(window.innerHeight - alto - ALTO_RESERVADO, alto, MIN_BURBUJA);
  const ajustarA = (t: Tamano) =>
    setTamLocal(limitarTamano(t.ancho, t.alto, window.innerWidth, window.innerHeight));
  const agarreBajar = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    ajuste.current = { x: e.clientX, y: e.clientY, inicio: tamano };
    setAjustando(true);
  };
  const agarreMover = (e: PointerEvent<HTMLDivElement>) => {
    const a = ajuste.current;
    if (!a) return;
    ajustarA(tamanoTrasArrastre(a.inicio, e.clientX - a.x, e.clientY - a.y, ladoGlobo));
  };
  const agarreSoltar = () => {
    if (!ajuste.current) return;
    ajuste.current = null;
    setAjustando(false);
    if (tamLocal) window.poke.tamBurbuja(tamLocal.ancho, tamLocal.alto);
  };
  const agarreTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-PASO_TECLADO, 0],
      ArrowRight: [PASO_TECLADO, 0],
      ArrowUp: [0, PASO_TECLADO],
      ArrowDown: [0, -PASO_TECLADO],
    };
    const paso = d[e.key];
    if (!paso) return;
    e.preventDefault();
    const t = limitarTamano(
      tamano.ancho + paso[0],
      tamano.alto + paso[1],
      window.innerWidth,
      window.innerHeight,
    );
    setTamLocal(t);
    window.poke.tamBurbuja(t.ancho, t.alto);
  };

  const saliendo = entrando && !guardando;
  const anchoBurbuja = Math.min(tamano.ancho, window.innerWidth - 16);
  const izquierda = posicionBurbuja(x, anchoBurbuja, window.innerWidth, MARGEN_BURBUJA);
  const cola = Math.max(RADIO_COLA, Math.min(anchoBurbuja - RADIO_COLA, x - izquierda));
  return (
    // Grupo con el nombre: con varios en pantalla, el lector de pantalla sabe de quién es cada cosa. También es la zona
    // de paso del mouse sobre una ventana que ignora clics.
    // biome-ignore lint/a11y/useSemanticElements: un grupo por Pokémon; un fieldset no es un formulario aquí
    <div
      className="pokemon"
      role="group"
      aria-label={vista.nombre}
      ref={raiz}
      data-captura={guardando ? undefined : ""}
      style={{ transform: `translate3d(${x}px, ${-alto}px, 0)` }}
    >
      {mostrar && (
        <div
          className={`burbuja-lugar ${ladoGlobo === "abajo" ? "burbuja-lugar-abajo" : ""}`}
          data-tam={ajustado ? "" : undefined}
          style={{
            transform: `translateX(${izquierda - (x - anchoBurbuja / 2)}px)`,
            ["--cola" as string]: `${cola}px`,
            ["--ancho-burbuja" as string]: `${anchoBurbuja}px`,
            ...(ajustado ? { ["--alto-burbuja" as string]: `${tamano.alto}px` } : {}),
          }}
        >
          <Burbuja vista={vista} lado={ladoGlobo} />
          <span className="burbuja-cola" aria-hidden="true" />
          {/* biome-ignore lint/a11y/useSemanticElements: agarre para cambiar el tamaño, con teclado y ratón */}
          <div
            className={`burbuja-agarre ${ajustando ? "burbuja-agarre-activo" : ""}`}
            role="separator"
            tabIndex={0}
            aria-label="Tamaño de la burbuja: flechas izquierda y derecha para el ancho, arriba y abajo para el alto"
            aria-valuenow={anchoBurbuja}
            aria-valuemin={ANCHO_MIN}
            aria-valuemax={ANCHO_MAX}
            aria-valuetext={`${anchoBurbuja} de ancho por ${tamano.alto} de alto`}
            onPointerDown={agarreBajar}
            onPointerMove={agarreMover}
            onPointerUp={agarreSoltar}
            onPointerCancel={agarreSoltar}
            onLostPointerCapture={agarreSoltar}
            onKeyDown={agarreTecla}
          />
        </div>
      )}
      {chip && <BurbujaChip vista={vista} onElegir={() => onElegir(id)} />}
      {/* Siempre ocupa su alto: con o sin actividad nada se mueve. Es decorativo, no se anuncia. */}
      <div
        className="verbo"
        aria-hidden="true"
        style={{ visibility: actividad || combate ? "visible" : "hidden" }}
      >
        {/* Con la burbuja cerrada, el cuadro de la tarea va encima del verbo; abierta, va dentro de ella. */}
        {!mostrar && !combate && <Progreso vista={vista} x={x} />}
        {combate ? rotuloCombate(combate) : (actividad?.verbo ?? " ")}
        <span className="verbo-puntos">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
        {/* Se ve que avanza: cuántas herramientas lleva en esta tarea. */}
        {!combate && vista.pasos ? <span className="verbo-pasos"> · paso {vista.pasos}</span> : null}
      </div>
      <BarraPS
        nombre={vista.nombre}
        ps={vista.ps}
        alterados={vista.alterados}
        pausado={vista.oidoPausado === true}
        oido={oido}
        sinLeer={vista.sinLeer === true}
        limite={vista.limite ?? null}
        shiny={vista.shiny === true}
        medallas={vista.medallas ?? 0}
      />
      <div className={`cuerpo-zona ${alzado ? "cuerpo-alzado" : ""}`}>
        <span className="sombra" aria-hidden="true" />
        {poseActividad?.objeto && actividad && (
          <div
            key={actividad.tipo}
            className={`objeto-lugar objeto-${lado} ${poseActividad.vaiven ? "objeto-lugar-vaiven" : ""}`}
          >
            <div ref={objetoRef}>
              <Objeto tipo={poseActividad.objeto} />
            </div>
          </div>
        )}
        {!guardando &&
          (vista.ayudantes ?? []).map((a, i) => (
            <Ayudante
              key={a.id}
              ayudante={a}
              numero={i + 1}
              anims={animsPorEspecie?.[a.especie]}
              puesto={i}
              lado={ladoAyudantes}
              // Del mismo lado que el objeto se forman más allá de él.
              desde={ladoAyudantes === lado ? ESPACIO_OBJETO + ESPACIO_AYUDANTE : ESPACIO_AYUDANTE}
            />
          ))}
        {golpe && peleando && xRival !== undefined && (
          <Poder
            key={`combate-${golpe.n}`}
            tipo={tipoDe(vista.especie)}
            modo="proyectil"
            lado={ladoRival}
            conectaMs={golpe.conectaMs}
            distancia={Math.max(40, Math.abs(xRival - x) - 24)}
          />
        )}
        {golpe && modoPoder && poseActividad?.objeto && (
          <Poder
            key={golpe.n}
            tipo={tipoDe(vista.especie)}
            modo={modoPoder}
            lado={lado}
            conectaMs={golpe.conectaMs}
          />
        )}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: arrastre y menú del Pokémon */}
        <div
          className={`cuerpo ${saliendo ? "cuerpo-aparece" : ""} ${guardando ? "cuerpo-desaparece" : ""}`}
          style={paso ? { transform: `translateX(${Math.round((paso.dx * ESCALA) / 3)}px)` } : undefined}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={() => terminarArrastre(true)}
          onPointerCancel={() => terminarArrastre(false)}
          onLostPointerCapture={() => terminarArrastre(false)}
          onContextMenu={(e) => {
            e.preventDefault();
            terminarArrastre(false);
            window.poke.menu(id);
          }}
        >
          <div className="cuerpo-alto">
            <Sprite
              especie={vista.especie}
              estado={estado}
              direccion={direccion}
              anims={anims}
              actividad={combate && actividad ? "pensando" : (actividad?.tipo ?? null)}
              colgado={animColgado(estado, alzado, reducido, anims)}
              forzada={encima && !arrastrando ? reaccion : travesura}
              shiny={vista.shiny === true}
              plantado={combate !== null}
              quieto={quieto}
              unaVez={
                finCombate !== null
                  ? { anim: finCombate, frente: true }
                  : pasada !== null
                    ? { anim: pasada, frente: true }
                    : golpe
                      ? { anim: golpe.anim, frente: !poseActividad?.objeto }
                      : null
              }
            />
          </div>
          {(saliendo || guardando) && <Pokebola fase={saliendo ? "abrir" : "cerrar"} />}
        </div>
      </div>
    </div>
  );
}
