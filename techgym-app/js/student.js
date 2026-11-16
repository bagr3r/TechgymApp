// js/student.js
import { supabase, GYM_WHATSAPP, DEFAULT_WHATSAPP_MSG } from './config.js';
import { logout } from './auth.js';

let currentUser = null;
let allWorkouts = [];
let activeDivision = null;

document.getElementById('btn-logout').addEventListener('click', logout);

// Configura link do WhatsApp
const waLink = document.getElementById('whatsapp-link');
waLink.href = `https://wa.me/${GYM_WHATSAPP}?text=${encodeURIComponent(DEFAULT_WHATSAPP_MSG)}`;

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = './index.html';
    return;
  }

  currentUser = session.user;
  await loadProfile();
  await loadAttendance();
  await loadWorkouts();
}

async function loadProfile() {
  const { data } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', currentUser.id)
    .single();

  if (data) {
    document.getElementById('student-name').textContent = `Olá, ${data.full_name.split(' ')[0]}`;
  }
}

async function loadAttendance() {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance')
    .select('checkin_date')
    .eq('student_id', currentUser.id)
    .gte('checkin_date', firstDayOfMonth);

  if (!error && data) {
    document.getElementById('attendance-count').textContent = `${data.length} treino(s) neste mês`;
    const alreadyCheckedIn = data.some(item => item.checkin_date === today);
    const btnCheckin = document.getElementById('btn-checkin');

    if (alreadyCheckedIn) {
      btnCheckin.textContent = 'Treino Concluído ✓';
      btnCheckin.disabled = true;
      btnCheckin.style.opacity = '0.7';
    }
  }
}

document.getElementById('btn-checkin').addEventListener('click', async () => {
  const btn = document.getElementById('btn-checkin');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const { error } = await supabase
    .from('attendance')
    .insert({ student_id: currentUser.id });

  if (error) {
    alert('Presença já registrada hoje ou erro de conexão.');
  }
  await loadAttendance();
});

async function loadWorkouts() {
  const { data, error } = await supabase
    .from('workout_plans')
    .select(`
      id,
      division,
      sets,
      reps,
      notes,
      exercises (
        name,
        machine_number,
        youtube_video_id
      )
    `)
    .eq('student_id', currentUser.id)
    .order('id', { ascending: true });

  if (!error && data) {
    allWorkouts = data;
    // Salva cópia offline para caso o Wi-Fi da academia falhe
    localStorage.setItem('techgym_workout_cache', JSON.stringify(data));
  } else {
    // Fallback offline
    const cached = localStorage.getItem('techgym_workout_cache');
    if (cached) allWorkouts = JSON.parse(cached);
  }

  renderTabs();
}

function renderTabs() {
  const tabsContainer = document.getElementById('division-tabs');
  const listContainer = document.getElementById('workout-list');

  if (allWorkouts.length === 0) {
    listContainer.innerHTML = '<div class="card"><p>Você ainda não possui ficha cadastrada. Fale com seu instrutor!</p></div>';
    return;
  }

  const divisions = [...new Set(allWorkouts.map(w => w.division))];
  if (!activeDivision || !divisions.includes(activeDivision)) {
    activeDivision = divisions[0];
  }

  tabsContainer.innerHTML = divisions.map(div => `
    <button class="tab-btn ${div === activeDivision ? 'active' : ''}" data-div="${div}">
      ${div}
    </button>
  `).join('');

  tabsContainer.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDivision = btn.dataset.div;
      renderTabs();
    });
  });

  renderExercises();
}

function renderExercises() {
  const listContainer = document.getElementById('workout-list');
  const filtered = allWorkouts.filter(w => w.division === activeDivision);

  listContainer.innerHTML = filtered.map(item => {
    const ex = item.exercises;
    const hasVideo = ex.youtube_video_id && ex.youtube_video_id.trim() !== '';

    return `
      <article class="card exercise-card">
        <div class="exercise-header">
          <h3 style="font-size: 17px;">${ex.name}</h3>
          <span class="machine-badge">Aparelho #${ex.machine_number}</span>
        </div>

        <p class="exercise-details">
          <strong>${item.sets} séries</strong> × <strong>${item.reps} repetições</strong>
        </p>

        ${item.notes ? `<div class="exercise-notes">💡 ${item.notes}</div>` : ''}

        ${hasVideo ? `
          <button class="secondary btn-video" data-video="${ex.youtube_video_id}">
            ▶ Ver Vídeo de Execução
          </button>
          <div class="video-slot hidden"></div>
        ` : ''}
      </article>
    `;
  }).join('');

  // Carrega o iframe do YouTube apenas quando o aluno clicar (mantém o app ultraleve)
  listContainer.querySelectorAll('.btn-video').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.nextElementSibling;
      const videoId = btn.dataset.video;

      if (slot.classList.contains('hidden')) {
        slot.innerHTML = `
          <div class="video-container">
            <iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowfullscreen loading="lazy"></iframe>
          </div>
        `;
        slot.classList.remove('hidden');
        btn.textContent = '▲ Fechar Vídeo';
      } else {
        slot.innerHTML = '';
        slot.classList.add('hidden');
        btn.textContent = '▶ Ver Vídeo de Execução';
      }
    });
  });
}

init();