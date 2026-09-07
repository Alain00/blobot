# Skills.sh y Vercel Skills CLI para Blobot

Investigación: 2026-09-06. **Documentado** = documentación oficial; **inspeccionado** = código fuente; **probado** = ejecución en directorio desechable. No se modificaron skills del usuario, perfiles Blobot ni producción.

## Conclusión para el MVP

Usar skills.sh como **fuente de descubrimiento** y GitHub como **fuente de instalación**. Blobot debe poseer el destino, registro y actualizaciones: carpeta personal del AgentProfile o carpeta del proyecto elegida explícitamente. Recomiendo un importador Git controlado para repositorios públicos; no ejecutar `npx skills -g` en el host. El CLI puede ser un adaptador de descarga aislado si interesa ampliar fuentes después.

## Versiones y ejemplo comprobado

- CLI npm `skills@1.5.23`, Node `>=22.20.0`; fuente inspeccionada [435076e78988e1e6ec40d00b0b1d76bdbbc5419a](https://github.com/vercel-labs/skills/tree/435076e78988e1e6ec40d00b0b1d76bdbbc5419a). Contrastado con [metadata npm](https://registry.npmjs.org/skills/1.5.23). El paquete expone binarios, sin `exports` de SDK público.
- Repositorio de contenido inspeccionado: [agent-skills@063bee94c3f4df8453406c830b0a7df0f2860278](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278).
- Página: [Vercel React Best Practices](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices). Nombre en frontmatter `vercel-react-best-practices`; carpeta `skills/react-best-practices`: **nombre y ruta difieren**. [SKILL.md](https://github.com/vercel-labs/agent-skills/blob/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices/SKILL.md).

Comando equivalente, ejecutado únicamente en staging temporal:

```sh
npx skills@1.5.23 add vercel-labs/agent-skills \
  --skill vercel-react-best-practices --agent codex --copy --yes
```

**Probado:** `add --list` encontró 9 skills; instalar esa selección produjo 76 archivos en `.agents/skills/vercel-react-best-practices/`, además de `skills-lock.json`. `list --json` devolvió nombre, ruta, scope, agents y source. Se descargó el CLI con `npm --ignore-scripts` y caché temporal, luego se llamó su binario directamente. Prueba en `/tmp/blobot-skills-research.50YCi0`; logs `test-add.txt`, `test-add-list.txt`, `test-list.txt`. No se cambió HOME; XDG_STATE_HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME y TMPDIR apuntaron al temporal; telemetría y compile cache desactivadas. Ese comando no creó estado global ni en el XDG aislado.

## Comandos, rutas y raíces

**Inspeccionado:** `add` admite repo, subcarpeta GitHub, GitLab, Git URL, directorio local y descargas; `--skill` selecciona uno/varios nombres, `--agent` el harness. `owner/repo@skill` selecciona skill, **no versión**. `#ref` representa rama/tag. No hay opción CLI general `--root`, `--cwd` o directorio arbitrario. Hay `cwd` en funciones internas, que no son SDK publicado. [Parser](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/source-parser.ts), [CLI](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/cli.ts).

| Harness | Proyecto | Global configurado por CLI |
|---|---|---|
| Codex | `.agents/skills` | `$CODEX_HOME/skills` o `~/.codex/skills` |
| Claude Code | `.claude/skills` | `$CLAUDE_CONFIG_DIR/skills` o `~/.claude/skills` |
| OpenCode | `.agents/skills` | configuración XDG `opencode/skills` |

Por defecto el instalador usa una copia canónica `.agents/skills` y enlaces a los otros destinos; `--copy` copia directamente. La copia canónica global depende de `homedir()`: cambiar solo CODEX_HOME no aísla todo. [Agentes](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/agents.ts), [instalador](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/installer.ts).

- `list --json`: salida estructurada; scope real por defecto proyecto, `-g` global. El README dice ambas scopes, pero help y prueba contradicen ese texto.
- `find [query] --owner vercel-labs`: descubrimiento; `add <repo> --list`: selección de repo.
- `remove <name> -a codex -y`: eliminación explícita; añadir `-g` cambia scope.
- `update <name> -p` / `-g`: actualización. **`check` es alias de `update` en 1.5.23, no una operación de lectura.**
- `--all` significa todas las skills para todos los agentes; evitarlo para instalar una selección.

Comportamiento verificado en [dispatch CLI](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/cli.ts#L391) y [opciones oficiales](https://github.com/vercel-labs/skills#options).

## API de descubrimiento: existe, pero tiene condición

**Documentado:** API versionada `/api/v1/` con leaderboard, búsqueda, curados, detalle y auditorías; identificador estable `{source}/{slug}`. Requiere Vercel OIDC; autenticados tienen 600 solicitudes/min por team/proyecto. Detalle ofrece hash y archivos de texto, pudiendo devolver `null` sin snapshot. [API oficial](https://skills.sh/docs/api).

**Probado:** GET `/api/v1/skills/search?q=react&limit=1` sin token respondió **401 authentication_required**. GET `/api/search?q=react&limit=1` devolvió **200**, incluyendo la skill de React. El segundo es el endpoint legacy empleado por `find`; no está presentado como contrato de integración versionado. [Implementación de búsqueda](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/find.ts#L87).

**Decisión propuesta:** MVP con botón «Explorar skills.sh» externo y pegado de enlace/repo. Blobot normaliza URLs `skills.sh/<owner>/<repo>/<skill>` a repo + selector; el CLI no tiene parser especial para esas páginas individuales. Catálogo integrado puede llegar con backend Vercel/OIDC; no convertir el endpoint legacy en dependencia crítica.

## Metadatos y actualización

**Inspeccionado:** lock global versión 3 en `~/.agents/.skill-lock.json`, redirigible a `$XDG_STATE_HOME/skills/.skill-lock.json`; incluye source, URL, ref, ruta, hash de carpeta y fechas. Preferencias interactivas también usan ese fichero. [Lock global](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/skill-lock.ts).

Lock de proyecto versión 1 `skills-lock.json`: source/sourceType, skillPath, ref opcional y computedHash; clave por **nombre**, sin identidad de perfil. No equivale a bloqueo inmutable de commit: puede faltar ref y una rama es mutable. La ruta evita reinstalar todas las skills del repo. [Lock local](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/local-lock.ts).

Actualización de proyecto relanza `add -y`; no vi protección de modificaciones locales antes de reemplazar archivos. Tampoco conserva universalmente el agente/copy originales al relanzarlo. [Actualización](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/update.ts#L900).

**Decisión propuesta:** registro Blobot por scope con `sourceUrl`, `skillPath`, `name`, `requestedRef`, `resolvedCommit`, `installedHash`, fecha; detectar modificación local antes de actualizar, conservar copia editable, instalación/reemplazo atómico. Repos distintos con igual nombre necesitan conflicto explícito. Una skill escrita por el usuario debe permanecer editable y sin actualización remota implícita.

## Descarga, scripts y restricciones concretas

**Inspeccionado:** el CLI puede obtener snapshots cacheados de skills.sh para Vercel y otros orígenes permitidos; con ref explícita evita ese fast path. Alternativa: clone superficial en `os.tmpdir()`, limpiado al acabar. `--branch ref` no es garantía de checkout por SHA arbitrario. [Snapshots](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/blob.ts), [Git](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/git.ts).

Instalar copia contenido; no ejecuta un lifecycle del repo-skill. Sí conserva scripts y permisos, y desreferencia symlinks; puede omitir enlaces rotos. El Git heredado usa configuración/credenciales del proceso. Para Blobot: argumentos sin shell, Git limitado, rechazo de escapes/symlinks externos y límites de tamaño; copiar **carpeta completa**, incluyendo scripts/references/assets y avisos de licencia. No instalar dependencias o ejecutar scripts por el mero hecho de importar. [Copia](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/installer.ts#L459).

Telemetría por defecto envía eventos con fuente, skill, agentes, query y otros campos; `skillFiles` aquí es mapa de rutas. `DISABLE_TELEMETRY=1` o `DO_NOT_TRACK=1` deshabilitan envío **y** consulta de auditoría del CLI. [Telemetría](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/src/telemetry.ts). El CLI tiene [licencia MIT](https://github.com/vercel-labs/skills/blob/435076e78988e1e6ec40d00b0b1d76bdbbc5419a/LICENSE); el ejemplo React declara MIT. Las licencias del contenido se evalúan por skill.

## Integración recomendada

Importador Git propio: resolver origen → checkout commit → descubrir SKILL.md → mostrar selección → validar árbol → copiar carpeta completa al scope → escribir registro. Conserva semántica de perfil Blobot y permite pruebas deterministas sin SDK privado.

Alternativa CLI: versión fija empaquetada, `cwd` de staging por operación, estado/cachés aislados, `--agent codex --copy --yes`, sin `-g`; importar resultado validado y mantener registro Blobot. Nunca enlazar el perfil a staging ni modificar HOME del host. No correr `update/remove` del CLI sobre carpetas reales de perfiles; Blobot debe controlar las mutaciones. Es una vía rápida de compatibilidad, con más comportamiento externo y formatos que mantener.
