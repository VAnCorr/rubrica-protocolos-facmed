const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'apps-script');
const files = fs.readdirSync(source);
for (const name of files) {
  const text = fs.readFileSync(path.join(source, name), 'utf8');
  if (name.endsWith('.gs')) new vm.Script(text, {filename: name});
  if (name.endsWith('.html')) {
    for (const match of text.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1], {filename: name});
  }
}
JSON.parse(fs.readFileSync(path.join(source, 'appsscript.json')));
const config = JSON.parse(fs.readFileSync(path.join(root, 'docs/config.json')));
if (config.appsScriptUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(config.appsScriptUrl)) throw new Error('URL de Apps Script inválida.');
new vm.Script(fs.readFileSync(path.join(root, 'docs/entry.js'), 'utf8'));
const out = path.join(root, 'output');
fs.mkdirSync(out, {recursive: true});
const rubricJs = fs.readFileSync(path.join(source, 'Rubric.html'), 'utf8').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const combined = rubricJs + '\n\n' + ['Code.gs', 'Storage.gs', 'Admin.gs', 'Pdf.gs'].map(name => '// ' + name + '\n' + fs.readFileSync(path.join(source, name), 'utf8')).join('\n\n');
fs.writeFileSync(path.join(out, 'Code.gs'), combined);
const rubric = fs.readFileSync(path.join(source, 'Rubric.html'), 'utf8');
const styles = fs.readFileSync(path.join(source, 'Styles.html'), 'utf8');
const client = fs.readFileSync(path.join(source, 'Client.html'), 'utf8');
const production = fs.readFileSync(path.join(source, 'Index.html'), 'utf8')
  .replace("<?!= include_('Styles'); ?>", styles)
  .replace("<?!= include_('Rubric'); ?>", rubric)
  .replace("<?!= include_('Client'); ?>", client);
fs.writeFileSync(path.join(out, 'Index.html'), production);
const demoApi = `<script>
window.DEMO_API = (() => {
  let evaluation = null;
  return {
    getContext: () => ({session: {id: 'demo', resident: 'Residente de prueba', title: 'Protocolo de investigación para una revisión metodológica', program: 'Medicina crítica', tutor: 'Tutor de prueba', date: '2026-10-06', open: true}, juror: {name: 'Jurado de prueba', revision: 1}, evaluation}),
    submitEvaluation: (token, payload) => { evaluation = {id: 'DEMO-SIN-GUARDADO', status: 'COMPLETE', createdAt: new Date().toISOString(), revision: 1, data: Rubric.validate(payload)}; return evaluation; },
    downloadPdf: () => { throw new Error('La vista de prueba no genera PDF ni guarda datos en Drive.'); }
  };
})();
</script>`;
let demo = fs.readFileSync(path.join(source, 'Index.html'), 'utf8')
  .replace("<?!= include_('Styles'); ?>", styles)
  .replace("<?!= include_('Rubric'); ?>", rubric + demoApi)
  .replace("<?!= include_('Client'); ?>", client)
  .replace('<main>', '<main><div class="status pending">VISTA DE PRUEBA · Los datos no se guardan en Drive.</div>');
fs.writeFileSync(path.join(out, 'demo.html'), demo);
fs.writeFileSync(path.join(root, 'docs/vista-previa.html'), demo);
console.log('Sintaxis verificada. Generados output/Code.gs y output/demo.html.');
