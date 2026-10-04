const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('PDF conserva los 25 indicadores y columnas SI, NO, NOTA con subtotales de la fuente', () => {
  const cells = new Map(), props = new Map();
  const chain = new Proxy({}, {get: (_, name) => {
    if (name === 'setValues') return values => { throw new Error('Use range with location'); };
    return () => chain;
  }});
  const sheet = {
    setName() {}, setColumnWidth() {}, setRowHeight() {},
    getRange(row, col, height = 1, width = 1) {
      const range = new Proxy({}, {get: (_, name) => {
        if (name === 'setValues') return values => { values.forEach((line, y) => line.forEach((value, x) => cells.set((row + y) + ':' + (col + x), value))); return range; };
        if (name === 'setValue') return value => { cells.set(row + ':' + col, value); return range; };
        return () => range;
      }});
      return range;
    }
  };
  const folder = {getFilesByName: () => ({hasNext: () => false}), createFile: () => ({getId: () => 'pdf-id'})};
  const ctx = {
    console,
    DriveApp: {getFolderById: () => folder, getFileById: () => ({moveTo() {}, setTrashed() {}})},
    PropertiesService: {getScriptProperties: () => ({getProperty: key => props.get(key), setProperty: (key, value) => props.set(key, value), deleteProperty: key => props.delete(key)})},
    SpreadsheetApp: {create: () => ({getId: () => 'temp-id', getSheets: () => [sheet]}), BorderStyle: {SOLID: 'solid'}},
    Utilities: {formatDate: () => '2026-10-06 10:00'}
  };
  vm.createContext(ctx);
  const read = name => fs.readFileSync(path.join(__dirname, '../apps-script', name), 'utf8');
  vm.runInContext(read('Rubric.html').replace(/<\/?script>/g, '') + '\n' + read('Pdf.gs'), ctx);
  ctx.rubric_ = () => ctx.Rubric; ctx.exportBlob_ = () => ({setName() { return this; }});
  const payload = {evaluator: 'Jurado', confirmed: true, scores: Object.fromEntries(ctx.Rubric.criteria.map(c => [c.id, c.max])), checks: Object.fromEntries(ctx.Rubric.criteria.map((c, i) => [c.id, i % 2 ? 'NO' : 'SI']))};
  const evaluation = {id: 'e', revision: 1, createdAt: '2026-10-06T16:00:00Z', data: ctx.Rubric.validate(payload)};
  assert.equal(ctx.createPdf_(evaluation, {folderId: 'f', resident: 'R', title: 'T', program: 'P', tutor: 'Tu', date: '2026-10-06'}), 'pdf-id');
  const rowNumbers = [...new Set([...cells.keys()].map(k => Number(k.split(':')[0])))].sort((a,b) => a-b);
  const outputRows = rowNumbers.map(row => Array.from({length: 5}, (_, col) => cells.get(row + ':' + (col + 1)) ?? ''));
  const headerIndex = outputRows.findIndex(row => row[0] === 'INDICADOR');
  const table = outputRows.slice(headerIndex, headerIndex + 30);
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../reference/protocol-source.json'), 'utf8'));
  assert.equal(table.length, source.rows.length);
  source.rows.forEach((row, i) => { assert.equal(table[i][0], row[0]); assert.equal(table[i][1], row[1]); });
  let criterionIndex = 0;
  table.slice(1).forEach(row => {
    if (row[0] === 'SUB TOTAL' || row[0] === 'TOTAL') return;
    assert.equal(row[2], criterionIndex % 2 ? '' : 'X'); assert.equal(row[3], criterionIndex % 2 ? 'X' : ''); criterionIndex++;
  });
  assert.equal(table.at(-1)[4], 100);
  assert.deepEqual(table.filter(row => row[0] === 'SUB TOTAL').map(row => row[4]), [40,40,20]);
});
