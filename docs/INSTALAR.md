# Instalar Poke Equipo en un Mac

Poke Equipo corre en Mac con Apple Silicon (M1 o más nuevo) y, con el instalador de Intel, en Macs Intel.
Necesita macOS 13 o más nuevo, unos **3 GB libres** durante la preparación (1,2 GB de descarga y unos 1,9 GB ya
instalado) y conexión a internet la primera vez.

## 1. Instalar

1. Abre el `.dmg` (`Poke-Equipo-<versión>-arm64.dmg` para Apple Silicon, `…-x64.dmg` para Intel).
2. Arrastra **Poke Equipo** a la carpeta **Aplicaciones**.
3. Ábrela desde Aplicaciones (ver el apartado siguiente: hoy la app **no está firmada por Apple**).

El `.zip` trae lo mismo que el `.dmg`: descomprímelo y arrastra la app a Aplicaciones.

## 2. Abrir una app sin firmar

Mientras no haya cuenta de desarrollador de Apple, macOS dice que Poke Equipo es de un "desarrollador no
identificado" (o que "está dañada"). No lo está: es la protección normal para apps sin firmar de Apple. Una sola vez:

- **macOS 15 o más nuevo:** intenta abrirla, cierra el aviso, entra en **Ajustes del Sistema → Privacidad y
  seguridad**, baja hasta el mensaje sobre "Poke Equipo" y pulsa **Abrir de todos modos**.
- **macOS 14 o más viejo:** en Aplicaciones, clic derecho (o Control + clic) sobre la app → **Abrir** → **Abrir**.
- **Desde la terminal** (sirve en cualquier versión, y es lo que hay que hacer si macOS dice "está dañada"):

  ```sh
  xattr -dr com.apple.quarantine "/Applications/Poke Equipo.app"
  ```

Después se abre con doble clic como cualquier app. Todo lo que llega por AirDrop, correo o navegador trae la marca de cuarentena, así que también necesita este paso; solo se salta si la copias desde un disco o una carpeta compartida, o la bajas con `curl`.

La primera vez macOS también pide permiso para el **micrófono**: hay que aceptarlo (la app solo oye mientras tú
tengas la escucha encendida; la puedes pausar desde la barra de menú).

## 3. "Preparando a tu equipo" (primer arranque)

La app no lleva dentro las voces ni los dibujos. Al abrirla por primera vez muestra una pantalla que dice qué va a
bajar, cuánto pesa y de dónde sale, y espera un clic en **Empezar**:

| Qué | Peso | De dónde |
| --- | --- | --- |
| Detector de voz (Silero VAD) | 644 KB | github.com/k2-fsa/sherpa-onnx (releases) |
| Oído rápido (Parakeet TDT 0.6B v3, int8) | 487 MB | ídem |
| Oído preciso (Whisper turbo, int8) | 564 MB | ídem |
| 5 voces Piper en español | 122 MB | ídem |
| Efectos de ataque | ~100 KB | github.com/audinowho/DumpAsset |
| Bulbasaur, Charmander, Squirtle y Pikachu | ~2,6 MB | github.com/PMDCollab/SpriteCollab y PokeAPI/cries |

- El avance es real, por archivo y total. Puedes **cancelar** y luego **reanudar**: las descargas parciales
  continúan donde se quedaron (petición `Range`); lo ya terminado no se vuelve a bajar.
- Cada modelo se comprueba por tamaño **y** por huella SHA-256 (obligatoria en los 8; el código se niega a bajar uno sin ella) antes de usarse. Los sprites, gritos y efectos se aceptan solo si son PNG o audio (Ogg o MP3) de verdad y pesan menos de 5 MB.
- Si se corta la red o falta espacio, la pantalla lo explica y ofrece **Reintentar**.
- El resto de Kanto se baja después en segundo plano (unos 600 KB por especie, ~90 MB en total). Si pides
  una especie que aún no está ("llama a Eevee"), se baja en ese momento y la llamada sigue sola al llegar.

Todo queda en `~/Library/Application Support/Poke Equipo/datos/` (`models/` y `assets/pokemon/`). La app instalada no comparte datos con la versión de desarrollo (que usa `poke-equipo` y las carpetas del repo). Para
empezar de cero, borra esa carpeta. Los sprites son de PMDCollab/SpriteCollab (licencia CC BY-NC 4.0) y los gritos de PokeAPI; no se
distribuyen con la app ni con el repositorio, cada persona los baja a su equipo para uso personal.

## 4. Qué necesita la persona

- **Una sesión de Claude Code iniciada.** Los Pokémon trabajan con tu cuenta de Claude (suscripción). No hace falta
  instalar Claude Code aparte: el SDK ya trae su propio ejecutable dentro de la app. Lo que sí hace falta es haber
  iniciado sesión una vez. Si no la hay, la app lo avisa al abrir con el comando exacto:

  ```sh
  "/Applications/Poke Equipo.app/Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude"
  ```

  (en Intel, `…-darwin-x64`), y dentro escribes `/login`. Si ya usas Claude Code en la terminal, con eso basta.
- Las herramientas de tus proyectos (`git`, `bun`, `node`…) las encuentran los Pokémon aunque la app se abra desde
  el Finder: la app añade `/opt/homebrew/bin`, `/usr/local/bin`, `~/.bun/bin` y `~/.local/bin` a su PATH.

## 5. Armar el instalador (para quien desarrolla)

```sh
bun install
bun run dist:mac          # Apple Silicon: dist/Poke-Equipo-<versión>-arm64.dmg y .zip
bun run dist:mac:intel    # Intel: baja los binarios x64 que faltan y arma dist/…-x64.dmg y .zip
```

- La app se arma en una carpeta temporal (`$TMPDIR/poke-equipo-build`, o la de `POKE_STAGING`) y los instaladores se
  copian a `dist/`. Hace falta porque, si el repo está en una carpeta sincronizada con iCloud (Documentos, Escritorio),
  macOS le pega atributos a cada carpeta de la app y `codesign` falla con "resource fork, Finder information…".
- No hay ícono propio todavía: se queda el de Electron. Para ponerlo, deja `build/icon.icns` y
  añade `icon: "build/icon.icns"` en `electron-builder.config.mjs`.
- Sin certificado, el instalador sale con **firma ad-hoc** (`identity: "-"`): Apple Silicon exige al menos eso para
  ejecutar el binario, pero Gatekeeper la trata como "no identificada" (apartado 2).

### Con cuenta de Apple (firma y notarización)

No hay que tocar código: se exportan variables de entorno antes de `bun run dist:mac` (nada de esto va al repo).

```sh
# Firma con "Developer ID Application": certificado .p12 (ruta o base64) y su clave…
export CSC_LINK=/ruta/certificado.p12
export CSC_KEY_PASSWORD=…
# …o el nombre de un certificado ya instalado en el llavero: export CSC_NAME="Developer ID Application: Nombre (TEAMID)"

# Notarización (basta UNO de los tres juegos):
export APPLE_ID=correo@ejemplo.com APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=TEAMID
# export APPLE_API_KEY=/ruta/AuthKey_XXXX.p8 APPLE_API_KEY_ID=XXXX APPLE_API_ISSUER=uuid
# export APPLE_KEYCHAIN=… APPLE_KEYCHAIN_PROFILE=…
bun run dist:mac
```

Con `CSC_LINK` o `CSC_NAME` la configuración activa solo el runtime endurecido y los permisos de
`build/entitlements.mac.plist` (JIT de Electron, librerías de otra firma —sherpa-onnx y el ejecutable de Claude— y
micrófono). Con además uno de los juegos `APPLE_*`, electron-builder notariza y engrapa el resultado.
