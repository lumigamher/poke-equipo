import { pideMicFalso } from "@compartido/mic-falso";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { abrirMicrofono, abrirMicrofonoFalso } from "./audio/microfono";
import { iniciarReproductor } from "./audio/reproductor";
import { Preparacion } from "./Preparacion";
import "./estilos.css";

const raiz = document.getElementById("raiz");
// La ventana de "Preparando a tu equipo" carga este mismo renderer con ?preparacion=1: sin escena ni micrófono.
if (new URLSearchParams(location.search).has("preparacion")) {
  if (raiz) createRoot(raiz).render(<Preparacion />);
} else {
  if (raiz) createRoot(raiz).render(<App />);
  iniciarEscena();
}

function iniciarEscena() {
  iniciarReproductor();
  // La hora la sella el worklet al completar cada bloque, no este hilo (que puede estar ocupado).
  const alAudio = (b: { muestras: Float32Array; t: number }) => window.poke.audioEntrada(b);
  // Banco de pruebas (solo desarrollo, `scripts/banco.mjs`): oye solo el audio inyectado, nunca el cuarto.
  const abrir =
    import.meta.env.DEV && pideMicFalso(import.meta.env.DEV, location.search)
      ? () =>
          abrirMicrofonoFalso(alAudio).then((m) => {
            window.__micFalso = m.falso;
            console.info("Micrófono FALSO del banco de pruebas: no se abre el micrófono real.");
            return m;
          })
      : () => abrirMicrofono(alAudio);
  abrir()
    .then((mic) => {
      window.poke.microfonoEstado(true);
      window.poke.alMicrofonoOrden((encendido) => mic.pausar(!encendido));
    })
    .catch((e) => {
      console.warn("Micrófono no disponible:", e);
      window.poke.microfonoEstado(false);
    });
}
