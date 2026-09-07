# Gestión de skills: investigación y plan de MVP

Fecha: 2026-09-06. Estado: primer corte implementado y validado; commit y push autorizados posteriormente por el usuario. Véase [build.md](build.md) para alcance entregado, pruebas y límites de aceptación. La instalación de proyecto sigue siendo el segundo corte.

## Recomendación

La skill pertenece a la persona. Se instala una vez en la carpeta personal del `AgentProfile` y se ofrece al runtime en cada Team donde trabaja esa persona, tanto local como sandbox. **El gestor es independiente de catálogos, autores y proveedores.** Una skill propia, de un repositorio particular o descubierta en skills.sh usa el mismo almacenamiento y las mismas operaciones. Skills.sh es un origen opcional. Blobot decide dónde guardarla, registra su procedencia y conecta el contenido con el runtime. Guardar archivos y lograr que el runtime los descubra son dos entregables distintos.

El primer corte debe permitir **crear skills propias, importar carpetas locales y repositorios, inspeccionar, editar, comprobar actualizaciones cuando exista un origen actualizable, actualizar y quitar skills personales**. Las skills custom son un caso principal de aceptación, no un fallback. Incluye inventario de skills de proyecto y heredadas cuando un runtime puede identificarlas. La instalación desde la interfaz en una rama del proyecto es el segundo corte: no la presentaremos como disponible en el primero. Esto evita que un gestor de skills se convierta accidentalmente en un sincronizador de workspaces.

No incluye gestión de MCP, credenciales, plugins completos, instalación de dependencias de scripts, marketplace propio, sincronización entre ordenadores o publicación de skills.

## Formato común y orígenes del MVP

El contrato de contenido es Agent Skills: una carpeta con `SKILL.md` (frontmatter con nombre y descripción, seguido de instrucciones) y los scripts, referencias, plantillas u otros archivos que necesite. No requiere catálogo, cuenta, editor concreto ni publicación. El cuerpo de instrucciones admite contenido propio; requisitos y extensiones de runtime se muestran por separado. [Especificación oficial](https://agentskills.io/specification).

| Entrada | Flujo | Qué conserva Blobot |
|---|---|---|
| Crear una skill | Nombre, cuándo usarla e instrucciones; crear borrador y abrir su carpeta para añadir scripts/recursos | Contenido propio, sin URL ni versión remota obligatorias |
| Carpeta local | Elegir una skill o colección, previsualizar y copiar las seleccionadas | Carpeta completa y referencia informativa al origen; el destino personal es independiente |
| Repositorio Git | URL HTTPS, ref opcional y selección de skills | URL, subruta, commit e integridad; importador genérico para hosts Git compatibles, no una allowlist de autores |
| Skill ya existente | Detectar lo que usuario/agente escribe directamente en la carpeta personal | Incorporarla al inventario como local; ningún registro remoto es necesario |
| Enlace de catálogo | Resolver a un origen soportado y continuar el flujo común | Procedencia del contenido y, opcionalmente, página de descubrimiento |

GitHub, GitLab o un servidor Git propio son ubicaciones posibles para el importador Git HTTPS; cada forma de URL requiere normalización y pruebas. No prometer soporte para cualquier página web o cualquier URL de catálogo sin un resolver. Skills.sh es el primer resolver de catálogo estudiado, no una dependencia del dominio.

En el MVP una skill de un repositorio privado también puede importarse desde un clon local. Autenticación remota privada directa es una capacidad adicional, pendiente de integración con credenciales existentes; no convertirla en una condición para usar skills custom. No publicar ni subir contenido local para validarlo.

**Copiar, no enlazar fuera del volumen.** Tras importar una carpeta local, la copia del perfil debe seguir funcionando aunque se borre o mueva el origen. Si la skill ya está en la carpeta personal se registra/descubre en su lugar, sin duplicarla. Los enlaces y referencias a archivos externos al paquete deben señalarse y resolverse antes de prometer portabilidad; no copiar carpetas externas implícitamente. Actualizar desde una carpeta local es una reimportación explícita, no sincronización silenciosa.

Una skill de otro autor puede convertirse en **copia personal** para entrenarla: conservar procedencia, licencia y atribución; separar la identidad de origen de las ediciones y detener actualizaciones remotas de esa copia. No exigir que la skill se haga pública ni que esté firmada por una marca. Una skill incompleta se guarda como borrador editable y se incorpora al catálogo de ejecución solo cuando tiene los campos necesarios. Esto no convierte scripts o prompts arbitrarios en una skill sin una adaptación explícita.

## Lo investigado

Los informes distinguen documentación, inspección de código y pruebas ejecutadas:

- [Skills.sh y CLI](research/01-skills-sh.md): fuente fijada por commit, comandos, API, importación temporal, registro y actualizaciones.
- [Integración con runtimes](research/02-runtime-integration.md): mecanismos nativos y límites por adapter.

La investigación se apoya en `feat/machines` a partir de `c89ca8a`. La carpeta personal ya persiste por perfil y viaja como montaje; todavía no es una raíz de descubrimiento nativo de skills.

### Skills.sh como ejemplo de un origen más

Ejemplo verificado: [Vercel React Best Practices](https://skills.sh/vercel-labs/agent-skills/vercel-react-best-practices).

1. Abrir **Your agents → Ana → Skills → Add skill**.
2. Pegar el enlace de skills.sh. También admitir `vercel-labs/agent-skills` o su URL de GitHub.
3. Blobot resuelve el repositorio y muestra la skill, su descripción, autor/origen, licencia declarada y archivos. Autor y licencia pueden faltar: mostrar «no declarado», sin inferirlos. Si se pegó un repositorio, permite elegir una o varias skills.
4. Pulsar **Add to Ana**. El destino ya viene determinado por la pantalla; no aparece un selector global ambiguo.
5. La siguiente sesión compatible de Ana incorpora esa skill en Blue, Contab o cualquier otro Team. El resultado indica si quedó disponible para nuevas sesiones o pendiente de aplicar por sesiones abiertas.

El comando externo equivalente es:

```sh
npx skills@1.5.23 add vercel-labs/agent-skills \
  --skill vercel-react-best-practices --agent codex --copy --yes
```

Fue probado en una carpeta temporal: importó 76 archivos. Este comando instala para el proyecto del directorio actual; **no instala por sí solo una skill personal de Blobot**. `-g` significa global del usuario del ordenador, no del `AgentProfile`. El nombre de esta skill es `vercel-react-best-practices`, aunque la carpeta fuente se llama `skills/react-best-practices`; el importador debe leer el frontmatter y conservar la ruta fuente, no adivinarlos a partir del slug.

### Por qué no ejecutar simplemente el CLI desde la app

La versión inspeccionada es `skills@1.5.23`. No ofrece un SDK público ni una opción general para elegir una raíz arbitraria de instalación. Sus rutas y locks están organizados por proyecto/usuario y nombre de skill. Además, `check` es alias de actualización en esa versión: no es una comprobación de solo lectura. [Código del CLI fijado](https://github.com/vercel-labs/skills/tree/435076e78988e1e6ec40d00b0b1d76bdbbc5419a).

Recomiendo **importadores de carpeta local y Git detrás de un contrato común**, más creación directa. El importador Git descarga contenido y no ejecuta el repositorio; no depende de una lista de autores o del índice de skills.sh. Es más fácil delimitar su escritura a la persona correcta que adaptar todas las convenciones globales del CLI. Alternativa si ampliamos fuentes: CLI fijado y aislado en staging, seguido del mismo importador/registro de Blobot. Nunca ejecutar `update` o `remove` del CLI sobre el kit real de una persona.

Skills.sh sí ofrece una API documentada `/api/v1`, pero exige Vercel OIDC; la consulta anónima se probó y devuelve 401. El endpoint legacy usado por el CLI responde sin token, pero no es el contrato versionado. El MVP puede funcionar sin ambos: **Explore skills.sh** abre el directorio y el usuario pega un enlace. Un catálogo integrado debe ser un trabajo posterior, sin introducir un backend Vercel obligatorio en esta app local. [API oficial](https://skills.sh/docs/api).

## Experiencia visual

### Una puerta en la persona

Añadir una acción visible **Skills** en cada fila de `Your agents`, junto a **talk**. La fila sigue abriendo la edición de la definición. Skills abre una superficie de trabajo con regreso a `Your agents`, nombre de la persona, lista y **Add skill**. No agregar campos a Hire/Edit ni una sección en Settings o Machines: las skills pertenecen a la persona, no a las preferencias del ordenador.

La pantalla conserva el lenguaje actual: fondo oscuro, filas rellenas, botones redondos, tipografía sans, origen en mono, sin tarjetas de métricas ni colores para estados. El nombre identifica al perfil; no hace falta repetir su blobatar en una cabecera sobre esa misma persona.

Contenido de una fila: nombre, descripción breve, origen (`Created here`, `Imported from folder` o repositorio) y, cuando corresponde, `Draft`, `Edited locally`, `Update available`, `Pending` o `Unavailable for this runtime`. Una skill instalada sin novedades no necesita un badge de éxito. Abrir la fila permite leer `SKILL.md`, inspeccionar archivos, abrir su carpeta, consultar procedencia y acceder a las acciones que correspondan: Edit/Remove para locales, Check/Update para un remoto, Reimport para una carpeta y Make a personal copy para personalizar contenido importado. Una skill custom tiene el mismo nivel visual que una de catálogo. No poner comandos, volúmenes o rutas de montaje en el flujo principal.

### Añadir

Diálogo del ancho normal de Blobot (560 px), título **Add a skill to Ana**, con tres entradas del mismo nivel: **From folder**, **From link**, **Create**. Carpeta abre el selector nativo; enlace pide una URL de repo o catálogo compatible; crear pide nombre, cuándo usarla e instrucciones. Skills.sh aparece como enlace opcional dentro de From link. La previsualización presenta selección y contenido antes de **Add to Ana**. La app no ejecuta texto pegado: una cadena `npx …` se rechaza con indicación de pegar el enlace/repositorio, no se pasa a una shell.

Una carpeta de una skill o un enlace directo selecciona esa skill; una colección local o repo presenta las descubiertas sin instalar todas por defecto. La instalación puede fallar de forma legible por origen no admitido, nombre duplicado, contenido inválido, descarga o carpeta personal ausente. Si falta la carpeta personal, se mantiene el error de identidad existente; no se crea otra silenciosamente. Autor y licencia no declarados no impiden guardar una skill propia; el gestor preserva los avisos que sí existen.

### Ver qué tiene disponible aquí

En el detalle del agente dentro de un Team, **Skills** abre inventario de esa sesión con orígenes separados: **Ana**, **This project**, **This computer** cuando proceda. No se copian skills del proyecto al perfil por consultarlas. La sección personal enlaza a la gestión de Ana; proyecto muestra los archivos del `AgentWorkspace` de esa sesión. Las heredadas son informativas y no se borran desde el gestor personal.

La pantalla de la persona indica dónde aplica su kit; la de la sesión explica qué fue detectado en ese contexto. No todas las skills descubribles tienen un comando `/`: la paleta conserva la intersección entre lo anunciado por el runtime y lo identificado en el sistema de archivos.

La primera maqueta muestra persistencia personal al alternar Blue/Contab. La revisión universal del flujo Add presenta carpeta, enlace y creación con ejemplos custom, además del ejemplo Vercel. Son datos de ejemplo y operaciones simuladas. El segundo corte de instalación de proyecto no está fingido como un botón operativo en el MVP.

## Contrato técnico propuesto

### Propiedad y archivos

`SkillScope = personal(profileId)` en el primer corte. No usar nombre del agente, teamId, sandboxId ni runtime como identidad del almacenamiento. El único punto de entrada al disco es `PersonalDirectories.forProfile(profileId).prepare()` y su ruta validada.

Layout propuesto, dentro de la carpeta personal existente:

```text
files/
  .agents/skills/<skill-name>/SKILL.md
  .agents/skills/<skill-name>/scripts/…
  .agents/skills/<skill-name>/references/…
  .claude/skills -> ../.agents/skills
  .blobot/skills/manifest.json
  .blobot/skills/drafts/<draft-id>/SKILL.md
  .blobot/skills/staging/<operation-id>/…
  .blobot/skills/previous/<operation-id>/…
```

`.agents/skills` es la fuente canónica. La proyección `.claude/skills` permanece dentro del mismo volumen y debe verificarse en local y guest; no apunta al HOME del operador. No reemplazar archivos o enlaces preexistentes no gestionados: informar del conflicto. Directorios de scripts/utilidades que ya existen fuera de skills siguen perteneciendo al perfil y no se reorganizan.

Los borradores se guardan fuera de las raíces que descubren los runtimes, en `.blobot/skills/drafts`. Una marca `draft` en el manifest no impediría que el runtime leyera una carpeta ya puesta en `.agents/skills`. **Make available** valida y publica el borrador con la misma transacción y reglas de sesiones que una importación. Abrir/editar un borrador no cambia el catálogo activo.

Cada entrada del manifest incluye `id`, `name`, `source`, `installedHash`, `installedAt` y versión de formato. `source` es una unión: `authored`, `local-import { originalPath? }` o `git { url, skillPath, requestedRef?, resolvedCommit }`; la página de catálogo es metadata opcional y no define la identidad. `origin` puede conservar la procedencia de una copia personal sin habilitar actualización remota. Los registros no exigen URL, commit o licencia para una skill local. El nombre debe ser único dentro del catálogo personal; fuentes distintas con el mismo nombre requieren elección explícita, no sobrescritura. El lector también detecta skills creadas manualmente sin manifest, que aparecen como locales y no tienen actualización remota.

Mantener contenido, scripts, referencias, assets y avisos de licencia necesarios. No reducir una skill a su `SKILL.md`. Conservar metadatos desconocidos sin prometer que todos los runtimes los interpretan: el formato común no hace equivalentes hooks, subagentes, herramientas permitidas o extensiones propias. [Agent Skills: implementación de clientes](https://agentskills.io/client-implementation/adding-skills-support).

### Importar, editar y actualizar

1. Resolver `SkillSource` mediante el importador correspondiente. Normalizar solamente formatos admitidos. Un enlace skills.sh de GitHub se convierte en repo + nombre. No inferir que cualquier proveedor del catálogo sea un repositorio GitHub. Crear una skill propia produce contenido local para el mismo validador.
2. Copiar o descargar a staging. Para Git, resolver a commit exacto y usar argumentos estructurados, sin shell, sin hooks, submódulos o instalación de dependencias; neutralizar configuración Git heredada, filtros y helpers capaces de ejecutar código. Una descarga HTTPS del commit con extracción validada es una optimización específica del host. Para carpeta local, no mover ni alterar el origen. Limitar tamaño y rechazar rutas que escapen del árbol. Validar symlinks y tipos de archivos.
3. Descubrir y validar skills; presentar previsualización de los mismos bytes que se van a instalar. En Git se fija el commit; en una carpeta se prepara una copia consistente, se compara si cambió mientras se leía y se pide nueva previsualización en ese caso. Si no existe un nombre/description válido, ofrecer abrir/crear un borrador; no inventar instrucciones ni una conversión silenciosa.
4. Publicar con bloqueo por perfil y journal recuperable. Un fallo no puede dejar manifest nuevo con carpeta vieja, ni borrar una versión válida. El rename de carpeta y la escritura del manifest requieren recuperación de transacción; llamarlos «atómicos» por separado no resuelve el conjunto.
5. Para fuentes Git, comprobar actualizaciones con una operación propia de lectura. Resolver upstream y comparar el contenido de la skill con el mismo algoritmo y normalización usados en `installedHash`, no solo el commit del repo. Un Git tree SHA no equivale a un hash de archivos copiados; si se usa, guardarlo separado como `sourceTreeHash`. No marcar una actualización si cambió una skill vecina. Para carpeta local, Reimport exige volver a elegir/verificar el origen; las skills authored y copias personales no tienen upstream activo.
6. Antes de actualizar o quitar, comparar el contenido actual con `installedHash`. Si fue editado, ofrecer conservarlo como copia local o cancelar; nunca perder el entrenamiento local por una actualización automática. La edición MVP abre la carpeta en el editor/sistema; no necesita otro editor dentro de Blobot.
7. La eliminación gestionada retira esa skill, sus enlaces propios y su entrada; conserva una copia recuperable con retención acotada. No elimina la carpeta personal ni dependencias o recursos compartidos del usuario.

### Cuándo se activa un cambio

Primer corte conservador: **no modificar catálogos publicados mientras existan sesiones vivas del perfil que puedan estar usando sus archivos**. Descargar y preparar es posible mientras trabajan; publicar queda pendiente. Al cerrarse la última sesión, aplicar la transacción antes de abrir una nueva. «Sin turno activo» no significa «sin sesión abierta».

El cierre se confirma cuando termina `stop()` y sale el proceso; cerrar una pestaña o recibir `lifecycle = stopped` no basta. Claude y Codex emiten ese evento antes de esperar al cierre del proceso. Mantener una referencia de uso por perfil desde start/load/wake hasta shutdown completo y bloquear nuevas aperturas/retomas con la misma puerta que publica. Incluir tareas de fondo que puedan seguir leyendo scripts.

La interfaz debe decir `Pending — close Ana's sessions to apply` y ofrecer navegar a esas sesiones; la instalación no interrumpe ni reinicia trabajo. Una acción posterior `Apply and restart…` requiere una operación de reinicio explícita ya soportada, con impacto visible; no es una dependencia del MVP. Si las pruebas de runtime demuestran recarga segura, puede reducirse esta restricción por capability, sin prometer hot reload universal.

Editar archivos fuera de Blobot conserva la libertad actual del usuario. El gestor detecta cambios; su efecto sobre sesiones abiertas depende del runtime. Claude vigila SKILL.md y Codex refresca antes de cada prompt, por lo que no podemos prometer diferimiento para ediciones directas. Retirar una skill cambia el descubrimiento futuro: cerrar y retomar una sesión puede conservar instrucciones en su historial, y no representa olvido ni revocación inmediata.

### Activación por runtime

La integración pertenece a cada adapter; la UI consume capacidades y resultados, no nombres de proveedores en condicionales.

| Runtime | Vía investigada | Condición para habilitar en MVP |
|---|---|---|
| Claude Code | ACP/SDK `additionalDirectories: [personalPath]`, raíz personal `.claude/skills` | Prueba con bridge fijado, versión del ejecutable registrada/verificada, `settingSources` actual y local + sandbox; no importar instrucciones del operador a la box |
| Codex | Bridge ACP procesa `additionalDirectories` y usa `skills/extraRoots/set`; raíz `.agents/skills` | Verificar catálogo y activación con bridge e imagen fijados, ejecutable local registrado/verificado, en sesión nueva y retomada |
| OpenCode | `skills.paths` hacia `<personalPath>/.agents/skills` | Componer configuración de sesión sin reemplazar configuración, MCP o credenciales; prueba local + sandbox |
| Cursor | Candidato `--plugin-dir` | Spike antes de anunciar soporte; `--add-dir` por sí solo no demuestra descubrimiento |
| fx | Su `--add-dir` no incorpora skills | Fuera del soporte personal nativo inicial hasta encontrar y probar una vía explícita |

Objetivo de salida: Claude y Codex verificados; OpenCode entra si supera la misma prueba. Cursor/fx muestran la capacidad no disponible para su runtime actual y no un falso «loaded». Ninguna fila de esta tabla sustituye una prueba de activación completa: parte de la evidencia es documentación/código, no una sesión de inferencia ejecutada.

No cambiar HOME, CODEX_HOME o CLAUDE_CONFIG_DIR para aislar skills: también contienen autenticación y configuración. En sandbox conservar los montajes y enlaces del kit de operador existentes, de solo lectura, y añadir la raíz personal por la vía nativa. No copiar la carpeta personal a cada máquina ni reemplazar un sandbox para cambiar skills.

**Colisiones:** dentro del catálogo gestionado, rechazar nombres duplicados. Entre personal/proyecto/heredadas, detectar y mostrar el origen cuando hay evidencia. No inventar una precedencia universal: cada runtime resuelve la suya. Una skill eclipsada sigue almacenada, pero no debe presentarse como efectiva; si no podemos determinar qué ganó, mostrar conflicto/no confirmado. No renombrar silenciosamente una skill para cambiar esa precedencia.

## Segundo corte: instalar en el proyecto

Una skill de proyecto pertenece a archivos del `Workspace`/`AgentWorkspace`, no al Team como almacenamiento nuevo. Hoy cada miembro puede tener una rama o copia distinta. Instalar en la carpeta de origen del Team no actualiza mágicamente las copias existentes, y copiar a todas ellas alteraría trabajo aislado.

La entrada propuesta es **agente en Blue → Skills → This project → Add skill**, con destino mostrado antes de confirmar: **Blue · Ana's branch** y ruta concreta en detalles. Escribir en ese `AgentWorkspace`, usando la raíz nativa admitida por su runtime y las convenciones ya presentes. La operación produce cambios de archivos normales; no hace commit, merge ni push automáticamente. Para compartirlos entre ramas se usa el flujo Git de Blobot. En carpetas sin Git se dice que solo se modifica esa copia; no prometer sincronización.

La preferencia es `.agents/skills` para contenido común, con una proyección `.claude/skills` cuando haga falta y no haya conflicto. Su ubicación final requiere prueba de discovery por adapter y de symlinks en worktrees/sandbox. No se debe generar un enlace de proyecto hacia una ruta personal del ordenador: el contenido versionado del proyecto debe seguir funcionando sin ese perfil.

Si el producto quiere que «instalar en Blue» cambie inmediatamente todos sus Teams y ramas, eso necesita un catálogo compartido de proyecto con su propio contrato; queda fuera de este MVP. Los MCP de Blue se resolverán en su esfuerzo de configuración y credenciales, aunque la navegación por ownership puede reutilizarse.

## Secuencia de implementación

1. **Probar activación nativa antes de construir el gestor.** Fixture mínimo por adapter: nombre único, instrucción verificable y un recurso relativo. Mostrar descubrimiento real, invocación y lectura desde personal en local y sandbox. Registrar versiones fijadas. Resultado: capabilities fiables y rutas definitivas.
2. **Catálogo y transacciones personales.** Escáner, frontmatter, manifest, identidad, bloqueo, staging, recuperación, ediciones locales, sesión viva y operaciones pendientes. Exponer APIs tipadas de list/preview/install/check/update/remove, con acceso al filesystem en main/core.
3. **Orígenes universales y creación.** Primero importar una carpeta custom completa, crear un borrador propio y detectar skills escritas por el agente. Después importador Git HTTPS genérico y resolver opcional skills.sh. Compartir normalización de contenido, selección, staging, validación, copia completa y registro de origen. Actualizaciones según capacidad de la fuente. Pruebas con fixtures propios, repo alojado fuera de GitHub y smoke de Vercel opcional, no una dependencia de red de toda la suite.
4. **Conectar adapters y paleta.** Configurar raíces al abrir/retomar sesión, traducción de paths host/guest, conservar kit existente, distinguir detectado de anunciado/invocable y resolver información de colisiones cuando el runtime la proporcione.
5. **Interfaz personal e inventario por sesión.** Acción Skills en Your agents, lista/detalle, Add/Preview, edición externa, operaciones pendientes y errores. Proyecto e heredadas informativas con origen claro. Actualizar `DESIGN.md`, ADR-0003 y dominio para registrar el nuevo contrato.
6. **Aceptación del primer corte.** Ejecutar la matriz siguiente y revisión del cambio. Solo después incorporar instalación explícita en la rama/copia de proyecto como segundo corte.

No asigno fechas antes del primer spike: la incertidumbre principal está en la activación nativa, no en dibujar la lista. Cada paso deja evidencia revisable y puede implementarse sin ampliar MCP ni modificar homes globales.

## Pruebas y definición de terminado

- **Portabilidad:** importar una skill custom con script, plantilla y referencia para Ana; abrirla en Blue y Contab, local y sandbox, con el mismo directorio personal y hashes. Que el runtime la descubra y pueda leer recursos relativos tras mover/borrar la carpeta de origen. Otra persona no la recibe. Repetir con una skill Git y el ejemplo Vercel.
- **Creación y entrenamiento:** crear una skill sin cuenta ni red; guardar borrador, completarlo, editar sus instrucciones/recursos y detectar una skill escrita directamente por el agente. Preservar esos cambios al cambiar de Team. Convertir una skill remota en copia personal mantiene atribución y no recibe sobrescrituras upstream.
- **Fuentes:** carpeta simple, colección local, clon privado local, Git HTTPS fuera de GitHub, enlace de catálogo resuelto y no soportado. La fuente authored funciona sin URL/commit/licencia. Ninguna operación de carpeta o creación envía contenido a servicios externos.
- **Persistencia:** cerrar/abrir app, parar/despertar sandbox, cambiar de Team y retirar al agente de uno no pierde contenido. Una carpeta personal desaparecida produce el error de identidad existente.
- **Contenido y origen:** nombre distinto de carpeta, repo con varias skills, assets binarios, scripts, licencia, nombre duplicado, SKILL.md inválido, rutas externas, repositorio inaccesible y revisión movida tras preview.
- **Mutación:** cancelación/caída en cada fase de publicación, dos instalaciones concurrentes, update sin cambios, cambio de skill vecina, edición local y remove conservador. La última versión válida siempre puede recuperarse.
- **Sesiones:** añadir/actualizar/quitar con dos sesiones del perfil abiertas mantiene la operación pendiente; cerrar solo una no aplica; al cerrar ambas se aplica antes de la siguiente. Un cambio nunca inicia o reinicia sesiones por navegar el gestor.
- **Aislamiento:** el gestor no escribe fuera de sus destinos; configuración, skills globales y credenciales del operador conservadas. Separar esta comprobación de las escrituras normales del runtime en logs o historial. Skills heredadas y proyecto siguen presentes; sandbox conserva runtime privado y kit. Ningún script se ejecuta durante preview/install.
- **Semántica nativa:** sesión nueva y retomada, colisión personal/proyecto, symlinks y ACL, relación catálogo/paleta; no llamar «invocable» a una skill que solo está en disco. Registrar exclusiones por runtime y plataforma.
- **UX:** teclado/foco del diálogo, selección del repo, destino visible, errores recuperables, estado vacío, copia local, pendiente y runtime no compatible. Probar ancho de escritorio y panel estrecho.

La investigación actual no sustituye estas pruebas futuras: se ejecutó la importación CLI temporal, se inspeccionaron fuentes de los bridges y se probó descubrimiento sin inferencia en Codex 0.153.4 (`skills/extraRoots/set` + `skills/list`) y OpenCode 1.17.9 (`debug skill` con `skills.paths`). No se implementó ni verificó todavía el gestor en Blobot.

La maqueta se comprobó en navegador a 1024, 736 y 360 px, con el tema oscuro de Blobot. Se verificaron el diálogo, la previsualización, la instalación simulada, la conservación de la lista personal al pasar de Blue a Contab y la recuperación de una entrada inválida. Las comprobaciones del fragmento en JSDOM también pasaron: instalación pendiente, aplicación tras cerrar sesiones simuladas, consulta sin mutación, eliminación, densidad y Escape. Estas comprobaciones validan la propuesta interactiva, no el backend futuro.

La revisión universal del flujo Add también se verificó a 736 y 360 px: previsualización de carpeta custom y creación de borrador. Las comprobaciones JSDOM cubren carpeta con recursos, borrador propio, ejemplo de Git ajeno a GitHub, skills.sh opcional, duplicados, entrada inválida y navegación de fuentes con teclado. Los repositorios de ejemplo son simulaciones, no clones remotos ejecutados.
