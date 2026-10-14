import { describe, expect, it, vi } from "vitest";
import {
  type EntradaBandeja,
  entradasBandeja,
  type OpcionesBandeja,
  plantillaBandeja,
  submenuModelo,
} from "./bandeja-plantilla";

type Item = ReturnType<typeof plantillaBandeja>[number];

function opciones(
  equipo: EntradaBandeja[],
  microfono = true,
  modelo: string | null = "sonnet",
  incubadora = { auto: false, hayEscondidos: false },
) {
  const o = {
    microfono: () => microfono,
    alMicrofono: vi.fn(),
    equipo: () => equipo,
    alGuardar: vi.fn(),
    alSacar: vi.fn(),
    alCambiarProyecto: vi.fn(),
    alCambiarNombre: vi.fn(),
    modeloDe: vi.fn(() => modelo),
    alCambiarModelo: vi.fn(),
    esconderAlTrabajar: () => incubadora.auto,
    alEsconderAlTrabajar: vi.fn(),
    hayEscondidos: () => incubadora.hayEscondidos,
    alEsconderTodos: vi.fn(),
    alSacarTodos: vi.fn(),
  } satisfies OpcionesBandeja;
  return o;
}

/** Simula el clic de Electron sobre un elemento (el checkbox ya cambió de valor). */
const clic = (i: Item | undefined, checked = false) =>
  (i?.click as ((item: { checked: boolean }) => void) | undefined)?.({ checked });

const sub = (t: Item[], label: string) => t.find((i) => i.label === label)?.submenu as Item[];

describe("plantillaBandeja", () => {
  it("un submenú por Pokémon activo, con guardar, cambiar de proyecto, cambiar nombre y modelo", () => {
    const t = plantillaBandeja(opciones([{ id: "p", nombre: "Pikachu", activo: true }]));
    expect(sub(t, "Pikachu").map((i) => i.label)).toEqual([
      "Guardar en la pokébola",
      "Cambiar de proyecto…",
      "Cambiar nombre…",
      "Modelo",
    ]);
  });

  it("«Modelo» va junto a «Cambiar nombre…», con tres radios y el efectivo marcado", () => {
    const t = plantillaBandeja(opciones([{ id: "p", nombre: "Pikachu", activo: true }], true, "opus"));
    const etiquetas = sub(t, "Pikachu").map((i) => i.label);
    expect(etiquetas.indexOf("Modelo")).toBe(etiquetas.indexOf("Cambiar nombre…") + 1);
    const radios = sub(sub(t, "Pikachu"), "Modelo");
    expect(radios.map((r) => r.type)).toEqual(["radio", "radio", "radio"]);
    expect(radios.map((r) => r.label)).toEqual([
      "Haiku · Rápido y barato",
      "Sonnet · Equilibrado",
      "Opus · El más capaz y más lento",
    ]);
    expect(radios.map((r) => r.checked)).toEqual([false, false, true]);
  });

  it("elegir un modelo avisa con el id exacto del Pokémon y del modelo", () => {
    const o = opciones([
      { id: "p", nombre: "Pikachu", activo: true },
      { id: "s", nombre: "Squirtle", activo: true },
    ]);
    const t = plantillaBandeja(o);
    clic(sub(sub(t, "Squirtle"), "Modelo")[0]);
    clic(sub(sub(t, "Pikachu"), "Modelo")[2]);
    expect(o.alCambiarModelo.mock.calls).toEqual([
      ["s", "haiku"],
      ["p", "opus"],
    ]);
  });

  it("si el modelo efectivo no está en la lista (fable por /model) no se marca ninguno", () => {
    const radios = submenuModelo("fable", () => {}).submenu as Item[];
    expect(radios.map((r) => r.checked)).toEqual([false, false, false]);
  });

  it("los guardados aparecen con 'Sacar a'", () => {
    const t = plantillaBandeja(opciones([{ id: "c", nombre: "Charmander", activo: false }]));
    expect(t.some((i) => i.label === "Sacar a Charmander")).toBe(true);
    expect(t.some((i) => i.label === "Charmander")).toBe(false);
  });

  it("cada opción actúa sobre el id exacto de su Pokémon", () => {
    const o = opciones([
      { id: "p", nombre: "Pikachu", activo: true },
      { id: "s", nombre: "Squirtle", activo: true },
      { id: "c", nombre: "Charmander", activo: false },
    ]);
    const t = plantillaBandeja(o);
    clic(sub(t, "Squirtle").find((i) => i.label === "Guardar en la pokébola"));
    clic(sub(t, "Pikachu").find((i) => i.label === "Cambiar de proyecto…"));
    clic(sub(t, "Squirtle").find((i) => i.label === "Cambiar nombre…"));
    clic(t.find((i) => i.label === "Sacar a Charmander"));
    expect(o.alGuardar.mock.calls).toEqual([["s"]]);
    expect(o.alCambiarProyecto.mock.calls).toEqual([["p"]]);
    expect(o.alSacar.mock.calls).toEqual([["c"]]);
    expect(o.alCambiarNombre.mock.calls).toEqual([["s"]]);
  });

  it("«Cambiar nombre…» va justo después de «Cambiar de proyecto…»", () => {
    const t = plantillaBandeja(opciones([{ id: "p", nombre: "Pikachu", activo: true }]));
    const etiquetas = sub(t, "Pikachu").map((i) => i.label);
    expect(etiquetas.indexOf("Cambiar nombre…")).toBe(etiquetas.indexOf("Cambiar de proyecto…") + 1);
  });

  it("con 0 en pantalla sigue ofreciendo sacar a los guardados (y salir)", () => {
    const t = plantillaBandeja(
      opciones([
        { id: "p", nombre: "Pikachu", activo: false },
        { id: "c", nombre: "Charmander", activo: false },
      ]),
    );
    const labels = t.map((i) => i.label).filter(Boolean);
    expect(labels).toEqual(["Micrófono", "Sacar a Pikachu", "Sacar a Charmander", "Salir"]);
  });

  it("el micrófono es un checkbox con el estado actual y avisa el nuevo", () => {
    const o = opciones([], false);
    const t = plantillaBandeja(o);
    const mic = t.find((i) => i.label === "Micrófono");
    expect(mic?.type).toBe("checkbox");
    expect(mic?.checked).toBe(false);
    clic(mic, true);
    expect(o.alMicrofono).toHaveBeenCalledWith(true);
  });

  it("con alguien en pantalla ofrece la incubadora: esconder a todos, sacar a todos y esconderse solos", () => {
    const o = opciones([{ id: "p", nombre: "Pikachu", activo: true }], true, "sonnet", {
      auto: false,
      hayEscondidos: true,
    });
    const t = plantillaBandeja(o);
    const labels = t.map((i) => i.label).filter(Boolean);
    const desde = labels.indexOf("Esconder a todos en la incubadora");
    expect(labels.slice(desde, desde + 3)).toEqual([
      "Esconder a todos en la incubadora",
      "Sacar a todos de la incubadora",
      "Esconderse solos al trabajar",
    ]);
    clic(t.find((i) => i.label === "Esconder a todos en la incubadora"));
    expect(o.alEsconderTodos).toHaveBeenCalledTimes(1);
    clic(t.find((i) => i.label === "Sacar a todos de la incubadora"));
    expect(o.alSacarTodos).toHaveBeenCalledTimes(1);
  });

  it("«Sacar a todos» solo se habilita si hay alguien en la incubadora", () => {
    const sin = plantillaBandeja(opciones([{ id: "p", nombre: "Pikachu", activo: true }]));
    expect(sin.find((i) => i.label === "Sacar a todos de la incubadora")?.enabled).toBe(false);
  });

  it("«Esconderse solos al trabajar» es un checkbox con el estado actual y avisa el nuevo", () => {
    const o = opciones([{ id: "p", nombre: "Pikachu", activo: true }], true, "sonnet", {
      auto: true,
      hayEscondidos: false,
    });
    const t = plantillaBandeja(o);
    const auto = t.find((i) => i.label === "Esconderse solos al trabajar");
    expect(auto?.type).toBe("checkbox");
    expect(auto?.checked).toBe(true);
    clic(auto, false);
    expect(o.alEsconderAlTrabajar).toHaveBeenCalledWith(false);
  });

  it("salir usa el rol quit; ninguna opción toca permisos", () => {
    const t = plantillaBandeja(opciones([{ id: "p", nombre: "Pikachu", activo: true }]));
    expect(t.find((i) => i.label === "Salir")?.role).toBe("quit");
    const todas = [...t, ...sub(t, "Pikachu")].map((i) => String(i.label ?? "").toLowerCase());
    expect(todas.some((l) => l.includes("permit") || l.includes("aprob"))).toBe(false);
  });
});

describe("entradasBandeja", () => {
  const base = [
    { id: "p", nombre: "Pikachu" },
    { id: "c", nombre: "Charmander" },
    { id: "s", nombre: "Squirtle" },
  ];

  it("los vivos en pantalla son activos; los demás de la base, para sacar", () => {
    const e = entradasBandeja(base, [{ id: "p", nombre: "Pikachu" }], () => true);
    expect(e).toEqual([
      { id: "p", nombre: "Pikachu", activo: true },
      { id: "c", nombre: "Charmander", activo: false },
      { id: "s", nombre: "Squirtle", activo: false },
    ]);
  });

  it("el nombre del activo sale de su vista (la de pantalla manda)", () => {
    const e = entradasBandeja(base, [{ id: "c", nombre: "Charmeleon" }], () => true);
    expect(e[0]).toEqual({ id: "c", nombre: "Charmeleon", activo: true });
  });

  it("uno en pantalla que se está guardando no aparece (ni para guardar ni para sacar)", () => {
    const e = entradasBandeja(
      base,
      [
        { id: "p", nombre: "Pikachu" },
        { id: "c", nombre: "Charmander" },
      ],
      (id) => id !== "c",
    );
    expect(e.map((x) => `${x.id}:${x.activo}`)).toEqual(["p:true", "s:false"]);
  });
});
