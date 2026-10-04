const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
function app() {
  const token = 'a'.repeat(64), db = [], released = [];
  let open = true, pdfFails = false, pdfCalls = 0;
  const context = {
    console: {error() {}},
    Utilities: {getUuid: () => crypto.randomUUID(), Charset: {UTF_8: 'utf8'}, DigestAlgorithm: {SHA_256: 'sha256'}, computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(text).digest())},
    LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock: () => released.push(true)})}
  };
  vm.createContext(context);
  const read = name => fs.readFileSync(path.join(__dirname, '../apps-script', name), 'utf8');
  vm.runInContext(read('Rubric.html').replace(/<\/?script>/g, '') + '\n' + read('Code.gs'), context);
  context.invites_ = () => [{id: 'invite-a', sessionId: 's', jurorId: 'juror-a', revision: 1, name: 'Jurado', hash: context.hash_(token), status: 'ACTIVE'}];
  context.session_ = () => ({id: 's', resident: 'Residente', title: 'Protocolo', status: open ? 'OPEN' : 'CLOSED'});
  context.evaluationFor_ = id => db.find(e => e.inviteId === id);
  context.appendEvaluation_ = e => { e.row = db.length + 2; db.push(e); };
  context.updateEvaluation_ = () => {};
  context.refreshSummary_ = () => {};
  context.createPdf_ = () => { pdfCalls++; if (pdfFails) throw new Error('Simulated export failure'); return 'pdf-a'; };
  const payload = {evaluator: 'Jurado', rubricVersion: context.Rubric.version, confirmed: true, scores: Object.fromEntries(context.Rubric.criteria.map(c => [c.id, c.max])), checks: Object.fromEntries(context.Rubric.criteria.map(c => [c.id, 'SI']))};
  return {context, token, db, payload, released, close: () => { open = false; }, failPdf: flag => { pdfFails = flag; }, pdfCalls: () => pdfCalls};
}
test('Envío repetido y respuesta perdida no duplican evaluación ni PDF', () => {
  const a = app();
  const first = a.context.submitEvaluation(a.token, a.payload);
  const second = a.context.submitEvaluation(a.token, a.payload);
  assert.equal(first.status, 'COMPLETE'); assert.equal(second.id, first.id);
  assert.equal(a.db.length, 1); assert.equal(a.pdfCalls(), 1); assert.equal(a.released.length, 2);
});
test('Fallo PDF conserva puntajes y el reintento termina la misma evaluación', () => {
  const a = app(); a.failPdf(true);
  const first = a.context.submitEvaluation(a.token, a.payload);
  assert.equal(first.status, 'PENDING_PDF'); assert.equal(a.db.length, 1);
  a.failPdf(false);
  const second = a.context.submitEvaluation(a.token, {...a.payload, scores: {}});
  assert.equal(second.status, 'COMPLETE'); assert.equal(first.id, second.id); assert.equal(second.data.total, 100); assert.equal(a.db.length, 1);
});
test('Una evaluación antigua requiere nueva revisión y no se reinterpreta', () => {
  const a = app();
  a.db.push({inviteId: 'invite-a', status: 'COMPLETE', data: {rubricVersion: 'protocolo-facmed-1.0'}});
  assert.throws(() => a.context.submitEvaluation(a.token, a.payload), /rúbrica anterior/);
  assert.equal(a.pdfCalls(), 0);
});
test('Sesión cerrada, enlace inválido y nombre distinto impiden nuevos envíos', () => {
  const a = app();
  assert.throws(() => a.context.submitEvaluation('invalid', a.payload));
  assert.throws(() => a.context.submitEvaluation('b'.repeat(64), a.payload));
  assert.throws(() => a.context.submitEvaluation(a.token, {...a.payload, evaluator: 'Otro jurado'}));
  a.close(); assert.throws(() => a.context.submitEvaluation(a.token, a.payload));
  assert.equal(a.db.length, 0); assert.equal(a.released.length, 4);
});
test('Enlace propio recupera un envío completo aun si la sesión ya está cerrada', () => {
  const a = app(); a.context.submitEvaluation(a.token, a.payload); a.close();
  assert.equal(a.context.getContext(a.token).evaluation.status, 'COMPLETE');
  assert.equal(a.context.submitEvaluation(a.token, a.payload).status, 'COMPLETE');
});
test('Sin bloqueo no escribe y solicita reintento', () => {
  const a = app(); a.context.LockService.getScriptLock = () => ({tryLock: () => false});
  assert.throws(() => a.context.submitEvaluation(a.token, a.payload), /otro envío/); assert.equal(a.db.length, 0);
});
