# Avisos legales y créditos

La licencia MIT de este repositorio (archivo `LICENSE`) cubre únicamente el código de este repo. No cubre los recursos de terceros que la app usa y que cada persona baja a su equipo: sprites, sonidos y modelos de voz. Cada uno tiene su propia licencia, indicada abajo.

## Proyecto de fans

Poke Equipo es un proyecto de fans, sin ánimo de lucro. No está afiliado, patrocinado ni avalado por Nintendo, Game Freak, Creatures ni The Pokémon Company. Pokémon y los nombres de los Pokémon son marcas de sus respectivos dueños. Este repositorio no incluye sprites, ilustraciones ni sonidos de Pokémon.

## Sprites: PMDCollab / SpriteCollab

Los sprites animados no vienen en el repo. `bun run sprites` los baja desde [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab), que los publica bajo la licencia [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): hay que dar crédito a sus autores y no se permite el uso comercial. Por eso Poke Equipo no se puede usar ni distribuir con fines comerciales si incluye esos recursos.

Los créditos por autor de cada Pokémon los trae SpriteCollab (`credits.txt`), y el script los copia a `assets/pokemon/<número>/CREDITOS.txt` junto a los sprites que baja. Si compartes capturas o videos donde se vean los sprites, conserva esos créditos.

Los efectos de ataque (`scripts/bajar-poderes.mjs`) vienen de [audinowho/DumpAsset](https://github.com/audinowho/DumpAsset) (recursos de PMD: Origins). Mira allí su licencia y créditos antes de redistribuirlos.

## Gritos: PokeAPI/cries

El grito de cada Pokémon se baja desde [PokeAPI/cries](https://github.com/PokeAPI/cries). Los sonidos son propiedad de The Pokémon Company; ver el repositorio de origen para las condiciones.

## Modelos de voz

Los modelos van en `models/` (no versionada) y se ejecutan en el equipo con [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (Apache-2.0). Los que usa el código hoy:

| Modelo | Para qué | Origen | Licencia |
| --- | --- | --- | --- |
| `silero_vad.onnx` | Detectar cuándo hablas | [snakers4/silero-vad](https://github.com/snakers4/silero-vad) | MIT |
| `sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` | Transcripción rápida | [nvidia/parakeet-tdt-0.6b-v3](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) | CC BY 4.0 (NVIDIA); ver la licencia en su origen |
| `sherpa-onnx-whisper-turbo` | Transcripción precisa | [openai/whisper](https://github.com/openai/whisper) | MIT |
| `vits-piper-es_MX-claude-high-int8`, `vits-piper-es_ES-davefx-medium-int8`, `vits-piper-es_ES-sharvard-medium-int8`, `vits-piper-es_MX-ald-medium-int8`, `vits-piper-es_AR-daniela-high-int8` | Voces de los Pokémon | [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices), conversiones de sherpa-onnx | Cada voz tiene la suya: ver la licencia en su origen |

Los modelos ya convertidos están en las [versiones de sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx/releases) (`asr-models`, `tts-models`). Si no puedes confirmar la licencia de un modelo, mírala en su origen antes de redistribuirlo.

## Claude

Cada Pokémon es una sesión de Claude Code, que usa tu propia cuenta y se rige por los [términos de Anthropic](https://www.anthropic.com/legal). Claude y Claude Code son marcas de Anthropic; este proyecto no está afiliado a Anthropic.

## Dependencias de código

Electron, React, sherpa-onnx-node, Zod, Claude Agent SDK y demás dependencias de `package.json` conservan sus propias licencias.
