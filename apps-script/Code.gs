/** Only these four server functions are available to the public form. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Evaluación de protocolos FACMED')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
function rubric_() {
  if (typeof Rubric === 'undefined') {
    const source = include_('Rubric').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
    eval(source);
  }
  return Rubric;
}
function getContext(token) {
  const invite = authorize_(token);
  const session = session_(invite.sessionId);
  const evaluation = evaluationFor_(invite.id);
  return {
    session: {id: session.id, resident: session.resident, title: session.title, program: session.program, tutor: session.tutor, date: session.date, open: session.status === 'OPEN'},
    juror: {name: invite.name, revision: invite.revision},
    evaluation: evaluation ? publicEvaluation_(evaluation) : null
  };
}
function submitEvaluation(token, payload) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Hay otro envío en proceso. Reintente en unos segundos; su borrador se conserva.');
  try {
    const invite = authorize_(token);
    const session = session_(invite.sessionId);
    let evaluation = evaluationFor_(invite.id);
    if (evaluation && evaluation.data.rubricVersion !== rubric_().version) throw new Error('Este enlace corresponde a la rúbrica anterior. Solicite una nueva revisión al coordinador.');
    if (evaluation && evaluation.status === 'COMPLETE') return publicEvaluation_(evaluation);
    if (session.status !== 'OPEN') throw new Error('Esta sesión está cerrada. Contacte al coordinador.');
    if (!evaluation) {
      const data = rubric_().validate(payload);
      if (data.evaluator !== invite.name) throw new Error('El nombre debe corresponder al jurado de este enlace.');
      evaluation = {
        id: Utilities.getUuid(), inviteId: invite.id, sessionId: session.id,
        jurorId: invite.jurorId, revision: invite.revision, createdAt: new Date().toISOString(),
        status: 'PENDING_PDF', pdfId: '', data
      };
      appendEvaluation_(evaluation);
    }
    // An invitation has one immutable payload. Retrying resumes that payload.
    try {
      evaluation.pdfId = createPdf_(evaluation, session);
      evaluation.status = 'COMPLETE';
      updateEvaluation_(evaluation);
    } catch (error) {
      console.error('PDF pendiente para ' + evaluation.id + ': ' + error.message);
      evaluation.status = 'PENDING_PDF';
      updateEvaluation_(evaluation);
    }
    try { refreshSummary_(); } catch (error) { console.error('Resumen pendiente: ' + error.message); }
    return publicEvaluation_(evaluation);
  } finally { lock.releaseLock(); }
}
function downloadPdf(token) {
  const invite = authorize_(token);
  const evaluation = evaluationFor_(invite.id);
  if (!evaluation || evaluation.status !== 'COMPLETE') throw new Error('El PDF todavía no está disponible.');
  const file = DriveApp.getFileById(evaluation.pdfId);
  return {name: file.getName(), base64: Utilities.base64Encode(file.getBlob().getBytes())};
}
function publicEvaluation_(evaluation) {
  return {id: evaluation.id, status: evaluation.status, createdAt: evaluation.createdAt, revision: evaluation.revision, data: evaluation.data};
}
function hash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function authorize_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Enlace no válido. Solicite su enlace individual al coordinador.');
  const invite = invites_().find(i => i.hash === hash_(token) && i.status === 'ACTIVE');
  if (!invite) throw new Error('Este enlace no existe o fue revocado. Solicite un nuevo enlace al coordinador.');
  return invite;
}
