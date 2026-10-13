#!/usr/bin/env node
// Banco de pruebas de Poke Equipo: la app real en desarrollo, con perfil temporal y un micrófono FALSO
// que oye SOLO el audio que se le inyecta (nunca el cuarto).
//
// Uso (cada orden es un proceso aparte; el estado vive en <datos>/banco.json):
//   node scripts/banco.mjs abrir   --datos <dir> [--vida s]
//                                                       lanza el banco (perfil y proyecto temporales en <dir>)
//   node scripts/banco.mjs wav     --datos <dir> <a.wav> [más.wav…] [--pausa ms]
//                                                       reproduce cada WAV como si se hablara (espera a que termine)
//   node scripts/banco.mjs eval    --datos <dir> '<js>' evalúa en el renderer (admite await) e imprime el valor
//   node scripts/banco.mjs main    --datos <dir> '<js>' evalúa en el proceso main (usar `process.mainModule.require`)
//   node scripts/banco.mjs captura --datos <dir> <salida.png>   captura del renderer por CDP
//   node scripts/banco.mjs vigilar --datos <dir> <logpoints.json>
//        pone logpoints en out/main/index.js y queda conectado imprimiendo lo que salga (Ctrl+C o `cerrar`).
//        logpoints.json: [{ "buscar": "texto de la línea (1.ª coincidencia)", "desplazar": 0, "log": "expr JS" }, …]
//        (los logpoints solo viven mientras `vigilar` siga conectado).
//   node scripts/banco.mjs espiar-raton --datos <dir>
//        (solo banco, sin tocar el código de la app) envuelve en main `win.setIgnoreMouseEvents` y `win.blur` de la
//        ventana de la escena y anota CADA llamada, con marca de tiempo en ms (Date.now()) y argumentos, en
//        <datos>/raton.log (una línea JSON por llamada). Es idempotente y sigue activo hasta cerrar el banco.
//   node scripts/banco.mjs leer-raton   --datos <dir> [n=40]   imprime las últimas n líneas de <datos>/raton.log
//        (o `cat <datos>/raton.log`). Sirve para ver cuándo la ventana captura o suelta el ratón y cuándo hace blur.
//   node scripts/banco.mjs cerrar  --datos <dir>       cierra TODO lo que lanzó el banco (y solo eso)
//
// Garantías:
//   - No arranca si hay otra Poke Equipo abierta (la de la persona): `pgrep -fl "poke-equipo.*electron"`.
//   - Nunca queda una ventana olvidada: un guardián aparte cierra el banco a los --vida segundos (300 por
//     defecto) aunque quien lo lanzó muera; `abrir` cierra primero un banco viejo del mismo <dir>, y si falla o
//     recibe SIGINT/SIGTERM cierra lo que alcanzó a lanzar. `cerrar` mata el grupo entero de procesos, todo lo
//     que lleve el perfil temporal en su línea de órdenes, y los `vigilar` y el guardián de ese <dir>.
//   - Perfil propio (--user-data-dir=<datos>/perfil): no toca el equipo ni las preferencias de la persona.
//   - Micrófono falso: main recibe POKE_MIC_FALSO=1 y carga el renderer con `?micFalso=1`; el Escenario entonces
//     NO llama a getUserMedia (ver src/compartido/mic-falso.ts). Como la marca va en la URL, sobrevive a
//     cualquier recarga del renderer (p. ej. Vite al editar src/renderer). Sin inyectar nada la app oye silencio.
//   - La primera vez (base vacía) la app muestra el laboratorio y, ya elegido el inicial, pregunta la carpeta del
//     proyecto: el banco contesta ESA pregunta una sola vez con <datos>/proyecto (stub de dialog.showOpenDialog que
//     se quita solo tras usarse). `abrir --sin-stub 1` no pone el stub: el diálogo nativo sale de verdad (para
//     mirarlo con `screencapture -x`).
//   - Entrada real (CDP Input.*, no .click() del DOM):
//       raton  --datos <d> <x> <y> [mover|clic|derecho]   (coordenadas CSS de la ventana; por defecto clic)
//       tecla  --datos <d> <Tecla> [repetir]      (Enter, Escape, ArrowRight, Tab…; «repetir» = autorepetición)
//       cuadros --datos <d> <prefijo> [n=12] [ms=250]   ráfaga de capturas CDP
//       hoja --datos <d> <salida.png> <columnas> <a.png> [b.png…]   contacto de cuadros (recortar antes con sips)
//       reducir --datos <d> [s=60]   emula prefers-reduced-motion mientras dure (lanzar en segundo plano)
//       inicial --datos <d> <Nombre>              recorre el laboratorio con ratón real: bola → «Sí» → espera a que
//                                                 termine la ceremonia (o la salta con --saltar 1) y la carpeta
//   - Mientras un Pokémon habla, la app pausa la captura: el WAV en curso se congela y sigue al reanudar.
//
// Puertos: inspector de main 9229, CDP del renderer 9333 (cambiar con --inspector / --cdp en `abrir`).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function args() {
  const [orden, ...resto] = process.argv.slice(2);
  const opciones = {};
  const sueltos = [];
  for (let i = 0; i < resto.length; i++) {
    if (resto[i].startsWith("--")) opciones[resto[i].slice(2)] = resto[++i];
    else sueltos.push(resto[i]);
  }
  return { orden, opciones, sueltos };
}

function fallar(mensaje) {
  console.error(`banco: ${mensaje}`);
  process.exit(1);
}

// ---------- CDP mínimo (WebSocket global de Node ≥ 22) ----------

async function objetivos(puerto) {
  const r = await fetch(`http://127.0.0.1:${puerto}/json/list`);
  return r.json();
}

function conectar(url) {
  return new Promise((resolver, rechazar) => {
    const ws = new WebSocket(url);
    let n = 0;
    const pendientes = new Map();
    const oyentes = new Set();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pendientes.has(m.id)) {
        const { ok, ko } = pendientes.get(m.id);
        pendientes.delete(m.id);
        if (m.error) ko(new Error(`${m.error.message} ${m.error.data ?? ""}`));
        else ok(m.result);
      } else if (m.method) for (const o of oyentes) o(m);
    };
    ws.onerror = () => rechazar(new Error(`no se pudo conectar a ${url}`));
    ws.onopen = () =>
      resolver({
        enviar: (method, params = {}) =>
          new Promise((ok, ko) => {
            const id = ++n;
            pendientes.set(id, { ok, ko });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        oir: (fn) => oyentes.add(fn),
        alCerrarse: (fn) => ws.addEventListener("close", fn),
        cerrar: () => ws.close(),
      });
  });
}

function valorDe(r) {
  if (r.exceptionDetails) {
    const ex = r.exceptionDetails.exception;
    throw new Error(ex?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}

// ---------- estado del banco ----------

function datosDir(opciones) {
  const dir = opciones.datos ?? process.env.BANCO_DATOS;
  if (!dir) fallar("falta --datos <dir> (o BANCO_DATOS)");
  return resolve(dir);
}

function leerEstado(dir) {
  const f = join(dir, "banco.json");
  if (!existsSync(f)) fallar(`no hay banco abierto en ${dir}`);
  return JSON.parse(readFileSync(f, "utf8"));
}

/** Procesos de Poke Equipo que NO son de este banco (la app de la persona u otro banco). */
function otrasApps(perfil) {
  const r = spawnSync("pgrep", ["-fl", "poke-equipo.*electron"], { encoding: "utf8" });
  return (r.stdout ?? "").split("\n").filter((l) => l.trim() !== "" && !(perfil && l.includes(perfil)));
}

async function renderer(estado) {
  const pagina = (await objetivos(estado.cdp)).find((o) => o.type === "page" && o.url.includes("micFalso=1"));
  if (!pagina) throw new Error("no encuentro la página del Escenario con el micrófono falso");
  return conectar(pagina.webSocketDebuggerUrl);
}

async function inspectorMain(estado) {
  const [o] = await objetivos(estado.inspector);
  if (!o) throw new Error("no encuentro el inspector de main");
  return conectar(o.webSocketDebuggerUrl);
}

async function evaluarRenderer(estado, expresion) {
  const cdp = await renderer(estado);
  try {
    return valorDe(
      await cdp.enviar("Runtime.evaluate", {
        expression: expresion,
        awaitPromise: true,
        returnByValue: true,
        replMode: true,
      }),
    );
  } finally {
    cdp.cerrar();
  }
}

// ---------- órdenes ----------

async function abrir(opciones) {
  const dir = datosDir(opciones);
  const perfil = join(dir, "perfil");
  const proyecto = join(dir, "proyecto");
  // Un banco viejo de este mismo <dir> (quedó abierto de una corrida anterior) se cierra antes de nada.
  if (existsSync(join(dir, "banco.json")) || procesosDe(perfil).length > 0) {
    console.log("banco: había un banco viejo en este directorio; lo cierro");
    await cerrar(opciones);
  }
  const otras = otrasApps(perfil);
  if (otras.length > 0) fallar(`hay otra Poke Equipo abierta, no lanzo el banco:\n${otras.join("\n")}`);
  mkdirSync(perfil, { recursive: true });
  mkdirSync(proyecto, { recursive: true });
  const inspector = Number(opciones.inspector ?? 9229);
  const cdp = Number(opciones.cdp ?? 9333);
  const vida = Number(opciones.vida ?? 300);
  const log = join(dir, "banco.log");
  const salida = openSync(log, "a");
  const hijo = spawn(
    join(RAIZ, "node_modules/.bin/electron-vite"),
    [
      "dev",
      "--inspectBrk",
      String(inspector),
      "--remoteDebuggingPort",
      String(cdp),
      "--",
      `--user-data-dir=${perfil}`,
    ],
    {
      cwd: RAIZ,
      detached: true,
      stdio: ["ignore", salida, salida],
      env: { ...process.env, POKE_MIC_FALSO: "1" },
    },
  );
  hijo.unref();
  const estado = {
    sinStub: opciones["sin-stub"] === "1",
    pid: hijo.pid,
    perfil,
    proyecto,
    inspector,
    cdp,
    log,
    vida,
    guardian: null,
  };
  writeFileSync(join(dir, "banco.json"), JSON.stringify(estado, null, 2));
  // El guardián vive aparte: cierra el banco al vencer la vida aunque este proceso (o quien lo llamó) muera.
  const guardian = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "guardian", "--datos", dir, "--vida", String(vida)],
    { detached: true, stdio: ["ignore", salida, salida] },
  );
  guardian.unref();
  estado.guardian = guardian.pid;
  writeFileSync(join(dir, "banco.json"), JSON.stringify(estado, null, 2));
  console.log(`banco: lanzado (pid ${hijo.pid}), se cierra solo en ${vida} s; log en ${log}`);

  // Si el arranque falla o lo interrumpen, no queda nada abierto.
  const abortar = async (motivo) => {
    console.error(`banco: ${motivo}; cierro lo lanzado`);
    await cerrar(opciones).catch(() => {});
    process.exit(1);
  };
  for (const senal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(senal, () => void abortar(`recibí ${senal}`));
  process.on("uncaughtException", (e) => void abortar(e.message));
  process.on("unhandledRejection", (e) => void abortar(String(e)));
  try {
    await prepararMain(estado);
    await esperarEscenario(estado);
  } catch (e) {
    await abortar(e.message);
  }
  console.log(`banco: listo; perfil ${perfil}; micrófono falso activo`);
}

/** main arranca detenido (--inspectBrk): se pone el stub de la carpeta inicial, se comprueba el perfil y sigue. */
async function prepararMain(estado) {
  let main = null;
  for (let i = 0; i < 120 && !main; i++) {
    await esperar(500);
    try {
      const [o] = await objetivos(estado.inspector);
      if (o) main = await conectar(o.webSocketDebuggerUrl);
    } catch {
      // aún no escucha
    }
  }
  if (!main) throw new Error("el inspector de main no apareció (mira el log)");
  const pausas = [];
  let avisar = null;
  main.oir((m) => {
    if (m.method !== "Debugger.paused") return;
    pausas.push(m.params);
    avisar?.();
  });
  const siguientePausa = async () => {
    while (pausas.length === 0) await new Promise((r) => (avisar = r));
    return pausas.shift();
  };
  await main.enviar("Runtime.enable");
  await main.enviar("Debugger.enable");
  await main.enviar("Runtime.runIfWaitingForDebugger");
  // La primera pausa es el cargador de Electron (ESM, sin require): se sigue hasta la 1.ª línea del bundle de main.
  await siguientePausa();
  const { breakpointId } = await main.enviar("Debugger.setBreakpointByUrl", {
    urlRegex: "out/main/index\\.js$",
    lineNumber: 1,
  });
  await main.enviar("Debugger.resume");
  const { callFrames } = await siguientePausa();
  await main.enviar("Debugger.removeBreakpoint", { breakpointId });
  const enMarco = async (expression) =>
    valorDe(
      await main.enviar("Debugger.evaluateOnCallFrame", {
        callFrameId: callFrames[0].callFrameId,
        expression,
        returnByValue: true,
      }),
    );
  // Antes de dejarlo seguir: si el perfil no es el temporal, no se sigue (no se toca el equipo de la persona).
  const userData = await enMarco(`require("electron").app.getPath("userData")`);
  if (resolve(userData) !== resolve(estado.perfil)) {
    throw new Error(`userData es ${userData}, no el perfil temporal`);
  }
  if (estado.sinStub) {
    await main.enviar("Debugger.resume");
    main.cerrar();
    return;
  }
  await enMarco(`(() => {
    const { dialog } = require("electron");
    const real = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => {
      dialog.showOpenDialog = real;
      console.info("banco: carpeta inicial contestada con el proyecto temporal");
      return { canceled: false, filePaths: [${JSON.stringify(estado.proyecto)}] };
    };
    return "ok";
  })()`);
  await main.enviar("Debugger.resume");
  main.cerrar();
}

async function esperarEscenario(estado) {
  for (let i = 0; i < 240; i++) {
    await esperar(500);
    try {
      if (await evaluarRenderer(estado, `typeof window.__micFalso?.reproducir === "function"`)) return;
    } catch {
      // la página aún no está
    }
  }
  throw new Error("el Escenario no abrió el micrófono falso (mira el log)");
}

/** Cierra el banco al vencer su vida, pase lo que pase con quien lo abrió. */
async function guardian(opciones) {
  await esperar(Number(opciones.vida ?? 300) * 1000);
  console.log("banco: venció la vida del banco; el guardián lo cierra");
  await cerrar(opciones);
}

async function wav(opciones, rutas) {
  const estado = leerEstado(datosDir(opciones));
  const pausa = Number(opciones.pausa ?? 0);
  for (const [i, ruta] of rutas.entries()) {
    // Con la captura pausada (un Pokémon hablando o la escucha apagada) el WAV quedaría congelado.
    const ctx = await evaluarRenderer(estado, "window.__micFalso.estado()");
    if (ctx !== "running") fallar(`la app tiene el micrófono cerrado (${ctx}); no reproduzco ${ruta}`);
    const b64 = readFileSync(resolve(ruta)).toString("base64");
    const r = await evaluarRenderer(
      estado,
      `await (async () => {
        const datos = Uint8Array.from(atob("${b64}"), (c) => c.charCodeAt(0)).buffer;
        const inicio = Date.now();
        const duracion = await window.__micFalso.reproducir(datos);
        return { inicio, fin: Date.now(), duracion, estado: window.__micFalso.estado() };
      })()`,
    );
    console.log(JSON.stringify({ wav: ruta, ...r }));
    if (pausa && i < rutas.length - 1) await esperar(pausa);
  }
}

async function evaluar(opciones, [expresion]) {
  const estado = leerEstado(datosDir(opciones));
  console.log(JSON.stringify(await evaluarRenderer(estado, expresion), null, 2));
}

async function evaluarMain(opciones, [expresion]) {
  const estado = leerEstado(datosDir(opciones));
  const cdp = await inspectorMain(estado);
  try {
    const r = await cdp.enviar("Runtime.evaluate", {
      expression: expresion,
      awaitPromise: true,
      returnByValue: true,
      replMode: true,
    });
    console.log(JSON.stringify(valorDe(r), null, 2));
  } finally {
    cdp.cerrar();
  }
}

async function espiarRaton(opciones) {
  const dir = datosDir(opciones);
  const log = join(dir, "raton.log");
  const js = `(() => {
    const { BrowserWindow } = process.mainModule.require("electron");
    const fs = process.mainModule.require("node:fs");
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return "sin ventana";
    if (win.__espiaRaton) return "ya espiaba";
    win.__espiaRaton = true;
    const anotar = (llamada, args) =>
      fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ t: Date.now(), llamada, args }) + "\\n");
    for (const nombre of ["setIgnoreMouseEvents", "blur"]) {
      const original = win[nombre].bind(win);
      win[nombre] = (...args) => {
        anotar(nombre, args);
        return original(...args);
      };
    }
    anotar("espiar", []);
    return "espiando";
  })()`;
  await evaluarMain(opciones, [js]);
  console.log(`registro: ${log}`);
}

function leerRaton(opciones, [n = "40"]) {
  const log = join(datosDir(opciones), "raton.log");
  if (!existsSync(log)) fallar(`no hay ${log}; lanza antes «espiar-raton»`);
  console.log(readFileSync(log, "utf8").trim().split("\n").slice(-Number(n)).join("\n"));
  return Promise.resolve();
}

async function conCdp(opciones, fn) {
  const cdp = await renderer(leerEstado(datosDir(opciones)));
  try {
    return await fn(cdp);
  } finally {
    cdp.cerrar();
  }
}

const TECLAS = {
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Escape: { code: "Escape", vk: 27 },
  Tab: { code: "Tab", vk: 9 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  " ": { code: "Space", vk: 32, text: " " },
};

async function teclaCdp(cdp, key, repetir = false, mod = 0) {
  const t = TECLAS[key] ?? { code: key, vk: key.toUpperCase().charCodeAt(0), text: key };
  const base = { key, code: t.code, windowsVirtualKeyCode: t.vk, nativeVirtualKeyCode: t.vk, modifiers: mod };
  await cdp.enviar("Input.dispatchKeyEvent", {
    type: t.text ? "keyDown" : "rawKeyDown",
    ...base,
    text: t.text,
    autoRepeat: repetir,
  });
  await cdp.enviar("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

async function ratonCdp(cdp, x, y, accion = "clic") {
  await cdp.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  if (accion === "derecho") {
    await cdp.enviar("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "right",
      buttons: 2,
      clickCount: 1,
    });
    await cdp.enviar("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "right",
      clickCount: 1,
    });
    return;
  }
  if (accion !== "clic") return;
  await cdp.enviar("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.enviar("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
}

const evalEn = async (cdp, expression) =>
  valorDe(
    await cdp.enviar("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      replMode: true,
    }),
  );

async function raton(opciones, [x, y, accion]) {
  await conCdp(opciones, (cdp) => ratonCdp(cdp, Number(x), Number(y), accion));
  console.log(`banco: ratón ${accion ?? "clic"} en ${x},${y}`);
}

async function tecla(opciones, [key, repetir]) {
  await conCdp(opciones, async (cdp) => {
    await teclaCdp(cdp, key, false);
    if (repetir === "repetir") for (let i = 0; i < 5; i++) await teclaCdp(cdp, key, true);
  });
  console.log(`banco: tecla ${key}${repetir ? " (con autorepetición)" : ""}`);
}

/** Centro (coordenadas CSS) del primer elemento que cumple la expresión, o null. */
const centroDe = (cdp, js) =>
  evalEn(
    cdp,
    `(() => { const el = (${js}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );

async function esperarCentro(cdp, js, ms = 15000) {
  for (let t = 0; t < ms; t += 250) {
    const c = await centroDe(cdp, js);
    if (c) return c;
    await esperar(250);
  }
  throw new Error(`no apareció ${js}`);
}

async function inicial(opciones, [nombre]) {
  if (!nombre) fallar("uso: inicial <Nombre>");
  await conCdp(opciones, async (cdp) => {
    const bola = await esperarCentro(
      cdp,
      `[...document.querySelectorAll('[role=radio]')].find((b) => b.getAttribute('aria-label').startsWith(${JSON.stringify(nombre)}))`,
    );
    await ratonCdp(cdp, bola.x, bola.y);
    const si = await esperarCentro(
      cdp,
      `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Sí')`,
    );
    await ratonCdp(cdp, si.x, si.y);
    if (opciones.saltar === "1") {
      const saltar = await esperarCentro(
        cdp,
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Saltar')`,
      );
      await ratonCdp(cdp, saltar.x, saltar.y);
    }
    console.log(`banco: ${nombre} elegido; esperando carpeta y tour`);
    for (let t = 0; t < 30000; t += 500) {
      if (!(await evalEn(cdp, `!!document.querySelector('.lab')`)))
        return console.log("banco: laboratorio cerrado");
      await esperar(500);
    }
    throw new Error("el laboratorio no se cerró (¿diálogo de carpeta abierto? usa --sin-stub solo a mano)");
  });
}

/** Ráfaga: N capturas CDP seguidas cada <ms> en <prefijo>-NN.png (para juzgar una animación cuadro a cuadro). */
async function cuadros(opciones, [prefijo, n = "12", ms = "250"]) {
  await conCdp(opciones, async (cdp) => {
    const t0 = Date.now();
    for (let i = 0; i < Number(n); i++) {
      const { data } = await cdp.enviar("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${resolve(prefijo)}-${String(i).padStart(2, "0")}.png`, Buffer.from(data, "base64"));
      const falta = t0 + (i + 1) * Number(ms) - Date.now();
      if (falta > 0) await esperar(falta);
    }
  });
  console.log(`banco: ${n} cuadros en ${resolve(prefijo)}-NN.png`);
}

/** Hoja de contacto: junta PNG (ya recortados/pequeños) en una sola imagen, dibujándolos en un canvas del renderer. */
async function hoja(opciones, [salida, columnas, ...pngs]) {
  const b64 = pngs.map((f) => readFileSync(resolve(f)).toString("base64"));
  const url = await conCdp(opciones, (cdp) =>
    evalEn(
      cdp,
      `await (async () => {
        const imgs = await Promise.all(${JSON.stringify(b64)}.map((b) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = "data:image/png;base64," + b; })));
        const c = ${Number(columnas)}, w = imgs[0].width, h = imgs[0].height, f = Math.ceil(imgs.length / c);
        const cv = document.createElement("canvas"); cv.width = w * c; cv.height = h * f;
        const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
        imgs.forEach((im, i) => { g.drawImage(im, (i % c) * w, Math.floor(i / c) * h); g.strokeStyle = "#f00"; g.strokeRect((i % c) * w, Math.floor(i / c) * h, w, h); g.fillStyle = "#f00"; g.font = "16px sans-serif"; g.fillText(String(i), (i % c) * w + 6, Math.floor(i / c) * h + 18); });
        return cv.toDataURL("image/png");
      })()`,
    ),
  );
  if (typeof url !== "string") fallar(`la hoja no salió: ${JSON.stringify(url)}`);
  writeFileSync(resolve(salida), Buffer.from(url.split(",")[1], "base64"));
  console.log(`banco: hoja en ${resolve(salida)}`);
}

/** Mantiene conectado un cliente CDP con `prefers-reduced-motion: reduce` (el emulado dura lo que dure la conexión). */
async function reducir(opciones, [segundos = "60"]) {
  await conCdp(opciones, async (cdp) => {
    await cdp.enviar("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    console.log(`banco: movimiento reducido emulado durante ${segundos} s`);
    await esperar(Number(segundos) * 1000);
  });
}

async function captura(opciones, [salida]) {
  const estado = leerEstado(datosDir(opciones));
  const cdp = await renderer(estado);
  try {
    const { data } = await cdp.enviar("Page.captureScreenshot", { format: "png" });
    writeFileSync(resolve(salida), Buffer.from(data, "base64"));
    console.log(`banco: captura en ${resolve(salida)}`);
  } finally {
    cdp.cerrar();
  }
}

async function vigilar(opciones, [archivo]) {
  const estado = leerEstado(datosDir(opciones));
  const puntos = JSON.parse(readFileSync(resolve(archivo), "utf8"));
  const lineas = readFileSync(join(RAIZ, "out/main/index.js"), "utf8").split("\n");
  const cdp = await inspectorMain(estado);
  cdp.oir((m) => {
    if (m.method !== "Runtime.consoleAPICalled") return;
    const texto = m.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
    if (texto.startsWith("[banco]")) console.log(`${new Date().toISOString()} ${texto}`);
  });
  await cdp.enviar("Runtime.enable");
  await cdp.enviar("Debugger.enable");
  for (const p of puntos) {
    const hallada = lineas.findIndex((l) => l.includes(p.buscar));
    if (hallada < 0) fallar(`no encuentro «${p.buscar}» en out/main/index.js`);
    const n = hallada + (p.desplazar ?? 0);
    await cdp.enviar("Debugger.setBreakpointByUrl", {
      urlRegex: "out/main/index\\.js$",
      lineNumber: n,
      condition: `console.log("[banco]", ${p.log}), false`,
    });
    console.log(`banco: logpoint en la línea ${n + 1}: ${p.buscar}`);
  }
  console.log("banco: vigilando (Ctrl+C para terminar; termina solo al cerrarse el banco)");
  await new Promise((r) => cdp.alCerrarse(r));
}

/** Una ruta como expresión regular literal, para `pgrep -f` y `pkill -f`. */
const comoRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ¿Ese pid, leído de un banco.json viejo, sigue siendo un proceso de ESTE banco? Tras un fallo o un reinicio el sistema
 * reutiliza pids: solo se mata lo que lleva `marca` (el perfil temporal o el guardián de este directorio) en su línea.
 */
function esDelBanco(pid, marca) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  const r = spawnSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
  return r.status === 0 && (r.stdout ?? "").includes(marca);
}

/** Procesos que llevan el perfil temporal en su línea de órdenes (Electron y sus ayudantes). */
function procesosDe(perfil) {
  const r = spawnSync("pgrep", ["-fl", comoRegex(perfil)], { encoding: "utf8" });
  return (r.stdout ?? "").split("\n").filter((l) => l.trim() !== "");
}

function quedan(estado, dir) {
  const grupo = estado.pid ? spawnSync("pgrep", ["-g", String(estado.pid)], { encoding: "utf8" }).stdout : "";
  return [...procesosDe(join(dir, "perfil")), ...(grupo ?? "").split("\n").filter((l) => l.trim() !== "")];
}

async function cerrar(opciones) {
  const dir = datosDir(opciones);
  const f = join(dir, "banco.json");
  const guardado = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  const perfil = join(dir, "perfil");
  const marcaGuardian = `banco.mjs guardian --datos ${dir}`;
  // Un pid que ya no es del banco (reutilizado por otro proceso) se salta: ni el grupo ni el guardián.
  const estado = {
    ...guardado,
    pid: esDelBanco(guardado.pid, perfil) ? guardado.pid : null,
    guardian: esDelBanco(guardado.guardian, marcaGuardian) ? guardado.guardian : null,
  };
  const matar = (senal) => {
    try {
      if (estado.pid) process.kill(-estado.pid, senal); // todo el grupo que lanzó el banco (electron-vite y Electron)
    } catch {
      // ya no existe
    }
    // Electron y sus ayudantes llevan el perfil temporal en la línea de órdenes: solo esos.
    spawnSync("pkill", [`-${senal === "SIGKILL" ? "KILL" : "TERM"}`, "-f", comoRegex(perfil)]);
  };
  matar("SIGTERM");
  for (let i = 0; i < 20 && quedan(estado, dir).length > 0; i++) await esperar(250);
  if (quedan(estado, dir).length > 0) matar("SIGKILL");
  await esperar(500);
  // Los `vigilar` de este directorio y el guardián (si no soy yo).
  spawnSync("pkill", ["-f", comoRegex(`banco.mjs vigilar --datos ${dir}`)]);
  if (estado.guardian && estado.guardian !== process.pid) {
    try {
      process.kill(estado.guardian, "SIGTERM");
    } catch {
      // ya terminó
    }
  }
  const resto = quedan(estado, dir);
  if (resto.length > 0) fallar(`quedan procesos del banco:\n${resto.join("\n")}`);
  if (existsSync(f)) spawnSync("mv", [f, join(dir, `banco-cerrado-${Date.now()}.json`)]);
  console.log("banco: cerrado, sin procesos");
}

const { orden, opciones, sueltos } = args();
const ordenes = {
  abrir: () => abrir(opciones),
  wav: () => wav(opciones, sueltos),
  eval: () => evaluar(opciones, sueltos),
  main: () => evaluarMain(opciones, sueltos),
  captura: () => captura(opciones, sueltos),
  cuadros: () => cuadros(opciones, sueltos),
  hoja: () => hoja(opciones, sueltos),
  reducir: () => reducir(opciones, sueltos),
  raton: () => raton(opciones, sueltos),
  tecla: () => tecla(opciones, sueltos),
  inicial: () => inicial(opciones, sueltos),
  vigilar: () => vigilar(opciones, sueltos),
  "espiar-raton": () => espiarRaton(opciones),
  "leer-raton": () => leerRaton(opciones, sueltos),
  cerrar: () => cerrar(opciones),
  guardian: () => guardian(opciones),
};
if (!ordenes[orden]) fallar(`orden desconocida «${orden ?? ""}»; mira el encabezado de scripts/banco.mjs`);
ordenes[orden]().then(
  () => process.exit(0),
  (e) => fallar(e.message),
);
