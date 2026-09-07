import { firebaseConfig } from './firebase-config.js?v=9.1';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider, updateProfile
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, addDoc,
  getDocs, deleteDoc, updateDoc, query, orderBy, where, onSnapshot
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';
import {
  getMessaging, getToken, onMessage, isSupported
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging.js';

const fbApp=initializeApp(firebaseConfig);
const auth=getAuth(fbApp);
const db=getFirestore(fbApp);
setPersistence(auth,browserLocalPersistence).catch(()=>{});
const VAPID_KEY='BDOI4MyF4n08PBpooA8cwRHZfSobF4BP2qiYUpq0sYaYbkuyxUBPudrZbuVfWenkYzwZJeILT7r83uI5VCIStrI';
let messaging=null;
isSupported().then(ok=>{ if(ok) messaging=getMessaging(fbApp); }).catch(()=>{});


isSupported().then(async ok=>{
  if(!ok)return;
  try{
    messaging=getMessaging(fbApp);
    onMessage(messaging,payload=>{
      const title=payload.notification?.title||payload.data?.title||'MVL';
      const body=payload.notification?.body||payload.data?.body||'';
      if(Notification.permission==='granted'){
        try{new Notification(title,{body,icon:'./mvl-icon-192-v4.png'});}catch{}
      }
    });
  }catch(e){console.warn('FCM foreground',e);}
});

const $=id=>document.getElementById(id);
const login=$('login'), appScreen=$('app'), email=$('email'), senha=$('senha'), entrar=$('entrar');
const loginStatus=$('login-status'), saudacao=$('saudacao'), homeView=$('home-view'), sectionView=$('section-view');
const sectionTitle=$('section-title'), sectionSubtitle=$('section-subtitle'), dynamicForm=$('dynamic-form');
const listEl=$('items-list'), adminPanel=$('admin-panel'), roleBadge=$('role-badge'), sectionSpecial=$('section-special');
const saveBtn=$('salvar-item'), cancelEditBtn=$('cancelar-edicao');

let currentUser=null, currentUserData={}, isAdmin=false, currentPage='inicio', editingId=null;
let usersCache=[], songsCache=[], repertoiresCache=[], agendasCache=[], scalesCache=[];
let notifUnsub=null, lastNotificationIds=new Set();

const simpleSections={
  musicas:{title:'Músicas',subtitle:'Cadastre as músicas utilizadas pelo ministério.',collection:'musicas',fields:[
    ['titulo','Título da música','text'],['tom','Tom','text'],['artista','Cantor / Ministério','text'],
    ['link','Link da música / cifra','url'],['observacoes','Observações','textarea']
  ]},
  avisos:{title:'Avisos',subtitle:'Comunicados para os integrantes.',collection:'avisos',fields:[
    ['titulo','Título','text'],['mensagem','Mensagem','textarea']
  ]},
  arquivos:{title:'Arquivos',subtitle:'Links para documentos, cifras e materiais.',collection:'arquivos',fields:[
    ['nome','Nome do arquivo','text'],['link','Link do arquivo','url'],['descricao','Descrição','textarea']
  ]},
  multitracks:{title:'Multitracks',subtitle:'Organize links das multitracks do ministério.',collection:'multitracks',fields:[
    ['musica','Música','text'],['tom','Tom','text'],['link','Link da multitrack','url'],['observacoes','Observações','textarea']
  ]},
  links:{title:'Links Úteis',subtitle:'Links importantes para a equipe.',collection:'links',fields:[
    ['nome','Nome','text'],['link','Endereço do link','url'],['descricao','Descrição','textarea']
  ]}
};

function msg(text,error=false){ loginStatus.textContent=text; loginStatus.className=error?'hint error':'hint'; }
function escapeHtml(v=''){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function escapeAttr(v=''){ return escapeHtml(v); }
function dateBR(v){ if(!v)return ''; const [y,m,d]=v.split('-'); return d&&m&&y?`${d}/${m}/${y}`:v; }
function dateKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function byCreatedDesc(a,b){ const av=a.criadoEm?.seconds||0,bv=b.criadoEm?.seconds||0; return bv-av; }

entrar.addEventListener('click',async()=>{
  if(!email.value.trim()||!senha.value){msg('Digite seu e-mail e sua senha.',true);return;}
  entrar.disabled=true; msg('Entrando...');
  try{ await signInWithEmailAndPassword(auth,email.value.trim(),senha.value); senha.value=''; }
  catch(e){
    const map={'auth/invalid-credential':'E-mail ou senha incorretos.','auth/invalid-email':'Digite um e-mail válido.',
      'auth/too-many-requests':'Muitas tentativas. Aguarde um pouco.','auth/network-request-failed':'Sem conexão com a internet.'};
    msg(map[e.code]||'Não foi possível entrar.',true);
  } finally{ entrar.disabled=false; }
});
senha.addEventListener('keydown',e=>{if(e.key==='Enter')entrar.click();});
$('sair').addEventListener('click',()=>signOut(auth));
$('voltar').addEventListener('click',goHome);
cancelEditBtn.addEventListener('click',()=>resetEditor());

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(!user){
    if(notifUnsub){notifUnsub();notifUnsub=null;}
    appScreen.classList.add('hide'); login.classList.remove('hide'); msg('');
    return;
  }

  login.classList.add('hide'); appScreen.classList.remove('hide');
  const userRef=doc(db,'usuarios',user.uid);

  let snap=await getDoc(userRef);
  if(!snap.exists()){
    await setDoc(userRef,{
      email:user.email,
      nome:user.displayName||'',
      funcao:'',
      role:'member',
      mustChangePassword:true,
      criadoEm:serverTimestamp()
    });
    snap=await getDoc(userRef);
  }
  currentUserData=snap.data()||{};
  isAdmin=currentUserData.role==='admin';

  if(isAdmin){
    await setDoc(userRef,{email:user.email,ultimoAcesso:serverTimestamp()},{merge:true}).catch(()=>{});
  }

  updateRoleUI();
  saudacao.textContent='Olá, '+(currentUserData.nome||user.displayName||user.email.split('@')[0])+'!';
  await refreshCaches();
  bindNotifications();
  await renderNextScale();
  goHome();

  if(currentUserData.mustChangePassword===true) showPasswordModal(true);
});

function updateRoleUI(){
  roleBadge.textContent=isAdmin?'Administrador':'Integrante';
  roleBadge.classList.toggle('admin',isAdmin);
}

async function refreshCaches(){
  const [u,m,r,a,s]=await Promise.all([
    safeDocs('usuarios'),safeDocs('musicas'),safeDocs('repertorios'),safeDocs('agenda'),safeDocs('escalas')
  ]);
  usersCache=u; songsCache=m; repertoiresCache=r; agendasCache=a; scalesCache=s;
}

async function safeDocs(name){
  try{
    const snap=await getDocs(collection(db,name));
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ console.warn(name,e.code||e); return []; }
}

function goHome(){
  currentPage='inicio'; editingId=null; homeView.classList.remove('hide'); sectionView.classList.add('hide');
  setActiveNav('inicio'); renderNextScale();
}
function setActiveNav(page){
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
}
document.querySelectorAll('.menu-card,.nav-btn').forEach(btn=>btn.addEventListener('click',()=>{
  const p=btn.dataset.page; if(p==='inicio')goHome(); else openSection(p);
}));
$('notif-bell').addEventListener('click',()=>openSection('notificacoes'));

async function openSection(page){
  currentPage=page; editingId=null;
  homeView.classList.add('hide'); sectionView.classList.remove('hide'); setActiveNav(page);
  sectionSpecial.innerHTML=''; dynamicForm.innerHTML=''; listEl.innerHTML='';
  cancelEditBtn.classList.add('hide'); saveBtn.textContent='Salvar';

  if(simpleSections[page]) return renderSimpleSection(page);
  if(page==='escalas') return renderScales();
  if(page==='repertorio') return renderRepertoires();
  if(page==='agenda') return renderAgenda();
  if(page==='calendario') return renderCalendar();
  if(page==='comunicacao') return renderCommunication();
  if(page==='perfil') return renderProfile();
  if(page==='membros') return renderMembers();
  if(page==='notificacoes') return renderNotifications();
}

function showSectionHeader(title,subtitle){
  sectionTitle.textContent=title; sectionSubtitle.textContent=subtitle;
}

function makeField(key,label,type,value=''){
  if(type==='textarea') return `<textarea id="f-${key}" placeholder="${escapeAttr(label)}">${escapeHtml(value)}</textarea>`;
  return `<input id="f-${key}" type="${type}" placeholder="${escapeAttr(label)}" value="${escapeAttr(value)}">`;
}
function collectFields(fields){
  const data={}; for(const [key] of fields) data[key]=($('f-'+key)?.value||'').trim(); return data;
}
function resetEditor(){
  editingId=null; cancelEditBtn.classList.add('hide'); saveBtn.textContent='Salvar';
  openSection(currentPage);
}

async function renderSimpleSection(page){
  const cfg=simpleSections[page]; showSectionHeader(cfg.title,cfg.subtitle);
  adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){
    $('form-title').textContent='Adicionar';
    dynamicForm.innerHTML='<div class="form-grid">'+cfg.fields.map(([k,l,t])=>makeField(k,l,t)).join('')+'</div>';
    saveBtn.onclick=()=>saveSimple(cfg);
  }else{
    listEl.innerHTML='<div class="readonly-note">Modo de visualização: somente administradores podem alterar os dados.</div>';
  }
  await loadSimpleItems(cfg);
}

async function saveSimple(cfg){
  if(!isAdmin)return;
  const data=collectFields(cfg.fields);
  if(!Object.values(data).some(Boolean)){alert('Preencha pelo menos um campo.');return;}
  saveBtn.disabled=true;
  try{
    if(editingId) await updateDoc(doc(db,cfg.collection,editingId),{...data,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});
    else await addDoc(collection(db,cfg.collection),{...data,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});
    await refreshCaches(); await renderSimpleSection(currentPage);
  }catch(e){alert('Não foi possível salvar.');console.error(e);}
  finally{saveBtn.disabled=false;}
}

async function loadSimpleItems(cfg){
  let items=await safeDocs(cfg.collection); items.sort(byCreatedDesc);
  if(!items.length){listEl.insertAdjacentHTML('beforeend','<div class="empty">Nenhum item cadastrado ainda.</div>');return;}
  for(const item of items){
    const values=cfg.fields.map(([k,l])=>[l,item[k]]).filter(([,v])=>v);
    const primary=values[0]?.[1]||cfg.title;
    const rest=values.slice(1).map(([l,v])=>`<div class="item-meta"><b>${escapeHtml(l)}:</b> ${renderValue(v)}</div>`).join('');
    const card=document.createElement('div'); card.className='item-card';
    card.innerHTML=`<h3>${escapeHtml(primary)}</h3>${rest}${isAdmin?`<div class="item-actions"><button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button></div>`:''}`;
    if(isAdmin){
      card.querySelector('.edit-btn').onclick=()=>{
        editingId=item.id; $('form-title').textContent='Editar'; saveBtn.textContent='Atualizar'; cancelEditBtn.classList.remove('hide');
        dynamicForm.innerHTML='<div class="form-grid">'+cfg.fields.map(([k,l,t])=>makeField(k,l,t,item[k]||'')).join('')+'</div>';
        saveBtn.onclick=()=>saveSimple(cfg); window.scrollTo({top:0,behavior:'smooth'});
      };
      card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir este item?')){await deleteDoc(doc(db,cfg.collection,item.id));await refreshCaches();renderSimpleSection(currentPage);}};
    }
    listEl.appendChild(card);
  }
}
function renderValue(v){
  if(typeof v==='string'&&/^https?:\/\//i.test(v)) return `<a class="link-btn" href="${escapeAttr(v)}" target="_blank" rel="noopener">Abrir link</a>`;
  return escapeHtml(v);
}

// -------- Members / users --------
async function renderMembers(){
  showSectionHeader('Membros','Integrantes que já acessaram o MVL.');
  adminPanel.classList.add('hide');
  usersCache=await safeDocs('usuarios');
  if(!usersCache.length){listEl.innerHTML='<div class="empty">Nenhum integrante registrado.</div>';return;}
  listEl.innerHTML='';
  usersCache.sort((a,b)=>(a.nome||a.email||'').localeCompare(b.nome||b.email||''));
  usersCache.forEach(u=>{
    const card=document.createElement('div'); card.className='item-card';
    card.innerHTML=`<h3>${escapeHtml(u.nome||u.email||'Integrante')}</h3>
      <div class="item-meta">${escapeHtml(u.funcao||'Função não informada')}</div>
      ${isAdmin?`<div class="item-meta">${escapeHtml(u.email||'')}</div><span class="status-pill">${u.role==='admin'?'Administrador':'Integrante'}</span>`:''}`;
    listEl.appendChild(card);
  });
}

// -------- Profile / Password --------
function renderProfile(){
  showSectionHeader('Meu Perfil','Atualize seus dados e sua senha.');
  adminPanel.classList.add('hide');
  const d=currentUserData||{};
  sectionSpecial.innerHTML=`<div class="admin-panel">
    <h3>Dados pessoais</h3>
    <div class="form-grid">
      <input id="profile-name" placeholder="Nome" value="${escapeAttr(d.nome||'')}">
      <input id="profile-role" placeholder="Função / Instrumento" value="${escapeAttr(d.funcao||'')}">
      <input value="${escapeAttr(currentUser.email||'')}" disabled>
    </div>
    <div class="form-actions"><button id="save-profile" class="primary">Salvar perfil</button></div>
  </div>
  <div class="admin-panel">
    <h3>Alterar senha</h3>
    <div class="form-grid">
      <input id="current-pass" type="password" placeholder="Senha atual">
      <input id="profile-new-pass" type="password" placeholder="Nova senha">
      <input id="profile-confirm-pass" type="password" placeholder="Confirmar nova senha">
    </div>
    <div class="form-actions"><button id="change-pass" class="secondary">Alterar senha</button></div>
    <p id="profile-pass-status" class="hint"></p>
  </div>`;
  $('save-profile').onclick=saveProfile;
  $('change-pass').onclick=changePasswordFromProfile;
}
async function saveProfile(){
  const nome=$('profile-name').value.trim(), funcao=$('profile-role').value.trim();
  try{
    await setDoc(doc(db,'usuarios',currentUser.uid),{nome,funcao,email:currentUser.email,atualizadoEm:serverTimestamp()},{merge:true});
    await updateProfile(currentUser,{displayName:nome}).catch(()=>{});
    currentUserData={...currentUserData,nome,funcao};
    saudacao.textContent='Olá, '+(nome||currentUser.email.split('@')[0])+'!';
    alert('Perfil atualizado com sucesso.');
    await refreshCaches();
  }catch(e){
    console.error('saveProfile',e);
    alert('Não foi possível salvar seu perfil. Verifique se as regras V9.1 foram publicadas no Firestore.');
  }
}
async function changePasswordFromProfile(){
  const cur=$('current-pass').value, np=$('profile-new-pass').value, cp=$('profile-confirm-pass').value, st=$('profile-pass-status');
  if(np.length<6){st.textContent='A nova senha deve ter pelo menos 6 caracteres.';st.className='hint error';return;}
  if(np!==cp){st.textContent='As senhas não coincidem.';st.className='hint error';return;}
  try{
    const cred=EmailAuthProvider.credential(currentUser.email,cur);
    await reauthenticateWithCredential(currentUser,cred); await updatePassword(currentUser,np);
    st.textContent='Senha alterada com sucesso.';st.className='hint success';
    $('current-pass').value=$('profile-new-pass').value=$('profile-confirm-pass').value='';
  }catch(e){st.textContent='Não foi possível alterar. Confira sua senha atual.';st.className='hint error';}
}
function showPasswordModal(force=false){
  const modal=$('password-modal'); modal.classList.remove('hide');
  $('salvar-nova-senha').onclick=async()=>{
    const n=$('nova-senha').value,c=$('confirma-senha').value,st=$('password-status');
    if(n.length<6){st.textContent='Use pelo menos 6 caracteres.';st.className='hint error';return;}
    if(n!==c){st.textContent='As senhas não coincidem.';st.className='hint error';return;}
    try{
      await updatePassword(currentUser,n);
      await setDoc(doc(db,'usuarios',currentUser.uid),{mustChangePassword:false},{merge:true});
      currentUserData.mustChangePassword=false; modal.classList.add('hide');
    }catch(e){st.textContent='Não foi possível alterar. Saia e entre novamente para tentar.';st.className='hint error';}
  };
}

// -------- Repertoires --------
async function renderRepertoires(){
  showSectionHeader('Repertório','Monte repertórios usando músicas já cadastradas.');
  songsCache=await safeDocs('musicas'); repertoiresCache=await safeDocs('repertorios');
  adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){
    $('form-title').textContent='Novo repertório';
    dynamicForm.innerHTML=`<div class="form-grid">
      <input id="rep-name" placeholder="Nome do repertório / Culto">
      <input id="rep-date" type="date">
      <div><small class="muted">Selecione as músicas</small><div class="multi-list" id="song-options">${songsCache.length?songsCache.map(s=>`<label class="multi-item"><input type="checkbox" value="${s.id}"> ${escapeHtml(s.titulo||'Sem título')} ${s.tom?`(${escapeHtml(s.tom)})`:''}</label>`).join(''):'<span class="muted">Cadastre músicas primeiro.</span>'}</div></div>
      <textarea id="rep-note" placeholder="Observações"></textarea>
    </div>`;
    saveBtn.onclick=saveRepertoire;
  }
  listEl.innerHTML='';
  if(!repertoiresCache.length){listEl.innerHTML='<div class="empty">Nenhum repertório cadastrado.</div>';return;}
  repertoiresCache.sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  repertoiresCache.forEach(r=>{
    const names=(r.musicaIds||[]).map(id=>songsCache.find(s=>s.id===id)?.titulo).filter(Boolean);
    const card=document.createElement('div');card.className='item-card';
    card.innerHTML=`<h3>${escapeHtml(r.nome||'Repertório')}</h3>
      <div class="item-meta">${dateBR(r.data)}</div>
      <div class="item-meta"><b>Músicas:</b> ${escapeHtml(names.join(', ')||'Nenhuma')}</div>
      ${r.observacoes?`<div class="item-meta">${escapeHtml(r.observacoes)}</div>`:''}
      ${isAdmin?`<div class="item-actions"><button class="delete-btn">Excluir</button></div>`:''}`;
    if(isAdmin) card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir repertório?')){await deleteDoc(doc(db,'repertorios',r.id));await refreshCaches();renderRepertoires();}};
    listEl.appendChild(card);
  });
}
async function saveRepertoire(){
  const ids=[...document.querySelectorAll('#song-options input:checked')].map(x=>x.value);
  const nome=$('rep-name').value.trim(),data=$('rep-date').value,observacoes=$('rep-note').value.trim();
  if(!nome){alert('Informe o nome do repertório.');return;}
  await addDoc(collection(db,'repertorios'),{nome,data,musicaIds:ids,observacoes,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});
  await refreshCaches(); renderRepertoires();
}

// -------- Scales --------
async function renderScales(){
  showSectionHeader('Escalas','Selecione os integrantes, repertório e acompanhe confirmações.');
  await refreshCaches();
  adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){
    $('form-title').textContent='Nova escala';
    const members=usersCache.filter(u=>u.role!=='disabled');
    dynamicForm.innerHTML=`<div class="form-grid">
      <input id="scale-date" type="date">
      <input id="scale-time" type="time">
      <input id="scale-event" placeholder="Culto / Evento">
      <select id="scale-rep"><option value="">Sem repertório vinculado</option>${repertoiresCache.map(r=>`<option value="${r.id}">${escapeHtml(r.nome||'Repertório')}</option>`).join('')}</select>
      <div><small class="muted">Integrantes escalados</small><div class="multi-list" id="member-options">${members.map(u=>`<label class="multi-item"><input type="checkbox" value="${u.id}"> ${escapeHtml(u.nome||u.email||u.id)} ${u.funcao?`— ${escapeHtml(u.funcao)}`:''}</label>`).join('')}</div></div>
      <label class="checkbox-row"><input id="notify-scaled" type="checkbox" checked><span><b>Notificar pessoas escaladas</b><br><small class="muted">Cria uma notificação dentro do MVL para os selecionados.</small></span></label>
      <select id="scale-reminder">
        <option value="1440">Lembrar 1 dia antes</option>
        <option value="180">Lembrar 3 horas antes</option>
        <option value="60" selected>Lembrar 1 hora antes</option>
        <option value="0">Sem lembrete</option>
      </select>
    </div>`;
    saveBtn.onclick=saveScale;
  }
  listEl.innerHTML='';
  if(!scalesCache.length){listEl.innerHTML='<div class="empty">Nenhuma escala cadastrada.</div>';return;}
  const visible=isAdmin?scalesCache:scalesCache.filter(s=>(s.integranteIds||[]).includes(currentUser.uid));
  visible.sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  if(!visible.length){listEl.innerHTML='<div class="empty">Você ainda não está em nenhuma escala.</div>';return;}
  for(const s of visible) listEl.appendChild(await buildScaleCard(s));
}
async function saveScale(){
  const integranteIds=[...document.querySelectorAll('#member-options input:checked')].map(x=>x.value);
  const data=$('scale-date').value,horario=$('scale-time').value,evento=$('scale-event').value.trim();
  const repertorioId=$('scale-rep').value,lembreteMin=Number($('scale-reminder').value||0);
  if(!data||!evento){alert('Informe a data e o evento.');return;}
  const ref=await addDoc(collection(db,'escalas'),{data,horario,evento,repertorioId,integranteIds,lembreteMin,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});
  if($('notify-scaled').checked && integranteIds.length){
    await addDoc(collection(db,'notificacoes'),{
      titulo:'Nova escala MVL',
      mensagem:`Você foi escalado para ${evento} em ${dateBR(data)}${horario?' às '+horario:''}.`,
      destinatarios:integranteIds,todos:false,tipo:'escala',refId:ref.id,lidaPor:[],criadoEm:serverTimestamp()
    });
  }
  await refreshCaches(); renderScales();
}
async function buildScaleCard(s){
  const card=document.createElement('div'); card.className='item-card';
  const members=(s.integranteIds||[]).map(id=>usersCache.find(u=>u.id===id)?.nome||usersCache.find(u=>u.id===id)?.email).filter(Boolean);
  const rep=repertoiresCache.find(r=>r.id===s.repertorioId);
  let confirmation='';
  if(!isAdmin && (s.integranteIds||[]).includes(currentUser.uid)){
    const c=await getDoc(doc(db,'escalas',s.id,'confirmacoes',currentUser.uid)).catch(()=>null);
    const st=c?.exists()?c.data().status:'';
    confirmation=st==='confirmado'?'<span class="status-pill ok">Presença confirmada</span>':st==='nao_posso'?'<span class="status-pill no">Não poderá participar</span>':'<span class="status-pill">Aguardando confirmação</span>';
  }
  card.innerHTML=`<h3>${escapeHtml(s.evento||'Escala')}</h3>
    <div class="item-meta"><b>Data:</b> ${dateBR(s.data)} ${escapeHtml(s.horario||'')}</div>
    ${isAdmin?`<div class="item-meta"><b>Escalados:</b> ${escapeHtml(members.join(', ')||'Nenhum')}</div>`:''}
    ${rep?`<div class="item-meta"><b>Repertório:</b> ${escapeHtml(rep.nome||'')}</div>`:''}
    ${confirmation}
    <div class="item-actions">
      ${!isAdmin&&s.integranteIds?.includes(currentUser.uid)?`<button class="confirm-btn">Confirmar presença</button><button class="decline-btn">Não poderei</button>`:''}
      ${isAdmin?`<button class="delete-btn">Excluir</button>`:''}
    </div>`;
  if(!isAdmin&&s.integranteIds?.includes(currentUser.uid)){
    card.querySelector('.confirm-btn').onclick=()=>setConfirmation(s.id,'confirmado');
    card.querySelector('.decline-btn').onclick=()=>setConfirmation(s.id,'nao_posso');
  }
  if(isAdmin) card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir escala?')){await deleteDoc(doc(db,'escalas',s.id));await refreshCaches();renderScales();}};
  return card;
}
async function setConfirmation(scaleId,status){
  try{
    await setDoc(doc(db,'escalas',scaleId,'confirmacoes',currentUser.uid),{
      status,usuarioId:currentUser.uid,atualizadoEm:serverTimestamp()
    },{merge:true});
    alert(status==='confirmado'?'Presença confirmada.':'Resposta registrada.');
    renderScales();
  }catch(e){
    console.error('setConfirmation',e);
    alert('Não foi possível registrar sua resposta. Verifique se as regras V9.1 foram publicadas.');
  }
}
async function renderNextScale(){
  if(!currentUser)return;
  await refreshCaches();
  const today=dateKey(new Date());
  const mine=scalesCache.filter(s=>(s.integranteIds||[]).includes(currentUser.uid)&&s.data>=today).sort((a,b)=>(a.data+a.horario).localeCompare(b.data+b.horario))[0];
  const el=$('next-scale-content');
  if(!mine){el.innerHTML='<p class="muted">Nenhuma escala futura encontrada.</p>';return;}
  const rep=repertoiresCache.find(r=>r.id===mine.repertorioId);
  el.innerHTML=`<h3>${escapeHtml(mine.evento||'Escala')}</h3><p>${dateBR(mine.data)} ${escapeHtml(mine.horario||'')}</p>${rep?`<p class="muted">Repertório: ${escapeHtml(rep.nome||'')}</p>`:''}`;
}

// -------- Agenda --------
async function renderAgenda(){
  showSectionHeader('Agenda','Cultos, ensaios, reuniões e eventos.');
  agendasCache=await safeDocs('agenda'); usersCache=await safeDocs('usuarios');
  adminPanel.classList.toggle('hide',!isAdmin);
  if(isAdmin){
    $('form-title').textContent='Novo evento';
    dynamicForm.innerHTML=`<div class="form-grid">
      <input id="ag-date" type="date"><input id="ag-time" type="time">
      <input id="ag-title" placeholder="Evento"><input id="ag-local" placeholder="Local">
      <textarea id="ag-note" placeholder="Observações"></textarea>
      <select id="ag-target"><option value="todos">Todos os integrantes</option><option value="especificos">Selecionar pessoas</option></select>
      <div id="ag-member-box" class="multi-list hide">${usersCache.map(u=>`<label class="multi-item"><input type="checkbox" value="${u.id}"> ${escapeHtml(u.nome||u.email||u.id)}</label>`).join('')}</div>
      <select id="ag-reminder"><option value="1440">Lembrar 1 dia antes</option><option value="180">Lembrar 3 horas antes</option><option value="60" selected>Lembrar 1 hora antes</option><option value="0">Sem lembrete</option></select>
      <label class="checkbox-row"><input id="ag-notify" type="checkbox" checked><span><b>Enviar notificação no MVL</b><br><small class="muted">Os destinatários verão o aviso na área Notificações.</small></span></label>
    </div>`;
    $('ag-target').onchange=()=> $('ag-member-box').classList.toggle('hide',$('ag-target').value!=='especificos');
    saveBtn.onclick=saveAgenda;
  }
  listEl.innerHTML='';
  const visible=agendasCache.filter(a=>isAdmin||a.todos===true||(a.destinatarios||[]).includes(currentUser.uid));
  visible.sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  if(!visible.length){listEl.innerHTML='<div class="empty">Nenhum evento cadastrado.</div>';return;}
  visible.forEach(a=>{
    const card=document.createElement('div');card.className='item-card';
    card.innerHTML=`<h3>${escapeHtml(a.titulo||'Evento')}</h3><div class="item-meta">${dateBR(a.data)} ${escapeHtml(a.horario||'')}</div>
      ${a.local?`<div class="item-meta">📍 ${escapeHtml(a.local)}</div>`:''}${a.observacoes?`<div class="item-meta">${escapeHtml(a.observacoes)}</div>`:''}
      ${a.lembreteMin?`<span class="status-pill">Lembrete: ${formatReminder(a.lembreteMin)}</span>`:''}
      ${isAdmin?`<div class="item-actions"><button class="delete-btn">Excluir</button></div>`:''}`;
    if(isAdmin)card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir evento?')){await deleteDoc(doc(db,'agenda',a.id));await refreshCaches();renderAgenda();}};
    listEl.appendChild(card);
  });
}
function formatReminder(m){return m===1440?'1 dia antes':m===180?'3 horas antes':m===60?'1 hora antes':`${m} min antes`;}
async function saveAgenda(){
  const data=$('ag-date').value,horario=$('ag-time').value,titulo=$('ag-title').value.trim(),local=$('ag-local').value.trim(),observacoes=$('ag-note').value.trim();
  const todos=$('ag-target').value==='todos';
  const destinatarios=todos?[]:[...document.querySelectorAll('#ag-member-box input:checked')].map(x=>x.value);
  const lembreteMin=Number($('ag-reminder').value||0);
  if(!data||!titulo){alert('Informe a data e o evento.');return;}
  const ref=await addDoc(collection(db,'agenda'),{data,horario,titulo,local,observacoes,todos,destinatarios,lembreteMin,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});
  if($('ag-notify').checked){
    await addDoc(collection(db,'notificacoes'),{titulo:'Agenda MVL',mensagem:`${titulo} — ${dateBR(data)}${horario?' às '+horario:''}.`,todos,destinatarios,tipo:'agenda',refId:ref.id,lidaPor:[],criadoEm:serverTimestamp()});
  }
  await refreshCaches(); renderAgenda();
}

// -------- Calendar --------
let calDate=new Date(), selectedDate=dateKey(new Date());
async function renderCalendar(){
  showSectionHeader('Calendário','Toque em um dia para ver as atividades.');
  adminPanel.classList.add('hide'); await refreshCaches();
  sectionSpecial.innerHTML=`<div class="calendar-head"><button id="cal-prev">‹</button><div id="cal-title" class="calendar-title"></div><button id="cal-next">›</button></div>
    <div class="calendar-grid" id="calendar-grid"></div><div id="day-events" class="day-events"></div>`;
  $('cal-prev').onclick=()=>{calDate=new Date(calDate.getFullYear(),calDate.getMonth()-1,1);drawCalendar();};
  $('cal-next').onclick=()=>{calDate=new Date(calDate.getFullYear(),calDate.getMonth()+1,1);drawCalendar();};
  drawCalendar();
}
function eventDatesForUser(){
  const a=agendasCache.filter(x=>isAdmin||x.todos===true||(x.destinatarios||[]).includes(currentUser.uid)).map(x=>({kind:'Agenda',...x}));
  const s=scalesCache.filter(x=>isAdmin||(x.integranteIds||[]).includes(currentUser.uid)).map(x=>({kind:'Escala',titulo:x.evento,...x}));
  return [...a,...s];
}
function drawCalendar(){
  const grid=$('calendar-grid'), events=eventDatesForUser(), y=calDate.getFullYear(),m=calDate.getMonth();
  $('cal-title').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(calDate);
  const weekdays=['D','S','T','Q','Q','S','S'];
  grid.innerHTML=weekdays.map(w=>`<div class="cal-week">${w}</div>`).join('');
  const first=new Date(y,m,1), start=new Date(y,m,1-first.getDay());
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=dateKey(d);
    const has=events.some(e=>e.data===key), b=document.createElement('button');b.className='cal-day';
    if(d.getMonth()!==m)b.classList.add('out'); if(key===dateKey(new Date()))b.classList.add('today'); if(key===selectedDate)b.classList.add('selected');
    b.innerHTML=`${d.getDate()}${has?'<span class="cal-dot"></span>':''}`;
    b.onclick=()=>{selectedDate=key;drawCalendar();};
    grid.appendChild(b);
  }
  renderDayEvents(events.filter(e=>e.data===selectedDate));
}
function renderDayEvents(events){
  const el=$('day-events'); el.innerHTML=`<h3>${dateBR(selectedDate)}</h3>`;
  if(!events.length){el.innerHTML+='<div class="empty">Nenhuma atividade neste dia.</div>';return;}
  events.forEach(e=>el.innerHTML+=`<div class="item-card"><span class="status-pill">${e.kind}</span><h3>${escapeHtml(e.titulo||e.evento||'Atividade')}</h3><div class="item-meta">${escapeHtml(e.horario||'')}</div>${e.local?`<div class="item-meta">📍 ${escapeHtml(e.local)}</div>`:''}</div>`);
}

// -------- Communication --------
async function renderCommunication(){
  showSectionHeader('Comunicação','Faltas, dúvidas e mensagens privadas para a liderança.');
  adminPanel.classList.remove('hide');
  $('form-title').textContent=isAdmin?'Nova mensagem':'Enviar mensagem à liderança';
  dynamicForm.innerHTML=`<div class="form-grid">
    <select id="msg-type"><option>Falta / ausência</option><option>Dúvida</option><option>Pedido</option><option>Observação</option><option>Outro</option></select>
    <textarea id="msg-body" placeholder="Escreva sua mensagem"></textarea>
  </div>`;
  saveBtn.onclick=sendMessage;
  await loadMessages();
}
async function sendMessage(){
  const tipo=$('msg-type').value,mensagem=$('msg-body').value.trim();
  if(!mensagem){alert('Escreva a mensagem.');return;}
  try{
    await addDoc(collection(db,'mensagens'),{
      autorId:currentUser.uid,
      autorNome:currentUserData.nome||currentUser.email,
      autorEmail:currentUser.email,
      tipo,mensagem,status:'nova',criadoEm:serverTimestamp()
    });
    $('msg-body').value='';
    alert('Mensagem enviada à liderança.');
    await loadMessages();
  }catch(e){
    console.error('sendMessage',e);
    alert('Não foi possível enviar a mensagem. Verifique se as regras V9.1 foram publicadas.');
  }
}
async function loadMessages(){
  const all=await safeDocs('mensagens');
  const visible=(isAdmin?all:all.filter(m=>m.autorId===currentUser.uid)).sort(byCreatedDesc);
  listEl.innerHTML='';
  if(!visible.length){listEl.innerHTML='<div class="empty">Nenhuma mensagem ainda.</div>';return;}
  visible.forEach(m=>{
    const card=document.createElement('div');card.className='item-card';
    card.innerHTML=`<span class="status-pill ${m.status==='nova'?'new':m.status==='resolvida'?'done':''}">${escapeHtml(m.status||'nova')}</span>
      <h3>${escapeHtml(m.tipo||'Mensagem')}</h3>${isAdmin?`<div class="item-meta"><b>De:</b> ${escapeHtml(m.autorNome||m.autorEmail||'')}</div>`:''}
      <div class="item-meta">${escapeHtml(m.mensagem||'')}</div>
      ${isAdmin?`<div class="item-actions"><button class="edit-btn">Marcar lida</button><button class="confirm-btn">Resolvida</button></div>`:''}`;
    if(isAdmin){
      card.querySelector('.edit-btn').onclick=async()=>{await updateDoc(doc(db,'mensagens',m.id),{status:'lida'});loadMessages();};
      card.querySelector('.confirm-btn').onclick=async()=>{await updateDoc(doc(db,'mensagens',m.id),{status:'resolvida'});loadMessages();};
    }
    listEl.appendChild(card);
  });
}

// -------- Notifications --------
function bindNotifications(){
  if(notifUnsub)notifUnsub();
  notifUnsub=onSnapshot(collection(db,'notificacoes'),snap=>{
    const relevant=snap.docs.map(d=>({id:d.id,...d.data()})).filter(n=>n.todos===true||(n.destinatarios||[]).includes(currentUser.uid));
    const unread=relevant.filter(n=>!(n.lidaPor||[]).includes(currentUser.uid));
    $('notif-count').textContent=String(unread.length); $('notif-count').classList.toggle('hide',unread.length===0);
    for(const n of unread){
      if(!lastNotificationIds.has(n.id)){ lastNotificationIds.add(n.id); maybeBrowserNotify(n); }
    }
  },e=>console.warn('notif',e.code||e));
}
async function maybeBrowserNotify(n){
  if(!('Notification'in window))return;
  if(Notification.permission==='granted' && document.visibilityState==='visible'){
    try{new Notification(n.titulo||'MVL',{body:n.mensagem||'',icon:'./mvl-icon-192-v4.png'});}catch{}
  }
}

async function registerPushToken(){
  if(!currentUser) throw new Error('not-authenticated');
  if(!('Notification' in window)) throw new Error('notification-unsupported');

  let reg = await navigator.serviceWorker.getRegistration();
  if(!reg) reg = await navigator.serviceWorker.register('./firebase-messaging-sw.js?v=9.1');

  const permission = await Notification.requestPermission();
  if(permission!=='granted') throw new Error('permission-denied');

  if(!messaging){
    const ok = await isSupported().catch(()=>false);
    if(!ok) throw new Error('messaging-unsupported');
    messaging=getMessaging(fbApp);
  }

  const token = await getToken(messaging,{
    vapidKey:VAPID_KEY,
    serviceWorkerRegistration:reg
  });
  if(!token) throw new Error('no-token');

  const tokenId = await sha256(token);
  await setDoc(doc(db,'usuarios',currentUser.uid,'dispositivos',tokenId),{
    token,
    ativo:true,
    plataforma:navigator.userAgent,
    atualizadoEm:serverTimestamp()
  },{merge:true});
  return token;
}

async function sha256(text){
  const data=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest('SHA-256',data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function requestNotifications(){
  try{
    await registerPushToken();
    alert('Notificações ativadas neste aparelho.');
  }catch(e){
    console.error('push registration',e);
    const map={
      'permission-denied':'A permissão de notificações não foi concedida.',
      'messaging-unsupported':'Este navegador não oferece suporte completo ao Firebase Messaging.',
      'notification-unsupported':'Este navegador não suporta notificações.',
      'no-token':'O Firebase não conseguiu gerar o token deste aparelho.'
    };
    alert(map[e.message]||'Não foi possível ativar as notificações neste aparelho.');
  }
}

async function renderNotifications(){
  showSectionHeader('Notificações','Avisos recebidos dentro do MVL.');
  adminPanel.classList.add('hide');
  sectionSpecial.innerHTML=`<div class="admin-panel"><h3>Notificações do dispositivo</h3><p class="muted">Ative para receber avisos enquanto o MVL estiver aberto ou ativo no aparelho.</p><button id="enable-notif" class="secondary">Permitir notificações</button></div>`;
  $('enable-notif').onclick=requestNotifications;
  const all=await safeDocs('notificacoes');
  const visible=all.filter(n=>n.todos===true||(n.destinatarios||[]).includes(currentUser.uid)).sort(byCreatedDesc);
  listEl.innerHTML='';
  if(!visible.length){listEl.innerHTML='<div class="empty">Nenhuma notificação.</div>';return;}
  visible.forEach(n=>{
    const read=(n.lidaPor||[]).includes(currentUser.uid);
    const card=document.createElement('div');card.className='item-card';
    card.innerHTML=`${!read?'<span class="status-pill new">Nova</span>':''}<h3>${escapeHtml(n.titulo||'MVL')}</h3><div class="item-meta">${escapeHtml(n.mensagem||'')}</div>${!read?'<div class="item-actions"><button class="edit-btn">Marcar como lida</button></div>':''}`;
    const btn=card.querySelector('.edit-btn');
    if(btn)btn.onclick=async()=>{
      const fresh=await getDoc(doc(db,'notificacoes',n.id));const arr=[...(fresh.data()?.lidaPor||[])];if(!arr.includes(currentUser.uid))arr.push(currentUser.uid);
      await updateDoc(doc(db,'notificacoes',n.id),{lidaPor:arr});renderNotifications();
    };
    listEl.appendChild(card);
  });
}

// -------- Local reminder checker --------
function checkLocalReminders(){
  if(!currentUser||Notification.permission!=='granted')return;
  const now=Date.now();
  const events=[
    ...agendasCache.filter(a=>a.todos===true||(a.destinatarios||[]).includes(currentUser.uid)).map(a=>({id:'a'+a.id,title:a.titulo,data:a.data,horario:a.horario,mins:a.lembreteMin})),
    ...scalesCache.filter(s=>(s.integranteIds||[]).includes(currentUser.uid)).map(s=>({id:'s'+s.id,title:s.evento,data:s.data,horario:s.horario,mins:s.lembreteMin}))
  ];
  for(const e of events){
    if(!e.data||!e.mins)continue;
    const target=new Date(`${e.data}T${e.horario||'19:00'}:00`).getTime();
    const remindAt=target-e.mins*60000;
    const key=`mvl-reminded-${e.id}-${e.mins}`;
    if(now>=remindAt&&now<target&&localStorage.getItem(key)!=='1'){
      localStorage.setItem(key,'1'); try{new Notification('Lembrete MVL',{body:`${e.title} — ${dateBR(e.data)} ${e.horario||''}`,icon:'./mvl-icon-192-v4.png'});}catch{}
    }
  }
}
setInterval(checkLocalReminders,60000);

// -------- install PWA --------
let deferredPrompt=null;
const installButtons=[...document.querySelectorAll('.install-trigger')];
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installButtons.forEach(b=>b.style.display='flex');});
installButtons.forEach(btn=>btn.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installButtons.forEach(b=>b.style.display='none');}));
window.addEventListener('appinstalled',()=>{deferredPrompt=null;installButtons.forEach(b=>b.style.display='none');});

if('serviceWorker'in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=9.1').then(r=>r.update()).catch(()=>{}));
}
