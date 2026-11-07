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
/* ---------- GRUPO ECONÔMICO x EMPRESA (só filtra o que as abas Notas e Vendas mostram) ---------- */
const soDig=s=>String(s||'').replace(/\D/g,'');
const fmtCnpj=d=>d.length===14?d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'):d;
function empRotulo(nome){return WEP.test(nome||'')?'We Premium':/CREATIVE/i.test(nome||'')?'Creative House':/CIA\.?\s*BEAUTY/i.test(nome||'')?'Cia Beauty':short(nome)}
function empNota(n){const e={doc:soDig(n.emitDoc),nome:n.emit},d={doc:soDig(n.destDoc),nome:n.dest};const nosso=x=>OURS.test(x.nome||'');
  if(n.tipo==='saida')return nosso(e)?e:(nosso(d)?d:e);return nosso(d)?d:(nosso(e)?e:d)}
function empresasGrupo(){const m={};Object.values(notas).forEach(n=>{const e=empNota(n);if(e.doc&&OURS.test(e.nome||'')&&!m[e.doc])m[e.doc]={doc:e.doc,nome:empRotulo(e.nome)}});
  const L=Object.values(m);const cont={};L.forEach(x=>{cont[x.nome]=(cont[x.nome]||0)+1});L.forEach(x=>{if(cont[x.nome]>1)x.nome+=' ('+fmtCnpj(x.doc).slice(-8)+')'});return L.sort((a,b)=>a.nome.localeCompare(b.nome))}
function empNome(doc){if(!doc)return 'Fora do grupo / não identificada';const e=empresasGrupo().find(x=>x.doc===doc);return e?e.nome:fmtCnpj(doc)}
let EMP='';try{EMP=localStorage.getItem('ciab-emp')||''}catch(e){}
function empChips(sel){const L=empresasGrupo();if(EMP&&!L.some(x=>x.doc===EMP))EMP='';
  $(sel).innerHTML='<button class="chip" data-emp="" aria-pressed="'+(EMP==='')+'">Grupo econômico</button>'+L.map(x=>'<button class="chip" data-emp="'+x.doc+'" aria-pressed="'+(EMP===x.doc)+'" title="CNPJ '+fmtCnpj(x.doc)+'">'+esc(x.nome)+'</button>').join('')}
function setEmp(d){EMP=d;try{localStorage.setItem('ciab-emp',d)}catch(e){}renderAll()}
function notasLista(){
  const q=$('#notaSearch').value.trim().toLowerCase();
  return Object.values(notas).filter(n=>(!EMP||empNota(n).doc===EMP)&&(!notaFiltro||n.tipo===notaFiltro)&&(!q||[n.num,n.emit,n.dest,n.natOp,n.chave].concat(n.itens.map(i=>i[0]+' '+i[1])).join(' ').toLowerCase().includes(q))).sort((a,b)=>(b.data||'').localeCompare(a.data||''));
}
function renderNotas(){
  empChips('#notaEmp');
  const todas=Object.values(notas),all=todas.filter(n=>!EMP||empNota(n).doc===EMP),E=all.filter(n=>n.tipo==='entrada'),S=all.filter(n=>n.tipo==='saida');
  {const G={};todas.forEach(n=>{const d=empNota(n).doc;const k=OURS.test(empNota(n).nome||'')?d:'';const g=G[k]||(G[k]={e:0,ev:0,s:0,sv:0});if(n.tipo==='entrada'){g.e++;g.ev+=n.vNF||0}else{g.s++;g.sv+=n.vNF||0}});
   const ks=Object.keys(G).sort((a,b)=>empNome(a).localeCompare(empNome(b)));const tot=ks.reduce((t,k)=>({e:t.e+G[k].e,ev:t.ev+G[k].ev,s:t.s+G[k].s,sv:t.sv+G[k].sv}),{e:0,ev:0,s:0,sv:0});
   $('#notaEmpTbl').innerHTML=EMP?'':'<h3 style="margin-bottom:8px">Por empresa do grupo</h3><div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th class="n">Entradas</th><th class="n">Valor entradas</th><th class="n">Saídas</th><th class="n">Valor saídas</th></tr></thead><tbody>'+ks.map(k=>'<tr class="empLinha" data-emp="'+k+'" style="cursor:'+(k?'pointer':'default')+'"><td>'+esc(empNome(k))+(k?' <span class="note mono">'+fmtCnpj(k)+'</span>':'')+'</td><td class="n">'+fmtI.format(G[k].e)+'</td><td class="n">'+fmtR0.format(G[k].ev)+'</td><td class="n">'+fmtI.format(G[k].s)+'</td><td class="n">'+fmtR0.format(G[k].sv)+'</td></tr>').join('')+'</tbody><tfoot><tr><td>Grupo econômico</td><td class="n">'+fmtI.format(tot.e)+'</td><td class="n">'+fmtR0.format(tot.ev)+'</td><td class="n">'+fmtI.format(tot.s)+'</td><td class="n">'+fmtR0.format(tot.sv)+'</td></tr></tfoot></table></div>';}
  const sum=a=>a.reduce((x,n)=>x+(n.vNF||0),0);
  $('#notaResumo').innerHTML='<div class="box"><div class="eyebrow">Entradas'+(EMP?' · '+esc(empNome(EMP)):'')+'</div><div class="v num">'+E.length+'</div><div class="note">'+fmtR0.format(sum(E))+'</div></div><div class="box"><div class="eyebrow">Saídas'+(EMP?' · '+esc(empNome(EMP)):'')+'</div><div class="v num">'+S.length+'</div><div class="note">'+fmtR0.format(sum(S))+'</div></div><div class="box"><div class="eyebrow">Itens novos no estoque</div><div class="v num">'+fmtI.format(Object.values(XIN).reduce((a,b)=>a+b,0))+'</div><div class="note">un. de entradas fora da planilha</div></div>';
  document.querySelectorAll('#notaChips .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.f===notaFiltro));
  const rows=notasLista();
  if(!all.length){$('#notasTbl').innerHTML='<tbody><tr><td class="muted" style="padding:18px">'+(EMP&&todas.length?'Nenhuma nota desta empresa.</td></tr></tbody>':'Nenhuma nota importada ainda. Arraste os XMLs de NF-e (ou o .zip exportado do Bling) na área acima.</td></tr></tbody>');return}
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
$('#notaEmp').addEventListener('click',e=>{const c=e.target.closest('[data-emp]');if(c)setEmp(c.dataset.emp)});
$('#notaEmpTbl').addEventListener('click',e=>{const c=e.target.closest('tr[data-emp]');if(c&&c.dataset.emp)setEmp(c.dataset.emp)});
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
  const ws=wb.Sheets[wb.SheetNames[0]];
  // algumas planilhas (ex.: extrato da Lalamove) declaram um tamanho menor que o real: recalcula pelo conteúdo
  let mr=0,mc=0,tem=false;Object.keys(ws).forEach(k=>{if(k[0]==='!')return;const c=XLSX.utils.decode_cell(k);tem=true;if(c.r>mr)mr=c.r;if(c.c>mc)mc=c.c});if(tem)ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:mr,c:mc}});
  return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
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
    const canalArq=file.name.replace(/\.[^.]+$/,'');const empArq=$('#venEmpArq').value||'';
    const linhas=[];rows.slice(h.row+1).forEach(r=>{const c=normK(r[h.map.cod]);const q=num(r[h.map.qtd]);if(!c||!q)return;
      linhas.push([h.map.data!=null?dataISO(r[h.map.data]):'',c,h.map.desc!=null?String(r[h.map.desc]).trim().slice(0,90):'',q,h.map.valor!=null?num(r[h.map.valor]):0,h.map.canal!=null?String(r[h.map.canal]).trim().slice(0,40):canalArq,empArq])});
    if(!linhas.length){msg.textContent='Nenhuma linha de venda com código e quantidade.';return}
    const id='L'+Date.now().toString(36);const partes=[];for(let i=0;i<linhas.length;i+=1500)partes.push(linhas.slice(i,i+1500));
    vendasLotes[id]={arquivo:file.name,importado:new Date().toISOString().slice(0,10),partes:partes.length,linhas,empresa:empArq};
    lsVE();
    if(db){setSave('','Salvando vendas…');(async()=>{try{for(let i=0;i<partes.length;i++)await db.collection('vendas').doc(id+'-'+i).set({lote:id,arquivo:file.name,importado:vendasLotes[id].importado,parte:i,partes:partes.length,linhas:partes[i],empresa:empArq});setSave('ok','Vendas salvas')}catch(e){setSave('warn','Vendas ficaram só neste navegador')}})()}
    msg.textContent=linhas.length+' linhas de venda lidas de '+file.name+'.';
    renderAll();
  }catch(e){msg.textContent='Não consegui ler o arquivo: '+(e.message||e)}
}
function vendasLinhas(){
  const L=[];Object.values(vendasLotes).forEach(l=>l.linhas.forEach(x=>L.push(x.length>6?x:x.concat([l.empresa||'']))));
  Object.values(notas).forEach(n=>{if(n.tipo!=='saida'||n.cancelada)return;if(/remessa|retorno|transfer|devolu|armazen|dep[oó]sito/i.test(n.natOp))return;n.itens.forEach(i=>L.push([n.data,normK(i[0]),i[1],i[3],i[5],'NF '+short(n.dest),empNota(n).doc]))});
  return L;
}
function vendasPorCod(){const V={};vendasLinhas().forEach(([d,c,ds,q,v,cn])=>{const a=V[c]||(V[c]={q:0,v:0,mes:{},desc:ds,canais:{}});a.q+=q;a.v+=v;const m=(d||'').slice(0,7);if(m)a.mes[m]=(a.mes[m]||0)+q;a.canais[cn]=(a.canais[cn]||0)+q});return V}
function mediaMensal(a){const ms=Object.keys(a.mes).sort();if(!ms.length)return 0;const ult=ms.slice(-3);return ult.reduce((s,m)=>s+a.mes[m],0)/ult.length}
function projPorCod(){const P={};allProjects().forEach(p=>{if(p.codigo)P[normK(p.codigo)]=p});return P}
function estPorCod(){const E={};(estoqueAtual&&estoqueAtual.itens||[]).forEach(i=>{E[i.cod]=i});return E}
function renderVendas(){
  empChips('#venEmp');{const sel=$('#venEmpArq');const v=sel.value;sel.innerHTML='<option value="">Grupo / não informada</option>'+empresasGrupo().map(x=>'<option value="'+x.doc+'">'+esc(x.nome)+'</option>').join('');sel.value=[...sel.options].some(o=>o.value===v)?v:(EMP||'')}
  const LG=vendasLinhas();const L=LG.filter(x=>!EMP||x[6]===EMP);const canais={};L.forEach(x=>{canais[x[5]]=(canais[x[5]]||0)+x[3]});
  {const G={};LG.forEach(x=>{const k=x[6]||'';const g=G[k]||(G[k]={q:0,v:0});g.q+=x[3];g.v+=x[4]});const ks=Object.keys(G).sort((a,b)=>empNome(a).localeCompare(empNome(b)));const tq=ks.reduce((t,k)=>t+G[k].q,0),tv=ks.reduce((t,k)=>t+G[k].v,0);
   $('#venEmpTbl').innerHTML=(EMP||!ks.length)?'':'<h3 style="margin-bottom:8px">Por empresa do grupo</h3><div class="tbl-wrap"><table><thead><tr><th>Empresa</th><th class="n">Unidades</th><th class="n">Faturamento</th><th class="n">% do grupo</th></tr></thead><tbody>'+ks.map(k=>'<tr class="empLinha" data-emp="'+k+'" style="cursor:'+(k?'pointer':'default')+'"><td>'+esc(empNome(k))+(k?'':' <span class="note">(planilhas sem empresa)</span>')+'</td><td class="n">'+fmtI.format(G[k].q)+'</td><td class="n">'+fmtR0.format(G[k].v)+'</td><td class="n">'+(tv?(G[k].v/tv*100).toFixed(1).replace('.',',')+'%':'—')+'</td></tr>').join('')+'</tbody><tfoot><tr><td>Grupo econômico</td><td class="n">'+fmtI.format(tq)+'</td><td class="n">'+fmtR0.format(tv)+'</td><td class="n">100%</td></tr></tfoot></table></div>';}
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
$('#venEmp').addEventListener('click',e=>{const c=e.target.closest('[data-emp]');if(c)setEmp(c.dataset.emp)});
$('#venEmpTbl').addEventListener('click',e=>{const c=e.target.closest('tr[data-emp]');if(c&&c.dataset.emp)setEmp(c.dataset.emp)});
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
  vendas:()=>{const L=[['Data','Código','Descrição','Qtd','Valor (R$)','Canal','Empresa']];vendasLinhas().filter(x=>!EMP||x[6]===EMP).forEach(x=>L.push([dBR(x[0]),x[1],x[2],x[3],R2(x[4]),x[5],empNome(x[6])]));return L},
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
$('#expAba').addEventListener('click',e=>{const t=tabs.find(x=>!$('#tab-'+x).hidden)||'entregas';if(t.startsWith('fin-')){finExportar(t,e.currentTarget);return}exportar(TAB_REL[t],ABA_NOME[TAB_REL[t][0]].replace(/\W+/g,'_')+'_'+hoje()+'.xlsx',e.currentTarget)});

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
const tabs=['inicio','entregas','simulador','produtos','carteira','compras','notas','vendas','estoque','fin-pagar','fin-lala','fin-receber','fin-conf','fin-dre','fin-fluxo'];
const LBL={"inicio": ["Início", "Cia Beauty · projetos licenciados"], "entregas": ["Entregas", "Status de recebimento por projeto"], "simulador": ["Custos", "Custo e necessidade de caixa por lote"], "produtos": ["Produtos", "Do que cada produto é feito: insumos, fornecedores e lote"], "fin-pagar": ["Contas a pagar", "Financeiro · fornecedores, folha, Lala Move, antecipações e pagamentos por fora"], "fin-lala": ["Lala Move", "Financeiro · Contas a pagar · corridas, recargas e custos"], "fin-receber": ["Contas a receber", "Financeiro · notas de venda e antecipações de clientes"], "fin-conf": ["Conferência de notas", "Financeiro · decida quais notas de entrada e saída geram título"], "fin-dre": ["DRE Financeiro", "Financeiro · resultado pelo regime de caixa"], "fin-fluxo": ["Fluxo de caixa", "Financeiro · realizado e previsto"], "carteira": ["Carteira", "Desembolso dos próximos lotes"], "compras": ["Compras", "Insumos comprados nas NFs de entrada"], "notas": ["Notas XML", "Importar e exportar NF-e de entrada e saída"], "vendas": ["Vendas", "Vendas por produto, canal e mês"], "estoque": ["Estoque", "Estoque atual no armazém Stralog"]};
function showTab(t){if(!tabs.includes(t))t='inicio';$('#kpis').hidden=t!=='inicio';$('#tabTitle').textContent=t==='inicio'?('Olá'+(window.__NOME?', '+window.__NOME:'')):t.startsWith('fin-')?LBL[t][0]:LBL[t][0]==='Custos'?'Custos':LBL[t][0]==='Produtos'?'Produtos':LBL[t][0]==='Carteira'?'Carteira futura':LBL[t][0]==='Compras'?'Compras de insumos':LBL[t][0]==='Notas XML'?'Notas fiscais (XML)':LBL[t][0]==='Estoque'?'Estoque Stralog':LBL[t][0]==='Vendas'?'Vendas':'Entregas';$('#tabSub').textContent=LBL[t][1];window.scrollTo(0,0);document.querySelectorAll('nav.tabs button').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===t));tabs.forEach(x=>$('#tab-'+x).hidden=x!==t);if(location.hash!=='#'+t)history.replaceState(null,'','#'+t);renderAll()}
document.querySelector('nav.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showTab(b.dataset.tab)});
window.addEventListener('hashchange',()=>showTab(location.hash.slice(1)));
function renderAll(){renderKpis();const t=tabs.find(x=>!$('#tab-'+x).hidden);if(t==='inicio')renderInicio();if(t==='entregas')renderEntregas();if(t==='simulador')renderSim();if(t==='produtos')renderProdutos(true);if(t==='carteira')renderCarteira();if(t==='compras')renderCompras();if(t==='notas')renderNotas();if(t==='vendas')renderVendas();if(t==='estoque')renderEstoque();if(t&&t.startsWith('fin-'))renderFin(t)}
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


/* ====================== FINANCEIRO ====================== */
const FIN_CATS={
  pagar:[['Insumos e embalagens','custo'],['Envase e industrialização','custo'],['Fretes e logística','despesa'],['Lala Move','despesa'],['Royalties e licenças','despesa'],['Marketing e influenciadores','despesa'],['Folha de pagamento','pessoal'],['Pró-labore','pessoal'],['Encargos (INSS, FGTS, IRRF)','pessoal'],['Pagamentos por fora','pessoal'],['Impostos sobre vendas','deducao'],['Despesas administrativas','despesa'],['Tarifas bancárias e juros','financeiro'],['Outras despesas','despesa'],['Transferência entre empresas','nao_op'],['Empréstimos e retiradas','nao_op']],
  receber:[['Venda de produtos','receita'],['Outras receitas','receita'],['Receitas financeiras','financeiro'],['Transferência entre empresas','nao_op'],['Empréstimos e aportes','nao_op']]
};
const FIN_GRUPO={};Object.values(FIN_CATS).forEach(L=>L.forEach(([c,g])=>{FIN_GRUPO[c]=g}));
const finGrupo=(c,tipo)=>FIN_GRUPO[c]||(tipo==='receber'?'receita':'despesa');
const FIN_ORIG={nf:'Nota fiscal',antecipacao:'Antecipação',folha:'Folha',lalamove:'Lala Move',por_fora:'Por fora',manual:'Lançamento'};
const FIN={ok:false,carregando:null,T:[],B:[],C:[],CF:{},CT:[],inicio:'2026-11-01',byId:{},erro:''};
const finR=v=>Math.round((+v||0)*100)/100;
const fHoje=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const fD=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(2,4):'—';
const fAddDias=(s,n)=>{const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const fAddMes=(s,n)=>{const d=new Date(s+'T12:00:00');const dia=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);const ult=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(dia,ult));return d.toISOString().slice(0,10)};
const fNorm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/\b(LTDA|S\/?A|EIRELI|EPP|ME)\b/g,'').replace(/[^A-Z0-9]+/g,' ').trim();
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const finSB=()=>window.CIA_SB;
async function finTodas(t,ord){let all=[],f=0;for(;;){const{data,error}=await finSB().from(t).select('*').order(ord).range(f,f+999);if(error)throw error;all=all.concat(data||[]);if(!data||data.length<1000)break;f+=1000}return all}
async function finCarregar(forcar){
  if(FIN.carregando&&!forcar)return FIN.carregando;
  FIN.carregando=(async()=>{
    const[T,B,C,CF,CT]=await Promise.all([finTodas('fin_titulos','vencimento'),finTodas('fin_baixas','data'),finTodas('fin_compensacoes','data'),finTodas('fin_conferencia','chave'),finTodas('fin_contas','nome')]);
    FIN.T=T;FIN.B=B;FIN.C=C;FIN.CT=CT;FIN.CF={};CF.forEach(x=>{FIN.CF[x.chave]=x});
    try{const{data}=await finSB().from('config').select('valor').eq('chave','fin_inicio').maybeSingle();if(data&&data.valor&&data.valor.data)FIN.inicio=data.valor.data}catch(e){}
    finDerivar();FIN.ok=true;FIN.erro='';
  })().catch(e=>{FIN.erro=e.message||String(e);FIN.carregando=null;throw e});
  return FIN.carregando;
}
function finDerivar(){
  const hj=fHoje();FIN.byId={};
  FIN.T.forEach(t=>{t.valor=+t.valor;t.pago=0;t.comp=0;t.usado=0;t.baixas=[];t.comps=[];t.compsDe=[];FIN.byId[t.id]=t});
  FIN.B.forEach(b=>{b.valor=+b.valor;const t=FIN.byId[b.titulo_id];if(t){t.pago+=b.valor;t.baixas.push(b)}});
  FIN.C.forEach(c=>{c.valor=+c.valor;const t=FIN.byId[c.titulo_id],a=FIN.byId[c.antecipacao_id];if(t){t.comp+=c.valor;t.comps.push(c)}if(a){a.usado+=c.valor;a.compsDe.push(c)}});
  FIN.T.forEach(t=>{
    if(t.origem==='antecipacao'){t.saldo=finR(t.valor-t.pago);t.aComp=finR(t.pago-t.usado);t.status=t.saldo>0.004?(t.vencimento<hj?'vencido':'aberto'):(t.aComp>0.004?'acomp':'compensada')}
    else{t.saldo=finR(t.valor-t.pago-t.comp);t.aComp=0;t.status=t.saldo<=0.004?'quitado':(t.vencimento<hj?'vencido':'aberto')}
  });
}
function finAntecDisp(t){if(t.origem==='antecipacao'||t.saldo<=0.004)return[];const doc=soDig(t.contraparte_doc),nm=fNorm(t.contraparte);
  return FIN.T.filter(a=>a.origem==='antecipacao'&&a.tipo===t.tipo&&a.aComp>0.004&&((doc&&soDig(a.contraparte_doc)===doc)||(!soDig(a.contraparte_doc)||!doc)&&nm&&fNorm(a.contraparte)===nm))}
const finSt=(t)=>{const m={aberto:['neu','Em aberto'],vencido:['bad','Vencido'],quitado:['ok',t.tipo==='pagar'?'Pago':'Recebido'],acomp:['warn','A compensar'],compensada:['ok','Compensada']}[t.status];return '<span class="pill '+m[0]+'">'+m[1]+'</span>'};
function finMsg(t,ok){setSave(ok===false?'warn':'ok',t)}
async function finExec(fn,okMsg){try{await fn();await finCarregar(true);if(okMsg)finMsg(okMsg);finRenderAtual()}catch(e){finMsg('Não salvou: '+(e.message||e),false);alertaFin(e.message||String(e))}}
function alertaFin(t){const el=document.querySelector('.fin-root:not([hidden]) .fin-erro')||null;const r=$('#root-'+(finAtual()||'fin-pagar'));if(r){let d=r.querySelector('.fin-erro');if(!d){d=document.createElement('div');d.className='callout fin-erro';r.prepend(d)}d.textContent=t;setTimeout(()=>{d&&d.remove()},7000)}}
const finAtual=()=>tabs.find(x=>x.startsWith('fin-')&&!$('#tab-'+x).hidden);
function finRenderAtual(){const t=finAtual();if(t)renderFin(t)}
function renderFin(t){
  const root=$('#root-'+t);if(!root)return;
  if(!window.CIA_SB){root.innerHTML='<p class="note">Conectando…</p>';return}
  if(!FIN.ok){root.innerHTML=FIN.erro?'<div class="callout">Não consegui abrir o financeiro: '+esc(FIN.erro)+'. Confira se o seu usuário tem a aba Financeiro liberada.</div>':'<p class="note">Carregando o financeiro…</p>';if(!FIN.erro)finCarregar().then(()=>renderFin(t)).catch(()=>renderFin(t));return}
  if(t==='fin-conf')finConf(root);if(t==='fin-pagar')finLista(root,'pagar');if(t==='fin-receber')finLista(root,'receber');if(t==='fin-dre')finDre(root);if(t==='fin-fluxo')finFluxo(root);if(t==='fin-lala')finLala(root);
}
let finRT=null;function finRealtime(){if(finRT||!window.CIA_SB)return;let tm;finRT=finSB().channel('fin');['fin_titulos','fin_baixas','fin_compensacoes','fin_conferencia','fin_contas','fin_lalamove_extratos'].forEach(tb=>finRT.on('postgres_changes',{event:'*',schema:'public',table:tb},()=>{clearTimeout(tm);tm=setTimeout(()=>{if(FIN.ok)Promise.all([finCarregar(true),LL.rows?llCarregar(true):null]).then(finRenderAtual)},700)}));finRT.subscribe()}

/* ---------- conferência de notas ---------- */
const FC={f:'pend',tipo:'',q:'',sel:new Set(),montado:false,pg:0,pp:20};try{const v=+localStorage.getItem('ciab-fc-pp');if([15,20,25,30,50].includes(v))FC.pp=v}catch(e){}
function finSug(n){
  if(n.cancelada)return['nao_gera','Nota cancelada'];
  if(OURS.test(n.emit||'')&&OURS.test(n.dest||''))return['nao_gera','Entre empresas do grupo'];
  const nat=n.natOp||'';
  if(/bonifica|brinde|amostra|remessa|retorno|comodato|demonstra|consigna|transfer|devolu|garantia|conserto|armazen|dep[oó]sito/i.test(nat))return['nao_gera','Natureza: '+nat];
  const V={};(n.itens||[]).forEach(i=>{const c=String(i[6]||'');if(c)V[c]=(V[c]||0)+(+i[5]||0)});
  const cf=Object.entries(V).sort((a,b)=>b[1]-a[1])[0];
  if(cf){const r=+cf[0].slice(1);if((r>=100&&r<200)||(r>=400&&r<500))return['gera','CFOP '+cf[0]];if(r===949)return['','CFOP '+cf[0]+' (outras): confira'];if(r>=900||(r>=200&&r<300)||(r>=500&&r<600))return['nao_gera','CFOP '+cf[0]]}
  if(/venda|compra|industrializa/i.test(nat))return['gera','Natureza: '+nat];
  return['','Sem regra: confira'];
}
const finEnt=s=>String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const finContra=n=>n.tipo==='entrada'?{nome:finEnt(n.emit),doc:soDig(n.emitDoc)}:{nome:finEnt(n.dest),doc:soDig(n.destDoc)};
function finCatPadrao(n){if(n.tipo==='saida')return 'Venda de produtos';return /industrializa|envase|terceiriza/i.test((n.natOp||'')+' '+(n.emit||''))?'Envase e industrialização':'Insumos e embalagens'}
function finCatSelect(tipo,val,attr){const L=FIN_CATS[tipo].map(x=>x[0]);if(val&&!L.includes(val))L.push(val);return '<select '+attr+'>'+L.map(c=>'<option'+(c===val?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select>'}
function finConfLista(){const q=fNorm(FC.q);return Object.values(notas).filter(n=>{
  if(EMP&&empNota(n).doc!==EMP)return false;if(FC.tipo&&n.tipo!==FC.tipo)return false;
  const antes=(n.data||'')<FIN.inicio,dec=FIN.CF[n.chave];
  if(FC.f==='antes'){if(!antes)return false}else if(FC.f!=='todas'&&antes)return false;
  if(FC.f==='pend'&&dec)return false;if(FC.f==='gera'&&(!dec||dec.decisao!=='gera'))return false;if(FC.f==='nao'&&(!dec||dec.decisao!=='nao_gera'))return false;
  return !q||fNorm([n.num,n.emit,n.dest,n.natOp].join(' ')).includes(q)}).sort((a,b)=>(b.data||'').localeCompare(a.data||''))}
function finConf(root){
  if(!FC.montado||!root.querySelector('#fcBody')){FC.montado=true;
    root.innerHTML='<div class="fin-bar"><span class="eyebrow">Ver por</span><div class="chips" id="fcEmp"></div></div>'+
      '<div class="fin-bar"><div class="chips" id="fcF"><button class="chip" data-f="pend">Pendentes</button><button class="chip" data-f="gera">Geram título</button><button class="chip" data-f="nao">Não geram</button><button class="chip" data-f="antes">Antes do início</button><button class="chip" data-f="todas">Todas</button></div>'+
      '<div class="chips" id="fcT"><button class="chip" data-t="">Entradas e saídas</button><button class="chip" data-t="entrada">Entradas</button><button class="chip" data-t="saida">Saídas</button></div>'+
      '<input type="search" id="fcQ" placeholder="Buscar nº, fornecedor, cliente ou natureza" aria-label="Buscar notas"></div>'+
      '<div class="fin-bar" id="fcIni"></div><div id="fcBody"></div>';
    root.querySelector('#fcF').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;FC.f=b.dataset.f;FC.pg=0;FC.sel.clear();finConf(root)});
    root.querySelector('#fcT').addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(!b)return;FC.tipo=b.dataset.t;FC.pg=0;FC.sel.clear();finConf(root)});
    root.querySelector('#fcQ').addEventListener('input',e=>{FC.q=e.target.value;FC.pg=0;finConfCorpo(root)});
    root.querySelector('#fcEmp').addEventListener('click',e=>{const c=e.target.closest('[data-emp]');if(c){FC.sel.clear();FC.pg=0;setEmp(c.dataset.emp)}});
    root.querySelector('#fcIni').addEventListener('change',e=>{if(e.target.id==='fcIniD'&&e.target.value){const v=e.target.value;finExec(async()=>{const{error}=await finSB().from('config').upsert({chave:'fin_inicio',valor:{data:v}});if(error)throw error;FIN.inicio=v},'Data de início salva')}});
    root.querySelector('#fcBody').addEventListener('click',e=>{const pg=e.target.closest('[data-pg]');if(pg){FC.pg=+pg.dataset.pg;finConfCorpo(root);root.querySelector('#fcBody').scrollIntoView({block:'start'});return}finConfClick(e,root)});
    root.querySelector('#fcBody').addEventListener('change',e=>{if(e.target.matches('[data-pp]')){FC.pp=+e.target.value;FC.pg=0;try{localStorage.setItem('ciab-fc-pp',FC.pp)}catch(x){}finConfCorpo(root);return}const c=e.target.closest('[data-ck]');if(c){c.checked?FC.sel.add(c.dataset.ck):FC.sel.delete(c.dataset.ck);finConfBarra(root)}const all=e.target.closest('#fcAll');if(all){root.querySelectorAll('#fcBody [data-ck]').forEach(x=>{x.checked=all.checked;all.checked?FC.sel.add(x.dataset.ck):FC.sel.delete(x.dataset.ck)});finConfBarra(root)}});
  }
  empChips('#fcEmp');
  root.querySelectorAll('#fcF .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.f===FC.f));
  root.querySelectorAll('#fcT .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.t===FC.tipo));
  const pend=Object.values(notas).filter(n=>(n.data||'')>=FIN.inicio&&!FIN.CF[n.chave]&&(!EMP||empNota(n).doc===EMP)).length;
  root.querySelector('#fcIni').innerHTML='<span class="note">O financeiro começa em</span>'+(window.CIA_PERFIL&&CIA_PERFIL.gestor?'<input type="date" id="fcIniD" value="'+FIN.inicio+'" aria-label="Data de início do financeiro">':'<b>'+fD(FIN.inicio)+'</b>')+'<span class="note">Notas anteriores ficam em "Antes do início" e só geram título se você mandar. <b>'+pend+'</b> nota(s) pendente(s) de conferência.</span>';
  finConfCorpo(root);
}
function finConfBarra(root){const b=root.querySelector('#fcBulk');if(b)b.innerHTML=FC.sel.size?'<b>'+FC.sel.size+' marcada(s)</b> <button class="btn pri" data-bulk="sug">Aplicar a sugestão</button> <button class="btn" data-bulk="nao">Marcar como não gera</button>':'<span class="note">Marque notas para aplicar a sugestão em lote.</span>'}
function finConfCorpo(root){
  const L=finConfLista();const pp=FC.pp,np=Math.max(1,Math.ceil(L.length/pp));if(FC.pg>=np)FC.pg=np-1;if(FC.pg<0)FC.pg=0;const ini=FC.pg*pp,pagina=L.slice(ini,ini+pp);
  const pode=FC.f==='pend'||FC.f==='antes'||FC.f==='todas';
  const pager=(onde)=>'<div class="fin-pager"><label class="note">Notas por página <select data-pp aria-label="Notas por página">'+[15,20,25,30,50].map(n=>'<option'+(n===pp?' selected':'')+'>'+n+'</option>').join('')+'</select></label><span class="note">'+(L.length?(ini+1)+'–'+Math.min(ini+pp,L.length)+' de '+L.length:'0 notas')+'</span><span class="grow"></span><button class="btn" data-pg="0"'+(FC.pg===0?' disabled':'')+' aria-label="Primeira página">«</button><button class="btn" data-pg="'+(FC.pg-1)+'"'+(FC.pg===0?' disabled':'')+'>‹ Anterior</button><span class="note">Página '+(FC.pg+1)+' de '+np+'</span><button class="btn" data-pg="'+(FC.pg+1)+'"'+(FC.pg>=np-1?' disabled':'')+'>Próxima ›</button><button class="btn" data-pg="'+(np-1)+'"'+(FC.pg>=np-1?' disabled':'')+' aria-label="Última página">»</button></div>';
  let h='<div class="fin-bar" id="fcBulk"></div>'+pager('top')+'<div class="tbl-wrap"><table class="fin-tbl"><thead><tr><th>'+(pode?'<input type="checkbox" id="fcAll" aria-label="Marcar todas">':'')+'</th><th>Tipo</th><th>Nº</th><th>Emissão</th><th>Fornecedor / cliente · empresa</th><th>Natureza</th><th class="n">Valor</th><th>Sugestão</th><th>Categoria e ação</th></tr></thead><tbody>';
  pagina.forEach(n=>{const s=finSug(n),dec=FIN.CF[n.chave],c=finContra(n);const tipo=n.tipo==='entrada'?'pagar':'receber';
    const nT=dec&&dec.decisao==='gera'?FIN.T.filter(t=>t.nf_chave===n.chave).length:0;
    h+='<tr data-ch="'+esc(n.chave)+'"><td>'+(!dec?'<input type="checkbox" data-ck="'+esc(n.chave)+'"'+(FC.sel.has(n.chave)?' checked':'')+' aria-label="Marcar nota">':'')+'</td><td><span class="pill '+(n.tipo==='entrada'?'ok':'warn')+'">'+(n.tipo==='entrada'?'Entrada':'Saída')+'</span></td><td class="mono">'+esc(n.num)+'</td><td class="mono">'+fD(n.data)+'</td><td class="wrap">'+esc(short(c.nome))+'<span class="fin-sug">'+esc(empNome(empNota(n).doc))+'</span></td><td class="wrap nat note">'+esc((n.natOp||'').slice(0,60))+'</td><td class="n">'+fmtR.format(n.vNF||0)+'</td>'+
      '<td class="sug"><span class="pill '+(s[0]==='gera'?'ok':s[0]==='nao_gera'?'neu':'warn')+'">'+(s[0]==='gera'?'Gera '+(tipo==='pagar'?'a pagar':'a receber'):s[0]==='nao_gera'?'Não gera':'Conferir')+'</span><span class="fin-sug">'+esc(s[1].length>45?s[1].slice(0,45)+'…':s[1])+'</span></td>'+
      '<td class="acao">'+(dec?'<span class="fin-sug">'+esc(dec.decisao==='gera'?(dec.categoria||''):(dec.obs||''))+'</span>':finCatSelect(tipo,finCatPadrao(n),'data-cat aria-label="Categoria"'))+'<div class="fin-acts">'+(dec?(dec.decisao==='gera'?'<span class="pill ok">'+nT+' título(s)</span>':'<span class="pill neu">Não gera</span>')+'<button class="btn ghost" data-a="desfazer">Desfazer</button>':'<button class="btn pri" data-a="gera">Gerar título</button><button class="btn" data-a="nao">Não gera</button>')+'</div></td></tr>'});
  if(!L.length)h+='<tr><td colspan="9" class="muted" style="padding:16px">Nenhuma nota neste filtro.</td></tr>';
  h+='</tbody></table></div>'+(L.length>pp?pager('bottom'):'');
  root.querySelector('#fcBody').innerHTML=h;finConfBarra(root);
}
function finDups(xml,n){const out=[];const re=/<dup>([\s\S]*?)<\/dup>/g;let m;while((m=re.exec(xml))){const g=t=>((new RegExp('<'+t+'>([^<]*)</'+t+'>')).exec(m[1])||[])[1]||'';const v=parseFloat(g('vDup'));if(v>0)out.push({parcela:g('nDup')||String(out.length+1),venc:(g('dVenc')||n.data||fHoje()).slice(0,10),valor:finR(v)})}return out}
async function finGerarNota(n,cat){
  let xml='';try{xml=window.CIA_XML?await CIA_XML(n.chave):''}catch(e){}if(!xml&&n.xml)xml=n.xml;
  let dups=xml?finDups(xml,n):[];let obs=null;
  if(!dups.length){dups=[{parcela:'1',venc:n.data||fHoje(),valor:finR(n.vNF)}];obs='Sem duplicatas no XML: confira o vencimento'}
  const tot=dups.length,c=finContra(n),tipo=n.tipo==='entrada'?'pagar':'receber';
  const rows=dups.map((d,i)=>({tipo,origem:'nf',empresa_doc:empNota(n).doc||null,contraparte:c.nome||'',contraparte_doc:c.doc||null,descricao:'NF '+n.num+(tot>1?' · parcela '+(i+1)+'/'+tot:''),categoria:cat,nf_chave:n.chave,nf_num:n.num,parcela:d.parcela,emissao:n.data||null,vencimento:d.venc,valor:d.valor,obs}));
  const{error}=await finSB().from('fin_titulos').upsert(rows,{onConflict:'nf_chave,parcela',ignoreDuplicates:true});if(error)throw error;
  const{error:e2}=await finSB().from('fin_conferencia').upsert({chave:n.chave,decisao:'gera',categoria:cat});if(e2)throw e2;
}
async function finNaoGera(n,motivo){const{error}=await finSB().from('fin_conferencia').upsert({chave:n.chave,decisao:'nao_gera',obs:motivo||null});if(error)throw error}
function finConfClick(e,root){
  const bulk=e.target.closest('[data-bulk]');
  if(bulk){const ns=[...FC.sel].map(k=>notas[k]).filter(Boolean);const tipoB=bulk.dataset.bulk;bulk.disabled=true;
    finExec(async()=>{let g=0,x=0,p=0;for(const n of ns){if(FIN.CF[n.chave])continue;const s=finSug(n);
        if(tipoB==='nao'){await finNaoGera(n,'Marcada em lote');x++;continue}
        if(s[0]==='gera'){await finGerarNota(n,finCatPadrao(n));g++}else if(s[0]==='nao_gera'){await finNaoGera(n,s[1]);x++}else p++;
        setSave('','Conferindo… '+(g+x+p)+' de '+ns.length)}
      FC.sel.clear();finMsg(g+' geraram título, '+x+' sem título'+(p?', '+p+' ficaram para conferir':''))},null);return}
  const b=e.target.closest('[data-a]');if(!b)return;const tr=b.closest('tr[data-ch]');const n=notas[tr.dataset.ch];if(!n)return;b.disabled=true;
  if(b.dataset.a==='gera'){const cat=tr.querySelector('[data-cat]').value;finExec(async()=>{await finGerarNota(n,cat);const c=finContra(n);const tipo=n.tipo==='entrada'?'pagar':'receber';
      const ant=FIN.T.filter(a=>a.origem==='antecipacao'&&a.tipo===tipo&&a.aComp>0.004&&((c.doc&&soDig(a.contraparte_doc)===c.doc)||fNorm(a.contraparte)===fNorm(c.nome)));
      if(ant.length)setTimeout(()=>alertaFin('Existe antecipação em aberto com '+short(c.nome)+' ('+fmtR.format(ant.reduce((s,a)=>s+a.aComp,0))+'). Compense em Contas a '+(tipo==='pagar'?'pagar':'receber')+'.'),300)},'Título gerado da NF '+n.num)}
  if(b.dataset.a==='nao')finExec(()=>finNaoGera(n,finSug(n)[1]),'NF '+n.num+' marcada como não gera');
  if(b.dataset.a==='desfazer'){const ts=FIN.T.filter(t=>t.nf_chave===n.chave);if(ts.some(t=>t.pago>0||t.comp>0)){alertaFin('A NF '+n.num+' já tem pagamento ou compensação. Estorne em Contas a pagar/receber antes de desfazer.');b.disabled=false;return}
    if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar';b.disabled=false;return}
    finExec(async()=>{if(ts.length){const{error}=await finSB().from('fin_titulos').delete().eq('nf_chave',n.chave);if(error)throw error}const{error:e2}=await finSB().from('fin_conferencia').delete().eq('chave',n.chave);if(e2)throw e2},'Conferência da NF '+n.num+' desfeita')}
}

/* ---------- contas a pagar / a receber ---------- */
const FL={pagar:{st:'aberto',q:'',de:'',ate:'',cat:'',open:null,acao:null},receber:{st:'aberto',q:'',de:'',ate:'',cat:'',open:null,acao:null}};
function finLista(root,tipo){
  const S=FL[tipo];
  if(!root.querySelector('#flBody')){
    const P=tipo==='pagar';
    root.innerHTML='<div class="fin-bar"><span class="eyebrow">Ver por</span><div class="chips" data-emp-box></div></div><div class="fin-kpis" data-kpis></div><div data-aviso></div>'+
      '<div class="fin-bar"><button class="btn pri" data-novo="manual">+ Lançamento</button><button class="btn" data-novo="antecipacao">+ Antecipação '+(P?'a fornecedor':'de cliente')+'</button>'+(P?'<button class="btn" data-novo="por_fora">+ Pagamento por fora</button><button class="btn" data-novo="folha">+ Folha (manual)</button><a class="btn" href="#fin-lala">Lala Move</a><button class="btn" data-imp="folha">Importar resumo da folha</button>':'')+'</div>'+
      '<div class="fin-bar"><div class="chips" data-st><button class="chip" data-s="aberto">Em aberto</button><button class="chip" data-s="vencido">Vencidos</button><button class="chip" data-s="quitado">'+(P?'Pagos':'Recebidos')+'</button><button class="chip" data-s="antecip">Antecipações</button><button class="chip" data-s="comp">Podem compensar</button><button class="chip" data-s="todos">Todos</button></div>'+
      '<label class="note">Vencimento de <input type="date" data-de></label><label class="note">até <input type="date" data-ate></label><span data-catbox></span><input type="search" data-q placeholder="Buscar fornecedor, cliente, NF ou descrição" aria-label="Buscar títulos"></div><div id="flBody"></div>';
    root.querySelector('[data-emp-box]').id='flEmp-'+tipo;
    root.addEventListener('click',e=>finListaClick(e,root,tipo));
    root.addEventListener('input',e=>{if(e.target.matches('[data-q]')){S.q=e.target.value;finListaCorpo(root,tipo)}});
    root.addEventListener('change',e=>{if(e.target.matches('[data-de]')){S.de=e.target.value;finListaCorpo(root,tipo)}if(e.target.matches('[data-ate]')){S.ate=e.target.value;finListaCorpo(root,tipo)}if(e.target.matches('[data-catf]')){S.cat=e.target.value;finListaCorpo(root,tipo)}});
  }
  empChips('#flEmp-'+tipo);
  root.querySelector('[data-catbox]').innerHTML='<select data-catf aria-label="Categoria"><option value="">Todas as categorias</option>'+[...new Set(FIN_CATS[tipo].map(x=>x[0]).concat(FIN.T.filter(t=>t.tipo===tipo&&t.categoria).map(t=>t.categoria)))].map(c=>'<option'+(c===S.cat?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select>';
  finListaCorpo(root,tipo);
}
function finFiltrados(tipo){const S=FL[tipo],q=fNorm(S.q);return FIN.T.filter(t=>{if(t.tipo!==tipo)return false;if(EMP&&t.empresa_doc!==EMP)return false;if(S.cat&&t.categoria!==S.cat)return false;if(S.de&&t.vencimento<S.de)return false;if(S.ate&&t.vencimento>S.ate)return false;
  if(q&&!fNorm([t.contraparte,t.descricao,t.nf_num,t.categoria,t.obs].join(' ')).includes(q))return false;
  const st=S.st;if(st==='aberto')return t.saldo>0.004;if(st==='vencido')return t.status==='vencido';if(st==='quitado')return t.status==='quitado'||t.status==='compensada';if(st==='antecip')return t.origem==='antecipacao';if(st==='comp')return finAntecDisp(t).length>0;return true})}
function finListaCorpo(root,tipo){
  const S=FL[tipo],P=tipo==='pagar',hj=fHoje(),mes=hj.slice(0,7),em7=fAddDias(hj,7);
  root.querySelectorAll('[data-st] .chip').forEach(c=>c.setAttribute('aria-pressed',c.dataset.s===S.st));
  const base=FIN.T.filter(t=>t.tipo===tipo&&(!EMP||t.empresa_doc===EMP));
  const ab=base.reduce((s,t)=>s+Math.max(0,t.saldo),0),ve=base.filter(t=>t.status==='vencido').reduce((s,t)=>s+t.saldo,0),p7=base.filter(t=>t.saldo>0.004&&t.vencimento>=hj&&t.vencimento<=em7).reduce((s,t)=>s+t.saldo,0);
  const pm=FIN.B.filter(b=>{const t=FIN.byId[b.titulo_id];return t&&t.tipo===tipo&&(!EMP||t.empresa_doc===EMP)&&b.data.slice(0,7)===mes}).reduce((s,b)=>s+b.valor,0);
  const ac=base.filter(t=>t.origem==='antecipacao').reduce((s,t)=>s+Math.max(0,t.aComp),0);
  root.querySelector('[data-kpis]').innerHTML='<div class="box"><span class="eyebrow">Em aberto</span><b>'+fmtR.format(ab)+'</b></div><div class="box '+(ve>0?'bad':'')+'"><span class="eyebrow">Vencido</span><b>'+fmtR.format(ve)+'</b></div><div class="box '+(p7>0?'warn':'')+'"><span class="eyebrow">Vence em 7 dias</span><b>'+fmtR.format(p7)+'</b></div><div class="box ok"><span class="eyebrow">'+(P?'Pago':'Recebido')+' no mês</span><b>'+fmtR.format(pm)+'</b></div><div class="box"><span class="eyebrow">Antecipações a compensar</span><b>'+fmtR.format(ac)+'</b></div>';
  const nComp=base.filter(t=>finAntecDisp(t).length).length;
  root.querySelector('[data-aviso]').innerHTML=nComp?'<div class="fin-aviso"><span><b>'+nComp+'</b> título(s) de nota têm antecipação em aberto do mesmo '+(P?'fornecedor':'cliente')+' e podem ser compensados.</span><button class="btn" data-ver-comp>Ver</button></div>':'';
  const L=finFiltrados(tipo).sort((a,b)=>a.vencimento.localeCompare(b.vencimento)||a.contraparte.localeCompare(b.contraparte));
  let tv=0,tp=0,tc=0,ts=0;
  let h='<div class="tbl-wrap"><table class="fin-tbl"><thead><tr><th>Vencimento</th><th>'+(P?'Fornecedor':'Cliente')+'</th><th>Descrição · categoria</th><th>Empresa</th><th class="n">Valor</th><th class="n">'+(P?'Pago':'Recebido')+'</th><th class="n">Compensado</th><th class="n">Saldo</th><th>Situação</th><th></th></tr></thead><tbody>';
  L.forEach(t=>{tv+=t.valor;tp+=t.pago;tc+=t.origem==='antecipacao'?0:t.comp;ts+=Math.max(0,t.saldo);const disp=finAntecDisp(t);
    h+='<tr data-id="'+t.id+'"><td class="mono">'+fD(t.vencimento)+'</td><td class="wrap">'+esc(short(t.contraparte)||'—')+'</td><td class="wrap">'+esc(t.descricao||'')+' <span class="pill neu">'+esc(FIN_ORIG[t.origem]||t.origem)+'</span>'+'<span class="fin-sug">'+esc(t.categoria||'Sem categoria')+(t.obs?' · '+esc(t.obs):'')+'</span></td><td>'+esc(t.empresa_doc?empNome(t.empresa_doc):'Grupo')+'</td><td class="n">'+fmtR.format(t.valor)+'</td><td class="n">'+fmtR.format(t.pago)+'</td><td class="n">'+(t.origem==='antecipacao'?'<span title="Já usado em notas">'+fmtR.format(t.usado)+'</span>':fmtR.format(t.comp))+'</td><td class="n">'+fmtR.format(Math.max(0,t.saldo))+(t.origem==='antecipacao'&&t.aComp>0.004?'<span class="fin-sug">a compensar '+fmtR.format(t.aComp)+'</span>':'')+'</td><td>'+finSt(t)+'</td>'+
      '<td><div class="fin-acts">'+(t.saldo>0.004?'<button class="btn pri" data-a="baixa">'+(P?'Pagar':'Receber')+'</button>':'')+(disp.length?'<button class="btn" data-a="comp">Compensar</button>':'')+'<button class="btn ghost" data-a="det" aria-label="Detalhes">⋯</button></div></td></tr>';
    if(S.open===t.id)h+='<tr class="det"><td colspan="10">'+finDetalhe(t,S.acao)+'</td></tr>'});
  if(!L.length)h+='<tr><td colspan="10" class="muted" style="padding:16px">Nenhum título neste filtro.</td></tr>';
  h+='</tbody>'+(L.length?'<tfoot><tr><td colspan="4">'+L.length+' título(s)</td><td class="n">'+fmtR.format(tv)+'</td><td class="n">'+fmtR.format(tp)+'</td><td class="n">'+fmtR.format(tc)+'</td><td class="n">'+fmtR.format(ts)+'</td><td colspan="2"></td></tr></tfoot>':'')+'</table></div>';
  root.querySelector('#flBody').innerHTML=h;
}
function finContasOpts(empresa){return '<option value="">Sem conta</option>'+FIN.CT.filter(c=>c.ativo!==false&&(!empresa||!c.empresa_doc||c.empresa_doc===empresa)).map(c=>'<option value="'+c.id+'">'+esc(c.nome)+'</option>').join('')}
function finDetalhe(t,acao){const P=t.tipo==='pagar';let h='';
  if(acao==='baixa')h+='<div class="fin-inline" data-form="baixa"><label>Data<input type="date" name="data" value="'+fHoje()+'"></label><label>Valor<input type="text" name="valor" inputmode="decimal" value="'+String(Math.max(0,t.saldo).toFixed(2)).replace('.',',')+'"></label><label>Conta<select name="conta">'+finContasOpts(t.empresa_doc)+'</select></label><label>Forma<select name="forma"><option>Pix</option><option>Boleto</option><option>Transferência</option><option>Cartão</option><option>Dinheiro</option><option>Outro</option></select></label><label>Observação<input type="text" name="obs"></label><button class="btn pri" data-a="salvaBaixa">Confirmar '+(P?'pagamento':'recebimento')+'</button><button class="btn ghost" data-a="fecha">Cancelar</button></div>';
  if(acao==='comp'){const disp=finAntecDisp(t);h+='<div class="fin-inline" data-form="comp"><label>Antecipação<select name="ant">'+disp.map(a=>'<option value="'+a.id+'">'+fD(a.vencimento)+' · '+esc(a.descricao||'Antecipação')+' · disponível '+fmtR.format(a.aComp)+'</option>').join('')+'</select></label><label>Valor a compensar<input type="text" name="valor" inputmode="decimal" value="'+String(Math.min(t.saldo,disp[0]?disp[0].aComp:0).toFixed(2)).replace('.',',')+'"></label><label>Data<input type="date" name="data" value="'+fHoje()+'"></label><button class="btn pri" data-a="salvaComp">Compensar</button><button class="btn ghost" data-a="fecha">Cancelar</button></div>'}
  h+='<div class="row" style="gap:18px;align-items:flex-start;margin-top:6px"><div><b>'+(P?'Pagamentos':'Recebimentos')+'</b>'+(t.baixas.length?t.baixas.map(b=>'<div class="note">'+fD(b.data)+' · '+fmtR.format(b.valor)+(b.forma?' · '+esc(b.forma):'')+(b.obs?' · '+esc(b.obs):'')+' <button class="btn ghost" data-a="estorna" data-b="'+b.id+'">Estornar</button></div>').join(''):'<div class="note">Nenhum.</div>')+'</div>'+
    '<div><b>Compensações</b>'+((t.comps.length+t.compsDe.length)?t.comps.concat(t.compsDe).map(c=>{const o=FIN.byId[c.titulo_id===t.id?c.antecipacao_id:c.titulo_id];return '<div class="note">'+fD(c.data)+' · '+fmtR.format(c.valor)+' · '+esc(o?o.descricao||o.contraparte:'')+' <button class="btn ghost" data-a="descomp" data-c="'+c.id+'">Desfazer</button></div>'}).join(''):'<div class="note">Nenhuma.</div>')+'</div>'+
    '<div><b>Dados</b><div class="note">Emissão '+fD(t.emissao)+(t.contraparte_doc?' · '+esc(fmtCnpj(soDig(t.contraparte_doc))):'')+(t.parcela?' · parcela '+esc(t.parcela):'')+'</div><div class="row" style="margin-top:6px"><button class="btn" data-a="editar">Editar</button>'+(t.origem!=='nf'&&!t.baixas.length&&!t.comps.length&&!t.compsDe.length?'<button class="btn ghost" data-a="excluir">Excluir</button>':'')+'</div></div></div>';
  return h}
function finListaClick(e,root,tipo){
  const S=FL[tipo];
  const nv=e.target.closest('[data-novo]');if(nv){finModal(tipo,nv.dataset.novo,null);return}
  const imp=e.target.closest('[data-imp]');if(imp){finImport(imp.dataset.imp);return}
  const st=e.target.closest('[data-s]');if(st&&st.closest('[data-st]')){S.st=st.dataset.s;finListaCorpo(root,tipo);return}
  if(e.target.closest('[data-ver-comp]')){S.st='comp';finListaCorpo(root,tipo);return}
  const em=e.target.closest('[data-emp]');if(em&&em.closest('.chips')){setEmp(em.dataset.emp);return}
  const b=e.target.closest('[data-a]');if(!b)return;const tr=b.closest('tr[data-id]')||b.closest('tr.det').previousElementSibling;const t=FIN.byId[tr&&tr.dataset.id];if(!t)return;const a=b.dataset.a;
  if(a==='baixa'||a==='comp'){S.open=t.id;S.acao=a;finListaCorpo(root,tipo);return}
  if(a==='det'){S.open=S.open===t.id&&!S.acao?null:t.id;S.acao=null;finListaCorpo(root,tipo);return}
  if(a==='fecha'){S.acao=null;finListaCorpo(root,tipo);return}
  if(a==='editar'){finModal(tipo,t.origem,t);return}
  const form=b.closest('[data-form]');const val=n=>form.querySelector('[name="'+n+'"]').value;
  if(a==='salvaBaixa'){const v=finR(num(val('valor')));if(!(v>0)){alertaFin('Informe um valor maior que zero.');return}if(v>t.saldo+0.005&&t.origem!=='antecipacao'){alertaFin('O valor passa do saldo do título ('+fmtR.format(t.saldo)+').');return}b.disabled=true;
    finExec(async()=>{const{error}=await finSB().from('fin_baixas').insert({titulo_id:t.id,data:val('data')||fHoje(),valor:v,conta_id:val('conta')||null,forma:val('forma'),obs:val('obs')||null});if(error)throw error;S.acao=null},(tipo==='pagar'?'Pagamento':'Recebimento')+' registrado')}
  if(a==='salvaComp'){const ant=FIN.byId[val('ant')];const v=finR(num(val('valor')));if(!ant||!(v>0)){alertaFin('Escolha a antecipação e o valor.');return}if(v>ant.aComp+0.005||v>t.saldo+0.005){alertaFin('O valor passa do disponível na antecipação ('+fmtR.format(ant.aComp)+') ou do saldo do título ('+fmtR.format(t.saldo)+').');return}b.disabled=true;
    finExec(async()=>{const{error}=await finSB().from('fin_compensacoes').insert({antecipacao_id:ant.id,titulo_id:t.id,valor:v,data:val('data')||fHoje()});if(error)throw error;S.acao=null},'Compensação registrada')}
  if(a==='estorna'){if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar estorno';return}finExec(async()=>{const{error}=await finSB().from('fin_baixas').delete().eq('id',b.dataset.b);if(error)throw error},'Estornado')}
  if(a==='descomp'){if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar';return}finExec(async()=>{const{error}=await finSB().from('fin_compensacoes').delete().eq('id',b.dataset.c);if(error)throw error},'Compensação desfeita')}
  if(a==='excluir'){if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar exclusão';return}finExec(async()=>{const{error}=await finSB().from('fin_titulos').delete().eq('id',t.id);if(error)throw error;S.open=null},'Título excluído')}
}
/* ---------- formulário de lançamento ---------- */
function finModal(tipo,origem,t){
  let m=$('#finModal');if(!m){m=document.createElement('div');m.className='cmodal';m.id='finModal';m.hidden=true;document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-fechar-fin]'))m.hidden=true});m.addEventListener('submit',finModalSalvar)}
  const P=tipo==='pagar',ed=!!t,ori=t?t.origem:origem;
  const titulo=ed?'Editar título':{manual:P?'Nova conta a pagar':'Nova conta a receber',antecipacao:P?'Antecipação a fornecedor':'Antecipação de cliente',por_fora:'Pagamento por fora',folha:'Folha de pagamento (lançamento manual)',lalamove:'Lala Move (lançamento manual)'}[ori];
  const catPad=t?t.categoria:{antecipacao:P?'Insumos e embalagens':'Venda de produtos',por_fora:'Pagamentos por fora',folha:'Folha de pagamento',lalamove:'Lala Move'}[ori]||(P?'Outras despesas':'Venda de produtos');
  const nomes=[...new Set(FIN.T.map(x=>x.contraparte).concat(Object.values(notas).map(n=>P?n.emit:n.dest)).filter(Boolean))].sort().slice(0,600);
  const emp=t?t.empresa_doc||'':(EMP||(empresasGrupo()[0]||{}).doc||'');
  const hj=fHoje();
  m.innerHTML='<form class="panel" id="finForm" data-tipo="'+tipo+'" data-origem="'+ori+'" data-id="'+(t?t.id:'')+'"><div class="row"><h2 class="grow">'+esc(titulo)+'</h2><button type="button" class="btn" data-fechar-fin>Fechar</button></div>'+
    (ori==='antecipacao'&&!ed?'<p class="note">Registre o valor adiantado. Quando a nota fiscal deste '+(P?'fornecedor':'cliente')+' chegar, o sistema avisa e você compensa o valor no título da nota. Na DRE de caixa, a antecipação conta no dia em que foi '+(P?'paga':'recebida')+'.</p>':'')+
    '<div class="fin-form"><label>Empresa<select name="empresa"><option value="">Grupo / não informada</option>'+empresasGrupo().map(x=>'<option value="'+x.doc+'"'+(x.doc===emp?' selected':'')+'>'+esc(x.nome)+'</option>').join('')+'</select></label>'+
    '<label>'+(P?'Fornecedor / favorecido':'Cliente')+'<input type="text" name="contraparte" list="finNomes" required value="'+esc(t?t.contraparte:'')+'"></label><datalist id="finNomes">'+nomes.map(x=>'<option value="'+esc(x)+'">').join('')+'</datalist>'+
    '<label>CNPJ / CPF (opcional)<input type="text" name="doc" value="'+esc(t?t.contraparte_doc||'':'')+'"></label>'+
    '<label class="full">Descrição<input type="text" name="descricao" value="'+esc(t?t.descricao:'')+'" placeholder="'+(ori==='antecipacao'?'Ex.: Adiantamento lote PPDS-103':'Ex.: Aluguel novembro')+'"></label>'+
    '<label>Categoria<input type="text" name="categoria" list="finCats" required value="'+esc(catPad||'')+'"></label><datalist id="finCats">'+FIN_CATS[tipo].map(x=>'<option value="'+esc(x[0])+'">').join('')+'</datalist>'+
    '<label>Emissão<input type="date" name="emissao" value="'+(t?t.emissao||'':hj)+'"></label>'+
    '<label>'+(ed?'Vencimento':'1º vencimento')+'<input type="date" name="venc" required value="'+(t?t.vencimento:hj)+'"></label>'+
    '<label>Valor'+(ed?'':' total')+'<input type="text" name="valor" inputmode="decimal" required value="'+(t?String(t.valor.toFixed(2)).replace('.',','):'')+'"></label>'+
    (ed?'':'<label>Parcelas<input type="number" name="parcelas" min="1" max="60" value="1"></label>')+
    '<label class="full">Observação<input type="text" name="obs" value="'+esc(t?t.obs||'':'')+'"></label>'+
    (ed?'':'<label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="pago"'+(ori==='antecipacao'||ori==='por_fora'?' checked':'')+'> Já '+(P?'paga':'recebida')+' (registra a baixa de todas as parcelas)</label><label>Data do '+(P?'pagamento':'recebimento')+'<input type="date" name="dpago" value="'+hj+'"></label><label>Conta<select name="conta">'+finContasOpts('')+'</select></label>')+
    '</div><p class="note" id="finFormMsg" aria-live="polite"></p><div class="row"><button class="btn pri" type="submit">Salvar</button></div></form>';
  m.hidden=false;
}
async function finModalSalvar(e){e.preventDefault();const f=e.target;const g=n=>{const x=f.querySelector('[name="'+n+'"]');return x?(x.type==='checkbox'?x.checked:x.value.trim()):''};
  const tipo=f.dataset.tipo,ori=f.dataset.origem,id=f.dataset.id,valor=finR(num(g('valor'))),msg=f.querySelector('#finFormMsg');
  if(!(valor>0)){msg.textContent='Informe um valor maior que zero.';return}if(!g('venc')){msg.textContent='Informe o vencimento.';return}
  const base={empresa_doc:g('empresa')||null,contraparte:g('contraparte'),contraparte_doc:soDig(g('doc'))||null,descricao:g('descricao')||FIN_ORIG[ori],categoria:g('categoria')||null,emissao:g('emissao')||null,obs:g('obs')||null};
  f.querySelector('[type=submit]').disabled=true;
  try{
    if(id){const{error}=await finSB().from('fin_titulos').update(Object.assign(base,{vencimento:g('venc'),valor})).eq('id',id);if(error)throw error}
    else{const n=Math.max(1,Math.min(60,parseInt(g('parcelas'))||1));const pv=finR(valor/n);const rows=[];for(let i=0;i<n;i++)rows.push(Object.assign({},base,{tipo,origem:ori,vencimento:fAddMes(g('venc'),i),valor:i===n-1?finR(valor-pv*(n-1)):pv,parcela:n>1?(i+1)+'/'+n:null,descricao:base.descricao+(n>1?' · '+(i+1)+'/'+n:'')}));
      const{data,error}=await finSB().from('fin_titulos').insert(rows).select('id,valor');if(error)throw error;
      if(g('pago')){const{error:e2}=await finSB().from('fin_baixas').insert(data.map(r=>({titulo_id:r.id,data:g('dpago')||fHoje(),valor:r.valor,conta_id:g('conta')||null,forma:null})));if(e2)throw e2}}
    $('#finModal').hidden=true;await finCarregar(true);finMsg('Lançamento salvo');finRenderAtual();
  }catch(err){msg.textContent='Não salvou: '+(err.message||err);f.querySelector('[type=submit]').disabled=false}
}

/* ---------- DRE financeiro (regime de caixa) ---------- */
const FD={ano:'',cats:true};
const DRE_LINHAS=[['g','receita','Receita bruta'],['g','deducao','(−) Deduções e impostos sobre vendas'],['t','RL','= Receita líquida'],['g','custo','(−) Custo dos produtos'],['t','MB','= Margem bruta'],['g','pessoal','(−) Despesas com pessoal'],['g','despesa','(−) Despesas operacionais'],['t','RO','= Resultado operacional'],['g','financeiro','(±) Resultado financeiro'],['t','RC','= Resultado do caixa'],['g','nao_op','Movimentos não operacionais (transferências, empréstimos, aportes)'],['t','VC','= Variação do caixa']];
function finDreDados(ano){const M={};const add=(g,c,m,v)=>{const G=M[g]||(M[g]={});const C=G[c]||(G[c]={});C[m]=(C[m]||0)+v};
  FIN.B.forEach(b=>{const t=FIN.byId[b.titulo_id];if(!t||b.data.slice(0,4)!==ano)return;if(EMP&&t.empresa_doc!==EMP)return;const m=+b.data.slice(5,7)-1;add(finGrupo(t.categoria,t.tipo),t.categoria||'Sem categoria',m,(t.tipo==='receber'?1:-1)*b.valor)});return M}
function finDre(root){
  const anos=[...new Set(FIN.B.map(b=>b.data.slice(0,4)).concat([fHoje().slice(0,4)]))].sort().reverse();if(!FD.ano||!anos.includes(FD.ano))FD.ano=anos[0];
  const M=finDreDados(FD.ano);const soma=(g,m)=>Object.values(M[g]||{}).reduce((s,C)=>s+(m==null?Object.values(C).reduce((a,b)=>a+b,0):(C[m]||0)),0);
  const tot=(k,m)=>{const r=g=>soma(g,m);if(k==='RL')return r('receita')+r('deducao');if(k==='MB')return tot('RL',m)+r('custo');if(k==='RO')return tot('MB',m)+r('pessoal')+r('despesa');if(k==='RC')return tot('RO',m)+r('financeiro');if(k==='VC')return tot('RC',m)+r('nao_op');return 0};
  const rec=soma('receita',null);const cel=v=>'<td class="n'+(v<-0.004?' neg':'')+'">'+(Math.abs(v)<0.005?'—':fmtR0.format(v))+'</td>';
  let h='<div class="fin-bar"><span class="eyebrow">Ver por</span><div class="chips" id="fdEmp"></div></div><div class="fin-bar"><label class="note">Ano <select id="fdAno">'+anos.map(a=>'<option'+(a===FD.ano?' selected':'')+'>'+a+'</option>').join('')+'</select></label><label class="note" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="fdCats"'+(FD.cats?' checked':'')+'> Mostrar categorias</label><span class="note">Regime de caixa: cada valor entra no mês em que foi pago ou recebido. Antecipações entram no mês do pagamento; a compensação na nota não conta de novo.</span></div>';
  h+='<div class="tbl-wrap"><table class="fin-tbl fin-dre"><thead><tr><th>'+esc(FD.ano)+(EMP?' · '+esc(empNome(EMP)):' · Grupo econômico')+'</th>'+MESES.map(m=>'<th class="n">'+m+'</th>').join('')+'<th class="n">Total</th><th class="n">% receita</th></tr></thead><tbody>';
  DRE_LINHAS.forEach(([k,g,nome])=>{
    if(k==='g'){const vals=MESES.map((_,i)=>soma(g,i));const t=soma(g,null);h+='<tr class="grp"><td>'+esc(nome)+'</td>'+vals.map(cel).join('')+cel(t)+'<td class="n">'+(rec&&g!=='nao_op'?(t/rec*100).toFixed(1).replace('.',',')+'%':'')+'</td></tr>';
      if(FD.cats)Object.keys(M[g]||{}).sort().forEach(c=>{const C=M[g][c];const tt=Object.values(C).reduce((a,b)=>a+b,0);h+='<tr class="cat"><td>'+esc(c)+'</td>'+MESES.map((_,i)=>cel(C[i]||0)).join('')+cel(tt)+'<td></td></tr>'})}
    else{const vals=MESES.map((_,i)=>tot(g,i));const t=tot(g,null);h+='<tr class="tot"><td>'+esc(nome)+'</td>'+vals.map(cel).join('')+cel(t)+'<td class="n">'+(rec&&g!=='VC'?(t/rec*100).toFixed(1).replace('.',',')+'%':'')+'</td></tr>'}});
  h+='</tbody></table></div>'+(FIN.B.length?'':'<p class="note">Ainda não há pagamentos ou recebimentos registrados. A DRE se monta conforme as baixas forem lançadas em Contas a pagar e a receber.</p>');
  root.innerHTML=h;empChips('#fdEmp');
  root.querySelector('#fdEmp').onclick=e=>{const c=e.target.closest('[data-emp]');if(c)setEmp(c.dataset.emp)};
  root.querySelector('#fdAno').onchange=e=>{FD.ano=e.target.value;finDre(root)};root.querySelector('#fdCats').onchange=e=>{FD.cats=e.target.checked;finDre(root)};
}

/* ---------- fluxo de caixa ---------- */
const FF={modo:'mes'};
function finPeriodos(){const hj=fHoje();const P=[];
  if(FF.modo==='mes'){const m0=fAddMes(hj.slice(0,7)+'-01',-3);for(let i=0;i<10;i++){const ini=fAddMes(m0,i);const fim=fAddDias(fAddMes(ini,1),-1);const[y,mm]=ini.split('-');P.push({ini,fim,rot:MESES[+mm-1]+'/'+y.slice(2)})}}
  else{const d=new Date(hj+'T12:00:00');const dow=(d.getDay()+6)%7;const seg=fAddDias(hj,-dow);for(let i=-2;i<10;i++){const ini=fAddDias(seg,i*7),fim=fAddDias(ini,6);P.push({ini,fim,rot:fD(ini).slice(0,5)})}}
  return P}
function finFluxo(root){
  const hj=fHoje(),P=finPeriodos();const contas=FIN.CT.filter(c=>c.ativo!==false&&(!EMP||!c.empresa_doc||c.empresa_doc===EMP));
  const S0=contas.reduce((s,c)=>s+(+c.saldo_inicial||0),0);const D0=contas.length?contas.map(c=>c.data_saldo).sort()[0]:'0000-00-00';
  const tOk=t=>!EMP||t.empresa_doc===EMP;
  const mov=FIN.B.map(b=>({b,t:FIN.byId[b.titulo_id]})).filter(x=>x.t&&tOk(x.t)&&x.b.data>=D0);
  const prev=FIN.T.filter(t=>tOk(t)&&t.saldo>0.004).map(t=>({t,d:t.vencimento<hj?hj:t.vencimento,venc:t.vencimento<hj}));
  let saldo=S0+mov.filter(x=>x.b.data<P[0].ini).reduce((s,x)=>s+(x.t.tipo==='receber'?1:-1)*x.b.valor,0);
  const C=P.map(p=>{const ri=mov.filter(x=>x.b.data>=p.ini&&x.b.data<=p.fim);const rr=ri.filter(x=>x.t.tipo==='receber').reduce((s,x)=>s+x.b.valor,0),rp=ri.filter(x=>x.t.tipo==='pagar').reduce((s,x)=>s+x.b.valor,0);
    const pi=prev.filter(x=>x.d>=p.ini&&x.d<=p.fim);const pr=pi.filter(x=>x.t.tipo==='receber').reduce((s,x)=>s+x.t.saldo,0),pp=pi.filter(x=>x.t.tipo==='pagar').reduce((s,x)=>s+x.t.saldo,0);const venc=pi.some(x=>x.venc);
    const ini=saldo;saldo=ini+rr-rp+pr-pp;return{p,ini,rr,rp,pr,pp,fim:saldo,venc,atual:p.ini<=hj&&hj<=p.fim}});
  const cel=v=>'<td class="n'+(v<-0.004?' neg':'')+'">'+(Math.abs(v)<0.005?'—':fmtR0.format(v))+'</td>';
  const head='<tr><th></th>'+C.map(c=>'<th class="n">'+c.p.rot+(c.atual?' ●':'')+'</th>').join('')+'</tr>';
  const lin=(n,k,cls)=>'<tr'+(cls?' class="'+cls+'"':'')+'><td>'+n+'</td>'+C.map(c=>cel(c[k])).join('')+'</tr>';
  // gráfico
  const W=Math.max(560,C.length*70),H=200,pl=64,pb=24,pt=10;const mx=Math.max(1,...C.map(c=>Math.max(c.rr+c.pr,c.rp+c.pp,Math.abs(c.fim))));const bw=(W-pl-10)/C.length;const y=v=>H-pb-(H-pb-pt)*v/mx;
  let svg='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Entradas, saídas e saldo por período">';for(let i=0;i<=4;i++){const v=mx*i/4;svg+='<line x1="'+pl+'" x2="'+(W-6)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--line)"/><text x="'+(pl-6)+'" y="'+(y(v)+3)+'" text-anchor="end">'+fmtR0.format(v).replace('R$','').trim()+'</text>'}
  C.forEach((c,i)=>{const x=pl+i*bw;const e=c.rr+c.pr,s=c.rp+c.pp;svg+='<rect x="'+(x+bw*.14).toFixed(1)+'" y="'+y(e).toFixed(1)+'" width="'+(bw*.32).toFixed(1)+'" height="'+(H-pb-y(e)).toFixed(1)+'" rx="2" fill="var(--ok)"><title>Entradas '+c.p.rot+': '+fmtR0.format(e)+'</title></rect><rect x="'+(x+bw*.5).toFixed(1)+'" y="'+y(s).toFixed(1)+'" width="'+(bw*.32).toFixed(1)+'" height="'+(H-pb-y(s)).toFixed(1)+'" rx="2" fill="var(--accent)"><title>Saídas '+c.p.rot+': '+fmtR0.format(s)+'</title></rect><text x="'+(x+bw/2).toFixed(1)+'" y="'+(H-pb+14)+'" text-anchor="middle">'+c.p.rot+'</text>'});
  const pts=C.map((c,i)=>(pl+i*bw+bw/2).toFixed(1)+','+y(Math.max(0,c.fim)).toFixed(1)).join(' ');svg+='<polyline points="'+pts+'" fill="none" stroke="var(--fg)" stroke-width="2"/>'+C.map((c,i)=>'<circle cx="'+(pl+i*bw+bw/2).toFixed(1)+'" cy="'+y(Math.max(0,c.fim)).toFixed(1)+'" r="3" fill="var(--fg)"><title>Saldo '+c.p.rot+': '+fmtR0.format(c.fim)+'</title></circle>').join('')+'</svg>';
  root.innerHTML='<div class="fin-bar"><span class="eyebrow">Ver por</span><div class="chips" id="ffEmp"></div></div><div class="fin-bar"><div class="chips" id="ffModo"><button class="chip" data-m="mes" aria-pressed="'+(FF.modo==='mes')+'">Mensal</button><button class="chip" data-m="semana" aria-pressed="'+(FF.modo==='semana')+'">Semanal</button></div><span class="note">Realizado = pagamentos e recebimentos lançados. Previsto = saldo dos títulos em aberto pelo vencimento (vencidos entram no período atual). Saldo inicial = contas cadastradas abaixo.</span></div>'+
    (contas.length?'':'<div class="fin-aviso"><span>Cadastre as contas bancárias e o saldo de cada uma para o fluxo partir do saldo real.</span></div>')+
    '<div class="panel"><div class="fin-leg"><span><i style="background:var(--ok)"></i>Entradas</span><span><i style="background:var(--accent)"></i>Saídas</span><span><i style="background:var(--fg)"></i>Saldo final</span></div><div class="fin-chart">'+svg+'</div></div>'+
    '<div class="tbl-wrap"><table class="fin-tbl fin-dre"><thead>'+head+'</thead><tbody>'+lin('Saldo inicial','ini','tot')+lin('Recebimentos realizados','rr')+lin('Pagamentos realizados','rp')+lin('A receber previsto','pr')+lin('A pagar previsto','pp')+lin('Saldo final','fim','tot')+'</tbody></table></div>'+
    '<div class="panel"><h3 style="margin-bottom:8px">Contas bancárias e saldos iniciais</h3><div class="tbl-wrap"><table class="fin-tbl"><thead><tr><th>Conta</th><th>Empresa</th><th class="n">Saldo inicial</th><th>Saldo em</th><th></th></tr></thead><tbody>'+FIN.CT.map(c=>'<tr data-ct="'+c.id+'"><td>'+esc(c.nome)+'</td><td>'+esc(c.empresa_doc?empNome(c.empresa_doc):'Grupo')+'</td><td class="n">'+fmtR.format(+c.saldo_inicial||0)+'</td><td class="mono">'+fD(c.data_saldo)+'</td><td><button class="btn ghost" data-ct-del>Excluir</button></td></tr>').join('')+'</tbody></table></div>'+
    '<form class="fin-inline" id="ffConta"><label>Nome da conta<input type="text" name="nome" required placeholder="Ex.: Itaú Creative"></label><label>Empresa<select name="empresa"><option value="">Grupo</option>'+empresasGrupo().map(x=>'<option value="'+x.doc+'">'+esc(x.nome)+'</option>').join('')+'</select></label><label>Saldo inicial<input type="text" name="saldo" inputmode="decimal" required></label><label>Saldo em<input type="date" name="data" value="'+hj+'" required></label><button class="btn pri" type="submit">Adicionar conta</button></form></div>';
  empChips('#ffEmp');
  root.querySelector('#ffEmp').onclick=e=>{const c=e.target.closest('[data-emp]');if(c)setEmp(c.dataset.emp)};
  root.querySelector('#ffModo').onclick=e=>{const b=e.target.closest('[data-m]');if(b){FF.modo=b.dataset.m;finFluxo(root)}};
  root.querySelector('#ffConta').onsubmit=e=>{e.preventDefault();const f=e.target;const v=n=>f.querySelector('[name="'+n+'"]').value.trim();finExec(async()=>{const{error}=await finSB().from('fin_contas').insert({nome:v('nome'),empresa_doc:v('empresa')||null,saldo_inicial:finR(num(v('saldo'))),data_saldo:v('data')});if(error)throw error},'Conta adicionada')};
  root.querySelectorAll('[data-ct-del]').forEach(b=>b.onclick=()=>{if(!b.dataset.ok){b.dataset.ok='1';b.textContent='Confirmar';return}finExec(async()=>{const{error}=await finSB().from('fin_contas').delete().eq('id',b.closest('tr').dataset.ct);if(error)throw error},'Conta excluída')});
}
/* ---------- exportar a aba do financeiro ---------- */
function finExportar(t,btn){if(!window.XLSX){btn.textContent='Leitor de planilhas não carregou';return}const root=$('#root-'+t);const tb=root&&(root.querySelector('table.fin-tbl[data-exp]')||root.querySelector('table.fin-tbl'));if(!tb)return;
  const rows=[...tb.querySelectorAll('tr')].filter(r=>!r.classList.contains('det')).map(r=>[...r.children].map(c=>{const s=c.innerText.replace(/\s+/g,' ').trim();const n=s.replace(/R\$\s?/,'').replace(/\./g,'').replace(',','.');return /^-?\d+(\.\d+)?$/.test(n)?+n:s}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),(LBL[t][0]).slice(0,31));
  const blob=new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  baixar(LBL[t][0].normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\W+/g,'_')+'_'+fHoje()+'.xlsx',blob,btn)}

/* ---------- importar Lala Move e resumo da folha (formato provisório até chegarem os modelos) ---------- */
const FIMP={
  lalamove:{titulo:'Importar relatório do Lala Move',arq:'Modelo_Lala_Move.xlsx',
    spec:{data:[/^data/,/^dia/],pedido:[/pedido|^id|corrida|n[uú]mero/],origem:[/origem|coleta|partida/],destino:[/destino|entrega/],valor:[/^valor|total|pre[cç]o|custo/]},req:['valor'],
    modelo:[['Data','Pedido','Origem','Destino','Motorista','Valor'],['03/11/2026','EXEMPLO-1001','CD Stralog - Jundiaí','Cliente São Paulo','João','185,90'],['04/11/2026','EXEMPLO-1002','CD Stralog - Jundiaí','Loja Campinas','Maria','142,50'],['05/11/2026','EXEMPLO-1003','Fábrica WB Beauty','CD Stralog - Jundiaí','Pedro','320,00']]},
  folha:{titulo:'Importar resumo da folha de pagamento',arq:'Modelo_Resumo_Folha.xlsx',
    spec:{evento:[/evento|descri|rubrica|verba|^item/],valor:[/^valor|total|l[ií]quido/],venc:[/venc/]},req:['evento','valor'],
    modelo:[['Evento','Valor','Vencimento (opcional)'],['Salários líquidos','42.500,00',''],['Pró-labore líquido','8.000,00',''],['INSS (DCTFWeb)','15.230,40',''],['FGTS (FGTS Digital)','4.180,00',''],['IRRF sobre salários','2.310,75',''],['Vale-transporte','1.250,00','']]}
};
const FI={tipo:null,linhas:[],arquivo:'',agrupar:true};
function finAcharCols(rows,spec,req){for(let r=0;r<Math.min(rows.length,25);r++){const h=rows[r].map(x=>String(x).trim().toLowerCase());const map={};
  Object.entries(spec).forEach(([k,res])=>{for(const re of res){const i=h.findIndex((c,ix)=>c&&re.test(c)&&!Object.values(map).includes(ix));if(i>=0){map[k]=i;break}}});
  if(req.every(k=>map[k]!=null))return{row:r,map}}return null}
const FERIADOS=['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'];
function f5Util(compAAAAMM){let d=new Date(fAddMes(compAAAAMM+'-01',1)+'T12:00:00'),n=0;while(true){const w=d.getDay(),md=d.toISOString().slice(5,10);if(w>0&&w<6&&!FERIADOS.includes(md)){n++;if(n===5)break}d.setDate(d.getDate()+1)}return d.toISOString().slice(0,10)}
function fDia20(compAAAAMM){return fAddMes(compAAAAMM+'-01',1).slice(0,8)+'20'}
function finFolhaRegra(ev,comp){const s=fNorm(ev);
  if(/INSS|GPS|DCTF/.test(s))return{cat:'Encargos (INSS, FGTS, IRRF)',quem:'Receita Federal (INSS)',venc:fDia20(comp)};
  if(/FGTS/.test(s))return{cat:'Encargos (INSS, FGTS, IRRF)',quem:'FGTS Digital',venc:fDia20(comp)};
  if(/IRRF|IMPOSTO DE RENDA|\bIR\b/.test(s))return{cat:'Encargos (INSS, FGTS, IRRF)',quem:'Receita Federal (IRRF)',venc:fDia20(comp)};
  if(/PRO ?LABORE/.test(s))return{cat:'Pró-labore',quem:'Sócios',venc:f5Util(comp)};
  return{cat:'Folha de pagamento',quem:'Funcionários',venc:f5Util(comp)}}
function finImport(tipo){
  finModal('pagar','manual',null);const m=$('#finModal');FI.tipo=tipo;FI.linhas=[];FI.arquivo='';const C=FIMP[tipo];
  const compPad=fAddMes(fHoje().slice(0,7)+'-01',-1).slice(0,7);
  m.innerHTML='<div class="panel" id="fiPanel"><div class="row"><h2 class="grow">'+esc(C.titulo)+'</h2><button type="button" class="btn" data-fechar-fin>Fechar</button></div>'+
    '<div class="fin-aviso"><span><b>Formato provisório.</b> Quando chegar o modelo oficial, a leitura das colunas é ajustada. Por enquanto o sistema procura as colunas '+(tipo==='lalamove'?'<b>Data, Pedido, Origem, Destino e Valor</b>':'<b>Evento e Valor</b> (Vencimento é opcional)')+'.</span><button class="btn" type="button" data-fi="modelo">Baixar planilha modelo</button></div>'+
    '<div class="fin-form"><label>Empresa<select id="fiEmp"><option value="">Grupo / não informada</option>'+empresasGrupo().map(x=>'<option value="'+x.doc+'"'+(x.doc===EMP?' selected':'')+'>'+esc(x.nome)+'</option>').join('')+'</select></label>'+
    (tipo==='folha'?'<label>Competência<input type="month" id="fiComp" value="'+compPad+'"></label>':
      '<label>Como lançar<select id="fiAgr"><option value="1">Um título com o total (fatura)</option><option value="0">Um título por corrida</option></select></label><label>Vencimento da fatura<input type="date" id="fiVenc" value="'+fAddDias(fHoje(),7)+'"></label>')+
    '<label class="full">Arquivo (Excel ou CSV)<input type="file" id="fiArq" accept=".xlsx,.xls,.csv"></label></div>'+
    '<p class="note" id="fiMsg" aria-live="polite"></p><div id="fiPrev"></div></div>';
  m.querySelector('#fiArq').onchange=async e=>{const f=e.target.files[0];if(!f)return;const msg=m.querySelector('#fiMsg');msg.textContent='Lendo '+f.name+'…';
    try{const rows=await lerPlanilha(f);const h=finAcharCols(rows,C.spec,C.req);if(!h){msg.textContent='Não achei as colunas esperadas. Colunas encontradas: '+(rows[0]||[]).filter(Boolean).join(', ');return}
      FI.arquivo=f.name;FI.linhas=[];rows.slice(h.row+1).forEach(r=>{const g=k=>h.map[k]!=null?r[h.map[k]]:'';const v=finR(num(g('valor')));if(!(v>0))return;
        if(tipo==='folha'){const ev=String(g('evento')).trim();if(!ev||/^total/i.test(ev))return;FI.linhas.push({ev,valor:v,vencArq:g('venc')?dataISO(g('venc')):'',ok:true})}
        else{FI.linhas.push({data:g('data')?dataISO(g('data')):fHoje(),pedido:String(g('pedido')).trim(),rota:[g('origem'),g('destino')].map(x=>String(x).trim()).filter(Boolean).join(' → '),valor:v,ok:true})}});
      msg.textContent=FI.linhas.length+' linha(s) lidas de '+f.name+'.';finImportPrev(m)}catch(err){msg.textContent='Não consegui ler o arquivo: '+(err.message||err)}};
  m.querySelector('#fiPanel').addEventListener('change',e=>{if(e.target.id==='fiComp'||e.target.id==='fiAgr'||e.target.id==='fiVenc')finImportPrev(m);const ck=e.target.closest('[data-fi-ok]');if(ck){FI.linhas[+ck.dataset.fiOk].ok=ck.checked;finImportPrev(m)}const vv=e.target.closest('[data-fi-venc]');if(vv)FI.linhas[+vv.dataset.fiVenc].venc=vv.value;const cc=e.target.closest('[data-fi-cat]');if(cc)FI.linhas[+cc.dataset.fiCat].cat=cc.value});
  m.querySelector('#fiPanel').addEventListener('click',e=>{const b=e.target.closest('[data-fi]');if(!b)return;
    if(b.dataset.fi==='modelo'){if(!window.XLSX)return;const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(C.modelo),'Modelo');baixar(C.arq,new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),b)}
    if(b.dataset.fi==='gerar')finImportGerar(m,b)});
  m.hidden=false;
}
function finImportLinhas(m){const tipo=FI.tipo;const L=FI.linhas.filter(l=>l.ok);
  if(tipo==='folha'){const comp=(m.querySelector('#fiComp').value||fHoje().slice(0,7));const cm=comp.slice(5,7)+'/'+comp.slice(0,4);
    return L.map(l=>{const rg=finFolhaRegra(l.ev,comp);return{contraparte:rg.quem,descricao:l.ev+' · competência '+cm,categoria:l.cat||rg.cat,emissao:fAddDias(fAddMes(comp+'-01',1),-1),vencimento:l.venc||l.vencArq||rg.venc,valor:l.valor,obs:'Importado de '+FI.arquivo}})}
  const agr=m.querySelector('#fiAgr').value==='1';
  if(agr){const tot=finR(L.reduce((s,l)=>s+l.valor,0));if(!tot)return[];const ds=L.map(l=>l.data).sort();return[{contraparte:'Lala Move',descricao:'Lala Move · '+L.length+' corrida(s) de '+fD(ds[0])+' a '+fD(ds[ds.length-1]),categoria:'Lala Move',emissao:ds[ds.length-1],vencimento:m.querySelector('#fiVenc').value||fHoje(),valor:tot,obs:'Importado de '+FI.arquivo}]}
  return L.map(l=>({contraparte:'Lala Move',descricao:'Lala Move'+(l.pedido?' · '+l.pedido:'')+(l.rota?' · '+l.rota:''),categoria:'Lala Move',emissao:l.data,vencimento:l.venc||l.data,valor:l.valor,obs:'Importado de '+FI.arquivo}))}
function finImportPrev(m){const P=m.querySelector('#fiPrev');if(!FI.linhas.length){P.innerHTML='';return}const tipo=FI.tipo;
  const comp=tipo==='folha'?(m.querySelector('#fiComp').value||fHoje().slice(0,7)):'';
  const dup=d=>FIN.T.some(t=>t.origem===FI.tipo&&t.descricao===d.descricao&&Math.abs(t.valor-d.valor)<0.01);
  let h='<h3 style="margin:6px 0">Linhas do arquivo</h3><div class="tbl-wrap"><table class="fin-tbl"><thead><tr><th></th>'+(tipo==='folha'?'<th>Evento</th><th>Categoria</th><th>Favorecido</th><th>Vencimento</th>':'<th>Data</th><th>Pedido</th><th>Rota</th>')+'<th class="n">Valor</th></tr></thead><tbody>';
  FI.linhas.forEach((l,i)=>{if(tipo==='folha'){const rg=finFolhaRegra(l.ev,comp);h+='<tr><td><input type="checkbox" data-fi-ok="'+i+'"'+(l.ok?' checked':'')+' aria-label="Incluir"></td><td>'+esc(l.ev)+'</td><td>'+finCatSelect('pagar',l.cat||rg.cat,'data-fi-cat="'+i+'" aria-label="Categoria"')+'</td><td>'+esc(rg.quem)+'</td><td><input type="date" data-fi-venc="'+i+'" value="'+(l.venc||l.vencArq||rg.venc)+'" aria-label="Vencimento"></td><td class="n">'+fmtR.format(l.valor)+'</td></tr>'}
    else h+='<tr><td><input type="checkbox" data-fi-ok="'+i+'"'+(l.ok?' checked':'')+' aria-label="Incluir"></td><td class="mono">'+fD(l.data)+'</td><td>'+esc(l.pedido)+'</td><td class="wrap">'+esc(l.rota)+'</td><td class="n">'+fmtR.format(l.valor)+'</td></tr>'});
  const T=finImportLinhas(m),tot=T.reduce((s,t)=>s+t.valor,0),nd=T.filter(dup).length;
  h+='</tbody><tfoot><tr><td colspan="'+(tipo==='folha'?5:4)+'">'+FI.linhas.filter(l=>l.ok).length+' de '+FI.linhas.length+' linha(s) incluída(s)</td><td class="n">'+fmtR.format(tot)+'</td></tr></tfoot></table></div>'+
    (nd?'<div class="fin-aviso"><span><b>'+nd+'</b> título(s) parecem já ter sido importados (mesma descrição e valor). Desmarque as linhas se for repetição.</span></div>':'')+
    '<div class="row" style="margin-top:8px"><button class="btn pri" type="button" data-fi="gerar">Gerar '+T.length+' título(s) a pagar</button><span class="note">'+(tipo==='folha'?'Salários e pró-labore vencem no 5º dia útil; INSS, FGTS e IRRF no dia 20 do mês seguinte à competência. Ajuste na tabela se precisar.':'Os títulos entram em Contas a pagar na categoria Lala Move.')+'</span></div>';
  P.innerHTML=h}
async function finImportGerar(m,b){const T=finImportLinhas(m);if(!T.length)return;b.disabled=true;const emp=m.querySelector('#fiEmp').value||null;
  try{const{error}=await finSB().from('fin_titulos').insert(T.map(t=>Object.assign({tipo:'pagar',origem:FI.tipo,empresa_doc:emp},t)));if(error)throw error;
    m.hidden=true;await finCarregar(true);finMsg(T.length+' título(s) importado(s)');FL.pagar.st='aberto';finRenderAtual()}
  catch(err){m.querySelector('#fiMsg').textContent='Não salvou: '+(err.message||err);b.disabled=false}}

/* ---------- Lala Move (Financeiro › Contas a pagar) ---------- */
/* Lê o extrato detalhado em Excel da Lalamove ("Monthly Statement Detailed Breakdown"). O PDF é só o resumo. */
const LL={rows:null,ext:[],carregando:null,erro:'',ano:null,ref:null,imp:null,corr:[]};
const llDia=d=>d.toISOString().slice(0,10);
const llD=s=>new Date(s+'T12:00:00');
const llSemIni=s=>{const d=llD(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return llDia(d)};
const llMesRot=p=>MESES[+p.slice(5,7)-1]+'/'+p.slice(2,4);
const llNum=v=>{if(typeof v==='number')return v;const n=parseFloat(String(v==null?'':v).replace(/[^\d.\-]/g,''));return isNaN(n)?0:n};
async function llCarregar(forcar){
  if(LL.carregando&&!forcar)return LL.carregando;
  LL.carregando=(async()=>{const[R,E]=await Promise.all([finTodas('fin_lalamove','quando'),finTodas('fin_lalamove_extratos','periodo')]);LL.rows=R;LL.ext=E;llDerivar();LL.erro=''})()
    .catch(e=>{LL.erro=e.message||String(e);LL.carregando=null;throw e});
  return LL.carregando}
function llDerivar(){const ped={};
  LL.rows.forEach(r=>{r.v=+r.valor;r.d=String(r.quando).replace('T',' ').slice(0,19);r.dia=r.d.slice(0,10);
    if(r.tipo==='ORDER'&&r.pedido){const p=ped[r.pedido]||(ped[r.pedido]={id:r.pedido,valor:0,reemb:0,dia:null});if(r.acao==='Order'){p.valor+=-r.v;p.dia=r.dia;p.hora=r.d;p.forma=r.forma}if(r.acao==='Refund')p.reemb+=r.v}});
  LL.corr=Object.values(ped).filter(p=>p.dia);LL.corr.forEach(p=>{p.cancelada=p.reemb>=p.valor-0.01});
  const dias=LL.corr.map(p=>p.dia).sort();LL.ultimo=dias[dias.length-1]||null}
function llAgg(ini,fim){const R=LL.rows.filter(r=>r.dia>=ini&&r.dia<=fim);const s=f=>finR(R.filter(f).reduce((a,r)=>a+r.v,0));
  const C=LL.corr.filter(p=>p.dia>=ini&&p.dia<=fim);const o={corridas:C.filter(p=>!p.cancelada).length,canceladas:C.filter(p=>p.cancelada).length};
  o.pedidos=-s(r=>r.acao==='Order');o.prioridade=-s(r=>r.acao==='Priority fee');o.cancel=-s(r=>r.acao==='Cancellation fee');
  o.reemb=s(r=>/^Refund/.test(r.acao));o.liquido=-s(r=>r.tipo!=='TOP-UP');o.outros=finR(o.liquido-o.pedidos-o.prioridade-o.cancel+o.reemb);
  o.recargas=s(r=>r.tipo==='TOP-UP');o.dinheiro=-s(r=>r.tipo!=='TOP-UP'&&r.forma==='Cash');o.online=-s(r=>r.tipo!=='TOP-UP'&&r.forma==='Online payment');
  ['pedidos','prioridade','cancel','reemb','liquido','outros','recargas','dinheiro','online'].forEach(k=>{o[k]=finR(o[k])+0});o.medio=o.corridas?o.liquido/o.corridas:0;return o}
function finLala(root){
  if(!LL.rows){root.innerHTML=LL.erro?'<div class="callout">Não consegui abrir o Lala Move: '+esc(LL.erro)+'. Se for a primeira vez, falta criar as tabelas no banco.</div>':'<p class="note">Carregando as corridas…</p>';if(!LL.erro)llCarregar().then(()=>finLala(root)).catch(()=>finLala(root));return}
  const anos=[...new Set(LL.rows.map(r=>r.dia.slice(0,4)))].sort();
  if(!LL.ref)LL.ref=LL.ultimo||fHoje();const ref=LL.ref;const ano=ref.slice(0,4);
  const mesIni=ref.slice(0,8)+'01',mesFim=llDia(new Date(+ref.slice(0,4),+ref.slice(5,7),0,12)),sIni=llSemIni(ref),sFim=fAddDias(sIni,6);
  const box=(rot,sub,o,cls)=>'<div class="box'+(cls?' '+cls:'')+'"><span class="eyebrow">'+rot+'</span><b>'+o.corridas+' corrida'+(o.corridas===1?'':'s')+'</b><span class="note">'+esc(sub)+'</span><span class="note">'+fmtR.format(o.liquido)+(o.corridas?' · média '+fmtR.format(o.medio):'')+(o.canceladas?' · '+o.canceladas+' cancelada'+(o.canceladas===1?'':'s'):'')+'</span></div>';
  const kD=llAgg(ref,ref),kS=llAgg(sIni,sFim),kM=llAgg(mesIni,mesFim),kA=llAgg(ano+'-01-01',ano+'-12-31');
  // meses do ano
  const ms=[];for(let i=1;i<=12;i++){const p=ano+'-'+String(i).padStart(2,'0');const fim=llDia(new Date(+ano,i,0,12));const o=llAgg(p+'-01',fim);const ex=LL.ext.find(e=>e.periodo===p);if(o.corridas||o.canceladas||o.recargas||ex)ms.push({p,o,ex})}
  const tot=llAgg(ano+'-01-01',ano+'-12-31');
  const confere=ex=>{if(!ex||ex.saldo_inicial==null)return '<span class="note">—</span>';const mov=finR(LL.rows.filter(r=>r.periodo===ex.periodo&&r.conta===ex.conta&&r.forma==='Business wallet').reduce((a,r)=>a+r.v,0));const dif=finR(+ex.saldo_inicial+mov-(+ex.saldo_final));
    return Math.abs(dif)<0.01?'<span class="pill ok" title="Saldo inicial + movimentos da carteira = saldo final">Confere</span>':'<span class="pill bad" title="Diferença entre o extrato e as linhas importadas">Diferença '+fmtR.format(dif)+'</span>'};
  const titCel=(p,ex)=>{if(!ex)return '<span class="note">sem extrato</span>';const t=ex.titulo_id&&FIN.byId[ex.titulo_id];if(t)return '<span title="'+esc(fmtR.format(t.valor)+' · '+t.descricao)+'">'+finSt(t)+'</span>';return '<button class="btn" data-ll-tit="'+p+'">Gerar título</button>'};
  const cel=v=>'<td class="n">'+(Math.abs(v)<0.005?'—':fmtR.format(v))+'</td>';
  let tb='<div class="tbl-wrap"><table class="fin-tbl ll-mes" data-exp><thead><tr><th>Mês</th><th class="n">Corridas</th><th class="n">Cancel.</th><th class="n">Pedidos</th><th class="n" title="Prioridade, cancelamento e outros">Taxas</th><th class="n">Reembolsos</th><th class="n">Custo líquido</th><th class="n">Média</th><th class="n">Recargas</th><th>Extrato</th><th>Título</th></tr></thead><tbody>'+
    ms.map(({p,o,ex})=>'<tr'+(p===ref.slice(0,7)?' class="sel"':'')+'><td><button class="lnk" data-ll-mes="'+p+'">'+llMesRot(p)+'</button></td><td class="n">'+o.corridas+'</td><td class="n">'+(o.canceladas||'—')+'</td>'+cel(o.pedidos)+cel(o.prioridade+o.cancel+o.outros)+cel(-o.reemb)+'<td class="n"><b>'+fmtR.format(o.liquido)+'</b></td>'+cel(o.medio)+cel(o.recargas)+'<td>'+confere(ex)+'</td><td>'+titCel(p,ex)+'</td></tr>').join('')+
    '</tbody><tfoot><tr><td>Total '+ano+'</td><td class="n">'+tot.corridas+'</td><td class="n">'+(tot.canceladas||'—')+'</td>'+cel(tot.pedidos)+cel(tot.prioridade+tot.cancel+tot.outros)+cel(-tot.reemb)+'<td class="n">'+fmtR.format(tot.liquido)+'</td>'+cel(tot.medio)+cel(tot.recargas)+'<td></td><td></td></tr></tfoot></table></div>';
  // dias do mês (gráfico) e semanas
  const dias=[];for(let d=mesIni;d<=mesFim;d=fAddDias(d,1))dias.push({d,o:llAgg(d,d)});
  const W=Math.max(560,dias.length*22),H=170,pl=34,pb=22,pt=8,mx=Math.max(1,...dias.map(x=>x.o.corridas)),bw=(W-pl-6)/dias.length,y=v=>H-pb-(H-pb-pt)*v/mx;
  let svg='<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Corridas por dia em '+llMesRot(mesIni)+'">';
  for(let i=0;i<=4;i++){const v=Math.round(mx*i/4);svg+='<line x1="'+pl+'" x2="'+(W-4)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="var(--line)"/><text x="'+(pl-5)+'" y="'+(y(v)+3).toFixed(1)+'" text-anchor="end">'+v+'</text>'}
  dias.forEach((x,i)=>{const X=pl+i*bw,dw=llD(x.d).getDay(),fds=dw===0||dw===6;svg+='<g data-ll-dia="'+x.d+'" style="cursor:pointer"><rect x="'+X.toFixed(1)+'" y="'+pt+'" width="'+bw.toFixed(1)+'" height="'+(H-pb-pt)+'" fill="transparent"/>'+(x.o.corridas?'<rect x="'+(X+bw*.18).toFixed(1)+'" y="'+y(x.o.corridas).toFixed(1)+'" width="'+(bw*.64).toFixed(1)+'" height="'+(H-pb-y(x.o.corridas)).toFixed(1)+'" rx="2" fill="'+(x.d===ref?'var(--fg)':'var(--accent)')+'"/>':'')+'<text x="'+(X+bw/2).toFixed(1)+'" y="'+(H-7)+'" text-anchor="middle"'+(fds?' style="opacity:.5"':'')+'>'+(+x.d.slice(8))+'</text><title>'+fD(x.d)+': '+x.o.corridas+' corrida(s) · '+fmtR.format(x.o.liquido)+'</title></g>'});svg+='</svg>';
  const sems=[];for(let s0=llSemIni(mesIni);s0<=mesFim;s0=fAddDias(s0,7)){const s=s0<mesIni?mesIni:s0,f=fAddDias(s0,6)>mesFim?mesFim:fAddDias(s0,6);sems.push({s0,s,f,o:llAgg(s,f)})}
  const top=dias.slice().sort((a,b)=>b.o.corridas-a.o.corridas)[0];
  const extList=LL.ext.slice().sort((a,b)=>b.periodo.localeCompare(a.periodo));
  root.innerHTML='<div class="fin-bar"><a class="btn" href="#fin-pagar">‹ Contas a pagar</a><label class="btn pri" style="cursor:pointer">Importar extratos (Excel)<input type="file" id="llArq" accept=".xlsx,.xls" multiple hidden></label>'+
      '<label class="note">Referência <input type="date" id="llRef" value="'+ref+'"></label>'+(anos.length>1?'<div class="chips">'+anos.map(a=>'<button class="chip" data-ll-ano="'+a+'" aria-pressed="'+(a===ano)+'">'+a+'</button>').join('')+'</div>':'')+
      (LL.ultimo?'<span class="note">Última corrida importada: '+fD(LL.ultimo)+'</span>':'')+'</div>'+
    (LL.rows.length?'':'<div class="fin-aviso"><span>Nenhum extrato importado ainda. No app da Lalamove, baixe o <b>extrato mensal detalhado em Excel</b> (Monthly Statement Detailed Breakdown) e importe aqui. Dá para escolher vários meses de uma vez.</span></div>')+
    '<div class="fin-kpis">'+box('Dia',fD(ref),kD)+box('Semana',fD(sIni)+' a '+fD(sFim),kS)+box('Mês',llMesRot(ref),kM)+box('Ano',ano,kA,'ok')+'</div>'+
    '<div class="panel"><div class="row"><h3 class="grow" style="margin:0">Corridas por dia · '+llMesRot(ref)+'</h3><span class="note">'+(top&&top.o.corridas?'Dia com mais corridas: '+fD(top.d)+' ('+top.o.corridas+')':'')+'</span></div><p class="note" style="margin:4px 0 8px">Clique num dia para ver o dia e a semana nos contadores. Canceladas e reembolsadas não contam como corrida.</p><div class="fin-chart">'+svg+'</div>'+
      '<div class="tbl-wrap" style="margin-top:10px"><table class="fin-tbl"><thead><tr><th>Semana do mês (seg a dom)</th><th class="n">Corridas</th><th class="n">Canceladas</th><th class="n">Custo líquido</th><th class="n">Média por corrida</th></tr></thead><tbody>'+sems.map(x=>'<tr'+(x.s0===sIni?' class="sel"':'')+'><td><button class="lnk" data-ll-dia="'+x.s+'">'+fD(x.s)+' a '+fD(x.f)+'</button></td><td class="n">'+x.o.corridas+'</td><td class="n">'+(x.o.canceladas||'—')+'</td>'+cel(x.o.liquido)+cel(x.o.medio)+'</tr>').join('')+'</tbody></table></div></div>'+
    '<div class="panel"><h3 style="margin:0 0 8px">Mês a mês · '+ano+'</h3><p class="note" style="margin:0 0 8px">Custo líquido = pedidos + taxas − reembolsos, inclusive corridas pagas em dinheiro. O título a pagar de cada mês leva as <b>recargas da carteira</b> (e pagamentos online), que é o que sai do caixa, já baixado nos dias das recargas.</p>'+tb+'</div>'+
    '<div class="panel"><h3 style="margin:0 0 8px">Extratos importados</h3>'+(extList.length?'<div class="tbl-wrap"><table class="fin-tbl"><thead><tr><th>Período</th><th>Conta Lalamove</th><th>Arquivo</th><th class="n">Linhas</th><th class="n">Saldo inicial</th><th class="n">Saldo final</th><th>Importado em</th><th></th></tr></thead><tbody>'+
      extList.map(e=>'<tr><td>'+llMesRot(e.periodo)+'</td><td>'+esc((e.empresa||'')+' · '+e.conta)+'</td><td class="wrap">'+esc(e.arquivo||'')+'</td><td class="n">'+(e.linhas||0)+'</td><td class="n">'+fmtR.format(+e.saldo_inicial||0)+'</td><td class="n">'+fmtR.format(+e.saldo_final||0)+'</td><td class="mono">'+(e.importado_em?new Date(e.importado_em).toLocaleDateString('pt-BR'):'')+'</td><td><button class="btn soGestor" data-ll-del="'+esc(e.conta+'|'+e.periodo)+'">Remover</button></td></tr>').join('')+'</tbody></table></div>':'<p class="note">Nenhum ainda.</p>')+'</div>';
  root.querySelector('#llRef').onchange=e=>{if(e.target.value){LL.ref=e.target.value;finLala(root)}};
  root.querySelector('#llArq').onchange=e=>{const fs=[...e.target.files];e.target.value='';if(fs.length)llImportar(fs)};
  root.onclick=e=>{const a=e.target.closest('[data-ll-ano]'),m=e.target.closest('[data-ll-mes]'),d=e.target.closest('[data-ll-dia]'),t=e.target.closest('[data-ll-tit]'),x=e.target.closest('[data-ll-del]');
    if(a){const ds=LL.corr.filter(p=>p.dia.startsWith(a.dataset.llAno)).map(p=>p.dia).sort();LL.ref=ds[ds.length-1]||a.dataset.llAno+'-12-31';finLala(root);return}
    if(m){const ds=LL.corr.filter(p=>p.dia.startsWith(m.dataset.llMes)).map(p=>p.dia).sort();LL.ref=ds[ds.length-1]||m.dataset.llMes+'-01';finLala(root);return}
    if(d){LL.ref=d.dataset.llDia;finLala(root);return}
    if(t){t.disabled=true;finExec(async()=>{await llGerarTitulo(t.dataset.llTit,null)},'Título do Lala Move gerado').then(()=>llCarregar(true)).then(()=>finRenderAtual());return}
    if(x){if(!x.dataset.ok){x.dataset.ok='1';x.textContent='Confirmar remoção';return}const[c,p]=x.dataset.llDel.split('|');
      finExec(async()=>{let r=await finSB().from('fin_lalamove').delete().eq('conta',c).eq('periodo',p);if(r.error)throw r.error;r=await finSB().from('fin_lalamove_extratos').delete().eq('conta',c).eq('periodo',p);if(r.error)throw r.error;await llCarregar(true)},'Extrato removido (o título a pagar continua em Contas a pagar)')}};
}
/* leitura do Excel detalhado */
function llLer(rows,nome){
  const h=rows.findIndex(r=>String(r[0]).trim().toUpperCase()==='TYPE');if(h<0)throw new Error(nome+': não é o extrato detalhado da Lalamove (não achei a coluna TYPE). Use o Excel "Detailed Breakdown", não o PDF.');
  const meta={};rows.slice(0,h).forEach(r=>{if(r[0])meta[String(r[0]).trim()]=String(r[1]==null?'':r[1]).trim()});
  const H=rows[h].map(x=>String(x).trim().toUpperCase());const c=n=>H.indexOf(n);
  const ix={tipo:c('TYPE'),acao:c('ACTION'),pedido:c('ORDER ID'),quando:c('TRANSACTION TIMESTAMP'),forma:c('PAYMENT METHOD'),valor:c('TRANSACTION AMOUNT'),usuario:c('USER')};
  if(ix.tipo<0||ix.acao<0||ix.quando<0||ix.valor<0)throw new Error(nome+': colunas do extrato não reconhecidas.');
  const conta=meta['Company ID']||'lalamove';const rng=(meta['Date Range']||'').match(/(\d{4}-\d{2}-\d{2})\s*-\s*(\d{4}-\d{2}-\d{2})/);
  const L=[],cont={};
  rows.slice(h+1).forEach(r=>{const tipo=String(r[ix.tipo]||'').trim().toUpperCase();if(!tipo)return;
    let q=r[ix.quando];if(typeof q==='number'){const d=new Date(Math.round((q-25569)*864e5));q=d.toISOString().slice(0,19).replace('T',' ')}q=String(q).trim();
    const o={conta,tipo,acao:String(r[ix.acao]||'').trim(),pedido:ix.pedido>=0?String(r[ix.pedido]||'').trim()||null:null,quando:q,forma:ix.forma>=0?String(r[ix.forma]||'').trim():'',valor:finR(llNum(r[ix.valor])),usuario:ix.usuario>=0?String(r[ix.usuario]||'').trim():''};
    const k=[conta,o.pedido||'',o.acao,o.quando,o.valor.toFixed(2),o.forma].join('|');cont[k]=(cont[k]||0)+1;o.id=k+'|'+cont[k];L.push(o)});
  const datas=L.map(x=>x.quando.slice(0,10)).sort();const de=rng?rng[1]:datas[0],ate=rng?rng[2]:datas[datas.length-1];
  if(!de)throw new Error(nome+': o extrato está vazio.');
  const periodo=de.slice(0,7);L.forEach(x=>{x.periodo=periodo});
  const si=meta['Opening balance (Business wallet)'],sf=meta['Closing balance (Business wallet)'];
  return{arquivo:nome,conta,empresa:meta['Company Name']||'',periodo,de,ate,gerado_em:(meta['Date/Time of Generation']||'').replace(/^Generated by Lalamove at\s*/i,''),saldo_inicial:si!==undefined&&si!==''?finR(llNum(si)):null,saldo_final:sf!==undefined&&sf!==''?finR(llNum(sf)):null,linhas:L}}
async function llImportar(files){
  finModal('pagar','manual',null);const m=$('#finModal');const ex=[],erros=[];
  m.innerHTML='<div class="panel"><div class="row"><h2 class="grow">Importar extratos do Lala Move</h2><button type="button" class="btn" data-fechar-fin>Fechar</button></div><p class="note">Lendo '+files.length+' arquivo(s)…</p></div>';m.hidden=false;
  for(const f of files){try{ex.push(llLer(await lerPlanilha(f),f.name))}catch(e){erros.push(e.message||String(e))}}
  ex.sort((a,b)=>a.periodo.localeCompare(b.periodo));
  const ja=new Set(LL.rows.map(r=>r.id));
  // uma linha por arquivo; mesmo mês repetido fica só o mais completo
  const porMes={};ex.forEach(x=>{const k=x.conta+'|'+x.periodo;if(!porMes[k]||x.linhas.length>porMes[k].linhas.length)porMes[k]=x});const E=Object.values(porMes);
  LL.imp=E;
  const linha=x=>{const ag={v:a=>finR(x.linhas.filter(a).reduce((s,r)=>s+r.valor,0))};const novas=x.linhas.filter(r=>!ja.has(r.id)).length;const ped={};x.linhas.forEach(r=>{if(r.pedido){const p=ped[r.pedido]||(ped[r.pedido]={o:0,r:0,tem:false});if(r.acao==='Order'){p.o+=-r.valor;p.tem=true}if(r.acao==='Refund')p.r+=r.valor}});
    const corr=Object.values(ped).filter(p=>p.tem&&p.r<p.o-0.01).length;const rec=ag.v(r=>r.tipo==='TOP-UP'),liq=-ag.v(r=>r.tipo!=='TOP-UP');
    const mov=ag.v(r=>r.forma==='Business wallet');const ok=x.saldo_inicial==null||Math.abs(finR(x.saldo_inicial+mov-x.saldo_final))<0.01;
    return '<tr><td class="wrap">'+esc(x.arquivo)+'</td><td>'+llMesRot(x.periodo)+'</td><td class="n">'+x.linhas.length+'</td><td class="n">'+(novas===x.linhas.length?'todas':novas?novas+' novas':'<span class="pill neu">já importado</span>')+'</td><td class="n">'+corr+'</td><td class="n">'+fmtR.format(rec)+'</td><td class="n">'+fmtR.format(liq)+'</td><td>'+(ok?'<span class="pill ok">Confere</span>':'<span class="pill bad">Não confere</span>')+'</td></tr>'};
  m.innerHTML='<div class="panel" id="llPanel"><div class="row"><h2 class="grow">Importar extratos do Lala Move</h2><button type="button" class="btn" data-fechar-fin>Fechar</button></div>'+
    (erros.length?'<div class="callout">'+erros.map(esc).join('<br>')+'</div>':'')+
    (E.length?'<div class="tbl-wrap"><table class="fin-tbl"><thead><tr><th>Arquivo</th><th>Mês</th><th class="n">Linhas</th><th class="n">Situação</th><th class="n">Corridas</th><th class="n">Recargas</th><th class="n">Custo líquido</th><th>Saldo da carteira</th></tr></thead><tbody>'+E.map(linha).join('')+'</tbody></table></div>'+
      '<div class="fin-form" style="margin-top:10px"><label>Empresa que paga o Lala Move<select id="llEmp"><option value="">Grupo / não informada</option>'+empresasGrupo().map(x=>'<option value="'+x.doc+'"'+(x.doc===EMP?' selected':'')+'>'+esc(x.nome)+'</option>').join('')+'</select></label>'+
      '<label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="llTit" checked> Gerar o título a pagar de cada mês, já baixado nos dias das recargas</label></div>'+
      '<p class="note">Reimportar o mesmo mês não duplica: as linhas já gravadas são ignoradas. "Confere" quer dizer que saldo inicial + movimentos da carteira bate com o saldo final do extrato.</p>'+
      '<div class="row" style="margin-top:8px"><button class="btn pri" type="button" id="llGo">Importar '+E.length+' extrato(s)</button><span class="note" id="llMsg" aria-live="polite"></span></div>':'<p class="note">Nenhum extrato válido para importar.</p>')+'</div>';
  const go=m.querySelector('#llGo');if(go)go.onclick=async()=>{go.disabled=true;const msg=m.querySelector('#llMsg');const emp=m.querySelector('#llEmp').value||null,gerar=m.querySelector('#llTit').checked;
    try{for(const x of E){msg.textContent='Gravando '+llMesRot(x.periodo)+'…';
        for(let i=0;i<x.linhas.length;i+=500){const{error}=await finSB().from('fin_lalamove').upsert(x.linhas.slice(i,i+500),{onConflict:'id',ignoreDuplicates:true});if(error)throw error}
        const{error}=await finSB().from('fin_lalamove_extratos').upsert({conta:x.conta,periodo:x.periodo,empresa:x.empresa,empresa_doc:emp,de:x.de,ate:x.ate,saldo_inicial:x.saldo_inicial,saldo_final:x.saldo_final,gerado_em:x.gerado_em,arquivo:x.arquivo,linhas:x.linhas.length},{onConflict:'conta,periodo'});if(error)throw error}
      await llCarregar(true);
      if(gerar){await finCarregar(true);for(const x of E){msg.textContent='Gerando título de '+llMesRot(x.periodo)+'…';await llGerarTitulo(x.periodo,x.conta)}await llCarregar(true)}
      await finCarregar(true);m.hidden=true;const ds=LL.corr.map(p=>p.dia).sort();LL.ref=ds[ds.length-1]||LL.ref;finMsg(E.length+' extrato(s) do Lala Move importado(s)');finRenderAtual()}
    catch(err){msg.textContent='Não salvou: '+(err.message||err);go.disabled=false}};
}
/* título a pagar do mês = recargas da carteira + pagamentos online, baixado nos dias em que saiu o dinheiro */
async function llGerarTitulo(periodo,conta){
  const ex=LL.ext.find(e=>e.periodo===periodo&&(!conta||e.conta===conta));if(!ex)throw new Error('Extrato de '+llMesRot(periodo)+' não encontrado.');
  const chave='LALAMOVE-'+ex.conta+'-'+periodo;
  const ja=FIN.T.find(t=>t.nf_chave===chave);if(ja){if(ex.titulo_id!==ja.id){const{error}=await finSB().from('fin_lalamove_extratos').update({titulo_id:ja.id}).eq('conta',ex.conta).eq('periodo',periodo);if(error)throw error}return}
  const R=LL.rows.filter(r=>r.periodo===periodo&&r.conta===ex.conta);
  const pg={};R.forEach(r=>{let k=null,v=0;if(r.tipo==='TOP-UP'){k='Recarga da carteira Lalamove';v=r.v}else if(r.forma==='Online payment'){k='Pagamento online Lalamove';v=-r.v}if(!k||!v)return;const kk=r.dia+'|'+k;pg[kk]=finR((pg[kk]||0)+v)});
  const baixas=Object.entries(pg).filter(([,v])=>v>0.004).map(([k,v])=>({data:k.split('|')[0],forma:k.split('|')[1],valor:v}));
  const valor=finR(baixas.reduce((s,b)=>s+b.valor,0));if(!(valor>0))return;
  const ini=ex.de||periodo+'-01',fim=ex.ate||llDia(new Date(+periodo.slice(0,4),+periodo.slice(5,7),0,12));const o=llAgg(ini,fim);
  const{data:t,error}=await finSB().from('fin_titulos').insert({tipo:'pagar',origem:'lalamove',empresa_doc:ex.empresa_doc||null,contraparte:'Lalamove',descricao:'Lala Move · '+llMesRot(periodo)+' · '+o.corridas+' corrida(s) · recargas da carteira',categoria:'Lala Move',nf_chave:chave,parcela:'1',emissao:fim,vencimento:fim,valor,
    obs:'Gerado do extrato '+(ex.arquivo||'')+'. Custo líquido das corridas no mês: '+fmtR.format(o.liquido)+(o.dinheiro>0.004?' (inclui '+fmtR.format(o.dinheiro)+' pagos em dinheiro, fora deste título)':'')+'.'}).select('id').single();
  if(error)throw error;
  const{error:e2}=await finSB().from('fin_baixas').insert(baixas.map(b=>({titulo_id:t.id,data:b.data,valor:b.valor,forma:b.forma,obs:'Extrato Lalamove '+llMesRot(periodo)})));if(e2)throw e2;
  const{error:e3}=await finSB().from('fin_lalamove_extratos').update({titulo_id:t.id}).eq('conta',ex.conta).eq('periodo',periodo);if(e3)throw e3}

/* menu Financeiro recolhível */
function finMenu(abrir){const tg=$('#finToggle'),sub=$('#finSub');if(!tg)return;const t=location.hash.slice(1);const ativo=t.startsWith('fin-');
  let ab=abrir;if(ab==null){try{ab=localStorage.getItem('ciab-fin-aberto')==='1'}catch(e){ab=false}ab=ab||ativo}
  sub.hidden=!ab;tg.setAttribute('aria-expanded',String(ab));tg.classList.toggle('temAtivo',ativo&&!ab)}
(function(){const tg=$('#finToggle');if(!tg)return;const alterna=()=>{const ab=$('#finSub').hidden;try{localStorage.setItem('ciab-fin-aberto',ab?'1':'0')}catch(e){}finMenu(ab)};
  tg.addEventListener('click',alterna);tg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();alterna()}});
  window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#fin-'))finMenu(true);else finMenu()});finMenu()})();
finRealtime();

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
