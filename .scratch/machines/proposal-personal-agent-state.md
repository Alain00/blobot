# Carpeta personal persistente del agente

Alcance concretado con Guillermo · 2026-09-06 · implementación y validación en esta sesión.

## Propósito

La persona conserva su carpeta personal al incorporarse a cualquier equipo. Si Guillermo
entrena a Ana para marketing o análisis de datos y le crea scripts, utilities y archivos de
configuración, esos archivos acompañan a Ana a Contab, Blue y sus siguientes equipos. Cada
participación utiliza **la misma carpeta**, también cuando ambas trabajan simultáneamente.

El kit personal pertenece al `AgentProfile`. El proyecto aporta su propio contexto y sus
recursos específicos: por ejemplo, la configuración de acceso a la base de datos de Blue
permanece en el Workspace de Blue. Diseñar cómo se instalan, cargan o componen skills y MCPs,
y cómo se presenta todo esto visualmente, corresponde a otro esfuerzo.

## Alcance de este esfuerzo

1. Una carpeta persistente de lectura y escritura por ID estable de `AgentProfile`, independiente
   del nombre, del equipo, del repositorio y de la Machine que ejecuta al agente.
2. Acceso a los mismos archivos desde sus participaciones locales y en sandbox en este ordenador.
   El runtime recibe la ruta mediante `BLOBOT_PERSONAL_DIR` y la persona la explica al agente.
3. Conservación entre turnos, sueño, reinicios de la aplicación, retirada de un equipo y eliminación
   de una Machine. Retirar el perfil también conserva los datos y sus participaciones existentes.
4. Integración en Machines existentes conservando su identidad y sus volúmenes privados.
5. Verificación de propiedad y disponibilidad. Un fallo de montaje o una carpeta ausente produce
   un error recuperable, sin sustituir el contenido por una carpeta vacía.

El criterio es almacenamiento compartido real: una escritura terminada en Contab se puede leer
en Blue mientras ambas Machines siguen encendidas. Una copia al incorporarse o sincronizar al
apagar no cumple el propósito.

## Propiedad de los datos

| Datos | Propietario y alcance |
| --- | --- |
| Carpeta de scripts, utilities y archivos personales | AgentProfile; compartida entre sus participaciones |
| Archivos personales de skills y configuración | Pueden conservarse en esa carpeta; su instalación y activación quedan para otro esfuerzo |
| Archivos y configuración específicos del proyecto | Workspace; permanecen en ese contexto |
| Conversación, mailbox, sesión y trabajo del equipo | Participación del agente en el equipo |
| HOME operativo, login, cachés y Docker del sandbox | Machine; se conserva su comportamiento actual |

La carpeta personal es un puente deliberado entre los equipos de esa persona: sus cambios pueden
afectar a sus otras participaciones. Cada sandbox recibe únicamente la carpeta de su propio
perfil. La ejecución local mantiene las protecciones y las aprobaciones del harness; este cambio
no introduce una nueva frontera de aislamiento local.

## Implementación

`PersonalDirectories` resuelve `<app userData>/profiles/<profileId>/files`. La primera ejecución
crea la carpeta y su identidad. El recibo de propiedad vive en
`<app userData>/profiles.records/<profileId>.json`, fuera de todo el árbol de datos personales;
`.blobot-personal-id` identifica el contenido accesible desde la Machine.
Las siguientes ejecuciones verifican esa identidad. Los perfiles no se vinculan por nombre:
las filas antiguas sin `profileId` no reciben una identidad personal inferida.

`DesktopMachines` entrega la misma referencia a las participaciones del perfil. LocalMachine
conserva el HOME del operador y expone la ruta personal al proceso. El adaptador local de Claude
permite escribir en esa ruta exacta dentro de su protección nativa, manteniendo sus aprobaciones.
Los demás harnesses conservan sus controles nativos; la carpeta no concede aprobación automática
a sus herramientas.

En sandbox, RC5 permite añadir la carpeta al sandbox existente mediante un bind mount. Es un
montaje transitorio: Blobot lo vuelve a adjuntar en cada despertar usando la referencia guardada.
Retira el alias auxiliar `/mnt/host`, comprueba los montajes y la identidad como root y UID 1000,
y solo después inicia el runtime. El kit, la identidad de la Machine, su HOME y sus volúmenes
privados permanecen intactos. Un fallo detiene esa Machine y conserva el estado para reintentar.

La carpeta compartida conserva la semántica normal del filesystem. Dos escrituras sobre el mismo
archivo pueden competir; este esfuerzo no añade revisiones de configuración ni resolución de
conflictos. Compartir el archivo tampoco obliga a un proceso a recargar contenido que ya leyó.

## Fuera de alcance

- Interfaz para gestionar o explorar la carpeta personal.
- Instaladores, descubrimiento nativo, precedencia o composición de skills y MCPs.
- Credenciales, OAuth, procesos MCP y recarga de configuración.
- Importación automática de homes actuales, selección de un home ganador o copia del login.
- Compartir todo `/home/agent` o instalaciones globales del sistema operativo.
- Proveedores de almacenamiento remoto, cloud o sincronización entre ordenadores.
- Cambios de CPU/RAM, cuotas o ubicación de worktrees. Los bytes personales usan el filesystem
  del host, fuera de los volúmenes privados de 8/20 GiB; no hay cuota por perfil en este esfuerzo.

Ninguno de esos trabajos es requisito para entregar la persistencia de archivos. La futura
integración de capacidades debe usar esta propiedad por perfil y conservar el ámbito del proyecto.

## Aceptación

- Dos participaciones concurrentes del mismo perfil leen y modifican los mismos archivos.
- Un script guardado desde local se ejecuta desde otra participación en sandbox; una mejora
  escrita en un sandbox es visible inmediatamente desde el otro y desde local.
- Añadir la carpeta a una Machine existente conserva su ID y su estado privado.
- Dormir y despertar una Machine, y reconstruir los servicios tras cerrar la aplicación,
  conservan la carpeta y vuelven a adjuntarla antes del runtime.
- Eliminar una Machine o todas las participaciones conserva los archivos personales.
- Otro perfil recibe otra carpeta; su sandbox no recibe los archivos personales ni el Workspace
  del primero. Los homes operativos de dos Machines del mismo perfil siguen separados.
- Una carpeta ausente, sustituida o redirigida por symlink falla sin adoptar datos ni recrearlos.
  Esto incluye perder el directorio entero del perfil o la raíz de datos personales mientras
  se conserva el catálogo de propiedad externo.
- Un montaje fallido se puede reintentar sin crear otra Machine. La referencia guardada impide
  asociar silenciosamente la Machine a otro perfil.
- La persona y el entorno del proceso identifican la carpeta correcta, sin cambiar el HOME.

Las pruebas y la medición real están descritas en
[80-personal-directory.md](research/80-personal-directory.md). La medición del motor cubre macOS
con sbx RC5; la aceptación sobre un host Linux/KVM permanece pendiente dentro de Machines.
