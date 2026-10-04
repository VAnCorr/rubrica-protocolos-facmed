(async function () {
  'use strict';
  const status = document.getElementById('status');
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    status.textContent = 'Abra el enlace individual que le compartió el coordinador para comenzar.';
    return;
  }
  try {
    const response = await fetch('./config.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('No se pudo cargar la configuración. Recargue la página.');
    const config = await response.json();
    if (!config.appsScriptUrl) throw new Error('La aplicación está pendiente de activación por el coordinador.');
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(config.appsScriptUrl)) throw new Error('La configuración de acceso es inválida. Contacte al coordinador.');
    const link = document.getElementById('open');
    link.href = config.appsScriptUrl + '#token=' + token;
    link.target = '_top';
    link.hidden = false;
    status.textContent = 'Su enlace está listo. El formulario se abrirá en Google para guardar su evaluación.';
  } catch (error) { status.textContent = error.message || 'No fue posible comprobar el acceso. Recargue la página.'; }
})();
