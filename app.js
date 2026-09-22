import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider, updateProfile,
  createUserWithEmailAndPassword, inMemoryPersistence
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, addDoc,
  getDocs, deleteDoc, updateDoc, query, where, onSnapshot, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const fbApp=initializeApp(firebaseConfig);
const auth=getAuth(fbApp);
const db=getFirestore(fbApp);
setPersistence(auth,browserLocalPersistence).catch(()=>{});

// V10.0 - instância isolada usada pelo Administrador principal para criar novos integrantes
// sem encerrar a sessão administrativa atual.
const memberCreatorApp=initializeApp(firebaseConfig,'mvl-member-creator');
const memberCreatorAuth=getAuth(memberCreatorApp);
const memberCreatorDb=getFirestore(memberCreatorApp);
setPersistence(memberCreatorAuth,inMemoryPersistence).catch(()=>{});

const $=id=>document.getElementById(id);
const login=$('login'),appScreen=$('app'),email=$('email'),senha=$('senha'),entrar=$('entrar');
const loginStatus=$('login-status'),saudacao=$('saudacao'),homeView=$('home-view'),sectionView=$('section-view');
const sectionTitle=$('section-title'),sectionSubtitle=$('section-subtitle'),dynamicForm=$('dynamic-form');
const listEl=$('items-list'),adminPanel=$('admin-panel'),roleBadge=$('role-badge'),sectionSpecial=$('section-special');
const saveBtn=$('salvar-item'),cancelEditBtn=$('cancelar-edicao');

let currentUser=null,currentUserData={},isAdmin=false,isPrincipalAdmin=false,currentPage='inicio',editingId=null;
let usersCache=[],songsCache=[],repertoiresCache=[],agendasCache=[],scalesCache=[],chartsCache=[];
let notifUnsub=null,lastNotificationIds=new Set(),chatUnsub=null;
let calDate=new Date(),selectedDate=dateKey(new Date());
let navStack=['inicio'];

const simpleSections={
  avisos:{title:'Avisos',subtitle:'Comunicados para os integrantes.',collection:'avisos',fields:[['titulo','Título','text'],['mensagem','Mensagem','textarea']]},
  arquivos:{title:'Arquivos',subtitle:'Links para documentos, cifras e materiais.',collection:'arquivos',fields:[['nome','Nome do arquivo','text'],['link','Link do arquivo','url'],['descricao','Descrição','textarea']]},
  multitracks:{title:'Multitracks',subtitle:'Organize links das multitracks do ministério.',collection:'multitracks',fields:[['musica','Música','text'],['tom','Tom','text'],['link','Link da multitrack','url'],['observacoes','Observações','textarea']]},
  links:{title:'Links Úteis',subtitle:'Links importantes para a equipe.',collection:'links',fields:[['nome','Nome','text'],['link','Endereço do link','url'],['descricao','Descrição','textarea']]}
};

// V9.6 - equipes e administração com permissões
const ADMIN_PERMISSION_LABELS={
  escalas:'Escalas e encontros',repertorios:'Repertórios',musicas:'Músicas',cifras:'Cifras',agenda:'Agenda',avisos:'Avisos',multitracks:'Multitracks',membros:'Membros',oracoes:'Ver/gerenciar orações',chats:'Administrar chats',comunicacao:'Comunicação privada'
};

// FIX ADM V9.6.2: alinhado às regras atuais do Firestore.
function userPermissions(u={}){
  if(u.role==='admin'&&u.adminPrincipal!==true)return (u.permissoes&&typeof u.permissoes==='object')?u.permissoes:{};
  if(u.role==='admin_limited')return (u.adminPermissions&&typeof u.adminPermissions==='object')?u.adminPermissions:{};
  return {};
}
function isLimitedAdmin(){return currentUserData?.role==='admin_limited'||(currentUserData?.role==='admin'&&currentUserData?.adminPrincipal!==true);}
function canManage(area){return isPrincipalAdmin||(isLimitedAdmin()&&userPermissions(currentUserData)?.[area]===true);}
function simplePermission(page){return page==='avisos'?'avisos':page==='multitracks'?'multitracks':page;}
function adminIdsFor(area){return usersCache.filter(u=>(u.role==='admin'&&u.adminPrincipal===true)||(((u.role==='admin'&&u.adminPrincipal!==true)||u.role==='admin_limited')&&userPermissions(u)?.[area]===true)).map(u=>u.id);}
function memberTeams(u={}){const e=Array.isArray(u.equipes)?u.equipes.filter(x=>x==='mvl'||x==='nova_geracao'):[];return e.length?e:['mvl'];}
function hasTeam(u,team){return memberTeams(u).includes(team);}
function teamName(team){return team==='nova_geracao'?'⚡ Nova Geração':'MVL';}
function teamBadges(u={}){return memberTeams(u).map(t=>`<span class="team-badge ${t}">${t==='nova_geracao'?'⚡ Nova Geração':'MVL'}</span>`).join(' ');}
function scaleTeam(s={}){return s.equipeResponsavel==='nova_geracao'?'nova_geracao':'mvl';}
function sortedUsersForTeam(team='mvl'){return usersCache.slice().sort((a,b)=>{const aa=hasTeam(a,team)?0:1,bb=hasTeam(b,team)?0:1;return aa-bb||(a.nome||a.email||'').localeCompare(b.nome||b.email||'');});}
function memberOptionHtml(u,selected=[]){return `<label class="multi-item"><input type="checkbox" value="${u.id}" ${selected.includes(u.id)?'checked':''}> ${memberIcon(u)} <span>${escapeHtml(u.nome||u.email||u.id)} ${u.funcao?`— ${escapeHtml(u.funcao)}`:''}</span><span class="member-team-inline">${teamBadges(u)}</span></label>`;}
function refreshEncounterMemberLists(){const team=$('scale-team')?.value||'mvl';document.querySelectorAll('.encounter-editor').forEach(box=>{const selected=[...box.querySelectorAll('.enc-members input:checked')].map(x=>x.value);const host=box.querySelector('.enc-members');if(host)host.innerHTML=sortedUsersForTeam(team).map(u=>memberOptionHtml(u,selected)).join('');});}
async function syncAdminPermissionsForPush(){if(!isPrincipalAdmin||!currentUser)return false;try{const idToken=await currentUser.getIdToken();const admins=usersCache.filter(u=>(u.role==='admin'&&u.adminPrincipal!==true)||u.role==='admin_limited').map(u=>({uid:u.id,permissions:userPermissions(u)}));const r=await fetch(MVL_PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,tipo:'admin_perms_sync',admins})});const j=await r.json().catch(()=>({ok:false}));return !!j.ok;}catch(e){console.warn('admin_perms_sync',e);return false;}}

const MVL_PUSH_ENDPOINT='https://script.google.com/macros/s/AKfycbwtNzufio5Gt_u9zrsMx-lMzei3o5dkFeaH_mE57TY04Yb3voX6IlOUSpS2HFcK_moD/exec';
const MVL_V10_MAX_PHOTO_BYTES=2*1024*1024;
async function chamarBackendV10(tipo,payload={}){
  if(!currentUser)throw new Error('Usuário não autenticado.');
  const idToken=await currentUser.getIdToken(true);
  const resp=await fetch(MVL_PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,tipo,...payload})});
  const data=await resp.json().catch(()=>({ok:false,erro:'Resposta inválida do servidor.'}));
  if(!resp.ok||data.ok===false)throw new Error(data.erro||data.error||`Falha no servidor (${resp.status}).`);
  return data;
}
function fotoUrlUsuario(u={}){return safeUrl(u.fotoUrl||u.photoURL||u.foto||u.avatarUrl||'');}
function memberAvatarHtml(u={},cls='member-avatar'){
  const url=fotoUrlUsuario(u);
  return url?`<img class="${cls}" src="${escapeAttr(url)}" alt="Foto de ${escapeAttr(u.nome||'integrante')}" referrerpolicy="no-referrer">`:`<span class="${cls} avatar-fallback">${memberIcon(u)}</span>`;
}
function arquivoParaDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('Não foi possível ler a imagem.'));r.readAsDataURL(file);});}
async function enviarFotoPerfil(file){
  if(!file)throw new Error('Selecione uma foto.');
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type))throw new Error('Use uma imagem JPG, PNG ou WEBP.');
  if(file.size>MVL_V10_MAX_PHOTO_BYTES)throw new Error('A foto deve ter no máximo 2 MB.');
  const dataUrl=await arquivoParaDataUrl(file),base64=dataUrl.split(',')[1]||'';
  const result=await chamarBackendV10('perfil_foto_upload',{uid:currentUser.uid,usuarioId:currentUser.uid,mimeType:file.type,nomeArquivo:file.name,fileName:file.name,imagemBase64:base64,base64,dataUrl});
  const fotoUrl=result.fotoUrl||result.url||result.webContentLink||result.downloadUrl||'';
  if(fotoUrl){await setDoc(doc(db,'usuarios',currentUser.uid),{fotoUrl,atualizadoEm:serverTimestamp()},{merge:true});currentUserData={...currentUserData,fotoUrl};}
  await refreshCaches();updateHeaderAvatar();return result;
}
async function excluirFotoPerfil(){
  await chamarBackendV10('perfil_foto_delete',{uid:currentUser.uid,usuarioId:currentUser.uid});
  await setDoc(doc(db,'usuarios',currentUser.uid),{fotoUrl:'',atualizadoEm:serverTimestamp()},{merge:true});
  currentUserData={...currentUserData,fotoUrl:''};await refreshCaches();updateHeaderAvatar();
}
async function acaoAdminUsuario(tipo,u,extra={}){
  if(!isPrincipalAdmin)throw new Error('Apenas o Administrador principal pode executar esta ação.');
  return chamarBackendV10(tipo,{usuarioId:u.id,uid:u.id,targetUid:u.id,email:u.email||'',...extra});
}
async function enviarPushMVL(tipo,titulo,mensagem,destinatarios=[],url='https://robertjuniorrj85-ux.github.io/App-MVL/'){
  const user=auth.currentUser;if(!user)return false;
  const ids=[...new Set((destinatarios||[]).filter(Boolean))];if(!ids.length)return false;
  let ultimoErro=null;
  for(let tentativa=1;tentativa<=2;tentativa++){
    try{
      const idToken=await user.getIdToken(true);
      const resposta=await fetch(MVL_PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,tipo,titulo,mensagem,destinatarios:ids,url})});
      const texto=await resposta.text();let resultado={};try{resultado=texto?JSON.parse(texto):{};}catch(_){resultado={ok:false,erro:'Resposta inválida do servidor.',resposta:texto};}
      if(resposta.ok&&resultado.ok===true)return true;
      ultimoErro=resultado;console.error(`Erro Push MVL (tentativa ${tentativa}):`,resultado);
      if(resultado?.status>=400&&resultado?.status<500)break;
    }catch(erro){ultimoErro=erro;console.error(`Falha ao enviar Push MVL (tentativa ${tentativa}):`,erro);}
    if(tentativa===1)await new Promise(r=>setTimeout(r,700));
  }
  console.error('Push MVL não enviado:',ultimoErro);return false;
}

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
  const [u,m,r,a,s,c]=await Promise.all([safeDocs('usuarios'),safeDocs('musicas'),safeDocs('repertorios'),safeDocs('agenda'),safeDocs('escalas'),safeDocs('cifras')]);
  usersCache=u;songsCache=m;repertoiresCache=r;agendasCache=a;scalesCache=s;chartsCache=c;
}

entrar.addEventListener('click',async()=>{
  if(!email.value.trim()||!senha.value){msg('Digite seu e-mail e sua senha.',true);return;}
  entrar.disabled=true;msg('Entrando...');
  try{
    await setPersistence(auth,browserLocalPersistence);
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo limite de autenticação.'),{code:'auth/timeout'})),15000));
    await Promise.race([signInWithEmailAndPassword(auth,email.value.trim(),senha.value),timeout]);
    senha.value='';
  }
  catch(e){
    console.error('Login MVL',e);
    const map={'auth/invalid-credential':'E-mail ou senha incorretos.','auth/invalid-email':'Digite um e-mail válido.','auth/too-many-requests':'Muitas tentativas. Aguarde um pouco.','auth/network-request-failed':'Sem conexão com a internet.','auth/timeout':'A autenticação demorou demais. Atualize o app e tente novamente.'};
    msg(map[e.code]||`Não foi possível entrar${e.code?' ('+e.code+')':''}.`,true);
  }
  finally{entrar.disabled=false;}
});
senha.addEventListener('keydown',e=>{if(e.key==='Enter')entrar.click();});
async function fazerLogout(){
  try{window.MVLOneSignal?.logout();}catch{}
  await signOut(auth);
}

$('sair')?.addEventListener('click', fazerLogout);
$('side-logout')?.addEventListener('click', fazerLogout);

$('voltar')?.addEventListener('click',()=>{
  if(chatUnsub){
    chatUnsub();
    chatUnsub=null;
  }
  goHome();
});
cancelEditBtn.addEventListener('click',resetEditor);
$('notif-bell').addEventListener('click',()=>openSection('notificacoes'));
$('header-profile')?.addEventListener('click',()=>openSection('perfil'));
$('brand-home')?.addEventListener('click',()=>goHome());
const closeSideMenu=()=>{$('side-menu')?.classList.add('hide');$('menu-backdrop')?.classList.add('hide');};
const openSideMenu=()=>{$('side-menu')?.classList.remove('hide');$('menu-backdrop')?.classList.remove('hide');};
$('menu-toggle')?.addEventListener('click',openSideMenu);$('menu-close')?.addEventListener('click',closeSideMenu);$('menu-backdrop')?.addEventListener('click',closeSideMenu);$('nav-more')?.addEventListener('click',openSideMenu);document.querySelectorAll('.side-menu-links [data-page]').forEach(b=>b.addEventListener('click',()=>{closeSideMenu();const p=b.dataset.page;p==='inicio'?goHome():openSection(p);}));

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
  currentUserData=snap.data()||{};isPrincipalAdmin=currentUserData.role==='admin'&&currentUserData.adminPrincipal===true;isAdmin=isPrincipalAdmin||isLimitedAdmin();
  await setDoc(userRef,{email:user.email,ultimoAcesso:serverTimestamp()},{merge:true}).catch(()=>{});
  updateRoleUI();updateHeaderAvatar();saudacao.textContent='Olá, '+(currentUserData.nome||user.displayName||user.email.split('@')[0])+'!';
  await refreshCaches();if(isPrincipalAdmin)await migrateLegacyAdminSchema();bindNotifications();await identifyOneSignal();if(isPrincipalAdmin)syncAdminPermissionsForPush().catch(()=>{});await renderNextScale();goHome();await handleDeepLink();
  if(canManage('escalas')||canManage('membros'))syncAllScheduledData().catch(e=>console.warn('Sincronização agendada',e));
  if(currentUserData.mustChangePassword===true)showPasswordModal();
});

async function identifyOneSignal(){
  if(!currentUser)return false;
  const uid=String(currentUser.uid||'').trim();
  if(!uid)return false;
  try{
    let os=window.MVLOneSignal;
    if(!os){
      os=await new Promise(resolve=>{
        let finished=false;
        const done=()=>{if(finished)return;finished=true;resolve(window.MVLOneSignal||null);};
        window.addEventListener('mvl-onesignal-ready',done,{once:true});
        const started=Date.now();
        const timer=setInterval(()=>{
          if(window.MVLOneSignal){clearInterval(timer);done();}
          else if(Date.now()-started>12000){clearInterval(timer);done();}
        },250);
      });
    }
    if(!os)return false;

    // O backend envia por include_aliases.external_id. Portanto cada aparelho
    // precisa estar explicitamente associado ao UID do Firebase que está logado.
    await os.login(uid);
    await new Promise(r=>setTimeout(r,350));

    let externalId=String(os.User?.externalId||'').trim();
    if(externalId!==uid){
      // Reforça a associação quando existe uma inscrição antiga/órfã no aparelho.
      await os.login(uid);
      await new Promise(r=>setTimeout(r,700));
      externalId=String(os.User?.externalId||'').trim();
    }

    if(os.User?.addTags)await os.User.addTags({role:isAdmin?'admin':'member',mvl:'true',firebase_uid:uid});

    // Se a permissão já foi concedida mas a inscrição ficou desativada, reativa-a.
    if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&os.User?.PushSubscription){
      const ps=os.User.PushSubscription;
      if(ps.optedIn===false&&typeof ps.optIn==='function'){
        try{await ps.optIn();}catch(e){console.warn('OneSignal optIn',e);}
      }
    }

    console.info('OneSignal MVL identificado',{uid,externalId:String(os.User?.externalId||'')});
    return String(os.User?.externalId||'').trim()===uid;
  }catch(e){console.warn('OneSignal user',e);return false;}
}
// Revalida a associação após o app voltar do segundo plano ou ser reaberto.
window.addEventListener('focus',()=>{if(auth.currentUser)identifyOneSignal().catch(()=>{});});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&auth.currentUser)identifyOneSignal().catch(()=>{});});
function updateRoleUI(){roleBadge.textContent=isPrincipalAdmin?'Administrador principal':isLimitedAdmin()?'Administrador':'Integrante';roleBadge.classList.toggle('admin',isAdmin);}
function updateHeaderAvatar(){const host=$('header-avatar');if(!host)return;const url=fotoUrlUsuario(currentUserData||{});host.innerHTML=url?`<img src="${escapeAttr(url)}" alt="Perfil" referrerpolicy="no-referrer">`:memberIcon(currentUserData||{});}
async function handleDeepLink(){const q=new URLSearchParams(location.search),open=q.get('open'),id=q.get('id');if(!open)return;try{if(open==='scalechat'&&id)await openScaleChat(id);else if(open==='comunicacao')await openSection('comunicacao');else if(open==='notificacoes')await openSection('notificacoes');}finally{history.replaceState(history.state,'',location.pathname+location.hash);}}
async function openNotificationTarget(n){if(!n)return;if(n.lida!==true)await updateDoc(doc(db,'notificacoes',n.id),{lida:true,lidaEm:serverTimestamp()}).catch(()=>{});if(n.tipo==='chat_escala'&&n.refId)return openScaleChat(n.refId);if(n.tipo==='mensagem')return openSection('comunicacao');if(n.tipo==='agenda')return openSection('agenda');if(n.tipo==='confirmacao_escala'&&n.refId)return openScaleDetail(n.refId);return openSection('notificacoes');}
function pushNav(page){if(navStack[navStack.length-1]!==page){navStack.push(page);history.pushState({mvl:true,page},'','#'+page);}}
function goHome(fromPop=false){currentPage='inicio';editingId=null;homeView.classList.remove('hide');sectionView.classList.add('hide');setActiveNav('inicio');renderNextScale().catch(e=>console.error('Próximo culto',e));renderPrayerCard().catch(e=>{console.error('Oração Home',e);const h=$('prayer-card');if(h)h.innerHTML='<p class=\"muted\">Não foi possível carregar o espaço de oração.</p>';});renderBirthdayCard().catch(e=>{console.error('Aniversariantes Home',e);const h=$('birthday-card');if(h)h.innerHTML='<p class=\"muted\">Não foi possível carregar os aniversariantes.</p>';});if(!fromPop)pushNav('inicio');}
window.addEventListener('popstate',()=>{if(chatUnsub){chatUnsub();chatUnsub=null;}if(navStack.length>1)navStack.pop();const target=navStack[navStack.length-1]||'inicio';if(target==='inicio')goHome(true);else openSection(target,true);});
function setActiveNav(page){document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));}
function showSectionHeader(title,subtitle){sectionTitle.textContent=title;sectionSubtitle.textContent=subtitle;}
function resetEditor(){editingId=null;cancelEditBtn.classList.add('hide');saveBtn.textContent='Salvar';openSection(currentPage);}

async function openSection(page,fromPop=false){
  if(chatUnsub){chatUnsub();chatUnsub=null;}
  currentPage=page;editingId=null;homeView.classList.add('hide');sectionView.classList.remove('hide');setActiveNav(page);if(!fromPop)pushNav(page);
  sectionSpecial.innerHTML='';dynamicForm.innerHTML='';listEl.innerHTML='';cancelEditBtn.classList.add('hide');saveBtn.textContent='Salvar';
  if(simpleSections[page])return renderSimpleSection(page);
  if(page==='musicas')return renderSongs();if(page==='cifras')return renderCharts();if(page==='escalas')return renderScales();if(page==='repertorio')return renderRepertoires();
  if(page==='agenda')return renderAgenda();if(page==='calendario')return renderCalendar();if(page==='comunicacao')return renderCommunication();
  if(page==='perfil')return renderProfile();if(page==='membros')return renderMembers();if(page==='notificacoes')return renderNotifications();
}

function makeField(key,label,type,value=''){if(type==='textarea')return `<textarea id="f-${key}" placeholder="${escapeAttr(label)}">${escapeHtml(value)}</textarea>`;return `<input id="f-${key}" type="${type}" placeholder="${escapeAttr(label)}" value="${escapeAttr(value)}">`;}
function collectFields(fields){const data={};for(const [key] of fields)data[key]=($('f-'+key)?.value||'').trim();return data;}
function renderValue(v){if(typeof v==='string'&&safeUrl(v))return `<a class="link-btn" href="${escapeAttr(v)}" target="_blank" rel="noopener">Abrir link</a>`;return escapeHtml(v);}

function addSearchBox(placeholder,onInput){
  const wrap=document.createElement('div');wrap.className='search-box';wrap.innerHTML=`<span>🔎</span><input type="search" placeholder="${escapeAttr(placeholder)}">`;
  sectionSpecial.appendChild(wrap);wrap.querySelector('input').addEventListener('input',e=>onInput(e.target.value.toLowerCase().trim()));return wrap;
}
function filterCards(term){document.querySelectorAll('#items-list .item-card').forEach(c=>c.classList.toggle('hide',term&&!c.textContent.toLowerCase().includes(term)));}

async function renderSimpleSection(page){
  const cfg=simpleSections[page];const allowed=canManage(simplePermission(page));showSectionHeader(cfg.title,cfg.subtitle);adminPanel.classList.toggle('hide',!allowed);
  if(allowed){$('form-title').textContent='Adicionar';dynamicForm.innerHTML='<div class="form-grid">'+cfg.fields.map(([k,l,t])=>makeField(k,l,t)).join('')+'</div>';saveBtn.onclick=()=>saveSimple(cfg);}
  await loadSimpleItems(cfg);if(['cifras','arquivos','multitracks'].includes(page))addSearchBox(`Pesquisar em ${cfg.title.toLowerCase()}...`,filterCards);
}
async function saveSimple(cfg){
  if(!canManage(simplePermission(currentPage)))return;const data=collectFields(cfg.fields);if(!Object.values(data).some(Boolean)){alert('Preencha pelo menos um campo.');return;}
  saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,cfg.collection,editingId),{...data,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else await addDoc(collection(db,cfg.collection),{...data,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});await renderSimpleSection(currentPage);}catch(e){console.error(e);alert('Não foi possível salvar.');}finally{saveBtn.disabled=false;}
}
async function loadSimpleItems(cfg){
  const items=(await safeDocs(cfg.collection)).sort(byCreatedDesc);listEl.innerHTML='';if(!items.length){listEl.innerHTML='<div class="empty">Nenhum item cadastrado ainda.</div>';return;}
  for(const item of items){const values=cfg.fields.map(([k,l])=>[l,item[k]]).filter(([,v])=>v);const primary=values[0]?.[1]||cfg.title;const rest=values.slice(1).map(([l,v])=>{if(cfg.collection==='cifras'&&l==='Link do PDF da cifra'&&safeUrl(v))return `<div class="item-meta"><a class="link-btn" href="${escapeAttr(v)}" target="_blank" rel="noopener">📄 Abrir Cifra</a></div>`;return `<div class="item-meta"><b>${escapeHtml(l)}:</b> ${renderValue(v)}</div>`;}).join('');const card=document.createElement('div');card.className='item-card';card.innerHTML=`<h3>${escapeHtml(primary)}</h3>${rest}${canManage(simplePermission(currentPage))?'<div class="item-actions"><button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button></div>':''}`;
    if(canManage(simplePermission(currentPage))){card.querySelector('.edit-btn').onclick=()=>{editingId=item.id;$('form-title').textContent='Editar';saveBtn.textContent='Atualizar';cancelEditBtn.classList.remove('hide');dynamicForm.innerHTML='<div class="form-grid">'+cfg.fields.map(([k,l,t])=>makeField(k,l,t,item[k]||'')).join('')+'</div>';saveBtn.onclick=()=>saveSimple(cfg);window.scrollTo({top:0,behavior:'smooth'});};card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir este item?')){await deleteDoc(doc(db,cfg.collection,item.id));renderSimpleSection(currentPage);}};}
    listEl.appendChild(card);
  }
}

// CIFRAS V9.5 - fonte única: música + tom + padrão/cantor
function singerUsers(){return usersCache.filter(u=>/cant|vocal|back|voz/i.test(u.funcao||''));}
function chartSongId(c={}){return c.musicaId||'';}
function chartSingerId(c={}){return c.cantorId||'';}
function findChartForSong(songId,cantorId=''){
  const list=chartsCache.filter(c=>chartSongId(c)===songId || (!chartSongId(c)&&String(c.musica||'').trim().toLowerCase()===String(songById(songId)?.titulo||'').trim().toLowerCase()));
  return list.find(c=>chartSingerId(c)===cantorId) || list.find(c=>!chartSingerId(c)) || null;
}
function resolvedSong(songId,cantorId='',fallback={}){
  const song=songById(songId)||{};const c=findChartForSong(songId,cantorId);
  return {song,cifra:c,tom:c?.tom||fallback.tom||song.tomOriginal||song.tom||'',cifraLink:c?.link||fallback.cifraLink||song.cifraLink||'',cantorId:c?.cantorId||cantorId||'',cantorNome:c?.cantorNome||(c?.cantorId?userName(c.cantorId):''),origem:c?(c.cantorId?'cantor':'padrao'):'legado'};
}
async function renderCharts(editItem=null){
  showSectionHeader('Cifras','Cadastre cada cifra uma vez e vincule ao cantor ou deixe como Padrão / Todos.');await refreshCaches();const allowed=canManage('cifras');adminPanel.classList.toggle('hide',!allowed);
  if(allowed){const d=editItem||{};$('form-title').textContent=editItem?'Editar cifra':'Nova cifra';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';
    const singers=singerUsers();dynamicForm.innerHTML=`<div class="form-grid"><select id="chart-song"><option value="">Selecione a música</option>${songsCache.map(m=>`<option value="${m.id}" ${d.musicaId===m.id?'selected':''}>${escapeHtml(m.titulo||'Música')}</option>`).join('')}</select><input id="chart-key" placeholder="Tom da cifra" value="${escapeAttr(d.tom||'')}"><select id="chart-owner"><option value="padrao" ${!d.cantorId?'selected':''}>🌐 Padrão / Todos</option><option value="cantor" ${d.cantorId?'selected':''}>🎤 Cantor específico</option></select><select id="chart-singer" class="${d.cantorId?'':'hide'}"><option value="">Selecione o cantor</option>${singers.map(u=>`<option value="${u.id}" ${d.cantorId===u.id?'selected':''}>${memberIcon(u)} ${escapeHtml(u.nome||u.email||u.id)}</option>`).join('')}</select><input id="chart-link" type="url" placeholder="Link do PDF no Google Drive" value="${escapeAttr(d.link||'')}"><textarea id="chart-note" placeholder="Observações">${escapeHtml(d.observacoes||'')}</textarea><small class="muted">Se todos cantarem no mesmo tom, use Padrão / Todos. Uma cifra específica do cantor terá prioridade automática nas escalas.</small></div>`;
    $('chart-owner').onchange=()=>{$('chart-singer').classList.toggle('hide',$('chart-owner').value!=='cantor');};saveBtn.onclick=saveChart;
  }
  addSearchBox('Pesquisar música, cantor ou tom...',filterCards);listEl.innerHTML='';if(!chartsCache.length){listEl.innerHTML='<div class="empty">Nenhuma cifra cadastrada.</div>';return;}
  chartsCache.slice().sort((a,b)=>(a.musica||'').localeCompare(b.musica||'')).forEach(c=>{const song=songById(c.musicaId)||{};const card=document.createElement('div');card.className='item-card';card.innerHTML=`<h3>🎼 ${escapeHtml(song.titulo||c.musica||'Cifra')}</h3><div class="item-meta"><b>Tom:</b> ${escapeHtml(c.tom||'—')}</div><div class="item-meta">${c.cantorId?'🎤 '+escapeHtml(c.cantorNome||userName(c.cantorId)):'🌐 Padrão / Todos'}</div>${c.observacoes?`<div class="item-meta">${escapeHtml(c.observacoes)}</div>`:''}<div class="item-actions">${safeUrl(c.link)?`<a class="link-btn" href="${escapeAttr(c.link)}" target="_blank" rel="noopener">🎼 Abrir Cifra</a>`:''}${allowed?'<button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button>':''}</div>`;if(allowed){card.querySelector('.edit-btn').onclick=()=>{renderCharts(c);window.scrollTo({top:0,behavior:'smooth'});};card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir esta cifra?')){await deleteDoc(doc(db,'cifras',c.id));await refreshCaches();renderCharts();}};}listEl.appendChild(card);});
}
async function saveChart(){
  const musicaId=$('chart-song').value,tom=$('chart-key').value.trim(),link=$('chart-link').value.trim(),owner=$('chart-owner').value,cantorId=owner==='cantor'?$('chart-singer').value:'';if(!musicaId||!tom||!link){alert('Selecione a música e informe o tom e o link da cifra.');return;}if(owner==='cantor'&&!cantorId){alert('Selecione o cantor.');return;}const song=songById(musicaId)||{};const duplicate=chartsCache.find(c=>c.id!==editingId&&chartSongId(c)===musicaId&&chartSingerId(c)===cantorId);if(duplicate&&!confirm(`Já existe uma cifra ${cantorId?'para este cantor':'Padrão / Todos'} nesta música. Deseja salvar outra mesmo assim?`))return;
  const data={musicaId,musica:song.titulo||'',tom,link,cantorId,cantorNome:cantorId?userName(cantorId):'',observacoes:$('chart-note').value.trim()};saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'cifras',editingId),{...data,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else await addDoc(collection(db,'cifras'),{...data,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});editingId=null;await refreshCaches();renderCharts();}catch(e){console.error(e);alert('Não foi possível salvar a cifra.');}finally{saveBtn.disabled=false;}
}

// MÚSICAS + VERSÕES POR CANTOR/TOM
async function renderSongs(editItem=null){
  showSectionHeader('Músicas','Cadastre uma música uma única vez e registre versões por cantor e tom.');songsCache=await safeDocs('musicas');usersCache=await safeDocs('usuarios');const allowed=canManage('musicas');adminPanel.classList.toggle('hide',!allowed);
  if(allowed){$('form-title').textContent=editItem?'Editar música':'Nova música';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';
    const d=editItem||{};dynamicForm.innerHTML=`<div class="form-grid">
      <input id="song-title" placeholder="Título da música" value="${escapeAttr(d.titulo||'')}">
      <input id="song-artist" placeholder="Artista / referência" value="${escapeAttr(d.artistaReferencia||d.artista||'')}">
      <input id="song-key" placeholder="Tom original" value="${escapeAttr(d.tomOriginal||d.tom||'')}">
      <input id="song-listen" type="url" placeholder="Link para ouvir (YouTube etc.)" value="${escapeAttr(d.ouvirLink||d.link||'')}">
      <input id="song-multi" type="url" placeholder="Link da multitrack" value="${escapeAttr(d.multitrackLink||'')}">
      <textarea id="song-note" placeholder="Observações">${escapeHtml(d.observacoes||'')}</textarea>
      <small class="muted">🎼 Tons e cifras por cantor agora são cadastrados na aba Cifras.</small>
    </div>`;saveBtn.onclick=saveSong;}
  addSearchBox('Pesquisar música, artista, cantor ou tom...',filterCards);
  listEl.innerHTML='';if(!songsCache.length){listEl.innerHTML='<div class="empty">Nenhuma música cadastrada.</div>';return;}
  songsCache.sort((a,b)=>(a.titulo||'').localeCompare(b.titulo||''));
  for(const s of songsCache){const card=document.createElement('div');card.className='item-card';const linked=chartsCache.filter(c=>chartSongId(c)===s.id).map(c=>`${c.cantorId?(c.cantorNome||userName(c.cantorId)):'Padrão'} — ${c.tom||'sem tom'}`).join(' • ');card.innerHTML=`<h3>🎵 ${escapeHtml(s.titulo||'Sem título')}</h3><div class="item-meta">${escapeHtml(s.artistaReferencia||s.artista||'')}</div><div class="item-meta"><b>Tom original:</b> ${escapeHtml(s.tomOriginal||s.tom||'—')}</div>${linked?`<div class="item-meta"><b>Cifras/Tons:</b> ${escapeHtml(linked)}</div>`:''}<div class="item-actions">${safeUrl(s.ouvirLink||s.link)?`<a class="link-btn" href="${escapeAttr(s.ouvirLink||s.link)}" target="_blank" rel="noopener">▶️ Ouvir</a>`:''}${safeUrl(s.multitrackLink)?`<a class="link-btn" href="${escapeAttr(s.multitrackLink)}" target="_blank" rel="noopener">🎚️ Multitrack</a>`:''}${allowed?'<button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button>':''}</div>`;
    if(allowed){card.querySelector('.edit-btn').onclick=()=>renderSongs(s);card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir esta música?')){await deleteDoc(doc(db,'musicas',s.id));renderSongs();}};}listEl.appendChild(card);}
}
function renderVersionRows(rows){const el=$('version-list');el.innerHTML='';(rows.length?rows:[{}]).forEach(addVersionRow);}
function addVersionRow(v={}){const el=$('version-list');if(!el)return;const row=document.createElement('div');row.className='version-row';row.innerHTML=`<select class="v-singer"><option value="">Selecione o cantor</option>${usersCache.map(u=>`<option value="${u.id}" ${v.cantorId===u.id?'selected':''}>${escapeHtml(u.nome||u.email||u.id)}</option>`).join('')}</select><input class="v-key" placeholder="Tom" value="${escapeAttr(v.tom||'')}"><input class="v-chart" type="url" placeholder="Cifra específica (opcional)" value="${escapeAttr(v.cifraLink||'')}"><input class="v-listen" type="url" placeholder="Link para ouvir (opcional)" value="${escapeAttr(v.ouvirLink||'')}"><input class="v-multi" type="url" placeholder="Multitrack (opcional)" value="${escapeAttr(v.multitrackLink||'')}"><button type="button" class="danger remove-version">Remover</button>`;row.querySelector('.remove-version').onclick=()=>row.remove();el.appendChild(row);}
async function saveSong(){
  const titulo=$('song-title').value.trim();if(!titulo){alert('Informe o título da música.');return;}
  const data={titulo,artistaReferencia:$('song-artist').value.trim(),tomOriginal:$('song-key').value.trim(),ouvirLink:$('song-listen').value.trim(),multitrackLink:$('song-multi').value.trim(),observacoes:$('song-note').value.trim()};
  saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'musicas',editingId),{...data,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else await addDoc(collection(db,'musicas'),{...data,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});editingId=null;await refreshCaches();renderSongs();}catch(e){console.error(e);alert('Não foi possível salvar a música.');}finally{saveBtn.disabled=false;}
}

// REPERTÓRIO DETALHADO
async function renderRepertoires(editItem=null){
  showSectionHeader('Repertório','Abra um repertório para ver músicas, cantores, tons, cifras e links.');await refreshCaches();const allowed=canManage('repertorios');adminPanel.classList.toggle('hide',!allowed);
  if(allowed){$('form-title').textContent=editItem?'Editar repertório':'Novo repertório';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';const d=editItem||{};dynamicForm.innerHTML=`<div class="form-grid">
      <input id="rep-name" placeholder="Nome do repertório / Culto" value="${escapeAttr(d.nome||'')}">
      <input id="rep-date" type="date" value="${escapeAttr(d.data||'')}">
      <textarea id="rep-note" placeholder="Observações">${escapeHtml(d.observacoes||'')}</textarea>
      <div class="subpanel"><b>Selecione as músicas</b><div class="multi-list" id="rep-song-options">${songsCache.length?songsCache.map(s=>`<label class="multi-item"><input class="rep-check" type="checkbox" value="${s.id}"> ${escapeHtml(s.titulo||'Sem título')}</label>`).join(''):'<span class="muted">Cadastre músicas primeiro.</span>'}</div><div id="rep-config-list" class="rep-config-list"></div></div>
    </div>`;wireRepSelector(d.musicaItens||legacyRepItems(d));saveBtn.onclick=saveRepertoire;}
  addSearchBox('Pesquisar repertório...',filterCards);
  listEl.innerHTML='';if(!repertoiresCache.length){listEl.innerHTML='<div class="empty">Nenhum repertório cadastrado.</div>';return;}
  repertoiresCache.sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  for(const r of repertoiresCache){const card=document.createElement('div');card.className='item-card';const count=(r.musicaItens||legacyRepItems(r)).length;card.innerHTML=`<h3>🎵 ${escapeHtml(r.nome||'Repertório')}</h3><div class="item-meta">${dateBR(r.data)}</div><div class="item-meta">${count} música${count===1?'':'s'}</div><div class="item-actions"><button class="confirm-btn open-rep">Abrir repertório</button>${allowed?'<button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button>':''}</div>`;card.querySelector('.open-rep').onclick=()=>openRepertoireDetail(r.id,'repertorio');if(allowed){card.querySelector('.edit-btn').onclick=()=>renderRepertoires(r);card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir repertório?')){await deleteDoc(doc(db,'repertorios',r.id));await refreshCaches();renderRepertoires();}};}listEl.appendChild(card);}
}
function legacyRepItems(r){return (r.musicaIds||[]).map((id,i)=>{const s=songById(id)||{};return {musicaId:id,cantorId:'',cantorNome:'',tom:s.tomOriginal||s.tom||'',cifraLink:s.cifraLink||'',ouvirLink:s.ouvirLink||s.link||'',multitrackLink:s.multitrackLink||'',ordem:i+1};});}
function wireRepSelector(existing=[]){
  const existingMap=new Map(existing.map(i=>[i.musicaId,i]));document.querySelectorAll('.rep-check').forEach(ch=>{if(existingMap.has(ch.value))ch.checked=true;ch.onchange=renderRepConfigs;});renderRepConfigs(existingMap);
}
function renderRepConfigs(existingMap){
  const map=existingMap instanceof Map?existingMap:new Map();const host=$('rep-config-list');if(!host)return;host.innerHTML='';const selected=[...document.querySelectorAll('.rep-check:checked')];
  selected.forEach((ch,idx)=>{const songId=ch.value,s=songById(songId)||{},old=map.get(songId)||{};const row=document.createElement('div');row.className='rep-config';row.dataset.songId=songId;row.dataset.cantorId=old.cantorId||'';const resolved=resolvedSong(songId,old.cantorId||'',old);row.dataset.cifraLink=resolved.cifraLink||'';row.innerHTML=`<div class="rep-order">${idx+1}</div><div class="rep-config-body"><b>${escapeHtml(s.titulo||'Música')}</b><select class="rep-singer-select"><option value="">🌐 Padrão / Todos</option>${singerUsers().map(u=>`<option value="${u.id}" ${old.cantorId===u.id?'selected':''}>🎤 ${escapeHtml(u.nome||u.email||u.id)}</option>`).join('')}</select><input class="rep-key" placeholder="Tom" value="${escapeAttr(resolved.tom||'')}"><div class="chart-source">${resolved.cifraLink?`🎼 Cifra vinculada: <b>${resolved.origem==='cantor'?'cantor':'Padrão / Todos'}</b>`:'⚠️ Nenhuma cifra vinculada ainda'}</div><input class="rep-listen" type="url" placeholder="Link para ouvir" value="${escapeAttr(old.ouvirLink||s.ouvirLink||s.link||'')}"><input class="rep-multi" type="url" placeholder="Multitrack" value="${escapeAttr(old.multitrackLink||s.multitrackLink||'')}"></div>`;
    const sel=row.querySelector('.rep-singer-select');sel.onchange=()=>{const cid=sel.value,r=resolvedSong(songId,cid,{});row.dataset.cantorId=cid;row.dataset.cifraLink=r.cifraLink||'';row.querySelector('.rep-key').value=r.tom||'';row.querySelector('.chart-source').innerHTML=r.cifraLink?`🎼 Cifra vinculada: <b>${r.origem==='cantor'?'cantor':'Padrão / Todos'}</b>`:'⚠️ Nenhuma cifra vinculada ainda';};host.appendChild(row);});
}
async function saveRepertoire(){
  const nome=$('rep-name').value.trim(),data=$('rep-date').value,observacoes=$('rep-note').value.trim();if(!nome){alert('Informe o nome do repertório.');return;}
  const musicaItens=[...document.querySelectorAll('.rep-config')].map((r,i)=>{const cid=r.dataset.cantorId||'';const song=songById(r.dataset.songId)||{};const rr=resolvedSong(r.dataset.songId,cid,{tom:r.querySelector('.rep-key').value.trim(),cifraLink:r.dataset.cifraLink||''});return {musicaId:r.dataset.songId,cantorId:cid,cantorNome:cid?userName(cid):'',tom:r.querySelector('.rep-key').value.trim()||rr.tom,cifraLink:rr.cifraLink||'',ouvirLink:r.querySelector('.rep-listen').value.trim()||song.ouvirLink||'',multitrackLink:r.querySelector('.rep-multi').value.trim()||song.multitrackLink||'',ordem:i+1};});
  const payload={nome,data,observacoes,musicaItens,musicaIds:musicaItens.map(i=>i.musicaId)};saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'repertorios',editingId),{...payload,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else await addDoc(collection(db,'repertorios'),{...payload,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});editingId=null;await refreshCaches();renderRepertoires();}catch(e){console.error(e);alert('Não foi possível salvar o repertório.');}finally{saveBtn.disabled=false;}
}
async function openRepertoireDetail(repId,backPage='repertorio',cantorId=''){
  await refreshCaches();const r=repById(repId);if(!r){alert('Repertório não encontrado.');return;}currentPage='rep-detalhe';homeView.classList.add('hide');sectionView.classList.remove('hide');showSectionHeader(r.nome||'Repertório',`${dateBR(r.data)} • músicas e links`);adminPanel.classList.add('hide');sectionSpecial.innerHTML=`<button id="back-rep" class="back-inline">← Voltar para ${backPage==='escalas'?'escalas':'repertórios'}</button>${r.observacoes?`<div class="readonly-note">${escapeHtml(r.observacoes)}</div>`:''}`;$('back-rep').onclick=()=>openSection(backPage);listEl.innerHTML='';const items=(r.musicaItens||legacyRepItems(r)).sort((a,b)=>(a.ordem||0)-(b.ordem||0));if(!items.length){listEl.innerHTML='<div class="empty">Nenhuma música neste repertório.</div>';return;}
  items.forEach((it,i)=>{const s=songById(it.musicaId)||{},rr=resolvedSong(it.musicaId,cantorId||it.cantorId||'',it);const card=document.createElement('div');card.className='item-card repertoire-song';card.innerHTML=`<div class="song-number">${i+1}</div><div><h3>${escapeHtml(s.titulo||'Música')}</h3>${cantorId?`<div class="item-meta">🎤 ${escapeHtml(userName(cantorId))}</div>`:(it.cantorNome?`<div class="item-meta">🎤 ${escapeHtml(it.cantorNome)}</div>`:'')}<div class="item-meta"><b>Tom:</b> ${escapeHtml(rr.tom||'—')} ${rr.origem==='padrao'?'<small>🌐 Padrão</small>':rr.origem==='cantor'?'<small>🎤 Cantor</small>':''}</div>${s.observacoes?`<div class="item-meta">${escapeHtml(s.observacoes)}</div>`:''}<div class="item-actions">${safeUrl(it.ouvirLink)?`<a class="link-btn" href="${escapeAttr(it.ouvirLink)}" target="_blank" rel="noopener">▶️ Ouvir</a>`:''}${safeUrl(rr.cifraLink)?`<a class="link-btn" href="${escapeAttr(rr.cifraLink)}" target="_blank" rel="noopener">🎼 Abrir Cifra</a>`:''}${safeUrl(it.multitrackLink)?`<a class="link-btn" href="${escapeAttr(it.multitrackLink)}" target="_blank" rel="noopener">🎚️ Multitrack</a>`:''}</div></div>`;listEl.appendChild(card);});
}

// ESCALAS + ENCONTROS + CHAT - V9.4
function uidKey(){return 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function scaleEncounters(s={}){
  if(Array.isArray(s.encontros)&&s.encontros.length)return s.encontros.map((e,i)=>({...e,id:e.id||`e${i+1}`,integranteIds:e.integranteIds||[],alertas:Array.isArray(e.alertas)?e.alertas:[]}));
  if(s.data||s.evento){
    const alertas=[];const l=s.lembretes||{};
    if(l.vespera?.ativo&&s.data){const d=new Date(s.data+'T12:00:00');d.setDate(d.getDate()-1);alertas.push({id:uidKey(),data:dateKey(d),hora:l.vespera.hora||'18:00'});}
    if(l.dia?.ativo&&s.data)alertas.push({id:uidKey(),data:s.data,hora:l.dia.hora||'08:00'});
    return [{id:'principal',nome:s.evento||'Culto / Evento',data:s.data||'',horario:s.horario||'',integranteIds:s.integranteIds||[],alertas,principal:true}];
  }
  return [];
}
function scaleParticipants(s={}){return [...new Set(scaleEncounters(s).flatMap(e=>e.integranteIds||[]))];}
function principalEncounter(s={}){const es=scaleEncounters(s);return es.find(e=>e.principal)||es.slice().sort((a,b)=>(a.data+(a.horario||'')).localeCompare(b.data+(b.horario||''))).at(-1)||null;}
function encounterDateTime(e={}){return (e.data||'')+'T'+(e.horario||'23:59');}
function encounterIsConcluded(e={},now=new Date()){if(!e.data)return false;const limite=new Date(`${e.data}T${e.horario||'23:59'}:00`);return !Number.isNaN(limite.getTime())&&limite.getTime()<now.getTime();}
function scaleIsConcluded(s={},now=new Date()){const es=scaleEncounters(s).filter(e=>e.data);return es.length>0&&es.every(e=>encounterIsConcluded(e,now));}
function nextEncounterOfScale(s={},now=new Date()){return scaleEncounters(s).filter(e=>e.data&&!encounterIsConcluded(e,now)).sort((a,b)=>encounterDateTime(a).localeCompare(encounterDateTime(b)))[0]||null;}
function latestEncounterOfScale(s={}){return scaleEncounters(s).filter(e=>e.data).sort((a,b)=>encounterDateTime(b).localeCompare(encounterDateTime(a)))[0]||null;}
function scaleSingerName(s={}){return s.cantorNome||userName(s.cantorId)||'Cantor não informado';}
function scrollToAdminForm(){setTimeout(()=>adminPanel?.scrollIntoView({behavior:'smooth',block:'start'}),80);}
function addAlertRow(host,data={}){
  const row=document.createElement('div');row.className='alert-row';row.dataset.id=data.id||uidKey();
  row.innerHTML=`<span>🔔</span><input class="alert-date" type="date" value="${escapeAttr(data.data||'')}"><input class="alert-time" type="time" value="${escapeAttr(data.hora||'')}"><button type="button" class="danger remove-alert">Remover</button>`;
  row.querySelector('.remove-alert').onclick=()=>row.remove();host.appendChild(row);
}
function addEncounterRow(data={}){
  const host=$('encounter-list');if(!host)return;const id=data.id||uidKey();const box=document.createElement('div');box.className='encounter-editor';box.dataset.id=id;
  box.innerHTML=`<div class="encounter-head"><b>📅 Encontro</b><button type="button" class="danger remove-encounter">Remover encontro</button></div><input class="enc-name" placeholder="Nome: Ensaio Vocal, Ensaio Geral, Culto..." value="${escapeAttr(data.nome||'')}"><div class="form-grid two"><input class="enc-date" type="date" value="${escapeAttr(data.data||'')}"><input class="enc-time" type="time" value="${escapeAttr(data.horario||'')}"></div><label class="checkbox-row"><input class="enc-principal" type="radio" name="enc-principal" ${data.principal?'checked':''}><span><b>Evento principal</b><br><small class="muted">Marca este encontro como referência principal da escala. Não interfere na ordem cronológica da Home.</small></span></label><div><small class="muted">Participantes deste encontro</small><div class="multi-list enc-members">${sortedUsersForTeam($('scale-team')?.value||'mvl').map(u=>memberOptionHtml(u,data.integranteIds||[])).join('')}</div></div><div class="subpanel"><div class="subpanel-head"><b>🔔 Alertas personalizados</b><button type="button" class="secondary small-btn add-alert">+ Adicionar alerta</button></div><small class="muted">Escolha qualquer data e hora antes deste encontro. Você pode adicionar vários alertas.</small><div class="alert-list"></div></div>`;
  box.querySelector('.remove-encounter').onclick=()=>{if(document.querySelectorAll('.encounter-editor').length===1){alert('A escala precisa ter pelo menos um encontro.');return;}box.remove();};
  box.querySelector('.add-alert').onclick=()=>addAlertRow(box.querySelector('.alert-list'));
  (data.alertas||[]).forEach(a=>addAlertRow(box.querySelector('.alert-list'),a));host.appendChild(box);
}
function collectEncounters(){
  const boxes=[...document.querySelectorAll('.encounter-editor')];
  return boxes.map((b,i)=>({id:b.dataset.id||uidKey(),nome:b.querySelector('.enc-name').value.trim(),data:b.querySelector('.enc-date').value,horario:b.querySelector('.enc-time').value,principal:b.querySelector('.enc-principal').checked,integranteIds:[...b.querySelectorAll('.enc-members input:checked')].map(x=>x.value),alertas:[...b.querySelectorAll('.alert-row')].map(r=>({id:r.dataset.id||uidKey(),data:r.querySelector('.alert-date').value,hora:r.querySelector('.alert-time').value})).filter(a=>a.data&&a.hora)}));
}
function validateEncounters(es){
  if(!es.length)return 'Adicione pelo menos um encontro.';
  for(const e of es){if(!e.nome||!e.data)return 'Informe o nome e a data de todos os encontros.';const end=e.data+'T'+(e.horario||'23:59');for(const a of e.alertas||[]){if((a.data+'T'+a.hora)>=end)return `O alerta de “${e.nome}” precisa ser antes do encontro.`;if((a.data+'T'+a.hora)<=new Date().toISOString().slice(0,16))return `O alerta de “${e.nome}” está em uma data/horário que já passou.`;}}
  if(!es.some(e=>e.principal))es[es.length-1].principal=true;return '';
}
async function renderScales(editItem=null){
  showSectionHeader('Escalas','Escalas atuais e encontros ainda em andamento.');await refreshCaches();const allowed=canManage('escalas');adminPanel.classList.toggle('hide',!allowed);
  if(allowed){
    $('form-title').textContent=editItem?'Editar escala':'Nova escala';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';const d=editItem||{};
    dynamicForm.innerHTML=`<div class="form-grid"><input id="scale-event" placeholder="Culto / Evento" value="${escapeAttr(d.evento||'')}"><label class="field-label">Equipe responsável<select id="scale-team"><option value="mvl" ${scaleTeam(d)==='mvl'?'selected':''}>MVL</option><option value="nova_geracao" ${scaleTeam(d)==='nova_geracao'?'selected':''}>⚡ Nova Geração</option></select></label><select id="scale-singer"><option value="">Selecione o cantor da escala</option>${sortedUsersForTeam(scaleTeam(d)).map(u=>`<option value="${u.id}" ${d.cantorId===u.id?'selected':''}>${memberIcon(u)} ${escapeHtml(u.nome||u.email||u.id)} — ${memberTeams(u).map(t=>t==='nova_geracao'?'Nova Geração':'MVL').join(' + ')}</option>`).join('')}</select><select id="scale-rep"><option value="">Sem repertório vinculado</option>${repertoiresCache.map(r=>`<option value="${r.id}" ${d.repertorioId===r.id?'selected':''}>${escapeHtml(r.nome||'Repertório')}</option>`).join('')}</select><label class="checkbox-row"><input id="notify-scaled" type="checkbox" ${editItem?'':'checked'}><span><b>Notificar participantes ao salvar</b><br><small class="muted">Envia o aviso sem interferir no salvamento da escala.</small></span></label><div class="subpanel encounters-panel"><div class="subpanel-head"><div><b>📅 Encontros desta escala</b><small class="muted block">Cada encontro tem data, horário, participantes, confirmação e alertas próprios.</small></div><button id="add-encounter" type="button" class="secondary small-btn">+ Adicionar encontro</button></div><div id="encounter-list"></div></div></div>`;
    $('scale-team').onchange=refreshEncounterMemberLists;$('add-encounter').onclick=()=>addEncounterRow({principal:document.querySelectorAll('.encounter-editor').length===0});
    const es=scaleEncounters(d);if(es.length)es.forEach(addEncounterRow);else addEncounterRow({nome:'Culto / Evento',principal:true});saveBtn.onclick=saveScale;if(editItem)scrollToAdminForm();
  }
  const historyBtn=document.createElement('button');historyBtn.type='button';historyBtn.className='secondary scale-history-btn';historyBtn.innerHTML='🗂️ Escalas anteriores';historyBtn.onclick=()=>renderPreviousScales();sectionSpecial.appendChild(historyBtn);
  addSearchBox('Pesquisar cantor, escala, encontro ou data...',filterCards);
  const now=new Date();const base=canManage('escalas')?scalesCache:scalesCache.filter(s=>scaleParticipants(s).includes(currentUser.uid));
  const visible=base.filter(s=>!scaleIsConcluded(s,now)).sort((a,b)=>{const na=nextEncounterOfScale(a,now),nb=nextEncounterOfScale(b,now);if(!!na!==!!nb)return na?-1:1;if(na&&nb)return encounterDateTime(na).localeCompare(encounterDateTime(nb));return (a.evento||'').localeCompare(b.evento||'');});
  listEl.innerHTML='';if(!visible.length){listEl.innerHTML=`<div class="empty">${canManage('escalas')?'Nenhuma escala atual. Consulte Escalas anteriores para ver o histórico.':'Você não possui escala atual.'}</div>`;return;}for(const s of visible)listEl.appendChild(await buildScaleCard(s));
}
async function renderPreviousScales(){
  showSectionHeader('Escalas anteriores','Histórico de escalas com todos os encontros concluídos.');await refreshCaches();adminPanel.classList.add('hide');sectionSpecial.innerHTML='<button id="back-current-scales" class="back-inline">← Voltar para escalas atuais</button>';$('back-current-scales').onclick=()=>renderScales();addSearchBox('Pesquisar nas escalas anteriores...',filterCards);
  const now=new Date(),base=canManage('escalas')?scalesCache:scalesCache.filter(s=>scaleParticipants(s).includes(currentUser.uid));const anteriores=base.filter(s=>scaleIsConcluded(s,now)).sort((a,b)=>encounterDateTime(latestEncounterOfScale(b)||{}).localeCompare(encounterDateTime(latestEncounterOfScale(a)||{})));
  listEl.innerHTML='';if(!anteriores.length){listEl.innerHTML='<div class="empty">Nenhuma escala concluída até o momento.</div>';return;}for(const s of anteriores)listEl.appendChild(await buildScaleCard(s));
}
async function saveScale(){
  const evento=$('scale-event').value.trim(),equipeResponsavel=$('scale-team').value||'mvl',cantorId=$('scale-singer').value,repertorioId=$('scale-rep').value,encontros=collectEncounters();
  if(!evento||!cantorId){alert('Informe o evento e selecione o cantor da escala.');return;}const err=validateEncounters(encontros);if(err){alert(err);return;}
  const integranteIds=[...new Set(encontros.flatMap(e=>e.integranteIds||[]))];if(!integranteIds.includes(cantorId))integranteIds.push(cantorId);
  const principal=encontros.find(e=>e.principal)||encontros[encontros.length-1];const payload={evento,equipeResponsavel,cantorId,cantorNome:userName(cantorId),repertorioId,encontros,integranteIds,data:principal.data,horario:principal.horario||'',lembretes:{}};const notifyNow=$('notify-scaled').checked;let scaleId=editingId;
  saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'escalas',editingId),{...payload,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else{const ref=await addDoc(collection(db,'escalas'),{...payload,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});scaleId=ref.id;}}catch(e){console.error('Falha ao salvar escala',e);alert('Não foi possível salvar a escala.');saveBtn.disabled=false;return;}
  alert('Escala salva com sucesso.');editingId=null;await refreshCaches();renderScales().catch(e=>console.error('Atualização da lista de escalas',e));saveBtn.disabled=false;
  const texto=`${evento} • ${userName(cantorId)} — ${dateBR(principal.data)}${principal.horario?' às '+principal.horario:''}.`;
  if(notifyNow&&integranteIds.length){const tituloEscala=equipeResponsavel==='nova_geracao'?'⚡ Nova escala Nova Geração':'🎵 Nova escala MVL';createNotifications(integranteIds,tituloEscala,texto,'escala',scaleId).catch(e=>console.error('Notificação interna da escala',e));enviarPushMVL('escala',tituloEscala,texto,integranteIds).catch(e=>console.error('Push da escala',e));}
  syncScaleReminder({id:scaleId,...payload}).catch(e=>console.error('Sincronização de encontros/alertas',e));
}
async function syncAllScheduledData(){if(!canManage('escalas')&&!canManage('membros'))return;await syncBirthdaysForPush();for(const scale of scalesCache){await syncScaleReminder(scale);try{const snap=await getDocs(collection(db,'escalas',scale.id,'confirmacoes'));for(const d of snap.docs){const x=d.data();if(x?.usuarioId)await syncScaleConfirmationAsAdmin(scale.id,x.usuarioId,x.encontros||{},x.status||'');}}catch(e){console.warn('Confirmações para lembretes',scale.id,e);}}}
async function syncScaleConfirmationAsAdmin(scaleId,usuarioId,encontros,status=''){if(!canManage('escalas'))return false;try{const idToken=await currentUser.getIdToken();const r=await fetch(MVL_PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,tipo:'confirmacao_sync_admin',escalaId,usuarioId,encontros,status})});const j=await r.json().catch(()=>({ok:false}));return !!j.ok;}catch(e){return false;}}
async function syncScaleReminder(scale){if(!canManage('escalas')||!scale?.id)return false;try{const idToken=await currentUser.getIdToken();const r=await fetch(MVL_PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,tipo:'escala_sync',escala:{id:scale.id,evento:scale.evento||'Escala',cantorNome:scaleSingerName(scale),integranteIds:scaleParticipants(scale),encontros:scaleEncounters(scale)}})});const j=await r.json().catch(()=>({ok:false}));return !!j.ok;}catch(e){console.warn('escala_sync',e);return false;}}
async function syncScaleDelete(scaleId){if(!canManage('escalas')||!scaleId)return false;try{const idToken=await currentUser.getIdToken();const r=await fetch(MVL_PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,tipo:'escala_delete',escalaId})});const j=await r.json().catch(()=>({ok:false}));return !!j.ok;}catch(e){return false;}}
async function syncScaleConfirmation(scaleId,encontros,status=''){try{const idToken=await currentUser.getIdToken();const r=await fetch(MVL_PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,tipo:'confirmacao_sync',escalaId,encontros,status})});const j=await r.json().catch(()=>({ok:false}));return !!j.ok;}catch(e){return false;}}
async function getMyConfirmation(s){const c=await getDoc(doc(db,'escalas',s.id,'confirmacoes',currentUser.uid)).catch(()=>null);return c?.exists()?c.data():{};}
function encounterStatusHtml(st){return st==='confirmado'?'<span class="status-pill ok">Confirmado</span>':st==='nao_posso'?'<span class="status-pill no">Não poderei</span>':'<span class="status-pill">Aguardando</span>';}
async function buildScaleCard(s){
  const card=document.createElement('div');card.className='item-card scale-card';const manageScale=canManage('escalas'),rep=repById(s.repertorioId),es=scaleEncounters(s);const mine=!manageScale?await getMyConfirmation(s):{};let repHtml='';
  if(rep){const itens=(rep.musicaItens||legacyRepItems(rep)).sort((a,b)=>(a.ordem||0)-(b.ordem||0));repHtml=`<div class="scale-repertoire"><b>🎵 REPERTÓRIO</b>${itens.slice(0,8).map((it,i)=>{const song=songById(it.musicaId)||{},rr=resolvedSong(it.musicaId,s.cantorId||'',it);return `<button class="scale-song">${i+1}. ${escapeHtml(song.titulo||'Música')} <small>${escapeHtml(rr.tom||'')}</small></button>`;}).join('')}<button class="confirm-btn rep-btn">Abrir repertório completo</button></div>`;}
  const encountersHtml=es.map(e=>{const st=mine.encontros?.[e.id]||(e.id==='principal'?mine.status:'');const names=(e.integranteIds||[]).map(userName);const involved=(e.integranteIds||[]).includes(currentUser.uid),concluido=encounterIsConcluded(e);return `<div class="encounter-card ${e.principal?'principal':''} ${concluido?'concluded':''}"><div class="encounter-title"><b>${e.principal?'⭐ ':''}${escapeHtml(e.nome||'Encontro')}</b>${concluido?'<span class="status-pill done">✓ Concluído</span>':(!manageScale&&involved?encounterStatusHtml(st):'')}</div><div class="item-meta">📅 ${dateBR(e.data)} ${escapeHtml(e.horario||'')}</div>${manageScale?`<div class="item-meta"><b>Participantes:</b> ${escapeHtml(names.join(', ')||'Nenhum')}</div>`:''}${!concluido&&!manageScale&&involved?`<div class="item-actions"><button class="confirm-btn enc-yes" data-eid="${escapeAttr(e.id)}">Confirmar</button><button class="decline-btn enc-no" data-eid="${escapeAttr(e.id)}">Não poderei</button></div>`:''}</div>`;}).join('');
  card.innerHTML=`<div class="scale-headline"><div><div class="scale-team-label ${scaleTeam(s)}">${teamName(scaleTeam(s))}</div><h3>🎤 ${escapeHtml(scaleSingerName(s))}</h3><div class="item-meta">${escapeHtml(s.evento||'Escala')}</div></div></div><div class="encounters-view">${encountersHtml}</div>${repHtml}<div class="item-actions"><button class="edit-btn chat-btn">💬 Chat desta escala</button>${manageScale?'<button class="edit-btn edit-scale">Editar</button><button class="delete-btn delete-scale">Excluir</button>':''}</div>`;
  card.querySelectorAll('.scale-song').forEach(b=>b.onclick=()=>openRepertoireDetail(s.repertorioId,'escalas',s.cantorId||''));card.querySelector('.rep-btn')?.addEventListener('click',()=>openRepertoireDetail(s.repertorioId,'escalas',s.cantorId||''));card.querySelector('.chat-btn').onclick=()=>openScaleChat(s.id);card.querySelectorAll('.enc-yes').forEach(b=>b.onclick=()=>setEncounterConfirmation(s,b.dataset.eid,'confirmado'));card.querySelectorAll('.enc-no').forEach(b=>b.onclick=()=>setEncounterConfirmation(s,b.dataset.eid,'nao_posso'));card.querySelector('.edit-scale')?.addEventListener('click',()=>renderScales(s));card.querySelector('.delete-scale')?.addEventListener('click',async()=>{if(confirm('Excluir escala?')){await deleteScaleCascade(s.id);await refreshCaches();renderScales();}});return card;
}
async function deleteScaleCascade(scaleId){const batch=writeBatch(db);const conf=await getDocs(collection(db,'escalas',scaleId,'confirmacoes')).catch(()=>null);conf?.docs.forEach(d=>batch.delete(d.ref));const chat=await getDocs(collection(db,'escalas',scaleId,'chat')).catch(()=>null);chat?.docs.forEach(d=>batch.delete(d.ref));batch.delete(doc(db,'escalas',scaleId));await batch.commit();syncScaleDelete(scaleId).catch(()=>{});}
async function setEncounterConfirmation(scale,encounterId,status){
  let data={};try{const ref=doc(db,'escalas',scale.id,'confirmacoes',currentUser.uid);const old=await getDoc(ref);data=old.exists()?old.data():{};const encontros={...(data.encontros||{}),[encounterId]:status};await setDoc(ref,{usuarioId:currentUser.uid,usuarioNome:currentUserData.nome||currentUser.email,encontros,atualizadoEm:serverTimestamp()},{merge:true});data.encontros=encontros;}catch(e){console.error(e);alert('Não foi possível registrar sua resposta.');return;}
  alert(status==='confirmado'?'Presença confirmada neste encontro.':'Resposta registrada neste encontro.');renderScales().catch(()=>{});syncScaleConfirmation(scale.id,data.encontros||{}).catch(()=>{});
  const enc=scaleEncounters(scale).find(e=>e.id===encounterId);const admins=adminIdsFor('escalas').filter(id=>id!==currentUser.uid);if(admins.length){const texto=`${currentUserData.nome||currentUser.email} ${status==='confirmado'?'confirmou presença':'informou que não poderá participar'} em ${enc?.nome||scale.evento}.`;createNotifications(admins,'Resposta de escala',texto,'confirmacao_escala',scale.id).catch(()=>{});enviarPushMVL('confirmacao_admin','Resposta de escala',texto,admins).catch(()=>{});}
}
// Compatibilidade com botões/escala antiga
async function setConfirmation(scale,status){const e=principalEncounter(scale);if(e)return setEncounterConfirmation(scale,e.id,status);}
async function renderNextScale(){
  if(!currentUser)return;await refreshCaches();const now=new Date();
  const proximas=scalesCache.map(s=>({s,e:nextEncounterOfScale(s,now)})).filter(x=>x.e).sort((a,b)=>encounterDateTime(a.e).localeCompare(encounterDateTime(b.e))).slice(0,2);
  const el=$('next-scale-content');if(!el)return;if(!proximas.length){el.innerHTML='<p class="muted next-empty">Nenhuma escala futura encontrada.</p>';return;}
  const cards=proximas.map(({s,e},i)=>{const dt=new Date(e.data+'T12:00:00');const dataLonga=dt.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace(/\.$/,'');const dataFmt=dataLonga.charAt(0).toUpperCase()+dataLonga.slice(1);const nome=e.nome||s.evento||'Culto / Evento';return `<div class="next-event-mini"><small>${i===0?'Próxima escala':'Escala seguinte'}</small><strong>${escapeHtml(dataFmt)}</strong><span>${escapeHtml(e.horario||'Horário a definir')}</span><em>${escapeHtml(scaleSingerName(s))} • ${escapeHtml(nome)}</em></div>`;}).join('');
  el.innerHTML=`<div class="next-cult-content next-cult-two"><div class="next-cult-icon">📅</div><div class="next-events-grid">${cards}</div><button id="home-view-scale" class="primary next-cult-button">Ver escalas</button></div>`;$('home-view-scale').onclick=()=>openSection('escalas');
}
async function openScaleDetail(scaleId){await refreshCaches();const s=scalesCache.find(x=>x.id===scaleId);if(!s)return;currentPage='escalas';homeView.classList.add('hide');sectionView.classList.remove('hide');setActiveNav('escalas');pushNav('escalas');showSectionHeader(`🎤 ${scaleSingerName(s)}`,s.evento||'Escala');adminPanel.classList.add('hide');sectionSpecial.innerHTML='<button id="scale-detail-back" class="back-inline">← Voltar</button>';listEl.innerHTML='';listEl.appendChild(await buildScaleCard(s));$('scale-detail-back').onclick=goHome;}
const MVL_EMOJIS=['🙏','🙌','❤️','👏','🔥','🎵','🎤','🎸','🥁','🎹','😂','😊','👍','✅','🎶','💪','🤝','🎉'];
async function openScaleChat(scaleId){
  await refreshCaches();const scale=scalesCache.find(s=>s.id===scaleId);if(!scale){alert('Escala não encontrada.');return;}const allowed=canManage('chats')||canManage('escalas')||scaleParticipants(scale).includes(currentUser.uid);if(!allowed){alert('Este chat é exclusivo para quem está nesta escala.');return;}currentPage='chat';pushNav('escalas');homeView.classList.add('hide');sectionView.classList.remove('hide');showSectionHeader(`Chat • ${scaleSingerName(scale)}`,`${scale.evento||'Escala'} • todos os envolvidos`);adminPanel.classList.add('hide');sectionSpecial.innerHTML=`<button id="chat-back" class="back-inline">← Voltar para escalas</button><div id="chat-list" class="chat-list"></div><div id="emoji-panel" class="emoji-panel hide">${MVL_EMOJIS.map(e=>`<button type="button" class="emoji-choice">${e}</button>`).join('')}</div><div class="chat-compose"><button id="emoji-btn" class="emoji-btn" type="button" title="Emojis">😊</button><textarea id="chat-input" placeholder="Digite uma dúvida, sugestão ou mensagem..."></textarea><button id="chat-send" class="primary">Enviar</button></div>`;listEl.innerHTML='';$('chat-back').onclick=()=>openSection('escalas');$('chat-send').onclick=()=>sendChat(scale);$('emoji-btn').onclick=()=>$('emoji-panel').classList.toggle('hide');document.querySelectorAll('.emoji-choice').forEach(b=>b.onclick=()=>{const input=$('chat-input');input.value+=b.textContent;input.focus();});if(chatUnsub)chatUnsub();chatUnsub=onSnapshot(collection(db,'escalas',scaleId,'chat'),snap=>{const items=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>createdMs(a)-createdMs(b));const box=$('chat-list');if(!box)return;box.innerHTML=items.length?'':'<div class="empty">Nenhuma mensagem ainda. Comece a conversa.</div>';items.forEach(m=>{const own=m.autorId===currentUser.uid,u=usersCache.find(x=>x.id===m.autorId),color=u?.chatColor||'#9b2b2b',node=document.createElement('div');node.className=`chat-message ${own?'mine':''}`;node.style.setProperty('--chat-color',color);node.innerHTML=`<b style="color:${escapeAttr(color)}">${escapeHtml(m.autorNome||'Integrante')}</b><div>${escapeHtml(m.mensagem||'')}</div><small>${escapeHtml(fmtTs(m.criadoEm))}</small>${canManage('chats')?'<button class="chat-delete" title="Excluir mensagem">🗑️ Excluir</button>':''}`;node.querySelector('.chat-delete')?.addEventListener('click',async()=>{if(confirm('Excluir esta mensagem do chat?'))await deleteDoc(doc(db,'escalas',scaleId,'chat',m.id));});box.appendChild(node);});box.scrollTop=box.scrollHeight;},e=>console.error('chat',e));
}
async function sendChat(scale){const input=$('chat-input'),mensagem=input.value.trim();if(!mensagem)return;input.value='';try{await addDoc(collection(db,'escalas',scale.id,'chat'),{autorId:currentUser.uid,autorNome:currentUserData.nome||currentUser.email,mensagem,criadoEm:serverTimestamp()});const recipients=[...scaleParticipants(scale),...adminIdsFor('chats')].filter((v,i,a)=>v!==currentUser.uid&&a.indexOf(v)===i);if(recipients.length){createNotifications(recipients,`Chat • ${scaleSingerName(scale)}`,`${currentUserData.nome||currentUser.email}: ${mensagem.slice(0,120)}`,'chat_escala',scale.id).catch(()=>{});enviarPushMVL('chat_escala',`Chat • ${scaleSingerName(scale)}`,`${currentUserData.nome||currentUser.email}: ${mensagem.slice(0,120)}`,recipients,`https://robertjuniorrj85-ux.github.io/App-MVL/?open=scalechat&id=${encodeURIComponent(scale.id)}`).catch(()=>{});}}catch(e){console.error(e);alert('Não foi possível enviar a mensagem.');}}

// AGENDA
async function renderAgenda(editItem=null){
  showSectionHeader('Agenda','Cultos, ensaios, reuniões e eventos.');agendasCache=await safeDocs('agenda');usersCache=await safeDocs('usuarios');const allowed=canManage('agenda');adminPanel.classList.toggle('hide',!allowed);
  if(allowed){$('form-title').textContent=editItem?'Editar evento':'Novo evento';editingId=editItem?.id||null;cancelEditBtn.classList.toggle('hide',!editItem);saveBtn.textContent=editItem?'Atualizar':'Salvar';const d=editItem||{};dynamicForm.innerHTML=`<div class="form-grid"><input id="ag-date" type="date" value="${escapeAttr(d.data||'')}"><input id="ag-time" type="time" value="${escapeAttr(d.horario||'')}"><input id="ag-title" placeholder="Evento" value="${escapeAttr(d.titulo||'')}"><input id="ag-local" placeholder="Local" value="${escapeAttr(d.local||'')}"><textarea id="ag-note" placeholder="Observações">${escapeHtml(d.observacoes||'')}</textarea><select id="ag-target"><option value="todos" ${d.todos!==false?'selected':''}>Todos os integrantes</option><option value="especificos" ${d.todos===false?'selected':''}>Selecionar pessoas</option></select><div id="ag-member-box" class="multi-list ${d.todos===false?'':'hide'}">${usersCache.map(u=>`<label class="multi-item"><input type="checkbox" value="${u.id}" ${(d.destinatarios||[]).includes(u.id)?'checked':''}> ${memberIcon(u)} ${escapeHtml(u.nome||u.email||u.id)}</label>`).join('')}</div><label class="checkbox-row"><input id="ag-notify" type="checkbox" ${editItem?'':'checked'}><span><b>Notificar no MVL</b><br><small class="muted">Cria avisos internos para os destinatários.</small></span></label></div>`;$('ag-target').onchange=()=>$('ag-member-box').classList.toggle('hide',$('ag-target').value!=='especificos');saveBtn.onclick=saveAgenda;}
  const visible=agendasCache.filter(a=>canManage('agenda')||a.todos===true||(a.destinatarios||[]).includes(currentUser.uid)).sort((a,b)=>(b.data+(b.horario||'')).localeCompare(a.data+(a.horario||'')));listEl.innerHTML='';if(!visible.length){listEl.innerHTML='<div class="empty">Nenhum evento cadastrado.</div>';return;}visible.forEach(a=>{const card=document.createElement('div');card.className='item-card';card.innerHTML=`<h3>${escapeHtml(a.titulo||'Evento')}</h3><div class="item-meta">${dateBR(a.data)} ${escapeHtml(a.horario||'')}</div>${a.local?`<div class="item-meta">📍 ${escapeHtml(a.local)}</div>`:''}${a.observacoes?`<div class="item-meta">${escapeHtml(a.observacoes)}</div>`:''}${allowed?'<div class="item-actions"><button class="edit-btn">Editar</button><button class="delete-btn">Excluir</button></div>':''}`;if(allowed){card.querySelector('.edit-btn').onclick=()=>renderAgenda(a);card.querySelector('.delete-btn').onclick=async()=>{if(confirm('Excluir evento?')){await deleteDoc(doc(db,'agenda',a.id));renderAgenda();}};}listEl.appendChild(card);});
}
async function saveAgenda(){
  const data=$('ag-date').value,horario=$('ag-time').value,titulo=$('ag-title').value.trim(),local=$('ag-local').value.trim(),observacoes=$('ag-note').value.trim(),todos=$('ag-target').value==='todos',destinatarios=todos?usersCache.map(u=>u.id):[...document.querySelectorAll('#ag-member-box input:checked')].map(x=>x.value);if(!data||!titulo){alert('Informe a data e o evento.');return;}const payload={data,horario,titulo,local,observacoes,todos,destinatarios:todos?[]:destinatarios};let refId=editingId;saveBtn.disabled=true;try{if(editingId)await updateDoc(doc(db,'agenda',editingId),{...payload,atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid});else{const ref=await addDoc(collection(db,'agenda'),{...payload,criadoEm:serverTimestamp(),criadoPor:currentUser.uid});refId=ref.id;}if($('ag-notify').checked&&destinatarios.length)await createNotifications(destinatarios,'Agenda MVL',`${titulo} — ${dateBR(data)}${horario?' às '+horario:''}.`,'agenda',refId);editingId=null;await refreshCaches();renderAgenda();}catch(e){console.error(e);alert('Não foi possível salvar o evento.');}finally{saveBtn.disabled=false;}
}

// CALENDÁRIO
async function renderCalendar(){
  showSectionHeader('Calendário','Toque em um dia para ver as atividades.');adminPanel.classList.add('hide');await refreshCaches();sectionSpecial.innerHTML=`<div class="calendar-head"><button id="cal-prev">‹</button><div id="cal-title" class="calendar-title"></div><button id="cal-next">›</button></div><div class="calendar-grid" id="calendar-grid"></div><div id="day-events" class="day-events"></div>`;$('cal-prev').onclick=()=>{calDate=new Date(calDate.getFullYear(),calDate.getMonth()-1,1);drawCalendar();};$('cal-next').onclick=()=>{calDate=new Date(calDate.getFullYear(),calDate.getMonth()+1,1);drawCalendar();};drawCalendar();
}
function eventDatesForUser(){const ag=agendasCache.filter(a=>canManage('agenda')||a.todos===true||(a.destinatarios||[]).includes(currentUser.uid)).map(a=>({...a,kind:'Agenda'}));const sc=(canManage('escalas')?scalesCache:scalesCache.filter(s=>scaleParticipants(s).includes(currentUser.uid))).flatMap(s=>scaleEncounters(s).map(e=>({...s,data:e.data,horario:e.horario,titulo:`${s.cantorNome||scaleSingerName(s)} • ${e.nome}`,kind:'Escala'})));return [...ag,...sc];}
function drawCalendar(){const events=eventDatesForUser(),y=calDate.getFullYear(),m=calDate.getMonth();$('cal-title').textContent=calDate.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});const grid=$('calendar-grid'),weekdays=['D','S','T','Q','Q','S','S'];grid.innerHTML=weekdays.map(w=>`<div class="cal-week">${w}</div>`).join('');const first=new Date(y,m,1),start=new Date(y,m,1-first.getDay());for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=dateKey(d),has=events.some(e=>e.data===key),b=document.createElement('button');b.className='cal-day';if(d.getMonth()!==m)b.classList.add('out');if(key===dateKey(new Date()))b.classList.add('today');if(key===selectedDate)b.classList.add('selected');b.innerHTML=`${d.getDate()}${has?'<span class="cal-dot"></span>':''}`;b.onclick=()=>{selectedDate=key;drawCalendar();};grid.appendChild(b);}renderDayEvents(events.filter(e=>e.data===selectedDate));}
function renderDayEvents(events){const el=$('day-events');el.innerHTML=`<h3>${dateBR(selectedDate)}</h3>`;if(!events.length){el.innerHTML+='<div class="empty">Nenhuma atividade neste dia.</div>';return;}events.forEach(e=>el.innerHTML+=`<div class="item-card"><span class="status-pill">${escapeHtml(e.kind)}</span><h3>${escapeHtml(e.titulo||e.evento||'Atividade')}</h3><div class="item-meta">${escapeHtml(e.horario||'')}</div>${e.local?`<div class="item-meta">📍 ${escapeHtml(e.local)}</div>`:''}</div>`);}

// COMUNICAÇÃO PRIVADA
async function renderCommunication(){
  showSectionHeader('Comunicação','Mensagens privadas entre integrantes e liderança.');adminPanel.classList.remove('hide');$('form-title').textContent=canManage('comunicacao')?'Nova mensagem':'Enviar mensagem à liderança';dynamicForm.innerHTML=`<div class="form-grid"><select id="msg-type"><option>Falta / ausência</option><option>Dúvida</option><option>Pedido</option><option>Observação</option><option>Outro</option></select><textarea id="msg-body" placeholder="Escreva sua mensagem"></textarea></div>`;saveBtn.onclick=sendMessage;await loadMessages();
}
async function sendMessage(){const tipo=$('msg-type').value,mensagem=$('msg-body').value.trim();if(!mensagem){alert('Escreva a mensagem.');return;}try{await addDoc(collection(db,'mensagens'),{autorId:currentUser.uid,autorNome:currentUserData.nome||currentUser.email,autorEmail:currentUser.email,tipo,mensagem,status:'nova',criadoEm:serverTimestamp()});if(!canManage('comunicacao')){const admins=adminIdsFor('comunicacao');if(admins.length){createNotifications(admins,'Nova mensagem à liderança',`${currentUserData.nome||currentUser.email}: ${mensagem.slice(0,140)}`,'mensagem','').catch(()=>{});enviarPushMVL('mensagem_admin','Nova mensagem no MVL',`${currentUserData.nome||currentUser.email}: ${mensagem.slice(0,140)}`,admins,'https://robertjuniorrj85-ux.github.io/App-MVL/?open=comunicacao').catch(()=>{});}}$('msg-body').value='';alert('Mensagem enviada.');await loadMessages();}catch(e){console.error(e);alert('Não foi possível enviar a mensagem.');}}
async function loadMessages(){const all=await safeDocs('mensagens'),visible=(canManage('comunicacao')?all:all.filter(m=>m.autorId===currentUser.uid)).sort(byCreatedDesc);listEl.innerHTML='';if(!visible.length){listEl.innerHTML='<div class="empty">Nenhuma mensagem ainda.</div>';return;}visible.forEach(m=>{const card=document.createElement('div');card.className='item-card';card.innerHTML=`<span class="status-pill ${m.status==='nova'?'new':m.status==='resolvida'?'done':''}">${escapeHtml(m.status||'nova')}</span><h3>${escapeHtml(m.tipo||'Mensagem')}</h3>${canManage('comunicacao')?`<div class="item-meta"><b>De:</b> ${escapeHtml(m.autorNome||m.autorEmail||'')}</div>`:''}<div class="item-meta">${escapeHtml(m.mensagem||'')}</div>${canManage('comunicacao')?'<div class="item-actions"><button class="edit-btn">Marcar lida</button><button class="confirm-btn">Resolvida</button><button class="delete-btn msg-delete">Excluir</button></div>':''}`;if(canManage('comunicacao')){card.querySelector('.edit-btn').onclick=async()=>{await updateDoc(doc(db,'mensagens',m.id),{status:'lida',atualizadoEm:serverTimestamp()});loadMessages();};card.querySelector('.confirm-btn').onclick=async()=>{await updateDoc(doc(db,'mensagens',m.id),{status:'resolvida',atualizadoEm:serverTimestamp()});loadMessages();};card.querySelector('.msg-delete').onclick=async()=>{if(confirm('Excluir esta mensagem privada?')){await deleteDoc(doc(db,'mensagens',m.id));loadMessages();}};}listEl.appendChild(card);});}

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
  showSectionHeader('Notificações','Avisos recebidos pelo MVL.');adminPanel.classList.add('hide');sectionSpecial.innerHTML=`<div class="admin-panel"><h3>Notificações do dispositivo</h3><p class="muted">Ative o Web Push do OneSignal neste aparelho.</p><button id="enable-notif" class="secondary">Permitir notificações</button><p class="hint">A V9.2 já identifica cada usuário no OneSignal. O envio automático de push externo depende do emissor seguro, sem expor chave no GitHub.</p></div>`;$('enable-notif').onclick=requestNotifications;const q=query(collection(db,'notificacoes'),where('destinatarioId','==',currentUser.uid));let items=[];try{const snap=await getDocs(q);items=snap.docs.map(d=>({id:d.id,...d.data()})).sort(byCreatedDesc);}catch(e){console.error(e);}listEl.innerHTML='';if(!items.length){listEl.innerHTML='<div class="empty">Nenhuma notificação.</div>';return;}items.forEach(n=>{const card=document.createElement('div');card.className='item-card';card.innerHTML=`${!n.lida?'<span class="status-pill new">Nova</span>':''}<h3>${escapeHtml(n.titulo||'MVL')}</h3><div class="item-meta">${escapeHtml(n.mensagem||'')}</div><div class="item-actions"><button class="confirm-btn notif-open">Abrir</button>${!n.lida?'<button class="edit-btn">Marcar como lida</button>':''}</div>`;card.querySelector('.notif-open')?.addEventListener('click',()=>openNotificationTarget(n));card.querySelector('.edit-btn')?.addEventListener('click',async()=>{await updateDoc(doc(db,'notificacoes',n.id),{lida:true,lidaEm:serverTimestamp()});renderNotifications();});listEl.appendChild(card);});
}

// MEMBROS E PERFIL
function memberIcon(u={}){const f=String(u.funcao||'').toLowerCase();if(/tecl|piano|keyboard/.test(f))return '🎹';if(/bater|drum/.test(f))return '🥁';if(/guitarr|viol[aã]o|baixo|bass/.test(f))return '🎸';if(/cant|vocal|back|voz/.test(f))return '🎤';if(/som|t[eé]cnic|audio|mesa/.test(f))return '🎚️';return '👤';}
async function renderMembers(){
  showSectionHeader('Membros','Integrantes, equipes, funções, aniversários e permissões.');
  adminPanel.classList.add('hide');
  usersCache=await safeDocs('usuarios');

  sectionSpecial.innerHTML=isPrincipalAdmin
    ? `<div class="member-add-panel"><button id="add-member-btn" class="primary">➕ Adicionar novo membro</button></div>`
    : '';
  $('add-member-btn')?.addEventListener('click',openNewMemberForm);

  addSearchBox('Pesquisar integrante, instrumento ou equipe...',filterCards);
  listEl.innerHTML='';
  if(!usersCache.length){listEl.innerHTML='<div class="empty">Nenhum integrante registrado.</div>';return;}
  usersCache.sort((a,b)=>(a.nome||a.email||'').localeCompare(b.nome||b.email||'')).forEach(u=>{
    const card=document.createElement('div');
    card.className='item-card';
    const color=u.chatColor||'#9b2b2b',aniversario=u.aniversario?formatBirthday(u.aniversario):'',roleLabel=(u.role==='admin'&&u.adminPrincipal===true)?'Administrador principal':((u.role==='admin'&&u.adminPrincipal!==true)||u.role==='admin_limited')?'Administrador':'Integrante';
    card.innerHTML=`<div class="member-head">${memberAvatarHtml(u)}<div><h3><span class="member-color" style="background:${escapeAttr(color)}"></span>${escapeHtml(u.nome||u.email||'Integrante')}</h3><div class="member-teams">${teamBadges(u)}</div></div></div><div class="item-meta">${escapeHtml(u.funcao||'Função não informada')}</div>${aniversario?`<div class="item-meta">🎂 Aniversário: ${escapeHtml(aniversario)}</div>`:''}${u.desativado===true?'<span class="status-pill no">Acesso desativado</span>':''}${(canManage('membros')||isPrincipalAdmin)?`<div class="item-meta">${escapeHtml(u.email||'')}</div><span class="status-pill">${roleLabel}</span><div class="item-actions"><button class="edit-btn member-edit">Editar membro</button></div>`:''}`;
    card.querySelector('.member-edit')?.addEventListener('click',()=>editMember(u));
    listEl.appendChild(card);
  });
}

function openNewMemberForm(){
  if(!isPrincipalAdmin)return;
  sectionSpecial.innerHTML=`
    <div class="admin-panel" id="new-member-panel">
      <h3>➕ Adicionar novo membro</h3>
      <p class="muted">Crie o acesso do integrante e já deixe função, equipe e aniversário cadastrados.</p>
      <div class="form-grid">
        <input id="new-member-name" placeholder="Nome do integrante">
        <input id="new-member-email" type="email" autocomplete="off" placeholder="E-mail de acesso">
        <input id="new-member-password" type="password" autocomplete="new-password" placeholder="Senha provisória (mínimo 6 caracteres)">
        <input id="new-member-role" placeholder="Função / Instrumento">
        <input id="new-member-birthday" type="date">
        <label class="checkbox-row"><input id="new-team-mvl" type="checkbox" checked><span>MVL</span></label>
        <label class="checkbox-row"><input id="new-team-ng" type="checkbox"><span>⚡ Nova Geração</span></label>
        <label>Cor no chat<input id="new-member-color" type="color" value="#9b2b2b"></label>
      </div>
      <div class="form-actions">
        <button id="create-member-btn" class="primary">Criar integrante</button>
        <button id="cancel-new-member" class="secondary">Cancelar</button>
      </div>
      <p id="new-member-status" class="hint"></p>
    </div>`;
  $('cancel-new-member').onclick=()=>renderMembers();
  $('create-member-btn').onclick=createNewMember;
  $('new-member-name')?.focus();
  window.scrollTo({top:0,behavior:'smooth'});
}

async function createNewMember(){
  if(!isPrincipalAdmin)return;
  const nome=$('new-member-name').value.trim();
  const emailNovo=$('new-member-email').value.trim().toLowerCase();
  const senhaNova=$('new-member-password').value;
  const funcao=$('new-member-role').value.trim();
  const aniversario=birthdayStorageValue($('new-member-birthday').value);
  const chatColor=$('new-member-color').value||'#9b2b2b';
  const equipes=[$('new-team-mvl').checked?'mvl':'',$('new-team-ng').checked?'nova_geracao':''].filter(Boolean);
  const status=$('new-member-status');
  const btn=$('create-member-btn');

  if(!nome){status.textContent='Informe o nome do integrante.';status.className='hint error';return;}
  if(!emailNovo){status.textContent='Informe o e-mail de acesso.';status.className='hint error';return;}
  if(senhaNova.length<6){status.textContent='A senha provisória deve ter pelo menos 6 caracteres.';status.className='hint error';return;}
  if(!equipes.length){status.textContent='Selecione pelo menos uma equipe.';status.className='hint error';return;}

  btn.disabled=true;
  status.textContent='Criando integrante...';
  status.className='hint';
  try{
    // A criação usa uma instância separada do Firebase Auth para manter o administrador logado.
    await signOut(memberCreatorAuth).catch(()=>{});
    const cred=await createUserWithEmailAndPassword(memberCreatorAuth,emailNovo,senhaNova);
    await setDoc(doc(memberCreatorDb,'usuarios',cred.user.uid),{
      email:emailNovo,
      nome,
      funcao,
      equipes,
      aniversario,
      chatColor,
      role:'member',
      adminPrincipal:false,
      permissoes:{},
      adminPermissions:{},
      mustChangePassword:true,
      criadoEm:serverTimestamp()
    });
    await signOut(memberCreatorAuth).catch(()=>{});
    status.textContent='Integrante criado com sucesso.';
    status.className='hint success';
    await refreshCaches();
    syncBirthdaysForPush().catch(()=>{});
    setTimeout(()=>renderMembers(),500);
  }catch(e){
    console.error('Criar integrante',e);
    const map={
      'auth/email-already-in-use':'Este e-mail já possui um usuário cadastrado.',
      'auth/invalid-email':'Digite um e-mail válido.',
      'auth/weak-password':'A senha provisória é muito fraca.',
      'auth/operation-not-allowed':'O cadastro por e-mail/senha não está habilitado no Firebase.'
    };
    status.textContent=map[e.code]||'Não foi possível criar o integrante.';
    status.className='hint error';
  }finally{
    btn.disabled=false;
  }
}

async function migrateLegacyAdminSchema(){
  if(!isPrincipalAdmin)return;
  const legacy=usersCache.filter(u=>u.role==='admin_limited');
  for(const u of legacy){
    const perms=(u.adminPermissions&&typeof u.adminPermissions==='object')?u.adminPermissions:{};
    try{await updateDoc(doc(db,'usuarios',u.id),{role:'admin',adminPrincipal:false,permissoes:perms,adminPermissions:perms,atualizadoEm:serverTimestamp()});}
    catch(e){console.warn('Migração de administrador',u.id,e);}
  }
  if(legacy.length)await refreshCaches();
}

function formatBirthday(v=''){const parts=String(v).split('-');if(parts.length!==2)return v;return `${parts[1]}/${parts[0]}`;}
function birthdayInputValue(v=''){return /^\d{2}-\d{2}$/.test(v)?`2000-${v}`:'';}
function birthdayStorageValue(v=''){if(!v)return '';const p=v.split('-');return `${p[1]}-${p[2]}`;}
async function syncBirthdaysForPush(){if(!canManage('membros'))return;try{const idToken=await currentUser.getIdToken();const pessoas=usersCache.map(u=>({uid:u.id,nome:u.nome||u.email||'Integrante',aniversario:u.aniversario||''}));await fetch(MVL_PUSH_ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({idToken,tipo:'aniversario_sync',pessoas})});}catch(e){console.warn('Sincronização de aniversários',e);}}
function editMember(u){
  if(!canManage('membros')&&!isPrincipalAdmin)return;
  const teams=memberTeams(u),perms=userPermissions(u),canRoles=isPrincipalAdmin&&u.id!==currentUser.uid;
  sectionSpecial.innerHTML=`<div class="admin-panel member-admin-editor"><h3>Editar integrante</h3><div class="form-grid"><input id="member-name" placeholder="Nome" value="${escapeAttr(u.nome||'')}"><input id="member-role" placeholder="Função / Instrumento" value="${escapeAttr(u.funcao||'')}"><div class="subpanel"><b>Equipes que participa</b><label class="checkbox-row"><input id="team-mvl" type="checkbox" ${teams.includes('mvl')?'checked':''}><span>MVL</span></label><label class="checkbox-row"><input id="team-ng" type="checkbox" ${teams.includes('nova_geracao')?'checked':''}><span>⚡ Nova Geração</span></label></div><label class="birthday-field">🎂 Aniversário <input id="member-birthday" type="date" value="${escapeAttr(birthdayInputValue(u.aniversario||''))}"></label><small class="muted">O ano não será salvo; usamos somente dia e mês.</small><label class="color-field">Cor no Chat da Escala <input id="member-color" type="color" value="${escapeAttr(u.chatColor||'#9b2b2b')}"></label>${isPrincipalAdmin?`<div class="subpanel admin-access-panel"><b>👑 Acesso administrativo</b>${u.id===currentUser.uid?'<div class="readonly-note">Você é o Administrador principal e possui acesso total.</div>':`<select id="member-access"><option value="member" ${!((u.role==='admin'&&u.adminPrincipal!==true)||u.role==='admin_limited')?'selected':''}>Integrante</option><option value="admin_limited" ${((u.role==='admin'&&u.adminPrincipal!==true)||u.role==='admin_limited')?'selected':''}>Administrador com permissões</option></select><div id="permission-list" class="permission-grid ${((u.role==='admin'&&u.adminPrincipal!==true)||u.role==='admin_limited')?'':'hide'}">${Object.entries(ADMIN_PERMISSION_LABELS).map(([k,l])=>`<label class="checkbox-row"><input class="admin-perm" type="checkbox" value="${k}" ${perms[k]?'checked':''}><span>${escapeHtml(l)}</span></label>`).join('')}</div>`}</div>`:''}</div>${isPrincipalAdmin&&u.id!==currentUser.uid?`<div class="subpanel user-admin-actions"><b>🔐 Administração da conta</b><p class="muted">Ações exclusivas do Administrador principal.</p><div class="item-actions"><button id="member-reset-pass" class="edit-btn">Redefinir senha</button><button id="member-toggle-active" class="${u.desativado===true?'confirm-btn':'decline-btn'}">${u.desativado===true?'Reativar usuário':'Desativar usuário'}</button><button id="member-delete-user" class="delete-btn">Excluir usuário</button></div><p id="member-admin-status" class="hint"></p></div>`:''}<div class="form-actions"><button id="member-save" class="primary">Salvar</button><button id="member-cancel" class="secondary">Cancelar</button></div></div>`;
  $('member-access')?.addEventListener('change',()=>$('permission-list')?.classList.toggle('hide',$('member-access').value!=='admin_limited'));
  $('member-cancel').onclick=()=>renderMembers();
  if(isPrincipalAdmin&&u.id!==currentUser.uid){
    $('member-reset-pass')?.addEventListener('click',async()=>{
      const nova=prompt(`Digite a nova senha provisória para ${u.nome||u.email}:`);
      if(nova===null)return;if(nova.length<6){alert('A senha provisória deve ter pelo menos 6 caracteres.');return;}
      if(!confirm('Redefinir a senha deste usuário? Ele deverá usar a nova senha no próximo acesso.'))return;
      const st=$('member-admin-status');try{st.textContent='Redefinindo senha...';await acaoAdminUsuario('usuario_reset_senha',u,{novaSenha:nova,senha:nova,password:nova});await setDoc(doc(db,'usuarios',u.id),{mustChangePassword:true,atualizadoEm:serverTimestamp()},{merge:true});st.textContent='Senha redefinida com sucesso.';st.className='hint success';}catch(e){console.error(e);st.textContent=e.message||'Não foi possível redefinir a senha.';st.className='hint error';}
    });
    $('member-toggle-active')?.addEventListener('click',async()=>{
      const desativado=u.desativado===true,tipo=desativado?'usuario_reativar':'usuario_desativar';
      if(!confirm(`${desativado?'Reativar':'Desativar'} o acesso de ${u.nome||u.email}?`))return;
      const st=$('member-admin-status');try{st.textContent=desativado?'Reativando usuário...':'Desativando usuário...';await acaoAdminUsuario(tipo,u);await setDoc(doc(db,'usuarios',u.id),{desativado:!desativado,atualizadoEm:serverTimestamp()},{merge:true});await refreshCaches();st.textContent=desativado?'Usuário reativado.':'Usuário desativado.';st.className='hint success';setTimeout(()=>renderMembers(),450);}catch(e){console.error(e);st.textContent=e.message||'Não foi possível alterar o acesso.';st.className='hint error';}
    });
    $('member-delete-user')?.addEventListener('click',async()=>{
      if(!confirm(`Excluir DEFINITIVAMENTE o usuário ${u.nome||u.email}? Esta ação remove o acesso e não pode ser desfeita.`))return;
      if(!confirm('Confirme novamente: deseja realmente excluir este usuário?'))return;
      const st=$('member-admin-status');try{st.textContent='Excluindo usuário...';await acaoAdminUsuario('usuario_excluir',u);await deleteDoc(doc(db,'usuarios',u.id)).catch(()=>{});await refreshCaches();alert('Usuário excluído com sucesso.');await renderMembers();}catch(e){console.error(e);st.textContent=e.message||'Não foi possível excluir o usuário.';st.className='hint error';}
    });
  }
  $('member-save').onclick=async()=>{
    const equipes=[$('team-mvl').checked?'mvl':'',$('team-ng').checked?'nova_geracao':''].filter(Boolean);
    if(!equipes.length){alert('Selecione pelo menos uma equipe para o integrante.');return;}
    const payload={nome:$('member-name').value.trim(),funcao:$('member-role').value.trim(),equipes,aniversario:birthdayStorageValue($('member-birthday').value),chatColor:$('member-color').value,atualizadoEm:serverTimestamp()};
    if(isPrincipalAdmin&&u.id!==currentUser.uid){
      const access=$('member-access')?.value||'member';
      const perms=access==='admin_limited'?Object.fromEntries([...document.querySelectorAll('.admin-perm')].map(x=>[x.value,x.checked])):{};
      payload.role=access==='admin_limited'?'admin':'member';
      payload.adminPrincipal=false;
      payload.permissoes=perms;
      payload.adminPermissions=perms;
    }
    try{
      await updateDoc(doc(db,'usuarios',u.id),payload);
      await refreshCaches();
      if(isPrincipalAdmin)await syncAdminPermissionsForPush();
      syncBirthdaysForPush().catch(()=>{});
      alert('Membro atualizado com sucesso.');
      await renderMembers();
    }catch(e){console.error('Salvar membro/permissões',e);alert('Não foi possível salvar as permissões do membro.');}
  };window.scrollTo({top:0,behavior:'smooth'});
}
async function renderBirthdayCard(){const host=$('birthday-card');if(!host||!currentUser)return;if(!usersCache.length)await refreshCaches();const now=new Date(),md=`${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;const today=usersCache.filter(u=>u.aniversario===md);const upcoming=usersCache.filter(u=>u.aniversario).map(u=>{const [m,d]=u.aniversario.split('-').map(Number);let dt=new Date(now.getFullYear(),m-1,d);if(dateKey(dt)<dateKey(now))dt=new Date(now.getFullYear()+1,m-1,d);return {...u,_next:dt};}).sort((a,b)=>a._next-b._next).slice(0,3);if(today.length){host.classList.add('birthday-today');host.innerHTML=`<b>🎂 Aniversariante${today.length>1?'s':''} do dia</b><h3>${today.map(u=>escapeHtml(u.nome||u.email||'Integrante')).join(' • ')}</h3><p>Que Deus abençoe grandemente ${today.length>1?'suas vidas':'sua vida'}! 🙏🎉</p>`;}else{host.classList.remove('birthday-today');host.innerHTML=`<b>🎉 Próximos aniversariantes</b>${upcoming.length?upcoming.map(u=>`<div class="birthday-row"><span>${escapeHtml(u.nome||u.email||'Integrante')}</span><strong>${escapeHtml(formatBirthday(u.aniversario))}</strong></div>`).join(''):'<p class="muted">Nenhum aniversário cadastrado ainda.</p>'}`;}}
async function renderPrayerCard(){
  const host=$('prayer-card');if(!host||!currentUser)return;const today=dateKey(new Date());let purpose='Ore pelo nosso ministério, pelas famílias, pelos cultos e para que tudo seja feito para a glória de Deus.';try{const cfg=await getDoc(doc(db,'configuracoes','oracao'));if(cfg.exists()&&cfg.data().proposito)purpose=cfg.data().proposito;}catch{}
  let prayed=false;try{const d=await getDoc(doc(db,'oracoes',`${currentUser.uid}_${today}`));prayed=d.exists();}catch{}
  let prayerDocs=[];try{const snap=await getDocs(query(collection(db,'oracoes'),where('data','==',today)));prayerDocs=snap.docs.map(d=>({id:d.id,...d.data()}));}catch{}
  const count=prayerDocs.length;
  host.innerHTML=`<div class="prayer-head"><b>🙏 Oração pelo Ministério</b>${canManage('oracoes')?'<button id="edit-prayer" class="mini-action">Editar propósito</button>':''}</div><p>${escapeHtml(purpose)}</p><button id="pray-today" class="${prayed?'prayed':'primary'}" ${prayed?'disabled':''}>${prayed?'❤️ Orei por nós hoje':'🙏 Orei pelo nosso ministério hoje'}</button><small>${count} registro${count===1?'':'s'} de oração hoje. Sem ranking — apenas gratidão e comunhão.</small>${canManage('oracoes')?'<button id="view-prayers" class="secondary prayer-view-btn">👁 Ver quem orou hoje</button><div id="prayer-names" class="prayer-names hide"></div>':''}`;
  $('pray-today').onclick=async()=>{await setDoc(doc(db,'oracoes',`${currentUser.uid}_${today}`),{usuarioId:currentUser.uid,usuarioNome:currentUserData.nome||currentUser.email,data:today,criadoEm:serverTimestamp()});const recipients=usersCache.map(u=>u.id).filter(id=>id!==currentUser.uid);if(recipients.length){const titulo='🙏 Alguém orou pelo nosso ministério hoje!';const texto='Mais uma oração foi feita pelo MVL. Separe também um momento e ore por nós.';createNotifications(recipients,titulo,texto,'oracao','').catch(()=>{});enviarPushMVL('oracao',titulo,texto,recipients).catch(()=>{});}renderPrayerCard();};
  $('edit-prayer')?.addEventListener('click',async()=>{const novo=prompt('Propósito de oração:',purpose);if(novo&&novo.trim()){await setDoc(doc(db,'configuracoes','oracao'),{proposito:novo.trim(),atualizadoEm:serverTimestamp(),atualizadoPor:currentUser.uid},{merge:true});renderPrayerCard();}});
  $('view-prayers')?.addEventListener('click',()=>{const box=$('prayer-names');box.classList.toggle('hide');if(box.classList.contains('hide'))return;const ordenados=[...prayerDocs].sort((a,b)=>createdMs(a)-createdMs(b));box.innerHTML=ordenados.length?ordenados.map(p=>`<div class="prayer-person"><span>🙏 ${escapeHtml(p.usuarioNome||userName(p.usuarioId)||'Integrante')}</span><small>${p.criadoEm?.toDate?escapeHtml(p.criadoEm.toDate().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})):''}</small></div>`).join(''):'<p class="muted">Ninguém registrou a oração ainda.</p>';});
}


function renderProfile(){showSectionHeader('Meu Perfil','Atualize sua foto, seus dados e sua senha.');adminPanel.classList.add('hide');const d=currentUserData||{};sectionSpecial.innerHTML=`<div class="admin-panel profile-photo-panel"><h3>Foto de perfil</h3><div class="profile-photo-row">${memberAvatarHtml(d,'profile-avatar')}<div><input id="profile-photo-file" type="file" accept="image/jpeg,image/png,image/webp"><p class="muted">JPG, PNG ou WEBP • máximo 2 MB.</p><div class="item-actions"><button id="profile-photo-save" class="primary">Enviar foto</button>${fotoUrlUsuario(d)?'<button id="profile-photo-delete" class="delete-btn">Remover foto</button>':''}</div><p id="profile-photo-status" class="hint"></p></div></div></div><div class="admin-panel"><h3>Dados pessoais</h3><div class="form-grid"><input id="profile-name" placeholder="Nome" value="${escapeAttr(d.nome||'')}"><input id="profile-role" placeholder="Função / Instrumento" value="${escapeAttr(d.funcao||'')}"><input value="${escapeAttr(currentUser.email||'')}" disabled></div><div class="form-actions"><button id="save-profile" class="primary">Salvar perfil</button></div></div><div class="admin-panel"><h3>Alterar senha</h3><div class="form-grid"><input id="current-pass" type="password" placeholder="Senha atual"><input id="profile-new-pass" type="password" placeholder="Nova senha"><input id="profile-confirm-pass" type="password" placeholder="Confirmar nova senha"></div><div class="form-actions"><button id="change-pass" class="secondary">Alterar senha</button></div><p id="profile-pass-status" class="hint"></p></div>`;$('save-profile').onclick=saveProfile;$('change-pass').onclick=changePasswordFromProfile;$('profile-photo-save').onclick=async()=>{const st=$('profile-photo-status'),file=$('profile-photo-file').files?.[0];try{st.textContent='Enviando foto...';st.className='hint';await enviarFotoPerfil(file);st.textContent='Foto atualizada com sucesso.';st.className='hint success';setTimeout(()=>renderProfile(),350);}catch(e){console.error(e);st.textContent=e.message||'Não foi possível enviar a foto.';st.className='hint error';}};$('profile-photo-delete')?.addEventListener('click',async()=>{if(!confirm('Remover sua foto de perfil?'))return;const st=$('profile-photo-status');try{st.textContent='Removendo foto...';await excluirFotoPerfil();renderProfile();}catch(e){console.error(e);st.textContent=e.message||'Não foi possível remover a foto.';st.className='hint error';}});}
async function saveProfile(){const nome=$('profile-name').value.trim(),funcao=$('profile-role').value.trim();try{await setDoc(doc(db,'usuarios',currentUser.uid),{nome,funcao,email:currentUser.email,atualizadoEm:serverTimestamp()},{merge:true});await updateProfile(currentUser,{displayName:nome}).catch(()=>{});currentUserData={...currentUserData,nome,funcao};saudacao.textContent='Olá, '+(nome||currentUser.email.split('@')[0])+'!';await refreshCaches();alert('Perfil atualizado com sucesso.');}catch(e){console.error(e);alert('Não foi possível salvar seu perfil.');}}
async function changePasswordFromProfile(){const cur=$('current-pass').value,np=$('profile-new-pass').value,cp=$('profile-confirm-pass').value,st=$('profile-pass-status');if(np.length<6){st.textContent='A nova senha deve ter pelo menos 6 caracteres.';st.className='hint error';return;}if(np!==cp){st.textContent='As senhas não coincidem.';st.className='hint error';return;}try{const cred=EmailAuthProvider.credential(currentUser.email,cur);await reauthenticateWithCredential(currentUser,cred);await updatePassword(currentUser,np);st.textContent='Senha alterada com sucesso.';st.className='hint success';$('current-pass').value=$('profile-new-pass').value=$('profile-confirm-pass').value='';}catch{st.textContent='Não foi possível alterar. Confira sua senha atual.';st.className='hint error';}}
function showPasswordModal(){const modal=$('password-modal');modal.classList.remove('hide');$('salvar-nova-senha').onclick=async()=>{const n=$('nova-senha').value,c=$('confirma-senha').value,st=$('password-status');if(n.length<6){st.textContent='Use pelo menos 6 caracteres.';st.className='hint error';return;}if(n!==c){st.textContent='As senhas não coincidem.';st.className='hint error';return;}try{await updatePassword(currentUser,n);await setDoc(doc(db,'usuarios',currentUser.uid),{mustChangePassword:false},{merge:true});currentUserData.mustChangePassword=false;modal.classList.add('hide');}catch{st.textContent='Não foi possível alterar. Saia e entre novamente para tentar.';st.className='hint error';}};}

// PWA
let deferredPrompt=null;const installButtons=[...document.querySelectorAll('.install-trigger')];window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installButtons.forEach(b=>b.style.display='flex');});installButtons.forEach(btn=>btn.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installButtons.forEach(b=>b.style.display='none');}));window.addEventListener('appinstalled',()=>{deferredPrompt=null;installButtons.forEach(b=>b.style.display='none');});if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=10.3.5').then(r=>r.update()).catch(e=>console.error('PWA SW',e)));}
