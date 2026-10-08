# Dashboard de evaluación de alumnos — Instructivo

Herramienta de ZCAP para evaluar a los alumnos de un curso presencial día a día y ver el resultado (resumen del curso y ficha por alumno, en pantalla o PDF). Funciona en el navegador: **los datos de los alumnos no se envían a ningún servidor**; se guardan en un archivo Excel que tú eliges (y, solo si el navegador no puede guardar el archivo solo, en un borrador temporal en ese navegador; ver más abajo).

Versión del dashboard: 2.1.0 · Archivo de evaluación: 2.1.0 (se siguen leyendo los de las versiones 2.0 y 1.x)

---

## 1. Para el relator: el flujo de 5 pasos

Usa un notebook con **Chrome o Edge**. La página te guía con una barra de pasos arriba.

0. **Abrir o empezar.** En la pantalla inicial hay una sola entrada para abrir un archivo: sirve la **Plantilla de Ingreso** o una **evaluación guardada** (la página detecta cuál es). También puedes crear un **Archivo nuevo en blanco** y escribir los datos del curso y los alumnos a mano. Con un curso abierto, arriba están "Archivo nuevo" y "Abrir".
1. **Cargar curso.** Arrastra la **Plantilla de Ingreso** (la planilla donde llenaste nombre del curso, cliente, contacto y la lista de alumnos, hoja *Información*). La página detecta los datos por sus etiquetas, muestra una vista previa y avisa si algo falta. Confirma. (Las columnas de clave no se leen.)
2. **Fechas y asistencia.** Agrega las fechas de las clases presenciales (las que sean, con tema opcional) y marca quién asistió cada día. "Marcar todos" ahorra tiempo. La asistencia solo se registra: no cuenta como aprobado ni reprobado.
3. **Métricas.** Elige métricas del catálogo (por ejemplo el grupo *Esposamiento* completo, *Retención y control*, etc.) o escribe las tuyas. Para cada una eliges el **tipo**: *Checklist* (cumple / no cumple; vale 1 o 0) o *Escala* (puntaje mínimo y máximo, y **mínimo de aprobación**, que es una referencia de la métrica y no un veredicto del alumno). En un checklist, "Mín. aprobación" es el **mínimo esperado de cumplimiento** en % (parte en 60): en los resultados la barra de la métrica solo se resalta si el cumplimiento del curso queda bajo ese valor. Las métricas del catálogo entran como checklist; en "Agregar métrica" eliges el tipo con dos botones grandes y, si es escala, pones sus valores (parten en 0 a 100 con mínimo de aprobación 60). Se pueden mezclar. El **peso** de cada métrica da el ponderado (sin peso, todas valen lo mismo). Arriba del listado está **% base** (0 a 99; un curso nuevo parte en **20 %**): el mínimo garantizado del puntaje de cada día. Con 20 %, quien cumple todo obtiene 100, cada paso no cumplido descuenta según su peso (una de 9 resta unos 9 puntos: queda en 91,1) y nadie con puntajes baja de 20; con 0 no hay base. Los archivos antiguos que no traen este dato se siguen calculando sin base. El catálogo trae el grupo **Reentrenamiento PRT** con sus nueve pasos de checklist. Si cada día evalúa algo distinto, en el paso 4 eliges qué métricas se evalúan ese día.
4. **Evaluar.** Elige la fecha: aparece la grilla con los alumnos presentes y las métricas del día. Las métricas *Checklist* aparecen como casillas grandes (marcada = cumple) y **todos parten marcados**: solo desmarcas lo que no cumplió (arriba a la derecha hay "Marcar todos" y "Desmarcar todos", que piden confirmación si van a cambiar casillas ya registradas) (los descuentos; arriba ves cuántos llevas) y el total se actualiza al tiro. Las de escala se escriben: escribe el puntaje y presiona Enter (baja a la siguiente fila); las flechas también mueven. Celda vacía = no evaluado (no cuenta como cero). Un puntaje fuera de la escala se rechaza con un mensaje. Hay un comentario opcional por alumno y día. Para ir más rápido:
   - **Traer los puntajes del día anterior:** copia a las celdas vacías los puntajes del día anterior (solo de las métricas que ese día también se evalúan y solo para los presentes). Lo copiado se ve con borde punteado y cursiva, y la página cuenta cuántos faltan por revisar; al pasar por una celda con Enter (o al corregirla) queda como revisada. Nunca pisa lo que ya escribiste.
   - **Rellenar las vacías con…:** bajo el encabezado de cada métrica escribe un puntaje (por ejemplo 7) y Enter: llena todas las celdas vacías de esa columna.
5. **Resultados.** El dashboard muestra el resumen del curso y la ficha de cada alumno. El rendimiento final de un alumno es el **promedio de sus totales diarios** (cada día evalúa un tema distinto).

**Ausencias en un checklist:** si un alumno falta un día en que se evaluó una métrica Cumple / No cumple, esa métrica lo cuenta como *No cumple* en su promedio y en el cumplimiento del curso (en la ficha se ve como "—"). Su total de ese día queda sin valor y su rendimiento final se sigue calculando solo con los días en que asistió.

### Guardar y continuar (autoguardado)

- Al terminar el paso 1 presiona **Guardar** y elige una carpeta de ZCAP con acceso restringido. Desde ahí la página **guarda sola** cada pocos segundos; arriba ves "Guardado" o "Sin guardar".
- Al día siguiente abre la página y presiona **Continuar con el último archivo** (o **Abrir evaluación guardada**). El navegador pedirá permiso una vez por sesión: una página web no puede leer archivos de tu computador por su cuenta.
- Si otro programa (o tú en Excel) cambió el archivo mientras trabajabas, la página avisa y te deja elegir: sobrescribir, guardar una copia o volver a cargar.
- Si tu navegador no permite escribir archivos (teléfonos, Firefox, Safari, o Brave sin activar la opción), el botón descarga una copia `.xlsx` cada vez que lo presionas; para continuar, abre ese archivo con **Abrir**. En Brave de escritorio se puede tener autoguardado activando `brave://flags` → «File System Access API».
- **Borrador por si se cierra el navegador:** mientras no haya un archivo con autoguardado, la página deja un borrador de lo que llevas **en ese navegador** (incluye nombres, RUT y correos). Si cierras el navegador o se apaga el teléfono, al volver aparece "Hay un trabajo sin guardar" con "Recuperar borrador". El borrador se borra al descargar o guardar el archivo, al descartarlo y a los 7 días. En un equipo compartido, descártalo o descarga el archivo al terminar.
- Si intentas cerrar la pestaña con cambios sin guardar, el navegador te avisa.
- El archivo guardado se puede abrir en Excel, pero **no lo edites a mano** mientras la página lo tiene abierto.

### Desde un teléfono o una tablet

Se puede usar en un iPhone o un iPad (revisado en 414 × 896 y 810 × 1080 px). En el teléfono la grilla de evaluar mantiene fijo el nombre del alumno y se desliza hacia el lado para ver las métricas; las métricas del curso se muestran como tarjetas. La notebook sigue siendo el equipo recomendado para evaluar, porque el autoguardado en el archivo depende de Chrome o Edge de escritorio (en el teléfono se guarda descargando el archivo).

### Informes para enviar

- **Curso:** pestaña Resultados → **Imprimir** → "Guardar como PDF" (2 hojas).
- **Ficha de un alumno** (una hoja, hasta 4 días y 10 métricas): vista **Alumnos**, elige al alumno y **Imprimir**.
- **Todas las fichas:** vista **Alumnos** → **Imprimir todas las fichas**. Un solo PDF con una ficha por hoja.
- **Tamaño del papel:** la página se adapta al que elijas (A4, Carta…). Si ves la ficha chica y en medio de la hoja, revisa **Más ajustes → Tamaño del papel**.

### Modo presentación (activado por defecto)

Con el modo activo **no se ve ningún nombre, RUT ni correo**: los alumnos aparecen como A001, A002… y se ocultan los comentarios. Los grupos con menos de 5 alumnos se muestran como "grupo reservado".

Para entregar una **ficha con nombre** hay que desmarcar "Modo presentación". Mientras esté desmarcado se ve una franja roja "Datos personales visibles" en pantalla (el PDF impreso no lleva esa marca: revisa tú que no se comparta sin autorización). **A quién se entregan las fichas con nombre lo define ZCAP con el cliente, no la herramienta.**

Guarda el archivo de evaluación solo en carpetas de ZCAP con acceso restringido; no lo subas a ningún repositorio ni lo mandes por canales abiertos.

### Archivos de la versión 1 (planilla con hojas Parametros, Criterios y Evaluaciones)

Siguen funcionando: se arrastran a la página y se abren directamente en los resultados. En ese caso la asistencia se deduce de quién tiene puntajes cada día y el "umbral" antiguo pasa a ser el mínimo de aprobación de cada criterio.

---

## 2. Para quien mantiene la herramienta

### Qué hay en cada carpeta

| Carpeta | Contenido |
|---|---|
| `docs/` | El sitio (lo que se publica): `index.html`, `css/`, `js/`, `vendor/` (SheetJS), `fonts/`, `data/metricas-predefinidas.js` (catálogo de métricas), `plantilla/` y `ejemplos/` (datos ficticios). |
| `tools/` | `generate_intake_template.py` (réplica ficticia de la Plantilla de Ingreso), `generate-evaluation-example.mjs` (ejemplo de escalas) y `generate-prt-example.mjs` (ejemplo Cumple / No cumple con base 20), `generate_template.py` (ejemplos v1), `check-no-pii.mjs` (revisa que no haya datos personales). |
| `tests/` | Pruebas automáticas: `node --test tests/*.test.js` (hace falta Node; solo desarrollo). |
| `verificacion/` | Capturas, PDF y lista de comprobación de la última revisión (no se publica). |
| `openspec/` | Planificación del proyecto (no se publica). |

### Cambiar el catálogo de métricas

Editar `docs/data/metricas-predefinidas.js` (grupos, nombre y descripción de cada métrica y la escala por defecto; una métrica con `tipo: 'checklist'` se evalúa como Cumple / No cumple). Para otro curso o proyecto basta agregar un grupo nuevo; no hay que tocar el código. La propuesta original está en `Catalogo de metricas - propuesta.md`; el relator o el profesor deben validarla.

### Cambiar colores, tipografía o logo

Todo en `docs/css/theme.css`. El logo es `docs/img/logo-zcap.png` (barra superior y encabezado de cada informe impreso). El Brand Kit de ZCAP no está aplicado salvo el logo.

### Probar en el computador

- **Sin instalar nada:** abrir `docs/index.html` con doble clic (Chrome o Edge). Funciona sin Internet; el autoguardado hay que confirmarlo en cada equipo.
- **Con ejemplos:** desde un servidor local (`python -m http.server --directory docs`), abrir `http://127.0.0.1:8000/index.html?demo=evaluacion`, `?demo=prt` (checklist) o `?demo=ingreso`. Atajos de revisión: `&step=1..5`, `&view=alumnos`, `&pii=1`, `&print=todas`. (Desde `file://` el navegador no deja cargar los ejemplos: usa los enlaces de la pantalla inicial.)

### Demo publicada (datos ficticios)

Hay una demo pública en **https://ignaciosaher2-commits.github.io/zcap-dashboard-evaluacion-demo/** (repositorio `ignaciosaher2-commits/zcap-dashboard-evaluacion-demo`, GitHub Pages desde la rama `main`, carpeta `/docs`). Para mostrarla en un celular sin cargar archivos, abrir con datos ficticios:
- Curso PRT (Cumple / No cumple): `.../?demo=prt&step=4`
- Curso con escalas 1 a 7: `.../?demo=evaluacion&step=4`
- Pasos 1 a 5 con `&step=1` … `&step=5`, y `&view=alumnos` en el paso 5.

**No cargar datos reales en la demo:** la página no envía nada a ningún servidor, pero en un teléfono prestado el borrador local dejaría nombres en ese navegador. Para actualizar la demo después de cambiar el proyecto: `powershell -ExecutionPolicy Bypass -File toolspublish-demo.ps1` (revisa datos personales antes de publicar, copia docs/ a un repositorio local fuera de OneDrive y lo sube).

### Publicar en GitHub Pages (cuenta de la organización de ZCAP)

1. Crear la organización de ZCAP en GitHub, con **al menos dos propietarios** y verificación en dos pasos. No usar cuentas personales de una sola persona.
2. Crear un repositorio público con el contenido de esta carpeta (`docs/`, `tools/`, `tests/`, `README.md`, `.gitignore`). `openspec/`, `verificacion/` y `respaldo/` están en `.gitignore` y no deben subirse.
3. **Antes de cada publicación** ejecutar `node tools/check-no-pii.mjs`. Debe decir "Sin datos personales". Si lista algo, no publicar.
4. Settings → Pages → Source: rama principal, carpeta `/docs`.
5. Un dominio propio es opcional y necesita al equipo de TI de ZCAP.

### Respaldo y restauración

`respaldo/` contiene una copia comprimida del sitio. Guarda una copia en una carpeta de ZCAP (no personal). Para usarla sin Internet: descomprimir y abrir `index.html` con doble clic.

### Librerías y licencias

Ver `docs/vendor/LEEME-LIBRERIAS.txt`. El sitio no pide nada a otros dominios al abrirse.

### Datos de plataforma (Tutor LMS) y encuestas

Todavía no están implementados: dependen de ejemplos reales de los CSV de Tutor LMS y de las métricas que entregue TI.
