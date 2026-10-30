/* Painel de Projetos Cia Beauty — login, banco (Supabase) e gestão de usuários */
(function () {
  'use strict';
  const C = window.CIA_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ABAS = [['inicio', 'Início'], ['entregas', 'Entregas'], ['simulador', 'Custos'], ['carteira', 'Carteira'], ['compras', 'Compras'], ['notas', 'Notas XML'], ['vendas', 'Vendas'], ['estoque', 'Estoque']];
  const PAPEIS = { admin: 'Administrador do sistema', master: 'Master (tudo + usuários)', editor: 'Editor (vê e altera)', leitor: 'Leitor (só consulta)' };

  if (!C.SUPABASE_URL || /SEU-PROJETO/.test(C.SUPABASE_URL) || !C.SUPABASE_ANON_KEY || /COLE/.test(C.SUPABASE_ANON_KEY)) {
    loginMsg('Configuração pendente: preencha o arquivo config.js com a URL e a chave anon do seu projeto Supabase (veja o LEIAME).', true);
    $('#loginForm').hidden = true;
    return;
  }
  const HASH0 = location.hash; // capturado antes do Supabase limpar o endereço
  const CONVITE = /type=(invite|signup)/.test(HASH0);
  const sb = supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  let USER = null, PERFIL = null, recuperando = CONVITE;
  const ehAdmin = () => !!PERFIL && PERFIL.papel === 'admin';
  const ehGestor = () => !!PERFIL && ['admin', 'master'].includes(PERFIL.papel);

  function loginMsg(t, erro) { const m = $('#loginMsg'); m.textContent = t || ''; m.className = 'lmsg' + (erro ? ' erro' : ''); }
  function mostrar(qual) { ['loginForm', 'resetForm', 'novaSenhaForm', 'baseForm'].forEach((id) => { $('#' + id).hidden = id !== qual; }); }

  /* ---------------- LOGIN ---------------- */
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('#btnEntrar'); b.disabled = true; loginMsg('Entrando…');
    const { data, error } = await sb.auth.signInWithPassword({ email: $('#lEmail').value.trim(), password: $('#lSenha').value });
    b.disabled = false;
    if (error) { loginMsg(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : /banned/i.test(error.message) ? 'Seu acesso está desativado. Fale com o master.' : error.message, true); return; }
    entrar(data.user);
  });
  $('#linkReset').addEventListener('click', (e) => { e.preventDefault(); $('#rEmail').value = $('#lEmail').value; mostrar('resetForm'); loginMsg(''); });
  $('#linkVoltar').addEventListener('click', (e) => { e.preventDefault(); mostrar('loginForm'); loginMsg(''); });
  $('#resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.resetPasswordForEmail($('#rEmail').value.trim(), { redirectTo: location.origin + location.pathname });
    loginMsg(error ? error.message : 'Se esse e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.', !!error);
  });
  $('#novaSenhaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s1 = $('#nSenha').value, s2 = $('#nSenha2').value;
    if (s1.length < 8) return loginMsg('A senha precisa ter pelo menos 8 caracteres.', true);
    if (s1 !== s2) return loginMsg('As duas senhas não são iguais.', true);
    const { data, error } = await sb.auth.updateUser({ password: s1 });
    if (error) return loginMsg(error.message, true);
    recuperando = false; loginMsg('Senha alterada.'); entrar(data.user);
  });
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') { recuperando = true; $('#login').hidden = false; $('#appRoot').hidden = true; mostrar('novaSenhaForm'); loginMsg('Crie sua nova senha.'); }
  });

  async function iniciar() {
    const { data } = await sb.auth.getSession();
    if (CONVITE && data.session) { mostrar('novaSenhaForm'); loginMsg('Bem-vindo! Crie sua senha para acessar o painel.'); return; }
    recuperando = false;
    if (data.session && !/type=recovery/.test(location.hash)) entrar(data.session.user);
    else { mostrar('loginForm'); }
  }

  async function sair() { await sb.auth.signOut(); location.hash = ''; location.reload(); }

  /* ---------------- ENTRAR: perfil + base ---------------- */
  async function entrar(user) {
    if (recuperando) return;
    USER = user;
    const { data: perfil, error } = await sb.from('perfis').select('*').eq('user_id', user.id).maybeSingle();
    if (error) { loginMsg('Não consegui ler seu perfil: ' + error.message, true); return; }
    if (!perfil || !perfil.ativo) { loginMsg('Seu usuário ainda não tem acesso ao painel. Fale com o master.', true); await sb.auth.signOut(); mostrar('loginForm'); return; }
    PERFIL = perfil;
    loginMsg('Carregando a base…');
    const { data: base, error: e2 } = await sb.from('base').select('chave,conteudo').in('chave', ['dados', 'versao']);
    if (e2) { loginMsg('Não consegui carregar a base: ' + e2.message, true); return; }
    const B = {}; (base || []).forEach((r) => { B[r.chave] = r.conteudo; });
    if (!B.dados) {
      if (ehGestor()) { mostrar('baseForm'); loginMsg('Primeiro acesso: carregue o arquivo base_inicial.json que veio junto com o app.'); }
      else { loginMsg('A base ainda não foi carregada pelo master. Tente mais tarde.', true); await sb.auth.signOut(); }
      return;
    }
    abrirApp(B);
  }

  async function enviarBase(file, msgFn) {
    const txt = await file.text();
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('Esse arquivo não é a base do painel (JSON inválido).'); }
    if (!j.dados || !j.dados.projetos) throw new Error('Esse arquivo não é a base do painel.');
    msgFn('Enviando a base para o banco…');
    const linhas = [{ chave: 'dados', conteudo: JSON.stringify(j.dados) }, { chave: 'versao', conteudo: String(j.versao || '') }];
    for (const l of linhas) { const { error } = await sb.from('base').upsert(l); if (error) throw new Error(error.message); }
    if (j.xmlb) {
      msgFn('Guardando os XMLs das notas…');
      const bin = Uint8Array.from(atob(String(j.xmlb).trim()), (c) => c.charCodeAt(0));
      const mapa = JSON.parse(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
      await gravarXmls(Object.entries(mapa).map(([chave, xml]) => linhaXml(chave, xml, 'base')), msgFn);
    }
  }
  $('#baseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = $('#bArq').files[0]; if (!f) return loginMsg('Escolha o arquivo base_inicial.json.', true);
    try { await enviarBase(f, loginMsg); loginMsg('Base carregada.'); entrar(USER); } catch (err) { loginMsg(err.message, true); }
  });

  /* ---------------- XMLs: guardados um por nota, baixados só quando abertos ---------------- */
  function linhaXml(chave, xml, origem) {
    const dh = (/<dhEmi>([^<]{10})/.exec(xml) || /<dEmi>([^<]{10})/.exec(xml) || [])[1] || null;
    const tp = (/<tpNF>(\d)</.exec(xml) || [])[1] || null;
    return { chave, xml, emissao: dh, tp_nf: tp, origem };
  }
  async function gravarXmls(rows, msgFn) {
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await sb.from('notas_xml').upsert(rows.slice(i, i + 100));
      if (error) throw new Error('XMLs: ' + error.message);
      if (msgFn) msgFn('Guardando os XMLs das notas… ' + Math.min(i + 100, rows.length) + ' de ' + rows.length);
    }
  }
  window.CIA_XML = async (chave) => {
    const { data, error } = await sb.from('notas_xml').select('xml').eq('chave', chave).maybeSingle();
    if (error) throw error; return (data && data.xml) || '';
  };

  /* ---------------- ADAPTADOR DE BANCO (mesma interface que o app usa) ---------------- */
  const listeners = {}; const timers = {};
  const snapDoc = (id, dados) => ({ id, exists: !!dados, data: () => dados || undefined, metadata: { fromCache: false, hasPendingWrites: false } });
  async function fetchCol(col) {
    let all = [], from = 0;
    for (;;) {
      const { data, error } = await sb.from('registros').select('id,dados').eq('colecao', col).range(from, from + 999);
      if (error) throw { code: 'unavailable', message: error.message };
      all = all.concat(data || []); if (!data || data.length < 1000) break; from += 1000;
    }
    return all;
  }
  const querySnap = (rows) => ({ empty: !rows.length, size: rows.length, docs: rows.map((r) => snapDoc(r.id, r.dados)), docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } });
  function agenda(col, ms) {
    clearTimeout(timers[col]);
    timers[col] = setTimeout(async () => {
      const ls = listeners[col] || []; if (!ls.length) return;
      let rows = null;
      for (const l of ls) {
        try {
          if (l.doc) { const { data } = await sb.from('registros').select('dados').eq('colecao', col).eq('id', l.doc).maybeSingle(); l.next(snapDoc(l.doc, data && data.dados)); }
          else { rows = rows || await fetchCol(col); l.next(querySnap(rows)); }
        } catch (e) { if (l.err) l.err(e); }
      }
    }, ms == null ? 400 : ms);
  }
  const erroDb = (error) => ({ code: /row-level security|permission/i.test(error.message) ? 'invalid_argument' : 'unavailable', message: error.message });
  function docRef(col, id) {
    return {
      id, path: col + '/' + id,
      async get() { const { data, error } = await sb.from('registros').select('dados').eq('colecao', col).eq('id', id).maybeSingle(); if (error) throw erroDb(error); return snapDoc(id, data && data.dados); },
      async set(d) {
        if (col === 'notas' && d && d.xml) {
          const { error: ex } = await sb.from('notas_xml').upsert(linhaXml(id, d.xml, 'importada')); if (ex) throw erroDb(ex);
          d = Object.assign({}, d); delete d.xml;
        }
        const { error } = await sb.from('registros').upsert({ colecao: col, id, dados: d }); if (error) throw erroDb(error);
      },
      async update(d) { const s = await this.get(); if (!s.exists) throw { code: 'invalid_argument', message: 'documento não existe' }; await this.set(Object.assign({}, s.data(), d)); },
      async delete() { const { error } = await sb.from('registros').delete().eq('colecao', col).eq('id', id); if (error) throw erroDb(error); },
      onSnapshot(next, err) { const l = { next, err, doc: id }; (listeners[col] = listeners[col] || []).push(l); agenda(col, 0); return () => { listeners[col] = (listeners[col] || []).filter((x) => x !== l); }; },
      collection(sub) { return colRef(col + '/' + id + '/' + sub); },
    };
  }
  function colRef(col) {
    return {
      path: col,
      doc(id) { return docRef(col, id || Math.random().toString(36).slice(2)); },
      async add(d) { const r = docRef(col, Math.random().toString(36).slice(2)); await r.set(d); return r; },
      async get() { return querySnap(await fetchCol(col)); },
      onSnapshot(next, err) { const l = { next, err }; (listeners[col] = listeners[col] || []).push(l); agenda(col, 0); return () => { listeners[col] = (listeners[col] || []).filter((x) => x !== l); }; },
      where() { return this; }, orderBy() { return this; }, limit() { return this; },
    };
  }
  const DB = { collection: colRef, doc(path) { const p = path.split('/'); return docRef(p.slice(0, -1).join('/'), p[p.length - 1]); } };

  const NOMES = {};
  const USER_NS = {
    async me() { return { id: USER.id, name: PERFIL.nome || USER.email, email: USER.email, avatarUrl: '', color: '' }; },
    async id() { return USER.id; },
    async isOwner() { return ehGestor(); },
    async canEdit() { return ehGestor(); },
    async can(n) { return n === 'data.write' ? ['admin', 'master', 'editor'].includes(PERFIL.papel) : null; },
    async profiles(ids) {
      const falta = ids.filter((i) => !(i in NOMES));
      if (falta.length) { const { data } = await sb.from('perfis').select('user_id,nome,email').in('user_id', falta); (data || []).forEach((p) => { NOMES[p.user_id] = p.nome || p.email; }); }
      const o = {}; ids.forEach((i) => { o[i] = { id: i, name: NOMES[i] || '', isMe: i === USER.id }; }); return o;
    },
  };
  const DOWNLOADS = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
      return { status: 'saved' };
    },
  };
  window.claude = { use: async (n) => (n === 'db' ? DB : n === 'user' ? USER_NS : n === 'downloads' ? DOWNLOADS : null) };

  /* ---------------- ABRIR O APP ---------------- */
  function abrirApp(B) {
    document.getElementById('data').textContent = B.dados;
    window.__NOME = (PERFIL.nome || '').split(' ')[0];
    // abas que este usuário vê
    const ver = new Set(ehGestor() ? ABAS.map((a) => a[0]) : (PERFIL.abas || []).concat(['inicio']));
    const css = ABAS.filter((a) => !ver.has(a[0])).map((a) => `nav.tabs button[data-tab="${a[0]}"],.hcard[data-go="${a[0]}"],#homePend [data-go="${a[0]}"],.quick [data-go="${a[0]}"]{display:none!important}`).join('\n');
    const st = document.createElement('style'); st.textContent = css + (ehAdmin() ? '' : '\n.soAdmin{display:none!important}'); document.head.appendChild(st);
    const h = location.hash.slice(1); if (h && !ver.has(h)) location.hash = '#inicio';
    window.addEventListener('hashchange', () => { const x = location.hash.slice(1); if (x && !ver.has(x)) location.hash = '#inicio'; });

    // realtime
    sb.channel('registros').on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, (p) => {
      const col = (p.new && p.new.colecao) || (p.old && p.old.colecao);
      if (col) agenda(col); else Object.keys(listeners).forEach((c) => agenda(c));
    }).subscribe();

    $('#login').hidden = true; $('#appRoot').hidden = false;
    const s = document.createElement('script'); s.src = 'app.js?v=' + (window.CIA_VERSAO || '1');
    s.onload = () => montarMenuConta();
    document.body.appendChild(s);
  }

  function montarMenuConta() {
    const foot = document.querySelector('.side .foot'); if (!foot) return;
    const box = document.createElement('div'); box.className = 'conta';
    box.innerHTML = (ehGestor() ? '<button class="sbtn" id="btnUsuarios">Usuários</button><button class="sbtn" id="btnBase">Atualizar base</button><button class="sbtn" id="btnConfig">Configurações</button>' : '') + '<button class="sbtn" id="btnSenha">Trocar minha senha</button><button class="sbtn" id="btnSair">Sair</button>';
    foot.insertBefore(box, foot.firstChild);
    $('#btnSair').onclick = sair;
    $('#btnSenha').onclick = () => abrirModal('minhaSenha');
    if (ehGestor()) { $('#btnUsuarios').onclick = () => { abrirModal('usuarios'); listarUsuarios(); }; $('#btnBase').onclick = () => abrirModal('baseModal'); $('#btnConfig').onclick = abrirConfig; }
    // celular: atalho para sair/usuários no topo
    const mb = document.querySelector('.mbrand');
    if (mb) { const b = document.createElement('button'); b.className = 'btn'; b.style.marginLeft = 'auto'; b.textContent = 'Conta'; b.onclick = () => abrirModal('contaMobile'); mb.appendChild(b); }
    $('#cmUsuarios').hidden = !ehGestor(); $('#cmBase').hidden = !ehGestor(); $('#cmConfig').hidden = !ehGestor();
    $('#cmConfig').onclick = () => { fecharModais(); abrirConfig(); };
    $('#cmUsuarios').onclick = () => { fecharModais(); abrirModal('usuarios'); listarUsuarios(); };
    $('#cmBase').onclick = () => { fecharModais(); abrirModal('baseModal'); };
    $('#cmSenha').onclick = () => { fecharModais(); abrirModal('minhaSenha'); };
    $('#cmSair').onclick = sair;
  }

  function abrirModal(id) { $('#' + id).hidden = false; }
  function fecharModais() { document.querySelectorAll('.cmodal').forEach((m) => { m.hidden = true; }); }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-fechar]')) fecharModais(); });

  /* ---------------- MINHA SENHA ---------------- */
  $('#formMinhaSenha').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s1 = $('#ms1').value, s2 = $('#ms2').value, m = $('#msMsg');
    if (s1.length < 8) { m.textContent = 'A senha precisa ter pelo menos 8 caracteres.'; return; }
    if (s1 !== s2) { m.textContent = 'As duas senhas não são iguais.'; return; }
    const { error } = await sb.auth.updateUser({ password: s1 });
    m.textContent = error ? error.message : 'Senha alterada.'; if (!error) e.target.reset();
  });

  /* ---------------- ATUALIZAR BASE (master) ---------------- */
  $('#formBase').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = $('#bArq2').files[0], m = $('#bMsg'); if (!f) { m.textContent = 'Escolha o arquivo.'; return; }
    try { await enviarBase(f, (t) => { m.textContent = t; }); m.textContent = 'Base atualizada. Recarregando…'; setTimeout(() => location.reload(), 800); } catch (err) { m.textContent = err.message; }
  });

  /* ---------------- USUÁRIOS (master) ---------------- */
  async function chamar(body) {
    const { data, error } = await sb.functions.invoke('admin-usuarios', { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.erro) msg = j.erro; } catch (x) { /* sem corpo */ }
      if (/Failed to send|fetch/i.test(msg)) msg = 'A função admin-usuarios não respondeu. Confira se ela foi publicada no Supabase (passo 4 do LEIAME).';
      throw new Error(msg);
    }
    if (data && data.erro) throw new Error(data.erro);
    return data;
  }
  const abasChecks = (pref, marcadas) => ABAS.map(([k, n]) => `<label class="ck"><input type="checkbox" data-aba="${k}" ${k === 'inicio' ? 'checked disabled' : (marcadas.includes(k) ? 'checked' : '')}> ${n}</label>`).join('');
  $('#novoAbas').innerHTML = abasChecks('n', ABAS.map((a) => a[0]));
  $('#gerarSenha').onclick = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(10)); r.forEach((x) => { s += c[x % c.length]; }); $('#uSenha').value = s; $('#uSenha').type = 'text'; };
  $('#formNovo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = $('#uMsg'); m.textContent = 'Criando…';
    const abas = [...document.querySelectorAll('#novoAbas input:checked')].map((i) => i.dataset.aba);
    try {
      await chamar({ acao: 'criar', nome: $('#uNome').value, email: $('#uEmail').value, senha: $('#uSenha').value, papel: $('#uPapel').value, abas });
      m.textContent = 'Usuário criado. Passe o e-mail e a senha para a pessoa; ela pode trocar a senha depois em "Trocar minha senha".';
      e.target.reset(); $('#novoAbas').innerHTML = abasChecks('n', ABAS.map((a) => a[0])); listarUsuarios();
    } catch (err) { m.textContent = err.message; }
  });
  let USUARIOS = [];
  async function listarUsuarios() {
    const t = $('#tblUsuarios'); t.innerHTML = '<tr><td class="muted">Carregando…</td></tr>';
    try { USUARIOS = (await chamar({ acao: 'listar' })).usuarios || []; } catch (err) { t.innerHTML = '<tr><td>' + esc(err.message) + '</td></tr>'; return; }
    t.innerHTML = '<thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Abas</th><th>Ativo</th><th></th></tr></thead><tbody>' + USUARIOS.map((u) => {
      const eu = u.user_id === USER.id || (u.papel === 'admin' && !ehAdmin());
      return `<tr data-u="${esc(u.user_id)}"><td><input type="text" data-f="nome" value="${esc(u.nome)}" aria-label="Nome"></td><td class="mono">${esc(u.email)}</td>
      <td><select data-f="papel" ${eu ? 'disabled' : ''}>${Object.entries(PAPEIS).filter(([k]) => k !== 'admin' || ehAdmin() || u.papel === 'admin').map(([k, n]) => `<option value="${k}" ${u.papel === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
      <td class="abasCell">${['admin', 'master'].includes(u.papel) ? '<span class="muted">todas</span>' : abasChecks('u', u.abas || [])}</td>
      <td><input type="checkbox" data-f="ativo" ${u.ativo ? 'checked' : ''} ${eu ? 'disabled' : ''} aria-label="Ativo"></td>
      <td class="acoes">${u.papel === 'admin' && !ehAdmin() ? '<span class="muted">administrador</span>' : `<button class="btn" data-a="salvar">Salvar</button><button class="btn" data-a="senha">Nova senha</button>${u.user_id === USER.id ? '' : '<button class="btn ghost" data-a="excluir">Excluir</button>'}`}</td></tr>`;
    }).join('') + '</tbody>';
  }
  $('#tblUsuarios').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const tr = b.closest('tr'), id = tr.dataset.u, m = $('#listaMsg');
    try {
      if (b.dataset.a === 'salvar') {
        const abas = [...tr.querySelectorAll('[data-aba]:checked')].map((i) => i.dataset.aba);
        const body = { acao: 'atualizar', user_id: id, nome: tr.querySelector('[data-f=nome]').value, papel: tr.querySelector('[data-f=papel]').value, ativo: tr.querySelector('[data-f=ativo]').checked };
        if (tr.querySelector('[data-aba]')) body.abas = abas;
        await chamar(body); m.textContent = 'Alterações salvas.'; listarUsuarios();
      }
      if (b.dataset.a === 'senha') {
        const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; let s = ''; crypto.getRandomValues(new Uint32Array(10)).forEach((x) => { s += c[x % c.length]; });
        await chamar({ acao: 'senha', user_id: id, senha: s });
        m.innerHTML = 'Nova senha de <b>' + esc(tr.querySelector('.mono').textContent) + '</b>: <span class="mono sel">' + esc(s) + '</span> — copie e passe para a pessoa.';
      }
      if (b.dataset.a === 'excluir') {
        if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = 'Confirmar exclusão'; setTimeout(() => { if (b.isConnected) { delete b.dataset.ok; b.textContent = 'Excluir'; } }, 3000); return; }
        await chamar({ acao: 'excluir', user_id: id }); m.textContent = 'Usuário excluído.'; listarUsuarios();
      }
    } catch (err) { m.textContent = err.message; }
  });

  /* ---------------- CONFIGURAÇÕES · BACKUP (admin e master) ---------------- */
  const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const fmtData = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');
  const baixar = (nome, blob) => DOWNLOADS.save({ filename: nome, data: blob });

  async function abrirConfig() {
    abrirModal('configModal'); listarBackups();
    const { data } = await sb.from('config').select('valor').eq('chave', 'ultimo_backup_baixado').maybeSingle();
    const v = data && data.valor;
    if (!v) { $('#bkUltimo').innerHTML = '<b>Nenhum backup completo foi baixado ainda.</b>'; return; }
    const dias = Math.floor((Date.now() - new Date(v.em)) / 864e5);
    $('#bkUltimo').innerHTML = 'Último backup completo baixado em ' + esc(fmtData(v.em)) + ' por ' + esc(v.por) + (dias >= 7 ? ' — <b>faz ' + dias + ' dias, baixe um novo.</b>' : '.');
  }
  async function todasLinhas(tabela, colunas, ordem, msgFn, lote) {
    let all = [], from = 0; lote = lote || 1000;
    for (;;) {
      const { data, error } = await sb.from(tabela).select(colunas).order(ordem).range(from, from + lote - 1);
      if (error) throw new Error(tabela + ': ' + error.message);
      all = all.concat(data || []); if (msgFn) msgFn(tabela + ': ' + all.length);
      if (!data || data.length < lote) break; from += lote;
    }
    return all;
  }
  $('#bkBaixar').onclick = async () => {
    const m = (t) => { $('#bkMsg').textContent = t; }; const b = $('#bkBaixar'); b.disabled = true;
    try {
      m('Lendo a base…');
      const { data: base, error } = await sb.from('base').select('chave,conteudo'); if (error) throw error;
      const regs = await todasLinhas('registros', 'colecao,id,dados,atualizado_por,atualizado_em', 'id', null);
      const perfis = await todasLinhas('perfis', '*', 'criado_em', null);
      const xmls = await todasLinhas('notas_xml', 'chave,xml,emissao,tp_nf,origem', 'chave', (t) => m('Baixando XMLs… ' + t.split(': ')[1]), 200);
      m('Montando o arquivo…');
      const z = new JSZip();
      z.file('info.json', JSON.stringify({ sistema: 'Painel Cia Beauty', gerado_em: new Date().toISOString(), por: USER.email, registros: regs.length, xmls: xmls.length }, null, 2));
      z.file('base.json', JSON.stringify(base));
      z.file('registros.json', JSON.stringify(regs));
      z.file('perfis.json', JSON.stringify(perfis, null, 2));
      z.file('notas_xml_indice.json', JSON.stringify(xmls.map(({ xml, ...r }) => r)));
      xmls.forEach((x) => z.file('xml/' + x.chave + '.xml', x.xml));
      const blob = await z.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      await baixar('backup-cia-beauty-' + hoje() + '.zip', blob);
      await sb.from('config').upsert({ chave: 'ultimo_backup_baixado', valor: { em: new Date().toISOString(), por: PERFIL.nome || USER.email } });
      m('Backup baixado (' + kb(blob.size) + ').'); abrirConfig();
    } catch (err) { m('Erro: ' + (err.message || err)); }
    b.disabled = false;
  };
  async function listarBackups() {
    const t = $('#tblBackups'); t.innerHTML = '<tr><td class="muted">Carregando…</td></tr>';
    const { data, error } = await sb.from('backups').select('id,criado_em,tipo,tamanho').order('criado_em', { ascending: false });
    if (error) { t.innerHTML = '<tr><td>' + esc(error.message) + '</td></tr>'; return; }
    if (!data.length) { t.innerHTML = '<tr><td class="muted">Nenhuma cópia ainda. A primeira automática sai às 03:00.</td></tr>'; return; }
    t.innerHTML = '<thead><tr><th>Data</th><th>Tipo</th><th>Tamanho</th><th></th></tr></thead><tbody>' + data.map((r) =>
      `<tr data-b="${r.id}"><td>${esc(fmtData(r.criado_em))}</td><td>${esc(r.tipo)}</td><td>${kb(r.tamanho || 0)}</td><td class="acoes"><button class="btn" data-k="baixar">Baixar</button>${ehAdmin() ? '<button class="btn ghost" data-k="restaurar">Restaurar</button>' : ''}</td></tr>`).join('') + '</tbody>';
  }
  $('#bkAgora').onclick = async () => {
    const m = $('#bkMsg2'); m.textContent = 'Criando…';
    const { error } = await sb.rpc('fazer_backup', { p_tipo: 'manual' });
    m.textContent = error ? 'Erro: ' + error.message : 'Cópia criada.'; listarBackups();
  };
  $('#tblBackups').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return; const id = +b.closest('tr').dataset.b, m = $('#bkMsg2');
    if (b.dataset.k === 'baixar') {
      const { data, error } = await sb.from('backups').select('criado_em,conteudo').eq('id', id).single();
      if (error) { m.textContent = 'Erro: ' + error.message; return; }
      baixar('copia-cia-beauty-' + data.criado_em.slice(0, 10) + '-' + id + '.json', new Blob([JSON.stringify(data.conteudo)], { type: 'application/json' }));
    }
    if (b.dataset.k === 'restaurar') {
      if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = 'Confirmar restauração'; setTimeout(() => { if (b.isConnected) { delete b.dataset.ok; b.textContent = 'Restaurar'; } }, 4000); return; }
      m.textContent = 'Restaurando…';
      const { error } = await sb.rpc('restaurar_backup', { p_id: id });
      if (error) { m.textContent = 'Erro: ' + error.message; return; }
      m.textContent = 'Restaurado. Recarregando…'; setTimeout(() => location.reload(), 900);
    }
  });
  $('#bkRestArq').onclick = async (e) => {
    const b = e.target, m = (t) => { $('#bkMsg3').textContent = t; }; const f = $('#bkArq').files[0];
    if (!f) return m('Escolha o arquivo .zip do backup.');
    if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = 'Confirmar: substituir tudo'; setTimeout(() => { if (b.isConnected) { delete b.dataset.ok; b.textContent = 'Restaurar arquivo'; } }, 5000); return; }
    b.disabled = true;
    try {
      const z = await JSZip.loadAsync(f);
      if (!z.file('base.json') || !z.file('registros.json')) throw new Error('Esse arquivo não é um backup do painel.');
      m('Guardando uma cópia do estado atual…');
      const { error: e0 } = await sb.rpc('fazer_backup', { p_tipo: 'antes da restauração' }); if (e0) throw e0;
      const base = JSON.parse(await z.file('base.json').async('string'));
      const regs = JSON.parse(await z.file('registros.json').async('string'));
      m('Restaurando a base…');
      for (const r of base) { const { error } = await sb.from('base').upsert({ chave: r.chave, conteudo: r.conteudo }); if (error) throw error; }
      m('Restaurando simulações, notas, vendas e estoque…');
      const { error: e1 } = await sb.from('registros').delete().neq('colecao', ''); if (e1) throw e1;
      for (let i = 0; i < regs.length; i += 500) { const { error } = await sb.from('registros').insert(regs.slice(i, i + 500).map((r) => ({ colecao: r.colecao, id: r.id, dados: r.dados }))); if (error) throw error; }
      const idx = z.file('notas_xml_indice.json') ? JSON.parse(await z.file('notas_xml_indice.json').async('string')) : [];
      const meta = {}; idx.forEach((r) => { meta[r.chave] = r; });
      const arqs = Object.keys(z.files).filter((n) => /^xml\/.+\.xml$/.test(n));
      const rows = [];
      for (const n of arqs) { const chave = n.slice(4, -4); const xml = await z.file(n).async('string'); rows.push(Object.assign(linhaXml(chave, xml, 'base'), meta[chave] ? { origem: meta[chave].origem } : {})); }
      await gravarXmls(rows, m);
      m('Restaurado. Recarregando…'); setTimeout(() => location.reload(), 900);
    } catch (err) { m('Erro: ' + (err.message || err)); b.disabled = false; }
  };

  iniciar();
})();
