/* Painel de Projetos Cia Beauty — app */
(function(){
const D=JSON.parse(document.getElementById('data').textContent);
const fmtI=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0});
const fmtR=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const fmtR0=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const fmtU=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4});
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=s=>String(s||'').replace(/ (LTDA|S\/A|SA|EPP|ME|-ME)\b.*$/i,'').trim();
$('#upd').textContent=D.atualizado;

/* ---------- estado ---------- */
// ov[id] = {qtd, abater, comps, incluir}; novos = projetos criados aqui (ov com custom)
let ov={};
let db=null, saveMode='local';
const LS='ciab-painel-v1';
function lsLoad(){try{const r=localStorage.getItem(LS);if(r)ov=JSON.parse(r)||{}}catch(e){}}
function lsSave(){try{localStorage.setItem(LS,JSON.stringify(ov))}catch(e){}}
lsLoad();
function allProjects(){
  const base=D.projetos.map(p=>p);
  Object.keys(ov).forEach(id=>{const o=ov[id];if(o&&o.custom&&!o.removido)base.push(Object.assign({id,comps:[],rec:0,p2:0,estrutura:false,novo:true},o.custom))});
  return base;
}
function byId(id){return allProjects().find(p=>p.id===id)}
function st(p){return ov[p.id]||{}}
function comps(p){const o=st(p);return o.comps||p.comps||[]}
function total(p){return (p.p1||0)+(p.p2||0)}
function saldoEnt(p){return Math.max(0,total(p)-(p.rec||0))}
function qtd(p){const o=st(p);return o.qtd!=null?o.qtd:saldoEnt(p)}
function abater(p){const o=st(p);return o.abater!=null?o.abater:true}
function incluir(p){const o=st(p);return o.incluir!=null?o.incluir:qtd(p)>0}
function calc(p){
  const Q=qtd(p),ab=abater(p);let unit=0,desemb=0,bruto=0,falta=0;const linhas=[];
  comps(p).forEach(c=>{
    const coef=+c.coef||0,cu=c.custo==null||c.custo===''?null:+c.custo;
    const nec=Q*coef,est=ab?Math.min(Math.max((+c.saldo||0)+(XIN[c.cod]||0),0),nec):0,comprar=nec-est;
    const v=comprar*(cu||0);if(cu==null)falta++;
    unit+=coef*(cu||0);desemb+=v;bruto+=nec*(cu||0);
    linhas.push({c,nec,est,comprar,v,cu});
  });
  return{Q,unit,desemb,bruto,falta,linhas,semEstrutura:comps(p).length===0};
}
function status(p){const t=total(p),r=p.rec||0;if(t>0&&r>=t)return['ok','Entregue'];if(r>0)return['warn','Parcial'];return['bad','Aguardando']}

/* ---------- persistência ---------- */
const timers={};let chain=Promise.resolve();
function setSave(kind,txt){const el=$('#saveState');el.innerHTML='<span class="dot '+kind+'"></span><span>'+esc(txt)+'</span>'}
function persist(id){
  lsSave();
  if(!db){setSave('warn','Salvo só neste navegador');return}
  setSave('','Salvando…');
  clearTimeout(timers[id]);
  timers[id]=setTimeout(()=>{
    if(ov[id]&&MYID){ov[id]._por=MYID;ov[id]._em=new Date().toISOString()}
    const body=JSON.parse(JSON.stringify(ov[id]||{removido:true}));
    chain=chain.then(()=>db.collection('projetos').doc(id).set(body)).then(()=>{delete timers[id];setSave('ok','Salvo na nuvem · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}))}).catch(e=>{setSave('warn','Não salvou na nuvem — ficou neste navegador')});
  },700);
}
function setOv(p,patch){ov[p.id]=Object.assign({},ov[p.id]||{},patch);persist(p.id);renderAll()}

/* ---------- KPIs ---------- */
function renderKpis(){
  const ps=allProjects();
  const ped=ps.reduce((a,p)=>a+total(p),0),rec=ps.reduce((a,p)=>a+(p.rec||0),0);
  const ent=ps.filter(p=>status(p)[0]==='ok').length,parc=ps.filter(p=>status(p)[0]==='warn').length;
  let des=0,sem=0,n=0;ps.forEach(p=>{if(!incluir(p))return;n++;const c=calc(p);des+=c.desemb;if(c.semEstrutura||c.falta)sem++});
  $('#kpis').innerHTML=[
    ['Projetos',fmtI.format(ps.length),ent+' entregues · '+parc+' parciais'],
    ['Unidades pedidas',fmtI.format(ped),'1º + 2º pedido'],
    ['Recebidas',fmtI.format(rec),(ped?Math.round(rec/ped*100):0)+'% do pedido'],
    ['A receber',fmtI.format(ped-rec),'unidades em aberto'],
    ['Desembolso previsto',fmtR0.format(des),n+' projetos na carteira',true],
    ['Sem custo completo',fmtI.format(sem),'projetos para estruturar']
  ].map(k=>'<div class="kpi'+(k[3]?' hl':'')+'"><span class="eyebrow">'+k[0]+'</span><span class="v">'+k[1]+'</span><span class="s">'+k[2]+'</span></div>').join('');
}

/* ---------- ENTREGAS ---------- */
let colFilter='';
function renderEntregas(){
  const ps=allProjects(),cols={};
  ps.forEach(p=>{const c=cols[p.colecao]||(cols[p.colecao]={n:0,t:0,r:0});c.n++;c.t+=total(p);c.r+=p.rec||0});
  $('#colTiles').innerHTML=Object.entries(cols).map(([k,c])=>{const pc=c.t?c.r/c.t*100:0;return '<button class="tile" data-col="'+esc(k)+'" aria-pressed="'+(colFilter===k)+'"><span class="eyebrow">'+esc(k)+' · '+c.n+' SKUs</span><span class="big">'+fmtI.format(c.r)+' <span class="muted">/ '+fmtI.format(c.t)+'</span></span><div class="prog"><i style="width:'+pc.toFixed(1)+'%"></i></div><span class="note">'+pc.toFixed(0)+'% recebido</span></button>'}).join('');
  const q=$('#entSearch').value.trim().toLowerCase(),sf=$('#entStatus').value;
  const rows=ps.filter(p=>(!colFilter||p.colecao===colFilter)&&(!sf||status(p)[0]===sf)&&(!q||[p.sku,p.codigo,p.forn,p.colecao].join(' ').toLowerCase().includes(q)));
  let T=[0,0,0,0];const VC=vendasPorCod(),EC=estPorCod();
  const body=rows.map(p=>{const s=status(p),t=total(p),r=p.rec||0,pc=t?Math.min(100,r/t*100):0;T[0]+=p.p1||0;T[1]+=p.p2||0;T[2]+=t;T[3]+=r;
    return '<tr><td>'+esc(p.colecao)+'</td><td class="mono">'+esc(p.codigo||'—')+'</td><td>'+esc(p.sku)+(p.novo?' <span class="pill neu">novo</span>':'')+'</td><td>'+esc(p.forn||'')+'</td><td class="n">'+fmtI.format(p.p1||0)+'</td><td class="n">'+fmtI.format(p.p2||0)+'</td><td class="n">'+fmtI.format(t)+'</td><td class="n">'+fmtI.format(r)+'</td><td><div class="prog" title="'+pc.toFixed(0)+'%"><i style="width:'+pc.toFixed(1)+'%"></i></div></td><td class="n">'+fmtI.format(Math.max(0,t-r))+'</td><td class="n">'+(VC[normK(p.codigo)]?fmtI.format(VC[normK(p.codigo)].q):'—')+'</td><td class="n">'+(EC[normK(p.codigo)]?fmtI.format(EC[normK(p.codigo)].qtd):'—')+'</td><td><span class="pill '+s[0]+'">'+s[1]+'</span>'+(p.est?' <span class="pill warn" title="'+esc(p.src)+'">estimado</span>':'')+'</td><td class="note">'+esc(p.src||'')+'</td></tr>'}).join('');
  $('#entTbl').innerHTML='<thead><tr><th>Coleção</th><th>Código</th><th>SKU</th><th>Fornecedor</th><th class="n">1º pedido</th><th class="n">2º pedido</th><th class="n">Total</th><th class="n">Recebido</th><th>Progresso</th><th class="n">Saldo</th><th class="n">Vendido</th><th class="n">Estoque Stralog</th><th>Status</th><th>Origem</th></tr></thead><tbody>'+(body||'<tr><td colspan="14" class="muted">Nenhum projeto com esse filtro.</td></tr>')+'</tbody><tfoot><tr><td colspan="4">'+rows.length+' projetos</td><td class="n">'+fmtI.format(T[0])+'</td><td class="n">'+fmtI.format(T[1])+'</td><td class="n">'+fmtI.format(T[2])+'</td><td class="n">'+fmtI.format(T[3])+'</td><td></td><td class="n">'+fmtI.format(T[2]-T[3])+'</td><td colspan="4"></td></tr></tfoot>';
}
$('#colTiles').addEventListener('click',e=>{const b=e.target.closest('.tile');if(!b)return;colFilter=colFilter===b.dataset.col?'':b.dataset.col;renderEntregas()});
$('#entSearch').addEventListener('input',renderEntregas);$('#entStatus').addEventListener('change',renderEntregas);

/* ---------- SIMULADOR ---------- */
let cur=D.projetos[0].id;
function renderPlist(){
  const q=$('#simSearch').value.trim().toLowerCase();
  $('#plist').innerHTML=allProjects().filter(p=>!q||[p.sku,p.codigo,p.colecao].join(' ').toLowerCase().includes(q)).map(p=>{const c=calc(p);
    const tag=c.semEstrutura?'<span class="pill bad">sem estrutura</span>':c.falta?'<span class="pill warn">custo faltando</span>':'<span class="mono" style="font-size:.78rem">'+fmtR.format(c.unit)+'/un</span>';
    return '<button class="pitem" data-id="'+esc(p.id)+'" aria-current="'+(p.id===cur)+'"><span class="nm" title="'+esc(p.sku)+'">'+esc(p.sku)+'</span>'+tag+'<span class="cd">'+esc(p.codigo||p.colecao)+'</span><span class="cd" style="text-align:right">'+fmtI.format(c.Q)+' un</span></button>'}).join('');
}
$('#plist').addEventListener('click',e=>{const b=e.target.closest('.pitem');if(!b)return;cur=b.dataset.id;renderSim()});
$('#simSearch').addEventListener('input',renderPlist);

function origemPill(c){const o=c.origem||'';if(o==='NF')return '<span class="pill ok">NF</span>';if(o==='planilha')return '<span class="pill neu">planilha</span>';if(o==='info')return '<span class="pill ok">informado</span>';if(o==='ref')return '<span class="pill warn">referência</span>';if(o==='?')return '<span class="pill bad">não encontrado</span>';if(o==='orc')return '<span class="pill warn">a orçar</span>';return ''}
function renderEditor(){
  const p=byId(cur);if(!p){cur=D.projetos[0].id;return renderEditor()}
  const c=calc(p),o=st(p);
  const copyOpts=allProjects().filter(x=>x.id!==p.id&&comps(x).length).map(x=>'<option value="'+esc(x.id)+'">'+esc((x.codigo?x.codigo+' · ':'')+x.sku)+'</option>').join('');
  let h='<div class="row" style="align-items:flex-start"><div class="grow" style="min-width:0"><div class="eyebrow">'+esc(p.colecao)+(p.codigo?' · '+esc(p.codigo):'')+(p.tipo?' · '+esc(p.tipo):'')+'</div><h2>'+esc(p.sku)+'</h2>'+auditLine(o)+'<div class="note">Pedido '+fmtI.format(total(p))+' · recebido '+fmtI.format(p.rec||0)+' · saldo '+fmtI.format(saldoEnt(p))+' · fornecedor '+esc(p.forn||'—')+'</div></div>'
   +(p.novo?'<button class="btn ghost" id="delProj">Excluir projeto</button>':'')+'</div>';
  h+='<div class="row" style="margin-top:14px"><label class="row" style="gap:6px">Quantidade a produzir <input type="number" id="simQ" min="0" step="100" value="'+c.Q+'" style="width:120px"></label>'
   +'<button class="btn" data-q="'+saldoEnt(p)+'">Saldo ('+fmtI.format(saldoEnt(p))+')</button><button class="btn" data-q="3000">3.000</button><button class="btn" data-q="5000">5.000</button><button class="btn" data-q="10000">10.000</button>'
   +'<label class="chk"><input type="checkbox" id="simAb" '+(abater(p)?'checked':'')+'> Abater insumos em estoque</label>'
   +'<label class="chk"><input type="checkbox" id="simInc" '+(incluir(p)?'checked':'')+'> Incluir na carteira</label></div>';
  h+='<div class="res"><div class="box"><div class="eyebrow">Custo unitário</div><div class="v num">'+fmtR.format(c.unit)+'</div></div>'
   +'<div class="box"><div class="eyebrow">Custo do lote</div><div class="v num">'+fmtR0.format(c.bruto)+'</div><div class="note">'+fmtI.format(c.Q)+' un × custo unitário</div></div>'
   +'<div class="box hl"><div class="eyebrow">Necessidade de caixa</div><div class="v num">'+fmtR0.format(c.desemb)+'</div><div class="note">'+(abater(p)?'já descontando estoque':'sem abater estoque')+'</div></div>'
   +'<div class="box"><div class="eyebrow">Economia com estoque</div><div class="v num">'+fmtR0.format(c.bruto-c.desemb)+'</div></div></div>';
  if(c.semEstrutura)h+='<div class="callout">Este projeto ainda não tem estrutura de custo. Busque os insumos no catálogo de NFs abaixo, adicione uma linha manual ou copie a estrutura de um produto parecido.</div>';
  else if(c.falta)h+='<div class="callout">'+c.falta+' insumo(s) sem custo unitário — preencha para o total ficar completo.</div>';
  if(comps(p).some(x=>x.auto)&&!o.comps)h+='<div class="note" style="margin-bottom:8px">Estrutura inicial montada com o preço de envase das NFs da Giudit (matéria-prima + mão de obra). Adicione frasco, rótulo, cartucho e caixa para fechar o custo.</div>';
  h+='<div class="tbl-wrap ed"><table><thead><tr><th>Insumo</th><th>Fornecedor</th><th class="n">Qtd/un</th><th class="n">Custo un. (R$)</th><th class="n">Estoque</th><th class="n">Necessidade</th><th class="n">Comprar</th><th class="n">Desembolso</th><th></th></tr></thead><tbody>';
  c.linhas.forEach((l,i)=>{h+='<tr><td><input type="text" data-i="'+i+'" data-f="nome" value="'+esc(l.c.nome)+'" aria-label="Insumo"><div class="note"><span class="mono">'+esc(l.c.cod||'')+'</span> '+origemPill(l.c)+(l.c.nota?' · '+esc(l.c.nota):'')+'</div></td><td class="note">'+esc(short(l.c.forn))+'</td>'
    +'<td class="n"><input type="number" step="0.01" min="0" data-i="'+i+'" data-f="coef" value="'+l.c.coef+'" style="width:70px" aria-label="Quantidade por unidade"></td>'
    +'<td class="n"><input type="number" step="0.01" min="0" data-i="'+i+'" data-f="custo" value="'+(l.cu==null?'':l.cu)+'" placeholder="?" aria-label="Custo unitário"></td>'
    +'<td class="n"><input type="number" step="1" data-i="'+i+'" data-f="saldo" value="'+(+l.c.saldo||0)+'" aria-label="Estoque"></td>'
    +'<td class="n">'+fmtI.format(l.nec)+'</td><td class="n">'+fmtI.format(l.comprar)+'</td><td class="n">'+fmtR.format(l.v)+'</td><td><button class="btn ghost" data-del="'+i+'" aria-label="Remover">✕</button></td></tr>'});
  if(!c.linhas.length)h+='<tr><td colspan="9" class="muted">Nenhum insumo ainda.</td></tr>';
  h+='</tbody><tfoot><tr><td colspan="7">Total</td><td class="n">'+fmtR.format(c.desemb)+'</td><td></td></tr></tfoot></table></div>';
  h+='<div class="row" style="margin-top:12px"><div class="searchbox grow" style="min-width:240px"><input type="search" id="addSearch" placeholder="Adicionar insumo do catálogo de NFs (ex.: frasco 200ml, rótulo, caixa)" style="width:100%" autocomplete="off" aria-label="Adicionar insumo"><div class="sugg" id="sugg" hidden></div></div>'
   +'<button class="btn" id="addManual">+ Linha manual</button>'
   +(copyOpts?'<select id="copyFrom" aria-label="Copiar estrutura"><option value="">Copiar estrutura de…</option>'+copyOpts+'</select>':'')
   +(o.comps||o.qtd!=null?'<button class="btn ghost" id="resetP">Restaurar original</button>':'')+'</div>';
  h+='<p class="note">Necessidade = quantidade × qtd/un. Comprar = necessidade − estoque disponível. O estoque inicial vem da aba Estruturas (recebido − consumido); nos demais itens, informe o que tem na Stralog.</p>';
  $('#editor').innerHTML=h;
}
function editComps(p,fn){const arr=JSON.parse(JSON.stringify(comps(p)));fn(arr);setOv(p,{comps:arr})}
const ed=$('#editor');
ed.addEventListener('change',e=>{const p=byId(cur);const t=e.target;
  if(t.id==='simQ'){setOv(p,{qtd:Math.max(0,+t.value||0)});return}
  if(t.id==='simAb'){setOv(p,{abater:t.checked});return}
  if(t.id==='simInc'){setOv(p,{incluir:t.checked});return}
  if(t.id==='copyFrom'&&t.value){const src=byId(t.value);editComps(p,a=>{a.length=0;comps(src).forEach(x=>a.push(Object.assign({},x,{auto:false})))});return}
  if(t.dataset.f){const i=+t.dataset.i,f=t.dataset.f;editComps(p,a=>{a[i][f]=f==='nome'?t.value:(t.value===''?(f==='custo'?null:0):+t.value)})}
});
ed.addEventListener('click',e=>{const p=byId(cur);const t=e.target.closest('button');if(!t)return;
  if(t.dataset.q!=null){setOv(p,{qtd:+t.dataset.q});return}
  if(t.dataset.del!=null){editComps(p,a=>a.splice(+t.dataset.del,1));return}
  if(t.id==='addManual'){editComps(p,a=>a.push({nome:'Novo insumo',cod:'',forn:'',custo:null,coef:1,saldo:0}));return}
  if(t.id==='resetP'){const o=Object.assign({},ov[p.id]);delete o.comps;delete o.qtd;ov[p.id]=o;persist(p.id);renderAll();return}
  if(t.id==='delProj'){ov[p.id]={removido:true};persist(p.id);cur=D.projetos[0].id;renderAll();return}
  if(t.dataset.cat!=null){const r=D.catalogo[+t.dataset.cat];editComps(p,a=>a.push({nome:r[1],cod:r[0],forn:r[2],custo:r[4],compra:r[4],coef:1,saldo:0}));return}
});
ed.addEventListener('input',e=>{if(e.target.id!=='addSearch')return;const q=e.target.value.trim().toLowerCase(),box=$('#sugg');
  if(q.length<2){box.hidden=true;return}
  const terms=q.split(/\s+/);const hits=[];
  D.catalogo.forEach((r,i)=>{const s=(r[0]+' '+r[1]+' '+r[2]).toLowerCase();if(terms.every(t=>s.includes(t)))hits.push(i)});
  box.innerHTML=hits.slice(0,40).map(i=>{const r=D.catalogo[i];return '<button data-cat="'+i+'"><div>'+esc(r[1])+'</div><div class="note mono">'+esc(r[0])+' · '+esc(short(r[2]))+' · '+fmtR.format(r[4])+' · '+fmtI.format(r[3])+' un compradas</div></button>'}).join('')||'<div class="note" style="padding:8px 10px">Nada encontrado. Use "+ Linha manual".</div>';
  box.hidden=false;
});
function renderSim(){renderPlist();renderEditor()}

/* novo projeto */
$('#btnNovo').addEventListener('click',()=>{$('#nCopy').innerHTML='<option value="">Começar vazio</option>'+allProjects().filter(x=>comps(x).length).map(x=>'<option value="'+esc(x.id)+'">'+esc((x.codigo?x.codigo+' · ':'')+x.sku)+'</option>').join('');$('#modal').hidden=false;$('#nColecao').focus()});
$('#nCancel').addEventListener('click',()=>{$('#modal').hidden=true});
$('#novoForm').addEventListener('submit',e=>{e.preventDefault();
  const id='NOVO-'+Date.now().toString(36);const src=$('#nCopy').value?byId($('#nCopy').value):null;
  ov[id]={custom:{colecao:$('#nColecao').value.trim(),sku:$('#nSku').value.trim(),forn:$('#nForn').value.trim(),p1:+$('#nQtd').value||0,codigo:null,tipo:''},comps:src?JSON.parse(JSON.stringify(comps(src))):[],incluir:true};
  persist(id);cur=id;$('#modal').hidden=true;$('#novoForm').reset();renderAll();
});

/* ---------- CARTEIRA ---------- */
function cartRows(){return allProjects().map(p=>({p,c:calc(p),inc:incluir(p)}))}
let cartQ='',cartF='todos';
const semAc=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function cartFiltro({p,c,inc}){
  if(cartF==='marcados'&&!inc)return false;if(cartF==='desmarcados'&&inc)return false;
  if(cartF==='completo'&&(c.semEstrutura||c.falta))return false;if(cartF==='falta'&&(c.semEstrutura||!c.falta))return false;if(cartF==='sem'&&!c.semEstrutura)return false;
  if(!cartQ)return true;
  const alvo=semAc([p.sku,p.codigo,p.colecao].concat(c.linhas.map(l=>(l.c.forn||'')+' '+(l.c.nome||''))).join(' '));
  return semAc(cartQ).split(/\s+/).filter(Boolean).every(t=>alvo.includes(t));
}
function renderCarteira(){
  const todas=cartRows();const filtrando=!!cartQ||cartF!=='todos';const rows=todas.filter(cartFiltro);let T=0,TQ=0;const forn={},col={};let sem=0,falta=0;
  const body=rows.map(({p,c,inc})=>{if(inc){T+=c.desemb;TQ+=c.Q;col[p.colecao]=(col[p.colecao]||0)+c.desemb;c.linhas.forEach(l=>{const k=short(l.c.forn)||'Sem fornecedor';forn[k]=(forn[k]||0)+l.v});if(c.semEstrutura)sem++;else if(c.falta)falta++}
    const flag=c.semEstrutura?'<span class="pill bad">sem estrutura</span>':c.falta?'<span class="pill warn">custo faltando</span>':'<span class="pill ok">completo</span>';
    return '<tr'+(inc?'':' class="muted"')+'><td><input type="checkbox" data-inc="'+esc(p.id)+'" '+(inc?'checked':'')+' aria-label="Incluir"></td><td><button class="btn ghost" style="color:inherit;padding:0;text-align:left" data-open="'+esc(p.id)+'">'+esc(p.sku)+'</button><div class="note">'+esc(p.colecao)+(p.codigo?' · '+esc(p.codigo):'')+'</div></td><td class="n">'+fmtI.format(c.Q)+'</td><td class="n">'+fmtR.format(c.unit)+'</td><td class="n">'+fmtR0.format(c.desemb)+'</td><td>'+flag+'</td></tr>'}).join('');
  let TG=0;if(filtrando)todas.forEach(({c,inc})=>{if(inc)TG+=c.desemb});
  const vazio=rows.length?'':'<tr><td></td><td colspan="5" class="muted">Nenhum projeto encontrado para essa busca.</td></tr>';
  $('#cartTbl').innerHTML='<thead><tr><th></th><th>Projeto</th><th class="n">Qtd</th><th class="n">Custo un.</th><th class="n">Caixa</th><th>Estrutura</th></tr></thead><tbody>'+body+vazio+'</tbody><tfoot><tr><td></td><td>'+(filtrando?'Total dos filtrados ('+rows.length+' de '+todas.length+')':'Total da carteira')+'</td><td class="n">'+fmtI.format(TQ)+'</td><td></td><td class="n">'+fmtR0.format(T)+'</td><td></td></tr>'+(filtrando?'<tr><td></td><td class="muted">Total da carteira (todos marcados)</td><td></td><td></td><td class="n muted">'+fmtR0.format(TG)+'</td><td></td></tr>':'')+'</tfoot>';
  const w=$('#cartWarn');if(sem||falta){w.hidden=false;w.textContent=(sem?sem+' projeto(s) sem estrutura entram com R$ 0':'')+(sem&&falta?' e ':'')+(falta?falta+' com custo faltando':'')+'. Abra cada um em Custos para completar e o total fica real.'}else w.hidden=true;
  bars('#cartForn',Object.entries(forn).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,10));
  bars('#cartCol',Object.entries(col).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]));
}
function bars(sel,arr){const m=Math.max(1,...arr.map(x=>x[1]));$(sel).innerHTML=arr.length?arr.map(([k,v])=>'<span class="lab" title="'+esc(k)+'">'+esc(k)+'</span><span class="num" style="text-align:right">'+fmtR0.format(v)+'</span><div class="b"><i style="width:'+(v/m*100).toFixed(1)+'%"></i></div>').join(''):'<span class="note">Nada ainda.</span>'}
$('#cartSearch').addEventListener('input',e=>{cartQ=e.target.value.trim();renderCarteira()});
$('#cartChips').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;cartF=b.dataset.f;document.querySelectorAll('#cartChips .chip').forEach(x=>x.setAttribute('aria-pressed',x===b));renderCarteira()});
$('#cartTbl').addEventListener('change',e=>{const id=e.target.dataset.inc;if(id)setOv(byId(id),{incluir:e.target.checked})});
$('#cartTbl').addEventListener('click',e=>{const b=e.target.closest('[data-open]');if(!b)return;cur=b.dataset.open;showTab('simulador')});
$('#btnCsv').addEventListener('click',async()=>{
  const L=[['Coleção','Código','Projeto','Qtd','Insumo','Fornecedor','Qtd/un','Custo un','Necessidade','Estoque usado','Comprar','Desembolso'].join(';')];
  const n=x=>String(Math.round(x*10000)/10000).replace('.',',');
  cartRows().filter(r=>r.inc).forEach(({p,c})=>{if(!c.linhas.length)L.push([p.colecao,p.codigo||'',p.sku,c.Q,'(sem estrutura)','','','','','','',0].join(';'));c.linhas.forEach(l=>L.push([p.colecao,p.codigo||'',p.sku,c.Q,l.c.nome,l.c.forn,n(+l.c.coef||0),n(l.cu||0),n(l.nec),n(l.est),n(l.comprar),n(l.v)].map(x=>String(x).replace(/;/g,',')).join(';')))});
  const csv='﻿'+L.join('\n');
  try{const dl=await claude.use('downloads');if(dl){await dl.save({filename:'carteira_simulacao.csv',data:csv});return}}catch(e){}
  try{await navigator.clipboard.writeText(csv);$('#btnCsv').textContent='CSV copiado';setTimeout(()=>$('#btnCsv').textContent='Exportar CSV',2000)}catch(e){$('#btnCsv').textContent='Exportação indisponível aqui'}
});

/* ---------- COMPRAS ---------- */
function renderCompras(){
  const ent=Object.entries(D.comprasMes).sort();const W=Math.max(520,ent.length*52),H=220,pl=56,pb=28,pt=12;const m=Math.max(...ent.map(x=>x[1]));
  const step=Math.ceil(m/4/100000)*100000;const top=step*4;const bw=(W-pl-10)/ent.length;
  const mes=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  let s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Compras por mês">';
  for(let i=0;i<=4;i++){const y=H-pb-(H-pb-pt)*i/4;s+='<line x1="'+pl+'" x2="'+(W-6)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)" stroke-width="1"/><text x="'+(pl-6)+'" y="'+(y+3)+'" text-anchor="end">'+(step*i/1000).toLocaleString('pt-BR')+' mil</text>'}
  ent.forEach(([k,v],i)=>{const h=(H-pb-pt)*v/top,x=pl+i*bw+bw*.18,y=H-pb-h;const[yy,mm]=k.split('-');
    s+='<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+(bw*.64).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2" fill="var(--accent)"><title>'+mes[+mm-1]+'/'+yy+': '+fmtR0.format(v)+'</title></rect><text x="'+(x+bw*.32).toFixed(1)+'" y="'+(H-pb+14)+'" text-anchor="middle">'+mes[+mm-1]+'/'+yy.slice(2)+'</text>'});
  $('#chartMes').innerHTML=s+'</svg>';
  bars('#topForn',D.comprasForn.slice(0,12).map(([k,v])=>[short(k),v]));
  renderCat();
}
function renderCat(){
  const q=$('#catSearch').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows=D.catalogo.filter(r=>{const s=(r[0]+' '+r[1]+' '+r[2]).toLowerCase();return q.every(t=>s.includes(t))}).sort((a,b)=>b[5].localeCompare(a[5])).slice(0,300);
  $('#catTbl').innerHTML='<thead><tr><th>Código</th><th>Descrição</th><th>Fornecedor</th><th class="n">Qtd comprada</th><th class="n">Último preço</th><th class="n">Última NF</th></tr></thead><tbody>'+rows.map(r=>'<tr><td class="mono">'+esc(r[0])+'</td><td>'+esc(r[1])+'</td><td class="note">'+esc(short(r[2]))+'</td><td class="n">'+fmtI.format(r[3])+'</td><td class="n">'+fmtR.format(r[4])+'</td><td class="n">'+(r[5]?r[5].split('-').reverse().join('/'):'—')+'</td></tr>').join('')+'</tbody>';
}
$('#catSearch').addEventListener('input',renderCat);

/* ---------- NOTAS XML (importar / exportar) ---------- */
const BASE_CH=new Set(D.chaves||[]);
const CAT_BASE=D.catalogo.slice(),MES_BASE=Object.assign({},D.comprasMes);
D.projetos.forEach(p=>{p.rec0=p.rec||0});
let notas={};let XIN={},XOUT={};let notaFiltro='',notaAberta=null;
const LSN='ciab-notas-v1';const BASEN={};(D.notasBase||[]).forEach(n=>{BASEN[n.chave]=n});
const REMOV=new Set();
function mergeNotas(user){const out=Object.assign({},BASEN);REMOV.clear();Object.keys(user||{}).forEach(k=>{const u=user[k];if(u&&u.removido){delete out[k];REMOV.add(k)}else if(u&&u.chave)out[k]=Object.assign({},BASEN[k]||{},u)});return out}
try{const r=localStorage.getItem(LSN);notas=mergeNotas(r?JSON.parse(r):{})}catch(e){notas=mergeNotas({})}
let XMLB=null;
async function xmlDe(n){if(n.xml)return n.xml;if(!XMLB)XMLB={};if(!(n.chave in XMLB)){try{XMLB[n.chave]=window.CIA_XML?await window.CIA_XML(n.chave):''}catch(e){return ''}}return XMLB[n.chave]||''}
function userDoc(k){if(REMOV.has(k))return{removido:true,chave:k};const n=notas[k];if(!n)return null;if(n.base&&!n.mod)return null;const b=Object.assign({},n);if(n.base)delete b.xml;return b}
function lsNotas(){const s={};Object.keys(notas).concat([...REMOV]).forEach(k=>{const d=userDoc(k);if(d)s[k]=d});try{localStorage.setItem(LSN,JSON.stringify(s))}catch(e){try{Object.keys(s).forEach(k=>{s[k]=Object.assign({},s[k],{xml:''})});localStorage.setItem(LSN,JSON.stringify(s))}catch(e2){}}}
const OURS=/WE\s*PREMIUM|CIA\.?\s*BEAUTY|CREATIVE\s*HOUSE/i,WEP=/WE\s*PREMIUM/i;
function tg(el,tag){const x=el&&el.getElementsByTagNameNS('*',tag)[0];return x?x.textContent.trim():''}
function parseNFe(txt){
  const doc=new DOMParser().parseFromString(txt,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)return null;
  const inf=doc.getElementsByTagNameNS('*','infNFe')[0];if(!inf)return null;
  const ide=inf.getElementsByTagNameNS('*','ide')[0],emit=inf.getElementsByTagNameNS('*','emit')[0],dest=inf.getElementsByTagNameNS('*','dest')[0],tot=inf.getElementsByTagNameNS('*','ICMSTot')[0];
  const chave=((inf.getAttribute('Id')||'').replace(/^NFe/,''))||tg(doc,'chNFe');
  const itens=[...inf.getElementsByTagNameNS('*','det')].map(d=>{const p=d.getElementsByTagNameNS('*','prod')[0];return[tg(p,'cProd'),tg(p,'xProd'),tg(p,'uCom'),+tg(p,'qCom')||0,+tg(p,'vUnCom')||0,+tg(p,'vProd')||0,tg(p,'CFOP')]});
  const dh=tg(ide,'dhEmi')||tg(ide,'dEmi');
  const n={chave,num:tg(ide,'nNF'),serie:tg(ide,'serie'),data:dh.slice(0,10),natOp:tg(ide,'natOp'),tpNF:tg(ide,'tpNF'),
    emit:tg(emit,'xNome'),emitDoc:tg(emit,'CNPJ')||tg(emit,'CPF'),dest:tg(dest,'xNome'),destDoc:tg(dest,'CNPJ')||tg(dest,'CPF'),
    vNF:+tg(tot,'vNF')||itens.reduce((a,i)=>a+i[5],0),itens};
  n.tipo=OURS.test(n.dest)?'entrada':OURS.test(n.emit)?(n.tpNF==='0'?'entrada':'saida'):'entrada';
  return n;
}
const qN=[];let qBusy=false;
function saveNota(ch){if(!db){lsNotas();return}qN.push(ch);if(!qBusy)pump()}
async function pump(){qBusy=true;while(qN.length){const ch=qN.shift();try{const b=userDoc(ch);if(b){if((b.xml||'').length>200000)b.xml='';await db.collection('notas').doc(ch).set(b)}else await db.collection('notas').doc(ch).delete();setSave('ok','Notas salvas')}catch(e){setSave('warn','Notas ficaram só neste navegador');lsNotas()}}qBusy=false;lsNotas()}
async function importFiles(files){
  const msg=$('#impMsg');let ok=0,dup=0,bad=0,plan=0;const textos=[];
  msg.textContent='Lendo arquivos…';
  for(const f of files){
    try{
      if(/\.zip$/i.test(f.name)){
        if(!window.JSZip){bad++;continue}
        const z=await JSZip.loadAsync(f);
        for(const nm of Object.keys(z.files)){if(/\.xml$/i.test(nm)&&!z.files[nm].dir)textos.push(await z.files[nm].async('string'))}
      }else textos.push(await f.text());
    }catch(e){bad++}
  }
  textos.forEach(x=>{const n=parseNFe(x);if(!n||!n.chave){bad++;return}
    if(notas[n.chave]){dup++;return}
    n.xml=x;n.importado=new Date().toISOString().slice(0,10);if(BASE_CH.has(n.chave))plan++;
    notas[n.chave]=n;ok++;saveNota(n.chave)});
  lsNotas();applyNotas();renderAll();
  msg.textContent=ok+' nota(s) importada(s)'+(dup?' · '+dup+' já estavam no painel':'')+(plan?' · '+plan+' já constam na planilha (não somam de novo)':'')+(bad?' · '+bad+' arquivo(s) não são NF-e válida':'');
}
function applyNotas(){
  XIN={};XOUT={};const mes=Object.assign({},MES_BASE),cat={};
  Object.values(notas).forEach(n=>{
    if(n.tipo==='saida'){n.itens.forEach(i=>{XOUT[i[0]]=(XOUT[i[0]]||0)+i[3]});return}
    if(BASE_CH.has(n.chave)||n.cancelada||/STRALOG/i.test(n.emit))return;
    const m=(n.data||'').slice(0,7);
    n.itens.forEach(i=>{if(/^[56](202|411)$/.test(i[6]))return;XIN[i[0]]=(XIN[i[0]]||0)+i[3];if(m)mes[m]=(mes[m]||0)+i[5];
      const k=i[0]+'|'+n.emit;const c=cat[k]||(cat[k]=[i[0],i[1],n.emit,0,i[4],n.data]);c[3]+=i[3];if((n.data||'')>=c[5]){c[4]=i[4];c[5]=n.data}});
  });
  D.comprasMes=mes;D.catalogo=CAT_BASE.concat(Object.values(cat));
  D.projetos.forEach(p=>{const cs=p.envCods||[];const ex=cs.length?Math.min(...cs.map(c=>XIN[c]||0)):0;p.rec=p.rec0+ex});
}
function notasLista(){
  const q=$('#notaSearch').value.trim().toLowerCase();
  return Object.values(notas).filter(n=>(!notaFiltro||n.tipo===notaFiltro)&&(!q||[n.num,n.emit,n.dest,n.natOp,n.chave].concat(n.itens.map(i=>i[0]+' '+i[1])).join(' ').toLowerCase().includes(q))).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
}
function renderNotas(){
  const all=Object.values(notas),E=all.filter(n=>n.tipo==='entrada'),S=all.filter(n=>n.tipo==='saida');
  const sum=a=>a.reduce((x,n)=>x+(n.vNF||0),0);
  $('#notaResumo').innerHTML='<div class="box"><div class="eyebrow">Entradas importadas</div><div class="v num">'+E.length+'</div><div class="note">'+fmtR0.format(sum(E))+'</div></div><div class="box"><div class="eyebrow">Saídas importadas</div><div class="v num">'+S.length+'</div><div class="note">'+fmtR0.format(sum(S))+'</div></div><div class="box"><div class="eyebrow">Itens novos no estoque</div><div class="v num">'+fmtI.format(Object.values(XIN).reduce((a,b)=>a+b,0))+'</div><div class="note">un. de entradas fora da planilha</div></div>';
  document.querySelectorAll('#notaChips .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.f===notaFiltro));
  const rows=notasLista();
  if(!all.length){$('#notasTbl').innerHTML='<tbody><tr><td class="muted" style="padding:18px">Nenhuma nota importada ainda. Arraste os XMLs de NF-e (ou o .zip exportado do Bling) na área acima.</td></tr></tbody>';return}
  let h='<thead><tr><th>Tipo</th><th>Nº</th><th>Emissão</th><th>Emitente</th><th>Destinatário</th><th>Natureza</th><th class="n">Itens</th><th class="n">Valor</th><th></th><th></th></tr></thead><tbody>';
  rows.forEach(n=>{
    h+='<tr class="nrow" data-ch="'+esc(n.chave)+'" style="cursor:pointer"><td><span class="pill '+(n.tipo==='entrada'?'ok':'warn')+'">'+(n.tipo==='entrada'?'Entrada':'Saída')+'</span></td><td class="mono">'+esc(n.num)+'</td><td class="mono">'+(n.data?n.data.split('-').reverse().join('/'):'—')+'</td><td>'+esc(short(n.emit))+'</td><td>'+esc(short(n.dest))+'</td><td class="note">'+esc(n.natOp)+'</td><td class="n">'+n.itens.length+'</td><td class="n">'+fmtR.format(n.vNF||0)+'</td><td>'+(n.cancelada?'<span class="pill bad">cancelada</span> ':'')+(BASE_CH.has(n.chave)?'<span class="pill neu">já na planilha</span>':'')+'</td><td style="white-space:nowrap"><button class="btn ghost" data-tg="'+esc(n.chave)+'" title="Trocar entrada/saída">⇄</button><button class="btn ghost" data-rm="'+esc(n.chave)+'" aria-label="Excluir nota">✕</button></td></tr>';
    if(notaAberta===n.chave){h+='<tr><td colspan="10" style="background:var(--sunk)"><div class="note mono" style="margin-bottom:6px">Chave '+esc(n.chave)+'</div><table><thead><tr><th>Código</th><th>Descrição</th><th>Unid.</th><th class="n">Qtd</th><th class="n">Valor un.</th><th class="n">Total</th><th>CFOP</th></tr></thead><tbody>'+n.itens.map(i=>'<tr><td class="mono">'+esc(i[0])+'</td><td>'+esc(i[1])+'</td><td>'+esc(i[2])+'</td><td class="n">'+fmtI.format(i[3])+'</td><td class="n">'+fmtU.format(i[4])+'</td><td class="n">'+fmtR.format(i[5])+'</td><td class="mono">'+esc(i[6])+'</td></tr>').join('')+'</tbody></table></td></tr>'}
  });
  $('#notasTbl').innerHTML=h+'</tbody>';
}
let ULT_EXPORT=null;
async function baixar(nome,data,btn){
  let motivo='';
  try{
    const pm=await claude.use('permissions');
    if(pm){let st=await pm.state('downloads');if(st==='prompt'){const r=await pm.request(['downloads']);st=r&&r.downloads||st}
      if(st==='denied'){abrirCopia(nome,'o download foi bloqueado nas permissões deste app',true);return}}
    const dl=await claude.use('downloads');
    if(dl){await dl.save({filename:nome,data});return}
    motivo='esta visualização não permite baixar arquivos';
  }catch(e){
    const c=e&&e.code;if(c==='declined')return;
    motivo=({rejected_extension:'o formato do arquivo foi recusado',extension_not_enabled:'arquivos Excel/ZIP estão desligados nesta visualização',rate_limited:'já existe um download aguardando confirmação',too_large:'arquivo grande demais',unavailable:'download indisponível nesta visualização',not_granted:'download não autorizado'})[c]||('erro '+(c||e&&e.message||''));
  }
  abrirCopia(nome,motivo,motivo.includes('autoriz'));
}
function tsv(rows){return rows.map(r=>r.map(v=>{const s=v==null?'':String(v);return typeof v==='number'?s.replace('.',','):s.replace(/[\t\n\r]+/g,' ')}).join('\t')).join('\n')}
function abrirCopia(nome,motivo,perm){
  const m=$('#copyModal');const ks=ULT_EXPORT||[];
  $('#copyMotivo').textContent='Não deu para baixar: '+motivo+'. Tente de novo pelo navegador Chrome no computador. Enquanto isso, copie cada tabela abaixo e cole no Excel (Ctrl+V).';
  $('#copyList').innerHTML=ks.length?ks.map(k=>'<button class="btn" data-copy="'+k+'">Copiar '+esc(ABA_NOME[k])+'</button>').join(''):'<span class="note">Use os botões "Exportar esta aba" ou "Relatório completo" para gerar as tabelas.</span>';
  $('#copyPerm').hidden=!perm;
  m.hidden=false;
}
$('#fileIn').addEventListener('change',e=>{importFiles([...e.target.files]);e.target.value=''});
const drop=$('#drop');
['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>{const fs=[...(e.dataTransfer?e.dataTransfer.files:[])];if(fs.length)importFiles(fs)});
$('#notaChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;notaFiltro=c.dataset.f;renderNotas()});
$('#notaSearch').addEventListener('input',renderNotas);
$('#notasTbl').addEventListener('click',e=>{
  const tgb=e.target.closest('[data-tg]'),rm=e.target.closest('[data-rm]');
  if(tgb){const n=notas[tgb.dataset.tg];n.mod=true;n.tipo=n.tipo==='entrada'?'saida':'entrada';saveNota(n.chave);applyNotas();renderAll();return}
  if(rm){const ch=rm.dataset.rm;if(rm.dataset.ok){if(notas[ch]&&notas[ch].base)REMOV.add(ch);delete notas[ch];saveNota(ch);applyNotas();renderAll()}else{rm.dataset.ok='1';rm.textContent='Excluir?';setTimeout(()=>{if(rm.isConnected){delete rm.dataset.ok;rm.textContent='✕'}},3000)}return}
  const r=e.target.closest('.nrow');if(r){notaAberta=notaAberta===r.dataset.ch?null:r.dataset.ch;renderNotas()}
});
$('#expXml').addEventListener('click',async e=>{ULT_EXPORT=['notas'];
  const btn=e.currentTarget,rows=notasLista();
  if(!rows.length){btn.textContent='Nenhum XML para exportar';setTimeout(()=>btn.textContent='Exportar XML (.zip)',2000);return}
  if(!window.JSZip){btn.textContent='Compactador indisponível';return}
  btn.textContent='Preparando…';const z=new JSZip();for(const n of rows){const x=await xmlDe(n);if(x)z.file((n.tipo==='entrada'?'entrada':'saida')+'/NFe'+n.chave+'.xml',x)}btn.textContent='Exportar XML (.zip)';
  const blob=await z.generateAsync({type:'blob'});
  baixar('notas_'+(notaFiltro||'todas')+'_xml.zip',blob,btn);
});
$('#expCsv').addEventListener('click',e=>{ULT_EXPORT=['notas'];
  const L=[['Tipo','Chave de Acesso','Número NF','Data Emissão','Emitente','Destinatário','Código','Descrição','Unid.','Qtd','Valor Unit.','Valor Total','CFOP'].join(';')];
  const n2=x=>String(x).replace('.',',');const cl=s=>String(s||'').replace(/;/g,',');
  notasLista().forEach(n=>n.itens.forEach(i=>L.push([n.tipo==='entrada'?'Entrada':'Saída',n.chave,n.num,(n.data||'').split('-').reverse().join('/'),cl(n.emit),cl(n.dest),cl(i[0]),cl(i[1]),cl(i[2]),n2(i[3]),n2(i[4]),n2(i[5]),i[6]].join(';'))));
  baixar('notas_'+(notaFiltro||'todas')+'_itens.csv','﻿'+L.join('\n'),e.currentTarget);
});
applyNotas();

/* ---------- VENDAS e ESTOQUE STRALOG (importação de planilhas) ---------- */
let vendasLotes={};let estoqueAtual=null;let vendaCanal='',estFiltro='';
const LSV='ciab-vendas-v1',LSE='ciab-estoque-v1';
try{const r=localStorage.getItem(LSV);if(r)vendasLotes=JSON.parse(r)||{}}catch(e){}
try{const r=localStorage.getItem(LSE);if(r)estoqueAtual=JSON.parse(r)}catch(e){}
function lsVE(){try{localStorage.setItem(LSV,JSON.stringify(vendasLotes))}catch(e){}try{localStorage.setItem(LSE,JSON.stringify(estoqueAtual))}catch(e){}}
const normK=s=>String(s==null?'':s).trim().toUpperCase();
function num(v){if(typeof v==='number')return v;let s=String(v==null?'':v).trim().replace(/[R$\s]/g,'');if(!s)return 0;if(/,\d{1,4}$/.test(s))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');const n=parseFloat(s);return isNaN(n)?0:n}
function dataISO(v){if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return d.toISOString().slice(0,10)}const s=String(v||'').trim();let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);if(m){const y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0')}m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[0]:''}
async function lerPlanilha(file){
  if(!window.XLSX)throw new Error('O leitor de planilhas não carregou. Recarregue a página.');
  const buf=await file.arrayBuffer();let wb;
  if(/\.(csv|txt)$/i.test(file.name)){let txt=new TextDecoder('utf-8').decode(buf);if(txt.includes('\uFFFD'))txt=new TextDecoder('windows-1252').decode(buf);wb=XLSX.read(txt.replace(/^\uFEFF/,''),{type:'string',raw:true,FS:txt.split('\n')[0].includes(';')?';':','})}
  else wb=XLSX.read(buf,{type:'array',cellDates:false});
  const ws=wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
}
function acharColunas(rows,spec){
  for(let r=0;r<Math.min(rows.length,25);r++){
    const h=rows[r].map(x=>String(x).trim().toLowerCase());const map={};
    Object.entries(spec).forEach(([k,res])=>{for(const re of res){const i=h.findIndex((c,ix)=>c&&re.test(c)&&!Object.values(map).includes(ix));if(i>=0){map[k]=i;break}}});
    if(map.cod!=null&&map.qtd!=null)return{row:r,map,head:rows[r]};
  }
  return null;
}
const SPEC_EST={cod:[/^c[oó]d(igo)?(\s|\.|$)/,/^sku/,/c[oó]d.*produto/,/^refer/,/c[oó]digo/],desc:[/descri/,/^produto/,/^nome/],
  qtd:[/dispon/,/^saldo/,/estoque f[ií]sico/,/^estoque/,/qtd|quantidade/],lote:[/^lote/],val:[/validade|vencimento/]};
const SPEC_VEN={data:[/^data/,/emiss/],cod:[/^c[oó]d(igo)?(\s|\.|$)/,/^sku/,/c[oó]d.*produto|c[oó]d.*item/,/c[oó]digo/],desc:[/descri/,/^produto/,/^item/,/^nome/],
  qtd:[/^qtd|^quant/,/qtd|quantidade/],valor:[/valor total|total do item|total item|^total$/,/^valor/,/pre[cç]o total/],canal:[/canal|loja|marketplace|integra|origem/],pedido:[/pedido|^n[uú]mero/]};
async function importEstoque(file){
  const msg=$('#estMsg');msg.textContent='Lendo '+file.name+'…';
  try{
    const rows=await lerPlanilha(file);const h=acharColunas(rows,SPEC_EST);
    if(!h){msg.textContent='Não achei as colunas de código e quantidade. Colunas encontradas: '+(rows[0]||[]).filter(Boolean).join(', ');return}
    const ag={};
    rows.slice(h.row+1).forEach(r=>{const c=normK(r[h.map.cod]);if(!c)return;const a=ag[c]||(ag[c]={cod:c,desc:'',qtd:0,lotes:[]});a.qtd+=num(r[h.map.qtd]);if(h.map.desc!=null&&!a.desc)a.desc=String(r[h.map.desc]).trim();
      if(h.map.lote!=null&&r[h.map.lote]!=='')a.lotes.push([String(r[h.map.lote]),num(r[h.map.qtd]),h.map.val!=null?dataISO(r[h.map.val]):''])});
    estoqueAtual={arquivo:file.name,data:new Date().toISOString().slice(0,10),itens:Object.values(ag).map(a=>({cod:a.cod,desc:a.desc.slice(0,120),qtd:a.qtd,lotes:a.lotes.slice(0,20)}))};
    lsVE();if(db){setSave('','Salvando estoque…');db.doc('estoque/atual').set(estoqueAtual).then(()=>setSave('ok','Estoque salvo')).catch(()=>setSave('warn','Estoque ficou só neste navegador'))}
    msg.textContent=estoqueAtual.itens.length+' produtos lidos de '+file.name+' (coluna de quantidade: "'+h.head[h.map.qtd]+'").';
    renderAll();
  }catch(e){msg.textContent='Não consegui ler o arquivo: '+(e.message||e)}
}
async function importVendas(file){
  const msg=$('#venMsg');msg.textContent='Lendo '+file.name+'…';
  try{
    const rows=await lerPlanilha(file);const h=acharColunas(rows,SPEC_VEN);
    if(!h){msg.textContent='Não achei as colunas de código e quantidade. Colunas encontradas: '+(rows[0]||[]).filter(Boolean).join(', ');return}
    const canalArq=file.name.replace(/\.[^.]+$/,'');
    const linhas=[];rows.slice(h.row+1).forEach(r=>{const c=normK(r[h.map.cod]);const q=num(r[h.map.qtd]);if(!c||!q)return;
      linhas.push([h.map.data!=null?dataISO(r[h.map.data]):'',c,h.map.desc!=null?String(r[h.map.desc]).trim().slice(0,90):'',q,h.map.valor!=null?num(r[h.map.valor]):0,h.map.canal!=null?String(r[h.map.canal]).trim().slice(0,40):canalArq])});
    if(!linhas.length){msg.textContent='Nenhuma linha de venda com código e quantidade.';return}
    const id='L'+Date.now().toString(36);const partes=[];for(let i=0;i<linhas.length;i+=1500)partes.push(linhas.slice(i,i+1500));
    vendasLotes[id]={arquivo:file.name,importado:new Date().toISOString().slice(0,10),partes:partes.length,linhas};
    lsVE();
    if(db){setSave('','Salvando vendas…');(async()=>{try{for(let i=0;i<partes.length;i++)await db.collection('vendas').doc(id+'-'+i).set({lote:id,arquivo:file.name,importado:vendasLotes[id].importado,parte:i,partes:partes.length,linhas:partes[i]});setSave('ok','Vendas salvas')}catch(e){setSave('warn','Vendas ficaram só neste navegador')}})()}
    msg.textContent=linhas.length+' linhas de venda lidas de '+file.name+'.';
    renderAll();
  }catch(e){msg.textContent='Não consegui ler o arquivo: '+(e.message||e)}
}
function vendasLinhas(){
  const L=[];Object.values(vendasLotes).forEach(l=>l.linhas.forEach(x=>L.push(x)));
  Object.values(notas).forEach(n=>{if(n.tipo!=='saida'||n.cancelada)return;if(/remessa|retorno|transfer|devolu|armazen|dep[oó]sito/i.test(n.natOp))return;n.itens.forEach(i=>L.push([n.data,normK(i[0]),i[1],i[3],i[5],'NF '+short(n.dest)]))});
  return L;
}
function vendasPorCod(){const V={};vendasLinhas().forEach(([d,c,ds,q,v,cn])=>{const a=V[c]||(V[c]={q:0,v:0,mes:{},desc:ds,canais:{}});a.q+=q;a.v+=v;const m=(d||'').slice(0,7);if(m)a.mes[m]=(a.mes[m]||0)+q;a.canais[cn]=(a.canais[cn]||0)+q});return V}
function mediaMensal(a){const ms=Object.keys(a.mes).sort();if(!ms.length)return 0;const ult=ms.slice(-3);return ult.reduce((s,m)=>s+a.mes[m],0)/ult.length}
function projPorCod(){const P={};allProjects().forEach(p=>{if(p.codigo)P[normK(p.codigo)]=p});return P}
function estPorCod(){const E={};(estoqueAtual&&estoqueAtual.itens||[]).forEach(i=>{E[i.cod]=i});return E}
function renderVendas(){
  const L=vendasLinhas();const canais={};L.forEach(x=>{canais[x[5]]=(canais[x[5]]||0)+x[3]});
  $('#venChips').innerHTML='<button class="chip" data-c="" aria-pressed="'+(vendaCanal==='')+'">Todos os canais</button>'+Object.entries(canais).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([c])=>'<button class="chip" data-c="'+esc(c)+'" aria-pressed="'+(vendaCanal===c)+'">'+esc(c)+'</button>').join('');
  const F=L.filter(x=>!vendaCanal||x[5]===vendaCanal);
  const q=F.reduce((s,x)=>s+x[3],0),v=F.reduce((s,x)=>s+x[4],0),skus=new Set(F.map(x=>x[1])).size;
  $('#venResumo').innerHTML='<div class="box"><div class="eyebrow">Unidades vendidas</div><div class="v num">'+fmtI.format(q)+'</div></div><div class="box hl"><div class="eyebrow">Faturamento</div><div class="v num">'+fmtR0.format(v)+'</div></div><div class="box"><div class="eyebrow">Produtos vendidos</div><div class="v num">'+fmtI.format(skus)+'</div></div><div class="box"><div class="eyebrow">Arquivos importados</div><div class="v num">'+Object.keys(vendasLotes).length+'</div><div class="note">+ NFs de saída da aba Notas XML</div></div>';
  // por mês
  const mes={};F.forEach(x=>{const m=(x[0]||'').slice(0,7);if(m)mes[m]=(mes[m]||0)+x[4]});
  const ent=Object.entries(mes).sort().slice(-12);
  if(ent.length){const W=Math.max(480,ent.length*56),H=200,pl=60,pb=26,pt=10,mx=Math.max(...ent.map(x=>x[1]))||1;const bw=(W-pl-8)/ent.length;const mn=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    let s='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Faturamento por mês">';for(let i=0;i<=4;i++){const y=H-pb-(H-pb-pt)*i/4;s+='<line x1="'+pl+'" x2="'+(W-4)+'" y1="'+y+'" y2="'+y+'" stroke="var(--line)"/><text x="'+(pl-6)+'" y="'+(y+3)+'" text-anchor="end">'+fmtR0.format(mx*i/4).replace('R$','').trim()+'</text>'}
    ent.forEach(([k,val],i)=>{const h=(H-pb-pt)*val/mx,x=pl+i*bw+bw*.18;const[yy,mm]=k.split('-');s+='<rect x="'+x.toFixed(1)+'" y="'+(H-pb-h).toFixed(1)+'" width="'+(bw*.64).toFixed(1)+'" height="'+h.toFixed(1)+'" rx="2" fill="var(--accent)"><title>'+mn[+mm-1]+'/'+yy+': '+fmtR0.format(val)+'</title></rect><text x="'+(x+bw*.32).toFixed(1)+'" y="'+(H-pb+14)+'" text-anchor="middle">'+mn[+mm-1]+'/'+yy.slice(2)+'</text>'});
    $('#venChart').innerHTML=s+'</svg>'}else $('#venChart').innerHTML='<p class="note">Sem datas nas vendas importadas.</p>';
  // por produto
  const V={};F.forEach(([d,c,ds,qq,vv])=>{const a=V[c]||(V[c]={q:0,v:0,desc:ds});a.q+=qq;a.v+=vv;if(!a.desc)a.desc=ds});
  const P=projPorCod(),E=estPorCod(),s2=$('#venSearch').value.trim().toLowerCase();
  const rows=Object.entries(V).filter(([c,a])=>!s2||(c+' '+a.desc).toLowerCase().includes(s2)).sort((a,b)=>b[1].v-a[1].v);
  if(!L.length){$('#venTbl').innerHTML='<tbody><tr><td class="muted" style="padding:18px">Nenhuma venda ainda. Importe o relatório de pedidos do Bling ou dos marketplaces (Excel ou CSV) na área acima, ou importe XMLs de saída na aba Notas XML.</td></tr></tbody>';return}
  $('#venTbl').innerHTML='<thead><tr><th>Código</th><th>Produto</th><th>Coleção</th><th class="n">Vendido</th><th class="n">Faturamento</th><th class="n">Preço médio</th><th class="n">Recebido</th><th class="n">% vendido</th><th class="n">Estoque Stralog</th></tr></thead><tbody>'+rows.slice(0,400).map(([c,a])=>{const p=P[c],e=E[c];const pv=p&&p.rec?a.q/p.rec*100:null;
    return '<tr><td class="mono">'+esc(c)+'</td><td>'+esc(p?p.sku:a.desc)+'</td><td>'+esc(p?p.colecao:'—')+'</td><td class="n">'+fmtI.format(a.q)+'</td><td class="n">'+fmtR.format(a.v)+'</td><td class="n">'+(a.q?fmtR.format(a.v/a.q):'—')+'</td><td class="n">'+(p?fmtI.format(p.rec||0):'—')+'</td><td class="n">'+(pv==null?'—':pv.toFixed(0)+'%')+'</td><td class="n">'+(e?fmtI.format(e.qtd):'—')+'</td></tr>'}).join('')+'</tbody>';
}
function renderEstoque(){
  const E=estoqueAtual;const V=vendasPorCod(),P=projPorCod();
  if(!E){$('#estInfo').textContent='Nenhum relatório importado ainda.';$('#estResumo').innerHTML='';$('#estTbl').innerHTML='<tbody><tr><td class="muted" style="padding:18px">Importe o relatório de estoque da Stralog (ou o de estoque por depósito do Bling) em Excel ou CSV. O app procura sozinho as colunas de código e saldo.</td></tr></tbody>';return}
  $('#estInfo').textContent='Arquivo '+E.arquivo+' · importado em '+E.data.split('-').reverse().join('/');
  const rows=E.itens.map(i=>{const v=V[i.cod],m=v?mediaMensal(v):0,cob=m?i.qtd/m:null,p=P[i.cod];
    let st=['neu','Sem venda'];if(i.qtd<=0)st=['bad','Zerado'];else if(cob!=null&&cob<1)st=['bad','Ruptura < 1 mês'];else if(cob!=null&&cob<2)st=['warn','Atenção < 2 meses'];else if(cob!=null&&cob>6)st=['warn','Parado > 6 meses'];else if(cob!=null)st=['ok','Ok'];
    return{i,m,cob,p,st}});
  const tot=rows.reduce((s,r)=>s+Math.max(0,r.i.qtd),0),zer=rows.filter(r=>r.i.qtd<=0).length,rup=rows.filter(r=>r.st[1].startsWith('Ruptura')).length,proj=rows.filter(r=>r.p).length;
  $('#estResumo').innerHTML='<div class="box"><div class="eyebrow">Produtos no relatório</div><div class="v num">'+fmtI.format(rows.length)+'</div></div><div class="box hl"><div class="eyebrow">Unidades em estoque</div><div class="v num">'+fmtI.format(tot)+'</div></div><div class="box"><div class="eyebrow">Em ruptura (&lt; 1 mês)</div><div class="v num">'+rup+'</div><div class="note">pela média de venda dos últimos 3 meses</div></div><div class="box"><div class="eyebrow">Zerados</div><div class="v num">'+zer+'</div></div><div class="box"><div class="eyebrow">Projetos do painel</div><div class="v num">'+proj+'</div><div class="note">códigos que batem com Acabados</div></div>';
  document.querySelectorAll('#estChips .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.f===estFiltro));
  const s2=$('#estSearch').value.trim().toLowerCase();
  const F=rows.filter(r=>(!s2||(r.i.cod+' '+r.i.desc+' '+(r.p?r.p.colecao+' '+r.p.sku:'')).toLowerCase().includes(s2))&&(!estFiltro||(estFiltro==='proj'?r.p:estFiltro==='rup'?r.st[0]==='bad':r.st[1].startsWith('Parado')))).sort((a,b)=>(a.cob==null)-(b.cob==null)||(a.cob||0)-(b.cob||0));
  $('#estTbl').innerHTML='<thead><tr><th>Código</th><th>Produto</th><th>Coleção</th><th class="n">Estoque</th><th class="n">Venda/mês</th><th class="n">Cobertura</th><th>Situação</th><th>Lotes</th></tr></thead><tbody>'+F.slice(0,600).map(r=>'<tr><td class="mono">'+esc(r.i.cod)+'</td><td>'+esc(r.p?r.p.sku:r.i.desc)+'</td><td>'+esc(r.p?r.p.colecao:'—')+'</td><td class="n">'+fmtI.format(r.i.qtd)+'</td><td class="n">'+(r.m?fmtI.format(Math.round(r.m)):'—')+'</td><td class="n">'+(r.cob==null?'—':r.cob.toFixed(1).replace('.',',')+' mês')+'</td><td><span class="pill '+r.st[0]+'">'+r.st[1]+'</span></td><td class="note">'+(r.i.lotes&&r.i.lotes.length?esc(r.i.lotes.slice(0,3).map(l=>l[0]+(l[2]?' (val. '+l[2].split('-').reverse().join('/')+')':'')).join(', ')+(r.i.lotes.length>3?'…':'')):'')+'</td></tr>').join('')+'</tbody>';
}
function ligaDrop(zoneSel,inputSel,fn){const z=$(zoneSel);$(inputSel).addEventListener('change',e=>{[...e.target.files].forEach(fn);e.target.value=''});
  ['dragenter','dragover'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.add('over')}));['dragleave','drop'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.remove('over')}));
  z.addEventListener('drop',e=>{[...(e.dataTransfer?e.dataTransfer.files:[])].forEach(fn)})}
ligaDrop('#venDrop','#venIn',importVendas);ligaDrop('#estDrop','#estIn',importEstoque);
$('#venChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;vendaCanal=c.dataset.c;renderVendas()});
$('#venSearch').addEventListener('input',renderVendas);
$('#estChips').addEventListener('click',e=>{const c=e.target.closest('.chip');if(!c)return;estFiltro=c.dataset.f;renderEstoque()});
$('#estSearch').addEventListener('input',renderEstoque);
$('#venLimpar').addEventListener('click',async e=>{const b=e.currentTarget;if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar: apagar vendas importadas';setTimeout(()=>{delete b.dataset.ok;b.textContent='Apagar vendas importadas'},3000);return}
  const ids=Object.keys(vendasLotes);vendasLotes={};lsVE();renderAll();if(db){try{const s=await db.collection('vendas').get();for(const d of s.docs)await db.collection('vendas').doc(d.id).delete()}catch(err){}}b.textContent='Apagar vendas importadas';delete b.dataset.ok});

/* ---------- EXPORTAR RELATÓRIOS (.xlsx) ---------- */
const R2=x=>Math.round((+x||0)*100)/100,R4=x=>Math.round((+x||0)*10000)/10000;
const dBR=s=>s?String(s).split('-').reverse().join('/'):'';
const REL={
  entregas:()=>{const VC=vendasPorCod(),EC=estPorCod();return[['Coleção','Código','SKU','Fornecedor','1º Pedido','2º Pedido','Total','Recebido','% Recebido','Saldo a receber','Vendido','Estoque Stralog','Status','Origem do recebido']].concat(allProjects().map(p=>{const t=total(p),r=p.rec||0,k=normK(p.codigo);return[p.colecao,p.codigo||'',p.sku,p.forn||'',p.p1||0,p.p2||0,t,r,t?R2(r/t*100):0,Math.max(0,t-r),VC[k]?VC[k].q:'',EC[k]?EC[k].qtd:'',status(p)[1]+(p.est?' (estimado)':''),p.src||'']}))},
  estruturas:()=>{const L=[['Coleção','Código','Projeto','Qtd simulada','Insumo','Código insumo','Fornecedor','Origem','Qtd/un','Custo un. (R$)','Estoque insumo','Necessidade','Comprar','Desembolso (R$)','Observação']];
    allProjects().forEach(p=>{const c=calc(p);if(!c.linhas.length)L.push([p.colecao,p.codigo||'',p.sku,c.Q,'(sem estrutura)','','','','','','','','',0,'']);c.linhas.forEach(l=>L.push([p.colecao,p.codigo||'',p.sku,c.Q,l.c.nome,l.c.cod||'',l.c.forn||'',({NF:'NF',planilha:'Planilha',ref:'Referência','?':'Não encontrado',info:'Informado',orc:'A orçar'})[l.c.origem]||'',R4(l.c.coef),l.cu==null?'':R4(l.cu),R2((+l.c.saldo||0)+(XIN[l.c.cod]||0)),R2(l.nec),R2(l.comprar),R2(l.v),l.c.nota||'']))});return L},
  carteira:()=>{const L=[['Incluído','Coleção','Código','Projeto','Qtd','Custo unitário (R$)','Custo do lote (R$)','Necessidade de caixa (R$)','Situação da estrutura']];let T=0;
    cartRows().forEach(({p,c,inc})=>{if(inc)T+=c.desemb;L.push([inc?'Sim':'Não',p.colecao,p.codigo||'',p.sku,c.Q,R4(c.unit),R2(c.bruto),R2(c.desemb),c.semEstrutura?'Sem estrutura':c.falta?'Custo faltando':'Completo'])});
    L.push([]);L.push(['','','','Total da carteira','','','',R2(T),'']);
    const forn={};cartRows().filter(r=>r.inc).forEach(({c})=>c.linhas.forEach(l=>{const k=l.c.forn||'Sem fornecedor';forn[k]=(forn[k]||0)+l.v}));
    L.push([]);L.push(['A pagar por fornecedor']);Object.entries(forn).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>L.push([k,R2(v)]));return L},
  compras:()=>{const L=[['Compras por mês','Valor (R$)']];Object.entries(D.comprasMes).sort().forEach(([m,v])=>L.push([m.split('-').reverse().join('/'),R2(v)]));
    L.push([]);L.push(['Código','Descrição','Fornecedor','Qtd comprada','Último preço (R$)','Última NF']);D.catalogo.slice().sort((a,b)=>String(b[5]).localeCompare(String(a[5]))).forEach(r=>L.push([r[0],r[1],r[2],r[3],r[4],dBR(r[5])]));return L},
  notas:()=>{const L=[['Tipo','Chave','Número','Emissão','Emitente','CNPJ emitente','Destinatário','CNPJ destinatário','Natureza','Valor NF (R$)','Código','Descrição','Unid.','Qtd','Valor un.','Valor total','CFOP','Situação']];
    notasLista().forEach(n=>n.itens.forEach(i=>L.push([n.tipo==='entrada'?'Entrada':'Saída',n.chave,n.num,dBR(n.data),n.emit,n.emitDoc||'',n.dest,n.destDoc||'',n.natOp,R2(n.vNF),i[0],i[1],i[2],i[3],i[4],i[5],i[6],n.cancelada?'Cancelada':(BASE_CH.has(n.chave)?'Já na planilha':'')])));return L},
  vendas:()=>{const L=[['Data','Código','Descrição','Qtd','Valor (R$)','Canal']];vendasLinhas().forEach(x=>L.push([dBR(x[0]),x[1],x[2],x[3],R2(x[4]),x[5]]));return L},
  estoque:()=>{const V=vendasPorCod(),P=projPorCod();const L=[['Código','Produto','Coleção','Estoque','Venda média/mês','Cobertura (meses)','Lotes']];
    (estoqueAtual&&estoqueAtual.itens||[]).forEach(i=>{const v=V[i.cod],m=v?mediaMensal(v):0,p=P[i.cod];L.push([i.cod,p?p.sku:i.desc,p?p.colecao:'',i.qtd,R2(m),m?R2(i.qtd/m):'',(i.lotes||[]).map(l=>l[0]+(l[2]?' val '+dBR(l[2]):'')).join(' | ')])});return L},
  resumo:()=>{const ps=allProjects();const ped=ps.reduce((a,p)=>a+total(p),0),rec=ps.reduce((a,p)=>a+(p.rec||0),0);let des=0;cartRows().forEach(r=>{if(r.inc)des+=r.c.desemb});
    const cols={};ps.forEach(p=>{const c=cols[p.colecao]||(cols[p.colecao]=[0,0,0]);c[0]++;c[1]+=total(p);c[2]+=p.rec||0});
    const L=[['Painel de Projetos Cia Beauty'],['Gerado em',new Date().toLocaleString('pt-BR')],['Base','Planilha Geral 29.10 + NFs até '+D.atualizado],[],['Indicador','Valor'],['Projetos',ps.length],['Unidades pedidas',ped],['Unidades recebidas',rec],['% recebido',ped?R2(rec/ped*100):0],['A receber',ped-rec],['Necessidade de caixa da carteira (R$)',R2(des)],[],['Coleção','SKUs','Pedido','Recebido','% recebido']];
    Object.entries(cols).forEach(([k,c])=>L.push([k,c[0],c[1],c[2],c[1]?R2(c[2]/c[1]*100):0]));return L}
};
const ABA_NOME={resumo:'Resumo',entregas:'Entregas',estruturas:'Custos - Estruturas',carteira:'Carteira',compras:'Compras',notas:'Notas XML',vendas:'Vendas',estoque:'Estoque Stralog'};
const TAB_REL={inicio:['resumo'],entregas:['entregas'],simulador:['estruturas'],produtos:['estruturas'],carteira:['carteira'],compras:['compras'],notas:['notas'],vendas:['vendas'],estoque:['estoque']};
function montarXlsx(chaves){const wb=XLSX.utils.book_new();chaves.forEach(k=>{const rows=REL[k]();const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=(rows.find(r=>r.length>3)||rows[0]||[]).map((_,i)=>({wch:Math.min(48,Math.max(10,...rows.slice(0,200).map(r=>String(r[i]==null?'':r[i]).length+2)))}));XLSX.utils.book_append_sheet(wb,ws,ABA_NOME[k].slice(0,31))});
  return new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
async function exportar(chaves,nome,btn){ULT_EXPORT=chaves;if(!window.XLSX){btn.textContent='Leitor de planilhas não carregou';return}const old=btn.textContent;btn.textContent='Gerando…';
  try{const blob=montarXlsx(chaves);btn.textContent=old;await baixar(nome,blob,btn)}catch(e){console.error(e);btn.textContent='Erro ao gerar o relatório';setTimeout(()=>btn.textContent=old,3000)}}
const hoje=()=>new Date().toISOString().slice(0,10);
$('#expTudo').addEventListener('click',e=>exportar(['resumo','entregas','estruturas','carteira','compras','notas','vendas','estoque'],'Relatorio_Cia_Beauty_'+hoje()+'.xlsx',e.currentTarget));
$('#expAba').addEventListener('click',e=>{const t=tabs.find(x=>!$('#tab-'+x).hidden)||'entregas';exportar(TAB_REL[t],ABA_NOME[TAB_REL[t][0]].replace(/\W+/g,'_')+'_'+hoje()+'.xlsx',e.currentTarget)});

$('#copyPerm').addEventListener('click',async()=>{try{const pm=await claude.use('permissions');if(pm)await pm.manage()}catch(e){$('#copyOk').textContent='Abra o menu Permissões do app (no topo da página) e libere Downloads.'}});
$('#copyClose').addEventListener('click',()=>{$('#copyModal').hidden=true;$('#copyOk').textContent=''});
$('#copyList').addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;const txt=tsv(REL[b.dataset.copy]());
  try{await navigator.clipboard.writeText(txt);$('#copyOk').textContent=ABA_NOME[b.dataset.copy]+' copiada. Abra o Excel e cole com Ctrl+V.'}
  catch(err){const ta=document.createElement('textarea');ta.value=txt;ta.style.cssText='width:100%;height:160px';$('#copyOk').innerHTML='';$('#copyOk').appendChild(document.createTextNode('A cópia automática foi bloqueada. Selecione o texto abaixo (Ctrl+A) e copie (Ctrl+C):'));$('#copyOk').appendChild(ta);ta.focus();ta.select()}});
/* ---------- INÍCIO ---------- */
const ICONS={};document.querySelectorAll('nav.tabs button').forEach(b=>{ICONS[b.dataset.tab]=b.querySelector('svg').innerHTML});
function renderInicio(){
  const ps=allProjects();const ped=ps.reduce((a,p)=>a+total(p),0),rec=ps.reduce((a,p)=>a+(p.rec||0),0);
  let des=0,sem=[],falta=[],orc=0;cartRows().forEach(({p,c,inc})=>{if(inc)des+=c.desemb;if(c.semEstrutura)sem.push(p);else if(c.falta)falta.push(p);comps(p).forEach(x=>{if(x.origem==='orc')orc++})});
  const ag=ps.filter(p=>status(p)[0]==='bad');
  const nN=Object.keys(notas).length,L=vendasLinhas(),fat=L.reduce((s,x)=>s+x[4],0);
  const E=estoqueAtual;let rup=0;if(E){const V=vendasPorCod();E.itens.forEach(i=>{const v=V[i.cod],m=v?mediaMensal(v):0;if(i.qtd<=0||(m&&i.qtd/m<1))rup++})}
  const cards=[
    ['entregas','Entregas',fmtI.format(rec)+' un.',Math.round(ped?rec/ped*100:0)+'% do pedido recebido · '+ag.length+' aguardando'],
    ['simulador','Custos',ps.filter(p=>!calc(p).semEstrutura&&!calc(p).falta).length+' completos','custo unitário e caixa por lote'],
    ['carteira','Carteira futura',fmtR0.format(des),'necessidade de caixa dos próximos lotes'],
    ['compras','Compras de insumos',fmtR0.format(Object.values(D.comprasMes).reduce((a,b)=>a+b,0)),D.catalogo.length+' insumos no catálogo'],
    ['notas','Notas XML',fmtI.format(nN)+' notas','importar e exportar NF-e'],
    ['vendas','Vendas',L.length?fmtR0.format(fat):'Sem dados',L.length?fmtI.format(L.reduce((s,x)=>s+x[3],0))+' unidades vendidas':'importe o relatório de vendas'],
    ['estoque','Estoque Stralog',E?fmtI.format(E.itens.reduce((s,i)=>s+Math.max(0,i.qtd),0))+' un.':'Sem dados',E?(rup+' em ruptura · '+E.data.split('-').reverse().join('/')):'importe o relatório da Stralog']];
  $('#homeCards').innerHTML=cards.map(c=>'<button class="hcard" data-go="'+c[0]+'"><span class="ic"><svg viewBox="0 0 24 24" aria-hidden="true">'+ICONS[c[0]]+'</svg></span><b>'+c[1]+'</b><span class="big num">'+c[2]+'</span><span class="note">'+c[3]+'</span><span class="go">Abrir →</span></button>').join('');
  const P=[];
  if(sem.length)P.push(['bad',sem.length+' projeto(s) sem estrutura de custo',sem.slice(0,4).map(p=>p.sku).join(' · '),'simulador',sem[0].id]);
  if(falta.length)P.push(['warn',falta.length+' projeto(s) com custo faltando',falta.slice(0,4).map(p=>p.sku).join(' · '),'simulador',falta[0].id]);
  if(orc)P.push(['warn',orc+' insumo(s) a orçar','caixas, rótulos e envases marcados como "a orçar"','carteira']);
  if(ag.length)P.push(['neu',ag.length+' projeto(s) aguardando entrega',ag.slice(0,4).map(p=>p.sku).join(' · '),'entregas']);
  if(E&&rup)P.push(['bad',rup+' produto(s) em ruptura ou zerados na Stralog','pela média de venda dos últimos 3 meses','estoque']);
  if(!E)P.push(['neu','Estoque Stralog ainda não importado','importe o relatório para ver cobertura e rupturas','estoque']);
  if(!L.length)P.push(['neu','Vendas ainda não importadas','relatório do Bling ou dos marketplaces','vendas']);
  $('#homePend').innerHTML=P.map(x=>'<button data-go="'+x[3]+'"'+(x[4]?' data-pid="'+esc(x[4])+'"':'')+'><span class="pill '+x[0]+'">'+({bad:'urgente',warn:'atenção',neu:'info'})[x[0]]+'</span><span><b style="font-weight:600">'+esc(x[1])+'</b><br><span class="note">'+esc(x[2])+'</span></span></button>').join('')||'<p class="note">Nada pendente.</p>';
  $('#homeBase').textContent='Base: planilha Geral 29.10 + NFs de entrada até '+D.atualizado+'.';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b&&b.closest('#tab-inicio')){if(b.dataset.pid)cur=b.dataset.pid;showTab(b.dataset.go);return}
  const a=e.target.closest('[data-act]');if(a&&a.closest('#tab-inicio')){if(a.dataset.act==='novo')$('#btnNovo').click();if(a.dataset.act==='rel')$('#expTudo').click()}});
/* ---------- abas ---------- */
const tabs=['inicio','entregas','simulador','produtos','carteira','compras','notas','vendas','estoque'];
const LBL={"inicio": ["Início", "Cia Beauty · projetos licenciados"], "entregas": ["Entregas", "Status de recebimento por projeto"], "simulador": ["Custos", "Custo e necessidade de caixa por lote"], "produtos": ["Produtos", "Do que cada produto é feito: insumos, fornecedores e lote"], "carteira": ["Carteira", "Desembolso dos próximos lotes"], "compras": ["Compras", "Insumos comprados nas NFs de entrada"], "notas": ["Notas XML", "Importar e exportar NF-e de entrada e saída"], "vendas": ["Vendas", "Vendas por produto, canal e mês"], "estoque": ["Estoque", "Estoque atual no armazém Stralog"]};
function showTab(t){if(!tabs.includes(t))t='inicio';$('#kpis').hidden=t!=='inicio';$('#tabTitle').textContent=t==='inicio'?('Olá'+(window.__NOME?', '+window.__NOME:'')):LBL[t][0]==='Custos'?'Custos':LBL[t][0]==='Produtos'?'Produtos':LBL[t][0]==='Carteira'?'Carteira futura':LBL[t][0]==='Compras'?'Compras de insumos':LBL[t][0]==='Notas XML'?'Notas fiscais (XML)':LBL[t][0]==='Estoque'?'Estoque Stralog':LBL[t][0]==='Vendas'?'Vendas':'Entregas';$('#tabSub').textContent=LBL[t][1];window.scrollTo(0,0);document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));tabs.forEach(x=>$('#tab-'+x).hidden=x!==t);if(location.hash!=='#'+t)history.replaceState(null,'','#'+t);renderAll()}
document.querySelector('nav.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab)});
window.addEventListener('hashchange',()=>showTab(location.hash.slice(1)));
function renderAll(){renderKpis();const t=tabs.find(x=>!$('#tab-'+x).hidden);if(t==='inicio')renderInicio();if(t==='entregas')renderEntregas();if(t==='simulador')renderSim();if(t==='produtos')renderProdutos(true);if(t==='carteira')renderCarteira();if(t==='compras')renderCompras();if(t==='notas')renderNotas();if(t==='vendas')renderVendas();if(t==='estoque')renderEstoque()}
document.addEventListener('click',e=>{if(!e.target.closest('.searchbox')){const s=$('#sugg');if(s)s.hidden=true}});


/* ---------- PRODUTOS: árvore produto → insumos → fornecedores (só leitura; usa calc() da aba Custos) ---------- */
const PD_TIPOS={
  frasco:['Frasco','--t-prim','<path d="M10 3h4v3l2 2v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8l2-2z"/><path d="M8 12h8"/>'],
  valvula:['Válvula','--t-prim','<path d="M9 9h6v12H9z"/><path d="M10 9V6h6l3 2"/><path d="M12 6V4"/>'],
  tampa:['Tampa','--t-prim','<rect x="6" y="9" width="12" height="11" rx="2"/><path d="M8 9V6h8v3M9 13v4M12 13v4M15 13v4"/>'],
  batoque:['Batoque','--t-prim','<path d="M8 6h8l-1 5H9z"/><path d="M10 11v7a2 2 0 0 0 4 0v-7"/>'],
  rotulo:['Rótulo','--t-deco','<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.5"/>'],
  envase:['Envase','--t-cont','<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/>'],
  materia:['Matéria-prima','--t-cont','<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 14h9"/>'],
  caixa:['Caixa de embarque','--t-sec','<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'],
  cartucho:['Cartucho','--t-sec','<rect x="5" y="3" width="14" height="18" rx="1"/><rect x="8" y="7" width="8" height="7" rx="1"/>'],
  montagem:['Montagem','--t-serv','<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>'],
  acessorio:['Acessório','--t-prim','<path d="M12 8c-2-4-8-4-8 0s6 4 8 0c2 4 8 4 8 0s-6-4-8 0z"/><path d="M12 8v12"/>'],
  outro:['Insumo','--t-serv','<circle cx="12" cy="12" r="8"/>']
};
const pdNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function pdTipo(nome){const s=pdNorm(nome);for(const [k,t] of [['rotulo','rotulo'],['fita','rotulo'],['envase','envase'],['materia','materia'],['caixa','caixa'],['cartucho','cartucho'],['montagem','montagem'],['scrunchie','acessorio'],['frasco','frasco'],['valvula','valvula'],['gatilho','valvula'],['spray','valvula'],['pump','valvula'],['tampa','tampa'],['batoque','batoque']])if(s.includes(k))return PD_TIPOS[t];return PD_TIPOS.outro}
const pdPct=new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
const pdR3=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:3});
const pdDt=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(2,4):'—';
const pdNomeCurto=p=>String(p.sku||'').replace(/^(TWEETY X DEBORAH SECCO|MORANGUINHO X THAIS FERSOZA|BT21)\s+/i,'').replace(/\s+/g,' ').trim()||p.sku;
let PD={col:'',q:'',cur:null,sel:null,forn:null,fotos:{},site:[],gestor:false,ligado:false,trocar:false};
const PD_CAT={};(D.catalogo||[]).forEach(c=>{if(!PD_CAT[c[0]])PD_CAT[c[0]]=c});
async function pdLigar(){
  if(PD.ligado||!window.claude||!claude.use)return;PD.ligado=true;
  try{const u=await claude.use('user');if(u)PD.gestor=!!(await u.isOwner())}catch(e){}
  try{const d=await claude.use('db');if(!d)return;
    d.collection('fotos').onSnapshot(s=>{const f={};s.docs.forEach(x=>{f[x.id]=x.data()});PD.fotos=f;if(!$('#tab-produtos').hidden)renderProdutos(false)});
    d.doc('fotos_site/catalogo').onSnapshot(s=>{PD.site=(s.exists&&s.data().itens)||[]});
  }catch(e){}
}
function pdFoto(p,cls){const f=PD.fotos[p.id];return f&&f.url?'<img class="'+(cls||'')+'" src="'+esc(f.url)+'" alt="'+esc(p.sku)+'" loading="lazy">':'<span class="pd-semfoto">'+esc((p.colecao||'?').slice(0,2).toUpperCase())+'</span>'}
function pdHist(cod){if(!cod||cod==='?')return[];const h=[];Object.values(notas).forEach(n=>{(n.itens||[]).forEach(it=>{if(it[0]===cod)h.push({d:n.data,nf:n.num,f:n.emit,q:it[3],u:it[4]})})});return h.sort((a,b)=>a.d<b.d?1:-1).slice(0,8)}
function pdCalc(p){const k=calc(p);let unit=0;k.linhas.forEach(l=>{l.coef=+l.c.coef||0;l.un=l.coef*(l.cu||0);unit+=l.un});k.linhas.forEach(l=>{l.pct=unit?l.un/unit:0});return k}
function renderProdutos(animar){
  pdLigar();
  const todos=allProjects();const cols=[...new Set(todos.map(p=>p.colecao).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(PD.col&&!cols.includes(PD.col))PD.col='';
  $('#pdCols').innerHTML=['<button class="chip" data-col="" aria-pressed="'+(!PD.col)+'">Todas</button>'].concat(cols.map(c=>'<button class="chip" data-col="'+esc(c)+'" aria-pressed="'+(PD.col===c)+'">'+esc(c)+' <span class="muted">'+todos.filter(p=>p.colecao===c).length+'</span></button>')).join('');
  const qq=pdNorm(PD.q).split(/\s+/).filter(Boolean);
  const lista=todos.filter(p=>(!PD.col||p.colecao===PD.col)&&(!qq.length||qq.every(t=>pdNorm([p.sku,p.id,p.codigo,p.colecao].concat(comps(p).map(c=>c.forn+' '+c.nome)).join(' ')).includes(t))));
  if(!PD.cur||!byId(PD.cur))PD.cur=(lista[0]||todos[0]||{}).id||null;
  $('#pdGrid').innerHTML=lista.length?lista.map(p=>{const k=pdCalc(p);let u=0;k.linhas.forEach(l=>u+=l.un);return '<button class="pd-card" data-p="'+esc(p.id)+'" aria-current="'+(p.id===PD.cur&&pdAberto())+'"><span class="pd-ph">'+pdFoto(p)+'</span><b>'+esc(pdNomeCurto(p))+'</b><span class="pd-meta"><span class="num">'+esc(p.id)+'</span><span class="num">'+(k.semEstrutura?'sem estrutura':pdR3.format(u)+'/un')+'</span></span></button>'}).join(''):'<p class="note">Nenhum produto encontrado.</p>';
  if(pdAberto()){pdMontar(!!animar);pdPainel()}
}
function pdAberto(){return !$('#pdModal').hidden}
function pdAbrir(id){PD.cur=id;PD.sel=null;PD.forn=null;PD.trocar=false;const p=byId(id);$('#pdMcol').textContent=(p.id||'')+' · '+(p.colecao||'');$('#pdMtit').textContent=pdNomeCurto(p);$('#pdModal').hidden=false;document.body.style.overflow='hidden';$('#pdModal').scrollTop=0;document.querySelectorAll('#pdGrid .pd-card').forEach(c=>c.setAttribute('aria-current',String(c.dataset.p===id)));requestAnimationFrame(()=>{pdMontar(true);pdPainel()})}
function pdFechar(){$('#pdModal').hidden=true;document.body.style.overflow='';PD.sel=null;PD.forn=null;PD.trocar=false}
function pdMontar(animar){
  const st=$('#pdStage');const p=byId(PD.cur);if(!p){st.innerHTML='';return}
  const k=pdCalc(p);let unit=0;k.linhas.forEach(l=>unit+=l.un);
  st.className='pd-stage';
  st.innerHTML='<svg class="pd-wires" aria-hidden="true"></svg><button class="pd-hub" id="pdHub" aria-label="Resumo do produto">'+pdFoto(p)+'</button><div class="pd-cap" id="pdCap">'+esc(pdNomeCurto(p))+'<span>'+(k.semEstrutura?'sem estrutura cadastrada':pdR3.format(unit)+' por unidade')+'</span></div>'+
    (k.semEstrutura?'<div class="pd-vazio">Este produto ainda não tem insumos cadastrados. Monte a estrutura na aba Custos.</div>':'')+
    k.linhas.map((l,i)=>{const t=pdTipo(l.c.nome);return '<button class="pd-node" data-i="'+i+'" style="--i:'+i+';--tc:var('+t[1]+')" aria-pressed="false"><span class="pd-hd"><span class="pd-ic"><svg viewBox="0 0 24 24">'+t[2]+'</svg></span><span class="pd-nm">'+esc(l.c.nome)+'</span></span><span class="pd-fo">'+esc(short(l.c.forn)||'Fornecedor não informado')+'</span><span class="pd-vl">'+(l.cu==null?'<span class="pill bad">custo faltando</span>':'<span class="num">'+pdR3.format(l.un)+'</span>')+'<span class="num muted">'+pdPct.format(l.pct)+'</span></span><span class="pd-bar"><i style="width:'+(l.pct*100).toFixed(1)+'%"></i></span></button>'}).join('');
  pdLayout();
  if(animar){st.classList.remove('anim');void st.offsetWidth;st.classList.add('anim')}
  pdMarcar();
}
function pdLayout(){
  const st=$('#pdStage');if(!st||!st.isConnected||$('#tab-produtos').hidden)return;const nodes=[...st.querySelectorAll('.pd-node')];const W=st.clientWidth;const hub=$('#pdHub'),cap=$('#pdCap');if(!hub)return;
  const lista=W<720||!nodes.length;st.classList.toggle('lista',lista);st.querySelectorAll('.pd-trilho').forEach(t=>t.remove());
  if(lista){st.style.height='';if(nodes.length){const z=nodes[nodes.length-1];const t=document.createElement('div');t.className='pd-trilho';const y0=hub.offsetTop+hub.offsetHeight;t.style.top=y0+'px';t.style.height=Math.max(0,z.offsetTop+z.offsetHeight/2-y0)+'px';st.prepend(t)}return}
  const n=nodes.length;const H=n>7?660:560;st.style.height=H+'px';const cx=W/2,cy=H/2;
  hub.style.left=(cx-95)+'px';hub.style.top=(cy-110)+'px';cap.style.left=(cx-110)+'px';cap.style.top=(cy+90)+'px';
  const rx=Math.min(W/2-100,420),ry=H/2-58,nw=168;const svg=st.querySelector('svg.pd-wires');svg.setAttribute('viewBox','0 0 '+W+' '+H);let paths='';
  nodes.forEach((el,i)=>{const ang=-Math.PI/2+(i+.5)*(2*Math.PI/n)-Math.PI/n*.5;const x=cx+rx*Math.cos(ang),y=cy+ry*Math.sin(ang);const h=el.offsetHeight;
    const L=Math.max(8,Math.min(W-nw-8,x-nw/2)),T=Math.max(8,Math.min(H-h-8,y-h/2));el.style.left=L+'px';el.style.top=T+'px';
    const ex=L+nw/2,ey=T+h/2;el.style.setProperty('--dx',(cx-ex)+'px');el.style.setProperty('--dy',(cy-20-ey)+'px');
    const mx=(cx+ex)/2+(ey-cy)*.15,my=(cy-20+ey)/2-(ex-cx)*.15;paths+='<path data-i="'+i+'" style="--i:'+i+';--len:'+(Math.hypot(ex-cx,ey-cy)*1.15).toFixed(0)+'" d="M'+cx+' '+(cy-20)+' Q'+mx.toFixed(1)+' '+my.toFixed(1)+' '+ex.toFixed(1)+' '+ey.toFixed(1)+'"/>'});
  svg.innerHTML=paths;
}
function pdMarcar(){const st=$('#pdStage');st.querySelectorAll('.pd-node').forEach(n=>n.setAttribute('aria-pressed',String(+n.dataset.i===PD.sel)));st.querySelectorAll('.pd-wires path').forEach(p=>p.classList.toggle('on',+p.dataset.i===PD.sel))}
function pdPainel(){
  const el=$('#pdPainel');const p=byId(PD.cur);if(!p){el.innerHTML='<p class="note">Escolha um produto.</p>';return}
  const k=pdCalc(p);let unit=0;k.linhas.forEach(l=>unit+=l.un);const site=PD.fotos[p.id]&&PD.fotos[p.id].site;
  if(PD.forn){
    const dep=[];allProjects().forEach(x=>{if(comps(x).some(c=>(c.forn||'').trim()===PD.forn))dep.push(x)});dep.sort((a,b)=>(a.colecao||'').localeCompare(b.colecao||'')||a.sku.localeCompare(b.sku));
    let g='';el.innerHTML='<div><div class="eyebrow">Fornecedor</div><h2>'+esc(short(PD.forn))+'</h2></div><div class="pd-kv"><div><small>Produtos que dependem dele</small><b>'+dep.length+'</b></div><div><small>Coleções</small><b>'+new Set(dep.map(x=>x.colecao)).size+'</b></div></div><p class="note">Se este fornecedor atrasar, estes projetos ficam sem o insumo. Toque num produto para abri-lo.</p><div class="pd-dep">'+dep.map(x=>{const cab=x.colecao!==g?'<div class="g">'+esc(x.colecao)+'</div>':'';g=x.colecao;return cab+'<button class="i'+(x.id===p.id?' here':'')+'" data-abrir="'+esc(x.id)+'">'+esc(pdNomeCurto(x))+' <span class="muted num">'+esc(x.id)+'</span></button>'}).join('')+'</div><button class="btn" data-pd="volta">← Voltar ao insumo</button>';return;
  }
  if(PD.trocar){
    const it=PD.site||[];el.innerHTML='<div><div class="eyebrow">Foto do produto</div><h2>'+esc(pdNomeCurto(p))+'</h2></div><input type="search" id="pdFotoBusca" placeholder="Buscar no site Cia Beauty" aria-label="Buscar foto no site"><div class="pd-fotos" id="pdFotos">'+pdFotosLista('')+'</div><div class="row"><button class="btn" data-pd="semfoto">Deixar sem foto</button><button class="btn" data-pd="cancelaFoto">Cancelar</button></div>'+(it.length?'':'<p class="note">Lista do site ainda não carregada.</p>');
    $('#pdFotoBusca').addEventListener('input',e=>{$('#pdFotos').innerHTML=pdFotosLista(e.target.value)});return;
  }
  if(PD.sel==null||!k.linhas[PD.sel]){
    const L=k.linhas.slice().sort((a,b)=>b.un-a.un);
    el.innerHTML='<div><div class="eyebrow">'+esc(p.id)+' · '+esc(p.colecao||'')+'</div><h2>'+esc(pdNomeCurto(p))+'</h2></div>'+
      '<div class="pd-kv"><div><small>Custo por unidade</small><b>'+pdR3.format(unit)+'</b></div><div><small>Insumos</small><b>'+k.linhas.length+(k.falta?' <span class="pill bad">'+k.falta+' sem custo</span>':'')+'</b></div><div><small>Lote a produzir</small><b>'+fmtI.format(k.Q)+' un</b></div><div><small>Desembolso do lote</small><b>'+fmtR0.format(k.desemb)+'</b></div></div>'+
      (L.length?'<div><h3 style="margin-bottom:8px">De onde vem o custo</h3><div class="pd-comp">'+L.filter(l=>l.un>0).map(l=>'<i style="--tc:var('+pdTipo(l.c.nome)[1]+');width:'+(l.pct*100).toFixed(2)+'%" title="'+esc(l.c.nome)+'"></i>').join('')+'</div></div><div class="pd-leg">'+L.map(l=>'<div style="--tc:var('+pdTipo(l.c.nome)[1]+')"><i class="sw"></i><span>'+esc(l.c.nome)+'</span><span class="num">'+(l.cu==null?'—':pdR3.format(l.un))+'</span><span class="num muted">'+pdPct.format(l.pct)+'</span></div>').join('')+'</div>':'')+
      '<p class="note">Pedido '+fmtI.format(total(p))+' · recebido '+fmtI.format(p.rec||0)+'. Os números seguem a aba Custos (quantidade e abatimento de estoque definidos lá).</p>'+
      '<div class="row"><button class="btn pri" data-pd="custos">Editar em Custos</button>'+(site?'<a class="btn" href="'+esc(site)+'" target="_blank" rel="noopener">Ver no site</a>':'')+(PD.gestor?'<button class="btn" data-pd="trocarFoto">Trocar foto</button>':'')+'</div>';
    return;
  }
  const l=k.linhas[PD.sel],c=l.c,t=pdTipo(c.nome),cat=PD_CAT[c.cod],hist=pdHist(c.cod);
  el.innerHTML='<div class="pd-tit" style="--tc:var('+t[1]+')"><span class="pd-ic"><svg viewBox="0 0 24 24">'+t[2]+'</svg></span><div style="min-width:0"><div class="eyebrow">'+esc(t[0])+(c.cod&&c.cod!=='?'?' · <span class="num">'+esc(c.cod)+'</span>':'')+'</div><h2 style="font-size:1.1rem">'+esc(c.nome)+'</h2></div></div>'+
    (c.forn?'<div class="pd-forn"><div style="min-width:0"><div class="eyebrow">Fornecedor</div><b>'+esc(short(c.forn))+'</b></div><button class="btn" data-pd="forn">Quem depende dele</button></div>':'<div class="pd-forn"><b>Fornecedor não informado</b></div>')+
    '<div class="pd-kv"><div><small>Custo un.</small><b>'+(l.cu==null?'—':pdR3.format(l.cu))+'</b></div><div><small>Consumo por produto</small><b class="num">'+l.coef.toLocaleString('pt-BR',{maximumFractionDigits:4})+'</b></div><div><small>No custo do produto</small><b>'+(l.cu==null?'—':pdR3.format(l.un))+'</b></div><div><small>Participação</small><b>'+pdPct.format(l.pct)+'</b></div></div>'+
    '<div><h3 style="margin-bottom:8px">Lote de '+fmtI.format(k.Q)+' unidades</h3><div class="pd-kv"><div><small>Precisa</small><b>'+fmtI.format(l.nec)+'</b></div><div><small>Tem em estoque</small><b>'+fmtI.format(l.est)+'</b></div><div><small>Comprar</small><b>'+fmtI.format(l.comprar)+'</b></div><div><small>Desembolso</small><b>'+(l.cu==null?'—':fmtR0.format(l.v))+'</b></div></div></div>'+
    (cat?'<div><h3 style="margin-bottom:6px">Última compra</h3><p class="note" style="margin:0">'+pdDt(cat[5])+' · '+fmtI.format(cat[3])+' un a '+pdR3.format(cat[4])+'<br>'+esc(cat[1])+'</p></div>':'<p class="note">Sem compra registrada nas notas para este código.</p>')+
    (hist.length?'<div><h3 style="margin-bottom:6px">Notas fiscais (XML)</h3><div class="tbl-wrap"><table><thead><tr><th>Data</th><th>NF</th><th class="n">Qtd</th><th class="n">Preço</th></tr></thead><tbody>'+hist.map(h=>'<tr><td>'+pdDt(h.d)+'</td><td class="mono">'+esc(h.nf)+'</td><td class="n">'+fmtI.format(h.q)+'</td><td class="n">'+pdR3.format(h.u)+'</td></tr>').join('')+'</tbody></table></div></div>':'')+
    '<button class="btn" data-pd="resumo">← Resumo do produto</button>';
}
function pdFotosLista(q){const t=pdNorm(q).split(/\s+/).filter(Boolean);const it=(PD.site||[]).filter(s=>t.every(x=>pdNorm(s.nome).includes(x))).slice(0,60);return it.map((s,i)=>'<button class="pd-fpick" data-img="'+esc(s.img)+'" data-site="'+esc('https://ciabeauty.com.br/produtos/'+s.slug+'/')+'" data-nome="'+esc(s.nome)+'"><img src="'+esc(s.img)+'" alt="" loading="lazy"><span>'+esc(s.nome)+'</span></button>').join('')||'<p class="note">Nada encontrado.</p>'}
async function pdSalvarFoto(dados){try{const d=await claude.use('db');if(dados)await d.collection('fotos').doc(PD.cur).set(dados);else await d.collection('fotos').doc(PD.cur).delete();if(dados)PD.fotos[PD.cur]=dados;else delete PD.fotos[PD.cur];PD.trocar=false;renderProdutos(false);setSave('ok','Foto salva')}catch(e){setSave('warn','Não salvou a foto')}}
$('#pdCols').addEventListener('click',e=>{const b=e.target.closest('[data-col]');if(!b)return;PD.col=b.dataset.col;renderProdutos(false)});
$('#pdBusca').addEventListener('input',e=>{PD.q=e.target.value;renderProdutos(false)});
$('#pdGrid').addEventListener('click',e=>{const b=e.target.closest('[data-p]');if(!b)return;pdAbrir(b.dataset.p)});
$('#pdFechar').addEventListener('click',pdFechar);
$('#pdModal').addEventListener('click',e=>{if(e.target===$('#pdModal'))pdFechar()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pdAberto())pdFechar()});
window.addEventListener('hashchange',()=>{if(pdAberto()&&location.hash!=='#produtos')pdFechar()});
$('#pdStage').addEventListener('click',e=>{const n=e.target.closest('.pd-node');if(n){const i=+n.dataset.i;PD.sel=PD.sel===i?null:i;PD.forn=null;PD.trocar=false;pdMarcar();pdPainel();if(innerWidth<1100&&PD.sel!=null)$('#pdPainel').scrollIntoView({behavior:'smooth',block:'start'});return}
  if(e.target.closest('#pdHub')){PD.sel=null;PD.forn=null;PD.trocar=false;pdMontar(true);pdPainel()}});
$('#pdPainel').addEventListener('click',e=>{const a=e.target.closest('[data-pd],[data-abrir],.pd-fpick');if(!a)return;
  if(a.dataset.abrir){pdAbrir(a.dataset.abrir);return}
  if(a.classList.contains('pd-fpick')){pdSalvarFoto({url:a.dataset.img,site:a.dataset.site,nome_site:a.dataset.nome,origem:'manual'});return}
  const k=a.dataset.pd,p=byId(PD.cur),kk=pdCalc(p);
  if(k==='forn'){PD.forn=(kk.linhas[PD.sel].c.forn||'').trim();pdPainel()}
  if(k==='volta'){PD.forn=null;pdPainel()}
  if(k==='resumo'){PD.sel=null;pdMarcar();pdPainel()}
  if(k==='custos'){cur=PD.cur;pdFechar();showTab('simulador')}
  if(k==='trocarFoto'){PD.trocar=true;pdPainel()}
  if(k==='cancelaFoto'){PD.trocar=false;pdPainel()}
  if(k==='semfoto')pdSalvarFoto(null);
});
let pdRT;new ResizeObserver(()=>{clearTimeout(pdRT);pdRT=setTimeout(()=>{pdLayout();pdMarcar()},60)}).observe($('#pdStage'));

showTab(location.hash.slice(1)||'inicio');
setSave('warn','Salvo só neste navegador');

/* ---------- usuário, permissões e auditoria ---------- */
let MYID=null,USERNS=null;const NOMES={};
function auditLine(o){if(!o||!o._em)return '';const n=o._por?(NOMES[o._por]||''):'';if(o._por&&!(o._por in NOMES)&&USERNS){NOMES[o._por]='';USERNS.profiles([o._por]).then(ps=>{const p=ps&&ps[o._por];NOMES[o._por]=(p&&p.name)||'';renderAll()}).catch(()=>{})}
  const d=new Date(o._em);return '<div class="audit">Última alteração: '+esc(n||'alguém com acesso')+' · '+d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</div>'}
(async()=>{try{
  if(!window.claude||!claude.use)return;const u=await claude.use('user');if(!u)return;USERNS=u;
  const me=await u.me();MYID=me.id||null;const nome=me.name||'você';
  let pode=await u.can('data.write');if(pode===null)pode=true;
  $('#whoami').innerHTML='<span class="av">'+esc((nome[0]||'?').toUpperCase())+'</span><span>'+esc(nome)+'<br><span style="color:var(--side-muted)">'+(pode?'pode editar':'somente leitura')+'</span></span>';
  if(!pode)document.body.classList.add('ro');
  if(MYID)NOMES[MYID]=me.name||'';
}catch(e){}})();
/* ---------- conectar ao banco ---------- */
(async()=>{try{
  if(!window.claude||!claude.use)return;
  const d=await claude.use('db');if(!d){setSave('warn','Salvo só neste navegador');return}
  db=d;setSave('ok','Salvo na nuvem · base única');
  db.doc('estoque/atual').onSnapshot(s=>{if(s.exists){estoqueAtual=JSON.parse(JSON.stringify(s.data()));lsVE();renderAll()}else if(estoqueAtual){db.doc('estoque/atual').set(estoqueAtual).catch(()=>{})}},()=>{});
  db.collection('vendas').onSnapshot(snap=>{const L={};snap.docs.forEach(d=>{if(!d.exists)return;const x=d.data();const l=L[x.lote]||(L[x.lote]={arquivo:x.arquivo,importado:x.importado,partes:x.partes,linhas:[],_p:{}});l._p[x.parte]=x.linhas});
    Object.values(L).forEach(l=>{Object.keys(l._p).sort((a,b)=>a-b).forEach(k=>l._p[k].forEach(r=>l.linhas.push(r)));delete l._p});
    if(snap.empty&&Object.keys(vendasLotes).length)return;vendasLotes=L;lsVE();renderAll()},()=>{});
  db.collection('notas').onSnapshot(snap=>{
    if(snap.empty){const ks=Object.keys(notas).filter(k=>userDoc(k)).concat([...REMOV]);if(ks.length){ks.forEach(k=>saveNota(k));return}}
    const user={};snap.docs.forEach(doc=>{if(doc.exists)user[doc.id]=JSON.parse(JSON.stringify(doc.data()))});
    qN.forEach(k=>{const d=userDoc(k);if(d)user[k]=d});
    const old=notas;notas=mergeNotas(user);Object.keys(notas).forEach(k=>{if(!notas[k].xml&&old[k]&&old[k].xml&&!notas[k].base)notas[k].xml=old[k].xml});
    lsNotas();applyNotas();renderAll();
  },()=>{});
  db.collection('projetos').onSnapshot(snap=>{
    const next={};snap.docs.forEach(doc=>{if(doc.exists)next[doc.id]=JSON.parse(JSON.stringify(doc.data()))});
    // mantém edições locais ainda não enviadas
    Object.keys(timers).forEach(k=>{if(ov[k])next[k]=ov[k]});
    if(snap.empty&&Object.keys(ov).length){Object.keys(ov).forEach(k=>persist(k));return}
    ov=next;lsSave();
    const active=document.activeElement;if(active&&active.closest&&active.closest('#editor')&&active.tagName==='INPUT')return;
    renderAll();
  },()=>{setSave('warn','Sem conexão — salvo neste navegador');db=null});
}catch(e){}})();
})();
