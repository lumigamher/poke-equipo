# Poke Equipo

Pokémon en pixel-art que viven en una ventana transparente, siempre encima de tu escritorio. Cada Pokémon es una sesión de Claude Code: le hablas por voz o le escribes, trabaja en la carpeta de un proyecto y te responde en una burbuja y en voz alta.

Es un proyecto personal de fans, sin ánimo de lucro. Mira [AVISOS.md](AVISOS.md).

## Capturas

![El equipo paseando por el escritorio](https://res.cloudinary.com/duzuudlte/image/upload/v1791947502/poke-equipo/equipo.png)

| Laboratorio de primera vez | Pokédex oculta de Kanto |
| --- | --- |
| ![Laboratorio: eliges tu primer Pokémon](https://res.cloudinary.com/duzuudlte/image/upload/v1791947499/poke-equipo/laboratorio.png) | ![Pokédex con los 151 de Kanto](https://res.cloudinary.com/duzuudlte/image/upload/v1791947499/poke-equipo/pokedex.png) |

| Con qué modelo trabaja | La burbuja mientras trabaja |
| --- | --- |
| ![Selector de modelo: Haiku, Sonnet u Opus](https://res.cloudinary.com/duzuudlte/image/upload/v1791947500/poke-equipo/modelo.png) | ![Burbuja con lo que hace en vivo](https://res.cloudinary.com/duzuudlte/image/upload/v1791947501/poke-equipo/burbuja.png) |

Los sprites que se ven son de [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab) (CC BY-NC 4.0).

## Qué hace

- **Un Pokémon por sesión de Claude Code.** Cada uno trabaja en una carpeta que eliges y puedes cambiarla. Puedes tener varios en pantalla y guardarlos en la pokébola.
- **Laboratorio de primera vez.** Eliges tu inicial (hay una Pokédex oculta con los 151 de Kanto), la carpeta del proyecto y le pones nombre. El bautizo te enseña a decir su nombre para que te entienda.
- **Voz local.** Te escucha con detección de voz y transcripción que corren en tu equipo (sherpa-onnx): un paso rápido para reconocer cuándo te llaman y uno preciso para el texto de la orden. Te responde con voces sintetizadas también locales, una por especie.
- **Escribir.** Clic en un Pokémon para abrir su burbuja y escribirle. Los comandos que la app no atiende (por ejemplo los de tus skills) se pasan a Claude Code.
- **Burbuja con registro en vivo.** Muestra lo que oye, lo que va haciendo y su respuesta; cada Pokémon tiene barra de PS según el contexto que le queda.
- **Permisos que nunca se aprueban solos.** Cuando Claude pide permiso para algo, el Pokémon te lo muestra y espera tu respuesta (clic o decirlo tú). Ninguna otra acción de la app aprueba permisos.
- **Selector de modelo** por Pokémon (Opus, Sonnet, Haiku), desde el menú o con `/model`.
- **Equipo.** Puedes pedirle a un Pokémon que llame a otro, sacar al equipo de un proyecto, o que uno revise el trabajo de otro (`/combate`). Lleva la cuenta de tareas, tiempo y medallas (`/pokedex`).
- **Recorrido guiado** la primera vez, que avanza cuando haces lo que pide cada paso.
- Opciones de comodidad: quedarse quieto, texto grande, silenciar su voz, atajos de teclado y menú en la barra.

## Requisitos

- macOS. Windows no se ha probado.
- Una sesión de [Claude Code](https://claude.com/claude-code) iniciada: cada Pokémon es una sesión tuya, con tu cuenta, tu `CLAUDE.md`, tus skills y tus reglas de permisos.
- Micrófono (la app pide el permiso de macOS al arrancar).
- Para correrla desde el código: [Bun](https://bun.sh) y Node 22 o superior.

## Instalación

Baja el `.dmg` de la página de [versiones](../../releases) (`arm64` para Apple Silicon, `x64` para Intel) y sigue [docs/INSTALAR.md](docs/INSTALAR.md). La app todavía no está firmada por Apple, así que la primera vez hay que autorizarla a mano; ahí está cómo.

Al abrirla por primera vez muestra "Preparando a tu equipo": dice qué va a bajar (modelos de voz, unos 1,2 GB, y los sprites), de dónde, y espera tu clic. Nada de eso viene en el instalador ni en este repo.

## Correrla desde el código

```sh
bun install
bunx electron-vite dev
```

Si faltan los modelos de voz o los sprites, la misma pantalla de preparación los baja a `models/` y `assets/pokemon/` dentro del repo (las dos carpetas están fuera de git). También se pueden bajar a mano los sprites de una especie con `bun run sprites <número>` y los efectos con `bun run poderes`.

Para armar el instalador: `bun run dist:mac` (detalles en [docs/INSTALAR.md](docs/INSTALAR.md)).

Origen y licencias de todo lo que se baja en [AVISOS.md](AVISOS.md).

Otros comandos: `bun run test`, `bun run lint`, `bun run typecheck` (usa `bun run test`, no `bun test`; algunas pruebas necesitan los sprites bajados). `bun run test:integracion` corre las pruebas que cargan modelos reales y necesitan grabaciones propias.

### Glosario

`config/glosario.json` trae términos de desarrollo (deploy, commit, Sonnet…) que ayudan al transcriptor y se le pasan al Pokémon como jerga de uso frecuente. Para sumar los tuyos (nombres de proyectos, clientes, herramientas) sin tocar el repo, crea `glosario.json` en la carpeta de datos de la app (`~/Library/Application Support/Poke Equipo/` para la app instalada, `~/Library/Application Support/poke-equipo/` si la corres desde el código; es la misma donde está `equipo.sqlite`) con una lista de textos:

```json
["MiProyecto", "MiCliente"]
```

Se suma al del repo al arrancar. Esas palabras tampoco se pueden usar como nombre de un Pokémon.

## Cómo se usa

**Con la voz.** Di el nombre de un Pokémon seguido de la orden: "Pikachu, revisa el deploy y corre los tests". Mientras haya uno atento, puedes seguir sin repetir el nombre. Para sacar a otro: "llama a Charmander para que revise los tests". "Vuelve" lo guarda. "Dale" o "no" responden a un permiso pendiente. "Usa <movimiento>" dispara uno de sus movimientos.

**Escribiendo.** Clic en el Pokémon para abrir su burbuja y escribir. Comandos propios:

| Comando | Qué hace |
| --- | --- |
| `/model <modelo>` | Cambia el modelo de la sesión |
| `/pokemon <nombre>` | Cambia de Pokémon (nombre, número o azar) |
| `/nombre <nombre>` | Le pone otro nombre |
| `/reiniciar` | Reinicia la sesión y retoma la conversación |
| `/movimientos` | Muestra sus cuatro movimientos |
| `/pokedex` | En qué ha trabajado cada uno, cuánto tiempo, medallas |
| `/medalla <por qué>` | Le das una medalla |
| `/llamar <especie> [encargo]` | Saca a otro Pokémon, con un encargo opcional |
| `/equipo <proyecto>` | Saca a los que trabajan en ese proyecto |
| `/combate <rival>` | Revisa el último trabajo de otro |
| `/guardar` | Lo guarda en la pokébola |

Cualquier otro `/comando` se le pasa a Claude Code.

**Clic derecho** sobre un Pokémon: detener lo que hace, guardarlo, cambiar de proyecto, quedarse quieto, texto grande, cambiar nombre, enseñarle tu voz, llevarlo al Centro Pokémon, silenciar su voz. El icono de la barra de menús tiene el interruptor del micrófono, el modelo y la lista del equipo.

**Atajos:** `Control+Alt+Space` enciende o apaga el micrófono, `Control+Alt+D` abre el dictado, `Esc` descarta el borrador de lo que se está oyendo o calla a quien esté hablando.

## Privacidad

- La voz se procesa en tu equipo: detección de voz, transcripción y síntesis corren localmente con sherpa-onnx. El audio no se envía a ningún servicio.
- Lo que sí sale es lo que va por Claude Code: el texto de lo que le pides y lo que la sesión lea o haga, hacia Anthropic, bajo tu cuenta y sus términos.
- Aparte de Claude, la app solo se conecta a GitHub para bajar los modelos de voz, los sprites, los gritos y los efectos (en la preparación del primer arranque y cuando pides una especie que aún no está). No hay telemetría ni analítica.
- La ventana solo concede el permiso de micrófono; cualquier otro permiso del navegador se niega.
- El equipo (nombres, carpetas, tareas, medallas) se guarda en `equipo.sqlite` en la carpeta de datos de la app.

## Estado del proyecto

Proyecto personal que se mantiene según el tiempo de su autor. Solo se ha probado en macOS; Windows está sin probar. Puede cambiar sin avisar y puede tener errores. Los issues y pull requests son bienvenidos, sin promesa de respuesta rápida.

## Créditos y avisos legales

- El código es MIT (ver [LICENSE](LICENSE)). La licencia cubre solo el código de este repo.
- Proyecto de fans, sin ánimo de lucro. No está afiliado ni avalado por Nintendo, Game Freak, Creatures ni The Pokémon Company. Pokémon y sus nombres son marcas de sus dueños.
- El repo no incluye sprites ni sonidos. Se bajan en tu equipo desde [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab) (CC BY-NC 4.0; los créditos por autor quedan en `CREDITOS.txt` de cada carpeta) y [PokeAPI/cries](https://github.com/PokeAPI/cries). Por la licencia NC no se permite el uso comercial.
- Los modelos de voz son de sherpa-onnx y terceros, cada uno con su licencia.

Detalle completo en [AVISOS.md](AVISOS.md).

## English summary

Poke Equipo is a personal, fan-made macOS desktop toy: pixel-art Pokémon in an always-on-top transparent window, each one backed by its own Claude Code session (Claude Agent SDK) that you control by voice or text. Speech recognition and text-to-speech run locally with sherpa-onnx; the only network traffic the app makes is Claude Code's and the GitHub downloads of voice models and sprites. Permissions are never auto-approved. Requires macOS, Claude Code signed in, and a microphone. Install from the `.dmg` in Releases (unsigned for now, see `docs/INSTALAR.md`) or run from source with `bun install` and `bunx electron-vite dev`; on first launch the app downloads the voice models (about 1.2 GB) and sprites after you confirm. Code is MIT; sprites and sounds are not included and are fetched from PMDCollab/SpriteCollab (CC BY-NC 4.0, non-commercial) and PokeAPI/cries. Not affiliated with or endorsed by Nintendo, Game Freak, Creatures or The Pokémon Company. See `AVISOS.md`.
