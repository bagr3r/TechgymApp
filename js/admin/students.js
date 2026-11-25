import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { normalizeUsernameToEmail, normalizeCpfPassword } from '../auth.js';
import {
  escapeHtml, showToast, showConfirmDialog, recordAuditLog,
  setFieldError, clearFormErrors, formatCpfMask, isValidCPF, sanitizeUsername
} from './ui.js';

export function createStudentsManager(state, callbacks) {
  const studentForm = document.getElementById('student-form');
  const studentCpfInput = document.getElementById('student-cpf');
  const studentUsernameInput = document.getElementById('student-username');
  const studentsSearchInput = document.getElementById('students-search');
  const studentsList = document.getElementById('students-list');
  const planStudentSelect = document.getElementById('plan-student');
  const editStudentModal = document.getElementById('edit-student-modal');
  const editStudentForm = document.getElementById('edit-student-form');

  let lastCheckinMap = {};
  let searchTerm = '';

  window.closeStudentModal = () => {
    if (editStudentModal) editStudentModal.style.display = 'none';
  };

  function renderStudentsTable() {
    if (!studentsList) return;
    const term = searchTerm.trim().toLowerCase();
    const filtered = state.allStudents.filter(st =>
      !term ||
      (st.full_name || '').toLowerCase().includes(term) ||
      (st.username || '').toLowerCase().includes(term) ||
      (st.plan_type || '').toLowerCase().includes(term)
    );

    if (!filtered.length) {
      studentsList.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhum aluno encontrado.</td></tr>';
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
            <button type="button" class="btn-sm btn-dark" data-workout-id="${st.id}">Ficha</button>
            <button type="button" class="btn-sm btn-outline" data-edit-id="${st.id}">Editar</button>
            <button type="button" class="btn-sm btn-danger" data-delete-id="${st.id}">Excluir</button>
          </td>
        </tr>
      `;
    }).join('');
  }

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

    state.allStudents = profiles || [];

    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('student_id, check_in_date')
      .order('check_in_date', { ascending: false });

    lastCheckinMap = {};
    (attendanceData || []).forEach(item => {
      if (!lastCheckinMap[item.student_id]) lastCheckinMap[item.student_id] = item.check_in_date;
    });

    if (planStudentSelect) {
      const prev = planStudentSelect.value;
      planStudentSelect.innerHTML = '<option value="">Selecione o aluno...</option>';
      state.allStudents.forEach(st => {
        const opt = document.createElement('option');
        opt.value = st.id;
        opt.textContent = st.full_name;
        planStudentSelect.appendChild(opt);
      });
      if (prev) planStudentSelect.value = prev;
    }

    renderStudentsTable();
    await callbacks.onStudentsChanged();
  }

  studentsList?.addEventListener('click', async (e) => {
    const workoutBtn = e.target.closest('[data-workout-id]');
    if (workoutBtn) {
      await callbacks.onOpenWorkout(workoutBtn.dataset.workoutId);
      return;
    }

    const editBtn = e.target.closest('[data-edit-id]');
    if (editBtn) {
      const st = state.allStudents.find(s => s.id === editBtn.dataset.editId);
      if (!st || !editStudentModal) return;

      clearFormErrors([
        ['edit-student-name', 'err-edit-student-name'],
        ['edit-student-username', 'err-edit-student-username']
      ]);
      document.getElementById('edit-student-id').value = st.id;
      document.getElementById('edit-student-name').value = st.full_name || '';
      document.getElementById('edit-student-username').value = st.username || '';
      document.getElementById('edit-student-plan').value = st.plan_type || 'Mensal';
      editStudentModal.style.display = 'flex';
      return;
    }

    const delBtn = e.target.closest('[data-delete-id]');
    if (delBtn) {
      const st = state.allStudents.find(s => s.id === delBtn.dataset.deleteId);
      if (!st) return;

      const confirmed = await showConfirmDialog(
        'Excluir Aluno?',
        `Deseja excluir "${st.full_name}"? Toda a ficha e o acesso serão removidos.`
      );
      if (!confirmed) return;

      const { error } = await supabase.rpc('admin_delete_student', { target_user_id: st.id });
      if (error) {
        showToast('Erro ao Excluir', error.message, 'error');
        return;
      }

      recordAuditLog({
        where: 'Gestão de Alunos',
        what: `Aluno excluído: ${st.full_name}`,
        before: `${st.full_name} (${st.plan_type || 'Mensal'})`,
        after: 'Removido'
      });

      callbacks.onStudentDeleted(st.id);
      showToast('Aluno Excluído', `${st.full_name} foi removido do sistema.`, 'success');
      await loadStudents();
    }
  });

  studentCpfInput?.addEventListener('input', (e) => {
    e.target.value = formatCpfMask(e.target.value);
  });

  studentUsernameInput?.addEventListener('input', (e) => {
    e.target.value = sanitizeUsername(e.target.value);
  });

  document.getElementById('edit-student-username')?.addEventListener('input', (e) => {
    e.target.value = sanitizeUsername(e.target.value);
  });

  studentsSearchInput?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderStudentsTable();
  });

  studentForm?.addEventListener('submit', async (e) => {
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
      setFieldError('student-name', 'err-student-name', 'Informe o nome e sobrenome completos.');
      hasError = true;
    }
    if (rawUsername.length < 3) {
      setFieldError('student-username', 'err-student-username', 'Mínimo 3 caracteres.');
      hasError = true;
    } else if (state.allStudents.some(s => s.username === rawUsername)) {
      setFieldError('student-username', 'err-student-username', `O usuário "${rawUsername}" já existe.`);
      hasError = true;
    }
    if (!isValidCPF(rawCpf)) {
      setFieldError('student-cpf', 'err-student-cpf', 'CPF inválido.');
      hasError = true;
    }
    if (hasError) return;

    const submitBtn = studentForm.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Cadastrando...'; }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const tempSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: signUpData, error: signUpError } = await tempSupabase.auth.signUp({
      email: normalizeUsernameToEmail(rawUsername),
      password: normalizeCpfPassword(rawCpf),
      options: { data: { full_name: fullName, username: rawUsername, role: 'student' } }
    });

    if (signUpError) {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Cadastrar Aluno'; }
      setFieldError('student-username', 'err-student-username', 'Usuário já possui conta ativa.');
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

    recordAuditLog({
      where: 'Gestão de Alunos',
      what: `Novo aluno matriculado`,
      before: 'Não cadastrado',
      after: `${fullName} (@${rawUsername} • ${planType})`
    });

    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Cadastrar Aluno'; }
    studentForm.reset();
    showToast('Aluno Cadastrado!', `${fullName} (${planType}) cadastrado.`, 'success');
    await loadStudents();
  });

  editStudentForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors([
      ['edit-student-name', 'err-edit-student-name'],
      ['edit-student-username', 'err-edit-student-username']
    ]);

    const id = document.getElementById('edit-student-id').value;
    const prevStudent = state.allStudents.find(s => s.id === id);
    const fullName = document.getElementById('edit-student-name').value.trim();
    const username = sanitizeUsername(document.getElementById('edit-student-username').value);
    const planType = document.getElementById('edit-student-plan')?.value || 'Mensal';

    let hasError = false;
    if (fullName.length < 3 || !fullName.includes(' ')) {
      setFieldError('edit-student-name', 'err-edit-student-name', 'Informe o nome e sobrenome completos.');
      hasError = true;
    }
    if (username.length < 3) {
      setFieldError('edit-student-username', 'err-edit-student-username', 'Mínimo 3 caracteres.');
      hasError = true;
    } else if (state.allStudents.some(s => s.username === username && s.id !== id)) {
      setFieldError('edit-student-username', 'err-edit-student-username', `Usuário "${username}" em uso.`);
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

    if (prevStudent) {
      recordAuditLog({
        where: 'Gestão de Alunos',
        what: `Dados do aluno editados`,
        before: `${prevStudent.full_name} (@${prevStudent.username || '—'} • ${prevStudent.plan_type || 'Mensal'})`,
        after: `${fullName} (@${username} • ${planType})`
      });
    }

    window.closeStudentModal();
    showToast('Aluno Atualizado!', 'Dados salvos com sucesso.', 'success');
    await loadStudents();
  });

  return { loadStudents };
}