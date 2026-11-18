import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { checkAuth, logout, normalizeUsernameToEmail, normalizeCpfPassword } from './auth.js';

// Elementos globais
const logoutBtn = document.getElementById('logout-btn');
const workoutForm = document.getElementById('workout-form');
const studentForm = document.getElementById('student-form');
const exerciseForm = document.getElementById('exercise-form');

const planStudentSelect = document.getElementById('plan-student');
const planExerciseSelect = document.getElementById('plan-exercise');
const workoutPlanList = document.getElementById('workout-plan-list');
const studentsList = document.getElementById('students-list');
const exercisesList = document.getElementById('exercises-list');

// 1. Registra o botão Sair imediatamente
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });
}

// ==========================================================================
// 2. APARELHOS E EXERCÍCIOS (ABA 03)
// ==========================================================================
async function loadExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('machine_number', { ascending: true });

  if (error) {
    console.error('Erro ao carregar exercícios:', error.message);
    exercisesList.innerHTML = `<tr><td colspan="5" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  planExerciseSelect.innerHTML = '<option value="">Selecione o exercício...</option>';
  data.forEach(ex => {
    const option = document.createElement('option');
    option.value = ex.id;
    option.textContent = `[Máq. ${ex.machine_number}] ${ex.name} (${ex.muscle_group})`;
    planExerciseSelect.appendChild(option);
  });

  if (!data.length) {
    exercisesList.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum aparelho ou exercício cadastrado ainda.</td></tr>';
    return;
  }

  exercisesList.innerHTML = data.map(ex => `
    <tr>
      <td><span class="badge badge-dark">#${escapeHtml(ex.machine_number)}</span></td>
      <td><strong>${escapeHtml(ex.name)}</strong></td>
      <td><span class="badge">${escapeHtml(ex.muscle_group)}</span></td>
      <td>
        ${ex.video_url
          ? `<a href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener noreferrer" class="badge badge-red">Ver Vídeo</a>`
          : '<span style="color: var(--text-muted); font-size: 0.8rem;">Sem vídeo</span>'}
      </td>
      <td>
        <button type="button" class="btn-sm btn-danger" onclick="deleteExercise('${ex.id}')">Excluir</button>
      </td>
    </tr>
  `).join('');
}

if (exerciseForm) {
  exerciseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = exerciseForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';

    const payload = {
      machine_number: document.getElementById('exercise-machine').value.trim(),
      muscle_group: document.getElementById('exercise-muscle').value,
      name: document.getElementById('exercise-name').value.trim(),
      video_url: document.getElementById('exercise-video').value.trim() || null
    };

    const { error } = await supabase.from('exercises').insert([payload]);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Salvar Aparelho / Exercício';

    if (error) {
      alert('Erro ao salvar exercício: ' + error.message);
      return;
    }

    exerciseForm.reset();
    await loadExercises();
  });
}

window.deleteExercise = async (id) => {
  if (!confirm('Deseja realmente excluir este exercício do catálogo?')) return;
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error) {
    alert('Erro ao excluir: ' + error.message);
    return;
  }
  await loadExercises();
};

// ==========================================================================
// 3. ALUNOS E FREQUÊNCIA (ABA 02)
// ==========================================================================
async function loadStudents() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, role')
    .eq('role', 'student')
    .order('full_name', { ascending: true });

  if (error) {
    console.error('Erro ao carregar alunos:', error.message);
    studentsList.innerHTML = `<tr><td colspan="4" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const { data: attendanceData } = await supabase
    .from('attendance')
    .select('student_id, check_in_date')
    .order('check_in_date', { ascending: false });

  const lastCheckinMap = {};
  if (attendanceData) {
    attendanceData.forEach(item => {
      if (!lastCheckinMap[item.student_id]) {
        lastCheckinMap[item.student_id] = item.check_in_date;
      }
    });
  }

  const currentSelected = planStudentSelect.value;
  planStudentSelect.innerHTML = '<option value="">Selecione o aluno...</option>';
  profiles.forEach(st => {
    const option = document.createElement('option');
    option.value = st.id;
    option.textContent = st.full_name;
    planStudentSelect.appendChild(option);
  });
  if (currentSelected) planStudentSelect.value = currentSelected;

  if (!profiles.length) {
    studentsList.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum aluno cadastrado ainda.</td></tr>';
    return;
  }

  studentsList.innerHTML = profiles.map(st => {
    const lastDate = lastCheckinMap[st.id]
      ? new Date(lastCheckinMap[st.id] + 'T00:00:00').toLocaleDateString('pt-BR')
      : 'Nunca treinou';

    return `
      <tr>
        <td><strong>${escapeHtml(st.full_name)}</strong></td>
        <td><span class="badge">${escapeHtml(st.username || '—')}</span></td>
        <td><span class="badge">${lastDate}</span></td>
        <td>
          <button type="button" class="btn-sm btn-outline" onclick="openStudentWorkout('${st.id}')">Ver Ficha</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openStudentWorkout = async (studentId) => {
  document.querySelector('.side-btn[data-tab="tab-fichas"]')?.click();
  planStudentSelect.value = studentId;
  await loadWorkoutPlan(studentId);
};

if (studentForm) {
  studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = studentForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Cadastrando...';

    const fullName = document.getElementById('student-name').value.trim();
    const rawUsername = document.getElementById('student-username').value.trim().toLowerCase().replace(/\s+/g, '');
    const rawCpf = document.getElementById('student-cpf').value;

    const cpfDigits = normalizeCpfPassword(rawCpf);
    if (cpfDigits.length !== 11) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Cadastrar Aluno';
      alert('Digite um CPF válido com 11 dígitos.');
      return;
    }

    const internalEmail = normalizeUsernameToEmail(rawUsername);
    const url = SUPABASE_URL || supabase.supabaseUrl;
    const key = SUPABASE_ANON_KEY || supabase.supabaseKey;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const tempSupabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: signUpData, error: signUpError } = await tempSupabase.auth.signUp({
      email: internalEmail,
      password: cpfDigits,
      options: {
        data: { full_name: fullName, username: rawUsername, role: 'student' }
      }
    });

    if (signUpError) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Cadastrar Aluno';
      alert('Erro ao criar aluno: ' + signUpError.message);
      return;
    }

    if (signUpData?.user?.id) {
      const { error: profileError } = await supabase.from('profiles').upsert([{
        id: signUpData.user.id,
        full_name: fullName,
        username: rawUsername,
        role: 'student'
      }]);

      if (profileError) {
        console.warn('Aviso ao salvar perfil:', profileError.message);
      }
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Cadastrar Aluno';
    studentForm.reset();
    alert(`Aluno cadastrado!\nUsuário: ${rawUsername}\nSenha: ${cpfDigits}`);
    await loadStudents();
  });
}

// ==========================================================================
// 4. MONTAGEM DE FICHAS DE TREINO (ABA 01)
// ==========================================================================
if (planStudentSelect) {
  planStudentSelect.addEventListener('change', async () => {
    const studentId = planStudentSelect.value;
    if (!studentId) {
      workoutPlanList.innerHTML = '<tr><td colspan="5" class="empty-state">Selecione um aluno acima para carregar a ficha.</td></tr>';
      return;
    }
    await loadWorkoutPlan(studentId);
  });
}

async function loadWorkoutPlan(studentId) {
  workoutPlanList.innerHTML = '<tr><td colspan="5" class="empty-state">Carregando ficha...</td></tr>';

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
        name,
        machine_number
      )
    `)
    .eq('student_id', studentId)
    .order('division', { ascending: true });

  if (error) {
    workoutPlanList.innerHTML = `<tr><td colspan="5" class="empty-state">Erro ao carregar: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data.length) {
    workoutPlanList.innerHTML = '<tr><td colspan="5" class="empty-state">Este aluno ainda não possui exercícios na ficha.</td></tr>';
    return;
  }

  workoutPlanList.innerHTML = data.map(item => `
    <tr>
      <td><span class="badge badge-red">Treino ${escapeHtml(item.division)}</span></td>
      <td><span class="badge badge-dark">#${escapeHtml(item.exercises?.machine_number || '—')}</span></td>
      <td>
        <strong>${escapeHtml(item.exercises?.name || 'Exercício')}</strong>
        ${item.notes ? `<div style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(item.notes)}</div>` : ''}
      </td>
      <td><strong>${item.sets}x ${escapeHtml(item.reps)}</strong> (${item.rest_seconds || 60}s)</td>
      <td>
        <button type="button" class="btn-sm btn-danger" onclick="deleteWorkoutItem('${item.id}')">Remover</button>
      </td>
    </tr>
  `).join('');
}

if (workoutForm) {
  workoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const studentId = planStudentSelect.value;
    if (!studentId) {
      alert('Selecione um aluno primeiro.');
      return;
    }

    const submitBtn = workoutForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adicionando...';

    const payload = {
      student_id: studentId,
      exercise_id: planExerciseSelect.value,
      division: document.getElementById('plan-division').value,
      sets: parseInt(document.getElementById('plan-sets').value, 10),
      reps: document.getElementById('plan-reps').value.trim(),
      rest_seconds: parseInt(document.getElementById('plan-rest').value, 10) || 60,
      notes: document.getElementById('plan-notes').value.trim() || null
    };

    const { error } = await supabase.from('workout_plans').insert([payload]);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Adicionar à Ficha';

    if (error) {
      alert('Erro ao adicionar exercício na ficha: ' + error.message);
      return;
    }

    document.getElementById('plan-notes').value = '';
    await loadWorkoutPlan(studentId);
  });
}

window.deleteWorkoutItem = async (itemId) => {
  if (!confirm('Remover este exercício da ficha do aluno?')) return;
  const { error } = await supabase.from('workout_plans').delete().eq('id', itemId);
  if (error) {
    alert('Erro ao remover: ' + error.message);
    return;
  }
  await loadWorkoutPlan(planStudentSelect.value);
};

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
// 5. INICIALIZAÇÃO PROTEGIDA
// ==========================================================================
(async function init() {
  const auth = await checkAuth('admin');
  if (!auth) return;
  await Promise.all([loadExercises(), loadStudents()]);
})();