# Integración de skills personales con los runtimes

Investigación: 6 septiembre 2026. Sólo lectura de producción; las pruebas de descubrimiento usaron un `SKILL.md` sintético temporal, sin inferencia ni cambios de credenciales.

## Conclusión

Es viable conservar una instalación por `AgentProfile`, fuera del repositorio y del HOME del operador, y usar descubrimiento nativo en **Claude, Codex y OpenCode**. Los bridges instalados ya contienen la conexión necesaria para Claude/Codex. Cursor tiene un mecanismo prometedor de plugin local, pendiente de prueba ACP. fx no carga skills desde directorios adicionales: no debe figurar como soportado en local hasta resolver ese hueco.

“Está instalado en la carpeta” y “el runtime lo cargó” deben ser estados distintos. Las extensiones específicas de cada harness tampoco se vuelven portables por copiar el archivo.

## Evidencia y rutas de integración

| Runtime | Vía para perfil sin cambiar HOME | Evidencia | Estado MVP |
|---|---|---|---|
| Claude Code | ACP `additionalDirectories: [projectionRoot]`; dentro, `.claude/skills/` apunta a las skills del perfil | Bridge `claude-agent-acp@0.70.0` une el campo ACP con el SDK y lo pasa como `additionalDirectories`; documentación confirma descubrimiento desde add-dir | Soportado por código/documentación; falta smoke completo de Blobot local/sandbox |
| Codex | Mismo campo ACP; dentro, `.agents/skills/` | `codex-acp@1.7.0` deriva esas rutas y llama `skills/extraRoots/set`, después `skills/list(forceReload: true)` | Mecanismo nativo probado sin inferencia; falta smoke completo ACP y sandbox |
| OpenCode | Añadir `skills.paths: [absoluteSkillsRoot]` a `OPENCODE_CONFIG_CONTENT` que Blobot ya genera | Schema oficial, loader oficial y `opencode debug skill` local | Descubrimiento probado; falta ACP/sandbox y recarga |
| Cursor | Plugin local generado exclusivamente con skills, mediante `--plugin-dir`; no marketplace ni instalación global | CLI y documentación de plugins oficiales | Candidato; probar nombres, anuncios ACP, symlinks y reinicio |
| fx | No hay raíz adicional de descubrimiento documentada; `--add-dir` explícitamente no contribuye skills | Documentación y código oficial | Local pendiente; sandbox puede estudiar composición de roots nativos |

Versiones: repo fija Claude bridge 0.70.0 y Codex bridge 1.7.0; imágenes incluyen Codex 0.151.0. Adaptadores registrados contra OpenCode 1.18.4, Cursor 2026.08.25-3e8eec8, fx 0.0.7. Binarios locales observados: Claude 2.1.263, Codex 0.153.4, OpenCode 1.17.9, Cursor 2026.09.02-c22c1a3, fx 0.0.7. La versión del bridge no fija la del binario del usuario.

**Claude.** El campo ACP es preferible a añadir otra extensión `_meta`. El SDK option carga skills si `settingSources` contiene `project`, como ya ocurre en Blobot. No confundirlo con `permissions.additionalDirectories` en settings: éste sólo concede acceso. Una proyección estrecha evita aportar configuración de MCPs, hooks o subagents involuntariamente. Claude conserva semántica propia de argumentos, invocación y frontmatter; skills con el mismo nombre resuelven enterprise > personal > proyecto, y los plugins usan namespace. No imponer “proyecto gana” como regla universal. [Skills y add-dir](https://code.claude.com/docs/en/skills#skills-from-additional-directories). Código: [params de Blobot](/Users/guillermo/Work/blobot/packages/core/src/adapters/claude/claude-agent-runtime.ts:383), [bridge instalado](/Users/guillermo/Work/blobot/packages/core/node_modules/@agentclientprotocol/claude-agent-acp/dist/acp-agent.js:4798).

**Codex.** El bridge acepta `additionalDirectories` en new/load/resume y `refreshSkills` deriva `<additionalRoot>/.agents/skills`. Repite refresh antes de cada prompt. No hace falta sustituir ACP por app-server ni usar un CODEX_HOME por perfil. App-server documenta extra roots efímeros por proceso; el bridge tiene un proceso por agente, por lo que no mezcla perfiles. La prueba local llamó únicamente initialize, extraRoots/set y skills/list: devolvió el fixture como habilitado con su ruta personal, sin crear un thread. El paso de additionalDirectories también afecta al ámbito del workspace; conservar la postura de permisos actual. [API en la versión 0.151.0](https://github.com/openai/codex/blob/rust-v0.151.0/codex-rs/app-server/README.md#skills), [refreshSkills instalado](/Users/guillermo/Work/blobot/packages/core/node_modules/@agentclientprotocol/codex-acp/dist/index.js:28316), [configuración de raíces](/Users/guillermo/Work/blobot/packages/core/node_modules/@agentclientprotocol/codex-acp/dist/index.js:28257).

**OpenCode.** La prueba `OPENCODE_CONFIG_CONTENT={"skills":{"paths":["<temp>/personal/skills"]}} opencode debug skill` encontró nombre, descripción, contenido y ruta exacta del fixture, con y sin `--pure`. No se usaría `--pure` en Blobot: la configuración global puede contener plugins de autenticación. Integrar el campo en el JSON existente, preservando sus capas. El loader actual indexa por nombre y sobrescribe duplicados; no garantiza el orden deseado entre fuentes. [Schema oficial](https://opencode.ai/config.json), [loader oficial](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/skill/index.ts), [config de Blobot](/Users/guillermo/Work/blobot/packages/core/src/adapters/opencode/config.ts:178).

**Cursor/fx.** Cursor documenta plugin local y manifests con skills: una envoltura generada por Blobot puede mantener el contenido estándar. Hay que medir el nombre que anuncia antes de habilitarla; `--add-dir` por sí solo no prueba descubrimiento. `CURSOR_CONFIG_DIR` actual no aísla las skills globales. fx conserva duplicados por ubicación y lee raíces nativas globales/proyecto; sus directorios adicionales sólo amplían acceso a herramientas. [Cursor CLI](https://cursor.com/docs/cli/reference/parameters), [formato plugin](https://cursor.com/docs/reference/plugins), [fx skills](https://fx.sh/docs/capabilities/skills), [fx additional workspaces](https://fx.sh/docs/configure-fx/additional-workspaces).

## Almacenamiento y composición

Mantener `personal/skills/<skill>/` como fuente canónica o revisiones gestionadas bajo ese árbol. Generar sólo un índice/proyección pequeña para cada harness; no copiar ni capturar toda la carpeta personal. Los recursos relativos y scripts deben permanecer junto al SKILL.md. Las proyecciones también han de estar dentro de la carpeta montada, para conservar rutas resolubles en sandbox.

Hoy [prepareSharedSkillsCommand](/Users/guillermo/Work/blobot/packages/core/src/machines/sbx/skills.ts:4) enlaza el root nativo completo al mount de skills **del operador, de sólo lectura**. Reemplazar ese enlace por la carpeta del perfil perdería sus skills; instalar a través de él fallaría. Para Claude/Codex/OpenCode se puede conservar ese enlace y añadir la raíz personal nativa descrita arriba. El proyecto continúa en el `AgentWorkspace` real, incluida la rama/worktree correspondiente.

Si Cursor/fx requieren una vista combinada en sandbox: migración explícita, idempotente, sólo del enlace antiguo cuyo destino esperado se ha verificado; vista con entradas al operador y al perfil, y conflictos visibles. Nunca borrar directorios inesperados, modificar el mount del operador ni recrear la Machine. Validar también restricciones de symlinks de fx: un enlace existente no demuestra que el harness pueda abrirlo.

Los symlinks del operador hacia ubicaciones fuera del mount siguen siendo inaccesibles en sandbox. No montar todo HOME para arreglarlos. El [catálogo box actual](/Users/guillermo/Work/blobot/packages/core/src/adapters/acp/box-palette.ts:8) los excluye por realpath deliberadamente.

Extender las paletas con el perfil y con rutas estándar reales, manteniendo **autorizado/autorado ∩ anunciado por el runtime**. Hoy [Codex palette](/Users/guillermo/Work/blobot/packages/core/src/adapters/codex/palette.ts:53) sólo busca `.codex/skills` de proyecto: un repo skills.sh usa `.agents/skills`, que necesita cobertura. La identidad debe incluir fuente + ruta, no únicamente nombre. No prometer que el inventario visual representa todo lo cargado sólo porque se escaneó disco.

## Activación y sesiones vivas

Claude documenta watch de SKILL.md en roots existentes; crear el root después de iniciar requiere reinicio. Codex emite skills/changed y acepta forceReload; su bridge ya refresca antes del prompt. OpenCode mantiene caché por instancia y no hay garantía suficiente de hot reload. Ninguna evidencia establece pinning uniforme de recursos durante una ejecución. [Claude live changes](https://code.claude.com/docs/en/skills#live-change-detection), [Codex app-server](https://github.com/openai/codex/blob/rust-v0.151.0/codex-rs/app-server/README.md#skills), [caché OpenCode](https://github.com/anomalyco/opencode/blob/dev/packages/core/src/skill.ts).

Contrato mínimo recomendado: preparar altas/actualizaciones/bajas fuera del árbol activo; mostrar “pendiente de aplicar” mientras cualquier ejecución del perfil esté trabajando. Al aplicar, bloquear admisión de nuevos turnos del perfil, esperar que todos estén idle, publicar atómicamente el árbol de skills, reiniciar/reanudar los procesos afectados y comprobar sus anuncios. Conservar revisiones antiguas si existen tareas de fondo que pueden seguir usando scripts. Un fallo deja el runtime pendiente, no falsamente actualizado.

Alternativa para evitar coordinación global: revisiones inmutables de **skills**, con proyección por sesión y adopción en la siguiente sesión. Añade control de versiones, pero evita snapshots de todo el personal. Debe decidirse antes de implementar: un simple symlink `current` compartido no proporciona pinning.

Eliminar una skill quita su descubrimiento futuro; no elimina sus instrucciones del historial ya cargado. Reiniciar y reanudar tampoco garantiza olvidar ese contenido. La UI debe hablar de disponibilidad, no de revocación inmediata.

El catálogo inyectado en persona con nombre/descripción/ruta más una herramienta de lectura es un fallback de instrucciones portable, **no** la semántica nativa completa de SKILL.md: no reproduce automáticamente argumentos, hooks, restricciones de invocación, resolución o namespace. Mantenerlo como decisión explícita para runtimes pendientes.

## Aceptación pendiente

Fixture nativo local y sandbox por runtime: perfil A visible en dos equipos, B ausente, operator + profile + project coexistentes; cambios y baja con dos sesiones vivas; recursos relativos ejecutables; colisiones; perfil sin skills; root/symlink ausente; worktree y `.agents/skills`; reinicio/resume; permisos intactos; no archivos en HOME global ni repo por instalación personal. Probar anuncio y apertura real del fixture; un test que sólo crea un directorio no valida integración.
