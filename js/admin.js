import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { checkAuth, logout, normalizeUsernameToEmail, normalizeCpfPassword } from './auth.js';

// Estado em memória
let allExercises = [];
let allStudents = [];
let lastCheckinMap = {};
let allTemplates = [];
let currentStudentPlans = [];
let activeSplitType = 'ABC';
let activeDay = 'A';
let catalogSearchTerm = '';
let templatesSearchTerm = '';
let studentsTableSearch = '';
let exercisesTableSearch = '';

// Elementos
const toastContainer = document.getElementById('toast-container');
const logoutBtn = document.getElementById('logout-btn');
const planStudentSelect = document.getElementById('plan-student');
const planSplitSelect = document.getElementById('plan-split-type');
const saveTemplateBtn = document.getElementById('save-as-template-btn');

const catalogSearchInput = document.getElementById('catalog-search');
const catalogItemsList = document.getElementById('catalog-items-list');
const templatesSearchInput = document.getElementById('templates-search');
const templatesListEl = document.getElementById('templates-list');
const dayTabsContainer = document.getElementById('day-tabs-container');
const dayExercisesEditor = document.getElementById('day-exercises-editor');

const studentForm = document.getElementById('student-form');
const studentCpfInput = document.getElementById('student-cpf');
const studentUsernameInput = document.getElementById('student-username');
const studentsSearchInput = document.getElementById('students-search');
const studentsList = document.getElementById('students-list');

const exerciseForm = document.getElementById('exercise-form');
const exercisesTableSearchInput = document.getElementById('exercises-table-search');
const exercisesGroupedContainer = document.getElementById('exercises-grouped-container');

const editStudentModal = document.getElementById('edit-student-modal');
const editStudentForm = document.getElementById('edit-student-form');
const editExerciseModal = document.getElementById('edit-exercise-modal');
const editExerciseForm = document.getElementById('edit-exercise-form');

const SPLIT_DAYS = {
  'Full body': ['A'],
  'AB': ['A', 'B'],
  'ABC': ['A', 'B', 'C'],
  'ABCD': ['A', 'B', 'C', 'D'],
  'ABCDE': ['A', 'B', 'C', 'D', 'E']
};

const AVAILABLE_PLANS = [
  'Mensal',
  'Trimestral',
  'Semestral',
  'Anual',
  'Gympass / TotalPass'
];

if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await logout();
  });
}

// ==========================================================================
// 0. NOTIFICAÇÕES TOAST, CONFIRMAÇÃO E VALIDAÇÃO INLINE
// ==========================================================================
function showToast(title, message, type = 'success') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `techgym-toast ${type}`;
  toast.innerHTML = `
    <div class="techgym-toast-body">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 220);
  }, 4200);
}

function showConfirmDialog(title, text) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const textEl = document.getElementById('confirm-modal-text');
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    if (!modal || !okBtn || !cancelBtn) {
      resolve(window.confirm(text));
      return;
    }

    titleEl.textContent = title;
    textEl.textContent = text;
    modal.style.display = 'flex';

    const cleanup = (result) => {
      modal.style.display = 'none';
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    };

    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
  });
}

function setFieldError(inputId, errorElId, message) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorElId);
  if (input) input.classList.add('input-error');
  if (errEl) errEl.textContent = message;
}

function clearFieldError(inputId, errorElId) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(errorElId);
  if (input) input.classList.remove('input-error');
  if (errEl) errEl.textContent = '';
}

function clearFormErrors(pairs) {
  pairs.forEach(([inputId, errId]) => clearFieldError(inputId, errId));
}

[
  ['student-name', 'err-student-name'],
  ['student-username', 'err-student-username'],
  ['student-cpf', 'err-student-cpf'],
  ['exercise-machine', 'err-exercise-machine'],
  ['exercise-name', 'err-exercise-name'],
  ['exercise-video', 'err-exercise-video'],
  ['edit-student-name', 'err-edit-student-name'],
  ['edit-student-username', 'err-edit-student-username'],
  ['edit-exercise-machine', 'err-edit-exercise-machine'],
  ['edit-exercise-name', 'err-edit-exercise-name'],
  ['edit-exercise-video', 'err-edit-exercise-video']
].forEach(([inputId, errId]) => {
  document.getElementById(inputId)?.addEventListener('input', () => clearFieldError(inputId, errId));
});

// ==========================================================================
// 1. VALIDADORES (CPF MÓDULO 11, USUÁRIO E YOUTUBE)
// ==========================================================================
function formatCpfMask(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function isValidCPF(rawCpf) {
  const cpf = rawCpf.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  return rev === parseInt(cpf.charAt(10), 10);
}

function sanitizeUsername(raw) {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '');
}

function isValidYoutubeUrl(url) {
  if (!url) return true;
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url.trim());
}

if (studentCpfInput) {
  studentCpfInput.addEventListener('input', (e) => {
    e.target.value = formatCpfMask(e.target.value);
  });
}

if (studentUsernameInput) {
  studentUsernameInput.addEventListener('input', (e) => {
    e.target.value = sanitizeUsername(e.target.value);
  });
}

document.getElementById('edit-student-username')?.addEventListener('input', (e) => {
  e.target.value = sanitizeUsername(e.target.value);
});

// ==========================================================================
// 2. ABA 01 — DASHBOARD (KPIs, PLANOS E ALUNOS SEM FICHA)
// ==========================================================================
async function refreshDashboardMetrics() {
  const totalStudents = allStudents.length;
  const kpiTotalEl = document.getElementById('kpi-total-students');
  if (kpiTotalEl) kpiTotalEl.textContent = String(totalStudents);

  // Check-ins de hoje
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const todayISO = new Date(now.getTime() - offset).toISOString().split('T')[0];

  const { data: todayAttendance } = await supabase
    .from('attendance')
    .select('id')
    .eq('check_in_date', todayISO);

  const kpiCheckinsEl = document.getElementById('kpi-today-checkins');
  if (kpiCheckinsEl) kpiCheckinsEl.textContent = String(todayAttendance?.length || 0);

  // Alunos com ficha vs sem ficha
  const { data: activePlansData } = await supabase
    .from('workout_plans')
    .select('student_id');

  const studentsWithWorkoutSet = new Set((activePlansData || []).map(p => p.student_id));
  const withWorkoutCount = allStudents.filter(s => studentsWithWorkoutSet.has(s.id)).length;
  const withoutWorkoutList = allStudents.filter(s => !studentsWithWorkoutSet.has(s.id));

  const kpiWithWorkoutEl = document.getElementById('kpi-with-workout');
  const kpiWithoutSubEl = document.getElementById('kpi-without-workout-sub');
  if (kpiWithWorkoutEl) kpiWithWorkoutEl.textContent = String(withWorkoutCount);
  if (kpiWithoutSubEl) kpiWithoutSubEl.textContent = `${withoutWorkoutList.length} aguardando ficha`;

  // Contagem por tipo de plano
  const planCounts = {};
  AVAILABLE_PLANS.forEach(p => { planCounts[p] = 0; });

  allStudents.forEach(st => {
    const plan = st.plan_type && planCounts.hasOwnProperty(st.plan_type) ? st.plan_type : 'Mensal';
    planCounts[plan] += 1;
  });

  // Descobre o plano líder
  let topPlanName = '—';
  let topPlanCount = 0;
  Object.entries(planCounts).forEach(([planName, count]) => {
    if (count > topPlanCount) {
      topPlanCount = count;
      topPlanName = planName;
    }
  });

  const kpiTopPlanEl = document.getElementById('kpi-top-plan');
  const kpiTopPlanSubEl = document.getElementById('kpi-top-plan-count');
  if (kpiTopPlanEl) kpiTopPlanEl.textContent = topPlanName;
  if (kpiTopPlanSubEl) kpiTopPlanSubEl.textContent = `${topPlanCount} ${topPlanCount === 1 ? 'aluno' : 'alunos'} neste plano`;

  // Renderiza barras de distribuição por plano
  const plansListEl = document.getElementById('plans-breakdown-list');
  if (plansListEl) {
    plansListEl.innerHTML = AVAILABLE_PLANS.map(planName => {
      const count = planCounts[planName] || 0;
      const pct = totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;
      return `
        <div class="plan-stat-row">
          <div class="plan-stat-top">
            <strong>${escapeHtml(planName)}</strong>
            <span><strong>${count}</strong> ${count === 1 ? 'aluno' : 'alunos'} (${pct}%)</span>
          </div>
          <div class="plan-stat-track">
            <div class="plan-stat-fill" style="width: ${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Renderiza lista de alunos aguardando ficha
  const pendingListEl = document.getElementById('pending-students-list');
  if (pendingListEl) {
    if (!withoutWorkoutList.length) {
      pendingListEl.innerHTML = '<div class="empty-state">Todos os alunos ativos já possuem ficha montada!</div>';
    } else {
      pendingListEl.innerHTML = withoutWorkoutList.slice(0, 6).map(st => `
        <div class="pending-student-item">
          <div>
            <strong style="display:block; font-size:0.86rem;">${escapeHtml(st.full_name)}</strong>
            <span style="font-size:0.74rem; color:var(--text-secondary);">${escapeHtml(st.plan_type || 'Mensal')}</span>
          </div>
          <button type="button" class="btn-sm btn-primary" onclick="openStudentWorkout('${st.id}')">
            Montar Ficha
          </button>
        </div>
      `).join('');
    }
  }
}

// ==========================================================================
// 3. ABA 02 — CONSTRUTOR DE FICHAS (BUSCA APARELHOS + BUSCA MODELOS)
// ==========================================================================
function renderCatalogList() {
  if (!catalogItemsList) return;

  const term = catalogSearchTerm.trim();
  if (!term) {
    catalogItemsList.innerHTML = '<div class="empty-state">Digite o nome ou nº do aparelho acima para buscar.</div>';
    return;
  }

  const lowerTerm = term.toLowerCase();
  const filtered = allExercises.filter(ex =>
    ex.name.toLowerCase().includes(lowerTerm) ||
    String(ex.machine_number).toLowerCase().includes(lowerTerm)
  );

  if (!filtered.length) {
    catalogItemsList.innerHTML = `
      <div class="empty-state" style="padding: 20px 12px;">
        Nenhum aparelho encontrado para <strong>"${escapeHtml(term)}"</strong>.<br><br>
        <button type="button" class="btn-primary btn-sm" style="width:100%;" onclick="quickCreateAndAddExercise()">
          + Cadastrar "${escapeHtml(term)}"
        </button>
      </div>`;
    return;
  }

  catalogItemsList.innerHTML = filtered.slice(0, 12).map(ex => `
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

if (catalogSearchInput) {
  catalogSearchInput.addEventListener('input', (e) => {
    catalogSearchTerm = e.target.value;
    renderCatalogList();
  });
}

window.quickCreateAndAddExercise = () => {
  const name = catalogSearchTerm.trim();
  document.querySelector('.side-btn[data-tab="tab-aparelhos"]')?.click();
  const nameInput = document.getElementById('exercise-name');
  const machineInput = document.getElementById('exercise-machine');
  if (nameInput) nameInput.value = name;
  if (machineInput) machineInput.focus();
  showToast('Novo Aparelho', 'Informe o número da máquina e o grupo muscular para salvar.', 'success');
};

async function loadTemplates() {
  const { data, error } = await supabase
    .from('workout_templates')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return;
  allTemplates = data || [];
  renderTemplatesList();
}

function renderTemplatesList() {
  if (!templatesListEl) return;

  const term = templatesSearchTerm.trim().toLowerCase();
  const baseList = term
    ? allTemplates
    : (allTemplates.filter(t => t.split_type === activeSplitType).length
        ? allTemplates.filter(t => t.split_type === activeSplitType)
        : allTemplates);

  const filtered = baseList.filter(tpl =>
    !term ||
    (tpl.name && tpl.name.toLowerCase().includes(term)) ||
    (tpl.split_type && tpl.split_type.toLowerCase().includes(term)) ||
    (tpl.description && tpl.description.toLowerCase().includes(term))
  );

  if (!filtered.length) {
    templatesListEl.innerHTML = '<div class="empty-state">Nenhum modelo encontrado para esta pesquisa.</div>';
    return;
  }

  templatesListEl.innerHTML = filtered.map(tpl => `
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

if (templatesSearchInput) {
  templatesSearchInput.addEventListener('input', (e) => {
    templatesSearchTerm = e.target.value;
    renderTemplatesList();
  });
}

window.applyTemplateToStudent = async (templateId, splitType) => {
  const studentId = planStudentSelect?.value;
  if (!studentId) {
    showToast('Selecione um aluno', 'Escolha o aluno no topo antes de importar um modelo.', 'error');
    return;
  }

  if (currentStudentPlans.length > 0) {
    const ok = await showConfirmDialog(
      'Substituir Ficha Atual?',
      'Este aluno já possui exercícios cadastrados. Deseja substituir pela ficha deste modelo padrão?'
    );
    if (!ok) return;
    await supabase.from('workout_plans').delete().eq('student_id', studentId);
  }

  const { data: items, error } = await supabase
    .from('workout_template_items')
    .select('*')
    .eq('template_id', templateId);

  if (error || !items?.length) {
    showToast('Erro no Modelo', 'Não foi possível carregar os exercícios deste modelo.', 'error');
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
    showToast('Erro ao Importar', insertError.message, 'error');
    return;
  }

  activeSplitType = splitType;
  if (planSplitSelect) planSplitSelect.value = splitType;
  activeDay = 'A';
  renderDayTabs();
  await loadStudentPlans(studentId);
  await refreshDashboardMetrics();
  showToast('Modelo Aplicado!', `Ficha ${splitType} importada com sucesso para o aluno.`, 'success');
};

if (saveTemplateBtn) {
  saveTemplateBtn.addEventListener('click', async () => {
    const studentId = planStudentSelect?.value;
    if (!studentId || !currentStudentPlans.length) {
      showToast('Ficha Vazia', 'Selecione um aluno com exercícios montados para salvar como modelo.', 'error');
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
      showToast('Erro ao Salvar Modelo', tplError?.message || 'Falha inesperada.', 'error');
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
    showToast('Modelo Salvo!', 'O novo modelo já está disponível na biblioteca.', 'success');
    await loadTemplates();
  });
}

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
        Busque um aparelho ao lado ou importe um <strong>Modelo Pronto</strong>.
      </div>`;
    return;
  }

  dayExercisesEditor.innerHTML = dayItems.map(item => {
    const ex = Array.isArray(item.exercises) ? item.exercises[0] : item.exercises;
    return `
      <div class="plan-edit-row">
        <div class="ex-name-col">
          <span class="badge badge-dark" style="margin-bottom:4px;">Máq. #${escapeHtml(ex?.machine_number || '—')}</span>
          <strong>${escapeHtml(ex?.name || 'Exercício')}</strong>
        </div>

        <div>
          <span class="inline-field-label">Séries</span>
          <input type="number" min="1" max="20" value="${item.sets}"
                 onchange="updatePlanRow('${item.id}', 'sets', Math.max(1, parseInt(this.value, 10) || 3))">
        </div>

        <div>
          <span class="inline-field-label">Reps</span>
          <input type="text" value="${escapeHtml(item.reps)}"
                 onchange="updatePlanRow('${item.id}', 'reps', this.value.trim() || '12')">
        </div>

        <div>
          <span class="inline-field-label">Desc (s)</span>
          <input type="number" min="0" max="600" value="${item.rest_seconds || 60}"
                 onchange="updatePlanRow('${item.id}', 'rest_seconds', Math.max(0, parseInt(this.value, 10) || 60))">
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
    showToast('Selecione um aluno', 'Escolha o aluno no topo antes de adicionar exercícios.', 'error');
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
    showToast('Erro ao Adicionar', error.message, 'error');
    return;
  }

  await loadStudentPlans(studentId);
  await refreshDashboardMetrics();
  showToast('Exercício Adicionado', `Incluído no Treino ${activeDay}.`, 'success');
};

window.updatePlanRow = async (itemId, field, value) => {
  const { error } = await supabase
    .from('workout_plans')
    .update({ [field]: value })
    .eq('id', itemId);

  if (error) {
    showToast('Erro ao Atualizar', error.message, 'error');
    return;
  }

  const target = currentStudentPlans.find(p => p.id === itemId);
  if (target) target[field] = value;
  showToast('Salvo', 'Alteração atualizada na ficha.', 'success');
};

window.deleteWorkoutItem = async (itemId) => {
  const { error } = await supabase.from('workout_plans').delete().eq('id', itemId);
  if (error) {
    showToast('Erro ao Remover', error.message, 'error');
    return;
  }
  if (planStudentSelect?.value) {
    await loadStudentPlans(planStudentSelect.value);
    await refreshDashboardMetrics();
  }
};

// ==========================================================================
// 4. ABA 03 — GESTÃO DE ALUNOS (COM PLANO, VALIDAÇÃO, BUSCA, EDIÇÃO E EXCLUSÃO)
// ==========================================================================
async function loadStudents() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, role, plan_type')
    .eq('role', 'student')
    .order('full_name', { ascending: true });

  if (error) {
    showToast('Erro ao carregar alunos', error.message, 'error');
    return;
  }
  allStudents = profiles || [];

  const { data: attendanceData } = await supabase
    .from('attendance')
    .select('student_id, check_in_date')
    .order('check_in_date', { ascending: false });

  lastCheckinMap = {};
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
    allStudents.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st.id;
      opt.textContent = st.full_name;
      planStudentSelect.appendChild(opt);
    });
    if (prev) planStudentSelect.value = prev;
  }

  renderStudentsTable();
  await refreshDashboardMetrics();
}

function renderStudentsTable() {
  if (!studentsList) return;

  const term = studentsTableSearch.trim().toLowerCase();
  const filtered = allStudents.filter(st => {
    const nameMatch = (st.full_name || '').toLowerCase().includes(term);
    const userMatch = (st.username || '').toLowerCase().includes(term);
    const planMatch = (st.plan_type || '').toLowerCase().includes(term);
    return !term || nameMatch || userMatch || planMatch;
  });

  if (!filtered.length) {
    studentsList.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum aluno encontrado para esta pesquisa.</td></tr>';
    return;
  }

  studentsList.innerHTML = filtered.map(st => {
    const lastDate = lastCheckinMap[st.id]
      ? new Date(lastCheckinMap[st.id] + 'T00:00:00').toLocaleDateString('pt-BR')
      : 'Nunca treinou';

    return `
      <tr>
        <td><strong>${escapeHtml(st.full_name)}</strong></td>
        <td><span class="badge">${escapeHtml(st.username || '—')}</span></td>
        <td><span class="badge badge-red">${escapeHtml(st.plan_type || 'Mensal')}</span></td>
        <td><span class="badge">${lastDate}</span></td>
        <td class="actions-cell">
          <button type="button" class="btn-sm btn-dark" onclick="openStudentWorkout('${st.id}')">Ficha</button>
          <button type="button" class="btn-sm btn-outline" onclick="openEditStudentModal('${st.id}')">Editar</button>
          <button type="button" class="btn-sm btn-danger" onclick="deleteStudent('${st.id}', '${escapeHtml(st.full_name)}')">Excluir</button>
        </td>
      </tr>
    `;
  }).join('');
}

if (studentsSearchInput) {
  studentsSearchInput.addEventListener('input', (e) => {
    studentsTableSearch = e.target.value;
    renderStudentsTable();
  });
}

window.openStudentWorkout = async (studentId) => {
  document.querySelector('.side-btn[data-tab="tab-fichas"]')?.click();
  if (planStudentSelect) planStudentSelect.value = studentId;
  await loadStudentPlans(studentId);
};

if (studentForm) {
  studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors([
      ['student-name', 'err-student-name'],
      ['student-username', 'err-student-username'],
      ['student-cpf', 'err-student-cpf']
    ]);

    const fullName = document.getElementById('student-name').value.trim();
    const rawUsername = sanitizeUsername(document.getElementById('student-username').value);
    const rawCpf = document.getElementById('student-cpf').value;
    const planType = document.getElementById('student-plan')?.value || 'Mensal';

    let hasError = false;

    if (fullName.length < 3 || !fullName.includes(' ')) {
      setFieldError('student-name', 'err-student-name', 'Informe o nome e sobrenome completos do aluno.');
      hasError = true;
    }

    if (rawUsername.length < 3) {
      setFieldError('student-username', 'err-student-username', 'O usuário deve ter no mínimo 3 letras ou números.');
      hasError = true;
    } else if (allStudents.some(s => s.username === rawUsername)) {
      setFieldError('student-username', 'err-student-username', `O usuário "${rawUsername}" já está cadastrado.`);
      hasError = true;
    }

    if (!isValidCPF(rawCpf)) {
      setFieldError('student-cpf', 'err-student-cpf', 'CPF inválido. Confira os 11 dígitos e o dígito verificador.');
      hasError = true;
    }

    if (hasError) {
      showToast('Verifique os campos', 'Corrija os campos destacados em vermelho para continuar.', 'error');
      return;
    }

    const submitBtn = studentForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Cadastrando...';
    }

    const cpfDigits = normalizeCpfPassword(rawCpf);
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
      setFieldError('student-username', 'err-student-username', 'Este usuário já possui conta ativa no sistema.');
      showToast('Erro no Cadastro', signUpError.message, 'error');
      return;
    }

    if (signUpData?.user?.id) {
      await supabase.from('profiles').upsert([{
        id: signUpData.user.id,
        full_name: fullName,
        username: rawUsername,
        role: 'student',
        plan_type: planType
      }]);
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Cadastrar Aluno';
    }
    studentForm.reset();
    showToast('Aluno Cadastrado!', `${fullName} (${planType}) cadastrado com sucesso.`, 'success');
    await loadStudents();
  });
}

window.openEditStudentModal = (studentId) => {
  const st = allStudents.find(s => s.id === studentId);
  if (!st || !editStudentModal) return;

  clearFormErrors([
    ['edit-student-name', 'err-edit-student-name'],
    ['edit-student-username', 'err-edit-student-username']
  ]);

  document.getElementById('edit-student-id').value = st.id;
  document.getElementById('edit-student-name').value = st.full_name || '';
  document.getElementById('edit-student-username').value = st.username || '';
  const planSelect = document.getElementById('edit-student-plan');
  if (planSelect) planSelect.value = st.plan_type || 'Mensal';
  editStudentModal.style.display = 'flex';
};

window.closeStudentModal = () => {
  if (editStudentModal) editStudentModal.style.display = 'none';
};

if (editStudentForm) {
  editStudentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors([
      ['edit-student-name', 'err-edit-student-name'],
      ['edit-student-username', 'err-edit-student-username']
    ]);

    const id = document.getElementById('edit-student-id').value;
    const fullName = document.getElementById('edit-student-name').value.trim();
    const username = sanitizeUsername(document.getElementById('edit-student-username').value);
    const planType = document.getElementById('edit-student-plan')?.value || 'Mensal';

    let hasError = false;
    if (fullName.length < 3 || !fullName.includes(' ')) {
      setFieldError('edit-student-name', 'err-edit-student-name', 'Informe o nome e sobrenome completos.');
      hasError = true;
    }
    if (username.length < 3) {
      setFieldError('edit-student-username', 'err-edit-student-username', 'O usuário deve ter pelo menos 3 caracteres.');
      hasError = true;
    } else if (allStudents.some(s => s.username === username && s.id !== id)) {
      setFieldError('edit-student-username', 'err-edit-student-username', `O usuário "${username}" já está em uso.`);
      hasError = true;
    }

    if (hasError) return;

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, username, plan_type: planType })
      .eq('id', id);

    if (error) {
      showToast('Erro ao Atualizar', error.message, 'error');
      return;
    }

    window.closeStudentModal();
    showToast('Aluno Atualizado!', 'Os dados e o plano do aluno foram salvos.', 'success');
    await loadStudents();
  });
}

window.deleteStudent = async (studentId, studentName) => {
  const confirmed = await showConfirmDialog(
    'Excluir Aluno?',
    `Tem certeza que deseja excluir "${studentName}"? Toda a ficha de treino e o acesso deste aluno serão removidos.`
  );
  if (!confirmed) return;

  const { error } = await supabase.rpc('admin_delete_student', {
    target_user_id: studentId
  });

  if (error) {
    showToast('Erro ao Excluir', error.message, 'error');
    return;
  }

  if (planStudentSelect?.value === studentId) {
    planStudentSelect.value = '';
    currentStudentPlans = [];
    renderDayTabs();
    renderDayEditor();
  }

  showToast('Aluno Excluído', `${studentName} foi removido do sistema.`, 'success');
  await loadStudents();
};

// ==========================================================================
// 5. ABA 04 — APARELHOS AGRUPADOS POR GRUPO MUSCULAR + PESQUISA
// ==========================================================================
const MUSCLE_GROUPS_ORDER = [
  'Peito',
  'Costas',
  'Ombros',
  'Braços',
  'Membros Inferiores',
  'Abdômen'
];

function normalizeMuscleCategory(rawGroup) {
  const g = (rawGroup || '').toLowerCase();
  if (g.includes('peito')) return 'Peito';
  if (g.includes('costa')) return 'Costas';
  if (g.includes('ombro')) return 'Ombros';
  if (g.includes('braço') || g.includes('bíceps') || g.includes('tríceps')) return 'Braços';
  if (g.includes('perna') || g.includes('inferior') || g.includes('glúteo')) return 'Membros Inferiores';
  if (g.includes('abdômen') || g.includes('cardio')) return 'Abdômen';
  return 'Outros';
}

async function loadExercises() {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('machine_number', { ascending: true });

  if (error) {
    showToast('Erro ao carregar aparelhos', error.message, 'error');
    return;
  }

  allExercises = data || [];
  renderCatalogList();
  renderGroupedExercises();
}

function renderGroupedExercises() {
  if (!exercisesGroupedContainer) return;

  const term = exercisesTableSearch.trim().toLowerCase();
  const filtered = allExercises.filter(ex =>
    !term ||
    String(ex.machine_number).toLowerCase().includes(term) ||
    ex.name.toLowerCase().includes(term) ||
    (ex.muscle_group && ex.muscle_group.toLowerCase().includes(term))
  );

  if (!filtered.length) {
    exercisesGroupedContainer.innerHTML = '<div class="empty-state">Nenhum aparelho ou exercício encontrado para esta pesquisa.</div>';
    return;
  }

  const grouped = {};
  filtered.forEach(ex => {
    const cat = normalizeMuscleCategory(ex.muscle_group);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(ex);
  });

  const categoriesToRender = [...MUSCLE_GROUPS_ORDER, 'Outros'].filter(cat => grouped[cat]?.length > 0);

  exercisesGroupedContainer.innerHTML = categoriesToRender.map(cat => {
    const items = grouped[cat];
    return `
      <div class="muscle-group-card">
        <div class="muscle-group-header">
          <h4><span class="muscle-group-dot"></span> ${escapeHtml(cat)}</h4>
          <span class="badge badge-red">${items.length} ${items.length === 1 ? 'aparelho' : 'aparelhos'}</span>
        </div>
        <div class="table-wrapper" style="border: none; border-radius: 0;">
          <table>
            <thead>
              <tr>
                <th style="width: 130px;">Nº Máquina</th>
                <th>Exercício</th>
                <th style="width: 130px;">Vídeo</th>
                <th style="width: 170px;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(ex => `
                <tr>
                  <td><span class="badge badge-dark">Máq. #${escapeHtml(ex.machine_number)}</span></td>
                  <td><strong>${escapeHtml(ex.name)}</strong></td>
                  <td>
                    ${ex.video_url
                      ? `<a href="${escapeHtml(ex.video_url)}" target="_blank" rel="noopener noreferrer" class="badge badge-red">Ver Vídeo</a>`
                      : '<span style="color: var(--text-secondary); font-size: 0.8rem;">Sem vídeo</span>'}
                  </td>
                  <td class="actions-cell">
                    <button type="button" class="btn-sm btn-outline" onclick="openEditExerciseModal('${ex.id}')">Editar</button>
                    <button type="button" class="btn-sm btn-danger" onclick="deleteExercise('${ex.id}', '${escapeHtml(ex.name)}')">Excluir</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');
}

if (exercisesTableSearchInput) {
  exercisesTableSearchInput.addEventListener('input', (e) => {
    exercisesTableSearch = e.target.value;
    renderGroupedExercises();
  });
}

if (exerciseForm) {
  exerciseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors([
      ['exercise-machine', 'err-exercise-machine'],
      ['exercise-name', 'err-exercise-name'],
      ['exercise-video', 'err-exercise-video']
    ]);

    const machineNumber = document.getElementById('exercise-machine').value.trim().toUpperCase();
    const name = document.getElementById('exercise-name').value.trim();
    const muscleGroup = document.getElementById('exercise-muscle').value;
    const videoUrl = document.getElementById('exercise-video').value.trim();

    let hasError = false;

    if (!machineNumber) {
      setFieldError('exercise-machine', 'err-exercise-machine', 'Informe o número da máquina (ex: 01 ou LIVRE).');
      hasError = true;
    }

    if (name.length < 3) {
      setFieldError('exercise-name', 'err-exercise-name', 'O nome do exercício deve ter pelo menos 3 letras.');
      hasError = true;
    }

    if (!isValidYoutubeUrl(videoUrl)) {
      setFieldError('exercise-video', 'err-exercise-video', 'Insira um link válido do YouTube (youtube.com ou youtu.be).');
      hasError = true;
    }

    if (hasError) {
      showToast('Campos Inválidos', 'Corrija os campos destacados em vermelho antes de salvar.', 'error');
      return;
    }

    const submitBtn = exerciseForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';
    }

    const { error } = await supabase.from('exercises').insert([{
      machine_number: machineNumber,
      name,
      muscle_group: muscleGroup,
      video_url: videoUrl || null
    }]);

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Salvar Aparelho / Exercício';
    }

    if (error) {
      showToast('Erro ao Salvar', error.message, 'error');
      return;
    }

    exerciseForm.reset();
    showToast('Aparelho Cadastrado!', `Máq. #${machineNumber} — ${name} adicionado em ${muscleGroup}.`, 'success');
    await loadExercises();
  });
}

window.openEditExerciseModal = (exerciseId) => {
  const ex = allExercises.find(item => String(item.id) === String(exerciseId));
  if (!ex || !editExerciseModal) return;

  clearFormErrors([
    ['edit-exercise-machine', 'err-edit-exercise-machine'],
    ['edit-exercise-name', 'err-edit-exercise-name'],
    ['edit-exercise-video', 'err-edit-exercise-video']
  ]);

  document.getElementById('edit-exercise-id').value = ex.id;
  document.getElementById('edit-exercise-machine').value = ex.machine_number || '';
  document.getElementById('edit-exercise-name').value = ex.name || '';
  document.getElementById('edit-exercise-muscle').value = normalizeMuscleCategory(ex.muscle_group);
  document.getElementById('edit-exercise-video').value = ex.video_url || '';
  editExerciseModal.style.display = 'flex';
};

window.closeExerciseModal = () => {
  if (editExerciseModal) editExerciseModal.style.display = 'none';
};

if (editExerciseForm) {
  editExerciseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors([
      ['edit-exercise-machine', 'err-edit-exercise-machine'],
      ['edit-exercise-name', 'err-edit-exercise-name'],
      ['edit-exercise-video', 'err-edit-exercise-video']
    ]);

    const id = document.getElementById('edit-exercise-id').value;
    const machineNumber = document.getElementById('edit-exercise-machine').value.trim().toUpperCase();
    const name = document.getElementById('edit-exercise-name').value.trim();
    const muscleGroup = document.getElementById('edit-exercise-muscle').value;
    const videoUrl = document.getElementById('edit-exercise-video').value.trim();

    let hasError = false;
    if (!machineNumber) {
      setFieldError('edit-exercise-machine', 'err-edit-exercise-machine', 'Informe o número do aparelho.');
      hasError = true;
    }
    if (name.length < 3) {
      setFieldError('edit-exercise-name', 'err-edit-exercise-name', 'Nome muito curto (mínimo 3 letras).');
      hasError = true;
    }
    if (!isValidYoutubeUrl(videoUrl)) {
      setFieldError('edit-exercise-video', 'err-edit-exercise-video', 'Link do YouTube inválido.');
      hasError = true;
    }

    if (hasError) return;

    const { error } = await supabase
      .from('exercises')
      .update({
        machine_number: machineNumber,
        name,
        muscle_group: muscleGroup,
        video_url: videoUrl || null
      })
      .eq('id', id);

    if (error) {
      showToast('Erro ao Atualizar', error.message, 'error');
      return;
    }

    window.closeExerciseModal();
    showToast('Aparelho Atualizado!', 'As alterações foram salvas com sucesso.', 'success');
    await loadExercises();
  });
}

window.deleteExercise = async (id, name) => {
  const ok = await showConfirmDialog(
    'Excluir Aparelho?',
    `Deseja remover "${name}" do catálogo da academia?`
  );
  if (!ok) return;

  const { error } = await supabase.from('exercises').delete().eq('id', id);
  if (error) {
    showToast('Erro ao Excluir', error.message, 'error');
    return;
  }
  showToast('Aparelho Removido', `${name} foi excluído do catálogo.`, 'success');
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
// 6. INICIALIZAÇÃO
// ==========================================================================
(async function init() {
  renderDayTabs();
  const auth = await checkAuth('admin');
  if (!auth) return;
  await Promise.all([loadExercises(), loadStudents(), loadTemplates()]);
})();