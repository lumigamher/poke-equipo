import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";

/** Lo que se ve si el laboratorio falla al dibujarse: una salida clara en vez de una ventana muda. */
function LabCaido() {
  // La ventana puede tomar el teclado para que Enter funcione sobre "Salir".
  useEffect(() => {
    window.poke.enfocar(true);
    return () => window.poke.enfocar(false);
  }, []);
  return (
    <>
      <div className="lab-velo" aria-hidden="true" />
      <section
        data-captura=""
        className="lab lab-caido"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lab-caido-titulo"
      >
        <h1 id="lab-caido-titulo" className="lab-titulo">
          El laboratorio no se pudo abrir
        </h1>
        <p className="lab-ayuda">Algo falló al dibujarlo. Puedes salir y volver a abrir Poke Equipo.</p>
        <div className="lab-botones">
          <button
            type="button"
            className="boton boton-si"
            onClick={() => window.poke.inicial({ tipo: "salir" })}
          >
            Salir
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * Si el laboratorio lanza un error, avisa a main (que suelta el ratón y el teclado de la ventana) y muestra un
 * mensaje con un botón "Salir". Sin esto la ventana quedaría tapando el escritorio sin nada que hacer.
 */
export class LabErrorBoundary extends Component<{ children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("El laboratorio falló al dibujarse:", error, info.componentStack);
    window.poke.labFallo();
  }
  render() {
    return this.state.fallo ? <LabCaido /> : this.props.children;
  }
}
