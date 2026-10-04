const SESSION_HEADERS_ = ['ID', 'Residente', 'Título', 'Programa', 'Tutor', 'Fecha', 'Estado', 'Carpeta ID'];
const INVITE_HEADERS_ = ['ID', 'Sesión ID', 'Jurado ID', 'Nombre', 'Revisión', 'Hash', 'Estado', 'Enlace individual'];
const EVALUATION_HEADERS_ = ['ID', 'Invitación ID', 'Sesión ID', 'Jurado ID', 'Revisión', 'Fecha envío', 'Estado', 'PDF ID', 'Nombre jurado', 'Total /100', 'SUB TOTAL 40% (1)', 'SUB TOTAL 40% (2)', 'SUB TOTAL 20%', 'PDF', 'Rúbrica', 'Datos JSON'];
function book_() {
  const id = PropertiesService.getScriptProperties().getProperty('BOOK_ID');
  if (!id) throw new Error('La aplicación todavía no está configurada. Contacte al coordinador.');
  return SpreadsheetApp.openById(id);
}
function rows_(name) {
  const sheet = book_().getSheetByName(name);
  return sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}
function sessions_() {
  return rows_('Sesiones').filter(r => r[0]).map(r => ({id: String(r[0]), resident: String(r[1]), title: String(r[2]), program: String(r[3]), tutor: String(r[4]), date: String(r[5]), status: String(r[6]), folderId: String(r[7])}));
}
function session_(id) {
  const value = sessions_().find(s => s.id === id);
  if (!value) throw new Error('Sesión no encontrada.');
  return value;
}
function invites_() {
  return rows_('Jurados').filter(r => r[0]).map(r => ({id: String(r[0]), sessionId: String(r[1]), jurorId: String(r[2]), name: String(r[3]), revision: Number(r[4]), hash: String(r[5]), status: String(r[6]), link: String(r[7])}));
}
function evaluations_() {
  const sheet = book_().getSheetByName('Evaluaciones');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const jsonColumn = headers.indexOf('Datos JSON');
  if (jsonColumn < 0) throw new Error('La hoja de evaluaciones no tiene columna Datos JSON.');
  return rows_('Evaluaciones').map((r, index) => r[0] ? {row: index + 2, id: String(r[0]), inviteId: String(r[1]), sessionId: String(r[2]), jurorId: String(r[3]), revision: Number(r[4]), createdAt: String(r[5]), status: String(r[6]), pdfId: String(r[7]), data: JSON.parse(String(r[jsonColumn]))} : null).filter(Boolean);
}
function evaluationFor_(inviteId) { return evaluations_().find(e => e.inviteId === inviteId); }
function evaluationRow_(e) {
  if (e.data.rubricVersion !== rubric_().version) throw new Error('La evaluación usa la rúbrica anterior. Cree una nueva revisión para la lista de cotejo.');
  return [e.id, e.inviteId, e.sessionId, e.jurorId, e.revision, e.createdAt, e.status, e.pdfId, e.data.evaluator, e.data.total]
    .concat(e.data.subtotals)
    .concat([e.pdfId ? 'https://drive.google.com/file/d/' + e.pdfId + '/view' : '', e.data.rubricVersion, JSON.stringify(e.data)])
    .map(rubric_().safeCell);
}
function appendEvaluation_(e) {
  ensureEvaluationSchema_();
  const sheet = book_().getSheetByName('Evaluaciones');
  sheet.appendRow(evaluationRow_(e));
  e.row = sheet.getLastRow();
  SpreadsheetApp.flush();
}
function ensureEvaluationSchema_() {
  const sheet = book_().getSheetByName('Evaluaciones');
  const width = Math.max(sheet.getLastColumn(), EVALUATION_HEADERS_.length);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  if (headers[9] === 'Total /100' && headers[15] === 'Datos JSON') return;
  if (sheet.getLastRow() > 1) {
    const stamp = Utilities.formatDate(new Date(), 'America/Managua', 'yyyyMMdd-HHmmss');
    sheet.copyTo(book_()).setName('Archivo rúbrica anterior ' + stamp);
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 1, EVALUATION_HEADERS_.length).setValues([EVALUATION_HEADERS_]);
  sheet.showColumns(1, width); sheet.hideColumns(16);
}
function updateEvaluation_(e) {
  book_().getSheetByName('Evaluaciones').getRange(e.row, 1, 1, EVALUATION_HEADERS_.length).setValues([evaluationRow_(e)]);
  SpreadsheetApp.flush();
}
function refreshSummary_() {
  const sheet = book_().getSheetByName('Resumen');
  const evaluations = evaluations_();
  const invites = invites_();
  const headers = ['Sesión ID', 'Residente', 'Fecha', 'Jurados esperados', 'Recibidos', 'Pendientes']
    .concat(rubric_().criteria.map(c => 'Promedio ' + c.title)).concat(['Promedio /100']);
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  const values = sessions_().map(s => {
    const expected = new Set(invites.filter(i => i.sessionId === s.id).map(i => i.jurorId)).size;
    const summary = rubric_().summarize(evaluations.filter(e => e.sessionId === s.id), expected);
    return [s.id, s.resident, s.date, expected, summary.received, summary.pending]
      .concat(rubric_().criteria.map(c => summary.averages[c.id] === null ? '' : summary.averages[c.id]))
      .concat([summary.note === null ? '' : summary.note]).map(rubric_().safeCell);
  });
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (values.length) sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  styleSheet_(sheet, headers.length);
  sheet.getRange(2, 7, Math.max(1, values.length), headers.length - 6).setNumberFormat('0.00');
}
function styleSheet_(sheet, width) {
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setFontColor('#ffffff').setBackground('#123a3b').setFontWeight('bold').setWrap(true);
  sheet.setRowHeight(1, 46);
  sheet.setColumnWidths(1, width, 150);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, width).setVerticalAlignment('top').setWrap(true);
}
