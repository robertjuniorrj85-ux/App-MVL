import { firebaseConfig } from './firebase-config.js?v=9.2';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider, updateProfile
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, addDoc,
  getDocs, deleteDoc, updateDoc, query, where, onSnapshot, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const fbApp=initializeApp(firebaseConfig);
const auth=getAuth(fbApp);
const db=getFirestore(fbApp);
setPersistence(auth,browserLocalPersistence).catch(()=>{});
const MVL_PUSH_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwtNzufio5Gt_u9zrsMx-lMzei3o5dkFeaH_mE57TY04Yb3voX6IlOUSpS2HFcK_moD/exec';
async function enviarPushMVL(tipo, titulo, mensagem, destinatarios = []) {
  try {
    const user = auth.currentUser;
    if (!user) return false;

    const idToken = await user.getIdToken();

    const resposta = await fetch(MVL_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        idToken,
        tipo,
        titulo,
        mensagem,
        destinatarios,
        url: 'https://robertjuniorrj85-ux.github.io/App-MVL/'
      })
    });

    const resultado = await resposta.json();

    if (!resultado.ok) {
      console.error('Erro Push MVL:', resultado);
      return false;
    }

    console.log('Push MVL enviado:', resultado);
    return true;

  } catch (erro) {
    console.error('Falha ao enviar Push MVL:', erro);
    return false;
  }
}
const $=id=>document.getElementById(id);
const login=$('login'),appScreen=$('app'),email=$('email'),senha=$('senha'),entrar=$('entrar');
const loginStatus=$('login-status'),saudacao=$('saudacao'),homeView=$('home-view'),sectionView=$('section-view');
const sectionTitle=$('section-title'),sectionSubtitle=$('section-subtitle'),dynamicForm=$('dynamic-form');
const listEl=$('items-list'),adminPanel=$('admin-panel'),roleBadge=$('role-badge'),sectionSpecial=$('section-special');
const saveBtn=$('salvar-item'),cancelEditBtn=$('cancelar-edicao');

let currentUser=null,currentUserData={},isAdmin=false,currentPage='inicio',editingId=null;
let usersCache=[],songsCache=[],repertoiresCache=[],agendasCache=[],scalesCache=[];
let notifUnsub=null,lastNotificationIds=new Set(),chatUnsub=null;
let calDate=new Date(),selectedDate=dateKey(new Date());

const simpleSections={
  avisos:{title:'Avisos',subtitle:'Comunicados para os integrantes.',collection:'avisos',fields:[['titulo','Título','text'],['mensagem','Mensagem','textarea']]},
  arquivos:{title:'Arquivos',subtitle:'Links para documentos, cifras e materiais.',collection:'arquivos',fields:[['nome','Nome do arquivo','text'],['link','Link do arquivo','url'],['descricao','Descrição','textarea']]},
  multitracks:{title:'Multitracks',subtitle:'Organize links das multitracks do ministério.',collection:'multitracks',fields:[['musica','Música','text'],['tom','Tom','text'],['link','Link da multitrack','url'],['observacoes','Observações','textarea']]},
  links:{title:'Links Úteis',subtitle:'Links importantes para a equipe.',collection:'links',fields:[['nome','Nome','text'],['link','Endereço do link','url'],['descricao','Descrição','textarea']]}
};

function msg(text,error=false){loginStatus.textContent=text;loginStatus.className=error?'hint error':'hint';}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
function escapeAttr(v=''){return escapeHtml(v);}
function dateBR(v){if(!v)return '';const [y,m,d]=String(v).split('-');return d&&m&&y?`${d}/${m}/${y}`:v;}
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function createdMs(x){return x?.criadoEm?.seconds?x.criadoEm.seconds*1000:0;}
function byCreatedDesc(a,b){return createdMs(b)-createdMs(a);}
function userName(id){const u=usersCache.find(x=>x.id===id);return u?.nome||u?.email||id||'Integrante';}
function songById(id){return songsCache.find(s=>s.id===id);}
function repById(id){return repertoiresCache.find(r=>r.id===id);}
function safeUrl(url){return /^https?:\/\//i.test(url||'')?url:'';}
function fmtTs(ts){if(!ts?.toDate)return '';try{return ts.toDate().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return '';}}

async function safeDocs(name){
  try{const snap=await getDocs(collection(db,name));return snap.docs.map(d=>({id:d.id,...d.data()}));}
  catch(e){console.error('Firestore',name,e);return [];}
}
async function refreshCaches(){
  const [u,m,r,a,s]=await Promise.all([safeDocs('usuarios'),safeDocs('musicas'),safeDocs('repertorios'),safeDocs('agenda'),safeDocs('escalas')]);
  usersCache=u;songsCache=m;repertoiresCache=r;agendasCache=a;scalesCache=s;
}

entrar.addEventListener('click',async()=>{
  if(!email.value.trim()||!senha.value){msg('Digite seu e-mail e sua senha.',true);return;}
  entrar.disabled=true;msg('Entrando...');
  try{await signInWithEmailAndPassword(auth,email.value.trim(),senha.value);senha.value='';}
  catch(e){const map={'auth/invalid-credential':'E-mail ou senha incorretos.','auth/invalid-email':'Digite um e-mail válido.','auth/too-many-requests':'Muitas tentativas. Aguarde um pouco.','auth/network-request-failed':'Sem conexão com a internet.'};msg(map[e.code]||'Não foi possível entrar.',true);}
  finally{entrar.disabled=false;}
});
senha.addEventListener('keydown',e=>{if(e.key==='Enter')entrar.click();});
$('sair').addEventListener('click',async()=>{try{window.MVLOneSignal?.logout();}catch{}await signOut(auth);});
$('voltar').addEventListener('click',()=>{if(chatUnsub){chatUnsub();chatUnsub=null;}goHome();});
cancelEditBtn.addEventListener('click',resetEditor);
$('notif-bell').addEventListener('click',()=>openSection('notificacoes'));

document.querySelectorAll('.menu-card,.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{const p=btn.dataset.page;if(p==='inicio')goHome();else openSection(p);}));

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(!user){if(notifUnsub){notifUnsub();notifUnsub=null;}if(chatUnsub){chatUnsub();chatUnsub=null;}appScreen.classList.add('hide');login.classList.remove('hide');msg('');return;}
  login.classList.add('hide');appScreen.classList.remove('hide');
  const userRef=doc(db,'usuarios',user.uid);let snap=await getDoc(userRef);
  if(!snap.exists()){
    await setDoc(userRef,{email:user.email,nome:user.displayName||'',funcao:'',role:'member',mustChangePassword:true,criadoEm:serverTimestamp()});
    snap=await getDoc(userRef);
  }
  currentUserData=snap.data()||{};isAdmin=currentUserData.role==='admin';
  await setDoc(userRef,{email:user.email,ultimoAcesso:serverTimestamp()},{merge:true}).catch(()=>{});
  updateRoleUI();saudacao.textContent='Olá, '+(currentUserData.nome||user.displayName||user.email.split('@')[0])+'!';
  await refreshCaches();bindNotifications();identifyOneSignal();await renderNextScale();goHome();
  if(currentUserData.mustChangePassword===true)showPasswordModal();
});

function identifyOneSignal(){
  const run=()=>{try{const os=window.MVLOneSignal;if(!os||!currentUser)return;os.login(currentUser.uid);os.User.addTags({role:isAdmin?'admin':'member',mvl:'true'});}catch(e){console.warn('OneSignal user',e);}};
  if(window.MVLOneSignal)run();else window.addEventListener('mvl-onesignal-ready',run,{once:true});
}
function updateRoleUI(){roleBadge.textContent=isAdmin?'Administrador':'Integrante';roleBadge.classList.toggle('admin',isAdmin);}
function goHome(){currentPage='inicio';editingId=null;homeView.classList.remove('hide');sectionView.classList.add('hide');setActiveNav('inicio');renderNextScale();}
function setActiveNav(page){document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));}
function showSectionHeader(title,subtitle){sectionTitle.textContent=title;sectionSubtitle.textContent=subtitle;}
function resetEditor(){editingId=null;cancelEditBtn.classList.add('hide');saveBtn.textContent='Salvar';openSection(currentPage);}

async function openSection(page){
  if(chatUnsub){chatUnsub();chatUnsub=null;}
  currentPage=page;editingId=null;homeView.classList.add('hide');sectionView.classList.remove('hide');setActiveNav(page);
  sectionSpecial.innerHTML='';dynamicForm.innerHTML='';listEl.innerHTML='';cancelEditBtn.classList.add('hide');saveBtn.textContent='Salvar';
  if(simpleSections[page])return renderSimpleSection(page);
  if(page==='musicas')return renderSongs();if(page==='escalas')return renderScales();if(page==='repertorio')return renderRepertoires();
  if(page==='agenda')return renderAgenda();if(page==='calendario')return renderCalendar();if(page==='comunicacao')return renderCommunication();
  if(page==='perfil')return renderProfile();if(page==='membros')return renderMembers();if(page==='notificacoes')return renderNotifications();
}

function makeField(key,label,type,value=''){if(type==='textarea')return `<textarea id="f-${key}" placeholder="${escapeAttr(label)}">${escapeHtml(value)}</textarea>`;return `<input id="f-${key}" type="${type}" placeholder="${escapeAttr(label)}" value="${escapeAttr(value)}">`;}
function collectFields(fields){const data={};for(const [key] of fields)data[key]=($('f-'+key)?.value||'').trim();return data;}
function renderValue(v){if(typeof v==='string'&&safeUrl(v))return `<a class="link-btn" href="${escapeAttr(v)}" target="_blank" rel="noopener">Abrir link</a>`;return escapeHtml(v);}

async function renderSimpleSection(page){
  const cfg=simpleSections[page];showSectionHeader(cfg.title,cfg.subtitle);adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){$('form-title').textContent='Adicionar';dynamicForm.innerHTML='<div class="form-grid">'+cfg.fields.map(([k,l,t])=>makeField(k,l,t)).join('')+'</div>';saveBtn.onclick=()=>saveSimple(cfg);}
  await loadSimpleItems(cfg);
}
async function saveSimple(cfg){
  if(!isAdmin)return;const data=collectFields(cfg.fields);if(!Object.values(data).some(Boolean)){alert('Preencha pelo menos um campo.');return;}
  saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,cfg.collection,editingId),{...data,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else await addDoc(collection(db,cfg.collection),{...data,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});await renderSimpleSection(currentPage);}catch(e){console.error(e);alert('Não foi possível salvar.');}finally{saveBtn.disabled=false;}
}
async function loadSimpleItems(cfg){
  const items=(await safeDocs(cfg.collection)).sort(byCreatedDesc);listEl.innerHTML='';if(!items.length){listEl.innerHTML='<div class="empty">Nenhum item cadastrado ainda.</div>';return;}
  for(const item of items){const values=cfg.fields.map(([k,l])=>[l,item[k]]).filter(([,v])=>v);const primary=values[0]?.[1]||cfg.title;const rest=values.slice(1).map(([l,v])=>`<div class="item-meta"><b>${escapeHtml(l)}:</b> ${renderValue(v)}</div>`).join('');const card=document.createElement('div');card.className='item-card';card.innerHTML=`<h3>${escapeHtml(primary)}</h3>${rest}${isAdmin?'<div class="item-actions"><button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button></div>':''}`;
    if(isAdmin){card.querySelector('.edit-btn').onclick=()=>{editingId=item.id;$('form-title').textContent='Editar';saveBtn.textContent='Atualizar';cancelEditBtn.classList.remove('hide');dynamicForm.innerHTML='<div class="form-grid">'+cfg.fields.map(([k,l,t])=>makeField(k,l,t,item[k]||'')).join('')+'</div>';saveBtn.onclick=()=>saveSimple(cfg);window.scrollTo({top:0,behavior:'smooth'});};card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir este item?')){await deleteDoc(doc(db,cfg.collection,item.id));renderSimpleSection(currentPage);}};}
    listEl.appendChild(card);
  }
}

// MÚSICAS + VERSÕES POR CANTOR/TOM
async function renderSongs(editItem=null){
  showSectionHeader('Músicas','Cadastre uma música uma única vez e registre versões por cantor e tom.');songsCache=await safeDocs('musicas');usersCache=await safeDocs('usuarios');adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){$('form-title').textContent=editItem?'Editar música':'Nova música';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';
    const d=editItem||{};dynamicForm.innerHTML=`<div class="form-grid">
      <input id="song-title" placeholder="Título da música" value="${escapeAttr(d.titulo||'')}">
      <input id="song-artist" placeholder="Artista / referência" value="${escapeAttr(d.artistaReferencia||d.artista||'')}">
      <input id="song-key" placeholder="Tom original" value="${escapeAttr(d.tomOriginal||d.tom||'')}">
      <input id="song-listen" type="url" placeholder="Link para ouvir (YouTube etc.)" value="${escapeAttr(d.ouvirLink||d.link||'')}">
      <input id="song-chart" type="url" placeholder="Link da cifra no Google Drive" value="${escapeAttr(d.cifraLink||'')}">
      <input id="song-multi" type="url" placeholder="Link da multitrack" value="${escapeAttr(d.multitrackLink||'')}">
      <textarea id="song-note" placeholder="Observações">${escapeHtml(d.observacoes||'')}</textarea>
      <div class="subpanel"><div class="subpanel-head"><b>Versões do MVL</b><button id="add-version" type="button" class="secondary small-btn">+ Cantor / tom</button></div><div id="version-list"></div></div>
    </div>`;renderVersionRows(d.versoes||[]);$('add-version').onclick=()=>addVersionRow();saveBtn.onclick=saveSong;}
  listEl.innerHTML='';if(!songsCache.length){listEl.innerHTML='<div class="empty">Nenhuma música cadastrada.</div>';return;}
  songsCache.sort((a,b)=>(a.titulo||'').localeCompare(b.titulo||''));
  for(const s of songsCache){const card=document.createElement('div');card.className='item-card';const versions=(s.versoes||[]).map(v=>`${v.cantorNome||userName(v.cantorId)} — ${v.tom||'tom não informado'}`).join(' • ');card.innerHTML=`<h3>🎵 ${escapeHtml(s.titulo||'Sem título')}</h3><div class="item-meta">${escapeHtml(s.artistaReferencia||s.artista||'')}</div><div class="item-meta"><b>Tom original:</b> ${escapeHtml(s.tomOriginal||s.tom||'—')}</div>${versions?`<div class="item-meta"><b>Versões MVL:</b> ${escapeHtml(versions)}</div>`:''}<div class="item-actions">${safeUrl(s.ouvirLink||s.link)?`<a class="link-btn" href="${escapeAttr(s.ouvirLink||s.link)}" target="_blank" rel="noopener">▶️ Ouvir</a>`:''}${safeUrl(s.cifraLink)?`<a class="link-btn" href="${escapeAttr(s.cifraLink)}" target="_blank" rel="noopener">📄 Cifra</a>`:''}${safeUrl(s.multitrackLink)?`<a class="link-btn" href="${escapeAttr(s.multitrackLink)}" target="_blank" rel="noopener">🎚️ Multitrack</a>`:''}${isAdmin?'<button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button>':''}</div>`;
    if(isAdmin){card.querySelector('.edit-btn').onclick=()=>renderSongs(s);card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir esta música?')){await deleteDoc(doc(db,'musicas',s.id));renderSongs();}};}listEl.appendChild(card);}
}
function renderVersionRows(rows){const el=$('version-list');el.innerHTML='';(rows.length?rows:[{}]).forEach(addVersionRow);}
function addVersionRow(v={}){const el=$('version-list');if(!el)return;const row=document.createElement('div');row.className='version-row';row.innerHTML=`<select class="v-singer"><option value="">Selecione o cantor</option>${usersCache.map(u=>`<option value="${u.id}" ${v.cantorId===u.id?'selected':''}>${escapeHtml(u.nome||u.email||u.id)}</option>`).join('')}</select><input class="v-key" placeholder="Tom" value="${escapeAttr(v.tom||'')}"><input class="v-chart" type="url" placeholder="Cifra específica (opcional)" value="${escapeAttr(v.cifraLink||'')}"><input class="v-listen" type="url" placeholder="Link para ouvir (opcional)" value="${escapeAttr(v.ouvirLink||'')}"><input class="v-multi" type="url" placeholder="Multitrack (opcional)" value="${escapeAttr(v.multitrackLink||'')}"><button type="button" class="danger remove-version">Remover</button>`;row.querySelector('.remove-version').onclick=()=>row.remove();el.appendChild(row);}
async function saveSong(){
  const titulo=$('song-title').value.trim();if(!titulo){alert('Informe o título da música.');return;}
  const versoes=[...document.querySelectorAll('.version-row')].map(r=>{const cantorId=r.querySelector('.v-singer').value;return {cantorId,cantorNome:cantorId?userName(cantorId):'',tom:r.querySelector('.v-key').value.trim(),cifraLink:r.querySelector('.v-chart').value.trim(),ouvirLink:r.querySelector('.v-listen').value.trim(),multitrackLink:r.querySelector('.v-multi').value.trim()};}).filter(v=>v.cantorId||v.tom||v.cifraLink||v.ouvirLink||v.multitrackLink);
  const data={titulo,artistaReferencia:$('song-artist').value.trim(),tomOriginal:$('song-key').value.trim(),ouvirLink:$('song-listen').value.trim(),cifraLink:$('song-chart').value.trim(),multitrackLink:$('song-multi').value.trim(),observacoes:$('song-note').value.trim(),versoes};
  saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'musicas',editingId),{...data,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else await addDoc(collection(db,'musicas'),{...data,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});editingId=null;await refreshCaches();renderSongs();}catch(e){console.error(e);alert('Não foi possível salvar a música.');}finally{saveBtn.disabled=false;}
}

// REPERTÓRIO DETALHADO
async function renderRepertoires(editItem=null){
  showSectionHeader('Repertório','Abra um repertório para ver músicas, cantores, tons, cifras e links.');await refreshCaches();adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){$('form-title').textContent=editItem?'Editar repertório':'Novo repertório';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';const d=editItem||{};dynamicForm.innerHTML=`<div class="form-grid">
      <input id="rep-name" placeholder="Nome do repertório / Culto" value="${escapeAttr(d.nome||'')}">
      <input id="rep-date" type="date" value="${escapeAttr(d.data||'')}">
      <textarea id="rep-note" placeholder="Observações">${escapeHtml(d.observacoes||'')}</textarea>
      <div class="subpanel"><b>Selecione as músicas</b><div class="multi-list" id="rep-song-options">${songsCache.length?songsCache.map(s=>`<label class="multi-item"><input class="rep-check" type="checkbox" value="${s.id}"> ${escapeHtml(s.titulo||'Sem título')}</label>`).join(''):'<span class="muted">Cadastre músicas primeiro.</span>'}</div><div id="rep-config-list" class="rep-config-list"></div></div>
    </div>`;wireRepSelector(d.musicaItens||legacyRepItems(d));saveBtn.onclick=saveRepertoire;}
  listEl.innerHTML='';if(!repertoiresCache.length){listEl.innerHTML='<div class="empty">Nenhum repertório cadastrado.</div>';return;}
  repertoiresCache.sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  for(const r of repertoiresCache){const card=document.createElement('div');card.className='item-card';const count=(r.musicaItens||legacyRepItems(r)).length;card.innerHTML=`<h3>🎵 ${escapeHtml(r.nome||'Repertório')}</h3><div class="item-meta">${dateBR(r.data)}</div><div class="item-meta">${count} música${count===1?'':'s'}</div><div class="item-actions"><button class="confirm-btn open-rep">Abrir repertório</button>${isAdmin?'<button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button>':''}</div>`;card.querySelector('.open-rep').onclick=()=>openRepertoireDetail(r.id,'repertorio');if(isAdmin){card.querySelector('.edit-btn').onclick=()=>renderRepertoires(r);card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir repertório?')){await deleteDoc(doc(db,'repertorios',r.id));await refreshCaches();renderRepertoires();}};}listEl.appendChild(card);}
}
function legacyRepItems(r){return (r.musicaIds||[]).map((id,i)=>{const s=songById(id)||{};return {musicaId:id,cantorId:'',cantorNome:'',tom:s.tomOriginal||s.tom||'',cifraLink:s.cifraLink||'',ouvirLink:s.ouvirLink||s.link||'',multitrackLink:s.multitrackLink||'',ordem:i+1};});}
function wireRepSelector(existing=[]){
  const existingMap=new Map(existing.map(i=>[i.musicaId,i]));document.querySelectorAll('.rep-check').forEach(ch=>{if(existingMap.has(ch.value))ch.checked=true;ch.onchange=renderRepConfigs;});renderRepConfigs(existingMap);
}
function renderRepConfigs(existingMap){
  const map=existingMap instanceof Map?existingMap:new Map();const host=$('rep-config-list');if(!host)return;host.innerHTML='';const selected=[...document.querySelectorAll('.rep-check:checked')];
  selected.forEach((ch,idx)=>{const s=songById(ch.value)||{};const old=map.get(ch.value)||{};const row=document.createElement('div');row.className='rep-config';row.dataset.songId=ch.value;const versions=s.versoes||[];row.innerHTML=`<div class="rep-order">${idx+1}</div><div class="rep-config-body"><b>${escapeHtml(s.titulo||'Música')}</b><select class="rep-version"><option value="">Sem cantor específico</option>${versions.map((v,i)=>`<option value="${i}" ${old.cantorId===v.cantorId?'selected':''}>${escapeHtml(v.cantorNome||userName(v.cantorId))} — ${escapeHtml(v.tom||'sem tom')}</option>`).join('')}</select><input class="rep-singer" placeholder="Cantor (opcional)" value="${escapeAttr(old.cantorNome||'')}"><input class="rep-key" placeholder="Tom para este culto" value="${escapeAttr(old.tom||s.tomOriginal||s.tom||'')}"><input class="rep-chart" type="url" placeholder="Cifra Google Drive" value="${escapeAttr(old.cifraLink||s.cifraLink||'')}"><input class="rep-listen" type="url" placeholder="Link para ouvir" value="${escapeAttr(old.ouvirLink||s.ouvirLink||s.link||'')}"><input class="rep-multi" type="url" placeholder="Multitrack" value="${escapeAttr(old.multitrackLink||s.multitrackLink||'')}"></div>`;
    const sel=row.querySelector('.rep-version');sel.onchange=()=>{const v=versions[Number(sel.value)];if(!v)return;row.querySelector('.rep-singer').value=v.cantorNome||userName(v.cantorId);row.querySelector('.rep-key').value=v.tom||s.tomOriginal||s.tom||'';row.querySelector('.rep-chart').value=v.cifraLink||s.cifraLink||'';row.querySelector('.rep-listen').value=v.ouvirLink||s.ouvirLink||s.link||'';row.querySelector('.rep-multi').value=v.multitrackLink||s.multitrackLink||'';row.dataset.cantorId=v.cantorId||'';};host.appendChild(row);});
}
async function saveRepertoire(){
  const nome=$('rep-name').value.trim(),data=$('rep-date').value,observacoes=$('rep-note').value.trim();if(!nome){alert('Informe o nome do repertório.');return;}
  const musicaItens=[...document.querySelectorAll('.rep-config')].map((r,i)=>({musicaId:r.dataset.songId,cantorId:r.dataset.cantorId||'',cantorNome:r.querySelector('.rep-singer').value.trim(),tom:r.querySelector('.rep-key').value.trim(),cifraLink:r.querySelector('.rep-chart').value.trim(),ouvirLink:r.querySelector('.rep-listen').value.trim(),multitrackLink:r.querySelector('.rep-multi').value.trim(),ordem:i+1}));
  const payload={nome,data,observacoes,musicaItens,musicaIds:musicaItens.map(i=>i.musicaId)};saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'repertorios',editingId),{...payload,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else await addDoc(collection(db,'repertorios'),{...payload,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});editingId=null;await refreshCaches();renderRepertoires();}catch(e){console.error(e);alert('Não foi possível salvar o repertório.');}finally{saveBtn.disabled=false;}
}
async function openRepertoireDetail(repId,backPage='repertorio'){
  await refreshCaches();const r=repById(repId);if(!r){alert('Repertório não encontrado.');return;}currentPage='rep-detalhe';homeView.classList.add('hide');sectionView.classList.remove('hide');showSectionHeader(r.nome||'Repertório',`${dateBR(r.data)} • músicas e links`);adminPanel.classList.add('hide');sectionSpecial.innerHTML=`<button id="back-rep" class="back-inline">← Voltar para ${backPage==='escalas'?'escalas':'repertórios'}</button>${r.observacoes?`<div class="readonly-note">${escapeHtml(r.observacoes)}</div>`:''}`;$('back-rep').onclick=()=>openSection(backPage);listEl.innerHTML='';const items=(r.musicaItens||legacyRepItems(r)).sort((a,b)=>(a.ordem||0)-(b.ordem||0));if(!items.length){listEl.innerHTML='<div class="empty">Nenhuma música neste repertório.</div>';return;}
  items.forEach((it,i)=>{const s=songById(it.musicaId)||{};const card=document.createElement('div');card.className='item-card repertoire-song';card.innerHTML=`<div class="song-number">${i+1}</div><div><h3>${escapeHtml(s.titulo||'Música')}</h3>${it.cantorNome?`<div class="item-meta">🎤 ${escapeHtml(it.cantorNome)}</div>`:''}<div class="item-meta"><b>Tom:</b> ${escapeHtml(it.tom||s.tomOriginal||s.tom||'—')}</div>${s.observacoes?`<div class="item-meta">${escapeHtml(s.observacoes)}</div>`:''}<div class="item-actions">${safeUrl(it.ouvirLink)?`<a class="link-btn" href="${escapeAttr(it.ouvirLink)}" target="_blank" rel="noopener">▶️ Ouvir</a>`:''}${safeUrl(it.cifraLink)?`<a class="link-btn" href="${escapeAttr(it.cifraLink)}" target="_blank" rel="noopener">📄 Cifra</a>`:''}${safeUrl(it.multitrackLink)?`<a class="link-btn" href="${escapeAttr(it.multitrackLink)}" target="_blank" rel="noopener">🎚️ Multitrack</a>`:''}</div></div>`;listEl.appendChild(card);});
}

// ESCALAS + CHAT
async function renderScales(editItem=null){
  showSectionHeader('Escalas','Integrantes, repertório, confirmação de presença e chat da escala.');await refreshCaches();adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){$('form-title').textContent=editItem?'Editar escala':'Nova escala';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';const d=editItem||{};dynamicForm.innerHTML=`<div class="form-grid"><input id="scale-date" type="date" value="${escapeAttr(d.data||'')}"><input id="scale-time" type="time" value="${escapeAttr(d.horario||'')}"><input id="scale-event" placeholder="Culto / Evento" value="${escapeAttr(d.evento||'')}"><select id="scale-rep"><option value="">Sem repertório vinculado</option>${repertoiresCache.map(r=>`<option value="${r.id}" ${d.repertorioId===r.id?'selected':''}>${escapeHtml(r.nome||'Repertório')}</option>`).join('')}</select><div><small class="muted">Integrantes escalados</small><div class="multi-list" id="member-options">${usersCache.map(u=>`<label class="multi-item"><input type="checkbox" value="${u.id}" ${(d.integranteIds||[]).includes(u.id)?'checked':''}> ${escapeHtml(u.nome||u.email||u.id)} ${u.funcao?`— ${escapeHtml(u.funcao)}`:''}</label>`).join('')}</div></div><label class="checkbox-row"><input id="notify-scaled" type="checkbox" ${editItem?'':'checked'}><span><b>Notificar integrantes no MVL</b><br><small class="muted">Cria avisos internos para os selecionados.</small></span></label></div>`;saveBtn.onclick=saveScale;}
  const visible=(isAdmin?scalesCache:scalesCache.filter(s=>(s.integranteIds||[]).includes(currentUser.uid))).sort((a,b)=>(b.data+(b.horario||'')).localeCompare(a.data+(a.horario||'')));listEl.innerHTML='';if(!visible.length){listEl.innerHTML=`<div class="empty">${isAdmin?'Nenhuma escala cadastrada.':'Você ainda não está em nenhuma escala.'}</div>`;return;}for(const s of visible)listEl.appendChild(await buildScaleCard(s));
}
async function saveScale(){
  const integranteIds=[...document.querySelectorAll('#member-options input:checked')].map(x=>x.value);const data=$('scale-date').value,horario=$('scale-time').value,evento=$('scale-event').value.trim(),repertorioId=$('scale-rep').value;if(!data||!evento){alert('Informe a data e o evento.');return;}const payload={data,horario,evento,repertorioId,integranteIds};let scaleId=editingId;
  saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'escalas',editingId),{...payload,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else{const ref=await addDoc(collection(db,'escalas'),{...payload,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});scaleId=ref.id;}if($('notify-scaled').checked&&integranteIds.length)await createNotifications(integranteIds,'Nova escala MVL',`${evento} — ${dateBR(data)}${horario?' às '+horario:''}.`,'escala',scaleId);editingId=null;await refreshCaches();renderScales();}catch(e){console.error(e);alert('Não foi possível salvar a escala.');}finally{saveBtn.disabled=false;}
}
async function buildScaleCard(s){
  const card=document.createElement('div');card.className='item-card';const members=(s.integranteIds||[]).map(userName);const rep=repById(s.repertorioId);let confirmation='';if(!isAdmin&&(s.integranteIds||[]).includes(currentUser.uid)){const c=await getDoc(doc(db,'escalas',s.id,'confirmacoes',currentUser.uid)).catch(()=>null);const st=c?.exists()?c.data().status:'';confirmation=st==='confirmado'?'<span class="status-pill ok">Presença confirmada</span>':st==='nao_posso'?'<span class="status-pill no">Não poderá participar</span>':'<span class="status-pill">Aguardando confirmação</span>';}
  card.innerHTML=`<h3>${escapeHtml(s.evento||'Escala')}</h3><div class="item-meta"><b>Data:</b> ${dateBR(s.data)} ${escapeHtml(s.horario||'')}</div>${isAdmin?`<div class="item-meta"><b>Escalados:</b> ${escapeHtml(members.join(', ')||'Nenhum')}</div>`:''}${rep?`<div class="item-meta"><b>Repertório:</b> ${escapeHtml(rep.nome||'')}</div>`:''}${confirmation}<div class="item-actions">${rep?'<button class="confirm-btn rep-btn">🎵 Ver repertório</button>':''}<button class="edit-btn chat-btn">💬 Chat da escala</button>${!isAdmin&&s.integranteIds?.includes(currentUser.uid)?'<button class="confirm-btn yes-btn">Confirmar presença</button><button class="decline-btn no-btn">Não poderei</button>':''}${isAdmin?'<button class="edit-btn edit-scale">Editar</button><button class="delete-btn delete-scale">Excluir</button>':''}</div>`;
  card.querySelector('.rep-btn')?.addEventListener('click',()=>openRepertoireDetail(s.repertorioId,'escalas'));card.querySelector('.chat-btn').onclick=()=>openScaleChat(s.id);card.querySelector('.yes-btn')?.addEventListener('click',()=>setConfirmation(s,'confirmado'));card.querySelector('.no-btn')?.addEventListener('click',()=>setConfirmation(s,'nao_posso'));card.querySelector('.edit-scale')?.addEventListener('click',()=>renderScales(s));card.querySelector('.delete-scale')?.addEventListener('click',async()=>{if(confirm('Excluir escala?')){await deleteScaleCascade(s.id);await refreshCaches();renderScales();}});return card;
}
async function deleteScaleCascade(scaleId){
  const batch=writeBatch(db);const conf=await getDocs(collection(db,'escalas',scaleId,'confirmacoes')).catch(()=>null);conf?.docs.forEach(d=>batch.delete(d.ref));const chat=await getDocs(collection(db,'escalas',scaleId,'chat')).catch(()=>null);chat?.docs.forEach(d=>batch.delete(d.ref));batch.delete(doc(db,'escalas',scaleId));await batch.commit();
}
async function setConfirmation(scale,status){
  try{await setDoc(doc(db,'escalas',scale.id,'confirmacoes',currentUser.uid),{status,usuarioId:currentUser.uid,usuarioNome:currentUserData.nome||currentUser.email,atualizadoEm:serverTimestamp()},{merge:true});const admins=usersCache.filter(u=>u.role==='admin').map(u=>u.id).filter(id=>id!==currentUser.uid);if(admins.length)await createNotifications(admins,'Resposta de escala',`${currentUserData.nome||currentUser.email} ${status==='confirmado'?'confirmou presença':'informou que não poderá participar'} em ${scale.evento}.`,'confirmacao_escala',scale.id);alert(status==='confirmado'?'Presença confirmada.':'Resposta registrada.');renderScales();}catch(e){console.error(e);alert('Não foi possível registrar sua resposta.');}
}
async function renderNextScale(){
  if(!currentUser)return;await refreshCaches();const today=dateKey(new Date());const mine=scalesCache.filter(s=>(s.integranteIds||[]).includes(currentUser.uid)&&s.data>=today).sort((a,b)=>(a.data+(a.horario||'')).localeCompare(b.data+(b.horario||'')))[0];const el=$('next-scale-content');if(!mine){el.innerHTML='<p class="muted">Nenhuma escala futura encontrada.</p>';return;}const rep=repById(mine.repertorioId);el.innerHTML=`<h3>${escapeHtml(mine.evento||'Escala')}</h3><p>${dateBR(mine.data)} ${escapeHtml(mine.horario||'')}</p>${rep?`<p class="muted">Repertório: ${escapeHtml(rep.nome||'')}</p><button id="home-rep" class="link-btn">Ver repertório</button>`:''}<button id="home-chat" class="link-btn">💬 Chat da escala</button>`;$('home-rep')?.addEventListener('click',()=>openRepertoireDetail(mine.repertorioId,'escalas'));$('home-chat').onclick=()=>openScaleChat(mine.id);
}
async function openScaleChat(scaleId){
  await refreshCaches();const scale=scalesCache.find(s=>s.id===scaleId);if(!scale){alert('Escala não encontrada.');return;}const allowed=isAdmin||(scale.integranteIds||[]).includes(currentUser.uid);if(!allowed){alert('Este chat é exclusivo para quem está nesta escala.');return;}currentPage='chat';homeView.classList.add('hide');sectionView.classList.remove('hide');showSectionHeader(`Chat • ${scale.evento}`,`${dateBR(scale.data)} ${scale.horario||''} • apenas integrantes da escala`);adminPanel.classList.add('hide');sectionSpecial.innerHTML=`<button id="chat-back" class="back-inline">← Voltar para escalas</button><div id="chat-list" class="chat-list"></div><div class="chat-compose"><textarea id="chat-input" placeholder="Digite uma dúvida, sugestão ou mensagem..."></textarea><button id="chat-send" class="primary">Enviar</button></div>`;listEl.innerHTML='';$('chat-back').onclick=()=>openSection('escalas');$('chat-send').onclick=()=>sendChat(scale);if(chatUnsub)chatUnsub();chatUnsub=onSnapshot(collection(db,'escalas',scaleId,'chat'),snap=>{const items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>createdMs(a)-createdMs(b));const box=$('chat-list');if(!box)return;box.innerHTML=items.length?'':'<div class="empty">Nenhuma mensagem ainda. Comece a conversa.</div>';items.forEach(m=>{const own=m.autorId===currentUser.uid;box.insertAdjacentHTML('beforeend',`<div class="chat-message ${own?'mine':''}"><b>${escapeHtml(m.autorNome||'Integrante')}</b><div>${escapeHtml(m.mensagem||'')}</div><small>${escapeHtml(fmtTs(m.criadoEm))}</small></div>`);});box.scrollTop=box.scrollHeight;},e=>console.error('chat',e));
}
async function sendChat(scale){
  const input=$('chat-input'),mensagem=input.value.trim();if(!mensagem)return;input.value='';try{await addDoc(collection(db,'escalas',scale.id,'chat'),{autorId:currentUser.uid,autorNome:currentUserData.nome||currentUser.email,mensagem,criadoEm:serverTimestamp()});const recipients=[...(scale.integranteIds||[]),...usersCache.filter(u=>u.role==='admin').map(u=>u.id)].filter((v,i,a)=>v!==currentUser.uid&&a.indexOf(v)===i);if(recipients.length)await createNotifications(recipients,`Chat • ${scale.evento}`,`${currentUserData.nome||currentUser.email}: ${mensagem.slice(0,120)}`,'chat_escala',scale.id);}catch(e){console.error(e);alert('Não foi possível enviar a mensagem.');}
}

// AGENDA
async function renderAgenda(editItem=null){
  showSectionHeader('Agenda','Cultos, ensaios, reuniões e eventos.');agendasCache=await safeDocs('agenda');usersCache=await safeDocs('usuarios');adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){$('form-title').textContent=editItem?'Editar evento':'Novo evento';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';const d=editItem||{};dynamicForm.innerHTML=`<div class="form-grid"><input id="ag-date" type="date" value="${escapeAttr(d.data||'')}"><input id="ag-time" type="time" value="${escapeAttr(d.horario||'')}"><input id="ag-title" placeholder="Evento" value="${escapeAttr(d.titulo||'')}"><input id="ag-local" placeholder="Local" value="${escapeAttr(d.local||'')}"><textarea id="ag-note" placeholder="Observações">${escapeHtml(d.observacoes||'')}</textarea><select id="ag-target"><option value="todos" ${d.todos!==false?'selected':''}>Todos os integrantes</option><option value="especificos" ${d.todos===false?'selected':''}>Selecionar pessoas</option></select><div id="ag-member-box" class="multi-list ${d.todos===false?'':'hide'}">${usersCache.map(u=>`<label class="multi-item"><input type="checkbox" value="${u.id}" ${(d.destinatarios||[]).includes(u.id)?'checked':''}> ${escapeHtml(u.nome||u.email||u.id)}</label>`).join('')}</div><label class="checkbox-row"><input id="ag-notify" type="checkbox" ${editItem?'':'checked'}><span><b>Notificar no MVL</b><br><small class="muted">Cria avisos internos para os destinatários.</small></span></label></div>`;$('ag-target').onchange=()=>$('ag-member-box').classList.toggle('hide',$('ag-target').value!=='especificos');saveBtn.onclick=saveAgenda;}
  const visible=agendasCache.filter(a=>isAdmin||a.todos===true||(a.destinatarios||[]).includes(currentUser.uid)).sort((a,b)=>(b.data+(b.horario||'')).localeCompare(a.data+(a.horario||'')));listEl.innerHTML='';if(!visible.length){listEl.innerHTML='<div class="empty">Nenhum evento cadastrado.</div>';return;}visible.forEach(a=>{const card=document.createElement('div');card.className='item-card';card.innerHTML=`<h3>${escapeHtml(a.titulo||'Evento')}</h3><div class="item-meta">${dateBR(a.data)} ${escapeHtml(a.horario||'')}</div>${a.local?`<div class="item-meta">📍 ${escapeHtml(a.local)}</div>`:''}${a.observacoes?`<div class="item-meta">${escapeHtml(a.observacoes)}</div>`:''}${isAdmin?'<div class="item-actions"><button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button></div>':''}`;if(isAdmin){card.querySelector('.edit-btn').onclick=()=>renderAgenda(a);card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir evento?')){await deleteDoc(doc(db,'agenda',a.id));renderAgenda();}};}listEl.appendChild(card);});
}
async function saveAgenda(){
  const data=$('ag-date').value,horario=$('ag-time').value,titulo=$('ag-title').value.trim(),local=$('ag-local').value.trim(),observacoes=$('ag-note').value.trim(),todos=$('ag-target').value==='todos',destinatarios=todos?usersCache.map(u=>u.id):[...document.querySelectorAll('#ag-member-box input:checked')].map(x=>x.value);if(!data||!titulo){alert('Informe a data e o evento.');return;}const payload={data,horario,titulo,local,observacoes,todos,destinatarios:todos?[]:destinatarios};let refId=editingId;saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'agenda',editingId),{...payload,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else{const ref=await addDoc(collection(db,'agenda'),{...payload,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});refId=ref.id;}if($('ag-notify').checked&&destinatarios.length)await createNotifications(destinatarios,'Agenda MVL',`${titulo} — ${dateBR(data)}${horario?' às '+horario:''}.`,'agenda',refId);editingId=null;await refreshCaches();renderAgenda();}catch(e){console.error(e);alert('Não foi possível salvar o evento.');}finally{saveBtn.disabled=false;}
}

// CALENDÁRIO
async function renderCalendar(){
  showSectionHeader('Calendário','Toque em um dia para ver as atividades.');adminPanel.classList.add('hide');await refreshCaches();sectionSpecial.innerHTML=`<div class="calendar-head"><button id="cal-prev">‹</button><div id="cal-title" class="calendar-title"></div><button id="cal-next">›</button></div><div class="calendar-grid" id="calendar-grid"></div><div id="day-events" class="day-events"></div>`;$('cal-prev').onclick=()=>{calDate=new Date(calDate.getFullYear(),calDate.getMonth()-1,1);drawCalendar();};$('cal-next').onclick=()=>{calDate=new Date(calDate.getFullYear(),calDate.getMonth()+1,1);drawCalendar();};drawCalendar();
}
function eventDatesForUser(){const ag=agendasCache.filter(a=>isAdmin||a.todos===true||(a.destinatarios||[]).includes(currentUser.uid)).map(a=>({...a,kind:'Agenda'}));const sc=(isAdmin?scalesCache:scalesCache.filter(s=>(s.integranteIds||[]).includes(currentUser.uid))).map(s=>({...s,titulo:s.evento,kind:'Escala'}));return [...ag,...sc];}
function drawCalendar(){const events=eventDatesForUser(),y=calDate.getFullYear(),m=calDate.getMonth();$('cal-title').textContent=calDate.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});const grid=$('calendar-grid'),weekdays=['D','S','T','Q','Q','S','S'];grid.innerHTML=weekdays.map(w=>`<div class="cal-week">${w}</div>`).join('');const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=dateKey(d),has=events.some(e=>e.data===key),b=document.createElement('button');b.className='cal-day';if(d.getMonth()!==m)b.classList.add('out');if(key===dateKey(new Date()))b.classList.add('today');if(key===selectedDate)b.classList.add('selected');b.innerHTML=`${d.getDate()}${has?'<span class="cal-dot"></span>':''}`;b.onclick=()=>{selectedDate=key;drawCalendar();};grid.appendChild(b);}renderDayEvents(events.filter(e=>e.data===selectedDate));}
function renderDayEvents(events){const el=$('day-events');el.innerHTML=`<h3>${dateBR(selectedDate)}</h3>`;if(!events.length){el.innerHTML+='<div class="empty">Nenhuma atividade neste dia.</div>';return;}events.forEach(e=>el.innerHTML+=`<div class="item-card"><span class="status-pill">${escapeHtml(e.kind)}</span><h3>${escapeHtml(e.titulo||e.evento||'Atividade')}</h3><div class="item-meta">${escapeHtml(e.horario||'')}</div>${e.local?`<div class="item-meta">📍 ${escapeHtml(e.local)}</div>`:''}</div>`);}

// COMUNICAÇÃO PRIVADA
async function renderCommunication(){
  showSectionHeader('Comunicação','Mensagens privadas entre integrantes e liderança.');adminPanel.classList.remove('hide');$('form-title').textContent=isAdmin?'Nova mensagem':'Enviar mensagem à liderança';dynamicForm.innerHTML=`<div class="form-grid"><select id="msg-type"><option>Falta / ausência</option><option>Dúvida</option><option>Pedido</option><option>Observação</option><option>Outro</option></select><textarea id="msg-body" placeholder="Escreva sua mensagem"></textarea></div>`;saveBtn.onclick=sendMessage;await loadMessages();
}
async function sendMessage() {
  const tipo = $('msg-type').value;
  const mensagem = $('msg-body').value.trim();

  if (!mensagem) {
    alert('Escreva a mensagem.');
    return;
  }

  try {
    await addDoc(collection(db, 'mensagens'), {
      autorId: currentUser.uid,
      autorNome: currentUserData.nome || currentUser.email,
      autorEmail: currentUser.email,
      tipo,
      mensagem,
      status: 'nova',
      criadoEm: serverTimestamp()
    });

    if (!isAdmin) {
      const admins = usersCache
        .filter(u => u.role === 'admin')
        .map(u => u.id);

      if (admins.length) {
        await createNotifications(
          admins,
          'Nova mensagem à liderança',
          `${currentUserData.nome || currentUser.email}: ${mensagem.slice(0, 140)}`,
          'mensagem',
          ''
        );
      }

      await enviarPushMVL(
        'mensagem_admin',
        'Nova mensagem no MVL',
        `${currentUserData.nome || currentUser.email}: ${mensagem.slice(0, 140)}`
      );
    }

    $('msg-body').value = '';

    alert('Mensagem enviada.');

    await loadMessages();

  } catch (e) {
    console.error(e);
    alert('Não foi possível enviar a mensagem.');
  }
}
async function loadMessages(){const all=await safeDocs('mensagens'),visible=(isAdmin?all:all.filter(m=>m.autorId===currentUser.uid)).sort(byCreatedDesc);listEl.innerHTML='';if(!visible.length){listEl.innerHTML='<div class="empty">Nenhuma mensagem ainda.</div>';return;}visible.forEach(m=>{const card=document.createElement('div');card.className='item-card';card.innerHTML=`<span class="status-pill ${m.status==='nova'?'new':m.status==='resolvida'?'done':''}">${escapeHtml(m.status||'nova')}</span><h3>${escapeHtml(m.tipo||'Mensagem')}</h3>${isAdmin?`<div class="item-meta"><b>De:</b> ${escapeHtml(m.autorNome||m.autorEmail||'')}</div>`:''}<div class="item-meta">${escapeHtml(m.mensagem||'')}</div>${isAdmin?'<div class="item-actions"><button class="edit-btn">Marcar lida</button><button class="confirm-btn">Resolvida</button></div>':''}`;if(isAdmin){card.querySelector('.edit-btn').onclick=async()=>{await updateDoc(doc(db,'mensagens',m.id),{status:'lida',atualizadoEm:serverTimestamp()});loadMessages();};card.querySelector('.confirm-btn').onclick=async()=>{await updateDoc(doc(db,'mensagens',m.id),{status:'resolvida',atualizadoEm:serverTimestamp()});loadMessages();};}listEl.appendChild(card);});}

// NOTIFICAÇÕES INTERNAS: 1 DOCUMENTO POR DESTINATÁRIO
async function createNotifications(recipientIds,title,message,type,refId=''){
  const ids=[...new Set(recipientIds)].filter(Boolean);if(!ids.length)return;const batch=writeBatch(db);ids.forEach(uid=>{const ref=doc(collection(db,'notificacoes'));batch.set(ref,{destinatarioId:uid,remetenteId:currentUser.uid,titulo:title,mensagem:message,tipo,refId,lida:false,criadoEm:serverTimestamp()});});await batch.commit();
}
function bindNotifications(){
  if(notifUnsub)notifUnsub();const q=query(collection(db,'notificacoes'),where('destinatarioId','==',currentUser.uid));notifUnsub=onSnapshot(q,snap=>{const relevant=snap.docs.map(d=>({id:d.id,...d.data()})),unread=relevant.filter(n=>n.lida!==true);$('notif-count').textContent=String(unread.length);$('notif-count').classList.toggle('hide',unread.length===0);for(const n of unread){if(!lastNotificationIds.has(n.id)){lastNotificationIds.add(n.id);if(document.visibilityState==='visible')maybeBrowserNotify(n);}}},e=>console.error('notifications',e));
}
function maybeBrowserNotify(n){if(!('Notification'in window)||Notification.permission!=='granted')return;try{new Notification(n.titulo||'MVL',{body:n.mensagem||'',icon:'./mvl-icon-192-v4.png'});}catch{}}
async function requestNotifications(){
  try{const os=window.MVLOneSignal;if(!os){alert('O OneSignal ainda está carregando. Aguarde alguns segundos e tente novamente.');return;}if(!os.Notifications.isPushSupported()){alert('Este navegador não oferece suporte a Web Push.');return;}os.login(currentUser.uid);await os.Notifications.requestPermission();await os.User.PushSubscription.optIn();const ok=os.Notifications.permission&&os.User.PushSubscription.optedIn;if(ok)alert('Notificações do dispositivo ativadas.');else alert('A permissão não foi concedida. Verifique as permissões do navegador.');}catch(e){console.error('OneSignal permission',e);alert('Não foi possível ativar as notificações neste aparelho.');}
}
async function renderNotifications(){
  showSectionHeader('Notificações','Avisos recebidos pelo MVL.');adminPanel.classList.add('hide');sectionSpecial.innerHTML=`<div class="admin-panel"><h3>Notificações do dispositivo</h3><p class="muted">Ative o Web Push do OneSignal neste aparelho.</p><button id="enable-notif" class="secondary">Permitir notificações</button><p class="hint">A V9.2 já identifica cada usuário no OneSignal. O envio automático de push externo depende do emissor seguro, sem expor chave no GitHub.</p></div>`;$('enable-notif').onclick=requestNotifications;const q=query(collection(db,'notificacoes'),where('destinatarioId','==',currentUser.uid));let items=[];try{const snap=await getDocs(q);items=snap.docs.map(d=>({id:d.id,...d.data()})).sort(byCreatedDesc);}catch(e){console.error(e);}listEl.innerHTML='';if(!items.length){listEl.innerHTML='<div class="empty">Nenhuma notificação.</div>';return;}items.forEach(n=>{const card=document.createElement('div');card.className='item-card';card.innerHTML=`${!n.lida?'<span class="status-pill new">Nova</span>':''}<h3>${escapeHtml(n.titulo||'MVL')}</h3><div class="item-meta">${escapeHtml(n.mensagem||'')}</div>${!n.lida?'<div class="item-actions"><button class="edit-btn">Marcar como lida</button></div>':''}`;card.querySelector('.edit-btn')?.addEventListener('click',async()=>{await updateDoc(doc(db,'notificacoes',n.id),{lida:true,lidaEm:serverTimestamp()});renderNotifications();});listEl.appendChild(card);});
}

// MEMBROS E PERFIL
async function renderMembers(){showSectionHeader('Membros','Integrantes que já acessaram o MVL.');adminPanel.classList.add('hide');usersCache=await safeDocs('usuarios');listEl.innerHTML='';if(!usersCache.length){listEl.innerHTML='<div class="empty">Nenhum integrante registrado.</div>';return;}usersCache.sort((a,b)=>(a.nome||a.email||'').localeCompare(b.nome||b.email||'')).forEach(u=>{const card=document.createElement('div');card.className='item-card';card.innerHTML=`<h3>${escapeHtml(u.nome||u.email||'Integrante')}</h3><div class="item-meta">${escapeHtml(u.funcao||'Função não informada')}</div>${isAdmin?`<div class="item-meta">${escapeHtml(u.email||'')}</div><span class="status-pill">${u.role==='admin'?'Administrador':'Integrante'}</span>`:''}`;listEl.appendChild(card);});}
function renderProfile(){showSectionHeader('Meu Perfil','Atualize seus dados e sua senha.');adminPanel.classList.add('hide');const d=currentUserData||{};sectionSpecial.innerHTML=`<div class="admin-panel"><h3>Dados pessoais</h3><div class="form-grid"><input id="profile-name" placeholder="Nome" value="${escapeAttr(d.nome||'')}"><input id="profile-role" placeholder="Função / Instrumento" value="${escapeAttr(d.funcao||'')}"><input value="${escapeAttr(currentUser.email||'')}" disabled></div><div class="form-actions"><button id="save-profile" class="primary">Salvar perfil</button></div></div><div class="admin-panel"><h3>Alterar senha</h3><div class="form-grid"><input id="current-pass" type="password" placeholder="Senha atual"><input id="profile-new-pass" type="password" placeholder="Nova senha"><input id="profile-confirm-pass" type="password" placeholder="Confirmar nova senha"></div><div class="form-actions"><button id="change-pass" class="secondary">Alterar senha</button></div><p id="profile-pass-status" class="hint"></p></div>`;$('save-profile').onclick=saveProfile;$('change-pass').onclick=changePasswordFromProfile;}
async function saveProfile(){const nome=$('profile-name').value.trim(),funcao=$('profile-role').value.trim();try{await setDoc(doc(db,'usuarios',currentUser.uid),{nome,funcao,email:currentUser.email,atualizadoEm:serverTimestamp()},{merge:true});await updateProfile(currentUser,{displayName:nome}).catch(()=>{});currentUserData={...currentUserData,nome,funcao};saudacao.textContent='Olá, '+(nome||currentUser.email.split('@')[0])+'!';await refreshCaches();alert('Perfil atualizado com sucesso.');}catch(e){console.error(e);alert('Não foi possível salvar seu perfil.');}}
async function changePasswordFromProfile(){const cur=$('current-pass').value,np=$('profile-new-pass').value,cp=$('profile-confirm-pass').value,st=$('profile-pass-status');if(np.length<6){st.textContent='A nova senha deve ter pelo menos 6 caracteres.';st.className='hint error';return;}if(np!==cp){st.textContent='As senhas não coincidem.';st.className='hint error';return;}try{const cred=EmailAuthProvider.credential(currentUser.email,cur);await reauthenticateWithCredential(currentUser,cred);await updatePassword(currentUser,np);st.textContent='Senha alterada com sucesso.';st.className='hint success';$('current-pass').value=$('profile-new-pass').value=$('profile-confirm-pass').value='';}catch{st.textContent='Não foi possível alterar. Confira sua senha atual.';st.className='hint error';}}
function showPasswordModal(){const modal=$('password-modal');modal.classList.remove('hide');$('salvar-nova-senha').onclick=async()=>{const n=$('nova-senha').value,c=$('confirma-senha').value,st=$('password-status');if(n.length<6){st.textContent='Use pelo menos 6 caracteres.';st.className='hint error';return;}if(n!==c){st.textContent='As senhas não coincidem.';st.className='hint error';return;}try{await updatePassword(currentUser,n);await setDoc(doc(db,'usuarios',currentUser.uid),{mustChangePassword:false},{merge:true});currentUserData.mustChangePassword=false;modal.classList.add('hide');}catch{st.textContent='Não foi possível alterar. Saia e entre novamente para tentar.';st.className='hint error';}};}

// PWA
let deferredPrompt=null;const installButtons=[...document.querySelectorAll('.install-trigger')];window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installButtons.forEach(b=>b.style.display='flex');});installButtons.forEach(btn=>btn.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installButtons.forEach(b=>b.style.display='none');}));window.addEventListener('appinstalled',()=>{deferredPrompt=null;installButtons.forEach(b=>b.style.display='none');});if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=9.2').then(r=>r.update()).catch(e=>console.error('PWA SW',e)));}
