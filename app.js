import { firebaseConfig } from './firebase-config.js?v=7.0';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
  setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {
  getFirestore, doc, setDoc, serverTimestamp, collection, addDoc,
  getDocs, deleteDoc, updateDoc, query, orderBy
} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const fbApp=initializeApp(firebaseConfig);
const auth=getAuth(fbApp);
const db=getFirestore(fbApp);
setPersistence(auth,browserLocalPersistence).catch(()=>{});

const login=document.getElementById('login');
const appScreen=document.getElementById('app');
const email=document.getElementById('email');
const senha=document.getElementById('senha');
const entrar=document.getElementById('entrar');
const status=document.getElementById('login-status');
const saudacao=document.getElementById('saudacao');
const homeView=document.getElementById('home-view');
const sectionView=document.getElementById('section-view');
const sectionTitle=document.getElementById('section-title');
const sectionSubtitle=document.getElementById('section-subtitle');
const dynamicForm=document.getElementById('dynamic-form');
const listEl=document.getElementById('items-list');
const saveBtn=document.getElementById('salvar-item');

let currentUser=null;
let currentPage='inicio';
let editingId=null;

const sections={
  escalas:{
    title:'Escalas',
    subtitle:'Organize quem servirá em cada culto.',
    collection:'escalas',
    fields:[
      ['data','Data','date'],
      ['horario','Horário','time'],
      ['evento','Culto / Evento','text'],
      ['equipe','Equipe / Integrantes','textarea']
    ]
  },
  repertorio:{
    title:'Repertório',
    subtitle:'Monte o repertório de cada culto ou evento.',
    collection:'repertorios',
    fields:[
      ['data','Data','date'],
      ['evento','Culto / Evento','text'],
      ['musicas','Músicas do repertório','textarea']
    ]
  },
  musicas:{
    title:'Músicas',
    subtitle:'Cadastre as músicas utilizadas pelo ministério.',
    collection:'musicas',
    fields:[
      ['titulo','Título da música','text'],
      ['tom','Tom','text'],
      ['artista','Cantor / Ministério','text'],
      ['link','Link da música / cifra','url'],
      ['observacoes','Observações','textarea']
    ]
  },
  agenda:{
    title:'Agenda',
    subtitle:'Cultos, ensaios, reuniões e eventos.',
    collection:'agenda',
    fields:[
      ['data','Data','date'],
      ['horario','Horário','time'],
      ['titulo','Evento','text'],
      ['local','Local','text'],
      ['observacoes','Observações','textarea']
    ]
  },
  avisos:{
    title:'Avisos',
    subtitle:'Comunicados para os integrantes.',
    collection:'avisos',
    fields:[
      ['titulo','Título','text'],
      ['mensagem','Mensagem','textarea']
    ]
  },
  membros:{
    title:'Membros',
    subtitle:'Lista de integrantes do ministério.',
    collection:'membros',
    fields:[
      ['nome','Nome','text'],
      ['funcao','Função / Instrumento','text'],
      ['email','E-mail','email'],
      ['telefone','Telefone','tel']
    ]
  },
  arquivos:{
    title:'Arquivos',
    subtitle:'Links para documentos, cifras e materiais.',
    collection:'arquivos',
    fields:[
      ['nome','Nome do arquivo','text'],
      ['link','Link do arquivo','url'],
      ['descricao','Descrição','textarea']
    ]
  },
  multitracks:{
    title:'Multitracks',
    subtitle:'Organize links das multitracks do ministério.',
    collection:'multitracks',
    fields:[
      ['musica','Música','text'],
      ['tom','Tom','text'],
      ['link','Link da multitrack','url'],
      ['observacoes','Observações','textarea']
    ]
  },
  links:{
    title:'Links Úteis',
    subtitle:'Links importantes para a equipe.',
    collection:'links',
    fields:[
      ['nome','Nome','text'],
      ['link','Endereço do link','url'],
      ['descricao','Descrição','textarea']
    ]
  }
};

function msg(text,error=false){
  status.textContent=text;
  status.className=error?'hint error':'hint';
}

function traduzErro(code){
  if(['auth/invalid-credential','auth/wrong-password','auth/user-not-found'].includes(code)) return 'E-mail ou senha incorretos.';
  if(code==='auth/invalid-email') return 'Digite um e-mail válido.';
  if(code==='auth/too-many-requests') return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  if(code==='auth/network-request-failed') return 'Sem conexão com a internet.';
  return 'Não foi possível entrar. Tente novamente.';
}

entrar.addEventListener('click',async()=>{
  if(!email.value.trim()||!senha.value){msg('Digite seu e-mail e sua senha.',true);return;}
  entrar.disabled=true; msg('Entrando...');
  try{
    await signInWithEmailAndPassword(auth,email.value.trim(),senha.value);
    senha.value='';
  }catch(e){
    msg(traduzErro(e.code),true);
  }finally{
    entrar.disabled=false;
  }
});
senha.addEventListener('keydown',e=>{if(e.key==='Enter') entrar.click();});
document.getElementById('sair').addEventListener('click',()=>signOut(auth));

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(user){
    login.classList.add('hide');
    appScreen.classList.remove('hide');
    const nome=(user.displayName||user.email.split('@')[0]);
    saudacao.textContent='Olá, '+nome+'!';
    try{
      await setDoc(doc(db,'usuarios',user.uid),{
        email:user.email,
        ultimoAcesso:serverTimestamp()
      },{merge:true});
    }catch(e){
      console.warn('Firestore:',e.code);
    }
    goHome();
  }else{
    appScreen.classList.add('hide');
    login.classList.remove('hide');
    msg('');
  }
});

function goHome(){
  currentPage='inicio';
  editingId=null;
  homeView.classList.remove('hide');
  sectionView.classList.add('hide');
  setActiveNav('inicio');
}

function setActiveNav(page){
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.classList.toggle('active',b.dataset.page===page);
  });
}

function buildForm(config, data={}){
  dynamicForm.innerHTML='<div class="form-grid">'+config.fields.map(([key,label,type])=>{
    const value=data[key]??'';
    if(type==='textarea'){
      return `<textarea id="f-${key}" placeholder="${label}">${escapeHtml(value)}</textarea>`;
    }
    return `<input id="f-${key}" type="${type}" placeholder="${label}" value="${escapeAttr(value)}">`;
  }).join('')+'</div>';
}

function collectForm(config){
  const obj={};
  for(const [key] of config.fields){
    obj[key]=(document.getElementById('f-'+key)?.value||'').trim();
  }
  return obj;
}

async function openSection(page){
  if(!sections[page]) return;
  currentPage=page;
  editingId=null;
  const config=sections[page];
  homeView.classList.add('hide');
  sectionView.classList.remove('hide');
  sectionTitle.textContent=config.title;
  sectionSubtitle.textContent=config.subtitle;
  document.getElementById('form-title').textContent='Adicionar';
  saveBtn.textContent='Salvar';
  buildForm(config);
  setActiveNav(page);
  await loadItems();
}

async function loadItems(){
  const config=sections[currentPage];
  if(!config) return;
  listEl.innerHTML='<div class="empty">Carregando...</div>';
  try{
    let snap;
    try{
      snap=await getDocs(query(collection(db,config.collection),orderBy('criadoEm','desc')));
    }catch{
      snap=await getDocs(collection(db,config.collection));
    }
    if(snap.empty){
      listEl.innerHTML='<div class="empty">Nenhum item cadastrado ainda.</div>';
      return;
    }
    listEl.innerHTML='';
    snap.forEach(d=>{
      const data=d.data();
      const card=document.createElement('div');
      card.className='item-card';
      const values=config.fields
        .map(([key,label])=>[label,data[key]])
        .filter(([,v])=>v);
      const primary=values[0]?.[1] || config.title;
      const rest=values.slice(1).map(([label,v])=>{
        const rendered=(typeof v==='string' && /^https?:\/\//i.test(v))
          ? `<a href="${escapeAttr(v)}" target="_blank" rel="noopener">Abrir link</a>`
          : escapeHtml(v);
        return `<div class="item-meta"><b>${escapeHtml(label)}:</b> ${rendered}</div>`;
      }).join('');
      card.innerHTML=`
        <h3>${escapeHtml(primary)}</h3>
        ${rest}
        <div class="item-actions">
          <button class="edit-btn">Editar</button>
          <button class="delete-btn">Excluir</button>
        </div>`;
      card.querySelector('.edit-btn').addEventListener('click',()=>{
        editingId=d.id;
        buildForm(config,data);
        document.getElementById('form-title').textContent='Editar';
        saveBtn.textContent='Atualizar';
        window.scrollTo({top:0,behavior:'smooth'});
      });
      card.querySelector('.delete-btn').addEventListener('click',async()=>{
        if(confirm('Excluir este item?')){
          await deleteDoc(doc(db,config.collection,d.id));
          await loadItems();
        }
      });
      listEl.appendChild(card);
    });
  }catch(e){
    console.error(e);
    listEl.innerHTML='<div class="empty">Não foi possível carregar os dados. Verifique a internet e as regras do Firestore.</div>';
  }
}

saveBtn.addEventListener('click',async()=>{
  const config=sections[currentPage];
  if(!config) return;
  const data=collectForm(config);
  const hasValue=Object.values(data).some(Boolean);
  if(!hasValue){
    alert('Preencha pelo menos um campo.');
    return;
  }
  saveBtn.disabled=true;
  try{
    if(editingId){
      await updateDoc(doc(db,config.collection,editingId),{
        ...data,
        atualizadoEm:serverTimestamp(),
        atualizadoPor:currentUser?.uid||''
      });
    }else{
      await addDoc(collection(db,config.collection),{
        ...data,
        criadoEm:serverTimestamp(),
        criadoPor:currentUser?.uid||''
      });
    }
    editingId=null;
    document.getElementById('form-title').textContent='Adicionar';
    saveBtn.textContent='Salvar';
    buildForm(config);
    await loadItems();
  }catch(e){
    console.error(e);
    alert('Não foi possível salvar. Verifique a conexão e as regras do Firestore.');
  }finally{
    saveBtn.disabled=false;
  }
});

document.querySelectorAll('.menu-card').forEach(btn=>{
  btn.addEventListener('click',()=>openSection(btn.dataset.page));
});
document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(btn.dataset.page==='inicio') goHome();
    else openSection(btn.dataset.page);
  });
});
document.getElementById('voltar').addEventListener('click',goHome);

function escapeHtml(v=''){
  return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function escapeAttr(v=''){return escapeHtml(v);}

let deferredPrompt=null;
const installButtons=[...document.querySelectorAll('.install-trigger')];
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredPrompt=e;
  installButtons.forEach(b=>b.style.display='flex');
});
installButtons.forEach(btn=>btn.addEventListener('click',async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  installButtons.forEach(b=>b.style.display='none');
}));
window.addEventListener('appinstalled',()=>{
  deferredPrompt=null;
  installButtons.forEach(b=>b.style.display='none');
});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=7.0').then(r=>r.update()).catch(()=>{}));
}
