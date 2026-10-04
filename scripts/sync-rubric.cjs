const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'reference/protocol-source.json'), 'utf8'));
const ids = ['portada','indice','introduccion','antecedentes','justificacion','problema','objetivos','marco','tipo','area','poblacion','unidad','muestra','seleccion','variables','operacionalizacion','recoleccion','confiabilidad','analisis','etica','limitaciones','bibliografia','instrumento','cronograma','presupuesto'];
let group = 0, index = 0;
const criteria = [];
for (const row of source.rows.slice(1)) {
  if (row[0] === 'SUB TOTAL') { group++; continue; }
  if (row[0] === 'TOTAL') continue;
  criteria.push({id: ids[index++], title: row[0], max: parseInt(row[1]), group});
}
if (criteria.length !== 25 || criteria.reduce((n, c) => n + c.max, 0) !== 100) throw new Error('La fuente no coincide con la lista de cotejo esperada.');
const code = `<script>
(function (root) {
  'use strict';
  const title = ${JSON.stringify(source.title)};
  const version = 'protocolo-registro-2026-1.0';
  const criteria = ${JSON.stringify(criteria, null, 2)};
  const groupMax = [40, 40, 20];
  function calculate(scores) {
    if (!scores || typeof scores !== 'object') throw new Error('Faltan las notas.');
    const subtotals = [0, 0, 0];
    criteria.forEach(c => {
      const n = scores[c.id];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > c.max) throw new Error('Revise la nota de ' + c.title + '.');
      subtotals[c.group] += n;
    });
    const total = subtotals.reduce((a, b) => a + b, 0);
    return {total, note: total, subtotals};
  }
  function text(value, label, limit, required) {
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error('Revise ' + label + '.');
    return value.trim();
  }
  function validate(payload) {
    if (!payload || payload.confirmed !== true) throw new Error('Debe confirmar la autoría de la evaluación.');
    if (payload.rubricVersion && payload.rubricVersion !== version) throw new Error('La lista de cotejo cambió. Recargue el formulario antes de enviar.');
    const result = calculate(payload.scores);
    const checks = {}, comments = {};
    criteria.forEach(c => {
      const check = (payload.checks || {})[c.id];
      if (!['SI', 'NO'].includes(check)) throw new Error('Marque SI o NO en ' + c.title + '.');
      checks[c.id] = check;
      comments[c.id] = text((payload.comments || {})[c.id] || '', 'las observaciones de ' + c.title, 2000, false);
    });
    return Object.assign(result, {
      rubricVersion: version,
      evaluator: text(payload.evaluator, 'el nombre del jurado', 150, true),
      scores: Object.fromEntries(criteria.map(c => [c.id, payload.scores[c.id]])),
      checks, comments,
      strengths: text(payload.strengths || '', 'las fortalezas', 4000, false),
      improvements: text(payload.improvements || '', 'las mejoras prioritarias', 4000, false),
      observations: text(payload.observations || '', 'las observaciones generales', 4000, false),
      confirmed: true
    });
  }
  function latest(evaluations) {
    const map = new Map();
    evaluations.filter(e => e.status === 'COMPLETE' && e.data.rubricVersion === version).forEach(e => {
      const key = e.sessionId + ':' + e.jurorId;
      if (!map.has(key) || e.revision > map.get(key).revision) map.set(key, e);
    });
    return Array.from(map.values());
  }
  function summarize(evaluations, expected) {
    const active = latest(evaluations);
    const averages = {};
    criteria.forEach(c => { averages[c.id] = active.length ? active.reduce((n, e) => n + e.data.scores[c.id], 0) / active.length : null; });
    return {received: active.length, pending: Math.max(0, expected - active.length), averages, note: active.length ? active.reduce((n, e) => n + e.data.note, 0) / active.length : null};
  }
  function safeCell(value) {
    return typeof value === 'string' && /^[\\s]*[=+@-]/.test(value) ? "'" + value : value;
  }
  root.Rubric = {title, version, criteria, groupMax, calculate, validate, latest, summarize, safeCell};
})(typeof globalThis === 'object' ? globalThis : this);
</script>
`;
fs.writeFileSync(path.join(root, 'apps-script/Rubric.html'), code);
console.log('Lista de cotejo generada directamente de la tabla del Word: 25 indicadores, 100%.');
