# Evaluación de protocolos FACMED

Aplicación para que cada jurado evalúe un protocolo sin imprimir la rúbrica. GitHub Pages ofrece la entrada; Google Apps Script sirve el formulario, registra los puntajes en Sheets y guarda automáticamente un PDF privado en el Drive del coordinador.

## Estado y pruebas

El proyecto incluye la aplicación, servicio, administración y exportación a Excel. La publicación requiere una sesión de GitHub y una autorización de Google Apps Script con la cuenta propietaria. La URL de la aplicación publicada debe agregarse a `docs/config.json`. Sin esa configuración, Pages informa que la aplicación está pendiente de activación.

La vista local es una **demostración**: no guarda en Google Drive ni genera PDF. Para probarla:

```powershell
npm test
npm run build
npm run preview
```

Abrir `http://127.0.0.1:4173`. No se necesitan dependencias de npm. Node 22 o superior.

## Lista de cotejo del protocolo

Fuente correcta: documento local **«Formato de Registro de proyectos investigación 2026.docx»**, sección **LISTA DE COTEJO PARA PROTOCOLO DE INVESTIGACIÓN**. Se reproducen los 25 indicadores, textos, orden y pesos del Word, con sus columnas **INDICADOR, %, SI, NO y NOTA**, subtotales **40%, 40%, 20%** y **TOTAL 100%**. No se incluyen el formulario de registro, la lista del informe final ni el formato de avances.

La nota es la suma directa de las 25 notas, sin normalización ni categorías de desempeño. La selección SI/NO y la nota son independientes: el documento no establece una regla automática que relacione esas columnas. La nota permite decimales entre cero y el porcentaje de cada indicador. Las observaciones digitales son un campo complementario claramente separado de la tabla original.

`reference/protocol-source.json` contiene únicamente la tabla del protocolo y el hash del archivo fuente. `scripts/read-protocol-source.ps1` vuelve a extraerla del Word sin modificarlo; `scripts/sync-rubric.cjs` genera el contenido de la aplicación desde esa extracción. Las pruebas comprueban la coincidencia de cada texto, peso y subtotal.

## Instalación en Google

1. Con la cuenta del coordinador, crear una hoja nueva llamada **Consolidado de evaluaciones**. Mantenerla privada.
2. Abrir **Extensiones → Apps Script**. Nombrar el proyecto **Protocolos FACMED**.
3. Ejecutar `npm run build`. Reemplazar el contenido inicial de `Code.gs` con `output/Code.gs`, que combina los cuatro archivos del servidor. No agregar además los archivos `.gs` individuales: se duplicarían las funciones.
4. Crear cuatro archivos HTML con estos nombres y contenidos de `apps-script`: **Index**, **Styles**, **Rubric**, **Client**. Agregar también el manifiesto `appsscript.json`.
5. En Configuración del proyecto, activar **Mostrar el archivo de manifiesto appsscript.json** y reemplazar su contenido con el incluido en el proyecto.
6. Guardar y ejecutar `onOpen` desde el editor. Volver a la hoja; aparece el menú **Protocolos FACMED**.
7. En el menú, ejecutar **1. Configurar carpetas y hojas**. Autorizar los permisos de Google con la cuenta propietaria. Si Google muestra un aviso de aplicación no verificada, revisar que sea este proyecto propio antes de continuar. No entregar contraseñas ni tokens a nadie.
8. En Apps Script, elegir **Implementar → Nueva implementación → Aplicación web**. Ejecutar como **Yo** y permitir acceso a **Cualquier persona**. Si esa opción no está disponible, detener la puesta en servicio y revisar las restricciones de la cuenta; los enlaces sin inicio de sesión dependen de ella.
9. Copiar la URL publicada terminada en `/exec`. En Sheets ejecutar **2. Configurar URL publicada** y pegarla.
10. Agregar esa misma URL a `docs/config.json`, en `appsScriptUrl`, y publicar la actualización en GitHub.

No activar «Publicar en la Web» en Sheets ni compartir las carpetas con «Cualquier persona». El formulario descarga el PDF mediante el servidor después de validar el enlace; no requiere hacer público el archivo.

## Instalación en GitHub Pages

1. Crear `VAnCorr/rubrica-protocolos-facmed`, público, sin datos de residentes ni jurados.
2. Subir los archivos de este proyecto, excluyendo `output`, `private`, `.clasp.json`, credenciales y el documento Word original.
3. En **Settings → Pages → Build and deployment**, seleccionar **GitHub Actions**.
4. Ejecutar o esperar el flujo **Publicar GitHub Pages**. La publicación depende de que pasen las pruebas.
5. Comprobar la URL devuelta por el despliegue. El proyecto está configurado para `https://vancorr.github.io/rubrica-protocolos-facmed/`.

Si cambia el repositorio, ajustar `PAGES_URL` en las propiedades del proyecto Apps Script. `configureUrl_` utiliza el repositorio acordado por defecto.

## Preparar una revisión

1. En Sheets, **3. Crear sesión**. Completar residente, título, programa, tutor y fecha AAAA-MM-DD.
2. Con la fila de la sesión seleccionada, **4. Crear enlace de jurado**. Repetir para cada evaluador. Desde una fila de Jurados también puede crear el siguiente jurado de esa misma sesión.
3. Copiar el enlace de la columna H de **Jurados** y compartirlo directamente con su destinatario.
4. Verificar que cada nombre corresponde al jurado. Quien posea un enlace puede actuar con esa identidad; no es una autenticación de la persona ni una firma digital certificada.
5. Tras recibir las evaluaciones, revisar **Resumen**. Cada pendiente se cuenta como pendiente, nunca como cero.
6. Seleccionar una fila de la sesión y elegir **Exportar sesión seleccionada a Excel**. Se guarda `Consolidado.xlsx` en su carpeta; volver a exportar para actualizarlo.
7. Cerrar la sesión desde el menú cuando termine la revisión. Los jurados pueden seguir descargando evaluaciones completadas con enlaces activos.

### Correcciones y fallos

- **Corregir:** seleccionar la revisión más reciente del jurado en **Jurados** y elegir **Habilitar corrección**. Se crea otro enlace y se revoca el anterior. El historial y PDF previos se conservan. El resumen usa la última revisión completada; mientras la nueva esté pendiente, mantiene la anterior.
- **Revocar:** seleccionar el jurado y elegir **Revocar enlace**. La evaluación existente se conserva.
- **PDF pendiente:** el jurado puede reintentar con el mismo enlace mientras la sesión esté abierta. El coordinador puede usar **Reintentar PDF pendientes**, incluso tras cerrar la sesión. Procesa hasta diez pendientes por ejecución.
- **Respuesta perdida:** abrir de nuevo el mismo enlace para consultar el estado. El servidor mantiene una sola evaluación por invitación.
- **Conexión perdida:** el borrador se conserva en el navegador cuando el almacenamiento local está disponible. No existe sincronización de borradores entre dispositivos.
- **Reabrir sesión:** cambiar su estado a `OPEN` en la pestaña Sesiones. No editar manualmente identificadores, hashes, JSON ni puntajes ya enviados.

## Organización de Drive

```text
Evaluaciones de protocolos FACMED/
  Consolidado de evaluaciones
  Sesiones/
    AAAA-MM-DD — Residente — ID/
      Evaluacion_ID_v1.pdf
      Consolidado.xlsx
```

Las hojas **Sesiones**, **Jurados**, **Evaluaciones** y **Resumen** son privadas. **Jurados** contiene los enlaces de acceso: no compartir el libro completo con evaluadores. El Excel exportado contiene Puntajes, Lista de cotejo, Resumen, Observaciones e Historial; no incluye hashes ni enlaces de acceso de jurados. La pestaña Lista de cotejo reproduce los 25 indicadores, SI/NO, notas y subtotales de cada jurado.

Si ya hay evaluaciones de la versión anterior, al configurar la nueva se conserva una copia de la hoja antigua con el nombre **Archivo rúbrica anterior…**. El resumen no mezcla las dos rúbricas. Antes de volver a usar un enlace ya evaluado, crear una nueva revisión para ese jurado. No se recalculan los puntajes anteriores como si correspondieran a los 25 indicadores.

## Ensayo obligatorio antes de compartir enlaces reales

- Crear una sesión ficticia y dos jurados; probar con el navegador de un celular sin sesión de Google.
- Marcar SI en los 25 indicadores, asignar los máximos y verificar 100/100 con subtotales 40/40/20 en formulario, Sheets y PDF. Con la mitad de cada máximo, verificar 50/100 y subtotales 20/20/10.
- Confirmar que una nota vacía o un SI/NO sin marcar impiden enviar y cero sí es una nota válida.
- Probar reenvío, enlace inválido, cierre de sesión y dos envíos simultáneos.
- Abrir el PDF desde Drive y descargarlo desde el formulario. Revisar acentos, texto largo, páginas y legibilidad.
- Exportar y abrir el `.xlsx` en Excel; contrastar sus notas y promedios con Sheets.
- Marcar la sesión ficticia como cerrada y mantenerla separada de las sesiones reales.

## Actualizaciones

Tras modificar Apps Script, guardar y actualizar la implementación existente con una **nueva versión**; conservar la URL `/exec`. Actualizar Pages mediante un commit. Las pruebas locales simulan servicios de Google y no sustituyen el ensayo real de permisos, cuotas, formato PDF y descarga en celular.

No se utiliza Gmail ni se envían mensajes automáticamente. La cuenta propietaria debe autorizar acceso a Drive/Sheets y creación de archivos; el servidor nunca entrega su token OAuth al navegador.
