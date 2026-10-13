import { describe, expect, it } from "vitest";
import { type Contexto, decidir } from "./entrenador";

const ctx = (extra: Partial<Contexto> = {}): Contexto => ({
  candidatos: [
    { id: "p", nombre: "Pikachu", apodos: [] },
    { id: "t", nombre: "Tangela", apodos: [] },
    { id: "s", nombre: "Paras", apodos: [] },
  ],
  permisosDe: [],
  borradoresDe: [],
  escuchandoA: null,
  altaDe: null,
  ...extra,
});

describe("una palabra de mando exacta gana sobre el parecido con un nombre del equipo", () => {
  it("«cancela» con Tangela en el equipo cancela el borrador de Pikachu", () => {
    expect(decidir("cancela", ctx({ borradoresDe: ["p"] }))).toEqual({ tipo: "cancelar", id: "p" });
    expect(decidir("Cancela.", ctx({ borradoresDe: ["p"] }))).toEqual({ tipo: "cancelar", id: "p" });
  });

  it("«para» con Paras en el equipo niega el único permiso a la vista, no es un llamado a Paras", () => {
    const r = decidir("para", ctx({ permisosDe: [{ id: "p", permisoId: "x1" }] }));
    expect(r).toEqual({ tipo: "permiso", id: "p", permisoId: "x1", permitir: false });
  });

  it("los nombres siguen funcionando: «Tangela» y «Paras» llaman su atención; con orden, la reciben", () => {
    expect(decidir("Tangela", ctx())).toEqual({ tipo: "atencion", id: "t" });
    expect(decidir("Paras", ctx())).toEqual({ tipo: "atencion", id: "s" });
    expect(decidir("Paras revisa el login", ctx())).toMatchObject({ tipo: "orden", id: "s" });
  });

  it("nombrar a Tangela y cancelar sigue cancelando SU borrador", () => {
    expect(decidir("Tangela cancela", ctx({ borradoresDe: ["t"] }))).toEqual({ tipo: "cancelar", id: "t" });
  });

  it("nunca aprueba un permiso por esto: «si» sigue exigiendo permiso a la vista", () => {
    expect(decidir("si", ctx())).toEqual({ tipo: "ignorar" });
  });
});
