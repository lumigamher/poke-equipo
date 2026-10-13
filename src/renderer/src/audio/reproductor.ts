/** Reproduce la voz que manda el proceso principal y los gritos, y avisa cuando termina. */
export function iniciarReproductor(): void {
  const ctx = new AudioContext();
  let actual: AudioBufferSourceNode | null = null;

  window.poke.alReproducir(({ id, muestras, frecuencia }) => {
    actual?.stop();
    // Sin muestras createBuffer lanza: se avisa el fin al instante para no dejar el micrófono cerrado.
    if (muestras.length === 0) {
      window.poke.reproduccionFin(id);
      return;
    }
    const bufer = ctx.createBuffer(1, muestras.length, frecuencia);
    bufer.copyToChannel(Float32Array.from(muestras), 0);
    const fuente = ctx.createBufferSource();
    fuente.buffer = bufer;
    fuente.connect(ctx.destination);
    fuente.onended = () => {
      if (actual === fuente) actual = null;
      window.poke.reproduccionFin(id);
    };
    actual = fuente;
    fuente.start();
  });

  window.poke.alDetener(() => {
    actual?.stop();
  });

  window.poke.alSonar((url) => {
    const grito = new Audio(url);
    grito.volume = 0.6;
    void grito.play().catch(() => {
      // Sin grito no pasa nada: la animación ya avisa.
    });
  });
}
