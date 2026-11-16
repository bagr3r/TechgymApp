// sw.js
const CACHE_NAME = 'techgym-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './aluno.html',
  './admin.html',
  './manifest.json',
  './css/global.css',
  './css/aluno.css',
  './css/admin.css',
  './js/config.js',
  './js/auth.js',
  './js/student.js',
  './js/admin.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', (event) => {
  // Não faz cache das chamadas de API do Supabase (para sempre pegar treinos atualizados)
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});