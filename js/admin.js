// js/admin.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabase } from './config.js';
import { logout } from './auth.js';

document.getElementById('btn-logout').addEventListener('click', logout);

// Navegação entre abas
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.target).classList.remove('hidden');
  });
});

// Verifica se o usuário é realmente admin
async function verifyAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = './index.html';
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    window.location.href = './aluno.html';
    return;
  }

  await loadAllData();
}

async function loadAllData() {
  await loadStudents();
  await loadExercises();
  const selectStudent = document.getElementById('select-student');
  if (selectStudent.value) {
    await loadStudentWorkout(selectStudent.value);
  }
}

// Extrai o ID de qualquer formato de URL do YouTube (watch, shorts, youtu.be) ou retorna o próprio ID
function extractYouTubeId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  const regExp = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = trimmed.match(regExp);
  return match ? match[1] : trimmed;
}

// ================= EXERCÍCIOS E MÁQUINAS =================
async function loadExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('machine_number', { ascending: true });

  if (error) return;

  const tbody = document.getElementById('tbody-exercises');
  const select = document.getElementById('select-exercise');

  tbody.innerHTML = data.map(ex => `
    <tr>
      <td><strong>#${ex.machine_number}</strong></td>
      <td>${ex.name}</td>
      <td>${ex.youtube_video_id ? '✅ Sim' : '—'}</td>
      <td>
        <button class="btn-small btn-danger" onclick="deleteExercise(${ex.id})">Excluir</button>
      </td>
    </tr>
  `).join('');

  select.innerHTML = data.map(ex => `
    <option value="${ex.id}">[Máq #${ex.machine_number}] ${ex.name}</option>
  `).join('');
}

document.getElementById('form-exercise').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('ex-name').value.trim();
  const machine_number = document.getElementById('ex-machine').value.trim();
  const rawYoutube = document.getElementById('ex-youtube').value;
  const youtube_video_id = extractYouTubeId(rawYoutube);

  const { error } = await supabase
    .from('exercises')
    .insert({ name, machine_number, youtube_video_id });

  if (error) {
    alert('Erro ao cadastrar exercício: ' + error.message);
    return;
  }

  e.target.reset();
  await loadExercises();
});

window.deleteExercise = async (id) => {
  if (!confirm('Remover este exercício do catálogo?')) return;
  await supabase.from('exercises').delete().eq('id', id);
  await loadExercises();
};

// ================= ALUNOS E FREQUÊNCIA =================
async function loadStudents() {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const { data: students } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'student')
    .order('full_name', { ascending: true });

  const { data: attendances } = await supabase
    .from('attendance')
    .select('student_id')
    .gte('checkin_date', firstDayOfMonth);

  if (!students) return;

  const tbody = document.getElementById('tbody-students');
  const select = document.getElementById('select-student');

  tbody.innerHTML = students.map(st => {
    const count = attendances ? attendances.filter(a => a.student_id === st.id).length : 0;
    return `
      <tr>
        <td>
          <strong>${st.full_name}</strong><br>
          <span style="font-size: 12px; color: var(--text-secondary);">${st.phone || 'Sem telefone'}</span>
        </td>
        <td><strong>${count}</strong> treinos</td>
        <td>
          <span class="badge-status ${st.active ? 'badge-active' : 'badge-inactive'}">
            ${st.active ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td>
          <button class="btn-small secondary" onclick="toggleStudentStatus('${st.id}', ${st.active})">
            ${st.active ? 'Bloquear' : 'Ativar'}
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const previousSelection = select.value;
  select.innerHTML = students
    .filter(s => s.active)
    .map(st => `<option value="${st.id}">${st.full_name}</option>`)
    .join('');

  if (previousSelection) select.value = previousSelection;
}

document.getElementById('form-student').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-create-student');
  btn.disabled = true;
  btn.textContent = 'Cadastrando...';

  const full_name = document.getElementById('student-name').value.trim();
  const phone = document.getElementById('student-phone').value.trim();
  const email = document.getElementById('student-email').value.trim();
  const password = document.getElementById('student-password').value;

  // Cliente temporário sem persistência para não derrubar a sessão atual do Admin
  const tempSupabase = createClient(supabase.supabaseUrl, supabase.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await tempSupabase.auth.signUp({ email, password });

  if (error) {
    alert('Erro ao criar login do aluno: ' + error.message);
    btn.disabled = false;
    btn.textContent = 'Cadastrar Aluno';
    return;
  }

  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: data.user.id,
        full_name,
        phone,
        role: 'student',
        active: true
      });

    if (profileError) {
      alert('Usuário criado, mas erro ao salvar perfil: ' + profileError.message);
    } else {
      alert(`Aluno ${full_name} cadastrado com sucesso!`);
      e.target.reset();
      document.getElementById('student-password').value = '123456';
      await loadStudents();
    }
  }

  btn.disabled = false;
  btn.textContent = 'Cadastrar Aluno';
});

window.toggleStudentStatus = async (id, currentStatus) => {
  await supabase
    .from('profiles')
    .update({ active: !currentStatus })
    .eq('id', id);
  await loadStudents();
};

// ================= MONTAGEM DE FICHAS =================
document.getElementById('select-student').addEventListener('change', (e) => {
  loadStudentWorkout(e.target.value);
});

async function loadStudentWorkout(studentId) {
  if (!studentId) return;

  const { data } = await supabase
    .from('workout_plans')
    .select(`
      id,
      division,
      sets,
      reps,
      exercises ( name, machine_number )
    `)
    .eq('student_id', studentId)
    .order('division', { ascending: true })
    .order('id', { ascending: true });

  const tbody = document.getElementById('tbody-student-workouts');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="color: var(--text-secondary);">Nenhum exercício na ficha deste aluno ainda.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td><strong>${item.division}</strong></td>
      <td>#${item.exercises.machine_number}</td>
      <td>${item.exercises.name}</td>
      <td>${item.sets}x ${item.reps}</td>
      <td>
        <button class="btn-small btn-danger" onclick="deleteWorkoutItem(${item.id})">Remover</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('form-workout').addEventListener('submit', async (e) => {
  e.preventDefault();
  const student_id = document.getElementById('select-student').value;
  const division = document.getElementById('workout-division').value.trim();
  const exercise_id = document.getElementById('select-exercise').value;
  const sets = parseInt(document.getElementById('workout-sets').value, 10);
  const reps = document.getElementById('workout-reps').value.trim();
  const notes = document.getElementById('workout-notes').value.trim();

  if (!student_id || !exercise_id) {
    alert('Cadastre ao menos um aluno e um exercício primeiro.');
    return;
  }

  const { error } = await supabase
    .from('workout_plans')
    .insert({ student_id, division, exercise_id, sets, reps, notes });

  if (error) {
    alert('Erro ao adicionar na ficha: ' + error.message);
    return;
  }

  document.getElementById('workout-notes').value = '';
  await loadStudentWorkout(student_id);
});

window.deleteWorkoutItem = async (id) => {
  await supabase.from('workout_plans').delete().eq('id', id);
  const studentId = document.getElementById('select-student').value;
  await loadStudentWorkout(studentId);
};

verifyAdmin();