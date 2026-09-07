# Spike: activación nativa de skills personales

Fecha: 2026-09-06. Resultado: **Claude, Codex y OpenCode pasan el smoke local completo**. Codex pasa además descubrimiento nativo en una sandbox desechable, con los tres orígenes coexistiendo.

No se modificó producción. Los harnesses están en [probe/native.ts](probe/native.ts) y [probe/sandbox-codex.ts](probe/sandbox-codex.ts). Se utilizaron fixtures temporales propios, nunca una skill del operador. No se cambió HOME, CODEX_HOME, CLAUDE_CONFIG_DIR, credenciales o configuración global mediante el harness; los runtimes mantuvieron su almacenamiento normal de sesiones.

## Fixture y metodología

Cada ejecución crea un directorio temporal real/canónico con un workspace vacío y un `PersonalDirectories` de Ana. La única skill vive en:

```text
profiles/ana/files/.agents/skills/blobot-probe-<uuid>/SKILL.md
profiles/ana/files/.agents/skills/blobot-probe-<uuid>/references/proof.txt
profiles/ana/files/.claude/skills -> ../.agents/skills
```

El cuerpo pide leer el recurso relativo y devolver su contenido. `proof.txt` contiene un UUID nuevo que no se incluye en el prompt. La respuesta correcta, junto con el evento de lectura, demuestra que el recurso fue alcanzado desde la skill. No se ejecutan scripts del fixture ni se pide acceso a red.

El harness usa las clases reales de Blobot, `LocalMachine` y los bridges instalados. Un wrapper del transporte, limitado a scratch, añade `additionalDirectories: [personalPath]` en new/load/resume para Claude/Codex. Para OpenCode compone `skills.paths` en el `configContent` ya generado. La postura permanece `normal`; ninguna ejecución exitosa solicitó un permiso adicional.

Se captura el catálogo ACP bruto porque la paleta de producción todavía no incluye el root personal entre sus archivos autorizados. No se guarda el catálogo completo del operador: sólo cantidad y nombres de los fixtures.

## Resultados locales

| Runtime | Versiones | Anuncio ACP | Invocación y recurso | Resultado |
|---|---|---|---|---|
| Claude | CLI 2.1.263; bridge 0.70.0 | `blobot-probe-85fc0f1b` | `Load skill`, después `Read` de `.claude/skills/.../references/proof.txt`; devolvió el UUID | Pasa |
| Codex | CLI 0.153.4; bridge 1.7.0 | `$blobot-probe-c34d93c6` | Leyó SKILL.md y recurso de `.agents/skills` con `cat`, desde workspace distinto; devolvió el UUID | Pasa |
| OpenCode | CLI 1.17.9 | `blobot-probe-be13bf60` | `skill(name)` completado y `read(filePath)` del recurso personal; devolvió el UUID | Pasa |

Evidencias completas y acotadas: [Claude](probe/claude-result.json), [Codex](probe/codex-result.json), [OpenCode](probe/opencode-result.json).

Claude anunció el fixture también con el modelo predeterminado Fable, pero la invocación devolvió un límite de uso. Se consultaron opciones ACP y se repitió con `haiku`, opción efímera de esa sesión, que pasó. La prueba no exige Fable ni cambia el modelo global. Hubo una sola invocación exitosa por runtime; el intento de Fable falló antes de usar herramientas.

Codex avisó de descripciones recortadas por presupuesto de contexto debido al catálogo heredado. La skill seguía presente y fue usada correctamente. Es evidencia de que catálogo instalado y texto disponible al modelo no deben confundirse.

**Hallazgo de integración:** en los tres casos el nombre está en el anuncio nativo pero no en `runtime.availableCommands` del código anterior al MVP. Es el filtro de paleta de Blobot, no un fallo de descubrimiento. El adapter debe incorporar las skills personales en su intersección de archivos autorizados con nombres anunciados.

## Sandbox Codex

Se usó la imagen ya cacheada de Blobot, Codex **0.151.0**, referencia `blobot-machine-codex:475f185a738767edbd26a87ad2e6141c473f4698a3acadafcbd3b0740e88125c-arm64`, mediante `OwnedSbxMachine` y un registro temporal.

La Machine recibió tres fixtures independientes:

- Operador sintético montado readonly y enlazado por el mecanismo existente a `/home/agent/.agents/skills`.
- Ana en su montaje personal, con `.agents/skills` y alias `.claude/skills` internos.
- Proyecto en `.agents/skills` del workspace temporal.

Se abrió app-server sin iniciar sesión del modelo y se llamó a initialize, `skills/extraRoots/set`, `skills/list(forceReload: true)` y `fs/readFile`. Los tres nombres aparecieron habilitados: proyecto con scope nativo `repo`, operador y perfil con scope nativo `user`. El recurso personal se leyó **a través del alias `.claude/skills`** y conservó su contenido. El scope nativo `user` no distingue propiedad del operador/perfil; Blobot debe hacerlo mediante su registro y ruta.

[Resultado sandbox](probe/sandbox-codex-result.json): `allScopesDiscovered: true`, `aliasResourceRead: true`, sin errores. La Machine se paró y destruyó; el registro desapareció y `sbx ls` confirmó que no quedó la sandbox de prueba.

Esto verifica resolución y catálogo nativo dentro del guest. No se trasladaron credenciales a la sandbox ni se ejecutó inferencia allí. No equivale a probar toda la sesión ACP con autenticación dentro del guest.

## Reproducción

Desde `/Users/guillermo/Work/blobot`:

```sh
PROBE_MODEL=haiku pnpm exec tsx .scratch/skills/research/probe/native.ts claude --invoke
pnpm exec tsx .scratch/skills/research/probe/native.ts codex --invoke
pnpm exec tsx .scratch/skills/research/probe/native.ts opencode --invoke
pnpm exec tsx .scratch/skills/research/probe/sandbox-codex.ts
```

Omitir `--invoke` limita la prueba local a inicio y catálogo, sin inferencia. El harness sandbox presupone la imagen arm64 indicada ya disponible.

## Límites y decisión

No se encontró un bloqueo de arquitectura para conectar las raíces personales en los tres adapters. El alias propuesto funciona en Claude local y se resuelve en guest. Conservar el mount readonly existente del operador y añadir la raíz personal funciona en Codex sandbox.

Quedan fuera de este spike: Claude/OpenCode sandbox con sus imágenes publicadas, inferencia ACP sandbox autenticada, Linux/KVM, edición mientras una sesión vive, publicación transaccional/leases, colisiones y sesiones retomadas. Estas pruebas no justifican relajar el contrato conservador de publicar tras cerrar todos los runtimes del perfil.

`additionalDirectories` también amplía acceso a archivos; no es una API exclusivamente de skills. La documentación de Claude describe además excepciones de descubrimiento para subagents y declaraciones de plugins en esas raíces. Este fixture no contiene esas configuraciones y no prueba su aislamiento. Mantener la integración de skills explícita y no presentar el mecanismo como aislamiento de toda configuración. [Referencia oficial](https://code.claude.com/docs/en/skills#skills-from-additional-directories).
