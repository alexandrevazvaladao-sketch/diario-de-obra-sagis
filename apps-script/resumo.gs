// Resumo diário por e-mail do Diário de Obra — SAGIS (só para o dono).
// Seg–sex às 17h: o que aconteceu no dia. Sábado: não envia. Domingo: prévia da próxima semana (planejamento).
// Depende das constantes e da função cab_() de avisos.gs (mesmo projeto).
const SITE = 'https://alexandrevazvaladao-sketch.github.io/diario-de-obra-sagis/';
const TZ = 'America/Sao_Paulo';

function doc_(caminho) {
  const r = UrlFetchApp.fetch(DOCS + '/' + caminho, { headers: cab_(), muteHttpExceptions: true });
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() !== 200) throw new Error('Firestore ' + caminho + ': ' + r.getContentText());
  return JSON.parse(r.getContentText());
}
function jsonDoc_(caminho, padrao) {
  const d = doc_(caminho);
  if (!d || !d.fields || !d.fields.json) return padrao;
  try { return JSON.parse(d.fields.json.stringValue); } catch (e) { return padrao; }
}
function entradasRecentes_(desdeMs) {
  const consulta = { structuredQuery: {
    from: [{ collectionId: 'entradas' }],
    where: { fieldFilter: { field: { fieldPath: 'atualizadoEm' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(desdeMs) } } },
    limit: 300
  } };
  const r = UrlFetchApp.fetch(DOCS + ':runQuery', { method: 'post', contentType: 'application/json', headers: cab_(), payload: JSON.stringify(consulta), muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Firestore entradas: ' + r.getContentText());
  const out = [];
  JSON.parse(r.getContentText()).forEach(x => { if (x.document && x.document.fields && x.document.fields.json) { try { out.push(JSON.parse(x.document.fields.json.stringValue)); } catch (e) { /* ignora */ } } });
  return out;
}

// ---------- lógica pura (testável fora do Apps Script) ----------
function somaDias_(iso, n) { const p = iso.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)); return d.toISOString().slice(0, 10); }
function semanaDe_(semanas, iso) { let esc = null; for (const s of semanas) { if (s <= iso) esc = s; else break; } return esc; } // semanas começam na sexta e vão até a quinta
function previsto_(c) { const u = String(c.unid || '').trim(); if (u === '%' || u === '') return (Math.round(c.prev * 1000) / 10) + '% previsto'; return (Math.round(c.prev * 100) / 100).toString().replace('.', ',') + ' ' + u + ' previsto'; }
function br_(iso) { const p = iso.split('-'); return p[2] + '/' + p[1]; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function corPct_(p) { return p >= 80 ? '#2f7d4f' : p >= 60 ? '#c98a1b' : '#b4472e'; }
const CAUSAS_ = { mao_de_obra: 'Mão de obra', material: 'Material', equipamento: 'Equipamento', clima: 'Clima', projeto_info: 'Projeto/informação', pre_requisito: 'Pré-requisito não concluído', outro: 'Outro' };

// compromissos da semana de uma obra: itens com previsto > 0, e se estão marcados como feitos
function compromissos_(cron, feitos, obra, semana) {
  const dados = cron[obra]; if (!dados || !semana) return [];
  return dados.itens.filter(i => i.nivel === 3 && i.semanal && (i.semanal[semana] || 0) > 0)
    .map(i => { const r = feitos[obra + '|' + i.cod + '|' + semana] || {}; return { cod: i.cod, desc: i.desc, prev: i.semanal[semana], unid: i.unid || '', feito: !!r.feito, causa: r.causa || '' }; });
}
// itens previstos em semanas já fechadas e sem marcação de feito
function atrasados_(cron, feitos, obra, hoje) {
  const dados = cron[obra]; if (!dados) return [];
  const fechadas = (dados.semanas || []).filter(s => somaDias_(s, 6) < hoje);
  const out = [];
  dados.itens.filter(i => i.nivel === 3 && i.semanal).forEach(i => {
    let n = 0;
    fechadas.forEach(s => { if ((i.semanal[s] || 0) > 0) { const r = feitos[obra + '|' + i.cod + '|' + s]; if (!(r && r.feito)) n++; } });
    if (n) out.push({ cod: i.cod, desc: i.desc, n: n });
  });
  return out.sort((a, b) => b.n - a.n);
}

function montarResumo_(hoje, dow, d) {
  // hoje: 'YYYY-MM-DD'; dow: 0=domingo..6=sábado; d: { entradas, mapa, cron, feitos, inicioDiaMs }
  const obras = ['Buritis', 'Pequis'];
  const h = [];
  const bloco = (t, corpo) => '<h3 style="color:#16233d;margin:18px 0 6px;font-size:15px">' + t + '</h3>' + corpo;
  const vazio = t => '<p style="color:#888;margin:4px 0">' + t + '</p>';
  let assunto;

  if (dow === 0) { // domingo: prévia da próxima semana
    const segunda = somaDias_(hoje, 1);
    assunto = 'Diário de Obra — prévia da semana (' + br_(segunda) + ' a ' + br_(somaDias_(segunda, 4)) + ')';
    obras.forEach(obra => {
      const dados = d.cron[obra]; if (!dados) return;
      const sem = semanaDe_(dados.semanas, segunda);
      const comp = compromissos_(d.cron, d.feitos, obra, sem);
      const itens = comp.length ? '<table style="border-collapse:collapse;font-size:13px">' + comp.map(c => '<tr><td style="padding:3px 10px 3px 0;color:#c4662f;font-weight:bold;white-space:nowrap">' + esc_(c.cod) + '</td><td style="padding:3px 10px 3px 0">' + esc_(c.desc) + '</td><td style="padding:3px 0;color:#666;white-space:nowrap">' + previsto_(c) + '</td></tr>').join('') + '</table>' : vazio('Nenhum item previsto no planejamento.');
      h.push(bloco('Solar dos ' + obra + ' — previsto (semana de ' + (sem ? br_(sem) : '?') + ')', itens));
      const atr = atrasados_(d.cron, d.feitos, obra, somaDias_(hoje, 1)).slice(0, 10);
      if (atr.length) h.push(bloco('Solar dos ' + obra + ' — pendências que vêm de semanas anteriores', '<ul style="margin:4px 0;padding-left:18px;font-size:13px">' + atr.map(a => '<li>' + esc_(a.cod) + ' ' + esc_(a.desc) + ' <span style="color:#888">(' + a.n + ' sem. sem marcação)</span></li>').join('') + '</ul>'));
    });
    return { assunto: assunto, html: h.join('') };
  }

  assunto = 'Diário de Obra — resumo de ' + br_(hoje);
  // 1. apontamentos do dia
  const doDia = d.entradas.filter(e => e.date === hoje);
  if (doDia.length) {
    h.push(bloco('Apontamentos de hoje (' + doDia.length + ')', doDia.map(e => {
      const fotos = (e.fotos || []).length;
      const txt = String(e.atividades || e.texto || '').replace(/\s+/g, ' ').slice(0, 220);
      return '<p style="margin:6px 0;font-size:13px"><b>' + esc_(e.obra) + '</b>' + (e.ocorrencia ? ' <span style="color:#b4472e">⚠ ocorrência</span>' : '') + ' — ' + esc_(txt) + (fotos ? ' <span style="color:#888">📷 ' + fotos + '</span>' : '') + '</p>';
    }).join('')));
  } else { h.push(bloco('Apontamentos de hoje', vazio('Nenhum apontamento lançado hoje.'))); }
  // 2. mapa
  const mudou = ((d.mapa && d.mapa.estados) || []).filter(e => (e.atualizadoEm || 0) >= d.inicioDiaMs);
  if (mudou.length) {
    const grupos = {};
    mudou.forEach(e => { const k = e.obra + '|' + e.servico + '|' + e.cor; (grupos[k] = grupos[k] || { obra: e.obra, servico: e.servico, cor: e.cor, blocos: [] }).blocos.push(e.bloco); });
    const nomeCor = { verde: 'concluído', amarelo: 'executando' };
    h.push(bloco('Mapa — o que mudou hoje', '<ul style="margin:4px 0;padding-left:18px;font-size:13px">' + Object.values(grupos).map(g => '<li>' + esc_(g.servico) + ' · ' + esc_(g.obra) + ': ' + (nomeCor[g.cor] || esc_(g.cor)) + ' — blocos ' + g.blocos.map(esc_).join(', ') + '</li>').join('') + '</ul>'));
  } else { h.push(bloco('Mapa — o que mudou hoje', vazio('Sem alterações no Mapa hoje.'))); }
  // 3. cronograma da semana
  obras.forEach(obra => {
    const dados = d.cron[obra]; if (!dados) return;
    const sem = semanaDe_(dados.semanas, hoje);
    const comp = compromissos_(d.cron, d.feitos, obra, sem);
    if (!comp.length) return;
    const ok = comp.filter(c => c.feito).length, pct = Math.round(ok / comp.length * 100);
    const pend = comp.filter(c => !c.feito);
    h.push(bloco('Cronograma — Solar dos ' + obra + ' (semana de ' + br_(sem) + ')',
      '<p style="margin:4px 0;font-size:13px">PPC parcial: <b style="color:' + corPct_(pct) + '">' + pct + '%</b> (' + ok + ' de ' + comp.length + ' compromissos feitos)</p>'
      + (pend.length ? '<p style="margin:4px 0 2px;font-size:13px;color:#555">Ainda sem marcação:</p><ul style="margin:0;padding-left:18px;font-size:13px">' + pend.map(c => '<li>' + esc_(c.cod) + ' ' + esc_(c.desc) + (c.causa ? ' <span style="color:#888">· ' + esc_(CAUSAS_[c.causa] || c.causa) + '</span>' : '') + '</li>').join('') + '</ul>' : '<p style="color:#2f7d4f;margin:4px 0">Todos os compromissos da semana estão feitos. 🎉</p>')));
  });
  return { assunto: assunto, html: h.join('') };
}

// ---------- envio ----------
function enviarResumoDiario() {
  const agora = new Date();
  const hoje = Utilities.formatDate(agora, TZ, 'yyyy-MM-dd');
  const dow = Number(Utilities.formatDate(agora, TZ, 'u')) % 7; // u: 1=segunda..7=domingo → 0=domingo
  if (dow === 6) return; // sábado: não envia
  const inicioDiaMs = new Date(hoje + 'T00:00:00-03:00').getTime();
  const cron = JSON.parse(UrlFetchApp.fetch(SITE + 'cronograma-data.json?x=' + agora.getTime()).getContentText());
  const dados = {
    cron: cron,
    feitos: jsonDoc_('estado/cronograma', {}),
    mapa: jsonDoc_('mapa/estado', { estados: [] }),
    entradas: dow === 0 ? [] : entradasRecentes_(inicioDiaMs - 36 * 3600000),
    inicioDiaMs: inicioDiaMs
  };
  const r = montarResumo_(hoje, dow, dados);
  const html = '<div style="font-family:Arial,sans-serif;max-width:640px">' + r.html + '<p style="color:#999;font-size:12px;margin-top:22px">Enviado automaticamente pelo Diário de Obra.</p></div>';
  MailApp.sendEmail({ to: DESTINO, subject: r.assunto, htmlBody: html });
}

// Rode UMA vez: liga o aviso de novidades (a cada 10 min) e o resumo diário (17h).
function criarGatilhos() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('enviarAvisos').timeBased().everyMinutes(10).create();
  ScriptApp.newTrigger('enviarResumoDiario').timeBased().atHour(17).nearMinute(0).everyDays(1).create();
}
