import { firebaseConfig } from './firebase-config.js?v=6.0';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getFirestore, doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

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

function msg(text,error=false){status.textContent=text;status.className=error?'hint error':'hint';}
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
  try{await signInWithEmailAndPassword(auth,email.value.trim(),senha.value);senha.value='';}
  catch(e){msg(traduzErro(e.code),true);}
  finally{entrar.disabled=false;}
});
senha.addEventListener('keydown',e=>{if(e.key==='Enter') entrar.click();});

document.getElementById('sair').addEventListener('click',()=>signOut(auth));

onAuthStateChanged(auth,async user=>{
  if(user){
    login.classList.add('hide'); appScreen.classList.remove('hide');
    const nome=(user.displayName||user.email.split('@')[0]);
    saudacao.textContent='Olá, '+nome+'!';
    try{await setDoc(doc(db,'usuarios',user.uid),{email:user.email,ultimoAcesso:serverTimestamp()},{merge:true});}catch(e){console.warn('Firestore:',e.code);}
  }else{
    appScreen.classList.add('hide'); login.classList.remove('hide'); msg('');
  }
});

let deferredPrompt=null;
const installButtons=[...document.querySelectorAll('.install-trigger')];
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;installButtons.forEach(b=>b.style.display='flex');});
installButtons.forEach(btn=>btn.addEventListener('click',async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installButtons.forEach(b=>b.style.display='none');}));
window.addEventListener('appinstalled',()=>{deferredPrompt=null;installButtons.forEach(b=>b.style.display='none');});

if('serviceWorker' in navigator){
 window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=6.0').then(r=>r.update()).catch(()=>{}));
}
