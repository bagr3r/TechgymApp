import { checkAuth, logout } from './auth.js';
import { bindLiveErrorClearing, showConfirmDialog, showToast } from './admin/ui.js';
import { refreshDashboardMetrics } from './admin/dashboard.js';
import { createWorkoutBuilder } from './admin/workoutBuilder.js';
import { createStudentsManager } from './admin/students.js';
import { createExercisesManager } from './admin/exercises.js';

const state = {
  allExercises: [],
  allStudents: [],
  hasUnsavedPlanChanges: false
};

bindLiveErrorClearing([
  ['student-name', 'err-student-name'],
  ['student-username', 'err-student-username'],
  ['student-cpf', 'err-student-cpf'],
  ['exercise-machine', 'err-exercise-machine'],
  ['exercise-name', 'err-exercise-name'],
  ['exercise-video', 'err-exercise-video'],
  ['exercise-accessory-text', 'err-exercise-accessory'],
  ['edit-student-name', 'err-edit-student-name'],
  ['edit-student-username', 'err-edit-student-username'],
  ['edit-exercise-machine', 'err-edit-exercise-machine'],
  ['edit-exercise-name', 'err-edit-exercise-name'],
  ['edit-exercise-video', 'err-edit-exercise-video'],
  ['edit-exercise-accessory-text', 'err-edit-exercise-accessory']
]);

async function switchAdminTab(targetTabId) {
  const currentTabId = document.querySelector('.side-btn.active')?.dataset.tab;
  if (currentTabId === targetTabId) return;

  if (currentTabId === 'tab-fichas' && state.hasUnsavedPlanChanges) {
    const discard = await showConfirmDialog(
      'Ficha Não Salva!',
      'Você fez alterações nesta ficha de treino e ainda não clicou em "Salvar Ficha". Deseja descartar as alterações e sair desta aba?'
    );
    if (!discard) return;
    await workoutBuilder.discardUnsavedChanges();
  }

  document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.side-btn[data-tab="${targetTabId}"]`)?.classList.add('active');
  document.getElementById(targetTabId)?.classList.add('active');
}

document.querySelectorAll('.side-btn').forEach(btn => {
  btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
});

window.addEventListener('beforeunload', (e) => {
  if (state.hasUnsavedPlanChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (state.hasUnsavedPlanChanges) {
    const leave = await showConfirmDialog(
      'Alterações Não Salvas',
      'Você modificou a ficha de treino e ainda não salvou. Deseja sair mesmo assim e descartar as alterações?'
    );
    if (!leave) return;
  }
  state.hasUnsavedPlanChanges = false;
  await logout();
});

const openStudentWorkout = async (studentId) => {
  await switchAdminTab('tab-fichas');
  await workoutBuilder.openForStudent(studentId);
};

const workoutBuilder = createWorkoutBuilder(state, {
  onQuickCreateExercise: async (name) => {
    await switchAdminTab('tab-aparelhos');
    const nameInput = document.getElementById('exercise-name');
    if (nameInput) nameInput.value = name;
    document.getElementById('exercise-machine')?.focus();
    showToast('Novo Aparelho', 'Informe o número da máquina e o grupo muscular.', 'success');
  },
  onPlansMutated: () => refreshDashboardMetrics(state.allStudents, openStudentWorkout)
});

const studentsManager = createStudentsManager(state, {
  onStudentsChanged: () => refreshDashboardMetrics(state.allStudents, openStudentWorkout),
  onOpenWorkout: openStudentWorkout,
  onStudentDeleted: (id) => workoutBuilder.clearIfDeletedStudent(id)
});

const exercisesManager = createExercisesManager(state, {
  onExercisesChanged: () => workoutBuilder.renderCatalogList()
});

(async function init() {
  const auth = await checkAuth('admin');
  if (!auth) return;
  document.body.style.visibility = 'visible';
  await Promise.all([
    exercisesManager.loadExercises(),
    studentsManager.loadStudents(),
    workoutBuilder.loadTemplates()
  ]);
})();