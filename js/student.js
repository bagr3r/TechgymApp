// @ts-check
import { supabase, GYM_WHATSAPP, DEFAULT_WHATSAPP_MSG } from './config.js';
import { checkAuth, logout } from './auth.js';

const logoutBtn = document.getElementById('logout-btn');
const studentNameDisplay = document.getElementById('student-name-display');
const todayDateDisplay = document.getElementById('today-date-display');
const checkinBtn = document.getElementById('checkin-btn');
const checkinText = document.getElementById('checkin-text');
const divisionTabs = document.getElementById('division-tabs');
const exercisesContainer = document.getElementById('exercises-container');
const progressBarBox = document.getElementById('progress-bar-box');
const progressCount = document.getElementById('progress-count');
const progressFill = document.getElementById('progress-fill');
const whatsappFloat = document.getElementById('whatsapp-float');

// Modal de vídeo
const videoModal = document.getElementById('video-modal');
const modalTitle = document.getElementById('modal-exercise-title');
const youtubeIframe = document.getElementById('youtube-iframe');
const closeModalBtn = document.getElementById('close-modal-btn');

let currentStudentId = null;
let allWorkoutItems = [];
let activeDivision = null;
const completedSet = new Set();

if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });
}

// Configura link do WhatsApp
if (whatsappFloat) {
  const encodedMsg = encodeURIComponent(DEFAULT_WHATSAPP_MSG);
  whatsappFloat.href = `https://wa.me/${GYM_WHATSAPP}?text=${encodedMsg}`;
}

// Formata data atual
if (todayDateDisplay) {
  todayDateDisplay.textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });
}

// ==========================================================================
// 1. CHECK-IN DIÁRIO
// ==========================================================================
function getTodayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split('T')[0];
}

async function checkTodayAttendance(studentId) {
  const today = getTodayISO();
  const { data, error } = await supabase
    .from('attendance')
    .select('id')
    .eq('student_id', studentId)
    .eq('check_in_date', today)
    .maybeSingle();

  if (!error && data) {
    markCheckinDone();
  }
}

function markCheckinDone() {
  if (!checkinBtn || !checkinText) return;
  checkinBtn.classList.add('checked');
  checkinBtn.disabled = true;
  checkinText.textContent = 'Presença Registrada Hoje!';
}

if (checkinBtn) {
  checkinBtn.addEventListener('click', async () => {
    if (!currentStudentId || checkinBtn.disabled) return;
    checkinBtn.disabled = true;
    if (checkinText) checkinText.textContent = 'Registrando...';

    const { error } = await supabase.from('attendance').insert([{
      student_id: currentStudentId,
      check_in_date: getTodayISO()
    }]);

    if (error) {
      // Se já houver registro duplicado no mesmo dia, apenas marca como concluído
      if (error.code === '23505') {
        markCheckinDone();
        return;
      }
      checkinBtn.disabled = false;
      if (checkinText) checkinText.textContent = 'Fazer Check-in Hoje';
      alert('Não foi possível registrar o check-in: ' + error.message);
      return;
    }

    markCheckinDone();
  });
}

// ==========================================================================
// 2. CARREGAMENTO E RENDERIZAÇÃO DA FICHA
// ==========================================================================
async function loadStudentWorkout(studentId) {
  const { data, error } = await supabase
    .from('workout_plans')
    .select(`
      id,
      division,
      sets,
      reps,
      rest_seconds,
      notes,
      exercises (
        id,
        name,
        machine_number,
        muscle_group,
        video_url
      )
    `)
    .eq('student_id', studentId)
    .order('division', { ascending: true });

  if (error) {
    if (exercisesContainer) {
      exercisesContainer.innerHTML = `<div class="loading-card">Erro ao carregar treino: ${escapeHtml(error.message)}</div>`;
    }
    return;
  }

  allWorkoutItems = data || [];

  if (!allWorkoutItems.length) {
    if (divisionTabs) divisionTabs.innerHTML = '';
    if (exercisesContainer) {
      exercisesContainer.innerHTML = `
        <div class="loading-card">
          Você ainda não possui uma ficha cadastrada.<br>
          <small style="color: var(--text-gray);">Peça ao instrutor da Techgym para montar seu treino.</small>
        </div>`;
    }
    return;
  }

  // Descobre divisões únicas (A, B, C...)
  const divisions = [...new Set(allWorkoutItems.map(item => item.division))].sort();
  activeDivision = divisions[0];

  renderDivisionTabs(divisions);
  renderExercisesForDivision(activeDivision);
}

function renderDivisionTabs(divisions) {
  if (!divisionTabs) return;
  divisionTabs.innerHTML = divisions.map(div => `
    <button type="button"
            class="div-tab ${div === activeDivision ? 'active' : ''}"
            data-div="${escapeHtml(div)}">
      Treino ${escapeHtml(div)}
    </button>
  `).join('');

  divisionTabs.querySelectorAll('.div-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDivision = btn.getAttribute('data-div');
      divisionTabs.querySelectorAll('.div-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderExercisesForDivision(activeDivision);
    });
  });
}

function renderExercisesForDivision(division) {
  if (!exercisesContainer) return;
  const items = allWorkoutItems.filter(item => item.division === division);

  updateProgress(items);

  exercisesContainer.innerHTML = items.map(item => {
    const ex = item.exercises || {};
    const isDone = completedSet.has(item.id);
    const embedUrl = getYoutubeEmbedUrl(ex.video_url);

    return `
      <article class="exercise-card ${isDone ? 'completed' : ''}" data-item-id="${item.id}">
        <div class="exercise-top">
          <span class="machine-pill">MÁQ #${escapeHtml(ex.machine_number || 'LIVRE')}</span>
          <span class="muscle-tag">${escapeHtml(ex.muscle_group || 'Geral')}</span>
        </div>

        <h2 class="exercise-title">${escapeHtml(ex.name || 'Exercício')}</h2>

        <div class="metrics-row">
          <div class="metric-item">
            <small>Séries</small>
            <strong>${item.sets}</strong>
          </div>
          <div class="metric-item">
            <small>Repetições</small>
            <strong>${escapeHtml(item.reps)}</strong>
          </div>
          <div class="metric-item">
            <small>Descanso</small>
            <strong>${item.rest_seconds || 60}s</strong>
          </div>
        </div>

        ${item.notes ? `<div class="exercise-notes"><strong>Obs:</strong> ${escapeHtml(item.notes)}</div>` : ''}

        <div class="exercise-actions">
          ${embedUrl
            ? `<button type="button" class="btn-video" onclick="openVideoModal('${escapeHtml(ex.name)}', '${embedUrl}')">▶ Ver Execução</button>`
            : ''}
          <button type="button" class="btn-done-toggle" onclick="toggleExerciseDone('${item.id}')">
            ${isDone ? '✓ Concluído' : 'Marcar Feito'}
          </button>
        </div>
      </article>
    `;
  }).join('');
}

window.toggleExerciseDone = (itemId) => {
  if (completedSet.has(itemId)) {
    completedSet.delete(itemId);
  } else {
    completedSet.add(itemId);
  }
  renderExercisesForDivision(activeDivision);
};

function updateProgress(items) {
  if (!progressBarBox || !progressCount || !progressFill) return;
  if (!items.length) {
    progressBarBox.style.display = 'none';
    return;
  }
  progressBarBox.style.display = 'block';
  const doneCount = items.filter(i => completedSet.has(i.id)).length;
  const pct = Math.round((doneCount / items.length) * 100);
  progressCount.textContent = `${doneCount}/${items.length}`;
  progressFill.style.width = `${pct}%`;
}

// ==========================================================================
// 3. MODAL DO YOUTUBE (Converte links watch?v=, youtu.be/ e shorts/)
// ==========================================================================
function getYoutubeEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}?rel=0` : null;
}

window.openVideoModal = (title, embedUrl) => {
  if (!videoModal || !youtubeIframe || !modalTitle) return;
  modalTitle.textContent = title;
  youtubeIframe.src = embedUrl;
  videoModal.style.display = 'flex';
};

function closeVideoModal() {
  if (!videoModal || !youtubeIframe) return;
  youtubeIframe.src = '';
  videoModal.style.display = 'none';
}

if (closeModalBtn) {
  closeModalBtn.addEventListener('click', closeVideoModal);
}

if (videoModal) {
  videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) closeVideoModal();
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================================================
// 4. INICIALIZAÇÃO
// ==========================================================================
(async function initStudentApp() {
  const auth = await checkAuth('student');
  if (!auth) return;

  currentStudentId = auth.profile.id;
  if (studentNameDisplay) {
    studentNameDisplay.textContent = auth.profile.full_name || 'Aluno Techgym';
  }

  await Promise.all([
    checkTodayAttendance(currentStudentId),
    loadStudentWorkout(currentStudentId)
  ]);
})();