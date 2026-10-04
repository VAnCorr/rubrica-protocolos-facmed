const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '../apps-script/Rubric.html'), 'utf8').replace(/<\/?script>/g, '');
const sandbox = {}; vm.createContext(sandbox); vm.runInContext(script, sandbox);
const R = sandbox.Rubric;
const scores = factor => Object.fromEntries(R.criteria.map(c => [c.id, c.max * factor]));
test('Los 25 indicadores suman 100 con subtotales 40, 40, 20', () => {
  assert.equal(R.criteria.length, 25);
  assert.equal(R.calculate(scores(1)).total, 100);
  assert.equal(R.calculate(scores(1)).note, 100);
  assert.equal(R.calculate(scores(.5)).note, 50);
  assert.equal(R.calculate(scores(0)).total, 0);
  assert.deepEqual(Array.from(R.calculate(scores(1)).subtotals), [40, 40, 20]);
  assert.deepEqual(Array.from(R.calculate(scores(.5)).subtotals), [20, 20, 10]);
});
test('Rechaza vacíos, cadenas, negativos y excesos; acepta notas decimales', () => {
  for (const invalid of [null, undefined, '', '2', -1, 5.5, NaN, Infinity]) assert.throws(() => R.calculate({...scores(1), problema: invalid}));
  assert.doesNotThrow(() => R.calculate({...scores(1), problema: .25}));
});
test('Texto, orden, porcentajes y subtotales coinciden con la tabla fuente del Word', () => {
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../reference/protocol-source.json'), 'utf8'));
  assert.equal(R.title, source.title);
  const rows = [];
  R.criteria.forEach((c, index) => {
    rows.push([c.title, c.max + '%', '', '', '']);
    const next = R.criteria[index + 1];
    if (!next || next.group !== c.group) rows.push(['SUB TOTAL', R.groupMax[c.group] + '%', '', '', '']);
  });
  rows.push(['TOTAL', '100%', '', '', '']);
  assert.deepEqual(rows, source.rows.slice(1));
  assert.equal(R.category, undefined);
});
test('Nombre, autoría y límites de comentarios son validados', () => {
  const payload = {evaluator: 'Jurado', scores: scores(1), checks: Object.fromEntries(R.criteria.map(c => [c.id, 'SI'])), confirmed: true};
  assert.equal(R.validate(payload).total, 100);
  assert.throws(() => R.validate({...payload, confirmed: false}));
  assert.throws(() => R.validate({...payload, evaluator: ' '}));
  assert.throws(() => R.validate({...payload, comments: {problema: 'a'.repeat(2001)}}));
  assert.throws(() => R.validate({...payload, improvements: 'a'.repeat(4001)}));
  assert.throws(() => R.validate({...payload, checks: {}}));
  assert.throws(() => R.validate({...payload, checks: {...payload.checks, problema: 'SI/NO'}}));
  assert.throws(() => R.validate({...payload, rubricVersion: 'protocolo-facmed-1.0'}));
  assert.equal(R.validate({...payload, checks: {...payload.checks, problema: 'NO'}, scores: {...payload.scores, problema: 2}}).scores.problema, 2);
});
test('Resumen usa última revisión completada y nunca puntúa pendientes como cero', () => {
  const e = (jurorId, revision, status, factor) => ({sessionId: 's', jurorId, revision, status, data: {...R.calculate(scores(factor)), rubricVersion: R.version, scores: scores(factor)}});
  const list = [e('a', 1, 'COMPLETE', 0), e('a', 2, 'COMPLETE', 1), e('b', 1, 'PENDING_PDF', 1)];
  const summary = R.summarize(list, 3);
  assert.equal(summary.received, 1); assert.equal(summary.pending, 2); assert.equal(summary.note, 100);
  assert.equal(summary.averages.problema, 5);
  assert.equal(R.summarize([], 3).note, null);
});
test('No mezcla evaluaciones de la rúbrica anterior con la lista de cotejo', () => {
  const old = {sessionId: 's', jurorId: 'a', revision: 1, status: 'COMPLETE', data: {rubricVersion: 'protocolo-facmed-1.0', note: 100}};
  const summary = R.summarize([old], 1);
  assert.equal(summary.received, 0); assert.equal(summary.pending, 1); assert.equal(summary.note, null);
});
test('Textos que parecen fórmulas se almacenan como texto', () => {
  for (const value of ['=IMPORTXML("url")', '+2', '-3', '@name', '  =1']) assert.equal(R.safeCell(value), "'" + value);
  assert.equal(R.safeCell('Comentario académico'), 'Comentario académico'); assert.equal(R.safeCell(2), 2);
});
