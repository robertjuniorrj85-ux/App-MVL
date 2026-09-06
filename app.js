
let deferredPrompt=null;
const installButtons=[...document.querySelectorAll('.install-trigger')];

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredPrompt=e;
  installButtons.forEach(btn=>btn.style.display='flex');
});

async function instalar(){
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt=null;
  installButtons.forEach(btn=>btn.style.display='none');
}

installButtons.forEach(btn=>btn.addEventListener('click',instalar));

window.addEventListener('appinstalled',()=>{
  deferredPrompt=null;
  installButtons.forEach(btn=>btn.style.display='none');
});

document.getElementById('demo').onclick=()=>{document.getElementById('login').classList.add('hide');document.getElementById('app').classList.remove('hide')};

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').then(reg=>reg.update()).catch(()=>{}));
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(!sessionStorage.getItem('swReloaded')){
      sessionStorage.setItem('swReloaded','1');
      location.reload();
    }
  });
}
