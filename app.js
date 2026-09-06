let deferredPrompt=null;
const installButtons=()=>document.querySelectorAll('.install-trigger');
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;});
async function installApp(){if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null}else{alert('No Android/Chrome: toque no menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”. No iPhone: Compartilhar → “Adicionar à Tela de Início”.')}}
installButtons().forEach(b=>b.onclick=installApp);
document.getElementById('demo').onclick=()=>{document.getElementById('login').classList.add('hide');document.getElementById('app').classList.remove('hide')};
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js');