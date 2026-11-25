const CACHE_NAME = 'techgym-network-first-v15';

const CORE_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './aluno.html',
  './css/global.css',
  './css/admin.css',
  './css/aluno.css',
  './css/login.css',
  './js/config.js',
  './js/auth.js',
  './js/admin.js',
  './js/admin/ui.js',
  './js/admin/dashboard.js',
  './js/admin/workoutBuilder.js',
  './js/admin/students.js',
  './js/admin/exercises.js',
  './js/student.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Ignora chamadas à API do Supabase para nunca cachear dados antigos
  if (event.request.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const clone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});