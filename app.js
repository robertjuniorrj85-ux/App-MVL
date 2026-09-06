
import { firebaseConfig } from "./firebase-config.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const demoData = {
  songs: [
    {id:"1", title:"A Casa é Sua", key:"G", artist:"Casa Worship", content:`G              D
A casa é sua, pode entrar
Em             C
Me esvazio pra Te adorar

G                 D
És bem-vindo aqui
Em              C
Faz morada em mim`},
    {id:"2", title:"A Ele a Glória", key:"A", artist:"Diante do Trono", content:"A  E  F#m  D\nA Ele a glória, a Ele a honra..."},
    {id:"3", title:"Grandioso És Tu", key:"D", artist:"Tradicional", content:"D  G  A  D\nSenhor meu Deus, quando eu maravilhado..."},
    {id:"4", title:"Nada Além do Sangue", key:"C", artist:"Fernandinho", content:"C  Am  F  G\nTeu sangue leva-me além..."},
    {id:"5", title:"O Teu Amor Não Falha", key:"G", artist:"Nívea Soares", content:"G  D  Em  C\nNada vai me separar..."}
  ],
  scales: [
    {date:"07/09/2026", time:"19h00", title:"Culto de Domingo", status:"Confirmado"},
    {date:"14/09/2026", time:"19h00", title:"Culto de Domingo", status:"Pendente"},
    {date:"21/09/2026", time:"19h00", title:"Culto de Domingo", status:"Pendente"},
    {date:"28/09/2026", time:"19h00", title:"Culto de Domingo", status:"Pendente"}
  ],
  members: [
    {name:"Robert Junior", role:"Líder"},
    {name:"Alan", role:"Guitarra"},
    {name:"Valter", role:"Baixo"},
    {name:"Macleiton", role:"Bateria"},
    {name:"Letícia", role:"Vocal"},
    {name:"Monica", role:"Vocal"}
  ],
  notices: [
    {title:"Ensaio Geral", date:"05/09/2026", text:"Ensaio neste sábado às 16h. Todos os músicos e vocais."},
    {title:"Novas Músicas", date:"02/09/2026", text:"Foram adicionadas novas músicas ao repertório. Verifiquem no app."},
    {title:"Reunião", date:"01/09/2026", text:"Reunião rápida após o culto de domingo."},
    {title:"Equipamentos", date:"", text:"Verificar cabos e fones antes do ensaio."}
  ],
  agenda: [
    {date:"07/09/2026", title:"Culto de Domingo", time:"19h00"},
    {date:"12/09/2026", title:"Ensaio Geral", time:"16h00"},
    {date:"14/09/2026", title:"Culto de Domingo", time:"19h00"}
  ],
  links: [
    {title:"Google Drive do Ministério", url:"#"},
    {title:"Canal do YouTube", url:"#"},
    {title:"Pasta de Multitracks", url:"#"}
  ]
};

let state = JSON.parse(localStorage.getItem("mvl_state") || "null") || demoData;
let firebaseMode = false;
let fb = {};

function saveLocal(){
  localStorage.setItem("mvl_state", JSON.stringify(state));
}

async function initFirebase(){
  const ready = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId;
  if(!ready) return false;
  try{
    const appMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
    const fsMod = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
    const app = appMod.initializeApp(firebaseConfig);
    fb.auth = authMod.getAuth(app);
    fb.db = fsMod.getFirestore(app);
    fb.authMod = authMod;
    fb.fsMod = fsMod;
    firebaseMode = true;
    return true;
  } catch(e){
    console.error(e);
    return false;
  }
}

async function login(email, password){
  if(!firebaseMode) return false;
  const { signInWithEmailAndPassword } = fb.authMod;
  await signInWithEmailAndPassword(fb.auth, email, password);
  return true;
}

function showMain(name="Robert"){
  $("#loginView").classList.add("hidden");
  $("#mainView").classList.remove("hidden");
  $("#welcomeName").textContent = `Olá, ${name}!`;
  renderAll();
}

function showLogin(){
  $("#mainView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
}

function showPage(id){
  $$(".page").forEach(p=>p.classList.toggle("active", p.id===id));
  $$(".nav-item").forEach(b=>b.classList.toggle("active", b.dataset.page===id));
  closeMenu();
  window.scrollTo({top:0,behavior:"smooth"});
}

function closeMenu(){
  $("#sideMenu").classList.remove("open");
  $("#menuBackdrop").classList.remove("show");
}

function renderSongs(filter=""){
  const q = filter.toLowerCase();
  $("#songsList").innerHTML = state.songs.filter(s=>s.title.toLowerCase().includes(q)).map(s=>`
    <div class="list-item song-item" data-id="${s.id}">
      <div class="list-main">
        <h3>☆ ${s.title}</h3>
        <p>Tom: ${s.key} · ${s.artist || "MVL"}</p>
      </div>
      <span class="pill">›</span>
    </div>`).join("");
  $$(".song-item").forEach(el=>el.onclick=()=>openSong(el.dataset.id));
}

function openSong(id){
  const s=state.songs.find(x=>x.id===id);
  if(!s) return;
  $("#detailSongTitle").textContent=s.title;
  $("#detailSongMeta").textContent=`Tom: ${s.key} · ${s.artist || "MVL"}`;
  $("#detailSongContent").textContent=s.content || "Conteúdo ainda não adicionado.";
  showPage("songDetailPage");
}

function renderScales(){
  $("#scalesList").innerHTML=state.scales.map(s=>`
    <div class="list-item">
      <div class="list-main"><h3>${s.date}</h3><p>${s.title} · ${s.time}</p></div>
      <span class="pill ${s.status==="Confirmado"?"ok":"warn"}">${s.status}</span>
    </div>`).join("");
}

function renderMembers(filter=""){
  const q=filter.toLowerCase();
  $("#membersList").innerHTML=state.members.filter(m=>(m.name+" "+m.role).toLowerCase().includes(q)).map(m=>`
    <div class="list-item">
      <div class="list-main"><h3>${m.name}</h3><p>${m.role}</p></div>
      <span class="pill">MVL</span>
    </div>`).join("");
}

function renderNotices(){
  $("#noticesList").innerHTML=state.notices.map(n=>`
    <div class="list-item">
      <div class="list-main"><h3>📣 ${n.title}</h3><p>${n.date ? n.date+" · " : ""}${n.text}</p></div>
    </div>`).join("");
}

function renderAgenda(){
  $("#agendaList").innerHTML=state.agenda.map(a=>`
    <div class="list-item"><div class="list-main"><h3>${a.title}</h3><p>${a.date} · ${a.time}</p></div><span class="pill">Agenda</span></div>
  `).join("");
}

function renderRepertoire(){
  const songs=state.songs.slice(0,4);
  $("#repertoireList").innerHTML=`
    <div class="card"><span class="eyebrow">Próximo culto</span><h3>Domingo · 07/09/2026 · 19h00</h3>
    <div class="list" style="margin-top:12px">${songs.map((s,i)=>`<div class="list-item"><div class="list-main"><h3>${i+1}. ${s.title}</h3><p>Tom: ${s.key}</p></div></div>`).join("")}</div></div>`;
}

function renderLinks(){
  $("#linksList").innerHTML=state.links.map(l=>`
    <a class="list-item" href="${l.url}" target="_blank" style="color:inherit;text-decoration:none">
      <div class="list-main"><h3>🔗 ${l.title}</h3><p>Abrir link</p></div><span class="pill">›</span>
    </a>`).join("");
}

function renderAll(){
  renderSongs();
  renderScales();
  renderMembers();
  renderNotices();
  renderAgenda();
  renderRepertoire();
  renderLinks();
}

function dialog(type){
  const cfg={
    song:{
      title:"Adicionar música",
      fields:[
        ["title","Nome da música","text"],
        ["artist","Cantor/Ministério","text"],
        ["key","Tom","text"],
        ["content","Cifra/Letra","textarea"]
      ]
    },
    member:{
      title:"Adicionar membro",
      fields:[["name","Nome","text"],["role","Função/Instrumento","text"]]
    },
    notice:{
      title:"Adicionar aviso",
      fields:[["title","Título","text"],["date","Data","text"],["text","Mensagem","textarea"]]
    },
    scale:{
      title:"Adicionar escala",
      fields:[["date","Data","text"],["time","Horário","text"],["title","Descrição","text"]]
    }
  }[type];
  $("#dialogTitle").textContent=cfg.title;
  $("#dialogFields").innerHTML=cfg.fields.map(([name,label,kind])=>{
    if(kind==="textarea") return `<label>${label}<textarea name="${name}" rows="6" style="width:100%;background:#141414;border:1px solid #3a3a3a;color:white;padding:12px;border-radius:10px"></textarea></label>`;
    return `<label>${label}<input name="${name}" type="${kind}" required></label>`;
  }).join("");
  $("#genericDialog").showModal();
  $("#dialogForm").onsubmit=(e)=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(e.currentTarget).entries());
    if(type==="song") state.songs.unshift({id:String(Date.now()),...data});
    if(type==="member") state.members.unshift(data);
    if(type==="notice") state.notices.unshift(data);
    if(type==="scale") state.scales.unshift({...data,status:"Pendente"});
    saveLocal(); renderAll(); $("#genericDialog").close();
  };
}

document.addEventListener("DOMContentLoaded", async ()=>{
  const fbReady=await initFirebase();

  $("#loginBtn").onclick=async ()=>{
    const email=$("#emailInput").value.trim(), password=$("#passwordInput").value;
    $("#loginMessage").textContent="";
    if(!fbReady){
      $("#loginMessage").textContent="Firebase ainda não configurado. Use o modo demonstração.";
      return;
    }
    try{
      await login(email,password);
      showMain(email.split("@")[0] || "MVL");
    }catch(e){
      $("#loginMessage").textContent="Não foi possível entrar. Verifique e-mail e senha.";
    }
  };

  $("#demoBtn").onclick=()=>showMain("Robert");
  $("#logoutBtn").onclick=async ()=>{
    if(firebaseMode) await fb.authMod.signOut(fb.auth);
    showLogin();
    closeMenu();
  };

  $$("[data-page]").forEach(el=>el.addEventListener("click",()=>showPage(el.dataset.page)));

  $("#menuBtn").onclick=()=>{
    $("#sideMenu").classList.add("open"); $("#menuBackdrop").classList.add("show");
  };
  $("#closeMenuBtn").onclick=closeMenu;
  $("#menuBackdrop").onclick=closeMenu;

  $("#songSearch").oninput=e=>renderSongs(e.target.value);
  $("#memberSearch").oninput=e=>renderMembers(e.target.value);
  $("#addSongBtn").onclick=()=>dialog("song");
  $("#addMemberBtn").onclick=()=>dialog("member");
  $("#addNoticeBtn").onclick=()=>dialog("notice");
  $("#addScaleBtn").onclick=()=>dialog("scale");

  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
});
