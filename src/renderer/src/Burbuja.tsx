import { resumenPermiso } from "@compartido/permiso-legible";
import type { ComandoVista, PermisoPendiente, VistaPokemon } from "@compartido/tipos";
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Ayuda, Ficha, Historial, type Panel, Respuesta } from "./BurbujaPartes";
import {
  botonesActivos,
  burbujaAMostrar,
  completarComando,
  debeSoltarFoco,
  GRACIA_PERMISO_MS,
  hayTexto,
  sugerenciasPara,
} from "./burbuja-logica";
import { Progreso } from "./Progreso";
import { suscribirPrellenado, usarPrellenado } from "./prellenado";
import { RegistroEnVivo, RegistroTerminado } from "./Registro";
import { altoDisponible, altoDisponibleAbajo } from "./registro-scroll";

/**
 * El campo de texto es dueño del foco: al desmontarse, devuelve el foco a la app de abajo. Al escribir "/" muestra
 * los comandos en una lista propia dentro de la burbuja (la lista nativa del navegador se abre como ventana aparte
 * y se rompe en esta ventana transparente). Flechas para moverse, Tab o Enter para completar, clic también.
 */
function CampoEscribir({ vista }: { vista: VistaPokemon }) {
  const [texto, setTexto] = useState("");
  const [comandos, setComandos] = useState<ComandoVista[] | null>(null);
  const [elegido, setElegido] = useState(0);
  const pidiendo = useRef(false);

  // Al desmontarse suelta el foco de la ventana, pero solo si lo tiene ESTE campo: cerrar la burbuja de un Pokémon no
  // le quita el teclado a quien escribe en la de otro. De layout: corre antes de que el campo salga del DOM, cuando
  // `document.activeElement` todavía es él.
  const campo = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = campo.current;
    return () => {
      if (debeSoltarFoco(el, document.activeElement)) window.poke.enfocar(false);
    };
  }, []);

  // "Cambiar nombre…" del menú deja "/nombre " escrito y el cursor al final; llega antes o después de montarse el campo.
  const dejarEscrito = useCallback((t: string) => {
    setTexto(t);
    window.poke.enfocar(true);
    requestAnimationFrame(() => {
      const el = campo.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(t.length, t.length);
    });
  }, []);
  useEffect(() => {
    const t = usarPrellenado(vista.id);
    if (t !== null) dejarEscrito(t);
    return suscribirPrellenado(vista.id, dejarEscrito);
  }, [vista.id, dejarEscrito]);

  // La lista se pide una sola vez, al escribir la primera "/".
  useEffect(() => {
    if (!texto.startsWith("/") || comandos || pidiendo.current) return;
    pidiendo.current = true;
    window.poke.comandos(vista.id).then(setComandos, () => setComandos([]));
  }, [texto, comandos, vista.id]);

  const sugerencias = sugerenciasPara(texto, comandos ?? []);
  // Ids propios de cada Pokémon: con varias burbujas abiertas no se pisan.
  const idLista = `comandos-${vista.id}`;
  const idComando = (nombre: string) => `comando-${vista.id}-${nombre}`;
  const abierta = sugerencias.length > 0;
  const actual = abierta ? Math.min(elegido, sugerencias.length - 1) : -1;

  const completar = (c: ComandoVista) => {
    setTexto(completarComando(c));
    setElegido(0);
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    window.poke.escribir(vista.id, texto.trim());
    setTexto("");
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    // Escape con el campo vacío y sin lista: detiene lo que esté haciendo.
    if (e.key === "Escape" && !abierta && texto === "" && vista.estado === "trabajando") {
      e.preventDefault();
      window.poke.detener(vista.id);
      return;
    }
    if (!abierta) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const paso = e.key === "ArrowDown" ? 1 : -1;
      setElegido((actual + paso + sugerencias.length) % sugerencias.length);
      return;
    }
    const c = sugerencias[actual];
    // Enter completa solo si falta escribir algo del nombre; si ya está completo, envía.
    if (e.key === "Tab" || (e.key === "Enter" && c && texto !== completarComando(c).trimEnd())) {
      e.preventDefault();
      if (c) completar(c);
    }
  };

  return (
    <form className="escribir" onSubmit={enviar}>
      {abierta && (
        <div className="comandos" id={idLista} role="listbox" aria-label={`Comandos para ${vista.nombre}`}>
          {sugerencias.map((c, i) => (
            <div
              key={c.nombre}
              tabIndex={-1}
              id={idComando(c.nombre)}
              role="option"
              aria-selected={i === actual}
              className={`comando ${i === actual ? "comando-elegido" : ""}`}
              // mousedown y no click: así el campo no pierde el foco.
              onMouseDown={(e) => {
                e.preventDefault();
                completar(c);
              }}
              onMouseEnter={() => setElegido(i)}
            >
              <span className="comando-nombre">
                /{c.nombre}
                {c.argumento && <span className="comando-argumento"> {c.argumento}</span>}
              </span>
              {c.descripcion && <span className="comando-descripcion">{c.descripcion}</span>}
            </div>
          ))}
        </div>
      )}
      <input
        ref={campo}
        className="escribir-campo"
        value={texto}
        placeholder={vista.microfono ? `Escríbele a ${vista.nombre}` : "Sin micrófono: escríbele aquí"}
        aria-label={`Escribirle a ${vista.nombre}`}
        role="combobox"
        aria-expanded={abierta}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierta ? idComando(sugerencias[actual].nombre) : undefined}
        autoComplete="off"
        onFocus={() => window.poke.enfocar(true)}
        onBlur={() => window.poke.enfocar(false)}
        onMouseDown={() => window.poke.enfocar(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setElegido(0);
        }}
        onKeyDown={alTeclear}
      />
    </form>
  );
}

/**
 * Se dibuja con `key` = id del permiso: cada permiso nuevo es un bloque nuevo, con botones
 * inactivos un instante y un solo clic. El temporizador solo activa; nunca responde.
 */
function BloquePermiso({
  pokemonId,
  nombre,
  permiso,
}: {
  pokemonId: string;
  nombre: string;
  permiso: PermisoPendiente;
}) {
  const aparecio = useRef(Date.now());
  const [lista, setLista] = useState(false);
  const [respondido, setRespondido] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLista(true), GRACIA_PERMISO_MS);
    return () => clearTimeout(t);
  }, []);

  const activos = lista && !respondido;
  const responder = (permitir: boolean) => {
    if (respondido || !botonesActivos(aparecio.current, Date.now())) return;
    setRespondido(true);
    window.poke.permiso(pokemonId, permiso.id, permitir);
  };

  return (
    <section className="burbuja burbuja-aviso" aria-label={`${nombre} pide permiso`}>
      <p className="permiso-quien">{nombre} pide permiso</p>
      {/* Primero, en palabras, qué va a hacer; el detalle crudo queda debajo para quien quiera leerlo. */}
      <p className="burbuja-texto permiso-resumen">{resumenPermiso(permiso.herramienta, permiso.detalle)}</p>
      <div className="permiso">
        <code className="permiso-detalle">
          <span className="permiso-herramienta">{permiso.herramienta}</span>
          {permiso.detalle}
        </code>
        {/* Sí y No en extremos opuestos: no se confunden ni se pisan con un clic apurado. */}
        <div className="botones botones-permiso">
          <button type="button" className="boton" disabled={!activos} onClick={() => responder(false)}>
            No
          </button>
          <button type="button" className="mini" onClick={() => window.poke.detener(pokemonId)}>
            Detener la tarea
          </button>
          <button
            type="button"
            className="boton boton-si"
            disabled={!activos}
            onClick={() => responder(true)}
          >
            Sí
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * La burbuja ABIERTA (solo se dibuja la que main marca como abierta). Como la persona puede haberla elegido sin nada nuevo,
 * sin burbuja viva muestra su última respuesta.
 */
export function Burbuja({ vista, lado = "arriba" }: { vista: VistaPokemon; lado?: "arriba" | "abajo" }) {
  const { permiso } = vista;
  const burbuja = burbujaAMostrar(vista, true);
  const registro = vista.registro && vista.registro.entradas.length > 0 ? vista.registro : null;
  const trabajando = vista.estado === "trabajando";
  const [panel, setPanel] = useState<Panel>(null);
  // Abierta hacia arriba se ancla abajo (sobre el Pokémon): su tope de alto es lo que queda por encima de su borde
  // inferior. Hacia abajo (Pokémon posado arriba), lo que queda por debajo de su borde superior.
  const caja = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hay que volver a medir cuando vuelve la burbuja tras un permiso
  useLayoutEffect(() => {
    const medir = () => {
      const r = caja.current?.getBoundingClientRect();
      if (r)
        setDisponible(
          lado === "abajo" ? altoDisponibleAbajo(r.top, window.innerHeight) : altoDisponible(r.bottom),
        );
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [permiso?.id, lado]);

  // El permiso pendiente manda: se dibuja siempre que exista, con o sin burbuja.
  if (permiso)
    return <BloquePermiso key={permiso.id} pokemonId={vista.id} nombre={vista.nombre} permiso={permiso} />;

  return (
    <div
      ref={caja}
      className={`burbuja burbuja-${burbuja?.tipo ?? "aviso"}${registro && trabajando ? " burbuja-viva" : ""}`}
      style={disponible === null ? undefined : { ["--alto-disp" as string]: `${disponible}px` }}
      // Mientras el registro está a la vista el contenedor es un grupo: un status (atómico) volvería a leer todo con
      // cada trocito. El registro anuncia por su cuenta solo bloques cerrados.
      role={registro && trabajando ? "group" : "status"}
      {...{ "aria-label": `Burbuja de ${vista.nombre}` }}
    >
      <Ficha vista={vista} panel={panel} onPanel={setPanel} />
      {panel === "historial" && <Historial vista={vista} />}
      {panel === "ayuda" && <Ayuda vista={vista} />}
      {panel === null && (
        <>
          {burbuja &&
            hayTexto(burbuja.texto) &&
            (burbuja.tipo === "respuesta" ? (
              <>
                <Respuesta nombre={vista.nombre} texto={burbuja.texto} />
                {registro && !trabajando && (
                  <RegistroTerminado pokemonId={vista.id} nombre={vista.nombre} registro={registro} />
                )}
              </>
            ) : (
              <p className="burbuja-texto">
                {/* Lo anunciado lleva quién lo dice: con varios en pantalla no se confunden. */}
                <span className="solo-lector">{vista.nombre}: </span>
                {burbuja.texto}
              </p>
            ))}
          {vista.alta && (
            <div className="botones">
              <button
                type="button"
                className="mini"
                aria-label={`Saltar: no enseñarle a ${vista.nombre} cómo suena su nombre`}
                onClick={() => window.poke.saltarAlta(vista.id)}
              >
                Saltar
              </button>
            </div>
          )}
          {registro && trabajando && (
            <RegistroEnVivo
              pokemonId={vista.id}
              nombre={vista.nombre}
              registro={registro}
              alto="tarea"
              titulo={vista.pasos ? `Lo que hace · paso ${vista.pasos}` : "Lo que hace"}
            />
          )}
          <Progreso vista={vista} enBurbuja conRegistro={Boolean(registro && trabajando)} />
          {vista.estado === "error" && (
            <div className="botones">
              <button type="button" className="boton" onClick={() => window.poke.reintentar(vista.id)}>
                Reintentar
              </button>
            </div>
          )}
        </>
      )}
      <CampoEscribir vista={vista} />
    </div>
  );
}
