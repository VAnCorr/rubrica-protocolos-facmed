function onOpen() {
  SpreadsheetApp.getUi().createMenu('Protocolos FACMED')
    .addItem('1. Configurar carpetas y hojas', 'setup_')
    .addItem('2. Configurar URL publicada', 'configureUrl_')
    .addItem('3. Crear sesión', 'createSession_')
    .addItem('4. Crear enlace de jurado', 'createInvite_')
    .addSeparator()
    .addItem('Habilitar corrección del jurado seleccionado', 'reopenInvite_')
    .addItem('Revocar enlace del jurado seleccionado', 'revokeInvite_')
    .addItem('Cerrar sesión seleccionada', 'closeSession_')
    .addItem('Reintentar PDF pendientes', 'retryPdfs_')
    .addItem('Actualizar resumen', 'refreshSummary_')
    .addItem('Exportar sesión seleccionada a Excel', 'exportSession_')
    .addToUi();
}
function assertOwner_() {
  const owner = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL');
  const active = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  if (!active || active !== effective || (owner && active !== owner)) throw new Error('Esta operación requiere la cuenta del coordinador.');
}
function prompt_(title, message) {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
  return result.getSelectedButton() === ui.Button.OK ? result.getResponseText().trim() : null;
}
function setup_() {
  assertOwner_();
  const props = PropertiesService.getScriptProperties();
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('Instale este proyecto desde Extensiones → Apps Script de la hoja de cálculo.');
  props.setProperties({BOOK_ID: book.getId(), OWNER_EMAIL: Session.getActiveUser().getEmail()});
  let root;
  if (props.getProperty('ROOT_FOLDER_ID')) root = DriveApp.getFolderById(props.getProperty('ROOT_FOLDER_ID'));
  else {
    root = DriveApp.createFolder('Evaluaciones de protocolos FACMED');
    props.setProperty('ROOT_FOLDER_ID', root.getId());
  }
  if (!props.getProperty('SESSIONS_FOLDER_ID')) props.setProperty('SESSIONS_FOLDER_ID', root.createFolder('Sesiones').getId());
  DriveApp.getFileById(book.getId()).moveTo(root);
  [['Sesiones', SESSION_HEADERS_], ['Jurados', INVITE_HEADERS_], ['Evaluaciones', EVALUATION_HEADERS_], ['Resumen', ['Sin sesiones todavía']]].forEach(([name, headers]) => {
    let sheet = book.getSheetByName(name);
    if (!sheet) sheet = book.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleSheet_(sheet, headers.length);
  });
  book.setSpreadsheetTimeZone('America/Managua');
  ensureEvaluationSchema_();
  book.getSheetByName('Evaluaciones').hideColumns(16);
  book.getSheetByName('Evaluaciones').getRange('J:M').setNumberFormat('0.00');
  book.getSheetByName('Jurados').hideColumns(6);
  refreshSummary_();
  SpreadsheetApp.getUi().alert('Configurado', 'La carpeta y las hojas están listas. Publique la aplicación web y configure su URL desde el menú.', SpreadsheetApp.getUi().ButtonSet.OK);
}
function configureUrl_() {
  assertOwner_();
  const url = prompt_('URL de Apps Script', 'Pegue la URL publicada que termina en /exec.');
  if (url === null) return;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url)) throw new Error('Use la URL publicada de Apps Script, terminada en /exec.');
  PropertiesService.getScriptProperties().setProperties({WEB_APP_URL: url, PAGES_URL: 'https://vancorr.github.io/rubrica-protocolos-facmed/'});
  SpreadsheetApp.getUi().alert('URL configurada. Ya puede crear sesiones y enlaces.');
}
function createSession_() {
  assertOwner_();
  const resident = prompt_('Nueva sesión', 'Nombre completo del residente:'); if (!resident) return;
  const title = prompt_('Protocolo', 'Título del protocolo:'); if (!title) return;
  const program = prompt_('Programa', 'Especialidad o programa:'); if (!program) return;
  const tutor = prompt_('Tutor', 'Nombre del tutor:'); if (!tutor) return;
  const date = prompt_('Fecha', 'Fecha de revisión en formato AAAA-MM-DD:'); if (!date) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Fecha inválida.');
  [resident, title, program, tutor].forEach(v => { if (v.length > 500) throw new Error('Los datos de la sesión son demasiado largos.'); });
  const id = Utilities.getUuid();
  const parent = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('SESSIONS_FOLDER_ID'));
  const folder = parent.createFolder(date + ' — ' + resident.slice(0, 80) + ' — ' + id.slice(0, 8));
  const sheet = book_().getSheetByName('Sesiones');
  sheet.appendRow([id, resident, title, program, tutor, date, 'OPEN', folder.getId()].map(rubric_().safeCell));
  sheet.activate().setActiveRange(sheet.getRange(sheet.getLastRow(), 1));
  refreshSummary_();
  SpreadsheetApp.getUi().alert('Sesión creada. Con esta fila seleccionada, cree los enlaces de sus jurados.');
}
function selectedSession_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  if (!['Sesiones', 'Resumen', 'Jurados', 'Evaluaciones'].includes(sheet.getName()) || row < 2) throw new Error('Seleccione una fila de sesión, jurado o evaluación.');
  const col = sheet.getName() === 'Jurados' ? 2 : sheet.getName() === 'Evaluaciones' ? 3 : 1;
  return session_(String(sheet.getRange(row, col).getValue()));
}
function selectedInvite_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  if (sheet.getName() !== 'Jurados' || row < 2) throw new Error('Seleccione una fila en la pestaña Jurados.');
  const id = String(sheet.getRange(row, 1).getValue());
  const invite = invites_().find(i => i.id === id);
  if (!invite) throw new Error('Jurado no encontrado.');
  return Object.assign(invite, {row});
}
function newInvite_(session, name, jurorId, revision) {
  const props = PropertiesService.getScriptProperties();
  const appUrl = props.getProperty('WEB_APP_URL');
  if (!appUrl) throw new Error('Configure la URL publicada antes de generar enlaces.');
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const id = Utilities.getUuid();
  const link = props.getProperty('PAGES_URL') + '#token=' + token;
  const sheet = book_().getSheetByName('Jurados');
  sheet.appendRow([id, session.id, jurorId || Utilities.getUuid(), name, revision || 1, hash_(token), 'ACTIVE', link].map(rubric_().safeCell));
  sheet.activate().setActiveRange(sheet.getRange(sheet.getLastRow(), 8));
  return link;
}
function createInvite_() {
  assertOwner_();
  const session = selectedSession_();
  if (session.status !== 'OPEN') throw new Error('La sesión está cerrada.');
  const name = prompt_('Jurado', 'Nombre completo del jurado:'); if (!name) return;
  if (name.length > 150) throw new Error('Nombre demasiado largo.');
  if (invites_().some(i => i.sessionId === session.id && i.name.toLowerCase() === name.toLowerCase())) throw new Error('Este nombre ya existe en la sesión. Para corregir, use Habilitar corrección.');
  newInvite_(session, name);
  refreshSummary_();
  SpreadsheetApp.getUi().alert('Enlace creado en la columna H. Compártalo únicamente con ese jurado.');
}
function reopenInvite_() {
  assertOwner_();
  const invite = selectedInvite_();
  const session = session_(invite.sessionId);
  if (session.status !== 'OPEN') throw new Error('La sesión está cerrada. Cambie su estado a OPEN en Sesiones si necesita reabrirla.');
  const max = Math.max.apply(null, invites_().filter(i => i.sessionId === invite.sessionId && i.jurorId === invite.jurorId).map(i => i.revision));
  if (invite.revision !== max) throw new Error('Seleccione la revisión más reciente de este jurado.');
  if (SpreadsheetApp.getUi().alert('Nueva revisión', 'Se revocará el enlace anterior y se conservará su evaluación. ¿Crear una nueva revisión?', SpreadsheetApp.getUi().ButtonSet.YES_NO) !== SpreadsheetApp.getUi().Button.YES) return;
  newInvite_(session, invite.name, invite.jurorId, max + 1);
  book_().getSheetByName('Jurados').getRange(invite.row, 7).setValue('REVOKED');
}
function revokeInvite_() {
  assertOwner_();
  const invite = selectedInvite_();
  if (SpreadsheetApp.getUi().alert('Revocar enlace', '¿Revocar el enlace de ' + invite.name + '? Su evaluación se conserva.', SpreadsheetApp.getUi().ButtonSet.YES_NO) !== SpreadsheetApp.getUi().Button.YES) return;
  book_().getSheetByName('Jurados').getRange(invite.row, 7).setValue('REVOKED');
}
function closeSession_() {
  assertOwner_();
  const session = selectedSession_();
  if (SpreadsheetApp.getUi().alert('Cerrar sesión', '¿Cerrar la revisión de ' + session.resident + '? Ya no se aceptarán nuevos envíos.', SpreadsheetApp.getUi().ButtonSet.YES_NO) !== SpreadsheetApp.getUi().Button.YES) return;
  const sheet = book_().getSheetByName('Sesiones');
  const row = sessions_().findIndex(s => s.id === session.id) + 2;
  sheet.getRange(row, 7).setValue('CLOSED');
}
function retryPdfs_() {
  assertOwner_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  let count = 0;
  try {
    evaluations_().filter(e => e.status === 'PENDING_PDF' && e.data.rubricVersion === rubric_().version).slice(0, 10).forEach(e => {
      try { e.pdfId = createPdf_(e, session_(e.sessionId)); e.status = 'COMPLETE'; updateEvaluation_(e); count++; }
      catch (error) { console.error('PDF pendiente ' + e.id + ': ' + error.message); }
    });
    refreshSummary_();
  } finally { lock.releaseLock(); }
  SpreadsheetApp.getUi().alert(count + ' PDF recuperados. Los que sigan pendientes pueden reintentarse.');
}
function exportSession_() {
  assertOwner_();
  const session = selectedSession_();
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  let file;
  try { refreshSummary_(); file = createExcel_(session); }
  finally { lock.releaseLock(); }
  SpreadsheetApp.getUi().alert('Excel guardado', 'Consolidado.xlsx está en la carpeta de la sesión.\n' + file.getUrl(), SpreadsheetApp.getUi().ButtonSet.OK);
}
