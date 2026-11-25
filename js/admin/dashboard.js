import { supabase } from '../config.js';
import { escapeHtml } from './ui.js';

export const AVAILABLE_PLANS = [
  'Mensal',
  'Trimestral',
  'Semestral',
  'Anual',
  'Gympass / TotalPass'
];

export async function refreshDashboardMetrics(allStudents, onOpenStudentWorkout) {
  const totalStudents = allStudents.length;
  const kpiTotalEl = document.getElementById('kpi-total-students');
  if (kpiTotalEl) kpiTotalEl.textContent = String(totalStudents);

  const now = new Date();
  const todayISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0];

  const { data: todayAttendance } = await supabase
    .from('attendance')
    .select('id')
    .eq('check_in_date', todayISO);

  const kpiCheckinsEl = document.getElementById('kpi-today-checkins');
  if (kpiCheckinsEl) kpiCheckinsEl.textContent = String(todayAttendance?.length || 0);

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

  const planCounts = {};
  AVAILABLE_PLANS.forEach(p => { planCounts[p] = 0; });
  allStudents.forEach(st => {
    const plan = st.plan_type && Object.prototype.hasOwnProperty.call(planCounts, st.plan_type)
      ? st.plan_type
      : 'Mensal';
    planCounts[plan] += 1;
  });

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
  if (kpiTopPlanSubEl) {
    kpiTopPlanSubEl.textContent = `${topPlanCount} ${topPlanCount === 1 ? 'aluno' : 'alunos'} neste plano`;
  }

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
          <button type="button" class="btn-sm btn-primary" data-open-workout="${st.id}">
            Montar Ficha
          </button>
        </div>
      `).join('');

      pendingListEl.querySelectorAll('[data-open-workout]').forEach(btn => {
        btn.addEventListener('click', () => onOpenStudentWorkout(btn.dataset.openWorkout));
      });
    }
  }
}