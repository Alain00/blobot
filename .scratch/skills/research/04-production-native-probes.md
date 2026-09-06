# Verificación de los adapters y el importador de producción

Fecha: 2026-09-06. **Pasan las seis invocaciones locales: sesión nueva y retomada en Claude, Codex y OpenCode.** También pasa un preview Git HTTPS de un repositorio público de GitLab.

Esta segunda prueba utiliza el código de producción ya modificado. A diferencia del [spike inicial](03-native-probes.md), no inyecta raíces ni configuración. El wrapper sólo observa mensajes y reenvía exactamente los mismos bytes/opciones. No se editó producción desde esta investigación.

## Recorrido verificado

El [harness](probe/production.ts) crea un workspace temporal vacío y una carpeta fuente externa con SKILL.md y dos recursos. Importa mediante `PersonalSkills.preview(kind: folder)` y `install`, después utiliza `acquire/release`, `LocalMachine` y las clases reales de los adapters.

La primera ejecución invoca la skill y lee `references/fresh.txt`. Se espera al cierre completo del runtime, se libera el préstamo, se crea otro proceso y se proporciona `resumeSessionId`. La segunda invocación lee `references/resumed.txt`, cuyo UUID nunca apareció en la primera. Así, devolver un token desde el historial no puede hacer pasar la segunda prueba.

En cada runtime se verificó:

- Skill importada completa, con procedencia `local-import` y los tres archivos.
- Alias `.claude/skills` resuelto al árbol canónico `.agents/skills`.
- Anuncio ACP y presencia en `runtime.availableCommands` al iniciar y al retomar.
- `resumed: true`, mismo identificador de sesión y petición real `session/load`; no fallback a una sesión nueva.
- Lectura del recurso correspondiente dentro del directorio personal y devolución del UUID esperado.
- Ninguna petición adicional de permisos. Al finalizar: `executions: 0`, `pending: []`, skill conservada y `modified: false`.

## Resultados

| Runtime | Versiones | Nueva | Retomada | Evidencia |
|---|---|---|---|---|
| Claude | CLI 2.1.263, bridge 0.70.0; Haiku sólo para estas sesiones | Pasa | Pasa | [JSON](probe/production-claude-result.json) |
| Codex | CLI 0.153.4, bridge 1.7.0 | Pasa | Pasa | [JSON](probe/production-codex-result.json) |
| OpenCode | CLI 1.17.9 | Pasa | Pasa | [JSON](probe/production-opencode-result.json) |

Las solicitudes observadas de Claude/Codex incluyen `additionalDirectories: [personalPath]` tanto en `session/new` como en `session/load`. Las opciones de spawn de OpenCode contienen `skills.paths: [personalPath + '/.agents/skills']` en ambos arranques. Esas propiedades las genera producción.

Claude leyó ambos recursos por el alias `.claude/skills`; OpenCode y Codex utilizaron el árbol `.agents/skills`. Codex cometió inicialmente un error al transcribir la larga ruta temporal, recibió un fallo de lectura, corrigió la ruta y completó la prueba. No hubo error del runtime. Los eventos de `session/load` incluyen herramientas históricas reproducidas: la lectura de `resumed.txt` y su token son la evidencia de trabajo nuevo tras retomar.

**Matiz de interfaz:** Claude añade `(project)` a la descripción nativa de una skill cargada mediante `additionalDirectories`. Eso expresa su mecanismo nativo, no la propiedad en Blobot. El inventario debe identificar perfil/proyecto/operador mediante catálogo y ruta; no deducirlo del texto del proveedor.

## Configuración del operador

Se compararon SHA-256 antes y después de los archivos seleccionados de configuración/autenticación de Claude, Codex y OpenCode: los siete permanecieron idénticos, o ausentes en ambos extremos. Los resultados guardan únicamente booleanos, sin contenido ni hashes de credenciales. No se cambiaron HOME ni variables equivalentes, ni se ejecutó login.

Esto no afirma que todo HOME sea inmutable: los runtimes escriben su historial normal de sesiones. La comprobación se limita a los archivos enumerados en `globalFilesUnchanged` de cada evidencia.

## Preview Git HTTPS fuera de GitHub

El [harness GitLab](probe/gitlab-preview.ts) ejecutó exclusivamente:

```ts
manager.preview('ana', {
  kind: 'git',
  url: 'https://gitlab.com/gitlab-org/ai/skills.git',
});
```

Resultado: **23 skills**, commit exacto `9e3704fd0a0592e2ca7e7f9957e8bb59969c8f9d`, procedencia y ruta fuente conservadas. Incluye `commit-messages`, verificado contra la [fuente primaria de GitLab](https://gitlab.com/gitlab-org/ai/skills/-/blob/main/skills/commit-messages/SKILL.md). La previsualización dejó `skills: []` en el catálogo; no instaló ni ejecutó contenido externo. [Evidencia](probe/gitlab-preview-result.json).

## Reproducción y límites

Desde `/Users/guillermo/Work/blobot`:

```sh
pnpm exec tsx .scratch/skills/research/probe/production.ts claude
pnpm exec tsx .scratch/skills/research/probe/production.ts codex
pnpm exec tsx .scratch/skills/research/probe/production.ts opencode
pnpm exec tsx .scratch/skills/research/probe/gitlab-preview.ts
```

Las tres primeras llamadas usan inferencia del usuario: dos turnos cortos por runtime. Esta prueba de producción es local en macOS; no repite el guest del spike anterior ni prueba Linux, colisiones, operaciones concurrentes, UI o actualización mientras existen sesiones vivas. No se debe extrapolar a otros proveedores Git privados ni interpretar el único repo GitLab probado como cobertura de todos los servidores HTTPS.
