importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBsduWoAhUPNhvbR54tXWUCUS1zMRA87K8",
  authDomain: "pro-mvl.firebaseapp.com",
  projectId: "pro-mvl",
  storageBucket: "pro-mvl.firebasestorage.app",
  messagingSenderId: "958620545060",
  appId: "1:958620545060:web:33e22fd8607668f0e168b1"
});
const messaging=firebase.messaging();

messaging.onBackgroundMessage(payload=>{
  const title=payload.notification?.title||payload.data?.title||'MVL';
  const options={
    body:payload.notification?.body||payload.data?.body||'',
    icon:'./mvl-icon-192-v4.png',
    badge:'./mvl-icon-192-v4.png',
    data:payload.data||{}
  };
  self.registration.showNotification(title,options);
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const client of list){ if('focus' in client) return client.focus(); }
    return clients.openWindow('./index.html?v=9.1');
  }));
});
