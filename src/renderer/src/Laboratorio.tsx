import { animAlegria, animGolpe, type FaseCeremonia } from "@compartido/ceremonia";
import type { InicialVista } from "@compartido/inicial";
import {
  activaCeremonia,
  bolaParaElFoco,
  ESTADO_INICIAL,
  type Evento,
  reducir,
} from "@compartido/laboratorio";
import { MODELOS, nombreModelo } from "@compartido/modelos";
import { MAX_NOMBRE, validarNombre } from "@compartido/nombre";
import { filtrarEspecies, moverMarca, numeroDex, rotulo, teclaDeBusqueda } from "@compartido/pokedex-kanto";
import type { DatosAnim, NombresLab } from "@compartido/tipos";
import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFaseCeremonia, useReducido } from "./ceremonia-hooks";
import { Pokebola, PokebolaFija } from "./Pokebola";
import { Poder } from "./sprite/Poder";
import { planGolpe } from "./sprite/poderes";
import { animsDe, precargarHojas, Sprite, SpriteQuieto } from "./sprite/Sprite";

const PASO_BOLA = 88;
/** Columnas de la cuadrícula de la Pokédex de Kanto (estilos.css: .lab-cuadricula); ↑ y ↓ saltan una fila. */
const COLUMNAS = 6;
/** Qué tan lejos vuela el poder de la ceremonia, en píxeles (a 150 el chapoteo de Squirtle tocaba el borde de la tarjeta). */
const ALCANCE_PODER = 100;
const COLOR_TIPO: Record<string, string> = {
  planta: "#3fa856",
  fuego: "#d8402f",
  agua: "#2f6fd8",
  electrico: "#f2c94c",
  hada: "#e58ac0",
  fantasma: "#6a55a8",
  psiquico: "#d45a8f",
  lucha: "#b5472e",
  bicho: "#8aa62c",
  veneno: "#9a4fb0",
  tierra: "#b08a4a",
  roca: "#9a8f6a",
  hielo: "#5cc2d6",
  dragon: "#4a5fd0",
};

/** Suelta el grito de la especie (el mismo archivo que suena al salir de la pokébola). */
function gritar(especie: number): void {
  const grito = new Audio(`poke://assets/${String(especie).padStart(4, "0")}/grito.ogg`);
  grito.volume = 0.6;
  void grito.play().catch(() => {
    // Sin grito no pasa nada: la animación ya avisa.
  });
}

/**
 * El laboratorio de la primera vez: una tarjeta al centro con cuatro pokébolas (radiogroup). Al enfocar o pasar el
 * cursor se asoma el Pokémon con su tipo y lo que hace; elegir pide confirmación y lanza la ceremonia (≈3 s, se salta
 * con clic, Enter o Escape). Después viene el nombre propio (el de la especie ya escrito y seleccionado; se puede dejar)
 * y, tras él, el modelo de Claude con que trabajará (tres radios, el de su tipo preseleccionado); con eso main pide la
 * carpeta. Los pasos los decide la máquina pura de `@compartido/laboratorio`; si se cancela la
 * carpeta, main manda `volverN` para regresar aquí. En el paso del nombre la ventana ya recibe el teclado: main la
 * tiene en modo "lab" desde que el laboratorio avisó que se veía. Nunca toca permisos.
 */
export function Laboratorio({
  iniciales,
  otras,
  nombres,
  volverN,
  preparando,
}: {
  iniciales: InicialVista[];
  /** Las de la Pokédex de Kanto (el huevo de pascua) con sprites; vacía = sin esa opción. */
  otras: InicialVista[];
  /** Lo que hace falta para validar el nombre propio mientras se escribe. */
  nombres: NombresLab;
  volverN: number;
  /** Ya eligió y dio la carpeta: la tarjeta final sigue a la vista, sin clics, mientras carga el equipo. */
  preparando: boolean;
}) {
  const total = iniciales.length;
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const estadoRef = useRef(estado);
  const enviar = useCallback(
    (ev: Evento) => {
      const r = reducir(estadoRef.current, ev, total);
      estadoRef.current = r.estado;
      setEstado(r.estado);
      if (r.efecto) window.poke.inicial(r.efecto);
    },
    [total],
  );
  const {
    paso,
    enfocada,
    asomada: indiceAsomada,
    elegida,
    avisoSalir,
    modelo,
    pokedex,
    filtro,
    otra,
  } = estado;
  const reducido = useReducido();

  const [anims, setAnims] = useState<Record<number, Record<string, DatosAnim>>>({});
  useEffect(() => {
    let vivo = true;
    for (const i of iniciales)
      window.poke.anims(i.especie).then(
        (a) => {
          precargarHojas(i.especie, a);
          if (vivo) setAnims((m) => ({ ...m, [i.especie]: a }));
        },
        (e) => {
          // Sin hojas no se asoma, pero se puede elegir igual.
          console.warn(`Laboratorio: no llegaron las animaciones de la especie ${i.especie}:`, e);
        },
      );
    return () => {
      vivo = false;
    };
  }, [iniciales]);

  // Quien no es de los cuatro (la Pokédex de Kanto) trae sus animaciones cuando se marca o se elige.
  const pedidasOtras = useRef(new Set<number>());
  const traerAnims = useCallback((especie: number) => {
    if (pedidasOtras.current.has(especie)) return;
    pedidasOtras.current.add(especie);
    animsDe(especie).then(
      (a) => setAnims((m) => ({ ...m, [especie]: a })),
      (e) => {
        pedidasOtras.current.delete(especie);
        console.warn(`Laboratorio: no llegaron las animaciones de la especie ${especie}:`, e);
      },
    );
  }, []);

  // Avisa a main cuando el laboratorio ya está pintado: solo entonces la ventana toma el ratón y el teclado.
  useEffect(() => {
    let segundo = 0;
    const primero = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => window.poke.labListo());
    });
    return () => {
      cancelAnimationFrame(primero);
      cancelAnimationFrame(segundo);
    };
  }, []);
  // Preparando el equipo: la tarjeta es solo para mirar, la ventana suelta el foco.
  useEffect(() => {
    if (preparando) window.poke.enfocar(false);
  }, [preparando]);

  // La ventana normalmente no toma el foco: aquí sí, mientras el laboratorio esté abierto.
  useEffect(() => {
    window.poke.enfocar(true);
    return () => window.poke.enfocar(false);
  }, []);
  // Main canceló la carpeta: de vuelta a la elección (la ventana puede haber perdido el foco con el diálogo).
  const vistaVolver = useRef(volverN);
  useEffect(() => {
    if (volverN === vistaVolver.current) return;
    vistaVolver.current = volverN;
    window.poke.enfocar(true);
    enviar({ tipo: "carpetaCancelada" });
  }, [volverN, enviar]);

  // Escape: dos veces cierra; en la confirmación vuelve; en la ceremonia la salta.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      // Mantener la tecla pulsada no cuenta como pulsarla otra vez (si no, saltaría la ceremonia y cerraría la app).
      if (e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== "Escape") return;
      e.preventDefault();
      enviar({ tipo: "escape" });
    };
    document.addEventListener("keydown", alTeclear, true);
    return () => document.removeEventListener("keydown", alTeclear, true);
  }, [enviar]);

  // El atajo secreto: en la elección, escribir un número de la Pokédex o las primeras letras de un nombre abre la
  // Pokédex de Kanto ya filtrada. Con ella abierta, las teclas que caen fuera de la búsqueda (la cuadrícula) van a ella.
  useEffect(() => {
    if (otras.length === 0) return;
    const alTeclear = (e: KeyboardEvent) => {
      const ahora = estadoRef.current;
      if (ahora.paso !== "elegir" || e.defaultPrevented || e.repeat) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Backspace" && ahora.pokedex) {
        e.preventDefault();
        enviar({ tipo: "filtrar", texto: ahora.filtro.slice(0, -1) });
        campoBusqueda.current?.focus();
        return;
      }
      const tecla = teclaDeBusqueda(e);
      if (tecla === null) return;
      e.preventDefault();
      if (ahora.pokedex) {
        enviar({ tipo: "filtrar", texto: ahora.filtro + tecla });
        campoBusqueda.current?.focus();
      } else enviar({ tipo: "abrirPokedex", filtro: tecla });
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [enviar, otras.length]);

  // El nombre propio: empieza siendo el de la especie, y no se muestra error hasta el primer intento de dejarlo.
  // null = sin tocar: el campo muestra el nombre de la especie (así ya está escrito cuando se enfoca y se selecciona).
  const [escrito, setEscrito] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [nombreFinal, setNombreFinal] = useState<string | null>(null);
  const campoNombre = useRef<HTMLInputElement>(null);
  const radiosModelo = useRef<(HTMLButtonElement | null)[]>([]);

  const bolas = useRef<(HTMLButtonElement | null)[]>([]);
  // La Pokédex de Kanto: su búsqueda, sus celdas (por número), el botón que la abre y a quién se eligió antes de volver.
  const campoBusqueda = useRef<HTMLInputElement>(null);
  const celdas = useRef(new Map<number, HTMLButtonElement>());
  const botonOtro = useRef<HTMLButtonElement>(null);
  const ultimaOtra = useRef<number | null>(null);
  const habiaPokedex = useRef(false);
  const [marcada, setMarcada] = useState<number | null>(null);
  const visibles = useMemo(() => filtrarEspecies(otras, filtro), [otras, filtro]);
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const saltarRef = useRef<HTMLButtonElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  // El foco acompaña al paso: a la bola enfocada al elegir, a "Sí" al confirmar, a "Saltar" en la ceremonia.
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al cambiar de paso
  useEffect(() => {
    // Sin nada marcado el foco va al título: ninguna pokébola queda elegida de antemano.
    if (paso === "elegir") {
      // Con la Pokédex abierta el foco lo lleva su propio efecto (más abajo).
      if (!estadoRef.current.pokedex)
        (enfocada === null ? tituloRef.current : bolas.current[enfocada])?.focus();
    } else if (paso === "confirmar") confirmarRef.current?.focus();
    else if (paso === "ceremonia") saltarRef.current?.focus();
    else if (paso === "nombre") {
      // El campo con el nombre de la especie ya escrito y seleccionado: escribir lo reemplaza, Enter lo deja.
      campoNombre.current?.focus();
      campoNombre.current?.select();
    }
  }, [paso]);
  // Foco de la Pokédex de Kanto: al abrirse (o al volver a ella con Atrás o con la carpeta cancelada) va a quien se había
  // elegido, o a la búsqueda; al cerrarse, de vuelta al botón que la abrió.
  useEffect(() => {
    if (paso !== "elegir") return;
    if (pokedex) {
      habiaPokedex.current = true;
      const previa = ultimaOtra.current;
      const celda = previa === null ? undefined : celdas.current.get(previa);
      if (celda) celda.focus();
      else {
        const campo = campoBusqueda.current;
        campo?.focus();
        campo?.setSelectionRange(campo.value.length, campo.value.length);
      }
    } else if (habiaPokedex.current) {
      habiaPokedex.current = false;
      ultimaOtra.current = null;
      (botonOtro.current ?? tituloRef.current)?.focus();
    }
  }, [paso, pokedex]);
  // Foco del paso del modelo: al radio marcado al entrar (el del tipo, o el de antes de volver atrás) y, con las
  // flechas, al nuevo marcado (el cambio solo ocurre desde los radios, así que no roba foco).
  useEffect(() => {
    if (paso !== "modelo") return;
    radiosModelo.current[MODELOS.findIndex((m) => m.id === modelo)]?.focus();
  }, [paso, modelo]);
  // Con las flechas el foco se mueve a la bola nueva; el cursor solo asoma, no le quita el foco a "Salir".
  useEffect(() => {
    const activo = document.activeElement;
    const focoEn =
      activo === document.body
        ? "cuerpo"
        : activo === tituloRef.current
          ? "titulo"
          : bolas.current.includes(activo as HTMLButtonElement)
            ? "bola"
            : "otro";
    const a = pokedex ? null : bolaParaElFoco(paso, enfocada, focoEn);
    if (a !== null) bolas.current[a]?.focus();
  }, [paso, enfocada, pokedex]);
  // Al salir del nombre hacia la elección (Atrás, carpeta cancelada) se olvida lo escrito: la próxima vez arranca
  // limpio. Desde el modelo, Atrás vuelve al nombre y lo escrito se conserva. Y al volver a elegir se olvida el nombre
  // ya dado: la ceremonia de otro inicial no puede decir el del anterior.
  useEffect(() => {
    if (paso === "elegir" || paso === "confirmar") setNombreFinal(null);
    if (paso === "nombre" || paso === "modelo") return;
    setEscrito(null);
    setIntentado(false);
  }, [paso]);

  const alTeclasBolas = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.getAttribute("role") !== "radio" && t !== tituloRef.current) return;
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    e.preventDefault();
    enviar({ tipo: "mover", delta });
  };

  const fase = useFaseCeremonia(paso, reducido, () => enviar({ tipo: "ceremoniaTerminada" }));
  // La Pokédex de Kanto sigue a la vista mientras se confirma a quien se eligió en ella.
  const panelAbierto = pokedex || otra !== null;
  const marcadaEf =
    otra ?? (visibles.some((v) => v.especie === marcada) ? marcada : (visibles[0]?.especie ?? null));
  const asomada = panelAbierto
    ? (otras.find((o) => o.especie === marcadaEf) ?? null)
    : indiceAsomada === null
      ? null
      : iniciales[indiceAsomada];
  const elegido =
    otra !== null
      ? (otras.find((o) => o.especie === otra) ?? null)
      : elegida === null
        ? null
        : iniciales[elegida];
  // Quien se marca o se elige en la Pokédex trae sus animaciones (los cuatro de siempre ya las traen).
  useEffect(() => {
    if (panelAbierto && marcadaEf !== null) traerAnims(marcadaEf);
    if (otra !== null) traerAnims(otra);
  }, [panelAbierto, marcadaEf, otra, traerAnims]);
  // Solo a quien se eligió se le precargan todas sus hojas (para la ceremonia); a quien solo se marca, nada.
  const animsOtra = otra === null ? undefined : anims[otra];
  useEffect(() => {
    if (otra !== null && animsOtra) precargarHojas(otra, animsOtra);
  }, [otra, animsOtra]);
  const elegirOtra = (especie: number) => {
    ultimaOtra.current = especie;
    setMarcada(especie);
    enviar({ tipo: "escogerOtra", especie });
  };
  const alTeclasBusqueda = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && marcadaEf !== null) {
      e.preventDefault();
      celdas.current.get(marcadaEf)?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Enter elige a quien se ve asomado.
      if (marcadaEf !== null) elegirOtra(marcadaEf);
    }
  };
  const alTeclasCuadricula = (e: React.KeyboardEvent) => {
    const numeros = visibles.map((v) => v.especie);
    let a: number | null;
    if (e.key === "Home") a = numeros[0] ?? null;
    else if (e.key === "End") a = numeros[numeros.length - 1] ?? null;
    else {
      const salto = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNAS, ArrowUp: -COLUMNAS }[e.key];
      if (salto === undefined) return;
      e.preventDefault();
      // Desde la primera fila, ↑ sube a la búsqueda.
      if (salto === -COLUMNAS && marcadaEf !== null && numeros.indexOf(marcadaEf) < COLUMNAS) {
        campoBusqueda.current?.focus();
        return;
      }
      a = moverMarca(numeros, marcadaEf, salto);
    }
    e.preventDefault();
    if (a === null) return;
    setMarcada(a);
    celdas.current.get(a)?.focus();
  };
  const enCeremonia = activaCeremonia(paso);
  const raiz = roving(enfocada);
  const textoNombre = escrito ?? elegido?.nombre ?? "";
  const resultadoNombre = elegido
    ? validarNombre(textoNombre, {
        reservadas: nombres.reservadas,
        mando: nombres.mando,
        especies: nombres.especies.filter((e) => e.especie !== elegido.especie).map((e) => e.nombre),
        propia: elegido.nombre,
        otros: [],
      })
    : null;
  const errorNombre = intentado && resultadoNombre && !resultadoNombre.ok ? resultadoNombre.motivo : null;
  const alNombrar = (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!resultadoNombre?.ok) {
      campoNombre.current?.focus();
      return;
    }
    setNombreFinal(resultadoNombre.nombre);
    enviar({ tipo: "nombrar", nombre: resultadoNombre.nombre, modeloInicial: elegido?.modelo });
  };
  // Flechas para moverse entre los radios (dan la vuelta) y Enter para dejarlo; Espacio marca el enfocado (clic nativo).
  const alTeclasModelo = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      enviar({ tipo: "modelar" });
      return;
    }
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    e.preventDefault();
    enviar({ tipo: "mover", delta });
  };
  const nombreMostrado = nombreFinal ?? elegido?.nombre ?? "";

  return (
    <>
      <div className="lab-velo" aria-hidden="true" />
      <section
        data-captura=""
        className={`lab ${enCeremonia ? "lab-ceremonia" : ""} ${preparando ? "lab-preparando" : ""}`}
        inert={preparando}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-titulo"
        aria-describedby="lab-ayuda"
        onKeyDown={paso === "elegir" ? alTeclasBolas : undefined}
      >
        <div className="lab-cabeza">
          <span className="lab-etiqueta">Laboratorio</span>
          {!enCeremonia && (
            <button type="button" className="mini" onClick={() => enviar({ tipo: "salir" })}>
              Salir
            </button>
          )}
        </div>
        <h1 id="lab-titulo" ref={tituloRef} tabIndex={-1} className="lab-titulo">
          {panelAbierto ? "Pokédex de Kanto" : "Elige a tu primer Pokémon"}
        </h1>
        <p id="lab-ayuda" className="lab-ayuda">
          {panelAbierto
            ? "Cualquiera de la primera generación. Después puedes traer a más."
            : "Maneja tu primera sesión de Claude Code. Después puedes traer a más."}
        </p>

        <div className="lab-escenario">
          {enCeremonia && elegido ? (
            <EscenaCeremonia
              inicial={elegido}
              anims={anims[elegido.especie]}
              fase={fase}
              reducido={reducido}
            />
          ) : (
            asomada && (
              <div key={asomada.especie} className="lab-asoma">
                <Sprite
                  especie={asomada.especie}
                  estado="esperando"
                  direccion="frente"
                  anims={anims[asomada.especie] ?? {}}
                />
              </div>
            )
          )}
        </div>

        {!enCeremonia && (
          <div className="lab-ficha" aria-live="polite" aria-atomic="true">
            {asomada ? (
              <>
                <p className="lab-nombre">{rotulo(asomada)}</p>
                <p className="lab-datos">
                  <span className="lab-dato">
                    <span
                      className="lab-tipo-color"
                      style={{ background: COLOR_TIPO[asomada.tipo] ?? "var(--tinta)" }}
                      aria-hidden="true"
                    />
                    {asomada.tipoNombre}
                  </span>
                  <span className="lab-dato">Modelo {nombreModelo(asomada.modelo)}</span>
                </p>
                <p className="lab-resumen">{asomada.resumen}</p>
              </>
            ) : (
              <p className="lab-resumen">Pasa el cursor sobre una pokébola o usa las flechas.</p>
            )}
          </div>
        )}

        <div
          className={`lab-bolas ${enCeremonia ? "lab-bolas-ceremonia" : ""}`}
          role="radiogroup"
          aria-label="Pokémon inicial"
          aria-hidden={enCeremonia ? true : undefined}
          inert={paso !== "elegir"}
          hidden={panelAbierto}
        >
          {iniciales.map((ini, i) => {
            const esElegida = enCeremonia && elegida === i;
            // Desde que empieza a sacudirse la bola de la ceremonia es la animada de la escena, no la quieta.
            const animada = esElegida && fase !== null && fase !== "retirar" && !reducido;
            return (
              // biome-ignore lint/a11y/useSemanticElements: pokébola dibujada; un botón con rol radio y foco rodante hace lo mismo que un <input type="radio">
              <button
                key={ini.especie}
                ref={(el) => {
                  bolas.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={enfocada === i}
                aria-label={`${ini.nombre}, tipo ${ini.tipoNombre}`}
                tabIndex={i === raiz ? 0 : -1}
                className={`lab-bola ${esElegida ? "lab-bola-elegida" : ""} ${enCeremonia && !esElegida ? "lab-bola-apagada" : ""}`}
                style={{ "--dx": `${(((total - 1) / 2 - i) * PASO_BOLA) | 0}px` } as CSSProperties}
                onPointerEnter={() => enviar({ tipo: "asomar", indice: i })}
                onFocus={() => enviar({ tipo: "enfocar", indice: i })}
                onClick={() => enviar({ tipo: "escoger", indice: i })}
              >
                <span className="lab-bola-dibujo" aria-hidden="true">
                  {animada ? <Pokebola fase="abrir" /> : <PokebolaFija />}
                </span>
                <span className="lab-bola-nombre" aria-hidden="true">
                  {ini.nombre}
                </span>
              </button>
            );
          })}
        </div>

        {panelAbierto && (
          // Se queda a la vista (sin clics) mientras se confirma; después se oculta pero conserva su tamaño, para que la
          // tarjeta no salte.
          <div
            className={`lab-pokedex ${paso === "elegir" || paso === "confirmar" ? "" : "lab-pokedex-oculta"}`}
            inert={paso !== "elegir"}
            aria-hidden={paso === "elegir" || paso === "confirmar" ? undefined : true}
          >
            <input
              ref={campoBusqueda}
              type="search"
              className="lab-campo lab-busqueda"
              value={filtro}
              placeholder="Nombre o número"
              aria-label="Buscar en la Pokédex de Kanto por nombre o número"
              aria-controls={visibles.length > 0 ? "lab-cuadricula" : undefined}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => enviar({ tipo: "filtrar", texto: e.target.value })}
              onKeyDown={alTeclasBusqueda}
            />
            <p className="solo-lector" role="status">
              {visibles.length === 0 ? "Ninguno coincide." : `${visibles.length} Pokémon`}
            </p>
            {visibles.length === 0 ? (
              <p className="lab-nota lab-vacio">Ninguno coincide con «{filtro}».</p>
            ) : (
              <div
                id="lab-cuadricula"
                data-vigia=""
                className="lab-cuadricula"
                role="listbox"
                aria-label="Pokémon de Kanto"
                onKeyDown={alTeclasCuadricula}
              >
                {visibles.map((v) => (
                  <button
                    key={v.especie}
                    ref={(el) => {
                      if (el) celdas.current.set(v.especie, el);
                      else celdas.current.delete(v.especie);
                    }}
                    type="button"
                    role="option"
                    aria-selected={marcadaEf === v.especie}
                    aria-label={`${rotulo(v)}, número ${v.especie}, tipo ${v.tipoNombre}`}
                    tabIndex={marcadaEf === v.especie ? 0 : -1}
                    className="lab-celda"
                    onPointerEnter={() => setMarcada(v.especie)}
                    onFocus={() => setMarcada(v.especie)}
                    onClick={() => elegirOtra(v.especie)}
                  >
                    <SpriteQuieto especie={v.especie} lado={44} />
                    <span className="lab-celda-num" aria-hidden="true">
                      {numeroDex(v.especie)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="lab-pie">
          {paso === "confirmar" && elegido ? (
            <div className="lab-confirmar">
              <p className="lab-pregunta" role="status">
                ¿Te quedas con {rotulo(elegido)}?
              </p>
              <div className="lab-botones">
                <button
                  ref={confirmarRef}
                  type="button"
                  className="boton boton-si"
                  onClick={() => enviar({ tipo: "confirmar" })}
                >
                  Sí
                </button>
                <button type="button" className="boton" onClick={() => enviar({ tipo: "volver" })}>
                  Volver
                </button>
              </div>
            </div>
          ) : paso === "nombre" && elegido ? (
            <form className="lab-bautizo" onSubmit={alNombrar} noValidate>
              <p className="lab-se-une lab-se-une-corto" role="status">
                ¡{elegido.nombre} se une a tu equipo!
              </p>
              <div className="lab-bautizo-fila">
                <label className="lab-pregunta" htmlFor="lab-nombre-campo">
                  ¿Cómo se va a llamar?
                </label>
                <input
                  id="lab-nombre-campo"
                  ref={campoNombre}
                  className="lab-campo"
                  type="text"
                  value={textoNombre}
                  maxLength={MAX_NOMBRE + 8}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={errorNombre ? true : undefined}
                  aria-describedby={errorNombre ? "lab-nombre-pista lab-nombre-error" : "lab-nombre-pista"}
                  onChange={(e) => setEscrito(e.target.value)}
                />
              </div>
              <p id="lab-nombre-pista" className="lab-nota">
                Un nombre corto y sonoro se entiende mejor: dos o tres sílabas.
              </p>
              {/* Siempre montado: el lector solo lo anuncia cuando cambia el texto, no con cada tecla. */}
              <p id="lab-nombre-error" className={errorNombre ? "lab-error" : "solo-lector"} role="alert">
                {errorNombre ?? ""}
              </p>
              <div className="lab-botones lab-botones-fin">
                <button type="button" className="boton" onClick={() => enviar({ tipo: "volver" })}>
                  Atrás
                </button>
                <button type="submit" className="boton boton-si">
                  Listo
                </button>
              </div>
            </form>
          ) : paso === "modelo" && elegido ? (
            <form
              className="lab-bautizo"
              onSubmit={(e) => {
                e.preventDefault();
                enviar({ tipo: "modelar" });
              }}
            >
              {/* Sin role="status": ya se anunció en el paso del nombre y un lector no debe repetirlo. */}
              <p className="lab-se-une lab-se-une-corto">¡{nombreMostrado} se une a tu equipo!</p>
              <p id="lab-modelo-pregunta" className="lab-pregunta">
                ¿Con qué modelo va a trabajar?
              </p>
              <div
                className="lab-modelos"
                role="radiogroup"
                aria-labelledby="lab-modelo-pregunta"
                onKeyDown={alTeclasModelo}
              >
                {MODELOS.map((m, i) => (
                  // biome-ignore lint/a11y/useSemanticElements: fila con nombre y descripción; un botón con rol radio y foco rodante hace lo mismo que un <input type="radio">
                  <button
                    key={m.id}
                    ref={(el) => {
                      radiosModelo.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={modelo === m.id}
                    tabIndex={modelo === m.id ? 0 : -1}
                    className="lab-modelo"
                    onClick={() => enviar({ tipo: "escogerModelo", modelo: m.id })}
                  >
                    <span className="lab-modelo-nombre">
                      {m.nombre}
                      {m.id === elegido.modelo && <span className="lab-modelo-tipo"> · el de su tipo</span>}
                    </span>
                    <span className="lab-modelo-linea">{m.linea}</span>
                  </button>
                ))}
              </div>
              <div className="lab-botones lab-botones-fin">
                <button type="button" className="boton" onClick={() => enviar({ tipo: "volver" })}>
                  Atrás
                </button>
                <button type="submit" className="boton boton-si">
                  Listo
                </button>
              </div>
            </form>
          ) : enCeremonia && elegido ? (
            <div className="lab-union">
              <p className="lab-se-une" role="status">
                {fase === "texto" || paso === "carpeta" ? `¡${nombreMostrado} se une a tu equipo!` : ""}
              </p>
              {paso === "carpeta" ? (
                <p className="lab-nota" role="status">
                  {preparando ? "Preparando su voz…" : "Elige su carpeta."}
                </p>
              ) : (
                <button
                  ref={saltarRef}
                  type="button"
                  className="mini lab-saltar"
                  onClick={() => enviar({ tipo: "saltar" })}
                >
                  Saltar
                </button>
              )}
            </div>
          ) : paso === "elegir" && pokedex ? (
            <div className="lab-pie-fila">
              <p className="lab-nota">
                Escribe un nombre o un número. Flechas para moverte, Enter para elegir.
              </p>
              <button type="button" className="mini" onClick={() => enviar({ tipo: "cerrarPokedex" })}>
                Volver
              </button>
            </div>
          ) : (
            <div className="lab-pie-fila">
              <p className="lab-nota" aria-live="polite">
                {avisoSalir
                  ? "Pulsa Escape otra vez para salir."
                  : "Flechas para moverte, Enter para elegir."}
              </p>
              {paso === "elegir" && otras.length > 0 && (
                // El huevo de pascua: tenue a propósito; se nota al pasar el cursor o con Tab.
                <button
                  ref={botonOtro}
                  type="button"
                  className="lab-otro"
                  onClick={() => enviar({ tipo: "abrirPokedex" })}
                >
                  ¿Buscas a otro?
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/** Con el foco rodante, la bola que entra por Tab es la enfocada, o la primera si todavía no hay. */
const roving = (enfocada: number | null) => enfocada ?? 0;

/**
 * El escenario de la ceremonia: el Pokémon sale de la pokébola con su alegría, usa su movimiento con el efecto
 * original de PMD y suelta su grito. Sin movimiento aparece quieto (Idle), sin efecto.
 */
function EscenaCeremonia({
  inicial,
  anims,
  fase,
  reducido,
}: {
  inicial: InicialVista;
  anims: Record<string, DatosAnim> | undefined;
  fase: FaseCeremonia | null;
  reducido: boolean;
}) {
  const hojas = anims ?? {};
  const sale = fase === "sale" || fase === "movimiento" || fase === "texto";
  const golpeNombre = animGolpe(inicial.tipo, hojas);
  const plan = golpeNombre ? planGolpe(hojas[golpeNombre]) : null;
  const [lanzado, setLanzado] = useState(false);
  const [golpeando, setGolpeando] = useState(false);
  const disparado = useRef(false);
  const fin = useRef<ReturnType<typeof setTimeout>>(undefined);
  const especie = inicial.especie;
  const duracion = plan?.duracionMs ?? 0;
  // El movimiento y el grito arrancan juntos, una sola vez; si se salta la ceremonia no suenan.
  useEffect(() => {
    // Con movimiento reducido el grito suena igual (no es movimiento), al aparecer el texto.
    if (disparado.current || fase !== (reducido ? "texto" : "movimiento")) return;
    disparado.current = true;
    gritar(especie);
    if (reducido) return;
    setLanzado(true);
    if (!golpeNombre) return;
    setGolpeando(true);
    fin.current = setTimeout(() => setGolpeando(false), duracion);
  }, [fase, reducido, especie, golpeNombre, duracion]);
  useEffect(() => () => clearTimeout(fin.current), []);

  if (!sale) return null;
  const alegria = animAlegria(hojas);
  return (
    <div className={`lab-sale ${reducido ? "" : "lab-sale-anima"}`}>
      <Sprite
        especie={especie}
        estado="esperando"
        direccion="frente"
        anims={hojas}
        colgado={reducido ? null : alegria}
        unaVez={golpeando && golpeNombre ? { anim: golpeNombre, frente: true } : null}
      />
      {!reducido && lanzado && plan && (
        <Poder
          tipo={inicial.tipo}
          modo="proyectil"
          lado="derecha"
          conectaMs={plan.conectaMs}
          distancia={ALCANCE_PODER}
        />
      )}
    </div>
  );
}
