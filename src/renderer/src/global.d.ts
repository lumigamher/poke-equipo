/// <reference types="vite/client" />
import type { PuentePoke } from "@compartido/tipos";
import type { MicFalso } from "./audio/microfono";

declare global {
  interface Window {
    poke: PuentePoke;
    /** Solo con el micrófono falso del banco de pruebas (desarrollo). */
    __micFalso?: MicFalso;
  }
}
