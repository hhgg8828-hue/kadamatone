const CACHE='khadamat-shell-v66_10';
const SHELL=['/','/provider.html','/admin.html','/css/app.css','/js/app.js','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.pathname.startsWith('/api/'))return;e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r}).catch(()=>cached)));});

self.addEventListener('push', event => { let data={}; try{data=event.data?event.data.json():{};}catch{data={body:event.data?event.data.text():''};} const title=data.title||'خدمات'; const options={body:data.body||'لديك إشعار جديد',icon:'/manifest.webmanifest',data:data.data||{}}; event.waitUntil(self.registration.showNotification(title,options)); });
self.addEventListener('notificationclick', event => { event.notification.close(); const orderId=event.notification.data?.orderId; const chat=event.notification.data?.open==='chat'; const page=event.notification.data?.targetPage||'/'; const target=orderId?`${page}?order=${encodeURIComponent(orderId)}${chat?'&chat=1':''}`:page; event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus' in c){c.navigate(target);return c.focus();}} return clients.openWindow(target);})); });
