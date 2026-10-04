function exportBlob_(bookId, type) {
  const url = type === 'pdf'
    ? 'https://docs.google.com/spreadsheets/d/' + bookId + '/export?format=pdf&size=A4&portrait=true&fitw=true&sheetnames=false&printtitle=false&pagenumbers=true&gridlines=false&fzr=false&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5'
    : 'https://www.googleapis.com/drive/v3/files/' + bookId + '/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet';
  SpreadsheetApp.flush();
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = UrlFetchApp.fetch(url, {headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}, muteHttpExceptions: true});
    if (response.getResponseCode() === 200) return response.getBlob();
    if (![429, 500, 502, 503].includes(response.getResponseCode())) break;
    Utilities.sleep(500 * Math.pow(2, attempt));
  }
  throw new Error('No fue posible exportar el archivo. Código ' + response.getResponseCode());
}
function chunks_(text) {
  const result = [];
  String(text || 'Sin observaciones.').split(/\r?\n/).forEach(line => {
    if (!line.length) { result.push(''); return; }
    let rest = line;
    while (rest.length > 340) {
      let cut = rest.lastIndexOf(' ', 340); if (cut < 170) cut = 340;
      result.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart();
    }
    result.push(rest);
  });
  return result;
}
function createPdf_(evaluation, session) {
  const folder = DriveApp.getFolderById(session.folderId);
  const name = 'Evaluacion_' + evaluation.id + '_v' + evaluation.revision + '.pdf';
  const existing = folder.getFilesByName(name);
  if (existing.hasNext()) return existing.next().getId();
  const props = PropertiesService.getScriptProperties();
  const tempKey = 'PDF_TEMP_' + evaluation.id;
  // Recover a scratch spreadsheet left by a terminated execution.
  const previous = props.getProperty(tempKey);
  if (previous) { try { DriveApp.getFileById(previous).setTrashed(true); } catch (_) {} }
  const scratch = SpreadsheetApp.create('Temporal PDF ' + evaluation.id);
  props.setProperty(tempKey, scratch.getId());
  try {
    DriveApp.getFileById(scratch.getId()).moveTo(folder);
    const sheet = scratch.getSheets()[0]; sheet.setName('Evaluación');
    sheet.setColumnWidth(1, 440); sheet.setColumnWidth(2, 45); sheet.setColumnWidth(3, 36); sheet.setColumnWidth(4, 36); sheet.setColumnWidth(5, 55);
    let row = 0;
    function line(text, points, heading) {
      row++;
      const range = sheet.getRange(row, 1, 1, 5);
      if (points === undefined) range.merge().setValue(rubric_().safeCell(text));
      else { sheet.getRange(row, 1, 1, 4).merge().setValue(rubric_().safeCell(text)); sheet.getRange(row, 5).setValue(points); }
      range.setWrap(true).setVerticalAlignment('top').setFontFamily('Arial').setFontSize(10).setFontColor('#172d34');
      const height = Math.max(27, Math.ceil(String(text).length / (points === undefined ? 90 : 76)) * 15 + 12);
      sheet.setRowHeight(row, height);
      if (heading) range.setBackground('#e6f3ef').setFontWeight('bold');
    }
    line(rubric_().title, undefined, true);
    line('Residente: ' + session.resident);
    line('Título: ' + session.title);
    line('Programa: ' + session.program + ' | Tutor: ' + session.tutor);
    line('Revisión: ' + session.date + ' | Jurado: ' + evaluation.data.evaluator);
    line('Enviado: ' + Utilities.formatDate(new Date(evaluation.createdAt), 'America/Managua', 'yyyy-MM-dd HH:mm') + ' (Managua) | Versión: ' + evaluation.revision);
    function tableRow(values, heading) {
      row++;
      const range = sheet.getRange(row, 1, 1, 5);
      range.setValues([values.map(rubric_().safeCell)]).setWrap(true).setVerticalAlignment('center').setFontFamily('Arial').setFontSize(9).setBorder(true, true, true, true, true, true, '#cbd9d2', SpreadsheetApp.BorderStyle.SOLID);
      sheet.getRange(row, 2, 1, 4).setHorizontalAlignment('center');
      sheet.setRowHeight(row, Math.max(24, Math.ceil(String(values[0]).length / 75) * 13 + 10));
      if (heading) range.setBackground('#e6f3ef').setFontWeight('bold');
    }
    tableRow(['INDICADOR', '%', 'SI', 'NO', 'NOTA'], true);
    rubric_().criteria.forEach((c, index) => {
      tableRow([c.title, c.max + '%', evaluation.data.checks[c.id] === 'SI' ? 'X' : '', evaluation.data.checks[c.id] === 'NO' ? 'X' : '', evaluation.data.scores[c.id]], false);
      const next = rubric_().criteria[index + 1];
      if (!next || next.group !== c.group) tableRow(['SUB TOTAL', rubric_().groupMax[c.group] + '%', '', '', evaluation.data.subtotals[c.group]], true);
    });
    tableRow(['TOTAL', '100%', '', '', evaluation.data.total], true);
    line(''); line('');
    line('_______________________________                _______________________________');
    line('Firma y sello del Coordinador Docente                Firma y sello del Jefe de Servicio');
    if (evaluation.data.observations) {
      line('Observaciones del jurado (campo complementario)', undefined, true);
      chunks_(evaluation.data.observations).forEach(t => line(t));
    }
    line('El jurado confirmó que esta evaluación es de su autoría. Identificación mediante nombre y enlace individual; sin firma manuscrita.');
    line('Identificador: ' + evaluation.id + ' | Rúbrica: ' + evaluation.data.rubricVersion);
    const blob = exportBlob_(scratch.getId(), 'pdf').setName(name);
    return folder.createFile(blob).getId();
  } finally {
    try { DriveApp.getFileById(scratch.getId()).setTrashed(true); props.deleteProperty(tempKey); }
    catch (error) { console.error('Limpieza PDF pendiente: ' + error.message); }
  }
}
function createExcel_(session) {
  const all = evaluations_().filter(e => e.sessionId === session.id);
  const active = rubric_().latest(all);
  const expected = new Set(invites_().filter(i => i.sessionId === session.id).map(i => i.jurorId)).size;
  const summary = rubric_().summarize(all, expected);
  const temp = SpreadsheetApp.create('Temporal Excel ' + session.id);
  try {
    const scores = temp.getSheets()[0]; scores.setName('Puntajes');
    const headers = ['Jurado', 'Revisión', 'Fecha envío'].concat(rubric_().criteria.map(c => c.title)).concat(['SUB TOTAL 40% (1)', 'SUB TOTAL 40% (2)', 'SUB TOTAL 20%', 'TOTAL /100', 'PDF']);
    if (scores.getMaxColumns() < headers.length) scores.insertColumnsAfter(scores.getMaxColumns(), headers.length - scores.getMaxColumns());
    scores.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (active.length) scores.getRange(2, 1, active.length, headers.length).setValues(active.map(e => [e.data.evaluator, e.revision, e.createdAt].concat(rubric_().criteria.map(c => e.data.scores[c.id])).concat(e.data.subtotals).concat([e.data.total, 'https://drive.google.com/file/d/' + e.pdfId + '/view']).map(rubric_().safeCell)));
    scores.getRange(2, 4, Math.max(1, active.length), headers.length - 4).setNumberFormat('0.00'); styleSheet_(scores, headers.length);
    const checklist = temp.insertSheet('Lista de cotejo');
    const checklistRows = [['Jurado', 'Revisión', 'INDICADOR', '%', 'SI', 'NO', 'NOTA']];
    active.forEach(e => {
      rubric_().criteria.forEach((c, index) => {
        checklistRows.push([e.data.evaluator, e.revision, c.title, c.max + '%', e.data.checks[c.id] === 'SI' ? 'X' : '', e.data.checks[c.id] === 'NO' ? 'X' : '', e.data.scores[c.id]]);
        const next = rubric_().criteria[index + 1];
        if (!next || next.group !== c.group) checklistRows.push([e.data.evaluator, e.revision, 'SUB TOTAL', rubric_().groupMax[c.group] + '%', '', '', e.data.subtotals[c.group]]);
      });
      checklistRows.push([e.data.evaluator, e.revision, 'TOTAL', '100%', '', '', e.data.total]);
    });
    checklist.getRange(1, 1, checklistRows.length, 7).setValues(checklistRows.map(r => r.map(rubric_().safeCell))); styleSheet_(checklist, 7); checklist.setColumnWidth(3, 500);
    const info = temp.insertSheet('Resumen');
    const rows = [['Concepto', 'Valor'], ['Residente', session.resident], ['Protocolo', session.title], ['Programa', session.program], ['Tutor', session.tutor], ['Fecha revisión', session.date], ['Jurados esperados', expected], ['Recibidos', summary.received], ['Pendientes', summary.pending], ['Promedio /100', summary.note === null ? '' : summary.note], ['Cálculo', 'Suma directa de 25 notas, con subtotales de 40, 40 y 20. Promedio con igual peso por jurado.'], ['Rúbrica', rubric_().title]].concat(rubric_().criteria.map(c => ['Promedio ' + c.title, summary.averages[c.id] === null ? '' : summary.averages[c.id]]));
    info.getRange(1, 1, rows.length, 2).setValues(rows.map(r => r.map(rubric_().safeCell))); styleSheet_(info, 2); info.setColumnWidth(2, 420);
    const observations = temp.insertSheet('Observaciones');
    const detailHeaders = ['Jurado', 'Revisión', 'Sección', 'Comentario'];
    const detail = [];
    active.forEach(e => {
      detail.push([e.data.evaluator, e.revision, 'Observaciones complementarias', e.data.observations]);
    });
    observations.getRange(1, 1, 1, 4).setValues([detailHeaders]);
    if (detail.length) observations.getRange(2, 1, detail.length, 4).setValues(detail.map(r => r.map(rubric_().safeCell)));
    styleSheet_(observations, 4); observations.setColumnWidth(4, 500);
    const history = temp.insertSheet('Historial');
    const historyRows = [['ID', 'Jurado', 'Revisión', 'Estado', 'Fecha envío', 'TOTAL /100', 'Rúbrica', 'PDF']].concat(all.map(e => [e.id, e.data.evaluator, e.revision, e.status, e.createdAt, e.data.total, e.data.rubricVersion, e.pdfId ? 'https://drive.google.com/file/d/' + e.pdfId + '/view' : '']));
    history.getRange(1, 1, historyRows.length, 8).setValues(historyRows.map(r => r.map(rubric_().safeCell))); styleSheet_(history, 8);
    const blob = exportBlob_(temp.getId(), 'xlsx').setName('Consolidado.xlsx');
    const folder = DriveApp.getFolderById(session.folderId);
    // Create the replacement first so a failed export never removes the previous Excel.
    const previous = []; const iterator = folder.getFilesByName('Consolidado.xlsx');
    while (iterator.hasNext()) previous.push(iterator.next());
    const file = folder.createFile(blob);
    previous.forEach(old => old.setTrashed(true));
    return file;
  } finally { DriveApp.getFileById(temp.getId()).setTrashed(true); }
}
