import { supabase } from '../config.js';
import { escapeHtml, showToast, showConfirmDialog, recordAuditLog } from './ui.js';

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
  let originalStudentPlans = [];
  let deletedPlanIds = [];
  let allTemplates = [];
  let activeSplitType = 'ABC';
  let activeDay = 'A';
  let lastSelectedStudentId = '';
  let catalogSearchTerm = '';
  let templatesSearchTerm = '';

  function getSelectedStudentName() {
    const opt = planStudentSelect?.selectedOptions?.[0];
    return opt && opt.value ? opt.textContent.trim() : 'Aluno';
  }

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
      btn.addEventListener('click', () => stageAddExercise(btn.dataset.quickAdd));
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
      btn.addEventListener('click', () => stageTemplateToStudent(btn.dataset.applyTpl, btn.dataset.split));
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

    currentStudentPlans = (data || []).map(item => ({ ...item, isNew: false }));
    originalStudentPlans = JSON.parse(JSON.stringify(currentStudentPlans));
    deletedPlanIds = [];
    setUnsavedState(false);
    renderDayTabs();
    renderDayEditor();
  }

  // Adiciona o exercício APENAS em memória (só vai para o banco ao clicar em Salvar Ficha)
  function stageAddExercise(exerciseId) {
    const studentId = planStudentSelect?.value;
    if (!studentId) {
      showToast('Selecione um aluno', 'Escolha o aluno no topo antes de adicionar exercícios.', 'error');
      return;
    }

    const ex = state.allExercises.find(item => String(item.id) === String(exerciseId));
    if (!ex) return;

    const currentLabel = divisionLabelInput?.value.trim() || getActiveDivisionLabel() || null;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    currentStudentPlans.push({
      id: tempId,
      isNew: true,
      student_id: studentId,
      exercise_id: ex.id,
      division: activeDay,
      division_label: currentLabel,
      sets: 3,
      reps: '10-12',
      rest_seconds: 60,
      notes: null,
      exercises: {
        name: ex.name,
        machine_number: ex.machine_number,
        muscle_group: ex.muscle_group,
        equipment_notes: ex.equipment_notes || null
      }
    });

    setUnsavedState(true);
    renderDayTabs();
    renderDayEditor();
  }

  // Importa modelo APENAS em memória até clicar em Salvar Ficha
  async function stageTemplateToStudent(templateId, splitType) {
    const studentId = planStudentSelect?.value;
    if (!studentId) {
      showToast('Selecione um aluno', 'Escolha o aluno antes de importar um modelo.', 'error');
      return;
    }

    if (currentStudentPlans.length > 0) {
      const ok = await showConfirmDialog(
        'Substituir Ficha Atual?',
        'Este aluno já possui exercícios. Deseja substituir em memória pelo modelo (será gravado ao clicar em Salvar Ficha)?'
      );
      if (!ok) return;
      currentStudentPlans.forEach(p => {
        if (!p.isNew) deletedPlanIds.push(p.id);
      });
    }

    const { data: items, error } = await supabase
      .from('workout_template_items')
      .select('*')
      .eq('template_id', templateId);

    if (error || !items?.length) {
      showToast('Erro no Modelo', 'Não foi possível carregar os itens deste modelo.', 'error');
      return;
    }

    currentStudentPlans = items.map((it, idx) => {
      const ex = state.allExercises.find(e => String(e.id) === String(it.exercise_id));
      return {
        id: `temp_tpl_${Date.now()}_${idx}`,
        isNew: true,
        student_id: studentId,
        exercise_id: it.exercise_id,
        division: it.division,
        division_label: null,
        sets: it.sets,
        reps: it.reps,
        rest_seconds: it.rest_seconds || 60,
        notes: it.notes || null,
        exercises: ex ? {
          name: ex.name,
          machine_number: ex.machine_number,
          muscle_group: ex.muscle_group,
          equipment_notes: ex.equipment_notes || null
        } : { name: 'Exercício', machine_number: '—' }
      };
    });

    activeSplitType = splitType;
    if (planSplitSelect) planSplitSelect.value = splitType;
    activeDay = 'A';
    setUnsavedState(true);
    renderDayTabs();
    renderDayEditor();
  }

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

  // Remove item APENAS em memória (só deleta do banco ao clicar em Salvar Ficha)
  dayExercisesEditor?.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-delete-item]');
    if (!delBtn) return;

    const itemId = String(delBtn.dataset.deleteItem);
    const target = currentStudentPlans.find(p => String(p.id) === itemId);
    if (!target) return;

    if (!target.isNew) {
      deletedPlanIds.push(target.id);
    }

    currentStudentPlans = currentStudentPlans.filter(p => String(p.id) !== itemId);
    setUnsavedState(true);
    renderDayTabs();
    renderDayEditor();
  });

  // Salva todas as inserções, atualizações e exclusões no Supabase de uma única vez
  saveWorkoutBatchBtn?.addEventListener('click', async () => {
    const studentId = planStudentSelect?.value;
    if (!studentId) {
      showToast('Selecione um aluno', 'Escolha o aluno antes de salvar a ficha.', 'error');
      return;
    }

    saveWorkoutBatchBtn.disabled = true;
    saveWorkoutBatchBtn.textContent = 'Salvando...';

    const studentName = getSelectedStudentName();
    const logsToRecord = [];

    try {
      // 1. Registra no log itens removidos e executa DELETE em lote
      if (deletedPlanIds.length > 0) {
        deletedPlanIds.forEach(delId => {
          const oldItem = originalStudentPlans.find(o => String(o.id) === String(delId));
          const ex = Array.isArray(oldItem?.exercises) ? oldItem.exercises[0] : oldItem?.exercises;
          if (oldItem) {
            logsToRecord.push({
              where: `Ficha: ${studentName} (Treino ${oldItem.division})`,
              what: `Exercício removido: ${ex?.name || 'Aparelho'}`,
              before: `${oldItem.sets}x${oldItem.reps}`,
              after: 'Removido'
            });
          }
        });

        const { error: delErr } = await supabase
          .from('workout_plans')
          .delete()
          .in('id', deletedPlanIds);
        if (delErr) throw delErr;
      }

      // 2. Insere novos exercícios adicionados na sessão
      const newItems = currentStudentPlans.filter(p => p.isNew);
      if (newItems.length > 0) {
        const insertPayload = newItems.map(item => ({
          student_id: studentId,
          exercise_id: item.exercise_id,
          division: item.division,
          division_label: item.division_label || null,
          sets: item.sets,
          reps: item.reps,
          rest_seconds: item.rest_seconds,
          notes: item.notes
        }));

        const { error: insErr } = await supabase
          .from('workout_plans')
          .insert(insertPayload);
        if (insErr) throw insErr;

        newItems.forEach(item => {
          const ex = Array.isArray(item.exercises) ? item.exercises[0] : item.exercises;
          logsToRecord.push({
            where: `Ficha: ${studentName} (Treino ${item.division})`,
            what: `Novo exercício: ${ex?.name || 'Aparelho'}`,
            before: 'Não constava',
            after: `${item.sets}x${item.reps} (${item.rest_seconds}s)`
          });
        });
      }

      // 3. Atualiza exercícios já existentes que sofreram alteração
      const existingItems = currentStudentPlans.filter(p => !p.isNew);
      const updatePromises = [];

      existingItems.forEach(item => {
        const orig = originalStudentPlans.find(o => String(o.id) === String(item.id));
        const ex = Array.isArray(item.exercises) ? item.exercises[0] : item.exercises;

        if (orig) {
          const changedFields = [];
          if (orig.sets !== item.sets) changedFields.push(`Séries: ${orig.sets} → ${item.sets}`);
          if (orig.reps !== item.reps) changedFields.push(`Reps: ${orig.reps} → ${item.reps}`);
          if (orig.rest_seconds !== item.rest_seconds) changedFields.push(`Descanso: ${orig.rest_seconds}s → ${item.rest_seconds}s`);
          if ((orig.notes || '') !== (item.notes || '')) changedFields.push(`Obs: "${orig.notes || '—'}" → "${item.notes || '—'}"`);
          if ((orig.division_label || '') !== (item.division_label || '')) changedFields.push(`Grupamento: "${orig.division_label || '—'}" → "${item.division_label || '—'}"`);

          if (changedFields.length > 0) {
            logsToRecord.push({
              where: `Ficha: ${studentName} (Treino ${item.division})`,
              what: `Editado: ${ex?.name || 'Exercício'}`,
              before: `${orig.sets}x${orig.reps} (${orig.rest_seconds}s)`,
              after: `${item.sets}x${item.reps} (${item.rest_seconds}s)`
            });
          }
        }

        updatePromises.push(
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
      });

      if (updatePromises.length > 0) {
        const results = await Promise.all(updatePromises);
        const updErr = results.find(r => r.error)?.error;
        if (updErr) throw updErr;
      }

      logsToRecord.forEach(entry => recordAuditLog(entry));
      await loadStudentPlans(studentId);
      await callbacks.onPlansMutated();
      showToast('Ficha Salva!', 'Todas as alterações foram gravadas no banco.', 'success');
    } catch (err) {
      saveWorkoutBatchBtn.disabled = false;
      saveWorkoutBatchBtn.textContent = 'Salvar Ficha *';
      showToast('Erro ao Salvar', err?.message || 'Falha ao gravar alterações.', 'error');
    }
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
      originalStudentPlans = [];
      deletedPlanIds = [];
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

    recordAuditLog({
      where: 'Biblioteca de Modelos',
      what: `Novo modelo padrão criado (${activeSplitType})`,
      before: 'Não existia',
      after: templateName.trim()
    });

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
        originalStudentPlans = [];
        deletedPlanIds = [];
        setUnsavedState(false);
        renderDayTabs();
        renderDayEditor();
      }
    }
  };
}