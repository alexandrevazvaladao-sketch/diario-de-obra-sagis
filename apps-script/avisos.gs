// Avisos por e-mail do Diário de Obra — SAGIS (só para o dono).
// Roda na conta Google do dono, a cada 10 minutos: lê o histórico de atividades no Firestore
// e manda UM e-mail com as novidades (cadastros, acessos, edições de outras pessoas).
const PROJETO = 'diario-de-obra-sagis-910fe';
const DESTINO = 'alexandrevazvaladao@gmail.com';
const DOCS = 'https://firestore.googleapis.com/v1/projects/' + PROJETO + '/databases/(default)/documents';

function cab_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROJETO };
}

function enviarAvisos() {
  const consulta = { structuredQuery: {
    from: [{ collectionId: 'historico' }],
    where: { fieldFilter: { field: { fieldPath: 'enviado' }, op: 'EQUAL', value: { booleanValue: false } } },
    limit: 300
  } };
  const r = UrlFetchApp.fetch(DOCS + ':runQuery', { method: 'post', contentType: 'application/json', headers: cab_(), payload: JSON.stringify(consulta), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Firestore: ' + r.getContentText());
  const docs = JSON.parse(r.getContentText()).filter(x => x.document).map(x => x.document);
  if (!docs.length) return;

  const v = (d, k) => { const f = (d.fields || {})[k] || {}; return f.stringValue !== undefined ? f.stringValue : (f.integerValue !== undefined ? Number(f.integerValue) : ''); };
  docs.sort((a, b) => v(a, 'em') - v(b, 'em'));
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const linhas = docs.map(d => {
    const quando = Utilities.formatDate(new Date(v(d, 'em')), 'America/Sao_Paulo', 'dd/MM HH:mm');
    return '<tr><td style="padding:6px 10px;color:#666;white-space:nowrap">' + quando + '</td>'
      + '<td style="padding:6px 10px"><b>' + esc(v(d, 'nome') || v(d, 'usuario')) + '</b> <span style="color:#888">@' + esc(v(d, 'usuario')) + ' (' + esc(v(d, 'papel')) + ')</span><br>' + esc(v(d, 'resumo')) + '</td></tr>';
  }).join('');
  const html = '<div style="font-family:Arial,sans-serif"><h3 style="color:#16233d">Diário de Obra — ' + docs.length + ' novidade(s)</h3>'
    + '<table style="border-collapse:collapse;font-size:14px">' + linhas + '</table>'
    + '<p style="color:#888;font-size:12px">Histórico completo: no app, Configurações → Histórico de atividades.</p></div>';
  MailApp.sendEmail({ to: DESTINO, subject: 'Diário de Obra: ' + docs.length + ' novidade(s)', htmlBody: html });

  for (let i = 0; i < docs.length; i += 400) {
    const escritas = docs.slice(i, i + 400).map(d => ({ update: { name: d.name, fields: { enviado: { booleanValue: true } } }, updateMask: { fieldPaths: ['enviado'] } }));
    UrlFetchApp.fetch(DOCS + ':commit', { method: 'post', contentType: 'application/json', headers: cab_(), payload: JSON.stringify({ writes: escritas }), muteHttpExceptions: true });
  }
}

// Rode UMA vez para ligar o envio automático (a cada 10 minutos).
function criarGatilho() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('enviarAvisos').timeBased().everyMinutes(10).create();
}
