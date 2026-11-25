import { supabase } from '../config.js';
import { escapeHtml, showToast, showConfirmDialog } from './ui.js';

const SPLIT_DAYS = {
  'Full body': ['A'],
  'AB': ['A', 'B'],
  'ABC': ['A', 'B', 'C'],
  'ABCD': ['A', 'B', 'C', 'D'],
  'ABCDE': ['A', 'B', 'C', 'D', 'E']
};

export function createWorkoutBuilder(state, callbacks) {
  const planStudentSelect = document.getElementById('plan-student');
  const planSplitSelect = document.getElementById('plan-split-type');
  const saveTemplateBtn = document.getElementById('save-as-template-btn');
  const saveWorkoutBatchBtn = document.getElementById('save-workout-batch-btn');
  const catalogSearchInput = document.getElementById('catalog-search');
  const catalogItemsList = document.getElementById('catalog-items-list');
  const templatesSearchInput = document.getElementById('templates-search');
  const templatesListEl = document.getElementById('templates-list');
  const dayTabsContainer = document.getElementById('day-tabs-container');
  const divisionLabelBar = document.getElementById('division-label-bar');
  const divisionLabelTitle = document.getElementById('day-division-label-title');
  const divisionLabelInput = document.getElementById('day-division-label');
  const dayExercisesEditor = document.getElementById('day-exercises-editor');

  let currentStudentPlans = [];
  let allTemplates = [];
  let activeSplitType = 'ABC';
  let activeDay = 'A';
  let lastSelectedStudentId = '';
  let catalogSearchTerm = '';
  let templatesSearchTerm = '';

  function setUnsavedState(isDirty) {
    state.hasUnsavedPlanChanges = isDirty;
    if (!saveWorkoutBatchBtn) return;

    const hasStudent = Boolean(planStudentSelect?.value);
    saveWorkoutBatchBtn.disabled = !hasStudent;

    if (isDirty) {
      saveWorkoutBatchBtn.classList.add('has-changes');
      saveWorkoutBatchBtn.textContent = 'Salvar Ficha *';
    } else {
      saveWorkoutBatchBtn.classList.remove('has-changes');
      saveWorkoutBatchBtn.textContent = 'Salvar Ficha';
    }
  }

  function getActiveDivisionLabel() {
    const existing = currentStudentPlans.find(p => p.division === activeDay && p.division_label);
    return existing ? existing.division_label : '';
  }

  function syncDivisionLabelBar() {
    if (!divisionLabelBar || !divisionLabelTitle || !divisionLabelInput) return;
    if (!planStudentSelect?.value) {
      divisionLabelBar.style.display = 'none';
      return;
    }
    divisionLabelBar.style.display = 'flex';
    const dayTitle = activeSplitType === 'Full body' ? 'Treino Único' : `Treino ${activeDay}`;
    divisionLabelTitle.textContent = `Grupamento do ${dayTitle}:`;
    divisionLabelInput.value = getActiveDivisionLabel();
  }

  function renderDayTabs() {
    if (!dayTabsContainer) return;
    const days = SPLIT_DAYS[activeSplitType] || ['A', 'B', 'C'];
    if (!days.includes(activeDay)) activeDay = days[0];

    dayTabsContainer.innerHTML = days.map(day => {
      const dayItems = currentStudentPlans.filter(p => p.division === day);
      const customLabel = dayItems.find(p => p.division_label)?.division_label;
      const baseName = activeSplitType === 'Full body' ? 'Treino Único' : `Treino ${day}`;
      const fullTitle = customLabel ? `${baseName} — ${customLabel}` : baseName;

      return `
        <button type="button" class="day-tab ${day === activeDay ? 'active' : ''}" data-day="${day}">
          ${escapeHtml(fullTitle)} (${dayItems.length})
        </button>
      `;
    }).join('');

    dayTabsContainer.querySelectorAll('.day-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeDay = btn.dataset.day;
        renderDayTabs();
        syncDivisionLabelBar();
        renderDayEditor();
      });
    });

    syncDivisionLabelBar();
  }

  function renderDayEditor() {
    if (!dayExercisesEditor) return;
    if (!planStudentSelect?.value) {
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
        <div class="plan-edit-row" data-item-id="${item.id}">
          <div class="ex-name-col">
            <span class="badge badge-dark" style="margin-bottom:4px;">Máq. #${escapeHtml(ex?.machine_number || '—')}</span>
            <strong>${escapeHtml(ex?.name || 'Exercício')}</strong>
            ${ex?.equipment_notes ? `<small style="display:block; color:var(--red-techgym); font-weight:600; font-size:0.72rem; margin-top:2px;">Usar: ${escapeHtml(ex.equipment_notes)}</small>` : ''}
          </div>
          <div>
            <span class="inline-field-label">Séries</span>
            <input type="number" min="1" max="20" value="${item.sets}" data-field="sets">
          </div>
          <div>
            <span class="inline-field-label">Reps</span>
            <input type="text" value="${escapeHtml(item.reps)}" data-field="reps">
          </div>
          <div>
            <span class="inline-field-label">Desc (s)</span>
            <input type="number" min="0" max="600" value="${item.rest_seconds || 60}" data-field="rest_seconds">
          </div>
          <div>
            <span class="inline-field-label left">Observação</span>
            <input type="text" class="notes-input" placeholder="Opcional..." value="${escapeHtml(item.notes || '')}" data-field="notes">
          </div>
          <button type="button" class="btn-danger btn-sm" data-delete-item="${item.id}" title="Remover">✕</button>
        </div>
      `;
    }).join('');
  }

  function renderCatalogList() {
    if (!catalogItemsList) return;
    const term = catalogSearchTerm.trim();
    if (!term) {
      catalogItemsList.innerHTML = '<div class="empty-state">Digite o nome ou nº do aparelho acima para buscar.</div>';
      return;
    }

    const lower = term.toLowerCase();
    const filtered = state.allExercises.filter(ex =>
      ex.name.toLowerCase().includes(lower) || String(ex.machine_number).toLowerCase().includes(lower)
    );

    if (!filtered.length) {
      catalogItemsList.innerHTML = `
        <div class="empty-state" style="padding: 20px 12px;">
          Nenhum aparelho encontrado para <strong>"${escapeHtml(term)}"</strong>.<br><br>
          <button type="button" class="btn-primary btn-sm" style="width:100%;" id="quick-create-ex-btn">
            + Cadastrar "${escapeHtml(term)}"
          </button>
        </div>`;
      document.getElementById('quick-create-ex-btn')?.addEventListener('click', () => {
        callbacks.onQuickCreateExercise(term);
      });
      return;
    }

    catalogItemsList.innerHTML = filtered.slice(0, 12).map(ex => `
      <div class="lib-item-card">
        <div class="lib-item-info">
          <strong>#${escapeHtml(ex.machine_number)} — ${escapeHtml(ex.name)}</strong>
          <span>${escapeHtml(ex.muscle_group)}${ex.equipment_notes ? ` • Req: ${escapeHtml(ex.equipment_notes)}` : ''}</span>
        </div>
        <button type="button" class="btn-primary btn-sm" data-quick-add="${ex.id}">+ Add</button>
      </div>
    `).join('');

    catalogItemsList.querySelectorAll('[data-quick-add]').forEach(btn => {
      btn.addEventListener('click', () => quickAddExercise(btn.dataset.quickAdd));
    });
  }

  function renderTemplatesList() {
    if (!templatesListEl) return;
    const term = templatesSearchTerm.trim().toLowerCase();
    const base = term
      ? allTemplates
      : (allTemplates.filter(t => t.split_type === activeSplitType).length
          ? allTemplates.filter(t => t.split_type === activeSplitType)
          : allTemplates);

    const filtered = base.filter(tpl =>
      !term ||
      (tpl.name || '').toLowerCase().includes(term) ||
      (tpl.split_type || '').toLowerCase().includes(term) ||
      (tpl.description || '').toLowerCase().includes(term)
    );

    if (!filtered.length) {
      templatesListEl.innerHTML = '<div class="empty-state">Nenhum modelo encontrado.</div>';
      return;
    }

    templatesListEl.innerHTML = filtered.map(tpl => `
      <div class="template-card">
        <div class="template-card-top">
          <strong>${escapeHtml(tpl.name)}</strong>
          <span class="badge badge-red">${escapeHtml(tpl.split_type)}</span>
        </div>
        <p>${escapeHtml(tpl.description || 'Modelo padrão da Techgym')}</p>
        <button type="button" class="btn-dark btn-sm" style="width:100%;" data-apply-tpl="${tpl.id}" data-split="${tpl.split_type}">
          Importar para o Aluno
        </button>
      </div>
    `).join('');

    templatesListEl.querySelectorAll('[data-apply-tpl]').forEach(btn => {
      btn.addEventListener('click', () => applyTemplateToStudent(btn.dataset.applyTpl, btn.dataset.split));
    });
  }

  async function loadStudentPlans(studentId) {
    if (dayExercisesEditor) {
      dayExercisesEditor.innerHTML = '<div class="empty-state">Carregando exercícios...</div>';
    }

    const { data, error } = await supabase
      .from('workout_plans')
      .select(`
        id, exercise_id, division, division_label, sets, reps, rest_seconds, notes,
        exercises ( name, machine_number, muscle_group, equipment_notes )
      `)
      .eq('student_id', studentId);

    if (error) {
      if (dayExercisesEditor) {
        dayExercisesEditor.innerHTML = `<div class="empty-state">Erro ao carregar: ${escapeHtml(error.message)}</div>`;
      }
      return;
    }

    currentStudentPlans = data || [];
    setUnsavedState(false);
    renderDayTabs();
    renderDayEditor();
  }

  async function quickAddExercise(exerciseId) {
    const studentId = planStudentSelect?.value;
    if (!studentId) {
      showToast('Selecione um aluno', 'Escolha o aluno no topo antes de adicionar exercícios.', 'error');
      return;
    }

    const currentLabel = divisionLabelInput?.value.trim() || getActiveDivisionLabel() || null;
    const { data: inserted, error } = await supabase
      .from('workout_plans')
      .insert([{
        student_id: studentId,
        exercise_id: exerciseId,
        division: activeDay,
        division_label: currentLabel,
        sets: 3,
        reps: '10-12',
        rest_seconds: 60,
        notes: null
      }])
      .select(`
        id, exercise_id, division, division_label, sets, reps, rest_seconds, notes,
        exercises ( name, machine_number, muscle_group, equipment_notes )
      `)
      .single();

    if (error) {
      showToast('Erro ao Adicionar', error.message, 'error');
      return;
    }

    if (inserted) {
      currentStudentPlans.push(inserted);
      renderDayTabs();
      renderDayEditor();
      await callbacks.onPlansMutated();
      showToast('Exercício Adicionado', `Incluído no Treino ${activeDay}.`, 'success');
    }
  }

  async function applyTemplateToStudent(templateId, splitType) {
    const studentId = planStudentSelect?.value;
    if (!studentId) {
      showToast('Selecione um aluno', 'Escolha o aluno antes de importar um modelo.', 'error');
      return;
    }

    if (currentStudentPlans.length > 0) {
      const ok = await showConfirmDialog(
        'Substituir Ficha Atual?',
        'Este aluno já possui exercícios cadastrados. Deseja substituir pela ficha deste modelo?'
      );
      if (!ok) return;
      await supabase.from('workout_plans').delete().eq('student_id', studentId);
    }

    const { data: items, error } = await supabase
      .from('workout_template_items')
      .select('*')
      .eq('template_id', templateId);

    if (error || !items?.length) {
      showToast('Erro no Modelo', 'Não foi possível carregar os itens deste modelo.', 'error');
      return;
    }

    const rows = items.map(it => ({
      student_id: studentId,
      exercise_id: it.exercise_id,
      division: it.division,
      sets: it.sets,
      reps: it.reps,
      rest_seconds: it.rest_seconds || 60,
      notes: it.notes || null
    }));

    const { error: insertError } = await supabase.from('workout_plans').insert(rows);
    if (insertError) {
      showToast('Erro ao Importar', insertError.message, 'error');
      return;
    }

    activeSplitType = splitType;
    if (planSplitSelect) planSplitSelect.value = splitType;
    activeDay = 'A';
    await loadStudentPlans(studentId);
    await callbacks.onPlansMutated();
    showToast('Modelo Aplicado!', `Ficha ${splitType} importada com sucesso.`, 'success');
  }

  // Delegação de eventos nos inputs e botão excluir da ficha (zero spam de toast)
  dayExercisesEditor?.addEventListener('input', (e) => {
    const row = e.target.closest('.plan-edit-row');
    const field = e.target.dataset.field;
    if (!row || !field) return;

    const target = currentStudentPlans.find(p => String(p.id) === String(row.dataset.itemId));
    if (!target) return;

    if (field === 'sets') target.sets = Math.max(1, parseInt(e.target.value, 10) || 1);
    else if (field === 'rest_seconds') target.rest_seconds = Math.max(0, parseInt(e.target.value, 10) || 0);
    else if (field === 'reps') target.reps = e.target.value.trim() || '12';
    else if (field === 'notes') target.notes = e.target.value.trim() || null;

    setUnsavedState(true);
  });

  dayExercisesEditor?.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-delete-item]');
    if (!delBtn) return;

    const itemId = delBtn.dataset.deleteItem;
    const { error } = await supabase.from('workout_plans').delete().eq('id', itemId);
    if (error) {
      showToast('Erro ao Remover', error.message, 'error');
      return;
    }
    currentStudentPlans = currentStudentPlans.filter(p => String(p.id) !== String(itemId));
    renderDayTabs();
    renderDayEditor();
    await callbacks.onPlansMutated();
  });

  // Botão único de salvar alterações em lote
  saveWorkoutBatchBtn?.addEventListener('click', async () => {
    const studentId = planStudentSelect?.value;
    if (!studentId || !currentStudentPlans.length) {
      showToast('Nada para salvar', 'Selecione um aluno com exercícios cadastrados.', 'error');
      return;
    }

    saveWorkoutBatchBtn.disabled = true;
    saveWorkoutBatchBtn.textContent = 'Salvando...';

    const updates = currentStudentPlans.map(item =>
      supabase
        .from('workout_plans')
        .update({
          sets: item.sets,
          reps: item.reps,
          rest_seconds: item.rest_seconds,
          notes: item.notes,
          division_label: item.division_label || null
        })
        .eq('id', item.id)
    );

    const results = await Promise.all(updates);
    const firstErr = results.find(r => r.error)?.error;

    if (firstErr) {
      saveWorkoutBatchBtn.disabled = false;
      saveWorkoutBatchBtn.textContent = 'Salvar Ficha *';
      showToast('Erro ao Salvar', firstErr.message, 'error');
      return;
    }

    setUnsavedState(false);
    showToast('Ficha Salva!', 'Todas as alterações foram gravadas no banco.', 'success');
  });

  divisionLabelInput?.addEventListener('input', () => {
    const newLabel = divisionLabelInput.value.trim() || null;
    currentStudentPlans
      .filter(p => p.division === activeDay)
      .forEach(item => { item.division_label = newLabel; });
    renderDayTabs();
    setUnsavedState(true);
  });

  catalogSearchInput?.addEventListener('input', (e) => {
    catalogSearchTerm = e.target.value;
    renderCatalogList();
  });

  templatesSearchInput?.addEventListener('input', (e) => {
    templatesSearchTerm = e.target.value;
    renderTemplatesList();
  });

  planSplitSelect?.addEventListener('change', () => {
    activeSplitType = planSplitSelect.value;
    activeDay = 'A';
    renderDayTabs();
    renderDayEditor();
    renderTemplatesList();
  });

  planStudentSelect?.addEventListener('change', async () => {
    const newId = planStudentSelect.value;
    if (state.hasUnsavedPlanChanges) {
      const discard = await showConfirmDialog(
        'Alterações Não Salvas',
        'Você modificou a ficha deste aluno e ainda não salvou. Deseja trocar de aluno e descartar?'
      );
      if (!discard) {
        planStudentSelect.value = lastSelectedStudentId;
        return;
      }
    }

    lastSelectedStudentId = newId;
    setUnsavedState(false);

    if (!newId) {
      currentStudentPlans = [];
      renderDayTabs();
      renderDayEditor();
      return;
    }
    await loadStudentPlans(newId);
  });

  saveTemplateBtn?.addEventListener('click', async () => {
    const studentId = planStudentSelect?.value;
    if (!studentId || !currentStudentPlans.length) {
      showToast('Ficha Vazia', 'Selecione um aluno com exercícios para salvar como modelo.', 'error');
      return;
    }
    if (state.hasUnsavedPlanChanges) {
      showToast('Salve a ficha primeiro', 'Clique em "Salvar Ficha *" antes de exportar como modelo.', 'error');
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

    await supabase.from('workout_template_items').insert(
      currentStudentPlans.map(p => ({
        template_id: newTpl.id,
        exercise_id: p.exercise_id,
        division: p.division,
        sets: p.sets,
        reps: p.reps,
        rest_seconds: p.rest_seconds || 60,
        notes: p.notes || null
      }))
    );

    showToast('Modelo Salvo!', 'Novo modelo adicionado à biblioteca.', 'success');
    await loadTemplates();
  });

  async function loadTemplates() {
    const { data, error } = await supabase
      .from('workout_templates')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error) {
      allTemplates = data || [];
      renderTemplatesList();
    }
  }

  renderDayTabs();

  return {
    loadTemplates,
    renderCatalogList,
    openForStudent: async (studentId) => {
      if (planStudentSelect) {
        planStudentSelect.value = studentId;
        lastSelectedStudentId = studentId;
      }
      await loadStudentPlans(studentId);
    },
    discardUnsavedChanges: async () => {
      setUnsavedState(false);
      if (planStudentSelect?.value) {
        await loadStudentPlans(planStudentSelect.value);
      }
    },
    clearIfDeletedStudent: (studentId) => {
      if (planStudentSelect?.value === studentId) {
        planStudentSelect.value = '';
        lastSelectedStudentId = '';
        currentStudentPlans = [];
        setUnsavedState(false);
        renderDayTabs();
        renderDayEditor();
      }
    }
  };
}