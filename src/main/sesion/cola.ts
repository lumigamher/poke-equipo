export function crearCola<T>() {
  const pendientes: T[] = [];
  let despertar: (() => void) | null = null;
  let cerrada = false;
  const tocar = () => {
    despertar?.();
    despertar = null;
  };

  async function* generar(): AsyncGenerator<T> {
    while (true) {
      while (pendientes.length === 0 && !cerrada) {
        await new Promise<void>((r) => {
          despertar = r;
        });
      }
      if (pendientes.length === 0) return;
      yield pendientes.shift() as T;
    }
  }

  return {
    iterable: generar() as AsyncIterable<T>,
    poner(v: T) {
      if (cerrada) return;
      pendientes.push(v);
      tocar();
    },
    cerrar() {
      cerrada = true;
      tocar();
    },
  };
}
