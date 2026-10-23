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
  const bee = docs.filter(d => v(d, 'tipo') === 'bee');
  const outros = docs.filter(d => v(d, 'tipo') !== 'bee');
  const quandoDe = d => Utilities.formatDate(new Date(v(d, 'em')), 'America/Sao_Paulo', "dd/MM 'às' HH:mm");

  // --- Lançamentos no BEE: um cartão por categoria, itens em lista.
  // Formato do resumo: "Categoria :: item 1 || item 2 || item 3" (itens em ordem).
  let blocoBee = '';
  if (bee.length) {
    const porCat = {};
    bee.forEach(d => {
      const r = String(v(d, 'resumo'));
      const i = r.indexOf('::');
      const cat = (i > -1 ? r.slice(0, i) : 'Lançamentos').trim();
      const itens = (i > -1 ? r.slice(i + 2) : r).split('||').map(x => x.trim()).filter(Boolean);
      (porCat[cat] = porCat[cat] || { itens: [], quando: quandoDe(d) }).itens.push(...itens);
    });
    blocoBee = '<div style="font-size:11px;letter-spacing:1px;color:#8a94a6;text-transform:uppercase;margin:0 0 8px">Lançamentos no BEE</div>'
      + Object.keys(porCat).map(cat => {
        const c = porCat[cat];
        return '<div style="border:1px solid #e3e7ee;border-radius:8px;margin:0 0 12px;overflow:hidden">'
          + '<div style="background:#16233d;color:#fff;padding:9px 14px;font-size:14px;font-weight:bold">' + esc(cat)
          + '<span style="float:right;font-weight:normal;font-size:12px;color:#b8c2d6">' + c.itens.length + (c.itens.length === 1 ? ' item' : ' itens') + '</span></div>'
          + '<ul style="margin:0;padding:10px 14px 10px 32px;font-size:14px;line-height:1.7;color:#222">'
          + c.itens.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
      }).join('')
      + '<div style="font-size:12px;color:#8a94a6;margin:0 0 18px">Lançado por Claude em ' + quandoDe(bee[bee.length - 1]) + ' · CEF Solar dos Pequis e Buritis · Apontamento de Macroserviço</div>';
  }

  // --- Demais novidades do app (cadastros, acessos, edições).
  let blocoApp = '';
  if (outros.length) {
    const linhas = outros.map(d => {
      return '<tr><td style="padding:6px 10px;color:#666;white-space:nowrap;vertical-align:top">' + Utilities.formatDate(new Date(v(d, 'em')), 'America/Sao_Paulo', 'dd/MM HH:mm') + '</td>'
        + '<td style="padding:6px 10px"><b>' + esc(v(d, 'nome') || v(d, 'usuario')) + '</b> <span style="color:#888">@' + esc(v(d, 'usuario')) + ' (' + esc(v(d, 'papel')) + ')</span><br>' + esc(v(d, 'resumo')) + '</td></tr>';
    }).join('');
    blocoApp = '<div style="font-size:11px;letter-spacing:1px;color:#8a94a6;text-transform:uppercase;margin:0 0 8px">Novidades no app</div>'
      + '<table style="border-collapse:collapse;font-size:14px">' + linhas + '</table>';
  }
  const titulo = bee.length && !outros.length ? 'Lançamentos no BEE' : 'Diário de Obra — ' + docs.length + ' novidade(s)';
  const html = '<div style="font-family:Arial,sans-serif;max-width:640px"><h2 style="color:#16233d;margin:0 0 16px">' + titulo + '</h2>'
    + blocoBee + blocoApp
    + '<p style="color:#888;font-size:12px">Histórico completo: no app, Configurações → Histórico de atividades.</p></div>';
  const assunto = bee.length && !outros.length ? 'BEE: ' + bee.reduce((n, d) => n + String(v(d, 'resumo')).split('||').length, 0) + ' lançamento(s) feito(s)' : 'Diário de Obra: ' + docs.length + ' novidade(s)';
  MailApp.sendEmail({ to: DESTINO, subject: assunto, htmlBody: html });

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
