import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { checkAuth, logout, normalizeUsernameToEmail, normalizeCpfPassword } from './auth.js';

// Estado em memória do Construtor V2
let allExercises = [];
let allTemplates = [];
let currentStudentPlans = [];
let activeSplitType = 'ABC';
let activeDay = 'A';
let activeMuscleFilter = 'ALL';
let catalogSearchTerm = '';

// Elementos
const logoutBtn = document.getElementById('logout-btn');
const planStudentSelect = document.getElementById('plan-student');
const planSplitSelect = document.getElementById('plan-split-type');
const saveTemplateBtn = document.getElementById('save-as-template-btn');

const catalogSearchInput = document.getElementById('catalog-search');
const catalogItemsList = document.getElementById('catalog-items-list');
const templatesListEl = document.getElementById('templates-list');
const dayTabsContainer = document.getElementById('day-tabs-container');
const dayExercisesEditor = document.getElementById('day-exercises-editor');

const studentForm = document.getElementById('student-form');
const exerciseForm = document.getElementById('exercise-form');
const studentsList = document.getElementById('students-list');
const exercisesList = document.getElementById('exercises-list');

const SPLIT_DAYS = {
  'Full body': ['A'],
  'AB': ['A', 'B'],
  'ABC': ['A', 'B', 'C'],
  'ABCD': ['A', 'B', 'C', 'D'],
  'ABCDE': ['A', 'B', 'C', 'D', 'E']
};

if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });
}

// ==========================================================================
// 1. CARREGAMENTO DE EXERCÍCIOS E CATÁLOGO FILTRÁVEL
// ==========================================================================
async function loadExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('machine_number', { ascending: true });

  if (error) {
    console.error('Erro ao carregar exercícios:', error.message);
    return;
  }

  allExercises = data || [];
  renderCatalogList();
  renderExercisesTable();
}

function renderCatalogList() {
  if (!catalogItemsList) return;

  const filtered = allExercises.filter(ex => {
    const matchMuscle = activeMuscleFilter === 'ALL' || ex.muscle_group === activeMuscleFilter;
    const term = catalogSearchTerm.toLowerCase();
    const matchText = !term ||
      ex.name.toLowerCase().includes(term) ||
      String(ex.machine_number).toLowerCase().includes(term);
    return matchMuscle && matchText;
  });

  if (!filtered.length) {
    catalogItemsList.innerHTML = '<div class="empty-state">Nenhum aparelho encontrado neste filtro.</div>';
    return;
  }

  catalogItemsList.innerHTML = filtered.map(ex => `
    <div class="lib-item-card">
      <div class="lib-item-info">
        <strong>#${escapeHtml(ex.machine_number)} — ${escapeHtml(ex.name)}</strong>
        <span>${escapeHtml(ex.muscle_group)}</span>
      </div>
      <button type="button" class="btn-primary btn-sm" onclick="quickAddExercise('${ex.id}')">
        + Add
      </button>
    </div>
  `).join('');
}

// Filtros de Grupo Muscular e Busca
document.querySelectorAll('.muscle-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.muscle-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeMuscleFilter = pill.dataset.muscle || 'ALL';
    renderCatalogList();
  });
});

if (catalogSearchInput) {
  catalogSearchInput.addEventListener('input', (e) => {
    catalogSearchTerm = e.target.value;
    renderCatalogList();
  });
}

// ==========================================================================
// 2. MODELOS PRONTOS (TEMPLATES)
// ==========================================================================
async function loadTemplates() {
  const { data, error } = await supabase
    .from('workout_templates')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('Erro ao carregar modelos:', error.message);
    return;
  }

  allTemplates = data || [];
  renderTemplatesList();
}

function renderTemplatesList() {
  if (!templatesListEl) return;

  const filtered = allTemplates.filter(t => t.split_type === activeSplitType);
  const listToShow = filtered.length ? filtered : allTemplates;

  if (!listToShow.length) {
    templatesListEl.innerHTML = '<div class="empty-state">Nenhum modelo salvo ainda.</div>';
    return;
  }

  templatesListEl.innerHTML = listToShow.map(tpl => `
    <div class="template-card">
      <div class="template-card-top">
        <strong>${escapeHtml(tpl.name)}</strong>
        <span class="badge badge-red">${escapeHtml(tpl.split_type)}</span>
      </div>
      <p>${escapeHtml(tpl.description || 'Modelo padrão da Techgym')}</p>
      <button type="button" class="btn-dark btn-sm" style="width:100%;" onclick="applyTemplateToStudent('${tpl.id}', '${tpl.split_type}')">
        Importar para o Aluno
      </button>
    </div>
  `).join('');
}

window.applyTemplateToStudent = async (templateId, splitType) => {
  const studentId = planStudentSelect?.value;
  if (!studentId) {
    alert('Selecione um aluno no topo antes de importar o modelo.');
    return;
  }

  if (currentStudentPlans.length > 0) {
    const ok = confirm('Este aluno já possui exercícios na ficha. Deseja substituir pela ficha deste modelo?');
    if (!ok) return;
    await supabase.from('workout_plans').delete().eq('student_id', studentId);
  }

  const { data: items, error } = await supabase
    .from('workout_template_items')
    .select('*')
    .eq('template_id', templateId);

  if (error || !items?.length) {
    alert('Não foi possível carregar os itens deste modelo.');
    return;
  }

  const rowsToInsert = items.map(it => ({
    student_id: studentId,
    exercise_id: it.exercise_id,
    division: it.division,
    sets: it.sets,
    reps: it.reps,
    rest_seconds: it.rest_seconds || 60,
    notes: it.notes || null
  }));

  const { error: insertError } = await supabase.from('workout_plans').insert(rowsToInsert);
  if (insertError) {
    alert('Erro ao importar modelo: ' + insertError.message);
    return;
  }

  activeSplitType = splitType;
  if (planSplitSelect) planSplitSelect.value = splitType;
  activeDay = 'A';
  renderDayTabs();
  await loadStudentPlans(studentId);
};

// Salvar ficha atual do aluno como um novo Modelo Padrão
if (saveTemplateBtn) {
  saveTemplateBtn.addEventListener('click', async () => {
    const studentId = planStudentSelect?.value;
    if (!studentId || !currentStudentPlans.length) {
      alert('Selecione um aluno que já tenha exercícios montados para salvar como modelo.');
      return;
    }

    const templateName = prompt(`Nome do novo modelo (${activeSplitType}):`, `Treino ${activeSplitType} Personalizado`);
    if (!templateName || !templateName.trim()) return;

    const { data: newTpl, error: tplError } = await supabase
      .from('workout_templates')
      .insert([{
        name: templateName.trim(),
        split_type: activeSplitType,
        description: `Modelo ${activeSplitType} criado pelo instrutor`
      }])
      .select()
      .single();

    if (tplError || !newTpl) {
      alert('Erro ao criar modelo: ' + (tplError?.message || ''));
      return;
    }

    const itemsPayload = currentStudentPlans.map(p => ({
      template_id: newTpl.id,
      exercise_id: p.exercise_id,
      division: p.division,
      sets: p.sets,
      reps: p.reps,
      rest_seconds: p.rest_seconds || 60,
      notes: p.notes || null
    }));

    await supabase.from('workout_template_items').insert(itemsPayload);
    alert('Modelo salvo na biblioteca com sucesso!');
    await loadTemplates();
  });
}

// ==========================================================================
// 3. WORKSPACE DA DIREITA: ABAS A/B/C/D/E + EDIÇÃO INLINE
// ==========================================================================
function renderDayTabs() {
  if (!dayTabsContainer) return;
  const days = SPLIT_DAYS[activeSplitType] || ['A', 'B', 'C'];
  if (!days.includes(activeDay)) activeDay = days[0];

  dayTabsContainer.innerHTML = days.map(day => {
    const label = activeSplitType === 'Full body' ? 'Treino Único (Full body)' : `Treino ${day}`;
    const count = currentStudentPlans.filter(p => p.division === day).length;
    return `
      <button type="button" class="day-tab ${day === activeDay ? 'active' : ''}" data-day="${day}">
        ${label} (${count})
      </button>
    `;
  }).join('');

  dayTabsContainer.querySelectorAll('.day-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDay = btn.dataset.day;
      renderDayTabs();
      renderDayEditor();
    });
  });
}

if (planSplitSelect) {
  planSplitSelect.addEventListener('change', () => {
    activeSplitType = planSplitSelect.value;
    activeDay = 'A';
    renderDayTabs();
    renderDayEditor();
    renderTemplatesList();
  });
}

if (planStudentSelect) {
  planStudentSelect.addEventListener('change', async () => {
    const studentId = planStudentSelect.value;
    if (!studentId) {
      currentStudentPlans = [];
      renderDayTabs();
      if (dayExercisesEditor) {
        dayExercisesEditor.innerHTML = '<div class="empty-state">Selecione um aluno acima para começar a montar a ficha.</div>';
      }
      return;
    }
    await loadStudentPlans(studentId);
  });
}

async function loadStudentPlans(studentId) {
  if (dayExercisesEditor) {
    dayExercisesEditor.innerHTML = '<div class="empty-state">Carregando exercícios...</div>';
  }

  const { data, error } = await supabase
    .from('workout_plans')
    .select(`
      id,
      exercise_id,
      division,
      sets,
      reps,
      rest_seconds,
      notes,
      exercises (
        name,
        machine_number,
        muscle_group
      )
    `)
    .eq('student_id', studentId);

  if (error) {
    if (dayExercisesEditor) {
      dayExercisesEditor.innerHTML = `<div class="empty-state">Erro ao carregar: ${escapeHtml(error.message)}</div>`;
    }
    return;
  }

  currentStudentPlans = data || [];
  renderDayTabs();
  renderDayEditor();
}

function renderDayEditor() {
  if (!dayExercisesEditor) return;
  const studentId = planStudentSelect?.value;

  if (!studentId) {
    dayExercisesEditor.innerHTML = '<div class="empty-state">Selecione um aluno acima para começar a montar a ficha.</div>';
    return;
  }

  const dayItems = currentStudentPlans.filter(item => item.division === activeDay);

  if (!dayItems.length) {
    dayExercisesEditor.innerHTML = `
      <div class="empty-state">
        Nenhum exercício no <strong>Treino ${activeDay}</strong> ainda.<br>
        Clique em <strong>+ Add</strong> nos aparelhos ao lado ou importe um <strong>Modelo Pronto</strong>.
      </div>`;
    return;
  }

  dayExercisesEditor.innerHTML = dayItems.map(item => {
    const ex = Array.isArray(item.exercises) ? item.exercises[0] : item.exercises;
    return `
      <div class="plan-edit-row">
        <div class="ex-name-col">
          <span class="badge badge-dark" style="margin-bottom:4px;">#${escapeHtml(ex?.machine_number || '—')}</span>
          <strong>${escapeHtml(ex?.name || 'Exercício')}</strong>
        </div>

        <div>
          <span class="inline-field-label">Séries</span>
          <input type="number" min="1" value="${item.sets}"
                 onchange="updatePlanRow('${item.id}', 'sets', parseInt(this.value, 10) || 3)">
        </div>

        <div>
          <span class="inline-field-label">Reps</span>
          <input type="text" value="${escapeHtml(item.reps)}"
                 onchange="updatePlanRow('${item.id}', 'reps', this.value.trim() || '12')">
        </div>

        <div>
          <span class="inline-field-label">Desc (s)</span>
          <input type="number" min="0" value="${item.rest_seconds || 60}"
                 onchange="updatePlanRow('${item.id}', 'rest_seconds', parseInt(this.value, 10) || 60)">
        </div>

        <div>
          <span class="inline-field-label left">Observação</span>
          <input type="text" class="notes-input" placeholder="Opcional..." value="${escapeHtml(item.notes || '')}"
                 onchange="updatePlanRow('${item.id}', 'notes', this.value.trim() || null)">
        </div>

        <button type="button" class="btn-danger btn-sm" onclick="deleteWorkoutItem('${item.id}')" title="Remover">
          ✕
        </button>
      </div>
    `;
  }).join('');
}

window.quickAddExercise = async (exerciseId) => {
  const studentId = planStudentSelect?.value;
  if (!studentId) {
    alert('Selecione um aluno no topo antes de adicionar exercícios.');
    return;
  }

  const { error } = await supabase.from('workout_plans').insert([{
    student_id: studentId,
    exercise_id: exerciseId,
    division: activeDay,
    sets: 3,
    reps: '10-12',
    rest_seconds: 60,
    notes: null
  }]);

  if (error) {
    alert('Erro ao adicionar exercício: ' + error.message);
    return;
  }

  await loadStudentPlans(studentId);
};

window.updatePlanRow = async (itemId, field, value) => {
  const { error } = await supabase
    .from('workout_plans')
    .update({ [field]: value })
    .eq('id', itemId);

  if (error) {
    alert('Erro ao salvar alteração: ' + error.message);
    return;
  }

  const target = currentStudentPlans.find(p => p.id === itemId);
  if (target) target[field] = value;
};

window.deleteWorkoutItem = async (itemId) => {
  const { error } = await supabase.from('workout_plans').delete().eq('id', itemId);
  if (error) {
    alert('Erro ao remover: ' + error.message);
    return;
  }
  if (planStudentSelect?.value) {
    await loadStudentPlans(planStudentSelect.value);
  }
};

// ==========================================================================
// 4. ABA 02 (ALUNOS) E ABA 03 (APARELHOS)
// ==========================================================================
async function loadStudents() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, role')
    .eq('role', 'student')
    .order('full_name', { ascending: true });

  if (error) return;

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

  if (planStudentSelect) {
    const prev = planStudentSelect.value;
    planStudentSelect.innerHTML = '<option value="">Selecione o aluno...</option>';
    profiles.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = st.full_name;
      planStudentSelect.appendChild(opt);
    });
    if (prev) planStudentSelect.value = prev;
  }

  if (!studentsList) return;
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
          <button type="button" class="btn-sm btn-outline" onclick="openStudentWorkout('${st.id}')">Montar Ficha</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.openStudentWorkout = async (studentId) => {
  document.querySelector('.side-btn[data-tab="tab-fichas"]')?.click();
  if (planStudentSelect) planStudentSelect.value = studentId;
  await loadStudentPlans(studentId);
};

if (studentForm) {
  studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = studentForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Cadastrando...';
    }

    const fullName = document.getElementById('student-name').value.trim();
    const rawUsername = document.getElementById('student-username').value.trim().toLowerCase().replace(/\s+/g, '');
    const rawCpf = document.getElementById('student-cpf').value;
    const cpfDigits = normalizeCpfPassword(rawCpf);

    if (cpfDigits.length !== 11) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Cadastrar Aluno';
      }
      alert('Digite um CPF válido com 11 dígitos.');
      return;
    }

    const internalEmail = normalizeUsernameToEmail(rawUsername);
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const tempSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: signUpData, error: signUpError } = await tempSupabase.auth.signUp({
      email: internalEmail,
      password: cpfDigits,
      options: { data: { full_name: fullName, username: rawUsername, role: 'student' } }
    });

    if (signUpError) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Cadastrar Aluno';
      }
      alert('Erro ao criar aluno: ' + signUpError.message);
      return;
    }

    if (signUpData?.user?.id) {
      await supabase.from('profiles').upsert([{
        id: signUpData.user.id,
        full_name: fullName,
        username: rawUsername,
        role: 'student'
      }]);
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Cadastrar Aluno';
    }
    studentForm.reset();
    alert(`Aluno cadastrado!\nUsuário: ${rawUsername}\nSenha: ${cpfDigits}`);
    await loadStudents();
  });
}

function renderExercisesTable() {
  if (!exercisesList) return;
  if (!allExercises.length) {
    exercisesList.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum aparelho cadastrado ainda.</td></tr>';
    return;
  }

  exercisesList.innerHTML = allExercises.map(ex => `
    <tr>
      <td><span class="badge badge-dark">#${escapeHtml(ex.machine_number)}</span></td>
      <td><strong>${escapeHtml(ex.name)}</strong></td>
      <td><span class="badge">${escapeHtml(ex.muscle_group)}</span></td>
      <td>
        ${ex.video_url
          ? `<a href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener noreferrer" class="badge badge-red">Ver Vídeo</a>`
          : '<span style="color: var(--text-secondary); font-size: 0.8rem;">Sem vídeo</span>'}
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
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';
    }

    const payload = {
      machine_number: document.getElementById('exercise-machine').value.trim(),
      muscle_group: document.getElementById('exercise-muscle').value,
      name: document.getElementById('exercise-name').value.trim(),
      video_url: document.getElementById('exercise-video').value.trim() || null
    };

    const { error } = await supabase.from('exercises').insert([payload]);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Salvar Aparelho / Exercício';
    }

    if (error) {
      alert('Erro ao salvar exercício: ' + error.message);
      return;
    }

    exerciseForm.reset();
    await loadExercises();
  });
}

window.deleteExercise = async (id) => {
  if (!confirm('Excluir este exercício do catálogo?')) return;
  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error) {
    alert('Erro ao excluir: ' + error.message);
    return;
  }
  await loadExercises();
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
// 5. INICIALIZAÇÃO
// ==========================================================================
(async function init() {
  renderDayTabs();
  const auth = await checkAuth('admin');
  if (!auth) return;
  await Promise.all([loadExercises(), loadStudents(), loadTemplates()]);
})();