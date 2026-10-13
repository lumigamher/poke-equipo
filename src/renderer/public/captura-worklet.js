// Junta el audio del micrófono en bloques de 100 ms (1600 muestras a 16 kHz) y los manda al hilo principal.
// La hora (Date.now(), disponible en el AudioWorkletGlobalScope de Chromium) se toma aquí, dentro de process(),
// en el momento en que el bloque queda completo: si el hilo principal se atasca, los bloques en cola no se sellan tarde.
class Captura extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bloque = new Float32Array(1600);
    this.lleno = 0;
  }

  process(entradas) {
    const canal = entradas[0]?.[0];
    if (!canal) return true;
    let i = 0;
    while (i < canal.length) {
      const cabe = Math.min(canal.length - i, this.bloque.length - this.lleno);
      this.bloque.set(canal.subarray(i, i + cabe), this.lleno);
      this.lleno += cabe;
      i += cabe;
      if (this.lleno === this.bloque.length) {
        this.port.postMessage({ muestras: this.bloque.slice(), t: Date.now() });
        this.lleno = 0;
      }
    }
    return true;
  }
}

registerProcessor("captura", Captura);
